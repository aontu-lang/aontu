# 06. Kubernetes golden path: one service model, N manifests

![The model tree: the compact service model beside the Kubernetes manifests it fans out to](expected/diagram-doc.svg)

## The scenario

A payments platform team owns `platform.aon`, the golden path: hidden
machinery that fans one compact service model out into
Kubernetes-shaped Deployment and Service manifests. Product teams edit
only `services.aon` (the compact model: names, versions, tiers, ports,
env extras) and `overrides.aon` (reviewed exceptions, written at
concrete generated paths). `main.aon` unifies the three; evaluating it
renders three Deployments and three Services with images, labels,
selectors, port lists, env lists, and tiered resource blocks, and no
manifest is written by hand. `guardrails.aon` vets the rendered JSON
against org policy, and `request-schema.aon` gates agent-emitted
onboarding candidates (`data/onboard-*.json`).

This is the job Helm templates and Kustomize overlays do with text.
Here the fan-out, the defaults, the overrides, and the sealing are all
unification, so an override composes like editing plain data and a
contradiction between the model and its policy is a located error.

Everything quoted below is real CLI output (ANSI stripped).

## The model tree

`main.aon` unifies the golden path with what the product team writes.
The compact model is `svc`; `deploy` and `service` are the Kubernetes
manifests the machinery in `platform` renders from it, one per service,
and `internal` is the working shape it renders through.

```
$
├── deploy
│   ├── auth (4)
│   ├── billing (4)
│   └── web (4)
├── internal
│   └── envmaps (3)
├── platform
│   ├── baseEnv (3)
│   ├── namespace "payments"
│   └── registry "registry.acme.io/payments"
├── service
│   ├── auth (4)
│   ├── billing (4)
│   └── web (4)
└── svc
    ├── extraEnv (3)
    ├── names (3)
    ├── ports (3)
    ├── tier (3)
    └── version (3)
```

`aontu view doc --depth 2 main.aon` draws it, and `check.sh` pins it
with `--out --check`. A key with `(n)` after it is a container the
depth bound stopped at, and `n` is how many keys are not drawn; a
leaf carries its canon, which is the kind of thing it is rather
than its value.

## How the model is designed

- `pack($.svc.names, {...})` generates the Deployment skeleton. `key(n)`
  counts levels up from the position where it is written, so every
  name-derived field states its depth: `key(2)` for `metadata.name`,
  `key(4)` for `selector.matchLabels.app`, `key(6)` for the container
  name.
- **The service model is column-oriented**: one map per attribute
  (`version`, `tier`, `ports`, `extraEnv`), keyed by service name. Each
  column arrives through its own pack merging onto the same generated
  children, with `_` as exactly the value that one nested position
  needs (`image: $.platform.registry + "/" + key(6) + ":" + _`). Drift
  between the columns is caught in both directions: a version entry
  with no service is refused by the sealed set (`[aontu/closed]` at
  `$.deploy.ghost-svc`), and a service with no version entry leaves the
  required `image: string` ungenerable (`[aontu/mapval_no_gen]` at
  `$.deploy.auth.spec.template.spec.containers.0.image`).
- `each(_)` turns the per-service port and env maps into Kubernetes
  lists. `each()` meets each child with its template, so port entries
  are authored as maps, and `key()` inside an `each` template answers
  the destination list index, so every port and env entry carries its
  own name in its value (`http: { name: http, ... }`).
- `match(_, small, {...}, large, {...})` maps the tier column to
  resource blocks. Every quantity in a block is a ranked default
  (`*"500m" | string`), so an override replaces one field while the
  sibling defaults survive. Quantities are strings (`"500m"`,
  `"512Mi"`), and `+` on two strings concatenates, so a computed
  quantity keeps the number and the unit apart: `mul(512, 2) + "Mi"` is
  `"1024Mi"`.
- Env vars merge at the map level (the platform's `baseEnv`, the team's
  `extraEnv` column, and a per-service `OTEL_SERVICE_NAME` injected
  from `key(2)`) inside the hidden `internal.envmaps` pack, and become
  a list once. Lists unify by position, so the list is derived from the
  merged map rather than appended to.
- `close()` around the `deploy` and `service` packs seals the set of
  generated children, so a column entry for a service the pack did not
  generate is refused. The seal covers the set and not each child's
  keys, so the shape of every rendered manifest is checked by
  `vet --closed` over the rendered JSON.
- `hide()` keeps `svc`, `platform`, and `internal` out of the rendered
  document, which contains only `deploy` and `service`; hidden inputs
  still feed the generators.
- Org bounds live in `guardrails.aon` and are enforced by `vet` over
  the rendered manifests, where every value is concrete. `re()` accepts
  a portable subset of regular-expression syntax and refuses a
  quantifier applied to a group that contains another quantifier
  (`[aontu/constraint_pattern]`), so the DNS-1123 name pattern is
  written as the alternation `^([a-z]|[a-z][a-z0-9-]*[a-z0-9])$` in
  both `guardrails.aon` and `request-schema.aon`.
- Kebab-case names and dotted hostnames are quoted: bare `web-api`
  parses as a negation (`[aontu/negative]`) and bare
  `otel.acme.internal` as a path reference.

## What check.sh proves

1. `aontu main.aon` matches `expected/manifests.json` byte for byte:
   three services fan out to three Deployments and three Services, and
   the hidden inputs do not render.
2. Values land where the model says (`aontu get`): billing replicas 6
   (the override beats the `*2` default); web replicas 2 (the default
   applies untouched); web CPU limit `"750m"` (a one-field override on
   the tier block) beside memory limit `"512Mi"` (the sibling tier
   default survives); billing CPU request `"1000m"` (`match()` picked
   the large tier); billing image
   `"registry.acme.io/payments/billing:2.0.0"` (registry, `key(6)`, and
   the version column concatenated); auth Service port 9090 (the grpc
   port generated from the shared ports column); auth `metadata.name`
   `"auth"` (`key(2)` inside the pack template).
3. The billing env list carries `LOG_LEVEL` `debug` (the team's
   map-level override beats the `*info` default) and
   `OTEL_SERVICE_NAME` `billing` (injected per service).
4. `vet guardrails.aon expected/manifests.json` is `verdict: valid`.
5. `vet guardrails.aon data/manifests-tampered.json` is refused with
   three located `[aontu/constraint]` findings: replicas 50 against
   `max(20)`, the lowercase env name `log_level` against the env-name
   pattern (at `...containers.0.env.name`), and the unit-less memory
   quantity `"512"` against `re("^[0-9]+(Mi|Gi)$")`. Each finding
   names the data line and the schema line.
6. `vet --closed guardrails.aon data/manifests-unknown-key.json`
   refuses the unknown container key `restartPolicyy` with
   `[aontu/closed]` at `...containers.0`.
7. Onboarding candidates: `data/onboard-good.json` is `verdict: valid`;
   `data/onboard-bad.json` is refused at every field: `$.service` (the
   DNS-1123 pattern and `length(max(24))`), `$.version`, `$.tier`
   (outside the enum, `[aontu/empty]`), `$.port`, `$.reason`
   (`length(min(12))`), and the extra key `$.forceDeploy`
   (`[aontu/closed]`); `--format json` emits `"code": "constraint"`.
8. Drift guard: a version-column entry with no service
   (`svc: version: "ghost-svc": "9.9.9"` unified with `main.aon`) is
   refused by the sealed set, `[aontu/closed]` at `$.deploy.ghost-svc`.
9. `$.base * 2` is a parse error, `[aontu/unexpected]`: `*` is the
   preference marker, and doubling is written `mul($.base, 2)`
   (`probes/multiply.aon`).
10. Arithmetic needs concrete operands: `$.base.replicas +
    $.base.replicas` against `*2 | integer` is `[aontu/mapval_no_gen]`
    (`probes/double-from-default.aon`).
11. A ranked default and bounds share a field: `replicas: (*2 |
    integer) & min(1) & max(20)` generates 2
    (`probes/default-with-bounds.aon`), and `replicas: *2 | (integer &
    min(1) & max(20))` refuses an override of 40 with `[aontu/empty]`
    (`probes/bound-bypass.aon`).
12. `pick([_], ports)` inside a pack template projects a field out of
    the source row: the generated child carries `"containerPort": 8080`
    (`probes/hole-member-access.aon`).
13. `each()` meets each child with its template, so a scalar child
    cannot become a map element: `each($.ports, { containerPort: _,
    name: key() })` over `{ http: 8080 }` is `[aontu/scalar_kind]`
    (`probes/each-reshape-scalar.aon`).
14. `+` does not take a list operand: `$.names + ","` is
    `[aontu/mapval_no_gen]` (`probes/join-list.aon`).
15. Lists unify by position: an entry written onto a generated env list
    collides with element 0, `[aontu/scalar_value]` at `$.env.0.name`
    (`probes/env-append.aon`).
16. A bare kebab-case name parses as a negation, `[aontu/negative]`
    (`probes/kebab-bare.aon`).
17. `length(min(1))` on a schema list beside a spread is decided at
    generation, after a later pack has filled the list; the model
    renders its one port (`probes/length-on-schema-list.aon`, golden).
18. `close(pack(...))` seals the set of children, not their keys: an
    override key `replcias` on a generated child is accepted and
    rendered beside `replicas: 2`, exit 0
    (`probes/close-shallow-typo.aon`, golden).
19. A relative reference inside a pack template answers for the child:
    `cpu: .cpu_m + "m"` is `"250m"` in every child
    (`probes/ref-in-pack-template.aon`, golden).
20. A template wrapped in `close()` composes with a second pack onto the
    same children, and each child keeps its own `key()`
    (`probes/inner-close-crosswire.aon`, golden).
21. A `**key(3) | string` default inside an `each` under a pack answers
    per child: every service gets its own name
    (`probes/pref-key-crosswire.aon`, golden).
22. `hide(pack(...))` hides the field, and a downstream pack over the
    hidden children reads their values (`probes/hide-pack-loss.aon`,
    golden).
23. Quantity strings concatenate: `"256Mi" + "256Mi"` is
    `"256Mi256Mi"`, exit 0, while `512 + "Mi"` is `"512Mi"` and
    `(512 + 512) + "Mi"` is `"1024Mi"` (`probes/quantity-concat.aon`,
    golden). The arithmetic functions are numeric, so
    `add("256Mi", "256Mi")` is refused where it is written,
    `[aontu/func_arg]` with the signature `add(a: number, b: number)`
    in the report (`probes/quantity-add-refused.aon`).
24. A pack over spread-augmented data fires with the derived columns:
    `ports: &: &: { port: .containerPort, targetPort: .containerPort }`
    followed by a pack over `$.ports` emits entries carrying `port`,
    `targetPort`, and the `protocol` default
    (`probes/spread-column-deadlock.aon`, golden).

## Running it

From this directory, `./check.sh` runs all 35 assertions and exits 0.
The pipeline the checks drive, by hand:

```sh
aontu main.aon > manifests.json                        # render the manifests
aontu vet guardrails.aon manifests.json                # org policy over the rendered output
aontu vet request-schema.aon data/onboard-good.json    # gate an agent's onboarding candidate
```
