/* Copyright (c) 2021-2026 Richard Rodger, MIT License */


import type { Val } from './type'
import { AontuContext } from './ctx'
import { makeNilErr } from './err'

import { funcSig, renderSig } from './sig'
import type { FuncSig, ArgSig } from './sig'

import {
  BigDecimal,
  BigInteger,
  Float,
  Integer,
  Path,
  kindSubsumes,
} from './val/ScalarKindVal'


const SIG_KIND = new Map<string, any>([
  ['string', String],
  ['number', Number],
  ['integer', Integer],
  ['float', Float],
  ['biginteger', BigInteger],
  ['bigdecimal', BigDecimal],
  ['boolean', Boolean],
  ['path', Path],
])


function gateWords(type: string): any[] | undefined {
  const out: any[] = []
  for (const word of type.split('|')) {
    const marker = SIG_KIND.get(word)
    if (undefined === marker) {
      return undefined
    }
    out.push(marker)
  }
  return out
}


// The declared type admits a driven Val when the Val is a concrete
// scalar whose leaf kind is, or sits below, one of the declared
// words -- the same walk subsumption makes, so `number` admits every
// numeric leaf and `string` admits a path value.
function admits(markers: any[], arg: any): boolean {
  const leaf: any = arg.superior?.()
  if (true !== arg.isScalar || true !== leaf?.isScalarKind) {
    return false
  }
  for (const marker of markers) {
    if (marker === leaf.peg || kindSubsumes(marker, leaf.peg)) {
      return true
    }
  }
  return false
}


// The gate. Answers the func_arg refusal, or undefined to let the
// call resolve.
function sigRefuse(
  ctx: AontuContext, fn: any, args: Val[]
): Val | undefined {
  const sig: FuncSig | undefined = funcSig[fn.funcname()]

  // key() reads its level off the written peg and `key_level` names
  // what is wrong with a bad one; the gate leaves the meaning where
  // it lives.
  if (undefined === sig || 'key' === sig.name) {
    return undefined
  }

  for (let i = 0; i < sig.args.length; i++) {
    const a: ArgSig = sig.args[i]
    if (true === a.rest) {
      break
    }
    if ('value' !== a.mode) {
      continue
    }
    const markers = gateWords(a.type)
    if (undefined === markers) {
      continue
    }
    const arg: any = args[i]
    if (undefined === arg || true === arg.isNil || true !== arg.done) {
      continue
    }
    const shaped = (true === arg.isScalar) ||
      (true === arg.isMap) || (true === arg.isList) ||
      (true === arg.isScalarKind)
    if (shaped && !admits(markers, arg)) {
      return makeNilErr(ctx, 'func_arg', fn, arg, undefined, {
        func: sig.name,
        sig: renderSig(sig),
        arg: a.name,
        argn: '' + (i + 1),
        got: arg.canon,
      })
    }
  }

  return undefined
}


// The gate stops at a rest argument; a call that reads its rest as data
// asks for each one here.
function restRefuse(
  ctx: AontuContext, fn: any, args: Val[]
): Val | undefined {
  const sig: FuncSig = funcSig[fn.funcname()]
  const fixed = sig.args.length - 1
  const rest: ArgSig = sig.args[fixed]
  const markers = gateWords(rest.type) as any[]
  for (let i = fixed; i < args.length; i++) {
    const arg: any = args[i]
    if (!admits(markers, arg)) {
      return makeNilErr(ctx, 'func_arg', fn, arg, undefined, {
        func: sig.name,
        sig: renderSig(sig),
        arg: rest.name,
        argn: '' + (i + 1),
        got: arg.canon,
      })
    }
  }
  return undefined
} /* node:coverage ignore next 6 */


export {
  restRefuse,
  sigRefuse,
}
