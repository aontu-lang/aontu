/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

// THE PATH CONSTRUCTOR (docs/design/PATHS.0.md). `path(p)` CAPTURES
// `p` -- the one non-strict argument position in the language: every
// other call reads its argument's value, this one reads its spelling.
// `path($.a.b)` is the address `$.a.b` as a first-class value, not
// the value found there; a plain reference (`$.a.b` alone) stays the
// embedding it has always been.
//
// The capture happens in prepare(), which receives the argument
// BEFORE the driving loop resolves it -- the same interception this
// function always used, now kept instead of released: the RefVal's
// spelling is read off its segments and the RefVal itself is never
// driven, so no pass ever holds a resolvable reference here.
//
// `path()` with no argument is the path KIND (PathKindVal): the
// vacuous constructor call is the kind, as `{}`-the-unit is to maps
// -- see ContainerKindVal for the other half of that convention.
//
// A string argument is read by the ADDRESS grammar, not resolved as a
// segment: `path("$.a")` is the same capture `path($.a)` is, which is
// what canon and the promotion meet (`path() & "$.a"`) rely on.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { FuncBaseVal } from './FuncBaseVal'
import { PathVal, PathKindVal } from './PathVal'
import { parseAddress } from './ReferFuncVal'


// The address a reference SPELLS, or undefined when its segments
// cannot spell one (a variable segment, a parent step after the first
// named segment). Leading `.` entries in a relative ref's peg are
// parent steps; the spelling is the same grammar refer reads, so one
// address parser stays the single gate.
function captureSpelling(rv: any): string | undefined {
  const parts: string[] = []
  let up = 0
  let lead = true
  for (const p of rv.peg) {
    if ('string' !== typeof p) {
      return undefined
    }
    if ('.' === p) {
      if (!lead) {
        return undefined
      }
      up++
    }
    else {
      lead = false
      parts.push(p)
    }
  }
  if (0 === parts.length || (rv.absolute && 0 < up)) {
    return undefined
  }
  return rv.absolute ?
    '$.' + parts.join('.') :
    '.'.repeat(up + 1) + parts.join('.')
}


class PathFuncVal extends FuncBaseVal {
  isPathFunc = true

  prepared = 0

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    const pathfunc = new PathFuncVal(spec)
    pathfunc.prepared = this.prepared
    return pathfunc
  }

  funcname() {
    return 'path'
  }


  prepare(ctx: AontuContext, args: Val[]) {
    if (0 === this.prepared) {
      this.prepared++

      const arg: any = args[0]

      // The kind form: no argument to capture.
      if (null == arg) {
        return []
      }

      // The captured spelling, from a reference's segments or from a
      // string read as address text. Both go through parseAddress, so
      // what capture admits and what refer reads cannot drift.
      let spelling: string | undefined
      if (true === arg.isRef) {
        spelling = captureSpelling(arg)
      }
      else if (true === arg.isScalar && 'string' === typeof arg.peg) {
        spelling = arg.peg
      }
      else {
        return [makeNilErr(ctx, 'invalid-arg', this)]
      }

      if (undefined === spelling || undefined === parseAddress(spelling)) {
        return [makeNilErr(ctx, 'path_address', this, arg)]
      }

      return [new PathVal({ peg: spelling }, ctx)]
    }

    return args
  }


  resolve(ctx: AontuContext, args: Val[]) {
    if (0 === args.length) {
      const out = new PathKindVal({}, ctx)
      out.site = this.site
      out.path = this.path
      return out
    }
    return args[0]
  }

} /* node:coverage ignore next 6 */


export {
  PathFuncVal,
}
