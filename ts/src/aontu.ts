/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

// FIX: 1+2+3


import type { Val, AontuOptions } from './type'

import { Lang } from './lang'
import { Unify } from './unify'
import { AontuContext, AontuContextConfig } from './ctx'
import { MapVal } from './val/MapVal'
import { Decimal } from './val/Decimal'
import { exactJSON } from './exactjson'
import { canonRiders, formatExplain } from './utility'
import { makeNilErr, descErr, AontuError, setColor, colorActive } from './err'
import { vet } from './vet'
import { sarifReport } from './report-sarif'
import { subsume } from './subsume'
import { trimCheck } from './trim'
import { hcanon, canonHash } from './hcanon'
import { get, why } from './query'
import { patch } from './patch'
import { diff } from './diff'
import { agentsMd } from './agentsmd'
import { allow } from './allow'
export type {
  AllowDecision, AllowOptions, AllowReason, AllowReport, AllowVerdict,
} from './allow'
import { graphOf } from './graph'
import { relationCheck, relationErrors } from './relation'
import { reachCheck } from './reach'
import { jsonSchema } from './jsonschema'
import { importJsonSchema } from './jsonschema-import'
import { readSourceMap, vetOutput } from './sourcemap'
export type { OutputUnit, SourceMap, SourceSpan, VetOutput } from './sourcemap'
import { aliasBudget, aliasErrors } from './alias'
import { view, viewSet, viewTree } from './view'
import { loadProfile } from './profile'
import { desugarTemplate, resugarTemplate, markerFor } from './template'
import { format, unifiedDiff } from './format'
export type { LintFinding, FormatReport, FormatOptions } from './format'


const VERSION = '0.76.0'


function genQuiet(val: any, aontu: Aontu): any {
  return val.gen(aontu.ctx({ collect: true }))
}


class Aontu {
  opts: AontuOptions
  lang: Lang


  constructor(popts?: AontuOptions) {
    this.opts = popts ?? {}

    ;(this.opts as any).mod = {
      ...((this.opts as any).mod ?? {}),
      eval: (this.opts as any).mod?.eval ?? ((src: string, path: string) => {
        const inner = new Aontu({
          ...this.opts,
          exactNumbers: undefined,
          mod: {
            // Never absent: the assignment this closure is part of has
            // already run by the time it is called.
            ...(this.opts as any).mod,
            eval: undefined,
            depth: (((this.opts as any).mod?.depth ?? 0) as number) + 1,
          },
        } as any)
        const ctx = inner.ctx({ collect: true })
        const val = inner.unify(src, { path }, ctx)
        return { gen: genQuiet(val, inner), hash: canonHash(val) }
      }),
    }

    this.lang = new Lang(this.opts)
  }


  // Create a new context.
  ctx(cfg?: AontuContextConfig): AontuContext {
    cfg = cfg ?? {}
    cfg.fs = cfg.fs ?? this.opts.fs
    ;(cfg as any).errfs = (cfg as any).errfs ?? (this.opts as any).errfs
    // The trust profile rides the instance (its resolver is built once,
    // in the Lang constructor); the context needs it too, for the
    // budgets (G5, docs/trust.md).
    cfg.opts = cfg.opts ?? {}
    ; (cfg.opts as any).trust = (cfg.opts as any).trust ?? this.opts.trust
    const ac = new AontuContext(cfg)
    return ac
  }


  parse(src: string, opts?: AontuOptions, ac?: AontuContext): Val | undefined {
    let out: Val | undefined
    let errs: any[] = []

    if (null == src) {
      src = ''
    }

    ac = ac ?? this.ctx()
    ac.addopts({ ...(opts ?? {}), src })

    if ('string' !== typeof src) {
      out = makeNilErr(ac, 'parse_bad_src')
      errs.push(out)
    }
    else {
      const marker = findConflictMarker(src)
      const deep = findDeepNesting(src, 2 * ac.budget.depth)
      if (-1 !== marker.offset || -1 !== deep) {
        const nil: any = makeNilErr(ac, -1 !== marker.offset ? 'merge_conflict' : 'max_depth')
        const before = src.slice(0, deep)
        nil.site.row = -1 !== marker.offset ? marker.row : before.split('\n').length
        nil.site.col = -1 !== marker.offset ? marker.col : deep - before.lastIndexOf('\n')
        nil.site.url = ac.opts.path ?? this.opts.path
        out = nil
        errs.push(nil)
      }
    }

    if (0 === errs.length) {
      out = runparse(src, this.lang, ac)
      if (2 * ac.budget.depth < treeDepth(out, 2 * ac.budget.depth)) {
        out = makeNilErr(ac, 'max_depth')
        errs.push(out)
      }
      out.deps = manifestOf(ac.manifest)
      ac.root = out
    }

    handleErrors(errs, out, ac)

    return out
  }


  // Unify source or Val, returning a fully unified Val.
  unify(src: string | Val, opts?: AontuOptions, ac?: AontuContext | any): Val {
    let out: Val | undefined
    let errs: any[] = []

    ac = ac ?? this.ctx()
    ac.addopts({ ...(opts ?? {}), src })

    let pval: Val | undefined

    if (null == src) {
      src = ''
    }

    if ('string' === typeof src) {
      pval = this.parse(src, undefined, ac)
    }
    else if (src && src.isVal) {
      pval = src
    }
    else {
      out = makeNilErr(ac, 'unify_no_src')
      errs.push(out)
    }

    if (null != pval && 0 === errs.length) {
      // T-1: EXPANDED SIZE IS CHARGED BEFORE EVALUATION, here rather
      // than in generate, because an editor unifies on each keystroke
      // and a document too big to evaluate must be turned away there
      // too.
      const over = aliasBudget(ac as any, pval)

      if (undefined !== over) {
        out = over
        errs = [over]
      }
      else {
        let uni = new Unify(pval, this.lang, ac, src)
        errs = uni.err

        // Never nullish: Unify.res starts as the root Val, unite() returns a
        // Val on every arm, and its catch-all turns a throwing node into an
        // 'internal' NilVal.
        out = uni.res
        out.graph = graphOf(out)
      }

      out.deps = pval.deps
      out.err = errs
      ac.root = out
    }

    handleErrors(errs, out, ac)

    return out as Val
  }


  generate(src: string, opts?: any, ac?: AontuContext): any {
    try {
      let out = undefined

      ac = ac ?? this.ctx()
      ac.addopts({ ...(opts ?? {}), src })

      let pval = this.parse(src, undefined, ac)

      if (undefined !== pval && 0 === pval.err.length) {

        let uval = this.unify(pval, undefined, ac)

        if (undefined !== uval && 0 === uval.err.length) {

          // An unfilled ROOT (`any`, `_`) has no bag to refuse it.
          if (true === (uval as any).isTop || true === (uval as any).isPlace) {
            ac.adderr(descErr(makeNilErr(ac as any, 'no_gen', uval), ac as any))
          }

          out = uval.isNil ? (ac.adderr(uval as any), undefined)
            : 0 < ac.err.length ? undefined
              : uval.gen(ac as any)

          if (!uval.isNil && 0 === ac.err.length) {
            aliasErrors(ac as any, uval)
            relationErrors(ac as any, uval)
            if (0 < ac.err.length) {
              out = undefined
            }
          }

          if (0 < ac.err.length) {
            if (!ac.collect) {
              throw new AontuError(ac.errmsg(), ac.err)
            }
            out = undefined
          }
        }
      }

      return out
    }
    catch (err: any) {
      if (err instanceof AontuError || true === err.aontu) {
        throw err
      }
      const unex = new AontuError('aontu: unexpected error: ' + err.message)
      Object.assign(unex, err)
      unex.stack = err.stack
      throw unex
    }
  }
}


// Either throw an exception or add collected errors to result.
function handleErrors(errs: any[], out: Val | undefined, ac: AontuContext) {

  errs.map((err: any) => ac.adderr(err))

  if (out) {
    out.err.map((err: any) => ac.adderr(err))
  }

  if (0 < ac.err.length) {
    // Error message formatting is deferred by adderr (many NilVals are
    // transient). Materialize msgs here before the caller sees them.
    for (const err of ac.err) {
      if (null == err?.msg || '' === err.msg) {
        descErr(err, ac)
      }
    }

    if (ac.collect) {
      if (out) {
        out.err = ac.err
      }
    }
    else {
      throw new AontuError(ac.errmsg(), ac.err)
    }
  }
}


// The depth of a parsed tree, read without recursion and stopping past
// `bound`, so nothing recurses into a tree too deep to evaluate.
// Mirrors valTreeDepth in go/lang.go.
function treeDepth(root: any, bound: number): number {
  const stack: [any, number][] = [[root, 1]]
  let max = 0
  while (0 < stack.length && max <= bound) {
    const [v, d] = stack.pop() as [any, number]
    max = Math.max(max, d)
    for (const kid of treeKids(v)) {
      stack.push([kid, d + 1])
    }
  }
  return max
}


function treeKids(v: any): any[] {
  if (true === v.isMap || true === v.isList) {
    return [...Object.values(v.peg), ...(null == v.spread?.cj ? [] : [v.spread.cj])]
  }
  if (true === v.isConjunct || true === v.isDisjunct || true === v.isPlusOp ||
    true === v.isFunc) {
    return v.peg
  }
  return true === v.isPref ? [v.peg] : []
}


// The first opener that nests past `bound`, or -1. A string or a comment
// holds no structure, so its brackets are not counted.
function findDeepNesting(src: string, bound: number): number {
  let depth = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if ('#' === c) {
      while (i < src.length && '\n' !== src[i]) {
        i++
      }
    }
    else if ('"' === c || "'" === c || '`' === c) {
      for (i++; i < src.length && c !== src[i] && ('`' === c || '\n' !== src[i]); i++) {
        i += '\\' === src[i] ? 1 : 0
      }
    }
    else if ('[' === c || '{' === c || '(' === c) {
      depth++
      if (bound < depth) {
        return i
      }
    }
    else if ((']' === c || '}' === c || ')' === c) && 0 < depth) {
      depth--
    }
  }
  return -1
}


function findConflictMarker(src: string): {
  offset: number, row: number, col: number
} {
  const miss = { offset: -1, row: -1, col: -1 }
  let offset = 0
  let row = 1

  for (const rawline of src.split('\n')) {
    // A CRLF source leaves the \r on the line; it is not part of the run.
    const line = rawline.endsWith('\r') ? rawline.slice(0, -1) : rawline
    const c = line[0]

    if ('<' === c || '=' === c || '>' === c) {
      let run = 0
      while (run < line.length && line[run] === c) {
        run++
      }
      if (7 === run && (7 === line.length || ' ' === line[7])) {
        return { offset, row, col: 1 }
      }
    }

    offset += rawline.length + 1
    row++
  }

  return miss
}


// Sort and deduplicate the raw manifest sink into the deterministic
// include closure: by path then capability, code-point order, one entry
// per (path, capability) pair.
function manifestOf(
  sink: { path: string, capability: string }[]
): { path: string, capability: string }[] {
  const seen = new Set<string>()
  const out: { path: string, capability: string }[] = []
  for (const dep of sink) {
    const key = dep.path + ' ' + dep.capability
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ path: dep.path, capability: dep.capability })
    }
  }
  // No equal case: entries were deduplicated on exactly this key.
  out.sort((a, b) => {
    const ka = a.path + ' ' + a.capability
    const kb = b.path + ' ' + b.capability
    return ka < kb ? -1 : 1
  })
  return out
}


// Perform parse of source code (minor customizations over Lang.parse).
function runparse(src: string, lang: Lang, ctx: AontuContext): Val {
  const popts = {
    deps: ctx.deps,
    fs: ctx.fs,
    path: ctx.opts.path,
    manifest: ctx.manifest,
    exactNumbers: ctx.opts.exactNumbers,
  }
  let val

  const tsrc = src.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')

  if ('string' === typeof src && '' !== tsrc) {
    val = lang.parse(src, popts)
  }

  if (undefined === val) {
    val = new MapVal({ peg: {} })
  }

  return val
}


const util = {
  runparse,
}


export {
  VERSION,

  Aontu,
  AontuOptions,
  AontuContext,
  AontuError,
  setColor,
  colorActive,

  Val,
  Lang,
  runparse,
  util,
  formatExplain,

  exactJSON,
  Decimal,

  vet,
  sarifReport,

  // G3 -- subsumption as a first-class query: does the general value
  // admit every instance the specific value admits? Three-valued, with
  // G2-shaped findings (class `compat`).
  subsume,
  trimCheck,

  hcanon,
  canonHash,
  canonRiders,

  // G7 -- the machine-facing query surface: select one node by path
  // and render it, plainly (json/canon) or as a lattice ABSTRACTION
  // (types/depth/keys) that subsumes the truth it summarises.
  get,
  why,
  patch,
  diff,
  agentsMd,

  // The role gate (docs/design/ALLOW.0.md): may a role modify a
  // subtree, by a role model that is itself an aontu document. The
  // question an agent asks before `set`.
  allow,
  graphOf,
  relationCheck,
  reachCheck,
  jsonSchema,
  importJsonSchema,
  // ADR-066: a vet report as JSON Schema's output units, located through
  // the importer's source map, and a map read back from its file.
  vetOutput,
  readSourceMap,
  view,
  viewSet,
  viewTree,

  loadProfile,

  desugarTemplate,
  resugarTemplate,
  markerFor,

  // The source formatter (docs/design/FMT.0.md): the agreed form of a
  // document, and the unified diff `aontu fmt --diff` prints.
  format,
  unifiedDiff,
}


export default Aontu
