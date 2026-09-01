# 12 — relations: a pipeline DAG, declared once, enforced at generation

An ETL pipeline of four jobs (extract, transform, load, audit), each
addressed by its tree path, with one relation between them: `feeds`,
and its written-out inverse `fedBy`. The relation is declared once, at
its field in the schema; the data documents are plain lists of
addresses; and the two graph properties, no cycles and every edge
mirrored, are decided at generation, where every edge is known. The
model holds nothing else, so the relation surface is the only thing in
the frame.

## The pipeline, drawn

Both diagrams below are generated from this model by
[`../tools/diagram.js`](../tools/diagram.js), which reads `graphOf` and
nothing else, and both are pinned as goldens by `check.sh`.

```mermaid
graph LR
  n___pipeline_jobs_audit["audit"]
  n___pipeline_jobs_extract["extract"]
  n___pipeline_jobs_load["load"]
  n___pipeline_jobs_transform["transform"]
  n___pipeline_jobs_extract -->|"feeds"| n___pipeline_jobs_transform
  n___pipeline_jobs_transform -->|"feeds"| n___pipeline_jobs_audit
  n___pipeline_jobs_transform -->|"feeds"| n___pipeline_jobs_load
```

**Six written edges, three logical ones.** `graphOf` reports every
written position, and `feeds` is declared `inverse(fedBy)` with both
directions written out, so the raw edge set doubles every relation that
has an inverse. The renderer collapses each unordered pair. Which
direction survives is chosen by `--primary feeds`: without it the
code-point-least key wins and the pipeline reads backwards.

The same edges as an entity-relationship diagram:

```mermaid
erDiagram
  n_extract }o--o{ n_transform : "feeds"
  n_transform }o--o{ n_audit : "feeds"
  n_transform }o--o{ n_load : "feeds"
```

Cardinality is drawn many-to-many throughout because the model does not
state one. Drawing a cardinality the model does not assert would be an
invention.

## The model

`model.aon` is the root: one evaluation that includes the vocabulary
(`spec.aon`) and the topology (`pipeline.aon`). The whole relation is
one line of schema in `spec.aon`, with the inverse field declared
`rel` beside it:

    feeds?: rel($.spec.JobShape) & acyclic() & inverse(fedBy)
    fedBy?: rel($.spec.JobShape)

- `rel(t)` — the field's strings are checked entity addresses, and
  `t` flows into every target. Here `t` is `JobShape`, a thin sibling
  shape (`kind: job`) naming what the far end of every edge must be.
- `acyclic()`, `inverse(fedBy)` — the graph atoms: lattice-inert
  declarations, registered during unification and decided at
  generation, where every edge is known.

The data (`pipeline.aon`) is plain lists of addresses under
`&: $.spec.Job`. Each job lists what it feeds and what feeds it, both
directions written out, because `inverse()` checks the mirror and does
not write it for you. There is no `relations:` block anywhere; that
key is ordinary user data.

`proposals/append.aon` adds a fifth job, `archive`, from a separate
position. Lists unify positionally, so the proposal restates
`transform.feeds` in full with the new address appended.

The constructs are specified in the language reference under
[Declared relations](../../docs/reference-language.md#declared-relations).

## What check.sh proves

1. `model.aon` generates and the output matches `expected/model.json`:
   the atoms hold, and every link is the plain address string the
   author wrote.
2. `aontu relations model.aon` answers `verdict: pass` without
   generating.
3. `--canon` renders the declarations at the field, `acyclic()` and
   `inverse("fedBy")`, so a reparse re-registers them.
4. `bad/cycle.aon` (load feeds extract) refuses at generation with a
   located `[aontu/relation_cycle]`, and `aontu relations` answers
   `verdict: fail`, naming the loop:
   `cycle $.pipeline.jobs.extract -> $.pipeline.jobs.transform -> $.pipeline.jobs.load -> $.pipeline.jobs.extract`.
5. `bad/missing-inverse.aon` (a new `metrics` job fed by `transform`
   whose `fedBy` is empty) refuses with
   `[aontu/relation_inverse_missing]`, and the verb names the exact
   entry:
   `$.pipeline.jobs.metrics does not list $.pipeline.jobs.transform under fedBy`.
6. `bad/wrong-kind.aon` (an edge landing on a dataset) is `rel(t)`'s
   flow refusing at evaluation: an ordinary located
   `[aontu/scalar_value]` conflict at the target's `kind`, and
   `aontu relations` answers `verdict: error` with exit code 4.
7. `bad/dangling.aon` (an address naming no node) refuses inside the
   evaluation with `[aontu/rel_unresolved]`: existence is decided,
   never deferred.
8. `proposals/append.aon` generates, matching `expected/append.json`,
   and `aontu relations` still answers `verdict: pass`: the appended
   element converts like the originals, and its inverse is checked.
9. `aontu reaches --relation feeds` answers directionally over the same
   edges: extract reaches load (`verdict: reaches`, with the path
   `$.pipeline.jobs.extract -> $.pipeline.jobs.transform -> $.pipeline.jobs.load`),
   and load does not reach extract (`verdict: unreachable`, exit
   code 1).
10. Both diagrams above render byte-for-byte to
    `expected/diagram-graph.mmd` and `expected/diagram-er.mmd`, and the
    graph carries exactly three edges after the inverse collapse.

## Running it

From this directory, `./check.sh` runs all 10 assertions and exits 0.
It drives the TypeScript CLI (`ts/bin/aontu.js`, or the command in
`$AONTU`) and runs from any cwd.
