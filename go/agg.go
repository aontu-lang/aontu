/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strconv"

// AGGREGATION AND PROJECTION: sum(d), least(d), greatest(d) and
// pick(d, k) (the Go side of ts/src/val/AggFuncVal.ts).
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
