/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE TREE VIEW (docs/design/VIEWS.0.md): the dependency tree of an
// evaluated document's link graph, as deterministic text a golden diff
// can check. The reference implementation was the `tree` kind of
// use-cases/tools/diagram.js, pinned as goldens by use-case 16; this is
// that kind ported into the engine, with the goldens unchanged as the
// acceptance test.
//
// A view consumes a REPORT, never the Val tree: the edge set `graphOf`
// derives (ts/src/graph.ts), and nothing else. That is what keeps the
// two ports at parity -- Go's exported Val interface is five methods,
// and a Val-walking view would be TypeScript-only on the day it landed.
//
// Everything here is deterministic: nodes and edges are sorted by code
// point before emission, nothing iterates a map in insertion order, and
// no coordinate is computed. The Go twin is go/view.go; what the two
// ports must agree on -- the rendered text and the refusals -- is
// test/spec/view.tsv.

import { Aontu } from './aontu'
import { failureFinding } from './vet'
import type { VetFinding } from './vet'
import type { TrustOptions } from './type'
import { graphOf } from './graph'
import type { Edge } from './graph'
import { cmpCodePoint } from './keyorder'


export type ViewVerdict = 'rendered' | 'error'

// The kinds the verb draws. One so far; the design names more.
export type ViewKind = 'tree'

export type ViewReport = {
  verdict: ViewVerdict
  kind: ViewKind

  // The figure, as text. Present ONLY on `rendered` -- and present
  // EMPTY for a document with no edges, because an empty drawing of a
  // model with nothing to draw is the honest one.
  text?: string

  // WHY the figure could not be drawn, in vet's finding shape: a
  // document that does not stand up, a relation with no edges, a root
  // that names no node of the drawn graph. Present ONLY on `error`.
  errors?: VetFinding[]
}

export type ViewOptions = {
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory (relationCheck's precedent).
  path?: string
  // The include capability this document evaluates under
  // (docs/trust.md).
  trust?: TrustOptions
  // Draw the tree OVER THIS RELATION. Absent means every relation at
  // once, each branch naming its relation where more than one is drawn.
  relation?: string
  // Draw only these subtrees. Absent means every root the edge set
  // derives: a node nothing depends on.
  roots?: string[]
}


// One edge as drawn: a declared inverse pair collapsed to one edge, and
// the label the branch carries.
type Drawn = { from: string, to: string, label: string }

// The separator inside a composite map key: a character no path holds.
const SEP = '\u0000'


// THE EDGE SET WITH DECLARED INVERSE PAIRS COLLAPSED to one logical
// edge. `graphOf` reports every written position, so a relation with a
// declared inverse arrives twice -- once per direction -- and drawing it
// raw doubles every such relation.
//
// WHAT IS NOT COLLAPSED IS A MUTUAL RELATION: `a dependsOn b` and `b
// dependsOn a` are two facts under ONE key, and folding them into a
// single undirected edge erases the shortest cycle a model can have.
// The collapse is therefore per KEY PAIR rather than per node pair --
// two keys facing each other are an inverse, one key facing itself is
// a loop -- which is what makes `acyclic()`'s refusal drawable.
function collapse(edges: Edge[], relation: string | undefined): Drawn[] {
  // One directed edge per (from, to, key): the same link written at
  // several positions is one fact about the graph.
  const directed = new Map<string, Edge>()
  for (const e of edges) {
    directed.set(e.from + SEP + e.to + SEP + e.key, e)
  }

  const pairs = new Map<string, Edge[]>()
  for (const e of directed.values()) {
    const pair = [e.from, e.to].sort(cmpCodePoint).join(SEP)
    const group = pairs.get(pair)
    if (undefined === group) {
      pairs.set(pair, [e])
    }
    else {
      group.push(e)
    }
  }

  const out: Drawn[] = []
  for (const group of pairs.values()) {
    // ONE KEY WINS THE PAIR, and every edge written under it stands.
    // The named relation wins; otherwise the code-point-least key,
    // which is arbitrary but stable. Keeping every edge under the
    // winner is what preserves a MUTUAL relation, while the losing keys
    // are the declared inverses, implied by the winner and not drawn
    // again. With a relation named, its inverse is implied and naming
    // both would double the label; without one, every key is shown,
    // because picking silently would hide that two predicates are in
    // play.
    const keys = [...new Set(group.map((e) => e.key))].sort(cmpCodePoint)
    const named = undefined !== relation && keys.includes(relation)
    const winner = named ? (relation as string) : keys[0]
    const label = named ? winner : keys.join('/')
    for (const e of group) {
      if (e.key === winner) {
        out.push({ from: e.from, to: e.to, label })
      }
    }
  }

  // One winner per pair, so (from, to) is unique and orders the set.
  return out.sort((x, y) =>
    cmpCodePoint(x.from, y.from) || cmpCodePoint(x.to, y.to))
}


// THE SHORTEST SUFFIX THAT IS STILL UNIQUE, as a node's visible label.
//
// A node's name IS its path (ADR-014), and the paths in a real model
// are long: eight nodes labelled `$.catalog.domains.identity.services.auth`
// and its siblings is a correct diagram nobody can read. The label is
// therefore the fewest trailing segments that still tell this node from
// every other in the same drawing -- `auth` where that is unambiguous,
// `identity.auth` where it is not.
//
// The rule is a function of the node SET, so a drawing is deterministic
// while two drawings of different slices may label the same node
// differently -- which is correct, because uniqueness is a property of
// the set being drawn. The search is unbounded on purpose: at the full
// segment count the candidate is the whole path, which no other node
// shares, so it always ends.
function labelsOf(nodes: string[]): Map<string, string> {
  const segs = new Map<string, string[]>(
    nodes.map((n) => [n, n.replace(/^\$\.?/, '').split('.')]))
  const out = new Map<string, string>()
  for (const n of nodes) {
    const parts = segs.get(n) as string[]
    for (let take = 1; ; take++) {
      const cand = parts.slice(Math.max(0, parts.length - take)).join('.')
      const clash = nodes.some((m) => {
        const ms = segs.get(m) as string[]
        return m !== n &&
          ms.slice(Math.max(0, ms.length - take)).join('.') === cand
      })
      if (!clash) {
        out.set(n, cand)
        break
      }
    }
  }
  return out
}


// A relation that draws nothing is a typo, and is refused for the same
// reason a misspelled root is: an empty tree and a misspelled name are
// the same file on disk, so the one that means nothing must not be
// renderable. NOT `refer_unresolved`: a relation name is not an
// address.
function relationFinding(relation: string, have: string[]): VetFinding {
  return {
    code: 'view_relation_unknown',
    class: 'reference',
    severity: 'error',
    path: '$',
    message: `${relation} names no relation with edges in this document.`,
    sites: [],
    note: 'relations with edges: ' + have.join(', '),
  }
}


// A root is a node of the DRAWN graph, the rule the node set follows:
// a path that exists in the document but takes no part in the relation
// is not in the drawing, and a root naming it is refused rather than
// drawn as an empty tree.
function rootFinding(
  root: string, relation: string | undefined, nodes: string[]): VetFinding {
  return {
    code: 'refer_unresolved',
    class: 'reference',
    severity: 'error',
    path: '$',
    message: `${root} is not a node of the ` +
      `${undefined === relation ? '' : relation + ' '}graph.`,
    sites: [],
    ...(0 === nodes.length ? {} : {
      note: 'nodes in the graph: ' + nodes.join(', '),
    }),
  }
}


type Kid = { to: string, label: string }


// THE DEPENDENCY TREE: the drawn edges, walked from each root, indented.
//
// A dependency graph is a DAG and not a tree -- two modules may share a
// dependency, and drawing that shared node once under each parent is
// what makes `cargo tree` and `npm ls` readable rather than
// exponential. So this is a SPANNING WALK with two honest marks: `(*)`
// where a subtree is elided because the node was expanded earlier, and
// `(cycle)` where an edge closes a loop. The first is routine in a
// correct model -- a diamond is good engineering, not a fault. The
// second cannot arise from a model whose relation declares
// `acyclic()`, and is drawn rather than thrown because a renderer that
// hangs on a hostile input is a renderer that cannot be pointed at one.
//
// Which nodes are roots is DERIVED, not asked for: a root is a node
// nothing depends on. `roots` overrides that to draw named subtrees.
// The order of everything -- roots, children, the choice of which
// occurrence of a shared node is the expanded one -- follows the label
// sort, so the drawing is a function of the model alone.
function drawTree(
  all: Drawn[], relation: string | undefined, roots: string[]
): { text?: string, errors?: VetFinding[] } {
  // With a relation named, the tree is OVER THAT RELATION. A node-link
  // diagram can label each edge and so draw every relation at once; a
  // tree cannot without becoming unreadable, and walking two relations
  // as though they were one would draw a containment the model does
  // not state.
  const kept = undefined === relation
    ? all : all.filter((e) => e.label === relation)

  if (undefined !== relation && 0 === kept.length && 0 < all.length) {
    const have = [...new Set(all.flatMap((e) => e.label.split('/')))]
      .sort(cmpCodePoint)
    return { errors: [relationFinding(relation, have)] }
  }

  // The node set is what the drawn relation CONNECTS. A root naming
  // anything else is a typo, and it is refused rather than drawn.
  const ns = new Set<string>()
  for (const e of kept) {
    ns.add(e.from)
    ns.add(e.to)
  }
  const nodes = [...ns].sort(cmpCodePoint)
  const lab = labelsOf(nodes)
  const label = (n: string): string => lab.get(n) as string

  const kids = new Map<string, Kid[]>(nodes.map((n) => [n, []]))
  for (const e of kept) {
    (kids.get(e.from) as Kid[]).push({ to: e.to, label: e.label })
  }
  for (const list of kids.values()) {
    list.sort((x, y) => cmpCodePoint(label(x.to), label(y.to)))
  }

  // The relation is named on the branch only where more than one is
  // drawn. Naming the single relation on every line of a tree that has
  // exactly one is noise; leaving it off where there are two would
  // hide which edge was walked.
  const many = 1 < new Set(kept.map((e) => e.label)).size
  const byLabel = (a: string, b: string): number =>
    cmpCodePoint(label(a), label(b))

  let named: string[]
  if (0 < roots.length) {
    const missing = roots.filter((r) => !ns.has(r))
    if (0 < missing.length) {
      return { errors: missing.map((r) => rootFinding(r, relation, nodes)) }
    }
    named = [...new Set(roots)].sort(byLabel)
  }
  else {
    // A root is a node nothing depends on. A SELF-EDGE does not make a
    // node depended upon for this purpose: a module that names itself
    // would otherwise stop being a root and take its whole subtree out
    // of the drawing.
    const depended = new Set(
      kept.filter((e) => e.to !== e.from).map((e) => e.to))
    named = nodes.filter((n) => !depended.has(n)).sort(byLabel)
  }

  const out: string[] = []
  const expanded = new Set<string>()

  const draw = (root: string): void => {
    if (0 < out.length) {
      out.push('')
    }
    out.push(label(root))
    expanded.add(root)

    // ITERATIVE, with the ancestor chain carried as a set that is added
    // to on the way down and removed from on the way up. A recursive
    // walk is O(depth) stack frames and a deep dependency chain is a
    // real shape, so the drawing of a model must not depend on how deep
    // the interpreter lets it go.
    const chain = new Set<string>([root])
    const stack: { node: string, prefix: string, at: number }[] =
      [{ node: root, prefix: '', at: 0 }]
    while (0 < stack.length) {
      const frame = stack[stack.length - 1]
      const list = kids.get(frame.node) as Kid[]
      if (frame.at >= list.length) {
        chain.delete(frame.node)
        stack.pop()
        continue
      }
      const edge = list[frame.at++]
      const last = frame.at === list.length
      const loop = chain.has(edge.to)
      const seen = expanded.has(edge.to)
      const grown = 0 < (kids.get(edge.to) as Kid[]).length
      out.push(frame.prefix + (last ? '└── ' : '├── ')
        + label(edge.to)
        + (many ? ' (' + edge.label + ')' : '')
        + (loop ? ' (cycle)' : (seen && grown ? ' (*)' : '')))
      if (loop || seen) {
        continue
      }
      expanded.add(edge.to)
      chain.add(edge.to)
      stack.push({
        node: edge.to,
        prefix: frame.prefix + (last ? '    ' : '│   '),
        at: 0,
      })
    }
  }

  for (const root of named) {
    draw(root)
  }

  // EVERY NODE IS DRAWN. A component whose nodes all depend on each
  // other has no node nothing depends on, so the derived roots miss it
  // entirely -- and a graph with roots elsewhere would drop it in
  // silence, which is the one thing a drawing must not do. The
  // least-labelled node left is taken as a root of its own, until
  // nothing is left. An explicitly named root is a request for one
  // subtree and is left alone.
  if (0 === roots.length) {
    for (const n of nodes) {
      if (!expanded.has(n)) {
        draw(n)
      }
    }
  }

  return { text: out.join('\n') }
}


// The tree view of one document.
export function viewTree(src: string, opts?: ViewOptions): ViewReport {
  const options = opts ?? {}
  const aontu = new Aontu(
    null == options.trust ? undefined : { trust: options.trust })
  const ctx = aontu.ctx({ collect: true })
  const parseOpts = null == options.path ? undefined : { path: options.path }
  const root: any = aontu.unify(src, parseOpts, ctx)

  // A document that does not stand up has no graph to draw: the errors
  // it already has are the answer.
  if (0 < ctx.err.length || true === root?.isNil) {
    return {
      verdict: 'error',
      kind: 'tree',
      errors: [failureFinding(ctx, options.path, root)],
    }
  }

  // An empty relation name is no relation, so both ports read it as
  // "every relation" rather than one that names nothing.
  const relation = options.relation || undefined
  const drawn = drawTree(
    collapse(graphOf(root).edges, relation), relation, options.roots ?? [])
  return undefined === drawn.errors
    ? { verdict: 'rendered', kind: 'tree', text: drawn.text }
    : { verdict: 'error', kind: 'tree', errors: drawn.errors }
}
