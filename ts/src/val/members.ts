/* Copyright (c) 2025 Richard Rodger, MIT License */


import type { Val } from '../type'
import { AontuContext } from '../ctx'
import { cmpCodePoint } from '../keyorder'
import { empty } from './Val'
import { bagGenable } from './BagVal'


type Member = { key: string, val: Val }


function bagMembers(data: any, ctx: AontuContext): Member[] | undefined {
  if (true !== data?.isMap && true !== data?.isList) {
    return undefined
  }

  const keys: string[] = true === data.isMap ?
    Object.keys(data.peg).sort(cmpCodePoint) :
    (data.peg as Val[]).map((_v: Val, i: number) => '' + i)

  const lifted = true === data.mark.hide || true === data.mark.type

  const out: Member[] = []
  for (const key of keys) {
    const val: any = data.peg[key]
    if ((!lifted && (true === val.mark.hide || true === val.mark.type))
      || data.aliasKeys.includes(key)) {
      continue
    }
    if (data.optionalKeys.includes(key) &&
      (true === ctx.noFill || !filled(val, ctx))) {
      continue
    }
    out.push({ key, val })
  }
  return out
}


// An optional child is a member when it generates something, decided
// as BagVal.gen decides it: in an isolated collect context, so residue
// inside an absent optional subtree is dropped rather than raised.
function filled(val: any, ctx: AontuContext): boolean {
  if (!bagGenable(val)) {
    return false
  }
  const cval = val.gen(ctx.clone({ err: [], collect: true }))
  return undefined !== cval && !empty(cval)
}


// The member values alone, for the verbs that do not need the keys.
function memberVals(data: any, ctx: AontuContext): Val[] | undefined {
  const members = bagMembers(data, ctx)
  return undefined === members ? undefined : members.map((m) => m.val)
} /* node:coverage ignore next 6 */


export {
  bagMembers,
  memberVals,
}
