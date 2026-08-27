/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import { util } from '@tabnas/jsonic'

import { Val, ErrContext } from './type'

import { AontuContext } from './ctx'

import { NilVal, TRIAL_NIL } from './val/NilVal'

import { hints } from './hints'


const { errmsg, strinject } = util


// COLOUR IS A DECISION ABOUT THE DESTINATION, not about the message.
// Every error frame hardcoded the ANSI escapes, so a piped report and
// a `--jsonl` answer carried terminal control codes into whatever read
// them -- a log file, a CI annotation, an agent's parser (the review's
// finding F).
//
// NO_COLOR (no-color.org: set, to anything, means no colour) turns them
// off everywhere, library callers included. The CLI additionally turns
// them off when its stderr is not a terminal, through setColor: a
// library cannot see the destination, and a caller who has one is the
// only one who can say.
let COLOR: boolean | undefined

function setColor(on: boolean | undefined): void {
  COLOR = on
}

function colorActive(): boolean {
  if (null != COLOR) {
    return COLOR
  }
  // `globalThis` always exists; `process` need not (this library runs
  // in a browser too), so the optional chain starts at the part that
  // can actually be missing -- and stays a CHAIN rather than becoming
  // an `if`, because the browser arm is unreachable from any test this
  // suite can run and ADR-002 does not accept an arm nothing takes.
  // Set-but-EMPTY is the documented exception and does not disable
  // colour (no-color.org).
  const no = (globalThis as any).process?.env?.NO_COLOR
  return null == no || '' === no
}


function getHint(why: any, details?: Record<string, any>): string | undefined {
  if (hints[why]) {
    let txt = hints[why]
    return details ? strinject(txt, details) : txt
  }

  return undefined
}


function makeNilErr(
  ctx?: AontuContext,
  why?: any,
  av?: Val,
  bv?: Val,
  attempt?: string,
  details?: Record<string, any>
): NilVal {
  // C1-inner: when a DisjunctVal trial is in progress, failures are
  // transient markers — none of the NilVal fields (site, path,
  // primary, secondary, details) ever surface to the user because
  // DisjunctVal replaces the oval entry with TRIAL_NIL and filters
  // by isNil. Allocating a fresh NilVal per failure (~60k per
  // foo-sdk run from IntegerVal/BooleanVal/ScalarVal.unify et al.)
  // is pure waste. Short-circuit to the shared sentinel; push once
  // to ctx.err so the caller's `trialErr.length > 0` check still
  // signals failure.
  if (ctx !== undefined && ctx._trialMode === true) {
    if (ctx.err.length === 0) ctx.err.push(TRIAL_NIL)
    return TRIAL_NIL
  }
  const nilval = NilVal.make(ctx, why, av, bv, attempt, details)
  return nilval
}


// TODO: move to utility?
function descErr<NILS extends NilVal | NilVal[]>(
  err: NILS | any,
  errctx?: ErrContext,
): any {
  if (err?.isNil) {
    if (null == err.msg || '' === err.msg) {
      let v1: any = err.primary
      let v2: any = err.secondary

      let v1src = resolveSrc(v1, errctx)
      let v2src = resolveSrc(v2, errctx)

      // STRICT `!==` against the empty string. The loose `!=` here dropped
      // the list index 0, because `'' != 0` is FALSE in JavaScript ('' and
      // 0 are both coerced to 0): `a:[1]&[2]` reported its conflict at
      // `$.a` while `a:[1,5]&[1,6]` reported `$.a.1`, so the one index a
      // reader is most likely to meet was the one silently erased, and a
      // nested `a:[[1]]&[[2]]` lost both segments (issue #37). Numeric
      // segments arrive here as numbers, so only `===`/`!==` compares them
      // for what they are. `null != p` stays loose on purpose -- it is the
      // idiomatic null-and-undefined test.
      let path = ['$', ...err.path].filter((p: any) => null != p && '' !== p)

      // '$' is neither null nor '', so the filter always leaves it.
      let valpath = path.join('.')
      let attempt = null != err.attempt ? err.attempt : (null == v2 ? 'resolve' : 'unify')

      const details = err.details

      err.msg = [
        errmsg({
          color: { active: colorActive() },
          name: 'aontu',
          code: err.why,
          txts: {
            msg: 'Cannot ' +
              attempt +
              ' value' + (null == v2 ? '' : 's') +
              ' at path ' + valpath,
            hint: getHint(err.why, err.details)
          }
        }),

        '\n',

        (null != v1 && errmsg({
          // TODO: color should come from jsonic config
          color: { active: colorActive(), line: '\x1b[34m' },
          txts: {
            msg: 'Cannot ' + attempt + ' value: ' + v1.canon +
              (null == v2 ? '' : ' with value: ' + v2.canon), // + ' #' + err.id,
            site: ''
          },
          smsg: (null == details?.key ? '' : 'key ' + details?.key + ' ') +
            'value was: ' + v1.canon,
          file: resolveFile(v1.site.url),
          src: v1src,
          row: v1.site.row,
          col: v1.site.col,
        })),

        (null != v2 && errmsg({
          // TODO: color should come from jsonic config
          color: { active: colorActive(), line: '\x1b[34m' },
          txts: {
            msg: 'Cannot ' + attempt + ' value: ' + v2.canon +
              ' with value: ' + v1.canon, // + ' #' + err.id,
            site: ''
          },
          smsg: (null == details?.key ? '' : 'key ' + details?.key + ' ') +
            'value was: ' + v2.canon,
          file: resolveFile(v2.site.url),
          src: v2src,
          row: v2.site.row,
          col: v2.site.col,
        })),


      ]
        .filter((n: any) => null != n && false !== n)
        .join('\n')

        // TODO: update jsonic errmsg to avoid multiple empty lines
        .replace(/\n\n/g, '\n')

    }
    return err
  }
  else {
    return err.map((n: any) => descErr(n, errctx))
  }
}

function resolveFile(url: string | undefined) {
  const cwd = process.cwd()
  let out = url?.replace(cwd + '/', '') ?? '<no-file>'
  out = out === cwd || '' === out ? '<no-file>' : out
  return out
}


function resolveSrc(v: Val, errctx: ErrContext | undefined) {
  let src: string | undefined = undefined
  const url = v?.site.url

  // Cache reads on errctx for the lifetime of the error-formatting pass.
  // When many NilVals share the same source file (common during batch
  // descErr after unify), this avoids re-reading the same file N times.
  const cache = errctx ? ((errctx as any)._srcCache ??= new Map<string, string>()) : null

  if (null != url) {
    if (cache && cache.has(url)) {
      src = cache.get(url)
    }
    else {
      try {
        const fileExists = errctx?.fs?.existsSync(url)
        if (fileExists) {
          src = errctx?.fs?.readFileSync(url, 'utf8') ?? undefined
        }
      }
      catch (fe: any) {
        // ignore as more important to report original error
      }
      if (cache && null != src) {
        cache.set(url, src)
      }
    }
  }

  if (undefined == src || '' === src) {
    if (errctx?.src) {
      src = errctx.src
    }
    else if (errctx) {
      src = 'SOURCE-NOT-FOUND:' + (null != url ? (' ' + url) : '') +
        (null == errctx?.fs ? ' (NO-FS)' : '')
    }
  }

  return src
}


class AontuError extends Error {
  aontu = true

  constructor(msg: string, errs?: NilVal[]) {
    super(msg)
    this.name = this.constructor.name
    this.errs = () => errs ?? []

    this.stack = this.stack?.split('\n')
      .filter(line => !line.match(/aontu\/(src|dist)\//))
      .join('\n')
  }

  errs: () => NilVal[]
} /* node:coverage ignore next 11 */


export {
  getHint,
  makeNilErr,
  descErr,
  AontuError,
  setColor,
  colorActive,
}
