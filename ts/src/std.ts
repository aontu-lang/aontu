/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE BUNDLED VOCABULARY (G4 phase 4,
// docs/capability-review/g4-identity-relations.md): `@"std/system"` is
// served from the engine itself — no filesystem, no package resolution
// — so a document may use it under every include capability except
// `none`, and the hermeticity posture is not widened by a source that
// never leaves the process.
//
// The TEXT is the shared artifact: go/std.go carries the same bytes,
// and test/spec/std-system.tsv pins its canon and its canon-hash in
// both engines, so the two copies cannot drift without a red suite.
// It carries no backtick for that reason: one string literal per port,
// and Go's raw string has no escape.

const STD_SYSTEM = `# std/system --- the SYSTEM VOCABULARY (G4 phase 4). Ports, components
# and relations need no syntax: they are schemas. Everything here is
# ordinary unification --- conjunction, spreads, marks, defaults ---
# so the vocabulary costs the language nothing, and an author who wants
# a different one writes it the same way.
#
# EXPERIMENTAL until the distribution layer can version it by
# canon-hash. Entity ids deliberately do NOT embed versions: fusing
# identity and version makes "v1 and v2 describe the same entity"
# inexpressible.

std: {

  # One end of a connection.
  Port: type({
    direction: *in | out | inout
    protocol?: string
  })

  # A node with ports. Where a Component sits in the tree is what it
  # is a component OF -- containment is the document's own structure
  # and needs no mark of its own.
  Component: type({
    ports?: {&: $.std.Port}
  })

  # A component that is a service. Written out rather than as
  # $.std.Component & {kind: service}: a reference from one member of
  # this file to another does not survive being INCLUDED into a
  # document (the marks the include carries make the referring member
  # unusable), so the vocabulary states each schema on its own.
  Service: type({
    kind: service
    ports?: {&: $.std.Port}
  })

  # (The Relation schema that used to sit here is retired with the
  # relations: magic key, RELATIONS.0.md P2: a relation is declared
  # by the graph atoms at its field -- rel(t) & acyclic() &
  # inverse(name) -- and the target half is rel(t)'s flow.)
}
`


const STD_VIEW = `# std/view --- the FIGURE VOCABULARY (VIEWS.0.md, "6. The view
# document"). A view document declares its figures as data, and a
# declaration is just a map: this is the schema for one, so a typo is
# refused where every other mistake in an aontu document is refused --
# at evaluation, by unification -- rather than by the verb that reads
# it afterwards.
#
#   @"std/view"
#   @"./system.aon"
#
#   views: {&: $.view.Figure} & {
#     arch: {kind: matrix, order: partition, out: "docs/arch.dsm.txt"}
#   }
#
# The keys ARE the view options: the command-line flags without the
# dashes, one vocabulary for the CLI, the library and the file. The
# poset is not among the kinds, because a view document declares
# figures of the ONE document it includes and the poset compares
# several.
#
# EXPERIMENTAL until the distribution layer can version it by
# canon-hash. This file carries no backtick: it is one string literal
# per port, and Go raw strings have no escape.

view: {

  # One declared figure. The kind says what to draw and out says where
  # it belongs; everything else narrows the drawing, and each option
  # belongs to the kinds that read it.
  Figure: type({
    kind: doc | lattice | tree | matrix | graph | layer | sets | layers
      | ladder
    out: string

    # Every kind.
    as?: text | mermaid | dot | er | svg
    at?: string
    maxRows?: integer & min(0)

    # doc: how many levels of key to draw.
    depth?: integer & min(0)

    # tree, matrix, layer: the relation drawn. graph: the predicates
    # kept. tree: the subtrees drawn.
    relation?: string
    relations?: [&: string]
    roots?: [&: string]

    # matrix.
    order?: canon | partition
    closure?: boolean

    # graph, layer.
    groupBy?: string
    label?: string
    layers?: [&: string]
    edges?: upward | all | none

    # sets, layers.
    sets?: string
    member?: string
    universe?: string
    minDegree?: integer & min(0)
    maxCols?: integer & min(0)
    minSize?: integer & min(0)
  })
}
`


export const STD_SOURCES: Record<string, string> = {
  'std/system': STD_SYSTEM,
  'std/system.aon': STD_SYSTEM,
  'std/view': STD_VIEW,
  'std/view.aon': STD_VIEW,
}
