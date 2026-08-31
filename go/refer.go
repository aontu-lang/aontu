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

// Address is a TREE PATH, in the two spellings a reference uses:
// `$.services.auth` from the document root, `.auth` from the link's own
// sibling scope. The tree is the only namespace (ADR-014) -- which is
// what makes a model instantiable more than once, each instance
// resolving its relative links inside itself. Mirrors Address in
// ts/src/val/ReferFuncVal.ts.
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

// parseAddress is the address a string spells, or ok=false when it does
// not spell one. Mirrors parseAddress in ts/src/val/ReferFuncVal.ts.
// prefixMeet is the LONGER of two addresses when one spells a prefix
// of the other (ADR-016): same anchor -- absolute or the same number
// of parent steps -- and the shorter's segments open the longer's.
// The meet of two path values, and of a refer's address with a later
// path peer. Not-ok when the two are incomparable, which refuses as
// any two unequal scalars do. Mirrors prefixMeet in
// ts/src/val/PathVal.ts.
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

// textAddress is the spelling string TEXT converts by, inside a
// `path(...)` call: text that carries no anchor is RELATIVE ("a.b" is
// the address ".a.b"), matching the raw form. Only the anchor is
// supplied -- the result still has to parse, so malformed text ("",
// "a..b", a bad "$" spelling) refuses as before. Mirrors textAddress
// in ts/src/val/PathVal.ts.
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

// addressPath is the tree path an address resolves to from `at` -- the
// position of the link itself -- or ok=false when a relative address
// climbs off the top of the tree. Mirrors addressPath in
// ts/src/val/ReferFuncVal.ts.
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

// findAt is the node a tree path names, or ok=false when the evaluation
// does not (yet) have one. Pending is not failure: the target may be
// introduced by a later conjunct, include or spread. Mirrors findAt in
// ts/src/val/ReferFuncVal.ts.
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
// AFTER the plain values (base 99999), BEFORE the sizing atoms
// (150000): sibling path values fold together first under the prefix
// rule, and the residual then meets ONE merged address. Mirrors
// ReferVal.cjo in ts/src/val/ReferFuncVal.ts.
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
	// The address renders as the path call: a bare string address no
	// longer reparses (ADR-016), and canon must.
	return call + "&path(" + r.addrsrc + ")"
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

	// A PATH VALUE is the ADDRESS, when there is not one yet. Only a
	// path value can be one (ADR-016): a bare string is never a path
	// -- `path("...")` is the one string conversion, and it happens at
	// the call, not here. The peg is pre-validated by the capture, so
	// no parse can fail.
	if nil == r.addr && isscalar && KindPath == sv.kind {
		str, _ := sv.peg.(string)
		addr, _ := parseAddress(str)
		out := r.reshape()
		out.addr, out.addrsrc = &addr, str
		out.sp, out.spu, out.surl = sv.sp, sv.spu, sv.surl
		return out.settle(ctx, peer)
	}

	// A SECOND path peer refines the address by the prefix rule: the
	// longer of the two when one opens the other, exactly as two path
	// values meet on their own. Two incomparable addresses are the
	// same conflict two unequal scalars are.
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

	// A value that can never BE a string cannot constrain one either,
	// and no later pass can repair it — so this arm refuses rather than
	// defers. A KIND or a constraint is not in it: `string`,
	// `re("^svc_")` and the like are perfectly good constraints on an
	// address, and are held below until there is one to apply them to.
	_, ismap := peer.(*MapVal)
	_, islist := peer.(*ListVal)
	if (isscalar && KindPath != sv.kind) ||
		ismap || islist {
		return makeNilErrFull(ctx, r.addrCode, r, peer, "refer", nil)
	}

	// HELD: everything else waits for the address. Carried on the
	// residual rather than parked in a conjunct, because a conjunct
	// rebuilt every pass grows a level every pass; the held constraint
	// meets the link the moment the address resolves, so
	// `refer() & re("a") & re("b") & path($.z)` still applies both and
	// `refer() & string & path($.z)` still passes.
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

	// THE FLOW. `t` is unified into the target and written back at the
	// target's own position — one position, because the tree is the
	// namespace and a path names exactly one node.
	//
	// RE-ENTRANT ONLY ONCE PER TARGET (use-cases/BUGS.md §19). Uniting
	// the target drives the target's OWN subtree, and if the target
	// links back — `a` typed-refers `b`, `b` typed-refers `a`, the
	// shape every inverse pair has — that drives this target again, and
	// the two flow into each other until the depth budget or the host
	// stack ends it. `unify_cycle` on a model whose meet plainly
	// converges. A flow that would re-enter a node is SKIPPED, not
	// failed: the outer flow it is nested in is already uniting that
	// node, so the same information arrives by the same channel one
	// frame up. Mirrors the guard in ts/src/val/ReferFuncVal.ts.
	if nil == ctx.referflow {
		ctx.referflow = map[string]bool{}
	}
	guard := strings.Join(target, "\x00")
	// Released at the END OF THE FLOW, not at the end of settle — a
	// plain `defer` in this function would hold the target marked while
	// the tail below builds the link value and meets `held`, where
	// TypeScript's try/finally has already released it. A closure gives
	// `defer` the block scope, arm for arm (ADR-001).
	if nil != r.tval && !isTop(r.tval) && !ctx.referflow[guard] {
		if bad := func() Val {
			ctx.referflow[guard] = true
			defer delete(ctx.referflow, guard)

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
			// The write into THIS pass's view, so the rest of the pass
			// sees it. findAt refuses the empty path, so a resolved
			// target always has a parent holding it.
			switch p := found.parent.(type) {
			case *MapVal:
				p.set(found.key, merged)
			case *ListVal:
				if i, err := strconv.Atoi(found.key); nil == err {
					p.peg[i] = merged
				}
			}
			// ... and the RECORD, keyed by the target's path, replayed
			// onto every later pass by applyFlows in go/unify.go. A pass
			// rebuilds subtrees, so the write above does not survive one
			// when the link sits inside its own target or two nodes link
			// at each other; the record is what makes the flow reach the
			// result rather than the tree it was computed from.
			if nil == ctx.referflows {
				ctx.referflows = map[string]Val{}
			}
			if prev, seen := ctx.referflows[guard]; seen {
				ctx.referflows[guard] = unite(ctx, prev, flow)
			} else {
				ctx.referflows[guard] = flow
			}
			return nil
		}(); nil != bad {
			return bad
		}
	}

	// The value IS the address, as a PATH VALUE (ADR-016): a link, not
	// an embedding -- and re-stating or refining the address still
	// meets it, which a string link could not do under the strict
	// rules.
	out := newPath(r.addrsrc)
	copyMarks(out, r)
	// STAMPED as a link (G4 phase 3): the value is the address string,
	// so without this nothing downstream could tell a checked link from
	// a literal that happens to look like one. The edge set is exactly
	// the set of these stamps. A rel()-minted link also carries its
	// PREDICATE (see base.relkey).
	// The stamp is the RESOLVED path, not the written one: a relative
	// address means a different node from each position it is written
	// at, and an edge set whose far ends were spellings rather than
	// nodes could not be traversed. The VALUE stays what the author
	// wrote --- the link is what it says, the edge is where it goes.
	out.setLinkAddr("$." + strings.Join(target, "."))
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
	if !predicateNameOK(seg) {
		return ""
	}
	return seg
}

// leafRefer is one leaf's residual: the refer machinery carrying rel's
// codes, predicate and type.
// One leaf's residual: the refer machinery carrying rel's codes,
// predicate and type.
//
// `at` is the FIELD the rel() is being applied at, which is not always
// the field it was WRITTEN at: a schema's rel() is instantiated per
// destination by the spread machinery, and a relative address must be
// read from the destination. TypeScript gets this from the residual's
// own path, its clone being re-pathed per destination; this port's
// RelVal keeps the schema's path, so the driving position is passed in
// instead. Same answer, arm for arm (ADR-001).
func (r *RelVal) leafRefer(at []string) *ReferVal {
	rv := newRefer(r.tval)
	rv.addrCode = "rel_address"
	rv.unresolvedCode = "rel_unresolved"
	rv.relpred = r.fieldkey()
	rv.sp, rv.spu, rv.surl = r.sp, r.spu, r.surl
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
	// The rewrite holds its PENDING leaves open (an address whose
	// entity a later statement declares), so the pass loop keeps
	// driving the container until every link settles. A rewrite that
	// minted NOTHING pending -- every leaf already linked or settled
	// in place -- keeps the clone's doneness: re-applying a template
	// over a settled value must converge in the same pass, or the
	// enclosing bags reopen forever (the service catalog, where the
	// entity merge drops the spread stamp each pass).
	if pending {
		out.setDc(0)
	}
	// Elements that arrive AFTER this rewrite -- another statement of
	// the list, a patch position of the entity -- must convert too, so
	// the rewrite installs its own leaf constraint as the container's
	// ELEMENT SPREAD, exactly the machinery the old per-element
	// `[&: refer()]` idiom used. Only on a FLAT address container (a
	// labelled map's sub-containers get their own spread from the
	// recursion above; a leaf template meeting a map child would
	// refuse it), and only where no spread already stands: a schema's
	// own template is not this rewrite's to clobber.
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
	// No already-stamped-leaf short-circuit: this port's clones do not
	// carry the link stamp, so a copied leaf arrives plain, re-resolves
	// through leafRefer and re-stamps identically (rel-over-linked-copy
	// pins the outcome and the graph agreeing with TS, where clones DO
	// carry the stamp and the short-circuit lives).
	leaf := unite(ctx, r.leafRefer(at), child)
	// The held constraints apply PER LEAF: a re() on the relation
	// constrains every address, never the container that holds them
	// (found by the service catalog, whose re("^svc_") met the whole
	// list and refused it).
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
		out.sp, out.spu, out.surl = r.sp, r.spu, r.surl
		out.path = cp(r.path)
		return out
	}

	// No nil-peer/top/Nil arms: uniteRaw's dispatch ladder absorbs
	// those peers before any Val's own Unify is consulted, and unite
	// is the only entrance -- the container hand-offs pass the
	// container itself.

	if sv, ok := peer.(*ScalarVal); ok {
		// ONE ADDRESS: the scalar-valued field, refer's own shape. The
		// field IS the position here (there is no container to descend
		// into), so the driving slot is the base a relative address
		// reads from -- falling back to the written path when the meet
		// carries no slot.
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
	out.sp, out.spu, out.surl = r.sp, r.spu, r.surl
	out.path = cp(r.path)
	return out
}
