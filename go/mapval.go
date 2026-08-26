/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// MapVal is an ordered map of string keys to child Vals. Insertion
// order is preserved for canon output and generation.
type MapVal struct {
	base
	keys     []string
	peg      map[string]Val
	closed   bool     // close() — no keys beyond those present may be added
	spread   Val      // &: spread constraint applied to every key (nil if none)
	optional []string // keys marked optional (a?:1) — dropped if unresolved
}

func (m *MapVal) isOptional(k string) bool {
	for _, o := range m.optional {
		if o == k {
			return true
		}
	}
	return false
}

func newMap() *MapVal {
	m := &MapVal{peg: map[string]Val{}}
	m.sp = unsited
	return m
}

// set assigns a key, preserving insertion order for new keys.
func (m *MapVal) set(k string, v Val) {
	if _, ok := m.peg[k]; !ok {
		m.keys = append(m.keys, k)
	}
	m.peg[k] = v
}

func mergeVals(a, b Val) Val {
	if cj, ok := a.(*ConjunctVal); ok {
		cj.peg = append(cj.peg, b)
		return cj
	}
	return newConjunct([]Val{a, b})
}

func (m *MapVal) superior() Val { return top() }

func (m *MapVal) Canon() string {
	var b strings.Builder
	b.WriteByte('{')
	if m.spread != nil {
		b.WriteString("&:")
		b.WriteString(m.spread.Canon())
		if len(m.keys) > 0 {
			b.WriteByte(',')
		}
	}
	// Keys are emitted alphabetically so the canonical form is independent
	// of insertion/unification order (matching the TypeScript canon and the
	// JSON marshaling, which also sorts keys). A copy is sorted so the
	// internal m.keys order — used by the determinism driver in Unify —
	// is left untouched.
	keys := append([]string(nil), m.keys...)
	sort.Strings(keys)
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(jsonString(k))
		if m.isOptional(k) {
			b.WriteByte('?')
		}
		b.WriteByte(':')
		// canonRiders, not Canon: a deprecated field renders back
		// as its `deprecate(x, m)` call, reparseably (G3).
		b.WriteString(canonRiders(m.peg[k]))
	}
	b.WriteByte('}')
	return b.String()
}

// snapshotRefSpread snapshots a path-dependent *ref* spread to its
// structural target once, while inner key()/path() funcs are still
// unresolved (port of snapshotRefSpread in ts/src/val/MapVal.ts). Later
// fixpoint passes reuse the snapshot instead of re-resolving the ref
// against the mutated tree, which would leak the source's resolved
// key()/path() literals into the spread destinations. Keyed by canon +
// source position (clones of the ref must find the same snapshot).
func snapshotRefSpread(cj *RefVal, ctx *Ctx) Val {
	if ctx.snapmap == nil {
		ctx.snapmap = map[string]Val{}
	}
	sk := cj.Canon() + "~" + itoa(cj.sp)
	if snap, ok := ctx.snapmap[sk]; ok {
		return snap
	}
	// snap mode: the pending-mark-wrapper defer in find must not apply
	// here — the snapshot WANTS the pre-resolution structure.
	tgt := cj.find(ctx, true)
	// A ref to a type() resolves to its inner template — snapshot that,
	// so a type-wrapped ref spread behaves like a plain-map ref spread.
	if fv, ok := tgt.(*FuncVal); ok && fv.name == "type" && len(fv.peg) > 0 {
		tgt = fv.peg[0]
	}
	// Only snapshot a found, path-dependent target; otherwise retry on
	// a later pass.
	if tgt != nil && !tgt.Nil() && hasPathFunc(tgt) {
		snap := clonePath(tgt, cp(cj.path))
		// Clear TYPE marks on the snapshot: a type() template constrains
		// values but must not make the destination type-invisible.
		walkMark(snap, true, false, false, false)
		ctx.snapmap[sk] = snap
		return snap
	}
	return nil
}

// hasPathFunc reports whether v's unification depends on its own path —
// the exact port of the TS `isPathDependent` getter, INCLUDING its
// recursion quirks. TS walks `this.peg`: an ARRAY peg (func args,
// junction members, list elements) recurses into Val elements; an
// OBJECT peg recurses into Val-valued properties — for a bag that is
// the children map, but for a PrefVal the peg IS a Val, so the walk
// only reaches the inner Val's Val-typed properties. The observable
// consequence: `*copy($.z)` (pref of a func whose args ARRAY hides the
// ref) counts as path-INdependent, so such a spread template is shared
// (tier 1) and advances in place; only `*<pref>` chains see through one
// level. Faithfully mirrored here — do not "fix" the recursion.
//
// Like the TS getter, the answer is memoized per Val (base.pdep): an
// in-place refinement can resolve a key()/ref after the first
// classification, and the clone-vs-share decision must stay stable
// across passes.
func hasPathFunc(v Val) bool {
	switch v.(type) {
	case *MapVal, *ListVal, *FuncVal, *ConjunctVal, *DisjunctVal, *PrefVal,
		*PlusOpVal:
		if pc, ok := v.(pdepVal); ok {
			switch pc.getPdep() {
			case 1:
				return true
			case 2:
				return false
			}
			dep := computePathFunc(v)
			if dep {
				pc.setPdep(1)
			} else {
				pc.setPdep(2)
			}
			return dep
		}
	}
	return computePathFunc(v)
}

func computePathFunc(v Val) bool {
	switch n := v.(type) {
	case *RefVal:
		return true
	case *FuncVal:
		switch n.name {
		case "key", "path", "move", "super":
			return true
		}
		for _, a := range n.peg {
			if hasPathFunc(a) {
				return true
			}
		}
	case *MapVal:
		for _, k := range n.keys {
			if hasPathFunc(n.peg[k]) {
				return true
			}
		}
		if n.spread != nil && hasPathFunc(n.spread) {
			return true
		}
	case *ConstraintVal:
		// A residual's unresolved arguments live in pending (an atom
		// endpoint still waiting on a reference), its predicates in
		// musts, and the sizing residual in count. TS reaches the same
		// values through the generic peg walk (ConstraintVal keeps its
		// arguments as peg).
		if nil != n.pending {
			for _, a := range n.pending.args {
				if hasPathFunc(a) {
					return true
				}
			}
		}
		for _, m := range n.musts {
			if hasPathFunc(m.v) {
				return true
			}
		}
		if nil != n.count && hasPathFunc(n.count) {
			return true
		}
	case *ListVal:
		for _, e := range n.peg {
			if hasPathFunc(e) {
				return true
			}
		}
		if n.spread != nil && hasPathFunc(n.spread) {
			return true
		}
	case *PlusOpVal:
		// The TS getter walks any ARRAY peg, and an operator's operands
		// are one -- so `"acme/" + key()` is path-dependent there, and a
		// template holding it is CLONED per destination rather than
		// shared. This arm was missing, so the Go port shared such a
		// template and every destination got the FIRST one's key. Found
		// by G8 phase 1: a generator's template is the one place a
		// wrongly shared op is visible in the output rather than merely
		// in a canon.
		for _, t := range n.peg {
			if hasPathFunc(t) {
				return true
			}
		}
	case *ConjunctVal:
		for _, t := range n.peg {
			if hasPathFunc(t) {
				return true
			}
		}
	case *DisjunctVal:
		for _, t := range n.peg {
			if hasPathFunc(t) {
				return true
			}
		}
	case *PrefVal:
		// TS's property-walk over a Val-typed peg reaches only the
		// inner Val's Val-typed properties: a nested PrefVal's own peg
		// is one, but a func's args array / a ref's parts / a bag's
		// children map are not.
		if inner, ok := n.peg.(*PrefVal); ok {
			return hasPathFunc(inner.peg)
		}
		return false
	}
	return false
}

// spreadCloneFor returns a per-key copy of the spread constraint,
// following the spreadClone tiers in TS MapVal/Val:
//   - TOP needs no cloning;
//   - a path-independent constraint (no key()/path()/move()/super()/ref
//     anywhere below) is SHARED — nothing in the unify path depends on
//     its stored paths, and sharing lets the template advance in place
//     as destinations resolve it (the TS tier-1 `return this`);
//   - otherwise a clone re-pathed to the destination (for funcs the
//     clone shares its args — Val.clone semantics — so e.g. a
//     close({k:key()}) spread's template map is shared across all
//     destinations, exactly as in TS).
func spreadCloneFor(s Val, path []string, ctx *Ctx) Val {
	if isTop(s) {
		return s
	}
	// The one place a spread is APPLIED, so the one place that knows a
	// contribution came from a template rather than from the key
	// itself (G7 phase 4). Only when someone is recording: the walk is
	// O(template) per key per pass, which is real money on a large
	// model and buys nothing when no one is recording.
	// The share-when-path-independent tier exists only on bags (TS
	// overrides spreadClone on MapVal/ListVal alone); every other
	// constraint kind — prefs, funcs, refs, junctions — clones per
	// application (Val.spreadClone = this.clone), so e.g. a `*open(x)`
	// template is never resolved in place by its applications.
	switch s.(type) {
	case *MapVal, *ListVal:
		if !hasPathFunc(s) {
			markSpread(s, ctx)
			return s
		}
	}
	// A FULL INSTANCE per application (instanceClone, ADR-005): a
	// spread constraint is applied once per destination child, and each
	// application must own its path-dependent innards — a bare clone
	// shared a call's arguments and a preference's inner value across
	// destinations, so a spread like `&: id(key(0)) & $.schema.C`
	// resolved its one shared key() at the first child it met
	// (use-cases/BUGS.md §12's id_name form). Mirrors Val.spreadClone.
	out := instanceClone(s, path)
	markSpread(out, ctx)
	return out
}

// markSpread marks a spread clone and everything inside it, so a
// contribution several levels down a template is still known to have
// come from the template. Instrumented runs only (see spreadCloneFor).
// Mirrors markSpread in ts/src/provenance.ts.
func markSpread(v Val, ctx *Ctx) {
	if nil == ctx.prov || nil == v || v.fromSpread() {
		return
	}
	v.setFromSpread()
	for _, k := range whyKids(v) {
		markSpread(k, ctx)
	}
}

func (m *MapVal) Gen(ctx *Ctx) (any, error) {
	if m.mtype || m.mhide {
		return nil, nil
	}
	out := map[string]any{}
	// Iterate alphabetically (mirrors the entries sort in TS
	// BagVal.gen): the JSON output is order-independent, but the
	// collect-mode truncating break must keep the same sorted prefix
	// in both implementations.
	keys := append([]string(nil), m.keys...)
	sort.Strings(keys)
	for _, k := range keys {
		child := m.peg[k]
		// Type and hidden values are excluded from generation (a key
		// whose source was moved away carries the hide mark set by
		// RefVal.find's hide-found handling).
		if child.markedType() || child.markedHide() {
			continue
		}
		optional := m.isOptional(k)

		// Non-generable child kinds (top, kinds, funcs, vars, ops,
		// conjuncts) fail at the bag level (mirrors the branch list in
		// TS BagVal.gen): dropped when optional, a truncating break
		// under collect, an error otherwise.
		if !genable(child) {
			if optional {
				continue
			}
			// Code follows the TS BagVal.gen choice: an expect child is
			// spread-required residue (issue #27); otherwise a closed
			// bag makes the residue a missing REQUIRED value, an open
			// one merely non-generable.
			code := "mapval_no_gen"
			if m.closed {
				code = "mapval_required"
			}
			va, vb := child, Val(nil)
			if ev, ok := child.(*ExpectVal); ok {
				// The TS isExpect branch: code *_spread_required, and the
				// operands are the EXPECTATION (va = expect.peg) and a
				// fresh nil PLACED at the creating bag's site (vb) — the
				// placed nil sits later in the source, so it wins the
				// primary slot and the first frame points at the bag.
				code = "mapval_spread_required"
				if ev.parent != nil {
					// place() copies the parent's whole site — position
					// AND url (the clone mark), which gates the operand
					// order exactly as in TS.
					nb := newNil("")
					nb.sp = ev.parent.pos()
					nb.spu = ev.parent.posu()
					nb.surl = ev.parent.srcurl()
					vb = nb
				}
				va = ev.peg
			}
			details := map[string]string{"key": k}
			// UNDER COLLECT the bag stops at its first non-generable
			// child, and RECORDS it: truncation limits the report to one
			// finding per bag, it does not suppress it. TS makes the same
			// two moves in the same order (makeNilErr, which files the
			// nil on the context, then break) in both modes — Go's error
			// return is the difference below, not this. The validation
			// verb reads these off an isolated context to tell "the data
			// has not yet satisfied the truth" from "the data
			// contradicts it" (vet.go).
			if ctx != nil && ctx.collect {
				makeNilErrFull(ctx, code, va, vb, "", details)
				break
			}
			// Render the full TS-style message (marker, headline, hint,
			// frame with the `key <k>` caret submessage) via a NilVal,
			// as TS BagVal.gen raises makeNilErr with details {key}.
			src, file := "", ""
			if ctx != nil {
				src, file = ctx.src, ctx.file
			}
			n := makeNilErrFull(nil, code, va, vb, "", details)
			return nil, &AontuError{Msg: n.FullMessage(src, file), Code: code}
		}

		// An optional child generates in an isolated collect context so
		// inner failures drop parts of the subtree rather than raising.
		gctx := ctx
		if optional && ctx != nil {
			c2 := *ctx
			c2.err = nil
			c2.collect = true
			gctx = &c2
		}

		cv, err := child.Gen(gctx)
		if err != nil {
			// An optional key that does not resolve is dropped, not an error.
			if optional {
				continue
			}
			if ctx != nil && ctx.collect {
				continue
			}
			return nil, err
		}
		// A JSON null child survives even when optional (`b?:null` keeps
		// b: null); other nils and optional empties contribute nothing.
		if cv == nil && gensNull(ctx, child) {
			out[k] = nil
			continue
		}
		if optional && (cv == nil || isEmptyGen(cv)) {
			continue
		}
		// A nil from a child that doesn't stand for JSON null (a pref
		// of top, a silent leaf) contributes nothing.
		if cv == nil {
			continue
		}
		out[k] = cv
	}
	return out, nil
}

// genable mirrors the generable-child branch list in TS BagVal.gen.
func genable(v Val) bool {
	switch v.(type) {
	case *ScalarVal, *MapVal, *ListVal, *PrefVal, *RefVal,
		*DisjunctVal, *NilVal:
		return true
	}
	return false
}

// gensNull reports whether a child's generated nil means JSON null
// (rather than "nothing to contribute").
func gensNull(ctx *Ctx, v Val) bool {
	switch n := v.(type) {
	case *ScalarVal:
		return n.kind == KindNull
	case *PrefVal:
		return gensNull(ctx, n.peg)
	case *DisjunctVal:
		// A disjunction generates whatever its FOLDED members generate, so
		// ask the fold rather than the wrapper. Without this case a key
		// whose value was `null|top` (which folds to null, since
		// `null & top` is null) was read as "generated nothing" and
		// silently dropped from the output -- and a list element with it.
		// The members are genuinely different values, so no amount of
		// deduping removes the case.
		return gensNull(ctx, n.foldForGen(ctx))
	}
	return false
}

// isEmptyGen reports whether a generated value is an empty map or list.
func isEmptyGen(v any) bool {
	switch n := v.(type) {
	case map[string]any:
		return len(n) == 0
	case []any:
		return len(n) == 0
	}
	return false
}

func (m *MapVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	// A sizing residual (`length`, `unique`) sorts AFTER containers in a
	// conjunct so that it counts the MERGED map rather than the first
	// fragment (sizingCjo in constraint.go). That makes the map the
	// accumulator and the constraint its peer, the reverse of the usual
	// order -- and the reading belongs to the constraint either way, so
	// hand it straight back.
	if pc, ok := peer.(*ConstraintVal); ok {
		return pc.Unify(m, ctx)
	}
	// Let the closed side drive, so its key restriction is enforced
	// deterministically (mirrors MapVal.unify).
	if pm, ok := peer.(*MapVal); ok {
		if !m.closed && pm.closed {
			return pm.Unify(m, ctx)
		}
		// Both closed: pick a deterministic driver (fewer keys, then
		// lexicographic key order) so the result is independent of
		// operand order (mirrors ts/src/val/MapVal.ts).
		if m.closed && pm.closed {
			if len(pm.keys) < len(m.keys) ||
				(len(pm.keys) == len(m.keys) &&
					strings.Join(pm.keys, "~") < strings.Join(m.keys, "~")) {
				return pm.Unify(m, ctx)
			}
		}
	}
	// The location this map is being driven at (the TS ctx.path): the
	// caller's slot hint when present, else the map's own path. Child
	// drives descend from it (ctx.descend), which matters when a shared
	// clone with an overlay-tailed stored path is driven as a func arg.
	dbase := ctx.slot
	if dbase == nil {
		dbase = m.path
	}

	// A TOP peer refines the map IN PLACE (the `out = peer.isTop ? this
	// : new MapVal(...)` fast-path in TS MapVal.unify): children write
	// back into m.peg, so shared references to this map — a frozen
	// func's arg, a spread template — observe the refinement.
	var out *MapVal
	if isTop(peer) {
		out = m
	} else {
		out = newMap()
		out.closed = m.closed
		out.path = cp(m.path)
		// The site survives unification (TS: `out.site = this.site` in
		// MapVal.unify copies row, col AND url), so a unified bag still
		// frames at its brace and keeps its clone mark.
		out.sp = m.sp
		out.spu = m.spu
		out.surl = m.surl
		out.spread = m.spread
		out.optional = append([]string{}, m.optional...)
	}
	done := true

	// Combine spreads and optional keys (additive) from both sides.
	if pm, ok := peer.(*MapVal); ok {
		if out.spread == nil {
			out.spread = pm.spread
		} else if pm.spread != nil && out.spread.Canon() != pm.spread.Canon() {
			// Combine two spread constraints. Identical templates (same canon)
			// collapse to one: re-unifying resolves key()/path() at the shared
			// intermediate path, producing spurious values (f1bb1063). Distinct
			// templates are unified in place — unite is idempotent, whereas
			// deferring the distinct case into newConjunct (as f1bb1063 did)
			// re-wraps every fixpoint pass, growing the conjunct without bound
			// and non-terminating on real models (the apidef/sdkgen entity
			// schemas each contribute a `&:` spread with `name: key()`).
			out.spread = unite(ctx, out.spread, pm.spread)
		}
		for _, ok := range pm.optional {
			if !out.isOptional(ok) {
				out.optional = append(out.optional, ok)
			}
		}
	}

	var spreadCj Val = top()
	if out.spread != nil {
		spreadCj = out.spread
	}

	// The template REFUSED at parse (clearing rule 3, G4 phase 1): the
	// bag itself is that refusal. Returning the nil here rather than
	// only letting it reach the children is what makes an EMPTY bag
	// with a bad template an error too — there are no children to carry
	// it. Narrow to THIS code on purpose: a nil spread from any other
	// cause keeps its existing behaviour of driving every key. Mirrors
	// the same arm in ts/src/val/MapVal.ts and ts/src/val/ListVal.ts.
	// NOT added to ctx.err here: a parse-time refusal is a nil IN THE
	// TREE, and canon renders it (`{"a":nil}`) exactly as it renders a
	// bad arity or an unknown function; generation is what reports it.
	if nv, ok := spreadCj.(*NilVal); ok && "id_spread" == nv.why {
		return nv
	}

	// Snapshot a path-dependent ref spread to its structural target once
	// (see snapshotRefSpread), so later passes don't capture the
	// source's own resolved key()/path() literals.
	if rv, ok := spreadCj.(*RefVal); ok {
		if snap := snapshotRefSpread(rv, ctx); snap != nil {
			spreadCj = snap
		}
	}
	// A type() used as a spread applies as its inner template: values
	// are emitted (and constrained) at each destination rather than
	// marking the destination as a type.
	if fv, ok := spreadCj.(*FuncVal); ok && fv.name == "type" && len(fv.peg) > 0 {
		spreadCj = fv.peg[0]
	}

	// Own children. The spread constraint applies ONCE per child
	// (mirrors the `_spr` stamp in TS MapVal.unify): the first
	// application merges the template into the child, so later passes
	// only self-unify against TOP — where pending funcs in hidden
	// subtrees freeze (see FuncVal.Unify) instead of being re-fed
	// template clones, and already-resolved values are not re-clobbered.
	for _, k := range m.keys {
		child := m.peg[k]
		// Map marks ratchet onto children each pass (the
		// propagateMarks(this, child) in TS MapVal.unify).
		if m.mtype && !child.markedType() {
			child.setMarkType(true)
		}
		if m.mhide && !child.markedHide() {
			child.setMarkHide(true)
		}
		kslot := append(cp(dbase), k)
		var cv Val
		if !isTop(spreadCj) && sprOf(child) == spreadCj {
			if child.Dc() == DONE {
				cv = child
			} else {
				ctx.slot = kslot
				cv = unite(ctx, child, top())
			}
			setSprOn(cv, spreadCj)
		} else {
			sc := spreadCloneFor(spreadCj, kslot, ctx)
			ctx.slot = kslot
			cv = unite(ctx, child, sc)
			if !isTop(spreadCj) && !cv.Nil() {
				setSprOn(cv, spreadCj)
			}
		}
		out.set(k, cv)
		if cv.Dc() != DONE {
			done = false
		}
	}

	// The first refused surplus key, kept until every peer key has been
	// unified (see the closed arm below).
	var bad *NilVal

	if pm, ok := peer.(*MapVal); ok {
		out.closed = m.closed || pm.closed
		// Self-unify the peer against TOP first (the `upeer` step in TS
		// MapVal.unify): a shared peer — e.g. a tier-1 spread template —
		// refines in place, so its resolvable children advance where the
		// template itself is stored too.
		if pm.Dc() != DONE {
			ctx.slot = dbase
			if upm, uok := unite(ctx, pm, top()).(*MapVal); uok {
				pm = upm
			}
		}
		for _, pk := range pm.keys {
			pc := pm.peg[pk]
			if _, allowed := m.peg[pk]; m.closed && !allowed {
				// RECORDED, and the loop goes on. Returning here made the
				// first surplus key the last thing the map ever said: a
				// closed bag meeting a typo AND a kind conflict reported
				// the typo and stopped, so the second mistake only
				// appeared once the first was fixed. TS keeps the nil in
				// `bad` and hands it back after unifying every peer key,
				// which is what puts BOTH on the context — the case the
				// validation verb exists for.
				bad = makeNilErr(ctx, "closed", pc, nil)
			}
			pkslot := append(cp(dbase), pk)
			_, pcIsOp := pc.(*PlusOpVal)
			var uv Val
			if ex, ok := out.peg[pk]; ok {
				ctx.slot = pkslot
				uv = unite(ctx, ex, pc)
			} else if !expectGenable(pc) && !pcIsOp && !pc.markedType() && !pc.markedHide() {
				// A MARKED value is carried, never expected (the second
				// guard; ADR-005 era, BUGS.md §12's include form): a
				// type()/hide()-marked child legitimately participates in
				// unification without ever generating — the marks
				// contract — so wrapping one as an expectation turned a
				// schema field arriving through an include's map meet
				// into a bogus mapval_spread_required naming a spread
				// that exists in neither file. The bag's Gen already
				// skips marked children. Mirrors handleExpectedVal in
				// ts/src/val/BagVal.ts.
				// An OPERATOR is carried too (the pcIsOp guard; BUGS.md
				// §36): an expression resolves by itself once its
				// operands do — the own-key loop drives it every pass —
				// so `m:{y:.x+1}` arriving as a peer key keeps computing
				// exactly as it does written inline. Wrapping it froze
				// the op and the residue reported a phantom
				// mapval_spread_required naming a spread that exists
				// nowhere. Mirrors handleExpectedVal in
				// ts/src/val/BagVal.ts.
				// TS handleExpectedVal: a peer key whose value cannot
				// generate on its own (a kind, top, a var, a constraint —
				// typically a spread template field) is wrapped, so the
				// bag's Gen can distinguish spread-required residue from
				// ordinary *_no_gen (issue #27). Not united with TOP: the
				// wrap must hold the raw expectation, exactly as in TS.
				// An expectation baked into a combined spread template
				// (the spread-combination meet above) is re-wrapped
				// FRESH, so key/parent name THIS bag and the template's
				// own node is never stored at a destination.
				peg := pc
				if ev, isex := pc.(*ExpectVal); isex {
					peg = ev.peg
				}
				uv = &ExpectVal{peg: peg, parent: m, key: pk}
			} else {
				ctx.slot = pkslot
				uv = unite(ctx, pc, top())
			}
			// A spread on the receiving map also applies to peer keys —
			// once per child, same apply-once discipline as the own-key
			// loop (the peer-loop `_spr` stamp in TS MapVal.unify).
			if m.spread != nil && sprOf(uv) != spreadCj {
				sc := spreadCloneFor(spreadCj, pkslot, ctx)
				ctx.slot = pkslot
				uv = unite(ctx, uv, sc)
				if !isTop(spreadCj) && !uv.Nil() {
					setSprOn(uv, spreadCj)
				}
			}
			out.set(pk, uv)
			if uv.Dc() != DONE {
				done = false
			}
		}
	} else if !isTop(peer) {
		return makeNilErr(ctx, "map", m, peer)
	}

	if nil != bad {
		return bad
	}

	if done {
		out.setDc(DONE)
	} else {
		out.setDc(m.dc + 1)
	}
	// Marks on the map itself survive unification.
	propagateMarks(m, out)
	if !isTop(peer) {
		propagateMarks(peer, out)
	}
	return out
}
