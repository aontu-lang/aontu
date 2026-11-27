/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import { Aontu } from './aontu'
import { failureFinding } from './vet'
import type { VetFinding } from './vet'
import type { TrustOptions } from './type'


export type TrimVerdict = 'clean' | 'redundant' | 'error'

export type TrimReport = {
  verdict: TrimVerdict
  redundant: string[]

  errors?: VetFinding[]
}

export type TrimOptions = {
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory (vet's schemaPath precedent).
  path?: string
  trust?: TrustOptions

  textExt?: string[]
  readByExtension?: boolean
}


function pathText(path: string[]): string {
  return '$' + (0 < path.length ? '.' + path.join('.') : '')
}


export function candidates(v: any, path: string[], out: string[][]): void {
  if (null == v || true !== v.isVal) {
    return
  }
  if (true === v.isMap && null != v.peg) {
    for (const k of Object.keys(v.peg)) {
      out.push([...path, k])
      candidates(v.peg[k], [...path, k], out)
    }
  }
  else if (true === v.isList && null != v.peg) {
    // List ELEMENTS are not candidates: removing one shifts every
    // later index, which is a different document, not the same one
    // minus a redundancy. Entries of maps INSIDE lists still are.
    for (const k of Object.keys(v.peg)) {
      candidates(v.peg[k], [...path, k], out)
    }
  }
}


// Delete the entry at path from a parsed tree. False when the path
// does not address a map entry (which cannot happen for a candidate
// enumerated from an identical parse, but the walk stays honest).
export function deleteAt(root: any, path: string[]): boolean {
  let node: any = root
  for (const seg of path.slice(0, -1)) {
    if ((true === node?.isMap || true === node?.isList) && null != node.peg) {
      node = node.peg[seg]
    }
    else {
      return false
    }
  }
  const key = path[path.length - 1]
  if (true !== node?.isMap || null == node.peg ||
    !Object.prototype.hasOwnProperty.call(node.peg, key)) {
    return false
  }
  delete node.peg[key]
  // Always an array on a parsed bag (BagVal initialises it).
  node.optionalKeys = node.optionalKeys.filter((k: string) => k !== key)
  return true
}


export function evalCanon(
  src: string, opts: TrimOptions, delPath?: string[],
  sink?: { ctx?: any, failed?: any }): string | undefined {
  const aontu = new Aontu(includeOpts(opts))
  const ctx = aontu.ctx({ collect: true })
  const parseOpts = null == opts.path ? undefined : { path: opts.path }
  const fail = (failed?: any): undefined => {
    if (null != sink) {
      sink.ctx = ctx
      // The failing ROOT travels with the context: a nil root can
      // arrive with an EMPTY error list (`&: id(root)`), and the
      // finding is built from it then (use-cases/BUGS.md §43).
      sink.failed = failed
    }
    return undefined
  }
  const parsed: any = aontu.parse(src, parseOpts, ctx)
  if (0 < ctx.err.length || null == parsed) {
    return fail()
  }
  if (null != delPath && !deleteAt(parsed, delPath)) {
    return undefined
  }
  const v: any = aontu.unify(parsed, parseOpts, ctx)
  if (0 < ctx.err.length || true === v?.isNil) {
    return fail(v)
  }
  return v.canon
}


export function trimCheck(src: string, opts?: TrimOptions): TrimReport {
  const options = opts ?? {}

  const sink: { ctx?: any, failed?: any } = {}
  const baseline = evalCanon(src, options, undefined, sink)
  if (undefined === baseline) {
    return {
      verdict: 'error',
      redundant: [],
      errors: [failureFinding(sink.ctx, options.path, sink.failed)],
    }
  }

  const aontu = new Aontu()
  const ctx = aontu.ctx({ collect: true })
  const parseOpts = null == options.path ? undefined : { path: options.path }
  const parsed: any = aontu.parse(src, parseOpts, ctx)
  const paths: string[][] = []
  candidates(parsed, [], paths)

  const redundant: string[] = []
  for (const path of paths) {
    const parent = pathText(path.slice(0, -1))
    if (redundant.some((r) => r === parent || parent.startsWith(r + '.'))) {
      continue
    }
    if (baseline === evalCanon(src, options, path)) {
      redundant.push(pathText(path))
    }
  }

  return {
    verdict: 0 === redundant.length ? 'clean' : 'redundant',
    redundant,
  }
}
