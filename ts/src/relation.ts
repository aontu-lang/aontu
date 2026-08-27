/* Copyright (c) 2025 Richard Rodger, MIT License */

// RELATION GRAPH CHECKS (G4 phase 5,
// docs/capability-review/g4-identity-relations.md): acyclicity and
// inverse consistency over the edge set, checked AFTER unification and
// never by it.
//
// Why not in the lattice. Both properties are GLOBAL and NON-MONOTONE:
// an acyclic graph becomes cyclic when one more edge unifies in, and an
// inverse that is present becomes absent when the far side is narrowed.
// The lattice guarantee is that more information never falsifies what
// has been observed, so a constraint that could be true and then false
// is not a constraint the lattice may hold. These are facts about the
// finished model, and the verb that reports facts about a finished
// model is where they belong.
//
// A relation is DECLARED as data, under the `relations` key of the
// document root, which is the `std/system` vocabulary's convention:
//
//   relations: dependsOn: $.std.Relation & {
//     target: $.std.Service, inverse: dependedOnBy, acyclic: true
//   }
//
// Nothing in the engine knows the name `relations`; this pass does,
// and says so.

import { Aontu } from './aontu'
import { failureFinding } from './vet'
import type { VetFinding } from './vet'
import type { TrustOptions } from './type'
import { graphOf } from './graph'
import type { Edge } from './graph'
import { cmpCodePoint } from './keyorder'


export type RelationVerdict = 'pass' | 'fail' | 'error'

export type RelationFinding = {
  code: string
  // The relation the finding is about.
  relation: string
  // Where the offending edge is written, as a `$.dotted.path`.
  at: string
  // For a cycle, the entities it runs through, in the order the walk
  // found them, closing back on the first. For a missing inverse, the
  // two ends and the relation that should have mirrored it.
  detail: string[]
}

export type RelationReport = {
  verdict: RelationVerdict
  findings: RelationFinding[]

  // WHY the graph could not be looked at, in the same finding shape
  // vet reports in (the review's finding F). `findings` is about the
  // GRAPH and stays that way; a document that does not stand up has no
  // graph to have findings about, and an `error` verdict used to
  // arrive with an empty list -- something is wrong, and nothing about
  // what. Present ONLY on an `error` verdict.
  errors?: VetFinding[]
}

export type RelationOptions = {
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory (trimCheck's precedent).
  path?: string
  // The include capability this document evaluates under (G5,
  // docs/trust.md). vet's precedent: the verb passes the profile the
  // caller asked for, and an absent option means today's default.
  trust?: TrustOptions
}


// One declared relation, as the document spells it.
type Declared = {
  name: string
  inverse?: string
  acyclic: boolean
}


// The entity an address names — everything before the first dot. An
// edge into `svc/auth.ports.http` is an edge to `svc/auth`: a relation
// holds between ENTITIES, and the path inside one says which part of it
// the link reaches.
function entityOf(addr: string): string {
  const dot = addr.indexOf('.')
  return dot < 0 ? addr : addr.slice(0, dot)
}


function declaredRelations(root: any): Declared[] {
  const rels = root?.peg?.relations
  if (true !== rels?.isMap) {
    return []
  }
  const out: Declared[] = []
  for (const name of Object.keys(rels.peg).sort(cmpCodePoint)) {
    const r: any = rels.peg[name]
    if (true !== r?.isMap) {
      continue
    }
    const inv: any = r.peg.inverse
    const acy: any = r.peg.acyclic
    out.push({
      name,
      inverse: true === inv?.isScalar && 'string' === typeof inv.peg
        ? inv.peg : undefined,
      acyclic: true === acy?.isScalar && true === acy.peg,
    })
  }
  return out
}


// The first cycle reachable from `start`, as the entities it runs
// through, or undefined. Depth-first with the path as the stack, and
// the successors visited in sorted order, so the cycle a report names
// is the same one in both ports.
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


// The relation checks for one document.
export function relationCheck(
  src: string, opts?: RelationOptions): RelationReport {
  const options = opts ?? {}
  const aontu = new Aontu(
    null == options.trust ? undefined : { trust: options.trust })
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
      errors: [failureFinding(ctx, options.path)],
    }
  }

  const declared = declaredRelations(root)
  if (0 === declared.length) {
    return { verdict: 'pass', findings: [] }
  }

  const edges = graphOf(root).edges
  const findings: RelationFinding[] = []

  // The edge set, indexed the two ways the checks read it.
  const byRelation = new Map<string, Edge[]>()
  const pairs = new Set<string>()
  for (const e of edges) {
    if ('' === e.from) {
      // An edge outside every entity has no source to be a relation OF.
      continue
    }
    const list = byRelation.get(e.key)
    if (undefined === list) {
      byRelation.set(e.key, [e])
    }
    else {
      list.push(e)
    }
    pairs.add(e.key + ' ' + e.from + ' ' + entityOf(e.to))
  }

  for (const rel of declared) {
    const mine = byRelation.get(rel.name) ?? []

    if (rel.acyclic) {
      const succ = new Map<string, string[]>()
      for (const e of mine) {
        const list = succ.get(e.from)
        const to = entityOf(e.to)
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
            relation: rel.name,
            at: at.at,
            detail: cycle,
          })
          break
        }
      }
    }

    if (undefined !== rel.inverse) {
      for (const e of mine) {
        const to = entityOf(e.to)
        if (!pairs.has(rel.inverse + ' ' + to + ' ' + e.from)) {
          findings.push({
            code: 'relation_inverse_missing',
            relation: rel.name,
            at: e.at,
            detail: [e.from, to, rel.inverse],
          })
        }
      }
    }
  }

  // SORTED, because a report is read by a machine that diffs it: by the
  // position the offending edge is written at, then by code. No third
  // key: one edge sits under one key and one key is one relation, so
  // two findings can share (at, code) only by being the same finding.
  // The sort is STABLE, and the relations were iterated in sorted
  // order, so what order remains is fixed anyway.
  findings.sort((a, b) =>
    cmpCodePoint(a.at, b.at) || cmpCodePoint(a.code, b.code))

  return {
    verdict: 0 === findings.length ? 'pass' : 'fail',
    findings,
  }
}
