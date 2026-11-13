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


export function graphOf(root: Val): Graph {
  const edges: Edge[] = []
  const disjunct: string[] = []

  // ONE WALK, with `undecided` saying which side of ADR-007 it is on:
  // below an unresolved disjunction every link is a position the
  // document has not decided, and nothing there is an edge.
  const visit = (
    node: any, path: string[], ancestors: Set<any>, hidden: boolean,
    undecided: boolean, under: string[] | undefined
  ): void => {
    if (null == node || true !== node.isVal || ancestors.has(node)) {
      return
    }

    hidden = hidden || true === node.mark?.hide

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
      }
    }

    // A graph atom is TRANSPARENT here (RELATIONS P2): it carries the
    // field's value at the field's own position, and the graph is about
    // the value.
    if (true === node.isGraphAtom && undefined !== node.held) {
      visit(node.held, path, ancestors, hidden, undecided, under)
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
      for (const arm of node.peg) {
        visit(arm, path, ancestors, hidden, true, under)
      }
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

  if (0 < disjunct.length) {
    return { edges, disjunct: [...new Set(disjunct)].sort(cmpCodePoint) }
  }
  return { edges }
}
