/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"strconv"
)

// The admission trial (G12): whether a settled value IS an instance of a
// trial schema, rather than whether the two can be made consistent. The
// meet may add nothing the value lacks, and must generate the value's
// own JSON.

// admitMember is the child of a settled value at one path segment, read
// for its optional keys.
func admitMember(v Val, seg string) Val {
	switch n := v.(type) {
	case *MapVal:
		return n.peg[seg]
	case *ListVal:
		if i, err := strconv.Atoi(seg); nil == err && 0 <= i && i < len(n.peg) {
			return n.peg[i]
		}
	}
	return nil
}

func optionalIn(v Val, k string) bool {
	m, ok := v.(*MapVal)
	return ok && m.isOptional(k)
}

// fillDiff lists the members `generated` holds that `data` lacks. A key
// the settled value `val` makes optional is the schema's to supply and
// is not a difference; a required key, or a longer list, is.
func fillDiff(generated, data any, val Val, path []string, out [][]string) [][]string {
	switch g := generated.(type) {
	case map[string]any:
		d, _ := data.(map[string]any)
		for _, k := range sortedKeys(g) {
			if dv, has := d[k]; has {
				out = fillDiff(g[k], dv, admitMember(val, k), append(cp(path), k), out)
			} else if !optionalIn(val, k) {
				out = append(out, append(cp(path), k))
			}
		}
	case []any:
		d, _ := data.([]any)
		for i := range g {
			seg := strconv.Itoa(i)
			if len(d) <= i {
				out = append(out, append(cp(path), seg))
			} else {
				out = fillDiff(g[i], d[i], admitMember(val, seg), append(cp(path), seg), out)
			}
		}
	}
	return out
}

// withoutOptionalFills keeps what the data carries: once fillDiff finds
// nothing, every other member the meet generated is an optional fill.
func withoutOptionalFills(generated, data any) any {
	switch g := generated.(type) {
	case map[string]any:
		d, _ := data.(map[string]any)
		out := map[string]any{}
		for k, gv := range g {
			if dv, has := d[k]; has {
				out[k] = withoutOptionalFills(gv, dv)
			}
		}
		return out
	case []any:
		d, _ := data.([]any)
		out := append([]any{}, g...)
		for i := 0; i < len(g) && i < len(d); i++ {
			out[i] = withoutOptionalFills(g[i], d[i])
		}
		return out
	}
	return generated
}

// asBigInt reads an integral generated number as a big.Int.
func asBigInt(v any) (*big.Int, bool) {
	switch n := v.(type) {
	case int64:
		return big.NewInt(n), true
	case *big.Int:
		return n, true
	}
	return nil, false
}

func sameJSON(a, b any) bool {
	switch x := a.(type) {
	case map[string]any:
		y, ok := b.(map[string]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for k, xv := range x {
			yv, has := y[k]
			if !has || !sameJSON(xv, yv) {
				return false
			}
		}
		return true
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !sameJSON(x[i], y[i]) {
				return false
			}
		}
		return true
	case *Decimal:
		y, ok := b.(*Decimal)
		return ok && x.equal(y)
	}
	if ia, ok := asBigInt(a); ok {
		ib, ok := asBigInt(b)
		return ok && 0 == ia.Cmp(ib)
	}
	return a == b
}

// trialCtx is a context whose failures go to a throwaway list.
func trialCtx(ctx *Ctx) *Ctx {
	trial := &Ctx{}
	if nil != ctx {
		t := *ctx
		t.err = nil
		trial = &t
	}
	trial.collect = true
	return trial
}

func ownJSON(v Val, ctx *Ctx, path []string) (any, bool) {
	gctx := trialCtx(ctx)
	out, err := clonePath(v, path).Gen(gctx)
	return out, nil == err && 0 == len(gctx.err)
}

// trialMeet runs the meet to a fixpoint as the document is, the calls
// that wait for a settled tree, `match` among them, resolving once a pass
// changes nothing.
func trialMeet(tctx *Ctx, trial, value Val) Val {
	maxcc := tctx.budgetPasses
	if 0 == maxcc {
		maxcc = 9
	}
	tctx.settle = false
	tctx.cc = 0
	met := unite(tctx, trial, value)
	last := ""
	for cc := 1; cc < maxcc && DONE != met.Dc(); cc++ {
		now := met.Canon()
		tctx.settle = now == last
		last = now
		tctx.cc = cc
		met = unite(tctx, met, top())
	}
	return met
}

// admitsSettled is the trial inside the engine: `trial` admits the
// settled `value`, whose JSON is `own`.
func admitsSettled(ctx *Ctx, trial, value Val, own any, path []string) bool {
	if trial.Nil() {
		return false
	}
	tctx := trialCtx(ctx)
	met := trialMeet(tctx, clonePath(trial, path), clonePath(value, path))
	if met.Nil() || 0 < len(tctx.err) {
		return false
	}
	var nils []*NilVal
	collectNils(met, &nils, map[Val]bool{})
	if 0 < len(nils) {
		return false
	}
	out, err := met.Gen(tctx)
	return nil == err && 0 == len(tctx.err) &&
		0 == len(fillDiff(out, own, met, nil, nil)) &&
		sameJSON(withoutOptionalFills(out, own), own)
}

func generatedOf(v Val, src string) (any, bool) {
	ctx := &Ctx{root: v, src: src, collect: true}
	out, err := v.Gen(ctx)
	return out, nil == err && 0 == len(ctx.err)
}

// settledMeet is the meet of clones of trial and value, and whether it
// holds: nothing failed, and no nil sits in it for generation to skip.
func settledMeet(trial, value Val) (Val, bool) {
	pair := newConjunct([]Val{instanceClone(trial, nil), instanceClone(value, nil)})
	ctx := &Ctx{root: pair, collect: true}
	met := unifyRoot(pair, ctx)
	var nils []*NilVal
	collectNils(met, &nils, map[Val]bool{})
	return met, 0 == len(ctx.err) && 0 == len(nils)
}

// Admits reports whether `trial` admits `value`. Both are cloned: a Val
// tree is single-use.
func Admits(trial, value Val) bool {
	met, held := settledMeet(trial, value)
	if !held {
		return false
	}
	out, ok := generatedOf(met, "")
	if !ok {
		return false
	}
	own := instanceClone(value, nil)
	ownCtx := &Ctx{root: own, collect: true}
	settled := unifyRoot(own, ownCtx)
	mine, ok := generatedOf(settled, "")
	if !ok || 0 < len(ownCtx.err) {
		return false
	}
	return 0 == len(fillDiff(out, mine, met, nil, nil)) &&
		sameJSON(withoutOptionalFills(out, mine), mine)
}
