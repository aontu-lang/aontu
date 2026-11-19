/* Copyright (c) 2025 Richard Rodger, MIT License */

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

	// TextExt is the extensions additionally read as text (the CLI's
	// --text-ext), the other half of what an include may read.
	TextExt []string

	// Where each document CAME FROM, so relative `@"file"` loads
	// inside them resolve from their own directories.
	EntryPath   string
	OverlayPath string
	// InPlace rewrites a pinned literal where the author wrote it,
	// instead of appending a line that contradicts it. Opt-in:
	// appending is non-destructive and in-place editing is not.
	InPlace bool
}

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
	Overlay  string             `json:"overlay"`
	Replaced []PatchReplacement `json:"replaced"`
	Verdict  string             `json:"verdict"`
}

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

	report := Vet(entrySrc, overlay, &VetOptions{
		Trust:      options.Trust,
		TextExt:    options.TextExt,
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

func spanAt(src string, site WhySite, want string) string {
	off := offsetAt(src, site.Row, site.Col)
	if off < 0 || len(src) < off+len(want) {
		return ""
	}
	return src[off : off+len(want)]
}

func spanHolds(src string, site WhySite, expect string) bool {
	if "" == expect || site.Len != utf16Len(expect) {
		return false
	}
	return spanAt(src, site, expect) == expect
}

func spanValue(src string) (canon string, concrete, ok bool) {
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

func notEditable(code, path, why string, from []WhyConjunct) VetFinding {
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
		// Always reference; the one internal-class refusal
		// (patch_span_mismatch) overrides at its call site.
		Class: "reference",
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
	alone := overlayAontu(overlayPath)
	alone.Trust = &TrustOptions{IncludeNone: true}
	report := alone.Why(overlaySrc, path)

	if !report.OK || nil == report.Record {
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

	return verifiedSite(overlaySrc, path, literals[0])
}

func verifiedSite(
	overlaySrc, path string, one WhyConjunct,
) (*PatchReplacement, *VetFinding) {
	if !spanHolds(overlaySrc, one.Site, one.Src) {
		f := notEditable("patch_span_mismatch", path,
			"the overlay does not hold "+jsonString(one.Src)+" at "+
				itoa(one.Site.Row)+":"+itoa(one.Site.Col)+" (len "+
				itoa(one.Site.Len)+"), so the span cannot be verified "+
				"before writing",
			[]WhyConjunct{one})
		// The one internal-class refusal: a recorded span failing to
		// check out is the engine's fault, never the document's.
		f.Class = "internal"
		return nil, &f
	}

	// The recorded span must cover the whole value: a site naming only
	// its opening token would rewrite past it.
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
