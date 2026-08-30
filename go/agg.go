/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strconv"
	"strings"
)

// AGGREGATION, PROJECTION AND THE STRING FOLD: sum(d), least(d),
// greatest(d), pick(d, k) and join(d, sep?) (the Go side of
// ts/src/val/AggFuncVal.ts).
//
// The review's finding I: "No aggregation. length() counts but nothing
// sums: an invoice total, a fleet-wide resource budget, a quota roll-up
// -- all inexpressible." Use case 10 had to write totals by hand and
// spot-check them with must(), which is a model asserting what it should
// be able to COMPUTE.
//
// A FOLD OVER A FINITE, SETTLED BAG IS AS TOTAL AS each. There is no
// recursion and no user-supplied step: the bag is the one the model
// already holds, the operation is fixed, and the walk visits each child
// exactly once. That is why these are built-ins rather than a fold
// combinator -- a fold takes a function, and a language with no user
// functions has none to take.
//
// THE NAMES ARE least AND greatest, NOT min AND max, which are already
// the constraint atoms for a lower and an upper BOUND. See the
// TypeScript twin's header for the rest of the reasoning: sum folds with
// add so the number tower's law comes with it, sum([]) is 0 because
// addition has an identity, and least/greatest refuse an empty bag
// because comparison has none.

// isBag reports whether a value has children to fold. bagChildren
// (constraint.go, where `unique` already needed the same walk) lists
// them in the order the aggregate sees: source order for a list,
// sorted-key order for a map -- each's order, and for the same reason (a
// map has no order of its own, so the language picks one and states it).
// It asserts its argument is one of the two, so the check is here.
func isBag(v Val) bool {
	switch v.(type) {
	case *ListVal, *MapVal:
		return true
	}
	return false
}

// aggregate folds a bag. f is the call the error is located at, and base
// the path the answer is placed at.
func aggregate(ctx *Ctx, op string, f *FuncVal, base []string, data Val) Val {
	if !isBag(data) {
		return makeNilErrFull(ctx, "aggregate_data", f, nil, op, nil)
	}
	children := bagChildren(data)

	if "sum" == op {
		// Zero is addition's identity, so an empty bag has an answer and
		// it is an integer — the narrowest kind, which the first real
		// operand then widens under R5 exactly as add(0, x) would.
		var total Val = newInteger(0)
		for _, child := range children {
			total = arithNamed(ctx, "add", op, f, total, child)
			// A refusal inside the fold IS the answer: folding on past a
			// non-numeric child or an overflow would report the wrong
			// reason, or none.
			if total.Nil() {
				return total
			}
		}
		return total
	}

	if 0 == len(children) {
		return makeNilErrFull(ctx, "aggregate_empty", f, nil, op, nil)
	}

	want := 1
	if "least" == op {
		want = -1
	}

	var best *ScalarVal
	for _, child := range children {
		c, cok := unpref(child).(*ScalarVal)
		if !cok || !arithKinds[c.kind] {
			return makeNilErrFull(ctx, "invalid-arg", f, nil, op, nil)
		}
		// The EXACT comparator (numcmp), never binary64: a bigdecimal and
		// an integer in one bag must order by their values and not by
		// whatever their float images happen to be.
		if nil == best || want == cmpNumeric(c, best) {
			best = c
		}
	}
	// The winner is returned as itself, so it keeps its own kind: the
	// least of a bag of bigdecimals is a bigdecimal.
	return clonePath(best, cp(base))
}

// THE FOLD TO A STRING: join(coll, sep?) -- G9 phase 2.
//
// The one primitive between a model and a generated file. A spread can
// put a separator AFTER each element; putting one BETWEEN N elements is
// a reduction over strings, and the language had none: sum is numeric,
// `+` does not reduce a list, and indexed concatenation needs the arity
// known in advance. So a generated SQL column list carried a trailing
// comma and did not parse (use-cases/15-code-generation).
//
// IT FOLDS WITH `+` SEEDED WITH "", exactly as sum folds with add seeded
// with 0. Not a figure of speech: members are rendered by primStr, which
// IS what `+`'s string branch calls (exactPlus in op.go), so the
// language keeps one answer to "how does a number become text". See the
// TypeScript twin's header for the rest -- join(coll) is concatenation
// so no concat is needed, the empty bag is "" because concatenation has
// an identity, and members are validated BEFORE the fold because `+`
// with a string on the left residuates on a container rather than
// refusing.

// joinVerdict is what a value can be to join: text it can fold, a
// settled value it never can, or something not settled yet.
type joinVerdict int

const (
	joinText joinVerdict = iota
	// A SETTLED value that will never become text: a map, a list, a
	// null. This is join_member, class conflict.
	joinNever
	// An unresolved kind, a top, a stable residue. NOT a join failure:
	// the call stays residual and generation reports mapval_no_gen,
	// class incomplete, as docs/trust.md requires.
	joinNotYet
)

// joinText renders a value the way `+` would, or reports that `+` would
// not take it at all. A pref member contributes its preferred value, and
// therefore that value's kind too.
func joinTextOf(v Val) (string, bool) {
	sv, ok := unpref(v).(*ScalarVal)
	if !ok {
		return "", false
	}
	switch sv.kind {
	case KindString, KindInteger, KindFloat,
		KindBigInteger, KindBigDecimal, KindBoolean:
		return primStr(sv.peg), true
	}
	return "", false
}

// joinMember classifies a bag member. Getting this split wrong in either
// direction is the defect that matters: refusing a residue makes join
// unusable inside a schema, and deferring on a map makes a real error
// arrive as a shrug.
func joinMember(v Val) joinVerdict {
	u := unpref(v)
	if _, ok := joinTextOf(u); ok {
		return joinText
	}
	if isBag(u) {
		return joinNever
	}
	if sv, ok := u.(*ScalarVal); ok && KindNull == sv.kind {
		return joinNever
	}
	return joinNotYet
}

// joinSep classifies the separator, which is a STRING or it is nothing.
//
// A number would render perfectly well through `+`, and is still
// refused: the separator is not a member of the fold, it is the
// parameter naming the text between members, and join(x, 5) is far
// likelier a mistake than an intent to separate with "5". pick's key
// argument draws the same line. This is the direction that can be
// loosened later without breaking a document; the other cannot.
func joinSep(v Val) joinVerdict {
	u := unpref(v)
	if sv, ok := u.(*ScalarVal); ok {
		if KindString == sv.kind {
			return joinText
		}
		return joinNever
	}
	if isBag(u) {
		return joinNever
	}
	return joinNotYet
}

// joinPending reports whether the call must hold its answer for a later
// pass: a member or the separator is settled-shaped but not settled. The
// caller sets pegdone false, so the call rides the ordinary
// args-not-done path and residuates, mirroring
// JoinFuncVal.deferResolve in TypeScript.
func joinPending(args []Val) bool {
	if 0 == len(args) || !isBag(args[0]) {
		// Not a bag at all: let resolve say so rather than waiting for a
		// settling that has already happened.
		return false
	}
	if 1 < len(args) && joinNotYet == joinSep(args[1]) {
		return true
	}
	for _, child := range bagChildren(args[0]) {
		if joinNotYet == joinMember(child) {
			return true
		}
	}
	return false
}

// joinBag is join(d, sep?). f is the call the error is located at, base
// the path the answer is placed at. sep is nil when the call wrote only
// the bag, which makes the separator "" and join(coll) concatenation.
func joinBag(ctx *Ctx, f *FuncVal, base []string, data, sep Val) Val {
	if !isBag(data) {
		return makeNilErrFull(ctx, "aggregate_data", f, nil, "join", nil)
	}

	sepText := ""
	if nil != sep {
		if joinText != joinSep(sep) {
			return makeNilErrFull(ctx, "invalid-arg", f, nil, "join", nil)
		}
		sepText, _ = joinTextOf(sep)
	}

	// NO NIL-MEMBER GUARD, WHERE sum HAS ONE, and the difference is the
	// fold's shape rather than an oversight. sum folds with arithNamed,
	// which MINTS a nil part-way through -- a non-numeric child or an
	// overflow -- so it has to stop and return it. join folds
	// already-unified values, and a nil among a list's elements
	// collapses the list before this call resolves:
	// join([least([])], ",") reports aggregate_empty at the member's
	// own path and never reaches here. A guard was written, the
	// ADR-002 gate found it unexecuted, and probing confirmed no
	// spelling reaches it, so it is removed rather than excused.
	parts := []string{}
	for _, child := range bagChildren(data) {
		u := unpref(child)
		text, ok := joinTextOf(u)
		if !ok {
			return makeNilErrFull(ctx, "join_member", f, nil, "join",
				map[string]string{"member": u.Canon()})
		}
		parts = append(parts, text)
	}

	// Every part is already a string, so this IS the `+` fold seeded
	// with "" -- written as one Join because a loop of `+` over settled
	// strings cannot differ from it, and because the TypeScript twin's
	// Array.join must produce the same bytes.
	out := newString(strings.Join(parts, sepText))
	out.path = cp(base)
	return out
}

// project is pick(d, k): one element per child of d, being that child's
// k. f is the call the error is located at, base the path the answer is
// placed at.
//
// The other half of the review's finding I. Without it the aggregates
// above cannot reach the case that motivated them, because sum needs a
// bag of NUMBERS and a model holds a bag of RECORDS:
//
//	total: sum(pick($.lines, amountCents))
//
// IT IS NOT each WITH A CLEVER TEMPLATE. each(d, t) MEETS each child
// with t, and a meet cannot select: each($.lines, _.amount) asks for a
// child that is simultaneously the whole record and one of its fields,
// which is why every spelling of it answers no_path.
//
// A CHILD MISSING THE KEY IS AN ERROR, not a silently shorter list.
// Skipping would make sum(pick(...)) quietly total the wrong set of
// records -- the failure mode an aggregate exists to prevent.
func project(ctx *Ctx, f *FuncVal, base []string, data, key Val) Val {
	if !isBag(data) {
		return makeNilErrFull(ctx, "aggregate_data", f, nil, "pick", nil)
	}

	// The key is a STRING for a map child and the decimal spelling of an
	// index for a list child -- the same rule a reference segment
	// follows, so pick(d, 0) and $.d.0.x agree about what 0 names.
	name := ""
	if sv, ok := key.(*ScalarVal); ok {
		switch sv.kind {
		case KindString:
			name = sv.peg.(string)
		case KindInteger:
			name = strconv.FormatInt(sv.peg.(int64), 10)
		}
	}
	if "" == name {
		return makeNilErrFull(ctx, "invalid-arg", f, nil, "pick", nil)
	}

	peg := []Val{}
	for _, child := range bagChildren(data) {
		var got Val
		switch c := child.(type) {
		case *MapVal:
			got = c.peg[name]
		case *ListVal:
			if i, err := strconv.Atoi(name); nil == err &&
				0 <= i && i < len(c.peg) {
				got = c.peg[i]
			}
		}
		if nil == got {
			return makeNilErrFull(ctx, "pick_key", f, nil, "pick",
				map[string]string{"key": name})
		}
		peg = append(peg,
			clonePath(got, cp(append(base, strconv.Itoa(len(peg))))))
	}

	out := newList(peg)
	out.path = cp(base)
	return out
}
