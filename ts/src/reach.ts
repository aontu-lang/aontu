/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import { Aontu } from './aontu'
import { failureFinding } from './vet'
import type { VetFinding } from './vet'
import type { TrustOptions } from './type'
import { graphOf } from './graph'
import { cmpCodePoint } from './keyorder'


export type ReachVerdict = 'reaches' | 'unreachable' | 'error'

export type ReachReport = {
  verdict: ReachVerdict

  path?: string[]

  errors?: VetFinding[]
}

export type ReachOptions = {
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory (relationCheck's precedent).
  path?: string
  // The include capability this document evaluates under (G5,
  // docs/trust.md).
  trust?: TrustOptions

  textExt?: string[]
  readByExtension?: boolean
  // Follow only edges under this relation. Absent means follow every
  // edge, which is the whole graph and the commoner question.
  relation?: string
}


export function parseNodePath(s: string): string[] | undefined {
  if ('$' === s) {
    return []
  }
  if (!s.startsWith('$.')) {
    return undefined
  }
  const parts = s.slice(2).split('.')
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)) ? parts : undefined
}


function nodeAt(root: any, path: string[]): boolean {
  let node: any = root
  for (const seg of path) {
    if (true !== node?.isMap && true !== node?.isList) {
      return false
    }
    node = node.peg[seg]
    if (null == node) {
      return false
    }
  }
  return null != node
}


function endpointFinding(name: string, known: string[]): VetFinding {
  return {
    code: 'refer_unresolved',
    class: 'reference',
    severity: 'error',
    path: '$',
    message: `${name} names no node in this document.`,
    sites: [],
    ...(0 === known.length ? {} : {
      note: 'nodes with links: ' + known.join(', '),
    }),
  }
}


// The reachability check for one document.
export function reachCheck(
  src: string, from: string, to: string, opts?: ReachOptions
): ReachReport {
  const options = opts ?? {}
  const aontu = new Aontu(includeOpts(options))
  const ctx = aontu.ctx({ collect: true })
  const parseOpts = null == options.path ? undefined : { path: options.path }
  const root: any = aontu.unify(src, parseOpts, ctx)

  // A document that does not stand up is not a document with an
  // unreachable pair: the errors it already has are the answer.
  if (0 < ctx.err.length || true === root?.isNil) {
    return {
      verdict: 'error',
      errors: [failureFinding(ctx, options.path, root)],
    }
  }

  const graph = graphOf(root)
  // The nodes the graph actually touches, for the error note: a
  // document has every path in it, and listing them all would drown the
  // one fact a mistyped endpoint needs.
  const linked = [...new Set(graph.edges
    .flatMap((e) => [e.from, e.to]))].sort(cmpCodePoint)
  const missing = [from, to].filter((n) => {
    const parts = parseNodePath(n)
    return undefined === parts || !nodeAt(root, parts)
  })
  if (0 < missing.length) {
    return {
      verdict: 'error',
      errors: missing.map((n) => endpointFinding(n, linked)),
    }
  }

  // The successor map, restricted to one relation when the caller asked
  // for one. Sorted, so the path the search finds is the same one in
  // both ports.
  const succ = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (null != options.relation && options.relation !== e.key) {
      continue
    }
    const list = succ.get(e.from)
    const dest = e.to
    if (undefined === list) {
      succ.set(e.from, [dest])
    }
    else if (!list.includes(dest)) {
      list.push(dest)
    }
  }
  for (const list of succ.values()) {
    list.sort(cmpCodePoint)
  }

  const prev = new Map<string, string>()
  const seen = new Set<string>()
  let front: string[] = [from]
  while (0 < front.length) {
    const next: string[] = []
    for (const node of front) {
      for (const dest of succ.get(node) ?? []) {
        if (dest === to) {
          const path = [dest]
          let step = node
          while (step !== from) {
            path.unshift(step)
            step = prev.get(step) as string
          }
          path.unshift(from)
          return { verdict: 'reaches', path }
        }
        if (!seen.has(dest)) {
          seen.add(dest)
          prev.set(dest, node)
          next.push(dest)
        }
      }
    }
    front = next
  }

  return { verdict: 'unreachable' }
}
