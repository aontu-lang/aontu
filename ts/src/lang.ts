/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import { existsSync, readFileSync, realpathSync } from 'node:fs'
import {
  basename as pathBasename,
  dirname as pathDirname,
  join as pathJoin,
  resolve as pathResolve,
  sep as pathSep,
} from 'node:path'

import {
  Jsonic,
  Tabnas,
  Plugin,
  Rule,
  RuleSpec,
  Context as JsonicContext,
  JsonicError,
} from '@tabnas/jsonic'


import { funcSig } from './sig'
import type { FuncSig } from './sig'

import { make as makeJsonParser } from '@tabnas/json'
import { Toml } from '@tabnas/toml'
import { Jsonc } from '@tabnas/jsonc'
import { Json5 } from '@tabnas/json5'
import { Yaml } from '@tabnas/yaml'
import { Ini } from '@tabnas/ini'

import { Debug } from '@tabnas/debug'

import {
  MultiSource
} from '@tabnas/multisource'


import {
  makeFileResolver
} from '@tabnas/multisource/resolver/file'

import {
  makePkgResolver
} from '@tabnas/multisource/resolver/pkg'

import {
  makeMemResolver
} from '@tabnas/multisource/resolver/mem'

import {
  makeJsonicProcessor,
} from '@tabnas/multisource/processor/jsonic'

import { AONTU_SOURCES, AONTU_SCHEME, AONTU_MODELS } from './aontumodel'
import {
  parseModuleRef, resolveModule, modCacheDir, MODULE_REFUSAL_CODES,
} from './mod'

import {
  Expr,
  Op,
} from '@tabnas/expr'

import {
  Path
} from '@tabnas/path'

import type {
  Val,
  AontuOptions,
} from './type'

import {
  SPREAD,
  DEFAULT_OPTS,
} from './type'

import {
  Site
} from './site'

import {
  top
} from './val/top'


import {
  ScalarKindVal,
  BigDecimal,
  BigInteger,
  Float,
  Integer,
} from './val/ScalarKindVal'


import { BigDecimalVal } from './val/BigDecimalVal'
import { BigIntegerVal } from './val/BigIntegerVal'
import { BIG_LITERAL_RE, readBigLiteral } from './val/Decimal'
import { BooleanVal } from './val/BooleanVal'
import { ConjunctVal } from './val/ConjunctVal'
import { DisjunctVal } from './val/DisjunctVal'
import { IntegerVal } from './val/IntegerVal'
import { ListVal } from './val/ListVal'
import { MapVal } from './val/MapVal'
import { NilVal } from './val/NilVal'
import { NullVal } from './val/NullVal'
import { NumberVal } from './val/NumberVal'
import { isIntegerKind, isLossyIntegerLiteral } from './val/numkind'
import { PrefVal } from './val/PrefVal'
import { RefVal } from './val/RefVal'
import { StringVal } from './val/StringVal'
import { VarVal } from './val/VarVal'
import { PlusOpVal } from './val/PlusOpVal'
import { UpperFuncVal } from './val/UpperFuncVal'
import { LowerFuncVal } from './val/LowerFuncVal'
import { CopyFuncVal } from './val/CopyFuncVal'
import { KeyFuncVal } from './val/KeyFuncVal'
import { TypeFuncVal } from './val/TypeFuncVal'
import { HideFuncVal } from './val/HideFuncVal'
import { AbnfFuncVal, ParseFuncVal } from './val/AbnfFuncVal'
import { DeprecateFuncVal } from './val/DeprecateFuncVal'
import { ReferFuncVal, RelFuncVal } from './val/ReferFuncVal'
import { AcyclicFuncVal, InverseFuncVal } from './val/GraphAtomVal'
import { PackFuncVal } from './val/PackFuncVal'
import { CMP_FUNCS } from './val/CmpFuncVal'
import { MaybeFuncVal } from './val/MaybeFuncVal'
import { NomFuncVal } from './val/NomFuncVal'
import { TranslateFuncVal } from './val/TranslateFuncVal'
import { EachFuncVal } from './val/EachFuncVal'
import { FilterFuncVal } from './val/FilterFuncVal'
import { MatchFuncVal } from './val/MatchFuncVal'
import { EmitFuncVal } from './val/EmitFuncVal'
import {
  EscFuncVal, UscFuncVal, RepFuncVal, SplitFuncVal,
} from './val/StrFuncVal'
import {
  AddFuncVal, SubFuncVal, MulFuncVal, DivFuncVal, ModFuncVal, RemFuncVal,
} from './val/ArithFuncVal'
import {
  SumFuncVal, LeastFuncVal, GreatestFuncVal, PickFuncVal, SortFuncVal,
  JoinFuncVal,
} from './val/AggFuncVal'
import { PlaceVal } from './val/PlaceVal'
import { MoveFuncVal } from './val/MoveFuncVal'
import { PathFuncVal } from './val/PathFuncVal'
import { MapFuncVal, ListFuncVal } from './val/ContainerKindVal'
import { PrefFuncVal } from './val/PrefFuncVal'
import { CloseFuncVal } from './val/CloseFuncVal'
import { OpenFuncVal } from './val/OpenFuncVal'
import { SuperFuncVal } from './val/SuperFuncVal'
import {
  MinConstraintVal,
  MaxConstraintVal,
  AboveConstraintVal,
  BelowConstraintVal,
  NeqConstraintVal,
  ReConstraintVal,
  LengthConstraintVal,
  UniqueConstraintVal,
  MustConstraintVal,
} from './val/ConstraintVal'


const asPlugin = (p: unknown): Plugin => p as Plugin


function negsrc(src: string): string {
  return src.startsWith('-') ? src.slice(1) : '-' + src
}


function bigVal(res: RegExpExecArray): Val {
  const lit = readBigLiteral(res)
  const src = res[0]
  return 'biginteger' === lit.leaf ? new BigIntegerVal({ peg: lit.int, src }) :
    'bigdecimal' === lit.leaf ? new BigDecimalVal({ peg: lit.dec, src }) :
      new NilVal({ why: lit.code })
}


// Char codes of the literal's fixed opening, for the guard below.
const CC_0 = 48
const CC_d = 100
const CC_D = 68

const CC_PCT = 37
const ALIAS_RE = /^%[A-Za-z_][A-Za-z0-9_]*/

const CC_EQ = 61
const CC_SP = 32
const CC_TAB = 9

const CC_9 = 57
const CC_A = 65
const CC_Z = 90
const CC_a = 97
const CC_z = 122
const CC_E = 69
const CC_e = 101
const CC_US = 95
const CC_MINUS = 45
const CC_PLUS = 43

// Beyond ASCII a letter, a digit or a combining mark is text (`café`);
// a dash, a symbol or a space of any other kind is not.
const UNICODE_TEXT_RE = /^[\p{L}\p{N}\p{M}]$/u

function textChar(c: number): boolean {
  return (CC_0 <= c && c <= CC_9) ||
    (CC_a <= c && c <= CC_z) ||
    (CC_A <= c && c <= CC_Z) ||
    CC_US === c ||
    CC_MINUS === c ||
    (127 < c && UNICODE_TEXT_RE.test(String.fromCodePoint(c)))
}

// The lexer's text ender, at i. The regexp is the text matcher's own
// ender alternation (cfg.rePart.ender) made sticky, built once per
// config and cached on it.
function enderAt(cfg: any, src: string, i: number): boolean {
  let re: RegExp = cfg.aontu_ender_re
  if (null == re) {
    re = cfg.aontu_ender_re = new RegExp(cfg.rePart.ender.join(''), 'y')
  }
  re.lastIndex = i
  return re.test(src)
}

// Where the run ends, the index of its first BAD character (-1 when the
// run is clean) and that character.
type BareRun = { end: number, bad: number, ch: string }

function scanBareRun(cfg: any, src: string, start: number, expo: boolean): BareRun {
  let i = start
  let bad = -1
  let ch = ''
  while (i < src.length) {
    const c = src.codePointAt(i) as number
    const w = 0xffff < c ? 2 : 1
    if (textChar(c)) {
      i += w
      continue
    }
    if (expo && CC_PLUS === c && start < i) {
      const p = src.charCodeAt(i - 1)
      const n = src.charCodeAt(i + 1)
      if ((CC_e === p || CC_E === p) && CC_0 <= n && n <= CC_9) {
        i += 1
        continue
      }
    }
    if (enderAt(cfg, src, i)) {
      break
    }
    if (-1 === bad) {
      bad = i
      ch = String.fromCodePoint(c)
    }
    i += w
  }
  return { end: i, bad, ch }
}

// A run the number matcher may lex: its own number grammar, less the
// fraction -- `.` is a fixed token, so a run never holds one, and the
// matcher reads it past the run by itself (`1.5` is the run `1`).
const NUMBER_RUN_RE =
  /^[-+]?(?:0(?:[xX][0-9a-fA-F_]+|[oO][0-7_]+|[bB][01_]+)|[0-9][0-9_]*(?:[eE][-+]?[0-9][0-9_]*)?)$/

// The number matcher's hook result where the run is not its to lex.
const NOT_A_NUMBER = { done: true, token: undefined }

let AontuJsonic: Plugin = function AontuLang(jsonic: Jsonic) {

  jsonic.use(asPlugin(Path))

  let dotRef = (r: Rule, ctx: JsonicContext, terms: any, prefix: boolean) => {
    terms = dropUnfilled(terms)
    if (0 === terms.length) return incompleteNil(r, ctx)

    for (const t of terms) {
      const segs: any[] =
        Array.isArray(t.peg) ? t.peg :
          ('string' === typeof t.peg ? [t.peg] : [])
      for (const seg of segs) {
        if ('string' === typeof seg && ALIAS_RE.test(seg)) {
          return addsite(new NilVal({ why: 'alias_in_path' }), r, ctx)
        }
      }
    }

    return addsite(new RefVal({ peg: terms, prefix }), r, ctx)
  }

  jsonic.options({ comment: { def: null } })
  jsonic.options({
    comment: {
      lex: true,
      def: {
        hash: { line: true, start: '#', lex: true },
      },
    },
  })

  jsonic.options({
    number: {
      exclude: /__|^[-+]?0[xXoObB]_|_$/,

      check: (lex: any) => {
        const pnt = lex.pnt
        const src = lex.src
        const c = src.charCodeAt(pnt.sI)
        if (!(CC_0 <= c && c <= CC_9)) {
          return NOT_A_NUMBER
        }
        const run = scanBareRun(lex.cfg, src, pnt.sI, true)
        if (-1 !== run.bad || !NUMBER_RUN_RE.test(src.slice(pnt.sI, run.end))) {
          return NOT_A_NUMBER
        }
        return undefined
      },
    },
  })

  jsonic.options({
    text: {
      check: (lex: any) => {
        const pnt = lex.pnt
        const src = lex.src

        const ares = CC_PCT === src.charCodeAt(pnt.sI) ?
          ALIAS_RE.exec(lex.refwd()) : null
        if (null != ares) {
          const asrc = ares[0]

          let j = pnt.sI + asrc.length
          while (j < src.length &&
            (CC_SP === src.charCodeAt(j) || CC_TAB === src.charCodeAt(j))) {
            j++
          }
          if (CC_EQ === src.charCodeAt(j) && CC_EQ !== src.charCodeAt(j + 1)) {
            lex.aontu_eq_at = j
          }

          const atkn = lex.token(
            '#VL',
            (r: Rule, ctx: JsonicContext) =>
              addsite(new RefVal({ peg: [asrc], absolute: true }), r, ctx),
            asrc,
            pnt)
          pnt.sI += asrc.length
          pnt.cI += asrc.length
          return { done: true, token: atkn }
        }

        if (CC_EQ === src.charCodeAt(pnt.sI) && lex.aontu_eq_at === pnt.sI) {
          delete lex.aontu_eq_at
          const eqtkn = lex.token('#CL', undefined, '=', pnt, { aontu_eq: true })
          pnt.sI += 1
          pnt.cI += 1
          return { done: true, token: eqtkn }
        }

        if (CC_0 === src.charCodeAt(pnt.sI)) {
          const c1 = src.charCodeAt(pnt.sI + 1)
          if (CC_d === c1 || CC_D === c1) {
            const res = BIG_LITERAL_RE.exec(lex.refwd())
            if (null != res) {
              const msrc = res[0]
              const tkn = lex.token(
                '#VL',
                (r: Rule, ctx: JsonicContext) => addsite(bigVal(res), r, ctx),
                msrc,
                pnt)
              pnt.sI += msrc.length
              pnt.cI += msrc.length
              return { done: true, token: tkn }
            }
          }
        }

        const run = scanBareRun(lex.cfg, src, pnt.sI, false)
        const msrc = src.slice(pnt.sI, run.end)

        if (-1 !== run.bad) {
          const ch = run.ch
          const tkn = lex.token(
            '#VL',
            (r: Rule, ctx: JsonicContext) => {
              const nv: any = addsite(new NilVal({ why: 'bare_punct' }), r, ctx)
              nv.details = { char: ch, text: msrc }
              return nv
            },
            msrc,
            pnt,
            { aontu_bad: ch })
          pnt.sI += msrc.length
          pnt.cI += msrc.length
          return { done: true, token: tkn }
        }

        if (-1 !== msrc.indexOf('-')) {
          const tkn = lex.token('#TX', msrc, msrc, pnt)
          pnt.sI += msrc.length
          pnt.cI += msrc.length
          return { done: true, token: tkn }
        }

        return undefined
      },
    },
  })

  type TokenSite = { row: number, col: number, src: string, len: number }
  const NO_SITE: TokenSite = { row: -1, col: -1, src: '', len: -1 }
  const tokenSite = (tkn: any): TokenSite => {
    const src: string = tkn.src
    const bad = tkn.use?.aontu_bad
    if (null != bad) {
      const ch = '' + bad
      return { row: tkn.rI, col: tkn.cI + src.indexOf(ch), src: ch, len: ch.length }
    }
    return { row: tkn.rI, col: tkn.cI, src, len: '' === src ? -1 : src.length }
  }
  const siteAt = (v: Val, ts: TokenSite): Val => {
    v.site.row = ts.row
    v.site.col = ts.col
    v.site.src = ts.src
    v.site.len = ts.len
    return v
  }

  let addsite = (v: Val, r: Rule, ctx: JsonicContext) => {
    // The source text comes from the SAME token the row and column
    // come from. jsonic has carried it all along; not reading it is
    // what left a site uneditable (ts/src/site.ts).
    siteAt(v, null == r.o0 ? NO_SITE : tokenSite(r.o0))
    v.site.url = ctx.meta.multisource ? ctx.meta.multisource.path : ''
    // A keyed rule always carries a path array; a keyless one has none.
    v.path = r.k ? [...r.k.path] : []

    return v
  }

  const isAliasDecl = (ktkn: any, sep: any): boolean =>
    null != ktkn && VL === ktkn.tin && ALIAS_RE.test('' + ktkn.src) &&
    true === sep?.use?.aontu_eq
  const keyRefusalOf = (ktkn: any, sep: any):
    { why: string, details?: Record<string, any> } | undefined => {
    if (null == ktkn || VL !== ktkn.tin) {
      return undefined
    }
    const kname = '' + ktkn.src
    if (ALIAS_RE.test(kname)) {
      return isAliasDecl(ktkn, sep) ? undefined : { why: 'alias_colon' }
    }
    const bad = ktkn.use?.aontu_bad
    return null == bad ? undefined :
      { why: 'bare_punct', details: { char: '' + bad, text: kname } }
  }


  jsonic.options({
    hint: {
      unknown: `
Since the error is unknown, this is probably a bug. Please consider
posting a github issue - thanks!

Code: {code}, Details: 
{details}`,

      unexpected: `
The character(s) {src} were not expected at this point as they do not
match the expected syntax. Use the # character to comment out lines to
help isolate the syntax error.`,

    },
    errmsg: {
      name: 'aontu',
      suffix: false,
    },
    fixed: {
      token: {
        '#QM': '?'
      },
    },
    value: {
      def: {
        'string': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new ScalarKindVal({ peg: String }), r, ctx)
        },
        // `number` is a pure supertype: it matches a concrete value of
        // any numeric leaf and never tags one itself. `integer` and
        // `float` are the leaves (see ScalarKindVal for the lattice).
        'number': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new ScalarKindVal({ peg: Number }), r, ctx)
        },
        'integer': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new ScalarKindVal({ peg: Integer }), r, ctx)
        },
        'float': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new ScalarKindVal({ peg: Float }), r, ctx)
        },
        'biginteger': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new ScalarKindVal({ peg: BigInteger }), r, ctx)
        },
        'bigdecimal': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new ScalarKindVal({ peg: BigDecimal }), r, ctx)
        },

        'boolean': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new ScalarKindVal({ peg: Boolean }), r, ctx)
        },
        'nil': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new NilVal({ why: 'literal_nil' }), r, ctx)
        },

        'top': { val: () => top() },

        // G8 phase 3: the placeholder. A BARE `_` is the hole; `"_"`
        // quoted, and any longer bare word containing it, stay text.
        // Reserving it is a breaking change, pinned by place.tsv.
        '_': {
          val: (r: Rule, ctx: JsonicContext) =>
            addsite(new PlaceVal({}), r, ctx)
        },
      }
    },

    map: {
      merge: (prev: any, curr: any, _r: Rule, ctx: JsonicContext) => {
        let pval = (prev as Val)
        let cval = (curr as Val)

        if (pval?.isVal && cval?.isVal) {

          if (pval.isConjunct && cval.isConjunct) {
            (pval as ConjunctVal).append(cval)
            return pval
          }
          else if (pval.isConjunct) {
            (pval as ConjunctVal).append(cval)
            return pval
          }
          else {
            return addsite(new ConjunctVal({ peg: [pval, cval] }), prev, ctx)
          }
        }

        // Handle defered conjuncts, where MapVal does not yet
        // exist, by creating ConjunctVal later.
        else {
          if (true === (cval as any)?.isMap) {
            const lm: any = cval
            for (const k of Object.keys(lm.peg)) {
              const own = (prev as any)[k]
              ;(prev as any)[k] = (null == own) ? lm.peg[k] :
                (own?.isVal
                  ? new ConjunctVal({ peg: [own, lm.peg[k]] })
                  : lm.peg[k])
            }
            if (null != lm.spread?.cj) {
              ;(prev as any)[SPREAD] =
                ((prev as any)[SPREAD] || { o: '&', v: [] })
              ;(prev as any)[SPREAD].v.push(lm.spread.cj)
            }
            prev.___optional = (prev.___optional || [])
            for (const k of lm.optionalKeys) { prev.___optional.push(k) }
            prev.___alias = (prev.___alias || [])
            for (const k of lm.aliasKeys) { prev.___alias.push(k) }
            return prev
          }
          prev.___merge = (prev.___merge || [])
          prev.___merge.push(curr)
          return prev
        }
      }
    }
  })


  const funcMap: Record<string, any> = {
    upper: UpperFuncVal,
    lower: LowerFuncVal,
    copy: CopyFuncVal,
    key: KeyFuncVal,
    type: TypeFuncVal,
    hide: HideFuncVal,
    move: MoveFuncVal,
    path: PathFuncVal,
    pref: PrefFuncVal,

    map: MapFuncVal,
    list: ListFuncVal,
    close: CloseFuncVal,
    open: OpenFuncVal,
    super: SuperFuncVal,

    min: MinConstraintVal,
    max: MaxConstraintVal,
    above: AboveConstraintVal,
    below: BelowConstraintVal,
    neq: NeqConstraintVal,

    // G1 phase 2: pattern membership, over the portable subset both
    // host regex engines agree on (nonPortableRe in ConstraintVal.ts).
    re: ReConstraintVal,

    length: LengthConstraintVal,
    unique: UniqueConstraintVal,

    must: MustConstraintVal,

    abnf: AbnfFuncVal,
    parse: ParseFuncVal,

    // G3 phase 4: the deprecation mark. Unification-transparent; the
    // record rides the result (Val.deprecation) and canon renders the
    // call back (canonRiders).
    deprecate: DeprecateFuncVal,

    refer: ReferFuncVal,
    rel: RelFuncVal,

    // RELATIONS P2 (docs/design/RELATIONS.0.md §3.3): the graph
    // atoms, conjoined at the field whose key is the predicate they
    // govern. Lattice-inert; the verdict lands at generation.
    acyclic: AcyclicFuncVal,
    inverse: InverseFuncVal,

    pack: PackFuncVal,

    each: EachFuncVal,

    filter: FilterFuncVal,
    match: MatchFuncVal,

    add: AddFuncVal,
    sub: SubFuncVal,
    mul: MulFuncVal,
    div: DivFuncVal,
    mod: ModFuncVal,
    rem: RemFuncVal,

    sum: SumFuncVal,
    least: LeastFuncVal,
    greatest: GreatestFuncVal,

    maybe: MaybeFuncVal,

    pick: PickFuncVal,
    sort: SortFuncVal,

    join: JoinFuncVal,

    emit: EmitFuncVal,

    esc: EscFuncVal,
    usc: UscFuncVal,
    rep: RepFuncVal,
    split: SplitFuncVal,

    ...CMP_FUNCS,

    nom: NomFuncVal,

    translate: TranslateFuncVal,
  }


  const dropUnfilled = (terms: any) => terms.filter((t: any) => null != t)

  const incompleteNil = (r: Rule, ctx: JsonicContext) =>
    addsite(new NilVal({ why: 'incomplete_expression' }), r, ctx)

  // Build a call from a NAME and the argument terms as the author
  // wrote them: the arity check, the comma-group rule and the
  // raw-value conversion, stated once.
  const buildCall = (r: Rule, ctx: JsonicContext,
    fname: string, argterms: any[]): any => {
    const funcval = funcMap[fname]

    const arity = funcArity[fname]
    if (null != arity) {
      const got = writtenArgCount(argterms)
      if (got < arity[0] || (-1 !== arity[1] && got > arity[1])) {
        const nil: any = new NilVal({ why: 'func_arity' })
        nil.details = {
          func: fname,
          want: arityText(arity[0], arity[1]),
          got: '' + got,
        }
        return addsite(nil, r, ctx)
      }
    }

    let terms = argterms
    if (true === POSITIONAL_ARG_FUNCS[fname] && 1 === terms.length &&
      Array.isArray(terms[0])) {
      terms = terms[0]
    }
    const args = terms.map(rawToVal)
    const val: any = null == funcval ?
      new NilVal({ why: 'unknown_function' }) :
      new funcval({ peg: args })

    return val
  }


  let opmap: any = {
    'conjunct-infix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) =>
      addsite(new ConjunctVal({ peg: dropUnfilled(terms) }), r, ctx),

    'disjunct-infix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) =>
      addsite(new DisjunctVal({ peg: dropUnfilled(terms) }), r, ctx),

    // `.a` (prefix) and `a.b` (infix) build the same reference; only the
    // prefix flag differs, and both need the same missing-operand guard,
    // so they share one builder.
    'dot-prefix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) =>
      dotRef(r, ctx, terms, true),

    'dot-infix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) =>
      dotRef(r, ctx, terms, false),

    'star-prefix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) => {
      if (null == terms[0]) return incompleteNil(r, ctx)

      const bag: any = terms[0]
      if ((bag.isMap && '{' !== bag.site.src) ||
        (bag.isList && '[' !== bag.site.src)) {
        return addsite(new NilVal({ why: 'pref_implicit_bag' }), r, ctx)
      }

      return addsite(new PrefVal({ peg: terms[0] }), r, ctx)
    },

    'dollar-prefix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) => {
      if (null == terms[0]) return incompleteNil(r, ctx)
      // A refusal from the dot rule below (an alias used as a path
      // segment) rides straight through: wrapping it in a VarVal would
      // replace `alias_in_path` with a var whose peg is a nil.
      if (terms[0]?.isNil) {
        return terms[0]
      }
      // `$%foo` -- the sigil directly after the root -- reaches here
      // as the alias reference rather than through the dot rule, and
      // is refused for the same reason.
      if (terms[0] instanceof RefVal &&
        terms[0].peg.some((seg: any) =>
          'string' === typeof seg && ALIAS_RE.test(seg))) {
        return addsite(new NilVal({ why: 'alias_in_path' }), r, ctx)
      }
      if (terms[0] instanceof RefVal) {
        terms[0].absolute = true
        return terms[0]
      }
      return addsite(new VarVal({ peg: terms[0] }), r, ctx)
    },

    'plus-infix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) => {
      if (null == terms[0] || null == terms[1]) return incompleteNil(r, ctx)
      return addsite(new PlusOpVal({ peg: [terms[0], terms[1]] }), r, ctx)
    },

    'negative-prefix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) => {
      let val = terms[0]
      if (null == val) return incompleteNil(r, ctx)
      if (val instanceof BigIntegerVal) {
        return addsite(new BigIntegerVal(
          { peg: -val.peg, src: negsrc(val.src) }), r, ctx)
      }
      if (val instanceof BigDecimalVal) {
        return addsite(new BigDecimalVal(
          { peg: val.peg.negate(), src: negsrc(val.src) }), r, ctx)
      }
      // Negating a non-numeric operand (`k-x` splits into k, -x) is an
      // error nil, not NaN (mirrors negate() in go/lang.go).
      if (!(val instanceof IntegerVal) && !(val instanceof NumberVal)) {
        return addsite(new NilVal({ why: 'negative' }), r, ctx)
      }
      let peg = -1 * val.peg
      // Normalize -0 to 0 (keeps the AST and canon free of negative zero).
      if (0 === peg) peg = 0
      const out = val instanceof IntegerVal && isIntegerKind(peg)
        ? new IntegerVal({ peg })
        : new NumberVal({ peg })
      return addsite(out, r, ctx)
    },

    'positive-prefix': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) => {
      let val = terms[0]
      if (null == val) return incompleteNil(r, ctx)
      return addsite(val, r, ctx)
    },

    'func-paren': (r: Rule, ctx: JsonicContext, _op: Op, terms: any) => {
      let val = terms[1]
      const fname = terms[0]

      if ('' !== fname) {
        val = buildCall(r, ctx, fname, terms.slice(1))
      }
      // `a:()` — grouping parens with nothing inside.
      if (null == val) return incompleteNil(r, ctx)
      // ... and the same for a GROUPING paren, whose value is passed
      // straight through: `(([]%))` yielded a raw array, and addsite went
      // on to write a site onto it, throwing a TypeError that escaped the
      // unifier entirely ("Cannot set properties of undefined").
      const out = addsite(rawToVal(val), r, ctx)
      return out
    },
  }


  jsonic
    .use(asPlugin(Expr), {
      op: {
        'conjunct': {
          infix: true, src: '&', left: 16_000_000, right: 17_000_000
        },

        'disjunct': {
          infix: true, src: '|', left: 14_000_000, right: 15_000_000
        },

        'plus-infix': {
          src: '+',
          infix: true,
          left: 20_000_000,
          right: 21_000_000,
        },

        'negative': {
          src: '-',
          prefix: true,
          right: 22_000_000,
        },

        'positive': {
          src: '+',
          prefix: true,
          right: 22_000_000,
        },

        'dollar-prefix': {
          src: '$',
          prefix: true,
          right: 31_000_000,
        },

        'dot-infix': {
          src: '.',
          infix: true,
          left: 25_000_000,
          right: 24_000_000,
        },

        'dot-prefix': {
          src: '.',
          prefix: true,
          right: 24_000_000,
        },

        'star': {
          src: '*',
          prefix: true,
          right: 24_000_000,
        },

        'func': {
          paren: true,
          preval: {
            active: true,
            // allow: ['floor'], //Object.keys(funcMap)
          },
          osrc: '(',
          csrc: ')',
        },

        plain: null,
        addition: null,
        subtraction: null,
        multiplication: null,
        division: null,
        remainder: null,
      },
      evaluate: (r: Rule, ctx: JsonicContext, op: Op, terms: any) => {

        if (
          'func-paren' === op.name
          && !r.u?.paren_preval
        ) {
          terms = ['', ...terms]
        }


        let val: Val = opmap[op.name](r, ctx, op, terms)


        return val
      }
    })


  const CJ = jsonic.token['#E&']
  const CL = jsonic.token.CL
  const ST = jsonic.token.ST
  const TX = jsonic.token.TX
  const NR = jsonic.token.NR

  const QM = jsonic.token.QM

  const VL = jsonic.token.VL

  const OPTKEY = [TX, ST, NR]


  jsonic.rule('expr', (rs: RuleSpec) => {
    rs.close([
      { s: [CJ, CL], b: 2, n: { expr: 0 }, g: 'expr,expr-end,spread' },
    ])
    return rs
  })


  jsonic.rule('val', (rs: RuleSpec) => {

    rs
      .open([
        {
          s: [CJ, CL], p: 'map', b: 2, n: { pk: 1 },
          // @tabnas seeds a descended rule's node from its parent; without
          // a fresh node here the nested spread map (`a:&:{x:1}`) would
          // share the parent map's node object and self-reference.
          a: (r: Rule) => { r.node = {} },
          g: 'spread'
        },

        {
          s: [OPTKEY, QM],
          c: (r) => 0 == r.d,
          p: 'map',
          b: 2,
          // Fresh node (see spread alt above): the optional dive descends
          // to a map and must not share the parent's node object.
          a: (r: Rule) => { r.node = {} },
          g: 'pair,jsonic,top,aontu-optional',
        },

        {
          s: [OPTKEY, QM],
          p: 'map',
          b: 2,
          n: { pk: 1 },
          a: (r: Rule) => { r.node = {} },
          g: 'pair,jsonic,top,dive,aontu-optional',
        },

      ])

      .ac((r: Rule, ctx: JsonicContext) => {

        let valnode: Val = r.node
        let valtype = typeof valnode

        if ('string' === valtype) {
          valnode = addsite(new StringVal({ peg: r.node }), r, ctx)
        }
        else if ('number' === valtype) {
          // An overflowing literal (1e999) lexes to Infinity; that is an
          // error value, not a number (mirrors not_number in go/lang.go).
          if (!Number.isFinite(r.node)) {
            valnode = addsite(new NilVal({ why: 'not_number' }), r, ctx)
          }
          else if (isLossyIntegerLiteral(r.node, r.o0.src)) {
            const nil = new NilVal({ why: 'lossy_integer_literal' })
            nil.details = { src: r.o0.src }
            valnode = addsite(nil, r, ctx)
          }
          // A literal is integer kind only if its source has no '.', its
          // value is integral, and it fits the int64 range: `1.0` is a
          // number, and so are 1e21 and 100000000000000000000 (see
          // isIntegerKind).
          else if (isIntegerKind(r.node, r.o0.src)) {
            valnode = addsite(new IntegerVal({ peg: r.node, src: r.o0.src }), r, ctx)
          }
          else {
            valnode = addsite(new NumberVal({ peg: r.node, src: r.o0.src }), r, ctx)
          }
        }
        else if ('boolean' === valtype) {
          valnode = addsite(new BooleanVal({ peg: r.node }), r, ctx)
        }
        else if (null === valnode) {
          valnode = addsite(new NullVal({ peg: r.node }), r, ctx)
        }

        if (null != valnode && 'object' === typeof valnode && valnode.site) {
          siteAt(valnode, tokenSite(r.o0))
          valnode.site.url = ctx.meta.multisource && ctx.meta.multisource.path
        }
        // else { ERROR? }

        r.node = valnode

        return undefined
      })

      .close([{ s: [CJ, CL], b: 2, g: 'spread,json,more' }])

    return rs
  })


  jsonic.rule('map', (rs: RuleSpec) => {
    rs
      .open([
        { s: [CJ, CL], p: 'pair', b: 2, g: 'spread' },

        { s: [OPTKEY, QM], p: 'pair', b: 2, g: 'pair,list,val,imp,jsonic,aontu-optional' },
      ])

      .bc((r: Rule, ctx: JsonicContext) => {
        const optionalKeys = r.u.aontu_optional_keys ?? []
        const aliasKeys = r.u.aontu_alias_keys ?? []

        let mo = r.node

        for (const k in mo) {
          if (null == mo[k] && '___merge' !== k &&
            '___optional' !== k && '___alias' !== k) {
            // Pathed at the KEY, not at the enclosing map. addsite takes
            // the rule's path, which here is the map's, so the error
            // would otherwise name the container and leave the reader to
            // work out which key was elided.
            const en: any = addsite(new NilVal({ why: 'elided_value' }), r, ctx)
            en.path = [...(r.k?.path ?? []), k]
            mo[k] = en

            const oi = optionalKeys.indexOf(k)
            if (-1 !== oi) {
              optionalKeys.splice(oi, 1)
            }
          }
        }

        for (const k of optionalKeys) {
          if (!(k in mo)) {
            mo[k] = addsite(new NilVal({ why: 'elided_value' }), r, ctx)
          }
        }

        const sp: any = (mo as any)[SPREAD]
        if (sp && sp.v.some((sv: any) => null == sv)) {
          r.node = addsite(new NilVal({ why: 'elided_value' }), r, ctx)
          return undefined
        }

        for (const { key, tkn, why, details } of
          (r.u.aontu_key_refusals ?? []) as any[]) {
          const en: any = siteAt(addsite(new NilVal({ why }), r, ctx), tokenSite(tkn))
          if (null != details) {
            en.details = details
          }
          en.path = [...(r.k?.path ?? []), key]
          mo[key] = en
        }

        // Marks carried over from a map include folded in the merge
        // hook above, applied here where the MapVal is built.
        if (mo.___optional || mo.___alias) {
          for (const k of (mo.___optional || [])) {
            if (!optionalKeys.includes(k)) { optionalKeys.push(k) }
          }
          for (const k of (mo.___alias || [])) {
            if (!aliasKeys.includes(k)) { aliasKeys.push(k) }
          }
          delete mo.___optional
          delete mo.___alias
        }

        //  Handle defered conjuncts, e.g. `{x:1 @"foo"}`
        if (mo.___merge) {
          let mop = { ...mo }
          delete mop.___merge

          let mopv = new MapVal({ peg: mop })
          mopv.optionalKeys = optionalKeys
          mopv.aliasKeys = aliasKeys

          r.node =
            addsite(new ConjunctVal({ peg: [mopv, ...mo.___merge] }), r, ctx)
        }
        else {
          r.node = addsite(new MapVal({ peg: mo }), r, ctx)
          r.node.optionalKeys = optionalKeys
          r.node.aliasKeys = aliasKeys
        }

        return undefined
      })

      .close([{ s: [CJ, CL], b: 2, g: 'spread,json,more' }])

    return rs
  })


  jsonic.rule('list', (rs: RuleSpec) => {
    rs

      .bc((r: Rule, ctx: JsonicContext) => {
        const optionalKeys = r.u.aontu_optional_keys ?? []

        let ao = r.node

        for (let i = 0; i < ao.length; i++) {
          if (null == ao[i]) {
            // Pathed at the INDEX, for the same reason as the map case.
            const en: any = addsite(new NilVal({ why: 'elided_value' }), r, ctx)
            en.path = [...(r.k?.path ?? []), '' + i]
            ao[i] = en
          }
        }

        // No ___merge arm here: the deferred map.merge that writes it
        // only ever fires for a `pair` rule, whose parent is always a
        // `map` rule with a plain-object node — never a list.
        {
          r.node = addsite(new ListVal({ peg: ao }), r, ctx)
          r.node.optionalKeys = optionalKeys
        }

        return undefined
      })


    return rs
  })


  const pairkey = (r: Rule) => {
    // Get key string value from first matching token of `Open` state.
    const key_token = r.o0
    const key =
      ST === key_token.tin || TX === key_token.tin
        ? key_token.val
        : key_token.src // Was number, use original text

    r.u.key = key
  }


  const asSlots = (r: Rule): Record<string, any> => r.node as any

  const snapshotPairSlot = (r: Rule, key: string) => {
    const node = asSlots(r)
    r.u.aontu_pair_slot = {
      key,
      had: Object.prototype.hasOwnProperty.call(node, key),
      was: node[key],
      len: node.length,
    }
  }

  const restorePairSlot = (r: Rule) => {
    const slot: any = r.u.aontu_pair_slot
    if (null == slot) {
      return
    }
    const node = asSlots(r)
    if (slot.had) {
      node[slot.key] = slot.was
    }
    else {
      delete node[slot.key]
    }
    node.length = slot.len
  }


  jsonic.rule('pair', (rs: RuleSpec) => {
    rs
      .open([
        {
          s: [CJ, CL], p: 'val',
          u: { spread: true },
          g: 'spread'
        },

        {
          s: [OPTKEY, QM], b: 1, r: 'pair', u: { aontu_optional: true },
          g: 'aontu-optional-key'
        },

        {
          s: [QM, CL],
          c: (r) => r.prev.u.aontu_optional,
          p: 'val',
          u: { pair: true },
          a: (r) => {
            pairkey(r.prev)
            r.u.key = r.prev.u.key

            r.parent.u.aontu_optional_keys = (r.parent.u.aontu_optional_keys || [])
            r.parent.u.aontu_optional_keys.push('' + r.u.key)
          },
          g: 'aontu-optional-pair'
        }
      ])

      // NOTE: manually adjust path - @tabnas/path ignores as not pair:true
      .ao((r) => {
        if (0 < r.d && r.u.spread) {
          r.child.k.path = [...r.k.path, '&']
          r.child.k.key = '&'
        }
      })

      .bc((rule: Rule) => {
        // TRAVERSE PARENTS TO GET PATH

        const ktkn: any = rule.o0
        const holder: any = rule.parent
        const kr = keyRefusalOf(ktkn, rule.o1)
        if (null != kr) {
          holder.u.aontu_key_refusals = (holder.u.aontu_key_refusals || [])
          holder.u.aontu_key_refusals.push({ key: '' + ktkn.src, tkn: ktkn, ...kr })
        }
        else if (isAliasDecl(ktkn, rule.o1)) {
          holder.u.aontu_alias_keys = (holder.u.aontu_alias_keys || [])
          holder.u.aontu_alias_keys.push('' + ktkn.src)
        }

        if (rule.u.spread) {
          rule.node[SPREAD] =
            (rule.node[SPREAD] || { o: rule.o0.src, v: [] })

          rule.node[SPREAD].v.push(rule.child.node)
        }

        return undefined
      })

      .close([
        { s: [CJ, CL], c: (r) => r.lte('pk', 0) || r.lte('dmap', 1), r: 'pair', b: 2, g: 'spread,json,pair' },
        { s: [CJ, CL], b: 2, g: 'spread,json,more' }
      ])


    return rs
  })


  jsonic.rule('elem', (rs: RuleSpec) => {
    rs
      .open([
        {
          s: [CJ, CL],
          p: 'val',
          n: { pk: 1, dmap: 1 },
          u: { spread: true, done: true, list: true },
          g: 'spread'
        },

        {
          s: [OPTKEY, QM], b: 1, r: 'elem', u: { aontu_optional: true },
          g: 'aontu-optional-key-elem'
        },

        {
          s: [QM, CL],
          c: (r) => r.prev.u.aontu_optional,
          p: 'val',
          u: {
            spread: true, done: true, list: true, pair: true,
            aontu_optional_elem: true,
          },
          a: (r) => {
            pairkey(r.prev)
            r.u.key = r.prev.u.key
            snapshotPairSlot(r, '' + r.u.key)
          },
          g: 'aontu-optional-elem'
        },

        {
          s: [OPTKEY, CL], p: 'val',
          u: { spread: true, done: true, list: true, pair: true },
          a: (r) => {
            pairkey(r)
            snapshotPairSlot(r, '' + r.u.key)
          },
          g: 'aontu-plain-pair-elem'
        }
      ])


      .ao((r) => {
        if (0 < r.d && r.u.spread && !r.u.pair) {
          r.k.index = r.k.index - 1

          const seg = '&'
          r.child.k.path = [...r.k.path, seg]
          r.child.k.key = seg
        }
        else if (0 < r.d && r.u.pair) {
          const seg = '' + r.u.key
          r.child.k.path =
            [...r.k.path, '' + (r.node?.length ?? 0), seg]
          r.child.k.key = seg
        }
      })

      .bc((rule: Rule, ctx: JsonicContext) => {
        // TRAVERSE PARENTS TO GET PATH

        if (rule.u.spread && !rule.u.pair) {
          rule.node[SPREAD] =
            (rule.node[SPREAD] || { o: rule.o0.src, v: [] })
          rule.node[SPREAD].v.push(rule.child.node)
        }

        restorePairSlot(rule)

        if (true === rule.u.pair) {
          const key = '' + rule.u.key
          const ktkn: any = true === rule.u.aontu_optional_elem ?
            rule.prev.o0 : rule.o0
          let v: any = rule.child.node
          const kr = keyRefusalOf(ktkn, rule.o1)
          if (null == v) {
            v = addsite(new NilVal({ why: 'elided_value' }), rule, ctx)
            v.path = [...(rule.k?.path ?? []),
              '' + rule.node.length, key]
          }
          // THE KEY IS HELD TO THE MAP'S RULES: a key the map rule would
          // refuse (a colon declaration, a bare-text refusal) is refused
          // here too, in the value's place and sited at the key, rather
          // than generated as the element `[{"x=y": 1}]`.
          else if (null != kr) {
            v = siteAt(addsite(new NilVal({ why: kr.why }), rule, ctx), tokenSite(ktkn))
            if (null != kr.details) {
              v.details = kr.details
            }
            v.path = [...(rule.k?.path ?? []),
              '' + rule.node.length, key]
          }
          const mv: any = addsite(
            new MapVal({ peg: { [key]: v } }), rule, ctx)
          // The element's path is the list's plus its index, as any
          // element's is (and as the Go port paths it): the map rule's
          // "is this the top level" test reads the path, so an element
          // of a top-level list must not read as the root.
          mv.path = [...(rule.k?.path ?? []), '' + rule.node.length]
          if (true === rule.u.aontu_optional_elem) {
            mv.optionalKeys = [key]
          }
          // ... and a declaration is a declaration IN the element, which
          // is where MapVal.unify refuses it: a list element is not the
          // top level.
          if (isAliasDecl(ktkn, rule.o1)) {
            mv.aliasKeys = [key]
          }
          rule.node.push(mv)
        }

        return undefined
      })

      .close([{ s: [CJ, CL], r: 'elem', b: 2, g: 'spread,json,more' }])

    return rs
  })

}


const INCLUDE_KINDS: { [kind: string]: string } = {
  aon: 'source',
  aontu: 'source',

  json: 'json',
  jsonld: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  jsonic: 'jsonic',
  jsc: 'jsonic',
  toml: 'toml',
  yaml: 'yaml',
  yml: 'yaml',
  ini: 'ini',

  txt: 'text',
}


function includeFormat(
  ext: string, textExt?: string[]): string | undefined {
  const known = INCLUDE_KINDS[ext]
  if (undefined !== known) {
    return known
  }
  if (REFUSED_EXT.has(ext)) {
    return undefined
  }
  return textExt?.includes(ext) ? 'text' : undefined
}


// Extensions no widening may reach. `js` executes under multisource's
// default processor; `''` is the no-extension fallback, which names no
// file type at all.
const REFUSED_EXT = new Set(['js', ''])


function extKindOf(full: string): string {
  const seg = (full.match(/[^\\/]*$/) as string[])[0]
  return (seg.match(/\.([^.]*)$/) || ['', ''])[1].toLowerCase()
}

// The refusal message, naming the extension -- because the extension is
// the whole reason, and a reader told only "not readable" has to guess
// which part of the path the engine objected to. Byte-identical to Go's
// extensionMsg.
function extensionMsg(path: string, ext: string): string {
  const which = '' === ext ? 'no extension' : 'extension: .' + ext
  return 'include not readable: ' + path + ' (' + which + ')'
}

const refuseProcessor = (res: any) => {
  // `full` is the one part a host resolution may leave out -- it is the
  // path the resolver CHOSE, and a resolver that answers from something
  // other than a filesystem need not have one. The written path always
  // reaches here, so it is the fallback.
  const err: any = new Error(extensionMsg(res.path, extKindOf(res.full ?? res.path)))
  err.code = 'include_extension'
  throw err
}


// ONE READER PER FORMAT, BUILT ONCE. These are stateless parsers and
// building a jsonic instance is not free, so they are made at module
// load rather than per include. The file name is passed through so a
// syntax error inside an included `.toml` names the `.toml`.
const DATA_READERS: { [format: string]: (src: string, fileName: string) => any } =
  (() => {
    const viaPlugin = (plugin: any) => {
      const jsonic = Jsonic.make().use(plugin)
      return (src: string, fileName: string) => jsonic(src, { fileName })
    }
    const toml = viaPlugin(Toml)
    // The strict RFC 8259 reader is its own parser rather than a
    // plugin, and it is `make().parse` rather than the module's bare
    // `parse`: only the instance carries the meta bag, and without it
    // a syntax error in an included `.json` says `<no-file>`.
    const json = makeJsonParser()
    return {
      json: (src: string, fileName: string) => json.parse(src, { fileName }),
      jsonc: viaPlugin(Jsonc),
      json5: viaPlugin(Json5),
      // Plain jsonic needs no plugin: it IS the base parser.
      jsonic: (src: string, fileName: string) => Jsonic(src, { fileName }),
      toml: (src: string, fileName: string) => tomlDates(toml(src, fileName)),
      yaml: viaPlugin(Yaml),
      ini: viaPlugin(Ini),
    }
  })()

function tomlDates(node: any): any {
  if (Array.isArray(node)) {
    return node.map(tomlDates)
  }
  if (null === node || 'object' !== typeof node) {
    return node
  }
  const keys = Object.keys(node)
  const mark = node.__toml__
  if (1 === keys.length && '__toml__' === keys[0] && null != mark &&
    'string' === typeof mark.kind && 'string' === typeof mark.src) {
    return mark.src
  }
  const out: Record<string, any> = {}
  for (const k of keys) {
    out[k] = tomlDates(node[k])
  }
  return out
}

const dataProcessor = (format: string) => (res: any) => {
  res.val = rawToVal(DATA_READERS[format](res.src, res.path))
}

const textProcessor = (res: any) => {
  res.val = new StringVal({ peg: res.src })
}

function includeProcessors(textExt?: string[]): { [kind: string]: any } {
  const map: { [kind: string]: any } = {
    // multisource's fallback for an extension no entry names, so it is
    // the one that catches whatever the resolver's gate did not.
    '': refuseProcessor,
    // ... and the one upstream default that would EXECUTE the file.
    js: refuseProcessor,
  }
  const source = makeJsonicProcessor()
  const forKind = (kind: string) => {
    const format = includeFormat(kind, textExt)
    if ('source' === format) return source
    if ('text' === format) return textProcessor
    return dataProcessor(format as string)
  }
  for (const kind of Object.keys(INCLUDE_KINDS)) {
    map[kind] = forKind(kind)
  }
  for (const ext of textExt ?? []) {
    if (undefined === map[ext]) {
      map[ext] = textProcessor
    }
  }
  return map
}


// What a resolved include may reach, and how it is confined:
// docs/trust.md.
function makeModelResolver(options: any) {
  const useRequire = options.require || require
  const capability = options.trust?.include ?? 'system'

  const memCapability =
    'object' === typeof capability && null != (capability as any).mem
  const rootDir: string | undefined =
    'object' === typeof capability &&
      'string' === typeof (capability as any).root
      ? pathResolve((capability as any).root) : undefined

  let memResolver = makeMemResolver(memCapability
    ? { ...(capability as any).mem }
    : { ...(options.resolver?.mem || {}) })

  let fileResolver = makeFileResolver((spec: any) => {
    return 'string' === typeof spec ? spec : spec?.peg
  })

  let pkgResolver = makePkgResolver({
    require: useRequire,
    ...(options.resolver?.pkg || {})
  })

  const realpath = (p: string): string => {
    try {
      return realpathSync(p)
    }
    catch {
      const parent = pathDirname(p)
      if (parent === p) {
        return p
      }
      return pathJoin(realpath(parent), pathBasename(p))
    }
  }

  const outsideRoot = (root: string, full: string): boolean => {
    const rootReal = realpath(root)
    const fullReal = realpath(full)
    return fullReal !== rootReal && !fullReal.startsWith(rootReal + pathSep)
  }

  const deny = (path: string): never => {
    // Only 'none' and 'root' can deny: the mem capability's misses are
    // not-found (its set is the whole world), so there is no third arm.
    const capname = 'none' === capability ? 'none' : 'root:' + rootDir
    const err: any = new Error(
      'include denied: ' + path + ' (capability: ' + capname + ')')
    err.code = 'include_denied'
    throw err
  }

  const refuseExtension = (path: string, full: string): never => {
    const err: any = new Error(extensionMsg(path, extKindOf(full)))
    err.code = 'include_extension'
    throw err
  }

  // A LANGUAGE-SUPPLIED MODEL THAT DOES NOT EXIST THROWS, as a denial
  // does and for the same bare-member reason, with the not-found code
  // the include machinery already uses and a message that names the
  // set: a typo in an `aontu:` name must not go looking on disk.
  const modelNotFound = (path: string): never => {
    const err: any = new Error(
      'source not found: ' + path +
      ' (the language-supplied models are ' + AONTU_MODELS.join(', ') + ')')
    err.code = 'multisource_not_found'
    throw err
  }

  // The gate every leg that RESOLVES A NAME passes through. The aontu:
  // and module legs do not: both state `kind: 'aon'` because what they
  // serve is Aontu source by construction, not by its spelling.
  const gateExtension = (path: string, full: string): void => {
    if (undefined === includeFormat(extKindOf(full), options.textExt)) {
      refuseExtension(path, full)
    }
  }

  // The user cache: whatever the host named, else the platform rule
  // (`modCacheDir`, ts/src/mod.ts) the tooling writes by.
  const modCache = (opts: any): string | undefined => {
    const named = opts.mod?.cache
    return 'string' === typeof named ? named : modCacheDir()
  }

  // The directory an include is being resolved FROM: the source that
  // holds it, or the entry path when the source is a string. Same base
  // the file leg computes (resolvePathSpec in @tabnas/multisource).
  const dirOf = (p: string | undefined): string =>
    null == p || '' === p ? pathResolve('.') : pathDirname(pathResolve(p))

  // The module store reader: the host's filesystem when one was
  // injected, so a sandboxed evaluation stays in the filesystem the
  // host gave it.
  const modFs = (ctx: any): any => {
    const hostfs = ctx?.meta?.fs
    return null == hostfs ? { existsSync, readFileSync } : {
      existsSync: (p: string) => {
        try {
          hostfs.statSync(p)
          return true
        }
        catch {
          return false
        }
      },
      readFileSync: (p: string, enc: string) => hostfs.readFileSync(p, enc),
    }
  }

  // The manifest sink rides the parse meta (Lang.parse seeds it, the
  // multisource plugin's child-meta spread carries it to every nested
  // include), so the recorded closure covers the whole include tree.
  const record = (ctx: any, path: string, cap: string) => {
    const manifest = ctx?.meta?.aontu?.manifest
    if (Array.isArray(manifest)) {
      manifest.push({ path, capability: cap })
    }
  }

  return function ModelResolver(
    spec: any,
    popts: any,
    rule: Rule,
    ctx: JsonicContext,
    jsonic: Tabnas
  ) {

    // The aontu val rule's ac has already wrapped every raw string node
    // as a StringVal, so spec is a Val here (or a raw object from a
    // .json/.js include, whose peg is undefined -> not found).
    let path = spec?.peg

    // A bare `@` with no path (`a:@`) has nothing to resolve; report
    // not-found instead of crashing in the underlying resolvers.
    if (null == path || '' === path) {
      return { found: false, path: '' + (path ?? ''), search: [] }
    }

    if ('none' === capability) {
      deny(path)
    }

    if ('string' === typeof path && path.startsWith(AONTU_SCHEME)) {
      const model = AONTU_SOURCES[path]
      if (null == model) {
        modelNotFound(path)
      }
      record(ctx, path, 'aontu')
      return { found: true, path, full: path, kind: 'aon', src: model, search: [] }
    }

    let search: any = []
    let res = memResolver(path, popts, rule, ctx, jsonic)
    res.path = path
    if (res.found) {
      // THE EXTENSION DECIDES HERE TOO. A virtual file set is still a
      // file set: its keys carry extensions, and the same rule has to
      // read them, or the mem capability becomes a way to include what
      // the filesystem would refuse.
      gateExtension(path, res.full ?? path)
      record(ctx, res.full ?? path, 'mem')
      return res
    }

    const modref = memCapability ? undefined : parseModuleRef(path)
    if (null != modref) {
      const msmeta = (ctx as any)?.meta?.multisource
      const from = dirOf(null != msmeta?.path ? msmeta.path : popts?.path)
      const found = resolveModule(modref, from, modFs(ctx), {
        // The user cache lives outside any confinement root, so it is
        // consulted only when nothing confines this evaluation. A
        // rooted profile sees the project's own `aontu_meta/vendor/` and
        // nothing else, which is what `root` means.
        ...(null == rootDir ? { cache: modCache(options) } : {}),
        eval: options.mod?.eval,
        depth: options.mod?.depth,
      })
      if (null != rootDir && outsideRoot(rootDir, found.full)) {
        deny(path)
      }
      record(ctx, found.full, 'mod')
      return {
        found: true, path, full: found.full,
        kind: 'aon', src: found.src, search: [],
      }
    }

    if (memCapability) {
      // A miss in the declared virtual set is NOT-FOUND, not denial:
      // the allowed mechanism ran and missed. Denial is reserved for a
      // capability refusing a mechanism outright.
      res.search = search.concat(res.search)
      return res
    }

    search = search.concat(res.search)

    res = fileResolver(path, popts, rule, ctx, jsonic)
    res.path = path
    if (res.found) {
      // `res.full` asserted non-null: a FOUND file resolution always
      // carries the absolute path it read (and the pkg leg below is the
      // same), so a runtime fallback arm would be dead code.
      const full = res.full as string
      if (null != rootDir && outsideRoot(rootDir, full)) {
        deny(path)
      }
      // After the trust check, not before: a file outside the
      // confinement root is denied whatever it is called, and answering
      // "extension" there would say the file exists.
      gateExtension(path, full)
      // The warning window for the staged default flip (G5 phase 6):
      // under 'system', the CLI supplies trustWarn and the entry root,
      // and every resolution escaping that root names the flag a future
      // default will require.
      if (null == rootDir && null != options.trustWarn &&
        null != options.trustWarnRoot &&
        outsideRoot(options.trustWarnRoot, full)) {
        options.trustWarn('escape', full)
      }
      record(ctx, full, 'file')
      return res
    }

    search = search.concat(res.search)

    if (null != rootDir) {
      // Package resolution is not part of the root capability; the
      // miss stands as not-found with the searched paths listed.
      res.search = search
      return res
    }

    res = pkgResolver(path, popts, rule, ctx, jsonic)
    res.path = path
    if (res.found) {
      gateExtension(path, res.full as string)
      if (null != options.trustWarn) {
        options.trustWarn('pkg', res.full as string)
      }
      record(ctx, res.full as string, 'pkg')
      return res
    }

    res.search = search.concat(res.search)
    return res
  }
}


const POSITIONAL_ARG_FUNCS: Record<string, boolean> = {}
for (const name in funcSig) {
  if (2 <= funcSig[name].args.length && 'constraint' !== funcSig[name].out) {
    POSITIONAL_ARG_FUNCS[name] = true
  }
}

for (const name of Object.keys(CMP_FUNCS)) {
  POSITIONAL_ARG_FUNCS[name] = true
}
POSITIONAL_ARG_FUNCS['nom'] = true
POSITIONAL_ARG_FUNCS['translate'] = true


function sigArity(sig: FuncSig): [number, number] {
  let min = 0
  let max = 0
  for (const a of sig.args) {
    if (true === a.rest) {
      min += undefined === a.group ? 1 : a.group.length
      max = -1
    }
    else {
      if (true !== a.opt) {
        min++
      }
      if (-1 !== max) {
        max++
      }
    }
  }
  return [min, max]
}

const funcArity: Record<string, [number, number]> = {}
for (const name in funcSig) {
  funcArity[name] = sigArity(funcSig[name])
}


function writtenArgCount(terms: any[]): number {
  if (1 === terms.length) {
    // `terms[0]` is re-read rather than reusing a narrowed local:
    // Array.isArray narrows an `any` to `any[]`, which then has no
    // `isVal` to test.
    const t: any = terms[0]
    if (Array.isArray(t) && true !== (terms[0] as any).isVal) {
      return t.length
    }
  }
  return terms.length
}


// arityText renders a built-in's permitted count for the error message.
// The fixed-arity case says "one" outright rather than counting: every
// fixed arity in the table IS one, and a phrasing for a count no entry
// carries would be untested prose pretending to be tested.
function arityText(lo: number, hi: number): string {
  if (-1 === hi) {
    return 'one or more arguments'
  }
  if (lo !== hi) {
    if (0 === lo) {
      return 'no arguments or one'
    }
    return 3 === hi ? 'one to three arguments' : 'one argument or two'
  }
  // The {0,0} arm returned with the container kinds and acyclic()
  // (ADR-015): `map(1)` must not claim map takes exactly one.
  if (0 === hi) {
    return 'no arguments'
  }
  if (2 === hi) {
    return 'exactly two arguments'
  }
  return 'exactly one argument'
}


function opCharHint(src: string): string {
  let q = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if ('' !== q) {
      if (c === q && '\\' !== src[i - 1]) {
        q = ''
      }
      continue
    }
    if ('"' === c || '\'' === c || '`' === c) {
      q = c
    }
    else if ('<' === c || '>' === c) {
      return '\nThe > and < characters are not aontu operators: write the ' +
        'bound functions min(x), max(x), above(x), below(x) instead.'
    }
  }
  return ''
}


function rawToVal(n: any): Val {
  if (true === n?.isVal) {
    return n
  }
  if (Array.isArray(n)) {
    return new ListVal({ peg: n.map(rawToVal) })
  }

  if (null == n) {
    return new NullVal({ peg: null })
  }
  const t = typeof n
  if ('string' === t) {
    return new StringVal({ peg: n })
  }
  if ('number' === t) {
    return isIntegerKind(n) ?
      new IntegerVal({ peg: n }) : new NumberVal({ peg: n })
  }
  if ('boolean' === t) {
    return new BooleanVal({ peg: n })
  }
  const peg: Record<string, Val> = {}
  for (const k in n) {
    peg[k] = rawToVal(n[k])
  }
  return new MapVal({ peg })
}


class Lang {
  jsonic: Jsonic
  opts: AontuOptions
  idcount: number | undefined


  constructor(options?: Partial<AontuOptions>) {

    this.opts = Object.assign(DEFAULT_OPTS(), options) as AontuOptions

    const modelResolver = makeModelResolver(this.opts)

    this.jsonic = Jsonic.make()

    if (this.opts.debug) {
      this.jsonic.use(asPlugin(Debug), {
        trace: this.opts.trace
      })
    }

    this.jsonic
      .use(asPlugin(MultiSource), {
        resolver: options?.resolver || modelResolver,
        implictExt: ['aon', 'aontu'],
        processor: includeProcessors(this.opts.textExt)
      })
      .use(AontuJsonic)
  }


  parse(src: string, opts?: Partial<AontuOptions>): Val {

    // JSONIC-UPDATE - check meta
    let jm: any = {
      fs: opts?.fs,
      fileName: opts?.path ?? this.opts.path,
      multisource: {
        path: opts?.path ?? this.opts.path,
        deps: (opts && opts.deps) || undefined
      },
      // The include-manifest sink (G5, docs/trust.md): the resolver
      // records every resolved include here, and the plugin's
      // child-meta spread carries the same array to nested includes.
      aontu: {
        manifest: (opts as any)?.manifest,
      },
    }

    if (null != opts?.idcount) {
      this.idcount = opts.idcount
    }

    // Pass through Jsonic debug log value
    if (opts && null != opts.log && Number.isInteger(opts.log)) {
      jm.log = opts.log
    }


    let val: Val

    try {
      val = this.jsonic(src, jm)

      // An implicit top-level list (`a b`, `1,2`) is built by the core
      // jsonic grammar without passing through the aontu val/list rules,
      // so the root (and its elements) arrive as raw JS values. Convert
      // them the same way the Go port's asVal post-walk does.
      if (null != val && true !== (val as any).isVal) {
        val = rawToVal(val)
      }
    }
    catch (e: any) {
      if ('include_denied' === e?.code || 'include_extension' === e?.code ||
        'multisource_not_found' === e?.code || MODULE_REFUSAL_CODES.has(e?.code)) {
        val = new NilVal({
          why: 'parse',
          err: new NilVal({
            why: e.code,
            msg: e.message,
            err: e,
          })
        })
      }
      else if (e instanceof JsonicError || 'JsonicError' === e.constructor.name) {
        const syntax: any = new NilVal({
          why: 'syntax',
          msg: e.message + opCharHint(src),
          err: e,
        })
        if ('number' === typeof e.lineNumber) {
          syntax.site.row = e.lineNumber
        }
        if ('number' === typeof e.columnNumber) {
          syntax.site.col = e.columnNumber
        }
        val = new NilVal({ why: 'parse', err: syntax })
      }
      else {
        throw e
      }
    }

    return val
  }
} /* node:coverage ignore next 6 */

export {
  Lang,
  Site,
}
