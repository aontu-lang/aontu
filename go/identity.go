/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "sort"

// THE IDENTITY MARK (G4 phase 1,
// docs/capability-review/g4-identity-relations.md): `id(name)` declares
// that the enclosing value is an independent ENTITY named `name`, and
// every node in one evaluation carrying that name is unified with every
// other. The Go side of ts/src/val/IdFuncVal.ts and the mergeEntities
// pass in ts/src/unify.ts.

// idNameOK reports whether s spells an entity name (D-1,
// docs/design/RELATIONS.0.md): a flat identifier,
// /[_a-zA-Z][-_a-zA-Z0-9]*/. No slash — hierarchy belongs in document
// structure and kind fields, never in name punctuation — no leading
// digit or hyphen, and NO DOTS, because a dot separates an entity
// address from a sub-path (G4 phase 2). Written as an explicit loop
// rather than a regexp so the two ports cannot drift on a character
// class.
func idNameOK(s string) bool {
	if "" == s {
		return false
	}
	for i, r := range s {
		switch {
		case 'a' <= r && r <= 'z':
		case 'A' <= r && r <= 'Z':
		case '_' == r:
		case '0' <= r && r <= '9':
			if 0 == i {
				return false
			}
		case '-' == r:
			if 0 == i {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// idName is the name an argument spells, or ok=false when it does not
// spell one. A bare `svc_auth` parses as a string, as does
// `"svc_auth"`; anything else — a number, a map, an unresolved
// reference — is not a name, and saying so at once beats an entity
// nobody can address. Mirrors idName in ts/src/val/IdFuncVal.ts.
func idName(v Val) (string, bool) {
	sv, ok := v.(*ScalarVal)
	if !ok || KindString != sv.kind {
		return "", false
	}
	s, ok := sv.peg.(string)
	if !ok { //coverage:ignore a string-kind scalar always holds a string
		return "", false
	}
	if !idNameOK(s) {
		return "", false
	}
	return s, true
}

// mergeEntities is the IDENTITY MERGE: every node in one evaluation
// carrying the same id is unified with every other. Declaring two nodes
// the same entity MEANS unifying them, so this is not a lookup table —
// it is a meet, and a contradiction between two declarations is an
// ordinary conflict naming both sites.
//
// Run once per fixpoint pass, after the pass's own unification: a
// position picks up the representative, the representative picks up the
// position, and the two converge across passes exactly as chained
// references do, inside the same pass budget.
//
// The tree stays a TREE. Every declared position holds the merged value
// and generation emits it at each path — duplication, as references
// generate today. Identity adds addressing, not a new shape.
//
// COLLECT, then APPLY — the same walk twice, not two walks. A single
// pass merges each position into the representative as it meets it,
// which leaves the positions it already passed holding the pre-merge
// value: `a: id(x) & {k:1}` kept `{k:1}` while `b: id(x) & {j:2}`
// became `{j:2,k:1}`, and the two sites disagreed about what the one
// entity is. The representative is therefore settled over the WHOLE
// tree before any position is written. Mirrors mergeEntities in
// ts/src/unify.ts.
func mergeEntities(ctx *Ctx, root Val) Val {
	if nil == ctx.entities {
		ctx.entities = map[string]Val{}
	}

	// AN ENTITY CANNOT CONTAIN ITSELF. Identity merge unifies every node
	// carrying a name with every other node carrying it, so naming a
	// node AND ITS OWN DESCENDANT the same entity asks for a value that
	// contains itself -- `a: id(x) & {b: id(x)}` makes `a.peg["b"]` the
	// node itself. Both ports used to die building it on the host
	// stack, and Go's `fatal error: stack overflow` is not recoverable,
	// so an embedding server could not defend against a 22-character
	// document (BUGS.md §58).
	//
	// `idBad` maps the DESCENDANT position to the nil it becomes. The
	// collect half fills it -- that is where the cycle would form, so
	// the check runs BEFORE the unite -- and the write half applies it.
	// The descendant carries the refusal because it is the position
	// that cannot stand; the ancestor is the finding's other site.
	ctx.idBad = map[Val]Val{}

	walkEntities(ctx, root, map[Val]bool{}, false, map[string]Val{})

	// NOTHING TO APPLY. The collect half is also the "does this document
	// use identity at all?" answer, so a document that never says `id()`
	// pays for one walk per pass rather than two — and the writing half
	// never runs over a tree it cannot change.
	if 0 == len(ctx.entities) {
		return root
	}
	return walkEntities(ctx, root, map[Val]bool{}, true, map[string]Val{})
}

// walkEntities is both halves of the merge; `write` is which one is
// running. One function rather than two because the two halves differ
// in three lines and agree in the walk — and a walk written twice is a
// walk that drifts.
func walkEntities(ctx *Ctx, node Val, seen map[Val]bool, write bool,
	anc map[string]Val) Val {
	if nil == node {
		return node
	}

	name := node.entityName()
	if "" != name {
		if write {
			if nil != ctx.idBad {
				if nil2, ok := ctx.idBad[node]; ok {
					return nil2
				}
			}
		}
		if write {
			// The SUBSTITUTION happens before the seen-guard, not after.
			// Two positions of one entity hold the SAME object once a
			// pass has merged them, so a guard that ran first would visit
			// the first position, replace it with a newer
			// representative, and then skip the second as already-seen —
			// leaving it on the older value. That is exactly what a
			// `refer(t)` flow produces: it writes a new representative
			// mid-pass, and every position must take it.
			if rep, ok := ctx.entities[name]; ok && rep != node {
				node = rep
			}
		} else {
			// `ancestor != node` because a unified tree is a GRAPH: a
			// resolved reference shares its target, so a node can be
			// reached through ITSELF without anyone having written two
			// id()s. That is one entity at one position, which is fine.
			// The defect is two DISTINCT nodes, one inside the other,
			// claiming one name.
			if ancestor, ok := anc[name]; ok && ancestor != node {
				// BEFORE the unite, which is where the
				// self-containing value would be built and the
				// stack would go.
				ctx.idBad[node] = makeNilErr(ctx, "id_ancestor", node, ancestor)
				return node
			}
			rep, ok := ctx.entities[name]
			if !ok || rep == node {
				ctx.entities[name] = node
			} else {
				ctx.entities[name] = unite(ctx, node, rep)
			}
		}
	}

	// The guard bounds the DESCENT, which is all it was ever for: a
	// unified tree is a graph, and a subtree is worth walking once.
	if seen[node] {
		return node
	}
	seen[node] = true

	// The ancestor map is per-PATH, not per-walk: two entities are
	// siblings when neither contains the other, which is the case
	// identity exists for.
	down := anc
	if "" != name {
		down = make(map[string]Val, len(anc)+1)
		for k, v := range anc {
			down[k] = v
		}
		down[name] = node
	}

	switch n := node.(type) {
	case *MapVal:
		for _, k := range n.keys {
			out := walkEntities(ctx, n.peg[k], seen, write, down)
			if write {
				n.peg[k] = out
			}
		}
	case *ListVal:
		for i, e := range n.peg {
			out := walkEntities(ctx, e, seen, write, down)
			if write {
				n.peg[i] = out
			}
		}
	}
	return node
}

// entityNames is the registry's names in sorted order — the
// deterministic iteration ADR-001 requires of anything a report can
// show, Go map order being random. Used by the tests that inspect the
// registry.
func entityNames(ctx *Ctx) []string {
	out := make([]string, 0, len(ctx.entities))
	for n := range ctx.entities {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

// SPREAD TEMPLATES MAY NOT STAMP ONE ID ONTO EVERY CHILD (G4 phase 1,
// clearing rule 3). `&: id(svc_thing) & {…}` says that every child of
// the bag IS the entity `svc_thing`, and the identity merge then
// unifies all of them into one another: an author who wrote a
// per-child template would get a single merged blob, and any two
// children that disagreed about a field would fail at a site that
// explains nothing.
//
// A PATH-DEPENDENT argument is allowed, and is how the author says what
// they meant: `&: id(key()) & {…}` names each child distinctly,
// resolved per destination by the existing spread-clone machinery.
// Mirrors constantIdFunc in ts/src/utility.ts.
func constantIdFunc(v Val, seen map[Val]bool) Val {
	if nil == v || seen[v] {
		return nil
	}
	seen[v] = true

	if fv, ok := v.(*FuncVal); ok && "id" == fv.name && !hasPathFunc(fv) {
		return fv
	}
	for _, c := range spreadTermChildren(v) {
		if found := constantIdFunc(c, seen); nil != found {
			return found
		}
	}
	return nil
}

// spreadTermChildren is the walk constantIdFunc uses: everything a
// template can hold a call inside. Wider than entityChildren above,
// because a template is an EXPRESSION — the id() the rule refuses is
// typically a conjunct term, not a bag position.
func spreadTermChildren(v Val) []Val {
	switch n := v.(type) {
	case *MapVal:
		out := make([]Val, 0, len(n.keys)+1)
		for _, k := range n.keys {
			out = append(out, n.peg[k])
		}
		if nil != n.spread {
			out = append(out, n.spread)
		}
		return out
	case *ListVal:
		out := append([]Val{}, n.peg...)
		if nil != n.spread {
			out = append(out, n.spread)
		}
		return out
	case *ConjunctVal:
		return n.peg
	case *DisjunctVal:
		return n.peg
	case *PrefVal:
		return []Val{n.peg}
	case *FuncVal:
		return n.peg
	}
	return nil
}

// spreadIdNil is the refusal clearing rule 3 installs IN PLACE of the
// template, made ONCE at parse time rather than per pass, so the report
// names it once. Placed as the spread it replaces, it reaches every
// child of the bag; the bag itself returns it (the `id_spread` arm in
// MapVal.Unify and ListVal.Unify), which is what makes an EMPTY bag
// with a bad template an error too.
func spreadIdNil(idfn Val) *NilVal {
	n := newNil("id_spread")
	n.sp = idfn.pos()
	n.spu = idfn.posu()
	n.surl = idfn.srcurl()
	n.primary = idfn
	return n
}

// refuseSpreadId returns the refusal when the template carries a
// constant id(), or the template unchanged.
func refuseSpreadId(spread Val) Val {
	if nil == spread {
		return spread
	}
	if idfn := constantIdFunc(spread, map[Val]bool{}); nil != idfn {
		return spreadIdNil(idfn)
	}
	return spread
}
