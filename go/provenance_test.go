/* Copyright (c) 2025 Richard Rodger, MIT License */

// The recorder's own surface (ADR-002; the Go side of the
// coverage3-provenance cases in ts/test/coverage3.test.ts). What the
// two ports must AGREE on is pinned by test/spec/why.tsv; what is left
// here is the ordering's last tiebreaks — which no document produces,
// because a source position holds one value — and the entry-file and
// trust wiring, which cross-package CLI runs do not count toward this
// package's coverage.

package aontu

import (
	"testing"
)

func siteVal(canon, file string, row, col int) Val {
	v := newString(canon)
	v.surl = file
	// pos is a byte offset; the recorder turns it into row/col through
	// rowCol, so the source text below is what makes these land.
	v.sp = -1
	return v
}

// The contribution order has to be TOTAL: a partial one would leave
// the record's tail in meet order, which is the fixpoint's business
// and differs between the ports.
func TestProvenanceOrdersByFileThenCanon(t *testing.T) {
	prov := newProvenance("", nil)
	a := siteVal("z", "two.aon", 1, 1)
	b := siteVal("a", "one.aon", 1, 1)
	c := siteVal("m", "one.aon", 1, 1)
	for _, v := range []Val{a, b, c} {
		v.setWritten()
	}
	prov.record([]string{"k"}, a, b, nil)
	prov.record([]string{"k"}, c, nil, nil)

	got := prov.at([]string{"k"})
	if 3 != len(got) {
		t.Fatalf("want 3 contributions, got %d", len(got))
	}
	// one.aon before two.aon; within one.aon, canon breaks the tie.
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

// Why through an Aontu carrying an entry file name and a trust
// profile: the file reaches the contribution's site, and the budgets
// reach the run.
func TestWhyStampsEntryFileAndCarriesTrust(t *testing.T) {
	a := New()
	a.File = "doc.aon"
	a.Trust = &TrustOptions{Budget: TrustBudget{Passes: 9, Depth: 1000}}
	r := a.Why("x: 1\nx: integer", "$.x")
	if !r.OK || nil == r.Record || 2 != len(r.Record.Conjuncts) {
		t.Fatalf("bad report: %+v", r)
	}
	for _, c := range r.Record.Conjuncts {
		if "doc.aon" != c.Site.File {
			t.Fatalf("entry file not stamped: %+v", c)
		}
	}
}

// ONE WRITTEN TOKEN IS ONE CONTRIBUTION (the review's finding E). The
// same written value reaches a path more than once now that provenance
// travels through clones -- as the template application and as the
// value written at the key, or at two stages of narrowing -- and the
// SITE is what says they are one thing. The role is not part of that
// identity, so the more informative one survives. The TypeScript twin
// is `one-written-token-is-one-contribution` in ts/test/why.test.ts.
func TestProvenanceDeduplicatesBySite(t *testing.T) {
	prov := newProvenance("", map[string]string{"one.aon": "a: \"x\"\n"})

	// Two values at the SAME token: the written form and a narrowed
	// one, arriving with different roles.
	lit := newString("x")
	lit.surl = "one.aon"
	lit.sp = 3
	lit.stext = "x"
	lit.setWritten()

	narrowed := newString("x")
	narrowed.surl = "one.aon"
	narrowed.sp = 3
	narrowed.stext = "x"
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

// samePathKids is the containment fact the record is built on, and a
// PrefVal with no inner value has no children to claim -- a shape no
// source produces (the parser refuses a bare `*`), so it is asserted
// here rather than through a row.
func TestSamePathKidsOfAnEmptyPref(t *testing.T) {
	if nil != samePathKids(&PrefVal{}) {
		t.Fatal("an empty pref has no same-path children")
	}
	// And a bag's children are NOT same-path: they stand at their own,
	// deeper paths, which is why containment does not swallow them.
	m := newMap()
	m.set("a", newInteger(1))
	if nil != samePathKids(m) {
		t.Fatal("a map's children are not same-path children")
	}
}
