# 06 — Kubernetes golden path: one service model, N manifests

**Question probed:** can a platform team replace Helm templates /
Kustomize copy-paste with Aontu today — one compact service model
fanning out into Kubernetes-shaped Deployment + Service manifests,
with per-service overrides, sealed shapes, and org guardrails?

**Short answer:** the fan-out core genuinely works and catches drift,
but three exit-0 silent-corruption bugs sit exactly on the compositions
a golden path needs, per-service data cannot be authored row-wise, and
the absence of arithmetic and string tooling forces real duplication.
Usable for a constrained golden path with `vet` as the safety net; not
yet a drop-in Helm replacement.

## The scenario

A payments platform team owns `platform.aon` (the golden path: hidden
machinery that fans out manifests). Product teams edit only
`services.aon` (the compact model: names, versions, tiers, ports, env
extras) and `overrides.aon` (reviewed exceptions at concrete generated
paths). `main.aon` unifies the three; evaluating it renders three
Deployments and three Services with images, labels, selectors, port
lists, env lists, and tiered resource blocks — no manifest is written
by hand. `guardrails.aon` vets the rendered JSON against org policy;
`request-schema.aon` gates agent-emitted onboarding candidates
(`data/onboard-*.json`). `check.sh` (35 assertions) drives all of it
plus 17 pinned probes.

## How the model is designed

- `pack($.svc.names, {...})` generates the Deployment skeleton; every
  name-derived field uses `key(n)` with hand-counted depth (`key(2)`
  for `metadata.name`, `key(6)` for the container name).
- **Column-oriented service model** (one map per attribute, keyed by
  service) — *forced*, not chosen: a pack template cannot project a
  field out of a row (gaps 4, 5). Each column arrives through its own
  pack merging onto the same generated children, with `_` as exactly
  the value that one nested position needs
  (`image: $.platform.registry + "/" + key(6) + ":" + _`).
- `each(_)` turns per-service port/env maps into k8s lists;
  `match(_, small, {...}, large, {...})` maps the tier column to
  resource blocks whose every quantity is a ranked default
  (`*"500m"|string`) so one field can still be overridden.
- Env vars merge at the *map* level (base & extras & per-service
  OTEL injection) inside a hidden derived pack, then become a list
  once — because generated lists cannot be appended to (gap 11).
- `close()` on the pack seals the service *set* (drift guard);
  per-child sealing is impossible without corruption (gap 1), so shape
  policing moved to `vet --closed`.
- `hide()` keeps all inputs and derived maps out of the rendered JSON.

## What worked (better than expected in places)

- **The core fan-out promise holds.** 40 lines of service model become
  ~340 lines of correct manifests, and an override composes exactly like
  editing plain data: `deploy: billing: spec: replicas: 6` beats the
  `*2` default; `resources: limits: cpu: "750m"` replaces one field of
  a match()-produced tier block while the sibling `memory: "512Mi"`
  default survives. This is the part Helm does with text and Aontu does
  with semantics, and Aontu's version is better.
- **Nested generation works**: `each()` inside a pack template fires
  per child; `key(n)` inside the inner template answers correctly for
  the final position (`key(3)`… `key(8)`); a nested pack × fixed list
  cross-product also worked in probing.
- **Drift is caught in both directions**: a version-column entry with
  no service is refused by the sealed set
  (`[aontu/closed] ... $.deploy.ghost-svc`), and a missing column entry
  leaves a required `image: string` ungenerable
  (`[aontu/mapval_no_gen]: Cannot resolve value at path $.deploy.auth.image`).
- **`hide()` separation is clean**: the rendered document contains
  *only* `deploy` and `service`; hidden inputs still feed generators.
- **`vet` is a real policy gate**: `min/max/re/length/unique/enums` over
  the rendered JSON caught replicas 50, a lowercase env name, and a
  unit-less `"512"` memory quantity in one run, each located by path;
  `--closed` caught a hallucinated container key; `--format json` is
  machine-readable; exit codes are reliable throughout.
- **Deterministic output** (sorted keys, stable list orders) makes
  byte-exact goldens practical.

## Gaps and friction

Severity: **critical** = silently wrong output, exit 0; **major** =
core scenario blocked or forced a redesign; **minor** = friction.

### 1. (critical) `key()` cross-wires when a closed template meets a second pack

Sealing each generated child is the obvious fix for gap 7 — and it
works with hand-written overrides. Add a second pack merging a column
onto the same children and every child gets the FIRST child's key.
`probes/inner-close-crosswire.aon`, exit 0:

```
deploy: close(pack($.names, close({ name: key(), extra: { p: integer } })))
deploy: pack($.col, { extra: _ })
```
```json
"auth": { "extra": { "p": 2 }, "name": "web" },
"web":  { "extra": { "p": 1 }, "name": "web" }
```

Without the inner `close()` the same model is correct. So you may have
per-child sealing OR column composition — never both, and picking wrong
is silent.

### 2. (critical) a `key()`-computed default evaluates once and is shared

The natural way to inject a per-service env value
(`OTEL_SERVICE_NAME`) is a ranked default in the each template:
`value: **key(3) | string`. It evaluates once; every service gets the
first service's name. `probes/pref-key-crosswire.aon`, exit 0:

```
out: pack($.col, { env: each($.shared, { value: **key(3) | string }) })
```
```json
"auth": { "env": [ { "name": "X", "value": "web" } ] },
"web":  { "env": [ { "name": "X", "value": "web" } ] }
```

Workaround (used in `platform.aon`): inject the value as a plain field
in the derived envmaps pack, where `key(2)` is evaluated per clone.

### 3. (critical) `hide(pack(...))` silently drops the template

```
envmaps: hide(pack($.col, _))
out: pack($.envmaps, { got: _ })
```
generates `"out": { "web": {} }` — exit 0, the data is just gone
(`probes/hide-pack-loss.aon`). Wrapping the enclosing map instead
(`internal: hide({ envmaps: pack(...) })`) works. One token of
difference between correct and silently empty.

### 4. (major) relative references inside a pack template do not resolve

`reference-language.md` ("Generating children") states: *"key() and
relative references inside the template answer for the child rather
than for the call."* For `key()` that is true; for relative references
it is not:

```
deploy: pack($.names, { cpu_m: 250, cpu: .cpu_m + "m" })
```
```
[aontu/no_path]: Cannot resolve value at path $.deploy.NaN.cpu
 Cannot resolve value: .cpu_m
```

(note the `NaN` key: the template is evaluated at its own location, and
that internal location leaks into the diagnostic). The same failure
hits `.raw.field` after stashing the row with `src: _`. Relative refs
DO rebind correctly in `&:` spread templates and in `each` templates at
concrete locations — the inconsistency is specifically pack templates.
**This is the single gap that forces the column-oriented model**: there
is no way to write `services: web: { replicas: 3, port: 8080 }` and
consume the fields at different nested manifest positions.

### 5. (major) no projection from the hole

`_.field` is not spellable (`probes/hole-member-access.aon`):

```
manifests: pack($.services, { portList: each(_.ports) })
```
```
[aontu/no_path]: Cannot resolve value at path $.manifests.NaN.portList
 Cannot resolve value: .unspellable.ports
```

(the diagnostic also contains a literal NUL byte — `grep` reports
"binary file matches" on the output).

### 6. (major) a pack over spread-augmented data deadlocks

The DRY fix for the port-entry duplication — derive `port`/`targetPort`
from `containerPort` with a nested spread, then pack over the column —
kills the whole model (`probes/spread-column-deadlock.aon`):

```
ports: &: &: { port: .containerPort, targetPort: .containerPort }
out: pack($.ports, { plist: each(_, { protocol: *TCP | string }) })
```
```
[aontu/mapval_no_gen]: Cannot resolve value at path $.out
 Cannot resolve value: pack({&:{&:{"port":.containerPort,...
```

The spread alone evaluates perfectly; feeding its result to a generator
never settles. Consequence in `services.aon`: every port entry is
authored four times over (`name`, `containerPort`, `port`,
`targetPort`) — copy-paste won this round. A second consequence: since
fields cannot be projected *away* either — a `hide(kind)` mark is lost
when a concrete value unifies in, probed directly:

```
x: { a: hide(integer), b: 2 }
x: a: 8080
   -> { "x": { "a": 8080, "b": 2 } }     # 'a' generated anyway
```

— both manifests carry the superset entry, and a strict k8s API server
would reject the extra fields. A real pipeline needs a post-filter.

### 7. (major) `close(pack(...))` does not seal the generated children

```
deploy: close(pack($.names, { replicas: *2 | integer }))
deploy: auth: replcias: 4
```
exits 0 with `"replcias": 4` sitting next to `"replicas": 2`
(`probes/close-shallow-typo.aon` + golden). The reference's "close()
seals the generated shape" is true only of the set of names. The
per-child fix triggers gap 1, so the model polices shapes with
`vet --closed` after rendering instead.

### 8. (major) defaults and bounds cannot coexist on a field

`replicas: (*2 | integer) & min(1) & max(20)` — the conjunct swallows
the default (`probes/default-with-bounds.aon`):

```
[aontu/mapval_no_gen]: Cannot resolve value at path $.replicas
 Cannot resolve value: integer&min(1)&max(20)
```

Moving the bounds into the branch — `*2 | (integer & min(1) & max(20))`
— generates, and any override *used to* skip the bounds entirely:
`replicas: 40` was accepted, exit 0.

> **2026-08-26: fixed by the preference admission gate (ADR-004) —
> assertions updated to the new behaviour.** The branch spelling now
> both defaults and enforces: `replicas: 40` is refused with
> `[aontu/|:empty]`, exit 1 (`probes/bound-bypass.aon`), while an
> in-range override is admitted and the unset field generates `2`.
> The conjunct spelling above remains the phase-1 limit, so
> `guardrails.aon` still covers policies stated that way.

### 9. (major) no arithmetic beyond `+`, no unit arithmetic

- `prod: $.base * 2` → `[aontu/unexpected]: unexpected character(s): *`
  (`probes/multiply.aon`). A 1.5× prod scale-up is not expressible at all.
- Doubling by self-addition works only on concrete values; against the
  golden path's own default it dies (`probes/double-from-default.aon`):
  `[aontu/mapval_no_gen] ... Cannot resolve value: $.base.replicas+$.base.replicas`.
- k8s quantities are opaque strings. The safe pattern is
  `512 + "Mi"` → `"512Mi"` and `(512 + 512) + "Mi"` → `"1024Mi"`
  (number + suffix at authoring time), because `+` on two quantities
  silently concatenates: `"256Mi" + "256Mi"` → `"256Mi256Mi"`, exit 0
  (`probes/quantity-concat.aon` + golden). In `platform.aon` the
  doubled tier limits are consequently written out by hand.

### 10. (major) `each()` transforms nothing — it only annotates

`each(data, tmpl)` MEETS each child with the template, so a compact
`ports: { http: 8080 }` cannot become `[{name: http, containerPort:
8080}]` (`probes/each-reshape-scalar.aon`):

```
[aontu/scalar_kind]: Cannot unify values at path $.list.0
 Cannot unify value: {"containerPort":9090,"name":key()} with value: 9090
```

And `key()` inside an each template is the destination *list index*,
not the source key — probed directly:

```
ports: { http: { containerPort: 8080 }, grpc: { containerPort: 9090 } }
list: each($.ports, { name: key() })
   -> [ { "containerPort": 9090, "name": "0" }, { "containerPort": 8080, "name": "1" } ]
```

so every port and env entry must repeat its own name in its value
(`http: { name: http, ... }`) — exactly the duplication the tool was
meant to remove.

### 11. (major) generated lists cannot be appended to

Lists unify by position, so "add one env var to this service" collides
with element 0 (`probes/env-append.aon`,
`[aontu/scalar_value]: Cannot unify values at path $.env.0.name`).
Workable, but only because the model merges env at the map level before
listification; a consumer of someone else's generated list has no move.

### 12. (major) `length(min(1))` fires before the generators merge

Requiring at least one port per service on the skeleton refuses a
model whose ports demonstrably arrive one pack later
(`probes/length-on-schema-list.aon`):

```
[aontu/constraint]: Cannot unify values at path $.deploy.web.ports
 Cannot unify value: length(integer&min(1)) with value: [&:{"containerPort":integer}]
```

The same constraint next to literal elements in one file works, so the
atom is checked against the spread-only schema list rather than the
settled value.

### 13. (minor) no join / split / format

A fleet-roster annotation (`"web,auth,billing"`) from the names list is
not expressible: `$.names + ","` →
`[aontu/mapval_no_gen] ... Cannot resolve value: $.names+","`
(`probes/join-list.aon`). Splitting `"team/name"` or zero-padding are
equally out. String assembly beyond binary `+` does not exist.

### 14. (minor) `key(n)` depth is counted by hand and is brittle

`key(2)` for `metadata.name`, `key(4)` for `selector.matchLabels.app`,
`key(6)` for the container name, `key(2)` again in the env-map pack.
Move a block one level and every count is stale; nothing names the
"pack child" level symbolically.

### 15. (minor) the real k8s name regex is outside the portable subset

```
n: string & re("^[a-z]([a-z0-9-]*[a-z0-9])?$")
```
```
[aontu/constraint_pattern]: ... It uses a quantifier applied to a group
containing another quantifier, which backtracks exponentially in JavaScript.
```

The upstream DNS-1123 pattern (verbatim from k8s docs) must be
rewritten as `^([a-z]|[a-z][a-z0-9-]*[a-z0-9])$` — accepted, and used
in `guardrails.aon` / `request-schema.aon`. Defensible policy,
surprising first contact.

### 16. (minor) lexical traps for k8s vocabulary

Bare `web-api` is a negation, not a string
(`[aontu/negative]: Cannot resolve value at path $.names.1`,
`probes/kebab-bare.aon`); bare `otel.acme.internal` parses as a
relative path reference and, being unresolvable, cascades into
`mapval_no_gen` errors on every *generator* in the model with the root
cause reported last. Kebab-case names and hostnames — most of a k8s
document — must all be quoted.

### 17. (minor) vet findings through a spread schema lose the child key

The tampered-manifest run reports
`[aontu/constraint]: Cannot unify values at path $.deploy.spec.replicas`
— it was `$.deploy.billing` that held replicas 50, but the path shows
the schema's `&:` position, not the data child, so the offending
service must be found by eye.

## Verdict

The unification model — defaults, overrides, sealing, vet — is exactly
the right *shape* for a golden path, and where it works it is cleaner
than Helm text templating by a wide margin. What blocks adoption today
is not missing sugar but (a) the pack-template reference gap that
forbids row-oriented service models, and (b) critical gaps 1–3: three
one-token-away compositions that produce wrong manifests with exit 0.
A platform team can ship this pattern now only by treating
`vet` + goldens as mandatory belt-and-braces — which `check.sh`
demonstrates — and by cargo-culting the safe idioms this directory
pins.
