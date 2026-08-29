/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strconv"
	"strings"
)

// CHECKED, TYPED, LINK-SHAPED REFERENCES (G4 phase 2,
// docs/capability-review/g4-identity-relations.md, and the Go side of
// ts/src/val/ReferFuncVal.ts): `refer(t)` is a constraint on a
// string-valued field. The string must be an ENTITY ADDRESS, the
// addressed node must exist in the evaluation, and — when `t` is given
// — `t` is unified INTO the target. The field's own value stays the
// address string: a LINK, not an embedding.
//
// This is the piece a plain reference cannot be. `$.a.b` resolves by
// CLONING its target into place, so `dependsOn: [$.services.auth]`
// generates a full copy of the auth node where the author meant a
// name. `refer` leaves the name and checks it.

// Address is an entity name and, optionally, a path INSIDE that
// entity: `svc_auth` or `svc_auth.ports.http`. The two addressing
// schemes reconciled — `$.a.b` answers WHERE, an address answers WHAT,
// and beneath entity granularity the tree is authoritative again. The
// no-dots rule on ids makes the split unambiguous.
type Address struct {
	Name string
	Path []string
}

// addrSegmentOK is the grammar of a path segment inside an entity: the
// same characters the published grammar's `segment` rule allows.
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

// parseAddress is the address a string spells, or ok=false when it does
// not spell one. Mirrors parseAddress in ts/src/val/ReferFuncVal.ts.
func parseAddress(s string) (Address, bool) {
	parts := strings.Split(s, ".")
	if !idNameOK(parts[0]) {
		return Address{}, false
	}
	for _, seg := range parts[1:] {
		if !addrSegmentOK(seg) {
			return Address{}, false
		}
	}
	return Address{Name: parts[0], Path: parts[1:]}, true
}

// entitySite is where an address lands: the value, and the bag slot
// holding it when the address reaches inside the entity (so the flow
// can write back).
type entitySite struct {
	parent Val
	key    string
	val    Val
}

// findEntity is the value an address names, or ok=false when the
// evaluation does not (yet) have one. Pending is not failure: an entity
// may be declared by a later conjunct, include or spread.
func findEntity(ctx *Ctx, addr Address) (entitySite, bool) {
	rep, ok := ctx.entities[addr.Name]
	if !ok || nil == rep {
		return entitySite{}, false
	}
	site := entitySite{val: rep}
	for _, seg := range addr.Path {
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
			return entitySite{}, false
		}
		site = entitySite{parent: site.val, key: seg, val: next}
	}
	return site, true
}

// ReferVal is what `refer(t)` RESOLVES to: the residual constraint,
// carrying the type to flow and — once it has met a string — the
// address to flow it into. A separate value from the function for the
// reason every residual is: the function is written once and the
// constraint is met many times, and only the constraint has state worth
// carrying. Mirrors ReferVal in ts/src/val/ReferFuncVal.ts.
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
	r.sp = unsited
	return r
}

// LAST in a conjunct fold, as the sizing atoms are: a refer has to see
// the string it constrains, and the string is what the other terms
// produce.
func (r *ReferVal) cjo() int { return 45000 }

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
	return call + "&" + jsonString(r.addrsrc)
}

func (r *ReferVal) Gen(ctx *Ctx) (any, error) {
	// Silent, as every residual is: the enclosing bag reports a value
	// that never became concrete. A refer that has an ADDRESS and
	// cannot resolve it has already refused during unification (see
	// settle), so what reaches here is a `refer()` nothing ever met — an
	// ordinary unresolved constraint, like a bare `min(1)`.
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

	// A STRING is the ADDRESS, when there is not one yet. It is the
	// only thing that can be: a link's value is its address.
	if nil == r.addr && isscalar && KindString == sv.kind {
		str, _ := sv.peg.(string)
		addr, aok := parseAddress(str)
		if !aok {
			return makeNilErrFull(ctx, r.addrCode, r, peer, "refer",
				map[string]string{"addr": str})
		}
		out := r.reshape()
		out.addr, out.addrsrc = &addr, str
		out.sp, out.spu, out.surl = sv.sp, sv.spu, sv.surl
		return out.settle(ctx, peer)
	}

	// A value that can never BE a string cannot constrain one either,
	// and no later pass can repair it — so this arm refuses rather than
	// defers. A KIND or a constraint is not in it: `string`,
	// `re("^svc_")` and the like are perfectly good constraints on an
	// address, and are held below until there is one to apply them to.
	_, ismap := peer.(*MapVal)
	_, islist := peer.(*ListVal)
	if (isscalar && KindString != sv.kind) || ismap || islist {
		return makeNilErrFull(ctx, r.addrCode, r, peer, "refer", nil)
	}

	// HELD: everything else waits for the address. Carried on the
	// residual rather than parked in a conjunct, because a conjunct
	// rebuilt every pass grows a level every pass; the held constraint
	// meets the link the moment the address resolves, so
	// `refer() & "x" & "y"` still conflicts and `refer() & string & "x"`
	// still passes.
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
		// NOT DONE, unlike `string` or `min(1)`. A refer without an
		// address has not done its work — it exists to check one — and
		// the pass loop must keep offering it the chance. The cost is
		// that a SCHEMA mentioning a link never resolves either, so
		// `type({from: refer($.std.Port)})` is not expressible today;
		// G4 phase 4 records why, and what it would take.
		r.notdone()
		return r
	}

	found, ok := findEntity(ctx, *r.addr)
	if !ok {
		// PENDING, not failed — until the last pass. Within ONE
		// evaluation the document-set is fixed, so existence IS
		// decidable, and the final pass is where it is decided. A
		// pending refer keeps the tree not-done, so the pass loop always
		// reaches that pass when there is one to decide.
		maxcc := ctx.budgetPasses
		if 0 == maxcc {
			maxcc = 9
		}
		if ctx.cc+1 >= maxcc {
			return makeNilErrFull(ctx, r.unresolvedCode, r, nil, "refer",
				map[string]string{"addr": r.addrsrc})
		}
		r.notdone()
		return r
	}

	// THE FLOW. `t` is unified into the target and written back, so
	// every position of the entity carries it after the pass's identity
	// merge — the same channel the merge itself uses.
	//
	// RE-ENTRANT ONLY ONCE PER ENTITY (use-cases/BUGS.md §19). Uniting
	// the target drives the target's OWN subtree, and if the target
	// links back — `a` typed-refers `b`, `b` typed-refers `a`, the
	// shape every inverse pair has — that drives this entity again, and
	// the two flow into each other until the depth budget or the host
	// stack ends it. `unify_cycle` on a model whose meet plainly
	// converges. A flow that would re-enter an entity is SKIPPED, not
	// failed: the outer flow it is nested in is already uniting that
	// entity, so the same information arrives by the same channel one
	// frame up. Mirrors the guard in ts/src/val/ReferFuncVal.ts.
	if nil == ctx.referflow {
		ctx.referflow = map[string]bool{}
	}
	// Released at the END OF THE FLOW, not at the end of settle — a
	// plain `defer` in this function would hold the entity marked while
	// the tail below builds the link value and meets `held`, where
	// TypeScript's try/finally has already released it. A closure gives
	// `defer` the block scope, arm for arm (ADR-001).
	if nil != r.tval && !isTop(r.tval) && !ctx.referflow[r.addr.Name] {
		if bad := func() Val {
			ctx.referflow[r.addr.Name] = true
			defer delete(ctx.referflow, r.addr.Name)

			// The flowed type is CONCRETE at the target: a schema
			// flowing into a value must not make the value a schema.
			// Same reasoning as a reference's clone clearing marks —
			// `refer($.std.Service)` says the target IS a Service, not
			// that it is the definition of one — and without it the
			// target silently stopped generating. Cloned as well as
			// cleared: `t` is shared by every position that refers to
			// the same thing.
			flow := r.tval
			if hasMark(flow) {
				flow = clonePath(flow, cp(flow.vpath()))
				walkMark(flow, true, false, true, false)
			}
			merged := unite(ctx, found.val, flow)
			if merged.Nil() {
				return merged
			}
			switch p := found.parent.(type) {
			case nil:
				ctx.entities[r.addr.Name] = merged
			case *MapVal:
				p.set(found.key, merged)
			case *ListVal:
				if i, err := strconv.Atoi(found.key); nil == err {
					p.peg[i] = merged
				}
			}
			return nil
		}(); nil != bad {
			return bad
		}
	}

	// The value IS the address string: a link, not an embedding.
	out := newString(r.addrsrc)
	copyMarks(out, r)
	// STAMPED as a link (G4 phase 3): the value is the address string,
	// so without this nothing downstream could tell a checked link from
	// a literal that happens to look like one. The edge set is exactly
	// the set of these stamps. A rel()-minted link also carries its
	// PREDICATE (see base.relkey).
	out.setLinkAddr(r.addrsrc)
	out.relkey = r.relpred
	out.sp, out.spu, out.surl = site.pos(), site.posu(), site.srcurl()
	out.path = cp(r.path)
	if nil == r.held {
		return out
	}
	return unite(ctx, out, r.held)
}

// RelVal is what `rel(t?)` RESOLVES to (RELATIONS.0.md §3.2): the
// relation constraint, sited on the FIELD the way the sizing atoms sit
// on containers. Its value may be one address, a LIST of addresses, or
// a MAP whose string leaves are addresses -- containers are rewritten
// leaf by leaf through the refer machinery, so pending resolution,
// type flow and link stamping are the one battle-tested path, and the
// data side stays plain strings. The PREDICATE of every edge produced
// is the key the rel() sits on -- declared, never inferred. Mirrors
// RelVal in ts/src/val/ReferFuncVal.ts.
type RelVal struct {
	base
	tval Val
	held Val
}

func newRel(tval Val) *RelVal {
	r := &RelVal{tval: tval}
	r.sp = unsited
	// DONE while unmet, deliberately -- the property refer() lacks and
	// G4 phase 4 records the cost of: a type() body holding a rel()
	// must SETTLE, or the schema idiom leaves the type unresolved and
	// every reference to it deferring forever. An unmet rel is its own
	// settled residual, like `min(1)`; the meet re-activates it
	// whenever a value arrives, because map merges build the conjunct
	// regardless.
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

// fieldkey is the predicate: the last segment of the field path the
// constraint is driven at -- when that segment is a D-1 NAME. A
// relation predicate is a declared name (RELATIONS.0.md §3.2), so a
// list index or a key outside the name grammar produces unlabelled
// links, and the graph falls back to its old inference. The D-1 test
// is also what keeps the two ports' edges identical: a list index is
// a string here and a number in TS.
func (r *RelVal) fieldkey() string {
	if 0 == len(r.path) {
		return ""
	}
	seg := r.path[len(r.path)-1]
	if !idNameOK(seg) {
		return ""
	}
	return seg
}

// leafRefer is one leaf's residual: the refer machinery carrying rel's
// codes, predicate and type.
func (r *RelVal) leafRefer() *ReferVal {
	rv := newRefer(r.tval)
	rv.addrCode = "rel_address"
	rv.unresolvedCode = "rel_unresolved"
	rv.relpred = r.fieldkey()
	rv.sp, rv.spu, rv.surl = r.sp, r.spu, r.surl
	rv.path = cp(r.path)
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
	switch n := out.(type) {
	case *MapVal:
		for _, k := range n.keys {
			ctx.slot = append(cp(base), k)
			n.peg[k] = r.rewriteChild(ctx, n.peg[k])
		}
	case *ListVal:
		for i, c := range n.peg {
			ctx.slot = append(cp(base), itoa(i))
			n.peg[i] = r.rewriteChild(ctx, c)
		}
	}
	ctx.slot = base
	// The rewrite holds PENDING leaves (an address whose entity a later
	// statement declares), so the container is NOT done: the pass loop
	// must keep driving it until every link settles.
	out.setDc(0)
	return out
}

func (r *RelVal) rewriteChild(ctx *Ctx, child Val) Val {
	// Children here are always Vals: the parse builds Vals, elision
	// builds a NilVal, and clonePath preserved whatever the container
	// held.
	switch child.(type) {
	case *MapVal, *ListVal:
		return r.rewrite(ctx, child)
	}
	// No already-stamped-leaf short-circuit: this port's clones do not
	// carry the link stamp, so a copied leaf arrives plain, re-resolves
	// through leafRefer and re-stamps identically (rel-over-linked-copy
	// pins the outcome and the graph agreeing with TS, where clones DO
	// carry the stamp and the short-circuit lives).
	return unite(ctx, r.leafRefer(), child)
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
		out.sp, out.spu, out.surl = r.sp, r.spu, r.surl
		out.path = cp(r.path)
		return out
	}

	// No nil-peer/top/Nil arms: uniteRaw's dispatch ladder absorbs
	// those peers before any Val's own Unify is consulted, and unite
	// is the only entrance -- the container hand-offs pass the
	// container itself.

	if sv, ok := peer.(*ScalarVal); ok {
		// ONE ADDRESS: the scalar-valued field, refer's own shape.
		if KindString == sv.kind {
			out := unite(ctx, Val(r.leafRefer()), peer)
			if nil == r.held {
				return out
			}
			return unite(ctx, out, r.held)
		}
		// A scalar that can never be an address.
		return makeNilErrFull(ctx, "rel_address", r, peer, "refer", nil)
	}

	// A SET OF LINKS: list or map, rewritten leaf by leaf.
	switch peer.(type) {
	case *MapVal, *ListVal:
		out := r.rewrite(ctx, peer)
		if nil == r.held {
			return out
		}
		return unite(ctx, out, r.held)
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
	out.sp, out.spu, out.surl = r.sp, r.spu, r.surl
	out.path = cp(r.path)
	return out
}
