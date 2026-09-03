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
import { graphOf } from './graph'
import { relationCheck, relationErrors } from './relation'
import { view, viewSet, viewTree } from './view'
import { format, unifiedDiff } from './format'
export type { LintFinding, FormatReport, FormatOptions } from './format'


// VERSION is the Aontu npm package version, and mirrors
// go/aontu.go's `Version` (which tracks the Go module version
// separately — the two version series are independent).
//
// Kept in step with package.json by the `version` npm lifecycle script,
// which runs on `npm version` / `npm run repo-bump`. version.test.ts
// fails if the two ever drift.
const VERSION = '0.56.0'


// A module file's VALUE, as far as it goes. COLLECTED, not raised: a
// module file that does not stand up has no `mod.main` to read, and
// the default entry name is the answer -- the resolution itself fails
// later, on the file that is not there, rather than here on a metadata
// read. That is what a collecting context does, so there is nothing to
// catch: it answers what it could generate and records the rest.
function genQuiet(val: any, aontu: Aontu): any {
  return val.gen(aontu.ctx({ collect: true }))
}


class Aontu {
  opts: AontuOptions
  lang: Lang


  constructor(popts?: AontuOptions) {
    this.opts = popts ?? {}

    // THE MODULE EVALUATOR (G6 phase 2, ts/src/mod.ts). Resolving a
    // module import needs two answers that only evaluation can give:
    // what a module file SAYS (its `mod.main`), and what a module
    // MEANS (its canon-hash, for the integrity check). Injected here
    // rather than imported there, because the resolver runs inside a
    // parse that this class started, and the file it runs in cannot
    // import this one without closing a cycle around the language.
    //
    // COLLECTED, not raised: a module that leans on consumer context
    // (a `$.x` its importer supplies) does not stand up alone, and its
    // hash is still the hash of what it says — that residue is part of
    // the hashed meaning, which is why `hcanon` keeps it in textual
    // form (docs/capability-review/g6-distribution.md).
    ;(this.opts as any).mod = {
      ...((this.opts as any).mod ?? {}),
      eval: (this.opts as any).mod?.eval ?? ((src: string, path: string) => {
        // One deeper: a module verified from inside a module
        // verification is one more level of nesting, and the resolver
        // refuses past its bound (MODULE_MAX_DEPTH in ts/src/mod.ts).
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
    // The trust profile rides the instance (its resolver is built once,
    // in the Lang constructor); the context needs it too, for the
    // budgets (G5, docs/trust.md).
    cfg.opts = cfg.opts ?? {}
    ; (cfg.opts as any).trust = (cfg.opts as any).trust ?? this.opts.trust
    const ac = new AontuContext(cfg)
    return ac
  }


  // Parse source into a matching Val AST, not yet unified.
  //
  // NOTE: the returned Val is SINGLE-USE — unify()/generate() refine the
  // tree in place (see Val.unify), so do not unify or generate the same
  // parsed Val more than once, and do not share it across threads. Call
  // parse() again for a fresh tree.
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
      // A version-control conflict marker is refused BEFORE the parse
      // (issue #5). None of `<`, `=` or `>` is an aontu operator, so a
      // marker line is ordinary text and `<<<<<<< HEAD` parsed happily
      // into the two-string list ["<<<<<<<","HEAD"] -- an unresolved
      // merge became a plausible document instead of an error, and the
      // report of it read as a failed `<` operation.
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
      // The include MANIFEST (G5, docs/trust.md): the resolved include
      // closure as `{ path, capability }`, sorted and deduplicated so
      // it is deterministic — the "file set" of hermeticity clause 1
      // made observable. Content hashing and pinning stay with G6.
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
      // THE DERIVED STRUCTURE (G4 phase 3): the edge set, computed
      // once from the unified tree. Cheap on a document with no links
      // — one guarded walk — and the thing impact analysis and the
      // relation checks are traversals over.
      out.graph = graphOf(out)
      out.err = errs
      ac.root = out
    }

    handleErrors(errs, out, ac)

    return out as Val
  }


  // Generate output structure from source, which must parse and fully unify.
  //
  // The result is made of NATIVE values, and D9 puts two beyond what
  // `JSON.stringify` can write: a `biginteger` (a `0d` literal with no
  // fraction or exponent) generates as a native `bigint`, and a
  // `bigdecimal` generates as a `Decimal`. Both are exact at any
  // magnitude, which is the whole point of the leaves -- and both are
  // confined to documents that opt in, so a `0d`-free document generates
  // exactly what it always did.
  //
  // Serialise the result with `exactJSON` (exported alongside this
  // class), NOT with `JSON.stringify`: the latter throws on a bigint and
  // has no way to write exact digits as a JSON number.
  generate(src: string, opts?: any, ac?: AontuContext): any {
    try {
      let out = undefined

      ac = ac ?? this.ctx()
      ac.addopts({ ...(opts ?? {}), src })

      let pval = this.parse(src, undefined, ac)

      if (undefined !== pval && 0 === pval.err.length) {

        let uval = this.unify(pval, undefined, ac)
        // console.log('AONTU-GENERATE-UVAL', uval.constructor, uval.mark)

        if (undefined !== uval && 0 === uval.err.length) {

          out = uval.isNil ? (ac.adderr(uval as any), undefined)
            : 0 < ac.err.length ? undefined
              : uval.gen(ac as any)

          // The relation verdict (RELATIONS P2): declarations the
          // graph atoms registered during unification are decided
          // HERE, where no more information can arrive -- the sizing
          // atoms' model. A violated declaration is a located
          // evaluation error at the offending edge, and the generated
          // value is discarded below.
          //
          // AFTER GENERATION, and only when generation SUCCEEDED. A
          // document that cannot be generated has no finished model
          // to have a graph verdict about: an unsettled disjunction
          // leaves alternatives the graph walk cannot read, so a
          // mirror the document writes is absent from the edge set
          // and `inverse(n)` reports it missing -- a false finding,
          // and one that buried the `disjunct_no_gen` that actually
          // stopped the document. The check that a broken document is
          // not blamed on its relations (`relations` verb, finding F)
          // holds here too.
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
      const unex = new AontuError('Aontu: unexpected error: ' + err.message)
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


// Locate the first version-control conflict marker in a source, as a
// 1-based row and column (offset -1 when there is none).
//
// The shape is git's, and it is matched exactly: SEVEN of `<`, `=` or `>`
// at the very start of a line, then either the end of that line or a
// space before the branch label. Requiring the run length and the line
// start is what keeps a document that legitimately writes `a:"<<<<<<<"`,
// or a row of `=` inside a string, from being refused -- the marker is
// recognised as the artifact it is, not as a suspicious character.
//
// Kept byte-identical to findConflictMarker in go/lang.go.
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

  // D9 -- the generate contract. `exactJSON` is the supported way to
  // turn `generate()` output into JSON when a document uses the exact
  // leaves, and `Decimal` is the type a `bigdecimal` generates as (a
  // `biginteger` generates as the language's own `bigint`).
  exactJSON,
  Decimal,

  // G2 phase 2 -- the validation verb. The engine only: the CLI verb
  // and the text/JSON renderers are phase 3, the Go port phase 4.
  // `sarifReport` (phase 5) is library API so an embedder can emit the
  // interchange form without shelling out.
  vet,
  sarifReport,

  // G3 -- subsumption as a first-class query: does the general value
  // admit every instance the specific value admits? Three-valued, with
  // G2-shaped findings (class `compat`).
  subsume,
  trimCheck,

  // G6 -- the hash form and the canon-hash pin. `hcanon` is the
  // unify-level canon plus the close()/type()/hide() wrappers that
  // close its semantic gaps; `canonHash` is
  // "aon1-" + base64url(SHA-256(UTF-8(hcanon(v)))).
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
  graphOf,
  relationCheck,
  view,
  viewSet,
  viewTree,

  // The source formatter (docs/design/FMT.0.md): the agreed form of a
  // document, and the unified diff `aontu fmt --diff` prints.
  format,
  unifiedDiff,
}


export default Aontu
