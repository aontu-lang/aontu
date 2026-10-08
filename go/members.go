/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "sort"

type member struct {
	key string
	val Val
}

func bagMembers(bag Val, ctx *Ctx) []member {
	lifted := bag.markedHide() || bag.markedType()
	if m, ok := bag.(*MapVal); ok {
		keys := append([]string(nil), m.keys...)
		sort.Strings(keys)
		out := make([]member, 0, len(keys))
		for _, k := range keys {
			v := m.peg[k]
			if (!lifted && (v.markedHide() || v.markedType())) || m.isAliasKey(k) {
				continue
			}
			if m.isOptional(k) && !filledMember(v, ctx) {
				continue
			}
			out = append(out, member{key: k, val: v})
		}
		return out
	}
	// Every caller passes a bag: the verbs test isBag first, and filter
	// and pack switch on the type before asking.
	l := bag.(*ListVal)
	out := make([]member, 0, len(l.peg))
	for i, v := range l.peg {
		if !lifted && (v.markedHide() || v.markedType()) {
			continue
		}
		out = append(out, member{key: itoa(i), val: v})
	}
	return out
}

func filledMember(v Val, ctx *Ctx) bool {
	if !genable(v) {
		return false
	}
	ctx.trialsOf()
	c2 := *ctx
	c2.err = nil
	c2.collect = true
	// Generation in collect mode records its failures on the context
	// and answers nil, so a subtree that cannot generate arrives here
	// as no value (the emittedMembers shape).
	cv, err := v.Gen(&c2)
	if nil != err || nil == cv {
		return nil == err && gensNull(ctx, v)
	}
	return !isEmptyGen(cv)
}

// memberVals is the member values alone, for the verbs that do not
// need the keys.
func memberVals(bag Val, ctx *Ctx) []Val {
	ms := bagMembers(bag, ctx)
	out := make([]Val, 0, len(ms))
	for _, m := range ms {
		out = append(out, m.val)
	}
	return out
}
