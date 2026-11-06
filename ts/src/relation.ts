/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import { Aontu } from './aontu'
import { failureFinding } from './vet'
import type { VetFinding } from './vet'
import type { TrustOptions } from './type'
import { graphOf } from './graph'
import type { Edge, Graph } from './graph'
import { cmpCodePoint } from './keyorder'
import { makeNilErr } from './err'
import type { RelDecl } from './val/GraphAtomVal'


export type RelationVerdict = 'pass' | 'fail' | 'error'

export type RelationFinding = {
  code: string
  relation: string
  // Where the offending edge is written, as a `$.dotted.path`.
  at: string
  detail: string[]
}

export type RelationReport = {
  verdict: RelationVerdict
  findings: RelationFinding[]

  errors?: VetFinding[]

  declared?: number
}

export type RelationOptions = {
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory (trimCheck's precedent).
  path?: string
  trust?: TrustOptions

  // Extensions additionally read as text (the CLI's `--text-ext`).
  // Rides beside `trust` because it is the other half of what an
  // include may read.
  textExt?: string[]

  count?: boolean
}


function findCycle(
  start: string,
  succ: Map<string, string[]>,
  done: Set<string>,
): string[] | undefined {
  const stack: string[] = []
  const onStack = new Set<string>()

  const walk = (node: string): string[] | undefined => {
    if (onStack.has(node)) {
      return [...stack.slice(stack.indexOf(node)), node]
    }
    if (done.has(node)) {
      return undefined
    }
    done.add(node)
    stack.push(node)
    onStack.add(node)
    for (const next of succ.get(node) ?? []) {
      const found = walk(next)
      if (undefined !== found) {
        return found
      }
    }
    stack.pop()
    onStack.delete(node)
    return undefined
  }

  return walk(start)
}


export function relationFindings(
  decls: Map<string, RelDecl>, graph: Graph
): RelationFinding[] {
  const findings: RelationFinding[] = []

  const byRelation = new Map<string, Edge[]>()
  const pairs = new Set<string>()
  for (const e of graph.edges) {
    const list = byRelation.get(e.key)
    if (undefined === list) {
      byRelation.set(e.key, [e])
    }
    else {
      list.push(e)
    }
    pairs.add(e.key + ' ' + e.from + ' ' + e.to)
  }

  // Predicates in sorted order, so the findings arrive the same way
  // in both ports (the registry is insertion-ordered here, random in
  // Go).
  const names = [...decls.keys()].sort(cmpCodePoint)
  for (const name of names) {
    const decl = decls.get(name) as RelDecl
    const mine = byRelation.get(name) ?? []

    if (true === decl.acyclic) {
      const succ = new Map<string, string[]>()
      for (const e of mine) {
        const list = succ.get(e.from)
        const to = e.to
        if (undefined === list) {
          succ.set(e.from, [to])
        }
        else {
          list.push(to)
        }
      }
      for (const list of succ.values()) {
        list.sort(cmpCodePoint)
      }

      // The roots are visited in sorted order, and a node already
      // settled is not revisited, so one cycle is reported once and the
      // SAME one in both ports.
      const done = new Set<string>()
      const roots = [...succ.keys()].sort(cmpCodePoint)
      for (const from of roots) {
        const cycle = findCycle(from, succ, done)
        if (undefined !== cycle) {
          // The cycle's first node is a key of `succ`, and every key of
          // `succ` came from an edge's `from`, so the edge is there.
          const at = mine.find((e) => e.from === cycle[0]) as Edge
          findings.push({
            code: 'relation_cycle',
            relation: name,
            at: at.at,
            detail: cycle,
          })
          break
        }
      }
    }

    const inverses = [...decl.inverses].sort(cmpCodePoint)
    for (const inv of inverses) {
      for (const e of mine) {
        const to = e.to
        if (!pairs.has(inv + ' ' + to + ' ' + e.from)) {
          findings.push({
            code: 'relation_inverse_missing',
            relation: name,
            at: e.at,
            detail: [e.from, to, inv],
          })
        }
      }
    }
  }

  findings.sort((a, b) =>
    cmpCodePoint(a.at, b.at) || cmpCodePoint(a.code, b.code)
    || cmpCodePoint(a.detail.join(' '), b.detail.join(' ')))

  return findings
}


export function relationErrors(ctx: any, root: any): void {
  const decls: Map<string, RelDecl> = ctx._reldecls
  if (0 === decls.size) {
    return
  }
  const findings = relationFindings(decls, graphOf(root))
  for (const f of findings) {
    let node: any = root
    const at = f.at.slice(2).split('.')
    for (const seg of at) {
      // Graph atoms hold the field's value -- possibly nested, one
      // atom carrying another -- and the path steps through them
      // exactly as the graph walk does.
      while (true === node?.isGraphAtom) {
        node = node.held
      }
      node = node?.peg?.[seg]
    }
    const nil = makeNilErr(ctx, f.code, node, undefined, 'relate', {
      relation: f.relation,
      detail: f.detail.join(' -> '),
    })
    nil.path = at
    ctx.adderr(nil)
  }
}


// The relation checks for one document: evaluate, then report the
// same verdict generation enforces.
export function relationCheck(
  src: string, opts?: RelationOptions): RelationReport {
  const options = opts ?? {}
  const aontu = new Aontu(includeOpts(options))
  const ctx = aontu.ctx({ collect: true })
  const parseOpts = null == options.path ? undefined : { path: options.path }
  const root: any = aontu.unify(src, parseOpts, ctx)

  // A document that does not stand up is not a document with a bad
  // graph: the errors it already has are the answer, and blaming its
  // relations on top would be noise.
  if (0 < ctx.err.length || true === root?.isNil) {
    return {
      verdict: 'error',
      findings: [],
      errors: [failureFinding(ctx, options.path, root)],
    }
  }

  const decls: Map<string, RelDecl> = (ctx as any)._reldecls
  const counted = true === options.count ? { declared: decls.size } : {}
  if (0 === decls.size) {
    return { verdict: 'pass', findings: [], ...counted }
  }

  const gctx = ctx.clone({ err: [], collect: true })
  root.gen(gctx)
  if (0 < gctx.err.length) {
    return {
      verdict: 'error',
      findings: [],
      errors: [failureFinding(gctx, options.path, root)],
    }
  }

  const findings = relationFindings(decls, graphOf(root))
  return {
    verdict: 0 === findings.length ? 'pass' : 'fail',
    findings,
    ...counted,
  }
}
