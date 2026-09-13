/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "strconv"

// The kinds a profile's lowering spells. The fragment algebra's own
// kinds are not here: a component tree states a line directly.
var declKinds = map[string]bool{
	"record": true, "enum": true, "alias": true, "const": true, "func": true,
}

// lineNode is one lowered piece as a Line node. A string is a line at
// depth 0, a `blank` is its terminator alone, and an empty span takes
// no pad -- the fold's rule, kept so the bytes are the unit road's.
func lineNode(piece any, profile map[string]any) *MapVal {
	text := ""
	at := 0

	switch p := piece.(type) {
	case string:
		text = p
	case map[string]any:
		if "line" == p["k"] {
			if n, ok := p["n"].([]any); ok && 0 < len(n) {
				text, _ = n[0].(string)
			}
			if a, ok := p["at"].(int64); ok {
				at = int(a)
			}
		}
	}

	props := newMap()
	props.set("src", newString(text))
	if "" != text && 0 < at {
		props.set("indent", newString(renderPad(profile, at)))
	}
	props.closed = true

	return cmpNode("Line", props, newList([]Val{}))
}

func lossNode(loss RenderLoss) *MapVal {
	node := newMap()
	node.set("tier", newInteger(int64(loss.Tier)))
	node.set("construct", newString(loss.Construct))
	node.set("path", newString(loss.Path))
	node.set("reason", newString(loss.Reason))
	node.closed = true
	return node
}

// lowerDeclsFunc is `lowerdecls` and, with loss set, `lowerloss`: the
// declaration lowering as a call, answering Line nodes or the report
// of what the target could not carry.
func lowerDeclsFunc(ctx *Ctx, f *FuncVal, args []Val, loss bool) Val {
	if len(args) < 2 { //coverage:ignore arity {2,2} is refused at parse
		return makeNilErr(ctx, "invalid-arg", f, nil)
	}

	declsVal, isList := args[0].(*ListVal)
	if !isList {
		return makeNilErrFull(ctx, "invalid-arg", f, args[0], "decls", nil)
	}
	profileVal, isMap := args[1].(*MapVal)
	if !isMap {
		return makeNilErrFull(ctx, "invalid-arg", f, args[1], "profile", nil)
	}

	profileAny, perr := profileVal.Gen(ctx)
	if nil != perr { //coverage:ignore a staged func sees settled args; a value that cannot generate raised its own error at unification
		return makeNilErrFull(ctx, "invalid-arg", f, args[1], "profile", nil)
	}
	profile, _ := profileAny.(map[string]any)
	family := lowerStr(profile, "lowering")
	if "typescript" != family && "go" != family {
		return makeNilErrFull(ctx, "invalid-arg", f, args[1], "profile", nil)
	}

	declsAny, derr := declsVal.Gen(ctx)
	if nil != derr { //coverage:ignore unreachable for the reason the profile's Gen is
		return makeNilErrFull(ctx, "invalid-arg", f, args[0], "decls", nil)
	}
	list, _ := declsAny.([]any)
	decls := make([]map[string]any, 0, len(list))
	for _, d := range list {
		decl, ok := d.(map[string]any)
		if !ok || !declKinds[lowerStr(decl, "k")] {
			return makeNilErrFull(ctx, "invalid-arg", f, args[0], "decls", nil)
		}
		decls = append(decls, decl)
	}

	lossy := []RenderLoss{}
	lctx := &lowerCtx{
		profile: profile,
		family:  family,
		unit:    lowerStr(profile, "lang"),
		lossy:   &lossy,
	}

	out := []Val{}
	for i, decl := range decls {
		// One blank line between declarations, and none before the
		// first: the separation `aontu render` writes.
		if 0 < i && !loss {
			out = append(out, lineNode("", profile))
		}
		for _, piece := range lowerDecl(decl, "$."+strconv.Itoa(i), lctx) {
			if !loss {
				out = append(out, lineNode(piece, profile))
			}
		}
	}

	if loss {
		report := make([]Val, 0, len(lossy))
		for _, l := range lossy {
			report = append(report, lossNode(l))
		}
		return newList(report)
	}

	return newList(out)
}
