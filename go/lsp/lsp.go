/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	aontu "github.com/aontu-lang/aontu/go"
)

// Severity values (a subset of the LSP DiagnosticSeverity enum).
const (
	SeverityError       = 1
	SeverityWarning     = 2
	SeverityInformation = 3
	SeverityHint        = 4
)

// Position is a zero-based line / UTF-16 character offset, as defined by
// the LSP specification.
type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

// Range is an inclusive-start, exclusive-end span of source text.
type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Diagnostic struct {
	Range    Range  `json:"range"`
	Severity int    `json:"severity"`
	Code     string `json:"code,omitempty"`
	Source   string `json:"source"`
	Message  string `json:"message"`
	// LSP DiagnosticTag values; 1 is Unnecessary, 2 is Deprecated —
	// the native tag editors strike through (G3 phase 4).
	Tags []int `json:"tags,omitempty"`
}

func Diagnostics(src string) []Diagnostic {
	return DiagnosticsVars(src, nil)
}

// DiagnosticsVars is Diagnostics with $name variables resolved from vars.
func DiagnosticsVars(src string, vars map[string]aontu.Val) []Diagnostic {
	return DiagnosticsTrust(src, vars, nil)
}

func DiagnosticsTrust(src string, vars map[string]aontu.Val, trust *aontu.TrustOptions) []Diagnostic {
	a := aontu.New()
	a.Trust = trust
	probs := a.CheckVars(src, vars)
	idx := newLineIndex(src)

	out := make([]Diagnostic, 0, len(probs))
	for _, p := range probs {
		var rng Range
		if p.Pos < 0 {
			// No known position: flag the start of the document.
			rng = Range{Position{0, 0}, Position{0, 1}}
		} else {
			start := idx.position(p.Pos)
			end := idx.position(p.Pos + p.Len)
			rng = Range{start, end}
		}
		out = append(out, Diagnostic{
			Range:    rng,
			Severity: SeverityError,
			Code:     p.Why,
			Source:   "aontu",
			Message:  p.Message,
		})
	}

	for _, d := range a.DeprecationsVars(src, vars) {
		start := idx.position(d.Pos)
		end := idx.position(d.Pos + d.Len)
		msg := "deprecated"
		if m, ok := d.Record["msg"]; ok {
			msg += ": " + m
		}
		if u, ok := d.Record["use"]; ok {
			msg += " (use " + u + ")"
		}
		if sv, ok := d.Record["since"]; ok {
			msg += " (since " + sv + ")"
		}
		out = append(out, Diagnostic{
			Range:    Range{start, end},
			Severity: SeverityHint,
			Code:     "deprecated",
			Source:   "aontu",
			Message:  msg,
			Tags:     []int{2},
		})
	}
	return out
}

// --- Hover ------------------------------------------------------------

type MarkupContent struct {
	Kind  string `json:"kind"` // "markdown" | "plaintext"
	Value string `json:"value"`
}

// HoverResult is the LSP hover response.
type HoverResult struct {
	Contents MarkupContent `json:"contents"`
	Range    *Range        `json:"range,omitempty"`
}

// Hover resolves the value at a cursor position and describes it, or
// returns nil when the position is not over a concrete value. Because it
// reads the *unified* tree, a value shows its resolved canon and kind.
func Hover(src string, line, character int, provenance bool) *HoverResult {
	return HoverTrust(src, line, character, provenance, nil)
}

func HoverTrust(
	src string, line, character int, provenance bool,
	trust *aontu.TrustOptions,
) *HoverResult {
	// A NAME IS NOT A VALUE: the tree holds what it resolves to, at the
	// declaration's site, so a use has no span for the search below.
	if at, bind, ok := aliasBindingAt(src, line, character); ok {
		return &HoverResult{
			Contents: MarkupContent{Kind: "markdown", Value: aliasMarkdown(bind)},
			Range: &Range{
				Start: Position{Line: line, Character: at.start},
				End:   Position{Line: line, Character: at.end},
			},
		}
	}

	a := aontu.New()
	a.Trust = trust
	spans := a.Spans(src)
	if spans == nil {
		return nil
	}
	idx := newLineIndex(src)
	cur := idx.offsetAt(line, character)

	best := -1
	for i, s := range spans {
		if s.Pos <= cur && cur < s.Pos+s.Len {
			// Most specific (smallest) span wins.
			if best < 0 || s.Len < spans[best].Len {
				best = i
			}
		}
	}
	if best < 0 {
		return nil
	}
	s := spans[best]
	return &HoverResult{
		Contents: MarkupContent{Kind: "markdown", Value: hoverMarkdown(s) +
			provenanceOf(src, s, provenance, trust)},
		Range: &Range{Start: idx.position(s.Pos), End: idx.position(s.Pos + s.Len)},
	}
}

// provenanceOf is the gate: nothing at all unless the editor asked.
func provenanceOf(
	src string, s aontu.ValueSpan, on bool, trust *aontu.TrustOptions,
) string {
	if !on {
		return ""
	}
	return provenanceMarkdown(src, s.Path, trust)
}

func hoverMarkdown(s aontu.ValueSpan) string {
	return "```aontu\n" + s.Canon + "\n```\n\n*" + s.Kind + "*"
}

func provenanceMarkdown(
	src string, path []string, trust *aontu.TrustOptions,
) string {
	if 0 == len(path) {
		return ""
	}
	// A document with an error ELSEWHERE still hovers — the tree the
	// hover walked is there — while Why refuses it, so the record may
	// be absent for a value the cursor is sitting on.
	a := aontu.New()
	a.Trust = trust
	report := a.Why(src, "$."+strings.Join(path, "."))
	if !report.OK || nil == report.Record {
		return ""
	}
	return contributionsMarkdown(report.Record.Conjuncts)
}

// contributionsMarkdown renders the contributions as hover markdown.
// Separated for the direct test (ADR-002): a siteless contribution and
// a named file are both shapes the record allows and no hover
// produces, hover evaluating one unnamed document.
func contributionsMarkdown(conjuncts []aontu.WhyConjunct) string {
	if 0 == len(conjuncts) {
		return ""
	}
	lines := make([]string, 0, len(conjuncts))
	for _, c := range conjuncts {
		where := ""
		if 0 <= c.Site.Row {
			name := ""
			if "" != c.Site.File {
				name = c.Site.File + ":"
			}
			where = " (" + name +
				strconv.Itoa(c.Site.Row) + ":" + strconv.Itoa(c.Site.Col) + ")"
		}
		lines = append(lines, "- `"+c.Canon+"` — "+c.Role+where)
	}
	return "\n\n---\n\nContributions:\n" + strings.Join(lines, "\n")
}


// --- Aliases ----------------------------------------------------------

// Location is the LSP textDocument/definition response.
type Location struct {
	URI   string `json:"uri"`
	Range Range  `json:"range"`
}

// aliasSpan is the alias name the cursor sits on. A `%` inside a string
// is text (`a: "%foo"`), so quoted runs are stepped over.
type aliasSpan struct {
	name       string
	start, end int
}

func aliasAt(src string, line, character int) (aliasSpan, bool) {
	lines := strings.Split(src, "\n")
	if line < 0 || line >= len(lines) {
		return aliasSpan{}, false
	}
	text := lines[line]
	for i := 0; i < len(text); i++ {
		c := text[i]
		if '"' == c || '\'' == c {
			for i++; i < len(text) && text[i] != c; i++ {
			}
			continue
		}
		if '%' != c {
			continue
		}
		m := aontu.AliasNameAt(text[i:])
		if "" == m {
			continue
		}
		if i <= character && character < i+len(m) {
			return aliasSpan{name: m, start: i, end: i + len(m)}, true
		}
		i += len(m) - 1
	}
	return aliasSpan{}, false
}

// Nothing where the name is used but never bound: diagnostics report it.
func aliasBindingAt(
	src string, line, character int,
) (aliasSpan, aontu.AliasBinding, bool) {
	at, ok := aliasAt(src, line, character)
	if !ok {
		return at, aontu.AliasBinding{}, false
	}
	for _, bind := range aontu.AliasScope(src) {
		if bind.Name == at.name {
			return at, bind, true
		}
	}
	return at, aontu.AliasBinding{}, false
}

func aliasMarkdown(bind aontu.AliasBinding) string {
	from := ""
	if "" != bind.From {
		from = ", taken from " + bind.From
	}
	return "```aontu\n" + bind.Decl + "\n```\n\n*alias" + from + "*"
}

// Definition goes to where the name is BOUND: its declaration, or the
// destructure, which is where this file gets it.
func Definition(src string, line, character int, uri string) *Location {
	_, bind, ok := aliasBindingAt(src, line, character)
	if !ok {
		return nil
	}
	row := bind.Row - 1
	col := bind.Col - 1
	return &Location{URI: uri, Range: Range{
		Start: Position{Line: row, Character: col},
		End:   Position{Line: row, Character: col + len(bind.Name)},
	}}
}


// LSP CompletionItemKind subset.
const (
	CompletionFunction = 3
	CompletionVariable = 6
	CompletionKeyword  = 14
)

// CompletionItem is a single LSP completion suggestion.
type CompletionItem struct {
	Label  string `json:"label"`
	Kind   int    `json:"kind,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// Completions returns the built-in functions, scalar-kind keywords and
// literals, and the names this document binds. Clients filter by the
// typed prefix.
func Completions(src string) []CompletionItem {
	out := []CompletionItem{}
	for _, f := range aontu.BuiltinFuncNames() {
		// The detail is the rendered SIGNATURE
		// (docs/design/SIGNATURES.0.md) -- the same renderer the hints
		// use, so the completion list cannot drift from the
		// declaration.
		out = append(out, CompletionItem{Label: f, Kind: CompletionFunction, Detail: aontu.FuncSignature(f)})
	}
	for _, k := range []string{"string", "number", "integer", "float",
		"biginteger", "bigdecimal", "boolean"} {
		out = append(out, CompletionItem{Label: k, Kind: CompletionKeyword, Detail: "scalar kind"})
	}
	// `_` joins these as of G8 phase 3: it is a literal of the language
	// now, not text.
	for _, k := range []string{"_", "true", "false", "null", "top"} {
		out = append(out, CompletionItem{Label: k, Kind: CompletionKeyword, Detail: "keyword"})
	}
	// A name that binds more than once is still one name to offer.
	named := map[string]bool{}
	for _, bind := range aontu.AliasScope(src) {
		if named[bind.Name] {
			continue
		}
		named[bind.Name] = true
		detail := "alias"
		if "" != bind.From {
			detail = "alias from " + bind.From
		}
		out = append(out, CompletionItem{
			Label: bind.Name, Kind: CompletionVariable, Detail: detail})
	}
	return out
}

// SignatureInfo, ParameterInfo and SignatureHelpResult are the LSP
// signatureHelp shapes.
type ParameterInfo struct {
	Label string `json:"label"`
}

type SignatureInfo struct {
	Label      string          `json:"label"`
	Parameters []ParameterInfo `json:"parameters"`
}

type SignatureHelpResult struct {
	Signatures      []SignatureInfo `json:"signatures"`
	ActiveSignature int             `json:"activeSignature"`
	ActiveParameter int             `json:"activeParameter"`
}

func SignatureHelp(text string, line, character int) *SignatureHelpResult {
	lines := strings.Split(text, "\n")
	if line < 0 {
		line = 0
	}
	if len(lines) <= line {
		line = len(lines) - 1
	}
	offset := 0
	for li := 0; li < line; li++ {
		offset += len(lines[li]) + 1
	}
	col := character
	if col < 0 {
		col = 0
	}
	if len(lines[line]) < col {
		col = len(lines[line])
	}
	offset += col

	depth := 0
	commas := 0
	open := -1
	for i := offset - 1; 0 <= i; i-- {
		c := text[i]
		if '"' == c || '\'' == c {
			for i--; 0 <= i && text[i] != c; i-- {
			}
			continue
		}
		if ')' == c {
			depth++
		} else if '(' == c {
			if 0 == depth {
				open = i
				break
			}
			depth--
		} else if ',' == c && 0 == depth {
			commas++
		} else if '\n' == c && 0 == depth {
			break
		}
	}
	if 0 > open {
		return nil
	}
	start := open
	for 0 < start && (isWordByte(text[start-1])) {
		start--
	}
	name := text[start:open]
	label := aontu.FuncSignature(name)
	if "" == label {
		return nil
	}
	params := aontu.FuncSignatureParams(name)
	pis := make([]ParameterInfo, 0, len(params))
	for _, p := range params {
		pis = append(pis, ParameterInfo{Label: p})
	}
	active := commas
	if last := len(params) - 1; last < active {
		if 0 > last {
			last = 0
		}
		active = last
	}
	return &SignatureHelpResult{
		Signatures:      []SignatureInfo{{Label: label, Parameters: pis}},
		ActiveSignature: 0,
		ActiveParameter: active,
	}
}

func isWordByte(c byte) bool {
	return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') ||
		('0' <= c && c <= '9') || '_' == c
}

type lineIndex struct {
	src        string
	lineStarts []int // byte offset of the start of each line
}

func newLineIndex(src string) *lineIndex {
	starts := []int{0}
	for i := 0; i < len(src); i++ {
		if src[i] == '\n' {
			starts = append(starts, i+1)
		}
	}
	return &lineIndex{src: src, lineStarts: starts}
}

func (li *lineIndex) position(off int) Position {
	if off < 0 {
		off = 0
	}
	if off > len(li.src) {
		off = len(li.src)
	}
	// Largest line start <= off (linear-from-end is fine; sources are
	// small and offsets are typically near the start of their line).
	line := 0
	for i := len(li.lineStarts) - 1; i >= 0; i-- {
		if li.lineStarts[i] <= off {
			line = i
			break
		}
	}
	col := utf16Len(li.src[li.lineStarts[line]:off])
	return Position{Line: line, Character: col}
}

// offsetAt converts an LSP Position (line, UTF-16 character) to a byte
// offset into the source — the inverse of position.
func (li *lineIndex) offsetAt(line, character int) int {
	if line < 0 {
		line = 0
	}
	if line >= len(li.lineStarts) {
		return len(li.src)
	}
	off := li.lineStarts[line]
	units := 0
	for off < len(li.src) && li.src[off] != '\n' && units < character {
		r, size := utf8.DecodeRuneInString(li.src[off:])
		off += size
		units += len(utf16.Encode([]rune{r}))
	}
	return off
}

func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n += len(utf16.Encode([]rune{r}))
	}
	return n
}
