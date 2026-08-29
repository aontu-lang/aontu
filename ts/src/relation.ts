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
import type { TrustOptions, Val } from './type'
import { graphOf } from './graph'
import type { Edge, EntityEntry, Graph } from './graph'
import { cmpCodePoint } from './keyorder'
import { unite } from './unify'


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
  // What the FAR END must satisfy, if the relation says. Absent when
  // the relation declares none, and when it declares `top` -- which
  // constrains nothing and would report nothing, so reading it as a
  // declaration would only cost a meet per edge.
  target?: Val
}


// The entity an address names — everything before the first dot. An
// edge into `svc_auth.ports.http` is an edge to `svc_auth`: a relation
// holds between ENTITIES, and the path inside one says which part of it
// the link reaches.
function entityOf(addr: string): string {
  const dot = addr.indexOf('.')
  return dot < 0 ? addr : addr.slice(0, dot)
}


// The node an address names, or undefined. The entity's own position
// comes from the graph (a merged entity sits at every position that
// declared it, and they hold the same value, so the FIRST in the
// graph's sorted list is as good as any and is the same one in both
// ports); the rest of the address walks into it, exactly as the
// address's own grammar says.
// NO GUARD ON THE LOOKUP OR THE WALK. An edge exists only because
// `refer()` RESOLVED its full address, so `find` cannot miss and no
// segment can fall off: an address that does not walk is
// `refer_unresolved` at unification and the document never reaches the
// graph (probed for a missing key, a scalar mid-path and an
// out-of-range index, in both ports). An unreachable `if` is a branch
// arm the ADR-002 gate counts and no marker suppresses, so the Go twin
// keeps its guards — where a nil would PANIC rather than propagate,
// and where the marker mechanism can carry them — and this one relies
// on optional chaining instead.
function addressed(
  root: any, graph: Graph, addr: string
): any {
  const dot = addr.indexOf('.')
  const name = dot < 0 ? addr : addr.slice(0, dot)
  const entry = graph.entities.find((e) => e.id === name) as EntityEntry
  const segs = entry.paths[0].slice(2).split('.')
    .concat(dot < 0 ? [] : addr.slice(dot + 1).split('.'))
  let node: any = root
  for (const seg of segs) {
    node = node?.peg?.[seg]
  }
  return node
}


// Does the far end satisfy the declared target? A TEST, never a flow:
// the check reports on a finished model and writing into it would be
// generation, which `relations` does not do (the same rule that keeps
// it from writing an author's inverse for them). So both sides are
// CLONED into a throwaway context and the meet is taken there; what
// the document holds is untouched either way.
//
// `refer(t)` is the other half of this and does flow, at the site. The
// two agree on what "satisfies" means -- a meet that is not a nil --
// which is what lets a relation declare once what every site would
// otherwise repeat.
// `root` is the DOCUMENT, not the node: a target lifted out of the
// model (`target: $.std.Service`) can still hold a reference that
// resolves against the document, and a probe rooted at the far end
// answers `no_path` for it -- which the worked example in
// test/spec/relation.tsv caught the moment this check existed.
function meets(
  aontu: any, root: any, node: any, target: any
): string | undefined {
  const ctx = aontu.ctx({ collect: true })
  ctx.root = root
  const out: any = unite(ctx, node.clone(ctx), target.clone(ctx), 'relation-target')
  if (true === out?.isNil) {
    return out.why as string
  }
  if (0 < ctx.err.length) {
    return ctx.err[0].why as string
  }

  // A MEET THAT LEAVES A HOLE IS NOT SATISFACTION. `target:
  // {kind: service, port: integer}` against a far end with no `port`
  // does not CONFLICT -- the meet simply carries `integer` into a key
  // that had none -- and a check that stopped at "no conflict" would
  // pass a far end that is missing half of what the relation demands.
  //
  // What `refer(t)` does at the site is the yardstick: it flows `t` in,
  // and the document then fails to generate, because `integer` is not a
  // value. So the same question is asked here -- can the far end still
  // generate once the target is met? -- and the answer is compared with
  // the far end ALONE, so a node that was already incomplete for its
  // own reasons is not blamed on the relation that points at it.
  // The REASON reported is the engine's own -- the code `refer(t)` at
  // the site would have raised -- rather than a name invented here.
  const probe = (v: any): string | undefined => {
    const gctx = aontu.ctx({ collect: true })
    gctx.root = root
    v.gen(gctx)
    return 0 === gctx.err.length ? undefined : (gctx.err[0].why as string)
  }
  const alone = probe(node.clone(aontu.ctx({ collect: true })))
  const met = probe(out)
  return undefined === alone && undefined !== met ? met : undefined
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
    const tgt: any = r.peg.target
    out.push({
      name,
      inverse: true === inv?.isScalar && 'string' === typeof inv.peg
        ? inv.peg : undefined,
      acyclic: true === acy?.isScalar && true === acy.peg,
      target: true === tgt?.isVal && true !== tgt.isTop ? tgt : undefined,
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
      errors: [failureFinding(ctx, options.path, root)],
    }
  }

  const declared = declaredRelations(root)
  if (0 === declared.length) {
    return { verdict: 'pass', findings: [] }
  }

  const graph = graphOf(root)
  const edges = graph.edges
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

    // TARGET: the far end IS what the relation says it is (the review's
    // finding J). The declaration used to be inert -- `target` was read
    // by nothing, on the reasoning that `refer(t)` already flows the
    // type in at the site. It does, and that is exactly why the
    // declaration was worth nothing: the site has to REPEAT it, and the
    // idiom that avoids repeating it (`refer($.std.Service)`) tripped
    // the fixpoint until §19 was fixed, so every real model wrote bare
    // `refer()` and a typed-endpoint declaration checked nothing.
    //
    // Reported per EDGE, not per entity: an entity reached by two
    // relations must satisfy both, and the report points at the link
    // that made the demand.
    if (undefined !== rel.target) {
      for (const e of mine) {
        // No guard on the node either, and for the same reason
        // `addressed` needs none: an unresolved link is a nil in the
        // tree, so this document would not have reached the graph.
        const why = meets(aontu, root, addressed(root, graph, e.to),
          rel.target)
        if (undefined !== why) {
          findings.push({
            code: 'relation_target_unmet',
            relation: rel.name,
            at: e.at,
            detail: [e.from, e.to, why],
          })
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
