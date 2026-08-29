# Tutorial: model the system, not the tree

At 04:11 the ledger database went down, and at 04:12 the payments
service went with it — a dependency that was real in production and
recorded nowhere. Every config file involved was valid all night.

The [first tutorial](tutorial.md) left you with a config that is
schema, defaults and data in one document, describing each service
completely — and each service alone. Nothing in it can say "these
two files describe the same service", or "this feeds that, never in
a loop", or "a chain of these, as long as it needs to be". This
tutorial adds that layer: identity (`id`), declared relations
(`rel` and the graph atoms), and recursive schemas. Each is a
statement the engine checks — "payments depends on ledger" becomes
something that can refuse.

Run snippets as before (from a clone, `node ts/bin/aontu.js`
stands in for `aontu`). Every output here is the engine's own.

## 1. Two views of one service

The catalog team records what `payments` *is*; the platform team
records what actually *runs*. Unification is path-aligned, so a
claim at `$.catalog.payments` never meets a claim at
`$.deploy.eu1.payments`: a forked tier stays confident in both
files, and one of them is wrong.

`id(name)` gives a value a second name that owes nothing to its
position: it declares that this value IS the entity called `name`,
and every node in one evaluation carrying the same id is unified
with every other. Here are the two views, trimmed from
[use-case 01](../use-cases/01-service-catalog/) and inlined into
one document:

```aontu
catalog: payments: id(svc_payments) & {
  owner: "team-payments"
  tier: 1
}
deploy: eu1: payments: id(svc_payments) & {
  image: "acme/payments:2.14.1"
  replicas: 6
}
```

→

```json
{"catalog": {"payments": {"image": "acme/payments:2.14.1",
   "owner": "team-payments", "replicas": 6, "tier": 1}},
 "deploy": {"eu1": {"payments": {"image": "acme/payments:2.14.1",
   "owner": "team-payments", "replicas": 6, "tier": 1}}}}
```

Both positions now hold the whole service (`image` written only in
the deploy view, `owner` only in the catalog view), and neither
view mentions the other's paths. The tree stays a tree: generation
emits the unified value at each declared position.

Declaring two nodes the same entity *means* unifying them, so a
disagreement between the views is a located error rather than a
silent fork:

<!-- test: run -->
```sh
$ echo 'catalog: pay: id(svc_pay) & {tier:1} deploy: pay: id(svc_pay) & {tier:2}' | aontu
[aontu/scalar_value]: Cannot unify values at path $.deploy.pay.tier
...
$ echo $?
1
```

Identity links that could never fail are how `owl:sameAs` corrupted
data at web scale; the
[reference](reference-language.md#identity-idname) tells that
story. From here on, "same entity" is a claim the engine holds you
to.

## 2. Relations: an edge you can trust

Now the connections. We model an ETL pipeline of three jobs
(extract feeds transform, transform feeds load), trimmed from
[use-case 12](../use-cases/12-relations/), where the four-job
original lives under test.

<!-- test: scenario pipeline -->

The vocabulary sits in `spec.aon` (`hide()` marks it schema:
present for unification, absent from output):

<!-- test: file spec.aon -->
```aontu
spec: hide({
  Job: {
    kind: job
    feeds?: rel($.spec.JobShape)
  }

  JobShape: {
    kind: job
  }
})
```

`rel(t)` turns the field's strings into **entity addresses**: each
must name an `id()`-declared entity in this evaluation, and the
type `t` flows into every target, so an edge landing on something
that is not a job refuses at the edge. The `?` makes the key
[optional](reference-language.md#optional-keys-) — a job with
nothing downstream writes nothing. (`JobShape` is a thin stand-in:
a self-typed `rel($.spec.Job)` inside `Job` is still in design.)

The topology sits in `pipeline.aon` — plain lists of names, one of
which carries a typo:

<!-- test: file pipeline.aon -->
```aontu
pipeline: jobs: {
  &: $.spec.Job

  extract:   id(job_extract) & { feeds: [job_tranform] }
  transform: id(job_transform) & { feeds: [job_load] }
  load:      id(job_load) & {}
}
```

A two-line root, `model.aon`, joins them:

<!-- test: file model.aon -->
```aontu
@"./spec.aon"
@"./pipeline.aon"
```

<!-- test: run -->
```sh
$ aontu model.aon
[aontu/rel_unresolved]: Cannot refer value at path $.pipeline.jobs.extract.feeds.0

The address names no entity in this evaluation. Every id()-declared
name is addressable; nothing else is.
...
$ echo $?
1
```

Without `rel()`, `job_tranform` is a perfectly good string and this
pipeline silently loses everything downstream of extract. With it,
the typo is a located refusal, and existence is decided inside the
evaluation: an address resolves, or the document refuses. Correct
the line in `pipeline.aon`:

<!-- test: file pipeline.aon -->
```aontu
pipeline: jobs: {
  &: $.spec.Job

  extract:   id(job_extract) & { feeds: [job_transform] }
  transform: id(job_transform) & { feeds: [job_load] }
  load:      id(job_load) & {}
}
```

<!-- test: run -->
```sh
$ aontu model.aon
...
        "feeds": [
          "job_transform"
        ],
...
```

### A constraint held on every address: `re()`

Acme's convention says jobs are named `job_<something>`. Write the
convention into the declaration, in `spec.aon`:

<!-- test: file spec.aon -->
```aontu
spec: hide({
  Job: {
    kind: job
    feeds?: rel($.spec.JobShape) & re("^job_")
  }

  JobShape: {
    kind: job
  }
})
```

A constraint beside `rel()` constrains the **address string**, and
it is held onto every element of the list. To watch it work, write
a change request — a file that includes the model and layers a
delta on by identity. Propose a new edge, `raw.aon`:

<!-- test: file raw.aon -->
```aontu
@"./model.aon"

pipeline: jobs: { raw: id(raw_dump) & {} }
change: id(job_extract) & {
  feeds: [job_transform, raw_dump]
}
```

<!-- test: run -->
```sh
$ aontu raw.aon
[aontu/constraint]: Cannot unify values at path $.pipeline.jobs.extract.feeds.1
...
 Cannot unify value: re("^job_") with value: "raw_dump"
...
$ echo $?
1
```

`raw_dump` resolves (the entity is real), but its name breaks the
convention, and the held `re()` refuses the address before the edge
exists. Naming conventions usually live in a wiki. This one is
schema.

### The graph atoms: `acyclic()` and `inverse()`

Two facts about the pipeline concern the whole edge set: no job may
feed itself at any remove, and every fed job should name its
feeders back. Declare both at the field, and give `fedBy` the same
checked treatment, in `spec.aon`:

<!-- test: file spec.aon -->
```aontu
spec: hide({
  Job: {
    kind: job
    feeds?: rel($.spec.JobShape) & re("^job_") & acyclic() & inverse(fedBy)
    fedBy?: rel($.spec.JobShape) & re("^job_")
  }

  JobShape: {
    kind: job
  }
})
```

The `feeds?:` line is now the entire relation: checked addresses,
endpoint type, naming rule, acyclicity, inverse. During unification
the atoms only *register* the declaration — one more edge can flip
either property, so the verdict waits for generation, where every
edge is known ([the rule](reference-language.md#declared-relations)).
And `inverse(fedBy)` checks the mirror rather than writing it for
you, so the data states both directions, in `pipeline.aon`:

<!-- test: file pipeline.aon -->
```aontu
pipeline: jobs: {
  &: $.spec.Job

  extract:   id(job_extract) & { feeds: [job_transform] }
  transform: id(job_transform) & { fedBy: [job_extract], feeds: [job_load] }
  load:      id(job_load) & { fedBy: [job_transform] }
}
```

<!-- test: run -->
```sh
$ aontu model.aon
{
  "pipeline": {
    "jobs": {
      "extract": {
        "feeds": [
          "job_transform"
        ],
        "kind": "job"
      },
...
      "transform": {
        "fedBy": [
          "job_extract"
        ],
        "feeds": [
          "job_load"
        ],
        "kind": "job"
      }
    }
  }
}
$ aontu relations model.aon
verdict: pass
```

The links generate as the plain strings the author wrote; the
machinery stays in the hidden vocabulary, and the data keeps its
JSON shape. The second command, the `relations` verb, reports the
same verdict without generating anything.

### Refusing a cycle

A change request makes load feed extract, and its author is careful
— the inverse entry is dutifully written too. Save it as
`cycle.aon`:

<!-- test: file cycle.aon -->
```aontu
@"./model.aon"

change: id(job_load) & { feeds: [job_extract] }
mirror: id(job_extract) & { fedBy: [job_load] }
```

<!-- test: run -->
```sh
$ aontu cycle.aon
[aontu/relation_cycle]: Cannot relate value at path $.pipeline.jobs.extract.feeds.0
...
$ echo $?
1
$ aontu relations cycle.aon
verdict: fail

$.mirror.feeds.0  feeds: cycle job_extract -> job_transform -> job_load -> job_extract
$ echo $?
1
```

The care did not help, which is the point: acyclicity is a property
of the whole graph, and no local diligence satisfies it. Generation
refuses at an edge on the loop; the verb names the loop itself,
closing back on the first entity.

### Refusing a missing inverse

A new job taps the transform output, and nobody records the feeder
on its `fedBy`. The `change` list restates `job_load` because lists
unify positionally (the first tutorial's §11 rule). Save it as
`metrics.aon`:

<!-- test: file metrics.aon -->
```aontu
@"./model.aon"

pipeline: jobs: { metrics: id(job_metrics) & { fedBy: [] } }
change: id(job_transform) & { feeds: [job_load, job_metrics] }
```

<!-- test: run -->
```sh
$ aontu relations metrics.aon
verdict: fail

$.change.feeds.1  feeds: job_metrics does not list job_transform under fedBy
$.pipeline.jobs.transform.feeds.1  feeds: job_metrics does not list job_transform under fedBy
$ echo $?
1
```

The exact missing entry is named — twice, because the transform
entity is declared at two positions and each carries the finding.
Add `job_transform` to the new job's `fedBy` and the model passes.

### Reachability

If extract dies, does load stop? That question needs the closure of
the edge set, and it has its own verb:

<!-- test: run -->
```sh
$ aontu reaches job_extract job_load --relation feeds model.aon
verdict: reaches

job_extract -> job_transform -> job_load
$ aontu reaches job_load job_extract --relation feeds model.aon
verdict: unreachable

job_load does not reach job_extract
$ echo $?
1
```

The answer is the path, because the path is what an operator acts
on; a "no" carries none and exits `1`, so a policy like "nothing in
the public tier may reach the ledger" can be a CI gate. One
caution: this model writes both directions, so leaving off
`--relation` lets `job_load` "reach" `job_extract` by walking
`fedBy` upstream. A directional question names its relation.

The [check-relations](how-to/check-relations.md) and
[query-reachability](how-to/query-reachability.md) guides turn
these verbs into CI recipes; the
[API reference](reference-api.md#aontu-relations) lists every flag
and exit code.

## 3. A schema as deep as the data

An approval chain is a step that may be followed by another step,
and the depth belongs to each policy — a schema that hard-codes
three levels is wrong the day someone needs four. Here is the whole
vocabulary, trimmed from
[use-case 13](../use-cases/13-recursive-schema/), as `schema.aon`:

<!-- test: scenario approvals -->
<!-- test: file schema.aon -->
```aontu
spec: hide({
  Step: {
    approver: string & re("^[a-z]+@acme[.]example$")
    decision: *pending | pending | approved | rejected
    then?: $.spec.Step
  }
})
```

Look at the last field. `$.spec.Step`, written *inside* `Step`, is
a reference to the value being defined, and it simply means the
fixpoint: a `Step` whose tail is a `Step`, by this very definition,
all the way down. No marker, no depth parameter, no unrolled
copies. Write a three-level chain against it, as `chain.aon`:

<!-- test: file chain.aon -->
```aontu
@"./schema.aon"

payments: $.spec.Step & {
  approver: "lead@acme.example"
  decision: approved
  then: {
    approver: "cfo@acme.example"
    decision: approved
    then: {
      approver: "audit@acme.example"
    }
  }
}
```

<!-- test: run -->
```sh
$ aontu chain.aon
{
  "payments": {
    "approver": "lead@acme.example",
    "decision": "approved",
    "then": {
      "approver": "cfo@acme.example",
      "decision": "approved",
      "then": {
        "approver": "audit@acme.example",
        "decision": "pending"
      }
    }
  }
}
```

The leaf never states a `decision`, and the ranked default supplied
`"pending"` three levels down, from a schema one reference deep.
Mechanically, the self-reference leaves a *residual* (a value still
waiting for information) at each `then`, and the residual expands
one level per meet with concrete data — the checks descend exactly
as far as the chain does, and stop. Data is finite, so evaluation
terminates.

### The guard is the `?`

The engine never analyses a schema for well-foundedness; the data
decides, and what ends the expansion is the `?` on `then?:` — where
the data stops, the optional key drops. Spell the tail required and
no finite chain can satisfy it. Try it, as `strict.aon`:

<!-- test: file strict.aon -->
```aontu
strict: hide({
  Step: {
    approver: string
    then: $.strict.Step
  }
})
doc: $.strict.Step & {
  approver: "lead@acme.example"
  then: { approver: "cfo@acme.example" }
}
```

<!-- test: run -->
```sh
$ aontu strict.aon
[aontu/recursion_unexpanded]: Cannot recurse value at path $.doc.then.then
...
$ echo $?
1
```

The schema itself is accepted (it is a perfectly good fixpoint),
but every step demands a next step, so generation refuses at
`$.doc.then.then`, the exact position where this document ran out.
A required tail is a schema for documents that cannot exist.

### Vetting a chain you did not write

The chains that matter arrive from outside (an approval tool, an
agent) as plain JSON. Here is one with no Aontu syntax in it at
all, `review.json`:

<!-- test: file review.json -->
```json
{
  "approver": "lead@acme.example",
  "decision": "approved",
  "then": {
    "approver": "cfo@acme.example",
    "decision": "pending"
  }
}
```

`vet --at` anchors the check at the recursive definition:

<!-- test: run -->
```sh
$ aontu vet --at '$.spec.Step' schema.aon review.json
verdict: valid
```

Now a chain that smuggles in an outside approver one level down, as
`outside.json`:

<!-- test: file outside.json -->
```json
{
  "approver": "lead@acme.example",
  "decision": "approved",
  "then": {
    "approver": "EXTERNAL@other.example",
    "decision": "maybe"
  }
}
```

<!-- test: run -->
```sh
$ aontu vet --at '$.spec.Step' schema.aon outside.json
verdict: invalid

$.spec.Step.then.approver: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.spec.Step.then.approver
  expected: re("^[a-z]+@acme[.]example$")
  actual:   "EXTERNAL@other.example"
  data: outside.json:5:17 ("EXTERNAL@other.example")
  schema: schema.aon:3:24 (re("^[a-z]+@acme[.]example$"))
...
$ echo $?
1
```

The finding is one level down, sited on both sides (the data's line
in `outside.json`, the schema's line in `schema.aon`), and the
invented `decision` is refused right beside it. The depth cost
nothing to write, and there is no blind spot at level fifty either!

The [define-a-recursive-schema](how-to/define-a-recursive-schema.md)
guide adds what a vocabulary needs next: canonical form, and the
hash that pins a recursive schema as one string.

## Where to go next

You can now hand the engine plain-looking files and get back
refusals for a forked fact, a dangling name, a dependency loop, an
unmirrored edge, and a malformed chain at any depth — a decent set
of questions to have asked about payments and ledger before 04:11.

- The live models this page trimmed:
  [use-case 12, relations](../use-cases/12-relations/) and
  [use-case 13, recursive schema](../use-cases/13-recursive-schema/),
  each with a `check.sh` driving every refusal shown here and more.
- Gating a repo on the checks:
  [check relations](how-to/check-relations.md),
  [query reachability](how-to/query-reachability.md),
  [define a recursive schema](how-to/define-a-recursive-schema.md).
- The rules in full:
  [identity](reference-language.md#identity-idname),
  [entity references](reference-language.md#entity-references-refert),
  [declared relations](reference-language.md#declared-relations),
  [recursive references](reference-language.md#recursive-references-fixpoints).
- Why identity refuses where `owl:sameAs` silently merged, and why
  the graph checks are verbs: the [explanation](explanation.md).
