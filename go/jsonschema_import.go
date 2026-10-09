/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"slices"
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
	// URI is the schema's retrieval URI, the base of its relative
	// identifiers.
	URI string
	// Documents are the documents a reference may reach, by URI. None is
	// fetched.
	Documents map[string]string
	// FormatAssertion makes every format with a grammar also format(g),
	// as a meta-schema whose $vocabulary lists format-assertion asks
	// (ADR-059).
	FormatAssertion bool
	// Formats is the grammar of each format JSON Schema does not define,
	// by name; a format it defines keeps its committed grammar.
	Formats map[string]string
	// Dialect is the dialect of a resource that names none, one of
	// importDialects; absent, the last of them (ADR-061).
	Dialect string
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

// UpgradeReport is what the upgrade stage made of a schema (ADR-061): the
// dialect its root is read in, the schema in the dialect the importer
// reads that it wrote, each number as it was written, and each pointer
// it moved, with where to, or "" where that schema holds nothing. Schema
// is nil on "error".
type UpgradeReport struct {
	Verdict   string       `json:"verdict"`
	Dialect   string       `json:"dialect"`
	Schema    any          `json:"schema"`
	Rewritten [][2]string  `json:"rewritten"`
	Errors    []VetFinding `json:"errors,omitempty"`
}

// jnode is the schema as a tree that keeps every number's own spelling,
// every key's order, and every node's span.
type jnode struct {
	t        string // object, array, string, number, true, false, null
	off, end int
	entries  []jentry
	items    []*jnode
	s        string // a string's value, or a number's text
	// ADR-061: each key the upgrade moved, with its value as written,
	// which a pointer into the schema as written still reaches; the
	// keywords the schema's dialect does not define; and those it
	// ignores beside a $ref.
	was     map[string]*jnode
	unknown []jentry
	ignored []string
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

// importDoc is one document of an import: the entry, or one of the set.
type importDoc struct {
	uri, src, file string
	root           *jnode
}

type importCtx struct {
	// doc is the document whose text sites point into.
	doc     *importDoc
	root    *jnode
	lossy   []SchemaLoss
	errors  []VetFinding
	anchors map[*jnode]map[string]*jnode
	// Anchors belong to a resource: a document, or a subschema with `$id`.
	resourceOf map[*jnode]*jnode
	ptrOf      map[*jnode]string
	docOf      map[*jnode]*importDoc
	baseOf     map[*jnode]string
	// Each resource by its canonical URI, and the documents not yet read.
	resources map[string]*jnode
	documents map[string]string
	byText    map[string]*importDoc
	targets   map[*jnode]*importTarget
	// A map root declares each target once; any other root copies it in
	// place and cuts a cycle.
	mapRoot bool
	decls   map[string]string
	stack   []*jnode
	copies  int
	// defaults is ImportOptions.Defaults.
	defaults bool
	// Whether a format asserts, by the FormatAssertion option or by the
	// format-assertion vocabulary, and the grammars the format set gives.
	asserts string
	formats map[string]string
	// The schema nodes a conversion reached, and every node in the order
	// the index met it.
	seen  map[*jnode]bool
	order []*jnode
	// ADR-057: each resource's dynamic anchors, the names a $dynamicRef
	// asks the dynamic scope for, the scope a conversion is in, the scopes
	// each target was declared in, the names each target's declarations
	// differ by, and the declarations the scopes added.
	dynAnchors map[*jnode]map[string]*jnode
	dynamic    map[string]bool
	env        map[string]*jnode
	clones     map[*importTarget][]string
	uses       map[*jnode]map[string]bool
	cloned     int
	// ADR-061: the dialect a resource names none of, the dialect each
	// schema is read in, and where each pointer the upgrade moved was
	// written.
	dialect   string
	dialects  map[*jnode]string
	origin    map[string]string
	rewritten [][2]string
}

// importDefaultBase is the base of a schema that names no retrieval
// URI: rooted, so a relative identifier resolves as against a real one.
const importDefaultRoot = "aontu:/"
const importDefaultBase = importDefaultRoot + "schema"

// importCopyBudget is the copies a root that is not a map may make.
const importCopyBudget = 4096

// importScopeBudget is the declarations dynamic scopes may add beyond
// each schema's first before the import is refused (ADR-057).
const importScopeBudget = 1024

func (ctx *importCtx) fail(code, path, message string, off, end int) {
	ctx.failWith(code, path, message, off, end, nil)
}

func (ctx *importCtx) failWith(code, path, message string, off, end int, details map[string]string) {
	row, col := rowCol(ctx.doc.src, off)
	text := ctx.doc.src[off:end]
	f := VetFinding{
		Class: codeClass(code), Code: code, Message: message, Path: ctx.originOf(path),
		Severity: "error",
		Sites: []VetSite{{Col: col, File: ctx.doc.file, Len: utf16Len(text),
			Role: VetRoleSchema, Row: row, Src: text, Value: text}},
	}
	f.Hint = hintOf(code, details)
	ctx.errors = append(ctx.errors, f)
}

func (ctx *importCtx) wrongType(path, keyword, what string, node *jnode) {
	ctx.fail("jsonschema_schema", path, "The keyword "+keyword+" takes "+what+".",
		node.off, node.end)
}

func (ctx *importCtx) lose(at, construct, reason string) {
	path := ctx.originOf(at)
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

func (ctx *importCtx) index(node *jnode, ptr string, resource *jnode, base string) {
	ctx.ptrOf[node] = ptr
	ctx.docOf[node] = ctx.doc
	ctx.order = append(ctx.order, node)
	if "object" != node.t {
		return
	}
	here := resource
	if node == ctx.doc.root {
		here = node
	}
	if id := jentryOf(node, "$id"); nil != id && "string" != id.t {
		ctx.wrongType(ptrChild(ptr, "$id"), "$id", "a string", id)
	} else if nil != id {
		target := resolveURI(base, id.s)
		hash := strings.Index(target, "#")
		if 0 <= hash && hash < len(target)-1 {
			ctx.fail("jsonschema_schema", ptrChild(ptr, "$id"), "The identifier "+
				importQuote(id.s)+" has a fragment, which an identifier may not.", id.off, id.end)
		} else {
			base = strings.TrimSuffix(target, "#")
			here = node
			ctx.register(normalizeURI(base), node, ptrChild(ptr, "$id"), id)
		}
	}
	ctx.resourceOf[node] = here
	ctx.baseOf[node] = base
	// A dynamic anchor is a plain one as well, in the same namespace.
	for _, key := range []string{"$anchor", "$dynamicAnchor"} {
		anchor := jentryOf(node, key)
		if nil != anchor && "string" != anchor.t {
			ctx.wrongType(ptrChild(ptr, key), key, "a string", anchor)
		} else if nil != anchor {
			names := ctx.anchors[here]
			if nil == names {
				names = map[string]*jnode{}
				ctx.anchors[here] = names
			}
			if had, dup := names[anchor.s]; dup && had != node {
				ctx.fail("jsonschema_duplicate", ptrChild(ptr, key),
					"The anchor "+importQuote(anchor.s)+" is declared twice in one resource.",
					anchor.off, anchor.end)
			} else {
				names[anchor.s] = node
			}
			if "$dynamicAnchor" == key {
				if nil == ctx.dynAnchors[here] {
					ctx.dynAnchors[here] = map[string]*jnode{}
				}
				ctx.dynAnchors[here][anchor.s] = node
			}
		}
	}
	subschemas(node, ptr, func(n *jnode, p string) { ctx.index(n, p, here, base) })
}

// register keeps one schema per identifier, whichever document declares
// it, so that no entry wins by the order of a walk.
func (ctx *importCtx) register(key string, node *jnode, path string, id *jnode) {
	if had, ok := ctx.resources[key]; ok && had != node {
		ctx.fail("jsonschema_duplicate", path, "The identifier "+importQuote(id.s)+
			" names a resource declared elsewhere.", id.off, id.end)
	}
	ctx.resources[key] = node
}

// reach reads a document of the set the first time a reference reaches
// it. URIs that hold one text name one document.
func (ctx *importCtx) reach(key string) *jnode {
	known := ctx.resources[key]
	text, ok := ctx.documents[key]
	if nil != known || !ok {
		return known
	}
	if same := ctx.byText[text]; nil != same {
		ctx.resources[key] = same.root
		return same.root
	}
	outer := ctx.doc
	parsed, _ := parseSchemaJSON(text)
	doc := &importDoc{uri: key, src: text, file: key, root: parsed}
	ctx.doc = doc
	if nil == parsed || ("object" != parsed.t && "true" != parsed.t && "false" != parsed.t) {
		ctx.fail("jsonschema_schema", key+"#", "The document "+importQuote(key)+
			" is not a schema.", 0, 0)
		delete(ctx.documents, key)
		ctx.doc = outer
		return nil
	}
	ctx.byText[text] = doc
	ctx.resources[key] = parsed
	ctx.upgrade(parsed, key+"#", key+"#", ctx.dialect, true, false)
	ctx.index(parsed, key+"#", parsed, key)
	ctx.doc = outer
	return parsed
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

// resolveRef resolves a reference against the referrer's base: a
// resource, then a pointer into it or one of its anchors.
func (ctx *importCtx) resolveRef(from *jnode, ref string) *jnode {
	target := resolveURI(ctx.baseOf[from], ref)
	abs, rawFrag, _ := strings.Cut(target, "#")
	res := ctx.reach(normalizeURI(abs))
	frag, ok := percentDecode(rawFrag)
	if nil == res || !ok {
		return nil
	}
	if "" == frag {
		return res
	}
	if !strings.HasPrefix(frag, "/") {
		return ctx.anchors[res][frag]
	}
	node := res
	for _, tok := range strings.Split(frag[1:], "/") {
		key := pointerUnescaper.Replace(tok)
		switch {
		case "object" == node.t && nil != node.was[key]:
			// A pointer reads the schema as written (ADR-061).
			node = node.was[key]
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
	// A pointer may end outside every schema position the walk indexed;
	// the schema found there is read in the resource the pointer named.
	if _, indexed := ctx.ptrOf[node]; !indexed {
		outer := ctx.doc
		at := ctx.ptrOf[res] + frag
		ctx.doc = ctx.docOf[res]
		ctx.upgrade(node, at, at, ctx.dialects[res], false, false)
		ctx.index(node, at, res, ctx.baseOf[res])
		ctx.doc = outer
	}
	return node
}

// importDialects are the dialects a schema may name, earliest first
// (ADR-061).
var importDialects = []string{"draft-04", "draft-06", "draft-07", "2019-09", "2020-12"}

// importDialectURIs is each dialect by its meta-schema's URI, in every
// spelling a schema uses.
var importDialectURIs = func() map[string]string {
	out := map[string]string{}
	for _, d := range [][2]string{{"draft-04", "json-schema.org/draft-04/schema"},
		{"draft-06", "json-schema.org/draft-06/schema"}, {"draft-07", "json-schema.org/draft-07/schema"},
		{"2019-09", "json-schema.org/draft/2019-09/schema"},
		{"2020-12", "json-schema.org/draft/2020-12/schema"}} {
		for _, uri := range []string{"http://" + d[1], "https://" + d[1]} {
			out[uri] = d[0]
			out[uri+"#"] = d[0]
		}
	}
	return out
}()

// importDialectKeys are the keywords each earlier dialect defines, as it
// spells them.
var importDialectKeys = func() map[string]map[string]bool {
	draft4 := []string{"$schema", "id", "$ref", "title", "description", "default", "multipleOf",
		"maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum", "maxLength", "minLength",
		"pattern", "additionalItems", "items", "maxItems", "minItems", "uniqueItems",
		"maxProperties", "minProperties", "required", "additionalProperties", "definitions",
		"properties", "patternProperties", "dependencies", "enum", "type", "format", "allOf",
		"anyOf", "oneOf", "not"}
	draft6 := []string{"$id", "const", "contains", "propertyNames", "examples"}
	for _, k := range draft4 {
		if "id" != k {
			draft6 = append(draft6, k)
		}
	}
	draft7 := append([]string{"$comment", "if", "then", "else", "readOnly", "writeOnly",
		"contentMediaType", "contentEncoding"}, draft6...)
	v201909 := append([]string{"$anchor", "$recursiveRef", "$recursiveAnchor", "$vocabulary",
		"$defs", "dependentSchemas", "dependentRequired", "unevaluatedItems",
		"unevaluatedProperties", "maxContains", "minContains", "deprecated", "contentSchema"},
		draft7...)
	out := map[string]map[string]bool{}
	for d, keys := range map[string][]string{"draft-04": draft4, "draft-06": draft6,
		"draft-07": draft7, "2019-09": v201909} {
		out[d] = map[string]bool{}
		for _, k := range keys {
			out[d][k] = true
		}
	}
	return out
}()

// importRecursive is the dynamic anchor a resource's $recursiveAnchor
// becomes.
const importRecursive = "aontu.recursive"

const importDraft = "https://json-schema.org/draft/2020-12/schema"

func dialectBefore(a, b string) bool {
	return slices.Index(importDialects, a) < slices.Index(importDialects, b)
}

// dialectNamed is the dialect a meta-schema URI names: one of the five,
// or a meta-schema the document set holds, read by the dialect its own
// $schema names, or by the default where it names none.
func (ctx *importCtx) dialectNamed(uri string, depth int) string {
	if known, ok := importDialectURIs[uri]; ok || 8 <= depth {
		return known
	}
	key, _, _ := strings.Cut(resolveURI(ctx.doc.uri, uri), "#")
	text, ok := ctx.documents[normalizeURI(key)]
	if !ok {
		return ""
	}
	meta, _ := parseSchemaJSON(text)
	if nil == meta || "object" != meta.t {
		return ""
	}
	switch named := jentryOf(meta, "$schema"); {
	case nil == named:
		return ctx.dialect
	case "string" == named.t:
		return ctx.dialectNamed(named.s, depth+1)
	}
	return ""
}

func withString(n *jnode, s string) *jnode {
	out := *n
	out.s = s
	return &out
}

// upgrade rewrites a schema of a legacy dialect in place, keyword by
// keyword, into the schema the importer reads that means the same,
// before it is indexed (ADR-061). ptr is where the walk reads it and was
// where it was written; root marks a document's root, and recursive
// whether the resource around it holds a true $recursiveAnchor.
func (ctx *importCtx) upgrade(node *jnode, ptr, was, dialect string, root, recursive bool) {
	if "object" != node.t {
		return
	}
	has := func(k string) *jnode { return jentryOf(node, k) }
	meta := has("$schema")
	named := ""
	if nil != meta && "string" == meta.t {
		named = ctx.dialectNamed(meta.s, 0)
	}
	// A resource names itself in its own dialect, and draft-07 and earlier
	// read nothing beside a $ref, an identifier included.
	own := dialect
	if "" != named {
		own = named
	}
	idKey := "$id"
	if "draft-04" == own {
		idKey = "id"
	}
	id := has(idKey)
	refOnly := func(d string) bool { return dialectBefore(d, "2019-09") && nil != has("$ref") }
	isRoot := root || (nil != id && "string" == id.t && !strings.HasPrefix(id.s, "#") && !refOnly(own))
	d := dialect
	if isRoot {
		d = own
	}
	if isRoot && nil != meta && "" == named {
		if "string" == meta.t {
			ctx.fail("jsonschema_dialect", ptrChild(ptr, "$schema"), "The dialect "+
				importQuote(meta.s)+" is none aontu reads, and no document of the set is a "+
				"meta-schema by that URI.", meta.off, meta.end)
		} else {
			ctx.wrongType(ptrChild(ptr, "$schema"), "$schema", "a string", meta)
		}
	}
	ctx.dialects[node] = d
	rec := recursive
	if isRoot {
		anchor := has("$recursiveAnchor")
		rec = "2019-09" == d && nil != anchor && "true" == anchor.t
	}
	moved := map[string]*jnode{}
	unknown := []jentry{}
	ignored := []string{}
	out := []jentry{}
	// Each key the walk reads at a place it was not written, with the key
	// it was written as.
	from := [][2]string{}
	put := func(key string, val *jnode, wrote string) {
		out = append(out, jentry{key: key, val: val})
		if key != wrote {
			from = append(from, [2]string{key, wrote})
		}
	}
	drop := func(e jentry) {
		moved[e.key] = e.val
		ctx.rewritten = append(ctx.rewritten, [2]string{ptrChild(was, e.key), ""})
	}
	legacy := dialectBefore(d, "2020-12")
	compat := !dialectBefore(d, "2019-09") && nil == has("dependentSchemas") &&
		nil == has("dependentRequired")

	for _, e := range node.entries {
		switch {
		// Beside a $ref, the dialect and the definitions assert nothing.
		case refOnly(d) && "$ref" != e.key && "$schema" != e.key && "definitions" != e.key:
			drop(e)
			ignored = append(ignored, e.key)
		case legacy && !importDialectKeys[d][e.key] && !strings.HasPrefix(e.key, "x-aontu-"):
			moved[e.key] = e.val
			unknown = append(unknown, e)
		case ("id" == e.key && "draft-04" == d) ||
			("$id" == e.key && ("draft-06" == d || "draft-07" == d)):
			moved[e.key] = e.val
			if "string" != e.val.t {
				ctx.wrongType(ptrChild(ptr, e.key), e.key, "a string", e.val)
				continue
			}
			// An identifier's fragment is a plain-name anchor.
			uri, frag, _ := strings.Cut(e.val.s, "#")
			if "" != uri {
				put("$id", withString(e.val, uri), e.key)
			}
			if "" != frag {
				put("$anchor", withString(e.val, frag), e.key)
			}
		case "$schema" == e.key && isRoot && legacy && "string" == e.val.t:
			out = append(out, jentry{key: e.key, val: withString(e.val, importDraft)})
		case "items" == e.key && legacy && "array" == e.val.t:
			moved[e.key] = e.val
			put("prefixItems", e.val, e.key)
		case "additionalItems" == e.key && legacy:
			if items := has("items"); nil != items && "array" == items.t {
				moved[e.key] = e.val
				put("items", e.val, e.key)
			} else {
				drop(e)
			}
		case "dependencies" == e.key && (dialectBefore(d, "2019-09") || compat):
			moved[e.key] = e.val
			if "object" != e.val.t {
				ctx.wrongType(ptrChild(ptr, e.key), e.key, "an object", e.val)
				continue
			}
			// An array names the keys its key requires; anything else is the
			// schema its key's presence applies.
			schemas, required := []jentry{}, []jentry{}
			for _, m := range e.val.entries {
				if "array" == m.val.t {
					required = append(required, m)
				} else {
					schemas = append(schemas, m)
				}
			}
			for _, part := range []struct {
				key     string
				entries []jentry
			}{{"dependentSchemas", schemas}, {"dependentRequired", required}} {
				if 0 < len(part.entries) {
					split := *e.val
					split.entries = part.entries
					put(part.key, &split, e.key)
				}
			}
		case "$recursiveAnchor" == e.key && "2019-09" == d:
			moved[e.key] = e.val
			if "true" != e.val.t && "false" != e.val.t {
				ctx.wrongType(ptrChild(ptr, e.key), e.key, "a boolean", e.val)
			} else if isRoot && "true" == e.val.t {
				put("$dynamicAnchor", &jnode{t: "string", s: importRecursive, off: e.val.off,
					end: e.val.end}, e.key)
			} else {
				ctx.rewritten = append(ctx.rewritten, [2]string{ptrChild(was, e.key), ""})
			}
		case "$recursiveRef" == e.key && "2019-09" == d:
			moved[e.key] = e.val
			if "string" != e.val.t || "#" != e.val.s {
				ctx.wrongType(ptrChild(ptr, e.key), e.key, `the string "#"`, e.val)
			} else if rec {
				// Recursion reaches the outermost recursive resource only from
				// within one, as a dynamic reference does; elsewhere it is "#".
				put("$dynamicRef", withString(e.val, "#"+importRecursive), e.key)
			} else {
				put("$dynamicRef", e.val, e.key)
			}
		default:
			out = append(out, e)
		}
	}

	// A draft-04 exclusive bound is a flag on its numeric sibling.
	for _, pair := range [][2]string{{"exclusiveMinimum", "minimum"}, {"exclusiveMaximum", "maximum"}} {
		flag, bound := pair[0], pair[1]
		at, value := -1, -1
		for i := len(out) - 1; 0 <= i && "draft-04" == d; i-- {
			if flag == out[i].key {
				at = i
			} else if bound == out[i].key {
				value = i
			}
		}
		if -1 == at {
			continue
		}
		set := out[at].val
		moved[flag] = set
		switch {
		case "true" != set.t && "false" != set.t:
			ctx.wrongType(ptrChild(ptr, flag), flag, "a boolean", set)
			out = append(out[:at], out[at+1:]...)
		case "true" == set.t && -1 != value:
			moved[bound] = out[value].val
			out[at] = jentry{key: flag, val: out[value].val}
			from = append(from, [2]string{flag, bound})
			ctx.rewritten = append(ctx.rewritten, [2]string{ptrChild(was, flag), ""})
			out = append(out[:value], out[value+1:]...)
		default:
			ctx.rewritten = append(ctx.rewritten, [2]string{ptrChild(was, flag), ""})
			out = append(out[:at], out[at+1:]...)
		}
	}

	wrote := map[string]string{}
	for _, f := range from {
		wrote[f[0]] = f[1]
		ctx.origin[ptrChild(ptr, f[0])] = ptrChild(was, f[1])
		ctx.rewritten = append(ctx.rewritten, [2]string{ptrChild(was, f[1]), ptrChild(ptr, f[0])})
	}
	for _, e := range unknown {
		ctx.rewritten = append(ctx.rewritten, [2]string{ptrChild(was, e.key), ""})
	}
	node.entries = out
	if 0 < len(moved) {
		node.was = moved
	}
	if 0 < len(unknown) {
		node.unknown = unknown
	}
	if 0 < len(ignored) {
		node.ignored = ignored
	}
	subschemas(node, ptr, func(n *jnode, p string) {
		key, _, _ := strings.Cut(p[len(ptr)+1:], "/")
		at := was + p[len(ptr):]
		if w, ok := wrote[pointerUnescaper.Replace(key)]; ok {
			at = ptrChild(was, w) + p[len(ptr)+1+len(key):]
		}
		ctx.upgrade(n, p, at, d, false, rec)
	})
}

// originOf is where a pointer the walk reads was written, for a report.
func (ctx *importCtx) originOf(path string) string {
	for at := len(path); 0 < at; at = strings.LastIndex(path[:at], "/") {
		if wrote, ok := ctx.origin[path[:at]]; ok {
			return wrote + path[at:]
		}
	}
	return path
}

var defsPtrRe = regexp.MustCompile(`^#/\$defs/([^/]+)$`)

func (ctx *importCtx) targetName(node *jnode, at string) string {
	// A name spells the schema as written (ADR-061).
	ptr := ctx.originOf(at)
	if ctx.docOf[node].root != ctx.root {
		return "u_" + encodeAliasName(strings.TrimSuffix(ptr, "#"))
	}
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

// importRefKeys are the keywords that name a schema by URI; a
// $dynamicRef names its initial target.
var importRefKeys = []string{"$ref", "$dynamicRef"}

type importMiss struct {
	node *jnode
	key  string
}

// collectRefs finds every target, including one reached only through
// another target. A reference that names nothing yet waits in misses.
func (ctx *importCtx) collectRefs(node *jnode, seen map[*jnode]bool, misses *[]importMiss) {
	if seen[node] {
		return
	}
	seen[node] = true
	for _, key := range importRefKeys {
		if ref := jentryOf(node, key); nil != ref && "string" == ref.t &&
			!ctx.follow(node, ref.s, seen, misses) {
			*misses = append(*misses, importMiss{node, key})
		}
	}
	subschemas(node, "", func(n *jnode, _ string) { ctx.collectRefs(n, seen, misses) })
}

func (ctx *importCtx) follow(node *jnode, ref string, seen map[*jnode]bool,
	misses *[]importMiss) bool {
	outer := ctx.doc
	ctx.doc = ctx.docOf[node]
	target := ctx.resolveRef(node, ref)
	ctx.doc = outer
	if nil == target {
		return false
	}
	if _, known := ctx.targets[target]; !known {
		ptr := ctx.ptrOf[target]
		ctx.targets[target] = &importTarget{
			name: ctx.targetName(target, ptr), node: target, ptr: ptr}
	}
	ctx.collectRefs(target, seen, misses)
	return true
}

// settleRefs tries the misses again until a round indexes nothing new,
// since a document read later may declare what a missed reference
// names: what resolves is the walk order's no more.
func (ctx *importCtx) settleRefs(root *jnode) {
	seen := map[*jnode]bool{}
	misses := []importMiss{}
	ctx.collectRefs(root, seen, &misses)
	size := func() int { return len(ctx.ptrOf) + len(ctx.resources) + len(ctx.targets) }
	for known := -1; known != size(); {
		known = size()
		retry := misses
		misses = []importMiss{}
		for _, m := range retry {
			if !ctx.follow(m.node, jentryOf(m.node, m.key).s, seen, &misses) {
				misses = append(misses, m)
			}
		}
		ctx.bindDynamic(seen, &misses)
	}
	outer := ctx.doc
	for _, m := range misses {
		ref := jentryOf(m.node, m.key)
		ctx.doc = ctx.docOf[m.node]
		ctx.fail("jsonschema_ref", ptrChild(ctx.ptrOf[m.node], m.key), "The reference "+
			importQuote(ref.s)+" names no schema the import can reach.", ref.off, ref.end)
	}
	ctx.doc = outer
}

// bindDynamic finds the names some $dynamicRef asks the dynamic scope
// for, and makes every schema a resource anchors by one a target as a
// $ref's is (ADR-057).
func (ctx *importCtx) bindDynamic(seen map[*jnode]bool, misses *[]importMiss) {
	for _, node := range append([]*jnode{}, ctx.order...) {
		if dref := jentryOf(node, "$dynamicRef"); nil != dref && "string" == dref.t {
			if name, ok := ctx.bookend(node, dref.s); ok {
				ctx.dynamic[name] = true
			}
		}
	}
	for _, resource := range append([]*jnode{}, ctx.order...) {
		names := ctx.dynAnchors[resource]
		keys := make([]string, 0, len(names))
		for name := range names {
			keys = append(keys, name)
		}
		sort.Strings(keys)
		for _, name := range keys {
			node := names[name]
			if _, known := ctx.targets[node]; ctx.dynamic[name] && !known {
				ptr := ctx.ptrOf[node]
				ctx.targets[node] = &importTarget{name: ctx.targetName(node, ptr), node: node, ptr: ptr}
				ctx.collectRefs(node, seen, misses)
			}
		}
	}
}

// bookend is the name a $dynamicRef asks the dynamic scope for: its
// fragment, where that is a plain name its initial target carries as a
// $dynamicAnchor.
func (ctx *importCtx) bookend(node *jnode, ref string) (string, bool) {
	outer := ctx.doc
	ctx.doc = ctx.docOf[node]
	initial := ctx.resolveRef(node, ref)
	ctx.doc = outer
	hash := strings.Index(ref, "#")
	name, ok := percentDecode(ref[hash+1:])
	if nil == initial || -1 == hash || !ok {
		return "", false
	}
	anchor := jentryOf(initial, "$dynamicAnchor")
	return name, nil != anchor && "string" == anchor.t && anchor.s == name
}

// usesOf is the names a schema's dynamic references can ask the scope,
// through every schema it reaches by descent or reference and every
// binding of a name: its declarations need differ only where these are
// bound.
func (ctx *importCtx) usesOf(node *jnode) map[string]bool {
	if out, ok := ctx.uses[node]; ok {
		return out
	}
	names := map[string]bool{}
	seen := map[*jnode]bool{}
	var walk func(n *jnode)
	walk = func(n *jnode) {
		if seen[n] {
			return
		}
		seen[n] = true
		// Every reference resolved when the refs were settled.
		for _, key := range importRefKeys {
			if ref := jentryOf(n, key); nil != ref && "string" == ref.t {
				outer := ctx.doc
				ctx.doc = ctx.docOf[n]
				reached := ctx.resolveRef(n, ref.s)
				ctx.doc = outer
				walk(reached)
			}
		}
		if dref := jentryOf(n, "$dynamicRef"); nil != dref && "string" == dref.t {
			if name, ok := ctx.bookend(n, dref.s); ok {
				names[name] = true
				for _, anchors := range ctx.dynAnchors {
					if at, has := anchors[name]; has {
						walk(at)
					}
				}
			}
		}
		subschemas(n, "", func(c *jnode, _ string) { walk(c) })
	}
	walk(node)
	ctx.uses[node] = names
	return names
}

// enter is the dynamic scope inside a schema: a name its resource anchors
// and the scope does not yet bind is bound to it, so the outermost
// binding holds.
func (ctx *importCtx) enter(node *jnode) map[string]*jnode {
	anchors := ctx.dynAnchors[ctx.resourceOf[node]]
	var out map[string]*jnode
	for name := range ctx.dynamic {
		if at, ok := anchors[name]; ok && nil == ctx.env[name] {
			if nil == out {
				out = map[string]*jnode{}
				for k, v := range ctx.env {
					out[k] = v
				}
			}
			out[name] = at
		}
	}
	if nil == out {
		return ctx.env
	}
	return out
}

// importLegacy is a legacy dialect's keyword, which asserts there though
// the dialect read here takes it as an annotation.
const importLegacy = "a keyword of an earlier dialect, which 2020-12 does not define, " +
	"so it is dropped and the position admits more than that dialect does"

// importLater is what each keyword the importer does not carry costs, for
// its loss.
var importLater = map[string]string{
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
	"$schema", "$id", "$ref", "$dynamicRef", "$defs", "definitions", "$anchor", "$dynamicAnchor",
	"type", "deprecated",
	"x-aontu-deprecate",
	"enum", "const", "allOf", "anyOf", "oneOf", "not", "if", "then", "else",
	"dependentSchemas", "dependentRequired", "properties", "required",
	"additionalProperties",
	"patternProperties", "propertyNames", "minProperties", "maxProperties",
	"prefixItems", "items", "minItems", "maxItems", "contains", "minContains",
	"maxContains", "uniqueItems", "minimum", "maximum",
	"exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength",
	"pattern", "unevaluatedProperties", "unevaluatedItems", "x-aontu-format",
}

var importKinds = []string{"null", "boolean", "number", "string", "object", "array"}

// importContent is the content keywords: they annotate a string only, so
// they ride its branch.
var importContent = []string{"contentEncoding", "contentMediaType", "contentSchema"}

var importScoped = map[string][]string{
	"string": {"minLength", "maxLength", "pattern", "contentEncoding", "contentMediaType"},
	"number": {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"},
	"object": {"properties", "required", "additionalProperties", "patternProperties",
		"propertyNames", "minProperties", "maxProperties", "unevaluatedProperties"},
	"array": {"prefixItems", "items", "minItems", "maxItems", "contains", "minContains",
		"maxContains", "uniqueItems", "unevaluatedItems"},
}

// grammarOf is ADR-059's grammar a format asserts, the committed one of
// its name or the one the format set gives it.
func (ctx *importCtx) grammarOf(name *jnode) (string, bool) {
	if "" == ctx.asserts || nil == name || "string" != name.t {
		return "", false
	}
	if IsDefinedFormat(name.s) {
		return name.s, true
	}
	g, ok := ctx.formats[name.s]
	return g, ok
}

// formatCalls is format(g) under format assertion; a name without a
// grammar is ignored by the option and refuses the schema under the
// vocabulary, as JSON Schema asks. x-aontu-format carries a grammar in
// any mode.
func (ctx *importCtx) formatCalls(node *jnode, ptr string) []*ixpr {
	out := []*ixpr{}
	name := jentryOf(node, "format")
	if g, ok := ctx.grammarOf(name); ok {
		out = append(out, ctx.grammarCall(ptrChild(ptr, "format"), name, g)...)
	} else if "vocabulary" == ctx.asserts && nil != name && "string" == name.t {
		ctx.failWith("format_unknown", ptrChild(ptr, "format"), "The format "+importQuote(name.s)+
			" is neither one of the nineteen nor in the format set, and under the "+
			"format-assertion vocabulary an unknown format refuses the schema.",
			name.off, name.end, map[string]string{"reason": name.s})
	}
	x := jentryOf(node, "x-aontu-format")
	if nil != x && "string" != x.t {
		ctx.wrongType(ptrChild(ptr, "x-aontu-format"), "x-aontu-format", "a string", x)
	} else if nil != x {
		out = append(out, ctx.grammarCall(ptrChild(ptr, "x-aontu-format"), x, x.s)...)
	}
	return out
}

func (ctx *importCtx) grammarCall(path string, node *jnode, g string) []*ixpr {
	if _, _, code, why := formatOf(g); "" != code {
		ctx.failWith(code, path, "The grammar of this format cannot be run: "+why+".",
			node.off, node.end, map[string]string{"reason": why})
		return nil
	}
	return []*ixpr{icall("format", iraw(importQuote(g)))}
}

// vocabularyAsserts is whether the meta-schema the root names lists the
// format-assertion vocabulary, true or false: aontu asserts formats, so
// either asks it to.
func (ctx *importCtx) vocabularyAsserts(root *jnode) bool {
	named := jentryOf(root, "$schema")
	if nil == named || "string" != named.t {
		return false
	}
	key, _, _ := strings.Cut(resolveURI(ctx.doc.uri, named.s), "#")
	text, ok := ctx.documents[normalizeURI(key)]
	if !ok {
		return false
	}
	meta, _ := parseSchemaJSON(text)
	if nil == meta {
		return false
	}
	vocabulary := jentryOf(meta, "$vocabulary")
	if nil == vocabulary || "object" != vocabulary.t {
		return false
	}
	for _, e := range vocabulary.entries {
		if importFormatAssertion == e.key {
			return true
		}
	}
	return false
}

const importFormatAssertion = "https://json-schema.org/draft/2020-12/vocab/format-assertion"

func (ctx *importCtx) pattern(path, construct, src string) *ixpr {
	form, why := importForm(src)
	if "" != why {
		ctx.lose(path, construct, "re() cannot read the pattern, so it is dropped: "+why)
		return nil
	}
	return icall("re", iraw(importQuote(form)))
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
	outer, scope := ctx.doc, ctx.env
	ctx.doc = ctx.docOf[node]
	ctx.env = ctx.enter(node)
	out := ctx.convertNode(node, ptr, asDecl, only)
	ctx.doc, ctx.env = outer, scope
	return out
}

func (ctx *importCtx) convertNode(node *jnode, ptr string, asDecl bool, only []string) *ixpr {
	ctx.seen[node] = true
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
			return iraw("%" + ctx.declare(target))
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

// declare declares a target once for each dynamic scope it is read in
// (ADR-057), each after the first under a name of its own.
func (ctx *importCtx) declare(target *importTarget) string {
	env := ctx.enter(target.node)
	uses := ctx.usesOf(target.node)
	names := make([]string, 0, len(env))
	for n := range env {
		if uses[n] {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	for i, n := range names {
		names[i] = n + "=" + ctx.ptrOf[env[n]]
	}
	key := strings.Join(names, " ")
	clone := slices.Index(ctx.clones[target], key)
	if -1 == clone {
		clone = len(ctx.clones[target])
		ctx.clones[target] = append(ctx.clones[target], key)
		if 0 < clone {
			if importScopeBudget == ctx.cloned {
				outer := ctx.doc
				ctx.doc = ctx.docOf[target.node]
				ctx.fail("jsonschema_budget", target.ptr, "The schemas read in more than one dynamic scope "+
					"need more than "+strconv.Itoa(importScopeBudget)+" further declarations, past what the import makes.",
					target.node.off, target.node.off+1)
				ctx.doc = outer
			}
			ctx.cloned++
		}
	}
	name := target.name
	if 0 < clone {
		name += "_e" + strconv.Itoa(clone+1)
	}
	if _, seen := ctx.decls[name]; seen || importScopeBudget < ctx.cloned {
		return name
	}
	ctx.decls[name] = ""
	body := ctx.convert(target.node, target.ptr, true, nil)
	if entries := ctx.identity(target, 0 < clone); 0 < len(entries) {
		body = icall("ident", body, &ixpr{k: "map", entries: entries})
	}
	ctx.decls[name] = iprint(body, "")
	return name
}

// identity is the identity a declared schema had, which its declaration
// carries (ADR-056): the entry's own identifier as written, any other
// resource's as its URI, absolute or under the entry's directory; its
// anchor; and the $defs key a name that says the anchor does not say.
func (ctx *importCtx) identity(target *importTarget, clone bool) []ientry {
	node := target.node
	out := []ientry{}
	if anchor := jentryOf(node, "$anchor"); nil != anchor && "string" == anchor.t {
		out = append(out, ientry{key: "anchor", val: iraw(importQuote(anchor.s))})
	}
	// A clone (ADR-057) names the definition its first declaration is.
	if m := defsPtrRe.FindStringSubmatch(target.ptr); nil != m && (clone || strings.HasPrefix(target.name, "a_")) {
		out = append(out, ientry{key: "defs", val: iraw(importQuote(pointerUnescaper.Replace(m[1])))})
	} else if clone {
		out = append(out, ientry{key: "defs", val: iraw(importQuote(target.name))})
	}
	if dynamic := jentryOf(node, "$dynamicAnchor"); nil != dynamic && "string" == dynamic.t {
		out = append(out, ientry{key: "dynamicAnchor", val: iraw(importQuote(dynamic.s))})
	}
	id := jentryOf(node, "$id")
	uri := ctx.baseOf[node]
	root := ctx.baseOf[ctx.root]
	dir := root[:strings.LastIndex(root, "/")+1]
	written, ok := "", true
	switch {
	case node == ctx.root:
		ok = nil != id && "string" == id.t
		if ok {
			written = strings.TrimSuffix(id.s, "#")
		}
	case nil == id && ctx.docOf[node].root != node:
		ok = false
	case !strings.HasPrefix(uri, importDefaultRoot):
		written = uri
	case strings.HasPrefix(uri, dir) && len(dir) < len(uri):
		written = uri[len(dir):]
	default:
		ok = false
		ctx.lose(ptrChild(target.ptr, "$id"), "$id", "the identifier resolves outside the "+
			"document's directory, with no base URI to write it against, so it is dropped")
	}
	if ok {
		out = append(out, ientry{key: "id", val: iraw(importQuote(written))})
	}
	return out
}

func (ctx *importCtx) convertObject(node *jnode, ptr string, only []string) *ixpr {
	get := func(k string) *jnode { return jentryOf(node, k) }
	at := func(k string) string { return ptrChild(ptr, k) }

	for _, e := range node.entries {
		if later, ok := importLater[e.key]; ok {
			ctx.lose(at(e.key), e.key, later)
		}
	}
	for _, key := range node.ignored {
		ctx.lose(at(key), key, "draft-07 and earlier read nothing beside $ref, so this "+
			"keyword asserts nothing and is dropped")
	}

	parts := []*ixpr{}

	if ref := get("$ref"); nil != ref {
		if "string" != ref.t {
			ctx.wrongType(at("$ref"), "$ref", "a string", ref)
		} else {
			target := ctx.resolveRef(node, ref.s)
			parts = append(parts, ctx.convert(target, ctx.targets[target].ptr, false, nil))
		}
	}

	// ADR-057: the binding the dynamic scope gives its name, or the
	// initial target, read as a $ref; the use keeps the reference's text.
	if dref := get("$dynamicRef"); nil != dref {
		if "string" != dref.t {
			ctx.wrongType(at("$dynamicRef"), "$dynamicRef", "a string", dref)
		} else {
			target := ctx.resolveRef(node, dref.s)
			if name, ok := ctx.bookend(node, dref.s); ok && nil != ctx.env[name] {
				target = ctx.env[name]
			}
			parts = append(parts, icall("meta", ctx.convert(target, ctx.targets[target].ptr, false, nil),
				&ixpr{k: "map", entries: []ientry{{key: "dynamicRef", val: iraw(importQuote(dref.s))}}}))
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
		if "string" != kind {
			return false
		}
		_, ok := ctx.grammarOf(get("format"))
		return ok || nil != get("x-aontu-format")
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
	// A keyword the schema's dialect does not define is an annotation
	// (ADR-061).
	for _, en := range node.unknown {
		if val, ok := ctx.data(ptrChild(ptr, en.key), en.key, en.val); ok {
			x = append(x, ientry{key: en.key, val: val})
		}
	}
	for _, en := range node.entries {
		at := ptrChild(ptr, en.key)
		ann, annotated := importAnnotated[en.key]
		if annotated && "any" != ann[1] && ann[1] != jsonKindOf(en.val) {
			ctx.wrongType(at, en.key, importKindText[ann[1]], en.val)
			continue
		}
		if (!annotated && (inList(importCarried, en.key) || "" != importLater[en.key])) ||
			inList(importContent, en.key) {
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

// content is the content keywords' record on a string branch:
// contentSchema says nothing without contentMediaType.
func (ctx *importCtx) content(node *jnode, ptr string, e *ixpr) *ixpr {
	media := jentryOf(node, "contentMediaType")
	entries := []ientry{}
	for _, key := range importContent {
		v := jentryOf(node, key)
		if nil == v || ("contentSchema" == key && nil == media) {
			continue
		}
		if val, ok := ctx.data(ptrChild(ptr, key), key, v); ok {
			entries = append(entries, ientry{key: key, val: val})
		}
	}
	if 0 == len(entries) {
		return e
	}
	return icall("meta", e, &ixpr{k: "map", entries: entries})
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
		parts = append(parts, ctx.formatCalls(node, ptr)...)
		return ctx.content(node, ptr, iand(exclude(parts)))
	case "object":
		m := ctx.objectBranch(node, ptr)
		spread, rest := ctx.unevaluated(node, ptr, kind)
		if nil != spread {
			m.spreads = append(m.spreads, spread)
		}
		sized := []*ixpr{}
		for _, e := range []*ixpr{counted("minProperties", "maxProperties"), rest} {
			if nil != e {
				sized = append(sized, e)
			}
		}
		if 0 == len(sized) {
			if 0 == len(m.entries) && 0 == len(m.spreads) {
				return iraw("map")
			}
			return m
		}
		return iand(append([]*ixpr{m}, sized...))
	}
	left, rest := ctx.unevaluated(node, ptr, kind)
	spread := ctx.arraySpread(node, ptr)
	if nil != left && nil == spread {
		spread = left
	} else if nil != left {
		spread = iand([]*ixpr{spread, left})
	}
	sized := []*ixpr{}
	for _, e := range []*ixpr{counted("minItems", "maxItems"), ctx.containsOf(node, ptr),
		ctx.uniqueOf(node, ptr), rest} {
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

// importCover is what a schema's keywords evaluate, under the trials of
// the conditional branches that lead to it (ADR-058).
type importCover struct {
	cond    []*ixpr
	keys    []*ixpr
	all     bool
	members *ixpr
	exact   bool
}

// unevaluated is the unevaluated keyword as the guarded spread where no
// branch is conditional, and as rest() over the covers where one is;
// neither where every member is evaluated.
func (ctx *importCtx) unevaluated(node *jnode, ptr, kind string) (spread, rest *ixpr) {
	word := "unevaluatedItems"
	if "object" == kind {
		word = "unevaluatedProperties"
	}
	held := jentryOf(node, word)
	if nil == held || "true" == held.t {
		return nil, nil
	}
	covers := []*importCover{}
	ctx.coversOf(node, ptr, kind, nil, map[*jnode]bool{}, &covers, true)
	static, exact := true, true
	for _, c := range covers {
		if 0 == len(c.cond) && c.all {
			return nil, nil
		}
		exact = exact && c.exact
		static = static && 0 == len(c.cond) && nil == c.members
	}
	if !exact {
		ctx.lose(ptrChild(ptr, word), word, "a pattern it reads was dropped, so the names it "+
			"evaluates cannot be spelt, and it is dropped too")
		return nil, nil
	}
	t := ctx.convert(held, ptrChild(ptr, word), false, nil)
	if static {
		keys := []*ixpr{}
		for _, c := range covers {
			keys = append(keys, c.keys...)
		}
		keys = distinct(keys)
		if 0 == len(keys) {
			return t, nil
		}
		args := []*ixpr{icall("key", iraw("0"))}
		for _, k := range keys {
			args = append(args, k, iAny)
		}
		return icall("match", append(args, t)...), nil
	}
	args := []*ixpr{t}
	for _, c := range covers {
		rec := &ixpr{k: "map"}
		if 0 < len(c.cond) {
			rec.entries = append(rec.entries, ientry{key: "if", val: iand(c.cond)})
		}
		if c.all {
			rec.entries = append(rec.entries, ientry{key: "keys", val: iAny})
		} else if 0 < len(c.keys) {
			rec.entries = append(rec.entries, ientry{key: "keys", val: ior(c.keys)})
		}
		if nil != c.members {
			rec.entries = append(rec.entries, ientry{key: "members", val: c.members})
		}
		args = append(args, rec)
	}
	return nil, icall("rest", args...)
}

// coversOf adds the covers of a schema object and of every in-place
// applicator under it; a reference back to a schema on the walk adds
// only what it added under fewer conditions, so the walk stops there.
func (ctx *importCtx) coversOf(node *jnode, ptr, kind string, cond []*ixpr,
	path map[*jnode]bool, out *[]*importCover, root bool) {
	if "object" != node.t || path[node] {
		return
	}
	path[node] = true
	outerDoc, outerEnv := ctx.doc, ctx.env
	ctx.doc = ctx.docOf[node]
	ctx.env = ctx.enter(node)
	at := func(k string) string { return ptrChild(ptr, k) }
	own := &importCover{cond: cond, exact: true}
	if "object" == kind {
		if props := jentryOf(node, "properties"); nil != props && "object" == props.t {
			for _, e := range props.entries {
				own.keys = append(own.keys, iraw(importQuote(e.key)))
			}
		}
		if pats := jentryOf(node, "patternProperties"); nil != pats && "object" == pats.t {
			for _, e := range pats.entries {
				re := ctx.pattern(ptrChild(at("patternProperties"), e.key), "patternProperties", e.key)
				own.exact = own.exact && nil != re
				if nil != re {
					own.keys = append(own.keys, re)
				}
			}
		}
		own.all = nil != jentryOf(node, "additionalProperties") ||
			(!root && nil != jentryOf(node, "unevaluatedProperties"))
	} else {
		if prefix := jentryOf(node, "prefixItems"); nil != prefix && "array" == prefix.t {
			for i := range prefix.items {
				own.keys = append(own.keys, iraw(importQuote(strconv.Itoa(i))))
			}
		}
		own.all = nil != jentryOf(node, "items") || (!root && nil != jentryOf(node, "unevaluatedItems"))
		if has := jentryOf(node, "contains"); nil != has {
			own.members = ctx.convert(has, at("contains"), false, nil)
		}
	}
	if own.all || 0 < len(own.keys) || nil != own.members || !own.exact {
		*out = append(*out, own)
	}

	into := func(n *jnode, p string, more ...*ixpr) {
		ctx.coversOf(n, p, kind, append(append([]*ixpr{}, cond...), more...), path, out, false)
	}
	list := func(k string) []*jnode {
		if v := jentryOf(node, k); nil != v && "array" == v.t {
			return v.items
		}
		return nil
	}
	for i, it := range list("allOf") {
		into(it, at("allOf")+"/"+strconv.Itoa(i))
	}
	if ref := jentryOf(node, "$ref"); nil != ref && "string" == ref.t {
		target := ctx.resolveRef(node, ref.s)
		into(target, ctx.ptrOf[target])
	}
	if dref := jentryOf(node, "$dynamicRef"); nil != dref && "string" == dref.t {
		target := ctx.resolveRef(node, dref.s)
		if name, ok := ctx.bookend(node, dref.s); ok && nil != ctx.env[name] {
			target = ctx.env[name]
		}
		into(target, ctx.ptrOf[target])
	}
	for _, key := range []string{"anyOf", "oneOf"} {
		for i, it := range list(key) {
			p := at(key) + "/" + strconv.Itoa(i)
			into(it, p, ctx.convert(it, p, false, nil))
		}
	}
	if cnd := jentryOf(node, "if"); nil != cnd {
		c := ctx.convert(cnd, at("if"), false, nil)
		into(cnd, at("if"), c)
		if arm := jentryOf(node, "then"); nil != arm {
			into(arm, at("then"), c)
		}
		if arm := jentryOf(node, "else"); nil != arm {
			into(arm, at("else"), icall("nof", iraw("0"), c))
		}
	}
	if deps := jentryOf(node, "dependentSchemas"); nil != deps && "object" == deps.t {
		for _, e := range deps.entries {
			into(e.val, ptrChild(at("dependentSchemas"), e.key), present([]string{e.key}))
		}
	}
	ctx.doc, ctx.env = outerDoc, outerEnv
	delete(path, node)
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
	ctx.env = map[string]*jnode{}
	ctx.clones = map[*importTarget][]string{}
	ctx.cloned = 0
	return &ctx, ctx.convert(base.root, "#", true, nil)
}

// beginImport is the context an import or an upgrade starts from, with
// the schema it reads, or nil where the options or the text refuse.
func beginImport(text string, opts *ImportOptions) (*importCtx, *jnode) {
	if nil == opts {
		opts = &ImportOptions{}
	}
	file := opts.Path
	if "" == file {
		file = "schema"
	}
	retrieval := opts.URI
	if "" == retrieval {
		retrieval = importDefaultBase
	}
	uri, _, _ := strings.Cut(resolveURI(importDefaultBase, retrieval), "#")
	uri = normalizeURI(uri)
	doc := &importDoc{uri: uri, src: text, file: file}
	base := &importCtx{
		doc: doc, lossy: []SchemaLoss{},
		anchors: map[*jnode]map[string]*jnode{}, resourceOf: map[*jnode]*jnode{},
		ptrOf: map[*jnode]string{}, docOf: map[*jnode]*importDoc{},
		baseOf: map[*jnode]string{}, resources: map[string]*jnode{},
		documents: map[string]string{}, byText: map[string]*importDoc{},
		targets: map[*jnode]*importTarget{}, mapRoot: true, decls: map[string]string{},
		defaults: opts.Defaults, seen: map[*jnode]bool{},
		formats:    opts.Formats,
		dynAnchors: map[*jnode]map[string]*jnode{}, dynamic: map[string]bool{},
		env: map[string]*jnode{}, clones: map[*importTarget][]string{},
		uses:    map[*jnode]map[string]bool{},
		dialect: "2020-12", dialects: map[*jnode]string{}, origin: map[string]string{},
	}
	// Names for one URI must hold one text, or the set's order would
	// choose between them.
	names := make([]string, 0, len(opts.Documents))
	for name := range opts.Documents {
		names = append(names, name)
	}
	sort.Strings(names)
	first := map[string]string{}
	for _, name := range names {
		key, _, _ := strings.Cut(resolveURI(uri, name), "#")
		key = normalizeURI(key)
		if had, ok := first[key]; !ok {
			first[key] = name
			base.documents[key] = opts.Documents[name]
		} else if opts.Documents[had] != opts.Documents[name] {
			base.doc = &importDoc{uri: key, src: opts.Documents[name], file: name}
			base.fail("jsonschema_duplicate", key+"#", "The documents "+importQuote(had)+
				" and "+importQuote(name)+" share one URI.", 0, 0)
			base.doc = doc
		}
	}
	if !base.dialectDefault(opts.Dialect) {
		return base, nil
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
		return base, nil
	}
	base.root = parsed
	doc.root = parsed
	if "object" != parsed.t && "true" != parsed.t && "false" != parsed.t {
		base.fail("jsonschema_schema", "#", "A schema is an object or a boolean.",
			parsed.off, parsed.end)
		return base, nil
	}
	return base, parsed
}

// ImportJSONSchema rewrites a JSON Schema document as aontu text,
// reporting every keyword it does not yet carry.
func ImportJSONSchema(text string, opts *ImportOptions) ImportReport {
	errorReport := func(ctx *importCtx) ImportReport {
		return ImportReport{Verdict: "error", Aontu: "", Lossy: []SchemaLoss{}, Errors: ctx.errors}
	}
	base, parsed := beginImport(text, opts)
	if nil == parsed {
		return errorReport(base)
	}

	if base.vocabularyAsserts(parsed) {
		base.asserts = "vocabulary"
	} else if nil != opts && opts.FormatAssertion {
		base.asserts = "option"
	}
	base.resources[base.doc.uri] = parsed
	base.byText[text] = base.doc
	base.upgrade(parsed, "#", "#", base.dialect, true, false)
	base.index(parsed, "#", parsed, base.doc.uri)
	base.settleRefs(parsed)
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
	// An identity rides only a declaration (ADR-056).
	for _, node := range base.order {
		declared := false
		if target := ctx.targets[node]; nil != target {
			_, declared = ctx.decls[target.name]
		}
		for _, key := range []string{"$id", "$anchor", "$dynamicAnchor"} {
			v := jentryOf(node, key)
			if ctx.seen[node] && !(ctx.mapRoot && declared) && nil != v && "string" == v.t {
				ctx.lose(ptrChild(base.ptrOf[node], key), key, "an identity rides only an "+
					"alias declaration, and nothing declares this schema, so it is dropped")
			}
		}
	}
	// A subschema nothing reaches is still a schema, and one written
	// wrongly fails the import as a reached one does.
	for _, node := range base.order {
		if !ctx.seen[node] {
			v := *ctx
			v.lossy, v.decls, v.stack, v.copies = []SchemaLoss{}, map[string]string{}, nil, 0
			v.convert(node, base.ptrOf[node], false, nil)
			ctx.errors = v.errors
		}
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

// UpgradeJSONSchema runs the upgrade stage alone: the schema the import
// reads in place of one in a legacy dialect (ADR-061).
func UpgradeJSONSchema(text string, opts *ImportOptions) UpgradeReport {
	ctx, parsed := beginImport(text, opts)
	if nil != parsed {
		ctx.upgrade(parsed, "#", "#", ctx.dialect, true, false)
	}
	if nil == parsed || 0 < len(ctx.errors) {
		return UpgradeReport{Verdict: "error", Rewritten: [][2]string{}, Errors: ctx.errors}
	}
	dialect, named := ctx.dialects[parsed]
	if !named {
		dialect = ctx.dialect
	}
	rewritten := append([][2]string{}, ctx.rewritten...)
	sort.Slice(rewritten, func(i, j int) bool {
		if rewritten[i][0] != rewritten[j][0] {
			return rewritten[i][0] < rewritten[j][0]
		}
		return rewritten[i][1] < rewritten[j][1]
	})
	return UpgradeReport{Verdict: "ok", Dialect: dialect, Schema: jnodeValue(parsed),
		Rewritten: rewritten}
}

// jnodeValue is a node as the JSON value it is, each number as it was
// written.
func jnodeValue(n *jnode) any {
	switch n.t {
	case "object":
		out := map[string]any{}
		for _, e := range n.entries {
			out[e.key] = jnodeValue(e.val)
		}
		return out
	case "array":
		out := []any{}
		for _, it := range n.items {
			out = append(out, jnodeValue(it))
		}
		return out
	case "string":
		return n.s
	case "number":
		return json.Number(n.s)
	case "null":
		return nil
	}
	return "true" == n.t
}

// dialectDefault takes the dialect a resource that names none is read in,
// which the caller may give; one aontu does not read is refused.
func (ctx *importCtx) dialectDefault(name string) bool {
	if "" == name {
		return true
	}
	if !inList(importDialects, name) {
		ctx.fail("jsonschema_dialect", "#", "The dialect "+importQuote(name)+" is none of "+
			strings.Join(importDialects, ", ")+".", 0, 0)
		return false
	}
	ctx.dialect = name
	return true
}
