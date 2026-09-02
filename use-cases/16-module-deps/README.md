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
pinned as a golden by `check.sh`.

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

The same edges as a dependency-structure matrix, where a mark at (row,
column) means the row module depends on the column module:

```
             1  2  3  4  5  6  7  8  9 10 11 12
auth      1  \  .  X  .  .  .  X  .  .  .  .  .
billing   2  X  \  .  .  .  X  .  .  .  .  X  .
bytes     3  .  .  \  .  .  .  .  .  .  .  .  .
catalog   4  .  .  .  \  .  .  X  .  .  .  X  .
cli       5  .  X  .  .  \  .  .  .  X  .  .  .
clock     6  .  .  .  .  .  \  .  .  .  .  .  .
http      7  .  .  X  .  .  .  \  X  .  .  .  .
log       8  .  .  X  .  .  .  .  \  .  .  .  .
reports   9  .  .  .  .  .  .  .  X  \  .  X  .
server   10  .  X  .  X  .  .  X  .  .  \  .  .
store    11  .  .  .  .  .  X  .  X  .  .  \  .
worker   12  .  .  .  .  .  .  .  .  X  .  X  \
```

The tree answers "what does `cli` pull in, and how deep"; the matrix
answers "what is the shape of the whole surface". Ghoniem, Fekete and
Castagliola (InfoVis 2004) is the empirical result behind preferring
the matrix past about twenty vertices, and Sangal et al. (OOPSLA 2005)
is the software-dependency application. At twelve modules both are
readable, which is why the case draws both.

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

## The model

`spec.aon` is the vocabulary and the rule; `modules.aon` is the
codebase; `model.aon` joins them. The relation is declared once, at
its field:

    dependsOn?: rel($.spec.ModShape) & acyclic() & inverse(usedBy)
    usedBy?: rel($.spec.ModShape)

- `rel(t)` — the field's entries are checked tree addresses, and `t`
  flows into every target. Addresses are written `path($.mods.store)`:
  a bare string is never an address (ADR-016).
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
   repeats.
10. `aontu view tree --root $.mods.billing` draws one module's own
    closure, pinned as `expected/diagram-tree-billing.txt`.
11. A `--root` naming no node refuses (`refer_unresolved`, naming
    `$.mods.nosuch`) rather than drawing an empty tree.
12. The dependency-structure matrix renders byte for byte to
    `expected/diagram-matrix.txt`.
13. The tree of the cyclic model (`bad/cycle.aon`) terminates, marking
    the closing edge `(cycle)` instead of recursing into it.
14. `aontu get` reads a module's layer and directory off the model:
    `$.mods.http.layer` is `"core"` and `$.mods.store.dir` is
    `"core/store"`.

## Run

From this directory, `./check.sh` runs all 14 assertions and exits 0.
It drives the TypeScript CLI (`ts/bin/aontu.js`, or the command in
`$AONTU`) and can be invoked from any working directory.
