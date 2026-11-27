/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { restRefuse } from '../siggate'
import { FuncBaseVal } from './FuncBaseVal'
import { liftCopy, member } from './RefVal'
import { fixSeals } from './SealVal'
import { throughWrap } from './RecurseVal'


// A list counts a negative integer from its end, which a path step does not.
function step(node: any, key: any): Val | undefined {
  const at = 'number' === typeof key.peg && true === node?.isList && key.peg < 0 ?
    node.peg.length + key.peg : key.peg
  return true === node?.isMap || true === node?.isList ? member(node, String(at)) : undefined
}


class AtFuncVal extends FuncBaseVal {
  isAtFunc = true

  staged = true
  folds = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new AtFuncVal(spec)
  }


  funcname() {
    return 'at'
  }


  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    if (!this.foldReady(ctx, this.peg.length)) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const refused = restRefuse(ctx, this, args)
    if (undefined !== refused) {
      return refused
    }

    let node: any = args[0]
    for (const key of args.slice(1)) {
      node = step(throughWrap(node), key)
      if (null == node) {
        return this.place(makeNilErr(ctx, 'no_path', this))
      }
    }

    const out = node.clone(ctx, { dup: true })
    fixSeals(out)
    return this.place(liftCopy(out, true === node.mark.type))
  }
} /* node:coverage ignore next 5 */


export {
  AtFuncVal,
}
