/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "strconv"

// atFunc is at(d, ...k). Twin of ts/src/val/AtFuncVal.ts.
func atFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	if refused := restRefuse(ctx, f, args); nil != refused {
		return refused
	}

	node := args[0]
	for _, key := range args[1:] {
		node = atStep(throughWrap(node), key.(*ScalarVal))
		if nil == node {
			return makeNilErr(ctx, "no_path", f, nil)
		}
	}

	out := clonePath(node, cp(base))
	fixSeals(out)
	return liftCopy(out, node.markedType())
}

// A list counts a negative integer from its end, which a path step does not.
func atStep(node Val, key *ScalarVal) Val {
	part := ""
	if KindString == key.kind {
		part = key.peg.(string)
	} else {
		at := key.peg.(int64)
		if l, ok := node.(*ListVal); ok && at < 0 {
			at += int64(len(l.peg))
		}
		part = strconv.FormatInt(at, 10)
	}
	switch n := node.(type) {
	case *MapVal:
		return n.peg[part]
	case *ListVal:
		if idx, ok := listIndex(part); ok && idx < len(n.peg) {
			return n.peg[idx]
		}
	}
	return nil
}
