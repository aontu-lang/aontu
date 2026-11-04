/* Copyright (c) 2025 Richard Rodger, MIT License */


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

  held = false

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out = super.clone(ctx, spec) as PlaceVal
    out.held = this.held
    return out
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


  // A hole admits everything, so nothing sits above it, as for TOP.
  superior(): Val {
    return this
  }


}


function boundArgStart(v: any): number {
  return true === v.isPackFunc || true === v.isEachFunc ||
    true === v.isFilterFunc || true === v.isEmitFunc ||
    true === v.isFormFunc ? 1 : Infinity
}


function hasPlace(v: Val): boolean {
  return holeIn(v, true)
}


// Done but for the holes it waits on, which settle only when filled.
function doneButHoles(v: any): boolean {
  if (v.done || true === v.isPlace) {
    return true
  }
  if (true === v.isFunc || true === v.isOp) {
    return waitsOnHole(v) && v.peg.slice(0, boundArgStart(v)).every(doneButHoles)
  }
  if (true === v.isConjunct || true === v.isDisjunct) {
    return v.peg.every(doneButHoles)
  }
  if (true === v.isList) {
    return null == v.spread.cj && v.peg.every(doneButHoles)
  }
  if (true === v.isMap) {
    return null == v.spread.cj && Object.values(v.peg).every(doneButHoles)
  }
  return false
}


// A call waits on a hole in its arguments, not on one a container
// argument holds, which that container's own meet fills.
function waitsOnHole(v: Val): boolean {
  return holeIn(v, false)
}


function holeIn(v: Val, bags: boolean): boolean {
  if (true === (v as any).isPlace) {
    return true
  }
  if (!bags && (true === (v as any).isMap || true === (v as any).isList)) {
    return false
  }

  const peg: any = (v as any).peg
  const bound = boundArgStart(v)

  if (Array.isArray(peg)) {
    for (let cI = 0; cI < peg.length && cI < bound; cI++) {
      const c = peg[cI]
      if (true === c?.isVal && holeIn(c, bags)) {
        return true
      }
    }
  }
  else if (true === peg?.isVal) {
    return holeIn(peg, bags)
  }
  else if (null != peg && 'object' === typeof peg) {
    for (const k of Object.keys(peg)) {
      if (true === peg[k]?.isVal && holeIn(peg[k], bags)) {
        return true
      }
    }
  }

  return false
}


// The calls that compute from their arguments' values, so are made only
// once those values are whole, by the first argument whose holes they
// hold: a join over a list that holds a hole stands, as the definition
// reads it, so its separator is the first.
const HOLDING: Record<string, number> = {
  add: 0, sub: 0, mul: 0, div: 0, mod: 0, rem: 0, sum: 0, least: 0,
  greatest: 0, pick: 0, sort: 0, join: 1, upper: 0, lower: 0, esc: 0,
  usc: 0, rep: 0, split: 0, translate: 0, nom: 0, path: 0, abnf: 0,
  parse: 0, project: 0, folder: 0, file: 0, content: 0, line: 0,
  fragment: 0, slot: 0, inject: 0, copyfiles: 0, listitems: 0,
}


// A hole in a container a call takes is held: no peer of the call fills it.
function holdHoles(v: any, bagged: boolean): void {
  if (true === v?.isPlace) {
    v.held = v.held || bagged
    return
  }

  const bag = bagged || true === v?.isMap || true === v?.isList
  const peg: any = v?.peg
  const bound = boundArgStart(v)

  if (Array.isArray(peg)) {
    peg.slice(0, bound).forEach((c: any) => true === c?.isVal && holdHoles(c, bag))
  }
  else if (true === peg?.isVal) {
    holdHoles(peg, bag)
  }
  else if (null != peg && 'object' === typeof peg) {
    Object.values(peg).forEach((c: any) => true === c?.isVal && holdHoles(c, bag))
  }
}


function heldIn(v: any): boolean {
  if (true === v?.isPlace) {
    return true === v.held
  }

  const peg: any = v?.peg
  const bound = boundArgStart(v)

  if (Array.isArray(peg)) {
    return peg.slice(0, bound).some((c: any) => true === c?.isVal && heldIn(c))
  }
  if (true === peg?.isVal) {
    return heldIn(peg)
  }
  if (null != peg && 'object' === typeof peg) {
    return Object.values(peg).some((c: any) => true === c?.isVal && heldIn(c))
  }
  return false
}


// A held hole no meet reaches, under lists, maps and calls alone.
function stuckIn(v: any): boolean {
  if (true === v?.isPlace) {
    return true === v.held
  }
  if ((true === v?.isList || true === v?.isMap) && null == v.spread?.cj) {
    return Object.values(v.peg).some((c: any) => true === c?.isVal && stuckIn(c))
  }
  if (true === v?.isFunc) {
    return v.peg.slice(0, boundArgStart(v)).some((c: any) => true === c?.isVal && stuckIn(c))
  }
  return false
}


// Settled but for the holes a list or a map holds, or only the held
// ones where `held` asks, since no peer of the call fills them, and
// where `calls` asks, the calls there that wait on a hole of their own.
function bagHoles(v: any, held: boolean, calls = false): boolean {
  if (true === v?.done) {
    return true
  }
  if (true === v?.isPlace) {
    return !held || true === v.held
  }
  if (calls && (true === v?.isFunc || true === v?.isOp)) {
    return doneButHoles(v)
  }
  return (true === v?.isList || true === v?.isMap) && null == v.spread?.cj &&
    Object.values(v.peg).every((c: any) => bagHoles(c, held, calls))
}


// Settled but for a hole its own container holds, which nothing fills,
// or holding one no meet reaches, whatever else it waits on.
function unfillable(ctx: AontuContext, call: any, args: Val[]): boolean {
  return true === ctx.settle && undefined !== HOLDING[call.funcname()] &&
    !waitsOnHole(call) && (args.some(stuckIn) || (args.every(doneButHoles) && args.some(heldIn)))
}


// The bounds whose list or map argument holds its holes as a call's does.
const HELD_BOUNDS = new Set(['min', 'max', 'above', 'below', 'neq', 'mulof'])


function fillPlace(v: Val, fill: Val, ctx: AontuContext): Val {
  return fillIn(v, fill, ctx, true)
}


// The holes a call waits on, bound to its peer: a container argument
// keeps its own.
function bindHole(v: Val, fill: Val, ctx: AontuContext): Val {
  return fillIn(v, fill, ctx, false)
}


function fillIn(v: Val, fill: Val, ctx: AontuContext, bags: boolean): Val {
  if (true === (v as any).isPlace) {
    return fill.clone(ctx, { path: [...(v as any).path] })
  }
  if (!bags && (true === (v as any).isMap || true === (v as any).isList)) {
    return v
  }

  const peg: any = (v as any).peg
  const bound = boundArgStart(v)

  if (Array.isArray(peg)) {
    let changed = false
    const out = peg.map((c: any, cI: number) => {
      if (true !== c?.isVal || bound <= cI) {
        return c
      }
      const f = fillIn(c, fill, ctx, bags)
      changed = changed || f !== c
      return f
    })
    return changed ? rebuild(v, out, ctx) : v
  }

  if (true === peg?.isVal) {
    const f = fillIn(peg, fill, ctx, bags)
    return f === peg ? v : rebuild(v, f, ctx)
  }

  if (null != peg && 'object' === typeof peg) {
    let changed = false
    const out: Record<string, Val> = {}
    for (const k of Object.keys(peg)) {
      const c = peg[k]
      // No isVal guard: a slot holding something that is not a Val
      // answers itself, because fillIn's own first tests -- is it a
      // hole, a container, has it a peg -- are all false for one.
      const f = fillIn(c, fill, ctx, bags)
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
} /* node:coverage ignore next 17 */


export {
  bagHoles,
  boundArgStart,
  rebuild,
  hasPlace,
  HELD_BOUNDS,
  HOLDING,
  holdHoles,
  unfillable,
  doneButHoles,
  waitsOnHole,
  fillPlace,
  bindHole,
  PlaceVal,
}
