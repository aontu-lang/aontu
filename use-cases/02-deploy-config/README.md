# Use case 02: multi-environment deployment configuration

A fleet of four services (`web`, `auth`, `billing`, `reports`) deployed
to three environments (`dev`, `staging`, `prod`) under four layers of
authority — org policy, team defaults, service catalog, per-environment
overlays — composed with `@` includes and gated in CI by `aontu vet`.
This is the Kubernetes-adjacent bread-and-butter that Helm values
files, Kustomize overlays and CUE all compete for, and the scenario the
"ground-truth system ontology" pitch has to win: many writers, one
document, and any contradiction between them must be a loud, located
error rather than a last-writer-wins surprise.

Run `./check.sh` (35 assertions, exit 0). Everything quoted below is
real CLI output (ANSI stripped), reproduced by the checks.

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
| `probes/*.aon` | one file per claim below, each pinned by `check.sh` |

## Design: which features carry it

- **Ranked preferences are the layering mechanism.** Observed semantics
  (pinned by `probes/rank-ladder.aon`): generation picks the **lowest**
  rank — the *fewer* stars, the *stronger* the default. `*warn` beats
  `**debug` beats `***info`, in any statement order, and a concrete
  value beats them all. The docs' phrase "a `*` of a `*` outranks a
  single `*`" describes the rank *number*, not who wins; read it the
  other way and every layered file inverts. So the ladder is: org
  `***`, team `**`, environment `*`, service pin concrete. Two
  disagreeing defaults of the *same* rank are a conflict
  (`[aontu/scalar_value]`), which is governance-friendly: two teams
  cannot both claim the same rank silently.
- **`pack()` over hidden tables** (`environments`, `fleet`) generates
  the per-env blocks and per-env workloads, so an environment or
  service cannot exist anywhere except its table — no drift by
  construction.
- **`close()` on the workload shape** (applied inside the pack
  template as `close($.defs.workload) & {...}`) makes every overlay
  key-checked. `deploy` itself is *not* closed (a workaround for
  gap 5 — fixed 2026-08-26, `close(pack(...))` is safe now); a hidden
  `envguard: hide($.deploy & close(pack($.environments, {})))` seals
  the environment set instead, kept as a worked example.
- **`filter()` + `pack()`** derive the prod paging policy from the
  catalog: only `critical: true` services get an alert route.
- **Constraint atoms live in `guardrails.aon`/`request-schema.aon`
  and are enforced with `vet`**, not in the build — forced by gaps 1
  and 2 below.
- **Derived arithmetic lives in `rollout:`**, a plain map outside the
  generated tree — forced by gap 4.

## What worked

- **The layered merge itself is exactly right.** Four layers, six
  files, one `aontu stack.aon`, and every value lands where the rank
  ladder says: dev logs `debug` (team `**` beats org `***`), prod logs
  `warn` (env `*`), prod `auth` logs `info` (concrete pin), billing
  runs 12 while the prod env default is 4. Order-independent,
  idempotent, no last-writer-wins anywhere.
- **Conflicts are located and attributable.** Two files pinning
  billing at 12 and 6 produce `[aontu/scalar_value]` at
  `$.deploy.prod.workloads.billing.replicas` naming *both* files with
  line and column (`probes/conflict.aon`; excerpt quirk in gap 9).
- **`close()` beats the Helm failure mode.** A misspelt overlay key is
  refused at its exact path, not silently ignored:

  ```
  [aontu/closed]: Cannot resolve value at path $.deploy.prod.workloads.auth.replcas
  Cannot add to closed structure. ...
    --> probes/typo-overlay.aon:7:41
  ```

  And the `envguard` idiom (a hidden meet of a clone of `deploy` with
  a closed pack of the env table) seals the environment set without
  touching the output tree — a typo'd `deploy: prod2:` overlay fails
  with `[aontu/closed]` pointing at the offending line. That the
  lattice is expressive enough to build this guard one line long is a
  genuine point for the language.
- **`why` at plain paths is real multi-layer attribution:**

  ```
  $.defs.workload.logLevel = **"debug"|string
    1. ***"info"|string  .../org-policy.aon:37:15
    2. **"debug"|string  .../team-defaults.aon:15:27
  ```

  (But see gap 3 for what happens at generated paths.)
- **`vet` is a properly engineered CI gate.** Exit codes are a
  contract (0/1/2/3/4); findings carry the code, the path, expected
  vs actual, and *both* the data and schema locations:

  ```
  $.replicas: constraint [conflict]
    [aontu/constraint]: Cannot unify values at path $.replicas
    expected: integer&min(1)&max(24)
    actual:   64
    data: data/rollout-bad.json:5:15 (64)
    schema: request-schema.aon:17:23 (integer&min(1)&max(24))
  ```

  `--format json` (and sarif) work. The hallucinated field in an
  agent candidate is refused by the schema's `close()` with the exact
  key path. The two-step pipeline — build, then vet the built JSON
  against `guardrails.aon` — is a solid pattern and, given gaps 1–2,
  the only sound place for bounds today.
- **`length()`, `unique()` and `must()` work — better than
  documented.** The language reference still says they "parse as
  `unknown_function` errors"; in the TypeScript engine all three
  evaluate. `must()` even surfaces the author's message in the
  report, which is exactly what a policy file wants:

  ```
  [aontu/must]: Cannot unify values at path $.replicas
  This value fails an evaluate-only check written with must().
  The author's message is: prod workloads need >= 2 replicas for zero-downtime rollouts
  ```

- **`set` is unification-honest.** It vets before writing
  (`verdict: valid` / `wrote:`), and refuses a change that contradicts
  a pinned value with a located conflict, leaving the file untouched —
  a safe primitive for an agent to hold.
- **Canon is a real review artifact.** `--canon` output is
  deterministic (goldened byte-for-byte in `check.sh`), one line,
  reparseable, and keeps defaults, ranks and spreads visible —
  reviewable policy, hashable for drift detection.
- **Include hygiene:** a probe reaching `@"../stack.aon"` warns
  `include resolved outside the entry root ... a future release will
  deny this by default`, with `--trust` / `--include-root` to control
  it. Right default posture for agent-written files.

## Gaps and friction

Severities: **critical** = silently wrong output/accepted violation;
**major** = a mainstream pattern is inexpressible or misleading;
**minor** = workaround is cheap and the failure is loud.

### 1. (major) A constraint conjunct swallows a ranked default

The obvious org-policy shape — a default *and* a bound on one field —
does not resolve (documented as a phase-1 limit, but it is the single
biggest obstacle to in-model policy):

```
replicas: *2 | integer
replicas: min(1) & max(24)
```
```
[aontu/mapval_no_gen]: Cannot resolve value at path $.replicas
 Cannot resolve value: integer&min(1)&max(24)
```

The same swallow happens *inside a `pack()` template* even for a bare
kind: `{replicas: integer} & {replicas: ***1 | integer}` as a template
fails with the identical error, although the same meet at a plain path
resolves fine. Consequence: schema rows for defaulted fields must carry
the default *themselves* and nothing else — see `org-policy.aon`'s
header comment — and bounds must move to `vet` (gap 2 closes the other
exit).

### 2. (critical) The disjunct form lets an override bypass the bound

> **2026-08-26: fixed by the preference admission gate (ADR-004) —
> assertions updated to the new behaviour.** An override must now be
> admitted by an alternative of the disjunction (or equal the
> preferred value), so `probes/bypassed-bound.aon` refuses `40` with
> `[aontu/|:empty]`, exit 1, and the disjunct form both defaults AND
> enforces. The original finding below is kept as the record; gap 1
> (the conjunct form) remains the documented phase-1 limit.

The advertised workaround for gap 1 ("use the disjunct form") was a
policy hole. `probes/bypassed-bound.aon`:

```
replicas: *2 | (integer & min(1) & max(24))
replicas: 40
```

evaluated with **exit 0** and generated `{"replicas": 40}` — the
concrete peer replaced the default by *kind* alone and was never tested
against the constrained branch. So a field could not both have a
default and an enforced bound in the model: conjunct form kills the
default (gap 1), disjunct form killed the bound. This is why
`guardrails.aon` exists and why `check.sh` vets the built output.

### 3. (major) `why` is blind through `pack()` — attribution stops at the generator

At a generated workload path, the org and team layers that actually
supplied the value are invisible:

```
$ aontu why '$.deploy.dev.workloads.web.logLevel' stack.aon
$.deploy.dev.workloads.web.logLevel = **"debug"|string
  (no contributions: nothing met at this path)
```

Overlay contributions that arrive via a spread fare little better —
located only as `(spread)`:

```
$.deploy.prod.workloads.billing.replicas = 12
  1. *4|integer  (spread)
  2. *4|integer  .../envs/prod.aon:11:13
  3. 12  .../envs/prod.aon:18:13
```

For the flagship "why is prod configured this way?" question, the
answer is complete only for values written literally at their final
path. Since `pack()` is also the anti-drift mechanism, the two
headline features currently undercut each other.

### 4. (major) No computed value can live in — or be merged into — a generated child

Four attempts, four failures; `rollout:` in `stack.aon` is the
workaround (compute outside the tree, referencing concrete pins):

- Relative reference in a pack template (`surge: .replicas + 1`), with
  a `NaN` path segment in the diagnostic and the identical error
  repeated once per generated child (12 copies for a 2-env probe,
  36 for the 3-env model):

  ```
  [aontu/no_path]: Cannot resolve value at path $.deploy.NaN.surge
   Cannot resolve value: .replicas
  ```

- The same expression merged from an overlay *onto* a pack-generated
  child (absolute references included):

  ```
  [aontu/mapval_spread_required]: Cannot unify values at path $.workloads.auth.maxSurge
  The value for key maxSurge is required (defined in spread).
   Cannot unify value: .replicas+1 with value: nil
  ```

  A concrete `maxSurge: 13` merges fine at the same spot — only
  deferred expressions die, and the "(defined in spread)" message
  points at nothing the author wrote.

- Field access on the pack hole (`surge: _.replicas + 1`):

  ```
  Cannot resolve value: . unspellable.replicas
  ```

- In a *nested* pack, the inner template's `_` binds to the **outer**
  source child — here the env name, not the fleet entry:

  ```
  [aontu/scalar_kind]: Cannot unify values at path $.deploy.dev.services.web
   Cannot unify value: {"replicas":1,"surge":.replicas+1} with value: "dev"
  ```

  Workaround used in `stack.aon`: never use `_` below the first
  generator; merge catalog data via a duplicate key
  (`workloads: copy($.fleet)` next to `workloads: pack(...)`).

### 5. (critical, FIXED 2026-08-26) `close(pack(d, _ & t))` + overlay

**Fixed by the template-clone isolation change (ADR-005):** a hole
belongs to its nearest enclosing generator, so `close()` around the
generator no longer exposes the template's `_` to the overlay.
Historically, sealing the generator directly, then merging an ordinary
overlay statement, absorbed the overlay into the *template*: every
environment grew a bogus `prod:` child, the real `prod.x` kept the
default, and the run **exited 0**. `probes/close-pack-absorb.aon` now
pins the CORRECT merge:

```
deploy: close(pack($.environments, _ & { x: ***1 | integer }))
deploy: prod: x: 2
```
```json
{"deploy": {"dev": {"p": false, "x": 1},
            "prod": {"p": true, "x": 2}}}
```

The shared spec pins the behaviour in both engines
(`test/spec/gen-close.tsv`, `close-pack-hole-overlay-merges`), so
`close(pack(...))` is safe to write directly; `stack.aon` keeps the
`envguard` idiom as a worked example of sealing without touching the
tree. (Still open: a cross-statement spread aimed at a pack-generated
map misplaces — `deploy: &: {workloads: X}` landed as
`deploy.<env>.workloads.workloads` in probing.)

### 6. (major) Stacked spreads on one map cross-wire sibling children

`guardrails.aon` originally combined a generic rule
(`deploy: &: {workloads: &: {...}}`) with a prod-only floor
(`deploy: prod: workloads: &: {...}`). Vetting the built output
against that schema unifies *sibling services with each other* — both
sides of the conflict are data:

```
$.deploy.prod.workloads.billing.port: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.deploy.prod.workloads.billing.port
  data: expected/stack.json:85:19 (8082)
  data: expected/stack.json:74:19 (8081)
```

Pinned by `probes/spread-crosswire.aon`. Workaround: per-environment
spreads referencing one hidden block (current `guardrails.aon`).

### 7. (major) Arithmetic: `+` only, and only over concrete operands

Doubling a replica count for a surge window is unwritable — `*` is the
preference marker, so there is no multiplication (or `-`, `/`, `%`,
min/max-of-two-numbers):

```
[aontu/unexpected]: unexpected character(s): *
  2 | s: $.r * 2
             ^ unexpected character(s): *
```

And even `+ 1` fails against the idiomatic default form, so derived
values only work downstream of concrete pins:

```
replicas: *4 | integer
surgeReplicas: $.replicas + 1
```
```
[aontu/mapval_no_gen]: Cannot resolve value at path $.surgeReplicas
 Cannot resolve value: $.replicas+1
```

For Kubernetes-shaped config (HPA percentages, memory = requests * 2,
maxUnavailable = ceil(replicas/4)) this is a real ceiling. CUE does
all of these.

### 8. (major) No projection: a field cannot be collected across a map

"Every service port must be unique" is a natural org rule and
`unique()` exists (and works), but nothing can *produce* the list of
ports from `fleet`: `each`/`pack` map whole children, `_.port` is
unspellable (gap 4), and there is no comprehension. The uniqueness
policy is inexpressible without hand-maintaining a second list — the
drift `pack()` exists to prevent.

### 9. (minor) Cross-file conflict excerpts render the wrong file's text

The two conflict sites carry the *correct* file:line:col, but both
excerpts show the entry file's source, caret mid-comment
(`probes/conflict.aon`; same for included layers generally):

```
 Cannot unify value: 12 with value: 6
  --> probes/conflict-capacity.aon:3:45
  3 | # the conflict is attributable (README, "What worked", though note the
                                                  ^ value was: 12
```

Line 3 of `conflict-capacity.aon` is actually
`deploy: prod: workloads: billing: replicas: 12`. Locations right,
evidence misleading — bad for the CI-log reader and worse for an
agent quoting the excerpt.

### 10. (minor) `set` and `@` layering don't compose

`set --entry --overlay` composes the two documents itself. If the
overlay is *also* `@`-included by the entry (the natural arrangement in
this very use case), the overlay is counted twice and updating an
existing value always conflicts; `--in-place` then reports the
confusing `would replace: ... 5 -> 9` followed by `verdict: invalid`
against its own replacement. Works cleanly only for overlay files kept
*outside* the include graph (as `check.sh` demonstrates), meaning an
agent cannot use `set` to *change* a value the stack already pins —
only to add overriding-a-default values.

### 11. (minor) Bare words reject `-`, the most common byte in infra naming

`eu-west-1`, `payments-platform`, `IfNotPresent`-style values are
everywhere in this domain; hyphenated ones must be quoted:

```
[aontu/unexpected]: unexpected character(s): -
  1 | region: eu-west-1
                ^ unexpected character(s): -
```

Loud and trivially fixed, but it will hit every first-time k8s user in
their first minute.

## Verdict: is the layering competitive with Helm / Kustomize / CUE?

**The composition core is better than Helm and Kustomize.** Typed,
order-independent merges; a three-deep default ladder with loud
equal-rank collisions; conflicts, typos and unknown environments
refused at exact paths with error codes; attribution (`why`), a
review-stable canon, and a vet gate with real exit-code discipline.
None of that exists in `helm template` + `values.yaml`, where a
misspelt key is simply ignored.

**The generator layer is where it loses to CUE today.** The moment
`pack()` enters — and it must, for anti-drift — attribution goes blind
(gap 3), computed fields die (gap 4), `close()` corrupted silently
(gap 5 — fixed 2026-08-26), and spreads cross-wire (gap 6). Combined with no arithmetic
beyond `+` (gap 7), no projection (gap 8) and the default-vs-bound
dilemma (gaps 1–2), real policies end up split between the model and a
side-car vet schema. The split (build then vet) is workable — this use
case ships it green — but CUE expresses the same fleet with
comprehensions, arithmetic and in-model bounds in one document. Fixing
gaps 2, 3, 4 and 5 would flip that comparison for the golden path.
