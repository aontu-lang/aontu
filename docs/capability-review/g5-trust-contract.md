# G5: A specified trust contract

*Status: implemented but for the default flip — phases 1 through 5 are
landed in both ports; phase 6's warning window ships and the flip
itself awaits the next major version. Per-phase status and the
departures the landed work took are in the
[progress register](progress.md),
which is authoritative for status; this document is authoritative for
design. Part of the
[capability review](index.md) (August 2026). This document expands gap
G5 — hermeticity, termination, determinism, and sandboxing as
specified, spec-pinned guarantees — with alternatives, an explicit
boundary, risks, and an implementation plan.*

## Problem

For a document that agents evaluate unattended, safety guarantees are
not hardening applied afterwards — they are constitutive. An agent
harness that evaluates a definition it did not write needs four
promises: evaluation touches nothing outside its declared inputs
(hermeticity), it always finishes (termination), it always gives the
same answer (determinism), and a hostile input cannot make the
evaluator do harm (sandboxing). Aontu today has good bones for all
four and a written guarantee for none — and one of them, hermeticity,
is currently false.

First failing example, verified live. A model an agent has been asked
to evaluate:

```aon
# inner/model.aon
a: @"../secret.aon"
```

```
$ aontu inner/model.aon
{
  "a": {
    "secret": "hunter2"
  }
}
$ echo $?
0
```

The include resolver follows relative paths and symlinks with no
containment check, so evaluating an untrusted file reads any file the
process can read — `@"../../etc/passwd"` included. The code says so
itself (ts/src/lang.ts, the SECURITY comment: "treat opening an
untrusted source as running it"), and the package leg of the resolver
chain resolves `@"pkg"` through Node's require machinery, walking
`node_modules` directories upward from the process working directory.
The consequences compound: the same file set evaluated on two
machines, or from two directories, can resolve `@"pkg"` differently —
so "same files + same `$` bindings ⇒ same output" does not hold under
the default resolver. And the LSP builds a fresh default-configured
evaluator per change and per hover (`new Aontu()` in
`computeDiagnostics`, ts/src/lsp.ts), so merely *opening* a hostile
`.aon` file in an editor performs the reads. There is no CLI flag, no
API default, and no documented profile that confines any of this; the
confinement hooks (`options.resolver`, `options.fs`) exist but are
opt-in and unspecified.

Second failing example, also verified live. Three different answers —
"your model is cyclic", "your model is incomplete", and "my budget
ran out" — collapse into one message today:

```aon
# cycle.aon — a genuine reference cycle
a: $.b
b: $.a
```

```
$ aontu cycle.aon
[aontu/ref]: Cannot resolve value at path $.a
```

```aon
# missing.aon — merely incomplete
a: $.b
```

```
$ aontu missing.aon
[aontu/no_path]: Cannot resolve value at path $.a
```

The two-element cycle reports the generic `ref` code with the same
"Cannot resolve value" headline as a missing target; only a
reference to itself or an enclosing ancestor (`a: $.a`) earns the
distinct `path_cycle`. Worse, the
third case has no code at all: the fixpoint loop in ts/src/unify.ts
runs at most `maxcc = 9` passes and simply exits when the budget is
spent — a model still refining on pass nine stops silently, and the
residue surfaces later as ordinary non-generable errors
indistinguishable from incompleteness. The bound is real and
semantic: deferral works by conjunct-wrapping unresolved values for
the next pass (ts/src/val/RefVal.ts, ts/src/val/FuncBaseVal.ts), and
ts/src/val/KeyFuncVal.ts contains an explicit pass-count hack
(deferring real work until `ctx.cc >= 3`, commented "this delay ...
is a hack"). Meanwhile the revisit bound `MAXCYCLE = 999` carries an
acknowledged defect in the other direction — "TODO: FIX: false
positive when too many top unifications" (ts/src/unify.ts:29) — so a
large-but-legal model can be misreported as `unify_cycle`.

An agent repairing a model needs these verdicts separated: a genuine
cycle means *fix the model*, incompleteness means *supply more*, and
budget exhaustion means *the evaluator gave up* — retrying with a
larger budget is valid for the third and useless for the first two.
A gate whose failure modes are indistinguishable cannot anchor an
emit → validate → repair loop, and an evaluator that reads the
filesystem at the direction of its input cannot be pointed at
untrusted input at all.

## Current state

What exists and is reusable:

- **A pure evaluation core.** The language has no clock, no
  randomness, no environment access: the 12 builtins (`upper`,
  `lower`, `copy`, `key`, `type`, `hide`, `move`, `path`, `pref`,
  `close`, `open`, `super` — ts/src/lang.ts funcMap) are pure value
  transformers, the single `+` operator works over concrete scalars
  (ts/src/val/PlusOpVal.ts), and external input enters only through
  `@"…"` includes and host-injected `$name` variables (`ctx.vars`,
  ts/src/ctx.ts). Hermeticity fails only at the resolver boundary.
- **Injectable capability points.** `AontuOptions` (ts/src/type.ts)
  accepts `resolver`, `fs`, and `base`; docs/reference-api.md
  documents an in-memory resolver and `memfs` volumes for tests. The
  resolver chain itself (`makeModelResolver`, ts/src/lang.ts, ~line
  757) tries memory → filesystem → package in order, so a confined
  memory-only evaluation is constructible today — it is a posture, not
  a default, and nothing tests it.
- **Bounded evaluation, mechanically.** The fixpoint is already
  budgeted (`maxcc = 9` passes, `MAXCYCLE = 999` revisits per
  `(a.id, b.id, pathidx)` key, a 9999 depth cap in `walk`,
  ts/src/utility.ts) and the catch-all in `unite` converts even
  stack-overflow `RangeError` into an `internal` nil. Termination is
  a fact of the implementation, not a stated guarantee, and its
  edges (silent pass exhaustion, cycle false positives) leak.
- **Determinism, engineered and partially pinned.** Conjunct-term
  sorting and the canonical closed-map unify direction make `&`
  order-independent by construction (ts/src/val/ConjunctVal.ts,
  ts/src/val/MapVal.ts); `gen` and canon sort map keys; Go reproduces
  JS `Number.toString` for the shared IEEE-754 double semantics
  (go/scalar_format_test.go). Crucially, the spec suite already pins
  canon **byte-for-byte**: `canon` rows are strict string equality in
  both runners (ts/test/spec.test.ts, go/spec_test.go), and the Go
  runner has no skip list. `gen` rows, however, compare deep-equal
  JSON *values*, not serialised bytes — byte-identical generated
  output is true in practice and guaranteed nowhere. `gen` rows are
  also **kind-blind**: JSON cannot distinguish an `integer` 1 from a
  `number` 1.0, so a whole class of semantic divergence is invisible
  to the mode most rows use. That is not hypothetical — it is how
  the two ports came to classify the same numeric literal
  differently (`a:1e21 & integer` succeeded in TypeScript and failed
  in Go) while both passed the shared suite.
- **A parity method to extend.** The row-bearing shared spec files
  (counts and modes in [the register's protocol rule 5](progress.md#the-update-protocol) —
  this document's original "527 rows, modes canon/gen/err" predates
  the `gens`/`errc`/`errcode` modes its own phase 5 introduced);
  test/spec/engine-parity.tsv
  is precedent for pinning whole regression *classes*, and
  test/spec/var.tsv for a spec file with fixed runner-side
  configuration (a shared variable set) — the pattern a
  trust-profile spec file needs. test/spec/divergent.tsv is a
  47th file that asserts nothing: it is the parity ledger, comments
  only, recording behaviours the two ports are known to disagree
  about. Per AGENTS.md, only the asserted substring of an error
  message is contractual.
- **Dependency plumbing.** A `deps` record is threaded through parse
  (ts/src/aontu.ts, ts/src/lang.ts) — the skeleton of an evaluation
  manifest — but it arrives empty in the paths exercised while
  writing this document; the manifest is wiring work, not invention.

What structurally blocks the capability:

- **Unsafe-by-default resolution at every surface.** CLI
  (ts/src/cli.ts: no flags beyond `--canon`/`--help`/`--version`),
  library (default `makeModelResolver`), and LSP (fresh `new Aontu()`
  per request) all get the full memory → filesystem → package chain.
  The Go port is narrower by accident, not by design: go/source.go
  implements only the file resolver (no memory or package leg), with
  the same SECURITY comment — an undocumented parity asymmetry.
- **No budget error taxonomy.** Pass exhaustion emits nothing;
  `unify_cycle` conflates suspicion with proof; the pass loop also
  breaks on the first erroring pass, so budget behaviour and error
  collection interact invisibly.
- **Single-use trees as folklore.** The in-place mutation contract
  ("the returned Val is SINGLE-USE") lives in a comment on
  `Aontu.parse` (ts/src/aontu.ts) and in Val.ts; TOP is deliberately
  not a singleton for the same reason (ts/src/val/top.ts). Nothing
  enforces it and reference documentation understates it — a
  determinism hazard for embedders who reuse a tree.
- **No spec vocabulary for trust.** The TSV format cannot currently
  express "this include must be denied" or "this evaluation must be
  byte-identical", so none of the four guarantees is testable in the
  shared suite as it stands.

## Prior art

**Jsonnet** states hermeticity as a design axiom — "the same JSON
should be generated regardless of the environment" — with external
input confined to explicit `--ext-str` variables and top-level
arguments. The cost: the guarantee lives in prose and code review,
not in an enforced capability surface. Aontu's `$` variables already
match the input model; the lesson is to *test* the claim.

**Starlark** shows determinism as an engineering discipline:
deterministic iteration order, values frozen after module
evaluation, no recursion, all errors fatal. Frozen values enable
safe parallel reuse — the opposite of Aontu's single-use mutable
trees — but freezing an existing mutating unifier is a rewrite; the
adoptable part is pinning observable ordering in the spec suite.

**Dhall** contributes two things. Totality — "if an expression
type-checks then evaluating it always succeeds in finite time" — is
the headline Aontu should be able to print, with explicit fuel where
structural totality is not enough. And its import-sandbox rules are
the reference design for the day includes go remote: remote imports
may only transitively import other remote resources (never local
files or environment), computed import paths are prohibited, custom
headers forward only same-domain, CORS-style opt-in blocks SSRF.
Adopting the rules early costs nothing; adopting them late means
retrofitting a deployed ecosystem.

**Pkl** demonstrates evaluator-level capability policy:
`--allowed-modules` / `--allowed-resources` regex allowlists
enforced by the evaluator and exposed through its bindings API,
trust levels that stop remote modules importing local ones, external
readers confined to child processes. The lesson: the *host* declares
what an evaluation may touch, in the API, not in documentation. The
cost is real surface — allowlist syntax, precedence, and error
reporting all become contract.

**Kubernetes CEL** shows the sophisticated end of budgeting: a
statically estimated worst-case cost in abstract "cost units",
rejecting over-budget rules at registration time unless authors bound
sizes. Deterministic by construction — no wall-clock anywhere. This
is the model [G8](g8-generation.md)'s combinators will need; the cost
of building it before combinators exist is waste, so G5 lays only the
budget units it would consume.

**Cedar** documents the selection criteria buyers apply to
agent-boundary languages: AWS chose it citing determinism ("same
decision for identical requests"), analysability, and
non-Turing-completeness. The agent-industry survey adds an economic
angle: prompt caches require byte-identical prefixes, so a canonical
form byte-stable across runs and implementations is directly
monetisable as cache hits (one team went from 7% to 84% hit rate by
stabilising serialisation alone).

**Ivy** supplies the meta-lesson: fix the fragment first, and treat
staying inside it as a language-design activity. Every query must
return a total, deterministic answer; "maybe/timeout" destroys
trust. The trust contract is that fragment discipline written down —
near-zero code, outsized payoff — with features that would exit it
(wall-clock budgets, ambient I/O, unbounded recursion) refused at
the design table, not patched after.

## Design space

**A. Document-only.** Write docs/trust.md stating the four
guarantees; change no code. Cheapest possible; but hermeticity is
*false* today under the default resolver, so the document would be
marketing, not contract — and an untested guarantee in a
dual-implementation project is a parity bug waiting to happen.
Rejected as an end state; the written contract is Phase 1 of the
plan.

**B. Flip every default to safe.** Memory-only resolution unless
explicitly widened, in CLI, library, and LSP alike, in one release.
Maximal safety, minimal design; but it breaks the CLI's primary
current use (evaluating your own files, with `@"file"` includes and
package-distributed models) with no migration path, for users who
face no untrusted input at all. The Pkl/Dhall precedent is
graduated capability, not prohibition. Rejected.

**C. A capability-scoped trust profile with per-surface defaults.**
One `trust` option on the evaluator — include capability (`none` /
`mem` / root-confined / `system`) plus deterministic budgets — with
defaults chosen per surface (LSP: workspace-confined; library:
explicit; CLI: entry-file root, `system` behind a flag) and a staged
default flip. Budget exhaustion and cycle suspicion become distinct
error codes reported via the [G2](g2-validation-verb.md) contract;
determinism and hermeticity land as spec rows. Moderate cost spread
over existing seams (`options.resolver`, `options.fs`, the pass
loop).

**D. Process-level sandboxing.** Run evaluation in an isolated child
process or WASM sandbox (Pkl external readers, browser-style). Strong
containment even against evaluator bugs; but it is heavy machinery in
two implementations for a language whose only effect *is* the
resolver — confining the resolver confines the language. Justified
only when [G6](g6-distribution.md) ships remote includes and the
threat model includes evaluator compromise. Deferred.

**E. Termination and determinism only.** Fix the budget taxonomy and
pin byte-stability, leave resolver posture as a documented caveat.
Cheaper than C; but sandboxing is the acute agent-facing risk (the
verified exfiltration example), and the review's sequencing places
the trust contract in Phase A precisely because agent evaluation of
third-party definitions is the positioning claim. Rejected.

**Recommendation: C**, with D noted as the G6-era escalation path.
C is the only option that makes all four guarantees simultaneously
*true* and *tested* without breaking the existing user base: the
capability surface reuses injection points the code already has, the
budget taxonomy is a small unifier change, and the spec suite is the
natural home for the guarantees — which is what distinguishes a
contract from a claim.

## Proposed design

The design adds **zero language syntax**. Trust is a property of the
evaluation, not the document: a `.aon` file cannot request more
capability, and canonical form is untouched — canon convergence
is not at risk from anything below.

### The contract

A new docs/trust.md states four normative clauses, each backed by
spec rows:

1. **Hermeticity.** The output of evaluation is a pure function of:
   the entry source text, the resolved include closure, the
   host-injected `$` bindings, and the evaluator (implementation,
   version, options). Nothing else — no clock, no randomness, no
   environment variables, no network. The language has no construct
   that observes time or entropy, and never will (see Boundary).
   Under the `system` include capability the closure is unbounded and
   machine-dependent; hermeticity is therefore *conditional on the
   include capability*, and the contract says so plainly: confined
   capabilities (`none`, `mem`, root) make the input set explicit and
   the guarantee total.
2. **Termination.** Every evaluation halts within deterministic,
   configurable budgets counted in engine steps (never wall-clock).
   Exhausting a budget is a semantic error with a distinct code —
   never silent truncation.
3. **Determinism.** Identical inputs (clause 1) produce byte-identical
   canonical output and byte-identical generated JSON, across runs
   and across the TypeScript and Go implementations. Error *codes*
   and asserted substrings are stable per the G2 registry; full error
   text remains non-contractual (AGENTS.md rule, unchanged).
4. **Sandboxing.** What an evaluation may read is declared by the
   host through the trust profile; the default at each surface is the
   least capability that serves that surface's primary use. Denied
   resolution is a located, deterministic error.

### Trust profile and budgets (API)

```ts
const aontu = new Aontu({
  trust: {
    // include capability, one of:
    //   'none'                — @"…" always denied
    //   { mem: {...} }        — virtual file set only
    //   { root: '/models' }   — real files, realpath-confined
    //                           below root; no package resolution
    //   'system'              — today's mem → file → pkg chain
    include: { root: '/models' },
    budget: {
      passes: 9,        // fixpoint passes (today's maxcc, reified)
      depth: 1000,      // structural recursion depth
      // (revisits — today's MAXCYCLE — stayed INTERNAL as landed,
      // fixed at its spec constant: the Go port has no revisit
      // counter to configure, so exposing it would be one-port
      // surface. Depth landed at 1000, not this sketch's 512; the
      // register records both departures.)
    },
  },
})
```

Go mirrors this on `aontu.Options` (go/aontu.go), with the honest
parity note made explicit: at review time Go's `system` capability
was file-only; the landed chain in both ports is memory → module
([G6](g6-distribution.md)) → filesystem, and the package leg —
`require()` resolution — remains TypeScript's alone, so `system` in
Go still ends at the filesystem. The profile makes the asymmetry
visible
instead of accidental.

Budgets are configurable-but-deterministic: integer counts of engine
events (pass index, per-pair revisit count, descent depth). The
contract pins *verdicts* at default budgets — every spec row must
produce the same verdict in TS and Go — not internal step counts,
which are implementation detail. Wall-clock and memory limits are
refused (Boundary): a budget that varies with machine load makes the
same input fail differently across runs, precisely the property this
document exists to forbid.

### Budget and cycle errors

Three distinct outcomes replace today's conflation, all reported
through the [G2](g2-validation-verb.md) error contract:

- **`path_cycle`** (exists) — a *proven* structural cycle, detected
  deterministically by path-prefix analysis (ts/src/val/RefVal.ts).
  Extend detection to mutual reference chains (`a: $.b, b: $.a`,
  today a generic `ref` error) by tracking the resolution chain, so
  proven cycles stop masquerading as unresolved references.
- **`budget_passes`** (new) — the pass loop (ts/src/unify.ts)
  finished `budget.passes` passes with the root not `DONE` and no
  other error. The nil's details name the budget, its limit, and the
  paths still refining; the message asserts the substring
  "evaluation budget". This is the error that makes the `maxcc = 9`
  bound honest.
- **`unify_cycle`** (exists, retained) — the per-pair revisit bound
  tripped: *suspected* non-convergence. The unify.ts:29 false
  positive ("too many top unifications") is addressed under this
  code: revisit counting must not increment when a visit made
  progress (the pair's done state advanced), which the existing
  `PrefVal` peg-identity note in ts/src/unify.ts already gestures at.
  A corpus of large-but-legal models (generated-SDK scale, which the
  performance comments show the engine has met) lands as spec rows
  guarding the fix.

Per G2's class table, count-triggered `budget_passes` and
`unify_cycle` carry class `budget`; the proven `path_cycle` is a
semantic reference error. An agent can therefore branch: class
`budget` → retry with a raised budget or restructure; `path_cycle` →
the model is wrong; `no_path` → the model is incomplete.

`budget.passes` keeps its default of 9 initially: the value was
load-bearing when this was written (ts/src/val/KeyFuncVal.ts
deferred until `ctx.cc >= 3` — a pass-count hack
[G8](g8-generation.md)'s phase 0 has since replaced with the staging
rule, so the pass INDEX is no longer semantic), so reifying the
bound and erroring distinctly is Phase 2; raising the default is a
separate, spec-guarded decision (Open questions).

### Determinism, pinned

Clause 3 is a claim about *two* implementations, so the method that
tests it is part of the contract rather than a matter of taste. That
method was itself the gap the number-model defects hid in: a suite
both ports passed still carried a silent kind divergence, because
the mode most rows use compares JSON and JSON has no kinds. Three
disciplines close it, and each has a precedent in boru
(github.com/boru-lang/boru), whose parity method is the stricter
one — independently written runners over a shared corpus, a
`make crossdiff` that diffs full value streams row for row, a
parity-probe rule for authoring rows, and a divergence ledger that
is currently empty.

- **Canon, the typed assertion surface**: already byte-pinned per
  row by strict string equality in both runners — the contract
  documents this as a guarantee rather than an implementation habit
  — and, since canon round-trips kind (docs/design/number-model.md,
  rule R4: a number-kind scalar always renders with a fraction or an
  exponent), a `canon` row pins the *kind* of a value where a `gen`
  row structurally cannot. The division goes into the contract:
  `gen` proves the JSON an agent receives, `canon` proves the value
  the engine holds, and any behaviour that carries a kind earns a
  canon row, not only a gen row.
- **Generated JSON**: a new spec mode `gens` (docs/shared-spec.md;
  runners ts/test/spec.test.ts, go/spec_test.go) asserts the
  *serialised* generated output byte-for-byte: stable key order
  (already alphabetical from `gen`), no whitespace variance, JS
  number formatting (which go/scalar_format_test.go already
  reproduces). Existing `gen` rows are untouched; `gens` rows start
  with a number-heavy corpus, the known risk surface.
- **Repeatability**: a property row class — evaluate the same source
  twice (fresh parse each time, honouring the single-use contract)
  and require byte-equal canon and `gens` output.
- **Parity probes, not baselines**: a row's expected value must be
  obtained from **both** engines before it is written down. Running
  one implementation, recording its answer, and porting until the
  other agrees promotes whichever engine was asked first to ground
  truth — which is exactly how two different numeric kind rules
  survived a shared suite. The rule costs nothing to adopt (it is an
  authoring discipline, not machinery) and belongs in AGENTS.md
  beside the existing spec-rows-first instruction.
- **The divergence ledger, reviewed and normally empty**:
  test/spec/divergent.tsv is the debt register for the opposite
  case — a behaviour where the ports are known to disagree and the
  disagreement cannot be fixed from this repository today. It
  carries commentary only (an executable row could not pass in both
  runners by definition), and each entry must name a tracking issue,
  a reason it is not simply fixed, and both engines' outputs. Its
  normal state is empty; a non-empty ledger is a standing review
  item, not a settled fact. *(The two entries it carried at review
  time — upper-case base prefixes, and integer-kind rendering above
  2^53 — were both fixed by the number tower; today it carries one
  OPEN entry, #24, lone surrogates.)* The ledger's value is
  negative: it stops a divergence
  being rediscovered, and stops anyone baselining one engine's
  output as the shared contract by accident.
- **Single-use trees as API contract**: the mutation caveat moves
  from code comment to docs/reference-api.md as a named rule
  ("evaluation consumes the tree"). *(Half landed. The named rule is
  in docs/reference-api.md; the debug-mode guard this bullet also
  designed — a consumed flag checked at `unify` entry, raising
  `reused_tree` — was NOT built: no such flag or error code exists
  in either port, and the register's G5 notes record the gap as
  deliberate rather than silently dropped. Single-use discipline
  remains a documented caveat only.)*

### Hermeticity, tested

A new test/spec/include-trust.tsv follows the var.tsv precedent (a
spec file with fixed runner-side configuration): the runner evaluates
its rows under a declared trust profile rooted at the fixtures
directory. Representative rows:

```
deny-parent	err	a:@"__FIXTURES__/../secret.aon"	include denied
deny-abs	err	a:@"/etc/hostname"	include denied
deny-pkg	err	a:@"some-package"	include denied
allow-in-root	gen	a:@"__FIXTURES__/foo.aon"	{"a":{"f":11}}
```

Denial is a parse-stage nil, `include_denied`, carrying the denied
path and the active capability — deterministic, located, and pinned
by substring like every other error row. The existing file.tsv rows
continue to run under a root profile scoped to the fixtures
directory, making the shared suite itself hermetic: no spec row may
depend on files outside the repository or on installed packages.

The `deps` record is wired and specified as the evaluation manifest:
after evaluation, `result.deps` lists the resolved include closure
(absolute resolved path, resolving capability). This is the "file
set" of clause 1 made observable — the seed for caching and replay —
while content hashing and pinning stay with
[G6](g6-distribution.md).

### Surfaces and migration

- **LSP** (first to flip, least breakage, highest exposure):
  ts/src/lsp.ts constructs its evaluator with
  `trust.include = { root: workspaceRoot }` from the `initialize`
  params; no package resolution. A client setting
  (`aontu.trust.include`) widens explicitly. go/lsp mirrors it —
  diagnostics parity (AGENTS.md) demands identical denial behaviour.
- **Library**: the `trust` option ships immediately; the default
  stays `system` for one minor-version window with a documented
  deprecation, then flips to requiring an explicit capability when
  any include is present (a model with no `@"…"` needs no profile
  and never errors).
- **CLI**: gains `--trust <system|root[:dir]|none>` and
  `--include-root <dir>`. During the warning window the default
  stays `system`, but any resolution that escapes the entry file's
  directory tree or hits the package leg prints a one-line stderr
  warning naming the flag that will be required. At the next major
  version the default becomes root-confinement at the entry file's
  directory — keeping fixture-style relative includes working
  (test/spec/file.tsv, `load-rel-chain`) — with `--trust system`
  restoring today's behaviour.

### Rules pre-registered for remote includes

Adopted now, enforced the day [G6](g6-distribution.md) ships any
remote resolver — so the ecosystem never has a permissive interlude:

1. Remote sources may include only remote sources: never local
   files, never `$` bindings, never anything environment-derived.
2. Include paths are literal strings — true today (`@` takes a
   literal, not an expression) and pinned by a spec row so it stays
   true.
3. No credential or header forwarding across origins; explicit
   opt-in for anything beyond a bare fetch.
4. Remote resolution is only available under an explicit capability;
   it never joins `system`.

## Boundary: what we will not do

- **No wall-clock or memory budgets.** A limit that varies with
  machine load makes identical inputs fail differently — the exact
  nondeterminism this contract forbids; budgets are counted engine
  events only.
- **No time, randomness, or environment access in the language,
  ever.** `now()`/`random()`/`env()` would each falsify clause 1 by
  construction; parameterise through `$` bindings instead.
- **No remote includes here.** Fetching, versioning, and pinning are
  [G6](g6-distribution.md)'s; G5 only pre-registers the sandbox
  rules they must obey.
- **No process/WASM isolation runtime.** Confining the resolver
  confines the language's only effect; heavier isolation is a
  G6-era decision for a changed threat model.
- **No CEL-style static cost estimation yet.** There are no
  user-facing combinators to estimate; [G8](g8-generation.md)'s
  generation constructs will bring the cost model and must express
  it in G5's budget units.
- **No error-format invention.** Budget and denial findings ride the
  [G2](g2-validation-verb.md) contract (class `budget`, stable
  codes); this document adds codes, not formats.
- **No canon-hash or module identity.** Semantic hashing over
  canonical form is [G6](g6-distribution.md)'s differentiator; the
  `deps` manifest here deliberately stops at paths.
- **No Turing-completeness and no SMT solvers** (index.md traps):
  termination stays structural plus fuel, and every trust query is
  answered by counting, never by solving.
- **No freezing/parallel-reuse rewrite.** Starlark-style frozen
  values would mean rewriting the mutating unifier; the single-use
  contract is documented and guarded instead.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Default flip breaks CLI/library users relying on `@"pkg"` or parent-relative includes | High | Medium | Warning window that prints the exact future-required flag on every escaping resolution; entry-root default keeps relative-include projects working; `--trust system` remains |
| Reifying the pass budget perturbs existing models (the pass index was semantic until G8.0 replaced KeyFuncVal's `cc >= 3` hack with staging) | Medium | High | `budget.passes` default stays 9; every shared spec row (counts: [register rule 5](progress.md#the-update-protocol)) must pass unchanged before and after; KeyFuncVal behaviour pinned by spec rows prior to any change |
| `unify_cycle` false-positive fix changes which large models error | Medium | Medium | Fix lands behind the distinct code with a generated-SDK-scale row corpus; both implementations run the corpus with no skip list |
| Byte-pinning `gens` exposes latent TS/Go serialisation divergence (numbers, escaping) | Medium | Medium | Go already mirrors `Number.toString` (go/scalar_format_test.go); introduce `gens` rows incrementally, numbers first; divergences become fixes, not suite carve-outs |
| Root-confinement path handling diverges across OS/implementations (symlinks, case, realpath) | Medium | High | Confinement = realpath then prefix check, specified in docs/trust.md; include-trust.tsv exercises traversal and symlink escapes; Windows caveats documented |
| Mutual-cycle detection (upgrading `ref` to `path_cycle`) misclassifies legal forward references | Low | High | Detection only on the resolution chain revisiting a node, never on syntactic shape; existing ref.tsv rows must stay green |
| Debug-mode consumed-tree guard leaks onto the hot path | Low | Medium | Guard compiled behind `opts.debug`; perf comments in ts/src/unify.ts give the baseline to re-measure |
| Adoption: safe defaults read as friction next to permissive competitors | Medium | Low | The flip is staged and the message is positive (Cedar-style determinism/analysability selection criteria); models without includes never see the profile |
| LSP confinement breaks editing files that include outside the workspace | Low | Low | Client setting widens per-workspace; denial diagnostics say exactly what to set |

## Implementation plan

Spec-first throughout: every behaviour lands as `test/spec/*.tsv`
rows before code; TypeScript (canonical) first, Go port follows.
Nothing may regress at any phase: every row of the shared suite
(counts in [the register's protocol rule 5](progress.md#the-update-protocol)),
the error.tsv substring assertions, canon round-trip
canon convergence, and byte-equal canon rows across TS and Go. (This
document originally stated that guard as `parse(canon(v)) == v`; see
the correction in [G1](g1-constraint-algebra.md#implementation-plan) —
the enforced property is convergence, asserted by both spec runners.)

**Phase 1 — write the contract (S).**
New docs/trust.md (four clauses, profiles, budget names, remote-
include pre-registered rules); docs/reference-api.md gains the
single-use-tree rule and the trust option stub; AGENTS.md points to
the contract. No behaviour change. This plus Phase 2 is the review's
Phase A slice ("trust contract written and spec-pinned").

**Phase 2 — budget and cycle taxonomy (M).**
Spec: new test/spec/budget.tsv pinning `path_cycle` (self and
mutual), `no_path`, `budget_passes`, `unify_cycle` as distinct
substrings; large-but-legal corpus rows for the false-positive fix.
Code: ts/src/unify.ts (pass-loop exit emits `budget_passes` on
residue; progress-aware revisit counting for the line-29 TODO),
ts/src/val/RefVal.ts (mutual-cycle chain detection),
ts/src/hints.ts; then go/unify.go, go/ref.go, go/hints.go.

**Phase 3 — trust profile and confinement, TypeScript (L).** LANDED —
with three departures the register details: `budget.revisits` is not
profile surface (the Go dispatcher has no revisit counter, and a knob
one port cannot honour breaks ADR-001 by construction); the LSP falls
back to unconfined when there is no workspace root and no explicit
option, which single-file sessions rely on; and the sketched `deny-pkg`
row is unpinnable as a shared row (a package hit depends on the
installed environment), so package denial under `root` is pinned per
port. Reifying `budget.passes` also found a real defect: at `passes: 1`
the still-refining snapshot (taken after pass `maxcc-2`, which never
exists) made exhaustion silent — it is now taken at the final pass's
entry, in both ports.
Spec: test/spec/include-trust.tsv (fixed-profile runner convention à
la var.tsv; denial and allow rows; literal-include-path row); file.tsv
re-scoped under a fixtures-root profile. Code: ts/src/type.ts
(`trust` option), ts/src/lang.ts (`makeModelResolver` honours the
capability; `include_denied` nil), ts/src/ctx.ts plumbing,
ts/src/cli.ts (`--trust`, `--include-root`, escape warnings),
ts/src/lsp.ts + ts/src/lsp-server.ts (workspace-root default,
`initializationOptions`); runner change in ts/test/spec.test.ts.

**Phase 4 — Go port of profile and budgets (L).** LANDED. The
capability rides the parse meta bag (the `notFoundSink` pattern),
because the parser is cached per base and nothing parse-specific may
live on it. One canonical-side alignment landed with the port:
`CheckVars` reports a parse failure under its specific code
(`syntax`, `include_denied`) rather than a generic `parse`, matching
the first-code contract errc rows pin.
Code: go/aontu.go (options), go/source.go (root confinement,
`include_denied`, documented `system`≡file-only note), go/ctx.go,
go/unify.go defaults, go/cmd/aontu flags, go/lsp. go/spec_test.go
runs budget.tsv and include-trust.tsv with no skip list; LSP denial
diagnostics byte-identical to TS.

**Phase 5 — determinism byte-pinning (M).** LANDED — completed by the
`deps` manifest: sorted, deduplicated `{path, capability}` entries on
the parse result in both ports (`result.deps` / `Aontu.IncludeDeps`),
deterministic by construction (no timestamps — the plugin's raw
`wen`-stamped DependencyMap stays internal).
Spec: `gens` mode documented in docs/shared-spec.md; rows in a new
test/spec/gens.tsv (numbers first, then strings/escaping, then
structures); repeatability property rows. Code: ts/test/spec.test.ts
and go/spec_test.go mode handling; any serialisation divergence fixed
in the implementation, never carved out of the suite. `deps` manifest
wired (ts/src/lang.ts → ts/src/aontu.ts; go/lang.go) and documented.

*(As landed, with two deliberate departures from the text above.
**No `gens.tsv`**: the byte-exact rows — 257 at landing, 125 of them
in `edge.tsv` and 60 in `number-tower.tsv`, with the current count
in [the register's rule 5](progress.md#the-update-protocol) — live
beside the behaviour they pin, because a single bucket separates a
serialisation expectation from the semantics it belongs to, and the
number tower's exactness rows are unreadable apart from their
`canon` twins. **Repeatability is a runner property, not rows**: both
spec runners re-run every `gens` row on a fresh engine and require
byte-identical output, so all 257 rows carry the determinism
assertion instead of a handful of dedicated ones.)*

**Phase 6 — default flip (S code, staged socially).** PARTIAL, as
staged: the warning window ships (both CLIs, one stderr line per
escaping resolution naming the future-required flag); the flip itself
(CLI entry-root default, library explicit-capability requirement, LSP
already confined) remains the next major version's release act, with
its migration note in docs/trust.md — no further code is needed for
it, only the decision.

Rough sizing: S ≈ days, M ≈ a week or two, L ≈ several weeks per
implementation.

## Open questions

- **Where the CLI default root lands.** Entry-file directory (keeps
  relative-include projects working, breaks shared-parent layouts)
  versus process cwd (broader, but surprising when invoked from
  elsewhere). The warning-window feedback decides; the flag names
  must not change afterwards.
- ~~**Whether `budget_passes` advice names the remedy.**~~
  **Settled by the landed hint text: explain, never prescribe.** The
  shipped message states the semantics unconditionally — "raising
  the budget helps only a model that is still converging — a genuine
  cycle never converges at any budget" — and names no flag, so the
  cargo-cult risk is answered without the residue-shrink conditional
  this question floated. (The question as posed: an error that says
  "raise `--budget-passes`" repairs agent loops faster but invites
  budget inflation that hides genuine non-convergence.)
- **Raising the default pass budget.** 9 is historical
  (`maxcc = 9 // 99` in ts/src/unify.ts suggests it was once
  higher); a larger default plus the distinct error may serve big
  models better. Requires the Phase 2 corpus first. *(Half of the
  question is gone: KeyFuncVal's `cc >= 3` hack WAS replaced, by
  G8.0's staging rule, so the pass index is no longer semantic and a
  raise is now purely a budget decision — still open.)*
- **Does the hermeticity tuple include evaluator version?** Clause 1
  currently says yes (canon can legitimately change between
  versions), which makes cross-version caching unsound by contract.
  [G6](g6-distribution.md)'s canon-hash work may want a stronger
  within-major-version stability promise; that promise should be
  made there, once, not twice.
- **Whether `mem`-profile rows should become the only sanctioned
  include mechanism inside the shared suite.** Fixtures-on-disk under
  a root profile are simpler today; a fully virtual file set would
  make the suite runnable with no filesystem at all (useful for
  future WASM/browser runners) at the cost of a bigger runner change.
