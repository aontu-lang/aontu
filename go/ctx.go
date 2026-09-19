/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strings"


// Ctx carries unification state: the root Val (for path resolution,
// once references are ported) and the collected error list.
type Ctx struct {
	root Val
	src string
	// file is the display name of the entry source for error frames
	// (Aontu.File); empty renders <no-file>.
	file string
	texts map[string]string
	err   []*NilVal
	depth int // unite recursion depth (cycle guard)
	cc    int // current fixpoint pass (for late-resolving funcs)
	trial bool
	reldecls map[string]*relDecl
	fixroot Val
	settle bool
	vars   map[string]Val // user-provided variables, resolved by $name
	collect bool
	probe bool
	snapmap map[string]Val
	referflows map[string]Val
	referflow map[string]bool
	slot []string

	argsnap bool

	budgetPasses int
	budgetDepth  int
	budgetAlias  int

	prov *Provenance

	reads map[string]bool
}

func (c *Ctx) adderr(n *NilVal) {
	if n.primary == nil {
		n.primary = n
	}
	for _, e := range c.err {
		if e == n {
			return
		}
	}
	c.err = append(c.err, n)
}

func genErr(ctx *Ctx, gerr error) error {
	if nil != gerr {
		return gerr
	}
	if nil != ctx && 0 < len(ctx.err) {
		return &AontuError{Msg: ctx.errmsg(), Code: ctx.err[0].why,
			Details: ctx.err[0].details}
	}
	return nil
}

func genCollect(ctx *Ctx, v Val) (any, error) {
	before := 0
	if nil != ctx {
		before = len(ctx.err)
	}
	out, gerr := v.Gen(ctx)
	if nil != ctx && before < len(ctx.err) {
		n := ctx.err[before]
		return nil, &AontuError{
			Msg:     n.FullMessage(ctx.src, ctx.file, ctx.texts),
			Code:    n.why,
			Details: n.details,
		}
	}
	if nil != gerr {
		return out, gerr
	}
	return out, nil
}

func (c *Ctx) errmsg() string {
	parts := make([]string, 0, len(c.err))
	for _, e := range c.err {
		parts = append(parts, e.FullMessage(c.src, c.file, c.texts))
	}
	return strings.Join(parts, "\n------\n")
}
