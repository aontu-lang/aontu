/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"unicode"
	"unicode/utf8"

	expr "github.com/tabnas/expr/go"
	jsonic "github.com/tabnas/jsonic/go"
	multisource "github.com/tabnas/multisource/go"
	path "github.com/tabnas/path/go"
)

const reservedKeyPrefix = "\x00aontu_"
const orderKey = reservedKeyPrefix + "order"
const spreadKey = reservedKeyPrefix + "spread"
const optionalKey = reservedKeyPrefix + "optional"

// aliasKeysKey is the sentinel holding this map's ALIAS DECLARATIONS
// -- `%name = value` pairs, which bind a file-local name and are not fields
// of the document. Twin of aontu_alias_keys in ts/src/lang.ts.
const aliasKeysKey = reservedKeyPrefix + "aliaskeys"

const keyRefusalsKey = reservedKeyPrefix + "keyrefusals"

// The declarations before scoping, the names published and the heads.
const aliasDeclsKey = reservedKeyPrefix + "aliasdecls"
const exportDeclsKey = reservedKeyPrefix + "exportdecls"
const exportKeysKey = reservedKeyPrefix + "exportkeys"
const importDeclsKey = reservedKeyPrefix + "importdecls"
const importMergeKey = reservedKeyPrefix + "importmerge"

// The name bound here, and the one the other file publishes.
type aliasBind struct {
	local  string
	remote string
}

// The name the source spells and the key it is held under.
type aliasDecl struct {
	name string
	key  string
}

// One `export(...)`, and whether its argument named a set.
type exportDecl struct {
	names []string
	ok    bool
	url   string
	hold  string
	sp    int
	src   string
}

// One destructure head: the key the values arrived under, the names it
// asks for (empty for the wildcard), the file and the refusal site.
type importDecl struct {
	key   string
	binds []aliasBind
	url   string
	sp    int
	src   string
}

func exportNamesOf(t *jsonic.Token) ([]string, bool, bool) {
	if nil == t || nil == t.Use {
		return nil, false, false
	}
	if true != t.Use["aontu_export"] {
		return nil, false, false
	}
	names, _ := t.Use["aontu_export_names"].([]string)
	nok, _ := t.Use["aontu_export_ok"].(bool)
	return names, nok, true
}

func importBindsOf(t *jsonic.Token) ([]aliasBind, bool) {
	if nil == t || nil == t.Use {
		return nil, false
	}
	binds, ok := t.Use["aontu_import"].([]aliasBind)
	return binds, ok
}

// dataValKey carries a data include whose value is NOT a map, which
// the root merge cannot fold into the map that holds it.
const dataValKey = reservedKeyPrefix + "dataval"

// keyRefusal is one such refusal: the key, the code, where to site it
// (the name, or the offending character of the key), the source text
// of the site, and the hint's details.
type keyRefusal struct {
	key     string
	why     string
	sp      int
	src     string
	url     string
	details map[string]string
}

var aliasEqAt sync.Map

const posKey = reservedKeyPrefix + "pos"

// srcKey rides beside posKey: the map rule's open-token SOURCE TEXT,
// lifted onto the MapVal by asValDepth. The position alone locates the
// `{`; the text is what gives it an extent (base.srclen, ts/src/site.ts).
const srcKey = reservedKeyPrefix + "src"

const elidedSpreadKey = reservedKeyPrefix + "elidedspread"

var (
	theLangOnce sync.Once
	theLangVal  *jsonic.Jsonic
)

func theLang() *jsonic.Jsonic {
	theLangOnce.Do(func() {
		theLangVal = mustMakeLang("", fileResolver)
	})
	return theLangVal
}

var (
	langCacheMu sync.Mutex
	langCache   = map[string]*jsonic.Jsonic{}
)

// maxLangCache bounds the number of cached per-base parsers (see
// langForBase) so a long-running process cannot grow the cache without
// limit.
const maxLangCache = 256

// langForBase returns a parser whose relative @"file" loads resolve
// against base. Base "" reuses the shared default parser.
func langForBase(base string) (*jsonic.Jsonic, error) {
	if base == "" {
		return theLang(), nil
	}
	langCacheMu.Lock()
	defer langCacheMu.Unlock()
	if j, ok := langCache[base]; ok {
		return j, nil
	}
	j, err := makeLang(base, fileResolver)
	if err != nil { //coverage:ignore makeLang cannot fail — see mustMakeLang
		return nil, err
	}
	if len(langCache) < maxLangCache {
		langCache[base] = j
	}
	return j, nil
}

func boolPtr(b bool) *bool { return &b }

func mustMakeLang(base string, resolver multisource.Resolver) *jsonic.Jsonic {
	j, err := makeLang(base, resolver)
	if err != nil { //coverage:ignore plugin registration cannot fail
		panic("aontu: jsonic grammar setup failed: " + err.Error())
	}
	return j
}

func inElem(r *jsonic.Rule) bool {
	return r != nil && r.Parent != nil && "elem" == r.Parent.Name
}

func makeLang(base string, resolver multisource.Resolver) (*jsonic.Jsonic, error) {
	j := jsonic.Make(jsonic.Options{
		ErrMsg: &jsonic.ErrMsgOptions{
			Name:   "aontu",
			Suffix: false,
		},
		Hint: map[string]string{
			"unknown": `
Since the error is unknown, this is probably a bug. Please consider
posting a github issue - thanks!

Code: {code}, Details:
{details}`,

			"unexpected": `
The character(s) {src} were not expected at this point as they do not
match the expected syntax. Use the # character to comment out lines to
help isolate the syntax error.`,
		},
		Comment: &jsonic.CommentOptions{
			Lex: boolPtr(true),
			Def: map[string]*jsonic.CommentDef{
				"hash":  {Line: true, Start: "#"},
				"slash": nil,
				"multi": nil,
			},
		},
		List: &jsonic.ListOptions{Pair: boolPtr(true)},
		// See tsTextCheck: the text stage of the bare-text rule (a run
		// is letters, digits, `-` and `_`, or it is refused), and the
		// alias name and its `=`, as in the TS lexer's text check hook.
		Text:  &jsonic.TextOptions{Check: tsTextCheck},
		Fixed: &jsonic.FixedOptions{Check: tsFixedCheck},
		Number: &jsonic.NumberOptions{
			Sep:     "_",
			Exclude: numberExcluded,
			Check:   tsNumCheck,
		},
		Value: &jsonic.ValueOptions{
			Lex: boolPtr(true),
			Def: map[string]*jsonic.ValueDef{
				"string":     kindDef(KindString),
				"number":     kindDef(KindNumber),
				"integer":    kindDef(KindInteger),
				"float":      kindDef(KindFloat),
				"biginteger": kindDef(KindBigInteger),
				"bigdecimal": kindDef(KindBigDecimal),
				"boolean":    kindDef(KindBoolean),
				"alias": {
					Match:   aliasRe,
					Consume: true,
					ValFunc: func(m []string) any {
						name := m[0]
						return jsonic.TokenValFunc(func(r *jsonic.Rule, ctx *jsonic.Context) any {
							rv := newRef([]any{aliasScopedKey(name, srcURL(ctx))}, false)
							rv.absolute = true
							if r.ON > 0 {
								rv.sp = r.O0.SI
							}
							stampSrc(rv, r)
							return rv
						})
					},
				},
				"exact": {
					Match:   exactLiteralRe,
					Consume: true,
					ValFunc: func(m []string) any {
						mk := exactLiteral(m)
						return jsonic.TokenValFunc(func(r *jsonic.Rule, _ *jsonic.Context) any {
							sp := -1
							if r.ON > 0 {
								sp = r.O0.SI
							}
							return mk(sp)
						})
					},
				},
				"top":   valDef(func(sp int) Val { t := top(); t.sp = sp; return t }),
				"_":     valDef(func(sp int) Val { p := newPlace(); p.sp = sp; return p }),
				"nil":   valDef(func(sp int) Val { n := newNil("literal_nil"); n.sp = sp; return n }),
				"true":  valDef(func(sp int) Val { v := newBoolean(true); v.sp = sp; return v }),
				"false": valDef(func(sp int) Val { v := newBoolean(false); v.sp = sp; return v }),
				"null":  valDef(func(sp int) Val { v := newNull(); v.sp = sp; return v }),
			},
		},
		Map: &jsonic.MapOptions{
			// aontu builds its own Val AST and tracks map key order itself
			// (trackOrder), so it wants plain map[string]any object nodes, not
			// the parser's insertion-ordered OrderedMap default.
			Plain: boolPtr(true),
			// Duplicate keys combine into a conjunct (mirrors the jsonic
			// merge in ts/src/lang.ts), e.g. `a:1 a:2` -> `a:1&2`.
			Merge: func(prev, val any, r *jsonic.Rule, ctx *jsonic.Context) any {
				if prev == nil {
					return val
				}
				// Both sides are the engine's own list; no source key reaches one.
				if pl, ok := prev.([]string); ok {
					vl, _ := val.([]string)
					return appendNew(pl, vl...)
				}
				return mergeVals(asVal(prev), asVal(val))
			},
		},
	})

	if err := j.Use(expr.Expr, map[string]interface{}{
		"op": map[string]interface{}{
			"conjunct":      map[string]interface{}{"infix": true, "src": "&", "left": 16000000, "right": 17000000},
			"disjunct":      map[string]interface{}{"infix": true, "src": "|", "left": 14000000, "right": 15000000},
			"star":          map[string]interface{}{"prefix": true, "src": "*", "right": 24000000},
			"dollar-prefix": map[string]interface{}{"prefix": true, "src": "$", "right": 31000000},
			"dot-infix":     map[string]interface{}{"infix": true, "src": ".", "left": 25000000, "right": 24000000},
			"dot-prefix":    map[string]interface{}{"prefix": true, "src": ".", "right": 24000000},
			// Override the default `+` (addition) precedence to match the
			// aontu plus operator (binds tighter than & and |).
			"addition":       map[string]interface{}{"infix": true, "src": "+", "left": 20000000, "right": 21000000},
			"negative":       map[string]interface{}{"prefix": true, "src": "-", "right": 22000000},
			"positive":       map[string]interface{}{"prefix": true, "src": "+", "right": 22000000},
			"plain":          nil,
			"subtraction":    nil,
			"multiplication": nil,
			"division":       nil,
			"remainder":      nil,
			"func": map[string]interface{}{
				"paren": true, "osrc": "(", "csrc": ")",
				"preval": map[string]interface{}{"active": true},
			},
		},
		"evaluate": evaluate,
	}); err != nil { //coverage:ignore plugin registration cannot fail
		return nil, err
	}

	if err := j.Use(path.Path, nil); err != nil { //coverage:ignore plugin registration cannot fail
		return nil, err
	}

	j.Rule("expr", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependAC(func(r *jsonic.Rule, ctx *jsonic.Context) {
			if r.N["expr"] < 1 {
				parent := r.Parent
				if parent != nil && parent != jsonic.NoRule {
					parent.Node = snipExprCycles(parent.Node)
				}
			}
		})
	})

	// The `&` operator token (for &: spread) and the `?` token (for
	// optional keys, a?:1).
	cj := j.Token("#E&")
	cl := jsonic.TinCL

	j.Rule("expr", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependClose(
			&jsonic.AltSpec{
				S: [][]jsonic.Tin{{cj}, {cl}}, B: 2,
				N: map[string]int{"expr": 0},
				G: "expr,expr-end,spread",
			},
		)
	})
	qm := j.Token("#QM", "?")
	optkey := []jsonic.Tin{jsonic.TinTX, jsonic.TinST, jsonic.TinNR}

	freshMapNode := func(r *jsonic.Rule, _ *jsonic.Context) { r.Node = map[string]any{} }

	j.Rule("val", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependOpen(
			// Before the core implicit-map alts: a value prefix, not a key.
			&jsonic.AltSpec{
				S: [][]jsonic.Tin{{jsonic.TinVL}, {cl}},
				C: func(r *jsonic.Rule, _ *jsonic.Context) bool {
					return 0 != r.D && 1 < r.ON &&
						isAliasDecl(r.O0, r.O1, keyOf(r.O0))
				},
				P: "val",
				A: func(r *jsonic.Rule, _ *jsonic.Context) {
					if nil == r.U {
						r.U = map[string]any{}
					}
					r.U["aontu_alias_val"] = keyOf(r.O0)
				},
				G: "alias-val",
			},
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, P: "map", B: 2, G: "spread"},
			&jsonic.AltSpec{
				S: [][]jsonic.Tin{optkey, {qm}},
				C: func(r *jsonic.Rule, _ *jsonic.Context) bool {
					return r.D == 0 && !inElem(r)
				},
				P: "map", B: 2, A: freshMapNode, G: "optional",
			},
			&jsonic.AltSpec{
				S: [][]jsonic.Tin{optkey, {qm}},
				C: func(r *jsonic.Rule, _ *jsonic.Context) bool {
					return !inElem(r)
				},
				P: "map", B: 2, N: map[string]int{"pk": 1}, A: freshMapNode,
				G: "optional,dive",
			},
		)
		// On close, a following `&:` belongs to the enclosing map as a
		// spread, not a conjunct — backtrack so the map can take it.
		rs.PrependClose(
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, B: 2, G: "spread"},
		)
		rs.AddAC(wrapLeaf)
		rs.AddAC(recordAliasHoist)
	})

	j.Rule("map", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependOpen(
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, P: "pair", B: 2, N: map[string]int{"pk": 1}, G: "spread"},
			&jsonic.AltSpec{S: [][]jsonic.Tin{optkey, {qm}}, P: "pair", B: 2, G: "optional"},
		)
		rs.PrependClose(
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, B: 2, G: "spread"},
		)
		rs.AddAC(closeMap)
	})

	// pair: `&:value` is a spread (stored on the enclosing map);
	// otherwise record key order.
	j.Rule("pair", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependOpen(
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, P: "val", U: map[string]any{"spread": true}, G: "spread"},
			// `key ? : value` — optional key.
			&jsonic.AltSpec{S: [][]jsonic.Tin{optkey, {qm}, {cl}}, P: "val", U: map[string]any{"optional": true}, G: "optional"},
		)
		rs.PrependClose(
			&jsonic.AltSpec{
				S: [][]jsonic.Tin{{cj}, {cl}},
				C: func(r *jsonic.Rule, _ *jsonic.Context) bool {
					return r.N["pk"] <= 0 || r.N["dmap"] <= 1
				},
				R: "pair", B: 2, G: "spread",
			},
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, B: 2, G: "spread"},
		)
		rs.AddAO(reserveKeyNamespace)
		rs.AddAC(trackOrder)
	})

	// elem: a `&:value` list element is a spread; jsonic appends it as a
	// normal element, so replace it with a marker that asVal extracts.
	j.Rule("elem", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependOpen(
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, P: "val", U: map[string]any{"spread": true}, G: "spread"},

			&jsonic.AltSpec{
				S: [][]jsonic.Tin{optkey, {qm}}, B: 1, R: "elem",
				U: map[string]any{"aontu_optional": true},
				G: "aontu-optional-key-elem",
			},
			&jsonic.AltSpec{
				S: [][]jsonic.Tin{{qm}, {cl}},
				C: func(r *jsonic.Rule, _ *jsonic.Context) bool {
					return r.Prev != nil && r.Prev.U != nil &&
						r.Prev.U["aontu_optional"] == true
				},
				P: "val",
				U: map[string]any{"aontu_optional_elem": true},
				G: "aontu-optional-elem",
			},
		)
		rs.AddAC(elemSpread)
	})

	j.Rule("list", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.AddAC(wrapList)
	})

	// MultiSource reads the base only at RESOLVE time, not registration.
	if err := j.Use(multisource.MultiSource, msOptions(base, resolver)); err != nil { //coverage:ignore plugin registration cannot fail
		return nil, err
	}

	return j, nil
}

// listSpread marks the &: spread value within a parsed list slice.
type listSpread struct{ val Val }

func elemKeyRules(m map[string]any, ktkn, sep *jsonic.Token, key string) {
	if kr, ok := keyRefusalOf(ktkn, sep, key); ok {
		m[keyRefusalsKey] = []keyRefusal{kr}
	}
}

func elemSpread(r *jsonic.Rule, ctx *jsonic.Context) {
	if r.U["aontu_optional_elem"] == true {
		if list, ok := r.Node.([]any); ok && 0 < len(list) && r.Prev != nil {
			key := keyOf(r.Prev.O0)
			m := map[string]any{
				key:         list[len(list)-1],
				orderKey:    []string{key},
				optionalKey: []string{key},
			}
			if r.Prev.ON > 0 {
				m[posKey] = r.Prev.O0.SI
				m[srcKey] = r.Prev.O0.Src
			}
			elemKeyRules(m, r.Prev.O0, r.O1, key)
			list[len(list)-1] = m
		}
		return
	}

	if r.U["pair"] == true {
		if list, ok := r.Node.([]any); ok && 0 < len(list) {
			if m, ok := list[len(list)-1].(map[string]any); ok {
				key, _ := r.U["key"].(string)
				// An element is a value position, so the prefix form applies.
				if _, refused := keyRefusalOf(r.O0, r.O1, key); !refused &&
					isAliasDecl(r.O0, r.O1, key) {
					list[len(list)-1] = m[key]
					addAliasHoist(ctx, aliasScopedKey(key, srcURL(ctx)), m[key])
					return
				}
				m[orderKey] = []string{key}
				if r.ON > 0 {
					m[posKey] = r.O0.SI
					m[srcKey] = r.O0.Src
				}
				elemKeyRules(m, r.O0, r.O1, key)
			}
		}
		return
	}

	if r.U["spread"] != true {
		return
	}
	list, ok := r.Node.([]any)
	if !ok || len(list) == 0 {
		return
	}
	sv := asVal(r.Child.Node)
	if ls, ok := list[len(list)-1].(*listSpread); ok {
		ls.val = mergeVals(ls.val, sv)
		return
	}
	list[len(list)-1] = &listSpread{val: sv}
}

// A NAME BELONGS TO THE FILE THAT DECLARED IT. Renamed here and not at
// the key, so an elided value is still reported by the name the source
// spells; the order entry moves with it, as key order is resolution.
func scopeAliasKeys(m map[string]any) {
	decls, _ := m[aliasDeclsKey].([]aliasDecl)
	ord, _ := m[orderKey].([]string)
	ak, _ := m[aliasKeysKey].([]string)
	for _, d := range decls {
		if v, seen := m[d.name]; seen {
			delete(m, d.name)
			m[d.key] = v
			for i, k := range ord {
				if k == d.name {
					ord[i] = d.key
				}
			}
		}
		ak = appendNew(ak, d.key)
	}
	if 0 < len(decls) {
		m[orderKey] = ord
		m[aliasKeysKey] = ak
	}

	// A COLON DECLARATION IS REFUSED AND STILL NAMES SOMETHING, so the
	// refusal is held under the key that name would have had and a use
	// of it reports why; not an alias key, so it generates.
	krs, _ := m[keyRefusalsKey].([]keyRefusal)
	for i, kr := range krs {
		if "alias_colon" == kr.why {
			scoped := aliasScopedKey(kr.key, kr.url)
			renameNodeKey(m, kr.key, scoped)
			krs[i].key = scoped
		}
	}
}

func deleteNodeKey(m map[string]any, key string) {
	delete(m, key)
	ord, _ := m[orderKey].([]string)
	m[orderKey] = slices.DeleteFunc(ord, func(k string) bool { return k == key })
}

// The key, its value and its place in the order, moved together.
func renameNodeKey(m map[string]any, from, to string) {
	if v, seen := m[from]; seen {
		delete(m, from)
		m[to] = v
	}
	ord, _ := m[orderKey].([]string)
	for i, k := range ord {
		if k == from {
			ord[i] = to
		}
	}
}

// `export` PUBLISHES NAMES AND NOTHING ELSE; the argument is erased,
// and a bare name, key or wildcard is refused.
func recordExports(m map[string]any) {
	exs, _ := m[exportDeclsKey].([]exportDecl)
	ek, _ := m[exportKeysKey].([]string)
	krs, _ := m[keyRefusalsKey].([]keyRefusal)
	for _, e := range exs {
		if !e.ok {
			renameNodeKey(m, e.hold, exportDeclName)
			krs = append(krs, keyRefusal{
				key: exportDeclName, why: "export_arg", sp: e.sp, src: e.src})
		} else {
			deleteNodeKey(m, e.hold)
			for _, n := range e.names {
				ek = append(ek, aliasScopedKey(n, e.url))
			}
		}
	}
	if 0 < len(exs) {
		m[exportKeysKey] = ek
		m[keyRefusalsKey] = krs
	}
}

// THE DESTRUCTURE IS ADDITIVE: the values land as a plain include
// places them, each name binds in THIS file's scope, and a file
// publishes only what IT declares. An alias key is erased, so a
// refusal stands in the document too: an unused name is still a
// mistake.
func bindImports(m map[string]any, ctx *jsonic.Context) {
	ims, _ := m[importDeclsKey].([]importDecl)
	merge, _ := m[importMergeKey].([]Val)
	for _, im := range ims {
		iv := asVal(m[im.key])
		deleteNodeKey(m, im.key)
		published, declared := liftImported(ctx, iv)
		merge = append(merge, iv)
		merge = append(merge, bindImportNames(ctx, im, published, declared)...)
	}
	if 0 < len(ims) {
		m[importMergeKey] = merge
	}
}

// A ROOT MAY BE WRAPPED: a file's names are its MAP'S, not open()'s.
func declaringMap(v Val) Val {
	for {
		fv, ok := v.(*FuncVal)
		if !ok || 1 != len(fv.peg) {
			return v
		}
		v = fv.peg[0]
	}
}

// A DECLARATION IS THE DOCUMENT'S wherever the values land, so the
// names go to the root and the subtree may sit under a key.
func liftImported(ctx *jsonic.Context, iv Val) (published, declared []string) {
	mv, ok := declaringMap(iv).(*MapVal)
	if !ok {
		return nil, nil
	}
	published, declared = mv.exportKeys, mv.aliasKeys
	for _, k := range declared {
		addAliasHoist(ctx, k, mv.peg[k])
		mv.remove(k)
	}
	mv.aliasKeys, mv.exportKeys = nil, nil
	return published, declared
}

func bindImportNames(
	ctx *jsonic.Context, im importDecl, published, declared []string) []Val {
	binds := im.binds
	if 0 == len(binds) {
		for _, k := range published {
			n := aliasBareName(k)
			binds = append(binds, aliasBind{local: n, remote: n})
		}
	}
	refused := []Val{}
	for _, b := range binds {
		var bind Val
		from, ok := declaredAs(published, b.remote)
		if ok && slices.Contains(declared, from) {
			rv := newRef([]any{from}, false)
			rv.absolute = true
			bind = rv
		} else {
			bind = notExported(im, b.remote)
			refused = append(refused, notExported(im, b.remote))
		}
		addAliasHoist(ctx, aliasScopedKey(b.local, im.url), bind)
	}
	return refused
}

func notExported(im importDecl, name string) *NilVal {
	nv := newNil("import_not_exported")
	nv.sp = im.sp
	nv.setSrctext(im.src)
	nv.details = map[string]string{"name": name}
	return nv
}

func declaredAs(declared []string, name string) (string, bool) {
	for _, k := range declared {
		if aliasBareName(k) == name {
			return k, true
		}
	}
	return "", false
}

// The map's own rule, once its pairs are in.
func closeMap(r *jsonic.Rule, ctx *jsonic.Context) {
	m, ok := r.Node.(map[string]any)
	if ok {
		scopeAliasKeys(m)
		recordExports(m)
		bindImports(m, ctx)
	}
	if !ok || 0 == r.ON {
		return
	}
	// Unconditional: the map's OWN rule is the authority, exactly as the
	// TS bc runs once per map rule (a multisource load may have injected
	// a loaded file's stamp; the host position wins, as in TS).
	m[posKey] = r.O0.SI
	m[srcKey] = r.O0.Src
}

// wrapList converts a completed raw list into a ListVal carrying the
// open token's position — the direct mirror of the TS list rule bc
// (new ListVal + addsite). Rule-nesting order means inner lists are
// already Vals here; only this list's own markers need handling.
func wrapList(r *jsonic.Rule, _ *jsonic.Context) {
	n, ok := r.Node.([]any)
	if !ok {
		return
	}
	// The list's own position is worked out FIRST and handed down: an
	// elided element has no token of its own, so its error is located at
	// the list's `[`, and listOfRaw would otherwise read lv.sp before it
	// was assigned.
	sp := -1
	if 0 < r.ON {
		sp = r.O0.SI
	}
	lv := listOfRawAt(n, 0, sp)
	lv.sp = sp
	stampSrc(lv, r)
	r.Node = lv
}

func kindDef(k Kind) *jsonic.ValueDef {
	return &jsonic.ValueDef{Val: jsonic.TokenValFunc(func(r *jsonic.Rule, _ *jsonic.Context) any {
		v := newScalarKind(k)
		if r.ON > 0 {
			v.sp = r.O0.SI
		}
		stampSrc(v, r)
		return v
	})}
}

func bagIsBraceless(v Val) bool {
	switch v.(type) {
	case *MapVal:
		return "{" != v.srctext()
	case *ListVal:
		return "[" != v.srctext()
	}
	return false
}

func stampSrc(v Val, r *jsonic.Rule) {
	if nil == v || 0 >= r.ON {
		return
	}
	v.setSrctext(r.O0.Src)
}

func valDef(mk func(sp int) Val) *jsonic.ValueDef {
	return &jsonic.ValueDef{Val: jsonic.TokenValFunc(func(r *jsonic.Rule, _ *jsonic.Context) any {
		sp := -1
		if r.ON > 0 {
			sp = r.O0.SI
		}
		v := mk(sp)
		stampSrc(v, r)
		return v
	})}
}

// wrapLeaf converts a plain scalar leaf (number/string/bool) produced by
// jsonic into the matching Val, recording the source byte offset.
func wrapLeaf(r *jsonic.Rule, _ *jsonic.Context) {
	// Leave the @"path" argument of the multisource directive as a raw
	// string so the directive can read it (it extracts the path itself,
	// unlike the TS resolver which reads StringVal.peg).
	if r.Parent != nil && r.Parent.Name == "multisource" {
		return
	}
	sp := -1
	src := ""
	if r.ON > 0 {
		sp = r.O0.SI
		src = r.O0.Src
	}
	switch n := r.Node.(type) {
	case float64:
		if math.IsInf(n, 0) || math.IsNaN(n) {
			e := newNil("not_number")
			e.sp = sp
			// This exit precedes the stamp below it, so it needs its
			// own: an overflowing literal is precisely located and was
			// reported with no span at all, where TypeScript gave the
			// literal's text. Pinned by vet-overflow-literal.
			stampSrc(e, r)
			r.Node = e
			return
		}
		nv := numberVal(n, src, sp)
		stampSrc(nv, r)
		r.Node = nv
	case string:
		// An overflowing numeric literal (1e999) fails Go's float
		// parsing and falls back to text; in TS it lexes to Infinity,
		// which is a not_number error nil. Match that — but only for
		// unquoted text (a quoted "1e999" stays a string).
		if r.ON > 0 && r.O0.Tin == jsonic.TinTX && n == src && overflowsFloat(src) {
			e := newNil("not_number")
			e.sp = sp
			stampSrc(e, r)
			r.Node = e
			return
		}
		v := newString(n)
		v.sp = sp
		stampSrc(v, r)
		r.Node = v
	case bool:
		v := newBoolean(n)
		v.sp = sp
		stampSrc(v, r)
		r.Node = v
	}
}

// overflowsFloat reports whether src is a numeric literal whose value
// overflows a float64 (strconv rejects it with ErrRange; JS lexes it as
// Infinity).
func overflowsFloat(src string) bool {
	_, err := strconv.ParseFloat(src, 64)
	if err == nil {
		return false
	}
	ne, ok := err.(*strconv.NumError)
	return ok && ne.Err == strconv.ErrRange
}

const (
	int64MinFloat   = -9223372036854775808.0
	int64LimitFloat = 9223372036854775808.0
)

func isIntegerKind(n float64, src string) bool {
	if strings.Contains(src, ".") {
		return false
	}
	// NaN fails the Trunc test; ±Inf fails the range test. So a
	// non-finite value is never of integer kind.
	return n == math.Trunc(n) && int64MinFloat <= n && n < int64LimitFloat
}

func isExactInBinary64(n *big.Int) bool {
	_, acc := new(big.Float).SetInt(n).Float64()
	return acc == big.Exact
}

func isIntegerStorable(n *big.Int) bool {
	return n.IsInt64() && isExactInBinary64(n)
}

// pow53Float is 2^53, the magnitude at and above which a binary64 stops
// being able to hold every integer. See numberVal's D7 gate.
const pow53Float = 9007199254740992.0

const maxIntegerLiteralExponent = 400

func isLossyIntegerLiteral(src string) bool {
	s := strings.ReplaceAll(src, "_", "")
	// A literal token carries no sign (`-1` is unary minus applied to
	// `1`), and the sign is irrelevant to exactness anyway — binary64 is
	// sign-symmetric — but accept one so the test does not depend on
	// that. (The matcher's own patterns admit a sign.)
	if 0 < len(s) && (s[0] == '+' || s[0] == '-') {
		s = s[1:]
	}
	if s == "" || strings.Contains(s, ".") {
		return false
	}

	var exact *big.Int

	if basedNumeric(s) {
		base := 16
		switch s[1] {
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		n, ok := new(big.Int).SetString(s[2:], base)
		if !ok {
			return false
		}
		exact = n
	} else {
		digits, exp := s, 0
		if i := strings.IndexAny(s, "eE"); 0 <= i {
			e, err := strconv.Atoi(s[i+1:])
			if err != nil {
				// An exponent too long for an int is beyond any bound this
				// rule would accept anyway.
				return false
			}
			digits, exp = s[:i], e
		}
		if !allDigits(digits) || exp < 0 {
			return false
		}
		n, ok := new(big.Int).SetString(digits, 10)
		if !ok { //coverage:ignore allDigits above already vetted the run
			return false
		}
		// Zero at any exponent is zero, and zero is exact — test it
		// before the exponent bound, which would otherwise have to have
		// an opinion about `0e500`.
		if n.Sign() == 0 {
			return false
		}
		if maxIntegerLiteralExponent < exp {
			return false
		}
		exact = n.Mul(n, pow10(int64(exp)))
	}

	return !isExactInBinary64(exact)
}

// allDigits reports whether s is a non-empty run of decimal digits.
func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || '9' < s[i] {
			return false
		}
	}
	return true
}

// Hyphen separates segments; not leading or trailing, as `-` prefixes negation.
const aliasNamePat = `%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*`

var aliasRe = regexp.MustCompile(`^` + aliasNamePat)

// What `export` takes and a destructure heads with: a name, or
// `%local: %remote`; `{%}` is the wildcard and binds no item.
const aliasItemPat = `(` + aliasNamePat + `)(?:[ \t]*:[ \t]*(` + aliasNamePat + `))?`
const aliasSetPat = `\{[ \t]*(?:%|` + aliasItemPat +
	`(?:[ \t]*,[ \t]*` + aliasItemPat + `)*)[ \t]*\}`

// THE SHORTHAND: `{ %a %b }` is `{ a: %a, b: %b }`. Names only.
const aliasShorthandPat = `\{\s*` + aliasNamePat +
	`(?:(?:\s*,\s*|\s+)` + aliasNamePat + `)*\s*\}`

var aliasShorthandRe = regexp.MustCompile(`^` + aliasShorthandPat)

var aliasNameRe = regexp.MustCompile(`^` + aliasNamePat + `$`)
var aliasSetRe = regexp.MustCompile(`^` + aliasSetPat + `$`)
var aliasItemsRe = regexp.MustCompile(aliasItemPat)

// `{ %a } = @"f.aon"` is the pair `<head>: <include>`, so the head is
// one token. RE2 has no lookahead, so `==` is ruled out at the match.
var importHeadRe = regexp.MustCompile(`^(` + aliasSetPat + `)[ \t]*=`)
var exportRe = regexp.MustCompile(`^export[ \t]*\([ \t]*([^()\s][^()]*?)[ \t]*\)`)

// A key carries the url of the file that declared the name.
const aliasScopeSep = "@"
const scopeMetaKey = reservedKeyPrefix + "scope"

var scopeSeq atomic.Int64

// `export(...)` is read as a pair, its value under a key that changes
// with each declaration, so a field of that name is the document's.
const exportDeclName = "export"
const exportHoldKey = reservedKeyPrefix + "export@"

var exportSeq atomic.Int64

func nextExportHoldKey() string {
	return exportHoldKey + itoa(int(exportSeq.Add(1)))
}

func isExportHoldKey(val any) bool {
	s, ok := val.(string)
	return ok && strings.HasPrefix(s, exportHoldKey)
}

func aliasScopedKey(name, url string) string {
	return name + aliasScopeSep + url
}

// A path segment as the source spells it: a key drops its scope.
func aliasPathSegment(seg string) string {
	name := aliasBareName(seg)
	if aliasNameRe.MatchString(name) {
		return name
	}
	return seg
}

// An unscoped key is its own name: how a path segment answers no above.
func aliasBareName(key string) string {
	at := strings.Index(key, aliasScopeSep)
	if -1 == at {
		return key
	}
	return key[:at]
}

// Empty where the text is not a set; the wildcard answers EMPTY, true.
func aliasSetItems(text string) ([]aliasBind, bool) {
	if !aliasSetRe.MatchString(text) {
		return nil, false
	}
	items := []aliasBind{}
	for _, m := range aliasItemsRe.FindAllStringSubmatch(text, -1) {
		remote := m[2]
		if "" == remote {
			remote = m[1]
		}
		items = append(items, aliasBind{local: m[1], remote: remote})
	}
	return items, true
}

// `export` publishes a name; it renames none, and `{%}` is theirs.
func publishedNames(items []aliasBind, ok bool) ([]string, bool) {
	if !ok || 0 == len(items) {
		return nil, false
	}
	names := make([]string, 0, len(items))
	for _, i := range items {
		if i.local != i.remote {
			return nil, false
		}
		names = append(names, i.local)
	}
	return names, true
}

// The file a value was written in, and so any alias name's scope. A
// DOCUMENT IS ITS OWN SCOPE too, so a fileless parse is tagged.
func srcURL(ctx *jsonic.Context) string {
	ms, _ := ctx.Meta["multisource"].(map[string]any)
	url, _ := ms["path"].(string)
	if "" != url {
		return url
	}
	tag, _ := ctx.Meta[scopeMetaKey].(string)
	if "" == tag {
		tag = "#" + itoa(int(scopeSeq.Add(1)))
		ctx.Meta[scopeMetaKey] = tag
	}
	return tag
}

var exactLiteralRe = regexp.MustCompile(
	`^0[dD]([0-9](?:_?[0-9])*)(?:\.([0-9](?:_?[0-9])*))?(?:[eE]([-+]?[0-9](?:_?[0-9])*))?`)

func negSrc(src string) string {
	if src == "" {
		return ""
	}
	if strings.HasPrefix(src, "-") {
		return src[1:]
	}
	return "-" + src
}

func withSrc(v *ScalarVal, src string) *ScalarVal {
	v.src = src
	return v
}

func exactLiteral(m []string) func(int) Val {
	src := m[0]
	intPart := stripSeps(m[1])
	frac := stripSeps(m[2])
	exp := stripSeps(m[3])

	if m[2] == "" && m[3] == "" {
		n, ok := new(big.Int).SetString(intPart, 10)
		if !ok { //coverage:ignore the literal regex already vetted the digits
			return exactNil("decimal_syntax")
		}
		// big.Int has no negative zero, so D5 needs nothing here.
		return func(sp int) Val {
			v := newBigInteger(new(big.Int).Set(n))
			v.sp = sp
			v.src = src
			// The SPAN too. No rule is in scope here to call stampSrc
			// with, but src IS the whole matched literal, which is
			// exactly the token text the site's extent describes.
			v.stext = src
			return v
		}
	}

	d, why := exactDecimal(false, intPart, frac, exp)
	if why != "" {
		return exactNil(why)
	}
	return func(sp int) Val {
		v := newBigDecimal(d)
		v.sp = sp
		v.src = src
		v.stext = src
		return v
	}
}

func exactDecimal(neg bool, intPart, frac, exp string) (*Decimal, string) {
	if len(intPart)+len(frac) > decimalMaxCoeffDigits {
		return nil, "decimal_budget"
	}

	scale := big.NewInt(int64(len(frac)))
	if exp != "" {
		e, ok := new(big.Int).SetString(exp, 10)
		if !ok { //coverage:ignore both callers pass a signed digit run
			return nil, "decimal_syntax"
		}
		scale.Sub(scale, e)
	}
	if scale.CmpAbs(big.NewInt(decimalMaxScale)) > 0 {
		return nil, "decimal_budget"
	}

	coeff, ok := new(big.Int).SetString(intPart+frac, 10)
	if !ok { //coverage:ignore both callers pass unsigned digit runs
		return nil, "decimal_syntax"
	}
	if neg {
		coeff.Neg(coeff)
	}
	// Normalised at construction (D4): one value, one rendering.
	return newDecimal(coeff, int32(scale.Int64())), ""
}

// exactNil builds the constructor for a located error nil — a refused
// literal is never a rounded or expanded value (D6).
func exactNil(why string) func(int) Val {
	return func(sp int) Val {
		n := newNil(why)
		n.sp = sp
		return n
	}
}

func stripSeps(s string) string { return strings.ReplaceAll(s, "_", "") }

func numberVal(n float64, src string, sp int) Val {
	if pow53Float <= math.Abs(n) && isLossyIntegerLiteral(src) {
		e := newNil("lossy_integer_literal")
		e.sp = sp
		// The hint names the refused literal ({src}), as in TS.
		e.details = map[string]string{"src": src}
		// A parse-constructed nil is its own frame operand (TS ends up
		// with primary === the nil itself), so the thrown message shows
		// the literal's location with `value was: nil`.
		e.primary = e
		return e
	}
	if isIntegerKind(n, src) {
		v := newInteger(int64(n))
		v.sp = sp
		v.src = src
		return v
	}
	v := newFloat(n)
	v.sp = sp
	v.src = src
	return v
}

const reservedRefusedKey = reservedKeyPrefix + "refusedkey"
const quarantineKeyPrefix = reservedKeyPrefix + "quarantine"

var quarantineSeq atomic.Int64

// A MARK IS A KEY IN THE SAME NODE, so a source key that names one
// would land on it. The pair's OPEN is where the key is known and its
// value not yet stored, so the value goes elsewhere; keyRefusalOf says
// why. The engine writes one key here itself: an `export` declaration.
func reserveKeyNamespace(r *jsonic.Rule, _ *jsonic.Context) {
	key, _ := r.U["key"].(string)
	if !strings.HasPrefix(key, reservedKeyPrefix) ||
		(r.ON > 0 && r.O0.Use["aontu_export"] == true) {
		return
	}
	r.U[reservedRefusedKey] = key
	r.U["key"] = quarantineKeyPrefix + itoa(int(quarantineSeq.Add(1)))
}

// trackOrder appends this pair's key to the map's insertion order.
func trackOrder(r *jsonic.Rule, ctx *jsonic.Context) {
	var m map[string]any
	if r.Parent != nil {
		m, _ = r.Parent.Node.(map[string]any)
	}
	if m == nil {
		m, _ = r.Node.(map[string]any)
	}
	if m == nil {
		return
	}
	// A &: spread pair: store the spread value (merge multiple spreads
	// into a conjunct) rather than recording it as a key.
	if r.U["spread"] == true {
		cn := r.Child.Node
		if isElidedNode(cn) {
			m[elidedSpreadKey] = true
			return
		}
		sv := asVal(cn)
		if existing, ok := m[spreadKey]; ok {
			m[spreadKey] = mergeVals(existing.(Val), sv)
		} else {
			m[spreadKey] = sv
		}
		return
	}

	key, _ := r.U["key"].(string)
	if "" == key {
		key = keyOf(r.O0)
	}

	// The order carries the key the SOURCE wrote; its value is dropped.
	if orig, ok := r.U[reservedRefusedKey].(string); ok {
		delete(m, key)
		key = orig
	}

	if kr, ok := keyRefusalOf(r.O0, r.O1, key); ok {
		kr.url = srcURL(ctx)
		krs, _ := m[keyRefusalsKey].([]keyRefusal)
		m[keyRefusalsKey] = append(krs, kr)
	} else if isAliasDecl(r.O0, r.O1, key) {
		decls, _ := m[aliasDeclsKey].([]aliasDecl)
		m[aliasDeclsKey] = append(decls,
			aliasDecl{name: key, key: aliasScopedKey(key, srcURL(ctx))})
	} else if names, nok, ok := exportNamesOf(r.O0); ok {
		exs, _ := m[exportDeclsKey].([]exportDecl)
		m[exportDeclsKey] = append(exs,
			exportDecl{names: names, ok: nok, url: srcURL(ctx),
				hold: r.O0.Val.(string), sp: r.O0.SI, src: r.O0.Src})
	} else if binds, ok := importBindsOf(r.O0); ok {
		ims, _ := m[importDeclsKey].([]importDecl)
		m[importDeclsKey] = append(ims, importDecl{
			key: key, binds: binds, url: srcURL(ctx),
			sp: r.O0.SI, src: r.O0.Src})
	}

	// An optional pair (key?:value): the custom alt bypasses jsonic's
	// value storage, so store the value ourselves and record the key.
	// A duplicate key merges into a conjunct exactly like the Map.Merge
	// option does for normal pairs (`a:1 a?:2` -> `a:1&2`).
	if r.U["optional"] == true {
		opt, _ := m[optionalKey].([]string)
		m[optionalKey] = append(opt, key)
		var cn any
		if r.Child != nil {
			cn = r.Child.Node
		}
		// An elided optional value (`a?:`) is null, like `a:` (the nil
		// becomes a NullVal in asVal).
		if prev, ok := m[key]; ok && prev != nil {
			m[key] = mergeVals(asVal(prev), asVal(cn))
		} else {
			m[key] = cn
		}
	}

	ord, _ := m[orderKey].([]string)
	m[orderKey] = appendNew(ord, key)
}

func appendNew(base []string, add ...string) []string {
	for _, k := range add {
		seen := false
		for _, b := range base {
			if b == k {
				seen = true
				break
			}
		}
		if !seen {
			base = append(base, k)
		}
	}
	return base
}

func keyOf(t *jsonic.Token) string {
	if t == nil {
		return ""
	}
	if t.Tin == jsonic.TinST || t.Tin == jsonic.TinTX {
		if s, ok := t.Val.(string); ok {
			return s
		}
	}
	return t.Src
}

func isAliasDecl(ktkn, sep *jsonic.Token, key string) bool {
	return ktkn != nil && ktkn.Tin != jsonic.TinST && aliasRe.MatchString(key) &&
		sep != nil && sep.Use != nil && true == sep.Use["aontu_eq"]
}

func keyRefusalOf(ktkn, sep *jsonic.Token, key string) (keyRefusal, bool) {
	// The namespace says more about a key than the bare-string rule.
	if ktkn != nil && strings.HasPrefix(key, reservedKeyPrefix) &&
		ktkn.Use["aontu_export"] != true {
		return keyRefusal{key: key, why: "reserved_key",
			sp: ktkn.SI, src: ktkn.Src}, true
	}
	if ktkn == nil || ktkn.Tin == jsonic.TinST {
		return keyRefusal{}, false
	}
	if aliasRe.MatchString(key) {
		if isAliasDecl(ktkn, sep, key) {
			return keyRefusal{}, false
		}
		return keyRefusal{key: key, why: "alias_colon", sp: ktkn.SI, src: ktkn.Src}, true
	}
	if ch, bad := ktkn.Use["aontu_bad"].(string); bad {
		return keyRefusal{
			key:     key,
			why:     "bare_punct",
			sp:      ktkn.SI + strings.Index(key, ch),
			src:     ch,
			details: map[string]string{"char": ch, "text": key},
		}, true
	}
	return keyRefusal{}, false
}

func refuseAliasSegment(terms []any, r *jsonic.Rule) *NilVal {
	// Terms here are always Vals, and the shapes are exactly two that
	// can carry a name: a RefVal (whose peg is the segment list) and a
	// StringVal (whose peg is the segment). Anything else is a numeric
	// or exact segment, which cannot be an alias name.
	bad := false
	for _, t := range terms {
		switch seg := t.(type) {
		case *RefVal:
			for _, p := range seg.peg {
				if ps, ok := p.(string); ok && aliasRe.MatchString(ps) {
					bad = true
				}
			}
		case *ScalarVal:
			bad = bad || aliasRe.MatchString(seg.Canon())
		}
	}
	if !bad {
		return nil
	}
	nv := newNil("alias_in_path")
	if r.ON > 0 {
		nv.sp = r.O0.SI
	}
	stampSrc(nv, r)
	return nv
}

// Where a claimed `export(...)` has its `(`, argument and `)`.
type exportSpan struct {
	cl  int
	arg int
	end int
	src string
}

var exportAt sync.Map
var shorthandEnd sync.Map
var shorthandRef sync.Map

type shorthandSpan struct {
	at    int
	name  string
	stage int
}

// THE FIXED MATCHER'S CHECK RUNS AT EVERY POSITION, which the heads
// need: `{` opens a fixed token the text check never sees.
func tsFixedCheck(l *jsonic.Lex) *jsonic.LexCheckResult {
	pnt := l.Cursor()
	start := pnt.SI
	src := l.Src
	rest := src[start:]

	if ex, ok := exportAt.Load(l); ok {
		span := ex.(exportSpan)
		// The `(` is the pair's separator, the argument its value.
		if start == span.cl {
			tkn := l.Token("#CL", jsonic.TinCL, "(", "(")
			pnt.CI += span.arg - start
			pnt.SI = span.arg
			return &jsonic.LexCheckResult{Done: true, Token: tkn}
		}
		if start == span.arg {
			exportAt.Delete(l)
			tkn := l.Token("#TX", jsonic.TinTX, span.src, span.src)
			pnt.CI += span.end - start
			pnt.SI = span.end
			return &jsonic.LexCheckResult{Done: true, Token: tkn}
		}
	}

	// THE SHORTHAND IS READ OFF THE SOURCE: a name in it lexes as the
	// pair it stands for, so the grammar needs nothing new.
	if sh, ok := shorthandRef.Load(l); ok {
		span := sh.(shorthandSpan)
		if start == span.at {
			if 1 == span.stage {
				span.stage = 2
				shorthandRef.Store(l, span)
				return &jsonic.LexCheckResult{
					Done: true, Token: l.Token("#CL", jsonic.TinCL, ":", ":")}
			}
			shorthandRef.Delete(l)
			name := span.name
			tkn := l.Token("#VL", jsonic.TinVL,
				jsonic.TokenValFunc(func(r *jsonic.Rule, ctx *jsonic.Context) any {
					rv := newRef([]any{aliasScopedKey(name, srcURL(ctx))}, false)
					rv.absolute = true
					if r.ON > 0 {
						rv.sp = r.O0.SI
					}
					stampSrc(rv, r)
					return rv
				}), name)
			return &jsonic.LexCheckResult{Done: true, Token: tkn}
		}
	}

	if strings.HasPrefix(rest, "{") {
		if m := aliasShorthandRe.FindString(rest); "" != m {
			shorthandEnd.Store(l, start+len(m))
		}
		if m := importHeadRe.FindStringSubmatchIndex(rest); nil != m &&
			(start+m[1] >= len(src) || '=' != src[start+m[1]]) {
			head := rest[m[2]:m[3]]
			binds, _ := aliasSetItems(head)
			aliasEqAt.Store(l, start+m[1]-1)
			tkn := l.Token("#TX", jsonic.TinTX, head, head)
			tkn.Use = map[string]any{"aontu_import": binds}
			pnt.SI += len(head)
			pnt.CI += utf8.RuneCountInString(head)
			return &jsonic.LexCheckResult{Done: true, Token: tkn}
		}
	}

	return nil
}

func isSpaceByte(c byte) bool {
	return ' ' == c || '\t' == c || '\n' == c || '\r' == c
}

func tsTextCheck(l *jsonic.Lex) *jsonic.LexCheckResult {
	pnt := l.Cursor()
	start := pnt.SI
	if start >= pnt.Len {
		return nil
	}
	src := l.Src

	if '%' == src[start] {
		if m := aliasRe.FindString(src[start:]); "" != m {
			// In a shorthand set the name is the KEY it stands for; the
			// separator and the reference are pushed back after it.
			if end, ok := shorthandEnd.Load(l); ok && start < end.(int) {
				k := start + len(m)
				for k < len(src) && isSpaceByte(src[k]) {
					k++
				}
				tkn := l.Token("#TX", jsonic.TinTX, m[1:], m)
				pnt.CI += utf8.RuneCountInString(src[start:k])
				pnt.SI = k
				shorthandRef.Store(l, shorthandSpan{at: k, name: m, stage: 1})
				if end.(int) <= k {
					shorthandEnd.Delete(l)
				}
				return &jsonic.LexCheckResult{Done: true, Token: tkn}
			}
			j := start + len(m)
			for j < len(src) && (' ' == src[j] || '\t' == src[j]) {
				j++
			}
			if j < len(src) && '=' == src[j] && (j+1 >= len(src) || '=' != src[j+1]) {
				aliasEqAt.Store(l, j)
			}
			return nil
		}
	}

	// `export(...)`: the word is the key, spelled unwritably.
	if 'e' == src[start] {
		if m := exportRe.FindStringSubmatchIndex(src[start:]); nil != m {
			names, nok := publishedNames(
				aliasSetItems(src[start+m[2] : start+m[3]]))
			exportAt.Store(l, exportSpan{
				cl:  start + strings.Index(src[start:start+m[1]], "("),
				arg: start + m[2],
				end: start + m[1],
				src: src[start+m[2] : start+m[3]],
			})
			tkn := l.Token("#TX", jsonic.TinTX, nextExportHoldKey(), exportDeclName)
			tkn.Use = map[string]any{
				"aontu_export": true, "aontu_export_names": names,
				"aontu_export_ok": nok}
			pnt.SI += len(exportDeclName)
			pnt.CI += len(exportDeclName)
			return &jsonic.LexCheckResult{Done: true, Token: tkn}
		}
	}

	if '=' == src[start] {
		if at, ok := aliasEqAt.Load(l); ok && at.(int) == start {
			aliasEqAt.Delete(l)
			tkn := l.Token("#CL", jsonic.TinCL, "=", "=")
			tkn.Use = map[string]any{"aontu_eq": true}
			pnt.SI += 1
			pnt.CI += 1
			return &jsonic.LexCheckResult{Done: true, Token: tkn}
		}
	}

	// THE `0d` LITERAL is the exact def's, which claims the run whole in
	// matchText -- `.` and exponent sign included -- so it is neither
	// carved nor refused here first. The `0d` arm's place in the TS hook:
	// before the scan, and only where the literal grammar matches.
	if '0' == src[start] && start+1 < len(src) &&
		('d' == src[start+1] || 'D' == src[start+1]) &&
		exactLiteralRe.MatchString(src[start:]) {
		return nil
	}

	run := scanBareRun(l, start, false)
	msrc := src[start:run.end]

	if run.bad >= 0 {
		off := run.bad - start
		ch := run.ch
		tkn := l.Token("#VL", jsonic.TinVL,
			jsonic.TokenValFunc(func(r *jsonic.Rule, _ *jsonic.Context) any {
				nv := newNil("bare_punct")
				if r.ON > 0 {
					nv.sp = r.O0.SI + off
				}
				nv.setSrctext(ch)
				nv.details = map[string]string{"char": ch, "text": msrc}
				return nv
			}), msrc)
		tkn.Use = map[string]any{"aontu_bad": ch}
		pnt.SI += len(msrc)
		pnt.CI += utf8.RuneCountInString(msrc)
		return &jsonic.LexCheckResult{Done: true, Token: tkn}
	}

	if strings.Contains(msrc, "-") {
		tkn := l.Token("#TX", jsonic.TinTX, msrc, msrc)
		pnt.SI += len(msrc)
		pnt.CI += utf8.RuneCountInString(msrc)
		return &jsonic.LexCheckResult{Done: true, Token: tkn}
	}
	return nil
}

// bareRun is what scanBareRun found: where the run ends, the byte
// offset of its first BAD character (-1 when the run is clean) and that
// character.
type bareRun struct {
	end int
	bad int
	ch  string
}

func scanBareRun(l *jsonic.Lex, start int, expo bool) bareRun {
	src := l.Src
	i := start
	bad := -1
	ch := ""
	for i < len(src) {
		r, w := utf8.DecodeRuneInString(src[i:])
		if bareTextChar(r) {
			i += w
			continue
		}
		if expo && '+' == r && start < i && i+1 < len(src) {
			p, n := src[i-1], src[i+1]
			if ('e' == p || 'E' == p) && '0' <= n && n <= '9' {
				i++
				continue
			}
		}
		if textEnderAt(l, i, r) {
			break
		}
		if -1 == bad {
			bad = i
			ch = string(r)
		}
		i += w
	}
	return bareRun{end: i, bad: bad, ch: ch}
}

// bareTextChar is the TEXT class: a letter, a digit, `_` and `-`.
// Beyond ASCII a letter, a digit or a combining mark is text (`café`);
// a dash, a symbol or a space of any other kind is not.
func bareTextChar(r rune) bool {
	if r < 128 {
		return ('0' <= r && r <= '9') ||
			('a' <= r && r <= 'z') ||
			('A' <= r && r <= 'Z') ||
			'_' == r ||
			'-' == r
	}
	return unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsMark(r)
}

// textEnderAt reports whether the lexer's own text ender is at pos: a
// space or line char, an ender char, a fixed token or a comment starter
// -- each read from the config, as the text matcher reads it. ch is the
// rune at pos.
func textEnderAt(l *jsonic.Lex, pos int, ch rune) bool {
	cfg := l.Config
	if (cfg.SpaceLex && cfg.SpaceChars[ch]) ||
		(cfg.LineLex && cfg.LineChars[ch]) ||
		cfg.EnderChars[ch] {
		return true
	}
	rest := l.Src[pos:]
	for _, fs := range cfg.FixedSorted {
		if strings.HasPrefix(rest, fs) {
			return true
		}
	}
	if cfg.CommentLex {
		for _, cs := range cfg.CommentLine {
			if strings.HasPrefix(rest, cs) {
				return true
			}
		}
		for _, cb := range cfg.CommentBlock {
			if strings.HasPrefix(rest, cb[0]) {
				return true
			}
		}
	}
	return false
}

func tsNumCheck(l *jsonic.Lex) *jsonic.LexCheckResult {
	pnt := l.Cursor()
	start := pnt.SI
	if start >= pnt.Len {
		return nil
	}
	c := l.Src[start]
	if !('0' <= c && c <= '9') {
		return notANumber
	}
	run := scanBareRun(l, start, true)
	if run.bad >= 0 {
		return notANumber
	}
	src := l.Src[start:run.end]
	if !fullNumeric(src) {
		return notANumber
	}
	if numberExcluded(src) {
		return notANumber
	}
	s := strings.ReplaceAll(src, "_", "")
	if basedNumeric(s) {
		if _, ierr := strconv.ParseInt(s, 0, 64); ierr != nil {
			if f, ok := basedFloat(s); ok {
				tkn := l.Token("#NR", jsonic.TinNR, f, src)
				pnt.SI = run.end
				pnt.CI += run.end - start
				return &jsonic.LexCheckResult{Done: true, Token: tkn}
			}
		}
	}
	return nil
}

// notANumber is the number hook's result where the run is not the
// matcher's to lex: the text stage reads it.
var notANumber = &jsonic.LexCheckResult{Done: true}

func numberExcluded(msrc string) bool {
	return sepInvalid(msrc)
}

func sepInvalid(msrc string) bool {
	// Repeated separator, anywhere.
	if strings.Contains(msrc, "__") {
		return true
	}
	// Separator closing a run.
	if strings.HasSuffix(msrc, "_") {
		return true
	}
	// Separator opening a base-prefixed run: [+-]? '0' [xXoObB] '_'.
	s := msrc
	if len(s) > 0 && (s[0] == '+' || s[0] == '-') {
		s = s[1:]
	}
	if len(s) > 2 && s[0] == '0' && s[2] == '_' {
		switch s[1] {
		case 'x', 'X', 'o', 'O', 'b', 'B':
			return true
		}
	}
	return false
}

// basedFloat evaluates a syntactically valid base-prefixed integer
// literal of any magnitude to the float64 JS would produce.
func basedFloat(s string) (float64, bool) {
	neg := false
	if s[0] == '+' || s[0] == '-' {
		neg = s[0] == '-'
		s = s[1:]
	}
	var b int
	switch s[1] {
	case 'x', 'X':
		b = 16
	case 'o', 'O':
		b = 8
	default:
		b = 2
	}
	bi, ok := new(big.Int).SetString(s[2:], b)
	if !ok {
		return 0, false
	}
	f, _ := new(big.Float).SetInt(bi).Float64()
	if neg {
		f = -f
	}
	return f, true
}

func fullNumeric(src string) bool {
	// src opens on a digit (tsNumCheck admits nothing else), so it is
	// never empty once the separators are gone.
	s := strings.ReplaceAll(src, "_", "")
	if basedNumeric(s) {
		return true
	}
	_, err := strconv.ParseFloat(s, 64)
	if err == nil {
		return true
	}
	if ne, ok := err.(*strconv.NumError); ok && ne.Err == strconv.ErrRange {
		return true
	}
	_, ierr := strconv.ParseInt(s, 0, 64)
	return ierr == nil
}

// basedNumeric reports whether s is a syntactically valid base-prefixed
// (0x/0o/0b) integer literal of ANY magnitude, with optional sign.
func basedNumeric(s string) bool {
	if len(s) > 0 && (s[0] == '+' || s[0] == '-') {
		s = s[1:]
	}
	if len(s) < 3 || s[0] != '0' {
		return false
	}
	var ok func(byte) bool
	switch s[1] {
	case 'x', 'X':
		ok = func(c byte) bool {
			return '0' <= c && c <= '9' || 'a' <= c && c <= 'f' || 'A' <= c && c <= 'F'
		}
	case 'o', 'O':
		ok = func(c byte) bool { return '0' <= c && c <= '7' }
	case 'b', 'B':
		ok = func(c byte) bool { return c == '0' || c == '1' }
	default:
		return false
	}
	for i := 2; i < len(s); i++ {
		if !ok(s[i]) {
			return false
		}
	}
	return true
}

func snipExprCycles(node any) any {
	out, _ := snipWalk(node, map[any]bool{})
	return out
}

// snipWalk returns (node, keep); keep is false when node is an ancestor
// back-edge and must be dropped by the caller. Slices are identified by
// their data pointer (only when non-empty: empty slices can share a
// zero-size allocation and must not alias each other).
func snipWalk(node any, seen map[any]bool) (any, bool) {
	switch v := node.(type) {
	case *jsonic.ListRef:
		if v == nil {
			return node, true
		}
		if seen[node] {
			return nil, false
		}
		seen[node] = true
		nv, keep := snipWalk(v.Val, seen)
		delete(seen, node)
		if keep {
			v.Val, _ = nv.([]any)
		} else {
			v.Val = nil
		}
		return v, true
	case []any:
		var key any
		if len(v) > 0 {
			key = reflect.ValueOf(v).Pointer()
			if seen[key] {
				return nil, false
			}
			seen[key] = true
		}
		out := make([]any, 0, len(v))
		for _, e := range v {
			ne, keep := snipWalk(e, seen)
			if keep {
				out = append(out, ne)
			}
		}
		if key != nil {
			delete(seen, key)
		}
		return out, true
	default:
		return node, true
	}
}

func incompleteNil(r *jsonic.Rule) Val {
	n := newNil("incomplete_expression")
	if r != nil && r.ON > 0 {
		n.sp = r.O0.SI
	}
	return n
}

func evaluate(r *jsonic.Rule, ctx *jsonic.Context, op *expr.Op, terms []interface{}) interface{} {
	// Top-level expression wrappers are evaluated outside any rule
	// (expr.Evaluation(nil, nil, ...) in asValDepth); the NoRule
	// sentinel keeps the r.ON source-position guards safe.
	if r == nil {
		r = jsonic.NoRule
	}
	// Drop unfilled (nil) operator terms — a dangling `*` in a list
	// leaves a nil term rather than a cyclic one — so the
	// missing-operand guards below fire exactly as the dropUnfilled
	// filter does in ts/src/lang.ts.
	kept := make([]interface{}, 0, len(terms))
	for _, t := range terms {
		if t != nil {
			kept = append(kept, t)
		}
	}
	terms = kept
	switch op.Name {
	case "conjunct-infix":
		vals := toVals(terms)
		c := newConjunct(vals)
		if len(vals) > 0 {
			// Site AND span from the first term, which is the rule the
			// canonical port states: a conjunct takes its site from its
			// first term. Taking the position without the extent left a
			// site that named a place and denied it had any width.
			c.sp = vals[0].pos()
			c.setSrctext(vals[0].srctext())
		}
		return c
	case "disjunct-infix":
		vals := toVals(terms)
		d := newDisjunct(vals)
		if len(vals) > 0 {
			d.sp = vals[0].pos()
			d.setSrctext(vals[0].srctext())
		}
		return d
	case "star-prefix":
		if len(terms) < 1 {
			return incompleteNil(r)
		}
		inner := asVal(terms[0])

		if bagIsBraceless(inner) {
			nv := newNil("pref_implicit_bag")
			if r.ON > 0 {
				nv.sp = r.O0.SI
			}
			stampSrc(nv, r)
			return nv
		}

		pv := newPref(inner)
		// Sited at the `*` itself, as TS's addsite frames it; the inner
		// value's position is the fallback for a synthetic rule.
		pv.sp = inner.pos()
		if r.ON > 0 {
			pv.sp = r.O0.SI
		}
		stampSrc(pv, r)
		return pv
	case "negative-prefix":
		if len(terms) < 1 {
			return incompleteNil(r)
		}
		nv := negate(terms[0])
		if r.ON > 0 {
			nv.setPos(r.O0.SI)
		}
		stampSrc(nv, r)
		return nv
	case "positive-prefix":
		if len(terms) < 1 {
			return incompleteNil(r)
		}
		return asVal(terms[0])
	case "dot-prefix":
		if len(terms) < 1 {
			return incompleteNil(r)
		}
		if nv := refuseAliasSegment(terms, r); nv != nil {
			return nv
		}
		rv := newRef(terms, true)
		if r.ON > 0 {
			rv.sp = r.O0.SI
		}
		stampSrc(rv, r)
		return rv
	case "dot-infix":
		if len(terms) < 1 {
			return incompleteNil(r)
		}
		if nv := refuseAliasSegment(terms, r); nv != nil {
			return nv
		}
		rv := newRef(terms, false)
		if r.ON > 0 {
			rv.sp = r.O0.SI
		}
		stampSrc(rv, r)
		return rv
	case "dollar-prefix":
		if len(terms) < 1 {
			return incompleteNil(r)
		}
		// A refusal from the dot arms above (an alias used as a path
		// segment) rides straight through: wrapping it in a var would
		// replace `alias_in_path` with a var whose peg is a nil.
		if nv, ok := terms[0].(*NilVal); ok {
			return nv
		}
		// `$%foo` -- the sigil directly after the root -- reaches here
		// as the alias reference rather than through a dot arm, and is
		// refused for the same reason.
		if nv := refuseAliasSegment(terms, r); nv != nil {
			return nv
		}
		// $.a.b -> absolute reference; $name -> variable (the name is
		// wrapped as a StringVal so canon renders as $"name").
		if r0, ok := terms[0].(*RefVal); ok {
			r0.absolute = true
			if r.ON > 0 {
				r0.sp = r.O0.SI
			}
			stampSrc(r0, r)
			return r0
		}
		vv := newVar(asVal(terms[0]))
		if r.ON > 0 {
			vv.sp = r.O0.SI
		}
		stampSrc(vv, r)
		return vv
	case "addition-infix":
		if len(terms) < 2 {
			return incompleteNil(r)
		}
		ov := newPlusOp(asVal(terms[0]), asVal(terms[1]))
		if r.ON > 0 {
			ov.sp = r.O0.SI
		}
		stampSrc(ov, r)
		return ov
	case "func-paren":
		if len(terms) > 0 {
			if name, ok := terms[0].(string); ok {
				return buildCall(r, name, terms[1:])
			}
			if len(terms) > 1 {
				// Sited exactly as buildCall sites an unrecognised
				// NAME: a located refusal is the whole product here,
				// and an unsited nil renders `<no-file>:-1:-1` where
				// TypeScript names the call's row and column.
				n := newNil("unknown_function")
				if r.ON > 0 {
					n.sp = r.O0.SI
				}
				stampSrc(n, r)
				return n
			}
			gv := asVal(terms[0])
			if r.ON > 0 {
				gv.setPos(r.O0.SI)
			}
			return gv
		}
		// `a:()` — grouping parens with nothing inside.
		return incompleteNil(r)
	}
	return newNil("unknown_op")
}

func negate(t any) Val {
	switch v := t.(type) {
	case float64:
		return numberVal(negZero(-v), "", -1)
	case *ScalarVal:
		switch v.kind {
		case KindInteger:
			i := v.peg.(int64)
			if i == math.MinInt64 {
				// -(-2^63) leaves the int64 range, so it cannot stay
				// integer kind; widen to a float rather than wrapping.
				// (No literal can express -2^63 as an integer, so this
				// is only reachable through the NewInteger API.)
				return newFloat(-float64(i))
			}
			// int64 has no negative zero, so -0 cannot arise here.
			return newInteger(-i)
		case KindFloat:
			return newFloat(negZero(-v.peg.(float64)))
		case KindBigInteger:
			// big.Int has no negative zero, so -0d0 is 0d0 for free.
			return withSrc(newBigInteger(new(big.Int).Neg(v.peg.(*big.Int))), negSrc(v.src))
		case KindBigDecimal:
			return withSrc(newBigDecimal(v.peg.(*Decimal).neg()), negSrc(v.src))
		}
	}
	return newNil("negative")
}

// negZero normalises negative zero to positive zero. Negative zero never
// survives into the AST: unary minus applied to a zero of either kind
// yields positive zero.
func negZero(f float64) float64 {
	if f == 0 {
		return 0
	}
	return f
}

func toVals(terms []interface{}) []Val {
	out := make([]Val, len(terms))
	for i, t := range terms {
		out[i] = asVal(t)
	}
	return out
}

const maxNodeDepth = 10000

func valTreeDepth(v Val) int {
	type item struct {
		v Val
		d int
	}
	stack := []item{{v, 1}}
	maxd := 0
	for len(stack) > 0 {
		it := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if it.d > maxd {
			maxd = it.d
			if maxd > maxNodeDepth {
				return maxd
			}
		}
		switch n := it.v.(type) {
		case *MapVal:
			for _, k := range n.keys {
				stack = append(stack, item{n.peg[k], it.d + 1})
			}
			if n.spread != nil {
				stack = append(stack, item{n.spread, it.d + 1})
			}
		case *ListVal:
			for _, e := range n.peg {
				stack = append(stack, item{e, it.d + 1})
			}
			if n.spread != nil {
				stack = append(stack, item{n.spread, it.d + 1})
			}
		case *ConjunctVal:
			for _, t := range n.peg {
				stack = append(stack, item{t, it.d + 1})
			}
		case *DisjunctVal:
			for _, t := range n.peg {
				stack = append(stack, item{t, it.d + 1})
			}
		case *PlusOpVal:
			for _, t := range n.peg {
				stack = append(stack, item{t, it.d + 1})
			}
		case *FuncVal:
			for _, a := range n.peg {
				stack = append(stack, item{a, it.d + 1})
			}
		case *PrefVal:
			stack = append(stack, item{n.peg, it.d + 1})
		}
	}
	return maxd
}

// asVal converts a parsed jsonic node into a Val. Containers are
// converted recursively; map order comes from the order sentinel.
func asVal(node any) Val { return asValDepth(node, 0) }

func isElidedNode(v any) bool {
	if v == nil {
		return true
	}
	if jsonic.IsUndefined(v) {
		return true
	}
	return false
}

func listOfRaw(n []any, depth int) *ListVal { return listOfRawAt(n, depth, -1) }

func listOfRawAt(n []any, depth int, sp int) *ListVal {
	lv := &ListVal{}
	for _, e := range n {
		if ls, ok := e.(*listSpread); ok {
			if lv.spread == nil {
				lv.spread = ls.val
			} else {
				lv.spread = mergeVals(lv.spread, ls.val)
			}
			continue
		}
		if e == nil {
			en := newNil("elided_value")
			en.sp = sp
			lv.peg = append(lv.peg, en)
			continue
		}
		lv.peg = append(lv.peg, asValDepth(e, depth+1))
	}
	return lv
}

func asValDepth(node any, depth int) Val {
	if depth > maxNodeDepth {
		return newNil("max_depth")
	}
	switch n := node.(type) {
	case Val:
		return n
	case *jsonic.ListRef:
		// An empty expression wrapper is an elided value (`a?:` with
		// nothing after the colon) — null, like a plain `a:`.
		if len(n.Val) == 0 && n.Child == nil {
			return newNull()
		}
		// A top-level expression is returned as an unevaluated expr
		// wrapper; evaluate it (map-value expressions are already
		// evaluated during parse). Snip any cyclic dangling-operator
		// back-edges first (see the expr rule action in makeLang).
		return asValDepth(expr.Evaluation(nil, nil, snipExprCycles(n), evaluate), depth+1)
	case map[string]any:
		dv, carried := n[dataValKey].(Val)
		if carried {
			if _, parsed := n[orderKey]; !parsed {
				return dv
			}
		}
		mv := newMap()
		if sp, ok := n[spreadKey]; ok {
			mv.spread = sp.(Val)
		}
		if opt, ok := n[optionalKey].([]string); ok {
			mv.optional = opt
		}
		if ak, ok := n[aliasKeysKey].([]string); ok {
			mv.aliasKeys = ak
		}
		if ek, ok := n[exportKeysKey].([]string); ok {
			mv.exportKeys = ek
		}
		if p, ok := n[posKey].(int); ok {
			mv.sp = p
		}
		if t, ok := n[srcKey].(string); ok {
			mv.setSrctext(t)
		}
		if n[elidedSpreadKey] == true {
			en := newNil("elided_value")
			en.sp = mv.sp
			return en
		}
		refused := map[string]keyRefusal{}
		if krs, ok := n[keyRefusalsKey].([]keyRefusal); ok {
			for _, kr := range krs {
				refused[kr.key] = kr
			}
		}
		ord, _ := n[orderKey].([]string)
		for _, k := range ord {
			// Skip an order entry with no value: the multisource mark "@"
			// is recorded in order but injects its content under real keys.
			v, ok := n[k]
			if !ok {
				// A refused key has no value; the refusal still stands.
				if kr, bad := refused[k]; bad {
					en := newNil(kr.why)
					en.sp = kr.sp
					en.setSrctext(kr.src)
					mv.set(k, en)
				}
				continue
			}
			if kr, bad := refused[k]; bad {
				en := newNil(kr.why)
				en.sp = kr.sp
				en.setSrctext(kr.src)
				if nil != kr.details {
					en.details = kr.details
				}
				mv.set(k, en)
				continue
			}
			if isElidedNode(v) {
				en := newNil("elided_value")
				en.sp = mv.sp
				mv.set(k, en)
				for i, ok := range mv.optional {
					if ok == k {
						mv.optional = append(mv.optional[:i], mv.optional[i+1:]...)
						break
					}
				}
				continue
			}
			mv.set(k, asValDepth(v, depth+1))
		}
		if carried {
			// A ROOT include whose value is not a map, merged into the
			// map that holds the directive: the two cannot meet.
			return makeNilErr(nil, "map", mv, dv)
		}
		// What a destructure head stood in front of, placed as an
		// include places it.
		ims, _ := n[importMergeKey].([]Val)
		var out Val = mv
		for _, iv := range ims {
			out = mergeVals(out, iv)
		}
		return out
	case []any:
		if 0 < len(n) {
			if op, ok := n[0].(*expr.Op); ok {
				return asValDepth(evaluate(nil, nil, op, n[1:]), depth+1)
			}
		}
		// Reached only by lists that skipped the list rule (implicit
		// top-level lists, evaluated expr slices); braced lists are
		// already ListVals via wrapList. No position, as in TS rawToVal.
		return listOfRaw(n, depth)
	case float64:
		return numberVal(n, "", -1)
	case string:
		return newString(n)
	case bool:
		return newBoolean(n)
	}
	return newNil("parse_unknown")
}

func findConflictMarker(src string) int {
	offset := 0
	for _, rawline := range strings.Split(src, "\n") {
		// A CRLF source leaves the \r on the line; it is not part of the run.
		line := strings.TrimSuffix(rawline, "\r")
		if len(line) > 0 {
			c := line[0]
			if '<' == c || '=' == c || '>' == c {
				run := 0
				for run < len(line) && line[run] == c {
					run++
				}
				if 7 == run && (7 == len(line) || ' ' == line[7]) {
					return offset
				}
			}
		}
		offset += len(rawline) + 1
	}
	return -1
}

func toValidSource(src string) string {
	if utf8.ValidString(src) {
		return src
	}
	return strings.ToValidUTF8(src, "�")
}

// aliasHoistMetaKey holds the sink for value-prefix alias declarations
// (`a: %x = 1`), which declare at the document root. See ALIASES.0.md.
const aliasHoistMetaKey = reservedKeyPrefix + "aliashoist"

type aliasHoist struct {
	name string
	node any
}

type aliasHoistSink struct{ entries []aliasHoist }

func addAliasHoist(ctx *jsonic.Context, name string, node any) {
	if sink, ok := ctx.Meta[aliasHoistMetaKey].(*aliasHoistSink); ok {
		sink.entries = append(sink.entries, aliasHoist{name: name, node: node})
	}
}

func recordAliasHoist(r *jsonic.Rule, ctx *jsonic.Context) {
	if name, ok := r.U["aontu_alias_val"].(string); ok {
		addAliasHoist(ctx, aliasScopedKey(name, srcURL(ctx)), r.Node)
	}
}

// placeAliasHoists puts each value-prefix declaration on the root map as
// a copy pathed at its name, exactly as a file-level declaration sits.
func placeAliasHoists(out any, sink *aliasHoistSink) {
	m, ok := out.(map[string]any)
	if !ok || 0 == len(sink.entries) {
		return
	}
	ord, _ := m[orderKey].([]string)
	ak, _ := m[aliasKeysKey].([]string)
	for _, e := range sink.entries {
		v := instanceClone(asVal(e.node), []string{e.name})
		if prev, seen := m[e.name]; seen {
			m[e.name] = mergeVals(asVal(prev), v)
		} else {
			m[e.name] = v
			ord = append(ord, e.name)
		}
		if !slices.Contains(ak, e.name) {
			ak = append(ak, e.name)
		}
	}
	m[orderKey] = ord
	m[aliasKeysKey] = ak
}

func parseWithTrust(src, base, file string, trust *trustSink) (Val, error) {
	src = toValidSource(src)

	if off := findConflictMarker(src); off >= 0 {
		return newMap(), conflictError(src, file, off)
	}

	lang, err := langForBase(base)
	if err != nil { //coverage:ignore langForBase cannot fail — see makeLang
		return newMap(), &AontuError{Msg: err.Error(), Code: "parse"}
	}
	sink := &notFoundSink{}
	hoists := &aliasHoistSink{}
	meta := map[string]any{notFoundMetaKey: sink, aliasHoistMetaKey: hoists}
	if nil != trust {
		meta[trustMetaKey] = trust
	}
	if "" != file {
		meta["fileName"] = file
	}

	out, err := lang.ParseMeta(src, meta)

	if nil != trust && "" != trust.denied {
		return newMap(), &AontuError{Msg: trust.denied, Code: "include_denied"}
	}

	if nil != trust && "" != trust.modCode {
		return newMap(), &AontuError{Msg: trust.modMsg, Code: trust.modCode}
	}

	if "" != sink.msg {
		return newMap(), &AontuError{Msg: sink.msg, Code: sink.code}
	}

	if err != nil {
		return newMap(), syntaxError(err, src)
	}
	if out == nil {
		return newMap(), nil
	}
	placeAliasHoists(out, hoists)
	root := asVal(out)
	if valTreeDepth(root) > maxNodeDepth {
		n := newNil("max_depth")
		return newMap(), &AontuError{Msg: n.FullMessage(src, file, nil), Code: "max_depth"}
	}
	setPaths(root, []string{})
	return root, nil
}

// conflictError is the refusal of a version-control conflict marker at
// byte offset off. The marker's row and column ride along: the
// canonical port puts them on the refusal's site, and the validation
// verb reports them (vet.go).
func conflictError(src, file string, off int) *AontuError {
	n := newNil("merge_conflict")
	n.sp = off
	row, col := rowCol(src, off)
	return &AontuError{
		Msg:  n.FullMessage(src, file, nil),
		Code: "merge_conflict",
		Row:  row,
		Col:  col,
	}
}

func syntaxError(err error, src string) *AontuError {
	row, col := -1, -1
	if je, ok := err.(*jsonic.JsonicError); ok {
		row, col = je.Row, je.Col
	}
	return &AontuError{
		Msg:  err.Error() + opCharHint(src),
		Code: "syntax",
		Row:  row,
		Col:  col,
	}
}

func opCharHint(src string) string {
	q := byte(0)
	for i := 0; i < len(src); i++ {
		c := src[i]
		if 0 != q {
			if c == q && (0 == i || '\\' != src[i-1]) {
				q = 0
			}
			continue
		}
		if '"' == c || '\'' == c || '`' == c {
			q = c
		} else if '<' == c || '>' == c {
			return "\nThe > and < characters are not aontu operators: write the " +
				"bound functions min(x), max(x), above(x), below(x) instead."
		}
	}
	return ""
}

func buildCall(r *jsonic.Rule, name string, argterms []any) Val {
	if !funcSet[name] {
		n := newNil("unknown_function")
		if r.ON > 0 {
			n.sp = r.O0.SI
		}
		stampSrc(n, r)
		return n
	}

	if ar, known := funcArity[name]; known {
		got := writtenArgCount(argterms)
		if got < ar[0] || (-1 != ar[1] && got > ar[1]) {
			n := newNil("func_arity")
			n.details = map[string]string{
				"func": name,
				"want": arityText(ar[0], ar[1]),
				"got":  itoa(got),
			}
			if r.ON > 0 {
				n.sp = r.O0.SI
			}
			stampSrc(n, r)
			return n
		}
	}

	terms := argterms
	if positionalArgFuncs[name] && 1 == len(terms) {
		if raw, ok := terms[0].([]any); ok {
			terms = raw
		}
	}
	args := make([]Val, 0, len(terms))
	for _, t := range terms {
		args = append(args, asVal(t))
	}

	sp := -1
	if r.ON > 0 {
		sp = r.O0.SI
	}

	if constraintAtoms[name] {
		cv := newConstraint(name, args, sp)
		stampSrc(cv, r)
		return cv
	}

	fv := newFunc(name, args)
	if r.ON > 0 {
		fv.sp = r.O0.SI
		stampSrc(fv, r)
	}
	return fv
}
