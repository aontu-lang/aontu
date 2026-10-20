/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

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

	// TextExt is the extensions additionally read as text (the CLI's
	// --text-ext), the other half of what an include may read.
	TextExt []string

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
	// groot and sroot are the documents each side's recursions unfold
	// against.
	groot, sroot Val
	pairs        *subPairs
	// gRec and sRec are the recursion a side's definition is unfolded in
	// place of: its marks are the side's, as an expansion clears the
	// definition's own.
	gRec, sRec Val
}

func subPathText(path []string) string {
	out := "$"
	for _, p := range path {
		out += "." + p
	}
	return out
}

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

const subNoWitness = "no failing case is found, and no rule decides the pair"

var (
	subProbeText = []string{"", "a", "0", " ", "~", "\u0000", "A", "z", "abc",
		"a@b.co", "2020-01-01", "00:00:00Z", "2020-01-01T00:00:00Z", "P1D", "a.b",
		"1.2.3.4", "::1", "http://a.b", "00000000-0000-0000-0000-000000000000", "/a"}
	subProbePaths   = []string{".x", "$.x", "..x", ".a", ".z"}
	subProbeNumbers = []float64{0, 1, -1, 2, 0.5, -0.5, 1.5}
	subSampleToken  = regexp.MustCompile(`\[\^[^\]]*\]|\[\\?(.)[^\]]*\]|\\([dws])|\\(.)|\{[^}]*\}|\(\?:|[()*+?]|(\.)`)
)

// subRefute: a `does_not_subsume` names a failing case
// (sketch/DEFINITION.0.md, §7), a value the specific side admits and the
// general side refuses. Where the probes find none, the pair is
// undecided. Mirrors refute in ts/src/subsume.ts.
func subRefute(st *subState, path []string, g, s Val, message string) string {
	if subListWitness(g, s) || subProbeWitness(st, path, g, s) {
		st.record("compat_narrowed", path, g, s, message)
		return subNo
	}
	st.record("sub_no_witness", path, g, s, subNoWitness)
	return subUndecided
}

func subProbeWitness(st *subState, path []string, g, s Val) bool {
	for _, c := range subProbes(g, s) {
		if subYes == subTrial(st, path, s, c) && subNo == subTrial(st, path, g, c) {
			return true
		}
	}
	return false
}

// subListWitness: the empty list, or a pair of members only the general
// side's uniqueness refuses.
func subListWitness(g, s Val) bool {
	sc, ok := s.(*ConstraintVal)
	if !ok || !subSizesOnly(sc) {
		return false
	}
	if constraintAdmitsSize(sc, 0) && subRefusesEmptyList(g) {
		return true
	}
	gc, ok := g.(*ConstraintVal)
	if !ok || !constraintAdmitsSize(sc, 2) {
		return false
	}
	if gc.uniq && !sc.uniq && 0 == len(sc.uniqBy) {
		return true
	}
	for _, k := range gc.uniqBy {
		if !contains(sc.uniqBy, k) {
			return true
		}
	}
	return false
}

// subSizesOnly: a residual whose only demands on a container are its
// size and the uniqueness of its members.
func subSizesOnly(c *ConstraintVal) bool {
	return "" == c.domain && !c.pathKind && 0 == c.bandBs()+len(c.contains)
}

// subRefusesEmptyList: a kind refuses the empty list, and so does a
// residual with a domain, or one whose size demand refuses no members.
func subRefusesEmptyList(g Val) bool {
	c, ok := g.(*ConstraintVal)
	return !ok || "" != c.domain || c.pathKind ||
		(subSizesOnly(c) && !constraintAdmitsSize(c, 0))
}

// subProbes: a few scalars of each kind, a sample of each named format,
// and the ends, excluded values, divisors and patterns of either
// residual, with the numbers beside each end and the multiples beside
// each divisor.
func subProbes(g, s Val) []Val {
	text := append([]string{}, subProbeText...)
	nums := append([]float64{}, subProbeNumbers...)
	var ends []float64
	var rs []*ConstraintVal
	for _, v := range []Val{g, s} {
		if c, ok := v.(*ConstraintVal); ok {
			rs = append(rs, c)
		}
	}
	for _, r := range rs {
		vals := append([]*ScalarVal{}, r.neqs...)
		for _, b := range []*constraintBound{r.lo, r.hi} {
			if nil != b {
				vals = append(vals, b.v)
			}
		}
		for _, v := range vals {
			if t, ok := v.peg.(string); ok {
				text = append(text, t, t+"a")
				continue
			}
			n, _ := strconv.ParseFloat(fmt.Sprint(v.peg), 64)
			ends = append(ends, n)
		}
		for _, re := range r.res {
			text = append(text, subSampleOf(re.src))
		}
	}
	for _, n := range ends {
		nums = append(nums, n, n-1, n+1, n-0.5, n+0.5)
	}
	for _, r := range rs {
		for _, d := range r.mults {
			m, _ := strconv.ParseFloat(fmt.Sprint(d.peg), 64)
			nums = append(nums, m, -m, 3*m)
			for _, e := range ends {
				c := math.Ceil(e/m) * m
				nums = append(nums, c, c+m)
			}
		}
	}
	var out []Val
	seen := map[string]bool{}
	for _, t := range text {
		if !seen[t] {
			seen[t] = true
			out = append(out, newString(t))
		}
	}
	for _, p := range subProbePaths {
		out = append(out, newPath(p))
	}
	seenN := map[float64]bool{}
	for _, n := range nums {
		if math.IsInf(n, 0) || math.IsNaN(n) || seenN[n] {
			continue
		}
		seenN[n] = true
		if n == math.Trunc(n) && math.Abs(n) <= 1<<53-1 {
			out = append(out, newInteger(int64(n)), newBigInteger(big.NewInt(int64(n))))
		}
		out = append(out, newFloat(n))
		// Only where JavaScript's String(n) writes no exponent, as the
		// TypeScript twin builds its decimal from that text.
		if a := math.Abs(n); 0 == a || (1e-6 <= a && a < 1e21) {
			ip, fp, _ := strings.Cut(strconv.FormatFloat(a, 'f', -1, 64), ".")
			d, _ := exactDecimal(n < 0, ip, fp, "")
			out = append(out, newBigDecimal(d))
		}
	}
	return append(out, newBoolean(true), newBoolean(false), newNull())
}

// subSampleOf: a string a simple pattern matches, its first alternative,
// each class as its first member, each escape as a character it names,
// and no quantifier, group or anchor.
func subSampleOf(src string) string {
	body := strings.SplitN(strings.TrimSuffix(strings.TrimPrefix(src, "^"), "$"), "|", 2)[0]
	var b strings.Builder
	last := 0
	for _, m := range subSampleToken.FindAllStringSubmatchIndex(body, -1) {
		b.WriteString(body[last:m[0]])
		last = m[1]
		switch {
		case 0 <= m[2]:
			b.WriteString(body[m[2]:m[3]])
		case 0 <= m[4]:
			b.WriteString(map[string]string{"d": "0", "w": "a", "s": " "}[body[m[4]:m[5]]])
		case 0 <= m[6]:
			b.WriteString(body[m[6]:m[7]])
		case 0 <= m[8]:
			b.WriteString("a")
		}
	}
	b.WriteString(body[last:])
	return b.String()
}

// subInsideString: a residual of the string domain is below `string`
// where it refuses "" and every path, each spelled from `$` or `.`, so a
// lower end that starts after `.` refuses them all.
func subInsideString(s *ConstraintVal) bool {
	if s.nonEmpty && !s.emptyOk {
		return true
	}
	ok, und := constraintAdmitsScalarQ(s, newString(""))
	if ok || und || nil == s.lo {
		return false
	}
	lo, _ := s.lo.v.peg.(string)
	r, n := utf8.DecodeRuneInString(lo)
	return 0 < n && '.' < r
}

// subAboveString: a residual is above `string` where nothing in it
// refuses a string the kind admits: no end but a lower one at "", no
// excluded string the kind admits, and no pattern, format, size, leaf or
// evaluated check.
func subAboveString(g *ConstraintVal, strict bool) bool {
	if ("" != g.domain && "string" != g.domain) || KindTop != g.kind || g.pathKind ||
		nil != g.hi || nil != g.count || g.uniq ||
		0 < len(g.uniqBy)+len(g.res)+len(g.fmts)+g.bandBs()+len(g.contains) {
		return false
	}
	if nil != g.lo && !(KindString == g.lo.v.kind && "" == g.lo.v.peg && (strict || !g.lo.open)) {
		return false
	}
	if !strict && g.nonEmpty && !g.emptyOk {
		return false
	}
	for _, n := range g.neqs {
		if KindString == n.kind && !(strict && "" == n.peg) {
			return false
		}
	}
	return true
}

func subsumeNode(st *subState, path []string, g0, s0 Val) string {
	g := subAdmission(g0)
	s := subAdmission(s0)

	// Marks change the OUTPUT shape, not the admitted set: only the
	// `gen` profile reports them.
	gm, sm := g, s
	if nil != st.gRec {
		gm = st.gRec
	}
	if nil != st.sRec {
		sm = st.sRec
	}
	if "gen" == st.profile && !st.distributing && nil != g && nil != s &&
		(gm.markedType() != sm.markedType() || gm.markedHide() != sm.markedHide()) {
		st.record("compat_marks_changed", path, g, s,
			fmt.Sprintf("marks differ: general {\"type\":%t,\"hide\":%t}, specific {\"type\":%t,\"hide\":%t}",
				gm.markedType(), gm.markedHide(), sm.markedType(), sm.markedHide()))
		return subNo
	}

	if isTop(g) {
		return subYes
	}

	// A nil admits nothing (ADR-052's forbidden key and closed spread), so
	// every value subsumes one, and one subsumes no other value.
	if nil != s && s.Nil() {
		return subYes
	}
	if nil != g && g.Nil() {
		st.record("compat_narrowed", path, g, s, "the general value admits nothing")
		return subNo
	}

	_, gRec := g.(*RecurseVal)
	_, sRec := s.(*RecurseVal)
	if gRec || sRec {
		if out := subsumeRecursion(st, path, g0, s0, g, s); "" != out {
			return out
		}
	}

	if subUnresolvedVal(g) || subUnresolvedVal(s) {
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
		if nil != g && subIdentical(g, s) {
			return subYes
		}
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
		// A `string` without the waiver refuses the "" a waived one admits.
		strict := KindString == gk.kind && !gk.emptyOk
		switch sn := s.(type) {
		case *ScalarKindVal:
			if (gk.kind == sn.kind || kindSubsumes(gk.kind, sn.kind)) && !(strict && sn.emptyOk) {
				return subYes
			}
			st.record("compat_narrowed", path, g, s,
				"the general kind does not admit the specific kind")
			return subNo
		case *ScalarVal:
			if (gk.kind == sn.kind || kindSubsumes(gk.kind, sn.kind)) &&
				!(strict && KindString == sn.kind && ("" == sn.peg.(string) || sn.emptyOk)) {
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
			if "string" == sn.domain && KindString == gk.kind && !sn.pathKind &&
				(!strict || subInsideString(sn)) {
				return subYes
			}
			if KindPath == gk.kind && sn.pathKind {
				return subYes
			}
			return subRefute(st, path, g, s,
				"the general kind does not cover the specific residual")
		}
		st.record("compat_narrowed", path, g, s,
			"the general kind admits no such value")
		return subNo
	}

	// Container kinds (sketch/PATHS.0.md): `map()` subsumes every
	// map and itself, `list()` every list. The unit literals already
	// subsume through the container rules; only the kind former needs
	// an arm. Mirrors the same arm in ts/src/subsume.ts.
	if _, ok := g.(*MapKindVal); ok {
		switch s.(type) {
		case *MapVal, *MapKindVal:
			return subYes
		}
		st.record("compat_narrowed", path, g, s,
			"the general container kind admits no such value")
		return subNo
	}
	if _, ok := g.(*ListKindVal); ok {
		switch s.(type) {
		case *ListVal, *ListKindVal:
			return subYes
		}
		st.record("compat_narrowed", path, g, s,
			"the general container kind admits no such value")
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
				if subIdentical(g, s) {
					return subYes
				}
				st.record("sub_evaluate_only", path, g, s, opaqueNote(gc))
				return subUndecided
			}
			return subRefute(st, path, g, s,
				"the general residual does not contain the specific residual")
		}
		if sv, ok := s.(*ScalarVal); ok {
			okc, und := constraintAdmitsScalarQ(gc, sv)
			if okc {
				return subYes
			}
			if und {
				st.record("sub_evaluate_only", path, g, s, opaqueNote(gc))
				return subUndecided
			}
			st.record("compat_narrowed", path, g, s,
				"the general residual does not admit the specific scalar")
			return subNo
		}
		why := "the general residual constrains a domain the specific value is not in"
		if kv, ok := s.(*ScalarKindVal); ok {
			if constraintSubsumesKind(gc, kv.kind) ||
				(KindString == kv.kind && subAboveString(gc, !kv.emptyOk)) {
				return subYes
			}
			return subRefute(st, path, g, s, why)
		}
		// A residual with a domain refuses every container, so any
		// instance of the specific side fails it.
		if "" != gc.domain || gc.pathKind {
			st.record("compat_narrowed", path, g, s, why)
			return subNo
		}
		st.record("sub_no_witness", path, g, s, subNoWitness)
		return subUndecided
	}

	// Concrete scalars subsume only themselves -- except paths, whose
	// meet is the prefix rule (ADR-016): a prefix admits every
	// extension of itself, so it subsumes one, exactly as the meet
	// answers the longer. Mirrors the same arm in ts/src/subsume.ts.
	if gv, ok := g.(*ScalarVal); ok {
		if sv, ok := s.(*ScalarVal); ok &&
			KindPath == gv.kind && KindPath == sv.kind {
			if m, mok := prefixMeet(gv.peg.(string), sv.peg.(string)); mok &&
				m == sv.peg.(string) {
				return subYes
			}
		}
		if _, ok := s.(*ScalarVal); ok && valSame(g, s) {
			return subYes
		}
		st.record("compat_narrowed", path, g, s,
			"a concrete value subsumes only itself")
		return subNo
	}

	// Maps.
	if gm, ok := g.(*MapVal); ok {
		if _, ok := s.(*MapKindVal); ok {
			keys := fieldKeys(gm)
			refused := gm.closed
			for _, k := range keys {
				refused = refused || !contains(gm.optional, k)
			}
			return subOverKind(st, path, g, s, refused, keys,
				func(k string) Val { return gm.peg[k] }, gm.spread,
				"the general map refuses a map the specific kind admits")
		}
		sm, ok := s.(*MapVal)
		if !ok {
			st.record("compat_narrowed", path, g, s,
				"the general value is a map and the specific value is not")
			return subNo
		}
		// A DECLARATION IS NOT A FIELD: an alias key is erased before the
		// document exists, so neither side compares one.
		return subAssume(st, g0, s0, func() string {
			return subsumeBag(st, path, bagView{
				val: gm, keys: fieldKeys(gm), closed: gm.closed,
				optional: gm.optional, spread: gm.spread,
				child: func(k string) Val { return gm.peg[k] },
			}, bagView{
				val: sm, keys: fieldKeys(sm), closed: sm.closed,
				optional: sm.optional, spread: sm.spread,
				child: func(k string) Val { return sm.peg[k] },
			})
		})
	}

	// Lists: element-wise by position, positions as keys.
	if gl, ok := g.(*ListVal); ok {
		if _, ok := s.(*ListKindVal); ok {
			return subOverKind(st, path, g, s,
				0 < len(gl.peg) || (gl.closed && nil == gl.spread), nil, nil, gl.spread,
				"the general list refuses a list the specific kind admits")
		}
		sl, ok := s.(*ListVal)
		if !ok {
			st.record("compat_narrowed", path, g, s,
				"the general value is a list and the specific value is not")
			return subNo
		}
		return subAssume(st, g0, s0, func() string {
			return subsumeBag(st, path, listView(gl), listView(sl))
		})
	}

	if nil != g && nil != s && !g.Nil() && !s.Nil() &&
		Hcanon(g) == Hcanon(s) {
		return subYes
	}
	st.record("sub_unresolved", path, g, s,
		"no subsumption rule covers this pair of value formers")
	return subUndecided
}

// subOverKind: each outright refusal has a failing case the kind admits,
// and members and the spread are held to `any`. Mirrors overKind in
// ts/src/subsume.ts, which names the cases.
func subOverKind(st *subState, path []string, g, s Val, refused bool,
	keys []string, child func(string) Val, spread Val, message string) string {
	if refused {
		st.record("compat_narrowed", path, g, s, message)
		return subNo
	}
	out := subYes
	for _, k := range keys {
		kp := append(append([]string{}, path...), k)
		out = subWorse(out, subsumeNode(st, kp, child(k), top()))
	}
	if nil != spread {
		kp := append(append([]string{}, path...), "&")
		out = subWorse(out, subsumeNode(st, kp, spread, top()))
	}
	return out
}

// subsumeRecursion reads a recursion as the definition it names,
// unfolded against its own document (sketch/RECURSION.0.md, P3). One
// met again before the walk enters a bag unfolds to no structure, and
// answers "" to be compared as residue.
func subsumeRecursion(st *subState, path []string, g0, s0, g, s Val) string {
	key := [2]Val{g0, s0}
	if st.pairs.unfolding[key] {
		return ""
	}
	gb, sb := g0, s0
	gRec, sRec := st.gRec, st.sRec
	if r, ok := g.(*RecurseVal); ok {
		gb = walkTarget(st.groot, r.target)
		if nil == gRec {
			gRec = r
		}
	}
	if r, ok := s.(*RecurseVal); ok {
		sb = walkTarget(st.sroot, r.target)
		if nil == sRec {
			sRec = r
		}
	}
	if nil == gb || nil == sb {
		st.record("sub_unresolved", path, g, s,
			"a recursion whose definition its document does not hold")
		return subUndecided
	}
	outerG, outerS := st.gRec, st.sRec
	st.gRec, st.sRec = gRec, sRec
	st.pairs.unfolding[key] = true
	out := subsumeNode(st, path, gb, sb)
	delete(st.pairs.unfolding, key)
	st.gRec, st.sRec = outerG, outerS
	return out
}

// subIdentical: values of one hash form are one value (use-cases/BUGS.md
// 64), unless a recursion inside names a definition its own document holds.
func subIdentical(g, s Val) bool {
	h := Hcanon(g)
	return h == Hcanon(s) && !strings.Contains(h, "$.") && !strings.Contains(h, "%")
}

// subUnfold answers a recursion's definition in its own document, or the
// value itself.
func subUnfold(root, v Val) Val {
	if r, ok := v.(*RecurseVal); ok {
		return walkTarget(root, r.target)
	}
	return v
}

// subPairs holds the pairs of bags the walk has met: those it is
// comparing, the answers it has settled, and the yes-answers waiting on a
// pair still compared; and the recursions it has unfolded since it last
// entered a bag.
type subPairs struct {
	frames    []*subFrame
	running   map[subPair]int
	settled   map[subPair]string
	pending   map[subPair]int
	unfolding map[[2]Val]bool
}

type subPair struct {
	g, s  Val
	marks string
}

type subFrame struct {
	depth, low int
	held       []subPair
}

func newSubPairs() *subPairs {
	return &subPairs{running: map[subPair]int{}, settled: map[subPair]string{},
		pending: map[subPair]int{}, unfolding: map[[2]Val]bool{}}
}

// subAssume answers yes for a pair of bags already under comparison, so
// a recursion ends on the first pair it meets again (Amadio and Cardelli),
// and compares each pair once (Tarjan's lowlink keeps a yes that assumed
// a pair still running from settling before that pair does).
func subAssume(st *subState, g0, s0 Val, compare func() string) string {
	p := st.pairs
	key := subPair{g: g0, s: s0}
	if "gen" == st.profile {
		key.marks = subMarkOf(st.gRec) + subMarkOf(st.sRec)
	}
	if out, ok := p.settled[key]; ok {
		return out
	}
	low, ok := p.running[key]
	if !ok {
		low, ok = p.pending[key]
	}
	if ok {
		top := p.frames[len(p.frames)-1]
		top.low = min(top.low, low)
		return subYes
	}
	frame := &subFrame{depth: len(p.frames), low: len(p.frames)}
	unfolding := p.unfolding
	p.frames = append(p.frames, frame)
	p.running[key] = frame.depth
	p.unfolding = map[[2]Val]bool{}
	out := compare()
	p.unfolding = unfolding
	p.frames = p.frames[:len(p.frames)-1]
	delete(p.running, key)
	subSettle(st, key, frame, out)
	return out
}

func subSettle(st *subState, key subPair, frame *subFrame, out string) {
	p := st.pairs
	var parent *subFrame
	if 0 < len(p.frames) {
		parent = p.frames[len(p.frames)-1]
	}
	main := !st.distributing
	if main && subYes == out && frame.low < frame.depth {
		p.pending[key] = frame.low
		parent.held = append(append(parent.held, key), frame.held...)
	} else {
		for _, k := range frame.held {
			delete(p.pending, k)
			if main && subYes == out {
				p.settled[k] = out
			}
		}
		if main {
			p.settled[key] = out
		}
	}
	if nil != parent {
		parent.low = min(parent.low, frame.low)
	}
}

func subMarkOf(v Val) string {
	if nil == v {
		return "x"
	}
	return fmt.Sprintf("%t%t", v.markedType(), v.markedHide())
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
func fieldKeys(m *MapVal) []string {
	keys := make([]string, 0, len(m.keys))
	for _, k := range m.keys {
		if !m.isAliasKey(k) {
			keys = append(keys, k)
		}
	}
	return keys
}

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
		sameTemplate := nil != g.spread && nil != s.spread &&
			Hcanon(g.spread) == Hcanon(s.spread)
		if !sameTemplate &&
			((nil != g.spread && hasPathFunc(g.spread)) ||
				(nil != s.spread && hasPathFunc(s.spread))) {
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
			// A sealed specific side with no template has no member beyond
			// the ones the loop above holds to the general template.
			if !s.closed || nil != s.spread {
				sSpread := s.spread
				if nil == sSpread {
					sSpread = top()
				}
				kp := append(append([]string{}, path...), "&")
				out = subWorse(out, subsumeNode(st, kp, g.spread, sSpread))
			}
		}
	}

	return out
}

func subTrial(st *subState, path []string, g, s Val) string {
	trial := &subState{
		profile:      st.profile,
		generalURL:   st.generalURL,
		specificURL:  st.specificURL,
		generalSrc:   st.generalSrc,
		specificSrc:  st.specificSrc,
		distributing: true,
		groot:        st.groot,
		sroot:        st.sroot,
		pairs:        st.pairs,
		gRec:         st.gRec,
		sRec:         st.sRec,
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

func subsumeDefaultsWalk(st *subState, path []string, g0, s0 Val,
	seen map[[2]Val]bool) string {
	g := subUnfold(st.groot, g0)
	s := subUnfold(st.sroot, s0)
	out := subsumeDefaults(st, path, g, s)
	gm, gok := g.(*MapVal)
	sm, sok := s.(*MapVal)
	if gok && sok && !seen[[2]Val{g, s}] {
		seen[[2]Val{g, s}] = true
		for _, k := range sm.keys {
			if gc, ok := gm.peg[k]; ok {
				kp := append(append([]string{}, path...), k)
				out = subWorse(out, subsumeDefaultsWalk(st, kp, gc, sm.peg[k], seen))
			}
		}
	}
	return out
}

func PolicyCompat(src, path string) string {
	return PolicyCompatTrust(src, path, nil, nil)
}

func PolicyCompatTrust(
	src, path string, trust *TrustOptions, textExt []string) string {
	a := aontuForPathTrust(path, trust, textExt)
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
		pairs:       newSubPairs(),
	}

	broken := SubsumeReport{Verdict: SubsumeError, Findings: []VetFinding{}}

	load := func(src, path string) Val {
		a := aontuForPathTrust(path, options.Trust, options.TextExt)
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
	st.groot, st.sroot = g, s

	if "" != options.At {
		g = anchorAt(g, options.At)
		s = anchorAt(s, options.At)
		if nil == g || nil == s {
			return broken
		}
	}

	out := subsumeNode(st, nil, g, s)
	if "values" != profile {
		out = subWorse(out, subsumeDefaultsWalk(st, nil, g, s, map[[2]Val]bool{}))
	}

	verdict := SubsumeYes
	if subNo == out {
		verdict = SubsumeNo
	} else if subUndecided == out {
		verdict = SubsumeUndecided
	}
	return SubsumeReport{Verdict: verdict, Findings: st.findings}
}

func opaqueNote(g *ConstraintVal) string {
	if 0 < len(g.musts) {
		return "an evaluate-only check (must) makes the admitted set opaque"
	}
	if 0 < len(g.nofs) {
		return "a count of trial schemas (nof) makes the admitted set opaque"
	}
	if 0 < len(g.whens) {
		return "a conditional over trial schemas (when) makes the admitted set opaque"
	}
	if 0 < len(g.contains) {
		return "a count of the members a trial schema admits (contains) makes the " +
			"admitted set opaque"
	}
	return "a check of the members no cover evaluates (rest) makes the admitted set opaque"
}
