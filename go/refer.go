/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strconv"
	"strings"
)


type Address struct {
	// Absolute is anchored at the document root rather than at the
	// link's own position.
	Absolute bool
	// Up counts the parent steps of a relative address (`..a` is one).
	Up int
	// Parts are the written segments, below the anchor.
	Parts []string
}

// addrSegmentOK is the grammar of a path segment: a map key or a list
// index, the same characters the published grammar's `segment` rule
// allows. A leading digit is legitimate, because a list index is one.
func addrSegmentOK(s string) bool {
	if "" == s {
		return false
	}
	for _, r := range s {
		switch {
		case 'a' <= r && r <= 'z':
		case 'A' <= r && r <= 'Z':
		case '0' <= r && r <= '9':
		case '_' == r || '-' == r:
		default:
			return false
		}
	}
	return true
}

func prefixMeet(a, b string) (string, bool) {
	pa, aok := parseAddress(a)
	pb, bok := parseAddress(b)
	if !aok || !bok { //coverage:ignore pegs are pre-validated by the capture
		return "", false
	}
	if pa.Absolute != pb.Absolute || pa.Up != pb.Up {
		return "", false
	}
	short, long, out := pa, pb, b
	if len(pb.Parts) < len(pa.Parts) {
		short, long, out = pb, pa, a
	}
	for i := range short.Parts {
		if short.Parts[i] != long.Parts[i] {
			return "", false
		}
	}
	return out, true
}

func textAddress(s string) string {
	if strings.HasPrefix(s, "$") || strings.HasPrefix(s, ".") {
		return s
	}
	return "." + s
}

func parseAddress(s string) (Address, bool) {
	if "$" == s {
		// The whole document is not a relation's target: an address must
		// name something with a position to be written back into.
		return Address{}, false
	}
	if strings.HasPrefix(s, "$.") {
		parts := strings.Split(s[2:], ".")
		for _, seg := range parts {
			if !addrSegmentOK(seg) {
				return Address{}, false
			}
		}
		return Address{Absolute: true, Parts: parts}, true
	}
	if !strings.HasPrefix(s, ".") {
		return Address{}, false
	}
	// A relative address: the leading dot anchors it at the sibling
	// scope, and every FURTHER leading dot is one step up from there --
	// the same reduction a relative reference's `.` segments perform.
	up := 0
	rest := s[1:]
	for strings.HasPrefix(rest, ".") {
		up++
		rest = rest[1:]
	}
	if "" == rest {
		return Address{}, false
	}
	parts := strings.Split(rest, ".")
	for _, seg := range parts {
		if !addrSegmentOK(seg) {
			return Address{}, false
		}
	}
	return Address{Absolute: false, Up: up, Parts: parts}, true
}

func addressPath(addr Address, at []string) ([]string, bool) {
	if addr.Absolute {
		return addr.Parts, true
	}
	// The SIBLING scope: drop the link's own key, then take the parent
	// steps. A link at `$.a.b.dep` spelling `.other` means `$.a.b.other`.
	cut := len(at) - 1 - addr.Up
	if 0 > cut {
		return nil, false
	}
	out := make([]string, 0, cut+len(addr.Parts))
	out = append(out, at[:cut]...)
	out = append(out, addr.Parts...)
	return out, true
}

// nodeSite is where an address lands: the value, and the bag slot
// holding it, so the flow can write back.
type nodeSite struct {
	parent Val
	key    string
	val    Val
}

func findAt(root Val, path []string) (nodeSite, bool) {
	if nil == root || 0 == len(path) {
		return nodeSite{}, false
	}
	site := nodeSite{val: root}
	for _, seg := range path {
		var next Val
		switch n := site.val.(type) {
		case *MapVal:
			next = n.peg[seg]
		case *ListVal:
			if i, err := strconv.Atoi(seg); nil == err && 0 <= i && i < len(n.peg) {
				next = n.peg[i]
			}
		}
		if nil == next {
			return nodeSite{}, false
		}
		site = nodeSite{parent: site.val, key: seg, val: next}
	}
	return site, true
}

type ReferVal struct {
	base
	// tval is the type to flow into the target; nil when `refer()` was
	// written with no argument.
	tval Val
	// addr is the address, once a string has been met; addrsrc is that
	// string as written, for canon and for the error message.
	addr    *Address
	addrsrc string
	// held carries constraints met while the address was still pending
	// — a kind, a regex, a preference. They meet the LINK once there is
	// one.
	held Val
	// relpred is the PREDICATE for a rel()-minted residual: the rel
	// field's key, stamped onto the produced link. Empty for refer().
	relpred string
	// The codes this residual refuses with: refer() keeps its own, a
	// rel()-minted residual carries rel_address/rel_unresolved.
	addrCode, unresolvedCode string
}

func newRefer(tval Val) *ReferVal {
	r := &ReferVal{tval: tval,
		addrCode: "refer_address", unresolvedCode: "refer_unresolved"}
	r.site.sp = unsited
	return r
}

func (r *ReferVal) cjo() int { return 120000 }

func (r *ReferVal) superior() Val { return top() }

func (r *ReferVal) Canon() string {
	t := ""
	if nil != r.tval && !isTop(r.tval) {
		t = r.tval.Canon()
	}
	call := "refer(" + t + ")"
	if nil != r.held {
		call += "&" + r.held.Canon()
	}
	if "" == r.addrsrc {
		return call
	}
	return call + "&path(" + r.addrsrc + ")"
}

func (r *ReferVal) Gen(ctx *Ctx) (any, error) {
	return nil, nil
}

func (r *ReferVal) Unify(peer Val, ctx *Ctx) Val {
	// Another `refer` at the same position: one constraint, both types.
	if pr, ok := peer.(*ReferVal); ok {
		out := r.reshape()
		switch {
		case nil == r.tval:
			out.tval = pr.tval
		case nil == pr.tval:
			out.tval = r.tval
		default:
			out.tval = unite(ctx, r.tval, pr.tval)
		}
		if nil == r.addr {
			out.addr, out.addrsrc = pr.addr, pr.addrsrc
		}
		switch {
		case nil == r.held:
			out.held = pr.held
		case nil == pr.held:
			out.held = r.held
		default:
			out.held = unite(ctx, r.held, pr.held)
		}
		return out.settle(ctx, r)
	}

	if nil == peer || isTop(peer) {
		return r.settle(ctx, r)
	}
	if peer.Nil() {
		return peer
	}

	sv, isscalar := peer.(*ScalarVal)

	if nil == r.addr && isscalar && KindPath == sv.kind {
		str, _ := sv.peg.(string)
		addr, _ := parseAddress(str)
		out := r.reshape()
		out.addr, out.addrsrc = &addr, str
		out.site.sp, out.site.spu, out.site.url = sv.site.sp, sv.site.spu, sv.site.url
		return out.settle(ctx, peer)
	}

	if nil != r.addr && isscalar && KindPath == sv.kind {
		merged, mok := prefixMeet(r.addrsrc, sv.peg.(string))
		if !mok {
			return makeNilErr(ctx, "scalar_value", r, peer)
		}
		addr, _ := parseAddress(merged)
		out := r.reshape()
		out.addr, out.addrsrc = &addr, merged
		return out.settle(ctx, peer)
	}

	_, ismap := peer.(*MapVal)
	_, islist := peer.(*ListVal)
	if (isscalar && KindPath != sv.kind) ||
		ismap || islist {
		return makeNilErrFull(ctx, r.addrCode, r, peer, "refer", nil)
	}

	// A residual never HOLDS an unresolved call: the call drives, and
	// the residual meets what it becomes. Held-as-written would freeze
	// a `refer()` of its own into the canon, twice over. Mirrors
	// ReferVal.unify in ts/src/val/ReferFuncVal.ts.
	if isFunc(peer) {
		return peer.Unify(r, ctx)
	}

	out := r.reshape()
	if nil == r.held {
		out.held = peer
	} else {
		out.held = unite(ctx, r.held, peer)
	}
	return out.settle(ctx, r)
}

// reshape is the residual copied for one more constraint: every arm
// above answers a NEW ReferVal rather than mutating this one, because a
// spread template's residual is shared by every child it is applied to.
func (r *ReferVal) reshape() *ReferVal {
	out := *r
	out.path = cp(r.path)
	out.notdone()
	return &out
}

// settle answers the address if the evaluation can, and stays pending
// if it cannot YET. site is the value whose position the resolved
// string should take.
func (r *ReferVal) settle(ctx *Ctx, site Val) Val {
	if nil == r.addr {
		r.dc = DONE
		return r
	}

	// The address is a TREE PATH, resolved from the link's own position
	// for a relative one. A climb off the top of the tree can never be
	// repaired by a later pass, so it refuses at once.
	target, tok := addressPath(*r.addr, r.path)
	if !tok {
		return makeNilErrFull(ctx, r.unresolvedCode, r, nil, "refer",
			map[string]string{"addr": r.addrsrc})
	}
	found, ok := findAt(ctx.root, target)
	if !ok {
		maxcc := ctx.budgetPasses
		if 0 == maxcc {
			maxcc = 9
		}
		if ctx.cc+1 >= maxcc {
			return makeNilErrFull(ctx, r.unresolvedCode, r, nil, "refer",
				map[string]string{"addr": r.addrsrc})
		}
		r.dc = 0
		return r
	}

	if nil == ctx.referflow {
		ctx.referflow = map[string]bool{}
	}
	guard := strings.Join(target, "\x00")
	if nil != r.tval && !isTop(r.tval) {
		flow := r.tval
		if hasMark(flow) {
			flow = clonePath(flow, cp(flow.vpath()))
			walkMark(flow, true, false, true, false)
		}

		if nil == ctx.referflows {
			ctx.referflows = map[string]Val{}
		}
		if prev, seen := ctx.referflows[guard]; seen {
			ctx.referflows[guard] = unite(ctx, prev, flow)
		} else {
			ctx.referflows[guard] = flow
		}

		if !ctx.referflow[guard] {
			if bad := func() Val {
				ctx.referflow[guard] = true
				defer delete(ctx.referflow, guard)

				merged := unite(ctx, found.val, flow)
				if merged.Nil() {
					return merged
				}
				if !ctx.trial {
					switch p := found.parent.(type) {
					case *MapVal:
						p.set(found.key, merged)
					case *ListVal:
						if i, err := strconv.Atoi(found.key); nil == err {
							p.peg[i] = merged
						}
					}
				}
				return nil
			}(); nil != bad {
				return bad
			}
		}
	}

	out := newPath(r.addrsrc)
	copyMarks(out, r)
	out.setLinkAddr("$." + strings.Join(target, "."))
	out.relkey = r.relpred
	out.site.sp, out.site.spu, out.site.url = site.pos(), site.posu(), site.srcurl()
	out.path = cp(r.path)
	if nil == r.held {
		return out
	}
	return unite(ctx, out, r.held)
}

type RelVal struct {
	base
	tval Val
	held Val
}

func newRel(tval Val) *RelVal {
	r := &RelVal{tval: tval}
	r.site.sp = unsited
	r.dc = DONE
	return r
}

func (r *RelVal) cjo() int      { return 45000 }
func (r *RelVal) superior() Val { return top() }

func (r *RelVal) Canon() string {
	t := ""
	if nil != r.tval && !isTop(r.tval) {
		t = r.tval.Canon()
	}
	out := "rel(" + t + ")"
	if nil != r.held {
		out += "&" + r.held.Canon()
	}
	return out
}

func (r *RelVal) Gen(ctx *Ctx) (any, error) {
	// Silent, as every residual is: an unmet rel under an optional key
	// drops with it, and a required one is an ordinary unresolved
	// constraint.
	return nil, nil
}

func (r *RelVal) fieldkey() string {
	if 0 == len(r.path) {
		return ""
	}
	seg := r.path[len(r.path)-1]
	if !predicateNameOK(seg) {
		return ""
	}
	return seg
}

func (r *RelVal) leafRefer(at []string) *ReferVal {
	rv := newRefer(r.tval)
	rv.addrCode = "rel_address"
	rv.unresolvedCode = "rel_unresolved"
	rv.relpred = r.fieldkey()
	rv.site.sp, rv.site.spu, rv.site.url = r.site.sp, r.site.spu, r.site.url
	rv.path = cp(at)
	return rv
}

// rewrite is the container with every string leaf wrapped as a link.
// Nested containers descend; a leaf already STAMPED as a link is left
// alone, which is what makes a second application a no-op.
func (r *RelVal) rewrite(ctx *Ctx, container Val) Val {
	out := clonePath(container, cp(container.vpath()))
	base := ctx.slot
	if nil == base {
		base = container.vpath()
	}
	pending := false
	nested := false
	isContainer := func(v Val) bool {
		switch v.(type) {
		case *MapVal, *ListVal:
			return true
		}
		return false
	}
	switch n := out.(type) {
	case *MapVal:
		for _, k := range n.keys {
			ctx.slot = append(cp(base), k)
			nested = nested || isContainer(n.peg[k])
			cv := r.rewriteChild(ctx, n.peg[k], base)
			n.peg[k] = cv
			pending = pending || DONE != cv.Dc()
		}
	case *ListVal:
		for i, c := range n.peg {
			ctx.slot = append(cp(base), itoa(i))
			nested = nested || isContainer(c)
			cv := r.rewriteChild(ctx, c, base)
			n.peg[i] = cv
			pending = pending || DONE != cv.Dc()
		}
	}
	ctx.slot = base
	if pending {
		out.setDc(0)
	}
	tmpl := func() Val {
		lr := Val(r.leafRefer(base))
		if nil == r.held {
			return lr
		}
		return newConjunct([]Val{lr, r.held})
	}
	if !nested {
		switch n := out.(type) {
		case *MapVal:
			if nil == n.spread {
				n.spread = tmpl()
			}
		case *ListVal:
			if nil == n.spread {
				n.spread = tmpl()
			}
		}
	}
	return out
}

func (r *RelVal) rewriteChild(ctx *Ctx, child Val, at []string) Val {
	// Children here are always Vals: the parse builds Vals, elision
	// builds a NilVal, and clonePath preserved whatever the container
	// held.
	switch child.(type) {
	case *MapVal, *ListVal:
		return r.rewrite(ctx, child)
	}
	leaf := unite(ctx, r.leafRefer(at), child)
	if nil != r.held {
		leaf = unite(ctx, leaf, r.held)
	}
	return leaf
}

func (r *RelVal) Unify(peer Val, ctx *Ctx) Val {
	// Two rel() at one field: one relation, both types.
	if pr, ok := peer.(*RelVal); ok {
		out := newRel(nil)
		switch {
		case nil == r.tval:
			out.tval = pr.tval
		case nil == pr.tval:
			out.tval = r.tval
		default:
			out.tval = unite(ctx, r.tval, pr.tval)
		}
		switch {
		case nil == r.held:
			out.held = pr.held
		case nil == pr.held:
			out.held = r.held
		default:
			out.held = unite(ctx, r.held, pr.held)
		}
		copyMarks(out, r)
		out.site.sp, out.site.spu, out.site.url = r.site.sp, r.site.spu, r.site.url
		out.path = cp(r.path)
		return out
	}


	if sv, ok := peer.(*ScalarVal); ok {
		if KindPath == sv.kind {
			at := ctx.slot
			if nil == at {
				at = r.path
			}
			out := unite(ctx, Val(r.leafRefer(at)), peer)
			if nil == r.held {
				return out
			}
			return unite(ctx, out, r.held)
		}
		// A scalar that can never be an address.
		return makeNilErrFull(ctx, "rel_address", r, peer, "refer", nil)
	}

	// A SET OF LINKS: list or map, rewritten leaf by leaf; the held
	// constraints ride into each leaf inside the rewrite.
	switch peer.(type) {
	case *MapVal, *ListVal:
		return r.rewrite(ctx, peer)
	}

	// Everything else -- a reference still resolving, a kind, a
	// container constraint -- waits for the value, as refer's held
	// does.
	out := newRel(r.tval)
	if nil == r.held {
		out.held = peer
	} else {
		out.held = unite(ctx, r.held, peer)
	}
	copyMarks(out, r)
	out.site.sp, out.site.spu, out.site.url = r.site.sp, r.site.spu, r.site.url
	out.path = cp(r.path)
	return out
}
