/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
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
}

// ImportReport is the import's answer, shaped like the export's.
type ImportReport struct {
	Verdict string       `json:"verdict"`
	Aontu   string       `json:"aontu"`
	Lossy   []SchemaLoss `json:"lossy"`
	Errors  []VetFinding `json:"errors,omitempty"`
}

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
		if 0 == len(e.entries) && 0 == len(e.spreads) {
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
const (
	importNotYet = "the importer does not carry this keyword yet, so it is dropped " +
		"and the position admits more than the schema does"
	importAnnotation = "an annotation asserts nothing, and the importer does not keep " +
		"annotations yet, so it is dropped"
)

var importLater = map[string]string{
	"anyOf": importNotYet, "oneOf": importNotYet, "not": importNotYet,
	"if": importNotYet, "then": importNotYet, "else": importNotYet,
	"dependentSchemas": importNotYet, "dependentRequired": importNotYet,
	"contains": importNotYet, "minContains": importNotYet, "maxContains": importNotYet,
	"uniqueItems": importNotYet,
	"$dynamicRef": importNotYet, "$dynamicAnchor": importNotYet,
	"unevaluatedProperties": importNotYet, "unevaluatedItems": importNotYet,
	"title": importAnnotation, "description": importAnnotation, "default": importAnnotation,
	"examples": importAnnotation, "deprecated": importAnnotation, "readOnly": importAnnotation,
	"writeOnly": importAnnotation, "format": importAnnotation,
	"contentMediaType": importAnnotation, "contentEncoding": importAnnotation,
	"contentSchema": importAnnotation,
	"$id": "a resource identifier, and references resolve within this document " +
		"only, so it is dropped",
	"$vocabulary": "a vocabulary declaration, and the 2020-12 vocabularies are read " +
		"whatever it says, so it is dropped",
}

var importCarried = []string{
	"$schema", "$ref", "$defs", "definitions", "$anchor", "$comment", "type",
	"enum", "const", "allOf", "properties", "required", "additionalProperties",
	"patternProperties", "propertyNames", "minProperties", "maxProperties",
	"prefixItems", "items", "minItems", "maxItems", "minimum", "maximum",
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
	"array": {"prefixItems", "items", "minItems", "maxItems"},
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
		} else if !inList(importCarried, e.key) {
			ctx.lose(at(e.key), e.key, "an unknown keyword asserts nothing, and the "+
				"importer does not keep it yet, so it is dropped")
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
			branches = append(branches, ctx.branch(node, ptr, kind, integral))
		}
		if 0 == len(branches) {
			parts = append(parts, iNil)
		} else {
			parts = append(parts, ior(branches))
		}
	}

	return iand(parts)
}

func (ctx *importCtx) branch(node *jnode, ptr, kind string, integral bool) *ixpr {
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
		return iand(parts)
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
		return iand(parts)
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
	l := counted("minItems", "maxItems")
	if nil == l {
		if nil == spread {
			return iraw("list")
		}
		return &ixpr{k: "list", spread: spread}
	}
	// Open by a spread: a literal list alternative admits only its own length.
	if nil == spread {
		spread = iAny
	}
	return iand([]*ixpr{{k: "list", spread: spread}, l})
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
				entries = append(entries, ientry{
					key: e.key, optional: !inList(required, e.key),
					val: ctx.convert(e.val, ptrChild(at("properties"), e.key), false, nil),
				})
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

func (ctx *importCtx) emit(root *ixpr) string {
	names := make([]string, 0, len(ctx.decls))
	for name := range ctx.decls {
		names = append(names, name)
	}
	sort.Strings(names)
	if !ctx.mapRoot || "map" != root.k {
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

	// A map root declares its aliases at the top. An alias lives on a map
	// root, so any other root copies each reference in place.
	ctx, body := base.run(true)
	if "map" != body.k {
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
	return ImportReport{Verdict: verdict, Aontu: out, Lossy: ctx.lossy}
}
