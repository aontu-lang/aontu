# Use cases: practical validation of Aontu as an agent-facing ground truth

Sixteen enterprise-shaped use cases, each built as real Aontu models and
*executed* against the TypeScript CLI (`ts/bin/aontu.js`, the canonical
implementation). Every case directory carries a `check.sh` that drives
the verbs (`vet`, `subsume`, `breaking`, `get`, `why`, `set`, `hash`,
`relations`, `mod`, the MCP server) and asserts outcomes: golden `diff`s
for expected output, error-code greps for expected refusals. A case's
`README.md` walks through the scenario, the model, and what its
`check.sh` proves, quoting the CLI's output verbatim.

## Running

```sh
./run-all.sh            # every case; one line per verdict
./03-api-contract/check.sh   # one case
```

Requirements: Node (per `ts/package.json` engines) with an installed
`ts/node_modules` (`cd ts && npm install`), plus `python3` (JSON
assertions in cases 03, 07, 14 and 15) and `git` (case 04's `git#rev`
gate). A Go toolchain is optional: case 15 skips the checks that need
it when `go` is absent. Scripts locate the repository root from their
own path and honour `AONTU` (and, in case 09, `MCP`) to point at a
different build.

## The cases

| Case | Scenario | Aontu surface exercised |
|------|----------|-------------------------|
| [01-service-catalog](01-service-catalog/) | Company-wide service catalog as system ontology (two views of the same entities) | `refer()` over tree paths, `relations` (acyclic + inverse), `@"std/system"`, `get`/`why`, vet-gated onboarding |
| [02-deploy-config](02-deploy-config/) | Multi-environment deployment config: org → team → service → env layering | ranked `*`/`**` defaults, includes, `close()`, constraint atoms, `pack`, `filter`, `why` |
| [03-api-contract](03-api-contract/) | REST API contract as the truth an agent codes against; emit→validate→repair | `vet` (json/sarif/exit classes), `--at`, `--closed`, repair from vet's findings |
| [04-schema-evolution](04-schema-evolution/) | Governance of a shared schema across v1→v3 | `subsume` profiles, `breaking --against`, `deprecate()`, `aontu_policy.compat`, `hash`, `diff` |
| [05-rbac-policy](05-rbac-policy/) | RBAC / authorization model as data | `close()` exhaustiveness, disjunct shapes, `match`, `filter`+`length` invariants, `must()` |
| [06-k8s-golden-path](06-k8s-golden-path/) | Platform golden path generating k8s-shaped manifests for N services | `pack`/`each`, `key()`, `_`, `unique()`, overrides onto generated children |
| [07-event-contracts](07-event-contracts/) | Event/message contracts (schema-registry case) | envelope spreads, discriminated unions, `re()` formats, `0d` ids, `breaking` |
| [08-feature-flags](08-feature-flags/) | Feature flags with env/tenant overrides and an operational write path | `set` (overlay + `--in-place`), pinned-value refusals, ranked defaults, `--trust` confinement |
| [09-agent-tools](09-agent-tools/) | An agent platform's tool registry; runtime call guardrail; the MCP server itself | per-tool `vet --at`, the real `aontu-mcp` over JSON-RPC, `agentsmd`, generation |
| [10-data-model](10-data-model/) | Enterprise data domain with exact money and 64-bit ids | `0d` exact leaves, `lossy_integer_literal`, cross-field constraints, batch `vet`, `subsume` |
| [11-shared-modules](11-shared-modules/) | Shared truth across repos: a schema module vendored into a consumer | `mod tidy`/`verify`/`vendor`/`manifest`, lockfile pins, integrity errors, `#aon1-…` inline pins |
| [12-relations](12-relations/) | Pipeline DAG: field-declared relations, one line of schema | `rel(t)`, held constraints, `acyclic()`/`inverse(n)` atoms, verdict at generation, `relations`/`reaches` |
| [13-recursive-schema](13-recursive-schema/) | Approval chain: a schema one reference deep over any-depth data | recursive residuals (`$.spec.Step`), mu-form canon + hash, `recursion_unexpanded`, `vet --at` over plain JSON |
| [14-jsonschema-export](14-jsonschema-export/) | JSON Schema as the bridge out: MCP inputSchema, OpenAPI, stock validators | `jsonschema --at`/`--strict`/`--format json`, the stderr loss report, exit classes, the money-wire `const` mark |
| [15-code-generation](15-code-generation/) | The model as the source of the code: Go, TypeScript and SQL from one catalogue, each over a slice | list-spread + `pick` line building, `join` file assembly, backtick target text, `match` type mapping, both-ports byte parity |
| [16-module-deps](16-module-deps/) | A codebase's own module graph: four layers, no upward dependencies, drawn as a dependency tree and as the architecture layers | `rel(t)` target-shape flow as an architecture rule, `acyclic()`/`inverse(n)`, `reaches`, the tree, matrix and layer views |

## Diagrams

**Every case opens with its model tree**, drawn by [`aontu view
doc`](../docs/reference-api.md#aontu-view) and pinned as a golden by
its own `check.sh`, text and SVG. It is the one figure every document
can carry: the other kinds read a report — the edge set, the
provenance record, the subsumption order — and so need the model to
HAVE links, contributions or peers, while this reads the shape itself.
The README's second section explains it, so a reader meets the model's
arrangement before any of its values.

Five cases carry further diagrams, drawn by the same verb and pinned
the same way. The tree, the matrix and the layers are fixed-pitch text,
because those figures are character cells, and 01 and 16 pin the same
figures as SVG (`--as svg`, the same cells drawn to the same integer
grid); the others are Mermaid, which GitHub draws:

| case | views beyond the model tree |
|---|---|
| [01-service-catalog](01-service-catalog/) | `graph` grouped by owner, `matrix` in partition order with the closure (text and SVG) |
| [04-schema-evolution](04-schema-evolution/) | `poset`: the subsumption order over the releases and proposals |
| [08-feature-flags](08-feature-flags/) | `ladder`: the meet ladder for one arbitrated value |
| [12-relations](12-relations/) | `graph` with the declared inverse suppressed, and `graph --as er` |
| [16-module-deps](16-module-deps/) | `tree` with elided repeats and derived roots, `matrix`, and `layer`: the architecture bands (each as text and SVG) |

The verb computes no coordinate and sorts nodes and edges by code
point, so the output is deterministic text, both ports emit the same
bytes, and a golden diff is a meaningful check. `--check` is the CI
gate for a committed figure.

## Scope and conventions

- Scripts exercise the **TypeScript CLI**. Case 15 additionally builds
  the Go port when a Go toolchain is present and checks that both ports
  emit byte-identical output.
- Checks are hermetic: no network, fixtures inside each case directory,
  temp files under `mktemp -d`. Where a case evaluates a deliberately
  hostile input, the trust posture is explicit (`--trust root:…`).
- The case READMEs quote CLI output verbatim (ANSI stripped).
