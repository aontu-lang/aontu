/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
	"sort"
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// funcSet is the set of recognised built-in function names (mirrors the
// funcMap in ts/src/lang.ts). The constraint atoms (constraintAtoms in
// constraint.go) are members so name recognition stays in one set; the
// func-paren handler routes them to newConstraint, not newFunc.
var funcSet = map[string]bool{
	"upper": true, "lower": true, "copy": true, "key": true,
	"pref": true, "super": true, "type": true, "hide": true,
	"move": true, "path": true, "close": true, "open": true,
	"map": true, "list": true,
	"min": true, "max": true, "above": true, "below": true, "neq": true,
	"re": true, "length": true, "unique": true, "must": true,
	"deprecate": true,
	"rel":       true,
	"acyclic":   true,
	"inverse":   true,
	"refer":     true,
	"pack":      true,
	"each":      true,
	"filter":    true,
	"match":     true,
	// The arithmetic family (the review's finding I). Maths beyond `+`
	// arrives as FUNCTIONS -- `-` `*` `/` `%` stay reserved -- and the
	// family is numeric where the operator is polymorphic, which is
	// what makes add more than a second spelling of `+`: it refuses the
	// string concatenation that silently answers "500m" + "500m".
	// Every rule they obey is in go/arith.go.
	"add": true,
	"sub": true,
	"mul": true,
	"div": true,
	"mod": true,
	"rem": true,
	// Aggregation over a finite, settled bag (also finding I). least and
	// greatest rather than min and max, which are already the atoms for a
	// lower and an upper BOUND -- an aggregate over a set and a bound on
	// a value must not share a spelling. See go/agg.go.
	"sum":      true,
	"least":    true,
	"greatest": true,
	// Projection, which is what lets the aggregates reach a bag of
	// RECORDS. Not a clever each template -- each MEETS each child, and
	// a meet cannot select.
	"pick": true,
	// G9 phase 2: the fold to a STRING. sum folds with add; this folds
	// with `+`, so it inherits the one number-to-text rule and the
	// language does not grow a second.
	"join": true,
}

// stagedFuncs take THE STAGING RULE (G8 phase 0, see Ctx.settle): they
// residuate until the model stops moving and fire exactly once. key()
// because its answer is a segment of its own path; pack() and each()
// because their data argument can still be merged into by a sibling
// after it first looks done. Mirrors the `staged` flag on the TS
// FuncBaseVal subclasses.
var stagedFuncs = map[string]bool{
	"key": true, "pack": true, "each": true, "filter": true, "match": true,
	// A total over a bag that is still being merged into is a total of
	// the wrong bag.
	"sum": true, "least": true, "greatest": true, "pick": true,
	// A fold over a bag still being merged into folds the wrong bag.
	"join": true,
}

// THE SIGNATURE REGISTRY (docs/design/SIGNATURES.0.md). The call
// surface is DECLARED in test/spec/signature.tsv and parsed by the
// signature grammar (go/sig.go) from the embedded copy; the arity
// table and the positional set below are DERIVED from the parse, so
// the declaration is the one source. ts/src/lang.ts derives the same
// two tables from the same text.

// positionalArgFuncs are the functions whose comma-separated arguments
// are distinct POSITIONS rather than one argument list. The parser
// expands their comma group back into separate arguments (lang.go).
// Derived: two or more declared argument slots, excluding the residual
// producers (`constraint` results) -- the constraint atoms make the
// same expansion in their own constructor (atomArgs, constraint.go,
// deliberately before the settled check), which is why they are not in
// this set; `must` is the load-bearing example. Arithmetic is here
// because sub is not commutative: sub(a, b) reaching the engine as one
// two-element list would lose which is which.
var positionalArgFuncs = derivePositional()

func derivePositional() map[string]bool {
	out := map[string]bool{}
	for name, sig := range funcSig {
		if 2 <= len(sig.Args) && "constraint" != sig.Out {
			out[name] = true
		}
	}
	return out
}

// generatorFuncs hold arguments that must never be driven at the call
// site: a TEMPLATE, because driving it would resolve its key() at the
// one position the template is never used at, and a match RESULT,
// because an arm nobody takes must not be evaluated (and must not
// report). What they DO need driven -- the data, the condition, the
// patterns -- is driven by hand instead (stagedDrive).
var generatorFuncs = map[string]bool{
	"pack": true, "each": true, "filter": true, "match": true,
}

// funcArity is the permitted WRITTEN argument count of each built-in, as
// {min, max}; a max of -1 is unbounded. Every name in funcSet has an
// entry, and the arity is a property of the language rather than of
// either port -- ts/src/lang.ts derives the same table. A required
// slot counts toward the minimum; a rest slot makes the maximum
// unbounded and counts its group size (one, for a plain rest type)
// toward the minimum, which is what gives match its floor of three
// and neq its floor of one.
var funcArity = deriveArity()

func deriveArity() map[string][2]int {
	out := map[string][2]int{}
	for name, sig := range funcSig {
		min, max := 0, 0
		for _, a := range sig.Args {
			if a.Rest {
				if nil == a.Group {
					min++
				} else {
					min += len(a.Group)
				}
				max = -1
			} else {
				if !a.Opt {
					min++
				}
				if -1 != max {
					max++
				}
			}
		}
		out[name] = [2]int{min, max}
	}
	return out
}

// writtenArgCount counts the arguments as the AUTHOR wrote them.
//
// It cannot simply be len(terms): a comma group reaches the func-paren
// handler as ONE term holding a raw slice, so `upper("a","b")` and
// `upper(["a","b"])` both arrive as a single argument. They are still
// distinguishable, and that is what makes an arity check possible at
// all -- the comma group is a RAW []any, while a written list literal
// has already been built into a *ListVal by the list rule.
func writtenArgCount(terms []any) int {
	if 1 == len(terms) {
		if raw, ok := terms[0].([]any); ok {
			return len(raw)
		}
	}
	return len(terms)
}

// arityText renders a built-in's permitted count for the error message.
// The fixed-arity case says "one" or "two" outright rather than
// counting: every fixed arity in the table is one of those, and a
// phrasing for a count no entry carries would be untested prose
// pretending to be tested.
func arityText(lo, hi int) string {
	switch {
	case -1 == hi:
		return "one or more arguments"
	case lo != hi:
		if 0 == lo {
			return "no arguments or one"
		}
		return "one argument or two"
	// The {0,0} arm returned with the container kinds and acyclic()
	// (ADR-015): map(1) must not claim map takes exactly one.
	case 0 == hi:
		return "no arguments"
	case 2 == hi:
		return "exactly two arguments"
	default:
		return "exactly one argument"
	}
}

// BuiltinFuncNames returns the recognised built-in function names in
// sorted order. Exposed for tooling (e.g. LSP completion in go/lsp).
func BuiltinFuncNames() []string {
	names := make([]string, 0, len(funcSet))
	for n := range funcSet {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// FuncVal is a built-in function call (e.g. `upper(x)`). It follows the
// FuncBaseVal pattern (ts/src/val/FuncBaseVal.ts): operands are resolved
// to done, then resolve() computes the result; otherwise it defers.
type FuncVal struct {
	base
	name string
	peg  []Val // arguments
	// prepared marks the one-time argument rewrite (currently path()'s
	// scalar-to-reference wrap) as done, mirroring TS's `prepared`
	// counter: the rewrite reads RAW arguments and must not see them
	// again once they have resolved. Clones start unprepared only if the
	// clone copies it -- see clonePath, which carries it, because a clone
	// shares the already-rewritten args.
	prepared bool
}

func newFunc(name string, args []Val) *FuncVal {
	f := &FuncVal{name: name, peg: args}
	f.sp = unsited
	return f
}

func (f *FuncVal) superior() Val {
	if (f.name == "upper" || f.name == "lower") && len(f.peg) > 0 {
		if sv, ok := f.peg[0].(*ScalarVal); ok {
			return newScalarKind(sv.kind)
		}
	}
	// NO ARITHMETIC ARM HERE, deliberately. An arithmetic call would
	// only be able to advertise a kind once both its operands were
	// concrete scalars -- and at that point it has RESOLVED, so what
	// super() sees is the result, whose own superior is already the
	// right answer: super(mul(2,3)) is integer and super(mul(2,1.5)) is
	// float, through the value rather than through a promise about it.
	// The arm was written and then removed as unreachable; the same is
	// true of ArithFuncVal in the TypeScript port.
	return top()
}

func (f *FuncVal) Canon() string {
	parts := make([]string, len(f.peg))
	for i, a := range f.peg {
		parts[i] = a.Canon()
	}
	return f.name + "(" + strings.Join(parts, ",") + ")"
}

func (f *FuncVal) Gen(ctx *Ctx) (any, error) {
	// Silent (mirrors KeyFuncVal.gen and the FuncBaseVal pattern in
	// TS): the enclosing bag reports unresolved funcs.
	return nil, nil
}

// captureSpelling is the address a reference SPELLS, or not-ok when
// its segments cannot spell one (a variable segment, a parent step
// after the first named segment). Leading `.` entries in a relative
// ref's peg are parent steps; the spelling is the same grammar refer
// reads, so parseAddress stays the single gate. Mirrors
// captureSpelling in ts/src/val/PathFuncVal.ts.
func captureSpelling(rv *RefVal) (string, bool) {
	parts := []string{}
	up := 0
	lead := true
	for _, p := range rv.peg {
		seg, isStr := p.(string)
		if !isStr {
			return "", false
		}
		if "." == seg {
			if !lead {
				return "", false
			}
			up++
			continue
		}
		lead = false
		parts = append(parts, seg)
	}
	if 0 == len(parts) || (rv.absolute && 0 < up) {
		return "", false
	}
	if rv.absolute {
		return "$." + strings.Join(parts, "."), true
	}
	return strings.Repeat(".", up+1) + strings.Join(parts, "."), true
}

func (f *FuncVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	if Val(f) == peer {
		return f
	}

	// The location this func is being driven at (the TS ctx.path): the
	// caller's slot hint when present, else the func's own stored path
	// — identical except for shared/transplanted clones, whose stored
	// paths carry overlay tails that the driving ctx does not.
	base := ctx.slot
	if base == nil {
		base = f.path
	}

	// THE STAGING RULE (G8 phase 0, see Ctx.settle). key()'s answer is a
	// segment of its own path, so it must not answer while a spread, a
	// reference or a move() can still move it; pack()'s and each()'s
	// data can still be merged into after it first looks done. All
	// three residuate until the model stops changing and fire on the
	// settle pass. Mirrors the `staged` flag and FuncBaseVal.residuate
	// in ts/src/val/FuncBaseVal.ts.
	if stagedFuncs[f.name] {
		// A generator's DATA argument is driven every pass, not only on
		// the settle pass: it is what the model has to settle, so
		// leaving it standing until settle would guarantee the model was
		// still moving when settle arrived.
		ready := stagedDrive(ctx, f, base) && ctx.settle

		if !ready {
			f.notdone()
			switch {
			case isTop(peer):
				// The residuation clone re-paths via the driving ctx (TS
				// `this.clone(ctx)` — overlay of the stored path on
				// ctx.path).
				return clonePath(f, overlayPath(base, f.path))
			case peer.Nil():
				return peer
			default:
				// An identical twin at the same position collapses (the
				// same-name same-path same-args check in TS
				// FuncBaseVal.residuate): `key()&key()` folds to one
				// pending key() while both residuate.
				if pf, ok := peer.(*FuncVal); ok && pf.name == f.name &&
					pathEq(pf.path, f.path) && pf.Canon() == f.Canon() {
					return f
				}
				return newConjunct([]Val{f, peer})
			}
		}
	}

	// THE PLACEHOLDER (G8 phase 3, see place.go). A call holding a hole
	// waits for a peer, and the peer is what fills it: the call is
	// rebuilt with the hole replaced and resolved on the spot, so
	// `upper(_) & hello` is `"HELLO"` and not `"HELLO" & "hello"` --
	// the peer went INTO the call, it is not also a constraint on the
	// way out. Mirrors the same arm in ts/src/val/FuncBaseVal.ts.
	if !isTop(peer) && !peer.Nil() && Val(f) != peer && hasPlace(f) {
		// TWO HOLES AND NOTHING TO FILL THEM. `upper(_) & lower(_)` has
		// no value on either side, and picking one call to be the
		// other's filling would be inventing an order the language does
		// not have.
		if hasPlace(peer) {
			return makeNilErr(ctx, "place_pair", f, peer)
		}
		ctx.slot = base
		return unite(ctx, fillPlace(f, peer), top())
	}

	// A marked func freezes against TOP instead of resolving (the
	// `peer.isTop && (mark.type || mark.hide) -> dc = DONE` shortcut in
	// TS FuncBaseVal.unify). The hide mark arrives either directly
	// (hide()/type() marks, the move() hide-found mark on the source
	// root) or via the bag mark ratchet pushing a parent's mark down
	// one level per pass. A frozen func still RESOLVES against a
	// non-TOP peer (e.g. a spread clone applied to a hidden child) —
	// the freeze is TOP-only, exactly as in TS.
	if isTop(peer) && (f.mtype || f.mhide) {
		f.setDc(DONE)
		return f
	}

	// path(p) CAPTURES p -- the spelling, never the resolution
	// (docs/design/PATHS.0.md): the one non-strict argument position in
	// the language. The capture must run HERE, before the args are
	// driven, for the reason the old wrapping did: once driven,
	// `path($.b)` has already become the value its reference resolved
	// to. A reference argument is read off its segments; a string
	// argument is ADDRESS TEXT; both go through parseAddress, so what
	// capture admits and what refer reads cannot drift. Anything else
	// -- a number, a container -- is not a path expression at all and
	// refuses as invalid-arg. Mirrors PathFuncVal.prepare in
	// ts/src/val/PathFuncVal.ts.
	if f.name == "path" && !f.prepared {
		f.prepared = true
		for i, arg := range f.peg {
			// A reference argument or a string LITERAL is captured
			// here, before the driving loop; anything else -- an
			// expression, a reference to a string -- is left for the
			// loop, and resolve converts the driven result. That is
			// what makes an address buildable
			// (`refer() & path("$.customers." + key())`) while a bare
			// string still never IS one (ADR-016).
			spelling := ""
			ok := false
			if rv, isRef := arg.(*RefVal); isRef {
				spelling, ok = captureSpelling(rv)
			} else if sv, isScalar := arg.(*ScalarVal); isScalar &&
				KindString == sv.kind {
				spelling, ok = sv.peg.(string)
				spelling = textAddress(spelling)
			} else {
				continue
			}
			if _, aok := parseAddress(spelling); !ok || !aok {
				f.peg[i] = makeNilErr(ctx, "path_address", f, arg)
				continue
			}
			pv := newPath(spelling)
			pv.sp, pv.spu, pv.surl = f.sp, f.spu, f.surl
			pv.stext = f.stext
			f.peg[i] = pv
		}
	}

	// Re-path args to this func's location before resolving them: func
	// clones share their args with the source (see clonePath), and in
	// TS the driving ctx re-descends the shared tree at the
	// destination's path each pass. The Go port keeps paths on the
	// Vals, so the driver re-paths in place — last driver wins, as in
	// TS. The overlay semantics (see repathArg) preserve path tails
	// beyond the driving base, exactly like ctx-based Val.clone.
	if f.name != "move" && f.name != "copy" {
		for i, arg := range f.peg {
			// A generator's TEMPLATE is not at the call site and must
			// not be re-pathed to it: it is cloned per destination when
			// the generator fires, and that clone is what carries a
			// position. Only the data argument is here.
			if generatorFuncs[f.name] && 0 < i {
				continue
			}
			repathArg(arg, base, ctx.settle)
		}
	}

	// Resolve operands into a scratch slice WITHOUT writing them back:
	// a stuck func keeps its original operands in canon (mirrors TS
	// FuncBaseVal/OpBaseVal, which only pass resolved args to resolve).
	var out Val = f
	pegdone := true
	newpeg := make([]Val, 0, len(f.peg))
	newtype := f.mtype
	newhide := f.mhide
	// move() and copy() operate on raw arguments (they must not be
	// resolved first), mirroring MoveFuncVal.prepare and
	// CopyFuncVal.prepare returning null in TS — copy(expr) clones the
	// raw expression immediately and the clone resolves at the
	// destination.
	if f.name == "move" || f.name == "copy" || generatorFuncs[f.name] {
		// A generator's arguments reach resolve RAW, for the reason
		// PackFuncVal.prepare returns null in TS: the template must not
		// be driven at the call site. Its data argument was driven by
		// hand above.
		newpeg = f.peg
	} else {
		for _, arg := range f.peg {
			na := arg
			if arg.Dc() != DONE {
				// Args are driven at the func's location (TS drives them
				// with the func's own ctx, undescended).
				ctx.slot = base
				na = unite(ctx, arg, top())
				// Marks surfacing on resolved args infect the rebuilt
				// pending func (the newtype/newhide accumulation in TS
				// FuncBaseVal.unify).
				newtype = newtype || na.markedType()
				newhide = newhide || na.markedHide()
			}
			if na.Dc() != DONE {
				pegdone = false
			}
			newpeg = append(newpeg, na)
		}
	}

	// super() over a DIRECT recursion residual never resolves: the
	// pending call IS the finite answer (docs/design/SUPER.0.md, the
	// phase boundary), printing as written and refusing at generation
	// as an unexpanded recursion does. Residuals met DURING descent
	// are minted as pending child calls by superOf; only the direct
	// argument defers, or resolve would re-mint the same call inside
	// one pass forever. Mirrors SuperFuncVal.deferResolve in TS.
	if "super" == f.name && 0 < len(newpeg) {
		if _, isRec := newpeg[0].(*RecurseVal); isRec {
			pegdone = false
		}
	}

	// join() HOLDS ITS ANSWER while a member or the separator is still
	// a kind rather than a value. An unsettled member is not a join
	// failure -- it is ordinary incompleteness, reported by generation
	// as mapval_no_gen -- so the call residuates as any unresolved call
	// does rather than refusing something that has not finished
	// arriving. Mirrors JoinFuncVal.deferResolve in TS.
	if "join" == f.name && joinPending(newpeg) {
		pegdone = false
	}

	if pegdone {
		// THE SIGNATURE GATE (docs/design/SIGNATURES.0.md): the driven
		// arguments against the declared signature, before the
		// builtin's own logic sees them. See siggate.go for what the
		// gate owns and what stays with the builtins.
		result := sigRefuse(ctx, f, newpeg)
		if nil == result {
			result = f.resolve(ctx, base, newpeg)
		}
		if result == nil { //coverage:ignore no resolve arm returns nil
			result = f
		}
		// Only the func ITSELF signals "still pending" — a resolve that
		// returns a *different* func (copy of a raw func argument)
		// produced a real value that must unify onward.
		// No resolve arm returns the receiver, so the whole
		// still-pending block below is unreachable; it mirrors the TS
		// FuncBaseVal shape, where resolve() can return `this`.
		//coverage:ignore-block resolve never returns the func itself
		if result == Val(f) {
			switch {
			case isTop(peer):
				out = f
			case peer.Nil():
				out = makeNilErr(ctx, "func", f, peer)
			case f.Canon() == peer.Canon():
				out = f
			default:
				out = newConjunct([]Val{f, peer})
			}
		} else if result.Dc() == DONE && isTop(peer) {
			// The TOP peer is DROPPED as the unit it is. Mirrors the
			// same guard in ts/src/val/FuncBaseVal.ts.
			out = result
		} else {
			ctx.slot = base
			out = unite(ctx, result, peer)
		}
		// The func's marks survive onto its resolution (the
		// propagateMarks(this, out) in TS FuncBaseVal.unify) — e.g. a
		// hide-marked pending func that resolves against a spread peer
		// yields a hidden value. TS also assigns the func's own path to
		// the result (`out.path = this.path`), so a copy()/move() clone
		// delivered through a transplanted func lands at the func's
		// location rather than keeping a stale overlay-tailed path.
		// No isTop guard: TS's FuncBaseVal.unify assigns the func's marks,
		// path and site to the resolved value with no exemption, and a
		// function CAN resolve to a top -- `super(number)` climbs off the
		// top of the kind lattice, `copy(top)` copies one. Excluding those
		// left the residual with neither the call's path nor its site, so
		// the error named `$` instead of `$.x` and pointed at nothing.
		// Safe because top() mints a FRESH TopVal per call (there is no
		// shared singleton to corrupt), which is why the exemption is not
		// needed to protect one.
		if out != Val(f) {
			propagateMarks(f, out)
			out.setvpath(cp(f.path))
			// ... and the func's SITE with its path. TS copies both onto
			// the result in every branch of FuncBaseVal.unify. A function
			// that resolves to a FRESH value -- `super(1)` answers a new
			// ScalarKindVal -- otherwise handed the map a child with no
			// position at all, so an error about it (and any conjunct
			// built over it, which takes its site from its first term)
			// pointed at the start of the source instead of at the call
			// (issue #41).
			out.setPos(f.sp)
			out.setPosu(f.spu)
			out.setSrcurl(f.surl)
			// THE SPAN COMES WITH THE POSITION, always -- and the first
			// attempt here kept it only for a value that had none of its
			// own, on the theory that a wrapper should not claim the
			// text of the thing it wraps. That was wrong, and the review
			// of it was right: the position moves unconditionally two
			// lines above, so a span left behind describes a DIFFERENT
			// PLACE than the row and column beside it. `close({...})`
			// then reported the call's column and the map's `{`, and
			// reading the document at (row, col, len) found `c`.
			//
			// A site that contradicts itself is worse than a coarse one:
			// a consumer following the verification contract refuses
			// every such repair, and one skipping it edits the wrong
			// token. Whatever the position names, the text names too --
			// here that is the call, which is honest and is what the
			// canonical port now records (ts/src/val/FuncBaseVal.ts).
			out.setSrctext(f.srctext())
		}
	} else if isTop(peer) {
		f.notdone()
		nf := newFunc(f.name, newpeg)
		nf.path = cp(f.path)
		nf.dc = f.dc
		nf.sp = f.sp
		nf.spr = f.spr
		nf.mtype = newtype
		nf.mhide = newhide
		out = nf
	} else if peer.Nil() {
		f.notdone()
		out = peer
	} else {
		f.notdone()
		cj := newConjunct([]Val{f, peer})
		cj.path = cp(f.path) // TS defer branch: out.path = this.path
		cj.sp, cj.spu, cj.surl = f.sp, f.spu, f.surl
		out = cj
	}

	if out.Dc() != DONE {
		out.setDc(f.dc + 1)
	}
	return out
}

// pathEq reports whether two paths are identical.
func pathEq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// resolve dispatches to the named function's implementation. base is
// the location the func is being driven at (see Unify) — resolution
// clones re-path to it, mirroring the ctx-path clones in TS.
func (f *FuncVal) resolve(ctx *Ctx, base []string, args []Val) Val {
	switch f.name {
	case "upper":
		return upperLower(ctx, args, true)
	case "lower":
		return upperLower(ctx, args, false)
	case "copy":
		if len(args) == 0 {
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		// Raw-ref argument: the target may not exist yet, so defer the
		// mark clearing to resolution via the copyFound flag. The clone
		// is re-pathed to the copy()'s own location (the ctx-path clone
		// in TS), since a shared raw arg may carry a stale path.
		if rv, ok := args[0].(*RefVal); ok {
			src := clonePath(rv, cp(base)).(*RefVal)
			src.copyFound = true
			return src
		}
		out := clonePath(args[0], cp(base))
		walkMark(out, true, false, true, false) // copy clears marks
		return out
	case "key":
		return keyFunc(ctx, f, base)
	case "pack":
		return packFunc(ctx, f, base, args)
	case "each":
		return eachFunc(ctx, f, base, args)
	case "filter":
		return filterFunc(ctx, f, base, args)
	case "match":
		return matchFunc(ctx, f, base, args)
	case "add", "sub", "mul", "div", "mod", "rem":
		// resolve is only reached once every argument has settled, so
		// arith may name a bad operand rather than waiting for it.
		if len(args) < 2 { //coverage:ignore arity {2,2} is refused at parse
			// UNREACHABLE, and kept: funcArity refuses a short call in
			// lang.go before a Val exists, so nothing gets here with one
			// operand. Without the guard the index below would PANIC
			// rather than report, which is the one outcome worse than a
			// dead branch. (TypeScript needs no twin: `args?.[1]` is
			// undefined there and falls into the same invalid-arg.)
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		return arith(ctx, f.name, f, args[0], args[1])
	case "sum", "least", "greatest":
		if len(args) < 1 { //coverage:ignore arity {1,1} is refused at parse
			// UNREACHABLE, and kept for the reason the arithmetic guard
			// above is: without it the index would PANIC rather than
			// report.
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		return aggregate(ctx, f.name, f, base, args[0])
	case "pick":
		if len(args) < 2 { //coverage:ignore arity {2,2} is refused at parse
			// UNREACHABLE, and kept for the reason the guards above are.
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		return project(ctx, f, base, args[0], args[1])
	case "join":
		if len(args) < 1 { //coverage:ignore arity {1,2} is refused at parse
			// UNREACHABLE, and kept for the reason the guards above are.
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		// The separator is nil when the call wrote only the bag, which
		// is what makes join(coll) concatenation.
		var sep Val
		if 1 < len(args) {
			sep = args[1]
		}
		return joinBag(ctx, f, base, args[0], sep)
	case "pref":
		if len(args) == 0 {
			return makeNilErr(ctx, "arg", f, nil)
		}
		return walkPref(clonePath(args[0], cp(base)))
	case "type":
		if len(args) == 0 {
			return makeNilErr(ctx, "arg", f, nil)
		}
		// A nil ARGUMENT is returned unchanged, never marked. Marking it
		// makes the bag's marked-child skip drop it, which silently
		// swallowed every parse-time refusal reaching here -- a lossy
		// literal, an unknown function, an overflowing literal -- and
		// generated the document as if the key were absent. Refusal over
		// corruption (D7). Mirrors the TS guard in TypeFuncVal.
		if args[0].Nil() {
			return args[0]
		}
		out := clonePath(args[0], cp(base))
		walkMark(out, true, true, false, false)
		return out
	case "hide":
		if len(args) == 0 {
			return makeNilErr(ctx, "arg", f, nil)
		}
		// A nil ARGUMENT is returned unchanged, never marked. Marking it
		// makes the bag's marked-child skip drop it, which silently
		// swallowed every parse-time refusal reaching here -- a lossy
		// literal, an unknown function, an overflowing literal -- and
		// generated the document as if the key were absent. Refusal over
		// corruption (D7). Mirrors the TS guard in HideFuncVal.
		if args[0].Nil() {
			return args[0]
		}
		out := clonePath(args[0], cp(base))
		walkMark(out, false, false, true, true)
		return out
	case "close":
		return setClosed(ctx, f, args, true)
	case "open":
		return setClosed(ctx, f, args, false)
	case "path":
		// path() with no argument is the path KIND; with one, prepare
		// captured a reference or a string literal, and a COMPUTED
		// argument arrives here driven: a string converts by the
		// address grammar, exactly as a literal does at capture
		// (docs/design/PATHS.0.md, ADR-016).
		if len(args) == 0 {
			k := newScalarKind(KindPath)
			k.sp, k.spu, k.surl = f.sp, f.spu, f.surl
			k.stext = f.stext
			k.path = f.path
			return k
		}
		if sv, ok := args[0].(*ScalarVal); ok {
			if KindPath == sv.kind {
				return sv
			}
			if KindString == sv.kind {
				str, _ := sv.peg.(string)
				str = textAddress(str)
				if _, aok := parseAddress(str); !aok {
					return makeNilErr(ctx, "path_address", f, args[0])
				}
				pv := newPath(str)
				pv.sp, pv.spu, pv.surl = f.sp, f.spu, f.surl
				pv.stext = f.stext
				return pv
			}
		}
		if args[0].Nil() {
			return args[0]
		}
		return makeNilErr(ctx, "invalid-arg", f, nil)
	case "map":
		// The container kinds (docs/design/PATHS.0.md): the vacuous
		// call admits its values and defaults to nothing, where the
		// container literal defaults to empty.
		k := newMapKind()
		k.sp, k.spu, k.surl = f.sp, f.spu, f.surl
		k.stext = f.stext
		k.path = f.path
		return k
	case "list":
		k := newListKind()
		k.sp, k.spu, k.surl = f.sp, f.spu, f.surl
		k.stext = f.stext
		k.path = f.path
		return k
	case "deprecate":
		// G3 phase 4: unification-transparent — the result IS the
		// argument, with the record riding it (base.deprec). A nil
		// argument is returned unchanged (refusal over corruption, D7).
		if len(args) == 0 {
			return makeNilErr(ctx, "arg", f, nil)
		}
		if args[0].Nil() {
			return args[0]
		}
		out := clonePath(args[0], cp(base))
		rec := map[string]string{}
		if len(args) > 1 {
			if m, ok := args[1].(*MapVal); ok {
				// The record's whole vocabulary; other keys are DROPPED
				// (see DEPRECATION_KEYS in ts/src/val/DeprecateFuncVal.ts).
				for _, key := range []string{"msg", "use", "since"} {
					if sv, ok := m.peg[key].(*ScalarVal); ok && KindString == sv.kind {
						if str, ok := sv.peg.(string); ok {
							rec[key] = str
						}
					}
				}
			}
		}
		out.setDeprecRec(rec)
		return out
	case "acyclic", "inverse":
		// RELATIONS.0.md §3.3: the graph atoms, conjoined at the field
		// whose key is the predicate they govern. Mirrors
		// AcyclicFuncVal/InverseFuncVal.resolve in
		// ts/src/val/GraphAtomVal.ts.
		invname := ""
		if "inverse" == f.name {
			// The mirroring predicate is a NAME -- D-1, spelled bare
			// or quoted. A relation is a vocabulary term, not an
			// address.
			var ok bool
			invname, ok = predicateName(args[0])
			if !ok {
				return makeNilErrFull(ctx, "inverse_name", f, nil, "inverse", nil)
			}
		}
		out := newGraphAtom(f.name, invname, nil)
		out.sp, out.spu, out.surl = f.sp, f.spu, f.surl
		out.path = cp(base)
		return out
	case "rel":
		// RELATIONS.0.md §3.2: the relation constraint, sited on the
		// field. Mirrors RelFuncVal.resolve in
		// ts/src/val/ReferFuncVal.ts.
		var rt Val
		if 0 < len(args) {
			rt = args[0]
		}
		out := newRel(rt)
		out.sp, out.spu, out.surl = f.sp, f.spu, f.surl
		out.path = cp(base)
		return out
	case "refer":
		// G4 phase 2: the function resolves to the RESIDUAL, which does
		// the address work when it meets a string. Mirrors
		// ReferFuncVal.resolve in ts/src/val/ReferFuncVal.ts.
		out := newRefer(nil)
		if 0 < len(args) {
			out.tval = args[0]
		}
		out.sp, out.spu, out.surl = f.sp, f.spu, f.surl
		out.path = cp(base)
		return out
	case "super":
		// THE IMMEDIATE PARENT TYPE (docs/design/SUPER.0.md): the
		// structural walk in superOf below, mirroring superOf in
		// ts/src/val/SuperFuncVal.ts. A DIRECT residual argument never
		// reaches here — the pegdone defer above holds the call
		// symbolic, as SuperFuncVal.deferResolve does. One argument,
		// always: funcArity pins super at {1, 1} before any resolve —
		// a guarded fallback here is dead code under ADR-002.
		return superOf(cp(base), args[0])
	case "move":
		// Move the referenced value here, hiding it at the source. The
		// moved copy always arrives behind a pref() func (exactly the
		// PrefFuncVal wrap in TS MoveFuncVal.resolve), so the pref walk
		// runs on the RESOLVED value. A ref argument carries the
		// hide-found flag so resolution hides the source node in place.
		if len(args) == 0 {
			return makeNilErr(ctx, "arg", f, nil)
		}
		src := clonePath(args[0], cp(base))
		if rv, ok := src.(*RefVal); ok {
			rv.hideFound = true
		}
		// Hide the raw argument in place (the walk(orig, mark.hide) in
		// TS MoveFuncVal.resolve): for a literal argument the arg IS
		// the source being moved away.
		walkMark(args[0], false, false, true, true)
		nf := newFunc("pref", []Val{src})
		nf.path = cp(base)
		nf.sp = f.sp
		return nf
	}
	return makeNilErr(ctx, "func:"+f.name, f, nil)
}

// superOf answers the immediate parent type of a RESOLVED value
// (docs/design/SUPER.0.md; twin of superOf in
// ts/src/val/SuperFuncVal.ts). The lattice primitive superior() stays
// the preference override gate; everything structural is this walk:
// maps and lists lift child by child, preferences unwrap, disjunctions
// distribute, constraints answer the kind they constrain, and a
// recursion residual met during descent stays a symbolic call.
func superOf(path []string, v Val) Val {
	switch tv := v.(type) {

	// A failed argument is the failure: super(1 & 2) reports the
	// conflict, it does not type it.
	case *NilVal:
		return v

	// The residual's lift is itself recursive, so the finite answer
	// is the symbolic call: a fresh pending super() holding the
	// residual, standing wherever the residual stood -- the `next?`
	// slot of a lifted recursive body prints `super($.Node)` and
	// drops under an optional key at generation.
	case *RecurseVal:
		nf := newFunc("super", []Val{clonePath(tv, cp(path))})
		nf.path = cp(path)
		nf.sp, nf.spu, nf.surl = tv.sp, tv.spu, tv.surl
		return nf

	// Maps and lists lift child by child. Shape is carried, not
	// lifted: key optionality and closedness describe the container,
	// and the spread template lifts so the result admits at the
	// lifted level for future keys exactly as the original admitted
	// at its own. A fresh bag (ADR-005 instantiation): type/hide
	// marks are not copied -- the lift of a hidden definition is
	// output.
	case *MapVal:
		out := newMap()
		out.path = cp(path)
		out.sp, out.spu, out.surl = tv.sp, tv.spu, tv.surl
		out.closed = tv.closed
		out.optional = append([]string{}, tv.optional...)
		if tv.spread != nil {
			out.spread = superOf(append(cp(path), "&"), tv.spread)
		}
		for _, k := range tv.keys {
			out.set(k, superOf(append(cp(path), k), tv.peg[k]))
		}
		return out

	case *ListVal:
		elems := make([]Val, 0, len(tv.peg))
		for i, e := range tv.peg {
			elems = append(elems, superOf(append(cp(path), itoa(i)), e))
		}
		out := newList(elems)
		out.path = cp(path)
		out.sp, out.spu, out.surl = tv.sp, tv.spu, tv.surl
		out.closed = tv.closed
		if tv.spread != nil {
			out.spread = superOf(append(cp(path), "&"), tv.spread)
		}
		return out

	// The parent TYPE of a soft value is the parent of the value --
	// softness does not survive typing. Deliberately NOT superpeg,
	// whose top-for-a-kind answer is override-gate semantics.
	case *PrefVal:
		return superOf(path, tv.peg)

	// A choice lifts arm by arm: super(1|2) is integer, super(1|"a")
	// is integer|string. An arm whose lift is top absorbs the whole
	// answer -- a disjunct carrying top says nothing -- and duplicate
	// lifts collapse so the common case answers as the one kind it is.
	case *DisjunctVal:
		arms := make([]Val, 0, len(tv.peg))
		seen := map[string]bool{}
		for _, a := range tv.peg {
			lift := superOf(path, a)
			if isTop(lift) {
				return top()
			}
			c := lift.Canon()
			if !seen[c] {
				seen[c] = true
				arms = append(arms, lift)
			}
		}
		if 1 == len(arms) {
			return arms[0]
		}
		out := newDisjunct(arms)
		out.path = cp(path)
		out.sp, out.spu, out.surl = tv.sp, tv.spu, tv.surl
		return out

	// A constraint's parent is the kind it constrains: the absorbed
	// leaf kind when it has one (integer & min(3) -> integer), else
	// the domain its atoms compare in (min(3) -> number, min("a") ->
	// string). length() constrains strings, lists and maps alike, so
	// with neither it falls through to top.
	case *ConstraintVal:
		if tv.kind != KindTop {
			return newScalarKind(tv.kind)
		}
		if "number" == tv.domain {
			return newScalarKind(KindNumber)
		}
		if "string" == tv.domain {
			return newScalarKind(KindString)
		}
		return top()

	// A kind argument climbs the KIND lattice -- super(integer) and
	// super(float) are `number`, super(number) is top. The struct's
	// own superior() cannot answer this: it is also PrefVal's
	// narrowing gate and must stay top there.
	case *ScalarKindVal:
		if p, has := kindParent(tv.kind); has {
			return newScalarKind(p)
		}
		return top()
	}

	// The lattice primitive answers for the forms it always served: a
	// concrete scalar lifts to its leaf kind, and top to itself. Where
	// it has no meaningful answer (superior() defaults to top), top is
	// the honest remainder.
	if sup := v.superior(); sup != nil && !isTop(sup) {
		return sup
	}
	return top()
}

// caseUpper / caseLower apply FULL Unicode case mapping, matching
// JavaScript's toUpperCase/toLowerCase, which is what the canonical port
// uses.
//
// NOT strings.ToUpper/ToLower, which do SIMPLE per-rune mapping: a rune
// in, a rune out. Full mapping may change LENGTH, and that is the whole
// divergence -- `upper("straße")` is STRASSE in the canonical port and
// was STRAßE here, `upper("ﬁ")` is FI and was unchanged. It also covers
// the Final_Sigma CONTEXT rule, which per-rune mapping cannot express at
// all: a word-final sigma lowercases to U+03C2 and a medial one to
// U+03C3, and simple mapping gave U+03C3 for both.
//
// `strings.ToLower` additionally LOST DATA on U+0130 (capital I with dot
// above), truncating it to "i" and dropping the combining dot that the
// full mapping keeps.
//
// language.Und, not a specific locale: the canonical port's methods are
// locale-INDEPENDENT, so `upper("i")` must be "I" and never the Turkish
// "İ". Confirmed in both directions against the canonical port.
//
// A fresh Caser per call because x/text documents Caser as potentially
// stateful and explicitly not safe for concurrent use. A shared caser
// measured clean over 64k concurrent calls under -race, but a documented
// contract beats a passing measurement -- these functions are not on a
// hot path.
//
// SCOPE, stated honestly: this is exact on the Unicode 15.0 repertoire,
// which is x/text's table vintage (and Go's own unicode package's). Node
// ships newer ICU tables, so ~110 code points assigned after Unicode 15
// case-map there and not here. That is a table-vintage gap, not an
// algorithmic one, and strings.ToUpper/ToLower miss every one of them
// too -- so nothing regresses; the gap simply stops being hidden behind
// a much larger one.
func caseUpper(s string) string {
	return cases.Upper(language.Und).String(s)
}

func caseLower(s string) string {
	return cases.Lower(language.Und).String(s)
}

func upperLower(ctx *Ctx, args []Val, up bool) Val {
	if len(args) == 0 {
		return makeNilErr(ctx, "arg", nil, nil)
	}
	sv, ok := args[0].(*ScalarVal)
	if !ok {
		return makeNilErr(ctx, "invalid-arg", args[0], nil)
	}
	switch sv.kind {
	case KindString:
		s := sv.peg.(string)
		if up {
			return newString(caseUpper(s))
		}
		return newString(caseLower(s))
	case KindInteger, KindFloat:
		var fv float64
		if sv.kind == KindInteger {
			fv = float64(sv.peg.(int64))
		} else {
			fv = sv.peg.(float64)
		}
		res := math.Floor(fv)
		if up {
			res = math.Ceil(fv)
		}
		// The ceiling/floor keeps the ARGUMENT's kind (upper(2) is an
		// integer 2, upper(1.1) is a float 2.0): the function must not
		// narrow float to integer. This also makes the actual result
		// kind agree with the superior() this func advertises. A kind
		// this switch does not handle falls through to invalid-arg
		// rather than silently producing a wrong-kind value.
		if sv.kind == KindInteger && isIntegerKind(res, "") {
			return newInteger(int64(res))
		}
		return newFloat(res)
	case KindBigInteger:
		// An exact integer is its own ceiling and floor. The value is
		// rebuilt rather than shared so the result is a fresh Val with
		// its own peg, matching every other branch here.
		return newBigInteger(new(big.Int).Set(sv.peg.(*big.Int)))
	case KindBigDecimal:
		// Exact ceiling/floor by coefficient arithmetic (D6) — no
		// float64 goes near it — keeping the argument's BIGDECIMAL kind
		// (R5), so upper(0d1.1) is `0d2.0` and not `0d2`.
		return newBigDecimal(sv.peg.(*Decimal).ceilFloor(up))
	}
	return makeNilErr(ctx, "invalid-arg", args[0], nil)
}

// setClosed implements close()/open(): mark a map or list as (not) closed.
//
// The in-place write is safe BECAUSE of the per-destination
// instantiation rule (ADR-005): everywhere a close() call is
// multiplied — a pack/each template, a spread constraint — the clone
// now owns its argument (instanceClone), so `closed` lands on that
// instance alone. Cloning the bag here instead was tried and rejected:
// the re-path it implies corrupts the source attribution of children
// inside nested spread templates (the 06-k8s use case's env findings
// named the wrong path). Mirrors CloseFuncVal.resolve in ts/src/val.
func setClosed(ctx *Ctx, f *FuncVal, args []Val, closed bool) Val {
	if len(args) == 0 {
		return makeNilErr(ctx, "no_first_arg", f, nil)
	}
	switch v := args[0].(type) {
	case *MapVal:
		v.closed = closed
	case *ListVal:
		v.closed = closed
	}
	return args[0]
}

// keyFunc returns the key `move` levels up the path (KeyFuncVal.resolve).
// keyFunc resolves key(n) to the ancestor key n levels up.
//
// THE LEVEL MUST BE AN INTEGER, OR ABSENT. A level is an index into the
// path (0 the own key, the default 1 the parent), so the argument is an
// integer or it is a mistake. Both exact integer leaves qualify --
// `integer` and `biginteger` -- and everything else is refused rather
// than silently falling back to 1, which is what made a mistyped level
// undetectable here.
func keyFunc(ctx *Ctx, f *FuncVal, base []string) Val {

	move := 1
	if len(f.peg) > 0 {
		sv, ok := f.peg[0].(*ScalarVal)
		if !ok {
			return makeNilErr(ctx, "key_level", f, nil)
		}
		switch sv.kind {
		case KindInteger:
			move = int(sv.peg.(int64))
		case KindBigInteger:
			// A level far outside the path simply misses, exactly as an
			// out-of-range plain integer already does, so a big.Int that
			// does not fit an int needs no bound of its own -- it is
			// clamped to something equally out of range.
			b := sv.peg.(*big.Int)
			if b.IsInt64() {
				move = int(b.Int64())
			} else {
				move = -1
			}
		default:
			return makeNilErr(ctx, "key_level", f, nil)
		}
	}
	// THE PATH IS THE ONE IT IS BEING DRIVEN AT when the driver is
	// DEEPER than anything this key() has been placed at. A key() the
	// bag walk reaches directly is re-pathed by its own residuation
	// clone each pass, and its stored path is right -- and a
	// TRANSPLANTED one (move(), a shared clone) must answer for where it
	// was put, which is why the stored path stays authoritative whenever
	// it reaches as deep as the driver. But a key() nested inside a
	// function or operator ARGUMENT inside a generator's TEMPLATE has
	// never been placed at all: it is shared, not cloned, and the
	// template's own position is the call site, which is the one
	// position it is never used at. There the driver is deeper, and the
	// driver is the truth.
	//
	// The TypeScript port reaches the same answers by a different test
	// (KeyFuncVal.resolve, `positioned`), because the two ports path a
	// function's arguments differently -- see DIVERGENCE.md.
	here := f.path
	if len(base) > len(here) {
		here = base
	}
	idx := len(here) - (1 + move)
	key := ""
	if idx >= 0 && idx < len(here) {
		key = here[idx]
	}
	return newString(key)
}

// walkPref wraps every scalar/pref leaf in a PrefVal (PrefFuncVal.resolve).
// Junction members are wrapped too: `pref(*1e3|hello)` becomes
// `**1e3|*hello`, whose rank rules pick *hello (mirrors the TS walk,
// which visits disjunct/conjunct members). Kinds stay unwrapped, so
// `pref(boolean|11)` leaves the kind as a plain member.
func walkPref(v Val) Val {
	switch n := v.(type) {
	case *ScalarVal:
		return newPref(n)
	case *PrefVal:
		return newPref(n)
	case *MapVal:
		for _, k := range n.keys {
			n.peg[k] = walkPref(n.peg[k])
		}
		return n
	case *ListVal:
		for i := range n.peg {
			n.peg[i] = walkPref(n.peg[i])
		}
		return n
	case *DisjunctVal:
		for i := range n.peg {
			n.peg[i] = walkPref(n.peg[i])
		}
		return n
	case *ConjunctVal:
		for i := range n.peg {
			n.peg[i] = walkPref(n.peg[i])
		}
		return n
	}
	return v
}
