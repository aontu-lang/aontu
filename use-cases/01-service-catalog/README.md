# Use case 01: a company-wide service catalog as system ontology

## Scenario

A Backstage-style service catalog for "Acme": eight services across
three teams/domains (payments, identity, platform), each with owner,
tier, lifecycle, ports, protocols and `dependsOn` relations. Two
organisational units describe the **same services from different
angles**:

- `catalog.aon` — the catalog view: what each service *is* (owner,
  tier, description, dependencies), organised by domain.
- `deploy.aon` — the deployment view: what each cluster *runs*
  (image, replicas, ports), organised by region and cluster.

The two files never mention each other's tree paths. `id(svc/<name>)`
declares that they describe the same entities, and one evaluation of
`system.aon` merges them field-by-field. This is the core enterprise
problem: the org chart and the runtime both hold facts about one
logical thing, and any drift between them should be an *error*, not a
silent fork. It is also the ground-truth-ontology problem for AI
agents: an agent must be able to pull one service's complete truth
into context (`aontu get`), ask where a fact came from (`aontu why`),
and have its own emitted candidates checked (`aontu vet`, `refer()`).

## Model design

| File | Role | Features exercised |
|---|---|---|
| `system.aon` | root: joins everything, declares relations | `@"std/system"`, `@"./..."` includes, `hide()`, `$.std.Relation`, `inverse`, `acyclic` |
| `spec.aon` | Acme vocabulary over the bundled one | `$.std.Service`, `$.std.Port`, conjunction-as-subclassing, `re`/`min`/`max`/`length` atoms, `*` defaults, optional `?` keys, `refer(t)` with link constraints |
| `catalog.aon` | catalog view | `id()`, per-domain `&:` spreads stamping owner + schema |
| `deploy.aon` | deployment view | `id()` from a second tree, defaults (`replicas: *2`) |
| `queries/queries.aon` | instance-of queries | `filter`, map union as index |
| `bad/*.aon` | change requests that must be refused | cycle, missing inverse, cross-view contradiction, wrong-kind endpoint |
| `proposals/*.aon` + `data/*.json` | agent-emitted candidates | JSON-as-Aontu, `vet --at --closed`, `refer` existence checks |

`check.sh` runs 16 assertions through the real CLI: golden-JSON diffs
for the merged model, `get` slices and query results; grep-by-error-code
(never byte-compared error text) for the five failure cases; `relations`
verdicts on good, cyclic, inverse-missing and post-proposal models.

Run it: `./check.sh` (from anywhere; set `AONTU=` to override the CLI).

## What worked

- **Identity-based merging is real and bidirectional.** The catalog
  slice of `svc/payments` (`aontu get
  '$.catalog.domains.payments.services.payments' system.aon`) contains
  `image`, `replicas` and `ports` written only in `deploy.aon`, and
  the workload position contains `owner`, `tier`, `description`
  written only in `catalog.aon`. Neither file references the other's
  paths. Contradiction detection is exactly as advertised:
  `bad/tier-conflict.aon` (an overlay claiming `tier: 2` for an entity
  the catalog pins at `tier: 1`) fails evaluation with
  `[aontu/scalar_value]` — the anti-`owl:sameAs` design does what the
  reference says it does.
- **`refer()` existence checking is a genuine ontology feature.** A
  proposal whose `dependsOn` names `svc/searchx` (declared nowhere)
  fails the whole evaluation with `[aontu/refer_unresolved]`. Link
  constraints compose on the address string (`refer(...) & string &
  re("^svc/")`), separate from target constraints.
- **The relations verb earns its keep.** `aontu relations` verdicts are
  deterministic, position-addressed, and exit-code-clean. The cycle
  report names the loop
  (`dependsOn: cycle svc/payments -> svc/ledger -> svc/payments`), the
  inverse report names the exact missing entry
  (`svc/directory does not list svc/email under dependedOnBy`).
- **Change-request files are free what-if analysis.** Every `bad/*.aon`
  and `proposals/*.aon` is four lines: `@"../system.aon"` plus the
  proposed delta, layered by id-merge. Verifying a change before
  editing the base model costs one file and one CLI call. This pattern
  fell out of the language design rather than being built for it, and
  it is excellent.
- **Agent-emitted JSON is already Aontu.** `data/candidate-webhooks.json`
  is used twice unmodified: `vet`-ed against a schema anchor
  (exit codes 0/1/3/4 are CI- and agent-friendly, findings carry
  `[aontu/...]` codes plus data *and* schema source positions), and
  unified into the live model by `proposals/onboard-webhooks.aon`,
  where the full `refer()` checks apply. `vet --closed` caught the
  misspelled `teir` key.
- **Spreads-as-schema scale nicely.** One line per domain
  (`&: $.spec.CatalogEntry & {owner: "team-payments"}`) applies the
  whole vocabulary and stamps ownership; `*` defaults filled in
  `replicas: 2`, `direction: "in"`, `lifecycle: "production"`
  everywhere they were not overridden.
- **Canon keeps identity.** `--canon` renders `id("svc/payments")`
  back, so the canon-hash distinguishes documents that disagree about
  identity.

## Gaps and friction

Severity: **critical** = wrong result/refusal on a correct model;
**major** = a scenario requirement needs a real workaround;
**minor** = wart.

### Gap 1 (major): `type()`-wrapped schemas break under include

The natural spelling of a reusable vocabulary — `type()`-marked
schemas referencing the bundled ones — fails as soon as the file is
included into a root document:

```
[aontu/mapval_no_gen]: Cannot resolve value at path $.svc

This value was present after unification, and cannot be generated
because it is not a literal value.

 Cannot resolve value: type($.std.Service&{"owner":re("^team-"),"tier":1|2|3})&{"owner":"team-pay","tier":1}
```

The same document with `type()` removed works. `std.ts` itself hints
at this ("a reference from one member of an included file to another
does not survive being INCLUDED"). Workaround used in `spec.aon`:
no `type()`, `hide()` on the whole `spec` bag instead.

### Gap 2 (major): `vet` cannot anchor on a reference-bearing schema

`vet --at '$.spec.CatalogEntry'` misfires whenever the data touches a
part of the schema that contains a reference. With a candidate whose
`dependsOn` names an entity that *does exist* in the schema document:

```
$.spec.CatalogEntry.dependsOn.0: no_path [reference]
  [aontu/no_path]: Cannot resolve value at path $.spec.CatalogEntry.dependsOn.0
  schema: sys.aon:5:21 ($.std.Service)
$.dependsOn.0.pay.0: refer_unresolved [reference]
  [aontu/refer_unresolved]: Cannot refer value at path $.dependsOn.0.pay.0
  schema: sys.aon:5:21 (refer(nil)&"svc/auth"&"svc/auth")
```

Note `refer(nil)` — the target type reference collapsed — and the
garbled finding path `$.dependsOn.0.pay.0`. A candidate with `ports`
(touching the `{&: $.std.Port}` template) produces a finding at a
completely unrelated path:

```
$.catalog.services.pay.dependsOn.0: no_path [reference]
  [aontu/no_path]: Cannot resolve value at path $.catalog.services.pay.dependsOn.0
  schema: sys.aon:34:17 ($.std.Port)
```

Workarounds, both used: (a) `spec.CandidateShape`, a *reference-free*
duplicate of `CatalogEntry` kept only for vetting — schema duplication
the language was supposed to remove; (b) checking references by
merging the candidate into the model instead
(`proposals/onboard-webhooks.aon`). The merge route has its own trap:
an include written inline in a conjunction
(`... & @"../data/candidate.json"`) fails with

```
[aontu/mapval_spread_required]: Cannot resolve value at path $.spec.CatalogEntry.owner

The value for key owner is required (defined in spread).
```

while the same JSON loaded at its own key
(`candidate: hide(@"../data/candidate-webhooks.json")`) and pulled in
by reference (`... & $.candidate`) works.

### Gap 3 (major): the declared relation `target` is not enforced

`relations: dependsOn: $.std.Relation & {target: $.std.Service, ...}`
looks like a typed endpoint declaration. It is documentation only. A
model whose `dependsOn` edge lands on a `kind: database` entity, with
correct inverses, gets:

```
verdict: pass
```

Typed endpoints exist only by repeating the type at every link site
(`refer($.std.Service)` in the list spread) — and that has its own
problem (gap 8). The relations vocabulary today is: `acyclic` (works),
`inverse` (works), `target` (inert). No cardinality ("a service has
exactly one owner team"), no relation attributes (edge weight, SLA of
a dependency), no source-side typing, no transitivity declaration.

### Gap 4 (major): inverses are hand-written, and lists fight you

`dependedOnBy` must be maintained by hand at every target — the
reference is explicit that generation "is not done here". In an
8-service model that is 9 hand-written inverse entries which each new
edge must update. Two language limits make it worse:

- **Membership queries are inexpressible**, so the model cannot derive
  inverses itself. `filter($.services, {dependsOn: [svc/ledger]})`
  matches by list *prefix*, not containment: with
  `pay: {dependsOn: [svc/auth, svc/ledger]}` the filter answer is `{}`
  even though `svc/ledger` is in the list.
- **Edge lists are positional, so cross-file "append" is brittle.**
  `[svc/pay] & [svc/pay, svc/web]` extends fine, but
  `[svc/pay] & [svc/web, svc/pay]` is
  `[aontu/scalar_value]: Cannot unify values at path $.a.0`.
  `proposals/onboard-webhooks.aon` must restate
  `[svc/gateway, svc/payments, svc/webhooks]` verbatim and in order to
  add one inverse entry; if the catalog reorders its list, the
  proposal breaks. Relation edges want to be *sets*; the language only
  has ordered lists.

### Gap 5 (major): no wildcard paths, and map union collides on spreads

There is no `$.catalog.domains.*.services`, so the flat entity index
behind instance-of queries is a hand-maintained union that must be
edited when a domain is added. Worse, the obvious union does not work:
each `services` map carries its domain's `&:` template, and unifying
the maps conjoins the templates too:

```
[aontu/scalar_value]: Cannot unify values at path $.query.index
 Cannot unify value: "team-identity" with value: "team-payments"
```

`copy()` does not strip the template either (same failure). Hiding the
index breaks differently: `filter()` over a `hide()`-den map answers
`{}` silently. The working incantation, found by trial:
`filter(m, {})` per domain (an empty condition keeps every child and
drops the template), then unify the *results* — see
`queries/queries.aon`. Three workarounds deep for "list all tier-1
services".

### Gap 6 (minor): the idiomatic default-in-disjunction trips a vet warning

`lifecycle: *production | experimental | deprecated` — the reference's
own idiom, used by `std/system` itself (`direction: *in | out |
inout`) — makes every `vet` run warn:

```
$.lifecycle: pref_not_instance [compat]
  the default "production" is not an instance of any alternative of *"production"|"experimental"|"deprecated"
```

even though `& production` unifies fine. Silenced by repeating the
default as a member (`*production | production | ...`), which is what
`spec.aon` does. The bundled vocabulary and the checker disagree about
the idiom.

### Gap 7 (critical): different `&:` templates on the two views corrupt sibling ports

Engine bug, found the hard way. When the two id-merged views applied
*different* ports templates (catalog side had `{&: $.std.Port}` via
`$.std.Service`; deploy side had `{&: $.std.Port & {number: ...}}`),
the two ports of the gateway service were unified **with each other**:

```
[aontu/scalar_value]: Cannot unify values at path $.deploy.regions.eu1.clusters.edge.workloads.gateway.ports.admin.number
 Cannot unify value: 9901 with value: 443
```

443 is `ports.public.number`; 9901 is `ports.admin.number`. Siblings.
Minimal repro: two positions of one entity, each under a spread whose
template arrives by reference, templates unequal, entity has two
children under the templated map. Identical references on both sides
are fine. Workaround in `spec.aon`: one shared `$.spec.PortSpec`,
named identically by `CatalogEntry` and `Workload`, and `Workload`
also names `$.std.Service` so both views carry the *same* template
set. This is a landmine for exactly the multi-view merging the id()
feature exists for.

### Gap 8 (critical): `refer($.std.Service)` — the documented idiom — dies of `unify_cycle` at scale

The language reference's own service-catalog example types dependency
endpoints as `refer({kind: service})`-style. Doing it with the bundled
schema, `refer($.std.Service)`, works in a small flat model
(`bad/wrong-kind.aon` proves the check fires: a database endpoint is
refused with `[aontu/scalar_value] ... "database" with ... "service"`).
On the real model it fails outright:

```
[aontu/unify_cycle]: Cannot unify values at path $.deploy.regions.eu1.clusters.core.workloads.payments.dependsOn.0.ports

Circular reference detected during unification.

 Cannot unify value: integer&min(1)&max(65535) with value: integer&min(1)&max(65535)
```

— refusing to unify a value *with itself*, once targets carry ports.
And typing **both** directions of an inverse pair fails even in a
minimal model (`a: dependsOn: [&: refer({kind: service}), svc/b]` +
`b: dependedOnBy: [&: refer({kind: service}), svc/a]` is enough:
`[aontu/unify_cycle]: Cannot unify values at path $.b`). On the full
model the both-directions variant produced a diagnostic whose path
oscillates without bound:

```
[aontu/unify_cycle]: Cannot unify values at path $.deploy.regions.eu1.clusters.core.workloads.payments.dependsOn.0.dependedOnBy.0.dependsOn.0.dependedOnBy.0.dependsOn.0.dependedOnBy.0.[repeats for ~2000 characters]
```
Workaround in `spec.aon`: a thin literal type on `dependsOn` only
(`refer({kind: service})`), bare `refer()` on the inverse. Typed
endpoints are therefore *partially* usable: existence always, type
only if the type is small and only in one direction.

### Gap 9 (major): `why` provenance is one-sided across an id-merge

The same merged field answers differently depending on which position
you ask at, and not predictably. On this model:

```
$ aontu why '$.catalog.domains.payments.services.payments.replicas' system.aon
$.catalog.domains.payments.services.payments.replicas = 6
  1. 6  .../deploy.aon:11:19
```

— cross-file provenance, exactly what an audit wants. But:

```
$ aontu why '$.deploy.regions.eu1.clusters.core.workloads.payments.tier' system.aon
$.deploy.regions.eu1.clusters.core.workloads.payments.tier = 1
  (no contributions: nothing met at this path)
```

`tier = 1` was written in `catalog.aon`; the deploy position reports
*nothing met*. In a smaller two-file experiment the asymmetry pointed
the other way (the later-declared position had the full story). An
agent using `why` for ground-truth attribution gets a correct value
with a wrong "nobody wrote this". Also minor: contributions that
arrive via a referenced spread template print `(spread)` with an empty
source position.

### Gap 10 (minor): error cosmetics — misattributed source snippets

Several diagnostics cite the wrong file or impossible positions: vet
findings citing `schema: system.aon:47:21` when `system.aon` has 24
lines (positions appear to be in a concatenated coordinate space);
a snippet labelled `std/system:33:11` displaying the *user* file's
text; the finding path `$.proposal.search.dependsOn.0.email` for an
address that was `svc/searchx`. None block work; all erode trust in
exactly the tool an agent is supposed to trust. Related warts: the
default trust level warns
(`aontu: warning: include resolved outside the entry root: ...`)
unless the *same* default is passed explicitly (`--trust system`),
and `get`/`why`/`relations` do not accept `--trust`/`--include-root`
at all, so those runs cannot silence it.

### Missing, by design or omission: the ontology verbs

The scenario's headline questions, answered bluntly:

- **Subclassing**: conjunction (`$.std.Service & {...}`) is a solid
  subsumption mechanism, and `aontu subsume` can test it. But there is
  no way to *ask* "is CatalogEntry a Service?" of names inside one
  document, and gaps 1/2/7/8 all punish reusing schemas by reference —
  the bundled vocabulary itself writes `Service` out longhand instead
  of extending `Component`, and this model had to do the same twice
  (`CandidateShape`, `PortSpec` discipline).
- **Instance-of queries**: `filter` + hand-built index only (gap 5).
  Nothing answers "all entities that are Services" — filtering is by
  structural condition, not by declared schema.
- **Transitive closure / reachability**: absent. "What breaks if
  svc/directory goes down?" is unanswerable; `graphOf` exists inside
  the engine (entity index + edge set) but no verb exposes it, and
  the source marks impact analysis as future work (G7). `relations`
  computes reachability internally (it finds cycles) yet cannot be
  asked the query.
- **Relation expressiveness**: endpoints beyond `target` (which is
  inert, gap 3), cardinality, edge properties, transitivity — none
  expressible. A relation *is* a key name plus two checked booleans.
- **Duplicated output**: every position of an entity emits the full
  merged value (410-line JSON for 8 services in 2 views); findings are
  likewise repeated per position (the cycle run reports the same
  missing inverse 3 times). Fine at this scale, worth watching at
  ontology scale.

## Verdict on the findings focus

Does identity-based merging scale as an ontology mechanism?
**Conceptually yes — it is the best thing in the language.** The
id-merge plus contradiction-on-contact model is exactly right for
multi-view enterprise truth, and the change-request-as-overlay pattern
is genuinely excellent. **Mechanically, not yet**: the two critical
bugs (gaps 7, 8) were both hit by the first realistic model this
exercise built, both in the interaction of id-merge with the features
(spreads-by-reference, typed refer) a real catalog needs, and the
provenance tool that should explain a merge misreports it (gap 9).
The relations vocabulary is honest about what it checks (acyclic,
inverse) and those checks are good; everything else an ontology needs
from relations — typed and enforced endpoints, cardinality, closure
queries, derived inverses — is either inert, inexpressible, or
explicitly deferred.
