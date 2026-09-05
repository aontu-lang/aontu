# aontu: a critical review against the agent-ground-truth goal

*2026-08-26. Everything asserted here was established by execution
against the in-tree TypeScript implementation (v0.53.0 line,
`ts/bin/aontu.js`), not by reading prose: eleven executable use cases
([README.md](README.md), all green under [`run-all.sh`](run-all.sh)),
an adversarial verification pass over every headline claim
([BUGS.md](BUGS.md), minimal repros under [`repros/`](repros/)), and a
study of the four real codebases that consume aontu today — podmind,
todo-app, voxgig/apidef, and voxgig/sdkgen. Support structures —
release, distribution, community — are treated separately in
[SUPPORT.md](SUPPORT.md).*

## The verdict in brief

The capability review (G1–G8) delivered what it promised, and what it
delivered is real: this review drove `vet`, `subsume`, `breaking`,
`get`, `why`, `set`, `hash`, `relations`, `mod`, the MCP server, and
the whole constraint algebra through eleven enterprise scenarios, and
where the idioms hold, nothing else in the config-language space
answers the same questions. The lattice kernel, the exactness-refusing
number tower, the two-site findings with stable codes and exit
classes, cycle detection over declared relations, and the
witness-carrying breaking gate are genuinely ahead of CUE, JSON
Schema, Pkl, KCL, and Dhall on the specific position aontu targets —
the spec agents read *and* the gate that validates their output.

But this review's central finding is that **the language's composition
mechanisms betray its verbs exactly where real models live**. Every
use case that grew past a single file with literal templates hit one
of three walls, all verified down to minimal repros:

1. **The default/validation conflict.** There is no on-field spelling
   of "one of A|B|C, default A" that both defaults and validates — the
   single most common schema pattern in existence. A `*` default
   silently disables every sibling alternative, including a branch
   that *explicitly excludes* the override value. All four production
   consumers know: sdkgen and todo-app models carry
   `# TODO: fix aontu disjunctions!` apologies, retreat to
   `*'prod' | string` with enums enforced in downstream code, and ship
   generated AGENTS.md files instructing future *agents* not to use
   literal disjunctions.
2. **Template state shared across destinations.** Two unequal spread
   templates on one map merge sibling children *with each other*;
   `close()` or a rank-2 default around a `key()`-bearing pack
   template stamps the first child's key on every child; a nested
   pack's `_` captures the outer source; relative references re-anchor
   as bare values but not inside expressions. Each of these is a
   silent wrong answer with exit 0 in the exact idioms the
   generation story (G8) exists to enable.
3. **The gate disagrees with the evaluator.** Under `vet`, a missing
   required enum field is `valid`, schema-internal references bind
   schema-side only, template-conjoined sizing atoms fold against the
   wrong layer, and marks above the anchor silently drop required-key
   checks — so the guardrail passes documents the evaluator refuses.
   And `breaking --against git#rev` resolves the old side's *includes*
   from the working tree, silently un-gating every non-entry file on
   the multi-file layout every real model uses.

The consumer evidence closes the argument. aontu's flagship users
employ it as *jsonic with imports, spreads, and defaults* — and keep
every load-bearing semantic (enums, field constraints, validation,
relationships, access policy) in strings, downstream code, or prose.
None of them use `close()`, constraints, `id()`/`refer()`, `vet`, or
the evolution gate. The most damning artifacts found: podmind's
committed `model.json` — the runtime ground truth — contains unresolved
git merge-conflict markers at HEAD and nothing in the chain noticed;
and sdkgen's 2026-08 design docs plan a compatibility differ with "no
aontu dependency" while believing `vet` "does not exist" — the
ecosystem is routing *around* the verbs this repo spent G1–G8
building, partly because none of them are published (see SUPPORT.md).

The gap between "the verbs exist and are excellent" and "the language
can be trusted to compose" is where this review's work list lives.

## What execution confirmed is genuinely strong

Worth stating with the same rigor as the criticism, because each was
verified end to end and several have no equivalent elsewhere:

- **The vet report contract.** Two-site findings (`data:` and
  `schema:` with file:row:col:len and source text), stable codes with
  classes and severities, four verdict exit classes an agent can
  branch on, JSON and SARIF renderings byte-consistent with the text
  form. Use case 03 ran a genuine emit→validate→repair loop: an agent
  repairing *from the finding's `expected` field alone* fixed
  wrong-types, surplus-key, and constraint violations and re-vetted to
  green.
- **The number tower.** `0d0.1 + 0d0.2 → 0.3` exactly;
  `9007199254740993` refused with the `0d` escape named rather than
  silently rounded — including when it arrives in JSON *data* under
  vet. No other JSON-superset language refuses corruption this way.
- **Identity and relations.** `id()` merging two views of one entity
  is real and bidirectional, contradictions become located errors
  (the `owl:sameAs` lesson, actually implemented), `refer()` checks
  existence with residuation, and `aontu relations` reports cycles and
  missing inverses with entity names. Use case 01's onboarding flow —
  vet a candidate JSON, unify it in, re-run relations — is a working
  ontology-governance loop.
- **The evolution gate, single-file.** `breaking --against` with a
  file path gives correct, witness-carrying verdicts
  (`expected`/`actual` canons, both sites); `hash` is reformat-stable;
  `deprecate()` surfaces at use sites; `subsume` profiles behave as
  documented on plain values. Use case 04 gated additive vs narrowing
  vs required-key changes correctly across three schema versions.
- **The write path's safety rails.** `set` refuses contradictions
  quoting both sites and leaves the overlay untouched; `--in-place`
  is span-verified, idempotent (10 sets → one line), and
  comment-preserving. Use case 08's kill-switch pin survived every
  attack the case threw at it, and the hostile overlay's
  `@"/etc/hostname"` was denied under `--trust root:`.
- **Layering and ranked defaults**, when nothing else interferes: the
  `***org / **env / *tenant` ladder resolved all six arbitration
  cases in use case 08 correctly, and `why` at the layer paths
  attributes each contribution to its file with rank annotations.
- **Performance** at CLI/CI scale: ~800-line models in ~0.2–0.5s,
  20,000 keys in ~2.7s, near-linear; 100 MCP vet calls in one server
  process with per-call latencies an agent loop can afford.
- **Misuse handling**: mistyped verbs refuse rather than silently
  evaluating; merge-conflict markers are refused pre-parse; the
  documented executable-docs discipline keeps most doc examples true
  (the exceptions are named below).

## The findings

### A. The default/validation conflict is the language's deepest defect

Verified in five forms ([BUGS.md](BUGS.md) §1–5): the fail-open enum;
the bypassed constraint branch (`*8080 | (integer & neq(80))` accepts
80); the rank≥2 default silently swallowed by a bare-kind conjunct;
the `pref_not_instance` lint that fires on the correct idiom
(including on the bundled `std/system`'s own `direction:` field), can
be silenced only by a spelling that restores no enforcement, and has a
genuine false positive on ranked defaults; and `match()` on a
defaulted scrutinee deriving a value that contradicts the generated
value beside it.

The root is one documented decision: *a same-kind concrete peer
replaces a preferred value without consulting the disjunction's other
alternatives*. The docs frame the consequence as a trade
("closing the set costs the default") — but the practical reading is
that `*` is not a default in the sense every user of every config
system understands the word. A default that *widens the admitted set
to its whole kind* is a different, surprising construct, and all four
production consumers independently concluded it cannot be used.

**Recommendation (language change, highest priority).** Gate a
preference override by the *whole disjunction's admission*, not by the
preferred value's kind alone: an override must unify with at least one
branch. This makes `*'auto' | 'literal' | 'data'` mean what everyone
already believes it means; the current behaviour's only known
beneficiary is apidef's `*(x)|top` machine-emitted idiom, which
remains expressible by writing the `top` branch explicitly. This is a
breaking change; it is also the one that converts the most-used idiom
in every consumer model from a silent hole into a working feature, and
the `pref_not_instance` lint (whose existence concedes the problem)
can retire with it. The verified hidden-`match()` helper is the
interim workaround worth documenting.

### B. Generation and spreads corrupt silently under composition

The G8 combinators are the right shape — pack/each over data that is
already in the model, total by construction — and use case 06 produced
real k8s-style manifests for a service fleet from one compact model.
But the moment templates composed, five distinct silent-corruption
bugs surfaced (BUGS.md §6–12, §33–36), with two mechanical roots the
verification pass located: spread machinery entangling a combined
template with the first destination's data, and template clones
sharing inner nodes (`Val.clone` passing `peg` by reference;
`PrefVal`'s deep-clone commented out; `close()` mutating its shared
argument). The pack-refs family adds the third: relative references
and holes re-anchor as whole values but resolve at the template's own
location once inside a `+` or a call.

These are not exotic: *two views of one entity under different
templates* (01), *an org spread plus a team spread on one map* (02),
*close a generated child that names itself* (06), *a nested
per-env × per-service pack* (02), *a derived field reading the child's
own values* (02/06/09/10) — this is the daily grammar of system
modelling. Every one exits 0.

**Recommendation.** Treat template-clone isolation as a single
engineering campaign with the repros as its acceptance suite, and pin
the composition matrix (spread × spread, spread × pack, close/hide ×
pack, ranked-pref × key(), expression × relative-ref, nested pack) in
`test/spec/` the way `constraint-product.tsv` pinned the atom algebra
— all 256 pairs, mechanically. The capability review's own warning
("pin the interactions of `*`, closedness, and spreads in the spec
suite first; those forced CUE's multi-year evaluator rewrite") named
exactly this and it is the part that did not happen.

### C. Vet must agree with the evaluator

BUGS.md §13–17: under vet, missing required enum fields pass,
schema-internal references go stale, template-conjoined sizing atoms
fold against the wrong layer, map-argument `must()` is consumed by the
schema alone, and `type()`/`hide()` marks above the anchor drop
required-key findings. Each has the same shape: **vet and
one-document evaluation return opposite verdicts for identical
compositions.** For the product whose identity is "the gate agents are
validated against", this is the difference between a guardrail and a
decoration; use case 05's tenant-with-no-plan passing validation, and
todo-app's garbage rows vetting `valid` against the flagship entity
model, are what it looks like in practice.

**Recommendation.** Make "vet ≡ eval" a spec-level invariant: for
every schema S and data D, `vet(S, D)` and `eval(S ∪ D)` must agree on
accept/reject (their *reports* legitimately differ). A differential
fuzz harness over the existing spec corpus would have found every one
of these; it belongs beside the parity probe as standing
infrastructure. The two named engine causes — the
incomplete-class-only filter over `DisjunctVal.gen`, and the
schema-settles-alone staging — are where the fix lives.

### D. The evolution gate fails its own idioms

The gate's single-file behaviour is excellent (see strengths). What
breaks, verified: `git#rev` resolving old includes from the working
tree (BUGS.md §26 — the CI spelling from the how-to silently un-gates
every non-entry file); constraint residue inside spread templates
making contracts non-self-subsumable (§28), so the documented
close-per-entry contract idiom requires `--allow-undecided`, which
un-gates real undecideds; `--profile gen` non-reflexive on the
documented policy idiom (§29); and the judged document waiving its own
gate by design (§30). Combined with the consumers' data-not-constraints
models (apidef emits concrete data, so subsume "degenerates to
equality-with-noise" — their words), the result today is that **no
real repository can run the breaking gate meaningfully**.

**Recommendation.** Fix `git#rev` to materialise the old *tree* (the
file-path `--against` semantics, already correct, shows how); make
identical-canon templates reflexively self-subsumable before anything
subtler (a byte-equality fast path is honest and cheap); read
`aontu_policy` from the *old* side or require `--mode` in CI examples;
and give `breaking` `--at`. Then teach it to the consumers: the
constraint-projection builder apidef's design doc asks for (deriving a
*constraint* schema from apidef's emitted data model) is the missing
artifact that would let the whole Voxgig chain adopt the gate.

### E. Provenance answers the wrong question at the wrong moment

`why` is the agent-facing differentiator — and it is unstable across
sibling position, blind through `pack()`, one-sided across id-merges
(direction model-dependent), site-less for spread contributions on
generated children, and its flagship tutorial walkthrough documents
output the engine does not produce (BUGS.md §22–24). Meanwhile the
class of value an enterprise agent most often asks about — a default
flowing through a packaged shape via spreads — answers
"(no contributions: nothing met at this path)", a false statement
with exit 0, in podmind and todo-app alike. The recorder only
attributes meets on original AST nodes; clones are dark.

**Recommendation.** Make provenance stamping part of the clone
contract (sites survive cloning) rather than a recorder bolted beside
it; specify `why`'s output as a function of the document (spec rows
per sibling position — the current golden only covers the first
child); and either resolve the value line or label it pre-resolution.
Until then, `why` cannot be sold as the audit surface.

### F. Diagnostics misroute the repair loop

The finding *shape* is best-in-class; the *sites* are not: entry-file
names with included-file coordinates (both roles), error frames
quoting the wrong file's text under a correct header, junction values
at `-1:-1`, module diagnostics naming phantom paths built from the
module's own `mod.aon` metadata, `relations`/`trim` returning
`verdict: error` with zero findings, and vet truncating every message
to its first line — which deletes the `0d` repair hint exactly where
an agent needs it (BUGS.md §25, §27; ts-impl findings). Use case 03's
phrasing stands: *a repair agent that follows the site edits the wrong
file.* And the surfaces bypassing the finding shape (ANSI hardcoded
into piped stderr and `--jsonl` answers; `.json` includes dying as a
raw TypeError or a silent `{}`) undercut the machine-facing story.

**Recommendation.** One invariant — *every site names the file whose
text it excerpts* — plus finding-shape errors for `relations`/`trim`,
a `hint` field on vet findings (parity carve-out like `message`), and
`NO_COLOR`/isTTY gating. All mechanical; all high-leverage for the
agent loop.

### G. The trust story stops one step short of the surfaces agents use

G5's design is right and the library/MCP enforcement is real
(verified: the MCP server denies escapes centrally). But the CLI
*verbs* — `vet`, `get`, `why`, `subsume`, `set` — run the full
unconfined system resolver with no `--trust` flag at all; the REPL
accepts `--trust` and ignores it; LSP hover evaluates unconfined
beside confined diagnostics; and the default profile still executes
arbitrary code on include (`@"./payload.js"` demonstrably ran during
this review, with the failure misclassified as `[aontu/internal]`).
The staged G5.6 flip will also break every consumer's
`node_modules`-path include pattern the day it lands — podmind,
todo-app, apidef and sdkgen all warn on every evaluation today —
without a package-import concept to replace it.

**Recommendation.** Wire `--trust` through every verb and the REPL
now (mechanical); confine hover like diagnostics; and treat "how does
a confined evaluation import a package's schema" as a blocking design
question for the G5.6 flip — `mod` vendoring answers it only if the
consumers can actually adopt `mod` (see next).

### H. Distribution is not yet shareable truth

Use case 11 and the verification pass (BUGS.md §31–32): transitive
dependencies do not survive vendoring even when hand-vendored flat —
and `tidy` then locks **the canon-hash of `nil`** as the module's pin
(two different broken modules lock the identical pin), silently
voiding the "breaks on any semantic change in the transitive closure"
contract. `tidy` re-pins tampered content with no warning and there is
no `mod verify`; the cache cannot bootstrap without a pin; the only
cold-start path (hand-vendoring) has an undocumented layout; and
modules with internal references cannot be imported at a nested key.
Meanwhile sdkgen — which needed exactly this machinery — built its own
copy/provenance/doctor system with rename-on-add semantics `mod` does
not offer.

**Recommendation.** Refuse to lock a pin for a module that does not
evaluate (a `nil` pin is worse than no pin); resolve nested imports
against the consumer's vendor tree (or vendor transitively); add
`mod verify`; document the vendor layout; and interview sdkgen's
package subsystem before designing the network half — it is the most
demanding real user the distribution layer will ever have.

### I. Expressiveness walls, honest and otherwise

The termination-first boundaries (no recursion, no user functions, no
SMT) are principled and this review does not contest them. But three
walls fall on the wrong side of "total combinators can do this":

- **No aggregation.** `length()` counts but nothing sums: an invoice
  total, a fleet-wide resource budget, a quota roll-up — all
  inexpressible (use case 10 resorted to self-declared totals with
  `must()` spot-checks). A `fold`-free `sum()`/`min()`/`max()` over a
  finite bag is exactly as total as `each()`.
- **No projection.** `_.field` is unspellable, `filter` cannot see
  into lists, `unique()`-by-field is reserved but absent — so "no two
  services share a port" (02) and "unique event ids" (07) cannot be
  said. The reserved projector arity should be spent.
- **Arithmetic stops at `+`.** No `-`, `*`, `/` even as *functions*
  (the G8 boundary pre-registered them; nothing landed) — so "prod
  gets double the replicas" is inexpressible and k8s quantity strings
  concatenate (`"500m" + "500m"` → `"500m500m"`, silently).

Two more walls are strategic rather than semantic: **no JSON Schema
export/import** (the interop wall — treated in SUPPORT.md, but it is
also a language question: the constraint algebra maps cleanly onto
JSON Schema's core, and the mapping should be specified while both
sides are small), and **exact numerics are write-only with respect to
JSON** (a `bigdecimal` schema is unsatisfiable by anything a standard
JSON serializer can emit, and aontu's own generated output no longer
vets against the schema that produced it — the money story needs a
documented wire convention, e.g. string-decimal fields with `re()`
plus a conversion mark, more than it needs new machinery).

Deliberate and fine as-is, with better docs: shallow `close()` (the
deep-seal spelling works and should be the documented idiom),
`each()`-as-meet, dotted keys pending G4's escape spelling, bare-word
hyphen refusals (quote them), and the include-lands-at-its-path model.

### J. What the ontology claim still needs

Use case 01 validated the mechanism (identity, checked references,
relation checks) and exposed the ceiling: relation `target` is inert
(a typed-endpoint declaration that checks nothing), no cardinality or
edge properties, inverses hand-maintained because membership queries
are inexpressible (filter is prefix-match on lists), no transitive
closure or instance-of query, and the practical typed-refer idiom
(`refer($.std.Service)`) trips the fixpoint (BUGS.md §19). The honest
current statement: aontu is a sound *entity-and-edge substrate* whose
query and constraint layers over that substrate are one more
capability review away. The `graph`/`relations` machinery plus `get`
projections are the right foundation; "make `relations` enforce
`target`, add `unique()`-by-projection, and ship a transitive
`reaches(a, b)` check verb" is a concrete, total, high-value slice.

## The consumer reality check, in one paragraph

Across podmind, todo-app, apidef, and sdkgen: aontu-as-used is
includes + spreads + `*default | widetype` + references, full stop.
`close()` appears zero times across every production model; constraint
atoms zero; `id()`/`refer()` zero; `vet`/`hash`/`breaking`/`mod`/MCP
zero (the toolchain choke point: `@voxgig/model` exact-pins aontu
0.49). The models smuggle a second type system (Gubu strings, backtick
tokens) that aontu ships as inert data, so the verbs reason below the
models' real semantics; generated OpenAPI drops the constraints the
models do declare; stale `# TODO: Aontu FIX` comments assert bugs
fixed years ago; and both apidef and sdkgen hand-rolled value→source
serializers (with committed `key$` leakage and comment-corruption
incidents) because no official emission API exists. The single
highest-leverage act available to the project is not a feature: it is
publishing 0.53, un-pinning the toolchain, and then walking one
consumer (todo-app is the natural candidate) through actually adopting
close/constraints/vet/breaking — every language fix in this review
would have been found years earlier by that one exercise.

## Priorities

If this review earns one ordering, it is this:

1. **Fix the default/validation conflict** (A) — language change,
   breaking, worth it; everything else inherits its credibility.
2. **Vet ≡ eval invariant + differential harness** (C) — the gate
   must not disagree with the evaluator.
3. **Template-clone isolation campaign with the repros as the
   acceptance suite** (B), and the composition matrix into the spec.
4. **`git#rev` include resolution + template reflexivity** (D) — the
   evolution gate on real layouts.
5. **Site-attribution invariant + finding-shape everywhere** (F).
6. **Provenance through clones** (E).
7. **Trust flags on every surface; the package-import question before
   the G5.6 flip** (G).
8. **Module nil-pin refusal, transitive vendoring, `mod verify`** (H).
9. **`sum`/projection/arithmetic-as-functions; JSON Schema mapping
   specified; the money wire convention** (I).
10. **Relations enforcement + graph queries** (J).

## Method notes and threats to validity

This review was produced by AI agents driving the real CLI in one
day: ~30 reader/author/verifier agents, every claim triple-checked
(found in use, reduced to a minimal repro, refutation attempted
against docs and spec). Three caveats. It exercises the TypeScript
implementation only — Go parity of every repro is unverified and the
repros are candidates for `test/spec/` rows, not substitutes (ADR-001
discipline applies). Severity grades encode this review's judgment
that silent wrong output outranks loud failure; a maintainer may
weigh differently. And the consumer studies read the code as it is —
the consumers' non-adoption of new verbs partly reflects that nothing
after 0.52.1 is installable, which is a distribution fact
(SUPPORT.md), not a language one; the two compound.
