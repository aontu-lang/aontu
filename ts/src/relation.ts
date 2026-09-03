/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'

// RELATION GRAPH VERDICTS (RELATIONS.0.md §3.3, replacing the G4
// phase 5 magic-key pass): acyclicity and inverse consistency over
// the edge set, DECLARED by the graph atoms -- `acyclic()` and
// `inverse(name)` conjoined at the field whose key is the predicate
// -- and decided AFTER unification, never by it.
//
// Why not in the lattice. Both properties are GLOBAL and NON-MONOTONE:
// an acyclic graph becomes cyclic when one more edge unifies in, and an
// inverse that is present becomes absent when the far side is narrowed.
// The lattice guarantee is that more information never falsifies what
// has been observed, so a constraint that could be true and then false
// is not a constraint the lattice may hold. These are facts about the
// finished model, so the atoms only REGISTER during unification
// (GraphAtomVal.register, onto ctx._reldecls), and the verdict lands
// at GENERATION -- the sizing atoms' model -- where no more
// information can arrive. The `relations` verb reports the same
// verdict from the same declarations: one decision, two surfaces.
//
// The old declaration channel -- a `relations:` key at the document
// root, read by name -- is GONE, discharging ADR-010's grandfather
// clause: the engine no longer knows any spellable key. The target
// half of the old declaration is `rel(t)`'s flow at the site, which
// checks by unifying rather than by a report-layer probe.

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
  // The relation the finding is about.
  relation: string
  // Where the offending edge is written, as a `$.dotted.path`.
  at: string
  // For a cycle, the node paths it runs through, in the order the walk
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

  // Extensions additionally read as text (the CLI's `--text-ext`).
  // Rides beside `trust` because it is the other half of what an
  // include may read.
  textExt?: string[]
}


// The first cycle reachable from `start`, as the node paths it runs
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


// The verdict itself, pure over what the evaluation produced: the
// registered declarations and the edge set. Shared by the generation
// hook (relationErrors) and the `relations` verb, so the two surfaces
// cannot disagree.
export function relationFindings(
  decls: Map<string, RelDecl>, graph: Graph
): RelationFinding[] {
  const findings: RelationFinding[] = []

  // The edge set, indexed the two ways the checks read it.
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

  // SORTED, because a report is read by a machine that diffs it: by the
  // position the offending edge is written at, then by code, then by
  // the detail (two inverse declarations on one predicate can flag one
  // edge twice). The sort is STABLE and the predicates were iterated
  // in sorted order, so what order remains is fixed anyway.
  findings.sort((a, b) =>
    cmpCodePoint(a.at, b.at) || cmpCodePoint(a.code, b.code)
    || cmpCodePoint(a.detail.join(' '), b.detail.join(' ')))

  return findings
}


// The generation hook (Aontu.generate, between unification success
// and value generation): each finding becomes a LOCATED evaluation
// error at the offending edge, exactly as an unmet sizing atom
// refuses at generation. Findings name node paths and positions the
// document spelled, so the walk to the site cannot miss.
export function relationErrors(ctx: any, root: any): void {
  const decls: Map<string, RelDecl> = ctx._reldecls
  if (0 === decls.size) {
    return
  }
  const findings = relationFindings(decls, graphOf(root))
  for (const f of findings) {
    let node: any = root
    for (const seg of f.at.slice(2).split('.')) {
      // Graph atoms hold the field's value -- possibly nested, one
      // atom carrying another -- and the path steps through them
      // exactly as the graph walk does.
      while (true === node?.isGraphAtom) {
        node = node.held
      }
      node = node?.peg?.[seg]
    }
    // No unwrap AFTER the walk: a finding's `at` names an edge
    // element, and an edge's element is a string -- an atom-wrapped
    // element mints no edge in the first place (the graph visit
    // descends atoms only at field values), so the walk cannot end on
    // an atom.
    ctx.adderr(makeNilErr(ctx, f.code, node, undefined, 'relate', {
      relation: f.relation,
      detail: f.detail.join(' -> '),
    }))
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
  if (0 === decls.size) {
    return { verdict: 'pass', findings: [] }
  }

  // NOR IS A DOCUMENT THAT CANNOT BE GENERATED. Unification can
  // succeed over a tree that still holds an unsettled disjunction --
  // more than one alternative admitted, which `disjunct_no_gen`
  // refuses at generation -- and the graph walk cannot read inside
  // one: the links in every alternative are invisible, so a mirror
  // the document plainly writes is missing from the edge set and
  // `inverse(n)` calls it missing. Generation is therefore asked
  // FIRST, on a collecting context of its own, and what it says is
  // the answer. Generation is what the atoms' verdict lands at, so
  // this is the same order the engine itself now runs in.
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
  }
}
