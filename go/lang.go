/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	expr "github.com/tabnas/expr/go"
	jsonic "github.com/tabnas/jsonic/go"
	multisource "github.com/tabnas/multisource/go"
	path "github.com/tabnas/path/go"
)

// The parser is built on the Go ports of the @tabnas parser stack
// (@tabnas/jsonic and its expr and path plugins) — the same stack the
// canonical TypeScript parser (ts/src/lang.ts) uses. This keeps syntax in
// parity instead of maintaining a divergent hand-written parser.
//
// Construction model (important): the Go jsonic port emits plain Go
// values (map[string]any, []any, float64, string, bool, nil) and shares
// the node reference between the `val` and `map` rules, so replacing a
// map node in the `map` rule does not propagate upward. We therefore:
//   1. wrap scalar leaves into Vals in the `val` rule (capturing the
//      source byte offset for error ordering),
//   2. record key order on each map via a sentinel entry in the `pair`
//      rule (Go maps are unordered, unlike JS objects), and
//   3. convert map[string]any -> MapVal and []any -> ListVal in a final
//      post-walk (asVal).
//
// The grammar layers the expr operators (& | * $ . +), the path plugin,
// custom rules for &: spreads and a?: optional keys, and the multisource
// plugin for @"file" loading — the same stack and order as ts/src/lang.ts.

// orderKey is the sentinel map entry holding insertion order, spreadKey
// holds the &: spread value. The reserved prefix keeps them from
// colliding with real keys; a source key carrying the prefix is rejected
// (see trackOrder) rather than silently corrupting the map. (The TS
// implementation stores this state under a Symbol, so it is immune; this
// guard keeps the Go behaviour safe for the same exotic input.)
const reservedKeyPrefix = "\x00aontu_"
const orderKey = reservedKeyPrefix + "order"
const spreadKey = reservedKeyPrefix + "spread"
const optionalKey = reservedKeyPrefix + "optional"

// aliasKeysKey is the sentinel holding this map's ALIAS DECLARATIONS
// -- `%name:` pairs, which bind a file-local name and are not fields
// of the document. Twin of aontu_alias_keys in ts/src/lang.ts.
const aliasKeysKey = reservedKeyPrefix + "aliaskeys"
const posKey = reservedKeyPrefix + "pos"

// srcKey rides beside posKey: the map rule's open-token SOURCE TEXT,
// lifted onto the MapVal by asValDepth. The position alone locates the
// `{`; the text is what gives it an extent (base.srclen, ts/src/site.ts).
const srcKey = reservedKeyPrefix + "src"

// elidedSpreadKey marks a map whose `&:` spread was written with no
// value (issue #48). A bool rather than a Val: nothing can be stored
// under spreadKey to carry it, since a spread with no value is exactly
// what is missing.
const elidedSpreadKey = reservedKeyPrefix + "elidedspread"

// theLang is the default parser (base ""), resolving relative @"file"
// loads from the process working directory.
//
// Built LAZILY, on first use, rather than as a package variable: the
// module leg of the resolver (G6 phase 2, mod.go) evaluates a module to
// verify it, and evaluation reaches this parser — a package-variable
// initialiser would be a static initialisation cycle through the very
// resolver it installs. Once, so the parser is still built exactly one
// time however many goroutines ask for it first.
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

// langCache memoises base -> parser. multisource resolves a top-level
// load's relative path against opts.Path, which is fixed when the plugin
// is applied, so each distinct non-empty entry base needs its own parser.
// (Nested loads inside a loaded file are rebased per-file by multisource
// itself, via the jsonic context meta.)
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
	// Bound memory in long-running hosts (e.g. the LSP) that may resolve
	// many distinct bases over their lifetime: once the cache is full,
	// stop adding rather than growing without limit. Bases past the cap
	// are rebuilt per call (slower) but never leak.
	if len(langCache) < maxLangCache {
		langCache[base] = j
	}
	return j, nil
}

func boolPtr(b bool) *bool { return &b }

func mustMakeLang(base string, resolver multisource.Resolver) *jsonic.Jsonic {
	j, err := makeLang(base, resolver)
	// makeLang's only error sources are its three plugin registrations,
	// which take compile-time literal options and ignore the base — and
	// this very call already succeeds at package init.
	if err != nil { //coverage:ignore plugin registration cannot fail
		panic("aontu: jsonic grammar setup failed: " + err.Error())
	}
	return j
}

// inElem reports whether this val rule was pushed from a LIST ELEMENT.
//
// An optional key is not a list element. The same pair WITHOUT the `?` --
// `a:[x:1]` -- is already discarded by both ports, because a key:value
// pair is simply not an element; adding `?` must not turn a discarded pair
// into a materialised one. It did here, purely because the optional form
// reached the `val` rule's dive alts while the plain form never does.
//
// The canonical port avoids this a different way, by intercepting
// OPTKEY+QM in the `elem` rule itself (the aontu-optional-key-elem alt in
// ts/src/lang.ts) so `val` never sees it. Guarding the dive is the smaller
// change here and keeps the two grammars' shapes recognisable.
//
// Worth naming what the bug actually cost: the phantom element MERGED with
// a real one, so `a:[x?:1] a:[{q:9}]` generated {"q":9,"x":1} -- content
// injected into a neighbouring element, not merely a stray entry.
func inElem(r *jsonic.Rule) bool {
	return r != nil && r.Parent != nil && "elem" == r.Parent.Name
}

// makeLang builds the aontu parser for an include base and a resolver:
// fileResolver for evaluation, and the formatter's memory stub (format.go),
// which answers every include with nothing because the formatter reads the
// file it is given and no other.
func makeLang(base string, resolver multisource.Resolver) (*jsonic.Jsonic, error) {
	j := jsonic.Make(jsonic.Options{
		// Brand parse errors as aontu's, exactly as ts/src/lang.ts does
		// with `errmsg: { name: 'aontu', suffix: false }`. Without it a
		// syntax error reached the user marked `[jsonic/unexpected]`,
		// naming a dependency the reader never chose, where the canonical
		// engine says `[aontu/unexpected]` (issue #32, family 1).
		ErrMsg: &jsonic.ErrMsgOptions{
			Name:   "aontu",
			Suffix: false,
		},
		// Aontu's own text for the two parse hints, replacing the
		// parser's defaults — the same two, with the same wording, that
		// ts/src/lang.ts sets through `jsonic.options({hint:{...}})`.
		// Without them a Go syntax error explained itself in the
		// parser's terms ("do not match any rule alternative active at
		// this position") where the canonical engine explains itself in
		// the user's, and points at the `#` comment character as the way
		// to bisect the problem (issue #50).
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
		// Only # line comments are valid Aontu syntax (see
		// docs/reference-language.md; ts/src/lang.ts sets the same).
		// Def MERGES with the parser's defaults (#, //, /* */) rather
		// than replacing them, so the slash and multi markers have to
		// be removed explicitly — a nil def is the removal marker.
		// ts/src/lang.ts achieves the same by first clearing with
		// `comment: { def: null }`.
		Comment: &jsonic.CommentOptions{
			Lex: boolPtr(true),
			Def: map[string]*jsonic.CommentDef{
				"hash":  {Line: true, Start: "#"},
				"slash": nil,
				"multi": nil,
			},
		},
		// A PAIR INSIDE A LIST IS A SINGLE-KEY MAP ELEMENT:
		// `[a:1, b:2]` is `[{a:1}, {b:2}]` (ts/src/lang.ts builds the
		// element in its elem bc). The option routes the pair into the
		// list as a raw `map[string]any{key: val}`; elemSpread then
		// stamps aontu's sentinels onto it (order, position, source)
		// so asValDepth converts it exactly as a braced map converts.
		List: &jsonic.ListOptions{Pair: boolPtr(true)},
		// See tsTextCheck: unquoted text must run through quote chars
		// (`x:tail` + "`" is the text "tail`"), as in the TS lexer.
		Text: &jsonic.TextOptions{Check: tsTextCheck},
		// See tsNumCheck: a numeric prefix of a larger text token is
		// not a number ("100'sq'" is one text token), as in TS.
		Number: &jsonic.NumberOptions{
			// Sep must be restated: passing any NumberOptions with an
			// empty Sep DISABLES separators ("Empty string disables" —
			// the strict-JSON grammars depend on that), so this struct
			// had turned them off and `1_000` unified to the STRING
			// "1_000" while the TS port (whose option merge keeps the
			// default) gave 1000. Caught by test/spec/engine-parity.tsv.
			Sep: "_",
			// See sepInvalid: a separator is legal only as a SINGLE
			// separator BETWEEN digits, and the engine's matcher leaves
			// two gaps (`1__0`, `0x_ff`). Exclude is the exact analogue
			// of the TS `number.exclude` RegExp — same matched source,
			// same "decline the whole run to text" outcome.
			Exclude: numberExcluded,
			Check:   tsNumCheck,
		},
		Value: &jsonic.ValueOptions{
			Lex: boolPtr(true),
			Def: map[string]*jsonic.ValueDef{
				"string": kindDef(KindString),
				// `number` is the numeric SUPERTYPE (it admits any
				// numeric leaf); `float` names the binary64 leaf that
				// `number` used to name. See scalar.go's Kind lattice.
				"number":     kindDef(KindNumber),
				"integer":    kindDef(KindInteger),
				"float":      kindDef(KindFloat),
				"biginteger": kindDef(KindBigInteger),
				"bigdecimal": kindDef(KindBigDecimal),
				"boolean":    kindDef(KindBoolean),
				// The `0d` exact literal (D3). A regex value def with
				// Consume claims the whole run — INCLUDING a `.` — from
				// the full forward source, so it wins over both the
				// number matcher (which declines `0d…` as not fully
				// numeric) and the dot token that would otherwise split
				// `0d1.5` into a path reference. See exactLiteralRe.
				// THE ALIAS SIGIL (docs/design/ALIASES.0.md §4). `%` is
				// part of an alias's name, so the name is one lexeme
				// wherever it appears and its meaning is decided by
				// POSITION: a binding in key position (`%uint8: …`
				// declares), a use in value position (`listen: %uint8`
				// refers). Consume claims the run whole for the same
				// reason the exact literal below does -- the text
				// matcher's ender set would otherwise carve the `%` off
				// and leave a bare `uint8`, which is precisely the
				// capture the sigil exists to prevent.
				//
				// A key is taken from the token's SOURCE, so one lexeme
				// serves both positions. Mirrors the alias arm of the
				// text check hook in ts/src/lang.ts.
				"alias": {
					Match:   aliasRe,
					Consume: true,
					ValFunc: func(m []string) any {
						name := m[0]
						return jsonic.TokenValFunc(func(r *jsonic.Rule, _ *jsonic.Context) any {
							// AN ALIAS REFERENCE IS A PATH REFERENCE:
							// `%uint8` is `$.%uint8`, root-absolute and
							// one segment. Order independence,
							// alias-of-alias, redeclaration unifying and
							// cycle refusal spanning both namespaces are
							// then the reference machinery the language
							// already has, not a second resolver.
							rv := newRef([]any{name}, false)
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
				"top": valDef(func(sp int) Val { t := top(); t.sp = sp; return t }),
				// G8 phase 3: the placeholder. A BARE `_` is the hole;
				// `"_"` quoted, and any longer bare word containing it,
				// stay text. Reserving it is a breaking change, pinned
				// by place.tsv. Mirrors ts/src/lang.ts.
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
				// A new key (prev == nil) has nothing to unify — take the
				// value as-is. (asVal(nil) is an empty MapVal, so merging
				// would wrongly yield `{} & val`.) tabnas's multisource calls
				// this for every key of a top-level @"file" load, including
				// new ones, so this guard is required for source loading.
				if prev == nil {
					return val
				}
				// A BOOKKEEPING ENTRY, not a source value: combine it
				// structurally rather than unifying it as a Val (issue #3).
				//
				// multisource's mergeIntoParent copies the loaded file's map
				// node into the host node ONE KEY AT A TIME through this
				// function, and the loaded node carries the same reserved
				// sentinel entries every aontu map node carries. Unifying
				// those turned the host's `[]string` order list into a
				// ConjunctVal, so asValDepth's `n[orderKey].([]string)`
				// assertion failed, the order list read back empty, and
				// EVERY key of the host map vanished -- `a:1 @"f" c:3`
				// generated `{"c":3}` (only the pairs after the include, which
				// re-seeded a fresh list) where TypeScript generates all three.
				//
				// Dispatch is by TYPE because jsonic's merge hook is not given
				// the key. It is unambiguous: a parsed source value is never a
				// `[]string` (jsonic list nodes are `[]any`), so this arm is
				// reachable only from orderKey and optionalKey, the two
				// sentinels that hold one.
				//
				// The other two sentinels need no arm. spreadKey holds a Val
				// and wants exactly the ordinary conjunct merge below, which is
				// what it gets. posKey never REACHES this hook with a prev to
				// merge against: recordMapPos is an after-close action, so the
				// host map is stamped only once its own rule closes, which is
				// always after an include nested in it has merged -- prev is
				// nil there and the guard above returns the loaded value, which
				// recordMapPos then overwrites unconditionally. (Confirmed by
				// panicking in an arm for it: no include shape reaches it.)
				if pl, ok := prev.([]string); ok {
					if vl, ok := val.([]string); ok {
						return appendNew(pl, vl...)
					}
					return prev
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
			"addition": map[string]interface{}{"infix": true, "src": "+", "left": 20000000, "right": 21000000},
			// Re-base unary minus for the same reason. Every aontu
			// operator sits far above the @tabnas/expr defaults, so the
			// default prefix binding power (4000000) left unary `-`
			// LOOSER than every infix operator: `-5 & integer` parsed as
			// `-(5 & integer)`, whose operand is an unresolved
			// ConjunctVal, which negate() rejects — so every such
			// expression collapsed to a `negative` nil (likewise `-2+3`,
			// `-1|2`). Unary minus must bind TIGHTER than `+`, `&` and
			// `|`: 22000000 sits above addition (20/21M) and below star
			// / dot-prefix (24M), so `-0xFF.5` still parses as
			// `-(0xFF.5)`.
			//
			// Unary plus is raised with it. positive-prefix is the
			// identity in both ports, so its binding power is not
			// observable either way; the entry exists so the two op
			// tables are literally the same table, and a reader diffing
			// them never has to work out whether a difference matters.
			"negative": map[string]interface{}{"prefix": true, "src": "-", "right": 22000000},
			"positive": map[string]interface{}{"prefix": true, "src": "+", "right": 22000000},
			// Replace the default grouping paren with a preval-active
			// function paren: `name(args)` is a call, `(expr)` is grouping.
			"plain": nil,
			// Disable the default arithmetic infix ops (mirrors
			// ts/src/lang.ts): only + is an Aontu operator. With these
			// removed, / and % are plain text chars (`a:6/2` is the bare
			// string "6/2") and infix - and * are syntax errors.
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

	// A dangling operator at end of input (`a:1&`, `a:$`, `a:.`) makes
	// the pinned @tabnas/expr Go port build a self-referential term: the
	// expression slice contains its own ListRef wrapper. Its recursive
	// evaluation (run in the expr rule's own after-close action) would
	// then recurse forever — a fatal, unrecoverable stack overflow. The
	// TS plugin instead drops such unfilled terms. Prepend an action
	// that snips the back-edges first, restoring the TS shape; the
	// evaluate() guards below then map any now-missing operand to an
	// `incomplete_expression` nil (mirroring ts/src/lang.ts).
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

	// expr: a `&` followed by `:` after an expression value belongs to
	// the enclosing map as a spread, not to the expression as a conjunct
	// — backtrack both tokens so the expression completes (and
	// evaluates) and the map's spread alts take over. This makes infix
	// expressions before a spread parse (`zz:-2.5+-2.5 &:string`),
	// matching the expr-rule close alt in ts/src/lang.ts. The
	// expr-counter reset mirrors the plugin's own expr-end alts, whose
	// evaluation after-close only runs at counter zero.
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

	// val: a leading `&:` is an implicit spread map (a:&:{x:1}); push to
	// map without consuming. Otherwise wrap scalar leaves into Vals.
	// An optional key at the top level (`a?:1` with no braces) needs the
	// val rule to dive into a map on seeing `key ?`, with a fresh node
	// so the descended map does not share the parent's node object
	// (mirrors the two OPTKEY,QM val alts in ts/src/lang.ts).
	freshMapNode := func(r *jsonic.Rule, _ *jsonic.Context) { r.Node = map[string]any{} }

	j.Rule("val", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependOpen(
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
	})

	// map: a leading `&:` pushes to pair without consuming; `key ?` is
	// an optional-key pair (for the top-level `a?:1` dive from val).
	// On close, a `&:` bubbles up (mirrors the map close in
	// ts/src/lang.ts) so a sibling spread after an implicit colon-chain
	// map reattaches at the right level (see the pair close alts).
	j.Rule("map", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependOpen(
			// N pk:1 — the implicit map created for a `&:`-led pair value
			// must carry the pair-key depth counter, as the map created
			// for `q:a:1` does. TS reaches this map through jsonic's
			// implicit-map val alt, which sets pk; Go reaches it through
			// THIS alt, which did not — so at the spread pair's close pk
			// read 0, the keep-closing-until-pk=0 alt never fired, and
			// the unconditional continue-pair fallback swallowed the next
			// top-level pair into the spread's map: `q:&:{k:1} q:a:2`
			// grew a nested "q" inside q. Traced by diffing r.n at map-BO
			// across ports: TS {dmap:2,pk:1}, Go {dmap:2}.
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, P: "pair", B: 2, N: map[string]int{"pk": 1}, G: "spread"},
			&jsonic.AltSpec{S: [][]jsonic.Tin{optkey, {qm}}, P: "pair", B: 2, G: "optional"},
		)
		rs.PrependClose(
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, B: 2, G: "spread"},
		)
		rs.AddAC(recordMapPos)
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
			// A following `&:` starts a sibling spread pair in the
			// current map: directly inside a braced map (pk<=0) at any
			// depth, or in the implicit top-level map (dmap<=1). Inside
			// an implicit colon-chain map (pk>0) it bubbles up instead
			// (second alt), so `&:k:a &:p:2` yields two sibling spreads
			// on the enclosing map, not a spread nested in the first
			// spread's template (mirrors the pair close in ts/src/lang.ts).
			&jsonic.AltSpec{
				S: [][]jsonic.Tin{{cj}, {cl}},
				C: func(r *jsonic.Rule, _ *jsonic.Context) bool {
					return r.N["pk"] <= 0 || r.N["dmap"] <= 1
				},
				R: "pair", B: 2, G: "spread",
			},
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, B: 2, G: "spread"},
		)
		rs.AddAC(trackOrder)
	})

	// elem: a `&:value` list element is a spread; jsonic appends it as a
	// normal element, so replace it with a marker that asVal extracts.
	j.Rule("elem", func(rs *jsonic.RuleSpec, _ *jsonic.Parser) {
		rs.PrependOpen(
			&jsonic.AltSpec{S: [][]jsonic.Tin{{cj}, {cl}}, P: "val", U: map[string]any{"spread": true}, G: "spread"},

			// An optional key in LIST position is consumed here and
			// contributes NO element, mirroring the two
			// aontu-optional-*-elem alts in ts/src/lang.ts.
			//
			// Two alts, because the first has to see OPTKEY+QM to know
			// what this is, then hand the pair to `val` without letting
			// `val`'s own optional-dive fire (which is what materialised
			// a phantom {x:1} element). It backs up one token and
			// re-enters elem carrying a marker; the second alt reads that
			// marker and pushes the VALUE alone.
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

	// list: convert the raw slice into a ListVal at rule close, carrying
	// the open token's source position — exactly where and how the TS
	// grammar builds its ListVal (the list rule bc + addsite in
	// ts/src/lang.ts), so a list operand in an error frame points at its
	// `[` (issue #34).
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

func elemSpread(r *jsonic.Rule, _ *jsonic.Context) {
	// A PAIR IN LIST POSITION IS A SINGLE-KEY MAP ELEMENT (the rule
	// optional.tsv's block states; ts/src/lang.ts builds the element in
	// its elem bc). Two spellings arrive by two routes:
	//
	// The OPTIONAL pair (`[x?:1]`) is consumed by the two
	// aontu-optional-*-elem alts above, and its VALUE was pushed as the
	// last entry; it is rebuilt here into the single-key map, with the
	// key marked optional IN the element -- `[x?:1]` is `[{x?:1}]`.
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
			list[len(list)-1] = m
		}
		return
	}

	// The PLAIN pair (`[x:1]`): jsonic's ListPair option already pushed
	// `map[string]any{key: val}` as the last element; it lacks aontu's
	// sentinels (order, position, source), without which asValDepth
	// reads it as an EMPTY map. Stamp them, and an elided value
	// (`[a:]`, a raw nil in the pushed map) then refuses through the
	// same isElidedNode path a braced map's elision takes.
	if r.U["pair"] == true {
		if list, ok := r.Node.([]any); ok && 0 < len(list) {
			if m, ok := list[len(list)-1].(map[string]any); ok {
				key, _ := r.U["key"].(string)
				m[orderKey] = []string{key}
				if r.ON > 0 {
					m[posKey] = r.O0.SI
					m[srcKey] = r.O0.Src
				}
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

// recordMapPos stamps the map rule's open-token source position into
// the raw map node under the reserved posKey sentinel; asValDepth lifts
// it onto the MapVal. This is the raw-node analogue of the TS map rule
// bc's addsite (site.row/col from r.o0), so a map operand in an error
// frame points at its `{` — or, for an implicit map, at the token that
// opened it — identically in both ports (issue #34).
func recordMapPos(r *jsonic.Rule, _ *jsonic.Context) {
	m, ok := r.Node.(map[string]any)
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

// stampSrc records the open token's SOURCE TEXT on a parsed value, the
// other half of the byte offset every caller here already reads. The
// extent a site reports is derived from it (base.srclen), so this one
// call is what makes a site editable rather than merely locatable --
// see ts/src/site.ts for the full note and the corruption it prevents.
//
// NOT ScalarVal.src, which is a different field for a different job:
// that one is the literal's SPELLING, kept so `$.a.0x0` addresses the
// key `0x0`, and it is deliberately carried through operations that
// produce new values. A site span must NOT travel that way -- a value
// minted by unification occupies no source text -- so the two are
// stored apart even where a scalar literal makes them equal.
// bagIsBraceless reports a map or list that was opened WITHOUT its
// brace -- the implicit top-level map. The open token's source text is
// the discriminator: `{` or `[` for a braced bag, the first key or
// element for an implicit one. Used by the `star-prefix` guard.
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
		// The engine now saturates an overflowing literal to ±Inf (1e999
		// lexes as a NUMBER on both ports, matching JS unary +), so the
		// text-fallback branch below never sees it. A non-finite number
		// is a not_number error nil, exactly as the TS ac maps
		// !Number.isFinite (ts/src/lang.ts).
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

// The int64 range, as exact float64 bounds. -2^63 and 2^63 are both
// exactly representable as a float64; 2^63-1 is NOT (it rounds up to
// 2^63), which is why the upper bound is exclusive — and why the hex
// literal 0x7fffffffffffffff correctly falls outside the range.
const (
	int64MinFloat   = -9223372036854775808.0
	int64LimitFloat = 9223372036854775808.0
)

// isIntegerKind reports whether a numeric value has *integer* kind. All
// three conditions must hold:
//
//	(a) the source text, when there is any, contains no '.'
//	(b) the value is integral
//	(c) the value lies within the int64 range
//
// Pass src == "" at construction sites with no source text (raw values
// from an implicit top-level list, operator results); condition (a) is
// then vacuous and (b)+(c) decide.
//
// The range test is deliberately NOT written as `n == float64(int64(n))`:
// converting an out-of-range float64 to an int64 is implementation-
// dependent in Go, and that accident is exactly what used to make this
// port disagree with TypeScript about 1e21, 0x7fffffffffffffff and
// friends. Compare against the float64 bounds first, convert after.
//
// Kept in lock-step with isIntegerKind in ts/src/val/numkind.ts.
func isIntegerKind(n float64, src string) bool {
	if strings.Contains(src, ".") {
		return false
	}
	// NaN fails the Trunc test; ±Inf fails the range test. So a
	// non-finite value is never of integer kind.
	return n == math.Trunc(n) && int64MinFloat <= n && n < int64LimitFloat
}

// isExactInBinary64 reports whether an exact integer is carried EXACTLY
// by a binary64 — the single exactness question D6's sum contract and
// D7's literal rule both ask, so that a literal and a computed sum can
// never disagree about what "exact" means. (Same name, same job, in
// ts/src/val/numkind.ts.)
//
// THE RULE IS EXACTNESS, NOT MAGNITUDE. 2^124 is a power of two and so
// survives a binary64 unharmed however big it looks
// (0x10000000000000000000000000000000 is still a value); 10^20 and 10^21
// are exact too, because their odd part fits in 53 bits. What fails is
// 2^53+1, 2^63-1 (which rounds UP to 2^63) and 2^64-1 — values that
// would have to change to be stored.
//
// big.Float.SetInt is exact by construction (it takes whatever precision
// the integer needs), so Float64's reported accuracy is exactly the
// question: Exact means the conversion lost nothing. An integer too big
// for a binary64 converts to ±Inf with accuracy Above/Below, so the
// overflow case needs no separate test.
func isExactInBinary64(n *big.Int) bool {
	_, acc := new(big.Float).SetInt(n).Float64()
	return acc == big.Exact
}

// isIntegerStorable reports whether an exact integer can be held by the
// `integer` leaf: inside the int64 window AND carried exactly by a
// binary64 (D6's storage contract, applied to a computed sum in
// integerPlus).
//
// IsInt64 is exactly the R1 window: the bounds are [-2^63, 2^63) over
// the reals, and over the integers that is [-2^63, 2^63-1].
//
// The binary64 half is the parity-critical one: Go's int64 holds sums
// TypeScript's double cannot, so a test written only against the window
// would let this port store 9007199254740993 while the canonical port
// silently stored …992. Kept in lock-step with isIntegerStorable in
// ts/src/val/numkind.ts, which asks the same two questions of a bigint.
func isIntegerStorable(n *big.Int) bool {
	return n.IsInt64() && isExactInBinary64(n)
}

// pow53Float is 2^53, the magnitude at and above which a binary64 stops
// being able to hold every integer. See numberVal's D7 gate.
const pow53Float = 9007199254740992.0

// maxIntegerLiteralExponent bounds the `e<n>` exponent that
// isLossyIntegerLiteral will materialise as zeros — a scale bomb
// (`1e1000000000`) must never be expanded just to be measured.
//
// It costs nothing to decline above it: a non-zero coefficient at an
// exponent this large is beyond every finite binary64 (max ~1.8e308), so
// wrapLeaf has ALREADY turned the literal into a not_number error nil
// before numberVal is reached. (The canonical port refuses the same
// literal as lossy instead, since its lexer hands over an Infinity
// rather than declining first; both ports error, which is the
// contractual part — the message text is not, see AGENTS.md.)
const maxIntegerLiteralExponent = 400

// isLossyIntegerLiteral reports whether src is an integer-source literal
// whose exact value a binary64 cannot hold — the D7 test, mirroring
// isLossyIntegerLiteral in ts/src/val/numkind.ts.
//
// WHICH LITERALS ARE IN SCOPE. An integer-source literal is one that
// denotes an exact integer:
//
//   - plain decimal digits (`9007199254740993`), with the landed `_`
//     separator rule;
//   - a base-prefixed run (`0x…`, `0o…`, `0b…`);
//   - either of those with a NON-NEGATIVE exponent (`1e21`), which still
//     denotes an integer.
//
// Everything else is out of scope and unchanged. A '.' in the source
// makes it a float literal by R1's condition (a), so it is not an
// integer source at all; a NEGATIVE exponent (`2e-1`, `1e-400`) denotes
// a fraction — `1e-400` is exactly 0 today, a landed row — and D7 is not
// about fractions. An empty src is a construction site with no source
// text (operator results, raw implicit-list values), and D7 is about
// literals. The `0d` family never reaches here: it has its own matcher
// and its own exact leaves.
//
// The value is re-derived from the SOURCE TEXT and not read off the
// lexed float64, because that float64 is the rounded value this rule
// exists to detect: comparing it with itself would always agree.
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

// exactLiteralRe matches a `0d` exact-leaf literal (D3):
//
//	0[dD] digits [ . digits ] [ (e|E) [+-] digits ]
//
// with single `_` separators BETWEEN digits — the landed separator rule,
// spelled directly into each digit run (`[0-9](?:_?[0-9])*`), so a
// leading, trailing or repeated separator simply is not part of the
// literal.
//
// The pattern is byte-identical to BIG_LITERAL_RE in
// ts/src/val/Decimal.ts (which is kept RE2-compatible for exactly that
// reason), so the two ports cannot drift on what a literal is.
//
// THE SIGN IS NOT PART OF THE PATTERN, though it is part of the D3
// grammar: `-0d5` is the existing unary-minus prefix applied to `0d5`,
// exactly as `-1.5` already is (see negate). The canonical port must
// leave it out — its value matchers run BEFORE the fixed-token matcher,
// so a `[-+]?` there would claim the `+` of `0d1 +0d2` and silently turn
// an addition into an implicit list — and this port matches it rather
// than diverging on a pattern the design says is shared.
//
// The regex is the accept language exactly, and it is applied to the
// full forward source (ValueDef.Consume), so it claims the longest VALID
// prefix and leaves anything else to the ordinary grammar:
//
//	0d1.5   -> one literal (the fraction is claimed before the dot token
//	           can split it into a path reference)
//	0d1.    -> the literal `0d1`, then a dot token: a trailing `.` is
//	           claimed only when a digit follows
//	0d.5    -> no match (no digit after the marker), bare `0d` likewise;
//	           D3's rejected forms fall through to the ordinary grammar
//	0d-5    -> the literal never sees the `-`: the sign belongs BEFORE
//	           the prefix (`-0d5`)
//
// aliasRe matches an alias name: the sigil and an identifier. Kept
// byte-identical to ALIAS_RE in ts/src/lang.ts so the two ports cannot
// drift on what an alias name is.
var aliasRe = regexp.MustCompile(`^%[A-Za-z_][A-Za-z0-9_]*`)

var exactLiteralRe = regexp.MustCompile(
	`^0[dD]([0-9](?:_?[0-9])*)(?:\.([0-9](?:_?[0-9])*))?(?:[eE]([-+]?[0-9](?:_?[0-9])*))?`)

// exactLiteral turns the exactLiteralRe match groups (1 integer digits,
// 2 fraction digits, 3 exponent) into a constructor for the literal's
// Val, deferring only the source position (which the lexer does not know
// until the token is bound to a rule).
//
// LEAF BY SOURCE, mirroring R1's precedent (D3): digits only is a
// BIGINTEGER; a `.` or an exponent anywhere makes it a BIGDECIMAL. So
// `0d5` is a biginteger and `0d1e3` is a bigdecimal whose value happens
// to be integral — and whose canon is therefore `0d1000.0`, not
// `0d1000`, because `0d1000` would reparse as a biginteger (D4).
// negSrc rebuilds the spelling of a negated literal. `-` is a prefix
// OPERATOR and not part of the literal, so the text has to be rebuilt to
// keep src meaning "how this value is spelled" (see ScalarVal.src).
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

// exactDecimal builds a NORMALISED Decimal from already-separator-
// stripped digit runs (an empty frac or exp meaning "none"), enforcing
// D6's exactness budget. It returns an error CODE ("" on success) so
// both callers — the literal path and the NewBigDecimal API — refuse
// identically.
//
// neg is always false from the literal path: a `0d` literal carries no
// sign (the unary-minus operator handles it — see exactLiteralRe). Only
// the API, whose input is a whole signed number as text, passes true.
func exactDecimal(neg bool, intPart, frac, exp string) (*Decimal, string) {
	// The budget is enforced HERE — before any value is built, on the
	// SOURCE form: normalising `0d1e1000000000` is itself the resource
	// event the bound exists to prevent. The scale half is the
	// load-bearing one, since that literal's coefficient is one digit.
	//
	// Coefficient digits are counted AS WRITTEN, leading zeros included,
	// matching readBigLiteral in ts/src/val/Decimal.ts — the two ports
	// need not agree on any cleverer rule, and a literal padded past the
	// bound with zeros is refused in both.
	//
	// Normalisation can still fold a negative scale into the
	// coefficient, so a value that passes both bounds holds at most
	// decimalMaxCoeffDigits + decimalMaxScale + 1 digits — bounded, and
	// small enough to render.
	if len(intPart)+len(frac) > decimalMaxCoeffDigits {
		return nil, "decimal_budget"
	}

	// scale = fraction digits - exponent. Computed in big.Int because
	// the exponent is unbounded source text; the budget check below is
	// what makes it safe to narrow to int32 afterwards.
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

// stripSeps removes the digit separators from a matched digit run. The
// regex has already checked that each one sits between two digits.
func stripSeps(s string) string { return strings.ReplaceAll(s, "_", "") }

// numberVal picks an integer-kind vs a float-kind (IEEE-754 binary64)
// ScalarVal for a parsed numeric literal (mirrors ts/src/lang.ts). src
// is the literal's source text, or "" where there is none. The result is
// always a numeric LEAF: no ScalarVal ever carries the KindNumber
// supertype.
//
// D7 — A LOSSY INTEGER LITERAL IS REFUSED, NOT ROUNDED. An
// integer-source literal (decimal or base-prefixed, no '.') whose value a
// binary64 cannot hold exactly becomes a located parse-time error whose
// hint names the escape: write it as a `0d` literal, which holds it
// exactly. Refusal over corruption — `x:9007199254740993` used to
// generate …992 with no signal at all.
func numberVal(n float64, src string, sp int) Val {
	// The gate is an optimisation, not part of the rule: every integral
	// value strictly inside the 2^53 window is exact, and an inexact
	// integer literal always ROUNDS TO at least 2^53 in magnitude, so
	// isLossyIntegerLiteral could only answer true above it. Ordinary
	// numbers — every literal in a real config — therefore never touch
	// the big.Int path. (The canonical port has no such gate; it changes
	// no answer, only the work done to reach it.)
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

// trackOrder appends this pair's key to the enclosing map's insertion
// order (first occurrence wins; duplicates are merged by value).
func trackOrder(r *jsonic.Rule, _ *jsonic.Context) {
	// The enclosing map is the parent (map rule)'s node. The old engine
	// left r.Node as that map at after-close time for every pair shape;
	// the reworked engine adopts a dive pair's child value into r.Node at
	// close, so reading r.Node directly wrote the pair's key into its own
	// value map. The parent's node is the enclosing map in every shape on
	// both engines.
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
		// An elided SPREAD value (`x:$obj&:` with nothing after the
		// colon) refuses the whole map, not a key (issue #48). A spread
		// is not a child, so a refusal stored in its place has nothing
		// to attach to: `x:&:` has no children for the spread to apply
		// to, and the map would generate as `{}` with the mistake
		// silently gone. The marker is read where the map is converted,
		// which turns the container itself into the refusal.
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

	// jsonic 0.6.0 maintains the pair key on r.U["key"], exactly as the
	// TS grammar does — and it is the only correct source for a path-dive
	// pair (`q:a:{x:11}`), whose rule's O0 token is the outer key. Fall
	// back to the token only for alts that bypass jsonic's key capture.
	key, _ := r.U["key"].(string)
	if "" == key {
		key = keyOf(r.O0)
	}

	// Reject a source key in the reserved sentinel namespace: it would
	// collide with the order/spread/optional entries above and silently
	// corrupt the map. The parser's recover turns this panic into a
	// normal parse error (it never crashes the process).
	if strings.HasPrefix(key, reservedKeyPrefix) {
		panic("aontu: map key may not begin with the reserved prefix " +
			`"\x00aontu_"`)
	}

	// A DECLARATION IS A PAIR WHOSE KEY IS AN ALIAS NAME. The key TEXT
	// alone cannot be the test: a quoted `"%a": 1` is an ordinary key
	// that merely starts with the sigil, and erasing it would be wrong.
	// The TOKEN is what separates them -- a quoted key arrives as TinST,
	// the alias lexeme as the value token the alias def produced.
	//
	// Recorded on the enclosing map, never on the value, and that is the
	// point: a reference COPIES the value it resolves to, so a mark
	// riding the value would erase the referring field too. Being a
	// property of the map is also what carries it through a meet, the
	// way optional keys are carried.
	if r.O0 != nil && r.O0.Tin != jsonic.TinST && aliasRe.MatchString(key) {
		// Always recorded here; whether the map is ALLOWED to carry
		// declarations is decided on the VALUE (MapVal.Unify), not at the
		// parse. The parse cannot see it: an INCLUDED file's declarations
		// are at the root of their own text, and only once the loaded map
		// is placed does it become apparent that root is not the
		// document's. Twin of the collection in ts/src/lang.ts.
		ak, _ := m[aliasKeysKey].([]string)
		m[aliasKeysKey] = append(ak, key)
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

// appendNew appends each of add to base, skipping any entry base already
// holds — the "first occurrence wins" rule that governs both reserved
// `[]string` bookkeeping entries. Key order records where a key was FIRST
// seen (a duplicate merges into the existing entry's value rather than
// moving it), and the optional-key list is a set.
//
// Used by trackOrder for one key at a time and by the map merge hook to
// fold a loaded file's whole list into the host's (issue #3).
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

// refuseAliasSegment refuses an ALIAS NAME USED AS A PATH SEGMENT --
// `$.%foo` -- returning the nil to raise, or nil when the terms are
// clean. The alias namespace and the path namespace are disjoint: an
// alias is reached by writing `%foo` and only that.
//
// The engine spells an alias reference AS a root reference to the
// declaration, which is what gives it order independence and a cycle
// check shared with paths -- but that is an implementation of the name,
// not a second way to write it. Left writable, `$.%b` inside an
// INCLUDED file would reach the includer's `%b` rather than its own,
// which is the cross-file capture the sigil exists to prevent.
//
// `%foo` lexes to the reference itself, so it arrives as a TERM rather
// than a string segment; a quoted `$."%foo"` arrives as the string.
// Both shapes are checked. Twin of the guard in ts/src/lang.ts dotRef.
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

// tsTextCheck reproduces the TS lexer's treatment of quote characters
// inside unquoted text. The TS text matcher's ender set is space, line,
// ender, fixed and comment starters — NOT string quote chars — so
// `x:tail` + "`" lexes as the text "tail`". The Go port's text matcher
// also stops at StringChars, which would then hand the stray quote to
// the string matcher (unterminated-string error). When a quote appears
// mid-text, emit the full TS-style text token here; otherwise defer to
// the default matcher (which also handles value keywords). A quote at
// the *start* of a value never reaches the text stage — the string
// matcher runs first — so string literals are unaffected.
func tsTextCheck(l *jsonic.Lex) *jsonic.LexCheckResult {
	pnt := l.Cursor()
	start := pnt.SI
	if start >= pnt.Len {
		return nil
	}

	sI, sawQuote := scanTextExtent(l, start, false)

	// No mid-text quote: the default text matcher produces the same
	// token (and handles value keywords).
	if !sawQuote || sI == start {
		return nil
	}

	msrc := l.Src[start:sI]
	tkn := l.Token("#TX", jsonic.TinTX, msrc, msrc)
	pnt.SI += len(msrc)
	pnt.CI += utf8.RuneCountInString(msrc)
	return &jsonic.LexCheckResult{Done: true, Token: tkn}
}

// scanTextExtent scans forward from start using the TS lexer's text
// ender set — space, line, ender, fixed tokens and comment starters,
// but NOT quote chars — returning the extent end and whether a quote
// char was passed through. With expo set, an exponent sign continues
// the scan (`1e-7` — number-check extents only; plain text stops at
// the fixed `-`).
func scanTextExtent(l *jsonic.Lex, start int, expo bool) (int, bool) {
	cfg := l.Config
	src := l.Src
	sI := start
	sawQuote := false
	for sI < len(src) {
		ch, chSize := utf8.DecodeRuneInString(src[sI:])
		if (cfg.SpaceLex && cfg.SpaceChars[ch]) ||
			(cfg.LineLex && cfg.LineChars[ch]) ||
			cfg.EnderChars[ch] {
			break
		}
		rest := src[sI:]
		fixed := false
		for _, fs := range cfg.FixedSorted {
			if strings.HasPrefix(rest, fs) {
				fixed = true
				break
			}
		}
		if fixed {
			// An exponent sign is part of a numeric token (`1e-7`), not
			// a fixed operator token — the TS number pattern consumes
			// it before the ender check.
			if expo && (ch == '-' || ch == '+') && sI > start && sI+chSize < len(src) {
				prev := src[sI-1]
				next := src[sI+chSize]
				if (prev == 'e' || prev == 'E') && next >= '0' && next <= '9' {
					sI += chSize
					continue
				}
			}
			break
		}
		if cfg.CommentLex {
			cmt := false
			for _, cs := range cfg.CommentLine {
				if strings.HasPrefix(rest, cs) {
					cmt = true
					break
				}
			}
			if !cmt {
				for _, cb := range cfg.CommentBlock {
					if strings.HasPrefix(rest, cb[0]) {
						cmt = true
						break
					}
				}
			}
			if cmt {
				break
			}
		}
		if cfg.StringLex && cfg.StringChars[ch] {
			sawQuote = true
		}
		sI += chSize
	}
	return sI, sawQuote
}

// tsNumCheck suppresses the number matcher when the full TS-style text
// extent at this position is not entirely numeric: the TS lexer only
// lexes a number when the whole token is one, whereas the Go port's
// matcher would take the numeric prefix ("100'sq'" must be the single
// text token "100'sq'", not the number 100 followed by 'sq').
func tsNumCheck(l *jsonic.Lex) *jsonic.LexCheckResult {
	pnt := l.Cursor()
	start := pnt.SI
	if start >= pnt.Len {
		return nil
	}
	sI, _ := scanTextExtent(l, start, true)
	if sI == start {
		return nil
	}
	if fullNumeric(l.Src[start:sI]) {
		// A base-prefixed integer beyond int64 (0xffffffffffffffff)
		// overflows the standard number matcher into a text fallback,
		// but is a finite float in JS — construct the numeric token
		// here with the JS value (big-int digits, float64 precision).
		src := l.Src[start:sI]
		// This branch builds the token itself and so never reaches the
		// Number.Exclude hook — apply the separator rule here too, or a
		// big base-prefixed literal would keep accepting `0x_...` after
		// the small ones stopped (and diverge from TS, which excludes
		// every magnitude in one place).
		if numberExcluded(src) {
			return &jsonic.LexCheckResult{Done: true, Token: nil}
		}
		s := strings.ReplaceAll(src, "_", "")
		if basedNumeric(s) {
			if _, ierr := strconv.ParseInt(s, 0, 64); ierr != nil {
				if f, ok := basedFloat(s); ok {
					tkn := l.Token("#NR", jsonic.TinNR, f, src)
					pnt.SI = sI
					pnt.CI += sI - start
					return &jsonic.LexCheckResult{Done: true, Token: tkn}
				}
			}
		}
		return nil
	}
	// Not a complete number: let the text matcher take the extent.
	return &jsonic.LexCheckResult{Done: true, Token: nil}
}

// sepInvalid reports whether a matched number source breaks the digit
// separator rule: a separator is legal only as a SINGLE separator
// BETWEEN digits (the rule test/spec/engine-parity.tsv records as the
// engine's adjudication; pinned by the sep-* rows in
// test/spec/number-model.tsv).
//
// The engine's number matcher enforces most of that already — `1_`,
// `_1`, `1_.5`, `1._5`, `1e_2`, `1e2_` all fall through to text — but
// two gaps remain: a REPEATED separator (`1__0` lexed as 10) and a
// separator at the edge of a base-prefixed digit run (`0x_ff`, `0xff_`
// lexed as 255). Both silently accept a typo as a different number, so
// the whole run is declined and lexes as text ("1__0"), exactly as `1_`
// already does.
//
// Kept in lock-step with the `number.exclude` RegExp in ts/src/lang.ts,
// which is /__|^[-+]?0[xXoObB]_|_$/. The prefix letter is matched in
// both cases so the rule does not depend on which prefix spellings the
// engine accepts.
// numberExcluded reports whether a matched number source must be
// declined by the Go engine so that it lexes as text, matching the
// canonical TypeScript engine.
//
// It used to carry a second reason, upperBasePrefix: the TS number
// matcher spelled the base prefixes lower-case only, so `0X1F` fell to
// text there while Go read 31, and Go mirrored the quirk to stay in step.
// That function documented its own exit condition -- "if the upstream
// @tabnas TypeScript lexer ever gains the upper-case spellings, delete
// this function and let BOTH engines accept them, the spec rows will fail
// loudly and say so". @tabnas/parser 0.8.3 gained them, the base-upper-*
// rows duly failed, and this is that deletion. Both engines now read
// `0X1F` as 31, exactly as JavaScript itself always has.
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

// fullNumeric reports whether src parses in its entirety as a numeric
// literal (decimal/exponent, hex/octal/binary, or with _ separators).
// An overflowing literal still counts (it becomes not_number later),
// and base-prefixed integers beyond int64 are still numeric (JS
// Number('0xffffffffffffffff') is a finite float).
func fullNumeric(src string) bool {
	s := strings.ReplaceAll(src, "_", "")
	if s == "" {
		return false
	}
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

// snipExprCycles removes cyclic back-edges from an expression tree: a
// dangling trailing operator makes the expr Go port append the
// expression's own ListRef wrapper (or slice) as its final term. Only
// true back-edges (an ancestor of the current walk) are dropped —
// legitimately shared nodes are untouched. See the expr rule action in
// makeLang.
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

// incompleteNil is the evaluate() result for an operator whose required
// operand is missing (`a:$`, `a:1+`, `a:*` — a dangling operator whose
// unfilled term was snipped). Unify surfaces it as a "Cannot resolve
// value" error, mirroring the incomplete_expression NilVal in
// ts/src/lang.ts.
func incompleteNil(r *jsonic.Rule) Val {
	n := newNil("incomplete_expression")
	if r != nil && r.ON > 0 {
		n.sp = r.O0.SI
	}
	return n
}

// evaluate builds Val nodes for the expr operators.
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

		// A PREFERENCE MARKS A VALUE, AND A BARE KEY IS NOT ONE.
		// `*a: 1` has no braces, so the prefix took the whole IMPLICIT
		// map as its operand and the document silently became
		// `*{"a":1}` -- `*a: 1, b: 2` became a one-element LIST, losing
		// `b` outright. Neither is anything the author wrote.
		//
		// The accident is confined to the first position of the implicit
		// top-level map, the only place no brace has yet committed the
		// rule to a map: `{*a: 1}` and `a: 1, *b: 2` are ALREADY parse
		// errors. A BRACED operand is untouched -- `*{x:1}` and `*[1]`
		// are the real spelling and the shared spec pins them -- and the
		// open token's own source text is what separates the two.
		// Mirrors the same guard in ts/src/lang.ts 'star-prefix'.
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
		// A refused negation is an error nil, and it must be LOCATED:
		// TS builds its own through addsite (ts/src/lang.ts), so its
		// frame points at the `-`. Go's was positionless, which left the
		// nil with neither a site nor -- once setPaths runs over it -- a
		// way to be told apart from the root (issue #39).
		// THE SITE GOES ON EVERY RESULT, not only the refused one, and
		// BOTH HALVES of it. A refused negation is an error nil and has
		// to be located (issue #39), but `negate` returns a freshly
		// allocated scalar for the ordinary case and that got neither
		// the position nor the span: `a:-1` reported column 1 -- the
		// key, because sp defaulted to 0 -- with no span at all, where
		// the canonical port's addsite records the `-` token for both.
		//
		// No shared row reported such a site, so the suite was green
		// over the divergence. Pinned now by vet-negative-literal, which
		// is what found the column half after review found the span
		// half.
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
		// Locate the variable at its `$`, exactly as the absolute-ref
		// branch above does. Without this a `$name` had no site at all,
		// so an error about one (`a:$x` with no such variable) drew its
		// frame at the start of the line -- the enclosing pair -- rather
		// than at the reference TS points to.
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
		// Source position for error frames (TS ops carry their site).
		//
		// Guarded like every sibling handler: an expression is evaluated
		// OUTSIDE any rule when it is the last member of a func-paren
		// comma group (expr.Evaluation(nil, nil, ...) in asValDepth,
		// which the NoRule sentinel at the top of this function stands
		// in for), and reading O0 there dereferenced the sentinel's
		// empty open-token slice -- a nil pointer panic that the
		// parser's recover reported as an `internal` engine defect on
		// `neq(1,1+1)`.
		if r.ON > 0 {
			ov.sp = r.O0.SI
		}
		stampSrc(ov, r)
		return ov
	case "func-paren":
		// preval injects the function name as a raw string term[0] for
		// `name(args)`; plain `(expr)` grouping has the inner Val in
		// term[0] (no name preval). So a string term[0] means a call —
		// an unrecognised name is an error, not grouping (mirrors the
		// `unknown_function` NilVal in ts/src/lang.ts func-paren).
		if len(terms) > 0 {
			if name, ok := terms[0].(string); ok {
				return buildCall(r, name, terms[1:])
			}
			// A NON-string term[0] with more terms after it is a CALL
			// whose target is not a name — `f(1)(2)`, `(1)(2)`,
			// `upper("x")(2)`. There is nothing to call, so it is the
			// same refusal an unrecognised name gets. This arm used to
			// return the LAST term, which silently discarded the call
			// and answered `2`, while TypeScript refused with
			// `unknown_function`: a schema constrained only by such a
			// construct went unchecked in Go, in both the schema and
			// the data direction (status-2026-08-21.md section 4).
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
			return asVal(terms[0])
		}
		// `a:()` — grouping parens with nothing inside.
		return incompleteNil(r)
	}
	return newNil("unknown_op")
}

// negate returns the arithmetic negation of a numeric operand. It never
// narrows the kind (an integer stays an integer, a float stays a float,
// each exact leaf stays itself) and never yields negative zero (D5:
// `-0d0` is `0d0`, `-0d0.0` is `0d0.0`). A non-numeric operand — and any
// numeric leaf not handled here — falls through to the `negative` nil
// rather than being silently mishandled.
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

// maxNodeDepth bounds asVal's recursion so pathologically deep input
// (thousands of nested {}/[]) yields a clean error instead of a fatal,
// unrecoverable Go stack overflow. Lists convert at their rule close
// (wrapList) with a per-list depth restart, so asVal's own counter no
// longer sees the full nesting; the transitive bound that keeps
// setPaths, clonePath and the unify walks stack-safe is therefore
// enforced by valTreeDepth in parseBase — an ITERATIVE scan over the
// finished tree. Real configs are orders of magnitude shallower.
const maxNodeDepth = 10000

// valTreeDepth reports the maximum nesting depth of a finished Val
// tree, iteratively — this check is what permits every later walker to
// recurse without its own guard. Bags and every wrapper that adds a
// recursion frame in those walkers count a level; the scan stops early
// once the bound is exceeded.
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

// listOfRaw builds a ListVal from a raw element slice, extracting the
// spread and optional markers the elem rule leaves behind. Shared by
// wrapList (the list rule close) and the asValDepth fallback.
// isElidedNode reports whether a raw pair value is an ELISION -- a key
// written with nothing after its colon -- rather than a value.
//
// It has three spellings, because the parser represents "nothing" three
// ways depending on which rule consumed the pair: a plain `a:` leaves a
// nil, and the optional `a?:` leaves the Undefined sentinel. Both are the
// same mistake (issue #48), and an explicit `a:null` is neither -- that
// arrives as a real ScalarVal from the `null` value def.
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

// listOfRawAt is listOfRaw with the enclosing list's source position,
// used to locate an elided element (issue #48). A raw list that never
// passed the list rule -- an implicit top-level one -- has none, as its
// TS twin rawToVal has no site either.
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
			// An elided ELEMENT (`[,]`, `[1,,2]`), refused for the same
			// reason as an elided map value (issue #48). A trailing comma
			// (`[1,]`) is not an elision and never reaches here.
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
		ord, _ := n[orderKey].([]string)
		for _, k := range ord {
			// Skip an order entry with no value: the multisource mark "@"
			// is recorded in order but injects its content under real keys.
			v, ok := n[k]
			if !ok {
				continue
			}
			if isElidedNode(v) {
				// An elided value (`a:`) is REFUSED, not made a null
				// (issue #48): a key with nothing after the colon is a
				// mistake in the source, and turning it into a value made
				// that mistake indistinguishable from a deliberate
				// `a:null`. Located at the enclosing map's own position,
				// which is where TS's addsite puts it too -- the elided
				// value has no token of its own to point at.
				//
				// A colon chain (`a: b:1`) is not an elision: its value is
				// the nested pair, which does reach the node.
				en := newNil("elided_value")
				en.sp = mv.sp
				mv.set(k, en)
				// An elided value under an OPTIONAL key stops being
				// optional. Optionality is about a value that may be
				// absent at GENERATE; it does not excuse a source that
				// stops after the colon. Left optional, the refusal is
				// dropped with the key and `a?:` generates `{}` -- a
				// silent nothing, worse than either the old null or the
				// error.
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
		return mv
	case []any:
		// An OPERATOR EXPRESSION, not a list: the head is the Op
		// descriptor and the tail its operands. Reduce it through the
		// same evaluate the parser uses, or `k2.b` in an implicit
		// top-level list became the nonsense list [nil,"k2","b"] --
		// asVal on the descriptor is a nil, and the operands trail
		// behind it. TypeScript gets this reduced by @tabnas/expr 0.5.4
		// ("stop skipping implicit-list members"); the Go port of that
		// fix still hands the raw slice over, so the reduction is done
		// here to keep the two ports agreeing (ADR-001).
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
		// Source text is unavailable here (raw values from the implicit
		// top-level list, expr operands), so the "no '.'" condition of
		// isIntegerKind is vacuous and the integral + int64-range
		// conditions decide. Routed through numberVal so this path can
		// never drift from the parsed-literal one.
		return numberVal(n, "", -1)
	case string:
		return newString(n)
	case bool:
		return newBoolean(n)
	}
	// No arm for a raw nil or the Undefined sentinel. Both used to become
	// a NullVal here -- that was the elided value (`a:`, `[,]`, `a?:`)
	// arriving -- and an elision is now refused where the container is
	// converted, which knows the key or index and the position to report
	// it at. Anything else reaching here with no value is genuinely
	// unaccounted for, and says so.
	return newNil("parse_unknown")
}

// parseBase is parse with an explicit base directory for resolving
// relative @"file" loads.
// findConflictMarker returns the byte offset of the first
// version-control conflict marker line in src, or -1 when there is none.
//
// The shape is git's, and it is matched exactly: SEVEN of `<`, `=` or `>`
// at the very start of a line, then either the end of that line or a
// space before the branch label. Requiring the run length and the line
// start is what keeps a document that legitimately writes `a:"<<<<<<<"`,
// or a row of `=` inside a string, from being refused -- the marker is
// recognised as the artifact it is, not as a suspicious character.
//
// Kept byte-identical to findConflictMarker in ts/src/aontu.ts.
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

// toValidSource replaces invalid UTF-8 in a source with U+FFFD, ONE per
// maximal invalid subpart, before anything reads it.
//
// This is where TypeScript's replacement happens too, though it never had
// to be written: Node decodes the file to UTF-16 as it reads it, so the
// engine only ever sees well-formed text. Go carried the raw bytes all
// the way to the JSON encoder, which replaced them PER BYTE at the very
// end -- so a truncated three-byte sequence (E2 82) inside a string
// generated two replacement characters where TypeScript generated one,
// and the encoder wrote them as `�` escapes where TypeScript wrote
// the character itself (issue #32, family 2).
//
// strings.ToValidUTF8 collapses a run of invalid bytes into a single
// replacement, which is the maximal-subpart rule Node's decoder follows.
// Doing it at DECODE rather than at encode also means every stage in
// between -- lexer, parser, canon, error frames -- sees the same text the
// canonical engine sees, instead of only the final output agreeing.
func toValidSource(src string) string {
	if utf8.ValidString(src) {
		return src
	}
	return strings.ToValidUTF8(src, "�")
}

// parseWithTrust is parseBase under a trust sink (G5, docs/trust.md):
// the sink carries the include capability, the warning window and the
// manifest accumulator into the resolver via the parse meta bag, and a
// recorded denial comes back as the include_denied error -- checked
// BEFORE not-found, because an escape that also failed to read must
// report as the refusal it is.
func parseWithTrust(src, base, file string, trust *trustSink) (Val, error) {
	src = toValidSource(src)

	// A version-control conflict marker is refused BEFORE the parse
	// (issue #5). None of `<`, `=` or `>` is an aontu operator, so a
	// marker line is ordinary text and `<<<<<<< HEAD` parsed happily into
	// the two-string list ["<<<<<<<","HEAD"] -- an unresolved merge became
	// a plausible document instead of an error.
	if off := findConflictMarker(src); off >= 0 {
		return newMap(), conflictError(src, file, off)
	}

	lang, err := langForBase(base)
	if err != nil { //coverage:ignore langForBase cannot fail — see makeLang
		return newMap(), &AontuError{Msg: err.Error(), Code: "parse"}
	}
	// ParseMeta, not Parse: the meta bag is this parse's private channel
	// back from the @"file" resolver, and it is how a failed load is
	// reported (see notFoundMetaKey in source.go). A fresh map per call is
	// what keeps it PER-PARSE, which matters because langForBase caches the
	// parser -- the *jsonic.Jsonic here is shared across goroutines, so
	// nothing parse-specific may be stored on it or on its options.
	// The sink is a POINTER so a failure inside a NESTED include reaches
	// this parse: the plugin gives each nested source a SHALLOW COPY of its
	// parent's meta, which carries the pointer but not later writes to a
	// plain value. See notFoundSink.
	sink := &notFoundSink{}
	meta := map[string]any{notFoundMetaKey: sink}
	if nil != trust {
		meta[trustMetaKey] = trust
	}
	// The parser names the source in its own error frames from
	// meta["fileName"] (TS passes the same through popts.path), and
	// defaults to "<no-file>" without it. parseBase had no filename to
	// give until it was threaded in, so every Go syntax error pointed at
	// `<no-file>` where the canonical engine named the file (issue #50).
	if "" != file {
		meta["fileName"] = file
	}

	out, err := lang.ParseMeta(src, meta)

	// A failed @"file" load is a parse error in TS (the multisource plugin
	// raises multisource_not_found during the parse); mirror that here.
	//
	// The meta check comes BEFORE the parse error, not after: a missing
	// include can leave the parse failing for a secondary reason, and
	// "source not found: x" is the diagnosis the user needs -- the cascade
	// is noise.
	if nil != trust && "" != trust.denied {
		return newMap(), &AontuError{Msg: trust.denied, Code: "include_denied"}
	}

	// A module that is absent, fails its pin, or nests too deep (G6
	// phase 2) is refused the same way and for the same reason: the
	// resolution cannot stand, and a bare-member module import would
	// otherwise vanish in the merge and leave a plausible,
	// silently-partial document.
	if nil != trust && "" != trust.modCode {
		return newMap(), &AontuError{Msg: trust.modMsg, Code: trust.modCode}
	}

	// The code comes from the sink, not a constant: a load can fail
	// because the source was not there or because its extension is not
	// read as Aontu source (includeKinds, source.go), and the two are
	// different diagnoses reaching parseBase through one channel.
	if "" != sink.msg {
		return newMap(), &AontuError{Msg: sink.msg, Code: sink.code}
	}

	if err != nil {
		return newMap(), syntaxError(err, src)
	}
	if out == nil {
		return newMap(), nil
	}
	root := asVal(out)
	// The transitive depth bound (see maxNodeDepth): checked ONCE here,
	// iteratively, before any recursive walker touches the tree. The
	// registered budget-class max_depth code is unchanged; only the
	// stage moved (parse instead of a nil embedded at the cut), which
	// no row pins — TS has no equivalent guard at all (its stack
	// overflows first, a documented gap).
	if valTreeDepth(root) > maxNodeDepth {
		n := newNil("max_depth")
		return newMap(), &AontuError{Msg: n.FullMessage(src, file), Code: "max_depth"}
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
		Msg:  n.FullMessage(src, file),
		Code: "merge_conflict",
		Row:  row,
		Col:  col,
	}
}

// syntaxError is a parse failure as the engine reports it. Code mirrors
// TS, whose jsonic parse errors wrap as an outer why:'parse' nil holding
// an inner why:'syntax' nil -- and it is the INNER syntax code that
// leads errs() on the thrown error, so `syntax` is the cross-port
// first-code for a source that fails to parse (pinned by error.tsv
// errc-parse-syntax).
//
// THE POSITION TRAVELS WITH IT. The parser knows exactly where it
// stopped -- it draws a caret there -- and the rendered message carried
// the only copy, so `vet --format json` reported row -1, col -1 for a
// document whose fault the human renderer located to the character. A
// machine-readable report that says "somewhere in this file" is the one
// a repair loop can do nothing with. Both fields are already 1-based
// here (tabnas.TabnasError), which is the base a site uses.
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

// opCharHint is the targeted parse hint for CUE-trained authors and
// models: `>` and `<` are not Aontu operators (the op-chars reservation
// stands), and an agent that emits `number > 0` should be redirected to
// the bound atoms, not left with a bare "unexpected character".
// Appended to a parse error's message when the source carries an
// unquoted `<` or `>`; the TS twin is opCharHint in ts/src/lang.ts,
// byte-identical text. The chars of interest are all ASCII, so a
// byte scan matches the TS code-unit scan exactly.
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
			return "\nThe > and < characters are not Aontu operators: write the " +
				"bound functions min(x), max(x), above(x), below(x) instead."
		}
	}
	return ""
}

// buildCall builds a call from a NAME and the argument terms as the
// author wrote them: the arity check, the comma-group rule and the
// raw-value conversion, stated once. The call takes its position from
// the rule's opening token, which is the function name -- `min` for
// `min(1)` -- and that is what a site should point at. Mirrors
// buildCall in ts/src/lang.ts.
func buildCall(r *jsonic.Rule, name string, argterms []any) Val {
	if !funcSet[name] {
		n := newNil("unknown_function")
		if r.ON > 0 {
			n.sp = r.O0.SI
		}
		stampSrc(n, r)
		return n
	}

	// Arity is known for every built-in, so a surplus or missing
	// argument is a mistake in the SOURCE, refused here where the author
	// can see it (issue #51). It was previously left to each function to
	// notice or not: the two ports disagreed on `upper()` and on
	// `close()`, and `min(1,2)` noticed nothing at all -- it built a
	// constraint that merely refused to generate later, with a message
	// about the map rather than about the call.
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

	// A comma group is ONE raw-slice term (writtenArgCount). For a
	// function whose arguments are distinct POSITIONS — deprecate's
	// value and record, pack's and each's data and template — the group
	// is expanded back into them here, while a written list literal,
	// already a *ListVal, stays one argument. The constraint atoms are
	// not in this set: `neq(1,2)` is one argument LIST, not two
	// positions. Mirrors ts/src/lang.ts.
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
		// The span too, as the canonical port does: a constraint's site
		// names its OPENING TOKEN -- `min` for `min(1)` -- which is
		// exactly what the row and column above already point at. Left
		// unstamped, Go reported -1 where TypeScript reported 3, and the
		// shared subsume rows caught it.
		stampSrc(cv, r)
		return cv
	}

	fv := newFunc(name, args)
	// Locate the call, as the constraint-atom branch just above already
	// does. A FuncVal left at the zero sp -- which is a REAL position,
	// the first byte of the source -- handed that position to any
	// conjunct built over it (newConjunct takes its site from its first
	// term), so `a:super(1)&integer` drew its frame at the key rather
	// than at the value (issue #41).
	if r.ON > 0 {
		fv.sp = r.O0.SI
		stampSrc(fv, r)
	}
	return fv
}
