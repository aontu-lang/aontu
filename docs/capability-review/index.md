# Capability review: aontu as a systems ground truth for agents

*Status: review (August 2026). This document records a survey of the
literature, comparable languages, and industry practice, asking one
question: what fundamental capabilities does aontu lack to fulfil its
stated purpose — a systems-definition language and ground truth for
agents? Each identified gap has a companion design document (G1–G10,
linked below) with alternatives, boundaries, risks, and an
implementation plan.*

> **Where the work stands** is recorded in the
> [progress register](progress.md) — every numbered phase of G1–G10,
> its status, and the artifact that proves it. This index and the gap
> documents describe what *should* be built and were written before any
> of it landed; the register is the only place that says what *has*
> been — read the count there, not here: a status number restated in a
> design document rots, and this one did.

Method: a ten-agent survey — three codebase analysts over this
repository, six researchers (CUE; Nickel/Dhall/Pkl/KCL/Jsonnet/Starlark;
refinement types and formal methods; ontologies and MBSE; agent-industry
practice; developer tooling and visualisation), plus an adversarial
fact-checking pass over the combined findings.

## The verdict in brief

aontu's kernel is the right bet, and the survey validates it from
several independent directions. The lattice guarantee — any observed
field value holds for the final result; merging is commutative,
idempotent, and fails loudly on conflict — is exactly the property that
makes a definition trustworthy in a way markdown can never be. The
closed-world validation stance is the one the semantic-web community
needed two separate languages (OWL, then SHACL) to reach; aontu has it
as a per-node dial. The JSON-superset surface means agent-emitted JSON
is already valid aontu. And the dual TypeScript/Go implementation with a
shared machine-readable spec suite is an unusual asset: the same
semantics embeddable in Node agent harnesses and Go gateways.

But today, "type safety through unification" cashes out as **five
scalar kinds, literal equality, disjunction-enums, and closedness** —
`a: number > 0` is a parse error (verified live), there is no regex,
and no length or cardinality constraint. Cross-field *equality* is
expressible through references (`b: $.a` conflicts if `b` is pinned
elsewhere), but no cross-field inequality or general predicate is.
And the language is an *evaluator of its own files*, not yet a
*service other things are checked against*: `@"file"` can load and
unify external data and the TS API exposes `ctx.find(path)`, but
there is no dedicated validation verb with a structured report
contract, no CLI query surface or token-efficient projections, no way
to ask why a value holds, and no check that v2 of a schema still
honours v1.

The industry context sharpens the stakes. The 2024–26
spec-driven-development movement (GitHub Spec Kit, AWS Kiro, OpenAI's
Model Spec, AGENTS.md, Agent Skills) chose structured *markdown* — and
its acknowledged weakness is that prose specs cannot detect
contradiction, drift, or type error; OpenAI had to build an entire
LLM-graded eval harness just to measure compliance with its own spec.
The enforcement camp (OPA/Rego, Cedar, Kubernetes CEL) proves that
deterministic, non-Turing-complete, analysable languages are what
actually gets deployed at decision boundaries — AWS chose Cedar for
agent authorisation explicitly for determinism and analysability.
**Nobody has fused the two: a language that is simultaneously the spec
agents read and the gate that validates their output.** That is the
position aontu targets, and the survey's clearest conclusion is that
the fusion is won or lost on the capabilities below — mostly
infrastructure around the lattice, not syntax on top of it.

## The eight fundamental gaps

> **Two more were opened later.** G1–G8 are the August 2026 survey.
> [G9](g9-transformation.md) was opened on 2026-08-30, after all eight
> had landed, and asks a question the survey did not: once a model is
> trustworthy, how does the CODE come from it? Its companion for the
> non-declarative forms is
> [docs/design/GENERATION-FORMS.0.md](../design/GENERATION-FORMS.0.md).
> [G10](g10-transparency.md) was opened the same day and asks the
> question G6 left open: G6 made a module's meaning *pinnable*, but a
> lockfile is a private memory — what makes the FIRST pinning of it
> public and auditable? It is the one gap that admits a service the
> project must operate, which
> [ADR-013](../../ADR.md#adr-013--the-project-operates-one-transparency-log-and-nothing-else)
> permits once and bounds.

| # | Gap | Why it changes what the language is | Design doc |
|---|-----|-------------------------------------|------------|
| G1 | A real constraint algebra | Makes "type safety through unification" true beyond five kinds; everything else is downstream | [g1-constraint-algebra.md](g1-constraint-algebra.md) |
| G2 | The validation verb | Turns aontu from expression evaluator into agent guardrail (emit → validate → repair) | [g2-validation-verb.md](g2-validation-verb.md) |
| G3 | Subsumption as a query; schema evolution | Ground truth is a claim about time; the lattice makes compatibility checking nearly free | [g3-subsumption-evolution.md](g3-subsumption-evolution.md) |
| G4 | Identity and typed relations | Systems are graphs; aontu documents are trees with document-scoped paths | [g4-identity-relations.md](g4-identity-relations.md) |
| G5 | A specified trust contract | Hermeticity, termination, determinism, sandboxing — constitutive for unattended agent evaluation | [g5-trust-contract.md](g5-trust-contract.md) |
| G6 | A distribution layer | Versioned, integrity-hashed, pinnable modules; truth must be shareable and tamper-evident | [g6-distribution.md](g6-distribution.md) |
| G7 | A machine-facing access surface | Query, provenance, patch, MCP — agents consume slices, not whole evaluated blobs | [g7-machine-access.md](g7-machine-access.md) |
| G8 | Generation, on the total side of the fork | N children from data without copies that drift — and without losing the termination guarantee | [g8-generation.md](g8-generation.md) |
| G9 | Declarative transformation | The model is the source of the CODE — one model, many generated artifacts, each over part of it | [g9-transformation.md](g9-transformation.md) |
| G10 | A transparency log | A lockfile is a private memory; the first resolution of a version needs a public, append-only, auditable record | [g10-transparency.md](g10-transparency.md) |

## What aontu already has right

These are assets the review recommends protecting — several have no
equivalent in CUE:

- **The lattice kernel** — schema, defaults, and data as one kind of
  value; order-independent merge engineered deliberately (conjunct-term
  sorting, canonical closed-map unify direction) and pinned by the
  shared spec.
- **Closed-world validation with a per-node dial** — `close()`/`open()`,
  including closed *lists*, which CUE's structs don't cover.
- **JSON-superset surface** — any JSON document is valid aontu, so
  agent output can be unified directly against a definition with no
  conversion. This is the substrate for a `vet` operation (G2) and
  dramatically lowers the LLM learning cliff for a low-resource
  language.
- **Canonical form** — a deterministic, reparseable normal form. The
  research upgrades this from a convenience to an economic asset: it is
  the seed of semantic hashing (G6), semantic diff, and
  prompt-cache-stable serialisation.
- **Dual TS + Go implementations with the TSV spec contract** — a
  shared suite (45 files, ~426 rows at review time; current counts
  live in the [progress register](progress.md#the-update-protocol),
  rule 5) run identically by both. The suite is itself a
  machine-readable ground truth an LLM can be taught from, and the
  parity method (spec rows first, both implementations follow) is
  exactly how every capability below should land.
- **Ranked preferences** — defaults of defaults (`**` outranks `*`),
  richer than CUE's single level and a natural fit for layered system
  definitions (org < team < service).
- **Spreads** (`&:`) that work on lists, cross-statement, and via
  referenced templates — beyond CUE's pattern constraints in several
  directions.
- **Native variant modelling** — disjunction is a variation point,
  preference is the default variant. SysML v2 had to bolt on
  `variation`/`variant` keywords for what aontu's core already
  expresses compositionally.
- **In-memory resolver and host-injected `$name` variables** — good
  bones for sandboxed, parameterised agent evaluation.

## The gaps, in summary

Each summary below is expanded — with alternatives considered, an
explicit boundary of things we will not do, a risk assessment, and an
implementation plan — in its companion document.

### G1 — A real constraint algebra

The single highest-leverage gap, and the one the language's central
claim rests on. What is needed is not just `number > 0` but a
*vocabulary of constraint atoms that are lattice citizens*: numeric
bounds, regex patterns, string/list/map length and cardinality
("between 2 and 5 replicas", "exactly one primary"), scalar negation,
and cross-field inequalities via existing path references. The
liquid-types lesson: no SMT solver is needed — a closed vocabulary of
predicate constructors, each with meet, emptiness, and subsumption
rules written down. Interval intersection decides `>5 & <3 → nil` at
schema-composition time — something evaluate-only systems (CEL, KCL,
Nickel contracts) can never do. For arbitrary domain rules beyond the
algebra, the escape hatch is an evaluate-only predicate with an
author-attached failure message, honestly reported as evaluate-only.
A related defect: both implementations pin numbers to IEEE-754 double
semantics, so int64-scale values silently lose precision; CUE
deliberately uses arbitrary-precision decimals.

A **second, independent constraint design** —
[`docs/design/AONTUCONSTRAINTS.0.md`](../design/AONTUCONSTRAINTS.0.md),
written downstream from a boru survey and cross-checked against real
`cue export` — arrived on 2026-08-27, after most of G1 had landed. Its
disposition against the shipped engine is in
[g1-constraint-algebra.md](g1-constraint-algebra.md#reconciliation-with-the-2026-08-27-constraint-design-note):
the two defects it root-caused were already fixed, its bounds and regex
landed under function syntax rather than the CUE operators it proposed,
and its key-pattern constraints — the substantial piece still unbuilt —
are deferred by decision rather than blocked.
Read its §2 baseline as a snapshot of Go v0.1.6, not as current
behaviour.

### G2 — The validation verb

The canonical agent loop — *emit, validate, repair* — currently has no
entry point: the CLI evaluates one file to JSON, full stop. Because
aontu is a JSON superset, `aontu vet schema.aon candidate.json` is
nearly free to implement (unify + closedness + report), and it changes
the language's identity from evaluator to gate. The same verb, pointed
at a live system dump, is drift detection. The output contract matters
as much as the verb: stable error codes, JSON and SARIF output,
severities, author-attached messages, and errors that state **what
would have unified** — repair-loop studies find admissible
alternatives, not failure location, drive an agent's ability to
self-correct.

### G3 — Subsumption as a first-class query; schema evolution

Ground truth is a claim about *time*: agents act on stale snapshots,
and the truth evolves. aontu's lattice makes the principled version of
compatibility checking nearly free: new schema subsumes old ⇒ backward
compatible; the reverse ⇒ forward compatible; both ⇒ full. Exposing
subsumption — as a builtin, a CLI verb
(`aontu breaking --against git#main system.aon`), and a library call —
powers versioned evolution, default-validity checking, CUE-style trim,
and the entailment queries agents actually need. Paired with a
deprecation mark surfaced at point of use, it gives shared schemas a
complete evolution story. The fact-check pass ranked this aontu's most
defensible differentiator.

### G4 — Cross-document identity and first-class typed relations

Systems are graphs; aontu documents are trees with document-scoped
paths. Today the language cannot say "this `dependsOn` target must
exist and be a Service", cannot declare or check an inverse relation,
cannot forbid a cyclic dependency path, and cannot merge two files
that describe the same real-world entity unless they share a tree
path. The adoptable shape, without abandoning the JSON tree: a stable
identity mark on any node, a reference constraint with referential
integrity checked at unification time, and path constraints. Notably,
unification gives cross-document identity cleaner semantics than the
semantic web ever had: declaring two nodes the same entity means
unifying them, so a contradiction is a hard, located error rather than
the silent corruption of `owl:sameAs`. Ports/interfaces/connections —
the recurring MBSE primitives — need no new syntax: ship them as a
blessed standard-library schema vocabulary.

### G5 — A specified trust contract

For an artifact that agents evaluate unattended, safety guarantees are
not hardening — they are constitutive. Today the gap is real: the
default resolver makes opening an untrusted file equivalent to running
it (`@"pkg"` can `require()` arbitrary modules; the LSP inherits
this), and the fixpoint's hard 9-pass bound means models that need a
tenth pass silently stop refining rather than erroring distinctly.
Hermeticity — same file set + same `$` bindings ⇒ identical output —
is currently *false* under the default resolver: a package include
can execute a module whose export derives from time, environment, or
filesystem state, so identical sources can produce different results.
It holds only under confined resolvers (memory/filesystem), and
resolver confinement is therefore part of *establishing* the
guarantee, not merely documenting it. The work:
write the guarantees down, pin them in the spec suite (including
byte-identical canonical output across TS and Go), give the evaluator
API a capability surface, adopt import-sandbox rules before `@"…"`
ever goes remote, and make evaluation bounds semantic errors rather
than silent truncation.

### G6 — A distribution layer

Textual file inclusion is a single-project mechanism. Ground truth
must be shareable across repos, teams, and agent sessions, and
tamper-evident when it travels. The ecosystem default is settled —
versioned modules with lockfiles, distributed over OCI registries.
The differentiator on top: Dhall-style **semantic integrity hashes
computed over aontu's canonical form**. A pin hashes the *meaning*,
not the bytes — refactors and comments don't break it; any semantic
change anywhere in the transitive closure does. One honest caveat the
design must resolve: canon today is deterministic *syntax*, not a
unique semantic normal form (`number|integer` denotes the same value
set as `number` — `DisjunctVal` drops only `same()` alternatives —
yet the two canon differently), so hashing requires either a
subsumption-based minimisation step before the hash or the weaker,
clearly-labelled claim of a canonical-text hash. aontu's existing
canon still makes either variant nearly free, and no
unification-family language has it.

### G7 — A machine-facing access surface

Agents do not consume ground truth by evaluating whole files into one
JSON blob — they retrieve task-sized slices and patch by path. Three
surfaces are missing: **query** (`aontu get $.services.auth --canon`
returning the evaluated fragment, plus token-efficient projections),
**positive provenance** (`aontu why $.path` — today sites are tracked
only for errors; extending site-tracking to successful unifications is
far easier to build now than to retrofit later, as CUE's history
shows), and **semantic patch** (set a path through unification with
re-validation — which also requires a comment-preserving,
format-preserving rewrite story that canon alone cannot provide).
Delivery matters as much as capability: an official MCP server
(validate/query/why/diff/canon), an AGENTS.md stanza, an official
skill, and a published machine-consumable grammar for constrained
decoding.

### G8 — Generation and abstraction, resolved on the total side

Producing N similar children from data — one block per service, per
region, per replica — is the bread-and-butter of systems definition.
Without it, humans and agents copy-paste, and the copies drift, which
defeats ground-truth-ness from inside. aontu's spread applies a schema
to children that exist; nothing can *generate* children, compute a
key, or interpolate a string. This is also the language's deepest
identity question: every credible safety story surveyed (Dhall,
Starlark, CEL, Cedar) lands on the same side — a ground truth
evaluated unattended by agents must terminate by construction. Take
comprehension power from total combinators
(`each`/`pack`/`filter`/`match`) and bounded evaluation budgets, and
treat "aontu evaluation always terminates, deterministically" as a
headline, spec-guaranteed feature.

## Traps to refuse

The survey found as much evidence about what *not* to build. Each of
these is a documented failure mode in an adjacent system:

- **Turing-completeness.** Recursive user functions trade away the
  termination guarantee that makes unattended agent evaluation safe.
- **SMT solvers in the checker.** Documented proof flakiness and
  solver-version nondeterminism (F*) are disqualifying for a
  dual-implementation language whose product is deterministic answers.
- **Temporal/behavioural logic in the language.** "Replicas eventually
  converge" is inexpressible in a value lattice by construction.
  Represent state machines as ordinary aontu data and export to
  TLA+/P — be the structural front end, not the model checker.
- **General negation/complement.** Sound only atop semantic-subtyping
  machinery that costs months across two implementations. Scalar-level
  negation (`!=`, not-in-set) composes fine within the bounds algebra.
- **Surface-area creep toward CUE.** Every stratum CUE added raised
  its floor; its highest-profile adopter (Dagger) dropped it as users'
  number-one complaint. aontu's small, JSON-superset surface is a
  moat — especially for LLMs, where grammar size is acquisition cost.
  Also heed CUE's deepest scar before deepening types: pin down the
  interactions of `*`, closedness, and spreads in the spec suite
  first; those are the non-lattice-pure features that forced CUE's
  multi-year evaluator rewrite.
- **Ignoring the null hypothesis.** The strongest competitor for
  "ground truth for agents" is JSON Schema 2020-12 plus prose. aontu's
  answer must be stated explicitly and delivered mechanically:
  merge-as-unification, subsumption-as-compatibility, located two-site
  conflicts, semantic hashing — the things JSON Schema structurally
  cannot do.

## Sequencing

| Phase | Capabilities | Rationale |
|-------|--------------|-----------|
| A — make the claim true | G1 constraint algebra core (bounds, regex, length/count) · G2 `vet` with structured reports, stable codes, admissible-alternative errors · G5 trust contract written and spec-pinned | These convert "type safety through unification" from positioning into fact, and open the emit → validate → repair loop |
| B — differentiate | G3 `subsume`/`breaking` · G6 canon-hash pinning · G7 `get`/`why` + MCP server + published grammar + skill | Each is nearly free given the lattice and canon, and no competitor has the principled version |
| C — scale | G4 identity/relations + stdlib vocabulary · G6 full module registry · G8 total generation combinators · incremental LSP · views/diagram exporters · JSON Schema interop | Ecosystem weight; several depend on Phase A |

The exception: the G7 query/MCP surface depends on nothing and is the
cheapest adoption wedge — it could ship first, wrapping today's
evaluator, and every later capability becomes another tool on the same
server. Throughout, the existing method is the right one: every
capability lands as TSV spec rows first, both implementations follow,
and property-based differential testing guards the algebra as the Val
zoo grows.

Progress against this table is tracked phase by phase in the
[progress register](progress.md). In short: Phase A is most of the way
done — the trust contract, the error-code registry, the whole constraint
algebra (bounds, `re`, `length`/`unique`, cross-field residuation and
`must`), the whole of G2 (the `vet` verb in both ports, its delivery
skin, multi-error collection), and the whole of G5's machinery (the
trust profile in both ports at every surface, deterministic budgets,
the include manifest), with shared rows for all of it. Outstanding in
A: only G5.6's default flip, a next-major release act whose warning
window already ships. **The numbered phases of B and C have since
landed too** — G7.7's Go `--jsonl` gap, named here when this paragraph
was last corrected, closed on 2026-08-24 — but two unnumbered Phase C
items have not: incremental LSP is not built and belongs to no plan
(both servers use full document sync), and JSON Schema interop is
export only. And G5.6 is no longer the register's only partial: G9 and
G10, opened after this paragraph was written, carry partials of their
own (2026-09-05). This paragraph was written
before any of the work and is kept only for the sequencing rationale
above it; the [progress register](progress.md#summary) carries the
actual state, and the dated status reports carry what driving the
delivered surface found —
[`status-2026-08-21.md`](status-2026-08-21.md) for the agent-facing
surface, [`status-2026-08-27.md`](status-2026-08-27.md) for
implementing the external language review.

## Verified codebase facts referenced by the design documents

Checked against this repository at review time (TS v0.49.0 line).
**Several have since moved — the review's own work changed them
— and are marked inline; the rest still hold as written.**

- ~~Exactly 12 builtin functions~~ **now 48** — this correction
  itself rotted once, reading "17" for three days after G1's later
  atoms, G3's `deprecate`, G4's `id`/`refer` and G8's four
  combinators had landed. Hard-wired in the parser's `funcMap`
  (`ts/src/lang.ts`): the original twelve — `upper`, `lower`,
  `copy`, `key`, `type`, `hide`, `move`, `path`, `pref`, `close`,
  `open`, `super` — plus G1's nine constraint atoms, `deprecate`,
  `id`, `refer`, and `pack`/`each`/`filter`/`match`. (`ExpectVal` is
  internal spread-required machinery, not a user-callable function.)
  Re-counted 2026-09-05 from `test/spec/signature.tsv`, the declared
  surface since ADR-017: the roster just listed is the 2026-08-25 one;
  `id` has since gone (ADR-014), and `rel`, `acyclic`, `inverse`, `map`,
  `list`, the six arithmetic functions, `sum`/`least`/`greatest`,
  `pick`, `join`, `emit`, `esc`, `usc`, `rep` and `split` have arrived.
- Scalar constraints are kind-only; `a: number > 0` fails to parse
  (verified by running the CLI). **Still true as written — there is no
  operator sugar — but bounds themselves now exist in function form
  (`a: number & min(0)`), so the underlying gap is partly closed.**
- ~~45 shared spec files (~426 rows; modes `canon`/`gen`/`err`)~~
  **the suite has grown roughly sevenfold and its three modes are
  twenty-five**; the
  Go runner executes every row with no skip list. Counts move with
  every capability phase, so they are kept in one place with their
  reproduction commands — see the
  [progress register](progress.md#the-update-protocol), rule 5. (All
  eight gap documents once froze a count into a "nothing may
  regress" clause; each now links rule 5 instead.)
- ~~The fixpoint is bounded at `maxcc = 9` passes
  (`ts/src/unify.ts`); `MAXCYCLE = 999`.~~ **Both constants are now
  G5 budgets**: the pass bound is the configurable `budget.passes`
  (default 9) and the revisit bound stays an internal spec constant,
  with a `depth` budget (default 1000) beside them — see
  `docs/trust.md`.
- The resolver security posture is documented in code
  (`ts/src/lang.ts`, "treat opening an untrusted source as running
  it").
- Disjunct generation has a known distribution defect, acknowledged in
  a code comment (`ts/src/val/DisjunctVal.ts`).
- ~~Both implementations use IEEE-754 double number semantics (Go
  reproduces JS `Number.toString`).~~ **Superseded by G1 phase 6,
  which went well past the "decide and bound the defect" it was
  scoped as: numbers are now a four-leaf tower
  (`integer < float < biginteger < bigdecimal`), exact leaves opt-in
  via a `0d` prefix, and a literal that is integer-kind but not
  exactly representable is a located `lossy_integer_literal` error
  rather than a silently rounded value. See
  `docs/design/number-tower.md`.**
- Parsed/unified trees are single-use (documented mutation caveat);
  the LSP re-parses and re-unifies whole documents per change.

## Key sources

- CUE: language spec, "The Logic of CUE", modules design,
  evaluator-rewrite discussions, error-message threads; Dagger's
  "Ending CUE support".
- Config languages: Nickel manual and programmable-LSP posts; Dhall
  safety guarantees and semantic integrity checks; Pkl language
  reference and evaluator allowlists; KCL validation/package docs;
  Jsonnet design; Starlark design; NixOS module system; Hadlow's
  Configuration Complexity Clock.
- Formal methods: Liquid Types (PLDI '08) and the Jhala–Vazou
  refinement-types tutorial; PVS predicate subtyping; Dependent ML;
  Kubernetes CEL admission policy; semantic subtyping
  (Frisch/Castagna); LIFE residuation (Aït-Kaci & Podelski); Ivy's
  decidable-fragment discipline; Alloy; the S3 ShardStore
  lightweight-formal-methods paper; "Union and intersection contracts
  are hard, actually".
- KR & systems modelling: JSON-LD, SHACL, OWL; the `owl:sameAs`
  literature; SysML v2 spec and API; Structurizr (incl. its MCP
  server); Azure DTDL; AADL; Confluent schema evolution; buf breaking;
  Open Data Contract Standard; GraphRAG grounding literature.
- Agent industry: GitHub Spec Kit; AWS Kiro; OpenAI Model Spec and
  evals; AGENTS.md / Agent Skills / llms.txt post-mortems; Anthropic
  context-engineering and code-execution-with-MCP; grammar-constrained
  decoding (llguidance, XGrammar, CFG tools); structured-feedback
  repair studies; OPA/Cedar/CEL at the agent boundary; Context7.
- DevX: CUE LSP wiki; Nickel nls; gopls scalability; rust-analyzer
  inlay hints; Elm and Rust error-message design; `nix why-depends`;
  Terraform plan/phantom-diff analyses; D2/Mermaid; Backstage catalog;
  difftastic/dyff; SARIF.
