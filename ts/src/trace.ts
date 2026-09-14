/* Copyright (c) 2026 Richard Rodger, MIT License */


import type { Val } from './type'

import { Aontu } from './aontu'
import { cmpCodePoint } from './keyorder'
import { includeOpts } from './utility'
import { anchorAt, failureFinding } from './vet'
import { makeNilErr } from './err'

import type { IncludeOptions } from './utility'
import type { VetFinding } from './vet'


export type TraceOptions = IncludeOptions & {
  path?: string
  at?: string
}


export type TraceReport = {
  verdict: 'ok' | 'error'
  trace: TraceEntry[]
  errors?: VetFinding[]
}


// WHAT A TRACE ENTRY CARRIES. The file it reached, the rule set that
// wrote it, and the model node the dispatch matched.
export type TraceEntry = {
  at: string
  file: string
  node: string
  rule: string
}


function walkVals(root: any, fn: (v: any, path: string[]) => void): void {
  const walk = (v: any, path: string[]): void => {
    fn(v, path)
    if (true === v.isList && null != v.peg) {
      for (let i = 0; i < v.peg.length; i++) {
        walk(v.peg[i], [...path, String(i)])
      }
    }
    else if (true === v.isMap && null != v.peg) {
      for (const k of Object.keys(v.peg).sort(cmpCodePoint)) {
        if (!v.aliasKeys?.includes(k)) {
          walk(v.peg[k], [...path, k])
        }
      }
    }
  }
  walk(root, [])
}


function addr(path: string[]): string {
  return '$' + path.map((seg) => '.' + seg).join('')
}


function scalar(v: any): string | undefined {
  return (true === v?.isScalar && 'string' === typeof v.peg) ? v.peg : undefined
}


function fileName(v: any): string | undefined {
  if (true !== v?.isMap) {
    return undefined
  }
  return 'File' === scalar(v.peg?.cmp) ? scalar(v.peg?.props?.peg?.name) :
    undefined
}


// THE INNERMOST FILE WINS: the longest matching prefix, not the first.
function enclosing(files: { at: string, name: string }[],
  path: string): string | undefined {
  let best: string | undefined
  let long = -1
  for (const f of files) {
    if ((path === f.at || path.startsWith(f.at + '.')) && f.at.length > long) {
      best = f.name
      long = f.at.length
    }
  }
  return best
}


// Every piece a dispatch stamped, attributed to the file it reached.
// One pass: `walkVals` is depth-first in document order, so a file is
// always seen before the marks beneath it.
function traceTree(root: Val): TraceEntry[] {
  const files: { at: string, name: string }[] = []
  const marks: { at: string, mark: any }[] = []
  walkVals(root, (v: any, path: string[]) => {
    const name = fileName(v)
    if (undefined !== name) {
      files.push({ at: addr(path), name })
    }
    if (null != v.emitted) {
      marks.push({ at: addr(path), mark: v.emitted })
    }
  })

  const out: TraceEntry[] = []
  for (const m of marks) {
    const file = enclosing(files, m.at)
    if (undefined === file) {
      continue
    }
    out.push({ at: m.at, file, node: m.mark.node, rule: m.mark.rule })
  }
  return out
}


// THE MARKS ARE OPT-IN. `emit` stamps a piece only when the context
// carries a `reads` set, so the verb asks for one the way `render
// --trace` did.
function traceRun(src: string, options?: TraceOptions): TraceReport {
  const opts = options ?? {}
  const aontu = new Aontu(includeOpts(opts))
  const actx = aontu.ctx({ collect: true, reads: new Set<string>() })
  const root: any = aontu.unify(
    src, { path: opts.path, collect: true }, actx)
  if (0 < actx.err.length || true === root?.isNil) {
    return {
      verdict: 'error', trace: [],
      errors: [failureFinding(actx, opts.path, root)],
    }
  }

  let node: any = root
  const at = opts.at ?? '$.out'
  const found: any = anchorAt(root, at)
  if (null == found) {
    const nil: any = makeNilErr(actx, 'no_path', root, undefined, 'at')
    actx.err.push(nil)
    return {
      verdict: 'error', trace: [],
      errors: [failureFinding(actx, opts.path, root)],
    }
  }
  node = found

  return { verdict: 'ok', trace: traceTree(node) }
} /* node:coverage ignore next 6 */


export {
  traceTree,
  traceRun,
}
