/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { StringVal } from './StringVal'
import { FuncBaseVal } from './FuncBaseVal'


// A set with its ranges expanded, or undefined when a range descends.
// `-` first or last is a literal.
function expandSet(set: string): string[] | undefined {
  const cps = Array.from(set)
  const out: string[] = []

  for (let i = 0; i < cps.length; i++) {
    const c = cps[i]
    const next = cps[i + 1]
    const after = cps[i + 2]

    if ('-' === next && undefined !== after && 0 < i + 2) {
      const lo = c.codePointAt(0) as number
      const hi = after.codePointAt(0) as number
      if (hi < lo) {
        return undefined
      }
      for (let cp = lo; cp <= hi; cp++) {
        out.push(String.fromCodePoint(cp))
      }
      i += 2
      continue
    }

    out.push(c)
  }

  return out
}


function isSurrogate(c: string): boolean {
  const u = c.charCodeAt(0)
  return 1 === c.length && 0xD800 <= u && u <= 0xDFFF
}


// The text a value carries, when it is a concrete string.
function textOf(v: Val | undefined): string | undefined {
  const s: any = v
  return (true === s?.isScalar && 'string' === typeof s.peg) ? s.peg : undefined
}


class TranslateFuncVal extends FuncBaseVal {
  isTranslateFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new TranslateFuncVal(spec)
  }

  funcname() {
    return 'translate'
  }


  resolve(ctx: AontuContext, args: Val[]): Val {
    // Arity is checked at parse (funcArity), so a body guard is dead.
    const src = textOf(args[0])
    if (undefined === src) {
      return makeNilErr(ctx, 'invalid-arg', this, args[0], 'src')
    }

    const fromText = textOf(args[1])
    if (undefined === fromText) {
      return makeNilErr(ctx, 'invalid-arg', this, args[1], 'from')
    }
    const from = expandSet(fromText)
    if (undefined === from) {
      return makeNilErr(ctx, 'invalid-arg', this, args[1], 'from')
    }

    let to: string[] = []
    if (3 === args.length) {
      const toText = textOf(args[2])
      if (undefined === toText) {
        return makeNilErr(ctx, 'invalid-arg', this, args[2], 'to')
      }
      const expanded = expandSet(toText)
      if (undefined === expanded) {
        return makeNilErr(ctx, 'invalid-arg', this, args[2], 'to')
      }
      // A range through the surrogate block writes U+FFFD for each of
      // its surrogates, as Go's encoder does: no string holds one.
      to = expanded.map((c) => isSurrogate(c) ? '\uFFFD' : c)
    }

    // The table, built left to right so a character named twice takes
    // its last mapping. An empty `to` maps to nothing, which is the
    // deletion: there is no last character to pad with.
    const pad = 0 < to.length ? to[to.length - 1] : undefined
    const table = new Map<string, string | undefined>()
    for (let i = 0; i < from.length; i++) {
      table.set(from[i], i < to.length ? to[i] : pad)
    }

    let out = ''
    for (const c of Array.from(src)) {
      if (table.has(c)) {
        const sub = table.get(c)
        if (undefined !== sub) {
          out += sub
        }
        continue
      }
      out += c
    }

    return this.place(new StringVal({ peg: out }, ctx))
  }

} /* node:coverage ignore next 6 */


export {
  expandSet,
  TranslateFuncVal,
}
