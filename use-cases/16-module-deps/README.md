# 16 — module deps: a layered codebase, drawn as a dependency tree

## The codebase, drawn

Twelve modules, four layers, twenty-one dependencies. The tree below
is generated from this model by
[`../tools/diagram.js`](../tools/diagram.js) and pinned as a golden by
`check.sh`, like every other artifact here. There is no `aontu view`
verb yet — see [`docs/design/VIEWS.0.md`](../../docs/design/VIEWS.0.md).

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
not a tree — `store` is reached from four modules — so a full
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

## The layering rule is a shape, not a checker

The architecture invariant is that a module never depends on a module
above it. `app` may use anything, `feature` may use feature and below,
`core` may use core and below, `util` may use only util. A sideways
edge is legal — `auth` calling `http` is ordinary engineering — and
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

**And it holds in every spelling** — `bad/upward.aon` writes the
offending module first, `bad/upward-swapped.aon` writes its target
first, and both refuse. That is the case's own finding, fixed: which
target shape reached the far end of an edge used to depend on the
order the blocks were written in, because a flow nested inside another
flow had its record dropped rather than deferred ([BUGS
69](../BUGS.md)). Both spellings are pinned by `check.sh`.

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

Case 12 exercises the same atoms on a four-job pipeline. What this
case adds is scale enough for the views to matter (twelve modules,
three roots, shared subtrees) and a rule that constrains the *far end*
of an edge rather than the edge itself.

## What check.sh proves

1. The model generates: twelve modules, twenty-one legal edges, every
   inverse written; `aontu relations` passes on the same document.
2. An upward dependency (core on feature) refuses at generation, and
   the message names both layers.
3. The same edge with its two blocks swapped still generates — pinned
   as a known miss, so the corpus says what the engine does and the
   assertion flips when the flow stops depending on order.
4. A cycle between two util modules — legal by layer — refuses with a
   located `relation_cycle`, and the verb names the loop it runs
   through.
5. An edge whose mirror was never written refuses, and the verb names
   the exact absent entry.
6. A dependency on a module nobody wrote refuses inside the
   evaluation (`rel_unresolved`): existence is decided, never
   deferred.
7. `aontu reaches --relation dependsOn` answers the closure question
   both ways: `cli` reaches `bytes` through three hops, and `bytes`
   reaches nothing.
8. The tree draws: three derived roots, nine elided repeats, pinned
   byte for byte.
9. `tree --root $.mods.billing` draws one module's own closure, and a
   `--root` naming no node refuses rather than drawing an empty tree.
10. The dependency-structure matrix draws, pinned the same way.
11. The tree of the *cyclic* model terminates, marking the closing
    edge `(cycle)` instead of recursing into it.
12. `aontu get` reads a module's layer and directory off the model.

## Boundaries hit while writing it

- **The layering rule was order-dependent, which is how this case
  found the defect behind it.** The same field,
  `$.mods.auth.dependsOn`, was driven with auth's own narrow target
  when reached directly and with the BASE declaration's four-way one
  when reached through another module's mirror link, so the same
  illegal edge was refused in one spelling and generated in another.
  The cause was a flow nested inside another flow: its meet is skipped
  where it would re-enter a target already being flowed into, and the
  skip took the flow's RECORD with it, so the nested type was lost
  rather than deferred ([BUGS 69](../BUGS.md)). Fixed, in both ports,
  and both spellings are now pinned.
- **Two engine defects, found from the other end and fixed.** The
  model's mirrors were all written and `inverse(n)` said one was
  missing. Twice, for two unrelated reasons: a discarded disjunction
  alternative was still asserting its `refer(t)` type on the target
  ([BUGS 66](../BUGS.md)), and a conjunct member reached through a
  reference carried the map's path, so a link was stamped with the
  entity's key as its predicate ([BUGS 67](../BUGS.md)). Neither is a
  relation defect; a relation check is just what noticed. A third,
  smaller one came with them: the verdict was pronounced over
  documents that cannot generate at all ([BUGS 68](../BUGS.md)).
- **A mutual dependency was invisible to the renderer, and this case
  found it.** `tools/diagram.js` collapses the two written directions
  of a declared inverse into one logical edge, or every relation with
  an inverse would draw twice. It collapsed by node pair, so `a
  dependsOn b` together with `b dependsOn a` — one key facing itself,
  which is the shortest cycle a model can have — folded into a single
  undirected edge and the loop vanished from every view. The collapse
  is now per key pair: two keys facing each other are an inverse, one
  key facing itself is two facts. Every existing golden is unchanged
  by the fix.
- **The upward refusal names the layers but not the module.** The
  message is exact about what conflicted (`"core"|"util"` with
  `"feature"`) and the path it reports walks the relation
  (`$.mods.auth.dependsOn.0.usedBy.0.dependsOn.layer`) rather than
  naming the edge that broke the rule. An author reads the layers and
  then goes looking. A finding that carried the offending edge would
  make this a one-glance fix.
- **The error frame under an include names one file and quotes
  another.** `bad/dangling.aon` reports `--> spec.aon:24:17` and
  prints text from the failing document underneath it. Case 12's
  shipped `bad/dangling.aon` does the same, and a single-file version
  of the same model reports coherently, so the trigger is the include
  rather than this model. That is the `site-attribution` family
  ([`BUGS.md` §25](../BUGS.md)), whose invariant is that a frame
  quotes the text of the file its header names.
- **Lists unify positionally**, so each `bad/` overlay restates the
  list it extends, with the new entry last. Cases 01 and 12 record
  the same workaround.
- The views design declines an icicle over the path tree, on the
  grounds that `get --keys` and `jsonschema` already answer what it
  would answer ([`VIEWS.0.md`](../../docs/design/VIEWS.0.md),
  "Boundary"). A dependency tree is a different figure: it is over a
  *relation*, not over containment, and no shipped verb answers what
  it shows.

## Run

    ./check.sh
