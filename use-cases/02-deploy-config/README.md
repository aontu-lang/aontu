# 02 — multi-environment deployment configuration

A fleet of four services (`web`, `auth`, `billing`, `reports`) deployed
to three environments (`dev`, `staging`, `prod`) under four layers of
authority (org policy, team defaults, service catalog, per-environment
overlays), composed with `@` includes and gated in CI by `aontu vet`.
This is the shape Helm values files and Kustomize overlays are written
for: many writers, one document, and any contradiction between them
must be a loud, located error rather than a last-writer-wins surprise.

Everything quoted below is real CLI output (ANSI stripped), reproduced
by `check.sh`.

![The model tree: three environments, each a fleet of workloads, plus the alert and rollout derivations](expected/diagram-doc.svg)

## Files

| File | Layer / role |
|---|---|
| `org-policy.aon` | org: workload shape (closed), org-rank `***` defaults |
| `team-defaults.aon` | team: `**` defaults, release train, on-call |
| `fleet.aon` | service catalog — the source `pack()` iterates |
| `envs/{dev,staging,prod}.aon` | overlays: `*` defaults via `&:` spreads + concrete pins |
| `stack.aon` | entry: includes, `pack()` per env, `envguard`, `filter()` alerts, rollout arithmetic |
| `guardrails.aon` | org bounds, enforced by `vet` over the **built** output |
| `request-schema.aon` | gate for agent-emitted change candidates (`data/*.json`) |
| `probes/*.aon` | one file per behaviour below, each pinned by `check.sh` |

Probes that reach `@"../stack.aon"` resolve an include outside their
own entry root; the CLI warns once per such include, `--trust system`
keeps it, and `--include-root` confines it.

## The model tree

`stack.aon` is the entry: four layers of authority unified into one
document. `deploy` holds one map per environment and each of those a
map of workloads; `fleet` is the service catalog `pack()` iterates,
`org`, `team` and `environments` the layers it draws on, and `alerts`,
`rollout` and `envguard` what the document DERIVES from all of it.

```
$
├── alerts
│   ├── auth (3)
│   └── billing (3)
├── defs
│   └── workload (9)
├── deploy
│   ├── dev (3)
│   ├── prod (3)
│   └── staging (3)
├── envguard
│   ├── dev (3)
│   ├── prod (3)
│   └── staging (3)
├── environments
│   ├── dev (2)
│   ├── prod (2)
│   └── staging (2)
├── fleet
│   ├── auth (3)
│   ├── billing (3)
│   ├── reports (3)
│   └── web (3)
├── org
│   ├── name "acme"
│   ├── registry "registry.acme.internal"
│   └── runbookBase "https://runbooks.acme.internal"
├── release
│   └── tag "2025.34.2"
├── rollout
│   └── billingProdMaxSurge 13
└── team
    ├── name "payments"
    └── oncall "#payments-oncall"
```

`aontu view doc --depth 2 stack.aon` draws it, and `check.sh` pins it
with `--out --check`. A key with `(n)` after it is a container the
depth bound stopped at, and `n` is how many keys are not drawn; a
leaf carries its canon, which is the kind of thing it is rather
than its value.

## Design: which features carry it

- **Ranked preferences are the layering mechanism.** Generation picks
  the **lowest** rank — the *fewer* stars, the *stronger* the default.
  `*warn` beats `**debug` beats `***info`, in any statement order, and
  a concrete value beats them all (`probes/rank-ladder.aon`). So the
  ladder is: org `***`, team `**`, environment `*`, service pin
  concrete. Two disagreeing defaults of the *same* rank are a conflict
  (`[aontu/pref_rank_clash]`), which is governance-friendly: two teams
  cannot both claim the same rank silently.

  Four layers, six files, one `aontu stack.aon`, and every value lands
  where the ladder says: dev logs `debug` (team `**` beats org `***`),
  prod logs `warn` (env `*`), prod `auth` logs `info` (concrete pin),
  billing runs 12 while the prod env default is 4. Order-independent,
  idempotent, no last-writer-wins anywhere.

- **`pack()` over hidden tables** (`environments`, `fleet`) generates
  the per-env blocks and per-env workloads, so an environment or
  service cannot exist anywhere except its table — no drift by
  construction. The catalog's static facts arrive through
  `workloads: copy($.fleet)` beside the generator; the pack template
  adds the generated fields (`service: key()` and the image name).

- **`close()` on the workload shape** (applied inside the pack
  template as `close($.defs.workload) & {...}`) makes every overlay
  key-checked. A misspelt overlay key is refused at its exact path,
  not silently ignored:

  ```
  [aontu/closed]: Cannot resolve value at path $.deploy.prod.workloads.auth.replcas
  Cannot add to closed structure. ...
    --> probes/typo-overlay.aon:7:41
  ```

  `deploy` itself is left open. A hidden
  `envguard: hide($.deploy & close(pack($.environments, {})))` seals
  the environment set instead: a meet of a clone of `deploy` with a
  closed pack of the env table, one line long, that never touches the
  output tree. A typo'd `deploy: prod2:` overlay fails with
  `[aontu/closed]` at `$.envguard`, pointing at the offending line.
  `close(pack(...))` also composes with an overlay directly
  (`probes/close-pack-absorb.aon`); the overlay lands on the generated
  child:

  ```
  deploy: close(pack($.environments, _ & { x: ***1 | integer }))
  deploy: prod: x: 2
  ```
  ```json
  {"deploy": {"dev": {"p": false, "x": 1},
              "prod": {"p": true, "x": 2}}}
  ```

- **Conflicts are located and attributable.** Two files pinning
  billing at 12 and 6 produce `[aontu/scalar_value]` at
  `$.deploy.prod.workloads.billing.replicas` naming *both* files with
  line and column (`probes/conflict.aon`). A layer cannot remove a
  lower layer's key either: unification only adds information, so
  `null` over a boolean is `[aontu/scalar_kind]`
  (`probes/remove-key.aon`).

- **`why` is multi-layer attribution**, at plain paths and through
  the generator alike:

  ```
  $ aontu why '$.defs.workload.logLevel' stack.aon
  $.defs.workload.logLevel = **"debug"|***"info"|string
    1. ***"info"|string  .../org-policy.aon:33:15
    2. **"debug"|string  .../team-defaults.aon:15:27

  $ aontu why '$.deploy.dev.workloads.web.logLevel' stack.aon
  $.deploy.dev.workloads.web.logLevel = **"debug"|***"info"|string
    1. **"debug"|***"info"|string  .../team-defaults.aon:15:27

  $ aontu why '$.deploy.prod.workloads.billing.replicas' stack.aon
  $.deploy.prod.workloads.billing.replicas = 12
    1. *4|integer  .../envs/prod.aon:11:13  (spread)
    2. 12  .../envs/prod.aon:18:13
    3. ***2|integer  .../org-policy.aon:32:15
  ```

  A value that reached a generated path by being copied is reported as
  the value the author wrote, at the line they wrote it on, and a
  spread contribution carries its real position.

- **`filter()` + `pack()`** derive the prod paging policy from the
  catalog: only `critical: true` services get an alert route, so
  adding a critical service to the catalog creates its paging route in
  the same commit.

- **Constraint atoms live in `guardrails.aon` and
  `request-schema.aon` and are enforced with `vet`** over the built
  output, where every value is concrete: build, then vet the built
  JSON. Exit codes are a contract (0/1/2/3/4); findings carry the
  code, the path, expected vs actual, and *both* the data and schema
  locations:

  ```
  $.replicas: constraint [conflict]
    [aontu/constraint]: Cannot unify values at path $.replicas
    expected: integer&min(1)&max(24)
    actual:   64
    data: data/rollout-bad.json:5:15 (64)
    schema: request-schema.aon:17:23 (integer&min(1)&max(24))
  ```

  `--format json` and `--format sarif` emit the same findings for
  machines. A hallucinated field in an agent candidate is refused by
  the schema's `close()` with the exact key path, and `length()`
  bounds the free-text rationale. `must()` carries the author's
  message into the report, which is what a policy file wants:

  ```
  [aontu/must]: Cannot unify values at path $.replicas
  This value fails an evaluate-only check written with must().
  The author's message is: prod workloads need >= 2 replicas for zero-downtime rollouts
  ```

  `guardrails.aon` spreads the workload rules per environment from one
  hidden `common` block; the stacked spelling, one generic block under
  `deploy: &: {workloads: &: ...}` plus a prod-only floor
  (`probes/spread-crosswire.aon`), vets the built output as valid too.
  Defaults and bounds also compose inside a model: `replicas: *2 |
  integer` beside `replicas: min(1) & max(24)` generates 2
  (`probes/lost-default.aon`), and `replicas: *2 | (integer & min(1) &
  max(24))` refuses an override of 40 with `[aontu/empty]`
  (`probes/bypassed-bound.aon`), so one field carries both a default
  and an enforced bound.

- **Projection over the catalog.** `unique(port)` states "every
  service port must be unique" directly on the fleet
  (`probes/unique-port.aon`: two services sharing 8080 are refused
  with `[aontu/constraint]`). `pick($.fleet, port)` produces the list
  where the ports are wanted as a value rather than only checked (a
  firewall rule, say), and `least`/`greatest`/`sum` fold it
  (`probes/pick-ports.aon`).

- **Derived arithmetic lives in `rollout:`**, a plain map outside the
  generated tree, and reads a concrete pin: billing's prod
  `replicas + 1` is 13. The operand has to be concrete; against a
  ranked default such as `*4 | integer` the sum is
  `[aontu/mapval_no_gen]` (`probes/surge-from-default.aon`). `*` is
  the preference marker, not multiplication: `$.replicas * 2` is a
  parse error (`[aontu/unexpected]`, `probes/multiply.aon`), and
  doubling is written `mul($.replicas, 2)`.

- **`set` is unification-honest.** It vets before writing
  (`verdict: valid` / `wrote:`), and refuses a change that contradicts
  a pinned value with a located conflict, leaving the file untouched —
  a safe primitive for an agent to hold. The overlay it writes is a
  file the entry does not include: `set` composes entry and overlay
  itself, and an entry that includes both makes the change effective.

- **Canon is deterministic.** `--canon` output is goldened
  byte-for-byte in `check.sh`: one line, reparseable, with defaults,
  ranks and spreads still visible, so the policy can be read as a
  whole and hashed for drift detection.

## What check.sh proves

1. The build matches `expected/stack.json` (four layers, three
   environments, four services), and `--canon` matches
   `expected/stack.canon.txt` byte for byte.
2. Values land where the rank ladder says (`aontu get`): prod billing
   replicas 12 (concrete pin beats the env default); prod web 4 and
   dev web 1 (env `*` defaults); dev `logLevel` `debug` (team `**`
   beats org `***`); prod `logLevel` `warn` (env `*` beats both); prod
   auth `logLevel` `info` (concrete pin beats every rank); staging
   `tracing` `true` (team default survives with no env override); prod
   `tracing` `false` (concrete env mandate).
3. `$.rollout.billingProdMaxSurge` is 13: `replicas + 1` from a
   concrete pin, outside the generated tree.
4. `$.alerts.billing.runbook` is generated from the catalog by
   `filter()` over `critical: true` and `pack()`.
5. `why` on `$.defs.workload.logLevel` names both `org-policy.aon` and
   `team-defaults.aon` with their ranks and lines; on
   `$.deploy.prod.workloads.billing.replicas` it names `envs/prod.aon`
   and the pin 12; on the generated `$.deploy.dev.workloads.web.logLevel`
   it names `team-defaults.aon` and the winning `debug`.
6. `vet guardrails.aon expected/stack.json` is `verdict: valid`.
7. Agent candidates: `rollout-good.json` is valid; `rollout-bad.json`
   is refused with three located `[aontu/constraint]` findings
   (`$.service`, `$.replicas` against `max(24)`, `$.reason` via
   `length`); `rollout-unknown-key.json` is refused by `close()` at
   `$.forceRestart` (`[aontu/closed]`); `--format json` emits
   `"code": "constraint"`.
8. The rank ladder golden (`probes/rank-ladder.aon`): `*` beats `**`
   beats `***`, concrete beats all, in any statement order.
9. Two disagreeing defaults of equal rank are
   `[aontu/pref_rank_clash]` (`probes/equal-rank.aon`).
10. A cross-file conflict is `[aontu/scalar_value]` at
    `$.deploy.prod.workloads.billing.replicas`, naming both
    `conflict-capacity.aon` and `conflict-costcut.aon`
    (`probes/conflict.aon`).
11. A misspelt overlay key is `[aontu/closed]` at
    `$.deploy.prod.workloads.auth.replcas` (`probes/typo-overlay.aon`).
12. An unknown environment is `[aontu/closed]` at `$.envguard`, naming
    `prod2` (`probes/env-typo.aon`).
13. A layer cannot remove a lower layer's key: `null` over a boolean is
    `[aontu/scalar_kind]` (`probes/remove-key.aon`).
14. `$.replicas * 2` is a parse error, `[aontu/unexpected]`
    (`probes/multiply.aon`); `$.replicas + 1` against `*4 | integer` is
    `[aontu/mapval_no_gen]` (`probes/surge-from-default.aon`).
15. `unique(port)` refuses two services sharing a port with
    `[aontu/constraint]` at `$.fleet` (`probes/unique-port.aon`);
    `pick($.fleet, port)` produces the port list and `least()` reads
    its floor, 8080 (`probes/pick-ports.aon`).
16. Stacked spreads at different depths (`probes/spread-crosswire.aon`)
    vet the built output as valid.
17. `must()` fires with the author's own message, `[aontu/must]`
    (`probes/must-floor.aon`).
18. A ranked default beside a bound generates the default:
    `replicas: *2 | integer` with `replicas: min(1) & max(24)` gives 2
    (`probes/lost-default.aon`); an override outside a disjoined bound
    is refused with `[aontu/empty]`, exit 1
    (`probes/bypassed-bound.aon`).
19. `close(pack(...))` with an overlay merges onto the generated child,
    matching `expected/close-pack-absorb.json`
    (`probes/close-pack-absorb.aon`).
20. `set`: an override of a default
    (`$.deploy.prod.workloads.web.replicas=8`) is vetted
    (`verdict: valid`), written to the overlay (`wrote:`), and visible
    on re-evaluation through an entry that includes both files; a
    change that conflicts with a pinned value (billing replicas 14
    against the pin 12) is refused with `[aontu/scalar_value]`, exit 1,
    and no overlay file is written.

## Running it

From this directory, `./check.sh` runs all 37 assertions and exits 0.
The pipeline the checks drive, by hand:

```sh
aontu stack.aon > built.json              # build the deployment document
aontu vet guardrails.aon built.json       # org bounds over the built output
aontu vet request-schema.aon data/rollout-good.json   # gate an agent candidate
```
