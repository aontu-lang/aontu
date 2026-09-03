/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE SOURCE FORMATTER (docs/design/FMT.0.md), the Go side of
// ts/src/format.ts: `aontu fmt`, in the tradition of gofmt. One agreed
// form for Aontu source, so that layout is never argued about and a
// diff shows only what changed.
//
// It reads the token stream the parser reads -- the lex subscriber the
// parser stack exposes -- so it sees what the value tree throws away:
// comments, blank lines, the quote a string used, the spelling of a
// number. From that stream it builds a layout tree, decides the shape
// of every container by the rules of the note's §3, and emits. Before
// returning it re-parses what it wrote and compares the two parse
// trees: a formatter that cannot prove its output is the same document
// refuses rather than return it.
//
// Two tiers. The syntactic (P1): whitespace, commas, quotes, bare
// keys, chains and pair elements, none of which changes the parse
// tree. The lawful (P2), over it: repeat the prefix, and merge what
// repeats -- rewrites that rest on the meet, each checked by the meet
// in isolation and kept only where the engine agrees.
//
// Function for function with the TypeScript; the shared behaviour is
// test/spec/fmt.tsv, executed by both spec runners.

package aontu

import (
	"regexp"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	jsonic "github.com/tabnas/jsonic/go"
	multisource "github.com/tabnas/multisource/go"
)

// The packing budget (§3.1). It decides which of two legal spellings
// to use, one line or several, and nothing else: the formatter never
// breaks a line, so a value wider than this stays as wide as it is.
const formatBudget = 80

// THE DEPTH BUDGET. The layout is recursive, as the tree it reads is,
// and the canonical port's stack is finite: past the evaluation budget
// of 1000 levels -- the depth at which unification itself refuses --
// the formatter stops reading and refuses, so a pathological document
// is a finding rather than a crash, at the same depth in both ports.
const formatMaxDepth = 1000

// FormatReport is what Format returns: the text in the agreed form and
// whether it differs from what was given, or the findings that say why
// the document was not formatted. Field order is LEXICOGRAPHIC, the
// canonical emitter's order.
type FormatReport struct {
	Changed bool         `json:"changed"`
	Errors  []VetFinding `json:"errors,omitempty"`
	Text    string       `json:"text"`
	Verdict string       `json:"verdict"`
}

// ---------------------------------------------------------------------
// The tokens

type fmtTok struct {
	name string
	src  string
	val  any
	sI   int
}

// EVERY INCLUDE RESOLVES TO NOTHING. The formatter reads the file it is
// given and no other (§3.13), so `@"..."` is answered from memory with
// an empty source: the directive parses, the include is a token like
// any other, and no capability is needed because no file is read.
func formatResolver(spec multisource.PathSpec, opts *multisource.MultiSourceOptions, ctx *jsonic.Context) multisource.Resolution {
	res := multisource.Resolution{PathSpec: spec}
	res.Kind = "aon"
	res.Full = "__fmt__.aon"
	res.Found = true
	return res
}

// ONE PARSER, ONE SUBSCRIBER. The parser's subscriber list is
// append-only, so the subscription is made once and writes to
// whichever sink the current parse installed; the sink is cleared
// before the parse returns, so the check's re-parse collects nothing.
// The parser is shared, so Format serialises: one document at a time.
var (
	formatOnce sync.Once
	formatLang *jsonic.Jsonic
	formatMu   sync.Mutex
	formatSink *[]fmtTok
)

func formatParser() *jsonic.Jsonic {
	formatOnce.Do(func() {
		j := mustMakeLang("", formatResolver)
		j.Sub(func(tkn *jsonic.Token, rule *jsonic.Rule, ctx *jsonic.Context) {
			// Spaces carry nothing the layout needs, and the end token
			// arrives once per nested parse -- the stub's empty includes
			// among them -- so both are dropped here rather than skipped
			// everywhere below.
			if nil != formatSink && "#SP" != tkn.Name && "#ZZ" != tkn.Name {
				*formatSink = append(*formatSink,
					fmtTok{name: tkn.Name, src: tkn.Src, val: tkn.Val, sI: tkn.SI})
			}
		}, nil)
		formatLang = j
	})
	return formatLang
}

// formatParse is one parse, with the token stream collected when a
// sink is given; a failure is the error every verb reports.
func formatParse(src, file string, sink *[]fmtTok) (Val, *AontuError) {
	if off := findConflictMarker(src); off >= 0 {
		return nil, conflictError(src, file, off)
	}
	meta := map[string]any{notFoundMetaKey: &notFoundSink{}}
	if "" != file {
		meta["fileName"] = file
	}
	formatSink = sink
	out, err := formatParser().ParseMeta(src, meta)
	formatSink = nil
	if err != nil {
		return nil, syntaxError(err, src)
	}
	if out == nil {
		return newMap(), nil
	}
	// The paths every value carries from the entry parse
	// (parseWithTrust): a relation declaration registers at the path
	// its atom landed on, and the check evaluates what it parses.
	root := asVal(out)
	setPaths(root, []string{})
	return root, nil
}

// ---------------------------------------------------------------------
// The layout tree

// One node shape for the whole tree, as the TypeScript has one: the
// kind says which fields are meaningful. Where the TypeScript leaves a
// field undefined, the empty string stands -- a comment is never empty
// (it starts with `#`), so "" reads as none.
type fmtNode struct {
	t string

	// atom, include, comment, note, op, prefix: the text as written,
	// normalised where §3.9 says (quotes), and nothing else.
	text string

	// pair: the key as it will be written, the optional marker, and the
	// value; spread: the value.
	key   string
	opt   bool
	value *fmtNode

	// map, list: the entries, and the comment on the opener's line.
	body []*fmtNode
	open string

	// call: the name and the arguments; paren: what it groups, which
	// the parser reads as a call's argument list does (commas and all).
	name  string
	args  []*fmtNode
	inner []*fmtNode

	// expr: operands, binary operators, prefix operators and notes (a
	// comment inside the expression), in source order.
	items []*fmtNode

	// op: the author broke the line at this operator (§3.11).
	brk bool

	// A comment on the last line of this entry.
	trail string

	// An argument: a comma stood before it (§3.6), rather than a space.
	sep bool

	// pair: the statements this one replaces, where the lawful tier
	// merged them, or rewrote something below them.
	orig []*fmtNode
}

var (
	fmtBinary = map[string]bool{"#E&": true, "#E|": true, "#E+": true}
	fmtPrefix = map[string]bool{"#E*": true, "#E-": true}
	fmtKeyish = map[string]bool{"#TX": true, "#ST": true, "#NR": true, "#VL": true}
	fmtCloser = map[string]bool{"#CB": true, "#CS": true, "#E)": true}

	// The parts of one atom: a reference is `$`, dots and segments
	// lexed one by one, and a bare word with a dot in it is the same
	// run; what was adjacent in the source stays glued.
	fmtGlue = map[string]bool{
		"#TX": true, "#ST": true, "#NR": true, "#VL": true, "#E.": true, "#E$": true,
	}

	fmtBare = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
)

// A single-quoted string becomes double-quoted unless it holds a double
// quote, which the swap would have to escape (§3.9). The body is copied
// as written: the escapes are the same under both quotes.
func fmtNormStr(src string) string {
	if strings.HasPrefix(src, "'") {
		body := src[1 : len(src)-1]
		if strings.Contains(body, `"`) {
			return src
		}
		return `"` + body + `"`
	}
	return src
}

func fmtAtomText(tok fmtTok) string {
	if "#ST" == tok.name {
		return fmtNormStr(tok.src)
	}
	return tok.src
}

// A quoted key whose text is a legal bare key is written bare; the
// keywords are legal keys too (`string: 1` is the key `string`), so no
// word is reserved. Anything else keeps its spelling.
func fmtKeyText(tok fmtTok) string {
	if "#ST" == tok.name {
		if val, ok := tok.val.(string); ok && fmtBare.MatchString(val) {
			return val
		}
		return fmtNormStr(tok.src)
	}
	return tok.src
}

type fmtReader struct {
	T     []fmtTok
	i     int
	depth int
	// Past the depth budget: the reader answers "" for every token from
	// here on, so every loop unwinds, and the document is refused.
	deep bool
}

// The name of the token k ahead, or "" past either end.
func (r *fmtReader) name(k int) string {
	at := r.i + k
	if r.deep || at < 0 || len(r.T) <= at {
		return ""
	}
	return r.T[at].name
}

// The offset of the next token that is not a line run or a comment.
func (r *fmtReader) significant() int {
	k := 0
	for "#LN" == r.name(k) || "#CM" == r.name(k) {
		k++
	}
	return k
}

// A key followed by a colon, the optional marker allowed between.
func (r *fmtReader) atKey() bool {
	return fmtKeyish[r.name(0)] && ("#CL" == r.name(1) ||
		("#QM" == r.name(1) && "#CL" == r.name(2)))
}

// The entries of a container up to its closer, or of the document up
// to its end. Comments attach by the rules of §3.7: on the line of the
// entry that precedes them, or of the opener, they trail it; alone on
// a line they stand as entries and precede what follows.
func (r *fmtReader) body(close string, opened bool) ([]*fmtNode, string) {
	body := []*fmtNode{}
	open := ""
	var last *fmtNode
	opener := opened
	// Nothing since the opener or the last comma: a comma here is an
	// empty element, which the parser reads as nil in a list.
	gap := true
	for {
		n := r.name(0)
		// The closer, or the end: the parser accepts a container the
		// source never closed (`a: {` is `{"a":{}}`).
		if "" == n || n == close {
			break
		}
		if "#LN" == n {
			if 1 < strings.Count(r.T[r.i].src, "\n") && 0 < len(body) &&
				"blank" != body[len(body)-1].t {
				body = append(body, &fmtNode{t: "blank"})
			}
			last = nil
			opener = false
			r.i++
			continue
		}
		if "#CA" == n {
			if gap && "#CS" == close {
				nilNode := &fmtNode{t: "atom", text: "nil"}
				body = append(body, nilNode)
				last = nilNode
			}
			gap = true
			r.i++
			continue
		}
		if "#CM" == n {
			text := r.T[r.i].src
			if nil != last {
				last.trail = text
			} else if opener {
				open = text
			} else {
				body = append(body, &fmtNode{t: "comment", text: text})
			}
			r.i++
			continue
		}
		if fmtCloser[n] {
			// A closer that is not this container's: the parser ignores
			// a stray one at the root (`a: 1 }` is `{"a":1}`), and so
			// does this.
			r.i++
			continue
		}
		e := r.entry()
		body = append(body, e)
		last = e
		opener = false
		gap = false
	}
	// A blank line before the closer is no paragraph break: nothing
	// follows it, and the layout would drop it anyway.
	for 0 < len(body) && "blank" == body[len(body)-1].t {
		body = body[:len(body)-1]
	}
	return body, open
}

// One entry: an include, a spread, a pair, or -- as a list element or
// at the root -- a value.
func (r *fmtReader) entry() *fmtNode {
	n := r.name(0)
	if "#OD_multisource" == n {
		text := "@" + fmtNormStr(r.T[r.i+1].src)
		r.i += 2
		return &fmtNode{t: "include", text: text}
	}
	if "#E&" == n && "#CL" == r.name(1) {
		r.i += 2
		return &fmtNode{t: "spread", value: r.value()}
	}
	if r.atKey() {
		tok := r.T[r.i]
		opt := "#QM" == r.name(1)
		if opt {
			r.i += 3
		} else {
			r.i += 2
		}
		return &fmtNode{t: "pair", key: fmtKeyText(tok), opt: opt, value: r.value()}
	}
	return r.value()
}

// A value: operands and operators up to whatever ends it -- a
// separator, a closer, the end, or a line run that no operator
// continues past.
func (r *fmtReader) value() *fmtNode {
	r.depth++
	if formatMaxDepth < r.depth {
		r.deep = true
	}
	v := r.valueAt()
	r.depth--
	return v
}

func (r *fmtReader) valueAt() *fmtNode {
	items := []*fmtNode{}
	for {
		n := r.name(0)
		if "" == n || "#CA" == n || fmtCloser[n] {
			break
		}
		// An operand directly after an operand is the next element of a
		// list, `[1 -2]`, `[{a:1} {b:2}]`: this value is complete.
		if !r.open(items) && !fmtBinary[n] && "#LN" != n && "#CM" != n {
			break
		}
		if "#E&" == n && "#CL" == r.name(1) {
			if 0 == len(items) {
				// A chain through a spread, `a: &: integer`. The braces
				// are the agreed spelling (X-7), so it is read as the
				// map it is.
				r.i += 2
				return &fmtNode{t: "map", body: []*fmtNode{{t: "spread", value: r.value()}}}
			}
			// A sibling spread in a list, `[1 &: 2]`: this value is
			// complete.
			break
		}
		if "#LN" == n {
			// A break the author put before the value, after an
			// operator (`a: 1 &\n  2`) or before one (`a: 1\n  | 2`),
			// or after a comment inside the value; anything else ends
			// the value.
			if r.open(items) || fmtBinary[r.name(r.significant())] {
				r.i++
				continue
			}
			break
		}
		if "#CM" == n {
			// A comment inside the value: after the colon, after an
			// operator, or on a line the value continues past. Otherwise
			// it trails the statement and the caller attaches it.
			if r.open(items) || fmtBinary[r.name(r.significant())] {
				items = append(items, &fmtNode{t: "note", text: r.T[r.i].src})
				r.i++
				continue
			}
			break
		}
		if fmtBinary[n] {
			items = append(items, &fmtNode{
				t: "op", text: r.T[r.i].src,
				brk: "#LN" == r.name(-1) || "#LN" == r.name(1),
			})
			r.i++
			continue
		}
		if fmtPrefix[n] {
			items = append(items, &fmtNode{t: "prefix", text: r.T[r.i].src})
			r.i++
			continue
		}
		if "#E(" == n {
			r.i++
			inner := r.seq()
			r.i++
			items = append(items, &fmtNode{t: "paren", inner: inner})
			continue
		}
		if "#TX" == n && "#E(" == r.name(1) {
			name := r.T[r.i].src
			r.i += 2
			args := r.seq()
			r.i++
			items = append(items, &fmtNode{t: "call", name: name, args: args})
			continue
		}
		if "#OB" == n {
			r.i++
			body, open := r.body("#CB", true)
			r.i++
			items = append(items, &fmtNode{t: "map", body: body, open: open})
			continue
		}
		if "#OS" == n {
			r.i++
			body, open := r.body("#CS", true)
			r.i++
			items = append(items, &fmtNode{t: "list", body: body, open: open})
			continue
		}
		if "#OD_multisource" == n {
			items = append(items, &fmtNode{t: "include", text: "@" + fmtNormStr(r.T[r.i+1].src)})
			r.i += 2
			continue
		}
		if r.atKey() {
			// A pair in value position is a chain, `a: b: 1`, and it is
			// the whole of the value.
			items = append(items, r.entry())
			break
		}
		items = append(items, r.atom())
	}
	if 1 == len(items) && "op" != items[0].t && "prefix" != items[0].t &&
		"note" != items[0].t {
		return items[0]
	}
	return &fmtNode{t: "expr", items: items}
}

// Whether the expression so far wants an operand: nothing yet, or an
// operator, a prefix or a comment last.
func (r *fmtReader) open(items []*fmtNode) bool {
	if 0 == len(items) {
		return true
	}
	t := items[len(items)-1].t
	return "op" == t || "prefix" == t || "note" == t
}

// The token under the cursor, and the parts glued to it.
func (r *fmtReader) atom() *fmtNode {
	text := fmtAtomText(r.T[r.i])
	r.i++
	for fmtGlue[r.name(0)] &&
		r.T[r.i-1].sI+len(r.T[r.i-1].src) == r.T[r.i].sI {
		text += fmtAtomText(r.T[r.i])
		r.i++
	}
	return &fmtNode{t: "atom", text: text}
}

// A call's arguments, or a parenthesis's contents, up to the closing
// parenthesis: values separated by commas, with a comment among them
// kept as a note.
func (r *fmtReader) seq() []*fmtNode {
	out := []*fmtNode{}
	gap := true
	comma := false
	for {
		n := r.name(0)
		if "" == n || fmtCloser[n] {
			break
		}
		if "#LN" == n {
			r.i++
			continue
		}
		if "#CA" == n {
			if gap {
				out = append(out, &fmtNode{t: "atom", text: "nil", sep: comma})
			}
			gap = true
			comma = true
			r.i++
			continue
		}
		if "#CM" == n {
			out = append(out, &fmtNode{t: "note", text: r.T[r.i].src})
			r.i++
			continue
		}
		v := r.value()
		v.sep = comma
		out = append(out, v)
		gap = false
		comma = false
	}
	return out
}

// THE ROOT MAP HAS NO BRACES (§3.12). A document written as one braced
// map is its entries; the comments on the braces' lines become entries
// of their own, where nothing is lost.
func fmtUnwrap(root []*fmtNode) []*fmtNode {
	var entries []*fmtNode
	for _, n := range root {
		if "comment" != n.t && "blank" != n.t {
			entries = append(entries, n)
		}
	}
	if 1 != len(entries) || "map" != entries[0].t {
		return root
	}
	m := entries[0]
	out := []*fmtNode{}
	for _, n := range root {
		if n != m {
			out = append(out, n)
			continue
		}
		if "" != m.open {
			out = append(out, &fmtNode{t: "comment", text: m.open})
		}
		out = append(out, m.body...)
		if "" != m.trail {
			out = append(out, &fmtNode{t: "comment", text: m.trail})
		}
	}
	return out
}

// ---------------------------------------------------------------------
// The layout

// D1: a one-pair map in value position is written as a chain, and a
// one-pair map as a list element as a pair element. A map whose only
// entry is a spread keeps its braces (X-7), and one holding a comment
// keeps them too, because the comment needs the lines. A trailing
// comment on the map's line joins the pair's own.
func fmtChain(node *fmtNode) *fmtNode {
	if "map" != node.t || "" != node.open || 1 != len(node.body) ||
		"pair" != node.body[0].t {
		return node
	}
	p := node.body[0]
	if "" == node.trail {
		return p
	}
	joined := *p
	if "" == p.trail {
		joined.trail = node.trail
	} else {
		joined.trail = p.trail + " " + node.trail
	}
	return &joined
}

func fmtWidth(s string) int {
	return utf8.RuneCountInString(s)
}

func fmtPairHead(node *fmtNode, tight bool) string {
	head := node.key
	if node.opt {
		head += "?"
	}
	if tight {
		return head + ":"
	}
	return head + ": "
}

// The one-line spelling of a node, or false where it has none: a
// comment, a blank line, a break the author kept, a string that spans
// lines. `tight` is the inline form of a pair, `a:1`, used inside a
// container; a statement's pair is `a: 1`.
func fmtInline(node *fmtNode, tight bool) (string, bool) {
	if "" != node.trail {
		return "", false
	}
	switch node.t {
	case "atom", "include":
		if strings.Contains(node.text, "\n") {
			return "", false
		}
		return node.text, true
	case "pair":
		v, ok := fmtInline(fmtChain(node.value), tight)
		if !ok {
			return "", false
		}
		return fmtPairHead(node, tight) + v, true
	case "spread":
		// `{ &: integer }`, padded inside braces too: the marker reads
		// as a marker and not as a key.
		v, ok := fmtInline(node.value, tight)
		if !ok {
			return "", false
		}
		return "&: " + v, true
	case "map", "list":
		if "" != node.open {
			return "", false
		}
		parts := []string{}
		for _, e := range node.body {
			if "list" == node.t {
				e = fmtChain(e)
			}
			s, ok := fmtInline(e, true)
			if !ok {
				return "", false
			}
			parts = append(parts, s)
		}
		if "list" == node.t {
			return "[" + strings.Join(parts, " ") + "]", true
		}
		if 0 == len(parts) {
			return "{}", true
		}
		return "{ " + strings.Join(parts, " ") + " }", true
	case "call":
		a, ok := fmtInlineSeq(node.args)
		if !ok {
			return "", false
		}
		return node.name + "(" + a + ")", true
	case "paren":
		a, ok := fmtInlineSeq(node.inner)
		if !ok {
			return "", false
		}
		return "(" + a + ")", true
	case "expr":
		return fmtInlineExpr(node.items)
	default:
		// comment, blank: never on a line with anything else.
		return "", false
	}
}

// Arguments on one line, each after the separator the author wrote
// (§3.6): a comma stays a comma, and a space a space, because the
// parser reads `must((v) => 0 <= v, "…")` as a run of arguments too.
func fmtInlineSeq(items []*fmtNode) (string, bool) {
	out := ""
	for k, it := range items {
		s, ok := fmtInline(it, true)
		if !ok {
			return "", false
		}
		if 0 < k {
			out += fmtSepOf(it)
		}
		out += s
	}
	return out, true
}

func fmtSepOf(node *fmtNode) string {
	if node.sep {
		return ", "
	}
	return " "
}

// Binary operators spaced, prefixes tight (§3.11). An operand is never
// directly after an operand: the reader ends a value there.
func fmtInlineExpr(items []*fmtNode) (string, bool) {
	out := ""
	for _, it := range items {
		if "note" == it.t || ("op" == it.t && it.brk) {
			return "", false
		}
		if "op" == it.t {
			out += " " + it.text + " "
			continue
		}
		if "prefix" == it.t {
			out += it.text
			continue
		}
		s, ok := fmtInline(it, true)
		if !ok {
			return "", false
		}
		out += s
	}
	return out, true
}

type fmtWriter struct {
	lines   []string
	line    string
	started bool
}

// A new line at an indentation, after a blank one when asked.
func (w *fmtWriter) open(indent int, blank bool) {
	if w.started {
		w.lines = append(w.lines, fmtRtrim(w.line))
		if blank {
			w.lines = append(w.lines, "")
		}
	}
	w.line = strings.Repeat(" ", indent)
	w.started = true
}

func (w *fmtWriter) text(s string) {
	w.line += s
}

// Nothing on the line yet but its indentation.
func (w *fmtWriter) fresh() bool {
	return "" == strings.TrimSpace(w.line)
}

func (w *fmtWriter) width() int {
	return fmtWidth(w.line)
}

// Where the page is, and the lines written since, the current line
// included: the spelling of one statement, as it stands on the page.
func (w *fmtWriter) mark() int {
	return len(w.lines)
}

func (w *fmtWriter) since(mark int) string {
	out := []string{}
	for _, line := range append(append([]string{}, w.lines[mark:]...), w.line) {
		out = append(out, fmtRtrim(line))
	}
	return strings.Join(out, "\n") + "\n"
}

// The lines since a mark replaced by a text: the spelling before,
// where a rewrite did not pass its check.
func (w *fmtWriter) replace(mark int, text string) {
	lines := strings.Split(text, "\n")
	lines = lines[:len(lines)-1]
	w.line = lines[len(lines)-1]
	w.lines = append(w.lines[:mark], lines[:len(lines)-1]...)
}

func (w *fmtWriter) finish() string {
	if !w.started {
		return ""
	}
	w.lines = append(w.lines, fmtRtrim(w.line))
	return strings.Join(w.lines, "\n") + "\n"
}

// A line never ends in a space: an operator the author left dangling
// (`a: 1 &`, which the parser accepts) would otherwise leave one.
func fmtRtrim(s string) string {
	return strings.TrimRight(s, " ")
}

// The entries of a body, one per line at the indentation, with the
// blank lines the author kept between them (§3.8) -- never at the
// start or the end. In STATEMENT position (`stmt`: the root, and the
// body of a plain map that is itself the value of a statement) a pair
// is laid out by §3.4, which may repeat its key; anywhere else -- a
// list, an operand, an argument -- by §3.5 alone.
func fmtEmitBody(w *fmtWriter, body []*fmtNode, indent int, stmt *fmtStmt) {
	pending := false
	count := 0
	for _, node := range body {
		if "blank" == node.t {
			pending = 0 < count
			continue
		}
		w.open(indent, pending)
		pending = false
		count++
		if "comment" == node.t {
			w.text(node.text)
			continue
		}
		if nil != stmt && "pair" == node.t {
			fmtEmitStatement(w, node, indent, stmt, "")
			continue
		}
		e := fmtChain(node)
		fmtEmitValue(w, e, indent)
		if "" != e.trail {
			w.text(" " + e.trail)
		}
	}
}

// A value onto the current line: its one-line spelling when there is
// one and it fits the budget, and otherwise its several-line form,
// which for a scalar is the same text, too wide and unbreakable.
func fmtEmitValue(w *fmtWriter, node *fmtNode, indent int) {
	if s, ok := fmtInline(node, false); ok && w.width()+fmtWidth(s) <= formatBudget {
		w.text(s)
		return
	}
	switch node.t {
	case "pair":
		w.text(fmtPairHead(node, false))
		v := fmtChain(node.value)
		fmtEmitValue(w, v, indent)
		if "" != v.trail {
			w.text(" " + v.trail)
		}
	case "spread":
		w.text("&: ")
		fmtEmitValue(w, node.value, indent)
	case "map":
		fmtEmitBlock(w, "{", "}", node, indent, nil)
	case "list":
		fmtEmitBlock(w, "[", "]", node, indent, nil)
	case "expr":
		fmtEmitExpr(w, node.items, indent)
	case "call", "paren":
		fmtEmitCall(w, node, indent)
	default:
		w.text(node.text)
	}
}

// A call, or a parenthesis, that has no one-line form or is too wide
// for the budget. Three shapes. Arguments that are all FLAT -- none
// holds a container -- stay on the one line however wide it is: a
// scalar is no narrower on a line of its own, and the formatter never
// breaks a line. The last argument HUGS the parentheses, `hide({` ...
// `})`, `close($.E & {` ... `})`, when it is a container, or an
// expression the author did not break that ends in one, and the
// arguments before it fit on the opener's line: the container decides
// its own lines. Otherwise the parenthesis opens a block: one argument
// per line one level in, the closer alone at the opener's level. A
// call whose last argument hugs is hugged in turn, `type(close({` ...
// `}))`: the schema idiom.
func fmtEmitCall(w *fmtWriter, node *fmtNode, indent int) {
	items := node.inner
	open := "("
	if "call" == node.t {
		items = node.args
		open = node.name + "("
	}
	if one, ok := fmtInlineSeq(items); ok && !fmtAnyHoldsContainer(items) {
		w.text(open + one + ")")
		return
	}
	if 0 < len(items) && fmtHugs(items[len(items)-1]) {
		last := items[len(items)-1]
		head, ok := fmtInlineSeq(items[:len(items)-1])
		lead := ""
		if "" != head {
			lead = head + fmtSepOf(last)
		}
		if ok && ("" == head || w.width()+fmtWidth(open+lead) <= formatBudget) {
			w.text(open + lead)
			fmtEmitValue(w, last, indent)
			w.text(")")
			return
		}
	}
	w.text(open)
	noted := false
	for k, it := range items {
		if "note" == it.t {
			// A comment among the arguments trails the line it was on --
			// the opener's, or an argument's -- and one that followed
			// another comment keeps its own line.
			if noted {
				w.open(indent+2, false)
				w.text(it.text)
			} else {
				w.text(" " + it.text)
			}
			noted = true
			continue
		}
		w.open(indent+2, false)
		fmtEmitValue(w, it, indent+2)
		if next := fmtOperandAfter(items, k); nil != next && next.sep {
			w.text(",")
		}
		noted = false
	}
	w.open(indent, false)
	w.text(")")
}

// Whether a node holds a container anywhere: the argument has a
// several-line form of its own.
func fmtHoldsContainer(node *fmtNode) bool {
	switch node.t {
	case "map", "list":
		return true
	case "call":
		return fmtAnyHoldsContainer(node.args)
	case "paren":
		return fmtAnyHoldsContainer(node.inner)
	case "expr":
		return fmtAnyHoldsContainer(node.items)
	}
	return false
}

func fmtAnyHoldsContainer(items []*fmtNode) bool {
	for _, it := range items {
		if fmtHoldsContainer(it) {
			return true
		}
	}
	return false
}

// Whether a last argument hugs the parentheses: a container; an
// expression with no break and no comment whose last operand is one;
// a call whose own last argument does.
func fmtHugs(node *fmtNode) bool {
	if "map" == node.t || "list" == node.t {
		return true
	}
	if "call" == node.t {
		return 0 < len(node.args) && fmtHugs(node.args[len(node.args)-1])
	}
	if "expr" != node.t {
		return false
	}
	for _, it := range node.items {
		if "note" == it.t || ("op" == it.t && it.brk) {
			return false
		}
	}
	return fmtHugs(node.items[len(node.items)-1])
}

// The operand that follows position k, if one does: a note is not one.
func fmtOperandAfter(items []*fmtNode, k int) *fmtNode {
	for _, x := range items[k+1:] {
		if "note" != x.t {
			return x
		}
	}
	return nil
}

// A container on several lines (§3.5): the opener ends its line, the
// entries are statements one level in, the closer stands alone. An
// empty container is inline whatever the budget says.
func fmtEmitBlock(w *fmtWriter, open, close string, node *fmtNode, indent int, stmt *fmtStmt) {
	if 0 == len(node.body) && "" == node.open {
		w.text(open + close)
		return
	}
	w.text(open)
	if "" != node.open {
		w.text(" " + node.open)
	}
	fmtEmitBody(w, node.body, indent+2, stmt)
	w.open(indent, false)
	w.text(close)
}

// An expression that has no one-line form, or one too wide for the
// budget: the author's breaks are kept, each at its operator, which
// leads its continuation line (§3.11). The continuation is one level
// in when the expression follows a key on its line, and level with
// the first operand when the expression has the line to itself -- an
// argument of a block call, say -- so a disjunction of alternatives
// reads as the list it is. A container operand that does not fit from
// where it stands is a block whose closer lines up with the line that
// opened it.
func fmtEmitExpr(w *fmtWriter, items []*fmtNode, indent int) {
	cont := indent + 2
	if w.fresh() {
		cont = indent
	}
	// Whether the last item was an operand: a comment after one is a
	// space away, and after an operator or the colon it is not. An
	// operand is never directly after an operand (the reader ends a
	// value there), so operands need no such check.
	operand := false
	cur := indent
	for _, it := range items {
		if "op" == it.t {
			if it.brk {
				cur = cont
				if !w.fresh() {
					w.open(cur, false)
				}
				w.text(it.text + " ")
			} else {
				w.text(" " + it.text + " ")
			}
			operand = false
			continue
		}
		if "prefix" == it.t {
			w.text(it.text)
			operand = false
			continue
		}
		if "note" == it.t {
			if operand {
				w.text(" ")
			}
			w.text(it.text)
			cur = cont
			w.open(cur, false)
			operand = false
			continue
		}
		fmtEmitValue(w, it, cur)
		operand = true
	}
}

// ---------------------------------------------------------------------
// The lawful tier (§3.4): repeat the prefix, and merge what repeats.
//
// Both rewrites rest on the meet. `s: a: 1` / `s: b: 2` is one document
// with `s: { a:1 b:2 }`, because a key written twice is a meet and the
// meet of two maps with disjoint keys is their union. So they apply
// only to a PLAIN map in STATEMENT position -- an entry of the root, or
// of a map that is itself the plain value of such an entry -- and never
// to a map that is an operand, an argument or a list element, where
// splitting it would change the document (`close({a:1})` /
// `close({b:2})` does not evaluate at all). And every statement the
// tier rewrites is checked by unification, locally (§7.3): the spelling
// before and the spelling after must come to the same meet, or the
// statement keeps the spelling before. The check is the engine's
// agreement, not the formatter's self-check -- the engine's own repros
// hold maps whose two spellings it evaluates differently -- so failing
// it is no refusal.

// The check of one rewrite: the spelling before and the spelling after.
type fmtMeet func(before, after string) bool

// Statement position: the check, and whether the statement being laid
// out stands inside one that is checked as a whole, which covers it.
// Nil anywhere else -- a list, an operand, an argument.
type fmtStmt struct {
	meet    fmtMeet
	covered bool
}

// The entries of a plain map value: a braced map, or a chain, which is
// a one-entry map. A map with a comment on its opener keeps its braces
// (§3.7), so it is not plain here; nor is a map holding an include,
// which the local check cannot follow.
func fmtPlainEntries(v *fmtNode) ([]*fmtNode, bool) {
	if "pair" == v.t {
		return []*fmtNode{v}, true
	}
	if "map" != v.t || "" != v.open {
		return nil, false
	}
	for _, e := range v.body {
		if "include" == e.t {
			return nil, false
		}
	}
	return v.body, true
}

// The entries of a statement as they stand once it is merged into a
// wider map: its trailing comment sunk onto its last entry, so that it
// travels with the entry it stood beside. False where the value is not
// a plain map, or the comment has no entry to sit on.
func fmtMembers(p *fmtNode) ([]*fmtNode, bool) {
	entries, ok := fmtPlainEntries(p.value)
	if !ok || "" == p.trail {
		return entries, ok
	}
	if 0 == len(entries) {
		return nil, false
	}
	last := entries[len(entries)-1]
	if "pair" != last.t && "spread" != last.t {
		return nil, false
	}
	sunk := *last
	if "" == last.trail {
		sunk.trail = p.trail
	} else {
		sunk.trail = last.trail + " " + p.trail
	}
	return append(append([]*fmtNode{}, entries[:len(entries)-1]...), &sunk), true
}

// Adjacent statements naming one key, whose values are plain maps, are
// one map: their entries in order, with the comments and blank lines
// between the statements travelling with the statement they preceded.
// Only ADJACENT statements merge -- a `server:` line, something else,
// then another `server:` line stays as it is, because merging them
// would move a statement, and the formatter never reorders (§3.13).
// Nor do two statements merge into a map with two spreads: the engine
// keeps those as a conjunction, which is not the meet of the two maps.
// The tree is not changed: a merged statement is a new node that keeps
// the statements it replaces as its `orig`, its spelling before, and a
// statement merged somewhere below is copied the same way.
func fmtMergeRuns(body []*fmtNode) []*fmtNode {
	out := []*fmtNode{}
	i := 0
	for i < len(body) {
		first := body[i]
		var entries []*fmtNode
		ok := false
		if "pair" == first.t {
			entries, ok = fmtMembers(first)
		}
		if !ok {
			if "pair" == first.t {
				out = append(out, fmtMergeDeep(first))
			} else {
				out = append(out, first)
			}
			i++
			continue
		}
		group := []*fmtNode{first}
		merged := entries
		carry := []*fmtNode{}
		j := i + 1
		for ; j < len(body); j++ {
			n := body[j]
			if "comment" == n.t || "blank" == n.t {
				carry = append(carry, n)
				continue
			}
			var more []*fmtNode
			mok := false
			if "pair" == n.t && n.key == first.key && n.opt == first.opt {
				more, mok = fmtMembers(n)
			}
			if !mok || (fmtSpreads(merged) && fmtSpreads(more)) {
				break
			}
			group = append(append(group, carry...), n)
			merged = append(append(append([]*fmtNode{}, merged...), carry...), more...)
			carry = []*fmtNode{}
		}
		if 1 == len(group) {
			out = append(out, fmtMergeDeep(first))
			i++
			continue
		}
		out = append(out, &fmtNode{
			t: "pair", key: first.key, opt: first.opt,
			value: &fmtNode{t: "map", body: fmtMergeRuns(merged)}, orig: group,
		})
		i = j - len(carry)
	}
	return out
}

func fmtSpreads(entries []*fmtNode) bool {
	for _, e := range entries {
		if "spread" == e.t {
			return true
		}
	}
	return false
}

// The merge down a statement's plain-map spine: a chain's inner pair,
// or the entries of a map value, are statements of the map they are
// in. The statement itself where nothing below it merged.
func fmtMergeDeep(p *fmtNode) *fmtNode {
	v := p.value
	entries, ok := fmtPlainEntries(v)
	if !ok {
		return p
	}
	body := fmtMergeRuns(entries)
	same := len(body) == len(entries)
	for k := 0; same && k < len(body); k++ {
		same = body[k] == entries[k]
	}
	if same {
		return p
	}
	out := *p
	out.orig = []*fmtNode{p}
	if "pair" == v.t {
		out.value = body[0]
	} else {
		value := *v
		value.body = body
		out.value = &value
	}
	return &out
}

// The lines of a map repeated under a prefix (§3.4, rule 2): every
// entry written with the prefix in front of it as one line, or --
// where an entry's value is a map that does not fit -- repeated further
// under the longer prefix. Comments and blank lines are kept where
// they stood. False where an entry cannot be one line: a list that
// does not fit, a value that spans lines, a comment closing the map
// (which a repeat could not keep in the map) -- and where the map holds
// two spreads, which repeated would be two maps, and a different meet.
type fmtLine struct {
	t    string
	text string
}

func fmtRepeatLines(entries []*fmtNode, prefix string, indent int) ([]fmtLine, bool) {
	spreads := 0
	for _, e := range entries {
		if "spread" == e.t {
			spreads++
		}
	}
	if 0 == len(entries) || "comment" == entries[len(entries)-1].t || 1 < spreads {
		return nil, false
	}
	out := []fmtLine{}
	for _, e := range entries {
		if "blank" == e.t {
			out = append(out, fmtLine{t: "blank"})
			continue
		}
		if "comment" == e.t {
			out = append(out, fmtLine{t: "comment", text: e.text})
			continue
		}
		trail := ""
		if "" != e.trail {
			trail = " " + e.trail
		}
		if "spread" == e.t {
			// The repeated spread entry is a one-entry map holding only a
			// spread, so by D1's exception it keeps its braces.
			s, ok := fmtInline(e.value, true)
			if !ok || !fmtFits(indent, prefix+"{ &: "+s+" }") {
				return nil, false
			}
			out = append(out, fmtLine{t: "text", text: prefix + "{ &: " + s + " }" + trail})
			continue
		}
		head := prefix + fmtPairHead(e, false)
		if s, ok := fmtInline(fmtChain(e.value), false); ok && fmtFits(indent, head+s) {
			out = append(out, fmtLine{t: "text", text: head + s + trail})
			continue
		}
		sub, ok := fmtPlainEntries(e.value)
		if !ok {
			return nil, false
		}
		lines, ok := fmtRepeatLines(sub, head, indent)
		if !ok {
			return nil, false
		}
		lines[len(lines)-1].text += trail
		out = append(out, lines...)
	}
	return out, true
}

func fmtFits(indent int, text string) bool {
	return indent+fmtWidth(text) <= formatBudget
}

// A pair in statement position, by §3.4. `prefix` is what stands
// before it on its line: the heads of the chain it hangs from, not yet
// written. Its value is laid out by §3.5 unless it is a plain map, and
// then in this order: a chain, when the map holds exactly one pair
// (D1); one line, when that fits the budget; the key repeated over the
// entries, when every entry can be one line that way; a braced block
// otherwise, whose entries are statements in turn. Whether the
// statement was rewritten by this tier -- merged, or repeated -- is
// returned, and the outermost such statement is checked: its spelling
// on the page against what the syntactic tier writes for the
// statements it came from, at the same indentation, which is what
// stays on the page when the check fails.
func fmtEmitStatement(w *fmtWriter, p *fmtNode, indent int, stmt *fmtStmt, prefix string) bool {
	mark := w.mark()
	rewritten := nil != p.orig
	entries, plain := fmtPlainEntries(p.value)
	head := prefix + fmtPairHead(p, false)
	s, one := "", false
	if plain {
		s, one = fmtInline(p.value, false)
	}
	switch {
	case !plain:
		w.text(prefix)
		fmtEmitValue(w, p, indent)
	case 1 == len(entries) && "pair" == entries[0].t:
		inner := fmtEmitStatement(w, entries[0], indent, &fmtStmt{meet: stmt.meet, covered: true}, head)
		rewritten = inner || rewritten
	case one && fmtFits(indent, head+s):
		w.text(head + s)
	default:
		lines, ok := fmtRepeatLines(entries, head, indent)
		if !ok {
			w.text(head)
			fmtEmitBlock(w, "{", "}", p.value, indent,
				&fmtStmt{meet: stmt.meet, covered: stmt.covered || rewritten})
			break
		}
		pending := false
		count := 0
		for _, line := range lines {
			if "blank" == line.t {
				pending = 0 < count
				continue
			}
			if 0 < count {
				w.open(indent, pending)
			}
			pending = false
			count++
			w.text(line.text)
		}
		rewritten = true
	}
	if "" != p.trail {
		w.text(" " + p.trail)
	}
	if rewritten && !stmt.covered {
		orig := p.orig
		if nil == orig {
			orig = []*fmtNode{p}
		}
		before := fmtEmitAt(orig, indent)
		if !stmt.meet(before, w.since(mark)) {
			w.replace(mark, before)
		}
	}
	return rewritten
}

// The syntactic tier's spelling of some statements at an indentation:
// a rewrite's spelling before.
func fmtEmitAt(nodes []*fmtNode, indent int) string {
	w := &fmtWriter{}
	fmtEmitBody(w, nodes, indent, nil)
	return w.finish()
}

// The document: by the syntactic tier alone, or with the lawful tier
// over it when given its check.
func fmtEmit(root []*fmtNode, meet fmtMeet) string {
	w := &fmtWriter{}
	if nil == meet {
		fmtEmitBody(w, root, 0, nil)
	} else {
		fmtEmitBody(w, fmtMergeRuns(root), 0, &fmtStmt{meet: meet})
	}
	return w.finish()
}

// ---------------------------------------------------------------------
// The verb's library surface

// The check: the output parses, and to the same tree. Pre-unification
// canon is that tree, positions aside, and every rewrite of this tier
// leaves it unchanged (§7.3). A package variable so the refusal it
// guards can be exercised: a formatter that is right never takes that
// arm on its own.
var formatSame = formatSameDocument

func formatSameDocument(root Val, after string) bool {
	v, err := formatParse(after, "", nil)
	return nil == err && root.Canon() == v.Canon()
}

// The check of a lawful rewrite: the spelling before and the spelling
// after, evaluated in isolation, come to the same canon, the same
// kinds of failure, and the same outcome of generation (§7.3). Local,
// so it needs no include and no capability, and it applies whether or
// not the document as a whole evaluates. The kinds, not the count: how
// often one unresolved reference is reported depends on the order the
// meet took. Generation too, because the engine generates from more
// than the canon: a meet of maps with a nil member has refused a key
// the same map written once generates. A package variable so the
// spelling before it keeps can be exercised.
var formatMeet = formatSameByMeet

func formatSameByMeet(before, after string) bool {
	return formatMeetOf(before) == formatMeetOf(after)
}

func formatMeetOf(text string) string {
	v, perr := formatParse(text, "", nil)
	if nil != perr { //coverage:ignore a spelling the formatter wrote that does not parse is its defect, and the syntactic check catches those first
		return "\nsyntax"
	}
	res, ctx, err := (&Aontu{}).unifyCtx(v, nil, text)
	kinds := formatKinds(ctx.err)
	// The outcome of generation, as GenerateVars decides it: the kinds
	// of a unification that failed; a nil root's own kind; else the
	// first refusal of generation or of the relation verdict.
	outcome := "generated"
	switch {
	case nil != err:
		outcome = kinds
	case res.Nil():
		outcome = res.(*NilVal).why
	default:
		if _, gerr := res.Gen(ctx); nil != gerr {
			outcome = gerr.(*AontuError).Code
		} else if rerr := relationErrors(ctx, res); nil != rerr {
			outcome = rerr.(*AontuError).Code
		}
	}
	return res.Canon() + "\n" + kinds + "\n" + outcome
}

func formatKinds(errs []*NilVal) string {
	whys := []string{}
	seen := map[string]bool{}
	for _, e := range errs {
		if !seen[e.why] {
			seen[e.why] = true
			whys = append(whys, e.why)
		}
	}
	sort.Strings(whys)
	return strings.Join(whys, ",")
}

func formatDepthFinding() VetFinding {
	return VetFinding{
		Class:    "budget",
		Code:     "max_depth",
		Message:  "The document nests more than " + itoa(formatMaxDepth) + " levels deep, past what the formatter reads.",
		Path:     "$",
		Severity: "error",
		Sites:    []VetSite{},
	}
}

func formatCheckFinding(path, expected, actual string) VetFinding {
	note := "a formatter defect: please report it with the source"
	if "" != path {
		note += " (" + path + ")"
	}
	return VetFinding{
		Actual:   strPtr(actual),
		Class:    "internal",
		Code:     "format_check",
		Expected: strPtr(expected),
		Message:  "The formatted text is not the same document, so nothing was written.",
		Note:     strPtr(note),
		Path:     "$",
		Severity: "error",
		Sites:    []VetSite{},
	}
}

// Format writes one document in the agreed form. The text is that
// form; Changed says whether it differs from what was given, which is
// what `--check` and `--list` report. File names the document in the
// site of a parse failure. Mirrors format in ts/src/format.ts.
func (a *Aontu) Format(src string) FormatReport {
	formatMu.Lock()
	defer formatMu.Unlock()

	// Invalid UTF-8 becomes U+FFFD, as it does when the canonical port
	// reads the file: the two CLIs then print the same bytes.
	text := strings.ReplaceAll(toValidSource(src), "\r\n", "\n")
	toks := []fmtTok{}
	root, perr := formatParse(text, a.File, &toks)
	if nil != perr {
		return FormatReport{
			Verdict: "error",
			Errors:  []VetFinding{parseFinding(a.File, VetRoleData, perr)},
		}
	}
	rd := &fmtReader{T: toks}
	body, _ := rd.body("", false)
	if rd.deep {
		return FormatReport{Verdict: "error", Errors: []VetFinding{formatDepthFinding()}}
	}
	// The syntactic tier first, checked against the parse tree; then
	// the lawful tier over it, each rewrite checked by the meet.
	tree := fmtUnwrap(body)
	plain := fmtEmit(tree, nil)
	if !formatSame(root, plain) {
		return FormatReport{
			Verdict: "error",
			Errors:  []VetFinding{formatCheckFinding(a.File, root.Canon(), plain)},
		}
	}
	out := fmtEmit(tree, formatMeet)
	return FormatReport{Verdict: "formatted", Text: out, Changed: out != src}
}

// ---------------------------------------------------------------------
// The unified diff of `--diff`

// A patience diff: lines unique to both sides, in order, are the
// anchors, and the gaps between them recurse. Not always the shortest
// edit script, but linear in space, and the same script from both
// ports, which is what a shared golden needs.

type fmtEdit struct {
	op   byte
	text string
}

// The lines of a text, with a marker on the last when the text does
// not end in a newline: such a line never equals its
// newline-terminated twin, which is how the diff reports the
// difference, and the marker is rendered as diff renders it. NUL,
// which no source line ends in.
var fmtNoNewline = string(rune(0))

func fmtTextLines(text string) []string {
	if "" == text {
		return []string{}
	}
	lines := strings.Split(text, "\n")
	if "" == lines[len(lines)-1] {
		lines = lines[:len(lines)-1]
	} else {
		lines[len(lines)-1] += fmtNoNewline
	}
	return lines
}

// The longest chain of anchors in order on both sides: patience
// sorting over the right-hand positions, with the left already
// ascending.
func fmtLongestChain(pairs [][2]int) [][2]int {
	tails := []int{}
	prev := make([]int, len(pairs))
	for k := range pairs {
		j := pairs[k][1]
		lo, hi := 0, len(tails)
		for lo < hi {
			mid := (lo + hi) >> 1
			if pairs[tails[mid]][1] < j {
				lo = mid + 1
			} else {
				hi = mid
			}
		}
		prev[k] = -1
		if 0 < lo {
			prev[k] = tails[lo-1]
		}
		if lo == len(tails) {
			tails = append(tails, k)
		} else {
			tails[lo] = k
		}
	}
	out := [][2]int{}
	k := -1
	if 0 < len(tails) {
		k = tails[len(tails)-1]
	}
	for 0 <= k {
		out = append(out, pairs[k])
		k = prev[k]
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

func fmtPatience(a []string, x0, x1 int, b []string, y0, y1 int, out *[]fmtEdit) {
	for x0 < x1 && y0 < y1 && a[x0] == b[y0] {
		*out = append(*out, fmtEdit{op: ' ', text: a[x0]})
		x0++
		y0++
	}
	tail := 0
	for x0 < x1-tail && y0 < y1-tail && a[x1-1-tail] == b[y1-1-tail] {
		tail++
	}
	x1 -= tail
	y1 -= tail

	countA := map[string]int{}
	countB := map[string]int{}
	posB := map[string]int{}
	for x := x0; x < x1; x++ {
		countA[a[x]]++
	}
	for y := y0; y < y1; y++ {
		countB[b[y]]++
		posB[b[y]] = y
	}
	pairs := [][2]int{}
	for x := x0; x < x1; x++ {
		if 1 == countA[a[x]] && 1 == countB[a[x]] {
			pairs = append(pairs, [2]int{x, posB[a[x]]})
		}
	}
	anchors := fmtLongestChain(pairs)

	if 0 == len(anchors) {
		for x := x0; x < x1; x++ {
			*out = append(*out, fmtEdit{op: '-', text: a[x]})
		}
		for y := y0; y < y1; y++ {
			*out = append(*out, fmtEdit{op: '+', text: b[y]})
		}
	} else {
		x, y := x0, y0
		for _, anchor := range anchors {
			fmtPatience(a, x, anchor[0], b, y, anchor[1], out)
			*out = append(*out, fmtEdit{op: ' ', text: a[anchor[0]]})
			x = anchor[0] + 1
			y = anchor[1] + 1
		}
		fmtPatience(a, x, x1, b, y, y1, out)
	}

	for k := 0; k < tail; k++ {
		*out = append(*out, fmtEdit{op: ' ', text: a[x1+k]})
	}
}

// UnifiedDiff is the diff of two texts in unified format, three lines
// of context, the file named on both sides. Empty when the texts are
// the same. Mirrors unifiedDiff in ts/src/format.ts.
func UnifiedDiff(name, before, after string) string {
	a := fmtTextLines(before)
	b := fmtTextLines(after)
	edits := []fmtEdit{}
	fmtPatience(a, 0, len(a), b, 0, len(b), &edits)

	// Hunks: changes closer than twice the context share one.
	hunks := [][2]int{}
	for k := range edits {
		if ' ' == edits[k].op {
			continue
		}
		if 0 < len(hunks) && k-hunks[len(hunks)-1][1] <= 6 {
			hunks[len(hunks)-1][1] = k
		} else {
			hunks = append(hunks, [2]int{k, k})
		}
	}
	if 0 == len(hunks) {
		return ""
	}

	out := []string{"--- a/" + name, "+++ b/" + name}
	ai, bi, next := 0, 0, 0
	for _, h := range hunks {
		from := h[0] - 3
		if from < 0 {
			from = 0
		}
		to := h[1] + 4
		if len(edits) < to {
			to = len(edits)
		}
		// Everything between two hunks is context -- a change would have
		// opened a hunk -- so both sides advance together.
		for ; next < from; next++ {
			ai++
			bi++
		}
		alen, blen := 0, 0
		lines := []string{}
		for k := from; k < to; k++ {
			ed := edits[k]
			if '+' != ed.op {
				alen++
			}
			if '-' != ed.op {
				blen++
			}
			if strings.HasSuffix(ed.text, fmtNoNewline) {
				lines = append(lines, string(ed.op)+strings.TrimSuffix(ed.text, fmtNoNewline))
				lines = append(lines, "\\ No newline at end of file")
			} else {
				lines = append(lines, string(ed.op)+ed.text)
			}
		}
		out = append(out, "@@ -"+fmtRange(ai, alen)+" +"+fmtRange(bi, blen)+" @@")
		out = append(out, lines...)
		ai += alen
		bi += blen
		next = to
	}
	return strings.Join(out, "\n") + "\n"
}

// A hunk range as diff writes it: the first line, 1-based, and the
// count; an empty range names the line before it.
func fmtRange(at, n int) string {
	if 0 == n {
		return itoa(at) + ",0"
	}
	return itoa(at+1) + "," + itoa(n)
}
