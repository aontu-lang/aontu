# aontu among the configuration languages

**Status:** Survey, 2026-10-01. Compares aontu 0.76.0 (TypeScript, and
the Go port at the same version) with nine programmable configuration
languages, and with the rest of the field more briefly. Facts about
other projects are as their documentation, package registries and
public discussion stated them on that date. Adoption tiers are
judgements.
**Plan:** [CONFIG-LANGUAGES-PLAN.0.md](CONFIG-LANGUAGES-PLAN.0.md)
proposes how to close the gaps this survey finds.

## Scope and sources

The nine languages compared in depth are CUE, Dhall, Jsonnet, Nickel,
Pkl, KCL, Starlark, HCL and the Nix language: the programmable
configuration languages with the widest use. RCL, Google's internal
GCL, templating layers, configuration written in general-purpose
languages, policy languages and plain data formats get a row or a
paragraph each, because they compete on different ground.

Statements about aontu cite this repository by path and line.
Statements about the others come from their official documentation,
package registries, CNCF pages and public discussion threads, listed
under [Sources](#sources). Two measures stand in for adoption because
they are published the same way for every language: Homebrew's install
count for the year to 2026-10-01, where homebrew-core carries a
formula, and the adopters each project names. Neither is a direct
measure of use, but both compare like with like. GitHub star counts are
not used, except for aontu's own.

## aontu at 0.76.0

| Aspect | aontu 0.76.0 |
|---|---|
| Implementations | TypeScript (canonical) and a Go port, held to parity by the shared suite under `test/spec/` (whose size the [register](../capability-review/progress.md#the-update-protocol) records, rule 5, and nowhere else), each port at 100 % coverage ([ADR-001](../../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec), [ADR-002](../../ADR.md#adr-002--test-coverage-stays-at-100--in-both-implementations)) |
| Licence and steward | MIT, a single maintainer, sponsored by Voxgig (`README.md:8`) |
| Adoption | Minimal. 11 GitHub stars and no forks. npm counted 11,656 downloads in the 30 days to 2026-09-29 and 28,271 in the year; in the week before, 76 % were of the two newest releases, which points to the project's own CI more than to users. Four codebases are known to consume it (podmind, todo-app, voxgig/apidef and voxgig/sdkgen, `use-cases/REVIEW.md:9-10`), and in August their use was "includes + spreads + `*default \| widetype` + references, full stop" (`use-cases/REVIEW.md:378-379`). A web search found no independent public discussion. |
| Turing-complete | No, by design: "No Turing-completeness, no SMT solvers" (`docs/trust.md:298`). There are no user-defined functions (`docs/reference-language.md:2090-2091`), generators iterate finite bags that already exist, recursion expands only against concrete data, and every evaluation runs under event budgets of 9 passes, 999 revisits and depth 1000 (`docs/trust.md:100-110`). Two open defects are inputs that do not terminate: [BUGS.md](../../use-cases/BUGS.md) §18 and §57. |
| Composition | Unification `&`, commutative, associative and idempotent; disjunction `\|`; ranked defaults (`**` outranks `*`); spreads `&:`; `close()` and `open()`; references, aliases and `$name` host variables |
| Constraints | The named atoms `min`, `max`, `above`, `below`, `neq`, `re`, `len` and `unique`, which meet as lattice values, and the evaluate-only `must` (G1, landed) |
| Generation | `pack`, `each`, `filter`, `match` and `emit` over settled data. No comprehension keywords, no if/else, no string interpolation. |
| Numbers | Four disjoint leaves (`integer`, `float`, `biginteger`, `bigdecimal`); `0d` literals are exact; an integer that binary64 would round is refused |
| Verbs | `vet` (verdicts with exit classes, JSON or SARIF, a GitHub Action), `subsume` and `breaking` (three-valued, with witnesses), `why`, `get` and `set`, `hash` (`aon1-` meaning pins), `fmt`, `view` (ten kinds), `render`, `jsonschema` (export) |
| Interchange | Reads JSON, JSON-LD, JSONC, JSON5, jsonic (`.jsonic` and `.jsc`), YAML, TOML and INI as include data ([ADR-012](../../ADR.md#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused)). Writes JSON and its own canonical form only. Exports JSON Schema 2020-12 with its losses reported, and imports no schema language: G12 is 0 of 17 phases ([progress.md](../capability-review/progress.md)). |
| Trust | No clock, randomness, environment or network in the language; includes governed by a capability (`none`, `mem`, `root`, `system`), with the default left at `system` until the next major (G5 phase 6, `docs/capability-review/progress.md:1470`) |
| Tooling | An LSP in both ports (diagnostics, hover, completion, go-to-definition on alias names, signature help, `docs/lsp.md:453`); an MCP server, TypeScript only; GBNF, Lark and ABNF grammars for constrained decoding; editor plugins for VS Code, Emacs and Vim |
| Packages | Domain-shaped module paths, a lockfile with three pins, vendoring, Sigstore and OIDC publishing (G6, landed). The public repository at `pkg.aontu.dev` is not serving (`CHANGELOG.md:1273`). |
| Install | npm, Go binaries, `install.sh`, a container image, deb, rpm and apk packages, a Nix flake, and manifests for Homebrew, Scoop, winget and the AUR (`docs/release-and-tag.md:226`) |

## At a glance

| Language | Implementation | Adoption (signal) | Turing-complete | How configuration combines |
|---|---|---|---|---|
| aontu | TypeScript, Go | minimal (11 stars, four known consumers) | no, by design | unification; constraints are values |
| CUE | Go | moderate (Homebrew 3,891; KubeVela, Timoni, Istio) | no, by design | unification; constraints are values |
| Dhall | Haskell, Rust; Go frozen at standard 17 | niche, declining (Homebrew 236) | no (total) | typed functions; symmetric `∧`, right-biased `⫽` |
| Jsonnet | C++, Go; Scala and Rust elsewhere | moderate (Homebrew 40,739; Grafana, kube-prometheus, Databricks) | yes, by design | lazy functions; `+` inheritance, the later object wins |
| Nickel | Rust | niche (Homebrew 210) | yes | merge with priorities; contracts |
| Pkl | Kotlin and Java on GraalVM; Rust (`pklr`) | niche, rising (Homebrew 4,559; Apple, GOV.UK) | in effect | classes; the amending module wins |
| KCL | Rust; Go, Python and Node SDKs | niche (CNCF Sandbox; npm about 200 a month) | in effect | schemas; `:` union beside `=` override and `+=` append |
| Starlark | Java, Go, Rust | large, through Bazel and Buck2 (Homebrew `bazel` 18,521) | no, by default | an imperative subset of Python |
| HCL | Go; Rust and Python parsers | dominant, through Terraform and OpenTofu (Homebrew `opentofu` 80,087) | no (no user functions or recursion) | blocks; the host application decides meaning |
| Nix | C++; the Lix fork; Rust efforts | large (nixpkgs, over 120,000 packages) | yes | lazy functions; the module system merges by priority |

"In effect" marks a language whose documentation makes no claim but
documents general recursion.

## Feature matrix

| Capability | aontu | CUE | Dhall | Jsonnet | Nickel | Pkl | KCL | Starlark | HCL | Nix |
|---|---|---|---|---|---|---|---|---|---|---|
| Order-independent combination is the evaluation model | yes | yes | `∧` only | no | by priority | no | `:` only | no | no | module system |
| Value constraints (bounds, patterns) | yes | yes | no | `assert` | contracts | yes | `check` | no | Terraform `validation` | module types |
| Compares two schemas | yes, three-valued | Go API, pass or fail | no | no | no | no | no | no | no | no |
| User-defined functions | no | no | yes, total | yes | yes | yes | yes | yes | no | yes |
| Comprehensions or loops | combinators | yes | via functions | yes | via functions | yes | yes | yes | yes | via functions |
| String interpolation | no | yes | yes | format operator | yes | yes | yes | format operator | yes | yes |
| Exact numbers | yes | yes | integers | no | yes | no | no | integers | wide binary float | no |
| JSON Schema import | no | yes | OpenAPI only | no | separate tool | generator | yes | no | no | no |
| YAML output | no | yes | yes | yes | yes | yes | yes | host-defined | `yamlencode()` | library |
| Pins by meaning, not bytes | yes | no | yes | no | no | no | no | no | no | no |

## Language by language

### CUE

CUE (Go, Apache-2.0) is the nearest relative, and the only other
language here whose evaluation model is unification: types, defaults
and data sit on one lattice and combine under a commutative `&`. It is
pre-1.0 at v0.17.1, stewarded by CUE Labs, which came out of stealth in
October 2025 with venture funding, and used by KubeVela, Timoni and
Istio's API tooling. Its documentation states the position aontu
shares: "Not disallowing recursion would make CUE Turing complete."

The two share disjunction with defaults, closed structures, `1 & 1.0`
as a conflict, a validation verb, subsumption, domain-shaped module
paths, a formatter, an LSP, JSON Schema export, host injection (CUE's
`@tag`, aontu's `$name`) and the refusal of user functions.

CUE has, and aontu lacks: import from JSON Schema, OpenAPI, Protobuf
and Go types; YAML and TOML output; `for` and `if` comprehensions with
interpolated keys, where aontu's combinators cover much of the same
ground without the syntax; a short form for key-pattern constraints
(`[=~re]: T`), which aontu spells as a guarded spread,
`&: match(key(0), re(p), T, any)`, with its own short form (N3)
deferred; operator spellings for bounds (`>=5`, `=~`); a serving module
registry; `cue cmd` workflows; and familiarity, since its spellings
are in LLM training data
(`docs/capability-review/g1-constraint-algebra.md:214`).

aontu has, and CUE lacks: ranked defaults and a standalone soft
default; subsumption that can answer "undecided" and names a witness,
behind a `breaking` gate with backward, forward and full modes, where
CUE's `Value.Subsume` passes or fails; positive provenance through
`why`; the relation built-ins; 175 stable error codes with two-site
findings and exit classes; pins on a meaning hash rather than a byte
digest; views; and a native TypeScript engine, where CUE reaches
JavaScript only through third-party wrappers.

CUE is admired for its theory and criticised for its learning curve.
Dagger ended its CUE SDK in December 2023, and its founder later wrote
that "the number one complaint from our early users was having to learn
CUE". The evaluator was rewritten for speed and memory (evalv3, the
default since v0.13 in May 2025), and GOV.UK's November 2025
assessment rejected CUE, citing IDE support and a thin package
ecosystem.

### Dhall

Dhall (Haskell reference implementation, BSD-3-Clause) is a total,
typed functional language: "Dhall is not a Turing-complete programming
language", and an expression that type-checks evaluates in finite
time. It is niche and declining. Hackage records about 270 downloads a
month and Homebrew 236 installs in the year, and the Go implementation
has not moved past standard 17 since 2021. The documentation names
adopters including Bellroy, Cachix, IOHK and NoRedInk.

The two share a termination guarantee (Dhall's from its type system,
aontu's from structure and budgets) and hashing over a normal form,
which is the precedent for aontu's `aon1-` pins
(`docs/capability-review/g6-distribution.md:194`).

Dhall has, and aontu lacks: static types checked before evaluation;
total user functions with polymorphism; URL imports pinned by `sha256`
(`dhall freeze`); YAML and XML output; types generated from OpenAPI
(`dhall-openapi`); and implementations for Rust and Clojure hosts.

aontu has, and Dhall lacks: value constraints (bounds, patterns,
`must`), which Dhall's types cannot state; defaults and disjunctions
inside the combination itself, where Dhall offers a symmetric record
merge `∧`, a right-biased `⫽` and record completion; versioned
packages; and the `vet`, `breaking` and `why` verbs.

Dhall is respected for its guarantees and criticised for its
ergonomics and its evaluation speed on large configurations; GOV.UK
found that it "performed poorly in assessment".

### Jsonnet

Jsonnet (C++ and Go from Google, Apache-2.0; Scala and Rust
implementations elsewhere) is a lazy functional superset of JSON. It
is the workhorse of Kubernetes and observability configuration through
Grafana Tanka, kube-prometheus and the Grafana mixins, and Databricks
runs its own Scala implementation. Homebrew counted 40,739 installs
across its two formulae in the year. It is Turing-complete on purpose:
"Restricting termination would create more problems than it would
solve."

The two share a JSON-superset syntax and hermetic evaluation, with
outside input arriving only through flags (`--ext-str` and top-level
arguments, which play the part of aontu's `$name`).

Jsonnet has, and aontu lacks: user functions; comprehensions; `self`
and `super` inheritance; string formatting; a large standard library;
YAML, INI, TOML, XML and multi-file output; and four implementations.

aontu has, and Jsonnet lacks: a schema or type system of any kind
(Jsonnet has object `assert`s); conflicts reported as refusals where
Jsonnet's `+` overrides without comment; termination; exact numbers,
where Jsonnet's are binary64; and the validation and compatibility
verbs.

Jsonnet is valued for its JSON compatibility and criticised as "really
hard to debug", because laziness surfaces errors deep in unrelated
stacks, and for having no types. No release appeared between April
2023 and May 2025, and the C++ build is documented as unsuitable for
untrusted input.

### Nickel

Nickel (Rust, MIT, from Tweag, now part of Modus Create) reached 1.0 in
May 2023 and 1.18.0 in September 2026. It is niche, with 210 Homebrew
installs in the year, and Organist and `tf-ncl` among the tools built
on it. It is Turing-complete, and says so.

The two share order-independent merging of partial records with
priorities (Nickel's `default`, `force` and numeric priorities against
aontu's `*` and `**`), with a conflict at equal priority reported as an
error, which is why this repository names Nickel as the closest
approximation of aontu's core
(`docs/design/AONTUCONSTRAINTS.0.md:32`). They also share contracts in
the role of constraints, exact numbers (Nickel's are arbitrary-precision
rationals), JSON, YAML and TOML input, an LSP, a formatter and a
playground.

Nickel has, and aontu lacks: gradual static typing; user functions;
algebraic data types and pattern matching; custom contracts with
messages and blame; JSON Schema import through `json-schema-to-nickel`;
YAML and TOML export; `nickel test`; and bindings for Python, C and
Rust.

aontu has, and Nickel lacks: reasoning between schemas, since contracts
are evaluate-only and "discover the contradiction only when a candidate
value happens to arrive"
(`docs/capability-review/g1-constraint-algebra.md:93-95`); termination;
`subsume`, `breaking` and `why`; and a second native implementation.

The merge model is well liked ("much more flexible than inheritance").
Performance, documentation gaps and LSP crashes are the recurring
complaints, and Tweag reported in February 2026 that evaluation had
become ten times faster than two years before.

### Pkl

Pkl (Kotlin and Java on GraalVM, Apache-2.0, from Apple) was
open-sourced in February 2024 and is at 0.32.1. It is niche and rising:
4,559 Homebrew installs in the year, and in November 2025 GOV.UK chose
it over CUE, KCL, Jsonnet and Dhall as "the most mature,
well-supported, and feature rich option". An independent Rust
evaluator, `pklr`, appeared in 2026. Its documentation makes no claim
about Turing-completeness but documents recursive methods and lambdas,
so it is Turing-complete in effect.

The two share schema and data in one language; predicate constraints
(`Int(isBetween(0, 65535))` against `min`, `max` and `must`); sandboxed
evaluation governed by allowlists, the precedent for aontu's include
capability (`docs/capability-review/g5-trust-contract.md:228`);
versioned packages with checksums; and an LSP, a formatter and code
generation (Pkl's for Java, Kotlin, Swift and Go; aontu's `render`).

Pkl has, and aontu lacks: classes with `extends` and `amends`; methods,
lambdas and `for` and `when` generators; interpolation; renderers for
YAML, plist, properties, XML, protobuf text and Jsonnet; runtime
bindings for Java, Kotlin and Swift; generators from JSON Schema and to
OpenAPI; and resource readers for environment variables, files and
HTTPS behind allowlists.

aontu has, and Pkl lacks: order-independent composition, where an
amending module overrides what it amends; comparison of one schema
against another; termination; exact numbers beyond 64 bits; and
evaluation with no environment or network reader at all.

Pkl had the strongest reception in this group (930 points on its
Hacker News launch thread). Its JVM heritage, binary size and pre-1.0
status are the usual objections.

### KCL

KCL (Rust core, Apache-2.0) has been a CNCF Sandbox project since
September 2023, with Go, Python and Node SDKs. Its listed adopters are
mostly Chinese enterprises (Ant Group, Huawei, Kyligence, Youzan), and
npm counts about 200 downloads a month for its JavaScript package.
Releases paused for about seven months before v0.13.0 on 25 September
2026. Its tour shows a recursive Fibonacci, so it is Turing-complete in
effect.

The two share schemas with constraints (KCL's `check:` blocks carry
messages); a `:` union that KCL documents as idempotent and that
refuses conflicts, the nearest thing to `&` outside CUE; a module file
and lockfile, whose shape aontu's package system borrowed before
dropping OCI
([ADR-039](../../ADR.md#adr-039--the-package-system-has-one-vocabulary-one-set-of-files-and-three-pins));
and a formatter, linter, test runner and LSP.

KCL has, and aontu lacks: Python-like syntax with lambdas, schema
inheritance, mixins, comprehensions and interpolation; `kcl import`
from JSON Schema, OpenAPI, Kubernetes CRDs, Terraform provider schemas
and Go structs; YAML, JSON, TOML and XML output; integrations with
Crossplane, KubeVela, Flux, Argo, Helm and Kustomize; and OCI
distribution.

aontu has, and KCL lacks: constraints that meet and compare
symbolically, where KCL's `check` blocks run only against data
(`docs/capability-review/g1-constraint-algebra.md:93-95`); strict
order-independence, which KCL's `=` override and `+=` append give up;
termination; and `subsume` and `breaking`.

KCL draws little independent discussion. A Hacker News thread in 2024
objected to its override semantics, and GOV.UK rejected it for weaker
type validation and IDE support.

### Starlark

Starlark (Java inside Bazel, Go, and Rust from Meta) is a
deterministic, hermetic dialect of Python. Its adoption is large and
carried by Bazel and Buck2; Homebrew counted 18,521 Bazel installs in
the year. Recursion and `while` are disallowed by default, so programs
terminate, though starlark-go and starlark-rust can switch both on.

The two share termination by default, determinism and hermeticity as
design rules, and several implementations held to one specification.
aontu took Starlark's practice of pinning observable ordering into its
spec suite (G5 phase 5).

Starlark has, and aontu lacks: Python syntax; user functions, loops and
comprehensions; built-ins supplied by the host; and optional static
types in the Rust implementation (Bazel plans them for 10.0).

aontu has, and Starlark lacks: a data model. Starlark has no schemas,
no combination of partial definitions and no validation, and what it
outputs is up to the host.

Hermeticity is what Starlark's users praise; the absence of types and
the indirection of large rule sets are what they complain of. Starlark
writes configuration programs rather than configuration data, so its
overlap with aontu is in the trust model, not the data model.

### HCL

HCL (Go, MPL-2.0, from HashiCorp, which IBM has owned since February
2025) is dominant through Terraform and OpenTofu: the Terraform
Registry lists 7,366 providers, and Homebrew counted 80,087 OpenTofu
installs in the year. HCL has no user functions or recursion, so it is
not Turing-complete, though no official document says so.

The two share the absence of user functions, a declarative form with a
JSON equivalent, and, in Terraform, typed `variable` blocks with
`validation` rules and `optional(type, default)`, which overlap aontu's
constraints and defaults.

HCL has, and aontu lacks: the largest ecosystem in the field; `for`
expressions, `for_each` and `dynamic` blocks, conditionals and `${}`
and `%{if}` templates; a large function library; and parsers for Rust
and Python hosts.

aontu has, and HCL lacks: composition, since Terraform refuses
duplicate definitions and its override files and `merge()` are
one-directional; meaning defined by the language rather than by the
host application; and schema comparison and provenance.

"The lack of expressiveness of HCL is the point" sums up its defenders;
`count` and `for_each` contortions and weak abstraction are the standing
complaints. Terraform moved to the Business Source Licence in August
2023, OpenTofu forked under MPL and joined the CNCF Sandbox in April
2025, and HashiCorp ended CDK for Terraform in December 2025. The HCL
library itself remains MPL-2.0.

### Nix

The Nix language (C++, LGPL-2.1, with the Lix fork and Rust efforts
beside the reference implementation) is lazy, dynamically typed and
functional, with general recursion. It builds Nix and NixOS, and
nixpkgs holds over 120,000 packages.

The two share lockfiles pinned by content hash (Nix hashes bytes,
aontu hashes meaning); the NixOS module system, which merges
definitions from many files with priorities (`mkDefault`, `mkForce`)
and type-directed conflict errors, and is the nearest Nix analogue to
unification with ranked defaults, though it is a library rather than
the language; and `nix why-depends`, the model for aontu's `why`.

Nix has, and aontu lacks: a general functional language; derivations,
fetchers and builds; nixpkgs and flakes; and several evaluators
(CppNix, Lix, Determinate Nix).

aontu has, and Nix lacks: schemas in the language core; termination; a
JSON-superset syntax; and coded, located errors.

Nix is powerful and widely used, and its error messages, debuggability
and discoverability are the persistent complaints. In 2024 the project
went through a governance crisis: Eelco Dolstra left the NixOS
Foundation board, the first Steering Committee was elected, and the Lix
fork began.

## The rest of the field

### Smaller and historical languages

RCL (Rust, Apache-2.0, one author) is a JSON superset with
comprehensions, functions and gradual types that writes JSON, TOML,
YAML streams and systemd units. Its adoption is minimal, the same scale
as aontu's. Its author calls it "not a general-purpose programming
language", but self-application gives it general recursion, so it is
Turing-complete in effect. It has no unification and no constraints.

GCL, Google's internal configuration language, is inheritance-based and
not public. Jsonnet descends from it, and CUE's author worked on it at
Google before designing CUE around unification instead of inheritance.

### Templating and tool-specific layers

All of these let a later layer win, and each is tied to one tool. aontu
can sit in front of any of them as the model and validation layer. Its
JSON output is valid YAML 1.2, but it does not write idiomatic YAML.

| Tool | Relation to aontu |
|---|---|
| Helm | Go templates over YAML. Values files merge with the later file winning; an optional `values.schema.json` catches misspelt keys. |
| Kustomize | Structured patches with no templates, applied in order. aontu's overlay use case refuses a conflicting value instead (`use-cases/02-deploy-config/`). |
| ytt | YAML with embedded Starlark and overlay patches. |
| Bicep | A typed Azure language compiling to ARM JSON. Its `@minValue` and `@allowed` decorators mirror aontu's constraint atoms. |
| CloudFormation | YAML or JSON with intrinsic functions; validation comes from external linters. |
| Ansible, Salt | YAML with Jinja2. Ansible's 22-level variable precedence is the override ladder that ranked defaults and conflict refusals replace. |
| Puppet | A resource language; Hiera's hierarchical deep merge of data is the overlap. |

### Configuration written in a general-purpose language

Pulumi, the AWS CDK and cdk8s generate deployment specifications from
TypeScript, Python, Go and other languages. They offer unlimited
abstraction and no termination or hermeticity, and aontu's TypeScript
engine could sit inside them as the model layer. Gradle's Kotlin and
Groovy scripts, Lua (Neovim, WezTerm), Guile (Guix) and Emacs Lisp make
configuration an executable program, which is a different job.

### Policy and expression languages

These decide questions about data. aontu composes and compares
schemas.

| Language | Relation to aontu |
|---|---|
| Rego (OPA) | Datalog-style rules that refuse recursion. aontu took conftest's exit classes, GitHub Action and machine-readable output, and OPA's explanation ladder for `why`. OPA has no verb that compares two policies. |
| CEL | Bounded cost with a static estimate, used in Kubernetes CRD validation and admission policies. It overlaps `must`; aontu has event budgets and no cost model (`docs/capability-review/g5-trust-contract.md:237-243`). |
| Cedar | AWS's analysable authorisation language. In aontu's RBAC use case the decision stays with the policy engine and aontu guards changes to the policy data (`use-cases/05-rbac-policy/`). |
| Sentinel | HashiCorp's proprietary policy language; it overlaps only in validation. |

### Plain data formats

Any JSON document parses as aontu source, and JSON, JSON-LD, JSONC,
JSON5, jsonic (`.jsonic` and `.jsc`), YAML, TOML and INI can be included
as data. XML, HOCON, UCL,
KDL, EDN, RON, plist, `.properties` and protobuf text cannot be read,
and CSV is refused because the two ports' readers disagreed
([DIVERGENCE.md](../../DIVERGENCE.md)). Of these formats only HOCON
and UCL combine documents (includes, substitutions, the later value
winning), and neither has constraints. The schema layer most of them
use is JSON Schema.

## Where aontu stands

1. The design position holds, with a narrower claim than this
   repository makes. CUE is the only other language whose evaluation
   model is unification. Nickel's priority merge, KCL's `:` union,
   Dhall's `∧` and the NixOS module system each combine documents
   without regard to order, but beside override operators or general
   functions. None of the nine pairs ranked defaults, three-valued
   subsumption with a breaking gate, positive provenance, meaning-based
   pins, coded two-site findings, an agent-facing toolchain and two
   native engines at tested parity.
2. Adoption is the widest gap. Every other language here except Dhall
   has a company, a foundation or a dominant tool behind it: CUE Labs,
   Apple, Google, Meta, Tweag, IBM's HashiCorp, the CNCF or the NixOS
   Foundation. Dhall, a community project with an Open Collective, is
   also the one in decline. aontu has a single maintainer and a sponsor,
   and its production use stops at includes, spreads, defaults and
   references.
3. Interchange is the next gap. CUE, KCL, Nickel and Pkl each import
   JSON Schema or OpenAPI, and each writes YAML. aontu imports neither,
   writes JSON only, and has no serving package repository.
4. The refusals carry a price. All nine offer user functions,
   comprehensions or both, and aontu offers neither, so a newcomer's
   first questions will be about the combinators that replace them.
   The refusals are what keep aontu terminating and analysable, the
   property it shares with CUE, Dhall, Starlark and HCL.
5. For aontu's stated purpose the incumbent is JSON Schema, not CUE.
   The npm description calls aontu a "validation gate for AI-agent
   ground truth", and this repository already names "JSON Schema
   2020-12 plus prose" as the strongest competitor
   (`docs/capability-review/index.md:331-336`). Structured output at
   the major LLM providers takes JSON Schema, and aontu can export it
   with losses reported but cannot import it.
6. The termination claim has two open counterexamples (BUGS.md §18 and
   §57). Until they close, termination is a property of the design
   rather than of the shipped engines, and it is the property CUE,
   Dhall and Starlark hold by construction.

## Claims in this repository that the survey contradicts

| Where | Says | What the evidence shows |
|---|---|---|
| `docs/design/AONTUCONSTRAINTS.0.md:31-34`, `ADR.md:828-829` | only CUE shares aontu's commutative unification core; Jsonnet, Pkl, Dhall, Starlark and HCL are directional override chains | Dhall's `∧` is a symmetric recursive merge that fails on collision (only `⫽` is right-biased), and KCL documents its `:` as an idempotent union. CUE is still the only language where unification is the whole evaluation model. |
| `docs/design/VIEWS-ORDER.0.md:175-178` | Dhall has no canonical form under which two spellings are one node | Dhall's normal form is that canonical form: its semantic integrity hash is computed over it, which `docs/capability-review/g6-distribution.md:194` relies on. |
| `docs/capability-review/index.md:119-120` | closed lists are something CUE's structs do not cover | CUE's list literals are closed already; `[...T]` is how CUE opens one. |
| `docs/capability-review/index.md:140-142` | spreads go beyond CUE's pattern constraints in several directions | CUE's patterns also apply across declarations and through definitions. Each language reaches the other's cases: CUE scopes a pattern to matching keys directly (`[=~re]: T`), and aontu reaches it through a guarded spread (`docs/capability-review/g12-jsonschema-fidelity.md:103-108`). |
| `docs/capability-review/g7-machine-access.md:215-216` | CUE is on its second evaluator, partly to retrofit error tracking | evalv3 has been CUE's default evaluator since v0.13 (May 2025), and speed and memory drove it as much as error tracking. |
| `use-cases/REVIEW.md:92` | no other JSON-superset language refuses number corruption this way | CUE's integers and decimals are arbitrary-precision, so CUE has no rounding to refuse. |
| `docs/capability-review/g8-generation.md:179` | Starlark has no recursion and no `while` | True of the specification's defaults; starlark-go and starlark-rust each have opt-in switches for both. |

## Sources

- [Homebrew formula API](https://formulae.brew.sh/api/formula/cue.json).
  Install counts, one formula per URL.
- [cuelang.org, upgrading from evalv2 to evalv3](https://cuelang.org/docs/concept/faq/upgrading-from-evalv2-to-evalv3/).
  The evaluator change.
- [cuelang.org, how CUE works with JSON Schema](https://cuelang.org/docs/concept/how-cue-works-with-json-schema/).
  CUE's import and export.
- [Dagger, ending CUE support](https://dagger.io/blog/ending-cue-support/).
  Dagger's exit from CUE.
- [Hacker News, Dagger's founder on CUE](https://news.ycombinator.com/item?id=46265956).
  The learning-curve quotation.
- [CUE Labs funding announcement](https://www.prnewswire.com/news-releases/sequoia-backed-cue-labs-the-company-behind-widely-adopted-cue-open-source-project-emerges-from-stealth-to-tackle-multi-billion-dollar-configuration-challenge-302599632.html).
  October 2025.
- [GOV.UK infrastructure ADR 0022](https://docs.publishing.service.gov.uk/repos/govuk-infrastructure/architecture/decisions/0022-use-pkl-for-configuration.html).
  The Pkl selection, with CUE, KCL, Jsonnet and Dhall assessed.
- [Dhall safety guarantees](https://docs.dhall-lang.org/discussions/Safety-guarantees.html).
  Totality.
- [Dhall in production](https://docs.dhall-lang.org/discussions/Dhall-in-production.html).
  Named adopters.
- [Jsonnet design rationale](https://jsonnet.org/articles/design.html).
  Turing-completeness by design.
- [Nickel README](https://static.crates.io/readmes/nickel-lang-cli/nickel-lang-cli-1.18.0.html).
  Turing-completeness and Nickel's own comparison table.
- [Tweag, Nickel since 1.0](https://www.tweag.io/blog/2026-02-19-nickel-since-1-0/).
  The performance work.
- [Pkl language reference](https://pkl-lang.org/main/current/language-reference/index.html).
  Recursion, constraints and resource readers.
- [Hacker News, Pkl launch](https://news.ycombinator.com/item?id=39232976).
  The launch reception.
- [KCL 0.13.0 release](https://www.kcl-lang.io/blog/2026-09-25-kcl-0.13.0-release).
  The current release.
- [KCL tour](https://www.kcl-lang.io/docs/reference/lang/tour).
  Recursive schemas and the configuration operators.
- [CNCF, KCL](https://www.cncf.io/projects/kcl/). Sandbox status.
- [Bazel, the Starlark language](https://bazel.build/rules/language).
  No recursion and no `while`.
- [DevOps.com, IBM HashiCorp ends external-language support](https://devops.com/ibm-hashicorp-ends-external-language-support-for-terraform/).
  CDK for Terraform.
- [CNCF, OpenTofu](https://www.cncf.io/projects/opentofu/). The MPL fork.
- [nix.dev, the Nix language](https://nix.dev/tutorials/nix-language).
  The language's own description.
- [LWN, Nix governance](https://lwn.net/Articles/971973/). The 2024
  crisis.
- [RCL, a reasonable configuration language](https://ruuda.nl/2024/a-reasonable-configuration-language).
  RCL's rationale.
