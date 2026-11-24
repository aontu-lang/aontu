/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { StringVal } from '../val/StringVal'
import { ScalarKindVal } from '../val/ScalarKindVal'


import { FuncBaseVal } from './FuncBaseVal'
import { makeNilErr } from '../err'


class KeyFuncVal extends FuncBaseVal {
  isKeyFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new KeyFuncVal(spec)
  }

  funcname() {
    return 'key'
  }


  staged = true


  resolve(ctx: AontuContext, _args: Val[]) {
    let out: Val = this

    const argval: any = this.peg?.[0]
    let move = 1

    if (null != argval) {
      if (argval.isInteger) {
        move = argval.peg as number
      }
      else if (argval.isBigInteger) {
        // A level far outside the path simply misses, exactly as an
        // out-of-range plain integer already does, so Number() here needs
        // no bound of its own.
        move = Number(argval.peg as bigint)
      }
      else {
        return makeNilErr(ctx, 'key_level', this)
      }
    }

    let positioned = true
    for (const seg of this.path) {
      if ('string' !== typeof seg) {
        positioned = false
        break
      }
    }

    const here = positioned ? this.path : ctx.path
    const at = here.length - (1 + move)

    // A key that climbs out of a declaration's body waits for the use that places it.
    const waits = at <= 0 && true === (ctx.root as any)?.aliasKeys?.includes(here[0])
    out = waits ? new ScalarKindVal({ peg: String, emptyOk: true } as any) :
      new StringVal({ peg: here[at] ?? '' })
    // A copy reads its key again where it stands (ruling 22).
    ; (out as any).reread = [this]
    ; (out as any).unplaced = waits

    return out
  }


  gen(_ctx: AontuContext): any {
    return undefined
  }

} /* node:coverage ignore next 6 */


export {
  KeyFuncVal,
}
