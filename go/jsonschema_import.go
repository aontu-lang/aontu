/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE JSON SCHEMA IMPORT (G12 phase 3): a JSON Schema read into aontu
// source, checked by `vet --at $.schema --no-fill --exact-numbers`. The
// schema text is read here, not by the host's JSON parser (ADR-003), so
// a number keeps its text and is written by its value. Mirrors
// ts/src/jsonschema-import.ts.

import (
	"math/big"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// SchemaImportError is why an import could not be made.
type SchemaImportError struct {
	Class   string `json:"class"`
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path"`
}

// SchemaImportReport is the result of an import: the aontu source, what
// it could not carry, and the verdict.
type SchemaImportReport struct {
	Errors  []SchemaImportError `json:"errors,omitempty"`
	Lossy   []SchemaLoss        `json:"lossy"`
	Source  string              `json:"source"`
	Verdict string              `json:"verdict"`
}

const importMaxDepth = 1000
const importBudget = 4096

type jnum struct{ text string }
type jnull struct{}

type jobj struct {
	keys []string
	vals map[string]any
}

func (o *jobj) get(k string) any { return o.vals[k] }

func (o *jobj) has(k string) bool {
	_, ok := o.vals[k]
	return ok
}

type importRefusal struct {
	code, path, why string
}

func refuseSchema(path, why string) {
	panic(&importRefusal{code: "jsonschema_schema", path: path, why: why})
}

var importNumberRe = regexp.MustCompile(`^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?`)

func readSchemaJSON(src string) any {
	if !utf8.ValidString(src) {
		refuseSchema("#", "the schema is not JSON: the text is not well-formed Unicode")
	}
	i := 0
	if strings.HasPrefix(src, "\uFEFF") {
		i = len("\uFEFF")
	}

	fail := func(why string) {
		before := src[:i]
		line := strings.Count(before, "\n") + 1
		col := utf8.RuneCountInString(before[strings.LastIndex(before, "\n")+1:]) + 1
		refuseSchema("#", "the schema is not JSON: "+why+" (line "+
			strconv.Itoa(line)+", column "+strconv.Itoa(col)+")")
	}

	ws := func() {
		for i < len(src) && (' ' == src[i] || '\t' == src[i] ||
			'\n' == src[i] || '\r' == src[i]) {
			i++
		}
	}

	hex4 := func() rune {
		if len(src) < i+4 {
			fail("a \\u escape needs four hex digits")
		}
		n, err := strconv.ParseUint(src[i:i+4], 16, 32)
		if nil != err || strings.ContainsAny(src[i:i+4], "+-") {
			fail("a \\u escape needs four hex digits")
		}
		i += 4
		return rune(n)
	}

	str := func() string {
		i++
		var out strings.Builder
		for {
			if i >= len(src) {
				fail("the text ends inside a string")
			}
			c := src[i]
			if '"' == c {
				i++
				return out.String()
			}
			if c < 0x20 {
				fail("a control character must be escaped in a string")
			}
			if '\\' != c {
				r, size := utf8.DecodeRuneInString(src[i:])
				out.WriteRune(r)
				i += size
				continue
			}
			i++
			if i >= len(src) {
				fail("the text ends inside a string")
			}
			e := src[i]
			i++
			if k := strings.IndexByte("\"\\/bfnrt", e); 0 <= k {
				out.WriteByte("\"\\/\b\f\n\r\t"[k])
			} else if 'u' == e {
				u := hex4()
				if 0xd800 <= u && u <= 0xdbff && strings.HasPrefix(src[i:], "\\u") {
					i += 2
					l := hex4()
					if l < 0xdc00 || 0xdfff < l {
						fail("a surrogate escape has no partner")
					}
					out.WriteRune(utf16.DecodeRune(u, l))
				} else if 0xd800 <= u && u <= 0xdfff {
					fail("a surrogate escape has no partner")
				} else {
					out.WriteRune(u)
				}
			} else {
				fail("an unknown escape in a string")
			}
		}
	}

	var value func(depth int) any
	value = func(depth int) any {
		if importMaxDepth < depth {
			fail("nested deeper than " + strconv.Itoa(importMaxDepth))
		}
		ws()
		if i < len(src) && ('{' == src[i] || '[' == src[i]) {
			obj := '{' == src[i]
			closer := byte(']')
			if obj {
				closer = '}'
			}
			i++
			o := &jobj{vals: map[string]any{}}
			list := []any{}
			ws()
			if i < len(src) && closer == src[i] {
				i++
				if obj {
					return o
				}
				return list
			}
			for {
				ws()
				if obj {
					if i >= len(src) || '"' != src[i] {
						fail("an object key must be a string")
					}
					k := str()
					ws()
					if i >= len(src) || ':' != src[i] {
						fail("a key needs a colon after it")
					}
					i++
					if o.has(k) {
						fail("an object names the key " + importStrLit(k) + " twice")
					}
					v := value(depth + 1)
					o.keys = append(o.keys, k)
					o.vals[k] = v
				} else {
					list = append(list, value(depth+1))
				}
				ws()
				if i < len(src) && ',' == src[i] {
					i++
					continue
				}
				if i < len(src) && closer == src[i] {
					i++
					if obj {
						return o
					}
					return list
				}
				if obj {
					fail("an object needs a comma or a closing brace")
				}
				fail("an array needs a comma or a closing bracket")
			}
		}
		if i < len(src) && '"' == src[i] {
			return str()
		}
		for _, w := range []struct {
			word string
			v    any
		}{{"true", true}, {"false", false}, {"null", jnull{}}} {
			if strings.HasPrefix(src[i:], w.word) {
				i += len(w.word)
				return w.v
			}
		}
		m := importNumberRe.FindString(src[i:])
		if "" == m {
			if i >= len(src) {
				fail("the text ends where a value belongs")
			}
			fail("not a JSON value")
		}
		i += len(m)
		return jnum{text: m}
	}

	out := value(0)
	ws()
	if i < len(src) {
		fail("text follows the value")
	}
	return out
}

// importNumberText is a JSON number written as aontu source in the leaf
// its exact value selects: an integer while that leaf holds it, a
// biginteger beyond, any other value a bigdecimal.
func importNumberText(t, path string) string {
	neg := strings.HasPrefix(t, "-")
	body := strings.TrimPrefix(t, "-")
	mant, expText := body, "0"
	if k := strings.IndexAny(body, "eE"); 0 <= k {
		mant, expText = body[:k], body[k+1:]
	}
	ip, fp := mant, ""
	if k := strings.IndexByte(mant, '.'); 0 <= k {
		ip, fp = mant[:k], mant[k+1:]
	}
	digits := strings.TrimLeft(ip+fp, "0")
	if "" == digits {
		return "0"
	}
	trimmed := strings.TrimRight(digits, "0")
	tz := len(digits) - len(trimmed)
	digits = trimmed
	exp, err := strconv.Atoi(strings.TrimPrefix(expText, "+"))
	scale := len(fp) - exp - tz
	if nil != err || importBudget < len(digits) || importBudget < scale ||
		scale < -importBudget {
		panic(&importRefusal{code: "decimal_budget", path: path,
			why: "the number has more digits or a larger exponent than the " +
				"exact budget of " + strconv.Itoa(importBudget) + " holds"})
	}
	sign := ""
	if neg {
		sign = "-"
	}
	if scale <= 0 {
		text := digits + strings.Repeat("0", -scale)
		n, _ := new(big.Int).SetString(text, 10)
		if isIntegerStorable(n) {
			return sign + text
		}
		return sign + "0d" + text
	}
	pad := strings.Repeat("0", max(0, scale+1-len(digits))) + digits
	return sign + "0d" + pad[:len(pad)-scale] + "." + pad[len(pad)-scale:]
}

// importStrLit is a string as an aontu literal: the quote, the
// backslash, the control characters and the spaces ECMA-262's `\s`
// reads beyond ASCII's are escaped, as in the TS port.
func importStrLit(s string) string {
	var out strings.Builder
	out.WriteByte('"')
	for _, r := range s {
		if k := strings.IndexRune("\"\\\b\f\n\r\t", r); 0 <= k {
			out.WriteByte('\\')
			out.WriteByte("\"\\bfnrt"[k])
		} else if r < 0x20 || isECMASpace(r) {
			out.WriteString("\\u" + strings.Repeat("0", 4-len(strconv.FormatInt(int64(r), 16))) +
				strconv.FormatInt(int64(r), 16))
		} else {
			out.WriteRune(r)
		}
	}
	out.WriteByte('"')
	return out.String()
}

func isJObj(v any) bool {
	_, ok := v.(*jobj)
	return ok
}

func isJSchema(v any) bool {
	_, isBool := v.(bool)
	return isBool || isJObj(v)
}

func importPtrAt(ptr, key string) string {
	return ptr + "/" + strings.ReplaceAll(strings.ReplaceAll(key, "~", "~0"), "/", "~1")
}

func importIdx(n int) string { return strconv.Itoa(n) }

func isASCIILetter(r rune) bool {
	return ('A' <= r && r <= 'Z') || ('a' <= r && r <= 'z')
}

// importEnc spells a name reversibly: a letter or digit stands, `_`
// doubles, and any other code point is its hex between two `_`, as is
// a digit that would open the name.
func importEnc(s string, opens bool) string {
	if "" == s {
		return "_"
	}
	var out strings.Builder
	for _, r := range s {
		switch {
		case '_' == r:
			out.WriteString("__")
		case isASCIILetter(r), '0' <= r && r <= '9' && !(opens && 0 == out.Len()):
			out.WriteRune(r)
		default:
			out.WriteString("_" + strconv.FormatInt(int64(r), 16) + "_")
		}
	}
	return out.String()
}

func importAliasName(segs []string) string {
	if 0 == len(segs) {
		return "_root"
	}
	if 2 == len(segs) && "$defs" == segs[0] {
		return importEnc(segs[1], true)
	}
	out := "_p"
	for _, s := range segs {
		out += "-" + importEnc(s, false)
	}
	return out
}

var importKindOrder = []string{"null", "boolean", "number", "string", "object", "array"}

var importSchemaMaps = []string{"properties", "patternProperties", "$defs",
	"dependentSchemas"}
var importSchemaOne = []string{"additionalProperties", "propertyNames", "items",
	"contains", "not", "if", "then", "else", "unevaluatedProperties",
	"unevaluatedItems", "contentSchema"}
var importSchemaLists = []string{"prefixItems", "allOf", "anyOf", "oneOf"}

var importCarried = map[string]bool{"$schema": true, "$id": true,
	"$ref": true, "$anchor": true, "$defs": true, "$dynamicRef": true,
	"$dynamicAnchor": true, "type": true, "enum": true,
	"const": true, "allOf": true, "anyOf": true, "oneOf": true, "not": true,
	"if": true, "then": true, "else": true, "dependentSchemas": true,
	"dependentRequired": true, "minimum": true, "maximum": true,
	"exclusiveMinimum": true, "exclusiveMaximum": true, "multipleOf": true,
	"minLength": true, "maxLength": true, "pattern": true, "properties": true,
	"required": true, "additionalProperties": true, "patternProperties": true,
	"propertyNames": true, "minProperties": true, "maxProperties": true,
	"prefixItems": true, "items": true, "minItems": true, "maxItems": true,
	"contains": true, "minContains": true, "maxContains": true,
	"uniqueItems": true, "unevaluatedProperties": true, "unevaluatedItems": true}

var importAnnotation = map[string]bool{"title": true, "description": true,
	"default": true, "examples": true, "deprecated": true, "readOnly": true,
	"writeOnly": true, "$comment": true, "format": true,
	"contentEncoding": true, "contentMediaType": true, "contentSchema": true}

var importLater = map[string]bool{"$vocabulary": true}

type importAnchor struct {
	node any
	ptr  string
}

// importEnv binds each dynamic anchor name in scope to the outermost
// resource's.
type importEnv map[string]importAnchor

// importCloneBudget: how many schemas the import may read once more for
// each further environment a dynamic reference reaches them in.
const importCloneBudget = 1000

type importCtx struct {
	root      any
	defaults  bool
	formats   bool
	lossy     []SchemaLoss
	aliases   map[string]*string
	resources map[string]importAnchor
	anchors   map[string]map[string]importAnchor
	bases     map[*jobj]string
	defKeys   map[*jobj]string
	unread    map[string]string
	dynamics  map[string]map[string]importAnchor
	env       importEnv
	rootEnv   importEnv
	clones    int
	// wanted: the places a rest() reads by alias; hoist: those the count
	// or condition beside it reads by the same alias.
	wanted map[string]bool
	hoist  map[string]bool
}

func (ic *importCtx) lose(path, construct, reason string) {
	ic.lossy = append(ic.lossy,
		SchemaLoss{Path: path, Construct: construct, Reason: reason})
}

var importAnchorRe = regexp.MustCompile(`^[A-Za-z_][-A-Za-z0-9._]*$`)

func importSplitFragment(uri string) (string, string, bool) {
	if i := strings.Index(uri, "#"); i >= 0 {
		return uri[:i], uri[i+1:], true
	}
	return uri, "", false
}

// claim: one URI names one schema, across every document the import
// reads.
func (ic *importCtx) claim(uri string, place importAnchor, path string) {
	if had, has := ic.resources[uri]; has && had.node != place.node {
		panic(&importRefusal{code: "jsonschema_duplicate", path: path,
			why: "the identifier " + importStrLit(uri) + " names two schemas"})
	}
	ic.resources[uri] = place
}

// index reads the resources and anchors of every schema position, each
// against the base in effect where it stands, before any reference is
// read: one anchor in one resource names one subschema.
func (ic *importCtx) index(node any, ptr, base string) {
	o, ok := node.(*jobj)
	if !ok {
		ic.inherit(node, base)
		return
	}
	if o.has("$id") {
		id, isStr := o.get("$id").(string)
		if !isStr {
			refuseSchema(importPtrAt(ptr, "$id"), "$id must be a string")
		}
		uri, frag, _ := importSplitFragment(resolveURI(base, id))
		if "" != frag {
			refuseSchema(importPtrAt(ptr, "$id"), "an $id names a resource, "+
				"not a fragment of one")
		}
		base = uri
		ic.claim(base, importAnchor{node: node, ptr: ptr}, importPtrAt(ptr, "$id"))
	}
	ic.bases[o] = base
	for _, kw := range []string{"$anchor", "$dynamicAnchor"} {
		if !o.has(kw) {
			continue
		}
		name, isStr := o.get(kw).(string)
		if !isStr || !importAnchorRe.MatchString(name) {
			refuseSchema(importPtrAt(ptr, kw), "an anchor must be a plain name")
		}
		names := ic.anchors[base]
		if nil == names {
			names = map[string]importAnchor{}
			ic.anchors[base] = names
		}
		if had, dup := names[name]; dup && had.node != node {
			panic(&importRefusal{code: "jsonschema_duplicate",
				path: importPtrAt(ptr, kw),
				why:  "the anchor " + importStrLit(name) + " names two subschemas"})
		}
		names[name] = importAnchor{node: node, ptr: ptr}
		if "$dynamicAnchor" == kw {
			dyn := ic.dynamics[base]
			if nil == dyn {
				dyn = map[string]importAnchor{}
				ic.dynamics[base] = dyn
			}
			dyn[name] = importAnchor{node: node, ptr: ptr}
		}
	}
	for _, k := range o.keys {
		v := o.get(k)
		m, isMap := v.(*jobj)
		l, isList := v.([]any)
		switch {
		case containsStr(importSchemaMaps, k) && isMap:
			ic.bases[m] = base
			for _, sk := range m.keys {
				if def, isDef := m.get(sk).(*jobj); isDef && "$defs" == k {
					ic.defKeys[def] = sk
				}
				ic.index(m.get(sk), importPtrAt(importPtrAt(ptr, k), sk), base)
			}
		case containsStr(importSchemaOne, k):
			ic.index(v, importPtrAt(ptr, k), base)
		case containsStr(importSchemaLists, k) && isList:
			for n, sv := range l {
				ic.index(sv, importPtrAt(importPtrAt(ptr, k), importIdx(n)), base)
			}
		default:
			ic.inherit(v, base)
		}
	}
}

// inherit: what stands in no schema position is data, and names no
// resource or anchor; a reference that reaches into it reads it against
// the base around it.
func (ic *importCtx) inherit(v any, base string) {
	switch t := v.(type) {
	case *jobj:
		ic.bases[t] = base
		for _, k := range t.keys {
			ic.inherit(t.get(k), base)
		}
	case []any:
		for _, e := range t {
			ic.inherit(e, base)
		}
	}
}

// resource: a document of the set is read when a reference first reaches
// for it, by its retrieval URI, and every one left when a reference
// names none of those, since it may name an $id inside one.
func (ic *importCtx) resource(uri string) (importAnchor, bool) {
	unread := []string{}
	if _, named := ic.resources[uri]; !named {
		if _, has := ic.unread[uri]; has {
			unread = append(unread, uri)
		} else {
			for doc := range ic.unread {
				unread = append(unread, doc)
			}
			sort.Strings(unread)
		}
	}
	for _, doc := range unread {
		text := ic.unread[doc]
		delete(ic.unread, doc)
		root := importReadDocument(doc, text)
		ic.claim(doc, importAnchor{node: root, ptr: doc + "#"}, doc+"#")
		ic.index(root, doc+"#", doc)
	}
	place, has := ic.resources[uri]
	return place, has
}

// readDocuments keys each document of the set by its URI without the
// fragment, which a retrieval URI does not use.
func (ic *importCtx) readDocuments(docs map[string]string) {
	keys := []string{}
	for k := range docs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		uri, _, _ := importSplitFragment(k)
		if _, dup := ic.unread[uri]; dup {
			panic(&importRefusal{code: "jsonschema_duplicate", path: uri + "#",
				why: "the identifier " + importStrLit(uri) + " names two schemas"})
		}
		ic.unread[uri] = docs[k]
	}
}

func importReadDocument(doc, text string) any {
	defer func() {
		if r := recover(); nil != r {
			ref := r.(*importRefusal)
			panic(&importRefusal{code: ref.code, path: doc + ref.path, why: ref.why})
		}
	}()
	return readSchemaJSON(text)
}

// importPlaceName names an alias for what a place holds: a place in the
// document the import was handed by its pointer, and one in another
// document by that document's URI too.
func importPlaceName(ptr string) string {
	at := strings.Index(ptr, "#")
	segs := []string{}
	for _, s := range strings.Split(ptr[at+1:], "/")[1:] {
		segs = append(segs, strings.ReplaceAll(strings.ReplaceAll(s, "~1", "/"), "~0", "~"))
	}
	if 0 == at {
		return importAliasName(segs)
	}
	out := "_d-" + importEnc(ptr[:at], false)
	for _, s := range segs {
		out += "-" + importEnc(s, false)
	}
	return out
}

var importBadTilde = regexp.MustCompile(`~[^01]|~$`)
var importIndexRe = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

// target reads a reference, resolved against the base of the schema it
// sits in, to the place it names, with the URI it was resolved to.
func (ic *importCtx) target(o *jobj, kw, path string) (importAnchor, string, string) {
	r, ok := o.get(kw).(string)
	if !ok {
		refuseSchema(path, kw+" must be a string")
	}
	bad := func(why string) {
		panic(&importRefusal{code: "jsonschema_ref", path: path,
			why: "the reference " + importStrLit(r) + " " + why})
	}
	uri, raw, _ := importSplitFragment(resolveURI(ic.bases[o], r))
	res, found := ic.resource(uri)
	if !found {
		bad("names a document the import was not given")
	}
	frag, err := url.PathUnescape(raw)
	if nil != err || !utf8.ValidString(frag) {
		bad("is not a well-formed fragment")
	}
	var node any
	ptr := res.ptr
	if "" == frag || strings.HasPrefix(frag, "/") {
		segs := []string{}
		if "" != frag {
			segs = strings.Split(frag[1:], "/")
		}
		node = res.node
		for _, s := range segs {
			if importBadTilde.MatchString(s) {
				bad("is not a well-formed JSON pointer")
			}
			k := strings.ReplaceAll(strings.ReplaceAll(s, "~1", "/"), "~0", "~")
			switch n := node.(type) {
			case *jobj:
				node = n.get(k)
			case []any:
				node = nil
				if importIndexRe.MatchString(k) {
					if idx, aerr := strconv.Atoi(k); nil == aerr && idx < len(n) {
						node = n[idx]
					}
				}
			default:
				node = nil
			}
			ptr = importPtrAt(ptr, k)
		}
	} else if anchored, has := ic.anchors[uri][frag]; has {
		node, ptr = anchored.node, anchored.ptr
	}
	if !isJSchema(node) {
		bad("names no schema in this document")
	}
	return importAnchor{node: node, ptr: ptr}, frag, uri + "#" + raw
}

// dynamicAlias reads a `$dynamicRef`: where its first target declares
// the dynamic anchor its fragment names, the schema the outermost
// resource in scope binds that anchor to, or that target where none
// does, and a `$ref` otherwise.
func (ic *importCtx) dynamicAlias(o *jobj, path string) string {
	place, frag, uri := ic.target(o, "$dynamicRef", path)
	if t, ok := place.node.(*jobj); !ok || t.get("$dynamicAnchor") != frag {
		return ic.use(place)
	}
	if bound, has := ic.env[frag]; has {
		place = bound
	}
	return "meta(" + ic.use(place) + ", { dynamicRef: " + importStrLit(uri) +
		" })"
}

// use: one place in one environment, one alias. An anchor names the
// alias of the place it stands, so a schema reached by anchor and by
// pointer is one alias, and a schema read in another environment is
// another.
func (ic *importCtx) use(place importAnchor) string {
	name := ic.aliasOf(place.node, place.ptr)
	ic.declare(name, place.node, place.ptr)
	return "%" + name
}

func (ic *importCtx) aliasOf(node any, ptr string) string {
	env := ic.enter(ic.env, node)
	// An environment only grows from the root resource's, binding names
	// it lacks, so one no larger is the root's.
	if len(env) == len(ic.rootEnv) {
		return importPlaceName(ptr)
	}
	names := make([]string, 0, len(env))
	for n := range env {
		names = append(names, n)
	}
	sort.Strings(names)
	name := importPlaceName(ptr)
	for _, n := range names {
		name += "-_e-" + importEnc(n, false) + "-" + importPlaceName(env[n].ptr)
	}
	if _, has := ic.aliases[name]; !has {
		ic.clones++
		if importCloneBudget < ic.clones {
			panic(&importRefusal{code: "jsonschema_budget", path: ptr,
				why: "more than " + strconv.Itoa(importCloneBudget) +
					" schemas are read once more in another dynamic scope"})
		}
	}
	return name
}

// enter: the environment a schema is read in is the one around it, and
// the dynamic anchors its resource declares that no outer one binds.
func (ic *importCtx) enter(env importEnv, node any) importEnv {
	o, ok := node.(*jobj)
	if !ok {
		return env
	}
	own := ic.dynamics[ic.bases[o]]
	fresh := importEnv{}
	for n, p := range own {
		if _, bound := env[n]; !bound {
			fresh[n] = p
		}
	}
	if 0 == len(fresh) {
		return env
	}
	for n, p := range env {
		fresh[n] = p
	}
	return fresh
}

func (ic *importCtx) declare(name string, node any, ptr string) {
	if _, has := ic.aliases[name]; !has {
		ic.aliases[name] = nil
		text := ic.bodyOf(node, ptr)
		if rec := ic.identity(name, node, ptr); "" != rec {
			text = "identity(" + text + ", " + rec + ")"
		}
		ic.aliases[name] = &text
	}
}

// identity: what the export needs to give a schema back its place: the
// $id of the resource it is, where that is absolute, its $anchor and
// $dynamicAnchor, where the export leaves them in the resource that
// holds them, and its $defs key.
func (ic *importCtx) identity(name string, node any, ptr string) string {
	o, ok := node.(*jobj)
	if !ok {
		return ""
	}
	at := strings.Index(ptr, "#")
	base := ic.bases[o]
	own := o.has("$id") || (at == len(ptr)-1 && 0 < at)
	parts := []string{}
	if own && parseURI(base).hasScheme {
		parts = append(parts, "id: "+importStrLit(base))
	}
	kept := 1 == len(parts) || (0 == at && base == ic.bases[ic.root.(*jobj)])
	for _, kw := range []string{"anchor", "dynamicAnchor"} {
		if anchor, has := o.get("$" + kw).(string); has && kept {
			parts = append(parts, kw+": "+importStrLit(anchor))
		}
	}
	if key, has := ic.defKeys[o]; has && key != name {
		parts = append(parts, "key: "+importStrLit(key))
	}
	if 0 == len(parts) {
		return ""
	}
	return "{ " + strings.Join(parts, ", ") + " }"
}

// importDatum writes an annotation's value as the plain data it is.
func importDatum(v any, path string) string {
	switch t := v.(type) {
	case jnull:
		return "null"
	case bool:
		return strconv.FormatBool(t)
	case jnum:
		return importNumberText(t.text, path)
	case string:
		return importStrLit(t)
	case []any:
		parts := []string{}
		for n, e := range t {
			parts = append(parts, importDatum(e, importPtrAt(path, importIdx(n))))
		}
		return "[" + strings.Join(parts, ", ") + "]"
	}
	o := v.(*jobj)
	parts := []string{}
	for _, k := range o.keys {
		parts = append(parts, importStrLit(k)+": "+importDatum(o.get(k), importPtrAt(path, k)))
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

// importRider lists the annotations a schema object carries, each under
// its rider key, with the JSON kind the draft gives its value.
var importRider = [][3]string{
	{"title", "title", "string"}, {"description", "description", "string"},
	{"$comment", "comment", "string"}, {"default", "default", ""},
	{"examples", "examples", "array"}, {"readOnly", "readOnly", "boolean"},
	{"writeOnly", "writeOnly", "boolean"}, {"format", "format", "string"},
	{"contentEncoding", "contentEncoding", "string"},
	{"contentMediaType", "contentMediaType", "string"},
	{"contentSchema", "contentSchema", ""},
}

var importContent = map[string]bool{"contentEncoding": true,
	"contentMediaType": true, "contentSchema": true}

const importDeprecateKey = "x-aontu-deprecate"

// importDeprecRecord reads deprecate()'s record as the exporter writes
// it beside `deprecated`; in any other shape, or without `deprecated:
// true`, the keyword is unknown to the draft and rides `x` as any other
// does.
func importDeprecRecord(o *jobj) (string, bool) {
	r, ok := o.get(importDeprecateKey).(*jobj)
	if true != o.get("deprecated") || !ok {
		return "", false
	}
	fields := []string{}
	for _, k := range r.keys {
		v, isStr := r.get(k).(string)
		if !isStr || ("msg" != k && "use" != k && "since" != k) {
			return "", false
		}
		fields = append(fields, k+": "+importStrLit(v))
	}
	return "{" + strings.Join(fields, ", ") + "}", true
}

func importRiderOf(o *jobj, ptr string, content bool) string {
	fields := []string{}
	for _, r := range importRider {
		k, key, kind := r[0], r[1], r[2]
		if !o.has(k) || content != importContent[k] ||
			("contentSchema" == k && !o.has("contentMediaType")) {
			continue
		}
		v := o.get(k)
		if "" != kind && kind != importJSONKind(v) {
			article := "a "
			if "array" == kind {
				article = "an "
			}
			refuseSchema(importPtrAt(ptr, k), k+" must be "+article+kind)
		}
		fields = append(fields, key+": "+importDatum(v, importPtrAt(ptr, k)))
	}
	if !content {
		x := []string{}
		_, read := importDeprecRecord(o)
		for _, k := range o.keys {
			if !importCarried[k] && !importAnnotation[k] && !importLater[k] &&
				!(read && importDeprecateKey == k) {
				x = append(x, importStrLit(k)+": "+importDatum(o.get(k), importPtrAt(ptr, k)))
			}
		}
		if 0 < len(x) {
			fields = append(fields, "x: {"+strings.Join(x, ", ")+"}")
		}
	}
	if 0 == len(fields) {
		return ""
	}
	return "{" + strings.Join(fields, ", ") + "}"
}

func (ic *importCtx) lit(v any, path string) string {
	switch t := v.(type) {
	case jnull:
		return "null"
	case bool:
		return strconv.FormatBool(t)
	case jnum:
		return importNumberText(t.text, path)
	case string:
		return importStrLit(t)
	case []any:
		parts := []string{}
		for n, e := range t {
			parts = append(parts, ic.lit(e, importPtrAt(path, importIdx(n))))
		}
		return "close([" + strings.Join(parts, ", ") + "])"
	}
	o := v.(*jobj)
	parts := []string{}
	for _, k := range o.keys {
		parts = append(parts, importStrLit(k)+": "+ic.lit(o.get(k), importPtrAt(path, k)))
	}
	return "close({" + strings.Join(parts, ", ") + "})"
}

func importCount(v any, path string) string {
	if nil == v {
		return ""
	}
	n := "-"
	if j, ok := v.(jnum); ok {
		n = importNumberText(j.text, path)
	}
	if strings.HasPrefix(n, "-") || strings.Contains(n, ".") {
		refuseSchema(path, "a count must be a non-negative integer")
	}
	return n
}

func importDivisor(v any, path string) string {
	if nil == v {
		return ""
	}
	n := "-"
	if j, ok := v.(jnum); ok {
		n = importNumberText(j.text, path)
	}
	if strings.HasPrefix(n, "-") || "0" == n {
		refuseSchema(path, "a divisor must be a number greater than 0")
	}
	return n
}

func importNum(v any, path string) string {
	if nil == v {
		return ""
	}
	j, ok := v.(jnum)
	if !ok {
		refuseSchema(path, "a bound must be a number")
	}
	return importNumberText(j.text, path)
}

func importSchemaMap(v any, path string) *jobj {
	if nil == v {
		return &jobj{vals: map[string]any{}}
	}
	o, ok := v.(*jobj)
	if ok {
		for _, k := range o.keys {
			if !isJSchema(o.get(k)) {
				ok = false
			}
		}
	}
	if !ok {
		refuseSchema(path, "the value must be an object of schemas")
	}
	return o
}

func importSchemaList(v any, path string) []any {
	if nil == v {
		return nil
	}
	l, ok := v.([]any)
	ok = ok && 0 < len(l)
	for _, s := range l {
		ok = ok && isJSchema(s)
	}
	if !ok {
		refuseSchema(path, "the value must be a non-empty array of schemas")
	}
	return l
}

func importSchemaOneOf(v any, path string) any {
	if nil != v && !isJSchema(v) {
		refuseSchema(path, "the value must be a schema")
	}
	return v
}

func importBoth(parts []string) string {
	if 0 == len(parts) {
		return "any"
	}
	return strings.Join(parts, " & ")
}

func importParen(s string) string {
	if strings.Contains(s, " & ") || strings.Contains(s, " | ") {
		return "(" + s + ")"
	}
	return s
}

// ECMA-262's `\s` and `.`, which re() reads more narrowly, in re()'s
// own spelling.
const ecmaSpace = " \\t\\n\\r\\f\\v\u00a0\u1680\u2000-\u200a\u2028\u2029" +
	"\u202f\u205f\u3000\ufeff"
const ecmaDot = "[^\\n\\r\u2028\u2029]"

// A letter or digit ECMA-262's `u` mode gives a meaning after a backslash.
const ecmaEsc = "0123456789bBcdDfknpPrsStuvwWx"

type reTok struct {
	k    string
	s    string
	m    string
	hasM bool
	lock bool
}

func reLit(ch string, inClass bool) string {
	set := "\\.+*?()[]{}|^$"
	if inClass {
		set = "\\]^-["
	}
	if strings.Contains(set, ch) {
		return "\\" + ch
	}
	return ch
}

func reHexAt(cs []rune, i int) bool {
	if i < 0 || len(cs) <= i {
		return false
	}
	c := cs[i]
	return ('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F')
}

func reHexRun(cs []rune, from, to int) bool {
	for k := from; k < to; k++ {
		if !reHexAt(cs, k) {
			return false
		}
	}
	return true
}

// uEscape is the `\u` escape at i of cs as its code point and length,
// with a length of 0 where it is not one.
func uEscape(cs []rune, i int) (rune, int) {
	if i+2 < len(cs) && '{' == cs[i+2] {
		end := -1
		for k := i + 3; k < len(cs) && end < 0; k++ {
			if '}' == cs[k] {
				end = k
			}
		}
		if end <= i+3 || i+3+6 < end || !reHexRun(cs, i+3, end) {
			return 0, 0
		}
		v, _ := strconv.ParseInt(string(cs[i+3:end]), 16, 64)
		if 0x10ffff < v {
			return 0, 0
		}
		return rune(v), end + 1 - i
	}
	if len(cs) < i+6 || !reHexRun(cs, i+2, i+6) {
		return 0, 0
	}
	hi, _ := strconv.ParseInt(string(cs[i+2:i+6]), 16, 64)
	if 0xd800 <= hi && hi <= 0xdbff && i+12 <= len(cs) && '\\' == cs[i+6] &&
		'u' == cs[i+7] && reHexRun(cs, i+8, i+12) {
		lo, _ := strconv.ParseInt(string(cs[i+8:i+12]), 16, 64)
		if 0xdc00 <= lo && lo <= 0xdfff {
			return rune(0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00)), 12
		}
	}
	return rune(hi), 6
}

// ecmaPattern is an ECMA-262 pattern in what re() reads alike: `\s`,
// `\S` and `.` as ECMA reads them, a `\u` escape as its character, a
// named group as a non-capturing one, and a quantified alternation of
// single characters as a class. It answers the pattern and why it is
// refused; what re() still refuses is left for it to name.
func ecmaPattern(src string) (string, string) {
	cs := []rune(src)
	toks := []reTok{}

	// The escape at i: outside a class, inside one, whether it can be a
	// member, its length, or why ECMA-262's grammar refuses it. A lone
	// surrogate stays an escape re() refuses.
	esc := func(i int) (string, string, bool, int, string) {
		if len(cs) <= i+1 {
			return "\\", "", false, 1, ""
		}
		n := cs[i+1]
		switch {
		case 'u' == n:
			cp, l := uEscape(cs, i)
			if 0 == l || (0xd800 <= cp && cp <= 0xdfff) {
				return "\\u", "", false, 2, ""
			}
			ch := string(cp)
			return reLit(ch, false), reLit(ch, true), true, l, ""
		case 's' == n:
			return "[" + ecmaSpace + "]", ecmaSpace, true, 2, ""
		case 'S' == n:
			return "[^" + ecmaSpace + "]", "", false, 2, ""
		case (('a' <= n && n <= 'z') || ('A' <= n && n <= 'Z') ||
			('0' <= n && n <= '9')) && !strings.ContainsRune(ecmaEsc, n):
			return "", "", false, 0, "\\" + string(n) +
				", an escape ECMA-262 does not define"
		case 'x' == n && reHexAt(cs, i+2) && reHexAt(cs, i+3):
			x := "\\x" + string(cs[i+2:i+4])
			return x, x, true, 4, ""
		}
		one := "\\" + string(n)
		return one, one, strings.ContainsRune("dwfnrtv-^$\\.*+?()[]{}|/", n), 2, ""
	}

	// One class body from j, ECMA's ClassRanges: an atom, `-` and an atom
	// is a range, which a class escape may not end in `u` mode.
	klass := func(j int) (string, int, string) {
		type item struct {
			s         string
			cls, dash bool
		}
		items := []item{}
		for j < len(cs) && ']' != cs[j] {
			if '\\' != cs[j] {
				s := string(cs[j])
				if '[' == cs[j] {
					s = "\\["
				}
				items = append(items, item{s, false, '-' == cs[j]})
				j++
				continue
			}
			_, m, hasM, l, why := esc(j)
			if "" != why {
				return "", 0, why
			}
			if !hasM {
				m = string(cs[j : j+l])
			}
			cls := j+1 < len(cs) && strings.ContainsRune("dDwWsS", cs[j+1])
			items = append(items, item{m, cls, false})
			j += l
		}
		var body strings.Builder
		for k := 0; k < len(items); k++ {
			if k+2 < len(items) && items[k+1].dash {
				if items[k].cls || items[k+2].cls {
					return "", 0, "a class escape as the end of a range, which " +
						"ECMA-262 refuses"
				}
				body.WriteString(items[k].s + items[k+1].s + items[k+2].s)
				k += 2
				continue
			}
			body.WriteString(items[k].s)
		}
		return body.String(), j, ""
	}

	for i := 0; i < len(cs); {
		c := cs[i]
		switch {
		case '\\' == c:
			s, m, hasM, l, why := esc(i)
			if "" != why {
				return "", why
			}
			if (i+1 < len(cs) && '-' == cs[i+1]) || !hasM {
				toks = append(toks, reTok{k: "raw", s: s})
			} else {
				toks = append(toks, reTok{k: "atom", s: s, m: m, hasM: true})
			}
			i += l
		case '[' == c:
			neg := i+1 < len(cs) && '^' == cs[i+1]
			from := i + 1
			if neg {
				from = i + 2
			}
			body, end, why := klass(from)
			if "" != why {
				return "", why
			}
			s := "["
			if neg {
				s += "^"
			}
			s += body
			if end < len(cs) {
				s += "]"
			}
			toks = append(toks, reTok{k: "atom", s: s})
			i = end + 1
		case '(' == c:
			named := 0
			if i+3 < len(cs) && '?' == cs[i+1] && '<' == cs[i+2] &&
				reNameStart(cs[i+3]) {
				k := i + 4
				for k < len(cs) && reNamePart(cs[k]) {
					k++
				}
				if k < len(cs) && '>' == cs[k] {
					named = k + 1 - i
				}
			}
			switch {
			case 0 < named:
				toks = append(toks, reTok{k: "open", s: "(?:"})
				i += named
			case i+1 >= len(cs) || '?' != cs[i+1]:
				toks = append(toks, reTok{k: "open", s: "("})
				i++
			case i+2 < len(cs) && ':' == cs[i+2]:
				toks = append(toks, reTok{k: "open", s: "(?:"})
				i += 3
			default:
				s := "(?"
				if i+2 < len(cs) && strings.ContainsRune("=!", cs[i+2]) {
					s += string(cs[i+2])
				} else if i+3 < len(cs) && '<' == cs[i+2] &&
					strings.ContainsRune("=!", cs[i+3]) {
					s += string(cs[i+2 : i+4])
				}
				toks = append(toks, reTok{k: "open", s: s, lock: true})
				i += len([]rune(s))
			}
		case ']' == c:
			return "", "a ] outside a character class, which ECMA-262 refuses"
		default:
			ch := string(c)
			switch {
			case ')' == c:
				toks = append(toks, reTok{k: "close", s: ch})
			case '|' == c:
				toks = append(toks, reTok{k: "alt", s: ch})
			case strings.ContainsRune("*+?{", c):
				toks = append(toks, reTok{k: "quant", s: ch})
			case '.' == c:
				toks = append(toks, reTok{k: "atom", s: ecmaDot})
			case strings.ContainsRune("^$}", c):
				toks = append(toks, reTok{k: "raw", s: ch})
			default:
				toks = append(toks, reTok{k: "atom", s: ch, m: reLit(ch, true), hasM: true})
			}
			i++
		}
	}

	var emit func(from, to int) string
	emit = func(from, to int) string {
		var out strings.Builder
		for t := from; t < to; t++ {
			tok := toks[t]
			if "open" != tok.k {
				out.WriteString(tok.s)
				continue
			}
			depth, closeAt := 0, -1
			for u := t; u < to && closeAt < 0; u++ {
				switch toks[u].k {
				case "open":
					depth++
				case "close":
					depth--
				}
				if 0 == depth {
					closeAt = u
				}
			}
			if closeAt < 0 {
				return out.String() + tok.s + emit(t+1, to)
			}
			inner := toks[t+1 : closeAt]
			single := 1 < len(inner) && 1 == len(inner)%2
			for n, x := range inner {
				if (0 == n%2 && !x.hasM) || (1 == n%2 && "alt" != x.k) {
					single = false
				}
			}
			if !tok.lock && single && closeAt+1 < len(toks) &&
				"quant" == toks[closeAt+1].k {
				out.WriteByte('[')
				for _, x := range inner {
					if x.hasM {
						out.WriteString(x.m)
					}
				}
				out.WriteByte(']')
			} else {
				out.WriteString(tok.s + emit(t+1, closeAt) + ")")
			}
			t = closeAt
		}
		return out.String()
	}

	return emit(0, len(toks)), ""
}

func reNameStart(c rune) bool {
	return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') || '_' == c || '$' == c
}

func reNamePart(c rune) bool {
	return reNameStart(c) || ('0' <= c && c <= '9')
}

// isECMASpace is a code point ECMA-262's `\s` reads that ASCII has no
// escape for.
func isECMASpace(r rune) bool {
	return 0xa0 == r || 0x1680 == r || (0x2000 <= r && r <= 0x200a) ||
		0x2028 == r || 0x2029 == r || 0x202f == r || 0x205f == r ||
		0x3000 == r || 0xfeff == r
}

// pattern is a pattern re() carries, or a loss and "".
func (ic *importCtx) pattern(p any, path string) string {
	s, ok := p.(string)
	if !ok {
		refuseSchema(path, "a pattern must be a string")
	}
	re, why := ecmaPattern(s)
	if "" == why {
		_, why = normaliseRe(re)
	}
	if "" != why {
		ic.lose(path, "pattern", "the pattern uses "+why+", which re() does "+
			"not carry, so it is DROPPED and the import admits strings the "+
			"schema refuses")
		return ""
	}
	return "re(" + importStrLit(re) + ")"
}

func importLens(min, max string) []string {
	out := []string{}
	if "" != min {
		out = append(out, "len(min("+min+"))")
	}
	if "" != max {
		out = append(out, "len(max("+max+"))")
	}
	return out
}

func (ic *importCtx) objectBranch(o *jobj, ptr string) string {
	rest := ic.restAtom(o, ptr, "unevaluatedProperties")
	props := importSchemaMap(o.get("properties"), importPtrAt(ptr, "properties"))
	required := []string{}
	if o.has("required") {
		l, ok := o.get("required").([]any)
		seen := map[string]bool{}
		for _, k := range l {
			s, isStr := k.(string)
			ok = ok && isStr && !seen[s]
			seen[s] = true
			required = append(required, s)
		}
		if !ok {
			refuseSchema(importPtrAt(ptr, "required"),
				"required must be an array of distinct strings")
		}
	}
	entries := []string{}
	for _, k := range props.keys {
		at := importPtrAt(importPtrAt(ptr, "properties"), k)
		own := ic.I(props.get(k), at)
		if containsStr(required, k) {
			entries = append(entries, importStrLit(k)+": "+own)
			continue
		}
		if s, ok := props.get(k).(*jobj); ok && ic.defaults && s.has("default") {
			own = importParen(own) + " & (*" +
				importDatum(s.get("default"), importPtrAt(at, "default")) + " | any)"
		}
		entries = append(entries, importStrLit(k)+"?: "+own)
	}
	for _, k := range required {
		if !props.has(k) {
			entries = append(entries, importStrLit(k)+": any")
		}
	}

	guards := []string{}
	known := []string{}
	for _, k := range props.keys {
		known = append(known, importStrLit(k)+", any")
	}
	exact := true
	pps := importSchemaMap(o.get("patternProperties"),
		importPtrAt(ptr, "patternProperties"))
	for _, p := range pps.keys {
		at := importPtrAt(importPtrAt(ptr, "patternProperties"), p)
		re := ic.pattern(p, at)
		if "" == re {
			exact = false
			continue
		}
		guards = append(guards, "match(key(0), "+re+", "+ic.I(pps.get(p), at)+", any)")
		known = append(known, re+", any")
	}
	ap := importSchemaOneOf(o.get("additionalProperties"),
		importPtrAt(ptr, "additionalProperties"))
	if nil != ap && true != ap {
		if !exact {
			ic.lose(importPtrAt(ptr, "additionalProperties"), "additionalProperties",
				"a pattern beside it is not carried, so the keys it would cover "+
					"are not known and it is DROPPED: the import admits keys the "+
					"schema refuses")
		} else {
			rest := ic.I(ap, importPtrAt(ptr, "additionalProperties"))
			if 0 == len(known) {
				guards = append(guards, rest)
			} else {
				guards = append(guards, "match(key(0), "+strings.Join(known, ", ")+
					", "+rest+")")
			}
		}
	}
	pn := importSchemaOneOf(o.get("propertyNames"), importPtrAt(ptr, "propertyNames"))
	if nil != pn && true != pn {
		if false == pn {
			guards = append(guards, "nil")
		} else {
			guards = append(guards, "match(key(0), empty() & "+
				importParen(ic.I(pn, importPtrAt(ptr, "propertyNames")))+", any, nil)")
		}
	}

	lens := importLens(importCount(o.get("minProperties"), importPtrAt(ptr, "minProperties")),
		importCount(o.get("maxProperties"), importPtrAt(ptr, "maxProperties")))
	lens = append(lens, rest...)
	if 0 == len(entries) && 0 == len(guards) {
		if 0 == len(lens) {
			return ""
		}
		return importBoth(append([]string{"map"}, lens...))
	}
	body := entries
	if 0 < len(guards) {
		body = append(body, "&: "+strings.Join(guards, " & "))
	}
	return importBoth(append([]string{"{" + strings.Join(body, ", ") + "}"}, lens...))
}

func (ic *importCtx) arrayBranch(o *jobj, ptr string) string {
	prefix := []any{}
	if o.has("prefixItems") {
		prefix = importSchemaList(o.get("prefixItems"), importPtrAt(ptr, "prefixItems"))
	}
	items := importSchemaOneOf(o.get("items"), importPtrAt(ptr, "items"))
	rest := ""
	if nil != items && true != items {
		rest = ic.I(items, importPtrAt(ptr, "items"))
	}
	arms := []string{}
	for n, s := range prefix {
		arms = append(arms, importStrLit(importIdx(n))+", "+
			ic.I(s, importPtrAt(importPtrAt(ptr, "prefixItems"), importIdx(n))))
	}
	spread := rest
	if 0 < len(arms) {
		dflt := rest
		if "" == dflt {
			dflt = "any"
		}
		spread = "match(key(0), " + strings.Join(arms, ", ") + ", " + dflt + ")"
	}
	lens := importLens(importCount(o.get("minItems"), importPtrAt(ptr, "minItems")),
		importCount(o.get("maxItems"), importPtrAt(ptr, "maxItems")))
	u := o.get("uniqueItems")
	if _, ok := u.(bool); nil != u && !ok {
		refuseSchema(importPtrAt(ptr, "uniqueItems"), "uniqueItems must be a boolean")
	}
	atoms := append([]string{}, lens...)
	if true == u {
		atoms = append(atoms, "unique()")
	}
	atoms = append(atoms, ic.containsAtom(o, ptr)...)
	for _, a := range atoms {
		if "nil" == a {
			return "nil"
		}
	}
	atoms = append(atoms, ic.restAtom(o, ptr, "unevaluatedItems")...)
	if "" == spread && 0 == len(atoms) {
		return ""
	}
	base := "list"
	if "" != spread {
		base = "[&: " + spread + "]"
	}
	return importBoth(append([]string{base}, atoms...))
}

// importReach is what a schema evaluates at its own instance location,
// the members its own keywords reach. An applicator in place adds what
// its schemas evaluate: always for `allOf` and a reference, and under
// the trial that decides it for the conditional ones.
type importReach struct {
	keys    []string
	all     bool
	prefix  int
	items   []importAnchor
	covers  []importCover
	inexact bool
}

// importCover: a trial place, or the trial's own text where it has no
// place, and the records read where it admits and where it refuses.
type importCover struct {
	trial *importAnchor
	text  string
	rec   *importReach
	alt   *importReach
}

func (r *importReach) add(b *importReach) *importReach {
	for _, k := range b.keys {
		if !containsStr(r.keys, k) {
			r.keys = append(r.keys, k)
		}
	}
	r.all = r.all || b.all
	if b.prefix > r.prefix {
		r.prefix = b.prefix
	}
	r.items = append(r.items, b.items...)
	r.covers = append(r.covers, b.covers...)
	r.inexact = r.inexact || b.inexact
	return r
}

func (r *importReach) empty() bool {
	return 0 == len(r.keys) && !r.all && 0 == r.prefix && 0 == len(r.items) &&
		0 == len(r.covers)
}

func (ic *importCtx) reach(node any, ptr, kw string, path map[*jobj]bool,
	own bool) *importReach {
	r := &importReach{}
	o, ok := node.(*jobj)
	if !ok || path[o] {
		return r
	}
	outer := ic.env
	ic.env = ic.enter(outer, node)
	path[o] = true
	defer func() {
		delete(path, o)
		ic.env = outer
	}()
	sub := func(s any, at string) *importReach { return ic.reach(s, at, kw, path, false) }
	at := func(k, n string) string { return importPtrAt(importPtrAt(ptr, k), n) }
	if "unevaluatedProperties" == kw {
		if props, isObj := o.get("properties").(*jobj); isObj {
			for _, k := range props.keys {
				r.keys = append(r.keys, importStrLit(k))
			}
		}
		if pats, isObj := o.get("patternProperties").(*jobj); isObj {
			for _, p := range pats.keys {
				re := ic.pattern(p, at("patternProperties", p))
				r.inexact = r.inexact || "" == re
				if "" != re {
					r.keys = append(r.keys, re)
				}
			}
		}
		r.all = o.has("additionalProperties") ||
			(!own && o.has("unevaluatedProperties"))
	} else {
		if prefix, isList := o.get("prefixItems").([]any); isList {
			r.prefix = len(prefix)
		}
		r.all = o.has("items") || (!own && o.has("unevaluatedItems"))
		if o.has("contains") {
			r.items = append(r.items, importAnchor{node: o.get("contains"),
				ptr: importPtrAt(ptr, "contains")})
		}
	}
	list := func(k string) []any {
		l, _ := o.get(k).([]any)
		return l
	}
	for n, s := range list("allOf") {
		r.add(sub(s, at("allOf", importIdx(n))))
	}
	for _, kr := range []string{"$ref", "$dynamicRef"} {
		if o.has(kr) {
			to, frag, _ := ic.target(o, kr, importPtrAt(ptr, kr))
			if t, isObj := to.node.(*jobj); "$dynamicRef" == kr && isObj &&
				t.get("$dynamicAnchor") == frag {
				if bound, has := ic.env[frag]; has {
					to = bound
				}
			}
			r.add(sub(to.node, to.ptr))
		}
	}
	for _, k := range []string{"anyOf", "oneOf"} {
		for n, s := range list(k) {
			place := importAnchor{node: s, ptr: at(k, importIdx(n))}
			rec := sub(s, place.ptr)
			r.inexact = r.inexact || rec.inexact
			if !rec.empty() {
				r.covers = append(r.covers, importCover{trial: &place, rec: rec})
			}
		}
	}
	if o.has("if") {
		c := o.get("if")
		then := sub(c, importPtrAt(ptr, "if"))
		if o.has("then") {
			then.add(sub(o.get("then"), importPtrAt(ptr, "then")))
		}
		alt := &importReach{}
		if o.has("else") {
			alt = sub(o.get("else"), importPtrAt(ptr, "else"))
		}
		r.inexact = r.inexact || then.inexact || alt.inexact
		if b, isBool := c.(bool); isBool {
			if b {
				r.add(then)
			} else {
				r.add(alt)
			}
		} else if !then.empty() || !alt.empty() {
			cv := importCover{trial: &importAnchor{node: c, ptr: importPtrAt(ptr, "if")},
				rec: then}
			if !alt.empty() {
				cv.alt = alt
			}
			r.covers = append(r.covers, cv)
		}
	}
	if deps, isObj := o.get("dependentSchemas").(*jobj); isObj {
		for _, k := range deps.keys {
			rec := sub(deps.get(k), at("dependentSchemas", k))
			r.inexact = r.inexact || rec.inexact
			if !rec.empty() {
				r.covers = append(r.covers, importCover{
					text: "{" + importStrLit(k) + ": any}", rec: rec})
			}
		}
	}
	return r
}

// trialOf: the alias a trial reads, recorded so the check beside it
// reads it too.
func (ic *importCtx) trialOf(place importAnchor) string {
	if _, ok := place.node.(*jobj); !ok {
		return ic.I(place.node, place.ptr)
	}
	ic.wanted[place.ptr] = true
	return ic.use(place)
}

// reachRecord: a record, as rest() reads one.
func (ic *importCtx) reachRecord(r, alt *importReach) string {
	fields := []string{}
	if r.all {
		fields = append(fields, "keys: any")
	} else {
		if 0 < len(r.keys) {
			fields = append(fields, "keys: "+strings.Join(r.keys, " | "))
		}
		if 0 < r.prefix {
			fields = append(fields, "prefix: "+importIdx(r.prefix))
		}
		if 0 < len(r.items) {
			srcs := []string{}
			for _, p := range r.items {
				srcs = append(srcs, ic.trialOf(p))
			}
			fields = append(fields, "items: "+importDisjoin(srcs))
		}
		if 0 < len(r.covers) {
			fields = append(fields, "covers: ["+strings.Join(ic.reachPairs(r.covers), ", ")+"]")
		}
	}
	if nil != alt {
		fields = append(fields, "else: "+ic.reachRecord(alt, nil))
	}
	return "{" + strings.Join(fields, ", ") + "}"
}

func (ic *importCtx) reachPairs(covers []importCover) []string {
	out := []string{}
	for _, cv := range covers {
		trial := cv.text
		if nil != cv.trial {
			trial = ic.trialOf(*cv.trial)
		}
		out = append(out, trial+", "+ic.reachRecord(cv.rec, cv.alt))
	}
	return out
}

// restAtom reads `unevaluatedProperties` or `unevaluatedItems` as
// rest(t, ...): every member what the schema evaluates in place does not
// reach must meet t. Where everything is reached it asks nothing, and
// where a pattern it would read is not carried it is dropped, since it
// would refuse the keys the pattern reaches.
func (ic *importCtx) restAtom(o *jobj, ptr, kw string) []string {
	u := importSchemaOneOf(o.get(kw), importPtrAt(ptr, kw))
	if nil == u || true == u {
		return nil
	}
	r := ic.reach(o, ptr, kw, map[*jobj]bool{}, true)
	if r.all {
		return nil
	}
	if r.inexact {
		ic.lose(importPtrAt(ptr, kw), kw, "a pattern a schema in place beside it "+
			"reads is not carried, so the members it evaluates are not known and "+
			"it is DROPPED: the import admits instances the schema refuses")
		return nil
	}
	t := ic.I(u, importPtrAt(ptr, kw))
	if "any" == t {
		return nil
	}
	parts := []string{t}
	own := *r
	own.covers = nil
	if !own.empty() {
		parts = append(parts, "any, "+ic.reachRecord(&own, nil))
	}
	parts = append(parts, ic.reachPairs(r.covers)...)
	return []string{"rest(" + strings.Join(parts, ", ") + ")"}
}

// containsAtom: minContains and maxContains count only beside contains,
// the lower one defaulting to one; a count no number meets admits no
// list.
func (ic *importCtx) containsAtom(o *jobj, ptr string) []string {
	if !o.has("contains") {
		return nil
	}
	c := ic.branch(o.get("contains"), importPtrAt(ptr, "contains"))
	lo := importCount(o.get("minContains"), importPtrAt(ptr, "minContains"))
	if "" == lo {
		lo = "1"
	}
	hi := importCount(o.get("maxContains"), importPtrAt(ptr, "maxContains"))
	if "" != hi {
		h, _ := new(big.Int).SetString(hi, 10)
		l, _ := new(big.Int).SetString(lo, 10)
		if h.Cmp(l) < 0 {
			return []string{"nil"}
		}
	}
	if "" == hi && "1" == lo {
		return []string{"contains(" + c + ")"}
	}
	n := lo
	if lo != hi {
		parts := []string{}
		if "0" != lo {
			parts = append(parts, "min("+lo+")")
		}
		if "" != hi {
			parts = append(parts, "max("+hi+")")
		}
		n = strings.Join(parts, " & ")
	}
	if "" == n {
		n = "min(0)"
	}
	return []string{"contains(" + c + ", " + n + ")"}
}

func importNumberBranch(o *jobj, ptr string, integral bool) string {
	bounds := []string{}
	for _, b := range [][2]string{{"minimum", "min"}, {"maximum", "max"},
		{"exclusiveMinimum", "above"}, {"exclusiveMaximum", "below"}} {
		if n := importNum(o.get(b[0]), importPtrAt(ptr, b[0])); "" != n {
			bounds = append(bounds, b[1]+"("+n+")")
		}
	}
	atoms := []string{}
	if integral {
		atoms = append(atoms, "multiple(1)")
	}
	atoms = append(atoms, bounds...)
	if d := importDivisor(o.get("multipleOf"), importPtrAt(ptr, "multipleOf")); "" != d {
		atoms = append(atoms, "multiple("+d+")")
	}
	if 0 == len(atoms) {
		return ""
	}
	return importBoth(append([]string{"number"}, atoms...))
}

func (ic *importCtx) stringBranch(o *jobj, ptr string) string {
	parts := importLens(importCount(o.get("minLength"), importPtrAt(ptr, "minLength")),
		importCount(o.get("maxLength"), importPtrAt(ptr, "maxLength")))
	if o.has("pattern") {
		if re := ic.pattern(o.get("pattern"), importPtrAt(ptr, "pattern")); "" != re {
			parts = append(parts, re)
		}
	}
	// A name JSON Schema does not define asserts nothing, as the suite asks.
	if f, isStr := o.get("format").(string); ic.formats && isStr {
		if nil != formatCheck(f) {
			parts = append(parts, "format("+importStrLit(f)+")")
		} else if fmtUnchecked[f] {
			ic.lose(importPtrAt(ptr, "format"), "format", "format "+importStrLit(f)+
				" has no checker in aontu yet, so it rides as an annotation and "+
				"the import admits strings the schema refuses")
		}
	}
	content := importRiderOf(o, ptr, true)
	branch := ""
	if 0 < len(parts) {
		branch = importBoth(append([]string{"empty()"}, parts...))
	}
	if "" == content {
		return branch
	}
	if "" == branch {
		branch = "empty()"
	}
	return "meta(" + branch + ", " + content + ")"
}

// kinds is the kind split (design section 2): each keyword applies to
// its own instance kind and passes every other, so each kind is one
// branch.
func (ic *importCtx) kinds(o *jobj, ptr string) string {
	var names []string
	if o.has("type") {
		ok := true
		switch t := o.get("type").(type) {
		case string:
			names = []string{t}
		case []any:
			for _, n := range t {
				s, isStr := n.(string)
				ok = ok && isStr && !containsStr(names, s)
				names = append(names, s)
			}
			ok = ok && 0 < len(t)
		default:
			ok = false
		}
		for _, n := range names {
			ok = ok && (containsStr(importKindOrder, n) || "integer" == n)
		}
		if !ok {
			refuseSchema(importPtrAt(ptr, "type"),
				"type must name 2020-12 types, as a string or a non-empty array")
		}
	}
	typed := o.has("type")
	allows := func(k string) bool {
		return !typed || containsStr(names, k) ||
			("number" == k && containsStr(names, "integer"))
	}
	integral := typed && containsStr(names, "integer") && !containsStr(names, "number")
	scoped := map[string]string{
		"number": importNumberBranch(o, ptr, integral),
		"string": ic.stringBranch(o, ptr),
		"object": ic.objectBranch(o, ptr),
		"array":  ic.arrayBranch(o, ptr),
	}
	bare := map[string]string{"null": "null", "boolean": "boolean",
		"number": "number", "string": "empty()", "object": "map", "array": "list"}
	branches := []string{}
	anyScoped := false
	for _, k := range importKindOrder {
		if !allows(k) {
			continue
		}
		b := scoped[k]
		if "" == b {
			b = bare[k]
		} else {
			anyScoped = true
		}
		branches = append(branches, b)
	}
	if !typed && !anyScoped {
		return ""
	}
	if 1 == len(branches) {
		return branches[0]
	}
	for n, b := range branches {
		branches[n] = importParen(b)
	}
	return "(" + strings.Join(branches, " | ") + ")"
}

// importKindsOf is the set of JSON kinds a schema can admit,
// over-approximated: an alternative whose kind no other alternative
// shares can be told apart by its kind.
func importKindsOf(node any) map[string]bool {
	ks := map[string]bool{}
	o, ok := node.(*jobj)
	if !ok {
		if true == node {
			for _, k := range importKindOrder {
				ks[k] = true
			}
		}
		return ks
	}
	for _, k := range importKindOrder {
		ks[k] = true
	}
	keep := func(s map[string]bool) {
		for k := range ks {
			if !s[k] {
				delete(ks, k)
			}
		}
	}
	if o.has("type") {
		s := map[string]bool{}
		names, isList := o.get("type").([]any)
		if !isList {
			names = []any{o.get("type")}
		}
		for _, n := range names {
			name := n.(string)
			if "integer" == name {
				name = "number"
			}
			s[name] = true
		}
		keep(s)
	}
	if o.has("const") {
		keep(map[string]bool{importJSONKind(o.get("const")): true})
	}
	if o.has("enum") {
		s := map[string]bool{}
		for _, v := range o.get("enum").([]any) {
			s[importJSONKind(v)] = true
		}
		keep(s)
	}
	all, _ := o.get("allOf").([]any)
	for _, s := range all {
		keep(importKindsOf(s))
	}
	for _, k := range []string{"anyOf", "oneOf"} {
		if o.has(k) {
			s := map[string]bool{}
			for _, b := range o.get(k).([]any) {
				for kk := range importKindsOf(b) {
					s[kk] = true
				}
			}
			keep(s)
		}
	}
	return ks
}

func importJSONKind(v any) string {
	switch v.(type) {
	case jnull:
		return "null"
	case bool:
		return "boolean"
	case jnum:
		return "number"
	case string:
		return "string"
	case []any:
		return "array"
	}
	return "object"
}

// importUnplain names what makes `|` answer differently from a count: a
// member the value may lack, a count decided at generation, a Band B
// atom, a closed container, or a reference the walk cannot see through.
var importUnplain = map[string]bool{"required": true, "minProperties": true,
	"maxProperties": true, "minItems": true, "maxItems": true, "contains": true,
	"minContains": true, "maxContains": true, "uniqueItems": true,
	"anyOf": true, "oneOf": true, "not": true, "if": true, "then": true,
	"else": true, "dependentRequired": true, "dependentSchemas": true,
	"additionalProperties": true, "unevaluatedProperties": true,
	"unevaluatedItems": true, "$ref": true, "$dynamicRef": true}

func importPlain(node any) bool {
	o, ok := node.(*jobj)
	if !ok {
		return true
	}
	for _, k := range o.keys {
		v := o.get(k)
		l, isList := v.([]any)
		empty := "required" == k && isList && 0 == len(l)
		open := true == v && strings.HasSuffix(k, "Properties")
		container := false
		if "const" == k || "enum" == k {
			vals := []any{v}
			if "enum" == k {
				vals = l
			}
			for _, x := range vals {
				_, isArr := x.([]any)
				_, isObj := x.(*jobj)
				container = container || isArr || isObj
			}
		}
		if (importUnplain[k] && !empty && !open) || container ||
			("items" == k && false == v) {
			return false
		}
	}
	subs := []any{}
	for _, k := range []string{"properties", "patternProperties"} {
		if m, isMap := o.get(k).(*jobj); isMap {
			for _, kk := range m.keys {
				subs = append(subs, m.get(kk))
			}
		}
	}
	for _, k := range []string{"prefixItems", "allOf"} {
		l, _ := o.get(k).([]any)
		subs = append(subs, l...)
	}
	for _, k := range []string{"items", "propertyNames"} {
		if o.has(k) {
			subs = append(subs, o.get(k))
		}
	}
	for _, s := range subs {
		if !importPlain(s) {
			return false
		}
	}
	return true
}

// importLiterals reads a scalar literal alternative, a `const` or an
// `enum` of scalars and nothing else, its JSON values keyed by value.
func importLiterals(node any) ([]string, bool) {
	o, ok := node.(*jobj)
	if !ok {
		return nil, false
	}
	keys := []string{}
	for _, k := range o.keys {
		if !importAnnotation[k] {
			keys = append(keys, k)
		}
	}
	var vals []any
	switch {
	case 1 == len(keys) && "const" == keys[0]:
		vals = []any{o.get("const")}
	case 1 == len(keys) && "enum" == keys[0]:
		vals = o.get("enum").([]any)
	default:
		return nil, false
	}
	out := []string{}
	for _, v := range vals {
		switch t := v.(type) {
		case jnull:
			out = append(out, "z")
		case bool:
			out = append(out, "b"+strconv.FormatBool(t))
		case jnum:
			out = append(out, "n"+importNumberText(t.text, "#"))
		case string:
			out = append(out, "s"+t)
		default:
			return nil, false
		}
	}
	return out, true
}

func importDisjoin(srcs []string) string {
	if 1 == len(srcs) {
		return srcs[0]
	}
	parts := make([]string, len(srcs))
	for i, s := range srcs {
		parts[i] = importParen(s)
	}
	return "(" + strings.Join(parts, " | ") + ")"
}

func (ic *importCtx) alternatives(o *jobj, ptr, key string) ([]any, []string) {
	at := importPtrAt(ptr, key)
	list := importSchemaList(o.get(key), at)
	srcs := make([]string, len(list))
	for n, s := range list {
		srcs[n] = ic.branch(s, importPtrAt(at, importIdx(n)))
	}
	return list, srcs
}

// anyOf is `|` where at most one alternative can survive the meet with
// any value, and a count of at least one everywhere else.
func (ic *importCtx) anyOf(o *jobj, ptr string) string {
	list, srcs := ic.alternatives(o, ptr, "anyOf")
	kinds := make([]map[string]bool, len(list))
	for n, s := range list {
		kinds[n] = importKindsOf(s)
	}
	apart := true
	for i := range kinds {
		for j := range kinds {
			for k := range kinds[i] {
				apart = apart && (i == j || !kinds[j][k])
			}
		}
	}
	lits, plain := true, true
	for _, s := range list {
		_, ok := importLiterals(s)
		lits = lits && ok
		plain = plain && importPlain(s)
	}
	if lits || (apart && plain) {
		return importDisjoin(srcs)
	}
	return "nof(min(1), " + strings.Join(srcs, ", ") + ")"
}

// oneOf is `|` only over scalar literals no alternative shares with
// another, since a scalar equals at most one of them.
func (ic *importCtx) oneOf(o *jobj, ptr string) string {
	list, srcs := ic.alternatives(o, ptr, "oneOf")
	seen := map[string]bool{}
	distinct := true
	for _, s := range list {
		l, ok := importLiterals(s)
		distinct = distinct && ok
		mine := map[string]bool{}
		for _, v := range l {
			distinct = distinct && (mine[v] || !seen[v])
			mine[v] = true
		}
		for v := range mine {
			seen[v] = true
		}
	}
	if distinct {
		return importDisjoin(srcs)
	}
	return "nof(1, " + strings.Join(srcs, ", ") + ")"
}

// not reads an `enum` or `const` beside a single `string` or `integer`
// as an exclusion the meet decides, every leaf of a number spelled, and
// anything else as a count of none; an exclusion of nothing is no part.
func (ic *importCtx) not(o *jobj, ptr string) (string, bool) {
	at := importPtrAt(ptr, "not")
	n := importSchemaOneOf(o.get("not"), at)
	src := ic.I(n, at)
	t, _ := o.get("type").(string)
	var vals []any
	typed := false
	if m, isObj := n.(*jobj); isObj {
		lits := []string{}
		for _, k := range m.keys {
			if !importAnnotation[k] {
				lits = append(lits, k)
			}
		}
		switch {
		case 1 == len(lits) && "const" == lits[0]:
			vals, typed = []any{m.get("const")}, true
		case 1 == len(lits) && "enum" == lits[0]:
			vals, typed = m.get("enum").([]any), true
		}
	}
	if typed && ("string" == t || "integer" == t) {
		spelt := []string{}
		whole := true
		for _, v := range vals {
			if "string" == t {
				if s, isStr := v.(string); isStr {
					spelt = append(spelt, importStrLit(s))
				}
				continue
			}
			num := "0d."
			if j, isNum := v.(jnum); isNum {
				num = importNumberText(j.text, at)
			}
			if strings.Contains(num, ".") {
				continue
			}
			neg := ""
			if strings.HasPrefix(num, "-") {
				neg = "-"
			}
			digits := num[len(neg):]
			if strings.HasPrefix(digits, "0d") {
				whole = false
				continue
			}
			for _, s := range []string{num, num + ".0", neg + "0d" + digits, neg + "0d" + digits + ".0"} {
				if "" != neg {
					s = "(" + s + ")"
				}
				spelt = append(spelt, s)
			}
		}
		if whole {
			if 0 == len(spelt) {
				return "", false
			}
			return "neq(" + strings.Join(spelt, ", ") + ")", true
		}
	}
	return "nof(0, " + src + ")", true
}

// conditional writes `if` with `then` or `else` as a conditional; one
// without the other asks nothing of a value.
func (ic *importCtx) conditional(o *jobj, ptr string) string {
	arm := func(k string) string { return ic.I(o.get(k), importPtrAt(ptr, k)) }
	parts := []string{ic.branch(o.get("if"), importPtrAt(ptr, "if")), "any"}
	if o.has("then") {
		parts[1] = arm("then")
	}
	if o.has("else") {
		parts = append(parts, arm("else"))
	}
	return "when(" + strings.Join(parts, ", ") + ")"
}

// dependencies writes each dependency as a conditional whose condition
// is the key's presence.
func (ic *importCtx) dependencies(o *jobj, ptr string) []string {
	out := []string{}
	sat := importPtrAt(ptr, "dependentSchemas")
	ds := importSchemaMap(o.get("dependentSchemas"), sat)
	for _, k := range ds.keys {
		out = append(out, "when({"+importStrLit(k)+": any}, "+
			ic.I(ds.get(k), importPtrAt(sat, k))+")")
	}
	if !o.has("dependentRequired") {
		return out
	}
	req, ok := o.get("dependentRequired").(*jobj)
	lists := [][]string{}
	if ok {
		for _, k := range req.keys {
			l, isList := req.get(k).([]any)
			ok = ok && isList
			seen := map[string]bool{}
			names := []string{}
			for _, n := range l {
				s, isStr := n.(string)
				ok = ok && isStr && !seen[s]
				seen[s] = true
				names = append(names, s)
			}
			lists = append(lists, names)
		}
	}
	if !ok {
		refuseSchema(importPtrAt(ptr, "dependentRequired"),
			"dependentRequired must be an object of arrays of distinct strings")
	}
	for i, k := range req.keys {
		if 0 < len(lists[i]) {
			fields := make([]string, len(lists[i]))
			for j, n := range lists[i] {
				fields[j] = importStrLit(n) + ": any"
			}
			out = append(out, "when({"+importStrLit(k)+": any}, {"+
				strings.Join(fields, ", ")+"})")
		}
	}
	return out
}

// importMeetOrNil writes a meet empty where it stands as the schema that
// admits nothing, `nil`; a meet through an alias is left to evaluation.
func importMeetOrNil(parts []string) string {
	src := importBoth(parts)
	if 2 > len(parts) || strings.Contains(src, "%") {
		return src
	}
	v, _ := New().Unify("x: " + src)
	if v.(*MapVal).peg["x"].Nil() {
		return "nil"
	}
	return src
}

// I: a schema with an identity of its own is hoisted, so that a
// declaration carries it.
// branch: a branch a rest() reads is the alias it reads, so the check
// beside it and the rest share one definition and one verdict.
func (ic *importCtx) branch(node any, ptr string) string {
	if _, ok := node.(*jobj); ok && ic.hoist[ptr] {
		return ic.use(importAnchor{node: node, ptr: ptr})
	}
	return ic.I(node, ptr)
}

func (ic *importCtx) I(node any, ptr string) string {
	if "" == ic.identity(importPlaceName(ptr), node, ptr) {
		return ic.bodyOf(node, ptr)
	}
	return ic.use(importAnchor{node: node, ptr: ptr})
}

// bodyOf reads a schema in the environment its resource makes.
func (ic *importCtx) bodyOf(node any, ptr string) string {
	outer := ic.env
	ic.env = ic.enter(outer, node)
	defer func() { ic.env = outer }()
	return ic.bodyIn(node, ptr)
}

func (ic *importCtx) bodyIn(node any, ptr string) string {
	if b, ok := node.(bool); ok {
		if b {
			return "any"
		}
		return "nil"
	}
	o, ok := node.(*jobj)
	if !ok {
		refuseSchema(ptr, "a schema must be an object or a boolean")
	}
	for _, k := range o.keys {
		if importLater[k] {
			ic.lose(importPtrAt(ptr, k), k, "not carried yet, so it is DROPPED and "+
				"the import admits instances the schema refuses")
		}
	}
	dep, isFlag := o.get("deprecated").(bool)
	if o.has("deprecated") && !isFlag {
		refuseSchema(importPtrAt(ptr, "deprecated"), "deprecated must be a boolean")
	}
	if o.has("$schema") && jsonSchemaDraft != o.get("$schema") {
		ic.lose(importPtrAt(ptr, "$schema"), "$schema", "the import reads "+
			"2020-12, so a schema for another dialect is read as 2020-12")
	}

	parts := []string{}
	if o.has("$ref") {
		place, _, _ := ic.target(o, "$ref", importPtrAt(ptr, "$ref"))
		parts = append(parts, ic.use(place))
	}
	if o.has("$dynamicRef") {
		parts = append(parts, ic.dynamicAlias(o, importPtrAt(ptr, "$dynamicRef")))
	}
	if o.has("const") {
		parts = append(parts, ic.lit(o.get("const"), importPtrAt(ptr, "const")))
	}
	if o.has("enum") {
		e, isList := o.get("enum").([]any)
		if !isList {
			refuseSchema(importPtrAt(ptr, "enum"), "enum must be an array")
		}
		lits := []string{}
		for n, v := range e {
			lits = append(lits, ic.lit(v, importPtrAt(importPtrAt(ptr, "enum"), importIdx(n))))
		}
		switch len(lits) {
		case 0:
			parts = append(parts, "nil")
		case 1:
			parts = append(parts, lits[0])
		default:
			parts = append(parts, "("+strings.Join(lits, " | ")+")")
		}
	}
	for n, s := range importSchemaList(o.get("allOf"), importPtrAt(ptr, "allOf")) {
		parts = append(parts, importParen(ic.I(s,
			importPtrAt(importPtrAt(ptr, "allOf"), importIdx(n)))))
	}
	if k := ic.kinds(o, ptr); "" != k {
		parts = append(parts, k)
	}
	if o.has("not") {
		if n, ok := ic.not(o, ptr); ok {
			parts = append(parts, n)
		}
	}
	if o.has("anyOf") {
		parts = append(parts, ic.anyOf(o, ptr))
	}
	if o.has("oneOf") {
		parts = append(parts, ic.oneOf(o, ptr))
	}
	if o.has("if") && (o.has("then") || o.has("else")) {
		parts = append(parts, ic.conditional(o, ptr))
	}
	parts = append(parts, ic.dependencies(o, ptr)...)
	src := importMeetOrNil(parts)
	if rec := importRiderOf(o, ptr, false); "" != rec {
		src = "meta(" + src + ", " + rec + ")"
	}
	if dep {
		if rec, ok := importDeprecRecord(o); ok {
			return "deprecate(" + src + ", " + rec + ")"
		}
		src = "deprecate(" + src + ")"
	}
	return src
}

// JSONSchemaImportOptions are the import's options: Defaults also makes
// a property's default its preference, where the schema does not
// require the property and the property's own schema admits it.
type JSONSchemaImportOptions struct {
	Defaults bool

	// FormatAssertion asserts each format a checker knows, as format().
	FormatAssertion bool

	// Documents holds the other documents a reference may reach, each
	// by its retrieval URI.
	Documents map[string]string
}

// ImportJSONSchema reads a JSON Schema document into aontu source,
// checked by `vet --at $.schema --no-fill --exact-numbers`.
func (a *Aontu) ImportJSONSchema(text string) SchemaImportReport {
	return a.ImportJSONSchemaWith(text, JSONSchemaImportOptions{})
}

// ImportJSONSchemaWith is ImportJSONSchema with every option. A branch a
// rest() reads that its check had already written in place is read again
// by alias, so the import runs once more with it hoisted.
func (a *Aontu) ImportJSONSchemaWith(text string, opts JSONSchemaImportOptions) SchemaImportReport {
	hoist := map[string]bool{}
	for {
		report, wanted := a.importOnce(text, opts, hoist)
		grown := false
		for p := range wanted {
			if !hoist[p] {
				hoist[p] = true
				grown = true
			}
		}
		if !grown {
			return report
		}
	}
}

func (a *Aontu) importOnce(text string, opts JSONSchemaImportOptions,
	hoist map[string]bool) (report SchemaImportReport, wanted map[string]bool) {
	ic := &importCtx{aliases: map[string]*string{}, defaults: opts.Defaults,
		formats:   opts.FormatAssertion,
		resources: map[string]importAnchor{},
		anchors:   map[string]map[string]importAnchor{},
		bases:     map[*jobj]string{}, defKeys: map[*jobj]string{},
		unread:   map[string]string{},
		dynamics: map[string]map[string]importAnchor{},
		wanted:   map[string]bool{}, hoist: hoist}
	defer func() {
		if r := recover(); nil != r {
			ref, isRefusal := r.(*importRefusal)
			if !isRefusal { //coverage:ignore a panic that is not a refusal is a defect, re-raised as it came; TypeScript's twin is reached by an argument Go's signature cannot take
				panic(r)
			}
			report = SchemaImportReport{Source: "", Lossy: []SchemaLoss{},
				Verdict: "error",
				Errors: []SchemaImportError{{Code: ref.code,
					Class: codeClass(ref.code), Path: ref.path, Message: ref.why}}}
			wanted = map[string]bool{}
		}
	}()

	ic.readDocuments(opts.Documents)
	ic.root = readSchemaJSON(text)
	ic.claim("", importAnchor{node: ic.root, ptr: "#"}, "#")
	ic.index(ic.root, "#", "")
	ic.env = ic.enter(importEnv{}, ic.root)
	ic.rootEnv = ic.env
	if root, ok := ic.root.(*jobj); ok {
		defs := importSchemaMap(root.get("$defs"), "#/$defs")
		for _, k := range defs.keys {
			ic.use(importAnchor{node: defs.get(k), ptr: importPtrAt("#/$defs", k)})
		}
	}
	inline := ic.I(ic.root, "#")
	body := inline
	if _, has := ic.aliases["_root"]; has {
		body = "%_root"
	}
	names := []string{}
	for n := range ic.aliases {
		names = append(names, n)
	}
	sort.Strings(names)
	lines := []string{}
	for _, n := range names {
		lines = append(lines, "%"+n+" = "+*ic.aliases[n])
	}
	lines = append(lines, "schema: hide("+body+")")
	source := strings.Join(lines, "\n") + "\n"

	// The import writes only source the formatter reads, so the agreed
	// form is always there to take.
	formatted := a.Format(source)

	seen := map[string]bool{}
	lossy := []SchemaLoss{}
	for _, l := range ic.lossy {
		key := l.Path + "\x00" + l.Construct
		if !seen[key] {
			seen[key] = true
			lossy = append(lossy, l)
		}
	}
	sort.SliceStable(lossy, func(i, j int) bool {
		return lossy[i].Path < lossy[j].Path
	})
	verdict := "ok"
	if 0 < len(lossy) {
		verdict = "lossy"
	}
	return SchemaImportReport{Source: formatted.Text, Lossy: lossy, Verdict: verdict},
		ic.wanted
}
