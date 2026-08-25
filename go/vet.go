/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// The validation verb: check a data document against a schema document
// and return a MACHINE-READABLE report. The Go port of ts/src/vet.ts
// (G2 phase 4, docs/capability-review/g2-validation-verb.md), engine
// only — the command line, its renderers and its exit codes live in
// cmd/aontu, as they do in ts/src/cli.ts.
//
// Two properties of the engine shape everything here, and both are the
// canonical implementation's, probed rather than assumed:
//
//   - A CONTRADICTION surfaces as a NilVal in the unified tree, so
//     conflict findings come from a tree walk (walk.go), plus the nils
//     that never made it into the tree.
//   - INCOMPLETENESS does not. `{name:"auth"}` against
//     `{name:string, port:integer}` unifies cleanly and leaves
//     `port:integer` standing — no nil, no error. It surfaces only when
//     something tries to GENERATE, which is why vet runs a generate
//     check in an isolated collect context and reads the
//     `incomplete`-class errors out of it. The two verdicts the report
//     distinguishes therefore come from two different mechanisms.
//
// WHAT IS IN CROSS-PORT PARITY. Everything the report carries except
// the message: verdict, truncation, and each finding's code, class,
// severity, path, sites (file, row, column, role, value) and the
// expected/actual/note the constraint algebra attaches. The message is
// the nil's HEADLINE, which the two ports already hold to byte parity
// (NilVal.Headline, val.go) — but it stays prose, and prose is not
// contractual across the ports (test/spec/divergent.tsv), so the shared
// suite's goldens exclude it.

import (
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Verdicts. The report says which of four states the run reached, and
// the caller maps them to exit codes (cmd/aontu).
const (
	VetValid      = "valid"
	VetInvalid    = "invalid"
	VetIncomplete = "incomplete"
	VetError      = "error"
)

// Roles. A site is either in the data document or in the schema, and
// which one it is comes from PROVENANCE — the url stamped on each tree
// before they meet (walk.go) — not from the primary/secondary heuristic
// NilVal uses, which is source-order reasoning within ONE document and
// says nothing useful when one side is a schema and the other is data.
const (
	VetRoleData   = "data"
	VetRoleSchema = "schema"
)

// VetMaxErrors is the default cap on a report's finding list. Exported
// because the command applies it to the WHOLE report across several
// data files and must not carry a second copy of the number
// (cmd/aontu/vet.go).
const VetMaxErrors = 20

const (
	vetSchemaURL = "schema"
	vetDataURL   = "data"
)

// VetSite locates one side of a finding. The JSON field order is
// LEXICOGRAPHIC because the canonical emitter sorts object keys
// (exactJSON, ts/src/exactjson.ts) while Go's encoder writes struct
// fields in declaration order: the two agree only if the declaration is
// already sorted.
type VetSite struct {
	Col int `json:"col"`
	// File is ALWAYS present, and empty when the value belongs to
	// neither document -- one unification minted, rather than one
	// either document wrote. A consumer reads `file` without a presence
	// check; the canonical port coerces the same way.
	File string `json:"file"`
	// Len is the extent in UTF-16 code units, or -1 when unknown -- the
	// same "unknown" Row and Col already use.
	//
	// THIS IS WHAT MAKES A FINDING REPAIRABLE. Value is the CANON, not
	// the source text: `port: 0x1F` reports canon `31` at column 7, so a
	// consumer replacing (col, len(value)) writes `port: 5x1F` and
	// corrupts the document. With Len the span is (col, 4) and the
	// replacement is exact.
	//
	// NEVER GUESSED. Where the span is unknown this is -1 and a consumer
	// must not edit -- unlike the LSP, which falls back to canon because
	// a wonky highlight is cosmetic while a wrong edit is a lost file
	// (Problem.Len, go/check.go). See ts/src/site.ts for what the extent
	// covers, and note the LEXICOGRAPHIC field order this sits in.
	Len  int    `json:"len"`
	Role string `json:"role"`
	Row  int    `json:"row"`
	// Src is the SOURCE TEXT the span covers, empty when unknown.
	//
	// This is what makes the span SELF-VERIFYING, and it is not the same
	// as Value. For a scalar the two differ by normalisation -- `0x1F`
	// has Src `0x1F` and Value (canon) `31`. For a COMPOUND the span
	// names the opening token only, exactly as Row and Col always have:
	// a constraint `min(1)` reports Src `min`, and a reference `$.b`
	// reports Src `$`.
	//
	// So a consumer must read the document at (Row, Col, Len), compare
	// it to Src, and REFUSE when they differ -- and, seeing `min` where
	// it expected `min(1)`, refuse rather than replace the name and
	// orphan the arguments. Without this field that mistake is
	// undetectable.
	Src   string `json:"src"`
	Value string `json:"value"`
}

// VetFinding is one thing that does not hold. The optional fields are
// POINTERS so an absent one is omitted and a present-but-empty one is
// written: `omitempty` on a plain string cannot tell those apart, and
// the canonical emitter drops only what is undefined.
type VetFinding struct {
	Actual   *string   `json:"actual,omitempty"`
	Class    string    `json:"class"`
	Code     string    `json:"code"`
	Expected *string   `json:"expected,omitempty"`
	Message  string    `json:"message"`
	Note     *string   `json:"note,omitempty"`
	Path     string    `json:"path"`
	Severity string    `json:"severity"`
	Sites    []VetSite `json:"sites"`
}

// VetReport is the whole answer: one verdict, and the findings behind
// it (capped, with truncation declared rather than silent).
type VetReport struct {
	Findings  []VetFinding `json:"findings"`
	Truncated bool         `json:"truncated"`
	Verdict   string       `json:"verdict"`
}

// VetOptions are the run's knobs. A zero value is the default run: the
// whole schema as the anchor, open, strict about residue, capped at 20
// findings, with the documents labelled "schema" and "data".
type VetOptions struct {
	At      string // validate against this path of the schema
	Closed  bool   // close() the anchor for this run
	Partial bool   // residue is not a failure
	// MaxErrors caps the finding list; 0 (and anything below it) means
	// the default of 20. The canonical engine can tell an EXPLICIT zero
	// from an absent option and would report nothing for it; a Go zero
	// value cannot, and a cap of zero is not a thing to ask for -- the
	// command line refuses it too (`--max-errors 0` is a usage error in
	// both ports).
	MaxErrors int
	SchemaURL string // provenance label for schema sites
	DataURL   string // provenance label for data sites

	// SchemaPath and DataPath are where each document CAME FROM, used
	// to resolve its relative `@"file"` loads -- the FILE path, as the
	// canonical port's `{path}` option takes it, not the directory
	// (this side does the Dir() itself). Vet takes two documents from
	// its caller rather than from the filesystem, so it cannot know
	// this: without it a modular schema resolved its includes against
	// the process working directory, which fails outside that
	// directory and, worse, silently reads a same-named file that
	// happens to sit there. The two documents get their OWN bases,
	// because they need not live in the same place.
	SchemaPath string
	DataPath   string
}

// aontuForPath builds an engine whose relative `@"file"` loads resolve
// against the directory holding path. The twin of cmd/aontu's
// aontuForFile, and of the per-parse `path` option the canonical port
// hands to its parser. An empty path means the process working
// directory, which is what New() already does.
func aontuForPath(path string) *Aontu {
	if "" == path {
		return New()
	}
	return NewWithBase(filepath.Dir(path))
}

// vetSources maps a stamped url to the text its offsets index into.
// Go carries a byte offset per value and computes row/column on demand
// (rowCol, val.go), so a two-document run has to know WHICH document to
// count newlines in — the one thing TypeScript gets for free by storing
// row and column on every site at parse time.
type vetSources map[string]string

// siteOf projects one operand into a report site. `secondary` is the
// only operand that can be absent — a `closed` or an incomplete finding
// has one side, a two-site conflict has both — so this is the one
// nullable input, and every Val that does arrive carries a position and
// a canon.
func siteOf(v Val, dataURL string, sources vetSources) *VetSite {
	if v == nil {
		return nil
	}
	file := v.srcurl()
	role := VetRoleSchema
	if dataURL == file {
		role = VetRoleData
	}
	// An unstamped value (one minted with no source name) is counted
	// against the data text, which is the same fallback the error
	// frames make with ctx.src.
	src, ok := sources[file]
	if !ok {
		src = sources[dataURL]
	}
	// An UNSITED value reports -1:-1 rather than a coordinate it does
	// not have. The parser gives no position to a junction (neither port
	// does), so `a: 1|2` meeting `a: 3` has one operand that was never
	// anywhere in particular; rowCol's own answer for that is row 1
	// column 1, which is a place, and the wrong one. TypeScript says -1
	// because an unset site starts there (ts/src/site.ts).
	row, col := -1, -1
	if 0 <= v.pos() {
		row, col = rowCol(src, v.pos())
	}
	return &VetSite{
		Col: col, File: file, Len: v.srclen(), Role: role, Row: row,
		Src: v.srctext(), Value: v.Canon(),
	}
}

// sitesOf lists the data site first — it is the thing to fix — then the
// schema site. The underlying NilVal fields are untouched: this is a
// report-layer projection, so the existing error.tsv assertions do not
// move.
func sitesOf(n *NilVal, dataURL string, sources vetSources) []VetSite {
	sites := []VetSite{}
	// The nil ITSELF when it has no operands: a failure raised about a
	// CONSTRUCT rather than about a failed meet -- a lossy integer
	// literal, say -- carries none, and reporting it about itself is
	// what ctx.adderr already does for the same reason.
	primary := n.primary
	if nil == primary {
		primary = n
	}
	if s := siteOf(primary, dataURL, sources); s != nil {
		sites = append(sites, *s)
	}
	if s := siteOf(n.secondary, dataURL, sources); s != nil {
		sites = append(sites, *s)
	}

	// Partitioned rather than sorted: which of the two NilVal operands
	// is primary follows source order within one document, which says
	// nothing useful across two.
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

func findingOf(n *NilVal, dataURL string, sources vetSources) VetFinding {
	f := VetFinding{
		Class:    n.Class(),
		Code:     n.why,
		Message:  n.Headline(),
		Path:     n.Path(),
		Severity: "error",
		Sites:    sitesOf(n, dataURL, sources),
	}

	// expected/actual are the admissible-alternatives contract, and the
	// constraint algebra already produces them: G1's atoms attach the
	// normalised residual and the offending value, and `must` attaches
	// the author's message. Read them where they are rather than
	// re-deriving them here.
	if v, ok := n.details["expected"]; ok {
		f.Expected = &v
	}
	if v, ok := n.details["actual"]; ok {
		f.Actual = &v
	}
	if v, ok := n.details["message"]; ok {
		f.Note = &v
	}

	return f
}

// vetOrderPad zero-pads row and column so lexicographic order is numeric
// order.
const vetOrderPad = 9

// vetOrderKey sorts findings BY VET, not by the walk. The underlying walk
// iterates a bag's keys and the two hosts disagree about their order —
// `10:… 9:…` yields ["9","10"] in JavaScript, which hoists integer-like
// keys, against Go's insertion order (ts/src/keyorder.ts exists for
// exactly this) — so an unsorted report could never be in cross-port
// parity.
//
// The order is by data site (file, row, column), then code, then path,
// carried in ONE key string rather than a cascade of comparisons: a
// cascade needs a test per tie-breaker to stay honest; a key needs
// none, and cannot disagree with itself. NUL joins the fields because
// no field can contain one.
//
// The walk index is the last field, which makes every key unique and
// the sort total: two findings can otherwise share everything else the
// key carries, and then the answer would come from the sort algorithm
// rather than from the data. With the index appended, ties keep walk
// order in both ports by construction.
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

// ansiRe matches the terminal colour escapes the parser puts in its
// message text. A machine-readable report is no place for them.
var ansiRe = regexp.MustCompile("\u001b\\[[0-9;]*m")

// parseFinding projects a document's parse failure as the one finding
// the report carries. Built by hand rather than through a NilVal
// because the parse never produced one: what Go has is the error, and
// the error already knows the code, the position and the text (val.go,
// AontuError).
//
// Both documents use it. The failure is the same failure whichever
// document it is in -- only the url, the role, and the verdict the
// caller returns with it differ.
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
	message := ansiRe.ReplaceAllString(ae.Msg, "")
	if i := strings.IndexByte(message, '\n'); 0 <= i {
		message = message[:i]
	}
	return VetFinding{
		Class:    codeClass(code),
		Code:     code,
		Message:  message,
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

// Vet validates dataSrc against schemaSrc.
//
// Never fails for findings: a contradiction in the data is DATA, and
// the caller gets a report. An unusable schema is a VERDICT (`error`)
// rather than an error return for the same reason — "the schema is
// broken" is a fact the agent loop needs to branch on, not an
// exceptional condition — which leaves nothing for an error return to
// carry, so there is none.
//
// A package-level function rather than a method, mirroring the
// canonical export: vet takes its two documents from the caller, not
// from the filesystem, so an Aontu's base directory has nothing to say
// about them.
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

	// No bare `error` report is built here any more, and the absence is
	// the point: every way this function can answer `error` -- a schema
	// that will not parse, a schema that does not stand up, an `--at`
	// that names nothing -- now carries the finding that says what and
	// where. There is nothing left for an empty-finding constant to be
	// used by.

	// TWO instances, because the two documents may live in different
	// directories and each one's includes resolve from its own.
	schemaA := aontuForPath(options.SchemaPath)
	dataA := aontuForPath(options.DataPath)

	// 1. The schema alone. If it does not stand up on its own, the data
	//    is never blamed for it.
	schemaParsed, perr := schemaA.Parse(schemaSrc)
	if perr != nil {
		// A SCHEMA THAT WILL NOT PARSE reports, exactly as unparseable
		// data does one branch further down -- same finding, same
		// parser code, the role and the verdict being the only
		// difference. It used to return an empty finding list, so a
		// caller was told the schema was broken and never where.
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
		// A broken schema REPORTS, exactly as broken data does. It used
		// to answer an empty finding list with exit 4 and nothing else,
		// in both ports: the engine had collected the fault and vet threw
		// it away, so a caller was told the schema was broken and not
		// what or where. The verdict stays `error` -- the fault is in the
		// truth rather than in the data, and that distinction is what the
		// class is for -- but the finding travels with it.
		//
		// The FIRST error only, for the reason the data path gives: later
		// errors in a document that does not stand up are consequences of
		// the first rather than separate things to fix.
		// Mirrors the same branch in ts/src/vet.ts.
		//
		// ONE OF THE TWO IS ALWAYS THERE, and both are nils: the branch
		// condition admits a collected error or a nil root, `Nil()` is
		// true for *NilVal and for nothing else (val.go), and every
		// value on schemaCtx.err is one. There is no third case, so
		// there is no guard here -- a guard that cannot fire is dead
		// code, and dead code is what ADR-002 exists to keep out.
		failure, _ := schemaVal.(*NilVal)
		if 0 < len(schemaCtx.err) {
			failure = schemaCtx.err[0]
		}
		// The normal path stamps both documents before they meet
		// (stampURL(anchor...) below), and this early return never
		// reaches it, so it stamps what it is about to report: the
		// unified root, and the failure itself -- a COLLECTED error is
		// minted during unification and hangs off no tree, so nothing
		// else would name it. The walk reaches a failure's operands
		// (walk.go), which is what makes the sites say which file.
		stampURL(schemaVal, schemaURL)
		stampURL(failure, schemaURL)
		return VetReport{
			Verdict:   VetError,
			Truncated: false,
			Findings: []VetFinding{findingOf(failure, dataURL,
				vetSources{schemaURL: schemaSrc, dataURL: dataSrc})},
		}
	}

	// 2. The anchor: the whole schema, or the value at `--at`.
	anchor := schemaVal
	if "" != options.At {
		anchor = anchorAt(schemaVal, options.At)
		if nil == anchor {
			// AND IT SAYS WHICH SEGMENT. `--at` naming nothing is an
			// error verdict for the same reason a broken schema is --
			// the run could not be set up from the truth's side -- and
			// it reports for the same reason too: a caller handed exit
			// 4 and an empty list has nothing to act on. The refusal is
			// the SAME one Get and Why give for a path that names
			// nothing, down to the "did you mean" (query.go).
			return VetReport{
				Verdict:   VetError,
				Truncated: false,
				Findings:  []VetFinding{noPathFinding(schemaVal, options.At)},
			}
		}
	}

	// Default-validity lint (G3 phase 5): for every disjunction in the
	// SCHEMA carrying a preference, the effective default must be
	// admitted by some remaining alternative — `a:*5|string` ships a
	// default its own disjunct refuses, and every consumer leaning on
	// it receives an invalid value from the truth itself. A vet WARNING
	// for now (code `pref_not_instance`, class compat): today's engine
	// generates the bad default, existing documents may lean on it, and
	// promoting the warning to an error is itself a breaking change,
	// sequenced through the `breaking` gate (the G3 design's own rule).
	// Mirrors the lintDefaults pass in ts/src/vet.ts.
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
							" is not an instance of any alternative of " + d.Canon(),
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
		// A DATA DOCUMENT THAT WILL NOT PARSE IS THE DATA'S FAULT, and
		// the report says so: verdict `invalid`, with a finding
		// carrying the parser's own code and a site in the data.
		// `error` is left to mean what the exit table says it means --
		// the run could not be set up from the SCHEMA side.
		//
		// The engine already answered it this way one character
		// earlier: a refused CONSTRUCT (`a: 9007199254740993`) reaches
		// the tree as an ordinary nil and is reported as an invalid
		// data finding. A stray `]` took the throwing path instead and
		// came back as a broken SCHEMA -- the same fault, classified
		// two opposite ways by which branch the parser happened to
		// take.
		return VetReport{
			Verdict:   VetInvalid,
			Truncated: false,
			Findings:  []VetFinding{parseFinding(dataURL, VetRoleData, derr)},
		}
	}
	stampURL(anchor, schemaURL)
	stampURL(dataVal, dataURL)

	// `--closed` sets the flag close() itself sets, rather than wrapping
	// the anchor in a close() call: the anchor is an already-evaluated
	// tree, and a func value would have to resolve again to have any
	// effect. A scalar anchor has no keys to close, so the flag is only
	// meaningful on a bag.
	if options.Closed {
		switch n := anchor.(type) {
		case *MapVal:
			n.closed = true
		case *ListVal:
			n.closed = true
		}
	}

	pair := newConjunct([]Val{anchor, dataVal})
	ctx := &Ctx{root: pair, src: dataSrc, collect: true}
	unified := unifyRoot(pair, ctx)
	ctx.root = unified

	sources := vetSources{schemaURL: schemaSrc, dataURL: dataSrc}

	// 4. Contradictions: every NilVal standing in the result, PLUS the
	//    ones that never made it into the tree.
	//
	// The second half is not belt-and-braces. When a parent collapses to
	// a nil the whole subtree goes with it, so `service: close({...})`
	// meeting a typo AND a kind conflict leaves ONE nil in the tree and
	// reports the other only on the context — the verb's own motivating
	// example, reporting half of what it found. Check does the same
	// union for the same reason (check.go); dedup is by identity.
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
		findings = append(findings, findingOf(n, dataURL, sources))
	}
	conflicts := len(findings)

	// 5. Incompleteness: what is left standing that cannot generate. The
	//    generate check runs in its own collect context so nothing it
	//    raises reaches the caller's error list, and so a schema that is
	//    merely unsatisfied does not look like one that is contradicted.
	//    The returned error is deliberately dropped: under collect the
	//    reasons are recorded on the context, which is the whole point
	//    of the mode.
	genCtx := &Ctx{root: unified, src: dataSrc, collect: true}
	_, _ = unified.Gen(genCtx)
	for _, e := range genCtx.err {
		if "incomplete" == e.Class() {
			findings = append(findings, findingOf(e, dataURL, sources))
		}
	}
	errorFindings := len(findings)
	findings = append(findings, lintFindings...)

	// 5b. Deprecation warnings (G3 phase 4): a value that carries the
	//     deprecate() record after the meet was USED — the data met a
	//     deprecated schema value, or the schema's own default will
	//     generate one. Severity `warning` (the slot G2 reserved for
	//     exactly this mark), and warnings never touch the verdict
	//     below. Mirrors the walkDeprecated pass in ts/src/vet.ts.
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
		site := siteOf(d.v, dataURL, sources)
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

	// ONE CAUSE, ONE FINDING. A reference resolves by CLONING its
	// target, so a target that later fails can fail once per referrer —
	// same code, same two source sites, a different path each time.
	// Multi-pass collection (G2 phase 6) made this reachable: the pass
	// loop now continues past the erroring pass, so the clones' own
	// folds run too. The dedup key is the CODE plus the SITES (file,
	// row, col, role, value): two findings that name the same meet of
	// the same two source positions are one contradiction observed from
	// two paths. The key is NOT (code, path) — the design's sketch —
	// because the paths are exactly what differ. Sorted order makes the
	// kept finding the first by data site then path, deterministically
	// in both ports. NUL-joined, like the order key: no field can
	// contain one, so the key cannot collide across field boundaries.
	causes := map[string]bool{}
	deduped := ordered[:0]
	for _, f := range ordered {
		cause := f.Code
		for _, s := range f.Sites {
			cause += "\x00" + s.File + "\x00" + strconv.Itoa(s.Row) +
				"\x00" + strconv.Itoa(s.Col) + "\x00" + s.Role + "\x00" + s.Value
		}
		if causes[cause] {
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

	// 6. The verdict derives from finding CLASSES, never from codes, so
	//    a new code can never change exit behaviour.
	verdict := VetValid
	if 0 < conflicts {
		verdict = VetInvalid
	} else if conflicts < errorFindings && !options.Partial {
		verdict = VetIncomplete
	}

	return VetReport{Verdict: verdict, Truncated: truncated, Findings: kept}
}
