# The Aontu trust contract

*Status: normative (v0.51 line). This document states the guarantees an
agent harness — or any host — may rely on when evaluating an Aontu
document, and exactly where each guarantee is conditional today. It is
the written half of capability G5
([docs/capability-review/g5-trust-contract.md](capability-review/g5-trust-contract.md));
the tested half lives in the shared spec suite
([test/spec/](../test/spec/)), and anything stated here without a spec
pin says so plainly.*

For a document that agents evaluate unattended, safety guarantees are
not hardening applied afterwards — they are constitutive. The contract
is four clauses: **hermeticity**, **termination**, **determinism**, and
**sandboxing**.

## Clause 1 — Hermeticity

The output of an evaluation is a pure function of exactly four inputs:

1. the entry source text,
2. the resolved `@"…"` include closure,
3. the host-injected `$name` bindings, and
4. the evaluator: implementation (TypeScript or Go), version, and
   options.

Nothing else. The language has **no clock, no randomness, no
environment access, and no network** — the builtin functions are pure
value transformers, the `+` operator works over concrete scalars, and
external input enters only through includes and `$` bindings. No
construct that observes time or entropy will ever be added (see
[Refusals](#refusals) below); parameterise through `$` bindings
instead.

**Where this is conditional.** Input 2 — the include closure — is only
a well-defined *input* when the resolver is confined, and confinement
is now a first-class option in **both** implementations: the **trust
profile** (G5 phase 3) —
`trust: { include: 'none' | {mem} | {root} | 'system' }` on
`AontuOptions` in TypeScript, `Aontu.Trust` (`TrustOptions`) in Go.
Under `none`, `{mem}` or `{root}` the closure is explicit and
hermeticity is TOTAL: `none` denies every `@"…"`, `{mem}` resolves
only the declared virtual file set, and `{root}` reads real files
realpath-confined below the root (a symlink inside the root pointing
outside it is an escape and is denied; package resolution never runs).
One name is served under every capability but `none`: `@"std/system"`,
the [system vocabulary](reference-language.md#the-stdsystem-vocabulary),
which is BUNDLED with the engine. It touches neither the filesystem nor
package resolution, so it widens nothing a hermetic evaluation cares
about — a source that never leaves the process is as reproducible as a
builtin function — and it appears in the manifest under capability
`std`, so the closure still says it was read. Under `none` it is denied
with everything else: `none` means no includes at all.

A denied resolution is the located, deterministic parse-stage
`include_denied` error, pinned by `test/spec/include-trust.tsv` in
both runners. The resolved closure itself is observable as the
**include manifest** — sorted, deduplicated `{path, capability}`
entries on the parse result (`val.deps` in TypeScript,
`Aontu.IncludeDeps` in Go) — which is this clause's "file set" as
data.

Under the DEFAULT `'system'` capability the old caveat stands: the
chain (memory → filesystem → package in TypeScript; filesystem in Go)
reads anything the process can, the closure is machine-dependent, and
the code's posture is the operative warning:

> **Treat opening an untrusted source as running it.**

`options.fs` still does not confine — it feeds source text for parsing
and error context, while the file and package legs read through their
own channels.

**The JSON-superset guarantee, stated precisely.** Every JSON document
*parses* as Aontu. That is the whole claim. It does not say "behaves
identically to a JSON parser": the number tower refuses what JSON
silently corrupts, so `{"x":9007199254740993}` — a literal binary64
cannot carry exactly — is a loud `lossy_integer_literal` error in
Aontu where `JSON.parse` would round it. Refusal-over-corruption is a
feature of the contract, not an exception to it.

## Clause 2 — Termination

Every evaluation halts within deterministic budgets counted in
**engine events, never wall-clock**:

| budget     | counts                                   | current state |
|------------|------------------------------------------|-----------------|
| `passes`   | fixpoint passes over the whole model     | 9 (`maxcc`, `ts/src/unify.ts`; `go/unify.go`) |
| `revisits` | same-pair re-unifications within a pass  | 999 (`MAXCYCLE`, `ts/src/unify.ts`) |
| `depth`    | structural recursion depth               | 1000 (`MAXDEPTH`, `ts/src/unify.ts`; `maxUniteDepth`, `go/unify.go`), plus Go's parse-depth guard (`max_depth`). Shared: both engines report `unify_cycle` past it, and `test/spec/budget.tsv` pins the boundary from both sides. |

> **Closed gap.** TypeScript previously had no explicit depth budget:
> deep nesting reached the V8 call-stack limit, which was caught and
> reported as `internal` — a verdict that depended on the host's stack
> size rather than on the document, and so a real breach of this
> clause. It now carries the counter above. Aligning the two required
> lowering Go's bound from 2000, which V8 could never reach, so that a
> document does not resolve in one port and fail in the other. 1000
> sits above every real document (the whole shared suite peaks at depth
> 603) and below both hosts' limits, so the budget decides the verdict.

The contract pins *verdicts at default budgets* — every shared spec
row must produce the same verdict in both implementations — not
internal step counts, which remain implementation detail.

**Exhaustion is a semantic error, never silent truncation.** The three
different answers — "your model is cyclic", "your model is
incomplete", "my budget ran out" — are distinct codes with distinct
classes (the registry: [test/spec/errcodes.tsv](../test/spec/errcodes.tsv);
the taxonomy rows: [test/spec/budget.tsv](../test/spec/budget.tsv)):

| code            | class       | meaning                                | valid agent response |
|-----------------|-------------|----------------------------------------|----------------------|
| `path_cycle`    | `reference` | a **proven** structural cycle: a self/ancestor reference, or a chain of plain references revisiting a node (`a:$.b b:$.a`) | fix the model — no budget helps |
| `no_path`       | `reference` | a reference target that does not exist | supply what is missing |
| `budget_passes` | `budget`    | the pass budget was spent while the final pass was **still making progress** — the evaluator gave up mid-convergence | retry with a larger budget, or restructure |
| `unify_cycle`   | `budget`    | the revisit bound tripped: **suspected** non-convergence | inspect; may be a cycle or a very large model |

A *stable* residue — a stuck `1+true`, an unresolved kind — is none of
these: it is ordinary incompleteness, silent at unify time and a
generate-time error (`mapval_no_gen` family, class `incomplete`)
exactly as before. Only genuine cut-off earns `budget_passes`.

**Pattern matching is bounded by construction, not by a budget.** The
`re()` atom is the one place the evaluator runs a subsystem whose cost
no budget counts, and the two ports do not agree on complexity: Go uses
RE2, which is linear, while TypeScript uses JavaScript's backtracking
`RegExp`, which is not. A nested quantifier is enough to make the
difference unbounded — `(a+)+$` against twenty-nine characters takes 45
seconds in TypeScript and 0.065s in Go. The *semantic* half of that
mismatch is handled by normalising the pattern before either engine sees
it ([ADR-003](../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted));
complexity is the half normalisation cannot reach. Rather than add a budget the
host engine cannot be asked to respect, the
[portable subset](reference-language.md#re-and-the-portable-pattern-subset)
**refuses the shapes that cause it**: a quantifier may not be applied to
a group containing a quantifier or an alternation. That keeps this
clause true in the port that has the problem, at the cost of refusing
some patterns that would have been safe. Residual risk, stated plainly:
the rule is syntactic, so a pattern with a large but polynomial
backtracking cost is still admitted, and pattern matching remains
outside the event-counted budgets above.

Two notes on how the budgets behave, and one caveat that remains:

- A chain of plain references resolves one link per pass from the tail
  in **both** engines (issue #26, closed: Go now defers exactly as the
  canonical engine does), so the pass budget is part of the shared
  language surface: nine links fit, ten exhaust it as `budget_passes`,
  pinned by the shared `budget-chain-*` rows in
  [test/spec/budget.tsv](../test/spec/budget.tsv).
- A cycle wearing a function call is the same cycle. `a:$.b b:upper($.a)`
  once reported TS `internal` against Go `path_cycle`; both ports now
  follow function arguments when detecting the cycle (issue #35,
  closed), and the shape is pinned by the shared
  `path-cycle-func-routed`, `-msg` and `path-cycle-func-chain` rows —
  together with `path-cycle-func-no-cycle`, which pins that an ordinary
  function chain is still not a cycle.
- `unify_cycle` remains *suspicion*, not proof, which is why it is class
  `budget` and not `reference`: the revisit bound cannot distinguish a
  genuine cycle from a model too large to settle within it. The
  specific false positive this caveat used to record — a legal model
  with more than `MAXCYCLE` sibling conjunct terms at one path, each
  re-running the TOP self-unify — is fixed by the per-pass `_tcc/_tpi`
  memo, with a 1200-sibling-term fixture driven through both engines as
  the regression guard.

## Clause 3 — Determinism

Identical inputs (clause 1's four) produce **byte-identical canonical
output and byte-identical generated JSON**, across runs and across the
TypeScript and Go implementations. This is pinned, not promised:

- `canon` spec rows are strict string equality in both runners, and
  canon round-trips kind (a number-kind scalar always renders with a
  fraction or an exponent), so a canon row pins the value the engine
  *holds*, not only the JSON it emits.
- `gens` spec rows compare the serialised generate output **byte for
  byte** (compact, sorted keys, no HTML escaping, JS number
  formatting) using each port's real emitter.
- Error **codes** are stable and cross-implementation per the
  registry ([test/spec/errcodes.tsv](../test/spec/errcodes.tsv), `errc`
  rows); thrown-error message text is in cross-port parity (#29 —
  marker, headline, verbatim hints with injected details, and located
  ANSI source frames render identically, byte-guarded by the
  full-message twin tests), while spec rows continue to bind only
  their asserted substrings and codes.
- Expected values are **parity-probed**: obtained from both engines
  before a row is written, never copied from one (AGENTS.md).
- Known disagreements live in exactly one place — the parity ledger —
  and its normal state is empty of open entries.

## Clause 4 — Sandboxing

What an evaluation may read is declared by the **host**, not by the
document: a `.aon` file cannot request more capability, includes take a
literal string (never a computed expression), and canonical form is
unaffected by any trust setting.

That declaration is the **trust profile** (clause 1), in both
implementations, at every surface:

- **Library**: `trust.include` on the evaluator options (TypeScript)
  / `Aontu.Trust` (Go). The default remains `'system'`.
- **LSP**: confined to the **workspace root** by default, from the
  `initialize` params (workspaceFolders, rootUri, rootPath, in that
  order); an explicit `initializationOptions.aontu.trust.include` of
  `'system'`, `'none'`, `{root}` or `{mem}` widens or narrows it, and
  an unrecognised value confines to nothing rather than silently
  widening. A session with no workspace root and no explicit option
  stays unconfined, which single-file sessions rely on. A `file://`
  uri's path is everything after the literal `file://`, and the leading
  slash of a **drive-letter** path is uri syntax rather than path — so
  `file:///C:/Users/me/project` is the root `C:/Users/me/project`, not
  `/C:/Users/me/project`. Both ports read it that way; until 2026-08-25
  neither did, and the confinement an editor on Windows relied on was
  therefore never applied. **A non-empty authority is not handled**:
  `file://server/share/x` yields `server/share/x`, a relative string,
  so a UNC root or a VS Code `wsl.localhost` remote root confines to
  nothing usable. Both ports do the same thing with it, so this is a
  gap rather than a divergence, and closing it needs a spelling for the
  UNC form (`\\server\share`) that neither port has yet.
- **CLI**: `--trust <system|none|root[:dir]>` and
  `--include-root <dir>`. The default remains `'system'` **with the
  warning window** (G5 phase 6, the staged flip): every resolution
  that escapes the entry file's directory, or goes through package
  resolution, prints a one-line stderr warning naming the flag a
  future release will require. The flip itself — entry-root
  confinement by default, `--trust system` restoring today's
  behaviour — is scheduled for the next major version.

Denied resolution is a located, deterministic parse-stage error
(`include_denied`) like any other — never a silent skip — and is
raised, not injected as a value, so a bare-member include
(`@"denied.aon"` at the top of a file) cannot vanish in the merge.

Budgets are part of the same profile: `trust.budget.passes` and
`trust.budget.depth` (TypeScript) / `TrustOptions.Budget` (Go), integer
counts of engine events defaulting to the spec constants of clause 2.
The per-pair revisit bound is NOT profile surface — the Go dispatcher
has no revisit counter to configure, and a knob one port cannot honour
would break the parity contract by construction.

### Rules pre-registered for remote includes

Adopted now so the ecosystem never has a permissive interlude;
enforced the day any remote resolver exists (G6):

1. Remote sources may include only remote sources — never local
   files, never `$` bindings, never anything environment-derived.
2. Include paths are literal strings; computed import paths are
   prohibited (true today by grammar; not yet pinned by a shared row —
   the two ports currently REFUSE a computed path differently, and the
   row waits on that alignment).
3. No credential or header forwarding across origins; anything beyond
   a bare fetch is explicit opt-in.
4. Remote resolution is only available under an explicit capability;
   it never joins `system`.

## Evaluation consumes the tree

A parsed `Val` tree is **single-use**: `unify`/`generate` refine it in
place, and reusing a consumed tree (or any node reachable from it) in
a second evaluation is a *correctness* bug that surfaces as
nondeterminism — the exact failure mode this contract exists to
exclude. Parse again (or clone first) for every independent
evaluation. This is a named rule of the API contract now — see
[the API reference](reference-api.md#evaluation-consumes-the-tree) —
not a code-comment caveat.

## Refusals

Guarantees are as much about what will never be added:

- **No wall-clock or memory budgets** — a limit that varies with
  machine load makes identical inputs fail differently.
- **No `now()`, `random()`, or `env()`** — each would falsify
  clause 1 by construction.
- **No Turing-completeness, no SMT solvers** — termination stays
  structural plus fuel; every trust question is answered by counting,
  never by solving.
- **No executable hooks in evaluation** — no callbacks or shell-outs;
  the resolver is the language's only effect, which is why confining
  the resolver confines the language.

## Where each piece is pinned

| claim | pin |
|-------|-----|
| cycle/no-path taxonomy codes | [test/spec/budget.tsv](../test/spec/budget.tsv) (`errc` + substring rows, both engines) |
| `budget_passes` code, class and "evaluation budget" substring | shared rows — [test/spec/budget.tsv](../test/spec/budget.tsv) `budget-chain-*` (verdicts, code and message substring, both engines); `ts/test/unify.test.ts` and `go/hints_test.go` keep the per-port err-shape guards |
| code → class registry | [test/spec/errcodes.tsv](../test/spec/errcodes.tsv) + set-equality tests in both runners |
| canon byte-stability | every `canon` row (strict equality, both runners) |
| generated-JSON byte-stability | `gens` rows (docs/shared-spec.md) |
| known open divergences | [test/spec/divergent.tsv](../test/spec/divergent.tsv) — each entry carries its tracking issue. Read the file for the live list rather than a count copied here; as of this revision one entry is `# OPEN` (#24, lone surrogates), and #26/#27/#29/#30/#31/#32/#34/#35 are fixed and closed. Only the Unicode table vintage remains permanent, in DIVERGENCE.md |
| resolver posture | SECURITY comment, `ts/src/lang.ts`; this document |
| single-use trees | reference-api.md rule; `Aontu.parse` / Go `Parse` doc comments |
