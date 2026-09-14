/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import {
  splitWords,
  caseName,
  lowerASCII,
  capitalise,
} from '../casing'

import { MapVal } from './MapVal'
import { StringVal } from './StringVal'
import { FuncBaseVal } from './FuncBaseVal'


const NOM_STYLES = [
  'camel',   // userId
  'dot',
  'kebab',
  'pascal',  // UserId
  'path',
  'snake',
  'text',
  'title',
  'upper',   // USER_ID
]

// nom's style name -> the case style `caseName` serves. `upper` and
// `text` are nom's spellings.
const CASENAME_STYLES: Record<string, string> = {
  camel: 'camel',
  kebab: 'kebab',
  pascal: 'pascal',
  snake: 'snake',
  upper: 'screaming',
}


// One name in one style, or undefined when the style is not one, or
// when the name holds no words at all.
function styleName(name: string, style: string, acronyms: string[]):
  string | undefined {
  const src = name.replace(/[./]/g, '_')

  const words = splitWords(src)
  if (0 === words.length) {
    return undefined
  }

  const cased = CASENAME_STYLES[style]
  if (undefined !== cased) {
    return caseName(src, cased, acronyms)
  }

  if ('dot' === style) {
    return words.map(lowerASCII).join('.')
  }
  if ('path' === style) {
    return words.map(lowerASCII).join('/')
  }
  if ('title' === style) {
    return words.map((w) => capitalise(w, acronyms)).join(' ')
  }
  if ('text' === style) {
    const isAcronym = (w: string) =>
      acronyms.some((a) => lowerASCII(a) === lowerASCII(w))
    return [capitalise(words[0], acronyms)]
      .concat(words.slice(1).map((w) =>
        isAcronym(w) ? capitalise(w, acronyms) : lowerASCII(w)))
      .join(' ')
  }

  return undefined
}


// The text a value carries, when it is a concrete string. A path is a
// string too (ScalarKindVal's Path sits under String), so a spelled
// address may be renamed like any other text.
function textOf(v: Val | undefined): string | undefined {
  const s: any = v
  return (true === s?.isScalar && 'string' === typeof s.peg) ? s.peg : undefined
}


// An acronym set: a list of concrete strings, or undefined when the
// value is not one.
function acronymsOf(v: Val | undefined): string[] | undefined {
  const l: any = v
  if (true !== l?.isList) {
    return undefined
  }
  const out: string[] = []
  for (const el of l.peg as Val[]) {
    const t = textOf(el)
    if (undefined === t || '' === t) {
      return undefined
    }
    out.push(t)
  }
  return out
}


class NomFuncVal extends FuncBaseVal {
  isNamerFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new NomFuncVal(spec)
  }

  funcname() {
    return 'nom'
  }


  resolve(ctx: AontuContext, args: Val[]): Val {
    // Arity is checked at parse (funcArity); see the translate twin.
    const name = textOf(args[0])
    if (undefined === name || '' === name) {
      return makeNilErr(ctx, 'invalid-arg', this, args[0], 'name')
    }

    let style: string | undefined
    let acronyms: string[] = []

    if (2 <= args.length) {
      const second: any = args[1]
      if (true === second?.isList) {
        if (3 === args.length) {
          return makeNilErr(ctx, 'invalid-arg', this, args[2], 'arity')
        }
        const acr = acronymsOf(second)
        if (undefined === acr) {
          return makeNilErr(ctx, 'invalid-arg', this, second, 'acronyms')
        }
        acronyms = acr
      }
      else {
        style = textOf(second)
        if (undefined === style) {
          return makeNilErr(ctx, 'invalid-arg', this, second, 'style')
        }
        if (3 === args.length) {
          const acr = acronymsOf(args[2])
          if (undefined === acr) {
            return makeNilErr(ctx, 'invalid-arg', this, args[2], 'acronyms')
          }
          acronyms = acr
        }
      }
    }

    // One style: the string.
    if (undefined !== style) {
      const out = styleName(name, style, acronyms)
      if (undefined === out) {
        return makeNilErr(ctx, 'invalid-arg', this, args[1], 'style')
      }
      return this.place(new StringVal({ peg: out }, ctx))
    }

    const peg: Record<string, Val> = {}
    for (const s of NOM_STYLES) {
      const out = styleName(name, s, acronyms)
      if (undefined === out) {
        return makeNilErr(ctx, 'invalid-arg', this, args[0], 'name')
      }
      peg[s] = new StringVal({ peg: out }, ctx)
    }
    const map = new MapVal({ peg }, ctx)
    map.closed = true

    return this.place(map)
  }

} /* node:coverage ignore next 6 */


export {
  NOM_STYLES,
  NomFuncVal,
}
