/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { FuncBaseVal } from './FuncBaseVal'
import { PathVal, PathKindVal, parseAddress, textAddress } from './PathVal'


// The address a reference SPELLS, or undefined when its segments
// cannot spell one (a variable segment, a parent step after the first
// named segment). Leading `.` entries in a relative ref's peg are
// parent steps; the spelling is the same grammar a link reads, so one
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

      let spelling: string | undefined
      if (true === arg.isRef) {
        spelling = captureSpelling(arg)
      }
      else if (true === arg.isScalar && 'string' === typeof arg.peg) {
        spelling = textAddress(arg.peg)
      }
      else {
        return args
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
    const arg: any = args[0]
    if (true === arg.isPath || true === arg.isNil) {
      return arg
    }
    // The COMPUTED argument, driven by the loop above: a string
    // converts by the address grammar, exactly as a literal does at
    // capture; anything else was never a path expression.
    if (true === arg.isScalar && 'string' === typeof arg.peg) {
      const spelling = textAddress(arg.peg)
      if (undefined === parseAddress(spelling)) {
        return makeNilErr(ctx, 'path_address', this, arg)
      }
      return new PathVal({ peg: spelling }, ctx)
    }
    return makeNilErr(ctx, 'invalid-arg', this)
  }

} /* node:coverage ignore next 6 */


export {
  PathFuncVal,
}
