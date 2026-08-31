# Use cases

Documentation examples are small on purpose. Systems are not. The
sixteen models in [`use-cases/`](../use-cases/) close that gap: each
one is an enterprise-shaped system built as real Aontu documents — a
service catalog, a schema registry, an RBAC model — and each carries a
`check.sh` that drives the actual CLI and asserts every outcome, with
golden diffs for expected output and error-code greps for expected
refusals. When a page in these docs shows a shape, this is where that
shape lives, running. Run one case, or the whole suite:

<!-- test: skip runs the full case suite; use-cases/run-all.sh is its own gate, run before every landing -->
```sh
$ ./use-cases/03-api-contract/check.sh   # one case
$ ./use-cases/run-all.sh                 # all sixteen, one verdict line per case
```

The scripts need Node with `ts/node_modules` installed, plus `python3`
and `git` for a few cases. Each case's `README.md` is the long-form
record, with verbatim CLI output; the sections below compress it.

## 01 — service catalog

A Backstage-style catalog for eight services across three teams, where
the org chart and the runtime each hold facts about the same things.
`catalog.aon` says what each service *is* (owner, tier, dependencies);
`deploy.aon` says what each cluster *runs* (image, replicas, ports);
and the deployment view references the catalog, so one evaluation
merges them field by field and any contradiction between the views is a
located error instead of a silent fork. The case also drives `refer()`
existence checks, declared relations, and change requests written as
four-line overlay files. The same service, seen from both views:

```
# catalog.aon — the catalog view
services: payments: {
  tier: 1
  description: "Card payment orchestration and capture API."
  dependsOn: [
    "$.services.ledger", "$.services.risk",
    "$.services.auth", "$.services.notify"
  ]
  dependedOnBy: ["$.services.gateway"]
}

# deploy.aon — the deployment view
deploy: eu1: payments: $.services.payments & {
  image: "registry.acme.internal/payments:2.14.1"
  replicas: 6
  ports: {http: {number: 8080, protocol: http}}
}
```

The reference joins them, and an overlay claiming `tier: 2` refuses
with `[aontu/scalar_value]`. The live model, refusals included:
[`use-cases/01-service-catalog/`](../use-cases/01-service-catalog/).

## 02 — deploy config

Four services, three environments, four layers of authority: org
policy, team defaults, a service catalog, per-environment overlays.
This is Helm-values and Kustomize territory, and the layering
mechanism is the preference-rank ladder: the fewer stars, the stronger
the default. The org writes `***`, teams
`**`, environments `*`, a concrete pin beats them all, and two
disagreeing defaults at the same rank are a conflict. The whole
ladder, trimmed from the case's `probes/rank-ladder.aon`:

```aontu
org_team_env: ***info | string
org_team_env: **debug | string
org_team_env: *warn | string

pinned: ***info | string
pinned: **debug | string
pinned: error
```
```json
{
  "org_team_env": "warn",
  "pinned": "error"
}
```

Statement order never matters, and `aontu why` prints each surviving
rung with the file and line that wrote it. The full six-file layering:
[`use-cases/02-deploy-config/`](../use-cases/02-deploy-config/).

## 03 — API contract

A REST contract for a project-management SaaS: entities, endpoints,
request bodies keyed by status code, one error envelope. It is the
document an agent codes against and is corrected by — the agent emits
a candidate body, `aontu vet` reports what fails and where, and the
case's `repair.py` repairs it mechanically from the `--format json`
findings. Exit codes are verdict classes (0 valid, 1 invalid, 3
incomplete, 4 schema-side error), so a caller can branch before
reading a byte. A wire message is a `close()`d shape, so a surplus or
typo'd key is a conflict, not a silently ignored extra:

```
CreateUserRequest: close({
  email: $.types.Email
  name:  $.types.DisplayName
  role:  $.types.Role
  # Invitations send an email unless explicitly suppressed.
  send_invite?: boolean
})
```

`vet --at '$.msg.CreateUserRequest'` anchors on it directly. The
contract, the candidates, and the repair loop:
[`use-cases/03-api-contract/`](../use-cases/03-api-contract/).

## 04 — schema evolution

A shared customer-profile schema across three released versions, with
a queue of proposed changes. `aontu breaking --against` is the
governance gate a schema registry needs: additive changes pass, a
narrowed constraint or an added required key exits 1 with a witness
naming both files, and a `must()` on the new side answers *undecided*
(exit 3) rather than guessing. The centrepiece is the two-release
rename — deprecate in v2, remove in v3. The v2 mark, from
`profile-v2.aon`:

```
phone?: deprecate(string, {
  msg: "free-form phone is unvalidated; write E.164 to contact.phone"
  use: "$.profile.contact.phone"
  since: "2.0.0"
})
```

The mark rides the value: `vet` warns with the data site when an
instance still uses the field, and `--allow-deprecated-removal` admits
the v3 deletion while keeping the finding visible at severity
`warning`. All three versions and the proposal queue:
[`use-cases/04-schema-evolution/`](../use-cases/04-schema-evolution/).

## 05 — RBAC policy

An authorization model for a multi-tenant SaaS, written as data the
engine checks: a permission catalog, an exhaustive role registry,
tenant plans, and agent-emitted candidates vetted against all of it. Every grant is a `refer()`-checked address, so a
hallucinated permission is a located refusal, and the registry is
`close()`d, so an invented role dies at review. The security rule "no
role holds the wildcard unless flagged privileged" is structural — a
role is a disjunction of two closed shapes:

```
Role: type(
  close({
    desc: string
    rank: integer & min(0) & max(100)
    tenantOwner: boolean
    privileged: true
    grants: unique() & [&: refer() & string]
  })
  |
  close({
    desc: string
    rank: integer & min(0) & max(100)
    tenantOwner: false
    privileged: false
    grants: unique() & [&: refer() & string & neq("$.permissions.admin_all")]
  })
)
```

The unprivileged branch excludes the wildcard from every grant with one
`neq()`, so a proposal granting it to a collaborator role is refused.
A grant is a **tree address** (ADR-014), which is what makes `refer()`
a checked foreign key against the permission catalog rather than a
string comparison. The registry and its attack proposals:
[`use-cases/05-rbac-policy/`](../use-cases/05-rbac-policy/).

## 06 — Kubernetes golden path

A platform team's golden path: product teams edit a 40-line service
model, and evaluating `main.aon` renders three Deployments and three
Services, around 340 lines of manifests, none written by hand. An
override composes like plain data (pin `replicas: 6` at the generated
path and the sibling defaults survive), `close()` seals the service
set against drift, and `vet` runs the org guardrails over the rendered
JSON. `pack()` makes a manifest per service, and a second pack merges
one authored column into every generated child:

```
deploy: close(pack($.svc.names, {
  apiVersion: "apps/v1"
  kind: Deployment
  metadata: {
    name: key(2)                            # depth-counted by hand
  }
  # ... the rest of the Deployment skeleton ...
}))

deploy: pack($.svc.version, { spec: template: spec: containers: [ {
  image: $.platform.registry + "/" + key(6) + ":" + _ } ] })
```

The version column becomes the image tag through `_`, and drift in
either direction refuses: an entry with no service hits the sealed
set, a service with no entry leaves `image: string` ungenerable. The
whole generator: [`use-cases/06-k8s-golden-path/`](../use-cases/06-k8s-golden-path/).

## 07 — event contracts

An order service's events, held the way a Kafka schema registry holds
them: one shared CloudEvents-flavoured envelope, one closed payload
shape per event type, a discriminated union, and a compatibility gate
between contract versions. Producers vet before
publishing, consumers vet a whole stream sample with one command, and
CI refuses a revision that breaks subscribers. Each event type is the
envelope, narrowed by conjunction and sealed:

```
OrderPaid: close($.Envelope & {
  type: "order.paid"
  payload: close({
    order_id: re("^ord-[0-9a-f]{8}$")
    payment_ref: re("^psp-[a-z0-9-]{4,40}$")
    amount_cents: integer & min(1)
    method: "card" | "sepa" | "paypal" | "invoice"
  })
})
```

Pinning `type` to one string is what makes the union discriminated,
and `close()` keeps surplus keys off the wire. The contract versions
and the stream samples:
[`use-cases/07-event-contracts/`](../use-cases/07-event-contracts/).

## 08 — feature flags

The write-path case: a flag catalog with environment and tenant
overrides, mutated by `aontu set` into an overlay file the reviewed
base files never absorb. Ten sets of the same path collapse to a
single overlay line under `--in-place`, `why` attributes the served
value to the overlay with rank annotations, and a hostile overlay is
confined by `--trust`. The kill switch is a
concrete pin in the catalog, so no overlay of any rank can flip it —
`set` vets before writing and refuses with the pinning site named:

```
$ aontu set '$.flags.payments_legacy_gateway.enabled=true' --entry base.aon --overlay overlay.aon
verdict: invalid

$.flags.payments_legacy_gateway.enabled: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.flags.payments_legacy_gateway.enabled
  data: overlay.aon:2:48 (true)
  schema: base.aon:53:14 (false)
```

Exit 1, and the overlay is untouched (the case asserts both). The full
write loop: [`use-cases/08-feature-flags/`](../use-cases/08-feature-flags/).

## 09 — agent tools

An agent platform's tool registry: six tools with closed argument
schemas, rate limits, and side-effect classes, plus a runtime
guardrail that vets each `{tool, arguments}` call at `$.guard.<tool>`.
The four vet verdicts are a dispatcher's decision table (valid:
dispatch; invalid: refuse, feed the findings back; incomplete: ask for
the missing argument; error: unknown tool), and the case drives the
real `aontu-mcp` server over JSON-RPC too. The wire
schema is generated from the registry, so the two can never drift:

```
@"registry.aon"

guard: pack($.argschemas, close({
  tool: key()
  arguments: _
}))
```

`close()` survives the `_` clone, so a hallucinated argument on any
tool is a located `[aontu/closed]`. The registry, the calls, and the
MCP session: [`use-cases/09-agent-tools/`](../use-cases/09-agent-tools/).

## 10 — data model

An order-to-cash domain: customers with 64-bit upstream ledger ids,
orders, invoices, money. One document is at once the vet schema, the
referential-integrity checker, and the seed-data generator; money is
the stress test the `0d` exact-decimal literals exist for. The price
book pins its own sums, so an engine that computed them inexactly
could not produce output at all.

<!-- test: scenario exact-money -->

The smallest such theorem, lifted from the case's `seed.aon` — write
it as `reconcile.aon`:

<!-- test: file reconcile.aon -->
```aontu
reconcile: {
  centsPath: (10 + 20) & 30              # integer cents: exact
  exactPath: (0d0.1 + 0d0.2) & 0d0.3    # exact decimals: also exact
}
```

Evaluate it:

<!-- test: run -->
```sh
$ aontu reconcile.aon
{
  "reconcile": {
    "centsPath": 30,
    "exactPath": 0.3
  }
}
```

Binary64 arithmetic answers `0.30000000000000004` here; the pinned
`& 0d0.3` holds because `0d` values are exact, and the case's
`money-wire.aon` shows how that exactness crosses JSON. The domain and
its failed attempts, kept executable:
[`use-cases/10-data-model/`](../use-cases/10-data-model/).

## 11 — shared modules

The distribution story: a platform team's deployment contract,
vendored into a consumer repo and held by `mod tidy` / `verify` /
`vendor` / `manifest`, a one-line lockfile, and canon-hash integrity
pins. The pin survives a byte-different, meaning-identical module
refactor (a byte-hash lockfile breaks on exactly this), and a flipped
default in the vendored tree fails evaluation with both hashes named. A single file can freeze the hash in the import string, with no
`mod.aon` and no lockfile — the agent-sandbox mode:

```
svc: @"corp.example/schemas/service@1#aon1-zFHnyVa1fA--g8hTx8lUUhaKzzRUNI--2nDheIMsSFs"
svc: spec: { name: "audit-log", owner: "sec-ops@corp.example" }
# a tampered store is refused, both hashes named:
module integrity: corp.example/schemas/service@1 expected aon1-zFHnyVa1fA--g8hTx8lUUhaKzzRUNI--2nDheIMsSFs got aon1-NHmNT6r-Lhy8di9BgGNRfgwNFT3r5PgCZxCYnJ4F0Ws
```

The `#aon1-` pin resolves, verifies, and refuses a mangled hash with
the same integrity error. The publish gate and the whole vendoring
flow: [`use-cases/11-shared-modules/`](../use-cases/11-shared-modules/).

## 12 — relations

An ETL pipeline DAG: four jobs, one relation (`feeds`, with its
written-out inverse `fedBy`). The whole thing is declared once, at the
field, and data documents stay plain JSON-shaped string lists, with no
per-link boilerplate. A cycle or a missing
inverse refuses at generation with a located finding naming the loop
or the exact absent entry, and `aontu reaches --relation feeds`
answers the closure question directionally over the same edges. The
declaration, from the case's `spec.aon`:

```
feeds?: rel($.spec.JobShape) & acyclic() & inverse(fedBy)
fedBy?: rel($.spec.JobShape)
```

`rel(t)` makes the field's strings checked entity addresses and flows
the shape into every target, `re()` rides onto every address, and the
graph atoms are decided at generation, where every edge is known. The
DAG, its refusals, and the append proposal:
[`use-cases/12-relations/`](../use-cases/12-relations/).

## 13 — recursive schema

An approval chain: a `Step` is an approver, a decision, and optionally
the step that follows it. Writing `then?: $.spec.Step` inside `Step`
means the fixpoint, with no marker and no unrolled copies — the schema
applies at every depth, expanding one level per meet with concrete
data, so `vet` descends exactly as far as the data does. Canon and the
`aon1-` hash stay symbolic: one finite string pins an infinitely deep
type. The vocabulary, one reference deep, from `schema.aon`:

```
Step: {
  approver: string & re("^[a-z]+@acme[.]example$")
  decision: *pending | pending | approved | rejected
  then?: $.spec.Step
}
```

A *required* recursive tail refuses at generation with
`recursion_unexpanded` at the exact position no finite document can
fill; guardedness is emergent, because the data decides. The chain,
vetted as plain JSON: [`use-cases/13-recursive-schema/`](../use-cases/13-recursive-schema/).

## 14 — JSON Schema export

JSON Schema is the bridge out: an MCP tool's `inputSchema` must be
one, structured-output APIs constrain generation to one, OpenAPI
embeds one. `aontu jsonschema` exports the unified value as draft
2020-12 on stdout and names every loss on stderr; `--strict` turns a
lossy export into exit 1, and a dangling reference exports nothing
rather than a partial schema.

<!-- test: scenario jsonschema-export -->

Write a tool's argument schema as `registry.aon` (trimmed from the
case's registry):

<!-- test: file registry.aon -->
```aontu
argschemas: {
  read_file: close({
    path: string & re("^[A-Za-z0-9._/\\-]+$") & re("^[a-z]") & length(max(512))
    max_bytes?: integer & min(1) & max(1048576)
  })
}
```

Export it as the tool's `inputSchema`:

<!-- test: run -->
```sh
$ aontu jsonschema --at '$.argschemas.read_file' registry.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "max_bytes": {
      "maximum": 1048576,
      "minimum": 1,
      "type": "integer"
    },
    "path": {
      "allOf": [
        {
          "pattern": "^[A-Za-z0-9._/\\-]+$"
        },
        {
          "pattern": "^[a-z]"
        }
      ],
      "maxLength": 512,
      "minLength": 0,
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

The two `re()` calls cross as an `allOf` of patterns, the closed map
becomes `additionalProperties: false`, and the optional key stays out
of `required` — with stderr empty, nothing was lost. The three moods
of the bridge (exact, lossy, refused):
[`use-cases/14-jsonschema-export/`](../use-cases/14-jsonschema-export/).

## 15 — code generation

The model is the source of the code. One catalogue of record types
feeds a Go emitter, a TypeScript emitter and a SQL emitter, each
reading a different slice of it, with every emitted line computed by
the unifier. Names like `Email` and `credit_cents` are written in the
model rather than derived, because `upper()` uppercases a whole string
and there is no case conversion — and because what a type is called in
a target is a fact about the model, not a rule in a template.

<!-- test: scenario code-generation -->

Write the model and one emitter as `types.aon`:

<!-- test: file types.aon -->
```aontu
records: [
  {name: "Customer", fields: [
    {n: "id",    t: "string",  go: "ID"}
    {n: "email", t: "string",  go: "Email"}
  ]}
]
units: [&: {
  head: `type ` + .name + ` struct {`
  rows: [&: { out: `\t` + .go + ` ` +
        match(.t, "string", `string`, "integer", `int64`) +
        ` \`json:"` + .n + `"\`` }] & .fields
  body: pick(.rows, out)
  tail: `}`
}] & $.records
```

The struct header and its field lines both come out of the model:

<!-- test: run -->
```sh
$ aontu get $.units.0.head types.aon
"type Customer struct {"
$ aontu get $.units.0.body types.aon
[
  "\tID string `json:\"id\"`",
  "\tEmail string `json:\"email\"`"
]
```

A list spread rather than `pack`, because list order is source order
and map keys sort by code point. The rows are staged into a key of
their own because `pick` over an inline spread does not settle.

What is missing is the fold: a spread can put a separator after each
element, but putting one between N elements needs a reduction over
strings, and there is none — `sum` is numeric and `+` does not reduce
a list. So the case assembles the file outside the language, and its
generated SQL carries a trailing comma that a real parser refuses.
`join(bag, sep)` is
[G9 phase 2](capability-review/g9-transformation.md). The three
emitters, their goldens, and a check that both ports emit identical
bytes: [`use-cases/15-code-generation/`](../use-cases/15-code-generation/).


## 16 — module deps

A codebase's own module graph: twelve modules across four layers,
where the architecture rule is that nothing may depend on a layer
above it. The rule is a shape rather than a checking pass. `rel(t)`
flows its target shape into every module an edge names, so a core
module's `dependsOn` carries `layer: "core" | "util"` to the far end,
and a module that says `layer: "feature"` cannot meet it. Each layer
is one line of schema and one disjunction, from `spec.aon`:

```
Core:    $.spec.Mod & { layer: "core", dependsOn?: rel($.spec.CoreDep) }
CoreDep: { kind: mod, layer: "core" | "util" }
```

An upward edge then refuses at generation as an ordinary conflict
naming both sides, and a loop between two modules of the *same* layer
— which the layering allows — refuses under `acyclic()`. The same
edges are drawn two ways and pinned as goldens: a dependency tree,
with derived roots and every repeated subtree elided the way
`cargo tree` elides one, and a dependency-structure matrix. The
layered codebase, its refusals and its views:
[`use-cases/16-module-deps/`](../use-cases/16-module-deps/).

Where a page in these docs and a use case disagree, the case wins (its
checks run; the page does not). File the docs bug.
