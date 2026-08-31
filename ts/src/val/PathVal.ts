/* Copyright (c) 2025 Richard Rodger, MIT License */

// FIRST-CLASS PATHS (docs/design/PATHS.0.md). A PathVal is the value
// `path(p)` captures: a tree address as DATA -- the spelling, never
// the resolution. It is a scalar whose peg is the address string in
// exactly the grammar `refer` reads (`$.a.b` from the root, `.b` from
// the sibling scope, one more leading dot per parent step), which is
// what lets a captured path meet the checking machinery unchanged.
//
// Meets are SYNTACTIC, by the PREFIX rule (amended, ADR-016): two
// path values meet when one spells a prefix of the other -- same
// anchor, the shorter's segments opening the longer's -- and the
// result is the LONGER: a path can always be told more precisely.
// Incomparable spellings refuse as any two unequal scalars do.
// Resolving during a meet would make the meet depend on the value's
// position, which is the property the staging machinery exists to
// quarantine -- resolution stays the business of `refer`, `rel` and
// the graph.
//
// The kind sits UNDER string (ScalarKindVal.KIND_PARENT), so `string`
// admits a path value and the string constraints keep working; a
// plain string LITERAL and a path value refuse each other, exactly as
// the number tower's leaves do. A bare string is NEVER a path
// (ADR-016): `path("...")` -- the call's own string argument -- is
// the one conversion the language has.

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



// A segment of a tree path: a map key or a list index. The same
// grammar the rest of the engine spells keys with, and a leading digit
// is legitimate because a list index is one.
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


// The address a string spells, or undefined when it does not spell
// one. An address is a TREE PATH, in exactly the two spellings a
// reference uses: `$.services.auth` from the root, `.auth` from the
// link's own sibling scope. The tree is the only namespace -- which is
// what makes a model instantiable more than once, each instance
// resolving its relative links inside itself (ADR-014).
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


// The spelling string TEXT converts by, inside a `path(...)` call:
// text that carries no anchor is RELATIVE (`"a.b"` is the address
// `.a.b`), matching the raw form (`path(a.b)` captures `.a.b`). Only
// the anchor is supplied -- the result still has to parse, so
// malformed text (`""`, `"a..b"`, a bad `$` spelling) refuses as
// before. The prefix is not applied to text that claims an anchor:
// `"$x"` is a broken absolute address, not a relative one.
export function textAddress(s: string): string {
  return ('$' === s[0] || '.' === s[0]) ? s : '.' + s
}


// The LONGER of two addresses when one spells a prefix of the other
// (docs/design/PATHS.0.md, amended): same anchor -- absolute or the
// same number of parent steps -- and the shorter's segments open the
// longer's. The meet of two path values, and of a refer's address
// with a later path peer: a path can always be told more precisely,
// and the more precise spelling is the result. Undefined when the two
// are not comparable, which refuses as any two unequal scalars do.
// Both arguments must already be valid addresses: every caller hands
// over a PathVal peg or a refer addrsrc, and both are validated at
// capture or conversion -- the same trust `unify`'s own address arm
// extends (`parseAddress(p.peg) as Address`).
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

  // Two path values meet by the PREFIX rule (ADR-016): the longer
  // when one opens the other, refusal otherwise. Exactly equal pegs
  // are absorbed by unite's fast path before this runs, so the arm
  // sees the unequal pairs; the winner carries both sides' marks, as
  // the equal-scalar arm has always ratcheted them.
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

  // The super() ladder lifts a path value to its own kind, and the
  // kind must render as `path()` -- the bare word `path` is an
  // ordinary string. ScalarVal.superior would mint the plain
  // ScalarKindVal, whose canon is the bare word.
  superior() {
    return this.place(new PathKindVal({}))
  }

} /* node:coverage ignore next 4 */


// The path KIND, `path()`: admits every path value and defaults to
// nothing, as `string` does. It does NOT promote (ADR-016): a bare
// string meeting the kind refuses through the generic kind ladder,
// exactly as `integer & "x"` does -- `path("...")` is the one string
// conversion, and it happens at the call.
class PathKindVal extends ScalarKindVal {
  isPathKind = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ ...spec, peg: Path }, ctx)
  }

  get canon() {
    return 'path()'
  }

} /* node:coverage ignore next 6 */


export {
  PathVal,
  PathKindVal,
}
