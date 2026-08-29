---
description: Declare a relation once at the field with rel(), acyclic() and inverse(), and have the whole model's edge set checked.
group: validate-evolve
order: 30
---

# Check that components agree about their relations

A model can hold field by field and still be wrong as a graph: a
dependency loop nobody meant, an edge whose other end never wrote it
down. Those are facts about the *finished* model, so you declare them
once, at the field, and the verdict lands when every edge is known.

## Declare the relation at the field

The vocabulary below is a trimmed version of
[use-cases/12-relations](../../use-cases/12-relations/), an ETL
pipeline where jobs feed jobs. Write it as `spec.aon`:

<!-- test: scenario relations -->
<!-- test: file spec.aon -->
```aontu
spec: hide({
  Job: {
    kind: job
    feeds?: rel($.spec.JobShape) & re("^job_") & acyclic() & inverse(fedBy)
    fedBy?: rel($.spec.JobShape) & re("^job_")
  }
  JobShape: { kind: job }
})
```

One conjunction on `feeds` declares the whole contract. `rel(t)`
makes the field's strings checked entity addresses and flows the
endpoint type `t` into every target; the `re()` rides onto every
address as an ordinary constraint; `acyclic()` and `inverse(fedBy)`
are the graph atoms — declarations that unification carries along
inert, whose verdict lands at generation. Data documents then stay
plain lists of names. Write the topology as `pipeline.aon`:

<!-- test: file pipeline.aon -->
```aontu
@"./spec.aon"
jobs: {
  &: $.spec.Job
  extract: id(job_extract) & { feeds: [job_transform] }
  transform: id(job_transform) & { fedBy: [job_extract], feeds: [job_load] }
  load: id(job_load) & { fedBy: [job_transform] }
}
```

Each entry is an [entity](../reference-language.md#identity-idname)
named by `id()`, and every list is plain. Both directions are written
out by hand, because `inverse()` only checks that the mirror exists;
it never writes the mirror for you. Run the checks:

<!-- test: run -->
```sh
$ aontu relations pipeline.aon
verdict: pass
```

Generating the document (`aontu pipeline.aon`) is unaffected by any
of this, and the lists come out as the same plain strings the author
wrote: `rel()` checks addresses, it never rewrites them.

## A cycle is a located refusal

Suppose a change makes `load` feed `extract`, closing the DAG into a
loop. Write the change as `cycle.aon`, patching both directions in:

<!-- test: file cycle.aon -->
```aontu
@"./pipeline.aon"
change: id(job_load) & { feeds: [job_extract] }
mirror: id(job_extract) & { fedBy: [job_load] }
```

Every field still unifies (nothing contradicts locally), but the
edge set now violates `acyclic()`, so *generation* refuses, with a
located error at an edge on the loop:

<!-- test: run -->
```sh
$ aontu cycle.aon
[aontu/relation_cycle]: Cannot relate value at path $.jobs.extract.feeds.0
...
$ echo $?
1
```

The verb reports the same verdict without generating, and names the
entities the cycle runs through, closing back on the first:

<!-- test: run -->
```sh
$ aontu relations cycle.aon
verdict: fail

$.jobs.extract.feeds.0  feeds: cycle job_extract -> job_transform -> job_load -> job_extract
$ echo $?
1
```

Each verdict line is one finding: the position of the offending edge,
the relation, and the detail. Findings are sorted by position, so the
report diffs cleanly between runs.

## A missing inverse names the missing entry

Add a `metrics` job that taps the transform output, and forget to
record the feeder on its `fedBy`. Write it as `metrics.aon`:

<!-- test: file metrics.aon -->
```aontu
@"./pipeline.aon"
jobs: {
  metrics: id(job_metrics) & { fedBy: [] }
  transform: { feeds: [job_load, job_metrics] }
}
```

<!-- test: run -->
```sh
$ aontu relations metrics.aon
verdict: fail

$.jobs.transform.feeds.1  feeds: job_metrics does not list job_transform under fedBy
$ echo $?
1
```

The finding says exactly which entry to write. Generation refuses the
same model with a located `[aontu/relation_inverse_missing]` at that
edge.

## What to watch for

Acyclicity and inverse consistency are deliberately *not* lattice
constraints: both are global and non-monotone (one more edge can
make an acyclic graph cyclic), so unification could never hold them
open honestly. The endpoint *type* is different: `rel(t)` flows `t`
into each far end at the site, so an edge landing on a wrong-shaped
entity is an ordinary located evaluation error, and the verb answers
`verdict: error` (exit 4) for a document that does not stand up at
all. Exit codes are otherwise `0` pass and `1` fail, with
`--format json` for a machine-readable report.

The atoms are specified in [Declared
relations](../reference-language.md#declared-relations), the verb
under [`aontu relations`](../reference-api.md#aontu-relations), and
the live version, every refusal above asserted in both engines, is
[use-cases/12-relations](../../use-cases/12-relations/). Once the
edges hold, ask what they connect: [Query reachability between
entities](query-reachability.md).
