/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"maps"
	"math/big"
	"slices"
	"strconv"
	"strings"
)

// RefVal is a path reference (e.g. `$.a.b`, `.x.a`, `x.a`). It resolves
// against the root during the fixpoint unification loop. Ported from
// ts/src/val/RefVal.ts.
type RefVal struct {
	base
	peg       []any // path parts: string or *VarVal
	absolute  bool
	prefix    bool
	hideFound bool // move(): hide the resolution target in place
	copyFound bool // copy(): clear all marks on the resolved copy
	// expansion is what an alias reference canons as, attached by
	// expandAliases (go/alias.go) to render the settled tree, never read.
	expansion Val
	rxc       int
	// again: a relative path a copy reads again, which resolves where the copy stands.
	again bool
	// template: a link's whole template, which reaches itself through other links' templates too.
	template bool
	// lands: a relative path in a link's template, which reads where the template lands (ruling 50).
	lands bool
}

// walkOutcome says how a reference walk ended: it landed on a value,
// it missed a segment for good (no_path), or the tree is not settled
// enough to tell yet and the reference DEFERS to a later pass.
type walkOutcome int

const (
	walkFound walkOutcome = iota
	walkMissed
	walkDefer
)

// throughRider reads through a value-transparent rider still being resolved,
// as the walk reads through a pending mark. Mirrors throughRider in
// ts/src/val/RecurseVal.ts.
func throughRider(v Val) Val {
	for {
		fv, ok := v.(*FuncVal)
		if !ok || DONE == fv.dc || ("meta" != fv.name && "deprecate" != fv.name && "ident" != fv.name) ||
			0 == len(fv.peg) || nil == fv.peg[0] {
			return v
		}
		v = fv.peg[0]
	}
}

// A seal's value is its argument, as a rider's is: a path reads a member through one that waits.
func throughWrap(v Val) Val {
	v = throughRider(v)
	for {
		fv, ok := v.(*FuncVal)
		if !ok || DONE == fv.dc || ("close" != fv.name && "open" != fv.name) ||
			0 == len(fv.peg) || nil == fv.peg[0] {
			return v
		}
		v = throughRider(fv.peg[0])
	}
}

func waitingWrap(t Val) bool { return t != throughWrap(t) }

func readsAsBag(t Val) bool {
	switch throughWrap(t).(type) {
	case *MapVal, *ListVal:
		return true
	}
	return false
}

// declaration finds the value an alias names in the map term of a meet
// that is still folding. A declaration is not a field, so no other term
// contributes to it. Mirrors declaration in ts/src/val/RecurseVal.ts.
func declaration(cj *ConjunctVal, key string) Val {
	for _, t := range cj.peg {
		switch term := throughRider(t).(type) {
		case *ConjunctVal:
			if decl := declaration(term, key); nil != decl {
				return decl
			}
		case *MapVal:
			for _, ak := range term.aliasKeys {
				if ak == key {
					return term.peg[key]
				}
			}
		}
	}
	return nil
}

// A held arm (Decls.armChosen) and its peer answer for the arm's members.
func armHeldAt(armAt map[string]heldArm, refpath []string, pI int) (heldArm, bool) {
	held, ok := armAt[strings.Join(refpath[:pI], "\x00")]
	return held, ok && nil != markedChild(held.arm, refpath[pI])
}

// A held arm answers from its own level, however the levels above it stand.
func heldFrom(armAt map[string]heldArm, refpath []string) int {
	for hI := len(refpath) - 1; 0 < hI && 0 < len(armAt); hI-- {
		if _, ok := armHeldAt(armAt, refpath, hI); ok {
			return hI
		}
	}
	return 0
}

// Met with its peer's; one a later meet could still narrow waits (nil).
func heldMet(ctx *Ctx, mine Val, held heldArm, parts []string) Val {
	theirs := held.peer
	for _, part := range parts {
		if nil != theirs {
			theirs = markedChild(theirs, part)
		}
	}
	met := mine
	if _, scalar := mine.(*ScalarVal); nil != theirs && !scalar && DONE == mine.Dc() {
		if m := trialUnify(ctx, clonePath(mine, nil), clonePath(theirs, nil)); nil != m {
			met = m
		}
	}
	if _, scalar := met.(*ScalarVal); scalar || ctx.settle || held.own {
		return met
	}
	return nil
}

func (rv *RefVal) walkFrom(ctx *Ctx, root Val, refpath []string, armAt map[string]heldArm) (Val, walkOutcome) {
	node := root
	inArm := false
	var peer heldArm
	peerAt := 0
	_, isAlias := rv.aliasKey()
	for pI := heldFrom(armAt, refpath); pI < len(refpath); pI++ {
		part := refpath[pI]
		// A held arm answers only for the members it holds.
		if held, ok := armHeldAt(armAt, refpath, pI); ok {
			node, inArm, peer, peerAt = held.arm, true, held, pI
		}
		node = throughWrap(node)
		if fv, ok := node.(*FuncVal); ok && DONE != fv.dc &&
			("hide" == fv.name || "type" == fv.name) && 0 < len(fv.peg) {
			switch inner := fv.peg[0].(type) {
			case *MapVal:
				node = inner
			case *ListVal:
				node = inner
			}
		}

		if cj, ok := node.(*ConjunctVal); ok && isAlias && !pendingMarkWrapper(cj) {
			decl := declaration(cj, part)
			if nil == decl {
				return nil, walkDefer
			}
			node = decl
			continue
		}

		if cj, ok := node.(*ConjunctVal); ok && pendingMarkWrapper(cj) {
			kids := []Val{}
			for _, t := range cj.peg {
				if kid := markedChild(t, part); nil != kid {
					kids = append(kids, kid)
				}
			}
			// No term has it YET. Not a miss: the conjunct is still
			// folding, and the member may arrive with the fold.
			if 0 == len(kids) {
				return nil, walkDefer
			}
			if 1 == len(kids) {
				node = kids[0]
			} else {
				node = newConjunct(kids)
			}
			continue
		}
		// A meet can't fold while its rider or seal waits on this very member: each term answers.
		if cj, ok := node.(*ConjunctVal); ok && slices.ContainsFunc(cj.peg, waitingWrap) {
			kids := []Val{}
			for _, t := range cj.peg {
				if kid := markedChild(t, part); nil != kid {
					kids = append(kids, kid)
				}
			}
			if 0 == len(kids) || slices.ContainsFunc(cj.peg, func(t Val) bool { return !readsAsBag(t) }) {
				return nil, walkDefer
			}
			if 1 == len(kids) {
				node = kids[0]
			} else {
				node = newConjunct(kids)
			}
			continue
		}
		switch n := node.(type) {
		case *MapVal:
			node = n.peg[part]
		case *ListVal:
			idx, ok := listIndex(part)
			if !ok || idx >= len(n.peg) {
				node = nil
			} else {
				node = n.peg[idx]
			}
		default:
			// A choice inside a held arm is read before the arm: wait for it.
			_, dj := node.(*DisjunctVal)
			_, pf := node.(*PrefVal)
			if node.Dc() == DONE && !(inArm && (dj || pf)) {
				return nil, walkMissed
			}
			return nil, walkDefer
		}
		if node == nil {
			return nil, walkMissed
		}
	}
	if inArm {
		if node = heldMet(ctx, node, peer, refpath[peerAt:]); nil == node {
			return nil, walkDefer
		}
	}
	return node, walkFound
}

func newRef(terms []any, prefix bool) *RefVal {
	rv := &RefVal{prefix: prefix}
	rv.site.sp = unsited
	for _, t := range terms {
		rv.append(t)
	}
	return rv
}

func (rv *RefVal) cjo() int      { return 32500 }
func (rv *RefVal) superior() Val { return top() }

// A path segment no spelling can produce, used when append meets a
// value it has no rule for. A key cannot contain a NUL, so this can
// never match, which turns a silent path-shortening bug into a visible
// miss. Mirrors UNSPELLABLE_SEGMENT in ts/src/val/RefVal.ts.
const unspellableSegment = "\u0000unspellable"

// append builds the path parts, mirroring RefVal.append.
func (rv *RefVal) append(part any) {
	switch p := part.(type) {
	case string:
		rv.peg = append(rv.peg, p)
	case float64:
		rv.peg = append(rv.peg, numStr(p))
	case *ScalarVal:
		switch p.kind {
		case KindString:
			rv.peg = append(rv.peg, p.peg.(string))
		case KindInteger:
			rv.peg = append(rv.peg, p.src)
		case KindFloat:
			for _, s := range strings.Split(p.src, ".") {
				rv.peg = append(rv.peg, s)
			}
		case KindBigInteger:
			rv.peg = append(rv.peg, p.src)
		case KindBigDecimal:
			for _, s := range strings.Split(p.src, ".") {
				rv.peg = append(rv.peg, s)
			}
		default:
			// A boolean or null operand has no spelling that addresses a
			// key; it must miss loudly, not shorten the path — see the
			// trailing default below.
			rv.peg = append(rv.peg, unspellableSegment)
		}
	case *VarVal:
		rv.peg = append(rv.peg, p)
	case *RefVal:
		if p.absolute {
			rv.absolute = true
		}
		if rv.prefix {
			if p.prefix {
				rv.peg = append(rv.peg, ".")
			}
		} else if p.prefix {
			if len(rv.peg) == 0 {
				rv.prefix = true
			} else {
				rv.peg = append(rv.peg, ".")
			}
		}
		rv.peg = append(rv.peg, p.peg...)
	case *ScalarKindVal, *MapKindVal, *ListKindVal, *TopVal:
		rv.peg = append(rv.peg, p.(Val).Canon())
	case *ConstraintKindVal:
		if nil == p.held {
			rv.peg = append(rv.peg, p.Canon())
		} else {
			rv.peg = append(rv.peg, unspellableSegment)
		}
	default:
		rv.peg = append(rv.peg, unspellableSegment)
	}
}

func numStr(f float64) string {
	if f == float64(int64(f)) {
		return strconv.FormatInt(int64(f), 10)
	}
	return formatNumber(f)
}

func (rv *RefVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	if Val(rv) == peer {
		return rv
	}

	// The resolved target is driven at the ref's location (TS unites it
	// with the ref's own ctx).
	slot := ctx.slot

	var out Val
	var found Val
	if !rv.lands {
		found = rv.find(ctx, false)
	}
	if found == nil {
		// Not yet resolved: defer.
		switch {
		case isTop(peer):
			out = rv
		case peer.Nil():
			out = makeNilErr(ctx, "ref", rv, peer)
		case rv.spelling() == refSpelling(peer):
			out = rv
		default:
			out = newConjunct([]Val{rv, peer})
		}
	} else if fr, chain := found.(*RefVal); chain && !fr.again {
		// A path a copy reads again resolves here; any other reference found waits for its own place.
		switch {
		case isTop(peer):
			out = rv
		case peer.Nil():
			out = makeNilErr(ctx, "ref", rv, peer)
		case rv.spelling() == refSpelling(peer):
			out = rv
		default:
			out = newConjunct([]Val{rv, peer})
		}
	} else {
		if slot == nil {
			slot = rv.path
		}
		ctx.slot = slot
		if name, ok := rv.aliasName(); ok {
			found.setVia(rv.site.sp, rv.site.url, name)
		}
		out = unite(ctx, found, peer)
		if !rv.absolute && !out.Nil() {
			if !isTop(peer) && !isConjunct(out) {
				out = clonePath(out, cp(out.vpath()))
			}
			out.setRereads(append([]Val{rv}, rereadTerms(peer)...))
		}
	}

	if out.Dc() != DONE {
		out.setDc(rv.dc + 1)
	}
	return out
}

func holdsReread(v Val) bool {
	if nil != v.rereads() {
		return true
	}
	switch n := v.(type) {
	case *MapVal:
		for _, k := range n.keys {
			if holdsReread(n.peg[k]) {
				return true
			}
		}
	case *ListVal:
		return slices.ContainsFunc(n.peg, holdsReread)
	case *ConjunctVal:
		return slices.ContainsFunc(n.peg, holdsReread)
	case *DisjunctVal:
		return slices.ContainsFunc(n.peg, holdsReread)
	case *PrefVal:
		return holdsReread(n.peg)
	}
	return false
}

// A copy reads each relative path again where it stands (ruling 26); what holds one isn't settled.
// Only a call made again (`made`) has its arguments read; a staged call's copy keeps its own.
func rereadAt(v Val, path []string, made bool) Val {
	if terms := v.rereads(); nil != terms {
		again := make([]Val, len(terms))
		for i, t := range terms {
			c := instanceClone(t, cp(path))
			setPaths(c, cp(path))
			c.setRereads(nil)
			if r, ok := c.(*RefVal); ok {
				r.again = true
			}
			again[i] = rereadAt(c, path, true)
		}
		out := again[0]
		if 1 < len(again) {
			cj := newConjunct(again)
			cj.path = cp(path)
			out = cj
		}
		out.setDc(0)
		return out
	}
	stale := false
	kid := func(k Val, at []string) Val {
		n := rereadAt(k, at, made)
		stale = stale || n != k || (DONE != n.Dc() && DONE == v.Dc())
		return n
	}
	each := func(peg []Val) {
		for i := range peg {
			peg[i] = kid(peg[i], path)
		}
	}
	switch n := v.(type) {
	case *MapVal:
		for _, k := range n.keys {
			n.peg[k] = kid(n.peg[k], append(cp(path), k))
		}
	case *ListVal:
		for i := range n.peg {
			n.peg[i] = kid(n.peg[i], append(cp(path), itoa(i)))
		}
	case *ConjunctVal:
		each(n.peg)
	case *DisjunctVal:
		each(n.peg)
	case *PrefVal:
		n.peg = kid(n.peg, path)
	case *FuncVal:
		if made {
			each(n.peg)
		}
	case *PlusOpVal:
		if made {
			each(n.peg)
		}
	}
	if stale {
		v.setDc(0)
	}
	return v
}

// liftCopy makes a copy an instance: its marks are cleared, and a type's
// copy is sealed, since a type is a definition its own statements extend.
func liftCopy(out Val, typed bool) Val {
	dropMarkedElements(out)
	walkMark(out, true, false, true, false)
	out = unwrapConstraintKind(out)
	out = dropPendingMarkWrappers(out)
	if typed {
		sealTree(out, true, false)
	}
	return out
}

func listIndex(part string) (int, bool) {
	if "" == part {
		return 0, false
	}
	if "0" != part && '0' == part[0] {
		return 0, false
	}
	for i := 0; i < len(part); i++ {
		if part[i] < '0' || '9' < part[i] {
			return 0, false
		}
	}
	// A digit run still overflows: `$.a.999999999999999999999999` is
	// syntactically an index and numerically not one.
	idx, err := strconv.Atoi(part)
	if err != nil {
		return 0, false
	}
	return idx, true
}

func markedChild(v Val, part string) Val {
	v = throughWrap(v)
	if fv, ok := v.(*FuncVal); ok && DONE != fv.dc &&
		("hide" == fv.name || "type" == fv.name) && 0 < len(fv.peg) {
		v = fv.peg[0]
	}
	switch n := v.(type) {
	case *MapVal:
		return n.peg[part]
	case *ListVal:
		idx, ok := listIndex(part)
		if !ok || idx >= len(n.peg) {
			return nil
		}
		return n.peg[idx]
	}
	return nil
}

// pendingMarkWrapper: is this value an unresolved type()/hide() call —
// or a conjunct still carrying one? A reference landing on one defers
// rather than cloning it (see the guard in find). Mirrors
// pendingMarkWrapper in ts/src/val/RefVal.ts.
func pendingMarkWrapper(v Val) bool {
	switch n := v.(type) {
	case *FuncVal:
		return ("type" == n.name || "hide" == n.name) && DONE != n.dc
	case *ConjunctVal:
		for _, t := range n.peg {
			if pendingMarkWrapper(t) {
				return true
			}
		}
	}
	return false
}

// A copy takes `x` from a pending NESTED `hide(x)`/`type(x)`; a root
// wrapper is left for the caller, which defers on it. So is an `each`'s
// template, whose mark leaves every instance out of the list it makes.
func dropPendingMarkWrappers(v Val) Val {
	switch n := v.(type) {
	case *MapVal:
		for _, k := range n.keys {
			n.peg[k] = dropMarkWrapper(n.peg[k])
		}
	case *ListVal:
		dropEach(n.peg)
	case *ConjunctVal:
		dropEach(n.peg)
	case *DisjunctVal:
		dropEach(n.peg)
	case *FuncVal:
		if "each" == n.name && 2 == len(n.peg) {
			n.peg[0] = dropMarkWrapper(n.peg[0])
			n.peg[1] = dropPendingMarkWrappers(n.peg[1])
		} else {
			dropEach(n.peg)
		}
	}
	return v
}

// A list holds no position for an element its own mark leaves out, so a
// copy drops the element where clearing the mark would show it.
func dropMarkedElements(v Val) {
	walkMarkVals(v, func(n Val) {
		l, ok := n.(*ListVal)
		if !ok {
			return
		}
		kept := make([]Val, 0, len(l.peg))
		for _, e := range l.peg {
			if !markedElement(l, e) {
				kept = append(kept, e)
			}
		}
		l.peg = kept
	})
}

func markedElement(l *ListVal, e Val) bool {
	if f, ok := e.(*FuncVal); ok && ("hide" == f.name || "type" == f.name) {
		return DONE != f.dc
	}
	return (e.markedHide() && !l.mhide) || (e.markedType() && !l.mtype)
}

// A staged call's copy shares its arguments with the call it copies, and
// a preference its value, so each takes its own before the copy changes.
func ownArgs(v Val) {
	walkMarkVals(v, func(n Val) {
		switch f := n.(type) {
		case *FuncVal:
			args := make([]Val, len(f.peg))
			for i, a := range f.peg {
				args[i] = clonePath(a, a.vpath())
			}
			f.peg = args
		case *PrefVal:
			f.peg = clonePath(f.peg, f.peg.vpath())
		}
	})
}

func dropEach(vals []Val) {
	for i, e := range vals {
		vals[i] = dropMarkWrapper(e)
	}
}

func dropMarkWrapper(v Val) Val {
	if fv, ok := v.(*FuncVal); ok && ("type" == fv.name || "hide" == fv.name) &&
		DONE != fv.dc && 0 < len(fv.peg) {
		return dropMarkWrapper(fv.peg[0])
	}
	return dropPendingMarkWrappers(v)
}

// A path a held value answers reads that value, not the place around it.
func (rv *RefVal) heldSelf(ctx *Ctx) bool {
	parts := make([]string, 0, len(rv.peg))
	for _, p := range rv.peg {
		if s, ok := p.(string); ok {
			parts = append(parts, s)
		}
	}
	return rv.absolute && len(parts) == len(rv.peg) && 0 < heldFrom(ctx.armAt, parts)
}

func (rv *RefVal) find(ctx *Ctx, snap bool) Val {
	if rv.isPrefixPath() && !rv.heldSelf(ctx) {
		degenerate := 0 == len(rv.path)
		target := make([]string, 0, len(rv.peg))
		for _, p := range rv.peg {
			seg, ok := p.(string)
			if !ok || "" == seg {
				degenerate = true
				break
			}
			target = append(target, seg)
		}
		if degenerate {
			return makeNilErr(ctx, "path_cycle", rv, nil)
		}
		rec := newRecurse(target, rv.rxc)
		rec.site.sp, rec.site.spu, rec.site.url = rv.site.sp, rv.site.spu, rv.site.url
		// The source excerpt travels too, so reports frame the `$`
		// exactly as TS's residual site does.
		rec.site.src = rv.site.src
		rec.path = cp(rv.path)
		return rec
	}

	parts := make([]string, 0, len(rv.peg))
	for _, p := range rv.peg {
		if s, ok := p.(string); ok && unspellableSegment == s {
			return makeNilErr(ctx, "no_path", rv, nil)
		}
		if vv, ok := p.(*VarVal); ok {
			pv := vv.Unify(top(), ctx)
			if pv.Nil() {
				return pv
			}
			sv, ok := pv.(*ScalarVal)
			if !ok {
				// A non-scalar variable is not a usable path part
				// (TS coerces to a string that never matches).
				return makeNilErr(ctx, "no_path", rv, nil)
			}
			switch sv.kind {
			case KindString:
				parts = append(parts, sv.peg.(string))
			case KindInteger:
				parts = append(parts, strconv.FormatInt(sv.peg.(int64), 10))
			case KindFloat:
				parts = append(parts, formatNumber(sv.peg.(float64)))
			case KindBigInteger:
				// Plain digits, no `0d` marker — see RefVal.append.
				parts = append(parts, bigIntDigits(sv.peg.(*big.Int)))
			case KindBigDecimal:
				parts = append(parts, sv.peg.(*Decimal).digits())
			case KindBoolean:
				if sv.peg.(bool) {
					parts = append(parts, "true")
				} else {
					parts = append(parts, "false")
				}
			default:
				return makeNilErr(ctx, "no_path", rv, nil)
			}
			continue
		}
		s, ok := p.(string)
		if !ok {
			return nil
		}
		parts = append(parts, s)
	}

	var refpath []string
	if rv.absolute {
		refpath = parts
	} else {
		// A relative reference reads from the SIBLING scope: drop this
		// node's own key and append the written segments.
		end := len(rv.path) - 1
		if end < 0 {
			end = 0
		}
		base := append([]string{}, rv.path[:end]...)
		refpath = append(base, parts...)
	}
	refpath, ontree := reduceDots(refpath)
	if !ontree {
		return makeNilErr(ctx, "no_path", rv, nil)
	}

	node, outcome := rv.walkFrom(ctx, ctx.root, refpath, ctx.armAt)

	if walkMissed == outcome && rv.absolute && nil != ctx.fixroot &&
		ctx.fixroot != ctx.root {
		if fnode, fout := rv.walkFrom(ctx, ctx.fixroot, refpath, nil); walkFound == fout {
			node, outcome = fnode, fout
		}
	}

	switch outcome {
	case walkMissed:
		return makeNilErr(ctx, "no_path", rv, nil)
	case walkDefer:
		return nil
	}

	if nil != ctx.reads && nil != node {
		// The root is `$`, and an alias its own NAME.
		addr := "$"
		if aname, isAlias := rv.aliasName(); isAlias {
			addr += "." + aname
		} else {
			for _, seg := range refpath {
				addr += "." + seg
			}
		}
		if 0 == len(refpath) || !strings.HasPrefix(refpath[0], "%") {
			ctx.reads[addr] = true
		}
		if "" == node.readAddr() {
			node.setReadAddr(addr)
		}
	}

	switch node.(type) {
	case *RefVal, *FuncVal:
		if rv.detectRefCycle(ctx) { //coverage:ignore the alias-cycle rule refuses a cycle of paths before evaluation
			return makeNilErr(ctx, "path_cycle", rv, nil)
		}
	}

	// A hide() or type() still to settle is waited for, unless it reaches back here: that never settles.
	pending := !snap && !rv.hideFound && pendingMarkWrapper(node)
	if !snap && ctx.argsnap && (pending || node.Dc() != DONE) {
		return nil
	}

	if !snap {
		target := make([]string, 0, len(rv.peg))
		alls := true
		for _, p := range rv.peg {
			seg, ok := p.(string)
			if !ok {
				alls = false
				break
			}
			target = append(target, seg)
		}
		if alls && reachesRecurse(node, target, 0, ctx.root, map[string]bool{}, rv.template) {
			rec := newRecurse(target, rv.rxc)
			rec.site.sp, rec.site.spu, rec.site.url = rv.site.sp, rv.site.spu, rv.site.url
			// The source excerpt travels too, so reports frame the `$`
			// exactly as TS's residual site does.
			rec.site.src = rv.site.src
			rec.path = cp(rv.path)
			return rec
		}
	}
	if pending {
		return nil
	}

	// A ref carrying marks transfers them onto the found node in place,
	// as TS RefVal.find assigns them to `out` before the clone.
	if rv.mtype || rv.mhide {
		node.setMarkType(rv.mtype)
		node.setMarkHide(rv.mhide)
	}
	// move(): hide the source node in place — the mark lands on the
	// node's ROOT only; the bag unify loops ratchet it down one level
	// per pass, progressively freezing pending funcs in the ghost
	// (mirrors `out.mark.hide = true` for _hide_found in TS).
	if rv.hideFound {
		node.setMarkHide(true)
	}
	lifted := !ctx.argsnap || node.markedType() || node.markedHide()
	typed := node.markedType()
	var out Val
	staged := holdsStaged(node)
	if staged {
		out = clonePath(node, cp(rv.path))
	} else {
		out = instanceClone(node, cp(rv.path))
	}
	// The copy stands at the reference's own place, whatever the target's depth,
	// on arguments of its own: setting their paths would move the target's.
	moved := len(rv.path) != len(node.vpath()) && !slices.Contains(node.vpath(), "&")
	if staged && moved {
		ownArgs(out)
	}
	if moved && (staged || len(rv.path) < len(node.vpath())) {
		setPaths(out, cp(rv.path))
	}
	out = undeclared(out)
	// A path reads through a place that is itself a relative path; a name's use reads it again.
	if _, named := rv.aliasKey(); !named {
		out.setRereads(nil)
	}
	// A staged call's argument is a value read, with no place of its own.
	if !ctx.argsnap && holdsReread(out) {
		out = rereadAt(out, rv.path, false)
	}
	fixSeals(out)
	if lifted {
		if staged && !moved {
			ownArgs(out)
		}
		out = liftCopy(out, typed && !rv.copyFound)
	}
	if rv.copyFound {
		unsealTree(out)
		forceRootPath(out, cp(rv.path))
	} else if key, ok := rv.aliasKey(); ok {
		// An alias's copy remembers it; copy() unseals, so may admit more.
		out.setViaRec(unionVia(out.viaRec(), []string{key}))
		// A root reference's copy is at the root, not under its name.
		forceRootPath(out, cp(rv.path))
	}
	return out
}

func (rv *RefVal) detectRefCycle(ctx *Ctx) bool {
	return rv.chaseRefCycle(ctx, map[string]bool{})
}

func (rv *RefVal) chaseRefCycle(ctx *Ctx, ancestors map[string]bool) bool {
	rp := rv.plainRefPath()
	if rp == nil {
		return false
	}
	key := strings.Join(rp, " ")
	if ancestors[key] { //coverage:ignore the alias-cycle rule refuses a cycle of paths before evaluation
		return true
	}

	var node Val = ctx.root
	for _, part := range rp {
		switch n := node.(type) {
		case *MapVal:
			node = n.peg[part]
		case *ListVal:
			idx, err := strconv.Atoi(part)
			if err != nil || idx < 0 || idx >= len(n.peg) {
				return false
			}
			node = n.peg[idx]
		default:
			return false
		}
		if node == nil {
			return false
		}
	}

	// Terminates: each level adds a path to ancestors and refuses a
	// repeat, and the tree holds finitely many distinct paths.
	ancestors[key] = true
	defer delete(ancestors, key)

	switch n := node.(type) {
	case *RefVal:
		return n.chaseRefCycle(ctx, ancestors)
	case *FuncVal:
		for _, arg := range n.peg {
			if aref, ok := arg.(*RefVal); ok && aref.chaseRefCycle(ctx, ancestors) { //coverage:ignore the alias-cycle rule refuses a cycle of paths before evaluation
				return true
			}
		}
	}
	return false
}

func (rv *RefVal) plainRefPath() []string {
	parts := make([]string, 0, len(rv.peg))
	for _, p := range rv.peg {
		s, ok := p.(string)
		if !ok {
			return nil
		}
		parts = append(parts, s)
	}
	var refpath []string
	if rv.absolute {
		refpath = parts
	} else {
		end := len(rv.path) - 1
		if end < 0 {
			end = 0
		}
		base := append([]string{}, rv.path[:end]...)
		refpath = append(base, parts...)
	}
	reduced := make([]string, 0, len(refpath))
	for _, p := range refpath {
		if p == "." {
			if len(reduced) == 0 {
				return nil
			}
			reduced = reduced[:len(reduced)-1]
		} else {
			reduced = append(reduced, p)
		}
	}
	return reduced
}

// isPrefixPath reports whether the reference path is a prefix of this
// node's own path (a self/ancestor cycle).
func (rv *RefVal) isPrefixPath() bool {
	if len(rv.peg) > 0 && 0 == len(rv.path) {
		allEmpty := true
		for _, p := range rv.peg {
			if s, ok := p.(string); !ok || s != "" {
				allEmpty = false
				break
			}
		}
		if allEmpty {
			return true
		}
	}
	if len(rv.peg) == 0 || len(rv.peg) > len(rv.path) {
		return false
	}
	for i, p := range rv.peg {
		s, ok := p.(string)
		if !ok || s != rv.path[i] {
			return false
		}
	}
	return true
}

func varName(vv *VarVal) string {
	switch p := vv.peg.(type) {
	case string:
		return p
	case *ScalarVal:
		if p.kind == KindString {
			return p.peg.(string)
		}
	}
	return ""
}

// VarNames is every $name a parsed document reads, in order: the CLI
// refuses a binding that none of them is.
func VarNames(root Val) []string {
	names := map[string]bool{}
	eachPart(root, func(v Val) {
		if vv, ok := v.(*VarVal); ok && "" != varName(vv) {
			names[varName(vv)] = true
		}
	})
	return slices.Sorted(maps.Keys(names))
}

// MemberCanons is each top-level key of a map, in order, with its
// value's canon: the CLI binds a file of values by it. ok is false for
// a value that is no map.
func MemberCanons(v Val) (keys []string, canons []string, ok bool) {
	m, isMap := v.(*MapVal)
	if !isMap {
		return nil, nil, false
	}
	keys = slices.Sorted(maps.Keys(m.peg))
	for _, k := range keys {
		canons = append(canons, m.peg[k].Canon())
	}
	return keys, canons, true
}

// HoldsReference reports whether a value still reads a path or a
// variable: a binding that does is refused.
func HoldsReference(root Val) bool {
	holds := false
	eachPart(root, func(v Val) {
		switch v.(type) {
		case *RefVal, *VarVal:
			holds = true
		}
	})
	return holds
}

func eachPart(root Val, visit func(Val)) {
	seen := map[Val]bool{}
	stack := []Val{root}
	for 0 < len(stack) {
		v := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if nil == v || seen[v] {
			continue
		}
		seen[v] = true
		visit(v)
		stack = append(stack, partsOf(v)...)
	}
}

// reduceDots collapses parent-navigation markers ("."). It answers
// false for a step off the top, which names nothing: no later pass can
// grow a tree upwards.
func reduceDots(path []string) ([]string, bool) {
	out := make([]string, 0, len(path))
	for _, p := range path {
		if p == "." {
			if 0 == len(out) {
				return nil, false
			}
			out = out[:len(out)-1]
		} else {
			out = append(out, p)
		}
	}
	return out, true
}

// refSpelling is the same-path identity of a peer: a reference's own
// spelling, any other value's canon (which no spelling can equal).
func refSpelling(v Val) string {
	if pr, ok := v.(*RefVal); ok {
		return pr.spelling()
	}
	return v.Canon()
}

// THE KEY THIS REFERENCE RESOLVES AGAINST: one segment that is a name,
// carrying the url of the file it was written in.
func (rv *RefVal) aliasKey() (string, bool) {
	if rv.absolute && 1 == len(rv.peg) {
		if s, ok := rv.peg[0].(string); ok {
			if n := aliasBareName(s); aliasRe.FindString(n) == n {
				return s, true
			}
		}
	}
	return "", false
}

func (rv *RefVal) aliasName() (string, bool) {
	if key, ok := rv.aliasKey(); ok {
		return aliasBareName(key), true
	}
	return "", false
}

// refSnapKey is the key a ref spread's structural snapshot is stored
// under (snapshotRefSpread): the reference's own spelling and its
// source position, so clones of the reference find the snapshot their
// parse-origin captured. Twin of spreadSnapKey in ts/src/val/MapVal.ts.
func refSnapKey(rv *RefVal) string {
	return rv.spelling() + "~" + rv.srcurl() + "~" + itoa(rv.site.sp)
}

func (rv *RefVal) Canon() string {
	if nil != rv.expansion {
		return rv.expansion.Canon()
	}
	return rv.spelling()
}

func (rv *RefVal) spelling() string {
	if name, ok := rv.aliasName(); ok {
		return name
	}
	var b strings.Builder
	if rv.absolute {
		b.WriteByte('$')
	}
	if len(rv.peg) > 0 {
		b.WriteByte('.')
	}
	parts := make([]string, len(rv.peg))
	for i, p := range rv.peg {
		switch pp := p.(type) {
		case string:
			if pp == "." {
				parts[i] = ""
			} else {
				parts[i] = pp
			}
		case Val:
			parts[i] = pp.Canon()
		}
	}
	b.WriteString(strings.Join(parts, "."))
	return b.String()
}

func (rv *RefVal) Gen(ctx *Ctx) (any, error) {
	// Code mirrors TS RefVal.gen ('ref').
	return nil, residueWalkOn(ctx, rv, "ref")
}

// VarVal is a variable reference (e.g. `$name`). Full variable lookup
// is ported later; for now it resolves only via RefVal special names.
type VarVal struct {
	base
	peg any
}

func newVar(name any) *VarVal {
	v := &VarVal{peg: name}
	v.site.sp = unsited
	return v
}

func (vv *VarVal) superior() Val { return top() }

func (vv *VarVal) Canon() string {
	if v, ok := vv.peg.(Val); ok {
		return "$" + v.Canon()
	}
	if s, ok := vv.peg.(string); ok {
		return "$" + s
	}
	return "$"
}

func (vv *VarVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	// $.a.b form: an absolute path reference.
	if rv, ok := vv.peg.(*RefVal); ok {
		rv.absolute = true
		return rv.Unify(peer, ctx)
	}
	// $name form: look the variable up in the context (mirrors
	// VarVal.unify in ts/src/val/VarVal.ts).
	name := varName(vv)
	if name == "" {
		return makeNilErr(ctx, "var", vv, peer)
	}
	if ctx.vars != nil {
		if found, ok := ctx.vars[name]; ok {
			// A variable its own source refused keeps that refusal, where it stands.
			var refused []*NilVal
			if collectNils(found, &refused, map[Val]bool{}); 0 < len(refused) {
				return clonePath(found, cp(found.vpath()))
			}
			// A variable is a value: one that reads a path has no place to read it from.
			if HoldsReference(found) {
				return makeNilErr(ctx, "invalid_var_kind", vv, peer)
			}
			// Unify the resolved value with the peer so a constraint
			// unified against the var (e.g. a spread clone) applies to
			// its value rather than being silently dropped.
			out := clonePath(found, cp(vv.path))
			if peer != nil && !isTop(peer) {
				return unite(ctx, out, peer)
			}
			return out
		}
	}
	return makeNilErr(ctx, "unknown_var", vv, peer)
}

func (vv *VarVal) Gen(ctx *Ctx) (any, error) {
	// Silent (mirrors the TS FeatureVal gen pattern): the enclosing
	// bag reports unresolved vars.
	return nil, nil
}

// A link's template reads the relative paths that stay inside it where it lands, at the link's
// target (ruling 50); one that climbs past the template reads where the link is written.
func landPaths(tmpl Val, base []string) {
	walkVals(tmpl, func(t Val) bool {
		if r, ok := t.(*RefVal); ok && !r.absolute {
			climbs := 0
			for climbs < len(r.peg) && "." == r.peg[climbs] {
				climbs++
			}
			r.lands = r.lands || climbs < len(r.path)-len(base)
		}
		return true
	}, map[Val]bool{})
}

// The template as it lands: each such path read at the target.
func landedAt(t Val, to []string) Val {
	out := instanceClone(t, t.vpath())
	if landsOnly(t) {
		setPaths(out, cp(to))
	}
	walkVals(out, func(t Val) bool {
		if r, ok := t.(*RefVal); ok {
			r.lands = false
		}
		return true
	}, map[Val]bool{})
	return out
}

// Whether a template waits for nothing but the paths it reads where it lands.
func landsOnly(tmpl Val) bool {
	lands, other := false, false
	walkVals(tmpl, func(t Val) bool {
		r, isRef := t.(*RefVal)
		lands = lands || (isRef && r.lands)
		if f, isFunc := t.(*FuncVal); isFunc && 0 == len(f.peg) {
			other = other || DONE != t.Dc()
		}
		other = other || (isRef && !r.lands)
		return !other
	}, map[Val]bool{})
	return lands && !other
}
