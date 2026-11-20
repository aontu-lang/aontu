/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strings"

// Ctx carries unification state: the root Val (for path resolution,
// once references are ported) and the collected error list.
type Ctx struct {
	root Val
	src  string
	// file is the display name of the entry source for error frames
	// (Aontu.File); empty renders <no-file>.
	file      string
	texts     map[string]string
	err       []*NilVal
	depth     int // unite recursion depth (cycle guard)
	cc        int // current fixpoint pass (for late-resolving funcs)
	trial     bool
	matchRead bool
	fixroot   Val
	settle    bool
	vars      map[string]Val // user-provided variables, resolved by $name
	collect   bool
	dropped   bool
	probe     bool
	snapmap   map[string]Val
	slot      []string

	toward *towardData

	// Generation: its container's place, whether it only reads, whether a null was written.
	at        []string
	plain     bool
	wroteNull bool

	argsnap bool

	budgetPasses int
	budgetDepth  int
	budgetAlias  int
	budgetTrials int

	trials *trialState

	prov *Provenance

	reads map[string]bool

	// The arm a disjunction holds at a path, with the peer it meets
	// (Decls.armChosen in spec/Aontu/Paths.lean).
	armAt map[string]heldArm
}

type heldArm struct {
	arm, peer Val
	own       bool
}

func (c *Ctx) holdArm(path []string, arm, peer Val, own bool, fn func() Val) Val {
	saved := c.armAt
	c.armAt = make(map[string]heldArm, len(saved)+1)
	for k, v := range saved {
		c.armAt[k] = v
	}
	if isTop(peer) {
		peer = nil
	}
	c.armAt[strings.Join(path, "\x00")] = heldArm{arm, peer, own}
	defer func() { c.armAt = saved }()
	return fn()
}

// trialState is one evaluation's admission trials and their verdicts.
type trialState struct {
	n    int
	memo map[string]bool
}

// trialsOf makes the state on first use; a copy shares it only once it
// exists, so every copy site asks for it before copying.
func (c *Ctx) trialsOf() *trialState {
	if nil == c.trials {
		c.trials = &trialState{memo: map[string]bool{}}
	}
	return c.trials
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

func genCollectPlain(ctx *Ctx, v Val) (any, error) {
	was := ctx.plain
	ctx.plain = true
	defer func() { ctx.plain = was }()
	return genCollect(ctx, v)
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
