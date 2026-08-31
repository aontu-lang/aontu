---
description: Ask whether one entity reaches another over the declared edges with aontu reaches, and get the path as the answer.
group: validate-evolve
order: 40
---

# Query reachability between entities

"If the extract job stops, what downstream goes stale?" is a question
about the graph's closure, and no amount of staring at one edge at a
time answers it. `aontu reaches` asks it directly: does anything
`from` links to, at any remove, end up at `to`?

It runs over the same declared edges as [`aontu
relations`](check-relations.md). The model below is a trimmed version
of [use-cases/12-relations](../../use-cases/12-relations/): jobs feed
jobs, both directions written out. The vocabulary goes in `spec.aon`:

<!-- test: scenario reach -->
<!-- test: file spec.aon -->
```aontu
spec: hide({
  Job: {
    kind: job
    feeds?: rel($.spec.JobShape) & acyclic() & inverse(fedBy)
    fedBy?: rel($.spec.JobShape)
  }
  JobShape: { kind: job }
})
```

and a four-job topology in `pipeline.aon`, where `transform` fans out
to two consumers:

<!-- test: file pipeline.aon -->
```aontu
@"./spec.aon"
jobs: {
  &: $.spec.Job
  extract: { feeds: [path($.jobs.transform)] }
  transform: {
    fedBy: [path($.jobs.extract)]
    feeds: [path($.jobs.load), path($.jobs.audit)]
  }
  load: { fedBy: [path($.jobs.transform)] }
  audit: { fedBy: [path($.jobs.transform)] }
}
```

Now ask whether the extract job's output ends up in the warehouse:

<!-- test: run -->
```sh
$ aontu reaches $.jobs.extract $.jobs.load --relation feeds pipeline.aon
verdict: reaches

$.jobs.extract -> $.jobs.transform -> $.jobs.load
$ echo $?
0
```

The path is the answer, not decoration: an operator asking what a
failure takes out acts on the chain, and a bare "yes" gives them
nothing to act on. It is a shortest path, and among shortest paths
the first in code-point order, so both engines print the same one.

## Direction matters

Along `feeds`, the DAG answers directionally — downstream yes,
upstream no:

<!-- test: run -->
```sh
$ aontu reaches $.jobs.load $.jobs.extract --relation feeds pipeline.aon
verdict: unreachable

$.jobs.load does not reach $.jobs.extract
$ echo $?
1
```

An unreachable pair is a failed check, and carries no path: there is
no evidence for a negative answer. Exit `1` (rather than `4`) says
the question was answered, and the answer was no — which is exactly
what a containment policy wants to assert in CI ("nothing in the
public tier may reach the ledger").

## With and without `--relation`

Omit `--relation` and every declared edge counts, `fedBy` included.
`load` and `audit` are siblings, so no chain of `feeds` connects
them, but the unrestricted graph does:

<!-- test: run -->
```sh
$ aontu reaches $.jobs.load $.jobs.audit pipeline.aon
verdict: reaches

$.jobs.load -> $.jobs.transform -> $.jobs.audit
$ aontu reaches $.jobs.load $.jobs.audit --relation feeds pipeline.aon
verdict: unreachable

$.jobs.load does not reach $.jobs.audit
$ echo $?
1
```

That is the difference between "are these connected at all" and "can
this reach that *this way*" — and in a model that writes out its
inverses, the unrestricted graph connects nearly everything, so
`--relation` is what makes direction mean anything. The query is
transitive but never reflexive for free: `reaches $.jobs.extract
$.jobs.extract` is true only when a path of one or more edges returns
home, which reports a cycle rather than reporting nothing.

## An endpoint that names nothing refuses

An endpoint that names no node would make `unreachable` a lie about
the model, so the verb refuses instead, and lists what it does know:

<!-- test: run -->
```sh
$ aontu reaches $.jobs.extract $.jobs.laod pipeline.aon
verdict: error

$: refer_unresolved [reference]
  $.jobs.laod names no node in this document.
  note: nodes with links: $.jobs.audit, $.jobs.extract, $.jobs.load, $.jobs.transform
$ echo $?
4
```

A policy check that quietly passed because its target was misspelled
is the failure mode this exit code exists to prevent. Treat exit `4`
as a broken check, and fix the spelling.

The verb is specified under [`aontu
reaches`](../reference-api.md#aontu-reaches), including the library
forms (`reachCheck` / `Aontu.Reach`). The live version is
[use-cases/12-relations](../../use-cases/12-relations/), whose
`check.sh` asserts the directional answers above. To validate the
edge set itself before querying it, start with [Check that components
agree about their relations](check-relations.md).
