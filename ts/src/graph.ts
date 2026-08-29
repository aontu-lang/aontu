/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE DERIVED STRUCTURES (G4 phase 3,
// docs/capability-review/g4-identity-relations.md): an evaluated
// document has, besides its value, a GRAPH — an entity index (id → the
// tree paths that hold it) and an edge set (the checked links, each
// from one entity to one address).
//
// G4's deliverable is that these exist and are DETERMINISTIC. What is
// built on them — impact analysis ("what reaches svc_auth?"),
// reachability, context-window-sized entity slices — is a traversal,
// and its exposure as verbs and projections belongs to G7. Relation
// properties (acyclicity, inverse consistency) are G4 phase 5's, and
// consume exactly this edge set.

import type { Val } from './type'

import { cmpCodePoint } from './keyorder'


export type EntityEntry = {
  // The id, as `id(name)` spelled it.
  id: string
  // Every tree path that holds this entity, in code-point order. More
  // than one is the normal case: the merge puts the entity's value at
  // every position that declared it.
  paths: string[]
}

export type Edge = {
  // The entity the link is INSIDE — the nearest identified ancestor,
  // or '' for a link outside every entity. This is the
  // entity/component distinction: a node without an id is a component
  // of its nearest identified ancestor.
  from: string
  // The RELATION: the nearest map key on the way down from the entity,
  // so a link inside a list (`dependsOn: [&: refer(), svc_auth]`) is an
  // edge under `dependsOn` rather than under `0`.
  key: string
  // The address, as the link spells it.
  to: string
  // Where the link is, as a `$.dotted.path`, so a report can point at
  // it.
  at: string
}

export type Graph = {
  entities: EntityEntry[]
  edges: Edge[]
}


const formatPath = (path: string[]): string =>
  0 === path.length ? '$' : '$.' + path.join('.')


// The nearest map key on the path below an entity: list indices are
// positions within a relation, not relations of their own. Digits-only
// segments are the indices, which is exactly how the rest of the engine
// spells them.
const relationKey = (tail: string[]): string => {
  for (let i = tail.length - 1; 0 <= i; i--) {
    if (!/^[0-9]+$/.test(tail[i])) {
      return tail[i]
    }
  }
  return ''
}


// The graph of an evaluated tree. Walks POSITIONS, not values: two
// positions of one entity share a value object after the merge, so a
// walk guarded by object identity would find the entity once and miss
// every other place it is declared. The guard is therefore the
// ancestor chain — which is what a cycle actually is.
export function graphOf(root: Val): Graph {
  const byId = new Map<string, string[]>()
  const edges: Edge[] = []

  const visit = (
    node: any, path: string[], entity: string, tail: string[],
    ancestors: Set<any>
  ): void => {
    if (null == node || true !== node.isVal || ancestors.has(node)) {
      return
    }

    let inside = entity
    let below = tail
    const name = node.entity
    if (null != name) {
      let paths = byId.get(name)
      if (undefined === paths) {
        paths = []
        byId.set(name, paths)
      }
      paths.push(formatPath(path))
      // A nested entity is not a component of the one above it: the
      // key path restarts at the identified node.
      inside = name
      below = []
    }

    const link = node.link
    if (null != link) {
      edges.push({
        from: inside,
        // A rel()-minted link carries its PREDICATE -- the key the
        // rel() sat on, declared in the schema -- and that beats the
        // path inference, which answered wrongly for map-valued
        // relations (it named the inner label, not the relation).
        // refer()-minted links keep the inference until P3 retires
        // them.
        key: (node.relkey as string) ?? relationKey(below),
        to: link,
        at: formatPath(path),
      })
    }

    if ((true === node.isMap || true === node.isList) && null != node.peg) {
      ancestors.add(node)
      for (const k of Object.keys(node.peg)) {
        visit(node.peg[k], [...path, k], inside, [...below, k], ancestors)
      }
      ancestors.delete(node)
    }
  }

  visit(root, [], '', [], new Set())

  // DETERMINISTIC by construction, not by luck: ids in code-point
  // order, each id's paths in code-point order, edges by the position
  // they are written at (which is unique — one link, one place).
  const entities: EntityEntry[] = [...byId.keys()]
    .sort(cmpCodePoint)
    .map((id) => ({ id, paths: (byId.get(id) as string[]).sort(cmpCodePoint) }))

  edges.sort((a, b) => cmpCodePoint(a.at, b.at))

  return { entities, edges }
}
