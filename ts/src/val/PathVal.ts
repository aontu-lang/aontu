/* Copyright (c) 2025 Richard Rodger, MIT License */

// FIRST-CLASS PATHS (docs/design/PATHS.0.md). A PathVal is the value
// `path(p)` captures: a tree address as DATA -- the spelling, never
// the resolution. It is a scalar whose peg is the address string in
// exactly the grammar `refer` reads (`$.a.b` from the root, `.b` from
// the sibling scope, one more leading dot per parent step), which is
// what lets a captured path meet the checking machinery unchanged.
//
// Meets are SYNTACTIC: two path values meet only when they spell the
// same address. Resolving during a meet would make the meet depend on
// the value's position, which is the property the staging machinery
// exists to quarantine -- resolution stays the business of `refer`,
// `rel` and the graph.
//
// The kind sits UNDER string (ScalarKindVal.KIND_PARENT), so `string`
// admits a path value and the string constraints keep working; a
// plain string LITERAL and a path value still refuse each other,
// exactly as the number tower's leaves do -- promotion happens at the
// KIND, never between two concrete values.

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
import { parseAddress } from './ReferFuncVal'


class PathVal extends ScalarVal {
  isPath = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ peg: spec.peg, kind: Path }, ctx)
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
// nothing, as `string` does. One arm of its own on top of
// ScalarKindVal: PROMOTION. A string value that spells an address is
// admitted AS the path value -- this is the bridge that keeps the
// schema/data split intact: the schema writes the kind, plain
// JSON-shaped data writes the string, and the meet promotes. The
// spelling is kept as written, exactly as refer keeps its addrsrc.
class PathKindVal extends ScalarKindVal {
  isPathKind = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ ...spec, peg: Path }, ctx)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (true === p.isScalar && String === p.kind) {
      const addr = parseAddress(p.peg)
      if (undefined === addr) {
        return makeNilErr(ctx, 'path_address', this, peer)
      }
      const out = new PathVal({ peg: p.peg }, ctx)
      propagateMarks(this, out)
      propagateMarks(p, out)
      out.site = p.site
      out.path = p.path
      return out
    }
    return super.unify(peer, ctx)
  }

  get canon() {
    return 'path()'
  }

} /* node:coverage ignore next 6 */


export {
  PathVal,
  PathKindVal,
}
