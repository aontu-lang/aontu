/* Copyright (c) 2025 Richard Rodger, MIT License */


import type { Val } from './type'

import { cmpCodePoint } from './keyorder'


export type Edge = {
  from: string
  key: string
  to: string
  // Where the link is, as a `$.dotted.path`, for a report to point at.
  at: string
  hidden?: true
}

export type Graph = {
  edges: Edge[]
  disjunct?: string[]
}

// What the graph atoms met at one key name declare of its relation.
export type RelDecl = {
  acyclic?: boolean
  inverses: Set<string>
}


const formatPath = (path: string[]): string =>
  0 === path.length ? '$' : '$.' + path.join('.')


// Digits-only segments are list indices, which is exactly how the rest
// of the engine spells them.
const isIndex = (seg: string): boolean => /^[0-9]+$/.test(seg)


const PREDICATE_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/


const cut = (at: string[]): { from: string, key: string } => {
  let i = at.length - 1
  for (; 0 <= i && isIndex(at[i]); i--) { }
  return 0 > i
    ? { from: formatPath([]), key: '' }
    : { from: formatPath(at.slice(0, i)), key: at[i] }
}


// The arms generation writes: the preference of the lowest rank, or every arm, which it writes only alike.
const picked = (arms: any[]): any[] => {
  const prefs = arms.filter((arm) => true === arm.isPref)
  return 0 === prefs.length ? arms :
    [prefs.reduce((best, p) => p.rank < best.rank ? p : best)]
}


function walk(root: Val, written: boolean) {
  const edges: Edge[] = []
  const disjunct: string[] = []
  const decls = new Map<string, RelDecl>()
  const sites = new Map<string, any>()

  // ONE WALK, with `undecided` saying which side of the disjunction it is on:
  // below an unresolved disjunction every link is a position the
  // document has not decided, and nothing there is an edge. Read as
  // `written`, the arms generation picks are decided and no other is read.
  const visit = (
    node: any, path: string[], ancestors: Set<any>, hidden: boolean,
    undecided: boolean, under: string[] | undefined
  ): void => {
    if (null == node || true !== node.isVal || ancestors.has(node)) {
      return
    }

    hidden = hidden || true === node.mark?.hide

    // A graph atom declares where it is met, as a link is an edge: never
    // below an unresolved disjunction.
    const name = path[path.length - 1] ?? ''
    if (null != node.reldecl && !undecided && PREDICATE_NAME.test(name)) {
      const d = decls.get(name) ?? { inverses: new Set<string>() }
      d.acyclic = d.acyclic || node.reldecl.acyclic
      node.reldecl.inverses.forEach((k: string) => d.inverses.add(k))
      decls.set(name, d)
    }

    const link = node.link
    if (null != link) {
      if (undecided) {
        disjunct.push(formatPath(path))
      }
      else {
        const { from, key } = true === node.relroot || undefined === under
          ? cut(path)
          : { from: formatPath(under.slice(0, -1)), key: under[under.length - 1] }
        const edge: Edge = { from, key, to: link, at: formatPath(path) }
        if (hidden) {
          edge.hidden = true
        }
        edges.push(edge)
        sites.set(edge.at, sites.get(edge.at) ?? node)
      }
    }

    if (true === node.isConjunct && Array.isArray(node.peg)) {
      ancestors.add(node)
      for (const term of node.peg) {
        visit(term, path, ancestors, hidden, undecided, under)
      }
      ancestors.delete(node)
    }

    if (true === node.isDisjunct && Array.isArray(node.peg)) {
      ancestors.add(node)
      for (const arm of written ? picked(node.peg) : node.peg) {
        visit(arm, path, ancestors, hidden, undecided || !written, under)
      }
      ancestors.delete(node)
    }

    if (written && true === node.isPref) {
      ancestors.add(node)
      visit(node.peg, path, ancestors, hidden, undecided, under)
      ancestors.delete(node)
    }

    if ((true === node.isMap || true === node.isList) && null != node.peg) {
      // Canon writes `relate()` at this field, so the field names the edges.
      if (true === node.relroot) {
        under = 0 < path.length && PREDICATE_NAME.test(path[path.length - 1])
          ? path : undefined
      }
      ancestors.add(node)
      for (const k of Object.keys(node.peg)) {
        visit(node.peg[k], [...path, k], ancestors, hidden, undecided, under)
      }
      ancestors.delete(node)
    }
  }

  visit(root, [], new Set(), false, false, undefined)
  edges.sort((a, b) => cmpCodePoint(a.at, b.at))
  return { edges, disjunct, decls, sites }
}


export function graphOf(root: Val): Graph {
  const { edges, disjunct } = walk(root, false)

  if (0 < disjunct.length) {
    return { edges, disjunct: [...new Set(disjunct)].sort(cmpCodePoint) }
  }
  return { edges }
}


export function writtenOf(root: Val): {
  graph: Graph, decls: Map<string, RelDecl>, sites: Map<string, any>
} {
  const { edges, decls, sites } = walk(root, true)
  return { graph: { edges }, decls, sites }
}


// The relation declarations: every graph atom the finished value holds,
// read by the key it is met at, hidden or not.
export function declsOf(root: Val): Map<string, RelDecl> {
  return walk(root, false).decls
}
