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

var funcSet = map[string]bool{
	"upper": true, "lower": true, "copy": true, "key": true,
	"pref": true, "super": true, "type": true, "hide": true,
	"move": true, "path": true, "close": true, "open": true,
	"map": true, "list": true,
	// ADR-034.
	"maybe": true,
	"min":   true, "max": true, "above": true, "below": true, "neq": true,
	"re": true, "length": true, "unique": true, "must": true,
	"deprecate":  true,
	"rel":        true,
	"acyclic":    true,
	"inverse":    true,
	"refer":      true,
	"pack":       true,
	"each":       true,
	"filter":     true,
	"match":      true,
	"emit":       true,
	"esc":        true,
	"usc":        true,
	"rep":        true,
	"split":      true,
	"nom":        true,
	"translate":  true,
	"add":        true,
	"sub":        true,
	"mul":        true,
	"div":        true,
	"mod":        true,
	"rem":        true,
	"sum":        true,
	"least":      true,
	"greatest":   true,
	// Projection, which is what lets the aggregates reach a bag of
	// RECORDS. Not a clever each template -- each MEETS each child, and
	// a meet cannot select.
	"pick": true,
	// Ordering, which generation cannot supply.
	"sort": true,
	// G9 phase 2: the fold to a STRING. sum folds with add; this folds
	// with `+`, so it inherits the one number-to-text rule and the
	// language does not grow a second.
	"join":  true,
	"abnf":  true,
	"parse": true,
}

var stagedFuncs = map[string]bool{
	"key": true, "pack": true, "each": true, "filter": true,
	"match": true,
	"emit":  true,
	"sum":   true, "least": true, "greatest": true, "pick": true,
	"sort": true,
	// A fold over a bag still being merged into folds the wrong bag.
	"join": true,
	// Both arguments are data and must settle before a declaration can
	// be spelled: a half-unified type lowers to the wrong text.
}

var foldFuncs = map[string]bool{
	"sum": true, "least": true, "greatest": true, "pick": true, "join": true,
	"sort": true,
}

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

var generatorFuncs = map[string]bool{
	"pack": true, "each": true, "filter": true, "match": true,
	// emit's TABLE is templates: driving it would resolve a body's
	// references at the call site, the one position a body is never
	// used at.
	"emit": true,
}

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

func writtenArgCount(terms []any) int {
	if 1 == len(terms) {
		if raw, ok := terms[0].([]any); ok {
			return len(raw)
		}
	}
	return len(terms)
}

func arityText(lo, hi int) string {
	switch {
	case -1 == hi:
		return "one or more arguments"
	case lo != hi:
		if 0 == lo {
			return "no arguments or one"
		}
		// The case range gave upper and lower a span rather than a pair,
		// and a two-arm phrasing cannot say it: [1,3] read as "one
		// argument or two", a wrong count rather than an imprecise one.
		if 3 == hi {
			return "one to three arguments"
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
	name     string
	peg      []Val // arguments
	prepared bool
}

func newFunc(name string, args []Val) *FuncVal {
	f := &FuncVal{name: name, peg: args}
	f.site.sp = unsited
	return f
}

func (f *FuncVal) superior() Val {
	if (f.name == "upper" || f.name == "lower") && len(f.peg) > 0 {
		if sv, ok := f.peg[0].(*ScalarVal); ok {
			return newScalarKind(sv.kind)
		}
	}
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
	return nil, residueErr(ctx, f, "no_gen")
}

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

	base := ctx.slot
	if base == nil {
		base = f.path
	}

	// One-argument parse meets its peer instead of resolving.
	if "parse" == f.name && 1 == len(f.peg) {
		return constrainParse(ctx, f, base, peer)
	}

	// ADR-034: not resolved YET is not resolved to nothing.
	if "maybe" == f.name && !ctx.settle {
		return residuate(f, base, peer)
	}

	if stagedFuncs[f.name] {
		driven := stagedDrive(ctx, f, base)
		fillable := !isTop(peer) && hasPlace(f) && "match" != f.name
		ready := (driven || fillable) && ctx.settle

		if !ready {
			return residuate(f, base, peer)
		}
	}

	if !isTop(peer) && !peer.Nil() && Val(f) != peer && hasPlace(f) {
		if hasPlace(peer) {
			return makeNilErr(ctx, "place_pair", f, peer)
		}
		ctx.slot = base
		return unite(ctx, fillPlace(f, peer), top())
	}

	if isTop(peer) && (f.mtype || f.mhide) {
		f.setDc(DONE)
		return f
	}

	if f.name == "path" && !f.prepared {
		f.prepared = true
		for i, arg := range f.peg {
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
			pv.site.sp, pv.site.spu, pv.site.url = f.site.sp, f.site.spu, f.site.url
			pv.site.src = f.site.src
			f.peg[i] = pv
		}
	}

	if f.name != "move" && f.name != "copy" {
		for i, arg := range f.peg {
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
	if f.name == "move" || f.name == "copy" || f.name == "maybe" ||
		generatorFuncs[f.name] {
		newpeg = f.peg
	} else {
		for i, arg := range f.peg {
			na := arg
			if arg.Dc() != DONE {
				ctx.slot = base
				if 0 == i && foldFuncs[f.name] {
					saved := ctx.argsnap
					ctx.argsnap = true
					na = unite(ctx, arg, top())
					ctx.argsnap = saved
				} else {
					na = unite(ctx, arg, top())
				}
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

	if "super" == f.name && 0 < len(newpeg) {
		if _, isRec := newpeg[0].(*RecurseVal); isRec {
			pegdone = false
		}
	}

	// ABSENCE PROPAGATES (ADR-034), ahead of join's deferral.
	var absent Val
	if "maybe" != f.name {
		for _, a := range newpeg {
			if isAbsent(a) {
				absent = a
				break
			}
		}
	}

	if "join" == f.name && nil == absent && joinPending(ctx, newpeg) {
		pegdone = false
	}

	if pegdone {
		result := absent
		if nil == result {
			result = sigRefuse(ctx, f, newpeg)
		}
		if nil == result {
			result = f.resolve(ctx, base, newpeg)
		}
		if result == nil { //coverage:ignore no resolve arm returns nil
			result = f
		}
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
		if out != Val(f) {
			propagateMarks(f, out)
			out.setvpath(cp(f.path))
			out.setPos(f.site.sp)
			out.setPosu(f.site.spu)
			out.setSrcurl(f.site.url)
			out.setSrctext(f.srctext())
		}
	} else if isTop(peer) {
		f.notdone()
		nf := newFunc(f.name, newpeg)
		nf.path = cp(f.path)
		nf.dc = f.dc
		nf.site.sp = f.site.sp
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
		cj.site.sp, cj.site.spu, cj.site.url = f.site.sp, f.site.spu, f.site.url
		out = cj
	}

	if out.Dc() != DONE {
		out.setDc(f.dc + 1)
	}
	return out
}

// residuate holds a call that cannot answer yet. The conjunct carries
// the call's own path, or a finding on it names the meet's root.
func residuate(f *FuncVal, base []string, peer Val) Val {
	f.notdone()
	switch {
	case isTop(peer):
		return clonePath(f, overlayPath(base, f.path))
	case peer.Nil():
		return peer
	default:
		if pf, ok := peer.(*FuncVal); ok && pf.name == f.name &&
			pathEq(pf.path, f.path) && pf.Canon() == f.Canon() {
			return f
		}
		cj := newConjunct([]Val{f, peer})
		cj.path = cp(f.path)
		cj.site.sp, cj.site.spu, cj.site.url = f.site.sp, f.site.spu, f.site.url
		return cj
	}
}

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
	case "emit":
		return emitFunc(ctx, f, base, args)
	case "esc":
		return escFunc(ctx, f, args)
	case "usc":
		return uscFunc(ctx, f, args)
	case "rep":
		return repFunc(ctx, f, args)
	case "split":
		return splitFunc(ctx, f, base, args)
	case "add", "sub", "mul", "div", "mod", "rem":
		// resolve is only reached once every argument has settled, so
		// arith may name a bad operand rather than waiting for it.
		if len(args) < 2 { //coverage:ignore arity {2,2} is refused at parse
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
	case "maybe":
		if len(args) < 1 { //coverage:ignore arity {1,1} is refused at parse
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		return forgive(ctx, f, base, args[0])
	case "sort":
		if len(args) < 1 { //coverage:ignore arity {1,3} is refused at parse
			// UNREACHABLE, and kept for the reason the guards above are.
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		return order(ctx, f, base, args[0], argAt(args, 1), argAt(args, 2))
	case "nom":
		return nomFunc(ctx, f, args)
	case "translate":
		return translateFunc(ctx, f, args)
	case "project", "folder", "file", "content", "line", "fragment",
		"slot", "inject", "copyfiles", "listitems":
		return cmpFunc(ctx, f, args)
	case "abnf":
		if len(args) < 1 { //coverage:ignore arity is refused at parse
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		return grammarSource(ctx, f, args[0])
	case "parse":
		if len(args) < 2 { //coverage:ignore the 1-arg form returns from Unify
			return makeNilErr(ctx, "invalid-arg", f, nil)
		}
		return applyGrammar(ctx, f, args[0], args[1])
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
		if len(args) == 0 {
			k := newScalarKind(KindPath)
			k.site.sp, k.site.spu, k.site.url = f.site.sp, f.site.spu, f.site.url
			k.site.src = f.site.src
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
				pv.site.sp, pv.site.spu, pv.site.url = f.site.sp, f.site.spu, f.site.url
				pv.site.src = f.site.src
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
		k.site.sp, k.site.spu, k.site.url = f.site.sp, f.site.spu, f.site.url
		k.site.src = f.site.src
		k.path = f.path
		return k
	case "list":
		k := newListKind()
		k.site.sp, k.site.spu, k.site.url = f.site.sp, f.site.spu, f.site.url
		k.site.src = f.site.src
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
		out.site.sp, out.site.spu, out.site.url = f.site.sp, f.site.spu, f.site.url
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
		out.site.sp, out.site.spu, out.site.url = f.site.sp, f.site.spu, f.site.url
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
		out.site.sp, out.site.spu, out.site.url = f.site.sp, f.site.spu, f.site.url
		out.path = cp(base)
		return out
	case "super":
		return superOf(cp(base), args[0])
	case "move":
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
		nf.site.sp = f.site.sp
		return nf
	}
	return makeNilErr(ctx, "func:"+f.name, f, nil)
}

func superOf(path []string, v Val) Val {
	switch tv := v.(type) {

	// A failed argument is the failure: super(1 & 2) reports the
	// conflict, it does not type it.
	case *NilVal:
		return v

	case *RecurseVal:
		nf := newFunc("super", []Val{clonePath(tv, cp(path))})
		nf.path = cp(path)
		nf.site.sp, nf.site.spu, nf.site.url = tv.site.sp, tv.site.spu, tv.site.url
		return nf

	case *MapVal:
		out := newMap()
		out.path = cp(path)
		out.site.sp, out.site.spu, out.site.url = tv.site.sp, tv.site.spu, tv.site.url
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
		out.site.sp, out.site.spu, out.site.url = tv.site.sp, tv.site.spu, tv.site.url
		out.closed = tv.closed
		if tv.spread != nil {
			out.spread = superOf(append(cp(path), "&"), tv.spread)
		}
		return out

	case *PrefVal:
		return superOf(path, tv.peg)

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
		out.site.sp, out.site.spu, out.site.url = tv.site.sp, tv.site.spu, tv.site.url
		return out

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

func caseUpper(s string) string {
	return cases.Upper(language.Und).String(s)
}

func caseLower(s string) string {
	return cases.Lower(language.Und).String(s)
}

func caseSpan(n, start, length int) (int, int) {
	span := length
	if span < 0 {
		span = n
	}
	if 0 <= start {
		lo := start
		if lo > n {
			lo = n
		}
		hi := lo + span
		if hi > n {
			hi = n
		}
		return lo, hi
	}
	// No `hi > n` clamp: start is negative here, so n+start is below n
	// by construction and the clamp could never fire.
	hi := n + start
	if hi < 0 {
		hi = 0
	}
	lo := hi - span
	if lo < 0 {
		lo = 0
	}
	return lo, hi
}

func caseRange(text string, start, length int, up bool) string {
	rs := []rune(text)
	lo, hi := caseSpan(len(rs), start, length)
	if hi <= lo {
		return text
	}
	mid := string(rs[lo:hi])
	if up {
		mid = caseUpper(mid)
	} else {
		mid = caseLower(mid)
	}
	return string(rs[:lo]) + mid + string(rs[hi:])
}

// The integer a range argument carries. present is false for an absent
// argument (they are optional); ok is false when the value is there but
// is not an integer index.
func rangeArg(args []Val, i int) (n int, present bool, ok bool) {
	if i >= len(args) || args[i] == nil {
		return 0, false, true
	}
	// ONE REFUSAL for every way an argument can fail to be an index: not
	// a scalar at all (a preference reaches here, the signature gate
	// having nothing to check), a scalar of another kind, or a
	// biginteger too large to be a position in a string.
	if sv, isScalar := args[i].(*ScalarVal); isScalar {
		switch sv.kind {
		case KindInteger:
			return int(sv.peg.(int64)), true, true
		case KindBigInteger:
			if bi := sv.peg.(*big.Int); bi.IsInt64() {
				return int(bi.Int64()), true, true
			}
		}
	}
	return 0, true, false
}

func upperLower(ctx *Ctx, args []Val, up bool) Val {
	if len(args) == 0 {
		return makeNilErr(ctx, "arg", nil, nil)
	}
	sv, ok := args[0].(*ScalarVal)
	if !ok {
		return makeNilErr(ctx, "invalid-arg", args[0], nil)
	}
	// THE RANGE (caseSpan/caseRange above). Refused on a NUMBER, where a
	// run of characters means nothing -- the numeric arm below is a
	// ceiling or a floor, not a case mapping.
	start, hasStart, startOK := rangeArg(args, 1)
	length, hasLen, lenOK := rangeArg(args, 2)
	ranged := hasStart || hasLen
	if ranged && (!startOK || !lenOK || sv.kind != KindString) {
		return makeNilErr(ctx, "invalid-arg", args[0], nil)
	}
	if !hasLen {
		length = -1
	}

	switch sv.kind {
	case KindString:
		s := sv.peg.(string)
		return newString(caseRange(s, start, length, up))
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
