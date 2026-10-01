/* Copyright (c) 2026 Richard Rodger, MIT License */


// The admission trial (G12): whether a settled value IS an instance of a
// trial schema. The meet may add nothing the value lacks, and must
// generate the value's own JSON.

import type { Val } from './type'

import { Aontu } from './aontu'
import { ConjunctVal } from './val/ConjunctVal'
import { admitsJson, fillDiff } from './val/admission'


export { fillDiff }


function generated(aontu: Aontu, v: Val): any {
  const ctx: any = aontu.ctx({ collect: true })
  ctx.root = v
  const out = (v as any).gen(ctx)
  return 0 === ctx.err.length ? out : undefined
}


// Whether `trial` admits `value`. Both are cloned: a Val tree is single-use.
export function admits(aontu: Aontu, trial: Val, value: Val): boolean {
  const ctx: any = aontu.ctx({ collect: true })
  const pair = new ConjunctVal({ peg: [trial.clone(ctx), value.clone(ctx)] }, ctx)
  const met: any = aontu.unify(pair, undefined, ctx)
  if (0 < ctx.err.length || true === met?.isNil) {
    return false
  }
  const out = generated(aontu, met)
  const own = generated(aontu, value.clone(aontu.ctx({ collect: true })))
  return undefined !== out && undefined !== own && admitsJson(met, out, own)
}
