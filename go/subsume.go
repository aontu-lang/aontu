/* Copyright (c) 2025 Richard Rodger, MIT License */

// Subsumption as a first-class query (G3 phase 2): the Go port of
// ts/src/subsume.ts. Does the GENERAL value admit every instance the
// SPECIFIC value admits?
//
// A dedicated structural walk over EVALUATED values, never mutating its
// inputs, returning a THREE-VALUED verdict — `subsumes`,
// `does_not_subsume` (with the failing path and both canons as the
// witness) or `undecided` (with a reason code, never silently) — plus
// `error` for a source that does not stand up on its own. Where a rule
// cannot decide, the answer folds toward "not subsumed" or "undecided":
// the safe directions (docs/reference-language.md, "Subsumption").
// Findings reuse G2's report vocabulary, class `compat`.

package aontu

// Subsume verdicts.
const (
	SubsumeYes       = "subsumes"
	SubsumeNo        = "does_not_subsume"
	SubsumeUndecided = "undecided"
	SubsumeError     = "error"
)

// SubsumeOptions are the query's knobs; the zero value compares under
// the `defaults` profile at the roots.
type SubsumeOptions struct {
	// The include capability both documents evaluate under (G5,
	// docs/trust.md). Nil means today's default.
	Trust *TrustOptions

	Profile     string // "values" | "defaults" (default) | "gen"
	At          string // compare at this path of both documents
	GeneralURL  string // provenance label for general sites
	SpecificURL string // provenance label for specific sites
	// Where each document CAME FROM, so a relative `@"file"` load
	// inside it resolves from its own directory — vet's
	// SchemaPath/DataPath precedent, one per document because they
	// need not live together.
	GeneralPath  string
	SpecificPath string
}

// SubsumeReport is the whole answer: one verdict, and the findings
// behind it.
type SubsumeReport struct {
	Findings []VetFinding `json:"findings"`
	Verdict  string       `json:"verdict"`
}

const (
	subYes       = "yes"
	subNo        = "no"
	subUndecided = "und"
)

type subState struct {
	profile     string
	findings    []VetFinding
	generalURL  string
	specificURL string
	generalSrc  string
	specificSrc string
	// distributing is set inside a distribution trial: see subTrial.
	distributing bool
}

func subPathText(path []string) string {
	out := "$"
	for _, p := range path {
		out += "." + p
	}
	return out
}

// subSiteOf builds a finding site: position from the value's byte
// offset against ITS OWN document's source — the two trees never meet
// in this query, so a general value always locates in the general
// source and a specific one in the specific source.
func subSiteOf(v Val, role, url, src string) VetSite {
	// Len starts at -1, the "unknown" the other coordinates use: Go's
	// zero value for an int is 0, which would claim an empty span for
	// every value that has none.
	site := VetSite{File: url, Row: -1, Col: -1, Len: -1, Role: role, Value: "nil"}
	if nil != v {
		site.Value = v.Canon()
		site.Len = v.srclen()
		site.Src = v.srctext()
		if 0 <= v.pos() {
			site.Row, site.Col = rowCol(src, v.pos())
		}
	}
	return site
}

func (st *subState) record(code string, path []string, g, s Val, message string) {
	gc, sc := "nil", "nil"
	if nil != g {
		gc = g.Canon()
	}
	if nil != s {
		sc = s.Canon()
	}
	st.findings = append(st.findings, VetFinding{
		Code:     code,
		Class:    "compat",
		Severity: "error",
		Path:     subPathText(path),
		Message:  message,
		Sites: []VetSite{
			subSiteOf(g, "general", st.generalURL, st.generalSrc),
			subSiteOf(s, "specific", st.specificURL, st.specificSrc),
		},
		Expected: strPtr(gc),
		Actual:   strPtr(sc),
	})
}

func strPtr(s string) *string { return &s }

// admission is the view of a value the profiles compare for the
// admitted set: a PREFERENCE admits what its superior admits (the
// engine's own PrefVal.superpeg semantics); the default itself is
// compared separately by the `defaults` and `gen` profiles.
func subAdmission(v Val) Val {
	if p, ok := v.(*PrefVal); ok {
		return p.superpeg
	}
	return v
}

// subMemberAdmission is the admitted set of one MEMBER of a
// disjunction. A PREFERRED BRANCH CONTRIBUTES EXACTLY ITS OWN VALUE
// (ADR-004): the admission gate made that the engine's rule --
// `*'auto'|'literal'|'data'` admits those three strings and nothing
// else -- and the subsumption walk kept comparing a pref member by its
// KIND superior, the pre-ADR-004 reading. So a disjunction with a
// default did not subsume ITSELF: every member widened to `string`,
// which no general member admits (use-cases/BUGS.md §29). Only for a
// member: a bare `*x` standing alone is still gated by kind, which is
// subAdmission above and the documented rule. The twin of
// memberAdmission in ts/src/subsume.ts.
func subMemberAdmission(v Val) Val {
	if p, ok := v.(*PrefVal); ok {
		return prefInnerPeg(p)
	}
	return v
}

// subEffectiveDefault is the effective default of a value: (value,
// has-one, indeterminate). Equal-rank preferences that disagree are
// indeterminate — the engine itself refuses them only at generation.
func subEffectiveDefault(v Val) (Val, bool, bool) {
	// EVERY pref layer is unwrapped (prefInnerPeg), not just one: a
	// ranked default's effective value is the innermost peg (the
	// rank-uniform meet, ADR-004). The one-layer unwrap left a rank-2
	// default wearing a `*`-wrapper no plain alternative subsumes --
	// the pref_not_instance lint's ranked false positive of
	// use-cases/BUGS.md §4. Mirrors effectiveDefault in
	// ts/src/subsume.ts.
	if p, ok := v.(*PrefVal); ok {
		return prefInnerPeg(p), true, false
	}
	if d, ok := v.(*DisjunctVal); ok {
		var prefs []*PrefVal
		for _, m := range d.peg {
			if p, ok := m.(*PrefVal); ok {
				prefs = append(prefs, p)
			}
		}
		if 0 == len(prefs) {
			return nil, false, false
		}
		// Generation picks the LOWEST rank (`a:**1|*2` generates 2 —
		// test/spec/edge.tsv), so the effective default does too.
		minRank := prefs[0].rank
		for _, p := range prefs[1:] {
			if p.rank < minRank {
				minRank = p.rank
			}
		}
		var first Val
		for _, p := range prefs {
			if p.rank != minRank {
				continue
			}
			if nil == first {
				first = prefInnerPeg(p)
				continue
			}
			if !valSame(first, prefInnerPeg(p)) {
				return nil, true, true
			}
		}
		return first, true, false
	}
	return nil, false, false
}

// subConcrete reports whether an evaluated value is concrete enough to
// serve as a witness — a value that certainly IS an instance of the
// specific side.
func subConcrete(v Val) bool {
	switch n := v.(type) {
	case *ScalarVal:
		return true
	case *MapVal:
		for _, k := range n.keys {
			if !subConcrete(n.peg[k]) {
				return false
			}
		}
		return true
	case *ListVal:
		for _, e := range n.peg {
			if !subConcrete(e) {
				return false
			}
		}
		return true
	}
	return false
}

// subUnresolved: references, variables, unreduced conjuncts and
// functions have no admitted set to compare.
func subUnresolvedVal(v Val) bool {
	if isRef(v) || isVar(v) || isConjunct(v) || isExpect(v) {
		return true
	}
	if isFunc(v) {
		if _, ok := v.(*ConstraintVal); !ok {
			return true
		}
	}
	if _, ok := v.(*PlusOpVal); ok {
		return true
	}
	return false
}

func subWorse(out, r string) string {
	if subNo == r || subNo == out {
		return subNo
	}
	if subUndecided == r || subUndecided == out {
		return subUndecided
	}
	return subYes
}

func subsumeNode(st *subState, path []string, g0, s0 Val) string {
	g := subAdmission(g0)
	s := subAdmission(s0)

	// Marks change the OUTPUT shape, not the admitted set: only the
	// `gen` profile reports them.
	if "gen" == st.profile && !st.distributing && nil != g && nil != s &&
		(g.markedType() != s.markedType() || g.markedHide() != s.markedHide()) {
		st.record("compat_marks_changed", path, g, s,
			"marks differ between the general and specific values")
		return subNo
	}

	// TOP admits everything. There is no nil rule: an error-free
	// evaluated document carries no nil (failing disjunct members are
	// discarded, every other nil collects an error, and Subsume answers
	// `error` for a source that does not stand alone), so a nil handed
	// to the walk by a future caller falls to the no-rule fold below —
	// `undecided`, the safe direction.
	if isTop(g) {
		return subYes
	}

	if subUnresolvedVal(g) || subUnresolvedVal(s) {
		// REFLEXIVITY IS A LAW, not a rule the ladder gets to skip. Every
		// value admits itself, residue included: the set admitted by
		// `integer & min(0)` is exactly the set admitted by
		// `integer & min(0)`. Without this, a constraint inside a spread
		// template made a contract non-SELF-subsumable -- expected and
		// actual byte-identical, verdict `undecided` -- so `breaking` on
		// the documented close-per-entry idiom hard-failed reflexivity
		// and had to run --allow-undecided, which then masks the genuine
		// undecideds it exists to surface (use-cases/BUGS.md §28).
		//
		// Identity is the HASH FORM, not the canon: canon drops
		// closedness and the marks, so close({a:1}) and {a:1} share a
		// canon while admitting different sets. Computed only on this
		// branch, where the answer would otherwise be undecided, so the
		// hot path is untouched.
		if nil != g && nil != s && Hcanon(g) == Hcanon(s) {
			return subYes
		}
		st.record("sub_unresolved", path, g, s,
			"unresolved residue: the admitted set is not comparable")
		return subUndecided
	}

	// Disjunctions: member-wise sufficiency, with a concrete failing
	// member as the witness and honest undecided for the distribution
	// case.
	if sd, ok := s.(*DisjunctVal); ok {
		out := subYes
		for _, raw := range sd.peg {
			member := subMemberAdmission(raw)
			trial := subTrial(st, path, g, member)
			if subYes != trial {
				if subConcrete(subAdmission(member)) {
					st.record("compat_narrowed", path, g, member,
						"a specific alternative is not admitted by the general value")
					return subNo
				}
				st.record("sub_disjunct_distribution", path, g, member,
					"a specific alternative is not admitted member-wise, and no"+
						" concrete counterexample settles the distribution case")
				out = subWorse(out, subUndecided)
			}
		}
		return out
	}
	if gd, ok := g.(*DisjunctVal); ok {
		for _, raw := range gd.peg {
			if subYes == subTrial(st, path, subMemberAdmission(raw), s) {
				return subYes
			}
		}
		if subConcrete(s) {
			st.record("compat_narrowed", path, g, s,
				"no general alternative admits the specific value")
			return subNo
		}
		st.record("sub_disjunct_distribution", path, g, s,
			"no general alternative admits the specific value member-wise,"+
				" and no concrete counterexample settles the distribution case")
		return subUndecided
	}

	// Scalar kinds.
	if gk, ok := g.(*ScalarKindVal); ok {
		switch sn := s.(type) {
		case *ScalarKindVal:
			if gk.kind == sn.kind || kindSubsumes(gk.kind, sn.kind) {
				return subYes
			}
			st.record("compat_narrowed", path, g, s,
				"the general kind does not admit the specific kind")
			return subNo
		case *ScalarVal:
			if gk.kind == sn.kind || kindSubsumes(gk.kind, sn.kind) {
				return subYes
			}
			st.record("compat_narrowed", path, g, s,
				"the general kind does not admit the specific scalar")
			return subNo
		case *ConstraintVal:
			if "number" == sn.domain &&
				(KindNumber == gk.kind ||
					(KindTop != sn.kind && kindSubsumes(gk.kind, sn.kind)) ||
					(KindTop != sn.kind && gk.kind == sn.kind)) {
				return subYes
			}
			if "string" == sn.domain && KindString == gk.kind {
				return subYes
			}
			st.record("compat_narrowed", path, g, s,
				"the general kind does not cover the specific residual")
			return subNo
		}
		st.record("compat_narrowed", path, g, s,
			"the general kind admits no such value")
		return subNo
	}

	// Constraint residuals.
	if gc, ok := g.(*ConstraintVal); ok {
		if sc, ok := s.(*ConstraintVal); ok {
			okc, und := constraintStateSubsumes(gc, sc)
			if okc {
				return subYes
			}
			if und {
				st.record("sub_evaluate_only", path, g, s,
					"an evaluate-only check (must) makes the admitted set opaque")
				return subUndecided
			}
			st.record("compat_narrowed", path, g, s,
				"the general residual does not contain the specific residual")
			return subNo
		}
		if sv, ok := s.(*ScalarVal); ok {
			okc, und := constraintAdmitsScalarQ(gc, sv)
			if okc {
				return subYes
			}
			if und {
				st.record("sub_evaluate_only", path, g, s,
					"an evaluate-only check (must) makes the admitted set opaque")
				return subUndecided
			}
			st.record("compat_narrowed", path, g, s,
				"the general residual does not admit the specific scalar")
			return subNo
		}
		st.record("compat_narrowed", path, g, s,
			"the general residual constrains a domain the specific value is not in")
		return subNo
	}

	// Concrete scalars subsume only themselves.
	if _, ok := g.(*ScalarVal); ok {
		if _, ok := s.(*ScalarVal); ok && valSame(g, s) {
			return subYes
		}
		st.record("compat_narrowed", path, g, s,
			"a concrete value subsumes only itself")
		return subNo
	}

	// Maps.
	if gm, ok := g.(*MapVal); ok {
		sm, ok := s.(*MapVal)
		if !ok {
			st.record("compat_narrowed", path, g, s,
				"the general value is a map and the specific value is not")
			return subNo
		}
		return subsumeBag(st, path, bagView{
			val: gm, keys: gm.keys, closed: gm.closed,
			optional: gm.optional, spread: gm.spread,
			child: func(k string) Val { return gm.peg[k] },
		}, bagView{
			val: sm, keys: sm.keys, closed: sm.closed,
			optional: sm.optional, spread: sm.spread,
			child: func(k string) Val { return sm.peg[k] },
		})
	}

	// Lists: element-wise by position, positions as keys.
	if gl, ok := g.(*ListVal); ok {
		sl, ok := s.(*ListVal)
		if !ok {
			st.record("compat_narrowed", path, g, s,
				"the general value is a list and the specific value is not")
			return subNo
		}
		return subsumeBag(st, path, listView(gl), listView(sl))
	}

	// The ladder above is total in practice: every evaluated former is
	// a scalar, kind, constraint, map, list, disjunct, or top, or is
	// caught by admission (pref) or the unresolved rule (ref, var,
	// conjunct, expect, func). The arm is kept because "in practice" is
	// evaluation's property, not this walk's, and a future value class
	// (or a nil, see the top rule) must land on an honest `undecided`,
	// not fall out of the walk with no answer. Pinned by a direct test
	// (TestSubsumeNoRuleFold); the TS walk keeps the same fold.
	st.record("sub_unresolved", path, g, s,
		"no subsumption rule covers this pair of value formers")
	return subUndecided
}

type bagView struct {
	val      Val
	keys     []string
	closed   bool
	optional []string
	spread   Val
	child    func(k string) Val
}

func listView(l *ListVal) bagView {
	keys := make([]string, len(l.peg))
	for i := range l.peg {
		keys[i] = itoa(i)
	}
	return bagView{
		val: l, keys: keys, closed: l.closed, spread: l.spread,
		child: func(k string) Val {
			for i := range l.peg {
				if itoa(i) == k {
					return l.peg[i]
				}
			}
			return nil
		},
	}
}

func contains(list []string, k string) bool {
	for _, e := range list {
		if e == k {
			return true
		}
	}
	return false
}

// subsumeBag: required keys of the general side must be required in the
// specific side and subsume; optional keys compare when present;
// closedness bounds the specific key set; spread templates govern the
// specific side's surplus. Maps and lists share the shape.
func subsumeBag(st *subState, path []string, g, s bagView) string {
	out := subYes

	for _, k := range g.keys {
		gChild := g.child(k)
		has := contains(s.keys, k)
		optional := contains(g.optional, k)
		kp := append(append([]string{}, path...), k)
		if !has {
			if optional {
				continue
			}
			st.record("compat_required_added", kp, gChild, s.val,
				"the general value requires this key; the specific value admits"+
					" instances without it")
			out = subWorse(out, subNo)
			continue
		}
		if !optional && contains(s.optional, k) {
			st.record("compat_required_added", kp, gChild, s.child(k),
				"the general value requires this key; the specific value makes"+
					" it optional, so instances without it are admitted")
			out = subWorse(out, subNo)
			continue
		}
		out = subWorse(out, subsumeNode(st, kp, gChild, s.child(k)))
	}

	if g.closed {
		if !s.closed {
			st.record("compat_narrowed", path, g.val, s.val,
				"the general value is closed; the open specific value admits"+
					" surplus keys")
			out = subWorse(out, subNo)
		} else {
			for _, k := range s.keys {
				if !contains(g.keys, k) {
					kp := append(append([]string{}, path...), k)
					st.record("compat_narrowed", kp, g.val, s.child(k),
						"the closed general value does not declare this key")
					out = subWorse(out, subNo)
				}
			}
		}
	}

	if nil != g.spread || nil != s.spread {
		if (nil != g.spread && hasPathFunc(g.spread)) ||
			(nil != s.spread && hasPathFunc(s.spread)) {
			gOperand, sOperand := g.val, s.val
			if nil != g.spread {
				gOperand = g.spread
			}
			if nil != s.spread {
				sOperand = s.spread
			}
			st.record("sub_path_dependent_spread", path, gOperand, sOperand,
				"a path-dependent spread template cannot be compared structurally")
			out = subWorse(out, subUndecided)
		} else if nil != g.spread {
			for _, k := range s.keys {
				if !contains(g.keys, k) {
					kp := append(append([]string{}, path...), k)
					out = subWorse(out, subsumeNode(st, kp, g.spread, s.child(k)))
				}
			}
			sSpread := s.spread
			if nil == sSpread {
				sSpread = top()
			}
			kp := append(append([]string{}, path...), "&")
			out = subWorse(out, subsumeNode(st, kp, g.spread, sSpread))
		}
	}

	return out
}

// subTrial runs a comparison whose findings are DISCARDED: disjunct
// member-matching asks many "would this member do?" questions, and only
// the aggregated outcome is a finding.
// A DISTRIBUTION TRIAL IS NOT A NODE CORRESPONDENCE. It asks whether
// one ALTERNATIVE of one side admits one alternative of the other,
// which is a question about admitted sets; the two values it compares
// are not the same node of the two documents. The `gen` profile's mark
// rule is a correspondence question -- did a field that used to be
// generated become hidden -- and firing it here compared a whole
// disjunction (carrying its enclosing bag's mark) against a member
// extracted out of one (which does not), so `hide({c: *a|b})` stopped
// subsuming ITSELF under --profile gen (use-cases/BUGS.md §29). The
// enclosing node's marks are compared where they correspond: at that
// node, by the ordinary walk.
func subTrial(st *subState, path []string, g, s Val) string {
	trial := &subState{
		profile:      st.profile,
		generalURL:   st.generalURL,
		specificURL:  st.specificURL,
		generalSrc:   st.generalSrc,
		specificSrc:  st.specificSrc,
		distributing: true,
	}
	return subsumeNode(trial, path, g, s)
}

// subsumeDefaults: the specific side's effective default must survive
// into the general side unchanged; adding one where none existed is
// compatible.
func subsumeDefaults(st *subState, path []string, g, s Val) string {
	sd, sHas, sInd := subEffectiveDefault(s)
	if !sHas {
		return subYes
	}
	gd, gHas, gInd := subEffectiveDefault(g)
	if sInd || gInd {
		st.record("sub_default_indeterminate", path, g, s,
			"equal-rank preferences disagree, so the effective default is"+
				" not a single value")
		return subUndecided
	}
	if !gHas || !valSame(gd, sd) {
		st.record("compat_default_changed", path, g, s,
			"the effective default changed: previously generable documents"+
				" materialise differently or become incomplete")
		return subNo
	}
	return subYes
}

func subsumeDefaultsWalk(st *subState, path []string, g, s Val) string {
	out := subsumeDefaults(st, path, g, s)
	gm, gok := g.(*MapVal)
	sm, sok := s.(*MapVal)
	if gok && sok {
		for _, k := range sm.keys {
			if gc, ok := gm.peg[k]; ok {
				kp := append(append([]string{}, path...), k)
				out = subWorse(out, subsumeDefaultsWalk(st, kp, gc, sm.peg[k]))
			}
		}
	}
	return out
}

// Subsume reports whether generalSrc subsumes specificSrc — is every
// instance the specific admits admitted by the general too? Both
// sources are evaluated fresh (single-use trees make this mandatory);
// the recursion runs on the finished values. The port of
// ts/src/subsume.ts, held to byte-identical reports by
// test/spec/subsume.tsv.
// PolicyCompat reads a document's own compatibility declaration:
// `$.aontu_policy.compat`, a disjunction whose default is the declared
// mode ("backward" | "forward" | "full" | "none"). The empty string
// means the key is absent, the document does not stand alone, or the
// value does not spell a mode. Exported for the `breaking` verb
// (go/cmd/aontu), which cannot reach the tree's fields itself; the
// canonical port keeps the same reader beside its verb (ts/src/cli.ts
// policyCompat).
func PolicyCompat(src, path string) string {
	return PolicyCompatTrust(src, path, nil)
}

// PolicyCompatTrust is PolicyCompat under an explicit include
// capability, so a verb reading a document's own policy reads it the
// same way it evaluates everything else.
func PolicyCompatTrust(src, path string, trust *TrustOptions) string {
	a := aontuForPathTrust(path, trust)
	v, err := a.Unify(src)
	if err != nil || nil == v || v.Nil() {
		return ""
	}
	m, ok := v.(*MapVal)
	if !ok {
		return ""
	}
	pol, ok := m.peg["aontu_policy"].(*MapVal)
	if !ok {
		return ""
	}
	compat := pol.peg["compat"]
	if d, ok := compat.(*DisjunctVal); ok {
		var pick Val
		for _, mem := range d.peg {
			if nil == pick {
				pick = mem
			}
			if isPref(mem) {
				pick = mem
				break
			}
		}
		compat = pick
	}
	if p, ok := compat.(*PrefVal); ok {
		compat = p.peg
	}
	sv, ok := compat.(*ScalarVal)
	if !ok || KindString != sv.kind {
		return ""
	}
	mode, _ := sv.peg.(string)
	switch mode {
	case "backward", "forward", "full", "none":
		return mode
	}
	return ""
}

func Subsume(generalSrc, specificSrc string, opts *SubsumeOptions) SubsumeReport {
	options := SubsumeOptions{}
	if nil != opts {
		options = *opts
	}
	profile := options.Profile
	if "" == profile {
		profile = "defaults"
	}
	generalURL := options.GeneralURL
	if "" == generalURL {
		generalURL = "general"
	}
	specificURL := options.SpecificURL
	if "" == specificURL {
		specificURL = "specific"
	}
	st := &subState{
		profile:     profile,
		findings:    []VetFinding{},
		generalURL:  generalURL,
		specificURL: specificURL,
		generalSrc:  generalSrc,
		specificSrc: specificSrc,
	}

	broken := SubsumeReport{Verdict: SubsumeError, Findings: []VetFinding{}}

	load := func(src, path string) Val {
		a := aontuForPathTrust(path, options.Trust)
		v, err := a.Unify(src)
		if err != nil || nil == v || v.Nil() {
			return nil
		}
		return v
	}

	g := load(generalSrc, options.GeneralPath)
	s := load(specificSrc, options.SpecificPath)
	if nil == g || nil == s {
		return broken
	}

	if "" != options.At {
		g = anchorAt(g, options.At)
		s = anchorAt(s, options.At)
		if nil == g || nil == s {
			return broken
		}
	}

	out := subsumeNode(st, nil, g, s)
	if "values" != profile {
		out = subWorse(out, subsumeDefaultsWalk(st, nil, g, s))
	}

	verdict := SubsumeYes
	if subNo == out {
		verdict = SubsumeNo
	} else if subUndecided == out {
		verdict = SubsumeUndecided
	}
	return SubsumeReport{Verdict: verdict, Findings: st.findings}
}
