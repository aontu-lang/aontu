/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { Val as ValBase } from './Val'
import { makeNilErr } from '../err'


class PlaceVal extends ValBase {
  isPlace = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  // A hole left unbound stands for any value, as the definition reads an
  // unused declaration's body: against TOP it waits, never done, so a
  // call holding it is never made around it.
  unify(peer: Val, _ctx: AontuContext): Val {
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


// The calls whose arguments from the second on are templates.
const BINDING = new Set(['pack', 'each', 'apply', 'filter', 'emit'])


function boundArgStart(v: any): number {
  return true === v?.isFunc ? boundFrom(v.funcname()) : Infinity
}


function boundFrom(name: string): number {
  return BINDING.has(name) ? 1 : Infinity
}


// A hole nothing binds where it is written (ruling 34): one outside the
// template of a generator, an apply or a filter's condition, one in a
// spread's template, and a name whose body holds one, though not as an
// emit's table. It is reported at the member it is written in.
function unboundHole(ctx: AontuContext, root: Val): Val | undefined {
  const decls = new Map<string, Val>()
  declsIn(root, decls, new Set())
  const holed = new Set<string>()
  let grew = true
  while (grew) {
    grew = false
    for (const [key, body] of decls) {
      if (!holed.has(key) && undefined !== looseIn(body, holed, false, [])) {
        holed.add(key)
        grew = true
      }
    }
  }
  const found = looseIn(root, holed, false, [])
  if (undefined === found) {
    return undefined
  }
  const nil: any = makeNilErr(ctx, 'hole_unbound', found[0], undefined, 'parse')
  nil.path = found[1]
  return nil
}


function declsIn(v: any, decls: Map<string, Val>, seen: Set<Val>): void {
  if (true !== v?.isVal || seen.has(v)) {
    return
  }
  seen.add(v)
  for (const key of v.aliasKeys ?? []) {
    decls.set(key, v.peg[key])
  }
  partsOf(v).forEach((c: any) => declsIn(c, decls, seen))
}


// The path steps through members only: a list or a map inside a call's
// arguments is no member, and the engines shape those differently.
function looseIn(v: any, holed: Set<string>, tmpl: boolean,
  path: string[], calls = false): [Val, string[]] | undefined {
  if (true === v?.isPlace) {
    return tmpl ? undefined : [v, path]
  }
  if (true === v?.isRef) {
    return holed.has(v.aliasKey) ? [v, path] : undefined
  }
  if (true !== v?.isVal) {
    return undefined
  }
  const call = callOf(v)
  if (undefined !== call) {
    const from = boundFrom(call.name)
    for (let i = 0; i < call.args.length; i++) {
      const arg: any = call.args[i]
      if ('emit' === call.name && 1 === i && undefined !== arg?.aliasKey) {
        continue
      }
      const found = looseIn(arg, holed, tmpl || from <= i, path, true)
      if (undefined !== found) {
        return found
      }
    }
    return undefined
  }
  const peg: any = v.peg
  if (Array.isArray(peg) || true === peg?.isVal) {
    const items = [peg].flat()
    for (let i = 0; i < items.length; i++) {
      const found = looseIn(items[i], holed, tmpl,
        true === v.isList && !calls ? [...path, '' + i] : path,
        calls || true === v.isOp || true === v.isConstraint)
      if (undefined !== found) {
        return found
      }
    }
  }
  else if (null != peg && 'object' === typeof peg) {
    for (const k of Object.keys(peg)) {
      if (!(v.aliasKeys ?? []).includes(k)) {
        const found = looseIn(peg[k], holed, tmpl, calls ? path : [...path, k], calls)
        if (undefined !== found) {
          return found
        }
      }
    }
  }
  return looseIn(v.spread?.cj, holed, false, path, calls)
}


// A call's name and arguments: a refused one's are as written.
function callOf(v: any): { name: string, args: Val[] } | undefined {
  return true === v.isFunc ? { name: v.funcname(), args: v.peg } : v.refusedCall
}


function partsOf(v: any): any[] {
  const peg: any = callOf(v)?.args ?? v.peg
  const parts = Array.isArray(peg) ? [...peg] : true === peg?.isVal ? [peg] :
    null != peg && 'object' === typeof peg ? Object.values(peg) : []
  return null == v.spread?.cj ? parts : [...parts, v.spread.cj]
}


// A hole at any depth, but in a nested generator's template.
function hasPlace(v: any): boolean {
  if (true === v?.isPlace) {
    return true
  }
  const peg: any = v?.peg
  const kids: any[] = Array.isArray(peg) ? peg.slice(0, boundArgStart(v)) :
    true === peg?.isVal ? [peg] : null != peg && 'object' === typeof peg ? Object.values(peg) : []
  return kids.some((c: any) => true === c?.isVal && hasPlace(c))
}


// A call waits on a hole among its own arguments, not one a container
// argument holds.
function waitsOnHole(v: any): boolean {
  if (true === v?.isPlace) {
    return true
  }
  if (true === v?.isMap || true === v?.isList) {
    return false
  }
  const peg: any = v?.peg
  if (Array.isArray(peg)) {
    return peg.slice(0, boundArgStart(v)).some((c: any) => true === c?.isVal && waitsOnHole(c))
  }
  return true === peg?.isVal && waitsOnHole(peg)
}


// Each hole an instance's template holds, bound to the value it is made
// from: not one in a nested generator's template, which is that one's.
function fillPlace(v: Val, fill: Val, ctx: AontuContext): Val {
  if (true === (v as any).isPlace) {
    return fill.clone(ctx, { path: [...(v as any).path] })
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
      // hole, has it a peg -- are all false for one.
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
} /* node:coverage ignore next 11 */


export {
  boundArgStart,
  hasPlace,
  rebuild,
  unboundHole,
  waitsOnHole,
  fillPlace,
  PlaceVal,
}
