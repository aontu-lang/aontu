# Closing the gaps with the other configuration languages

**Status:** Proposal, 2026-10-01. Nothing here is scheduled. An item
that is adopted becomes phases in a gap document under
`docs/capability-review/` and rows in the register, under the
same-commit rule ([capability-review.md](../contributing/capability-review.md)).
**Basis:** [CONFIG-LANGUAGES.0.md](CONFIG-LANGUAGES.0.md), the survey
whose findings this plan answers.

## The decisions this plan keeps

Every item below closes a gap without reopening a decision. Where
another language's answer conflicts with one of these, the plan takes
a different route to the same need, or leaves the gap open and lists it
under [Not proposed](#not-proposed).

| Decision | Recorded in | What it means for this plan |
|---|---|---|
| Evaluation terminates: no Turing-completeness, no SMT solvers | `docs/trust.md:298-300` | New capability arrives as bounded built-ins, bundled models, tooling outside evaluation, or documentation. Nothing adds general recursion or unbounded iteration. |
| No user-defined functions | `docs/reference-language.md:2090-2091`, `docs/capability-review/g8-generation.md:185-191` | A function-shaped gap closes with a declared built-in ([ADR-017](../../ADR.md#adr-017--the-builtin-call-surface-is-declared-parsed-by-both-ports)) or a bundled model. |
| No comprehension keywords and no string interpolation | `docs/capability-review/g8-generation.md:213-222`, [ADR-023](../../ADR.md#adr-023--g9-completes-at-the-renderer-the-reflection-sidecar-the-jostraca-bridge-and-string-interpolation-are-retired) | Comprehension-shaped work maps onto `pack`, `each`, `filter`, `match` and `emit`, and text onto `+`, `join` and `emit`. |
| Constraints are named, not spelled with operators | [ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators) | Key patterns and formats get named forms. |
| Evaluation is hermetic: no `now()`, `random()` or `env()`, and no executable hooks | `docs/trust.md:296-301` | No environment, file-system or network readers, and no side-effecting workflows. |
| Host semantics are normalised, not trusted | [ADR-003](../../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted) | A new format, checker or serialiser is defined by aontu and pinned by shared rows, never delegated to a host library's reading. |
| Full parity and full coverage | [ADR-001](../../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec), [ADR-002](../../ADR.md#adr-002--test-coverage-stays-at-100--in-both-implementations) | Every language item lands in both ports with shared rows. The MCP server stays the one recorded TypeScript-only surface. |
| The component tree is the only output road, and aontu knows no languages | [ADR-038](../../ADR.md#adr-038--the-component-tree-is-the-only-output-road-and-aontu-knows-no-languages), amended by [ADR-040](../../ADR.md#adr-040--aontu-render-writes-the-component-tree-through-jostraca-in-both-ports) | A new output format arrives as a bundled model writing through the component tree, or after an ADR that amends ADR-038. |
| An include's extension decides what a file is | [ADR-012](../../ADR.md#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused) | A new input format registers by extension, with a reader aontu defines. |
| Modules come through the package system, not URLs or git | [ADR-039](../../ADR.md#adr-039--the-package-system-has-one-vocabulary-one-set-of-files-and-three-pins), `docs/capability-review/g6-distribution.md:232-239` | No URL or git imports. |

## How priority is assigned

| Priority | Meaning |
|---|---|
| HIGH | Undermines a claim aontu makes against a named language, or blocks the users aontu targets. Start now. |
| MEDIUM | A capability most of the nine languages ship, which a user moving from one of them meets in ordinary work. Schedule after the HIGH items. |
| LOW | Narrows a gap few users meet, or one with a workable route today. Take it when demand appears. |

Sizes use the register's scale: S, M and L.

## HIGH

| ID | Gap | Who has it | Approach within the decisions | Home | Size |
|---|---|---|---|---|---|
| H1 | Two inputs do not terminate: [BUGS.md](../../use-cases/BUGS.md) §18 (`refer()` inside a named type) and §57 (a recursive spread conjoined with a map) | CUE, Dhall and Starlark, which terminate by construction | Fix §18. For §57, first make every runaway refuse with a coded budget error instead of hanging, which changes a spec-visible trust number (`test/spec/budget.tsv`, `docs/trust.md`) as `docs/capability-review/progress.md:1997` records; then land the convergence rule that entry states. Add a shared termination corpus, with every recursive construct run under `timeout` in both ports. | G9 phase 0 (partial), BUGS.md | M |
| H2 | No JSON Schema import, and an exporter that differs from its model while reporting `ok` (#300) | CUE, KCL, Nickel and Pkl import JSON Schema, and JSON Schema is aontu's stated incumbent | G12 phases 1 (a truthful exporter, S), 2 (the engine prerequisites, M), 3 (the importer core and its harness, L) and 9 (the exporter's carriers, M): 1 and 2 in either order, then 3, then 9, which was planned as phase 4 and is numbered after the five phases that landed before it | G12 | L |
| H3 | No published comparison, and seven comparison claims in this repository are wrong or overstated | CUE and JSON Schema, whose users arrive with fixed expectations | Correct the claims in the survey's [last table](CONFIG-LANGUAGES.0.md#claims-in-this-repository-that-the-survey-contradicts). Then write the site's comparisons page, still open at `docs/site/index.md:459`, and two how-to guides, "aontu for CUE users" and "aontu for JSON Schema users". Each guide is a mapping table (operators to named atoms, `[=~re]: T` to a guarded spread, comprehensions to combinators, interpolation to `+` and `join`) whose examples `docs.test.ts` executes. | `aontu-lang/web`, `docs/how-to/` | M |
| H4 | Production use stops at the core: no consumer uses constraint atoms, `vet`, `hash`, `breaking` or MCP (`use-cases/REVIEW.md:378-383`) | every language here, whose validation features have production users | Move `@voxgig/model` off its exact pin of 0.49 onto the current series, and run Voxgig's models through `vet` and `breaking` in CI. Record what breaks in BUGS.md. | the Voxgig repositories | M |

## MEDIUM

| ID | Gap | Who has it | Approach within the decisions | Home | Size |
|---|---|---|---|---|---|
| M1 | No YAML or TOML output | CUE, Dhall, Jsonnet, Nickel, Pkl, KCL | A bundled `aontu:lang/yaml` model ([ADR-036](../../ADR.md#adr-036--a-bundled-model-is-a-file-in-aontu-not-a-string-in-each-port)) writing through the component tree, with quoting that aontu defines so that a YAML 1.1 reader cannot misread a value (`no`, `on`, `0123`); TOML the same way. If the tree cannot express it within the budgets, a CLI serialiser needs an ADR amending ADR-038 first. | G9 follow-on | M |
| M2 | No format checks (date-time, email, URI, UUID, IP addresses) | CUE's `time` and `net` packages, JSON Schema's `format`, Pkl | G12 phase 13, `format(g)`. Every format is an ABNF grammar, read as `parse` reads one ([ADR-033](../../ADR.md#adr-033--a-grammar-is-a-string-and-parsing-is-a-function)), the calendar and label rules the RFCs leave in prose written as grammar too, so that aontu defines the meaning (ADR-003) and both ports read one grammar file. | G12 | L |
| M3 | JSON Schema's logic, conditional, `contains` and annotation keywords cannot cross | JSON Schema; CUE's `matchN` and `matchIf` | G12 phases 4 to 8 (`multiple`, `nof`, `when`, `contains`, `meta`) | G12 | L |
| M4 | `re()` runs on a backtracking engine in TypeScript and on linear-time RE2 in Go. The portable subset refuses the nested shapes that blow up, at the price of refusing some safe patterns, but a pattern with a large polynomial backtracking cost is still admitted, and matching sits outside the event-counted budgets (`docs/trust.md:136-153`) | CUE, whose patterns run on RE2 | G12 phase 14: the owned ECMA-262 `u`-mode parser and Pike VM in both ports, which makes matching linear in both, could let the subset stop refusing safe patterns, and records ADR-003's direction as a decision | G12 | L |
| M5 | The LSP lacks rename, key completion, and go-to-definition beyond alias names (`docs/lsp.md:453-466`) | CUE, Pkl, Nickel and KCL; GOV.UK weighed IDE support when it rejected CUE and KCL | Build the position-to-path mapping that `docs/lsp.md:465` names, then key completion, references and rename. Add a JetBrains client: an LSP4IJ configuration, as thin as the other three. | `docs/lsp.md`, both ports, `editors/` | M |
| M6 | The package repository is not serving (`CHANGELOG.md:1273`) | CUE's Central Registry, the Terraform Registry, Pkl packages, KCL over OCI | Bring up `pkg.aontu.dev` and `publish.aontu.dev` as [ADR-019](../../ADR.md#adr-019--the-project-stores-module-bytes-and-federates-the-log) and ADR-039 specify, with the moderation duties the G10 register records for the repository service | G6, G10, `aontu-lang/system` | M |
| M7 | No stability promise: the TypeScript package went from 0.47.0 in June 2026 to 0.76.0 in September | Nickel since 1.0 and HCL since v2 promise compatibility | Write the compatibility policy (what a minor release may change), the 1.0 criteria (G5 phase 6's default flip, G12 phases 1 to 3 and 9, H1), and a deprecation window that uses `deprecate()` | a new ADR | S |
| M8 | Users arriving from CUE, Jsonnet, KCL, Pkl or HCL reach for `for`, `if` and interpolation | all five | Keep the refusals. Publish a pattern catalogue that maps each common comprehension and conditional idiom onto the combinators, with every entry a shared spec row. An idiom the combinators cannot express becomes a candidate bounded built-in, argued in its own ADR. | G8 follow-on, `docs/how-to/` | M |
| M9 | No published performance figures | CUE and Nickel, whose performance is their most cited criticism and who both publish their improvements | A benchmark corpus run in both ports, and against pinned `cue`, `jsonnet` and `nickel` binaries on equivalent models, with the results published per release | new | M |

## LOW

| ID | Gap | Who has it | Approach within the decisions | Home | Size |
|---|---|---|---|---|---|
| L1 | The rest of JSON Schema: resources and `$ref`, dynamic references, evaluated coverage, legacy dialects, vocabularies and output units | JSON Schema validators; CUE's importer in part | G12 phases 10, 11, 12, 15, 16 and 17, then phase 18, the round-trip gate, which is last | G12 | L |
| L2 | No short form for key-pattern constraints; a guarded spread, `&: match(key(0), re(p), T, any)`, works in both ports today | CUE's `[=~re]: T` | N3, deferred on 2026-08-28 and unblocked (`docs/capability-review/g1-constraint-algebra.md:889-895`): a named short form under ADR-008 that means exactly the guarded spread, so the two spellings share one canonical form | G1 follow-on | S |
| L3 | No OpenAPI or Kubernetes CRD import | KCL and CUE; Dhall through `dhall-openapi` | A layer over the G12 importer. `voxgig/apidef` already turns OpenAPI into a model and is the obvious code to upstream. | G12 follow-on | M |
| L4 | XML, HOCON, KDL and CSV cannot be read | various | One aontu-defined reader per extension (ADR-012, ADR-003), CSV first because its refusal is a recorded divergence ([DIVERGENCE.md](../../DIVERGENCE.md)) | ADR-012 | S each |
| L5 | No static cost estimate | CEL | A cost model over the budget units G5 laid down for it (`docs/capability-review/g5-trust-contract.md:237-243`) | G5 follow-on | M |
| L6 | Nothing checks that aontu's CUE-faithful behaviour still matches CUE | CUE | The differential corpus against a pinned `cue` binary that `docs/capability-review/g1-constraint-algebra.md:940-946` proposes | new | S |
| L7 | No bindings outside TypeScript and Go | Pkl and Nickel bind several languages each, as does KCL; Jsonnet has Python | A Python package over the Go port (a shared library or WebAssembly), since most agent frameworks are Python; the MCP server covers tool-using agents meanwhile | new | M |
| L8 | No test verb | `kcl test`, `nickel test` | Document the fixture pattern (`vet` over expected-valid and expected-invalid files, in CI through the vet action), and add a verb only if the pattern falls short | `docs/how-to/` | S |
| L9 | No type generation for TypeScript or Go | Pkl's code generators; CUE's Go type generation | Bundled models or packages that drive `render`, since ADR-038 keeps languages out of the engine | G9 follow-on | M |
| L10 | Install friction | CUE, Jsonnet, Pkl and Nickel, all in homebrew-core | Seed `aontu-lang/homebrew-tap` and `aontu-lang/scoop-bucket` from the manifests each release already builds (`docs/release-and-tag.md:226`), and measure whether the npm package's Node floor can drop from 24 to the oldest maintained LTS | release | S |

## Not proposed

These are the capabilities of other languages that this plan leaves
out, and the decision that rules each one out.

| Capability | Where it exists | Ruled out by |
|---|---|---|
| User-defined functions and general recursion | Dhall (total), Jsonnet, Nickel, Pkl, KCL, Starlark, Nix | termination and the refusal of user functions (`docs/trust.md:298`, `docs/reference-language.md:2090-2091`) |
| `for` and `if` comprehension keywords, and computed keys | CUE, Jsonnet, Pkl, KCL, HCL | `docs/capability-review/g8-generation.md:213-222`; M8 maps the idioms instead |
| String interpolation | CUE, Dhall, Nickel, Pkl, KCL, HCL, Nix | ADR-023 |
| Operator spellings for bounds (`>=5`, `=~`) | CUE | ADR-008; H3's CUE guide maps them |
| Environment, file-system and network readers | Pkl | `docs/trust.md:296-297`; host variables (`$name`) carry outside input |
| Override operators, where the later layer wins | Jsonnet's `+`, Pkl's `amends`, KCL's `=` | the unification core; ranked defaults layer by rank and refuse conflicts |
| Classes and inheritance | Pkl, KCL | the unification core; `type()`, spreads and aliases cover templates |
| Side-effecting workflows | CUE's `cue cmd` | hermetic evaluation; output leaves only through `render` (ADR-038, ADR-040) |
| URL and git imports | Dhall, Terraform, jsonnet-bundler | weighed and not chosen in `docs/capability-review/g6-distribution.md:232-239` |
| Mutable values with freezing | Starlark | `docs/capability-review/g5-trust-contract.md:595-597` |

## Suggested order

1. H1, the claim corrections that open H3, and G12 phase 1 within H2.
2. G12 phases 2, 3 and 9 (the rest of H2), H4, the comparisons page and
   the two guides (the rest of H3), and M7.
3. The remaining MEDIUM items, M3 after H2 because its phases build on
   the importer. LOW items as demand appears.

## Signals that the gaps are closing

| Signal | Items |
|---|---|
| The termination corpus is green in both ports with no `timeout` kills | H1 |
| The pass rate on the official JSON Schema test suite, from the G12 harness, rises | H2, M3, L1 |
| Consuming codebases run `vet` or `breaking` in CI | H4 |
| npm downloads spread beyond the two newest releases (see the survey's [aontu table](CONFIG-LANGUAGES.0.md#aontu-at-0760)) | H3, H4, L10 |
| homebrew-core accepts a formula, which its notability rules allow only once a project has users | L10 |

Adopted items enter the register as
[capability-review.md](../contributing/capability-review.md) describes.
