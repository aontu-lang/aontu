/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"math/big"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// JSON Schema to aontu (G12). The importer owns the meaning of
// every keyword it carries (ADR-003) and rewrites the schema into aontu
// text that generates nothing on its own. A keyword it does not yet
// carry is a reported loss, never a silent drop. Mirrors
// ts/src/jsonschema-import.ts rule for rule, so both print one text.

// ImportOptions names where the schema came from, for the report's sites.
type ImportOptions struct {
	Path string
	// Defaults makes an optional property's default a preference
	// (ADR-052).
	Defaults bool
}

// ImportReport is the import's answer, shaped like the export's.
type ImportReport struct {
	Verdict string       `json:"verdict"`
	Aontu   string       `json:"aontu"`
	Lossy   []SchemaLoss `json:"lossy"`
	// Vet holds the `vet` flags that ask JSON Schema's question of data
	// against the document. Nil on "error".
	Vet    []string     `json:"vet,omitempty"`
	Errors []VetFinding `json:"errors,omitempty"`
}

// ImportVetFlags is ImportReport.Vet on every import that stands.
var ImportVetFlags = []string{"--no-fill", "--exact-numbers"}

// jnode is the schema as a tree that keeps every number's own spelling,
// every key's order, and every node's span.
type jnode struct {
	t        string // object, array, string, number, true, false, null
	off, end int
	entries  []jentry
	items    []*jnode
	s        string // a string's value, or a number's text
}

type jentry struct {
	key string
	val *jnode
}

var jsonEscapes = map[byte]string{
	'"': "\"", '\\': "\\", '/': "/", 'b': "\b", 'f': "\f", 'n': "\n", 'r': "\r", 't': "\t",
}

var jsonNumberTokenRe = regexp.MustCompile(
	`^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?`)

type jsonParser struct {
	src      string
	i        int
	why      string
	fault    int
	faultEnd int
	// deep: a container nested past the bound, a budget fault rather
	// than a syntax one.
	deep bool
}

const importJSONDepth = 256

func (p *jsonParser) fail(why string, at int) *jnode {
	p.why = why
	p.fault = at
	return nil
}

// failSpan is a fault that names a whole token, as a duplicate key does.
func (p *jsonParser) failSpan(why string, at, end int) *jnode {
	p.faultEnd = end
	return p.fail(why, at)
}

func (p *jsonParser) skip() {
	for p.i < len(p.src) && (' ' == p.src[p.i] || '\t' == p.src[p.i] ||
		'\n' == p.src[p.i] || '\r' == p.src[p.i]) {
		p.i++
	}
}

func (p *jsonParser) hex4(at int) int {
	if len(p.src) < at+4 {
		return -1
	}
	n, err := strconv.ParseUint(p.src[at:at+4], 16, 32)
	if nil != err || strings.ContainsAny(p.src[at:at+4], "+-xX_") {
		return -1
	}
	return int(n)
}

func (p *jsonParser) at(i int) byte {
	if i < len(p.src) {
		return p.src[i]
	}
	return 0
}

func (p *jsonParser) str() (string, bool) {
	start := p.i
	p.i++
	var out strings.Builder
	for p.i < len(p.src) {
		c := p.src[p.i]
		if '"' == c {
			p.i++
			return out.String(), true
		}
		if '\\' == c {
			e := p.at(p.i + 1)
			if 'u' == e {
				cp := p.hex4(p.i + 2)
				if cp < 0 {
					p.fail("a \\u escape without four hex digits", p.i)
					return "", false
				}
				p.i += 6
				// A pair of escapes is one code point; a lone half is not one.
				if 0xd800 <= cp && cp < 0xdc00 && '\\' == p.at(p.i) && 'u' == p.at(p.i+1) {
					if lo := p.hex4(p.i + 2); 0xdc00 <= lo && lo < 0xe000 {
						cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00)
						p.i += 6
					}
				}
				if 0xd800 <= cp && cp < 0xe000 {
					cp = 0xfffd
				}
				out.WriteRune(rune(cp))
				continue
			}
			esc, ok := jsonEscapes[e]
			if !ok || p.i+1 >= len(p.src) {
				p.fail("an escape JSON does not have", p.i)
				return "", false
			}
			out.WriteString(esc)
			p.i += 2
			continue
		}
		if c < ' ' {
			p.fail("a control character inside a string", p.i)
			return "", false
		}
		out.WriteByte(c)
		p.i++
	}
	p.fail("an unterminated string", start)
	return "", false
}

func (p *jsonParser) value(depth int) *jnode {
	p.skip()
	off := p.i
	if len(p.src) <= p.i {
		return p.fail("a value is missing", p.i)
	}
	c := p.src[p.i]
	if ('{' == c || '[' == c) && importJSONDepth <= depth {
		p.deep = true
		return p.fail("nested too deep", off)
	}
	if '{' == c {
		p.i++
		node := &jnode{t: "object", off: off, entries: []jentry{}}
		p.skip()
		if '}' == p.at(p.i) {
			p.i++
			node.end = p.i
			return node
		}
		for {
			p.skip()
			if '"' != p.at(p.i) {
				return p.fail("an object key must be a string", p.i)
			}
			keyOff := p.i
			key, ok := p.str()
			if !ok {
				return nil
			}
			for _, en := range node.entries {
				if en.key == key {
					return p.failSpan("a duplicate key", keyOff, p.i)
				}
			}
			p.skip()
			if ':' != p.at(p.i) {
				return p.fail("a colon is missing", p.i)
			}
			p.i++
			val := p.value(depth + 1)
			if nil == val {
				return nil
			}
			node.entries = append(node.entries, jentry{key: key, val: val})
			p.skip()
			if ',' == p.at(p.i) {
				p.i++
				continue
			}
			if '}' == p.at(p.i) {
				p.i++
				node.end = p.i
				return node
			}
			return p.fail("a comma or a closing brace is missing", p.i)
		}
	}
	if '[' == c {
		p.i++
		node := &jnode{t: "array", off: off, items: []*jnode{}}
		p.skip()
		if ']' == p.at(p.i) {
			p.i++
			node.end = p.i
			return node
		}
		for {
			it := p.value(depth + 1)
			if nil == it {
				return nil
			}
			node.items = append(node.items, it)
			p.skip()
			if ',' == p.at(p.i) {
				p.i++
				continue
			}
			if ']' == p.at(p.i) {
				p.i++
				node.end = p.i
				return node
			}
			return p.fail("a comma or a closing bracket is missing", p.i)
		}
	}
	if '"' == c {
		s, ok := p.str()
		if !ok {
			return nil
		}
		return &jnode{t: "string", s: s, off: off, end: p.i}
	}
	for _, word := range []string{"true", "false", "null"} {
		if strings.HasPrefix(p.src[p.i:], word) {
			p.i += len(word)
			return &jnode{t: word, off: off, end: p.i}
		}
	}
	if num := jsonNumberTokenRe.FindString(p.src[p.i:]); "" != num {
		p.i += len(num)
		return &jnode{t: "number", s: num, off: off, end: p.i}
	}
	return p.fail("an unexpected character", p.i)
}

func parseSchemaJSON(src string) (*jnode, *jsonParser) {
	p := &jsonParser{src: src}
	out := p.value(0)
	if nil != out {
		p.skip()
		if p.i < len(src) {
			p.fail("text after the document", p.i)
			return nil, p
		}
	}
	return out, p
}

// ixpr is the expression tree the importer writes, printed by one rule
// so both ports produce the same bytes.
type ixpr struct {
	k       string // raw, and, or, call, list, map
	text    string
	items   []*ixpr
	name    string
	lit     bool // a literal list, whose members are items
	spread  *ixpr
	entries []ientry
	spreads []*ixpr
	decls   []string
}

type ientry struct {
	key      string
	optional bool
	val      *ixpr
}

func iraw(text string) *ixpr { return &ixpr{k: "raw", text: text} }

var (
	iAny = iraw("any")
	iNil = iraw("nil")
)

func icall(name string, args ...*ixpr) *ixpr {
	return &ixpr{k: "call", name: name, items: args}
}

func isRawText(e *ixpr, text string) bool { return "raw" == e.k && text == e.text }

// distinct keeps one of each member written twice, in a meet or a
// disjunction.
func distinct(items []*ixpr) []*ixpr {
	seen := map[string]bool{}
	out := []*ixpr{}
	for _, it := range items {
		if text := iprint(it, ""); !seen[text] {
			seen[text] = true
			out = append(out, it)
		}
	}
	return out
}

// iand: `any` adds nothing to a meet and `nil` is all of it.
func iand(items []*ixpr) *ixpr {
	flat := []*ixpr{}
	for _, it := range items {
		if "and" == it.k {
			flat = append(flat, it.items...)
		} else if !isRawText(it, "any") {
			flat = append(flat, it)
		}
	}
	for _, it := range flat {
		if isRawText(it, "nil") {
			return iNil
		}
	}
	uniq := distinct(flat)
	switch len(uniq) {
	case 0:
		return iAny
	case 1:
		return uniq[0]
	}
	return &ixpr{k: "and", items: uniq}
}

func ior(items []*ixpr) *ixpr {
	uniq := distinct(items)
	if 1 == len(uniq) {
		return uniq[0]
	}
	return &ixpr{k: "or", items: uniq}
}

// importGroup bounds a written chain: a longer one is nested groups, so
// a parser reading it recurses as deep as the groups, not the chain.
const importGroup = 32

// importQuote escapes the quote, the backslash, the controls and the
// line separators, and writes every other character as itself.
func importQuote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case '"' == r:
			b.WriteString("\\\"")
		case '\\' == r:
			b.WriteString("\\\\")
		case '\n' == r:
			b.WriteString("\\n")
		case '\r' == r:
			b.WriteString("\\r")
		case '\t' == r:
			b.WriteString("\\t")
		case r < 0x20 || 0x2028 == r || 0x2029 == r:
			fmt.Fprintf(&b, "\\u%04x", r)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

func iprint(e *ixpr, indent string) string {
	var b strings.Builder
	iwrite(&b, e, indent)
	return b.String()
}

// iwrite writes a node into one builder, so a deep schema's text is
// copied once rather than once per level that holds it.
func iwrite(b *strings.Builder, e *ixpr, indent string) {
	switch e.k {
	case "call":
		b.WriteString(e.name + "(")
		for i, a := range e.items {
			if 0 < i {
				b.WriteString(", ")
			}
			// The TypeScript parser cannot read a call of three or more whose
			// first argument and a later one are negative (test/spec/divergent.tsv).
			if 0 == i && 3 <= len(e.items) && "raw" == a.k && strings.HasPrefix(a.text, "-") {
				b.WriteString("(" + a.text + ")")
				continue
			}
			iwrite(b, a, indent)
		}
		b.WriteString(")")
	case "and":
		iwriteChain(b, e.items, " & ", indent, iwriteLevel(len(e.items)), true)
	case "or":
		iwriteChain(b, e.items, " | ", indent, iwriteLevel(len(e.items)), false)
	case "list":
		if e.lit {
			b.WriteString("[")
			for i, it := range e.items {
				if 0 < i {
					b.WriteString(", ")
				}
				iwrite(b, it, indent)
			}
			b.WriteString("]")
			return
		}
		b.WriteString("[&: ")
		iwrite(b, e.spread, indent)
		b.WriteString("]")
	case "map":
		if 0 == len(e.entries) && 0 == len(e.spreads) && 0 == len(e.decls) {
			b.WriteString("{}")
			return
		}
		b.WriteString("{\n")
		iwriteLines(b, e, indent+"  ")
		b.WriteString(indent + "}")
	default:
		b.WriteString(e.text)
	}
}

// iwriteLines writes a map's members, each on a line of its own.
func iwriteLines(b *strings.Builder, e *ixpr, in string) {
	for _, d := range e.decls {
		b.WriteString(in + d + "\n")
	}
	for _, en := range e.entries {
		opt := ""
		if en.optional {
			opt = "?"
		}
		b.WriteString(in + importQuote(en.key) + opt + ": ")
		iwrite(b, en.val, in)
		b.WriteString("\n")
	}
	for _, sp := range e.spreads {
		b.WriteString(in + "&: ")
		iwrite(b, sp, in)
		b.WriteString("\n")
	}
}

// iwriteLevel is the grouping level of a chain's top: its parts each
// cover importGroup^level members, and there are at most importGroup.
func iwriteLevel(n int) int {
	level, span := 0, 1
	for importGroup*span < n {
		level++
		span *= importGroup
	}
	return level
}

// iwriteChain writes members as ichain would join their texts: past
// importGroup of them, nested groups of at most importGroup each.
func iwriteChain(b *strings.Builder, items []*ixpr, sep, indent string, level int, and bool) {
	span := 1
	for i := 0; i < level; i++ {
		span *= importGroup
	}
	for i := 0; i < len(items); i += span {
		if 0 < i {
			b.WriteString(sep)
		}
		end := min(i+span, len(items))
		if 0 < level {
			b.WriteString("(")
			iwriteChain(b, items[i:end], sep, indent, level-1, and)
			b.WriteString(")")
		} else if and && "or" == items[i].k {
			b.WriteString("(")
			iwrite(b, items[i], indent)
			b.WriteString(")")
		} else {
			iwrite(b, items[i], indent)
		}
	}
}

// encodeAliasName writes every character outside [A-Za-z0-9] as its
// code point between underscores, so distinct targets never share a name.
func encodeAliasName(s string) string {
	var b strings.Builder
	for _, r := range s {
		if ('A' <= r && r <= 'Z') || ('a' <= r && r <= 'z') || ('0' <= r && r <= '9') {
			b.WriteRune(r)
		} else {
			fmt.Fprintf(&b, "_%x_", r)
		}
	}
	return b.String()
}

type importTarget struct {
	name string
	node *jnode
	ptr  string
}

type importCtx struct {
	src     string
	file    string
	root    *jnode
	lossy   []SchemaLoss
	errors  []VetFinding
	anchors map[*jnode]map[string]*jnode
	// Anchors belong to a resource: the document, or a subschema with `$id`.
	resourceOf map[*jnode]*jnode
	ptrOf      map[*jnode]string
	targets    map[*jnode]*importTarget
	// A map root declares each target once; any other root copies it in
	// place and cuts a cycle.
	mapRoot bool
	decls   map[string]string
	stack   []*jnode
	copies  int
	// defaults is ImportOptions.Defaults.
	defaults bool
}

// importCopyBudget is the copies a root that is not a map may make.
const importCopyBudget = 4096

func (ctx *importCtx) fail(code, path, message string, off, end int) {
	row, col := rowCol(ctx.src, off)
	text := ctx.src[off:end]
	f := VetFinding{
		Class: codeClass(code), Code: code, Message: message, Path: path,
		Severity: "error",
		Sites: []VetSite{{Col: col, File: ctx.file, Len: utf16Len(text),
			Role: VetRoleSchema, Row: row, Src: text, Value: text}},
	}
	f.Hint = hintOf(code, nil)
	ctx.errors = append(ctx.errors, f)
}

func (ctx *importCtx) wrongType(path, keyword, what string, node *jnode) {
	ctx.fail("jsonschema_schema", path, "The keyword "+keyword+" takes "+what+".",
		node.off, node.end)
}

func (ctx *importCtx) lose(path, construct, reason string) {
	for _, l := range ctx.lossy {
		if l.Path == path && l.Construct == construct {
			return
		}
	}
	ctx.lossy = append(ctx.lossy, SchemaLoss{Path: path, Construct: construct, Reason: reason})
}

func jentryOf(node *jnode, key string) *jnode {
	if "object" != node.t {
		return nil
	}
	for _, e := range node.entries {
		if e.key == key {
			return e.val
		}
	}
	return nil
}

var pointerEscaper = strings.NewReplacer("~", "~0", "/", "~1")
var pointerUnescaper = strings.NewReplacer("~1", "/", "~0", "~")

func ptrChild(ptr, key string) string { return ptr + "/" + pointerEscaper.Replace(key) }

// The keywords whose values are schemas, walked for identifiers.
var (
	schemaKeys = []string{
		"additionalProperties", "items", "propertyNames", "not", "if", "then",
		"else", "contains", "unevaluatedItems", "unevaluatedProperties",
	}
	schemaMapKeys = []string{
		"properties", "patternProperties", "$defs", "definitions", "dependentSchemas",
	}
	schemaListKeys = []string{"prefixItems", "allOf", "anyOf", "oneOf"}
)

func inList(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func subschemas(node *jnode, ptr string, visit func(*jnode, string)) {
	if "object" != node.t {
		return
	}
	for _, e := range node.entries {
		switch {
		case inList(schemaKeys, e.key):
			visit(e.val, ptrChild(ptr, e.key))
		case inList(schemaMapKeys, e.key) && "object" == e.val.t:
			for _, m := range e.val.entries {
				visit(m.val, ptrChild(ptrChild(ptr, e.key), m.key))
			}
		case inList(schemaListKeys, e.key) && "array" == e.val.t:
			for i, it := range e.val.items {
				visit(it, ptrChild(ptr, e.key)+"/"+strconv.Itoa(i))
			}
		}
	}
}

func (ctx *importCtx) index(node *jnode, ptr string, resource *jnode) {
	ctx.ptrOf[node] = ptr
	if "object" != node.t {
		return
	}
	here := resource
	if id := jentryOf(node, "$id"); node == ctx.root || (nil != id && "string" == id.t) {
		here = node
	}
	ctx.resourceOf[node] = here
	if anchor := jentryOf(node, "$anchor"); nil != anchor {
		if "string" != anchor.t {
			ctx.wrongType(ptrChild(ptr, "$anchor"), "$anchor", "a string", anchor)
		} else {
			names := ctx.anchors[here]
			if nil == names {
				names = map[string]*jnode{}
				ctx.anchors[here] = names
			}
			if _, dup := names[anchor.s]; dup {
				ctx.fail("jsonschema_duplicate", ptrChild(ptr, "$anchor"),
					"The anchor "+importQuote(anchor.s)+" is declared twice in one resource.",
					anchor.off, anchor.end)
			} else {
				names[anchor.s] = node
			}
		}
	}
	subschemas(node, ptr, func(n *jnode, p string) { ctx.index(n, p, here) })
}

func percentDecode(s string) (string, bool) {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if '%' == s[i] {
			if len(s) < i+3 {
				return "", false
			}
			b, err := strconv.ParseUint(s[i+1:i+3], 16, 8)
			if nil != err || strings.ContainsAny(s[i+1:i+3], "+-") {
				return "", false
			}
			out = append(out, byte(b))
			i += 2
		} else {
			out = append(out, s[i])
		}
	}
	return string(out), utf8.Valid(out)
}

var arrayIndexRe = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

// resolveRef finds a local reference: the referrer's resource, a pointer
// into it, or one of its anchors. Anything with a URI in front waits on
// the document set (phase 9).
func (ctx *importCtx) resolveRef(from *jnode, ref string) *jnode {
	base := ctx.resourceOf[from]
	if nil == base {
		base = ctx.root
	}
	if !strings.HasPrefix(ref, "#") {
		return nil
	}
	frag, ok := percentDecode(ref[1:])
	if !ok {
		return nil
	}
	if "" == frag {
		return base
	}
	if !strings.HasPrefix(frag, "/") {
		return ctx.anchors[base][frag]
	}
	node := base
	for _, tok := range strings.Split(frag[1:], "/") {
		key := pointerUnescaper.Replace(tok)
		switch {
		case "object" == node.t:
			node = jentryOf(node, key)
		case "array" == node.t && arrayIndexRe.MatchString(key):
			i, err := strconv.Atoi(key)
			if nil != err || len(node.items) <= i {
				return nil
			}
			node = node.items[i]
		default:
			node = nil
		}
		if nil == node {
			return nil
		}
	}
	return node
}

var defsPtrRe = regexp.MustCompile(`^#/\$defs/([^/]+)$`)

func (ctx *importCtx) targetName(node *jnode, ptr string) string {
	if node == ctx.root {
		return "root"
	}
	// An anchor names its target only in the document's own resource:
	// another resource may declare the same name.
	if anchor := jentryOf(node, "$anchor"); nil != anchor && "string" == anchor.t &&
		ctx.resourceOf[node] == ctx.root && ctx.anchors[ctx.root][anchor.s] == node {
		return "a_" + encodeAliasName(anchor.s)
	}
	if m := defsPtrRe.FindStringSubmatch(ptr); nil != m {
		return "d_" + encodeAliasName(pointerUnescaper.Replace(m[1]))
	}
	return "p_" + encodeAliasName(strings.TrimPrefix(ptr, "#/"))
}

// collectRefs finds every target, including one reached only through
// another target.
func (ctx *importCtx) collectRefs(node *jnode, seen map[*jnode]bool) {
	if seen[node] {
		return
	}
	seen[node] = true
	if ref := jentryOf(node, "$ref"); nil != ref && "string" == ref.t {
		if target := ctx.resolveRef(node, ref.s); nil != target {
			if _, known := ctx.targets[target]; !known {
				// A target outside every schema position is named by the reference.
				ptr, ok := ctx.ptrOf[target]
				if !ok {
					ptr = ref.s
				}
				ctx.targets[target] = &importTarget{
					name: ctx.targetName(target, ptr), node: target, ptr: ptr}
			}
			ctx.collectRefs(target, seen)
		}
	}
	subschemas(node, "", func(n *jnode, _ string) { ctx.collectRefs(n, seen) })
}

// What each keyword the importer does not yet carry costs, for its loss.
const importNotYet = "the importer does not carry this keyword yet, so it is dropped " +
	"and the position admits more than the schema does"

// importLegacy is a legacy dialect's keyword, which asserts there though
// the dialect read here takes it as an annotation.
const importLegacy = "a keyword of an earlier dialect, which 2020-12 does not define, " +
	"so it is dropped and the position admits more than that dialect does"

var importLater = map[string]string{
	"$dynamicRef": importNotYet, "$dynamicAnchor": importNotYet,
	"unevaluatedProperties": importNotYet, "unevaluatedItems": importNotYet,
	"$id": "a resource identifier, and references resolve within this document " +
		"only, so it is dropped",
	"$vocabulary": "a vocabulary declaration, and the 2020-12 vocabularies are read " +
		"whatever it says, so it is dropped",
	"dependencies": importLegacy, "additionalItems": importLegacy,
	"$recursiveRef": importLegacy, "$recursiveAnchor": importLegacy,
}

// importAnnotated is each annotation keyword's meta() key and the JSON
// kind it takes.
var importAnnotated = map[string][2]string{
	"title": {"title", "string"}, "description": {"description", "string"},
	"$comment": {"comment", "string"}, "default": {"default", "any"},
	"examples": {"examples", "array"}, "readOnly": {"readOnly", "boolean"},
	"writeOnly": {"writeOnly", "boolean"}, "format": {"format", "string"},
	"contentEncoding":  {"contentEncoding", "string"},
	"contentMediaType": {"contentMediaType", "string"}, "contentSchema": {"contentSchema", "any"},
}

var importKindText = map[string]string{
	"string": "a string", "boolean": "a boolean", "array": "an array", "object": "an object",
}

var importCarried = []string{
	"$schema", "$ref", "$defs", "definitions", "$anchor", "type", "deprecated",
	"x-aontu-deprecate",
	"enum", "const", "allOf", "anyOf", "oneOf", "not", "if", "then", "else",
	"dependentSchemas", "dependentRequired", "properties", "required",
	"additionalProperties",
	"patternProperties", "propertyNames", "minProperties", "maxProperties",
	"prefixItems", "items", "minItems", "maxItems", "contains", "minContains",
	"maxContains", "uniqueItems", "minimum", "maximum",
	"exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength",
	"pattern",
}

const importDraft = "https://json-schema.org/draft/2020-12/schema"

var importKinds = []string{"null", "boolean", "number", "string", "object", "array"}

var importScoped = map[string][]string{
	"string": {"minLength", "maxLength", "pattern"},
	"number": {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"},
	"object": {"properties", "required", "additionalProperties", "patternProperties",
		"propertyNames", "minProperties", "maxProperties"},
	"array": {"prefixItems", "items", "minItems", "maxItems", "contains", "minContains",
		"maxContains", "uniqueItems"},
}

// ecmaSpace is what `\s` means in a JSON Schema pattern, as a class body
// both engines read alike; ecmaDot excludes the line terminators.
const (
	ecmaSpace = "\\t\\n\\v\\f\\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
	ecmaDot   = "[^\\n\\r\u2028\u2029]"
	reMeta    = "\\.+*?()[]{}|^$/-"
)

func escapeReChar(cp rune) string {
	switch {
	case cp < 0x80 && strings.ContainsRune(reMeta, cp):
		return "\\" + string(cp)
	case cp < 0x20 || 0x7f == cp:
		return fmt.Sprintf("\\x%02x", cp)
	}
	return string(cp)
}

func isAsciiDigit(c byte) bool  { return '0' <= c && c <= '9' }
func isAsciiLetter(c byte) bool { return ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') }

// ecmaToPortable is stage two of the pattern crossing: ECMA constructs
// the portable subset does not spell are rewritten to what they mean.
func ecmaToPortable(src string) (string, string) {
	var out strings.Builder
	inClass := false
	at := func(i int) byte {
		if i < len(src) {
			return src[i]
		}
		return 0
	}
	for i := 0; i < len(src); i++ {
		c := src[i]
		if '\\' == c {
			n := at(i + 1)
			if 's' == n || 'S' == n {
				if inClass && 'S' == n {
					return "", "a negated \\S inside a character class"
				}
				switch {
				case inClass:
					out.WriteString(ecmaSpace)
				case 's' == n:
					out.WriteString("[" + ecmaSpace + "]")
				default:
					out.WriteString("[^" + ecmaSpace + "]")
				}
				i++
				continue
			}
			if 'u' == n {
				cp, l := unicodeEscape(src, i)
				if cp < 0 {
					return "", "a \\u escape that names no code point"
				}
				out.WriteString(escapeReChar(rune(cp)))
				i += l - 1
				continue
			}
			if 'c' == n && isAsciiLetter(at(i+2)) {
				out.WriteString(escapeReChar(rune(at(i+2) % 32)))
				i += 2
				continue
			}
			if '0' == n && !isAsciiDigit(at(i+2)) {
				out.WriteString("\\x00")
				i++
				continue
			}
			out.WriteByte(c)
			if i+1 < len(src) {
				out.WriteByte(n)
			}
			i++
			continue
		}
		if inClass {
			inClass = ']' != c
			out.WriteByte(c)
			continue
		}
		if '[' == c {
			inClass = true
			out.WriteByte(c)
			continue
		}
		if '.' == c {
			out.WriteString(ecmaDot)
			continue
		}
		if '(' == c && strings.HasPrefix(src[i:], "(?<") && '=' != at(i+3) && '!' != at(i+3) {
			end := strings.IndexByte(src[i+3:], '>')
			if -1 == end {
				return "", "an unterminated group name"
			}
			out.WriteString("(?:")
			i = i + 3 + end
			continue
		}
		if '(' == c {
			if folded, end, ok := foldCharGroup(src, i); ok {
				out.WriteString(folded)
				i = end
				continue
			}
		}
		out.WriteByte(c)
	}
	return out.String(), ""
}

var hex4Re = regexp.MustCompile(`^[0-9a-fA-F]{4}`)
var hexBraceRe = regexp.MustCompile(`^[0-9a-fA-F]{1,6}$`)
var lowSurrogateRe = regexp.MustCompile(`^\\u([dD][c-fC-F][0-9a-fA-F]{2})`)

// unicodeEscape reads `\uHHHH`, a surrogate pair of them, or `\u{H...}`:
// the code point and the source length, or -1.
func unicodeEscape(src string, i int) (int, int) {
	if i+2 < len(src) && '{' == src[i+2] {
		end := strings.IndexByte(src[i+3:], '}')
		hex := ""
		if -1 != end {
			hex = src[i+3 : i+3+end]
		}
		if !hexBraceRe.MatchString(hex) {
			return -1, 0
		}
		cp, _ := strconv.ParseUint(hex, 16, 32)
		if 0x10ffff < cp {
			return -1, 0
		}
		return int(cp), end + 4
	}
	if !hex4Re.MatchString(src[i+2:]) {
		return -1, 0
	}
	hi, _ := strconv.ParseUint(src[i+2:i+6], 16, 32)
	if m := lowSurrogateRe.FindStringSubmatch(src[i+6:]); 0xd800 <= hi && hi < 0xdc00 && nil != m {
		lo, _ := strconv.ParseUint(m[1], 16, 32)
		return 0x10000 + ((int(hi) - 0xd800) << 10) + (int(lo) - 0xdc00), 12
	}
	return int(hi), 6
}

// foldCharGroup writes `(a|b|c)` before a quantifier, every alternative
// one character, as the class `[abc]`: the quantified alternation the
// subset refuses, as a class with the same language.
func foldCharGroup(src string, at int) (string, int, bool) {
	i := at + 1
	if strings.HasPrefix(src[i:], "?:") {
		i += 2
	}
	members := []string{}
	for {
		if len(src) <= i {
			return "", 0, false
		}
		var one string
		if '\\' == src[i] {
			if len(src) <= i+1 || strings.IndexByte("dDwWsSuxcpPbBk0123456789", src[i+1]) >= 0 {
				return "", 0, false
			}
			one = src[i : i+2]
			i += 2
		} else if strings.IndexByte("()[]|*+?{}^$.", src[i]) >= 0 {
			return "", 0, false
		} else {
			_, size := utf8.DecodeRuneInString(src[i:])
			one = src[i : i+size]
			i += size
		}
		if "-" == one {
			one = "\\-"
		}
		members = append(members, one)
		if i < len(src) && '|' == src[i] {
			i++
			continue
		}
		if len(src) <= i || ')' != src[i] {
			return "", 0, false
		}
		break
	}
	q := byte(0)
	if i+1 < len(src) {
		q = src[i+1]
	}
	if len(members) < 2 || !('*' == q || '+' == q || '?' == q || '{' == q) {
		return "", 0, false
	}
	return "[" + strings.Join(members, "") + "]", i, true
}

func (ctx *importCtx) pattern(path, construct, src string) *ixpr {
	portable, why := ecmaToPortable(src)
	if "" == why {
		_, why = normaliseRe(portable)
	}
	if "" != why {
		ctx.lose(path, construct, "the pattern is outside the portable regex subset, "+
			"so it is dropped: it holds "+why)
		return nil
	}
	return icall("re", iraw(importQuote(portable)))
}

// exactText is a JSON number's text, which the reader has already
// matched, as the aontu literal of its exact value.
func exactText(src string) (string, bool) {
	n, _ := readExactNumber(src)
	return exactNumberText(n)
}

// number is a schema number as the aontu literal of its exact value.
func (ctx *importCtx) number(path, keyword string, node *jnode) (string, bool) {
	if "number" != node.t {
		ctx.wrongType(path, keyword, "a number", node)
		return "", false
	}
	text, ok := exactText(node.s)
	if !ok {
		ctx.lose(path, keyword, "the number "+node.s+
			" exceeds the exactness budget, so the keyword is dropped")
	}
	return text, ok
}

var countTextRe = regexp.MustCompile(`^(0d)?[0-9]+$`)

func (ctx *importCtx) count(path, keyword string, node *jnode) (string, bool) {
	text, ok := ctx.number(path, keyword, node)
	if ok && !countTextRe.MatchString(text) {
		ctx.wrongType(path, keyword, "a non-negative integer", node)
		return "", false
	}
	return text, ok
}

// literal is a JSON value as the aontu literal that admits exactly it: a
// closed container, or the scalar in the leaf its value selects. A
// number past the exactness budget equals no number in the data, so it
// is `nil`.
func (ctx *importCtx) literal(path, keyword string, node *jnode) *ixpr {
	switch node.t {
	case "string":
		return iraw(importQuote(node.s))
	case "number":
		text, ok := exactText(node.s)
		if !ok {
			ctx.lose(path, keyword, "the number "+node.s+" exceeds the "+
				"exactness budget, and no number in the data can equal it")
			return iNil
		}
		return iraw(text)
	case "array":
		items := make([]*ixpr, len(node.items))
		for i, it := range node.items {
			items[i] = ctx.literal(path+"/"+strconv.Itoa(i), keyword, it)
		}
		return icall("close", &ixpr{k: "list", lit: true, items: items})
	case "object":
		entries := make([]ientry, len(node.entries))
		for i, e := range node.entries {
			entries[i] = ientry{key: e.key, val: ctx.literal(ptrChild(path, e.key), keyword, e.val)}
		}
		return icall("close", &ixpr{k: "map", entries: entries})
	}
	return iraw(node.t)
}

// kindsOf is the JSON kinds an expression can admit, read from its shape:
// a kind, a literal, a container, or a meet or disjunction of them. An
// alias or a call that names no kind may be anything.
func kindsOf(e *ixpr) []string {
	switch e.k {
	case "raw":
		return rawKinds(e.text)
	case "and":
		out := importKinds
		for _, it := range e.items {
			ik := kindsOf(it)
			kept := []string{}
			for _, k := range out {
				if inList(ik, k) {
					kept = append(kept, k)
				}
			}
			out = kept
		}
		return out
	case "or":
		out := []string{}
		for _, k := range importKinds {
			for _, it := range e.items {
				if inList(kindsOf(it), k) {
					out = append(out, k)
					break
				}
			}
		}
		return out
	case "call":
		switch e.name {
		case "empty", "re":
			return []string{"string"}
		case "close", "meta", "deprecate":
			return kindsOf(e.items[0])
		case "min", "max", "above", "below", "multiple":
			return []string{"number"}
		}
		return importKinds
	case "list":
		return []string{"array"}
	}
	return []string{"object"}
}

var importNumberText = regexp.MustCompile(`^-?[0-9]`)

var rawKindTable = map[string][]string{
	"nil": {}, "true": {"boolean"}, "false": {"boolean"}, "null": {"null"},
	"boolean": {"boolean"}, "number": {"number"}, "map": {"object"}, "list": {"array"},
}

func rawKinds(text string) []string {
	if kinds, ok := rawKindTable[text]; ok {
		return kinds
	}
	switch {
	case strings.HasPrefix(text, "\""):
		return []string{"string"}
	case importNumberText.MatchString(text):
		return []string{"number"}
	}
	return importKinds
}

// literalTexts is the scalar literals an expression is, where it is
// nothing else.
func literalTexts(e *ixpr) ([]string, bool) {
	if isRider(e) {
		return literalTexts(e.items[0])
	}
	if "or" == e.k {
		out := []string{}
		for _, it := range e.items {
			t, ok := literalTexts(it)
			if !ok {
				return nil, false
			}
			out = append(out, t...)
		}
		return out, true
	}
	if "raw" == e.k && ("null" == e.text || "true" == e.text || "false" == e.text ||
		strings.HasPrefix(e.text, "\"") || importNumberText.MatchString(e.text)) {
		return []string{e.text}, true
	}
	return nil, false
}

// isRider reports a call whose value is its first argument, carrying a
// record beside it.
func isRider(e *ixpr) bool {
	return "call" == e.k && ("meta" == e.name || "deprecate" == e.name)
}

// someExpr reports whether any expression directly inside e answers test;
// a rider's record holds none.
func someExpr(e *ixpr, test func(*ixpr) bool) bool {
	if isRider(e) {
		return test(e.items[0])
	}
	for _, it := range e.items {
		if test(it) {
			return true
		}
	}
	if nil != e.spread && test(e.spread) {
		return true
	}
	for _, en := range e.entries {
		if test(en.val) {
			return true
		}
	}
	for _, sp := range e.spreads {
		if test(sp) {
			return true
		}
	}
	return false
}

func holdsNilExpr(e *ixpr) bool {
	return isRawText(e, "nil") || someExpr(e, holdsNilExpr)
}

func holdsAlias(e *ixpr) bool {
	return ("raw" == e.k && strings.HasPrefix(e.text, "%")) || someExpr(e, holdsAlias)
}

// blocker reports what makes a branch's meet with an instance depend on
// more than its kind, at any depth: a required key, a container's count,
// a Band B atom, closure, or an alias, which may hold any of them.
func blocker(e *ixpr) bool {
	counted := false
	if "and" == e.k {
		for _, it := range e.items {
			counted = counted || ("call" == it.k && "len" == it.name)
		}
		counted = counted && !inList(kindsOf(e), "string")
	}
	closed := false
	switch e.k {
	case "list":
		closed = e.lit || holdsNilExpr(e.spread)
	case "map":
		for _, en := range e.entries {
			closed = closed || !en.optional
		}
		for _, sp := range e.spreads {
			closed = closed || holdsNilExpr(sp)
		}
	case "call":
		closed = inList([]string{"nof", "must", "when", "close", "contains", "unique"}, e.name)
	}
	return ("raw" == e.k && strings.HasPrefix(e.text, "%")) || counted || closed ||
		someExpr(e, blocker)
}

// importAnyOf is `|` where at most one branch can survive a meet with any
// instance, and a count of at least one otherwise.
func importAnyOf(branches []*ixpr) *ixpr {
	live := []*ixpr{}
	for _, b := range branches {
		if !isRawText(b, "nil") {
			live = append(live, b)
		}
	}
	literal, disjoint := true, true
	for i, b := range live {
		if _, ok := literalTexts(b); !ok {
			literal = false
		}
		disjoint = disjoint && !blocker(b)
		for _, c := range live[i+1:] {
			for _, k := range kindsOf(b) {
				disjoint = disjoint && !inList(kindsOf(c), k)
			}
		}
	}
	switch {
	case 0 == len(live):
		return iNil
	case literal || disjoint:
		return ior(live)
	}
	return icall("nof", append([]*ixpr{icall("min", iraw("1"))}, branches...)...)
}

// importOneOf is a count of exactly one, or `|` over scalar literals that
// are pairwise distinct, since a scalar equals at most one of them.
func importOneOf(branches []*ixpr) *ixpr {
	seen := map[string]bool{}
	distinct := true
	for _, b := range branches {
		texts, ok := literalTexts(b)
		distinct = distinct && ok
		for _, t := range texts {
			distinct = distinct && !seen[t]
			seen[t] = true
		}
	}
	if distinct {
		return ior(branches)
	}
	return icall("nof", append([]*ixpr{iraw("1")}, branches...)...)
}

// wholeLeaves writes a whole number in every leaf that holds it exactly,
// as `neq` reads a value by its leaf.
func wholeLeaves(text string) []string {
	n, _ := readExactNumber(text)
	var whole *big.Int
	switch n.leaf {
	case "integer":
		whole = big.NewInt(n.i)
	case "biginteger":
		whole = n.big
	default:
		return nil
	}
	sign := ""
	if whole.Sign() < 0 {
		sign = "-"
	}
	mag := new(big.Int).Abs(whole).String()
	out := []string{}
	if "integer" == n.leaf {
		out = append(out, sign+mag)
	}
	if isExactInBinary64(whole) {
		out = append(out, sign+mag+".0")
	}
	return append(out, sign+"0d"+mag, sign+"0d"+mag+".0")
}

// typedExclusion reads `not: {enum: [...]}` beside a type of exactly
// string or integer as that kind's exclusion. Without the type it stays
// a count of none, or the exclusion would refuse every other kind.
func typedExclusion(node, neg *jnode) map[string][]string {
	typed := jentryOf(node, "type")
	kind := ""
	if nil != typed && "string" == typed.t {
		switch typed.s {
		case "string":
			kind = "string"
		case "integer":
			kind = "number"
		}
	}
	var en *jnode
	if "object" == neg.t && 1 == len(neg.entries) {
		en = jentryOf(neg, "enum")
	}
	if "" == kind || nil == en || "array" != en.t {
		return nil
	}
	out := []string{}
	for _, it := range en.items {
		switch {
		case "string" == kind && "string" == it.t:
			out = append(out, importQuote(it.s))
		case "number" == kind && "number" == it.t:
			out = append(out, wholeLeaves(it.s)...)
		}
	}
	return map[string][]string{kind: out}
}

// importBottom reports whether a position admits nothing: its meet
// conflicts when evaluated alone. One naming an alias is left as written,
// as the declaration may be being written itself.
func importBottom(e *ixpr) bool {
	if "raw" == e.k || holdsAlias(e) {
		return false
	}
	text := "x: " + iprint(e, "")
	a := New()
	v, _ := a.Parse(text)
	_, ctx, _ := a.unifyCtx(v, nil, text)
	conflict := 0 < len(ctx.err)
	for _, n := range ctx.err {
		conflict = conflict && "conflict" == codeClass(n.why)
	}
	return conflict
}

// preferDefault, under the defaults option, prefers an optional
// property's default where its own assertions admit it; a reference is
// not followed, so a schema that names an alias keeps its default as an
// annotation only.
func (ctx *importCtx) preferDefault(node *jnode, e *ixpr) *ixpr {
	d := jentryOf(node, "default")
	if nil == d || holdsAlias(e) {
		return e
	}
	quiet := *ctx
	quiet.lossy = nil
	value, ok := quiet.data("", "default", d)
	if !ok {
		return e
	}
	text := iprint(value, "")
	a := New()
	trial, err := a.Parse(iprint(e, ""))
	parsed, perr := a.Parse(text)
	if nil != err || nil != perr || !Admits(trial, parsed) {
		return e
	}
	return ior([]*ixpr{iraw("*" + text), e})
}

func lenOf(lo, hi string, hasLo, hasHi bool) *ixpr {
	parts := []*ixpr{}
	if hasLo && "0" != lo {
		parts = append(parts, icall("min", iraw(lo)))
	}
	if hasHi {
		parts = append(parts, icall("max", iraw(hi)))
	}
	if 0 == len(parts) {
		return nil
	}
	return icall("len", iand(parts))
}

// convert writes a schema as `A & (B...)`: the kind-agnostic keywords met
// with the disjunction of the kinds, each met with the keywords scoped to
// it. `only` restricts the kinds a position can hold at all.
func (ctx *importCtx) convert(node *jnode, ptr string, asDecl bool, only []string) *ixpr {
	switch node.t {
	case "true":
		return iAny
	case "false":
		return iNil
	case "object":
	default:
		ctx.fail("jsonschema_schema", ptr, "A schema is an object or a boolean.",
			node.off, node.end)
		return iAny
	}

	if target := ctx.targets[node]; nil != target && !asDecl {
		if ctx.mapRoot {
			ctx.declare(target)
			return iraw("%" + target.name)
		}
		for _, s := range ctx.stack {
			if s == node {
				ctx.lose(ptr, "$ref", "a reference that reaches itself has no alias to name "+
					"it where the root is not a map, so the cycle is cut and the position admits anything")
				return iAny
			}
		}
		ctx.copies++
		if importCopyBudget < ctx.copies {
			ctx.lose(ptr, "$ref", "the copies of referenced schemas a root that is not "+
				"a map needs exceed the budget, so the position admits anything")
			return iAny
		}
	}
	ctx.stack = append(ctx.stack, node)
	out := ctx.convertObject(node, ptr, only)
	ctx.stack = ctx.stack[:len(ctx.stack)-1]
	return out
}

func (ctx *importCtx) declare(target *importTarget) {
	if _, seen := ctx.decls[target.name]; seen {
		return
	}
	ctx.decls[target.name] = ""
	ctx.decls[target.name] = iprint(ctx.convert(target.node, target.ptr, true, nil), "")
}

func (ctx *importCtx) convertObject(node *jnode, ptr string, only []string) *ixpr {
	get := func(k string) *jnode { return jentryOf(node, k) }
	at := func(k string) string { return ptrChild(ptr, k) }

	for _, e := range node.entries {
		if later, ok := importLater[e.key]; ok {
			ctx.lose(at(e.key), e.key, later)
		}
	}
	if dialect := get("$schema"); nil != dialect && !("string" == dialect.t && importDraft == dialect.s) {
		ctx.lose(at("$schema"), "$schema", "only the 2020-12 dialect is read, so this "+
			"schema is read as 2020-12")
	}

	parts := []*ixpr{}

	if ref := get("$ref"); nil != ref {
		if "string" != ref.t {
			ctx.wrongType(at("$ref"), "$ref", "a string", ref)
		} else if target := ctx.resolveRef(node, ref.s); nil == target {
			ctx.lose(at("$ref"), "$ref", "the reference "+ref.s+" names nothing "+
				"the importer can reach in this document, so the position admits anything")
		} else {
			parts = append(parts, ctx.convert(target, ctx.targets[target].ptr, false, nil))
		}
	}

	if konst := get("const"); nil != konst {
		parts = append(parts, ctx.literal(at("const"), "const", konst))
	}

	if enm := get("enum"); nil != enm {
		if "array" != enm.t {
			ctx.wrongType(at("enum"), "enum", "an array", enm)
		} else {
			members := []*ixpr{}
			for i, it := range enm.items {
				if m := ctx.literal(at("enum")+"/"+strconv.Itoa(i), "enum", it); !isRawText(m, "nil") {
					members = append(members, m)
				}
			}
			if 0 == len(members) {
				parts = append(parts, iNil)
			} else {
				parts = append(parts, ior(members))
			}
		}
	}

	if all := get("allOf"); nil != all {
		if "array" != all.t {
			ctx.wrongType(at("allOf"), "allOf", "an array", all)
		} else {
			for i, it := range all.items {
				parts = append(parts, ctx.convert(it, at("allOf")+"/"+strconv.Itoa(i), false, only))
			}
		}
	}

	for _, carrier := range []struct {
		key   string
		carry func([]*ixpr) *ixpr
	}{{"anyOf", importAnyOf}, {"oneOf", importOneOf}} {
		if list := get(carrier.key); nil != list {
			if "array" != list.t || 0 == len(list.items) {
				ctx.wrongType(at(carrier.key), carrier.key, "a non-empty array", list)
			} else {
				branches := []*ixpr{}
				for i, it := range list.items {
					branches = append(branches,
						ctx.convert(it, at(carrier.key)+"/"+strconv.Itoa(i), false, only))
				}
				parts = append(parts, carrier.carry(branches))
			}
		}
	}

	var excluded map[string][]string
	if neg := get("not"); nil != neg {
		excluded = typedExclusion(node, neg)
		if nil == excluded {
			parts = append(parts, icall("nof", iraw("0"), ctx.convert(neg, at("not"), false, only)))
		}
	}

	parts = append(parts, ctx.conditional(node, ptr, only)...)
	parts = append(parts, ctx.dependents(node, ptr, only)...)

	// The kind split.
	var allowed []string
	typed := get("type")
	if nil != typed {
		allowed = []string{}
		ts := []*jnode{typed}
		if "array" == typed.t {
			ts = typed.items
		}
		for _, t := range ts {
			if "string" == t.t && (inList(importKinds, t.s) || "integer" == t.s) {
				allowed = append(allowed, t.s)
			} else {
				ctx.wrongType(at("type"), "type", "one of the seven JSON Schema types", t)
			}
		}
	}
	scoped := func(kind string) bool {
		for _, k := range importScoped[kind] {
			if nil != get(k) {
				return true
			}
		}
		return false
	}
	anyScoped := false
	for _, kind := range importKinds {
		anyScoped = anyScoped || scoped(kind)
	}
	kinds := []string{}
	for _, kind := range importKinds {
		if nil != only && !inList(only, kind) {
			continue
		}
		keep := false
		if nil == allowed {
			keep = anyScoped && (nil == only || scoped(kind))
		} else {
			keep = inList(allowed, kind) || ("number" == kind && inList(allowed, "integer"))
		}
		if keep {
			kinds = append(kinds, kind)
		}
	}
	someScoped := false
	for _, kind := range kinds {
		someScoped = someScoped || scoped(kind)
	}
	if nil != allowed || someScoped {
		integral := nil != allowed && inList(allowed, "integer") && !inList(allowed, "number")
		branches := []*ixpr{}
		for _, kind := range kinds {
			branches = append(branches, ctx.branch(node, ptr, kind, integral, excluded))
		}
		if 0 == len(branches) {
			parts = append(parts, iNil)
		} else {
			parts = append(parts, ior(branches))
		}
	}

	met := iand(parts)
	if importBottom(met) {
		return iNil
	}
	return ctx.annotate(node, ptr, met)
}

func jsonKindOf(n *jnode) string {
	if "true" == n.t || "false" == n.t {
		return "boolean"
	}
	return n.t
}

// data writes a JSON value as aontu data; ok is false where a number in
// it is past the exactness budget, which drops the annotation with a
// loss.
func (ctx *importCtx) data(path, keyword string, node *jnode) (*ixpr, bool) {
	switch node.t {
	case "number":
		text, ok := exactText(node.s)
		if !ok {
			ctx.lose(path, keyword, "the number "+node.s+" exceeds the "+
				"exactness budget, so the annotation that holds it is dropped")
			return nil, false
		}
		return iraw(text), true
	case "array":
		items := make([]*ixpr, len(node.items))
		all := true
		for i, it := range node.items {
			d, ok := ctx.data(path+"/"+strconv.Itoa(i), keyword, it)
			items[i], all = d, all && ok
		}
		if !all {
			return nil, false
		}
		return &ixpr{k: "list", lit: true, items: items}, true
	case "object":
		entries := make([]ientry, len(node.entries))
		all := true
		for i, e := range node.entries {
			d, ok := ctx.data(ptrChild(path, e.key), keyword, e.val)
			entries[i], all = ientry{key: e.key, val: d}, all && ok
		}
		if !all {
			return nil, false
		}
		return &ixpr{k: "map", entries: entries}, true
	}
	return ctx.literal(path, keyword, node), true
}

// annotate lets a schema object's annotations ride its value: the
// annotation keywords and every keyword JSON Schema does not name in a
// meta() record, under `x` for the second, and `deprecated` as
// deprecate().
func (ctx *importCtx) annotate(node *jnode, ptr string, e *ixpr) *ixpr {
	entries := []ientry{}
	x := []ientry{}
	for _, en := range node.entries {
		at := ptrChild(ptr, en.key)
		ann, annotated := importAnnotated[en.key]
		if annotated && "any" != ann[1] && ann[1] != jsonKindOf(en.val) {
			ctx.wrongType(at, en.key, importKindText[ann[1]], en.val)
			continue
		}
		if !annotated && (inList(importCarried, en.key) || "" != importLater[en.key]) {
			continue
		}
		val, ok := ctx.data(at, en.key, en.val)
		if !ok {
			continue
		}
		if annotated {
			entries = append(entries, ientry{key: ann[0], val: val})
		} else {
			x = append(x, ientry{key: en.key, val: val})
		}
	}
	if 0 < len(x) {
		entries = append(entries, ientry{key: "x", val: &ixpr{k: "map", entries: x}})
	}
	dep := ctx.deprecation(node, ptr, e)
	if 0 == len(entries) {
		return dep
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].key < entries[j].key })
	return icall("meta", dep, &ixpr{k: "map", entries: entries})
}

// deprecation reads `deprecated: true`, with x-aontu-deprecate's fields
// as its record; a field holding several values is a deprecate() for
// each.
func (ctx *importCtx) deprecation(node *jnode, ptr string, e *ixpr) *ixpr {
	flag := jentryOf(node, "deprecated")
	rec := jentryOf(node, "x-aontu-deprecate")
	if nil != flag && "boolean" != jsonKindOf(flag) {
		ctx.wrongType(ptrChild(ptr, "deprecated"), "deprecated", "a boolean", flag)
	}
	if nil != rec && "object" != rec.t {
		ctx.wrongType(ptrChild(ptr, "x-aontu-deprecate"), "x-aontu-deprecate", "an object", rec)
	}
	isObject := nil != rec && "object" == rec.t
	if !(nil != flag && "true" == flag.t) && !isObject {
		return e
	}
	fields := [][]string{}
	for _, k := range []string{"msg", "since", "use"} {
		var v *jnode
		if isObject {
			v = jentryOf(rec, k)
		}
		vals := []*jnode{}
		switch {
		case nil == v:
		case "array" == v.t:
			vals = v.items
		default:
			vals = []*jnode{v}
		}
		strs := true
		for _, it := range vals {
			strs = strs && "string" == it.t
		}
		if !strs {
			ctx.wrongType(ptrChild(ptrChild(ptr, "x-aontu-deprecate"), k), "x-aontu-deprecate",
				"a string or an array of strings", v)
			continue
		}
		for i, it := range vals {
			if len(fields) <= i {
				fields = append(fields, []string{})
			}
			fields[i] = append(fields[i], k, it.s)
		}
	}
	if 0 == len(fields) {
		return icall("deprecate", e)
	}
	out := e
	for _, layer := range fields {
		entries := []ientry{}
		for i := 0; i < len(layer); i += 2 {
			entries = append(entries, ientry{key: layer[i], val: iraw(importQuote(layer[i+1]))})
		}
		out = icall("deprecate", out, &ixpr{k: "map", entries: entries})
	}
	return out
}

// conditional pairs an `if` with the `then` and `else` of its own schema
// object. A `then` or `else` without one asserts nothing, and so does a
// lone `if`.
func (ctx *importCtx) conditional(node *jnode, ptr string, only []string) []*ixpr {
	cond, then, els := jentryOf(node, "if"), jentryOf(node, "then"), jentryOf(node, "else")
	if nil == cond || (nil == then && nil == els) {
		return nil
	}
	arm := func(n *jnode, k string) *ixpr { return ctx.convert(n, ptrChild(ptr, k), false, only) }
	args := []*ixpr{arm(cond, "if"), iAny}
	if nil != then {
		args[1] = arm(then, "then")
	}
	if nil != els {
		args = append(args, arm(els, "else"))
	}
	return []*ixpr{icall("when", args...)}
}

// present is the map that holds each of these keys, whatever it holds
// there.
func present(keys []string) *ixpr {
	entries := []ientry{}
	seen := map[string]bool{}
	for _, k := range keys {
		if !seen[k] {
			seen[k] = true
			entries = append(entries, ientry{key: k, val: iAny})
		}
	}
	return &ixpr{k: "map", entries: entries}
}

// dependents writes each dependent keyword's entry as a conditional on
// its key's presence.
func (ctx *importCtx) dependents(node *jnode, ptr string, only []string) []*ixpr {
	out := []*ixpr{}
	at := func(k string) string { return ptrChild(ptr, k) }
	if schemas := jentryOf(node, "dependentSchemas"); nil != schemas && "object" == schemas.t {
		for _, e := range schemas.entries {
			out = append(out, icall("when", present([]string{e.key}),
				ctx.convert(e.val, ptrChild(at("dependentSchemas"), e.key), false, only)))
		}
	} else if nil != schemas {
		ctx.wrongType(at("dependentSchemas"), "dependentSchemas", "an object", schemas)
	}
	if required := jentryOf(node, "dependentRequired"); nil != required && "object" == required.t {
		for _, e := range required.entries {
			names := []string{}
			ok := "array" == e.val.t
			if ok {
				for _, n := range e.val.items {
					ok = ok && "string" == n.t
					names = append(names, n.s)
				}
			}
			if !ok {
				ctx.wrongType(ptrChild(at("dependentRequired"), e.key), "dependentRequired",
					"an array of strings", e.val)
			} else if 0 < len(names) {
				out = append(out, icall("when", present([]string{e.key}), present(names)))
			}
		}
	} else if nil != required {
		ctx.wrongType(at("dependentRequired"), "dependentRequired", "an object", required)
	}
	return out
}

func (ctx *importCtx) branch(node *jnode, ptr, kind string, integral bool,
	excluded map[string][]string) *ixpr {
	exclude := func(parts []*ixpr) []*ixpr {
		if 0 == len(excluded[kind]) {
			return parts
		}
		args := []*ixpr{}
		for _, t := range excluded[kind] {
			args = append(args, iraw(t))
		}
		return append(parts, icall("neq", args...))
	}
	get := func(k string) *jnode { return jentryOf(node, k) }
	at := func(k string) string { return ptrChild(ptr, k) }
	counted := func(lo, hi string) *ixpr {
		var lt, ht string
		var hasLo, hasHi bool
		if l := get(lo); nil != l {
			lt, hasLo = ctx.count(at(lo), lo, l)
		}
		if h := get(hi); nil != h {
			ht, hasHi = ctx.count(at(hi), hi, h)
		}
		return lenOf(lt, ht, hasLo, hasHi)
	}

	switch kind {
	case "null", "boolean":
		return iraw(kind)
	case "number":
		// An integer is a number with no fraction, whatever its spelling.
		parts := []*ixpr{iraw("number")}
		if integral {
			parts = append(parts, icall("multiple", iraw("1")))
		}
		for _, kf := range [][2]string{{"minimum", "min"}, {"maximum", "max"},
			{"exclusiveMinimum", "above"}, {"exclusiveMaximum", "below"},
			{"multipleOf", "multiple"}} {
			if v := get(kf[0]); nil != v {
				text, ok := ctx.number(at(kf[0]), kf[0], v)
				switch {
				case ok && "multiple" == kf[1] && (strings.HasPrefix(text, "-") || "0" == text):
					ctx.wrongType(at(kf[0]), kf[0], "a number greater than 0", v)
				case ok:
					parts = append(parts, icall(kf[1], iraw(text)))
				}
			}
		}
		return iand(exclude(parts))
	case "string":
		parts := []*ixpr{icall("empty")}
		if l := counted("minLength", "maxLength"); nil != l {
			parts = append(parts, l)
		}
		if pat := get("pattern"); nil != pat {
			if "string" != pat.t {
				ctx.wrongType(at("pattern"), "pattern", "a string", pat)
			} else if re := ctx.pattern(at("pattern"), "pattern", pat.s); nil != re {
				parts = append(parts, re)
			}
		}
		return iand(exclude(parts))
	case "object":
		m := ctx.objectBranch(node, ptr)
		l := counted("minProperties", "maxProperties")
		if nil == l {
			if 0 == len(m.entries) && 0 == len(m.spreads) {
				return iraw("map")
			}
			return m
		}
		return iand([]*ixpr{m, l})
	}
	spread := ctx.arraySpread(node, ptr)
	sized := []*ixpr{}
	for _, e := range []*ixpr{counted("minItems", "maxItems"), ctx.containsOf(node, ptr),
		ctx.uniqueOf(node, ptr)} {
		if nil != e {
			sized = append(sized, e)
		}
	}
	if 0 == len(sized) {
		if nil == spread {
			return iraw("list")
		}
		return &ixpr{k: "list", spread: spread}
	}
	// Open by a spread: a literal list alternative admits only its own length.
	if nil == spread {
		spread = iAny
	}
	return iand(append([]*ixpr{{k: "list", spread: spread}}, sized...))
}

// containsOf counts the items its schema admits, at least one unless
// minContains says otherwise; a count of at least none asserts nothing.
func (ctx *importCtx) containsOf(node *jnode, ptr string) *ixpr {
	has := jentryOf(node, "contains")
	if nil == has {
		return nil
	}
	bound := func(k string) (string, bool) {
		if v := jentryOf(node, k); nil != v {
			return ctx.count(ptrChild(ptr, k), k, v)
		}
		return "", false
	}
	lo, ok := bound("minContains")
	if !ok {
		lo = "1"
	}
	hi, hasHi := bound("maxContains")
	if "0" == lo && !hasHi {
		return nil
	}
	c := ctx.convert(has, ptrChild(ptr, "contains"), false, nil)
	if "1" == lo && !hasHi {
		return icall("contains", c)
	}
	if hasHi && lo == hi {
		return icall("contains", c, iraw(lo))
	}
	parts := []*ixpr{}
	if "0" != lo {
		parts = append(parts, icall("min", iraw(lo)))
	}
	if hasHi {
		parts = append(parts, icall("max", iraw(hi)))
	}
	return icall("contains", c, iand(parts))
}

func (ctx *importCtx) uniqueOf(node *jnode, ptr string) *ixpr {
	uniq := jentryOf(node, "uniqueItems")
	if nil != uniq && "true" != uniq.t && "false" != uniq.t {
		ctx.wrongType(ptrChild(ptr, "uniqueItems"), "uniqueItems", "a boolean", uniq)
	}
	if nil != uniq && "true" == uniq.t {
		return icall("unique")
	}
	return nil
}

func (ctx *importCtx) objectBranch(node *jnode, ptr string) *ixpr {
	get := func(k string) *jnode { return jentryOf(node, k) }
	at := func(k string) string { return ptrChild(ptr, k) }

	required := []string{}
	if req := get("required"); nil != req {
		if "array" != req.t {
			ctx.wrongType(at("required"), "required", "an array of strings", req)
		} else {
			for _, it := range req.items {
				if "string" != it.t {
					ctx.wrongType(at("required"), "required", "an array of strings", it)
				} else if !inList(required, it.s) {
					required = append(required, it.s)
				}
			}
		}
	}

	entries := []ientry{}
	declared := []string{}
	if props := get("properties"); nil != props {
		if "object" != props.t {
			ctx.wrongType(at("properties"), "properties", "an object", props)
		} else {
			for _, e := range props.entries {
				declared = append(declared, e.key)
				optional := !inList(required, e.key)
				val := ctx.convert(e.val, ptrChild(at("properties"), e.key), false, nil)
				if optional && ctx.defaults {
					val = ctx.preferDefault(e.val, val)
				}
				entries = append(entries, ientry{key: e.key, optional: optional, val: val})
			}
		}
	}
	for _, k := range required {
		if !inList(declared, k) {
			entries = append(entries, ientry{key: k, val: iAny})
		}
	}

	spreads := []*ixpr{}
	patterns := []*ixpr{}
	patternsExact := true
	if pats := get("patternProperties"); nil != pats {
		if "object" != pats.t {
			ctx.wrongType(at("patternProperties"), "patternProperties", "an object", pats)
		} else {
			for _, e := range pats.entries {
				p := ptrChild(at("patternProperties"), e.key)
				re := ctx.pattern(p, "patternProperties", e.key)
				if nil == re {
					patternsExact = false
				} else {
					patterns = append(patterns, re)
					spreads = append(spreads, icall("match", icall("key", iraw("0")), re,
						ctx.convert(e.val, p, false, nil), iAny))
				}
			}
		}
	}

	if addl := get("additionalProperties"); nil != addl && "true" != addl.t {
		if !patternsExact {
			ctx.lose(at("additionalProperties"), "additionalProperties", "a pattern beside "+
				"it was dropped, so the names it excludes cannot be spelt, and it is dropped too")
		} else {
			rest := ctx.convert(addl, at("additionalProperties"), false, nil)
			if 0 == len(declared) && 0 == len(patterns) {
				spreads = append(spreads, rest)
			} else {
				args := []*ixpr{icall("key", iraw("0"))}
				for _, k := range declared {
					args = append(args, iraw(importQuote(k)), iAny)
				}
				for _, re := range patterns {
					args = append(args, re, iAny)
				}
				args = append(args, rest)
				spreads = append(spreads, &ixpr{k: "call", name: "match", items: args})
			}
		}
	}

	if names := get("propertyNames"); nil != names && "true" != names.t {
		guard := ctx.convert(names, at("propertyNames"), false, []string{"string"})
		if !isRawText(guard, "any") {
			spreads = append(spreads, icall("match", icall("key", iraw("0")), guard, iAny, iNil))
		}
	}

	return &ixpr{k: "map", entries: entries, spreads: spreads}
}

func (ctx *importCtx) arraySpread(node *jnode, ptr string) *ixpr {
	get := func(k string) *jnode { return jentryOf(node, k) }
	at := func(k string) string { return ptrChild(ptr, k) }

	rest := iAny
	if items := get("items"); nil != items {
		rest = ctx.convert(items, at("items"), false, nil)
	}
	if prefix := get("prefixItems"); nil != prefix {
		if "array" != prefix.t {
			ctx.wrongType(at("prefixItems"), "prefixItems", "an array", prefix)
		} else {
			args := []*ixpr{icall("key", iraw("0"))}
			for i, it := range prefix.items {
				args = append(args, iraw(importQuote(strconv.Itoa(i))),
					ctx.convert(it, at("prefixItems")+"/"+strconv.Itoa(i), false, nil))
			}
			args = append(args, rest)
			return &ixpr{k: "call", name: "match", items: args}
		}
	}
	if isRawText(rest, "any") {
		return nil
	}
	return rest
}

// coreMap is the map at the heart of a root that only rides or meets
// it: its declarations go there, which is where an alias reference looks.
func coreMap(e *ixpr) *ixpr {
	switch {
	case "map" == e.k:
		return e
	case isRider(e):
		return coreMap(e.items[0])
	case "and" == e.k:
		for _, it := range e.items {
			if m := coreMap(it); nil != m {
				return m
			}
		}
	}
	return nil
}

func (ctx *importCtx) emit(root *ixpr) string {
	names := make([]string, 0, len(ctx.decls))
	for name := range ctx.decls {
		names = append(names, name)
	}
	sort.Strings(names)
	if !ctx.mapRoot {
		return iprint(root, "") + "\n"
	}
	if "map" != root.k {
		core := coreMap(root)
		core.decls = nil
		for _, name := range names {
			core.decls = append(core.decls, "%"+name+" = "+ctx.decls[name])
		}
		return iprint(root, "") + "\n"
	}
	var b strings.Builder
	for _, name := range names {
		b.WriteString("%" + name + " = " + ctx.decls[name] + "\n")
	}
	if 0 < len(names) {
		b.WriteString("\n")
	}
	iwriteLines(&b, root, "")
	return b.String()
}

func (base *importCtx) run(mapRoot bool) (*importCtx, *ixpr) {
	ctx := *base
	ctx.lossy = []SchemaLoss{}
	ctx.errors = nil
	ctx.mapRoot = mapRoot
	ctx.decls = map[string]string{}
	ctx.stack = nil
	ctx.copies = 0
	return &ctx, ctx.convert(base.root, "#", true, nil)
}

// ImportJSONSchema rewrites a JSON Schema document as aontu text,
// reporting every keyword it does not yet carry.
func ImportJSONSchema(text string, opts *ImportOptions) ImportReport {
	file := "schema"
	if nil != opts && "" != opts.Path {
		file = opts.Path
	}
	base := &importCtx{
		src: text, file: file, lossy: []SchemaLoss{},
		anchors: map[*jnode]map[string]*jnode{}, resourceOf: map[*jnode]*jnode{},
		ptrOf: map[*jnode]string{}, targets: map[*jnode]*importTarget{},
		mapRoot: true, decls: map[string]string{},
		defaults: nil != opts && opts.Defaults,
	}
	errorReport := func(ctx *importCtx) ImportReport {
		return ImportReport{Verdict: "error", Aontu: "", Lossy: []SchemaLoss{}, Errors: ctx.errors}
	}

	parsed, p := parseSchemaJSON(text)
	if nil == parsed {
		end := p.faultEnd
		if end <= p.fault {
			end = p.fault
			if end < len(text) {
				_, size := utf8.DecodeRuneInString(text[end:])
				end += size
			}
		}
		if p.deep {
			base.fail("max_depth", "#", "The schema nests deeper than "+
				strconv.Itoa(importJSONDepth)+" levels, past what the importer reads.",
				p.fault, end)
		} else {
			base.fail("jsonschema_schema", "#", "The text is not JSON: "+p.why+".", p.fault, end)
		}
		return errorReport(base)
	}
	base.root = parsed
	if "object" != parsed.t && "true" != parsed.t && "false" != parsed.t {
		base.fail("jsonschema_schema", "#", "A schema is an object or a boolean.",
			parsed.off, parsed.end)
		return errorReport(base)
	}

	base.index(parsed, "#", parsed)
	base.collectRefs(parsed, map[*jnode]bool{})
	if 0 < len(base.errors) {
		return errorReport(base)
	}

	// A map root declares its aliases at the top, and a root that rides or
	// meets a map declares them in that map. An alias lives on a map root,
	// so any other root copies each reference in place.
	ctx, body := base.run(true)
	if nil == coreMap(body) {
		ctx, body = base.run(false)
	}
	if 0 < len(ctx.errors) {
		return errorReport(ctx)
	}
	verdict := "ok"
	if 0 < len(ctx.lossy) {
		verdict = "lossy"
	}
	// The agreed form, as `aontu fmt` writes it; the importer's own text
	// where the formatter refuses, which is the formatter's defect.
	out := ctx.emit(body)
	if agreed := New().Format(out); "formatted" == agreed.Verdict {
		out = agreed.Text
	}
	return ImportReport{Verdict: verdict, Aontu: out, Lossy: ctx.lossy,
		Vet: append([]string{}, ImportVetFlags...)}
}
