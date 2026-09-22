/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"testing"
)

func siteVal(canon, file string, row, col int) Val {
	v := newString(canon)
	v.site.url = file
	// pos is a byte offset; the recorder turns it into row/col through
	// rowCol, so the source text below is what makes these land.
	v.site.sp = -1
	return v
}

func TestProvenanceOrdersByFileThenCanon(t *testing.T) {
	prov := newProvenance("", nil)
	a := siteVal("z", "two.aontu", 1, 1)
	b := siteVal("a", "one.aontu", 1, 1)
	c := siteVal("m", "one.aontu", 1, 1)
	for _, v := range []Val{a, b, c} {
		v.setWritten()
	}
	prov.record([]string{"k"}, a, b, nil)
	prov.record([]string{"k"}, c, nil, nil)

	got := prov.at([]string{"k"})
	if 3 != len(got) {
		t.Fatalf("want 3 contributions, got %d", len(got))
	}
	// one.aontu before two.aontu; within one.aontu, canon breaks the tie.
	if `"a"` != got[0].Canon || `"m"` != got[1].Canon || `"z"` != got[2].Canon {
		t.Fatalf("bad order: %v", []string{
			got[0].Canon, got[1].Canon, got[2].Canon})
	}

	// A path nothing met has no record at all.
	if 0 != len(prov.at([]string{"nowhere"})) {
		t.Fatal("expected no record for an unmet path")
	}
}

// writtenFrom walks a tree once: a value reached twice (a shared
// clone, a repeated stamp) is not re-walked.
func TestProvenanceWrittenFromIsIdempotent(t *testing.T) {
	prov := newProvenance("", nil)
	leaf := newInteger(1)
	m := newMap()
	m.set("a", leaf)
	m.set("b", leaf)
	prov.writtenFrom(m)
	prov.writtenFrom(m)
	if !leaf.written() || !m.written() {
		t.Fatal("tree not stamped")
	}
	// A nil child is no tree at all.
	prov.writtenFrom(nil)
}

func TestWhyStampsEntryFileAndCarriesTrust(t *testing.T) {
	a := New()
	a.File = "doc.aontu"
	a.Trust = &TrustOptions{Budget: TrustBudget{Passes: 9, Depth: 1000}}
	r := a.Why("x: 1\nx: integer", "$.x")
	if !r.OK || nil == r.Record || 2 != len(r.Record.Conjuncts) {
		t.Fatalf("bad report: %+v", r)
	}
	for _, c := range r.Record.Conjuncts {
		if "doc.aontu" != c.Site.File {
			t.Fatalf("entry file not stamped: %+v", c)
		}
	}
}

func TestProvenanceDeduplicatesBySite(t *testing.T) {
	prov := newProvenance("", map[string]string{"one.aontu": "a: \"x\"\n"})

	lit := newString("x")
	lit.site.url = "one.aontu"
	lit.site.sp = 3
	lit.site.src = "x"
	lit.setWritten()

	narrowed := newString("x")
	narrowed.site.url = "one.aontu"
	narrowed.site.sp = 3
	narrowed.site.src = "x"
	narrowed.setWritten()
	narrowed.setFromSpread()

	prov.record([]string{"k"}, lit, narrowed, nil)

	got := prov.at([]string{"k"})
	if 1 != len(got) {
		t.Fatalf("want 1 contribution, got %d: %+v", len(got), got)
	}
	// The role that says HOW it got here wins over "written there".
	if WhySpread != got[0].Role {
		t.Fatalf("want the spread role, got %q", got[0].Role)
	}

	// An UNSITED contribution cannot be told apart from another, so
	// they are kept as they come rather than collapsed.
	unsitedA := newString("p")
	unsitedA.setWritten()
	unsitedB := newString("q")
	unsitedB.setWritten()
	prov.record([]string{"u"}, unsitedA, unsitedB, nil)
	if 2 != len(prov.at([]string{"u"})) {
		t.Fatalf("unsited contributions were collapsed: %+v",
			prov.at([]string{"u"}))
	}
}

// The role precedence, stated directly: every role has a rank, and an
// unknown one ranks last so a new role cannot silently outrank the
// ones that carry information.
func TestProvenanceRoleRank(t *testing.T) {
	if !(whyRoleRank(WhySpread) < whyRoleRank(WhyRef) &&
		whyRoleRank(WhyRef) < whyRoleRank(WhyPref) &&
		whyRoleRank(WhyPref) < whyRoleRank(WhyLiteral)) {
		t.Fatal("role precedence is not spread < ref < pref < literal")
	}
	if whyRoleRank(WhyLiteral) != whyRoleRank("something-new") {
		t.Fatal("an unknown role must rank with literal")
	}
}

func TestSamePathKidsOfAnEmptyPref(t *testing.T) {
	if nil != samePathKids(&PrefVal{}) {
		t.Fatal("an empty pref has no same-path children")
	}
	m := newMap()
	m.set("a", newInteger(1))
	if nil != samePathKids(m) {
		t.Fatal("a map's children are not same-path children")
	}
}
