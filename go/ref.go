/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
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

// walkFrom walks refpath from one root. Split out of Unify so the
// anchored-meet fallback can run the SAME walk against a second root
// (ctx.fixroot) without duplicating the mark-wrapper and list-index
// rules -- two copies of this walk is how the ports drift.
func (rv *RefVal) walkFrom(root Val, refpath []string) (Val, walkOutcome) {
	var node Val = root
	if nil == node {
		return nil, walkMissed
	}
	for _, part := range refpath {
		// A PENDING MARK WRAPPER IS TRANSPARENT TO THE WALK: hide()
		// and type() only mark, and their argument is the structure
		// the path names. Without this, two sibling schemas in one
		// hide() bag deadlock -- the wrapper waits for its argument,
		// the argument's members wait for references that walk into
		// the unresolved wrapper (BUGS.md §53's family; the recursive
		// Policy/Step pair found it again). Mirrors the walk arm in
		// ts/src/val/RefVal.ts find.
		if fv, ok := node.(*FuncVal); ok && DONE != fv.dc &&
			("hide" == fv.name || "type" == fv.name) && 0 < len(fv.peg) {
			if inner, ok := fv.peg[0].(*MapVal); ok {
				node = inner
			}
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
			if node.Dc() == DONE {
				return nil, walkMissed
			}
			return nil, walkDefer
		}
		if node == nil {
			return nil, walkMissed
		}
	}
	return node, walkFound
}

func newRef(terms []any, prefix bool) *RefVal {
	rv := &RefVal{prefix: prefix}
	rv.sp = unsited
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
			// A PATH SEGMENT IS SPELLED TEXT, not a value.
			//
			// Only a plain decimal integer is a numeric segment: `$.a.1`
			// indexes a list and reaches the key `1`. Every other numeric
			// spelling addresses the key spelled exactly that way, because
			// that is what the spelling already produces on the KEY side --
			// `a:{0x0:1}` generates {"0x0":1}, not {"0":1}, so a path
			// spelled like its key is the whole point.
			//
			// Normalising here made `$.a.0x0` address `0`, `$.a.1_0`
			// address `10` and `$.a.1e2` address `100` -- each of them a
			// silently WRONG location rather than a miss.
			//
			// src is empty for a value with no literal behind it (a
			// computed segment, an API-built value), and there the numeric
			// rendering is the only answer available.
			rv.peg = append(rv.peg, srcOr(p.src,
				func() string { return strconv.FormatInt(p.peg.(int64), 10) }))
		case KindFloat:
			// A float splits on its point, so `$.x.1.5` addresses two
			// levels -- of the text, which is what makes `$.x.1e2` a
			// single segment `1e2` rather than the expanded `100`.
			for _, s := range strings.Split(srcOr(p.src,
				func() string { return formatNumber(p.peg.(float64)) }), ".") {
				rv.peg = append(rv.peg, s)
			}
		case KindBigInteger:
			rv.peg = append(rv.peg, srcOr(p.src,
				func() string { return bigIntDigits(p.peg.(*big.Int)) }))
		case KindBigDecimal:
			for _, s := range strings.Split(srcOr(p.src,
				func() string { return p.peg.(*Decimal).digits() }), ".") {
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
	default:
		// A closed chain, deliberately. Every branch above ends in an
		// append, so an unhandled value class used to fall through in
		// SILENCE and shorten the path by one segment — which is how
		// `**.true` built an EMPTY prefix path that resolved to its own
		// container, leaving a PrefVal whose peg was itself and an
		// unrecoverable stack overflow in Canon. A segment that cannot
		// be spelled is pushed as one that cannot match, so the
		// reference misses loudly instead of succeeding wrongly.
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
	found := rv.find(ctx, false)
	if found == nil {
		// Not yet resolved: defer.
		switch {
		case isTop(peer):
			out = rv
		case peer.Nil():
			out = makeNilErr(ctx, "ref", rv, peer)
		case rv.Canon() == peer.Canon():
			out = rv
		default:
			out = newConjunct([]Val{rv, peer})
		}
	} else if _, chain := found.(*RefVal); chain {
		// The target is itself still a reference: defer a pass, so a
		// chain of plain refs resolves ONE LINK PER PASS from the tail —
		// the TS `resolved instanceof RefVal` branch, and the semantics
		// the pass budget is defined over (issue #26). Driving the found
		// ref here chased the whole chain within a single pass, which
		// let Go resolve 10+-link chains the canonical engine's budget
		// refuses. (A PROVEN mutual cycle never reaches this: find's
		// detectRefCycle reports path_cycle before returning the ref.)
		switch {
		case isTop(peer):
			out = rv
		case peer.Nil():
			out = makeNilErr(ctx, "ref", rv, peer)
		case rv.Canon() == peer.Canon():
			out = rv
		default:
			out = newConjunct([]Val{rv, peer})
		}
	} else {
		if slot == nil {
			slot = rv.path
		}
		ctx.slot = slot
		out = unite(ctx, found, peer)
	}

	if out.Dc() != DONE {
		out.setDc(rv.dc + 1)
	}
	return out
}

// find resolves the reference against ctx.root. It returns the cloned
// target, a NilVal (path not found / cycle), or nil when resolution
// must be retried on a later pass.
// listIndex reads a path segment as a list index. CANONICAL DECIMAL
// ONLY: `0`, or a non-zero digit followed by digits. Atoi was too
// generous -- it accepted a sign and leading zeros, so `$.a.01` and
// `$.a.-0` resolved here while the canonical port refused them
// (JavaScript array indexing is canonical too, which is what its
// resolver leans on). docs/reference-language.md says a numeric segment
// is recognised "only as a plain decimal integer"; this is that rule,
// spelled out.
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

// `snap` is set by snapshotRefSpread (mapval.go): a SPREAD snapshot
// wants the target's pre-resolution STRUCTURE — key()/path() still
// unresolved, to be re-resolved per destination — so the
// pending-mark-wrapper defer must not apply to it (deferring there
// leaked the target's own resolved key() literal into every
// destination — test/spec/spread-type.tsv, spread-type-key-ref).
func (rv *RefVal) find(ctx *Ctx, snap bool) Val {
	if rv.isPrefixPath() {
		// THE DETECTOR'S ANSWER IS A RESIDUAL (RECURSION.0.md): a
		// self-reference under a guarded shape is the fixpoint the
		// author wrote, so the prefix hit mints the recursive
		// residual instead of refusing -- except the degenerate
		// all-empty spelling (path("")), which names nothing and
		// keeps its path_cycle. Only all-string non-empty paths
		// recurse; anything else keeps the conservative refusal.
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
		rec := newRecurse(target, 0)
		rec.sp, rec.spu, rec.surl = rv.sp, rv.spu, rv.surl
		// The source excerpt travels too, so reports frame the `$`
		// exactly as TS's residual site does.
		rec.stext = rv.stext
		rec.path = cp(rv.path)
		return rec
	}

	parts := make([]string, 0, len(rv.peg))
	for _, p := range rv.peg {
		// An unspellable segment MISSES BEFORE ANY LOOKUP. The marker is
		// NUL-prefixed because no spelling produces one, but a document
		// can still hold a key spelled with an escaped NUL
		// (`a:{" unspellable":7}`), and matching it would turn the
		// silent path-shortening this marker exists to prevent into a
		// different silent wrong value. The marker is a marker, never a
		// lookup key.
		if s, ok := p.(string); ok && unspellableSegment == s {
			return makeNilErr(ctx, "no_path", rv, nil)
		}
		if vv, ok := p.(*VarVal); ok {
			// EVERY `$name` IN A PATH IS AN ORDINARY VARIABLE, resolved
			// via the variable table (mirrors part.unify(top()) in ts
			// RefVal.find); an unknown variable is an error (recorded by
			// VarVal.Unify via makeNilErr). `$KEY`, `$SELF` and
			// `$PARENT` used to be intercepted here by name; they are
			// gone (ADR-009).
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
	refpath = reduceDots(refpath)

	node, outcome := rv.walkFrom(ctx.root, refpath)

	// THE ANCHORED-MEET FALLBACK (vet --at), the Go side of the block
	// in ts/src/val/RefVal.ts find. An anchor is a SUBTREE lifted out
	// of the schema, and an absolute reference inside it names the
	// document root's namespace -- a `%alias` declaration
	// (`[&: %U]`, whose target is `$.%U`), or a recursive residual's
	// `$.spec.Step`. The meet's root is the lifted subtree, which has
	// no such sibling, so the walk misses and the reference dies as
	// no_path at the first element.
	//
	// ctx.fixroot is the SETTLED schema root the lifter kept for
	// exactly this (vet.go, and RecurseVal.body in recurse.go, which
	// already read it). TypeScript's copy of this comment used to say
	// the Go port "answers the anchored meet from settled structures
	// and never sees the gap"; it does see it -- an alias-heavy schema
	// under `vet --at` was INVALID in Go and VALID in TypeScript, which
	// for the verb whose purpose is to be a CI gate is the worst
	// direction for a divergence to run (BUGS.md §59).
	if walkMissed == outcome && rv.absolute && nil != ctx.fixroot &&
		ctx.fixroot != ctx.root {
		if fnode, fout := rv.walkFrom(ctx.fixroot, refpath); walkFound == fout {
			node, outcome = fnode, fout
		}
	}

	switch outcome {
	case walkMissed:
		return makeNilErr(ctx, "no_path", rv, nil)
	case walkDefer:
		return nil
	}

	// A reference landing on another reference may be a PROVEN mutual
	// cycle (a: $.b, b: $.a) -- follow the plain-ref chain and, if it
	// revisits a node, report path_cycle now instead of deferring every
	// pass and dying later as a generic ref error. No proof (chain
	// leaves plain refs, or ends) defers as before. Mirrors the chase
	// before the clone in TS RefVal.find.
	// A reference landing on another reference -- or on a FUNCTION, whose
	// arguments the chase now follows (issue #35) -- may be a PROVEN
	// mutual cycle. Same guard as the TS RefVal.find branch.
	switch node.(type) {
	case *RefVal, *FuncVal:
		if rv.detectRefCycle(ctx) {
			return makeNilErr(ctx, "path_cycle", rv, nil)
		}
	}

	// A PENDING MARK WRAPPER IS NOT YET A VALUE TO COPY (ADR-005). A
	// type()/hide() call still waiting for its argument would be cloned
	// here as the CALL, and the clone then resolves at the REFERENCE's
	// site, stamping marks the mark-clearing walk below has already run
	// too early to clear — a type-marked alias silently suppressed the
	// referring field's emission (use-cases/BUGS.md §12), hide(pack(…))
	// leaked its mark onto downstream packs (§11), hide() around a
	// computed field swallowed the value into a silent [] (§35b).
	// Defer instead: the reference residuates until the wrapper has
	// resolved at its OWN field, and the marked-value path below then
	// clears the marks on the clone as documented. The move() reference
	// (hideFound) is exempt — a move TRANSPLANTS the pending call
	// (test/spec/func.tsv ghost rows) — and so is the spread snapshot
	// (snap), which WANTS the pre-resolution structure. Mirrors the
	// same guard in ts/src/val/RefVal.ts.
	if !snap && !rv.hideFound && pendingMarkWrapper(node) {
		return nil
	}

	// A STAGED ARGUMENT SNAPSHOTS A SETTLED SOURCE (Ctx.argsnap, set by
	// stagedDrive). A generator's data argument is a copy OUTSIDE the
	// tree, so anything in the target still resolving against its own
	// tree location — a spread-injected relative reference, a pending
	// template — must finish there BEFORE the copy is taken: cloned
	// earlier, the copy's rebased relative refs dangle under the
	// generator and the model dies as *_no_gen with the generator never
	// firing. Deferring is the documented staging rule: the generator
	// waits for the source, then snapshots it whole. Mirrors the same
	// guard in ts/src/val/RefVal.ts find.
	if !snap && ctx.argsnap && node.Dc() != DONE {
		return nil
	}

	// A REFERENCE TO A RECURSIVE DEFINITION IS THE FIXPOINT REFERENCE
	// (RECURSION.0.md): resolving it to a clone unrolled the schema
	// one level, and every reparse of a canon then unrolled one more
	// -- canon never converged. The residual is the resolved form,
	// exactly as at the prefix positions inside the definition.
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
		if alls && containsRecurseOf(node, target, 0) {
			rec := newRecurse(target, 0)
			rec.sp, rec.spu, rec.surl = rv.sp, rv.spu, rv.surl
			// The source excerpt travels too, so reports frame the `$`
			// exactly as TS's residual site does.
			rec.stext = rv.stext
			rec.path = cp(rv.path)
			return rec
		}
	}

	// A ref carrying marks transfers them onto the found node in place
	// (mirrors the mark assignment on `out` before the clone in TS
	// RefVal.find).
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
	out := clonePath(node, cp(rv.path))
	// A resolved reference's clone is concrete: clear type/hide marks
	// on the whole clone, root included (mirrors the mark-clearing
	// walk in TS RefVal.find). With shared func-clone args this also
	// clears marks on innards shared with the source — as in TS.
	walkMark(out, true, false, true, false)
	// REFERENCES DO NOT CARRY IDENTITY (G4 phase 1, clearing rule 1):
	// the clone is a copy of an entity, not the entity.
	walkClearEntity(out)
	// copy(): the copied root's path is fully replaced by the
	// destination (TS FuncBaseVal sets out.path = this.path on the
	// resolved copy), unlike the transplant overlay that keeps deeper
	// source tails — `y:copy($.x.a.k)` resolves key() against the bare
	// [y] path (""), not [y,a,k].
	if rv.copyFound {
		forceRootPath(out, cp(rv.path))
	}
	return out
}

// detectRefCycle follows the chain of plain references from rv; true
// iff the chain returns to a node still open above it -- a PROVEN
// reference cycle, distinct from a merely unresolved reference.
// Detection is only on the resolution chain revisiting a node, never on
// syntactic shape: a chain that passes through a variable segment, a
// conjunct or any other non-ref value yields no proof and the ref defers
// as before.
//
// A FUNCTION is followed, through its arguments (issue #35). A function
// resolves only once every argument does, so a chain reaching
// `b:upper($.a)` and leaving through `$.a` has proved the same
// dependency a bare `b:$.a` proves. Mirrors detectRefCycle in TS RefVal,
// arm for arm -- and matters here for WHERE the failure is reported, not
// whether: this port already proved the shape one step later, through
// the isprefixpath test, once clonePath had re-pathed the resolved clone
// to the referring site. Proving it at the same point as TypeScript is
// what makes both name the same path.
func (rv *RefVal) detectRefCycle(ctx *Ctx) bool {
	return rv.chaseRefCycle(ctx, map[string]bool{})
}

// chaseRefCycle is detectRefCycle's depth-first walk. Depth-first with an
// explicit ANCESTOR set, because a function may carry several reference
// arguments and the cycle can run through any one of them. The set holds
// the chain currently being walked, not every node ever walked:
// revisiting a node reached down a DIFFERENT branch is an ordinary shared
// reference (two keys reading one third key), and only revisiting one
// still open above us is a cycle.
//
// Identity is the RESOLVED PATH, not the *RefVal: the same target can be
// reached through distinct ref instances, and it is returning to the same
// place that closes a loop.
func (rv *RefVal) chaseRefCycle(ctx *Ctx, ancestors map[string]bool) bool {
	rp := rv.plainRefPath()
	if rp == nil {
		return false
	}
	key := strings.Join(rp, " ")
	if ancestors[key] {
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
			if aref, ok := arg.(*RefVal); ok && aref.chaseRefCycle(ctx, ancestors) {
				return true
			}
		}
	}
	return false
}

// plainRefPath is the resolved absolute path of a reference whose
// segments are all plain strings; nil when the ref has variable
// segments (no cycle proof is attempted for those). Mirrors find's
// refpath computation for the plain case, with a conservative bail on
// a parent step off the top of the path.
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
	// The degenerate spelling: every segment empty, so the reference names
	// nothing and lands back where it started. `path("")` is the way to
	// write it, and TS treats it as a cycle rather than a miss (issue #38)
	// -- there is no key to be missing.
	if len(rv.peg) > 0 {
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

// reduceDots collapses parent-navigation markers (".").
func reduceDots(path []string) []string {
	out := make([]string, 0, len(path))
	for _, p := range path {
		if p == "." {
			if len(out) > 0 {
				out = out[:len(out)-1]
			}
		} else {
			out = append(out, p)
		}
	}
	return out
}

func (rv *RefVal) Canon() string {
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
	return nil, residueErr(ctx, rv, "ref")
}

// VarVal is a variable reference (e.g. `$name`). Full variable lookup
// is ported later; for now it resolves only via RefVal special names.
type VarVal struct {
	base
	peg any // variable name (string) or a Val
}

func newVar(name any) *VarVal {
	v := &VarVal{peg: name}
	v.sp = unsited
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

// srcOr returns a literal's own source text, falling back to a computed
// rendering when there is no literal behind the value (see ScalarVal.src).
func srcOr(src string, gen func() string) string {
	if src != "" {
		return src
	}
	return gen()
}
