# 16 — module deps: a layered codebase, drawn as a dependency tree

A codebase's own module graph: twelve modules across four layers
(`app`, `feature`, `core`, `util`), twenty-one dependencies, and one
architecture rule, that a module never depends on a module above it.
Each module is an entity addressed by its tree path; `dependsOn` is a
declared relation with its written-out inverse `usedBy`; and the
layering rule is a shape that `rel(t)` flows into the far end of every
edge, so an illegal edge is an ordinary failed unification. Two views
are drawn from the same edges: a dependency tree and a
dependency-structure matrix.

## The codebase, drawn

The tree below is `aontu view tree --relation dependsOn model.aon`,
pinned as a golden by `check.sh`. Each figure here is pinned twice: as
the text the verb draws by default, and as the SVG `--as svg` draws
from the same character grid, which is what the site shows.

![The dependency tree, drawn: three roots, each module one row, the repeats marked](expected/diagram-tree.svg)

```
cli
├── billing
│   ├── auth
│   │   ├── bytes
│   │   └── http
│   │       ├── bytes
│   │       └── log
│   │           └── bytes
│   ├── clock
│   └── store
│       ├── clock
│       └── log (*)
└── reports
    ├── log (*)
    └── store (*)

server
├── billing (*)
├── catalog
│   ├── http (*)
│   └── store (*)
└── http (*)

worker
├── reports (*)
└── store (*)
```

**Three roots, because nothing depends on them.** The renderer derives
the roots from the edge set rather than being told: a root is a module
no other module names, which for a codebase is exactly its
deployables. `cli`, `server` and `worker` are what ship.

**`(*)` is a subtree already drawn.** A dependency graph is a DAG and
not a tree (`store` is reached from four modules), so a full
expansion would print the same subtree once per path into it, and the
depth would carry no information. The first occurrence in sort order
is expanded and every later one is marked, which is what `cargo tree`
and `npm ls` do, and for the same reason. Nine edges here land on a
subtree that is already drawn. A repeat with nothing under it, like
`bytes`, hides nothing and is drawn plain.

The same edges as a dependency-structure matrix, `aontu view matrix
--relation dependsOn --order partition --closure model.aon`, pinned as
`expected/diagram-matrix.txt`. A mark at (row, column) means the row
module depends on the column module: `X` directly, `+` through others.
In partition order an acyclic relation is a perfect lower triangle, and
the footer counts the cells above the diagonal: zero is the acyclicity
proof, in the picture's own shape.

![The dependency-structure matrix, drawn: twelve rows in partition order, direct cells filled, the closure tinted, the diagonal ruled](expected/diagram-matrix.svg)

```
                             1 1 1
           1 2 3 4 5 6 7 8 9 0 1 2
bytes    1 \ . . . . . . . . . . .
clock    2 . \ . . . . . . . . . .
log      3 X . \ . . . . . . . . .
http     4 X . X \ . . . . . . . .
store    5 + X X . \ . . . . . . .
auth     6 X . + X . \ . . . . . .
catalog  7 + + + X X . \ . . . . .
reports  8 + + X . X . . \ . . . .
billing  9 + X + + X X . . \ . . .
worker  10 + + + . X . . X . \ . .
cli     11 + + + + + + . X X . \ .
server  12 + + + X + + X . X . . \
# above-diagonal direct cells: 0
```

The tree answers "what does `cli` pull in, and how deep"; the matrix
answers "what is the shape of the whole surface". Ghoniem, Fekete and
Castagliola (InfoVis 2004) is the empirical result behind preferring
the matrix past about twenty vertices, and Sangal et al. (OOPSLA 2005)
is the software-dependency application. At twelve modules both are
readable, which is why the case draws both.

**The architecture layers**, the drawing every layered codebase has a
hand-made copy of, is `aontu view layer --relation dependsOn --group-by
layer model.aon`, pinned as `expected/diagram-layer.txt`:

![The architecture layers, drawn: four bands, app on top, each module a box in its band](expected/diagram-layer.svg)

```
+------------------------------------+
| app      cli  server  worker       |
+------------------------------------+
| feature  billing  catalog  reports |
+------------------------------------+
| core     auth  http  store         |
+------------------------------------+
| util     bytes  clock  log         |
+------------------------------------+
# dependsOn: 19 downward, 2 sideways, 0 upward
```

`--edges all` draws the relation over the bands, which is the figure a
reader tracing one module's dependencies wants; the default draws the
upward edges alone, because the bands already say which way the rest
of them go and only a violation needs pointing at.

![The architecture layers with every dependency drawn over them: four bands, arrows from each module down to the ones it depends on](expected/diagram-layer-edges.svg)

The band order is not declared to the verb: it is the partition order
of the layer-level graph (a layer depends on the layers its modules
depend on), reversed so the layer nothing depends on is on top, which
is why it agrees with `spec.aon` without reading it. The footer is the
layering rule, counted -- `auth -> http` and `store -> log` are the two
sideways edges the rule allows -- and an upward edge, were the model
to admit one, would be named under it. A model with an upward edge has
a cyclic layer graph and no derivable order; `--layers
app,feature,core,util` names it then.

## The layering rule is a shape

The architecture invariant is that a module never depends on a module
above it. `app` may use anything, `feature` may use feature and below,
`core` may use core and below, `util` may use only util. A sideways
edge is legal (`auth` calling `http` is ordinary engineering), and
what stops a sideways edge from closing a loop is `acyclic()`.

The whole rule is four disjunctions, from `spec.aon`:

    AppDep:     { kind: mod, layer: "app" | "feature" | "core" | "util" }
    FeatureDep: { kind: mod, layer: "feature" | "core" | "util" }
    CoreDep:    { kind: mod, layer: "core" | "util" }
    UtilDep:    { kind: mod, layer: "util" }

and one line per layer joining a module to the shape its dependencies
must have:

    Core: $.spec.Mod & { layer: "core", dependsOn?: rel($.spec.CoreDep) }

`rel(t)` flows `t` into every target, so a `dependsOn` edge from a
core module carries `layer: "core" | "util"` to the far end. A module
that says `layer: "feature"` cannot meet it. There is no linter here
and no second pass: the illegal edge is a failed unification, refused
at generation with both sides named.

```
[aontu/empty]: Cannot unify values at path $.mods.auth.dependsOn.0.usedBy.0.dependsOn.layer
 Cannot unify value: "core"|"util" with value: "feature"
```

The rule holds in either spelling: `bad/upward.aon` writes the
offending module first, `bad/upward-swapped.aon` writes its target
first, and both refuse.

## The figures are declared, not scripted

Every figure this case commits is declared in `views.aon`, an ordinary
document that includes the model:

```
views: {
  matrix: {
    kind: matrix
    relation: dependsOn
    order: partition
    closure: true
    out: "expected/diagram-matrix.txt"
  }
  ...
}
```

`aontu view --views '$.views' --check views.aon` draws all eight from
one evaluation and gates them together, which is what `check.sh` runs.
A declaration's keys are the view options -- the command-line flags
without the dashes -- so the file says exactly what the verb would have
been asked, in a form the review reads and CI enforces. `views` is this
document's own key: the engine is told where to look and knows nothing
about the name.

## The model

`spec.aon` is the vocabulary and the rule; `modules.aon` is the
codebase; `model.aon` joins them. The relation is declared once, at
its field:

    dependsOn?: rel($.spec.ModShape) & acyclic() & inverse(usedBy)
    usedBy?: rel($.spec.ModShape)

- `rel(t)` — the field's entries are checked tree addresses, and `t`
  flows into every target. Addresses are written `path($.mods.store)`:
  a bare string is never an address.
- `acyclic()`, `inverse(usedBy)` — the graph atoms: lattice-inert
  declarations, registered during unification and decided at
  generation, where every edge is known.

Both directions of every edge are written out. Deriving the inverse
for the author would be generation rather than validation, and
`inverse(n)` only checks, so `store` lists the four modules that use
it and each of them lists `store`.

Each `bad/` overlay includes `model.aon` and adds one edge. Lists
unify positionally, so an overlay restates the list it extends, with
the new entry last.

[Case 12](../12-relations/) exercises the same atoms on a four-job
pipeline. What this case adds is scale enough for the views to matter
(twelve modules, three roots, shared subtrees) and a rule that
constrains the *far end* of an edge rather than the edge itself. The
constructs are specified in the language reference under
[Declared relations](../../docs/reference-language.md#declared-relations).

## What check.sh proves

1. `model.aon` generates and the output matches `expected/model.json`:
   twelve modules, twenty-one legal edges, every inverse written.
2. `aontu relations model.aon` answers `verdict: pass` without
   generating.
3. `bad/upward.aon` (`auth`, a core module, comes to depend on
   `catalog`, a feature module) refuses at generation with
   `[aontu/empty]`, and the message names both layers:
   `Cannot unify value: "core"|"util" with value: "feature"`.
4. `bad/upward-swapped.aon`, the same edge with its two blocks written
   in the other order, refuses with `[aontu/empty]` as well.
5. `bad/cycle.aon` (`bytes` comes to depend on `log`, which already
   depends on `bytes`; both are util, so the layer allows it) refuses
   at generation with `[aontu/relation_cycle]`, and `aontu relations`
   answers `verdict: fail`, naming the loop:
   `cycle $.mods.bytes -> $.mods.log -> $.mods.bytes`.
6. `bad/missing-inverse.aon` (`clock` depends on `bytes`, and `bytes`
   does not say so) refuses with `[aontu/relation_inverse_missing]`,
   and the verb names the exact absent entry:
   `$.mods.bytes does not list $.mods.clock under usedBy`.
7. `bad/dangling.aon` (a dependency on a module nobody wrote) refuses
   inside the evaluation with `[aontu/rel_unresolved]`: existence is
   decided, never deferred.
8. `aontu reaches --relation dependsOn` answers the closure question
   both ways: `cli` reaches `bytes` (`verdict: reaches`, with the path
   `$.mods.cli -> $.mods.billing -> $.mods.auth -> $.mods.bytes`), and
   `bytes` does not reach `cli` (`verdict: unreachable`, exit code 1).
9. The dependency tree renders byte for byte to
   `expected/diagram-tree.txt`: three derived roots, nine elided
   repeats; and as SVG to `expected/diagram-tree.svg`.
10. `aontu view tree --root $.mods.billing` draws one module's own
    closure, pinned as `expected/diagram-tree-billing.txt`.
11. A `--root` naming no node refuses (`refer_unresolved`, naming
    `$.mods.nosuch`) rather than drawing an empty tree.
12. The dependency-structure matrix, in partition order with the
    closure, renders byte for byte to `expected/diagram-matrix.txt`,
    and its footer counts zero cells above the diagonal; the same
    matrix as SVG matches `expected/diagram-matrix.svg`, and `--check`
    against the committed SVG passes.
12a. `views.aon` declares all eight committed figures as data, and
    `aontu view --views '$.views' --check` gates them in one run: one
    evaluation, all or nothing. The same declarations drawn into a
    scratch directory land the same bytes.
12b. The architecture layers render byte for byte to
    `expected/diagram-layer.txt`: four bands in the order the relation
    derives, nineteen edges downward, two sideways, none upward; as
    SVG to `expected/diagram-layer.svg`; and with `--layers
    app,feature,core,util --as mermaid` as Mermaid subgraphs.
13. The tree of the cyclic model (`bad/cycle.aon`) terminates, marking
    the closing edge `(cycle)` instead of recursing into it.
14. `aontu get` reads a module's layer and directory off the model:
    `$.mods.http.layer` is `"core"` and `$.mods.store.dir` is
    `"core/store"`.

## Run

From this directory, `./check.sh` runs all 14 assertions and exits 0.
It drives the TypeScript CLI (`ts/bin/aontu.js`, or the command in
`$AONTU`) and can be invoked from any working directory.
