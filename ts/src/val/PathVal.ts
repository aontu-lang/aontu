/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { propagateMarks } from '../utility'

import { ScalarVal } from './ScalarVal'
import { ScalarKindVal, Path } from './ScalarKindVal'


const ADDR_SEGMENT = /^[A-Za-z0-9_-]+$/

export type Address = {
  // Anchored at the document root (`$.a.b`) rather than at the link's
  // own position (`.a.b`).
  absolute: boolean
  // Parent steps, for a relative address that climbs (`..a` is one).
  up: number
  // The written segments, below the anchor.
  parts: string[]
}


export function parseAddress(s: string): Address | undefined {
  if ('$' === s) {
    // The whole document is not a relation's target: an address must
    // name something with a position to be written back into.
    return undefined
  }
  if (s.startsWith('$.')) {
    const parts = s.slice(2).split('.')
    for (const seg of parts) {
      if (!ADDR_SEGMENT.test(seg)) {
        return undefined
      }
    }
    return { absolute: true, up: 0, parts }
  }
  if (!s.startsWith('.')) {
    return undefined
  }
  // A relative address: the leading dot anchors it at the sibling
  // scope, and every FURTHER leading dot is one step up from there --
  // the same reduction a relative reference's `.` segments perform.
  let up = 0
  let rest = s.slice(1)
  while (rest.startsWith('.')) {
    up++
    rest = rest.slice(1)
  }
  if ('' === rest) {
    return undefined
  }
  const parts = rest.split('.')
  for (const seg of parts) {
    if (!ADDR_SEGMENT.test(seg)) {
      return undefined
    }
  }
  return { absolute: false, up, parts }
}


export function textAddress(s: string): string {
  return ('$' === s[0] || '.' === s[0]) ? s : '.' + s
}


export function prefixMeet(a: string, b: string): string | undefined {
  const pa = parseAddress(a) as Address
  const pb = parseAddress(b) as Address
  if (pa.absolute !== pb.absolute || pa.up !== pb.up) {
    return undefined
  }
  const short = pa.parts.length <= pb.parts.length ? pa : pb
  const long = short === pa ? pb : pa
  for (let i = 0; i < short.parts.length; i++) {
    if (short.parts[i] !== long.parts[i]) {
      return undefined
    }
  }
  return short === pa ? b : a
}


class PathVal extends ScalarVal {
  isPath = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ peg: spec.peg, kind: Path }, ctx)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (true === p.isPath) {
      const merged = prefixMeet(this.peg, p.peg)
      if (undefined === merged) {
        return makeNilErr(ctx, 'scalar_value', this, peer)
      }
      const out = merged === this.peg ? this : p
      const other = out === this ? p : this
      propagateMarks(other, out)
      return out
    }
    return super.unify(peer, ctx)
  }

  // Reparses to the same VALUE: the call form is the literal syntax
  // for this kind, so canon renders it back. The peg is already the
  // address grammar, which the argument grammar also accepts.
  get canon() {
    return 'path(' + this.peg + ')'
  }

  superior() {
    return this.place(new PathKindVal({}))
  }

} /* node:coverage ignore next 4 */


class PathKindVal extends ScalarKindVal {
  isPathKind = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ ...spec, peg: Path }, ctx)
  }

  get canon() {
    return 'path'
  }

} /* node:coverage ignore next 6 */


export {
  PathVal,
  PathKindVal,
}
