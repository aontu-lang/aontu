/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

// FIX: 1+2+3


import type { Val, AontuOptions } from './type'

import { Lang } from './lang'
import { Unify } from './unify'
import { AontuContext, AontuContextConfig } from './ctx'
import { MapVal } from './val/MapVal'
import { Decimal } from './val/Decimal'
import { exactJSON } from './exactjson'
import { formatExplain } from './utility'
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
import { view, viewSet, viewTree } from './view'
import { render, renderValue, renderProfile } from './render'
import { desugarTemplate, resugarTemplate, markerFor } from './template'
import { format, unifiedDiff } from './format'
export type { LintFinding, FormatReport, FormatOptions } from './format'


const VERSION = '0.63.0'


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
      if (-1 !== marker.offset) {
        const nil: any = makeNilErr(ac, 'merge_conflict')
        nil.site.row = marker.row
        nil.site.col = marker.col
        out = nil
        errs.push(nil)
      }
    }

    if (0 === errs.length) {
      out = runparse(src, this.lang, ac)
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
      let uni = new Unify(pval, this.lang, ac, src)
      errs = uni.err

      // Never nullish: Unify.res starts as the root Val, unite() returns a
      // Val on every arm, and its catch-all turns a throwing node into an
      // 'internal' NilVal.
      out = uni.res

      out.deps = pval.deps
      out.graph = graphOf(out)
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

          out = uval.isNil ? (ac.adderr(uval as any), undefined)
            : 0 < ac.err.length ? undefined
              : uval.gen(ac as any)

          if (!uval.isNil && 0 === ac.err.length) {
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
  }
  let val

  const tsrc = src.trim().replace(/^(\n\s*)+/, '')

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
  view,
  viewSet,
  viewTree,

  // G9 -- the renderer (docs/design/RENDER.0.md): evaluate, vet and
  // fold an aontu:code instance into bytes, or the fold alone over
  // generate() output.
  render,
  renderValue,
  renderProfile,

  desugarTemplate,
  resugarTemplate,
  markerFor,

  // The source formatter (docs/design/FMT.0.md): the agreed form of a
  // document, and the unified diff `aontu fmt --diff` prints.
  format,
  unifiedDiff,
}


export default Aontu
