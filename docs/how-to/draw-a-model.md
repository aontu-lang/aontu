---
description: Draw a model as a dependency tree, matrix or architecture layers with aontu view, and gate the committed figures in CI.
group: query-change
order: 60
---

# Draw a model

A model that says which service depends on which, or which module sits
in which layer, already holds the picture. `aontu view` draws it from
the evaluated document, so the figure is a fact about the model rather
than a diagram someone kept in step with it.

Here is a `system.aon` with three services and a dependency relation:

<!-- test: scenario draw -->
<!-- test: file system.aon -->
```aontu
spec: hide({
  Service: {
    tier: "edge" | "core"
    dependsOn?: rel($.spec.Service) & acyclic() & [&: refer($.spec.Service)]
  }
})

web: $.spec.Service & {tier: "edge", dependsOn: [path($.api)]}
api: $.spec.Service & {tier: "core", dependsOn: [path($.store)]}
store: $.spec.Service & {tier: "core"}
```

The tree is the default kind. It derives its roots—a root is a node
nothing depends on—and prints nothing else, so a redirect is a golden
file:

<!-- test: run -->
```sh
$ aontu view tree --relation dependsOn system.aon
web
└── api
    └── store
```

The same edges as a **dependency-structure matrix**, in partition
order, mark a cell where the row depends on the column. A perfect
lower triangle is the acyclicity proof in the picture's own shape, and
the footer counts the cells above the diagonal:

<!-- test: run -->
```sh
$ aontu view matrix --relation dependsOn --order partition system.aon
        1 2 3
store 1 \ . .
api   2 X \ .
web   3 . X \
# above-diagonal direct cells: 0
```

## Draw the architecture layers

Any field of a node can be the band it belongs to. `--group-by` names
it, and the band order is derived from the relation rather than
declared, so it follows the model:

<!-- test: run -->
```sh
$ aontu view layer --relation dependsOn --group-by tier system.aon
+------------------+
| edge  web        |
+------------------+
| core  api  store |
+------------------+
# dependsOn: 1 downward, 1 sideways, 0 upward
```

The footer is the layering rule, counted: `web -> api` crosses a band
and `api -> store` stays inside one. An **upward** edge—one that
points back up the bands—is the violation, and is named under the
figure. `--edges all` draws the whole relation over the bands
instead, which is what a reader tracing one service's dependencies
wants.

## Get an SVG for a web page

The kinds whose text form is a grid of character cells—`tree`,
`matrix`, `layer`, `sets` and `layers`—also render as a standalone
SVG that carries its own style block and takes its colours from CSS
variables, so a page can theme it:

<!-- test: run -->
```sh
$ aontu view tree --relation dependsOn --as svg --out tree.svg system.aon
$ echo $?
0
```

The node-link kinds (`graph`, `ladder`, `poset`) render as Mermaid or
DOT, which have renderers of their own.

## Gate the figures in CI

A committed figure that nobody re-draws is a stale picture. Write the
figures down as data, in a `views.aon` that includes the model:

<!-- test: file views.aon -->
```aontu
@"std/view"
@"./system.aon"

views: {&: $.view.Figure} & {
  tree: {kind: tree, relation: dependsOn, out: "tree.txt"}
  matrix: {kind: matrix, relation: dependsOn, order: partition, out: "matrix.txt"}
  layers: {kind: layer, relation: dependsOn, groupBy: tier, as: svg, out: "layers.svg"}
}
```

`views` is your key, not one the engine knows, so `--views` says where
to look. Each declaration's keys are the view options—the flags
without the dashes—and `@"std/view"` is the schema for one, so a
misspelled option or a kind that is not a kind is refused when the
document is evaluated.

Draw them all from one evaluation, then gate them:

<!-- test: run -->
```sh
$ aontu view --views '$.views' views.aon
$ aontu view --views '$.views' --check views.aon
$ echo $?
0
```

`--check` writes nothing and exits `1` naming every figure that
differs. Each `out` is resolved against the view document's own
directory, so the gate passes from any working directory; the
directory it names must already exist, as it must for `--out`. Nothing
is written unless every figure rendered—N figures of one model are
only meaningful together.

## What the figure could not draw

Every run reports its losses on stderr, so a figure written to a file
still tells the reader what it left out: a `hide()`-marked edge, a
`--group-by` field a node does not have, a cycle that blocks the
partition order, columns elided by `--max-cols`. `--strict` turns any
of that into exit `1`, and `--max-rows` refuses a figure too big to
read rather than truncating it.

## Related

- [`aontu view`](../reference-api.md#aontu-view)—every kind, every
  option, the loss codes and the exit codes.
- [Query a path](query-a-path.md)—read one node instead of drawing
  the whole shape.
- [Explain a value](explain-a-value.md)—why one value is what it is,
  which the `ladder` kind draws.
