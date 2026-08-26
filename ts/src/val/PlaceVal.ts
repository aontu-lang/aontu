/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE PLACEHOLDER `_` (G8 phase 3,
// docs/capability-review/g8-generation.md): a HOLE in a call, filled
// by whatever the call is unified with.
//
//   x: {&: {m: _ + 2}}   x: a: m: 1     ->  a: m: 3
//   greeting: upper(_) & hello          ->  "HELLO"
//
// WHY A HOLE AND NOT A FUNCTION PARAMETER. Aontu has no user-defined
// functions and will not get them (G8's Boundary): a function value
// crossing into the data plane is the step that makes a configuration
// language a programming language. A hole is not a parameter -- it
// cannot be named, passed, or partially applied. It says only "the
// value that arrives here", which is what a template needs to compute
// from the value it lands on.
//
// ALONE, `_` IS TOP WITH A MARK: it admits everything and is filled by
// its peer, exactly as TOP is dropped by one. What makes it different
// is that a CALL can see it, and a call that holds one waits for a
// peer to fill it instead of resolving around it. Unfilled at
// generation it is an error, as TOP is -- a hole is not a value.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { Val as ValBase } from './Val'


class PlaceVal extends ValBase {
  isPlace = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  unify(peer: Val, _ctx: AontuContext): Val {
    // The peer FILLS the hole. Against TOP there is nothing to fill it
    // with, so it waits -- and waiting is not done, or a call holding
    // it would resolve around it.
    if (peer.isTop) {
      this.notdone()
      return this
    }

    return peer
  }


  get canon() {
    return '_'
  }


  // A hole admits everything, so nothing sits above it -- the same
  // answer TOP gives, for the same reason.
  superior(): Val {
    return this
  }


}


// A HOLE BELONGS TO ITS NEAREST ENCLOSING GENERATOR. A `_` inside a
// generator's template (pack/each, arg 1) or condition (filter, arg 1)
// is that generator's to bind — "_ is the source child" — so neither
// the hole test nor the fill walk may cross into those arguments from
// outside. Before this boundary, `close(pack(d, _ & t))` reported a
// hole to the OUTER call, so an ordinary overlay statement was
// absorbed into the template instead of merging with the generated
// child (use-cases/BUGS.md §10), and an outer pack's fill pass
// captured a NESTED pack's hole lexically, binding it to the outer
// source (§34). The data argument (arg 0) is not a binding position,
// so it stays visible: a hole there is an outer hole as before.
function boundArgStart(v: any): number {
  return true === v.isPackFunc || true === v.isEachFunc ||
    true === v.isFilterFunc ? 1 : Infinity
}


// Does this value CONTAIN a hole? Asked of a call before it resolves:
// a call holding one must wait for a peer to fill it. Holes inside a
// generator's own binding arguments are NOT this value's holes — see
// boundArgStart above.
function hasPlace(v: Val): boolean {
  if (true === (v as any).isPlace) {
    return true
  }

  const peg: any = (v as any).peg
  const bound = boundArgStart(v)

  if (Array.isArray(peg)) {
    for (let cI = 0; cI < peg.length && cI < bound; cI++) {
      const c = peg[cI]
      if (true === c?.isVal && hasPlace(c)) {
        return true
      }
    }
  }
  else if (true === peg?.isVal) {
    return hasPlace(peg)
  }
  else if (null != peg && 'object' === typeof peg) {
    for (const k of Object.keys(peg)) {
      if (true === peg[k]?.isVal && hasPlace(peg[k])) {
        return true
      }
    }
  }

  return false
}


// The same tree with every hole filled by `fill`. Answers the value
// UNCHANGED when it holds no hole, so a caller can test identity to
// know whether anything was filled -- and so a tree with no hole is
// never needlessly cloned. A nested generator's binding arguments are
// left untouched (boundArgStart): those holes are the inner
// generator's to fill with its OWN source children when it fires.
function fillPlace(v: Val, fill: Val, ctx: AontuContext): Val {
  if (true === (v as any).isPlace) {
    return fill
  }

  const peg: any = (v as any).peg
  const bound = boundArgStart(v)

  if (Array.isArray(peg)) {
    let changed = false
    const out = peg.map((c: any, cI: number) => {
      if (true !== c?.isVal || bound <= cI) {
        return c
      }
      const f = fillPlace(c, fill, ctx)
      changed = changed || f !== c
      return f
    })
    return changed ? rebuild(v, out, ctx) : v
  }

  if (true === peg?.isVal) {
    const f = fillPlace(peg, fill, ctx)
    return f === peg ? v : rebuild(v, f, ctx)
  }

  if (null != peg && 'object' === typeof peg) {
    let changed = false
    const out: Record<string, Val> = {}
    for (const k of Object.keys(peg)) {
      const c = peg[k]
      // No isVal guard: a slot holding something that is not a Val
      // answers itself, because fillPlace's own first tests -- is it a
      // hole, has it a peg -- are both false for one.
      const f = fillPlace(c, fill, ctx)
      changed = changed || f !== c
      out[k] = f
    }
    return changed ? rebuild(v, out, ctx) : v
  }

  return v
}


// A clone carrying a new peg. `clone` shares the peg by reference (see
// Val.clone), which is exactly what must NOT happen here: the tree
// being filled is a template, and the fill is one destination's.
function rebuild(v: Val, peg: any, ctx: AontuContext): Val {
  const out: any = v.clone(ctx)
  out.peg = peg
  out.dc = 0
  return out
} /* node:coverage ignore next 8 */


export {
  hasPlace,
  fillPlace,
  PlaceVal,
}
