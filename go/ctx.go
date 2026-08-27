/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strings"

// hide marking is mark-based (see RefVal.find and FuncVal.Unify): the
// move() machinery sets the hide mark on the found source node and the
// bag unify loops ratchet marks down one level per pass, mirroring the
// TS _hide_found + propagateMarks flow.

// Ctx carries unification state: the root Val (for path resolution,
// once references are ported) and the collected error list.
type Ctx struct {
	root Val
	// src is the entry source text, used by error rendering to compute
	// row/col from a value's byte offset and to excerpt source lines
	// (NilVal.FullMessage frames). Values loaded from @"file" includes
	// carry offsets into their own file; with no per-value url tracking
	// their frames fall back to this text — the same fallback TS's
	// resolveSrc makes when a site's file cannot be read.
	src string
	// file is the display name of the entry source for error frames
	// (Aontu.File); empty renders <no-file>.
	file  string
	err   []*NilVal
	depth int // unite recursion depth (cycle guard)
	cc    int // current fixpoint pass (for late-resolving funcs)
	// settle is THE STAGING RULE (G8 phase 0,
	// docs/capability-review/g8-generation.md, and the Go side of
	// AontuContext.settle). A value whose answer depends on WHERE IT IS
	// -- key() today, the generation combinators next -- residuates
	// while this is false and fires exactly once on the pass where it
	// is true. unifyRoot sets it on the first pass whose input model is
	// identical to the previous pass's: everything that was going to
	// move has moved. It replaces a `ctx.cc < 3` pass count, a magic
	// number that was right for the documents it was tuned on and
	// silently wrong for anything that took a fourth pass to place a
	// value.
	settle bool
	vars   map[string]Val // user-provided variables, resolved by $name
	// collect: generation inside an optional subtree — failures are
	// isolated (skipped/partial output) instead of raised, mirroring
	// the cctx clone({err: [], collect: true}) in TS BagVal.gen.
	collect bool
	// THE COMPLETENESS PROBE (the review's finding C). Vet detects
	// residue by GENERATING the anchored meet and keeping the
	// incomplete-class failures. Generation honours the OUTPUT marks --
	// type() and hide() say "do not emit this" -- so a --at anchor
	// sitting under a mark generated nothing at all, reported nothing,
	// and vetted VALID for data missing a required field, while the same
	// anchor without the mark answered incomplete (use-cases/BUGS.md
	// §14). A mark is a decision about OUTPUT; it is not a statement
	// about what the data must satisfy, and --at names the truth to
	// validate against explicitly. Under this flag the generation walk
	// descends through marked values; nothing else changes, and no
	// output is produced from a probe run -- only its findings are read.
	// The twin of AontuContext.probe in ts/src/ctx.ts.
	probe bool
	// snapmap caches structural snapshots of ref spreads (see
	// snapshotRefSpread in mapval.go), keyed by the ref's canon + source
	// position — mirroring the snapmap on the TS unify root ctx.
	snapmap map[string]Val
	// entities is the identity registry (G4 phase 1): id -> the
	// representative value every position carrying that id has been
	// merged into. Same lifetime and placement as snapmap above — one
	// evaluation, one set of entities — mirroring the `entities` map on
	// the TS unify root ctx.
	entities map[string]Val
	// slot is the location the next Unify target is being driven at —
	// the TS ctx.path equivalent. Producers (bag child loops, func arg
	// loops, junction folds) set it right before a unite call; unite
	// scopes it to the single dispatched Unify; consumers (FuncVal,
	// MapVal, ListVal) read it at entry. nil means "unknown — fall back
	// to the Val's own stored path", which is correct whenever the Val
	// actually sits at its slot (everything except shared/transplanted
	// clones, whose stored paths carry overlay tails).
	slot []string

	// argsnap is set by stagedDrive while a staged func's data argument
	// is being driven (the Go side of the `argsnap` flag TS's
	// driveStagedArgs sets on the drive ctx): a reference resolving
	// inside such an argument is the generator's SNAPSHOT of its
	// source, outside the tree, so RefVal.find defers the copy until
	// the target has finished resolving IN THE TREE — where its own
	// spreads and relative references answer at their real location.
	// Copied earlier, the snapshot's rebased relative refs dangle
	// under the generator and it never fires (the spread-then-pack
	// defect, use-cases/BUGS.md pack-refs family).
	argsnap bool

	// The evaluation budgets (G5 trust profile, docs/trust.md): integer
	// counts of engine events, never wall-clock. ZERO MEANS THE DEFAULT
	// — the shared spec-visible constants test/spec/budget.tsv pins (9
	// passes, depth 1000) — so a bare &Ctx{} behaves exactly as before;
	// only aontu.go sets them, from the trust profile.
	budgetPasses int
	budgetDepth  int

	// prov is the provenance recorder (G7 phase 4), or nil for an
	// uninstrumented run. One run has one recorder: the Ctx is shared
	// by reference all the way down, as the error list is.
	prov *Provenance
}

func (c *Ctx) adderr(n *NilVal) {
	// An operand-less nil becomes its own primary (the TS ctx.adderr
	// rule), so it still renders a located section — e.g. the
	// budget_passes frame, whose siteless `-1:-1` arrow the shared
	// budget rows pin.
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

func (c *Ctx) errmsg() string {
	parts := make([]string, 0, len(c.err))
	for _, e := range c.err {
		// The thrown-error surface renders the full TS-style message
		// (marker, headline, hint, value line, frames); the LSP/Problem
		// surface keeps the short Message. See NilVal.FullMessage.
		parts = append(parts, e.FullMessage(c.src, c.file))
	}
	return strings.Join(parts, "\n------\n")
}
