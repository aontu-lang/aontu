/* Copyright (c) 2025 Richard Rodger, MIT License */

// OVERLAY PATCH (G7 phase 5, the Go side of ts/src/patch.ts): change a
// document by APPENDING to an overlay, not by rewriting the file.
//
// An overlay entry is just another conjunct, and unification is
// order-independent, so appending `services: auth: owner: "x"` to a
// second file and evaluating both is exactly the same value as writing
// it into the first — with no parsing of the target and no comment or
// layout damage. What an overlay CANNOT do is change a PINNED value:
// the lattice refuses 5 against 3 and the report says so, which `why`
// then locates.
//
// IN-PLACE REPLACE (InPlace) closes that last step. The full note is on
// the canonical port (ts/src/patch.ts); the two things this file has to
// get right on its own are that Go strings are BYTES where a site's
// column counts UTF-16 code units (offsetAt converts, as rowCol does in
// the other direction), and that the round-trip check below is what
// makes the splice safe — NOT the `literal` role, which a compound
// value also carries while its site names only its opening token.
//
// The verdict is G2's, unchanged: Vet(entry, overlay) already asks
// exactly the right question, so `set` adds a writer, not a report.

package aontu

import (
	"path/filepath"
	"sort"
	"strings"
)

type PatchOptions struct {
	// The include capability this document evaluates under (G5,
	// docs/trust.md). Nil means today's default.
	Trust *TrustOptions

	// Where each document CAME FROM, so relative `@"file"` loads
	// inside them resolve from their own directories.
	EntryPath   string
	OverlayPath string
	// InPlace rewrites a pinned literal where the author wrote it,
	// instead of appending a line that contradicts it. Opt-in:
	// appending is non-destructive and in-place editing is not.
	InPlace bool
}

// PatchReplacement is one literal rewritten where it was written. From
// and To are SOURCE TEXT, not values: replacing `0x1F` with `31` is a
// different edit from replacing it with `0x1F`, and only the spelling
// says which.
//
// LEXICOGRAPHIC field order, as everywhere the two emitters must agree
// byte for byte.
type PatchReplacement struct {
	Col  int    `json:"col"`
	File string `json:"file"`
	From string `json:"from"`
	Path string `json:"path"`
	Row  int    `json:"row"`
	To   string `json:"to"`
}

type PatchReport struct {
	// Appended is the added lines alone, in order.
	Appended []string     `json:"appended"`
	Findings []VetFinding `json:"findings"`
	// Overlay is the overlay text as it would stand after the
	// assignments. The caller writes it — an engine that touched the
	// filesystem could not be used by a server.
	Overlay string `json:"overlay"`
	// Replaced is the in-place replacements made, in the order the
	// assignments were given (NOT the order they were applied to the
	// text, which is back-to-front so earlier offsets stay valid).
	// Empty unless InPlace was asked for.
	Replaced []PatchReplacement `json:"replaced"`
	Verdict  string             `json:"verdict"`
}

// ParseAssignment splits `<path>=<value>` at the FIRST `=`: a path
// segment is a name, and the value is arbitrary Aontu source, which
// may itself contain `=`. ok is false when the text is not an
// assignment at all.
func ParseAssignment(text string) (path, value string, ok bool) {
	eq := strings.Index(text, "=")
	if eq < 1 {
		return "", "", false
	}
	path = strings.TrimSpace(text[:eq])
	value = strings.TrimSpace(text[eq+1:])
	if "" == value || 0 == len(queryPathParts(path)) {
		return "", "", false
	}
	return path, value, true
}

// overlayLine is the path-flattened conjunct one assignment becomes:
// `$.a.b = 1` is `"a": "b": 1`. Keys are QUOTED — a segment may be a
// word the grammar spells otherwise, a number, or a name with a space
// in it.
func overlayLine(path, value string) string {
	parts := queryPathParts(path)
	quoted := make([]string, len(parts))
	for i, p := range parts {
		quoted[i] = jsonString(p)
	}
	return strings.Join(quoted, ": ") + ": " + value
}

// Patch appends the assignments to the overlay and answers what the
// result holds. Mirrors patch in ts/src/patch.ts.
func Patch(
	entrySrc, overlaySrc string, assignments []string, opts *PatchOptions,
) PatchReport {
	options := PatchOptions{}
	if nil != opts {
		options = *opts
	}

	appended := []string{}
	replaced := []PatchReplacement{}
	notes := []VetFinding{}
	// Each pending edit as (offset, length, text). Collected first and
	// applied last, back to front: a splice shifts every offset after
	// it, and recomputing them per edit is a way to be subtly wrong.
	edits := []patchEdit{}

	for _, text := range assignments {
		path, value, ok := ParseAssignment(text)
		if !ok {
			msg := "Not a <path>=<value> assignment: " + text
			return PatchReport{
				Appended: []string{},
				Findings: []VetFinding{{
					Class:    "parse",
					Code:     "patch_assignment",
					Message:  msg,
					Path:     "$",
					Severity: "error",
					Sites:    []VetSite{},
				}},
				Overlay:  overlaySrc,
				Replaced: []PatchReplacement{},
				Verdict:  VetError,
			}
		}

		if options.InPlace {
			site, finding := editableLiteral(overlaySrc, path, options.OverlayPath)
			if nil != finding {
				notes = append(notes, *finding)
			}
			if nil != site {
				// Two assignments naming the same path would splice the
				// same span twice. The second is the one the author
				// wrote last, so it wins — and the first is dropped
				// rather than layered.
				at := offsetAt(overlaySrc, site.Row, site.Col)
				dup := -1
				for i, e := range edits {
					if e.at == at {
						dup = i
						break
					}
				}
				site.To = value
				edit := patchEdit{at: at, length: len(site.From), to: value}
				if dup < 0 {
					edits = append(edits, edit)
					replaced = append(replaced, *site)
				} else {
					edits[dup] = edit
					replaced[dup] = *site
				}
				continue
			}
		}

		appended = append(appended, overlayLine(path, value))
	}

	overlay := joinOverlay(applyEdits(overlaySrc, edits), appended)

	// The file names ride as URLs as well as base paths, so a finding
	// names the entry and the overlay rather than Vet's generic
	// `schema`/`data` labels — with two documents that both belong to
	// the caller, "which file" is the whole question.
	report := Vet(entrySrc, overlay, &VetOptions{
		Trust:      options.Trust,
		DataPath:   options.OverlayPath,
		DataURL:    options.OverlayPath,
		SchemaPath: options.EntryPath,
		SchemaURL:  options.EntryPath,
	})

	// The refusals come FIRST: they explain why the run took the shape
	// it did, and a reader who stops after the first finding should
	// read that rather than a conflict it predicted.
	findings := append(notes, report.Findings...)

	return PatchReport{
		Appended: appended,
		Findings: findings,
		Overlay:  overlay,
		Replaced: replaced,
		Verdict:  report.Verdict,
	}
}

// joinOverlay writes one line per assignment, after whatever the
// overlay already said. A trailing newline is kept when the file had
// one and added when it did not: appending must not join two entries
// into one line.
func joinOverlay(overlaySrc string, appended []string) string {
	if 0 == len(appended) {
		return overlaySrc
	}
	head := overlaySrc
	if "" != overlaySrc && !strings.HasSuffix(overlaySrc, "\n") {
		head = overlaySrc + "\n"
	}
	return head + strings.Join(appended, "\n") + "\n"
}

// offsetAt maps a 1-based (row, col) to a BYTE offset into src, or -1
// when the text has no such position.
//
// COLUMNS COUNT UTF-16 CODE UNITS and Go strings are bytes, so this is
// not `off + col - 1`: it is the inverse of rowCol (go/val.go), which
// converts the same way in the other direction. Adding the column as a
// byte count would land past the character on every line holding a
// multi-byte one — which is the same class of defect as counting the
// column in bytes when reporting it, caught once already.
func offsetAt(src string, row, col int) int {
	if row < 1 || col < 1 {
		return -1
	}
	off := 0
	for r := 1; r < row; r++ {
		nl := strings.Index(src[off:], "\n")
		if nl < 0 {
			return -1
		}
		off += nl + 1
	}
	// Walk the line by runes, counting UTF-16 units, until the column
	// is reached. A column PAST the end of the line is not a position.
	units := 1
	for i, r := range src[off:] {
		if units == col {
			return off + i
		}
		if '\n' == r {
			return -1
		}
		units++
		if 0xFFFF < r {
			units++
		}
	}
	if units == col {
		return len(src)
	}
	return -1
}

// spanAt is the text a site covers, or "" when the site does not
// describe a position in this text at all.
//
// The site's Len counts UTF-16 UNITS and Go strings are BYTES, so the
// span is taken by the expected text's own byte length rather than by
// Len -- reading Len as a byte count here would slice mid-character on
// any line holding one.
func spanAt(src string, site WhySite, want string) string {
	off := offsetAt(src, site.Row, site.Col)
	if off < 0 || len(src) < off+len(want) {
		return ""
	}
	return src[off : off+len(want)]
}

// spanHolds reports whether the text at this site says what the site
// claims it says.
//
// The last check before a splice, and the one that makes the write
// PROVABLE rather than argued. Exercised in the tests with a site the
// engine would never produce -- an out-of-range position, a span over
// different text -- which is the only way to test a guard whose whole
// purpose is to catch a state the rest of the code says cannot happen.
// (ts/src/patch.ts has the twin, tested the same way.)
func spanHolds(src string, site WhySite, expect string) bool {
	// THE SITE'S OWN LENGTH IS PART OF ITS CLAIM, and is checked before
	// the text is. A site whose Len disagrees with the text it says it
	// covers CONTRADICTS ITSELF, which is exactly the state this guard
	// exists to catch -- and a zero-length span would otherwise compare
	// equal against nothing and then splice nothing, INSERTING the new
	// value rather than replacing anything.
	//
	// Len counts UTF-16 CODE UNITS and a Go string is BYTES, so the
	// comparison converts. Reading Len as a byte count would accept a
	// site that disagrees with itself on any line holding a multi-byte
	// character -- and reject one that agrees.
	if "" == expect || site.Len != utf16Len(expect) {
		return false
	}
	return spanAt(src, site, expect) == expect
}

// spanValue answers what this source text means ON ITS OWN, and whether
// it is a value rather than a constraint. ok is false when it does not
// stand alone at all (`$` from a path, an unbalanced `{`).
//
// The wrapper key is arbitrary and the document it makes is thrown
// away; what is wanted is the unifier's own reading of the fragment.
func spanValue(src string) (canon string, concrete, ok bool) {
	// Unify reports a source it cannot read as an ERROR, so that is the
	// path a bad fragment takes. What the nil test still earns is the
	// fragment that PARSES and means nothing: `$` is a path with no
	// target, and answers a nil rather than an error.
	v, err := New().Unify("v: " + src)
	if nil != err {
		return "", false, false
	}
	m, isMap := v.(*MapVal)
	if !isMap { //coverage:ignore a parsed `v: X` document is always a map; the guard is type safety on an interface value, not a reachable state
		return "", false, false
	}
	node, has := m.peg["v"]
	if !has || nil == node || node.Nil() {
		return "", false, false
	}
	canon = node.Canon()

	// Generability is the concreteness test, and it is the engine's
	// own: a kind, a constraint and an unresolved disjunction all
	// refuse to generate, which is precisely the line this needs drawn.
	if _, gerr := New().Generate("v: " + src); nil != gerr {
		return canon, false, true
	}
	return canon, true, true
}

// notEditable is a refusal to replace, as a WARNING: the assignment
// still appends, so nothing about the run got worse and the verdict
// must not move (go/vet.go — warnings never touch the verdict). What
// the finding adds is the reason, which is the whole value of asking
// for InPlace over a plain append.
func notEditable(code, path, why string, from []WhyConjunct) VetFinding {
	class := "reference"
	if "patch_span_mismatch" == code {
		class = "internal"
	}
	sites := make([]VetSite, len(from))
	for i, c := range from {
		sites[i] = VetSite{
			Col:   c.Site.Col,
			File:  c.Site.File,
			Len:   c.Site.Len,
			Role:  "data",
			Row:   c.Site.Row,
			Src:   c.Src,
			Value: c.Canon,
		}
	}
	return VetFinding{
		Class: class,
		Code:  code,
		// No separate Note: the renderer prints both, and a note that
		// restates its own message is noise wearing a second label.
		Message:  "cannot rewrite " + path + " in place: " + why,
		Path:     path,
		Severity: "warning",
		Sites:    sites,
	}
}

// editableLiteral answers whether exactly one literal this overlay can
// edit in place stands behind the value at path — and if not, why not.
// The refusals mirror ts/src/patch.ts one for one; the reasoning for
// each is written out there.
func editableLiteral(
	overlaySrc, path, overlayPath string,
) (*PatchReplacement, *VetFinding) {
	// THE OVERLAY'S OWN DIRECTORY, not the process working directory:
	// a relative `@"file"` inside the overlay resolves from where the
	// overlay lives, which is the same rule Vet applies through
	// DataPath and the CLI through aontuForFile. Setting only File
	// names the document without telling the loader where it is, and an
	// include that then fails to resolve makes Why answer "nothing here"
	// — so the foreign-file refusal never fires and the assignment is
	// appended instead. The canonical port passes the path as a parse
	// option, which does both at once.
	// THE AUTHORITY IS THE OVERLAY TEXT ALONE, WITH INCLUDES DENIED.
	// The full note is on the canonical port; the short of it is that
	// the site's file cannot establish which document a literal came
	// from -- this port names the ENTRY document for an included value
	// (issue #66), and a library caller need not pass OverlayPath at all
	// -- so an included literal's (row, col, len, src) can COINCIDE with
	// different text at the same coordinates here, and the span
	// verification cannot tell them apart because the text really does
	// match. Denying includes removes the ambiguity at its source.
	alone := overlayAontu(overlayPath)
	alone.Trust = &TrustOptions{IncludeNone: true}
	report := alone.Why(overlaySrc, path)

	if !report.OK || nil == report.Record {
		// Nothing here BY ITSELF. Two very different reasons: the path
		// may simply not be in this overlay, in which case appending is
		// the whole of the answer -- or it may be here only because
		// something was loaded, which has to say so.
		withLoads := overlayAontu(overlayPath).Why(overlaySrc, path)
		if !withLoads.OK || nil == withLoads.Record {
			return nil, nil
		}
		f := notEditable("patch_not_editable", path,
			"this path resolves only once the overlay loads another "+
				"document, so no literal here can be shown to be the one to "+
				"edit; run set with the document that writes it as the overlay",
			withLoads.Record.Conjuncts)
		return nil, &f
	}

	literals := []WhyConjunct{}
	indirect := []WhyConjunct{}
	refs := []WhyConjunct{}
	for _, c := range report.Record.Conjuncts {
		if "ref" == c.Role {
			refs = append(refs, c)
		}
		if "literal" == c.Role {
			literals = append(literals, c)
		} else if "pref" != c.Role {
			indirect = append(indirect, c)
		}
	}

	// A VALUE REACHED THROUGH A REFERENCE IS NOT THIS PATH'S TO EDIT.
	// Provenance travels through clones now, so `n: $.base` against
	// `base: 7` reports the literal `7` -- correctly, and at the site
	// where it was written, which is `base`'s line and not `n`'s. A
	// splice there would rewrite the REFERENT: every other reader of
	// `$.base` changes with it, and the path the caller named does not
	// move at all. The reference is what stands here, so the reference
	// is what has to be edited, wherever it points.
	if 0 < len(refs) {
		f := notEditable("patch_not_editable", path,
			"the value here is reached through a reference (ref), so the "+
				"literal below belongs to the path it points at; edit where "+
				"it comes from", refs)
		return nil, &f
	}

	if 1 < len(literals) {
		f := notEditable("patch_ambiguous", path,
			"two or more statements pin this path, so there is no single "+
				"place to edit; the sites below are all of them", literals)
		return nil, &f
	}

	if 0 == len(literals) {
		// A pref is the benign case — append overrides a default — so
		// it earns no finding; the others do.
		if 0 == len(indirect) {
			return nil, nil
		}
		roles := make([]string, len(indirect))
		for i, c := range indirect {
			roles[i] = c.Role
		}
		f := notEditable("patch_not_editable", path,
			"the value here is not written as a literal ("+
				strings.Join(roles, ", ")+
				"), so there is no literal to rewrite; edit where it comes from",
			indirect)
		return nil, &f
	}

	one := literals[0]

	// An included file is somebody else's document as far as the
	// overlay is concerned.
	// THE SPAN MUST CHECK OUT, and this is one condition rather than
	// two. The full note is on the canonical port: merging "no extent"
	// with "the text disagrees" makes the check REACHABLE, through the
	// case that has no extent at all, instead of half-unreachable.
	//
	// It is load-bearing either way: a contribution with no Src would
	// otherwise splice ZERO bytes, INSERTING the new value into the
	// middle of a line instead of replacing anything.
	if !spanHolds(overlaySrc, one.Site, one.Src) {
		f := notEditable("patch_span_mismatch", path,
			"the overlay does not hold "+jsonString(one.Src)+" at "+
				itoa(one.Site.Row)+":"+itoa(one.Site.Col)+" (len "+
				itoa(one.Site.Len)+"), so the span cannot be verified "+
				"before writing",
			[]WhyConjunct{one})
		return nil, &f
	}

	// DOES THE SPAN MEAN THE WHOLE CONTRIBUTION? The check the
	// `literal` role looks like it makes and does not -- see the note on
	// the canonical port.
	canon, concrete, ok := spanValue(one.Src)
	if !ok || canon != one.Canon {
		f := notEditable("patch_not_editable", path,
			"the site names "+jsonString(one.Src)+", which is the opening "+
				"token of "+one.Canon+" rather than the whole of it; "+
				"rewriting that span would edit the expression, not the value",
			[]WhyConjunct{one})
		return nil, &f
	}

	// An ABSTRACT contribution is not a pin: appending already narrows
	// it, and replacing would silently discard what it says.
	if !concrete {
		f := notEditable("patch_not_editable", path,
			one.Canon+" is a constraint here, not a pinned value; "+
				"appending narrows it without discarding what it says",
			[]WhyConjunct{one})
		return nil, &f
	}

	return &PatchReplacement{
		Col:  one.Site.Col,
		File: one.Site.File,
		From: one.Src,
		Path: path,
		Row:  one.Site.Row,
	}, nil
}

// overlayAontu is an engine that reads the overlay from the overlay's
// OWN directory: a relative `@"file"` inside it resolves from where the
// overlay lives, the rule Vet applies through DataPath and the CLI
// through aontuForFile. Setting only File names the document without
// telling the loader where it is.
func overlayAontu(overlayPath string) *Aontu {
	if "" == overlayPath {
		return New()
	}
	a := New()
	if abs, err := filepath.Abs(overlayPath); nil == err {
		a = NewWithBase(filepath.Dir(abs))
	}
	a.File = overlayPath
	return a
}

// applyEdits splices back to front, so an earlier edit's offset is
// never invalidated by a later one having already run.
func applyEdits(src string, edits []patchEdit) string {
	if 0 == len(edits) {
		return src
	}
	ordered := make([]patchEdit, len(edits))
	copy(ordered, edits)
	sort.Slice(ordered, func(i, j int) bool { return ordered[j].at < ordered[i].at })
	out := src
	for _, e := range ordered {
		out = out[:e.at] + e.to + out[e.at+e.length:]
	}
	return out
}

type patchEdit struct {
	at     int
	length int
	to     string
}
