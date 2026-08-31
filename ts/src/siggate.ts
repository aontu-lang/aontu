/* Copyright (c) 2021-2026 Richard Rodger, MIT License */

// THE RUNTIME SIGNATURE CHECKER (docs/design/SIGNATURES.0.md). One
// argument gate, run by the shared function machinery
// (FuncBaseVal.unify) just before a call resolves, when its arguments
// are driven: for each VALUE-mode argument whose declared type is
// scalar-kind words, the driven Val must be a concrete scalar of an
// admitted kind. A failure refuses as `func_arg`, whose hint renders
// the signature line and names the offending argument -- the
// error-message builder the registry exists for.
//
// The gate owns exactly the argument-shape refusals that were bare
// `invalid-arg` at the call: the case family's operand, the
// arithmetic operands, join's separator, pick's key. Everything with
// more meaning than a shape mismatch keeps its own code: the bag
// arguments (`pack_data`, `each_data`, `filter_data`,
// `aggregate_data` -- container words are not gate words), the
// constraint atoms (not on this path at all -- their refusals ride
// the residual), `key()` (whose level meaning `key_level` names, and
// which is skipped here for that reason), and the capture, template,
// trial, projector and text modes, none of which are read as values.
//
// What the gate refuses it must POSITIVELY identify: a concrete
// scalar of a wrong kind, a map, a list, or a scalar KIND marker
// where a value belongs. Anything else -- a preference, a residual, a
// disjunct -- passes through to the builtin's own logic, which is
// what keeps arith's unpref reading and join's deferral working.
// Twin: sigRefuse in go/siggate.go.

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


// The scalar-kind words the gate enforces, each to its lattice
// marker. A declared type is gate-checkable only when EVERY union
// word is here: `any`, `constraint`, and the container words leave
// the argument to the builtin.
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
} /* node:coverage ignore next 4 */


export {
  sigRefuse,
}
