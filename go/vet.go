/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const (
	VetValid      = "valid"
	VetInvalid    = "invalid"
	VetIncomplete = "incomplete"
	VetError      = "error"
)

const (
	VetRoleData   = "data"
	VetRoleSchema = "schema"
)

const VetMaxErrors = 20

const (
	vetSchemaURL = "schema"
	vetDataURL   = "data"
)

type VetSite struct {
	Col int `json:"col"`
	// File is ALWAYS present, and empty when the value belongs to
	// neither document -- one unification minted, rather than one
	// either document wrote. A consumer reads `file` without a presence
	// check; the canonical port coerces the same way.
	File string `json:"file"`
	Len  int    `json:"len"`
	Role string `json:"role"`
	Row  int    `json:"row"`
	Src   string `json:"src"`
	Value string `json:"value"`
}

// VetFinding is one thing that does not hold. The optional fields are
// POINTERS so an absent one is omitted and a present-but-empty one is
// written: `omitempty` on a plain string cannot tell those apart, and
// the canonical emitter drops only what is undefined.
type VetFinding struct {
	Actual   *string `json:"actual,omitempty"`
	Class    string  `json:"class"`
	Code     string  `json:"code"`
	Expected *string `json:"expected,omitempty"`
	Hint *string `json:"hint,omitempty"`

	Message  string    `json:"message"`
	Note     *string   `json:"note,omitempty"`
	Path     string    `json:"path"`
	Severity string    `json:"severity"`
	Sites    []VetSite `json:"sites"`
}

// VetReport is the whole answer: one verdict, and the findings behind
// it (capped, with truncation declared rather than silent).
type VetReport struct {
	// Coverage is what the check actually EXAMINED (G11 phase 5).
	// Absent unless the run asked for it, so no existing report
	// changes shape. Declared first: the field order is LEXICOGRAPHIC
	// by JSON name, the canonical emitter's order.
	Coverage  *VetCoverage `json:"coverage,omitempty"`
	Findings  []VetFinding `json:"findings"`
	Truncated bool         `json:"truncated"`
	Verdict   string       `json:"verdict"`
}

type VetOptions struct {
	At      string // validate against this path of the schema
	Closed  bool   // close() the anchor for this run
	Partial bool   // residue is not a failure
	MaxErrors int

	// Coverage accounts for what the check examined (G11 phase 5). Off
	// by default: the report gains a Coverage object only when this is
	// set, so no existing caller's report changes shape.
	Coverage bool
	// CoverageAt measures under this path of the DATA only, instead of
	// the whole document -- `render --coverage`'s --coverage-at, for
	// the same reason: a caller gating one subtree should not be
	// answered about the rest. Ignored unless Coverage is set.
	CoverageAt string

	SchemaURL string
	DataURL   string // provenance label for data sites

	Trust *TrustOptions

	// TextExt is the extensions additionally read as text (the CLI's
	// --text-ext), the other half of what an include may read.
	TextExt []string

	SchemaPath string
	DataPath   string
}

func aontuForPathTrust(
	path string, trust *TrustOptions, textExt []string) *Aontu {
	a := New()
	if "" != path {
		a = NewWithBase(filepath.Dir(path))
	}
	if nil != trust {
		a.Trust = trust
	}
	a.TextExt = textExt
	return a
}

type vetSources map[string]string

type vetProv struct {
	// data holds the urls the data walk reached. Roles are decided by
	// membership, on the RAW url -- never by a name comparison.
	data       map[string]bool
	schemaURL  string
	schemaPath string
	dataURL    string
	dataPath   string
}

func (p vetProv) name(url, role string) string {
	if VetRoleData == role {
		return displayFile(url, orSelf(p.dataURL, url), p.dataPath)
	}
	return displayFile(url, orSelf(p.schemaURL, url), p.schemaPath)
}

// orSelf is the "this run has no label for that document" fallback: a
// url that is its own label is returned unchanged by displayFile.
func orSelf(label, url string) string {
	if "" == label {
		return url
	}
	return label
}

func displayFile(url, label, path string) string {
	if url == label || "" == path || "" == url || !filepath.IsAbs(url) {
		return url
	}
	base, err := filepath.Abs(path)
	if err != nil { //coverage:ignore Abs fails only on an unreadable cwd
		return url
	}
	rel, err := filepath.Rel(filepath.Dir(base), url)
	if err != nil { //coverage:ignore needs two drives, so no test can reach it
		return url
	}
	dir := filepath.Dir(label)
	if "." == dir {
		return rel
	}
	return filepath.Join(dir, rel)
}

func siteOf(v Val, prov vetProv, sources vetSources) *VetSite {
	if v == nil {
		return nil
	}
	file := v.srcurl()
	role := VetRoleSchema
	if prov.data[file] {
		role = VetRoleData
	}
	src, haveSrc := sources[file]
	row, col := -1, -1
	if haveSrc && 0 <= v.pos() {
		row, col = rowCol(src, v.pos())
	}
	return &VetSite{
		Col: col, File: prov.name(file, role), Len: v.srclen(), Role: role,
		Row: row, Src: v.srctext(), Value: v.Canon(),
	}
}

// sitesOf lists the data site first — it is the thing to fix — then the
// schema site. The underlying NilVal fields are untouched: this is a
// report-layer projection, so the existing error.tsv assertions do not
// move.
func sitesOf(n *NilVal, prov vetProv, sources vetSources) []VetSite {
	sites := []VetSite{}
	// The nil ITSELF when it has no operands: a failure raised about a
	// CONSTRUCT rather than about a failed meet -- a lossy integer
	// literal, say -- carries none, and reporting it about itself is
	// what ctx.adderr already does for the same reason.
	primary := n.primary
	if nil == primary {
		primary = n
	}
	if s := siteOf(primary, prov, sources); s != nil {
		sites = append(sites, *s)
	}
	if s := siteOf(n.secondary, prov, sources); s != nil {
		sites = append(sites, *s)
	}

	out := make([]VetSite, 0, len(sites))
	for _, s := range sites {
		if VetRoleData == s.Role {
			out = append(out, s)
		}
	}
	for _, s := range sites {
		if VetRoleData != s.Role {
			out = append(out, s)
		}
	}
	return out
}

func hintOf(why string, details map[string]string) *string {
	hint := hints[why]
	if "" == hint {
		return nil
	}
	// A placeholder carries coloured engine text; stripped like the rest.
	text := strings.TrimRight(
		ansiRe.ReplaceAllString(strinject(hint, details), ""), " \t\r\n")
	return &text
}

func fromRegistry(f VetFinding, code string,
	details map[string]string) VetFinding {
	f.Hint = hintOf(code, details)

	if v, ok := details["expected"]; ok {
		f.Expected = &v
	}
	if v, ok := details["actual"]; ok {
		f.Actual = &v
	}
	if v, ok := details["message"]; ok {
		f.Note = &v
	}

	return f
}

func findingOf(n *NilVal, prov vetProv, sources vetSources) VetFinding {
	return fromRegistry(VetFinding{
		Class:    n.Class(),
		Code:     n.why,
		Message:  n.Headline(),
		Path:     n.Path(),
		Severity: "error",
		Sites:    sitesOf(n, prov, sources),
	}, n.why, n.details)
}

// vetOrderPad zero-pads row and column so lexicographic order is numeric
// order.
const vetOrderPad = 9

func vetOrderKey(f VetFinding, index int) string {
	site := VetSite{}
	if 0 < len(f.Sites) {
		site = f.Sites[0]
	}
	pad := func(n int) string {
		s := strconv.Itoa(n)
		if len(s) < vetOrderPad {
			s = strings.Repeat("0", vetOrderPad-len(s)) + s
		}
		return s
	}
	return strings.Join([]string{
		site.File, pad(site.Row), pad(site.Col), f.Code, f.Path, pad(index),
	}, "\x00")
}

func failureFinding(ctx *Ctx, url, src string, failed ...Val) VetFinding {
	var n *NilVal
	if 0 < len(ctx.err) {
		n = ctx.err[0]
	} else if 0 < len(failed) {
		n, _ = failed[0].(*NilVal)
	}
	if nil == n { //coverage:ignore the last resort for a root that is nil-the-INTERFACE rather than nil-the-value: every caller's condition is `nil == root || root.Nil() || 0 < len(ctx.err)`, and the first arm has never been observed to fire, but a typed-nil assertion that failed would otherwise dereference nil here — the panic this whole function was fixed to stop (use-cases/BUGS.md §43)
		n = newNil("internal")
		n.primary = n
	}

	urls := map[string]bool{url: true}
	for _, v := range []Val{n, n.primary, n.secondary} {
		if nil == v {
			continue
		}
		if "" == v.srcurl() {
			v.setSrcurl(url)
		}
		urls[v.srcurl()] = true
	}

	return findingOf(n, vetProv{data: urls}, vetSources{url: src})
}

// anchorAt walks the evaluated schema to the anchor path. `$` and
// `$.a.b` are both accepted, as is the bare `a.b` a shell is likely to
// hand over unquoted.
func anchorAt(root Val, at string) Val {
	trimmed := strings.TrimPrefix(at, "$")
	node := root
	for _, part := range strings.Split(trimmed, ".") {
		if "" == part {
			continue
		}
		node = throughResidue(node)
		switch n := node.(type) {
		case *MapVal:
			child, ok := n.peg[part]
			if !ok {
				return nil
			}
			node = child
		case *ListVal:
			// The same canonical-decimal index a reference takes
			// (listIndex, ref.go), so `$.a.01` names nothing here
			// exactly as it names nothing there.
			i, ok := listIndex(part)
			if !ok || len(n.peg) <= i {
				return nil
			}
			node = n.peg[i]
		default:
			return nil
		}
	}
	return node
}

func anchorSegs(at string) []string {
	out := []string{}
	for _, part := range strings.Split(strings.TrimPrefix(at, "$"), ".") {
		if "" != part {
			out = append(out, part)
		}
	}
	return out
}

// throughResidue is the container inside a settled sizing residue, or
// the value itself.
func throughResidue(v Val) Val {
	if _, bag, ok := sizingResidue(v); ok {
		return bag
	}
	return v
}

// The parser's colour escapes: no place in a machine-readable report.
var ansiRe = regexp.MustCompile("\u001b\\[[0-9;]*m")

// headline is a rendered engine message cut to its first line.
func headline(msg string) string {
	text := ansiRe.ReplaceAllString(msg, "")
	if i := strings.IndexByte(text, '\n'); 0 <= i {
		text = text[:i]
	}
	return text
}

// engineFinding is an ENGINE code at a path the caller names: class and
// hint from the registry row, message the headline alone. Mirrors
// engineFinding in ts/src/vet.ts.
func engineFinding(err error, path string) VetFinding {
	code := "unify_failed"
	msg := "The document does not evaluate."
	var details map[string]string
	if ae, ok := err.(*AontuError); ok && nil != ae {
		if "" != ae.Code {
			code = ae.Code
		}
		msg = ae.Msg
		details = ae.Details
	}
	return fromRegistry(VetFinding{
		Class:    codeClass(code),
		Code:     code,
		Message:  headline(msg),
		Path:     path,
		Severity: "error",
		Sites:    []VetSite{},
	}, code, details)
}

func parseFinding(url, role string, err error) VetFinding {
	ae, ok := err.(*AontuError)
	if !ok { //coverage:ignore every parse failure path returns an *AontuError (lang.go)
		ae = &AontuError{Msg: err.Error(), Code: "parse", Row: -1, Col: -1}
	}
	code := ae.Code
	if "" == code { //coverage:ignore parseBase names a code on every failure path
		code = "parse"
	}
	row, col := ae.Row, ae.Col
	if 0 == row && 0 == col {
		// An error that carries no position: the zero value, not a
		// located 0:0, which cannot occur (rows and columns are
		// 1-based).
		row, col = -1, -1
	}
	return VetFinding{
		Class:    codeClass(code),
		Code:     code,
		Hint:     hintOf(code, nil),
		Message:  headline(ae.Msg),
		Path:     "$",
		Severity: "error",
		Sites: []VetSite{{
			Col:  col,
			File: url,
			// No value, so no span: this site names a document that did
			// not parse, not a value inside one.
			Len:   -1,
			Role:  role,
			Row:   row,
			Value: "nil",
		}},
	}
}

func Vet(schemaSrc, dataSrc string, opts *VetOptions) VetReport {
	options := VetOptions{}
	if opts != nil {
		options = *opts
	}
	schemaURL := vetSchemaURL
	if "" != options.SchemaURL {
		schemaURL = options.SchemaURL
	}
	dataURL := vetDataURL
	if "" != options.DataURL {
		dataURL = options.DataURL
	}
	maxErrors := VetMaxErrors
	if 0 < options.MaxErrors {
		maxErrors = options.MaxErrors
	}


	schemaA := aontuForPathTrust(
		options.SchemaPath, options.Trust, options.TextExt)
	dataA := aontuForPathTrust(
		options.DataPath, options.Trust, options.TextExt)

	// 1. The schema alone. If it does not stand up on its own, the data
	//    is never blamed for it.
	schemaParsed, perr := schemaA.Parse(schemaSrc)
	if perr != nil {
		return VetReport{
			Verdict:   VetError,
			Truncated: false,
			Findings:  []VetFinding{parseFinding(schemaURL, VetRoleSchema, perr)},
		}
	}
	schemaCtx := &Ctx{root: schemaParsed, src: schemaSrc, collect: true}
	schemaVal := unifyRoot(schemaParsed, schemaCtx)
	schemaCtx.root = schemaVal
	if 0 < len(schemaCtx.err) || schemaVal.Nil() {
		failure, _ := schemaVal.(*NilVal)
		if 0 < len(schemaCtx.err) {
			failure = schemaCtx.err[0]
		}
		stampURL(schemaVal, schemaURL)
		stampURL(failure, schemaURL)
		return VetReport{
			Verdict:   VetError,
			Truncated: false,
			// A schema that does not stand up: nothing here is data, so
			// the data-url set is empty and every site reads `schema`.
			Findings: []VetFinding{findingOf(failure, vetProv{},
				vetSources{schemaURL: schemaSrc, dataURL: dataSrc})},
		}
	}

	// 2. The anchor: the whole schema, or the value at `--at`.
	anchor := schemaVal
	if "" != options.At {
		anchor = anchorAt(schemaVal, options.At)
		if nil == anchor {
			return VetReport{
				Verdict:   VetError,
				Truncated: false,
				Findings:  []VetFinding{noPathFinding(schemaVal, options.At)},
			}
		}
	}

	lintFindings := []VetFinding{}
	walkBagVals(anchor, func(v Val, path []string) {
		if d, ok := v.(*DisjunctVal); ok {
			def, has, indet := subEffectiveDefault(d)
			if has && !indet && nil != def {
				rest := []Val{}
				for _, m := range d.peg {
					if !isPref(m) {
						rest = append(rest, m)
					}
				}
				st := &subState{
					profile:     "values",
					generalURL:  schemaURL,
					specificURL: schemaURL,
					generalSrc:  schemaSrc,
					specificSrc: schemaSrc,
				}
				admitted := false
				for _, m := range rest {
					if subYes == subsumeNode(st, path, m, def) {
						admitted = true
						break
					}
				}
				if !admitted && 0 < len(rest) {
					row, col := -1, -1
					if 0 <= def.pos() {
						row, col = rowCol(schemaSrc, def.pos())
					}
					site := &VetSite{Col: col, File: schemaURL,
						Len: def.srclen(), Role: VetRoleSchema, Row: row,
						Src: def.srctext(), Value: def.Canon()}
					lintFindings = append(lintFindings, VetFinding{
						Code:     "pref_not_instance",
						Class:    "compat",
						Severity: "warning",
						Path:     subPathText(path),
						Message: "the default " + def.Canon() +
							" is not an instance of any remaining alternative of " +
							d.Canon(),
						Sites: []VetSite{*site},
					})
				}
			}
		}
	})

	// 3. Both documents get their provenance stamped BEFORE they meet,
	//    so every site in the result knows which document it came from.
	dataVal, derr := dataA.Parse(dataSrc)
	if derr != nil {
		return VetReport{
			Verdict:   VetInvalid,
			Truncated: false,
			Findings:  []VetFinding{parseFinding(dataURL, VetRoleData, derr)},
		}
	}
	stampURL(schemaVal, schemaURL)
	dataURLs := stampURL(dataVal, dataURL)
	// The projection every site in this report goes through: roles by
	// url-set membership, names by how the caller reached each document.
	prov := vetProv{
		data:       dataURLs,
		schemaURL:  schemaURL,
		schemaPath: options.SchemaPath,
		dataURL:    dataURL,
		dataPath:   options.DataPath,
	}

	var coverage *VetCoverage
	if options.Coverage {
		measured := dataVal
		coverA := aontuForPathTrust(
			options.DataPath, options.Trust, options.TextExt)
		if parsed, cerr := coverA.Parse(dataSrc); nil == cerr {
			coverCtx := &Ctx{root: parsed, src: dataSrc, collect: true}
			settled := unifyRoot(parsed, coverCtx)
			// A data document that does not stand alone is already
			// reported by the meet below; here it falls back to what was
			// parsed, which is the same paths minus whatever an include
			// would have added.
			if 0 == len(coverCtx.err) && !settled.Nil() {
				measured = settled
			}
		}
		got := vetCoverageOf(anchor, measured, options.CoverageAt, schemaVal)
		coverage = &got
	}

	if options.Closed {
		switch n := anchor.(type) {
		case *MapVal:
			n.closed = true
		case *ListVal:
			n.closed = true
		}
	}

	meetAnchor := anchor
	if "" == options.At {
		if freshSchema, ferr := schemaA.Parse(schemaSrc); nil == ferr {
			meetAnchor = freshSchema
			if options.Closed {
				switch n := meetAnchor.(type) {
				case *MapVal:
					n.closed = true
				case *ListVal:
					n.closed = true
				}
			}
			stampURL(meetAnchor, schemaURL)
		}
	}

	pair := newConjunct([]Val{meetAnchor, dataVal})
	pair.path = anchorSegs(options.At)
	ctx := &Ctx{root: pair, src: dataSrc, collect: true}
	if "" != options.At {
		ctx.fixroot = schemaVal
	}
	unified := unifyRoot(pair, ctx)
	ctx.root = unified

	sources := vetSources{schemaURL: schemaSrc, dataURL: dataSrc}
	for _, a := range []*Aontu{schemaA, dataA} {
		for path, text := range a.IncludeText {
			sources[path] = text
		}
	}

	var nils []*NilVal
	seen := map[Val]bool{}
	collectNils(unified, &nils, seen)
	for _, e := range ctx.err {
		if !seen[Val(e)] {
			seen[Val(e)] = true
			nils = append(nils, e)
		}
	}

	findings := []VetFinding{}
	for _, n := range nils {
		findings = append(findings, findingOf(n, prov, sources))
	}

	genCtx := &Ctx{root: unified, src: dataSrc, collect: true,
		probe: "" != options.At}
	_, _ = unified.Gen(genCtx)
	for _, e := range genCtx.err {
		if "incomplete" == e.Class() || "conflict" == e.Class() {
			findings = append(findings, findingOf(e, prov, sources))
		}
	}
	findings = append(findings, lintFindings...)

	for _, d := range collectDeprecatedVals(unified) {
		rec := d.v.deprecRec()
		msg := "deprecated"
		if m, ok := rec["msg"]; ok {
			msg += ": " + m
		}
		if u, ok := rec["use"]; ok {
			msg += " (use " + u + ")"
		}
		if sv, ok := rec["since"]; ok {
			msg += " (since " + sv + ")"
		}
		site := siteOf(d.v, prov, sources)
		findings = append(findings, VetFinding{
			Code:     "deprecated",
			Class:    "compat",
			Severity: "warning",
			Path:     subPathText(d.v.vpath()),
			Message:  msg,
			Sites:    []VetSite{*site},
		})
	}

	keys := make([]string, len(findings))
	idx := make([]int, len(findings))
	for i, f := range findings {
		keys[i] = vetOrderKey(f, i)
		idx[i] = i
	}
	sort.Slice(idx, func(a, b int) bool { return keys[idx[a]] < keys[idx[b]] })
	ordered := make([]VetFinding, 0, len(findings))
	for _, j := range idx {
		ordered = append(ordered, findings[j])
	}

	causeOf := func(f VetFinding) string {
		cause := f.Code
		for _, s := range f.Sites {
			cause += "\x00" + s.File + "\x00" + strconv.Itoa(s.Row) +
				"\x00" + strconv.Itoa(s.Col) + "\x00" + s.Role + "\x00" + s.Value
		}
		return cause
	}
	deepest := map[string]int{}
	for i, f := range ordered {
		cause := causeOf(f)
		held, seen := deepest[cause]
		if !seen ||
			len(strings.Split(ordered[held].Path, ".")) <
				len(strings.Split(f.Path, ".")) {
			deepest[cause] = i
		}
	}
	causes := map[string]bool{}
	deduped := make([]VetFinding, 0, len(ordered))
	for i, f := range ordered {
		cause := causeOf(f)
		if causes[cause] || deepest[cause] != i {
			continue
		}
		causes[cause] = true
		deduped = append(deduped, f)
	}
	ordered = deduped

	truncated := maxErrors < len(ordered)
	kept := ordered
	if truncated {
		kept = ordered[:maxErrors]
	}

	errors := 0
	unmet := 0
	for _, f := range ordered {
		if "error" != f.Severity {
			continue
		}
		errors++
		if "incomplete" == f.Class {
			unmet++
		}
	}
	verdict := VetValid
	if unmet < errors {
		verdict = VetInvalid
	} else if 0 < unmet && !options.Partial {
		verdict = VetIncomplete
	}

	return VetReport{
		Coverage: coverage, Verdict: verdict,
		Truncated: truncated, Findings: kept,
	}
}
