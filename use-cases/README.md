# Use cases: practical validation of Aontu as an agent-facing ground truth

This folder is a **review artifact**: eleven enterprise-shaped use cases,
each built as real Aontu models and then *executed* against the
TypeScript CLI (`ts/bin/aontu.js`, the canonical implementation, at the
in-tree 0.53.0 line). Every case directory carries a `check.sh` that
drives the actual verbs (`vet`, `subsume`, `breaking`, `get`, `why`,
`set`, `hash`, `relations`, `mod`, the MCP server) and asserts outcomes
— golden `diff`s for expected output, error-code greps for expected
failures. A case's `README.md` records, with verbatim CLI output, what
the language served well and where it failed or forced a workaround.

The synthesis lives beside this file:

- [`REVIEW.md`](REVIEW.md) — the critical review of the language against
  its stated goal (AI-agentic development; ground-truth system
  ontology), grounded in these use cases plus a study of four real
  consumer codebases.
- [`BUGS.md`](BUGS.md) — engine defects found along the way, each with a
  minimal reproduction under [`repros/`](repros/), adversarially
  verified (reproduced *and* checked against the docs for an intended
  reading before being called a bug).
- [`SUPPORT.md`](SUPPORT.md) — the support structures the project needs
  for actual community and production use.

## Running

```sh
./run-all.sh            # every case; one line per verdict
./03-api-contract/check.sh   # one case
```

Requirements: Node (per `ts/package.json` engines) with an installed
`ts/node_modules` (`cd ts && npm install`), plus `python3` (JSON
assertions in cases 03, 07 and 14) and `git` (case 04's `git#rev` gate).
Scripts locate the repo root from their own path and honour `AONTU` —
and, in case 09, `MCP` — to point at a different build.

## The cases

| Case | Scenario | Aontu surface exercised |
|------|----------|-------------------------|
| [01-service-catalog](01-service-catalog/) | Company-wide service catalog as system ontology (two views of the same entities) | `id()`, `refer()`, `relations` (acyclic + inverse), `@"std/system"`, `get`/`why`, vet-gated onboarding |
| [02-deploy-config](02-deploy-config/) | Multi-environment deployment config: org → team → service → env layering | ranked `*`/`**` defaults, includes, `close()`, constraint atoms, `pack`, `filter`, `why` |
| [03-api-contract](03-api-contract/) | REST API contract as the truth an agent codes against; emit→validate→repair | `vet` (json/sarif/exit classes), `--at`, `--closed`, repair from findings |
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

## Scope and conventions

- These are **review artifacts, not language-behaviour pins**. Where a
  case exposed engine behaviour worth pinning, the finding is recorded
  in `BUGS.md` with a minimal repro; per ADR-001 the durable home for
  any behaviour contract is a `test/spec/*.tsv` row in both ports, and
  promoting repros into rows is follow-up work for the maintainers.
- Scripts exercise the **TypeScript implementation only**. The Go port
  is out of scope here; nothing in this folder asserts parity, and no
  expected output was copied into a spec row (the parity-probe rule in
  AGENTS.md therefore does not bind these goldens).
- Checks are hermetic: no network, fixtures inside each case directory,
  temp files under `mktemp -d`. Where a case evaluates a deliberately
  hostile input, the trust posture is explicit (`--trust root:…`).
- Suite counts and phase statuses are deliberately not restated here;
  see `docs/capability-review/progress.md` (update-protocol rule 5).
- The case READMEs quote CLI output verbatim (ANSI stripped). Severity
  words used throughout: **critical** = silent wrong answer, unsound
  verdict, or non-termination; **major** = a documented capability
  fails or a significant capability is missing for enterprise use;
  **minor** = papercut; **polish** = cosmetic.
