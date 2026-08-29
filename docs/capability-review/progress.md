# Capability review — progress register

This is the single record of **where the [capability review](index.md)
stands**: every numbered phase of G1–G8, its status, and the artifact
that proves it.

An entry belongs here when it is a *numbered phase of a gap document's
implementation plan*. The design itself — what a capability should do,
what was rejected, what the risks are — stays in the gap document. This
file answers one question only: **has it landed, and what proves it?**

## Why this file exists

Before it, that question had no answer in one place. The complete
statement of what had landed existed in exactly one artifact — the body
of commit `87f4d37`, which names "G1 0/1/6, G2 1, G5 1/2/5" in passing
while doing something else — and a reader who did not know to run
`git log` had eleven partial, mutually inconsistent sources to
reconcile: eight gap documents all headed *"Status: design proposal"*
including three that are partly implemented, an index whose "Verified
codebase facts" list carries four strikethrough corrections, a
CHANGELOG whose newest heading predates the review, and eight "nothing
may regress" baselines quoting four different spec-suite sizes between
them, none of them current.

This repository has already diagnosed that failure mode in writing, in
[`AGENTS.md`](../../AGENTS.md#known-tsgo-divergences):

> Kept in one place deliberately: the same divergence had been
> described in an AGENTS.md section, a ledger comment and an upstream
> doc, and they drifted apart — the ledger claimed a behaviour was
> still divergent for some time after it had been aligned.

The remedy applied there — one register, one protocol, siblings that
state what they are *not* — is what this file applies to capability
progress. Its siblings: [`ADR.md`](../../ADR.md) for decisions that
must not be quietly reversed,
[`DIVERGENCE.md`](../../DIVERGENCE.md) for permanent TS/Go non-parity,
[`test/spec/divergent.tsv`](../../test/spec/divergent.tsv) for parity
debt, and [`docs/test-coverage.md`](../test-coverage.md) for coverage
exclusions.

## What "landed" means

ADR-001 sets the bar, and it is higher than "the code exists":

> **LANDED** — every named deliverable of the phase exists; where the
> phase touches language behaviour it exists in **both** ports; and
> shared rows in `test/spec/*.tsv` pin it. A phase whose behaviour is
> implemented in TypeScript alone is not landed, it is partial.
>
> **PARTIAL** — some named deliverables exist and others demonstrably
> do not. The entry says which, so the remainder is a work item rather
> than a rediscovery.
>
> **NOT STARTED** — no deliverable of the phase exists. Drafted spec
> rows under [`test/spec/draft/`](../../test/spec/draft/) do not change
> this: a draft is a design artifact, not an implementation, and by the
> [parity-probe rule](../../AGENTS.md#the-parity-probe) it cannot
> become an executable row until the behaviour it describes runs in
> both engines.

The status words are the ones the repo already uses (`OPEN`/`CLOSED` in
the divergence ledger, `Accepted`/`Superseded` in the ADR register).

## The update protocol

1. **A phase's status changes in the same commit that changes its
   status.** This is the rule that already keeps
   [`test/spec/errcodes.tsv`](../../test/spec/errcodes.tsv) accurate —
   "new engine codes must land with a registry row in the same change"
   — and errcodes.tsv is the one landing record in this repository that
   has never gone stale. Nothing else here is machine-checked, so the
   discipline is the whole mechanism.
2. **An entry cites artifacts, never intentions.** A pin is a path, a
   spec file, a symbol, or a commit hash that a reviewer can re-check
   in under a minute. "Designed", "planned" and "in progress" are not
   statuses.
3. **A phase that lands differently from its design says so here**, and
   the gap document is corrected in the same commit. G1.6 is the worked
   example: it landed broader than written, and both the register and
   the design text have to carry that or the next reader plans against
   a rule that is not the one in the engine.
4. **Entries are updated in place, not appended.** Unlike the ADR
   register, phase status has no history worth preserving — the git log
   holds it. What is preserved is the *departure* note, because that is
   design information.
5. **Counts of the shared suite live here and nowhere else.** All eight
   gap documents froze a row count into a "nothing may regress" clause;
   all eight are now wrong, by roughly 1,400 to 1,500 rows. A gap
   document should link this line instead: as of this
   register's last update the suite is **91 `.tsv` files, 90
   row-bearing, 3,495 rows**, in twenty modes — `canon` 799, `errc`
   615, `gen` 579, `gens` 531, `err` 252, `errcode` 111, `subsume` 101,
   `query` 92, `vet` 88, `why` 54, `jsonschema` 54, `hcanon` 43,
   `patch` 42, `relation` 35, `graph` 28, `diff` 28, `reaches` 13,
   `hash` 12, `trim` 11, `agentsmd` 7.
   (Re-derived 2026-08-28. The figures this line carried before —
   86/85/3,099 in eighteen modes — were stale by four files and 379
   rows, and omitted `jsonschema` and `reaches` entirely. They were
   falsifiable in the two commands below, which is the point of
   carrying them; nobody ran them. `status-2026-08-27.md` had the
   right counts.)
   Reproduce with
   `ls test/spec/*.tsv | wc -l` and
   `cat test/spec/*.tsv | grep -P '\t' | grep -vc '^#'`.

## Summary

Forty-nine of forty-nine phases have moved; forty-eight of those are
complete. One is not: G5 phase 6 is deliberately held for the next
major release, a release act rather than an engineering one. G7 phase 7
was found partial on 2026-08-21 — its `--jsonl` flag was unreachable in
the Go port and TTY-gated in the TypeScript one — and was closed on
2026-08-24; its row records what the fix was and why the earlier tests
could not see the defect.

| Gap | Capability | Review phase | Landed | Partial | Not started |
|-----|-----------|--------------|--------|---------|-------------|
| [G1](g1-constraint-algebra.md) | Constraint algebra | A | 7 | 0 | 0 |
| [G2](g2-validation-verb.md) | The validation verb | A | 6 | 0 | 0 |
| [G3](g3-subsumption-evolution.md) | Subsumption, evolution | B | 7 | 0 | 0 |
| [G4](g4-identity-relations.md) | Identity, relations | C | 7 | 0 | 0 |
| [G5](g5-trust-contract.md) | Trust contract | A | 5 | 1 | 0 |
| [G6](g6-distribution.md) | Distribution | B/C | 5 | 0 | 0 |
| [G7](g7-machine-access.md) | Machine access | B | 7 | 0 | 0 |
| [G8](g8-generation.md) | Generation | C | 5 | 0 | 0 |
| | | **total** | **48** | **1** | **0** |

Against the review's own [sequencing](index.md#sequencing):

- **Phase A — make the claim true.** Nearly done. The trust contract
  (G5.1–2) and the error-code registry (G2.1) are in, **G1 is
  complete** — all seven phases, both ports, shared rows, and the
  ADR-002 gate back at 100% in both — and so is **`aontu vet`**:
  engine (G2.2), command (G2.3), Go port (G2.4) and the delivery skin
  (G2.5: SARIF in both ports, the `vet-action/` composite Action, and
  `--watch`), with verdict exit classes an agent loop can branch on and
  46 shared rows both runners execute. G1 landed more than the
  sequencing table's "constraint algebra core (bounds, regex,
  length/count)" asked for: cross-field residuation and the `must`
  escape hatch are in too. **G2 is complete**: multi-error collection
  (G2.6) landed, so a report lists every contradiction the fixpoint can
  reach, deduplicated to one finding per cause. **G5 is complete but
  for one release act**: the trust profile (include capability plus
  deterministic budgets) is in both ports at every surface, the shared
  suite is hermetic under it, and the include manifest makes the
  hermeticity file set observable — what remains of A is only G5.6's
  default FLIP, staged for the next major version with its warning
  window already shipping.
- **Phase B — differentiate.** Underway, and **G3 is complete** —
  subsumption is a query and a gate: the recursion in both ports
  (G3.1–2), its rules and 94 shared rows (G3.0), the `subsume` and
  `breaking` CLI verbs with `git#rev` resolution and the
  `aontu_policy.compat` declaration (G3.3), the `deprecate()` mark
  with its three point-of-use surfaces (G3.4), the default-validity
  lint (G3.5) and the `trim --check` redundancy reporter (G3.6). The
  **canon-hash pins meaning rather than text** (G6.0–1): the hash form
  in both ports, `aontu hash` on both command lines, and full
  `aon1-…` strings pinned cross-implementation by the shared suite —
  the review's Phase B "canon-hash pinning" item, useful with no
  registry behind it. And the **query surface has opened** (G7.1–2):
  `aontu get` selects one node by path and renders it plainly or as a
  lattice abstraction, in both ports, with the "view subsumes truth"
  property mechanically asserted by every projection row rather than
  promised. **Provenance is a verb** (G7.3–4): `aontu why` names every
  contribution to a value with the site it was written at, from a
  recorder that hooks the one place every meet passes through and is
  off by default. And **patch is a verb** (G7.5): `aontu set` appends
  a path-flattened conjunct to an overlay, refuses to write a change
  that contradicts a pinned value, and rests on an order-independence
  the suite asserts row by row. **The delivery skin is on** (G7.6):
  an MCP server over the same contracts the CLI prints, a path-
  addressed `diff`, a published grammar the suite's own canon corpus
  is run against, a generated AGENTS.md stanza, and a skill whose
  examples are executed. **G7 is complete** (G7.7):
  the REPL loads a document and answers `:get`, `:keys` and `:why`
  about it in both ports, and LSP hover can carry the provenance record
  behind a config gate. The `--jsonl` session mode that makes it
  machine-drivable was the reason this phase read PARTIAL on 2026-08-21
  — unreachable in the Go CLI, TTY-gated in the TypeScript one — and
  was closed on 2026-08-24. Re-checked 2026-08-28: piping
  `:load <file>` and `:get $.b.c` into `aontu --jsonl` answers one JSON
  object per line, byte-identical in both ports.
- **Phase C — scale.** G4 is complete, and so are G6 and G8. **G8**
  is the generation combinators: **G8.0**, the staging rule they all
  share, which replaced the pass-count hack the review named as the
  strain; **G8.1**, `pack` and `each` — children made from data that
  is already in the model, so the list and the children built from it
  cannot drift; **G8.2**, `filter` and `match`, which select by
  unification rather than by a predicate language of their own;
  **G8.3**, the placeholder `_`, the language's first reserved literal
  since it gained `top` and its first deliberate breaking change; and
  **G8.4**, the pipe. **G6 is the distribution layer**: module
  identity and local resolution (G6.2), the `tidy`/`vendor` tooling
  (G6.3), and the publish boundary (G6.4) — so a module has a name, a
  local closure, a lockfile written in canonical form, and an artifact
  description gated on the breaking check. Only the two network verbs
  are absent, and they are the parts that carry no semantics.

**Every phase of the review has now landed but one.** G5.6 — the
include-capability default flip — is deliberately held: it is a
release act rather than an engineering one, and its warning window is
already shipping. G7.7 was partial for a different reason, and is now
closed: it had been graded LANDED on the strength of artifacts that
exist, and running the two CLIs side by side found one of them
unreachable. Existence is not reachability, and a pin sweep cannot tell
the difference — which is why its closing tests drive the real entry
points rather than a hand-built state.

A separate readiness caveat, which this register carried until the
release, is now **closed: the work below is released.**
npm `aontu@0.53.0` and Go `go/v0.1.11` were published on 2026-08-28
from commit `2cec558`, over the OIDC trusted-publisher path in
`.github/workflows/publish.yml` — so every CLI verb (`vet` included),
the MCP server, and all of G3, G4, G6, G7 and G8 are installable for
the first time. `npm view aontu version` answers `0.53.0`, the proxy
resolves `github.com/aontu-lang/aontu/go@v0.1.11`, and both tags point
at that one commit.

What the caveat said before, which was accurate then: **most of the
work below was not in a released artifact — but not none of it.** The
npm `aontu@0.52.1` and Go `go/v0.1.10` release commits sit MID-review:
their trees carry the G1 constraint algebra's whole atom vocabulary
(`min` through `must`, with phases 4–5's completing fixes still ahead
of it), the errcodes registry and the written G5 trust contract, while
everything after commit `8ee985c` — every CLI verb (`vet` included:
the 0.52.1 `ts/src/cli.ts` has no occurrence of it), the MCP server,
and all of G3, G4, G6, G7 and G8 — was unreleased. (That paragraph
originally claimed both tags predate the first review commit; git
ancestry disproves that, and
[`status-2026-08-21.md`](status-2026-08-21.md#2-none-of-it-is-released)
carries the same correction.)

The two defects `status-2026-08-21.md` named as blocking the 0.53.0
release were closed on 2026-08-24 — the served-evaluation confinement
hole, and the five cross-port `vet` verdict flips, four of them named
in that report and the rest found by sweeping around them
(`re("x{y}")`, a quantified `^`/`$`, and a `}` closing no quantifier)
— with 37 shared rows pinning the agreement and both coverage gates
back at 100%. The Go half shipped as **0.1.11**, a patch on the 0.1.x
series, rather than the 0.2.0 that report anticipated.

One structural note the sequencing table itself makes: G7's query/MCP
surface depended on nothing, and shipped in 0.53.0 with the rest.

## G1 — a real constraint algebra

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **0** — algebra on paper | S | **LANDED** | `docs/reference-language.md` "The constraint algebra (specified)": all three tables the phase names — meet, emptiness, and **subsumption** — plus the canonical atom order, tower rulings, the lazy-endpoint/eager-emptiness decision, and `length` as Unicode code points. `test/spec/constraint-bound.tsv`, `constraint-re.tsv`, `constraint-length.tsv` and `constraint-cross.tsv` all promoted (the draft directory is now empty). Fold-defect guard rows in `disjunct.tsv`. Commit `98fc1bf`, completed by the subsumption table. |
| **1** — numeric and lexical bounds, `neq` | M | **LANDED** | `ts/src/val/ConstraintVal.ts` (`cjo = 50000`) + `go/constraint.go`; `min`/`max`/`above`/`below`/`neq` in both registries (12 → 17 builtins); `test/spec/constraint-bound.tsv`, `constraint-product.tsv` (all 256 ordered pairs), `errcodes.tsv:constraint`; law tests `ts/test/constraint-laws.test.ts` + `go/constraint_laws_test.go` over `test/spec/files/constraint-atoms.txt`. Commit `ae82828`. |
| **2** — `re` | M | **LANDED** | `ReConstraintVal` (`ts/src/val/ConstraintVal.ts`) + the `re` arm of `newConstraint` (`go/constraint.go`); `re` in both registries (17 → 18 builtins) and both LSP completion lists; the portable-subset scanner (`nonPortableRe` at landing, mirrored statement for statement in both ports — since replaced outright by `normaliseRe` under ADR-003, as recorded below); `test/spec/constraint-re.tsv` (89 rows, promoted from the draft with every expectation re-probed) and the differential corpus `test/spec/files/regex-corpus.tsv` (400 patterns, both normalisers pinned); `errcodes.tsv:constraint_pattern`. |
| **3** — `length` and `unique` | M | **LANDED** | `LengthConstraintVal`/`UniqueConstraintVal` (`ts/src/val/ConstraintVal.ts`) + the `length`/`unique` arms of `newConstraint` (`go/constraint.go`); both in both registries (18 → 20 builtins) and both LSP completion lists; `unique` is the first zero-arity built-in, so `arityText` gained a "no arguments" case. `test/spec/constraint-length.tsv` (92 rows, promoted from the draft with every expectation obtained by running BOTH engines and diffing). **Departure from the design:** implementing it added one rule the design did not have — sizing atoms fold LAST in a conjunct (`SIZING_CJO`), or `a:length(2) a:{x:1} a:{y:2}` would count the first fragment alone and refuse the layering the language exists for; `docs/reference-language.md` "Sizing atoms fold last" carries it, and `MapVal`/`ListVal` hand a constraint peer back to the constraint because the order reverses who drives the meet.  **2026-08-27, the reserved arity is spent (use-cases/REVIEW.md finding I).** `unique()` compared WHOLE members by canon, so "no two services share a port" and "unique event ids" were inexpressible and two records differing anywhere else slipped through -- the reference acknowledged this and reserved the atom's one argument for a PROJECTOR. `unique(k)` is that spelling: no two members may share the named key. A member without the key FAILS rather than being skipped (distinctness that cannot be shown is distinctness the collection does not have, and skipping would let one keyless record hide a duplicate), and so does a member that is not a map. `unique(a) & unique(b)` demands BOTH -- the keys accumulate, since each names a different axis and dropping either would silently weaken the constraint -- with canon sorting them after the bare atom so two documents saying the same thing render the same string, and subsumption requiring the general side's every key on the specific side. It also RETIRED the "no arguments" arity phrasing: `unique` was the only built-in taking none, and a phrasing for a count no entry carries is untested prose pretending to be tested, which is the rule `arityText`'s own header states. Nine rows in `constraint-length.tsv` (unique-by-key-*, unique-arity-message) plus two in `subsume.tsv`. |
| **4** — cross-field arguments, residuation | M | **LANDED** | `settle` in `ts/src/val/ConstraintVal.ts` + `go/constraint.go`: an atom whose arguments have not settled becomes `pending` and resolves through `unify`, mirroring `FuncBaseVal`'s discipline. `test/spec/constraint-cross.tsv` (30 rows, promoted from the draft with every expectation obtained by running BOTH engines and diffing) covers reference and expression arguments, forward and chained references, the sizing/pattern atoms' own arguments, spread templates carrying a bound onto children, constraint-bearing disjuncts, and the `budget_passes` boundary. **Unblocked, by three parser fixes.** The phase unmasked a family of func-paren comma-group defects: TS handed the handler the UNREDUCED operator tree, Go's `addition-infix` handler read the rule's open token unguarded and PANICKED when a `+` was the last member, and TS dropped every argument after a single-segment `$.z`. The Go panic was fixed in this repository and the other two upstream in `@tabnas/expr` 0.5.4 (tabnas/expr#42, #43, raised from this work) — all squash-merged in PR #56, commit `853963e`; the branch-local hashes this pin once named no longer resolve. Those three are pinned by the `neq-comma-*`, `min-expr-arg-*` and `neq-ref-*` rows in `constraint-bound.tsv`. **Departure from the design:** writing the rows found two Go-only defects the probe corpus had missed — `setPaths` had no `ConstraintVal` arm, so a pending atom's arguments carried no path and an unresolvable `min($.zz)` located its `no_path` at the ROOT, and the fold's re-wrap was pathless, so `budget_passes` named `$` where TypeScript names the node. Both are fixed and pinned by the `-sited` rows. |
| **5** — `must` | S | **LANDED** | Band B in both ports as a kept, never-simplified field on the residual, folded LAST (`LATE_CJO`/`sizingCjo`, generalised from the sizing rule) so it checks the finished value, against a CLONE so the check reports without contributing; error code `must` in `errcodes.tsv` with the author message carried into the hint. `test/spec/constraint-must.tsv` (28 rows at landing): evaluate-only reporting, the late fold over layered fragments, checks kept in written order without dedup, reference and expression arguments, container arguments, and the argument discipline (parse-time arity, string message, a check holding a nil refused as an argument). **Two departures from the design:** `must` joining the late-fold slot is what generalised it, so `docs/reference-language.md` "Sizing atoms fold last" now names all three late atoms — Go's `cjo()` was missing the `must` arm entirely, which fired the check against the first fragment, and the `must-folds-last` rows pin it. And an **effectful** argument is refused at construction: `move()` hides its resolution target in place, and settling a pending argument runs that against the LIVE root before the trial clone is taken, so `b:1 a:must(move($.b),m) a:1` dropped `b` in Go and raised `internal` in TypeScript. The sibling atoms already refused it for a different reason (an effectful value is not an orderable scalar), so this is `must` joining a policy the family had; `must-move-arg*` pins it. |
| **6** — number exactness | S | **LANDED** | `isLossyIntegerLiteral` → `lossy_integer_literal` in `ts/src/lang.ts` and `go/lang.go`; `test/spec/number-tower.tsv`, `number-model.tsv`, `scalar.tsv`. Landed inside the number tower, commit `51e8149`. |

**Phase 0's subsumption table** was the last of its three tables to be
written, and for a while the reason this phase read PARTIAL: the phase
text names "the pairwise meet / emptiness / subsumption tables", and
only the first two existed. It is now in
`docs/reference-language.md`, "Subsumption" — the per-atom rules for
`A ⊒ B`, with the two approximations (`re` compares patterns as text;
`must` is opaque) marked as such and both failing toward "not
subsumed", which is the safe direction for the compatibility check G3
puts on top. G3 phase 0 is its consumer, and it is no longer blocked.

**Phase 2 departed from its drafted rows in one place, and the probe is
why we know.** The draft predicted `string & re("^[a-z]$")` would canon
as `string&re("^[a-z]$")`. Both engines agree it canons as
`re("^[a-z]$")`: a pattern implies the string kind exactly as a numeric
bound implies `number`, and the phase-1 row `bound-number-passthrough`
already pinned the implied kind being dropped. The promoted row records
the probed behaviour and says so inline.

Phase 2's subset had to be tightened twice, and the second time was
review finding a real defect rather than a style point. The first draft
whitelisted `(?...)` groups but left ESCAPES as a blacklist, and two
escapes it had never heard of silently diverged: `\A` and `\z` are
anchors in RE2 and identity escapes matching a literal letter in
JavaScript, so `re("\A") & "x"` held in Go and failed in TypeScript —
precisely the divergence the subset exists to prevent. `\s` was the
same story on a different axis (Unicode whitespace in JavaScript,
ASCII-only in RE2). Escapes are now a whitelist too. The lesson is
general enough to state: **in a two-engine subset, every axis must be a
whitelist, because a blacklist admits the next divergence by
construction.**

**The enforcement mechanism was then replaced outright, and that is now
[ADR-003](../../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted).**
Three leaks in one day — two from review, one from writing documentation,
none from a test — established that a blacklist of known-bad constructs
cannot work: its correctness is a claim about the author's knowledge of
two large external systems, and nothing in the suite can falsify it.
`re` now **normalises** instead: Aontu defines what `\d`, `\s`, `.`,
`\A` and `\z` mean and rewrites the pattern before either host engine
compiles it, so the hosts only ever see constructs they cannot read two
ways. Refusal is reserved for what has no rewriting (backreferences,
lookaround) and for the one axis rewriting cannot reach (complexity).
The result is a LARGER accepted subset than the blacklist allowed, with
a stronger guarantee. `test/spec/files/regex-corpus.tsv` pins both
normalisers over a generated corpus so drift fails in whichever port
drifted.

The third leak, which prompted it, was the subset's own blind spot
rather than review's: **JavaScript matches UTF-16 code units by default and RE2
matches code points**, so `re("^.$")` accepted U+1D11E in Go and refused
it in TypeScript — and `re("^..$")` did the exact reverse. The
TypeScript port now compiles with the `u` flag, which makes `.` and
every quantifier count code points in both engines. That flag also makes
JavaScript refuse `\-` outside a character class where RE2 accepts it,
so the scanner now allows `\-` only inside a class; adding the flag
without that rule would have traded one divergence for another.

The same review found that `re` also breaks the *termination* clause in
one port. `(a+)+$` against twenty-nine characters takes 45 seconds under
JavaScript's backtracking engine and 0.065s under RE2, and a regex match
is counted by no evaluator budget, so an untrusted schema could stall
the TypeScript evaluator indefinitely — the unattended-agent case the
language is for. The subset now refuses a quantifier applied to a group
containing a quantifier or an alternation, which keeps `docs/trust.md`
clause 2 true in the port that has the problem. Recorded there as
bounded-by-construction rather than bounded-by-budget, with the residual
risk (polynomial backtracking is still admitted) stated. **The
principled fix is a linear-time regex engine in TypeScript** so the two
ports share a complexity class as well as a semantics; that is a
dependency decision, not a phase-2 one.

Phase 2 also added the `constraint_pattern` code (class `conflict`) for
a pattern outside the portable subset — the design text does not name a
code, and the phase-1 precedent of one `constraint` code for the whole
family would have given the most likely authoring mistake in the atom a
generic message. The refusal reason is a fixed string rather than the
host engine's message, so the whole error frame stays byte-identical
across ports even when it is the host compiler that objected.

**Phase 6 landed broader than its design.** The design scoped the
refusal to the `(2^53, 2^63)` magnitude band and stated that
"`test/spec/scalar.tsv` extreme-magnitude rows are untouched"; the
landed rule is **exactness, not magnitude**, so `scalar.tsv:hex-big`
did flip to `hex-big-err`, and more than the one sanctioned row
changed. `test/spec/number-tower.tsv` records the reason inline:
"contrary to what the design and G1 both said before this phase checked
the arithmetic". The G1 text carries the correction now — both its
phase-6 paragraph and its risks table say the landed rule is exactness
and that more rows changed than the design sanctioned.

**Known limit of phase 1**, documented but not in the design text: a
preference meeting a constraint inside a conjunct (`min(1024) & *8080`)
does not resolve to the default; the disjunct form does. See
`docs/reference-language.md` and the comment above
`constraint-bound.tsv:bound-pref-disjunct`.

**A second constraint design landed on `main` and is now reconciled,
2026-08-28.** [`docs/design/AONTUCONSTRAINTS.0.md`](../design/AONTUCONSTRAINTS.0.md)
was uploaded in commit `8d892a4` as that commit's only content, written
downstream from a boru survey of **Go port v0.1.6** and cross-checked
against real `cue export`. Nothing in this repository referenced it. It
is not a competing design — it surveyed a tree predating most of G1's
landing — but read as current it misleads in both directions, so its
disposition is recorded item by item in
[g1-constraint-algebra.md](g1-constraint-algebra.md#reconciliation-with-the-2026-08-27-constraint-design-note)
and its own header now says which parts are stale. In summary, with all
twelve of its §2 rows re-run against `aontu@0.53.0` and `go/v0.1.11`:
its **D1** and **D2** were fixed one day before it landed (ADR-004,
ADR-007), and its `D1-a` recommendation is what the engine does; its
**N1**/**N2** landed as capabilities under function syntax
(`min`/`max`/`above`/`below`/`neq`/`re`) rather than the CUE operators
it proposed, which is why the lexing break its §10 budgeted for never
happened; its `D6-a` string bounds are in. **The operator spellings are
now declined outright** —
[ADR-008](../../ADR.md#adr-008--constraints-are-named-not-spelled-with-operators),
2026-08-28: constraints are named, not spelled with operators, and
adopting them later needs a new ADR. That settles a question this
register had left open. It also removes the premise behind §45 (below),
which is now retracted.
**N3** key-pattern constraints
(`&"^env_"` is a parse error in both ports) are **DEFERRED as of
2026-08-28 by maintainer decision** — a choice, not a blockage: `re`
supplies the pattern machinery and `&:` spreads the scoping point, so
nothing is missing but the decision to build it. The sized-integer sugar
(`int8` is the bare string `"int8"`) is **not being built, because the
language already expresses it**: a `type()`-marked block of named
constraint aliases gives `uint8`, `port` and anything else without a
keyword, emits nothing, and unlike a closed list of built-in names it
composes — an alias may be defined in terms of another, or narrowed
where it is used. Verified in both ports and pinned by
`test/spec/constraint-alias.tsv` (8 rows); documented normatively in
`docs/reference-language.md` "Named constraint aliases" and as a task in
`docs/how-to.md` "Name a reusable constraint", both executed by
`ts/test/docs.test.ts`. This phase set never scoped either item.

**RECURSION P0+P1 LANDED 2026-08-29** (docs/design/RECURSION.0.md,
plus its P2 vet flows, pulled forward because the anchored meet needed
the schema root), in both ports: where `RefVal`'s prefix test answered
`path_cycle` for a self-reference, it now mints a RECURSIVE RESIDUAL
— `$.spec.Step` inside `Step` means the fixpoint. The residual
expands ONE LEVEL PER MEET with concrete structure (per-destination
clone, marks and identity walk-cleared at every depth, rebased to the
drive path unless lifted out of its tree), stays SYMBOLIC in canon
and the `aon1-` hash (the mu-form; a recursive schema's canon is
finite and reparses to itself), and refuses at generation only where
a REQUIRED recursive position never met data (`recursion_unexpanded`;
the depth budget answers `recursion_budget`) — guardedness is
EMERGENT, never statically analysed. The FIXPOINT-REFERENCE RULE
makes canon converge: a reference resolving to a definition that
contains the recursion of its own target (a minted residual OR a raw
reference to it — the answer is order-independent) itself answers the
residual. Mutual pairs, `*null |` guards, tree spreads and recursive
`%aliases` all work (`%json:
null|boolean|number|string|[&: %json]|{&: %json}` is the JSON value
space in one line); subsume over an unexpanded residual answers
`undecided`. P0 is the §52 regime-4 fix: `same()`/`valSame` compare
spreads and X-C3 landed as the `list_length` trial gate, so
`[] | [&: T]` selects by shape. Two engine rules fell out: reference
walks descend through a PENDING `hide()`/`type()` wrapper onto a bag
(closes BUGS §53 as well as the one-bag schema shape), and vet's
anchored meet keeps the settled schema root for the residual's walk
(`_fixroot`/`fixroot` — before it, bad data at depth vetted VALID
unchecked under `--at`). Pinned by `test/spec/recursion.tsv` (25
rows), the re-adjudicated rows in budget/alias/disjunct/errcodes
TSVs, and paired anchored-vet unit tests; documented in
`docs/reference-language.md` ("Recursive references (fixpoints)") and
`docs/how-to.md` ("Define a recursive schema"), both executed;
exercised end to end by `use-cases/13-recursive-schema` (and BUGS §52
is FIXED per regime). `jsonschema` `$defs`/`$ref` export remains (the
rest of P2), and P3 subsumption-through-expansion stays future.

**RELATIONS P2 LANDED 2026-08-29** (docs/design/RELATIONS.0.md), in
both ports: the graph atoms — `acyclic()` and `inverse(name)`,
conjoined at the field whose key is the predicate — REGISTER during
unification (lattice-inert: both properties are global and
non-monotone) and the verdict lands at GENERATION as a located
`relation_cycle`/`relation_inverse_missing` at the offending edge, the
sizing atoms' model; the `relations` verb reports the same findings
from the same declarations (`relationFindings`, shared by both
surfaces). The atom CARRIES the field's value (`held`, the
sizing-constraint shape), self-drives in place, and the rel rewrite
keeps doneness when nothing is pending and installs its leaf
constraint as the flat container's element spread — the three
convergence rules the service catalog forced (see the note's P2
boundary list; the catalog's own schema now reads
`dependsOn?: rel($.std.Service) & re("^svc_") & acyclic() &
inverse(dependedOnBy)` with plain-list data and patch positions
converting). The `relations:` magic key is GONE — ADR-010's
grandfather clause discharged, `relations:` is ordinary user data —
along with `meets()`, `declaredRelations()`, the std `Relation`
schema, and `relation_target_unmet` (the target half is `rel(t)`'s
flow, refusing at evaluation); `inverse_name` is new, hints for the
two verdict codes are new (they render as thrown errors now), and
relation.tsv is re-pinned end to end on the atoms. `refer()` remains
beside `rel()` until P3.

**RELATIONS P0+P1 LANDED 2026-08-29** (docs/design/RELATIONS.0.md), in
both ports: D-1 (entity names are flat identifiers,
/[_a-zA-Z][-_a-zA-Z0-9]*/, no slash -- the corpus's 17 slashed names
underscore-joined, `svc/payments` -> `svc_payments`, because a bare
hyphenated name belongs to the minus operator); bare `id()` named by
the enclosing key, late-bound with a one-pass defer so the pass-zero
spread snapshot finds it open and each child resolves at its own key
(the id(key(0)) include gap made primitive); and `rel(t?)`, the
relation constraint sited on the FIELD -- one address, a list, or a
labelled map, every leaf through the refer machinery, the PREDICATE
declared as the key the rel() sits on (the map-valued edge now reports
under `uses`, where the old inference named the inner label), type
flow, and rel_address/rel_unresolved. An unmet rel() is DONE, the
settled-residual property refer() lacks, so type() bodies carrying one
settle and the data side stays plain JSON-shaped strings. Pinned by
test/spec/rel.tsv (37 rows -- the rel-two block also pins the unite
equal-scalar shortcut fix: two settled rels share an absent peg and
were matched as "the same value", order-dependently dropping one
side's type and held), the id.tsv/graph.tsv bare-id blocks, and the
D-1 refusal rows; every expectation probed through both engines. The
D-1 migration also rewrote the id_name hint (it taught the slash) and
the refer_* hint examples.
refer(), the `relations:` key and the verb are UNCHANGED until P2/P3;
a self-typed rel($.T) inside T waits on RECURSION.0.md P1 (the prefix
test refuses it today), recorded in the note's phase table.

**ALIASES (P1) LANDED 2026-08-28**, in both ports, and they are the
general form the sized-integer question was a special case of: `%port:`
declares a file-local name and `%port` uses it, with no path to spell
and no `type()` block to hang it on.

The implementation is smaller than the design note expected, and the
reason is worth recording: **an alias reference IS a path reference.**
`%uint8` is `$.%uint8` — root-absolute, one segment, spelled with the
sigil the declaration is spelled with. Order independence,
alias-of-alias, redeclaration unifying and cycle refusal are then the
reference machinery already in the language rather than a second
resolver beside it, which is also why the MIXED cycle (`%a: $.x` with
`x: %a`) is refused: there is one reference graph, not two. What had to
be built was the LEXEME — `%name` is one token, a binding in key
position and a use in value position — and the ERASURE, which is a
`MapVal.aliasKeys` list filtered in generation, canon **and hcanon**.
That third surface is the one that matters: `aon1-` pins meaning, so a
document written with aliases and its longhand twin must hash to one
string, and `hcanon` is a separate renderer that does not inherit
canon's filter.

One rule is not the reference machinery and had to be decided:
**a declaration sits at the root of the DOCUMENT, not of the file.**
The parse cannot see the difference — an included file's declarations
are at the root of its own text, and only once the loaded map is
*placed* does it become apparent that root is not the document's — so
both ports collect `%name` keys as they walk and refuse on the value,
in `MapVal.unify`. That single rule then decides all three shapes:
`x: {%a: 1}` refused, `a: @"f.aon"` refused (left writable, the
includer's `%b` is what `f.aon`'s own `%b` would reach), and `@"f.aon"`
spliced at the root accepted, because one root map is one document with
no second scope to leak out of. The Go port originally carried a
syntactic twin of this check at the parse as well; it decided the
nested case one column off from TS and left the value-level rule
unexercised, and removing it made the two ports agree byte for byte.

Pinned by `test/spec/alias.tsv` (38 rows, every expectation probed
through both engines), including the hash pair that states the erasure
as an equality rather than an absence. Documented in
`docs/reference-language.md` "Aliases", executed by `docs.test.ts`.
**P2 — `export` and the `{…} = @"…"` destructure — is not built**, and
the two open questions gate it rather than P1: X-1 was taken the third
way (`%foo:`, the ordinary key syntax, so no `=` and no lexing break
beyond the sigil), and T-1's expansion budget does not bite while
expansion is bounded by one file.

**One defect the note named turned out not to be one, and this register
should not imply otherwise.** Its row 7 — `a: >10` lexing as the string `">10"`,
which it called "worse than unsupported, since it produces a
well-formed wrong config" — is unchanged: `port: >=1024` evaluates to
`{"port":">=1024"}` and exits 0, in both ports. Choosing function
syntax removed the *need* to reuse `>` without changing what `>`
currently does, so the capability landed while the defect that motivated
it went unaddressed — **and on 2026-08-28 that framing was retracted as
wrong.** `>`, `<`, `=` and `!` are not reserved, so a bare value
containing them is ordinary text, exactly as `port: high` is `"high"`;
calling the result a wrong config assumes an intent the document never
states. The grading was inherited from a note written when bounds
existed in no spelling at all, and ADR-008 removes its premise.
[`use-cases/BUGS.md`](../../use-cases/BUGS.md) §45 is retracted and the
refusal it proposed withdrawn; what remains is discoverability, which
the reference and how-to carry.

**And one this review found while reconciling — now FIXED, 2026-08-28.**
A `&:` element spread occupied an index slot in the TypeScript port's
error paths and not in Go's, so `l: [&: integer, 10, 20, "bad"]`
reported `$.l.3` in TypeScript and `$.l.2` in Go — an ADR-001
divergence, with the canonical port on the wrong side of it. It was the
§41 defect (right site, wrong path) in the container §41's fix did not
reach, and it was broader than first reported: a plain `k:v` pair in
list position stole an index too.

The cause was in neither evaluator. `@tabnas/path`'s `@elem-ao`
increments its element index for **every** `elem` rule, and three of
aontu's four `elem` alternatives contribute no element; the array slot
they occupy was already given back by `restorePairSlot`, the path index
was not. The `elem` rule now rewinds it and re-paths the child — the
twin of the correction the `pair` rule already carried for map spreads.
Pinned by nine rows in `test/spec/spread-list.tsv`, every expectation
probed through both engines; reverting the fix fails exactly four of
them. [`use-cases/BUGS.md`](../../use-cases/BUGS.md) §44.

**Fixing it surfaced two more cross-port divergences, both predating it**
(TypeScript byte-identical to the published 0.53.0 on each): a `k:v`
pair written BEFORE a `&:` spread made TypeScript drop the spread
entirely and generate where Go refused (§46 — silent wrong output on the
canonical side, and order-dependent, which should not be true of a
commutative language), and a conjunct of unequal-length lists pathed its
finding at the list in TypeScript and at the element in Go (§47).
**Both are now FIXED (2026-08-28)**, along with an unreported `MapVal`
instance of §47 found by looking for the twin once the list cause was
understood. §46 is pinned by six more rows in `spread-list.tsv`; §47 and
its map twin by `test/spec/container-path.tsv`.

The structural reason both gates missed it is worth recording against
protocol rule 5, and **it is still open**: the shared suite pins error
codes and message substrings, but almost never the path. Both ports
emitted `no_scalar_unify` here, so every gate agreed while the paths
differed. The §44 rows demonstrate it from the inside — reverting the
fix leaves `spread-list-elem-path-code` passing while the four path rows
fail. The path is the field G7's machine surface hands to agents, and it
is the least-asserted thing in the report.

**The count this paragraph carried was wrong** — "of 7,679 `err` rows,
15 include a `$.` path" — and neither figure reproduces. Measured
directly, at the commit before this one there were **252 `err` rows, 20
of which assert a path**, against 615 `errc` rows asserting a code
alone, in 3,495 shared rows total:

```
grep -hP '\terr\t'  test/spec/*.tsv | wc -l                 # 252
grep -hP '\terr\t'  test/spec/*.tsv | grep -c 'at path \$'  # 20
```

§46, §47 and §48 all lived in that gap. Fixing them takes it to **261
`err` rows, 24 of which assert a path**, plus **three new `vet` rows**
that assert one exactly (see below for why those could not be `err`
rows). The ratio is still the exposure: 27 rows in the whole suite check
where a finding points.

**And the `err` mode has a second blind spot, found writing §47's
rows.** `err` matches its expectation as a SUBSTRING, and a container's
path is a PREFIX of every member path beneath it — `at path $.a` is
contained in `at path $.a.2`. An `err` row asserting a container's own
path therefore passes against the exact answer it forbids, and the rest
of the message is byte-identical between the two, so nothing else in it
discriminates. §47's rows are `vet` rows for that reason: a `vet` row
compares the finding object field by field, where `path` is matched
exactly. **Any future path row whose wrong answer EXTENDS the right one
has to be a `vet` row** — protocol rule 5's counting is necessary but
not sufficient, because a row can assert a path and still be vacuous.

## G2 — the validation verb

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **1** — error taxonomy groundwork | M | **LANDED** | `test/spec/errcodes.tsv` (64 registered codes with class and since-version at this phase's own landing; the registry has grown with every phase since — 100 as of this register's last update — with its set-equality against both engines asserted by both runners); new spec modes `errc` and `errcode`; `class` on `NilVal` (`ts/src/val/NilVal.ts`, `go/val.go`); registry set-equality asserted by both runners (`ts/test/spec.test.ts` `spec-errcodes-registry`, `go/spec_test.go` `TestErrCodesRegistry`). Commit `98fc1bf`. |
| **2** — vet engine API | M | **LANDED** | `ts/src/vet.ts` and its Go twin `go/vet.go`, exported from `ts/src/aontu.ts` and as `aontu.Vet`: anchor selection (`at`, `closed`), data parsed with the full grammar, unify-with-collect, the residue walk, finding construction with roles by provenance, vet-side sorting, `maxErrors`/`truncated`, and the four verdicts. `test/spec/vet.tsv` — 42 rows at landing, executed by BOTH runners; `ts/test/vet.test.ts` (36 cases) and `go/vet_test.go` (35) hold the per-port API around them. **The PARTIAL that stood here had one cause and phase 4 removed it:** both runners execute every row of every `test/spec/*.tsv` with no skip list, so a `vet` row could not execute until both ports had the verb. The rows were promoted from `test/spec/draft/vet.tsv` with every golden regenerated from the canonical engine and then run against the port. **Departures from the design:** (1) the encoding is FIVE columns — name, mode, schema, data, expect — because vet takes two documents and no separator inside one cell is safe; both runners already tolerated extra columns, so the arm is additive. (2) `message` is excluded from the goldens and asserted per port, because prose is deliberately not in cross-port parity. (3) Options (`at`, `closed`, `partial`, `maxErrors`) have no column: they ride an `opts` key in the expect object. Flagged in the draft as the one unprobed piece of the encoding, it survived the probe unchanged. (4) findings that never reach the tree are collected from the context too — a parent that collapses to a nil takes its subtree with it, so `close({…})` meeting a typo AND a kind conflict left one nil standing and reported the other only on `ctx.err`. The verb's own motivating example was reporting half of what it found. (5) A conflict inside a `&:` template reports the TEMPLATE's path, not the instance's. Both ports now agree on that (they did not at first — see phase 4), and the data site still points at the offending value; naming the instance path remains a report-layer improvement nobody has taken. (6) The finding object ships `expected`, `actual` and `note` but NOT the design's `alternatives`, `allowed` and `nearest`. Each needs something the engine does not hand over yet — the member canons of a failed disjunction without going through the fold defect, the closed bag's key set at the point of refusal, and an edit-distance suggestion over it — and none of the three changes the report's SHAPE when it lands, which is why the omission is a gap rather than a departure from the contract. **2026-08-27, ADR-007 (use-cases/REVIEW.md finding C):** vet and one-document evaluation used to return OPPOSITE verdicts for identical compositions, which for the verb whose identity is "the gate agents are validated against" is the difference between a guardrail and a decoration. Three causes, all closed. (a) Generation FOLDED an unresolved disjunction's members together with unify, so a missing required enum field -- the commonest schema idiom there is -- arrived as a scalar CONFLICT between the enum's own branches and was filtered out by the incomplete-class pass: `verdict: valid`, zero findings. It is now `disjunct_no_gen`, class incomplete. (b) The step-1 standalone pass, which decides whether the schema stands up before the data is blamed for it, was ALSO serving as the left side of the meet -- so every reference in the schema had already resolved against the schema's own values and been replaced by them. The meet is now built from a FRESH PARSE (except under `--at`, where the anchor is a subtree whose absolute references have no root once lifted; pinned by vet-at-absolute-ref-*). The sharpest consequence is on the WRITE path: `aontu set` takes vet's verdict, so it used to accept writes its own `must()` audits refuse and catch them only post-hoc in the assembled view. (c) The residue check GENERATES the anchored meet, and generation honours the output marks, so a `--at` anchor under a `type()` checked nothing; the probe now descends through them (`Ctx.probe` / `AontuContext.probe`). Two adjacent defects went with it: the disjunct dedup compared object IDENTITY, leaving `{"a":2}|{"a":2}` past it, and a narrowed disjunction arrived UNSITED, so a finding naming one pointed at row -1 with no file (finding F, in part). Departure (6) above is partly answered: the member canons of a failed disjunction are now reachable without going through the fold. New rows: vet-enum-missing-is-incomplete (+2 controls), vet-at-marked-anchor-* (3), vet-at-absolute-ref-* (2), vet-closed-list-* (2), vet-junction-site. **2026-08-27, the diagnostics an agent repairs from (use-cases/REVIEW.md finding F).** One invariant and three companions. (a) EVERY SITE NAMES THE FILE WHOSE TEXT IT EXCERPTS: the provenance walk OVERWROTE every value's url with the entry document's name and left the coordinates alone, so a finding cited `entry.aon:3:7` for text living three files away, at a line the entry may not even have -- *a repair agent that follows the site edits the wrong file* (BUGS.md §25). Only values carrying no name of their own are stamped now (the ones the engine minted rather than read), the urls actually seen are collected so roles stay a SET-MEMBERSHIP question rather than a name comparison, and a site whose file the run holds no text for reports -1:-1 instead of resolving its offset against the wrong document. Go's loader gained the per-document text map that makes the second half possible (`Aontu.IncludeText`, `aonProcessor`/`stampResolved` in go/source.go), which CLOSES divergent.tsv #66 -- the ledger entry is marked so, and its own fixture is now byte-identical from both ports. The resolved absolute path is the right IDENTITY and the wrong NAME, so a site prints the file as the entry's own spelling reaches it (`displayFile`, both ports): `vet contract.aon` names `types.aon`, `vet a/b/contract.aon` names `a/b/types.aon`, an absolute entry keeps absolute includes -- which is what keeps a SARIF upload repo-relative rather than naming the build machine's home directory. One more site defect went with it, the "junction values at -1:-1" half of the same finding: Go's clone rebuilt a disjunction as a fresh value carrying the url and the source text but not the POSITION, so an enum declared once and named by `$.Role` -- the commonest schema shape there is -- reported its `|:empty` at row -1 where TypeScript reported it at the enum (`clonePathRec` now carries the whole site; row vet-refd-disjunct-site). (b) A finding carries `hint`: the whole shared hint text with its placeholders filled in, for every code that has one -- the `0d` escape that repairs a lossy integer literal reached a terminal reader in the frames and a machine reader nowhere. A parity carve-out like `message`, for the same reason and pinned the same way. (c) `relations` and `trim` answered an unusable document with `verdict: error` and an EMPTY list; both now carry `errors` in this finding shape, present only on that verdict (rows trim-broken-error, trim-unparseable-error, broken-document-is-not-blamed-on-relations). (d) COLOUR IS A DECISION ABOUT THE DESTINATION: `NO_COLOR` in the library, the stderr terminal test in the command, and an unconditional off under `--jsonl`. New per-port cases: a-site-names-the-file-its-text-lives-in, an-included-data-file-is-still-data, a-finding-carries-the-repair-hint, a-code-with-no-hint-text-carries-no-hint, color-is-gated-by-no-color-and-the-caller, with Go twins plus TestColorForDestination and TestRunGatesColor. **2026-08-27, the last two of finding C's five (use-cases/BUGS.md 16 and 17).** "Sizing atoms fold last" turned out to be only half the rule: sorting `length`/`unique`/`must` to the end of their conjunct does not help when the container settles in ONE document and still gains members from another -- the data half of a vet meet, an `@` include, a later `pack`. For the ubiquitous template-plus-bound spelling the atom counted the template's EMPTY container, discharged itself as satisfied and VANISHED, so three entries vetted clean against `length(max(2))`, duplicate labels passed `unique()`, and `length(min(1))` refused the schema it was written for. A verdict is now taken only when MORE MEMBERS CANNOT CHANGE IT -- members accumulate under unification and are never removed -- so an upper bound violated, a lower bound satisfied and a duplicate found are decided at once and everything else RESIDUATES, decided at generation where nothing more can arrive. A `must` over a container residuates with them, which is what makes the cross-field map-argument form (the form cross-field rules need) work across the meet. **Departures, three.** (1) A residuated atom is VISIBLE IN CANON -- the value really does still carry the constraint, and 3 canon rows plus 1 jsonschema row were re-derived to say so. (2) The residue is DONE, not pending: it is a settled container plus a note, and a residue reporting itself unresolved left every enclosing value unresolved with it (a `type()` waiting on its argument for ever). (3) Three surfaces had to learn the shape -- `BagVal.gen` and `emittedMembers` count it as a member, `ConjunctVal.gen` settles it finally, `anchorAt` steps through it to its container -- because a residue IS its container everywhere except in what it still demands. **And the other engine cause the review named:** vet's generation probe kept the `incomplete` class alone, so a conflict raised at generation was dropped and the verdict stayed `valid`. The vet-equals-eval harness caught that the moment the first fix landed, which is what it is for. New rows: vet-sizing-* (4) and vet-must-over-a-container-* (2) in vet.tsv; four use-case gap pins flipped from pinning the defect to pinning the fix. |
| **3** — CLI verb and JSON format | M | **LANDED** | `aontu vet <schema> <data> [more-data...]` in `ts/src/cli.ts` and `go/cmd/aontu/vet.go`: subcommand dispatch (first argument only, so a file argument is never shadowed), `--at`, `--closed`, `--partial`, `--max-errors`, `--format text|json`, and verdict exit classes 0/1/2/3/4. Each data file is vetted separately and the worst verdict wins. 16 cases in `ts/test/cli.test.ts`, 15 in `go/cmd/aontu/vet_test.go`; `docs/reference-api.md` "`aontu vet`" and `docs/how-to.md` carry the verb. The two CLIs were diffed on ~90 schema/data pairs and produce BYTE-IDENTICAL reports, text and JSON, exit codes included — everything but the `version` field, whose two series are independent by design, and the host's own wording for an unreadable file. **Departures from the design:** (1) the text renderer does NOT reuse `descErr`. `descErr` renders NilVals with ANSI colour through the TypeScript-only error path, while the report is a plain projection the Go port has to match byte for byte. (2) JSON field order is `exactJSON`'s lexicographic order, not the design's illustrative order, because that is the emitter already held to byte parity with Go — which is why the Go structs declare their fields in sorted order. (3) `--surplus` and `--watch` are not here: the first has no engine support yet and the second is phase 5. |
| **4** — Go port | L | **LANDED** | `go/vet.go` (the engine), `go/walk.go` (one traversal for Check and vet, the twin of `ts/src/walk.ts`, with provenance stamping), `go/cmd/aontu/vet.go` (the verb). No `go/report.go`: the renderers live beside the command, as they do in `ts/src/cli.ts`, and the report types are the engine's exported API. The port is what made `test/spec/vet.tsv` executable. **What the port cost the ENGINE, and why that is the interesting part.** Byte parity was the acceptance test, and it exposed nine pre-existing divergences no shared row had reached — every one fixed rather than recorded: (1) `rowCol` counted BYTES where the canonical port counts UTF-16 code units, so every column after a multi-byte character was late, in messages and in the LSP-adjacent surface alike; (2) an error frame printed the two lines AFTER the mistake and none of the two before, so every message about row 2 or later differed from TypeScript's; (3) a closed bag RETURNED at its first surplus key instead of recording it and unifying the rest, which is exactly the motivating example above — half the report, from the engine rather than from vet; (4) the disjunct fold dropped the path, so a junction that survived one evaluation and met its peer in a later one (what vet does) reported at the root; (5) junctions were sited at their first member where TypeScript sites them nowhere, so an unsited operand claimed row 1 column 1; (6) a preference's synthesised type yardstick was unplaced, pointing at the start of the document; (7) the operand flip compared positions across the two documents, which are offsets into different texts — fixed by giving every value a source identity (`base.surl`, `srcid`), the same thing TypeScript spells as a site url; (8) a constraint residual dropped that identity, so a data value the schema refined was reported as belonging to neither document; (9) generation under COLLECT recorded nothing — not the bag's first non-generable child, not a root residue — where TypeScript records the reason and carries on, which is the whole point of the mode and the half of the report the incomplete verdict is built from. The first two are now pinned by a twin pair over a multi-row, non-ASCII source (`TestFullMessageTwinFramed`, `full-message-twin-framed`); the one-line twin that stood before could not see either. Two more were fixed in the canonical port: `vet` THREW on a failure with no operands (a lossy integer literal in the data crashed the verb), and half of every report carried an empty `message` because the text is materialised only on the throwing path. **Not fixed here, and now understood:** issue #63's frame ordering is the same operand-flip family — Go marks clone-minted values where TypeScript marks values the parser did NOT site, which is a different set. Dropping the clone mark alone fixes #63 with both suites green; doing it properly means marking parse-sited values instead, and that is its own change. |
| **5** — SARIF, Action, watch | S | **LANDED** | SARIF: `ts/src/report-sarif.ts` + `go/report_sarif.go` — LIBRARY API in both ports (`sarifReport`/`aontu.SarifReport`), a minimal 2.1.0 profile (one run, one result per finding, data site primary, schema sites related, the native finding embedded in `properties`), byte-identical across ports over the shared golden `test/spec/files/vet-sarif/` with `message` text and `tool.driver.version` redacted — the same carve-outs `vet.tsv` and the JSON report already make. `--format sarif` in both CLIs. Watch: `--watch` in both CLIs, polling mtime+size (`watchChange`/`watchWait`), one full re-run per change, an unreadable mid-save file reports and keeps watching; the waiter is injectable, which is what makes the loop testable to the ADR-002 floor. **Departure:** the Action ships IN THIS REPOSITORY as the composite `vet-action/` (usable as `rjrodger/aontu/vet-action@<ref>`), not as the separate `aontu-vet-action` repo the design named — it versions in lock-step with the CLI it runs, and G2's doc now says so. `docs/how-to.md` carries the CI recipe and the pre-commit hook. |
| **6** — multi-error collection | L | **LANDED** | The single-error exit is GONE from both pass loops (`ts/src/unify.ts`, `go/unify.go`): the fixpoint continues past an erroring pass, so failures only a later pass can reach are collected in the same run. `test/spec/vet.tsv` `multi-*` rows (42 → 46), executed by both runners: a second-pass conflict now reports as a real two-site conflict where it used to surface as a vague unsited incompleteness; independent conflicts each report; fan-in and cycles collapse to ONE finding. **Two departures from the design.** (1) No nil-localisation surgery was needed: the design scoped this L and sketched "localise `nil` to its subtree" as new engine machinery, but the existing absorption discipline (unite's isNil arms return the existing nil, raising nothing) already IS the localisation — one failure stays one NilVal through every later meet, which the adversarial probe corpus (fan-in refs, spread templates, disjunct trials, nested conjuncts, prefs, `must`) confirmed against both engines before the rows were written. (2) The report dedup key is **(code, sites)**, not the design's (code, path): a reference resolves by CLONING its target, so one failed target can fail once per referrer with a DIFFERENT path each time — the paths are exactly what differ, so keying on them cannot collapse the family; keying on the meet's source positions does, and also fixed a pre-existing double report (a pure cycle reported at two of its three members even under the single-pass loop; `multi-cycle-one-finding` pins the collapse). One behaviour change outside vet: a cycle's members now absorb the one cycle nil instead of surviving as references, so the LSP hover for such a member is gone (the diagnostics still carry the cycle) — `hover-kind-labels` now pins the `reference` label with a budget-stalled chain instead. `truncated` now means only the `--max-errors` cap. |

**What the phase-4 review round changed, and why it is recorded here.**
An automated review of the port's pull request raised six findings; all
six reproduced, and fixing them moved contracts, so the register carries
them rather than the pull request alone. (1) `vet` resolved a relative
`@"file"` load against the process working directory, so a modular
schema vetted from anywhere else came back `error` — and, worse,
silently read a same-named file that happened to sit in the working
directory. The engine still reads no file itself; the CALLER now passes
each document's path (`schemaPath`/`dataPath`), and the two documents
get their own bases because they need not share a directory. (2) A data
document that would not parse was reported as a broken SCHEMA (exit 4),
which the engine already contradicted one character away — a refused
construct reaches the tree as an ordinary nil and is reported as
invalid data. It is now `invalid` with a `parse`-class finding, and
exit 4 means only "the run cannot be set up from the schema side". (3)
`--max-errors` capped each data file separately and the CLI then
concatenated the lists, so the cap scaled with the number of files and
`truncated` could stay false while the report exceeded it; the cap is
now applied to the aggregate. (4) The two CLIs accepted different
spellings of `--max-errors` (`1.0`, `1e2`, `0x10` and ` 3` in
TypeScript; a saturating twenty-digit value in Go); both now take one
to nine decimal digits and nothing else. (5) `--at` read the anchor off
whatever a value's `peg` held, so it walked into a junction's branches
(narrowing the truth to one alternative and failing a conforming
document), into a constraint's own arguments, and into an array's
`length` — that last handing back a JavaScript number as the anchor,
after which EVERY document validated. The anchor is now a structural
path in both ports, and a list index must be canonical decimal, which
is what a reference already required — the same tightening applied to
`RefVal` in Go, where `$.a.01` had resolved while TypeScript refused
it. (6) Both spec runners silently skipped a row with too few columns;
they now fail loudly, naming the file and line, and so does the
registry loader. Two divergences the review's own line of questioning
exposed are NOT fixed here and carry issues instead: the `file` of a
site whose value came from an included schema file (#66), and the
`-0` path segment (#67). The round's own fixes then left three arms
nothing executed — the aggregate cap of (3), and, in Go, the
per-document base of (1) and the fallback for a value belonging to
neither document — and ADR-002 caught all three. Each is now closed by
a test rather than an exclusion, and the third by a shared row
(`vet-unstamped-operand`): an unknown var meets `top`, which no parser
sited, and BOTH ports leave its site's `file` empty rather than
borrowing a document name, so the emptiness is now contractual.

**A later round closed the report's two blind spots**, both raised by
the 2026-08-21 status report's repair-loop walkthrough
([status-2026-08-21.md](status-2026-08-21.md) §5) and both fixed in
both ports. (1) The `error` verdict carried NO finding: a schema that
did not stand up answered `findings: []` with exit 4, so a caller was
told the truth was unusable and never what or where — while
`aontu <schema>` rendered the same fault in full. Two causes, and the
second is the interesting one: vet threw the collected failure away,
and the provenance walk stopped AT a nil, so even once the failure
travelled, its operands named no file. Both walks now descend into a
nil's `primary`/`secondary` (`ts/src/walk.ts`, `go/walk.go`) — safe
because every nil COLLECTOR prunes at the nil and never reaches the
new arm, and the stamping visitor is the only one that does not prune.
Go was two verdicts short besides: an unparseable schema and a merge
marker in a schema both returned bare, where the canonical port
reported. Four rows pin it (`vet-schema-error`, `-error-nested`,
`-unparseable`, `-merge-conflict`), plus unit tests in both ports; the
overlay verb inherits the finding through vet
(`patch-entry-unparseable`). (2) A parse failure lost its POSITION on
the machine-readable path — `row: -1, col: -1` for a fault the human
renderer drew a caret under. The parser knew all along; the rendered
message held the only copy. Both ports now put it on the site
(`ts/src/lang.ts`, `go/lang.go`), and `go/val.go`'s `AontuError`
carries `Row`/`Col` for the syntax failure as it already did for the
merge marker.

**A sixth verdict flip, and where the row that should have caught it
went wrong.** The rule refusing a quantifier on `^` or `$` — nothing
to repeat, a syntax error under JavaScript's `u` flag and an accepted
assertion under RE2 — shipped covering the two ANCHORS only, on a
comment asserting that `\b` and `\B` "quantify identically in both".
Measured, they do not: `re("\\b{1}x")` was `constraint_pattern` in
TypeScript and an accepted schema in Go. All four assertions now take
the same rule (ADR-003: the refusal is Aontu's, in the normaliser,
before either engine compiles). Raised by the automated review on
PR #72.

The row named `re-quantified-boundary-ok` was supposed to pin exactly
this, and it passed the whole time — because its source cell has ONE
backslash, which in a string is the escape for a BACKSPACE, where a
regex needs two to mean a word boundary. So it tested a quantified
backspace under a name that claimed otherwise. It is renamed for what
it tests, the boundary rows it was standing in for are added, and the
trap is now written into `constraint-re.tsv`'s own comment: a row
about an escape must say which layer it is escaping at, because the
mistake is invisible in a green suite.

**And the gates that had never run.** Making the Go CI matrix real
(`runs-on` was hardcoded to ubuntu while the matrix named three
platforms) and adding a coverage job turned two dormant gates on; both
failed on their first real run, and each failure was a defect that had
been sitting behind the gate rather than a flake.

The Go port had never been tested on Windows, and fifteen tests failed
there at once: every one interpolated a native path into Aontu SOURCE,
where a backslash is a string ESCAPE, so `C:\Users\RUNNER~1\…\root`
reached the resolver as `C:UsersRUNNER~1…oot` — `\r` arriving as a
literal carriage return. **The canonical port has guarded this since it
was written** (`sp` in `ts/test/trust.test.ts`, with a comment naming
the exact failure) and the twin `go/trust_test.go` never got it. That
is the ADR-001 parity discipline failing in the one place it is not
mechanised: the shared spec pins BEHAVIOUR, and a guard that lives in a
test harness is not behaviour. The Go helper is deliberately an
unconditional replace rather than `filepath.ToSlash`, because ToSlash
is a no-op wherever the separator is already `/` — a fix only
exercisable on the platform nobody can run is a fix shipped blind.

The coverage gate failed for an unrelated reason and a more interesting
one: `go tool cover` moved where an if-body's block begins between
releases, and `covmerge` matched a `//coverage:ignore` against its own
line alone, so forty-two justified exclusions stopped applying on a
toolchain newer than any contributor's. The marker now covers the whole
statement it sits on — what `ignore-block` always did — and
`go/scripts/covmerge/main_test.go` asserts both block spellings, so the
gate cannot pass merely because of which Go is installed.

A third defect fell out of fixing them, caught by neither job:
`uriToPath` mishandled the standards-shaped Windows file uri
(`file:///C:/…` → `/C:/…`), so the LSP's workspace-root confinement
compared real paths against nonsense. **Both ports carried it
identically** and both ports' tests hid it the same way, by building
`'file://' + path` — two slashes, which no editor sends. Fixed in both,
with the tests rewritten to send what a client actually sends.

Pulling on that one found three more divergences in the same eight
lines, each of which decided a confinement: a malformed percent-escape
THREW in TypeScript where Go swallowed it; a well-formed escape naming
a raw byte (`%FF` — a legal Linux filename, and something a JavaScript
string cannot hold) decoded in Go and not in TypeScript, so the two
derived DIFFERENT workspace roots for a uri neovim really sends; and
`file://` alone yielded `''`, which is not nullish and so survived
TypeScript's `??` chain to become a confinement root of `''` resolved
against the process working directory. All nineteen uri shapes now
agree between the ports. Next to them, one more: the Go port decoded
the whole `initialize` params into typed fields, so a single
wrong-typed value (`"rootUri": 42`) failed the unmarshal and left the
session UNCONFINED — failing open, where the canonical port's per-field
`typeof` guards cost it only that field.

**None of these were reachable from the shared spec**, which is the
observation worth keeping: `test/spec/*.tsv` pins what the ENGINE
computes, and every defect in this round lived in a harness, a build
tool, a CLI aggregation or a transport adapter. ADR-001 parity is
mechanised exactly where the spec reaches and nowhere else, and the
places it does not reach are where the two ports drifted.

**And a dead branch the two-port discipline caught.** Removing the
empty-finding return left a guard whose condition the branch above
makes impossible. TypeScript's line coverage called it COVERED — the
`const`, the `if`, the `return` and the closing brace all read the
same hit count in the lcov — and appending to a file from inside the
branch proved the `return` never executed in the whole suite. The Go
gate, which counts coverage BLOCKS, refused the twin as three
uncovered blocks. Both guards are gone. It is the second-order
argument for ADR-001 that no design document makes: the ports are held
to each other for BEHAVIOUR, and the by-product is that each one's
instruments check the other's. Recorded in
[`docs/test-coverage.md`](../test-coverage.md).

**Phase 1 landed without touching `ts/src/err.ts`**, which its
deliverable list names. Nothing was needed: the `[aontu/<code>]`
message marker predates the review and is pinned by
`error.tsv:errm-marker-headline`.

**An open question the landed code answered.** The doc lists "registry
source of truth" (whether `hints.ts` generates `errcodes.tsv` or the
reverse) as undecided. Neither generator was built:
`test/spec/errcodes.tsv` declares itself the source of truth, both
engines keep hand-maintained `codeClasses` tables, and the runners
assert set equality in both directions. That is the decision, and the
doc records it, struck through in its open-questions list.

## G3 — subsumption as a query; schema evolution

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **0** — rules on paper | M | **LANDED** | `docs/reference-language.md` "Subsumption": the per-former table (all three profiles, with the `*` × `close()` × `&:` × `?` interaction cells), sitting above the constraint algebra's own subsumption table, whose "not yet implemented" note is gone. `test/spec/subsume.tsv` — 97 rows at landing, executed by BOTH runners, covering every probe in the design's Problem section (the v1/v2 `service` break included) and every `undecided` reason. **Departure:** the design named six columns (name, profile, general, specific, verdict, detail); the encoding is instead vet.tsv's exactly — FIVE columns with the report as an expect object, `message` excluded, options (`profile`, `at`) riding the `opts` key — because the two-document shape and its probed carve-outs are the same, and a second five-column precedent beats a third encoding. |
| **1** — the recursion, TypeScript | L | **LANDED** | `ts/src/subsume.ts`: a dedicated structural walk over evaluated trees (design option B) — never mutates, no fixpoint, three-valued verdict plus `error`; findings reuse G2's object with class `compat`; the nine codes (`compat_narrowed`, `compat_required_added`, `compat_default_changed`, `compat_marks_changed`, five `sub_*` undecided reasons) registered in `test/spec/errcodes.tsv` under the new `compat` class. Constraint rules live beside the compare machinery they reuse (`ts/src/val/ConstraintVal.ts` `constraintSubsumesConstraint`, `constraintAdmitsScalar`). Exported from `ts/src/aontu.ts`. **Departures:** (1) no `rankPrefs` helper existed to reuse — effective-default extraction is the walk's own, and the first draft picked the HIGHEST rank where generation picks the LOWEST (`a:**1|*2` generates `2`, `edge.tsv`); the parity corpus caught it before landing and `default-rank-mixed` pins the direction. (2) The constraint table's `must` row says "never"; the query answers `undecided` (`sub_evaluate_only`) — honest indecision, recorded in the reference. (3) No nil rule: an error-free evaluated tree carries no nil, so the walk's no-rule fold answers a hypothetical one `undecided`, pinned by direct tests in both ports rather than rows no source can produce. |
| **2** — Go port | L | **LANDED** | `go/subsume.go`, mirroring the dispatch; `go/constraint.go` `constraintStateSubsumes`/`constraintAdmitsScalarQ`; both runners execute every `subsume.tsv` row with no skip list, expectations parity-probed (byte-identical reports, message text excluded) before any row was written. **What the probe cost the engine** (the G2 phase-4 pattern, two more pre-existing divergences fixed rather than recorded): (1) a preference was sited at its inner value where TypeScript sites it at the `*` itself (`go/lang.go` star-prefix); (2) `hasPathFunc` did not see through a `ConstraintVal` — a pending atom endpoint holding `min($.floor)`, a `must` value, the recursive count — so a path-dependent spread template compared structurally instead of refusing (`go/mapval.go`). |
| **3** — CLI verbs (`subsume`, `breaking`) | M | **LANDED** | `aontu subsume [--profile] [--at] [--format text\|json]` and `aontu breaking --against <file\|git#rev> [--mode backward\|forward\|full] [--allow-undecided]` in `ts/src/cli.ts` and `go/cmd/aontu/subsume.go`: exit classes 0/1/3/4/2 mirroring vet's convention (undecided FAILS by default), `git#rev` by shelling out to `git show <rev>:./<basename>` from the file's own directory, the `$.aontu_policy.compat` declaration read from the new document with `--mode` overriding (reader: `policyCompat` beside the TS verb, exported `aontu.PolicyCompat` in Go — the verb package cannot reach the tree's fields), findings through G2's renderer. `SubsumeOptions` gained `generalPath`/`specificPath` (vet's per-document base precedent) so relative `@"file"` loads resolve from each document's own directory. 11 cases in `ts/test/cli.test.ts`, 12 in `go/cmd/aontu/subsume_test.go`; the two CLIs diffed byte-identical (text and JSON, exit codes included) over a 24-case corpus — the version field and the host's unreadable-file wording excepted, G2 phase 3's same carve-outs. `docs/reference-api.md` and `docs/how-to.md` carry the verbs. **Departures:** (1) no `--allow-deprecated-removal`: it gates on `deprecate()`, which is phase 4 — the flag lands there rather than parsing as a no-op lie here. (2) No SARIF format: the SARIF profile is vet's report shape (`truncated`, data/schema roles); mapping compat findings is real design work nothing needs yet. (3) A `git#rev` source's relative includes resolve from the working file's directory (the revision has no directory of its own). **2026-08-27, the evolution gate stops failing its own idioms (use-cases/REVIEW.md finding D).** Four changes. (a) REFLEXIVITY IS A LAW of the walk: every value admits itself, residue included, so a constraint inside a spread template no longer makes a contract non-SELF-subsumable -- which had forced `--allow-undecided` on the documented close-per-entry idiom, masking the genuine undecideds the gate exists to surface (BUGS.md §28). Identity is the HASH FORM, on the sub_unresolved branch only. (b) A PREFERRED BRANCH CONTRIBUTES EXACTLY ITS OWN VALUE: the walk still compared a pref MEMBER by its kind superior, the pre-ADR-004 reading, so a disjunction with a default did not subsume itself (§29); two rows sharpen from undecided to does_not_subsume, because a pref member admitting its own value makes the counterexample CONCRETE. (c) The gen profile's mark rule fired inside DISTRIBUTION TRIALS, comparing a whole marked disjunction against a member extracted out of one -- not corresponding nodes; it is now scoped to the correspondence walk, with hide-added-still-refused as the control. (d) Departure (3) above is retired and `breaking` gains `--at`: a `git#rev` spelling now materialises the old TREE (BUGS.md §26, with the repo-relative path taken from `git rev-parse --show-prefix` so macOS's /private/var and Windows' short names cannot skew it), and `--at` compares a SUBTREE of both versions, because a module's top level carries the version string and policy block that are supposed to change between releases. New rows: self-spread-residue(-closed), self-hide-pref-disjunct, self-policy-idiom, hide-added-still-refused. |
| **4** — `deprecate()` | M | **LANDED** | The twenty-second builtin: `deprecate(x, m)` in both ports (`ts/src/val/DeprecateFuncVal.ts`; the resolve arm in `go/func.go`), unification-transparent — the record (keys msg/use/since, all optional strings; other keys DROPPED) rides the Val (`Val.deprecation`, `base.deprec`) through every meet via a rider at the tail of `unite` (the one place all meets pass), through clones, reference resolution and spread application; canon renders the call back reparseably (`canonDeprecation`, wrapped at the bag renderers — since renamed `canonRiders` by G4.1, which the G4 section records). `test/spec/deprecate.tsv` — 22 rows at landing (canon round-trip and convergence, transparency, refs, spreads, the record vocabulary, arity, three vet rows), parity-probed. Point of use, three surfaces: a vet finding code `deprecated`, class `compat`, severity `warning` — registered in errcodes.tsv, and warnings never move the verdict; the LSP Deprecated tag (2) at Hint severity in both servers; and `breaking --allow-deprecated-removal`, which downgrades findings about values the `--against` version already deprecated (readers: `deprecatedAt` beside the TS verb, exported `aontu.DeprecatedAt`). **Departures:** (1) the design's "alongside the existing mark propagation" landed as a rider in `unite` instead: the boolean-mark sweeps are order-sensitive by construction, and a record lost in one meet shape is a use the tooling never warns about — the rider also makes a deprecated spread template deprecate every key it governs. (2) A first canon draft computed each child's canon twice (guard + render), which is 2^depth on a nested document — the budget suite's 1200-deep fixture caught it. (3) No `since` checking: free text until G6 defines module versions, as designed. |
| **5** — default-validity lint | S | **LANDED** | `pref_not_instance` (class compat, severity `warning`, registered in errcodes.tsv): vet walks the SCHEMA anchor for disjunctions carrying a preference and asks the subsumption recursion's own two questions — the effective default (`effectiveDefault` / `subEffectiveDefault`, exported for the lint) and whether some remaining alternative admits it (`subsumeNode`). Four parity-probed vet rows in `test/spec/subsume.tsv` (the design's own `*wran` example included); the shared `walkBagVals` walker now backs this, the deprecation walk and nothing else. The warning-to-error flip is documented as NOT taken (docs/reference-language.md, "Default validity"): today's engine generates the bad default, and promoting the warning is itself a breaking change, sequenced through the `breaking` gate. **2026-08-26, re-examined under ADR-004 (the preference admission gate):** the lint is now ADVISORY — a preferred branch contributes exactly its own value to the admitted set, so a default can no longer be invalid against its own disjunct; the finding marks a typo-shaped default instead, the message says "any *remaining* alternative", the effective default unwraps every pref layer (the ranked false positive is gone, `pref-lint-ranked-clean`), and the warning-to-error flip is off the table entirely (there is no error to promote to). Decision note: `ts/src/vet.ts`. |
| **6** — trim reporter | M | **LANDED** | `ts/src/trim.ts` (`trimCheck`, exported from `ts/src/aontu.ts`) and `go/trim.go` (`TrimCheck`): report REDUNDANT map entries — entries whose removal leaves the evaluated result unchanged, the spread-implied case included — as paths, with verdicts `clean`/`redundant`/`error`. The CLI verb `aontu trim --check [--format text\|json]` in both ports (`ts/src/cli.ts`, `go/cmd/aontu/trim.go`), exit classes 0/1/4/2; `--check` is REQUIRED — `aontu trim f.aon` reads as "trim this file", and doing something else silently is worse than refusing. `test/spec/trim.tsv` — 11 rows, parity-probed (the two engines diffed byte-identical over the corpus before any row was written), executed by BOTH runners as the ninth mode. `docs/reference-api.md` carries the verb and the export. **Departures:** (1) the test is EVALUATE-AND-COMPARE — re-parse, delete the entry from the parsed tree, evaluate, compare canons — which *subsumes* the design's "unifies against the spread template to top" test and is honest about everything the fixpoint sees (references, duplicate-key merges), where a structural test would guess; a removal that ERRORS is not redundant (load-bearing). (2) Candidates are map entries at every depth; list ELEMENTS are excluded — removing one shifts every later index, a different document rather than the same one minus a redundancy. A child of a redundant parent is skipped: the parent's removal already covers it. (3) Report-only, and rewriting is DEFERRED to G7 by design: canon discards comments and layout, so an editing trim needs G7's format-preserving patch surface — trim ships as a reporter here and becomes an editor there. |

**Two facts the doc asserts are no longer true.** `super()` is no
longer "degenerate and unpinned" — `ts/src/val/SuperFuncVal.ts` and
`go/func.go` resolve the *argument's* superior, pinned by rows in
`number-model.tsv`, `number-tower.tsv` and `edge.tsv`. That also
settles G3's fifth open question ("re-founding `super()`") in favour of
the kind-lift, though it was the number-tower work that settled it.
The kind-lift was then widened to the full immediate-parent-type rule
(2026-08-29, docs/design/SUPER.0.md, owner ruling): `super()` descends
into maps and lists, unwraps preferences, distributes over
disjunctions and reads a constraint's kind or domain — `top` only
where `top` is the immediate parent — pinned by `super.tsv` in both
ports, with recursion residuals held symbolic as the recorded phase
boundary.
And `PrefVal`'s single yardstick — `superpeg`, computed by
`resuper()` — is both the type it reports and the gate an overriding
peer must pass. It briefly carried a second, `familypeg`, added when
the tower made `integer` and `float` disjoint and removed on
2026-08-25 when §6 of the 2026-08-21 status report settled: the family
gate let `*8080 | integer` admit `3.5`, silently widening the
documented default idiom, and the two directions of that one rule
could not be separated. A `defaults`-profile subsumption rule must be
written against `superpeg` alone — and must account for the gate being
a SCALAR gate: a preferred map or list has `top` for a superior, so it
admits any peer at all (`pref-struct-*` in `test/spec/pref.tsv` pins
this; it predates the kind gate and was not changed by it). Since
2026-08-26 (ADR-004) two more facts sit beside that: `superpeg` is
computed from the INNERMOST peg, whatever the rank (the rank-uniform
meet), and inside a disjunction the kind gate is no longer the whole
story — the admission gate in `DisjunctVal` requires an override to be
admitted by an alternative or by the preferred value itself, so a
pref member's admitted contribution to a disjunction is exactly its
own value, not its kind.

## G4 — identity and typed relations

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **0** — semantics on paper | S | **LANDED** | The "Identity: `id(name)`" section of [`docs/reference-language.md`](../reference-language.md#identity-idname) — merge semantics, the name grammar, canon and the hash, the three clearing rules — plus `test/spec/id.tsv` (66 rows at landing) and the three codes in `errcodes.tsv`. The design's phase-0 also called for `test/spec/refer.tsv`; that ships with phase 2, which owns `refer()`. |
| **1** — `id()` | M | **LANDED** | `ts/src/val/IdFuncVal.ts` and the `"id"` arm of `go/func.go`; the `entity` slot on the carriers (`ts/src/val/Val.ts`, `go/val.go`) with the rider in `unite` in both ports; the registry on the unify root context (`ts/src/unify.ts` `entities`, `go/ctx.go`) and the per-pass `mergeEntities` walk (`go/identity.go`); canon through `canonRiders` (renamed from `canonDeprecation`, now rendering both riders) and the hash form through `hcanon`; clearing rules in `RefVal`/`CopyFuncVal` (TS) and `ref.go`/`func.go` via `walkClearEntity` (Go), and rule 3 at bag construction in both. `id` added to the arity tables, both LSP completion lists, and both published grammars. **Departures:** see below. |
| **2** — `refer()` | M | **LANDED** | `ts/src/val/ReferFuncVal.ts` (the `ReferFuncVal` call and the `ReferVal` residual it resolves to) and `go/refer.go`; the address grammar shared with the id grammar; the registry lookup, the constraint FLOW into the target and every position of its entity, and the last-pass existence decision; the residual added to `unite`'s driver list in both ports, and to the arity tables, both LSP completion lists and both published grammars (where `refer` must be listed BEFORE `re`, the name set being an ordered choice). **Correction:** the TypeScript completion list was in fact missed by both phases and repaired before G8 phase 1 — Go derives its list from the engine's own name set (`BuiltinFuncNames`), so only the hand-written TypeScript one could drift, and it did, for two builtins. Codes `refer_address` and `refer_unresolved` in `errcodes.tsv`. Spec: `test/spec/refer.tsv` (52 rows at landing). Docs: "Entity references" in [`docs/reference-language.md`](../reference-language.md#entity-references-refert). **Departures:** see below. |
| **3** — derived structures | S | **LANDED** | `ts/src/graph.ts` and `go/graph.go`: the ENTITY INDEX (id → every tree path that holds it) and the EDGE SET (one entry per checked link: the entity it sits inside, the relation key, the address, and where it is written). Exposed as `result.graph` and the pure `graphOf(val)` in TypeScript and as `Aontu.Graph` in Go — each port following its own `deps` precedent — and documented in [`docs/reference-api.md`](../reference-api.md). A seventeenth spec mode, `graph`, carries the goldens (`test/spec/graph.tsv`, 27 rows); both runners re-derive on a fresh engine and require the same bytes, so DETERMINISM is asserted as a property rather than claimed. **Departures:** see below. |
| **4** — `std/system` vocabulary | M | **LANDED** | `Port`, `Component`, `Service` and `Relation` as ordinary schemas, BUNDLED with the engine (`ts/src/std.ts`, `go/std.go` — the same bytes, pinned by `vocabulary-canon` and `vocabulary-hash` so the copies cannot drift) and served for `@"std/system"` from a leg ahead of the memory resolver in both ports, under every include capability but `none`. Manifest capability `std`; documented in [`docs/reference-language.md`](../reference-language.md#the-stdsystem-vocabulary), [`docs/reference-api.md`](../reference-api.md) and [`docs/trust.md`](../trust.md) (why a bundled source widens nothing). Spec: `test/spec/std-system.tsv` (23 rows), including the design's worked example and its graph. **Departures:** see below. |
| **5** — relation graph checks | L | **LANDED** | `ts/src/relation.ts` and `go/relation.go`: `relationCheck(src)` / `Aontu.RelationCheck(src)` run ACYCLICITY and INVERSE CONSISTENCY over the derived edge set, after unification and never by it. `aontu relations <file>` in both CLIs (`--format json`), exit classes 0/1/4 as `trim` has, text and JSON byte-identical between the ports. Codes `relation_cycle` and `relation_inverse_missing` in `errcodes.tsv`, class `conflict`, report-layer — no NilVal carries either. An eighteenth spec mode, `relation`, carries the goldens (`test/spec/relation.tsv`, 21 rows). Documented in [`docs/reference-language.md`](../reference-language.md#declared-relations) and [`docs/reference-api.md`](../reference-api.md). **Departures:** see below. |
| **6** — target enforcement, the refer fixpoint, and reachability | M | **LANDED 2026-08-27** | The review's finding J (use-cases/REVIEW.md): aontu is "a sound entity-and-edge substrate whose query and constraint layers over that substrate are one more capability review away", and the review named the slice -- "make `relations` enforce `target`, add `unique()`-by-projection, and ship a transitive `reaches(a, b)` check verb". `unique(k)` landed with G8 phase 5; here are the other two, plus the defect that made the first worth nothing. **THE REFER FIXPOINT** (use-cases/BUGS.md 19): `refer(t)` unifies `t` into the target, and uniting a target DRIVES the target's own subtree -- so a pair that links back at each other, the shape EVERY inverse relation has, flowed into each other until the depth budget or the host stack ended it, reporting `unify_cycle` on a meet that is a fixpoint on sight. Two lines were enough. A flow that would re-enter an entity is now skipped (the flow it is nested in is already uniting that entity), and the differs-each-way and cycle-of-three rows in `test/spec/refer.tsv` pin that nothing is lost. **TARGET** was read by nothing, on the reasoning phase 5 recorded -- `refer(t)` already flows the type in at the site -- which is exactly why the declaration was worth nothing: the site has to REPEAT it, and the idiom that avoids repeating it was the one that ate itself. Satisfaction is the meet AND NOT MERELY THE ABSENCE OF A CONFLICT: a target key the far end lacks unifies happily and leaves a hole, so the check asks what `refer(t)` answers at the site (can the far end still generate once the target is met?) and compares it with the far end ALONE, so a node already incomplete for its own reasons is not blamed on the relation pointing at it. New code `relation_target_unmet`; the check never writes, because flowing the type in here would be generation -- the same rule that keeps the verb from writing an author's `inverse`. **REACHABILITY** -- `aontu reaches <from> <to> [--relation <name>]`, a verb, a library call (`reachCheck` / `Aontu.Reach`) and an MCP tool in both ports (`ts/src/reach.ts`, `go/reach.go`). The closure question the edge-at-a-time checks cannot ask, and a verb for the reason acyclicity is one: reachability is global and non-monotone. The PATH is the answer -- a shortest one, and among shortest ones the first in code-point order, so it is the same path in both ports. TRANSITIVE, not reflexive-transitive: an entity reaches itself only through a cycle. **Departures, two.** (1) An endpoint that names no entity is a REFUSAL (`refer_unresolved`, with the known entities listed) rather than an `unreachable`: answering `no` would report a typo as a fact about the model. (2) The check verb's exit codes are the three every check verb here uses (0 held, 1 failed, 4 uncheckable), so an unreachable pair is a FAILED CHECK and not an error. **A CRITICAL DEFECT FOUND ON THE WAY AND NOT FIXED** (use-cases/BUGS.md 42, test/spec/divergent.tsv): on a two-view id-merged model Go's derived graph has 6 edges where TypeScript's has 40, so `relations` reports NO CYCLE in Go where TypeScript reports a real one. Not new -- the pre-change binary loses the same edges -- and unseen because `use-cases/run-all.sh` drives the TypeScript CLI. It did not minimise: every synthetic reduction agrees in both ports, so the reproduction is use case 01 itself, whose `check.sh` asserts the cycle and therefore FAILS under the Go CLI today rather than passing quietly. Spec: `test/spec/reach.tsv` (13 rows, a new shared mode), 12 target rows in `relation.tsv` and 5 in `refer.tsv`, every expectation obtained by running BOTH engines and diffing. |

**Departures recorded by G4.1.**

1. **The merge is COLLECT-then-APPLY — the same walk twice per pass,
   not one walk.**
   The design's "a position carrying an id unifies with the
   representative and updates it" reads as a single walk, and a single
   walk is wrong: it leaves every position it already passed holding
   the pre-merge value, so `a: id(x) & {k:1}` kept `{k:1}` while
   `b: id(x) & {j:2}` became `{j:2,k:1}` and the two sites disagreed
   about what the one entity is. The representative is settled over
   the whole tree before any position is written. One function with a
   `write` flag rather than two: the halves differ in three lines and
   agree in the walk, and a walk written twice is a walk that drifts.
2. **`id(key(0))`, not `id(key())`, is the per-child spread name.**
   The design sketched `&: id(svc- + key())`; there is no string `+`,
   and more importantly `key()` reads one level UP (`func.tsv`,
   `key-one`), so in a template applied at the child position it names
   the BAG and every child collides on that one name. `key(0)` is the
   child's own key. The collision case is a defined result rather than
   a refusal — rule 3 is a syntactic guard on CONSTANTS, and no
   parse-time check can know what a computed name resolves to — and is
   pinned as such (`spread-key-id-collides`).
3. **Rule 3's refusal makes the BAG the error, not only its children.**
   Placing the nil as the template alone would leave an empty bag with
   a bad template silently fine. The bag returns it, narrowed to this
   one code so a nil template from any other cause keeps its existing
   per-key behaviour.
4. **Marks reach every position of an entity.** `a: hide(id(x) & {k:1})`
   hides the entity, not just that declaration of it, because every
   position holds the one merged value. A consequence of the design's
   own "every declared position holds the merged value", surprising
   enough to pin (`merge-hide-covers-every-position`).
5. **Identity is a slot, not a mark, and canon renders it** — as the
   design says — which required `canonDeprecation` to become
   `canonRiders` in both ports, rendering identity inside the
   deprecation wrapper. The order only has to be FIXED (both wrappers
   are reparseable calls); this one matches the canon the G3 rows
   already pinned.
6. **The merge is PROVENANCE-VISIBLE, and aligning that moved the
   canonical implementation twice.** `why $.b.k`, where `b` picked `k`
   up from another declaration of the same entity, has to name the
   site that wrote it. Two long-standing structural differences
   between the ports surfaced the moment a merge brought a peer whose
   children the recorder counts as WRITTEN (a reference's clone's do
   not, which is why nothing had caught them): TypeScript CARRIED a
   peer-only key where Go unites it with TOP, and TypeScript's
   equal-pair fast path in `unite` returned before the recorder at the
   tail of the slow path where Go's recorder wraps the whole
   dispatcher. Both are now conditional on `ctx.prov` — instrumented
   runs take the meet, uninstrumented ones are untouched — and the
   four `why` rows in `id.tsv` pin the result.

**Departures recorded by G4.2.**

1. **Constraints written alongside a refer are HELD on the residual,
   not parked in a conjunct.** The design does not say where they go,
   and a conjunct is the obvious answer — but a conjunct rebuilt every
   pass grows a level every pass. The residual carries them and applies
   them to the LINK when the address arrives, which is what makes
   `refer() & string & "x"` the string and `refer() & "x" & "y"` a
   conflict; both are pinned.
2. **A value that can never BE a string is refused at once; a kind or
   constraint is not.** The design says only that the field is
   string-valued. A number, boolean, map or list conjoined with a refer
   cannot become an address in any later pass, so that arm refuses
   (`refer_address`) rather than deferring; `string`, `re(...)` and the
   like are perfectly good constraints on an address and are held.
3. **Existence is decided at the LAST pass, not at generation.** The
   design says "an error at generation, mirroring an unresolved
   reference". A generation-time refusal would arrive as the bag's
   generic `*_no_gen`, which names the map rather than the link. A
   pending refer keeps the tree not-done, so the pass loop always
   reaches the final pass; the refusal is made there, as a located nil
   naming the address. A `refer()` that never met an address at all is
   NOT that error: it is an ordinary unresolved constraint, like a bare
   `min(1)`.
4. **The residual has a clone hook but no path-dependence hook.**
   (Corrected by phase 3 — see its departure 3. The clone hook was
   briefly removed as dead and is not: a REFERENCE to a value holding
   a resolved link clones it.) The path-dependence hook is genuinely
   unnecessary: a spread template holds the FUNCTION, so `&: refer(t)`
   is cloned per destination as a `refer(...)` call and each clone
   mints its own residual there. A consequence worth knowing: a
   path-dependent flow TYPE in a spread (`&: refer({k:key()})`)
   resolves its `key()` per clone but the flows all land in the
   entities the addresses name, so two entities can receive the same
   computed type. Both ports agree byte-for-byte; the shape is pinned
   at `spread-path-dependent-template` and no more is claimed for it.
5. **A defect in G4.1's merge, found by G4.2.** The writing half
   substituted the representative AFTER its cycle guard.
   Two positions of one entity hold the SAME object once a pass has
   merged them, so the walk replaced the first and then skipped the
   second as already-seen — invisible until a `refer(t)` flow wrote a
   new representative mid-pass and only one position took it. The
   substitution now happens first and the guard bounds the descent
   only; `flow-reaches-every-position` is the regression row.

**Departures recorded by G4.3.**

1. **A link is STAMPED, not inferred.** The design says the edge set is
   "(source entity, relation key, target address) triples for every
   field whose key matches a declared relation" — but declared
   relations are phase 5's vocabulary, and a resolved `refer` answers
   a plain string that no walk could tell from a literal. The
   resolution stamps the address on the value it answers (`Val.link`,
   `base.link`), so the edge set is exactly the set of checked links
   and nothing has to guess. Phase 5 filters this set by declared
   relation; it does not have to rebuild it.
2. **A clone KEEPS the link, unlike the identity.** An identity says
   what a value IS, so a copy must not be that entity (clearing rules
   1 and 2). A link says what a value POINTS AT, and a copy of a link
   points at the same thing. It is also the only answer the two ports
   can agree on: a clone taken before the refer resolves carries a
   pending residual that resolves — and stamps — on its own.
3. **A defect in G4.2's residual, found by G4.3.** `ReferVal` had been
   left without a clone hook (a phase-2 departure said both ports had
   proved one dead). They had not: a REFERENCE to a value containing a
   resolved link (`s: $.z`) clones the residual, and without the hook
   TypeScript rebuilt it from the spec and lost the address — the
   clone came back a bare `refer()` — while Go fell through to sharing
   ONE residual between the reference and its target, so two positions
   that later constrained it differently would interfere. Both ports
   now clone it as an independent copy carrying its state; the
   phase-2 departure is corrected above.
4. **`from` and `key` are relative to the nearest identified
   ancestor**, which makes the entity/component distinction observable:
   a node without an id is a component of the entity above it, and a
   link inside a list is an edge under its relation rather than under
   its index. A link outside every entity has an empty `from`; a link
   that IS an entity has an empty `key`. Both are pinned.

**Departures recorded by G4.4.**

1. **No `Connection`.** The design's sketch has
   `Connection: type({from: refer($.std.Port), …})`, and it is not
   expressible today: `type(x)` resolves only once `x` is done, and a
   `refer()` with no address is deliberately NOT done — it exists to
   check an address and the pass loop must keep offering it the
   chance. Making it done as a constraint (like `string` or `min(1)`)
   does make the schema resolve, and was tried: it then lets the whole
   tree go done before an ADDRESSED refer has settled, so the pass loop
   exits and the link fails at generation with the bag's generic code
   instead of `refer_unresolved` — in Go but not TypeScript. A
   `Connection` needs the pass loop to know the difference between
   "this constraint is complete" and "this value is settled"; that is
   real engine work and it is not in this phase.
2. **`Service` is written out, not `$.std.Component & {kind:
   service}`.** A reference from one member of an INCLUDED file to
   another does not survive the include in TypeScript: the referring
   member comes back marked and silently stops generating. Inline, the
   same text works in both ports. Each schema therefore states itself,
   and `service-is-a-component-shape` pins that the two still meet.
   The underlying include/marks interaction is pre-existing and not
   G4's.
3. **`std` generates as an empty map.** The sketch wraps the block in
   `hide()`. Under `hide`, a func whose arguments are references
   FREEZES unresolved (the documented marked-func freeze), so every
   schema mentioning `$.std.Port` stops resolving. The members carry
   their own `type()` marks and so generate nothing; only the empty
   container remains.
4. **`target` is optional and a preferred member does not close a
   disjunction.** `target: top` as a required field can never generate
   — `top` is not concrete — so it is `target?: top`. And
   `direction: *in | out | inout` supplies a default while still
   admitting any string: closing the set costs the default. Both are
   the language rather than the vocabulary, both are pinned, and the
   reference documentation says so where an author will meet them.
5. **A defect in G4.2's flow, found here.** `refer(t)` unified `t` into
   its target WITH its marks, so `refer($.std.Service)` made the target
   a type() — and the target silently stopped generating. The flow is
   now cleared of type/hide marks, on a COPY (a `t` is shared by every
   position that refers to the same thing) and only when there are
   marks to clear, because cloning an unmarked type moved the site an
   error names.

**Departures recorded by G4.5.**

1. **A verb of its own, not a leg of `vet`.** The design says "the vet
   pass, delivered with G2's verb". `vet` answers "does this DOCUMENT
   satisfy that SCHEMA" and takes two documents; these are facts about
   ONE finished model, with no schema on the other side of the
   question. `aontu relations` is the shape `trim` already
   established for exactly that kind of check.
2. **Relations are read from the `relations` key of the document
   root.** The design shows them there and never says how the pass
   finds them. That is now the rule, and it is the VOCABULARY's
   convention rather than the engine's: nothing in the language knows
   the name, and the checking pass says so where it uses it.
3. **`target` is not checked here.** The design lists it beside
   `inverse` and `acyclic`, but a relation's target constraint is what
   `refer(t)` already flows into the addressed entity — checked by
   unification, at the site, with a located error. Re-checking it after
   the fact would answer the same question later and worse.
4. **An edge into a node INSIDE an entity is an edge to that entity.**
   `dependsOn: [&: refer(), "b.ports.p"]` is a dependency on `b`: a
   relation holds between entities, and the path inside one says which
   part of it the link reaches. Pinned, because it decides whether a
   cycle through ports is a cycle.
5. **One cycle per relation, not all of them.** A report that listed
   every cycle would list the same edges many times over; the walk
   visits its roots and successors in sorted order and stops at the
   first, so the cycle a report names is the same one in both ports and
   the next one appears when that one is fixed.

**The funcMap note, now answered.** The doc said the two new builtins
"join `funcMap`"; G1's atoms did not, routing through
`constraintAtoms` instead. `id()` takes the funcMap road — it is an
ordinary function that resolves to a value, not a residual constraint
— and, as the note required, added its entry to the arity tables in
both ports. The builtin roster is now twenty-four (`refer` took the same road in phase 2).

## G5 — a specified trust contract

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **1** — write the contract | S | **LANDED** | [`docs/trust.md`](../trust.md), four clauses (hermeticity, termination, determinism, sandboxing) with profiles and budget names; `docs/reference-api.md` single-use-tree rule; `AGENTS.md` points at it. Commit `98fc1bf`. |
| **2** — budget and cycle taxonomy | M | **LANDED** | `test/spec/budget.tsv` (24 rows) pinning `path_cycle`, `no_path`, `budget_passes`, `unify_cycle` as distinct; the `maxcc` false positive fixed by the per-pass memo with a 1200-sibling fixture as guard. Commits `98fc1bf`, `90f3146`. |
| **3** — trust profile and confinement, TypeScript | L | **LANDED** | `trust` on `AontuOptions` (`ts/src/type.ts`): include capability `'none' \| {mem} \| {root} \| 'system'` plus `budget.{passes,depth}`. `makeModelResolver` (`ts/src/lang.ts`) enforces it — `none` denies outright, `mem` is the whole world (a miss is not-found, denial is reserved for a refused MECHANISM), `root` is realpath-then-prefix-check on the RESOLVED file so a symlink escape is denied, `system` keeps today's chain; a denial is RAISED (never injected as a value, or a bare-member include would vanish in the merge) and lands as the parse-stage `include_denied` nil (`errcodes.tsv`, class parse). Budgets ride `ctx.budget` (`ts/src/ctx.ts`), read by the pass loop and depth guards (`ts/src/unify.ts`); fixing `passes: 1` exposed and fixed a real defect — the still-refining snapshot was taken after pass `maxcc-2`, which never exists when the budget is 1, so exhaustion was SILENT; it is now taken at the final pass's entry, in both ports. CLI: `--trust <system\|none\|root[:dir]>`, `--include-root`, and the phase-6 warning window. LSP: workspace-root confinement from the `initialize` params, `initializationOptions.aontu.trust.include` override, an unrecognised explicit value confining to NOTHING. Spec: `test/spec/include-trust.tsv` (4 rows, both runners, fixtures-root profile — the var.tsv runner-convention precedent) and `file.tsv` re-scoped under the same profile, making the shared suite itself hermetic. **Departures:** (1) `budget.revisits` is NOT profile surface — the Go dispatcher has no revisit counter, and a knob one port cannot honour breaks ADR-001 by construction; the TS revisit bound stays an internal constant. (2) The LSP falls back to UNCONFINED when there is no workspace root and no explicit option (single-file sessions rely on it); the design's per-surface table implied always-confined. (3) `deny-pkg` from the design's sketch rows is unpinnable as a shared row (a package hit depends on the installed environment); package denial under `root` shows as not-found after the file leg misses, and the pkg-leg skip is pinned per port. **2026-08-26, the surface sweep (use-cases/REVIEW.md finding G):** the capability reached the bare command and the library, and stopped there. Every CLI VERB parsed its own argument tail and ran the unconfined system resolver with no flag at all — the surface an agent scripts; the REPL accepted `--trust` and dropped it, so the harness-driven `--jsonl` mode evaluated unconfined however it was invoked; and the LSP confined the diagnostics it published while leaving HOVER on the system resolver, so a workspace-confined session resolved an escaping include the moment a cursor rested on it. All three are closed in both ports: `takeTrust`/`verbTrust`/`entryRootOf` strip the flags ahead of each verb's own parse and turn them into the engine's capability (a bare `root` meaning the primary document's directory), `replState.trust` carries a session capability through `:load`, `:get`, `:why` and bare snippets, and hover plus hover-provenance run under the server's capability (`HoverTrust` in Go, the `trust` argument to `computeHover` in TypeScript). Two parity holes surfaced with it and were closed: Go's `PatchOptions.Trust` was declared but never reached the `Vet` call underneath `set`, and `breaking` read its own `$.aontu_policy.compat` declaration through an unconfined evaluation in BOTH ports — confining the comparison but not the question. Pinned by `every-verb-honours-the-capability` (each of the ten verbs asserted twice: the escape resolves under the default and is denied under `--trust none`), `verbs-take-include-root`, `repl-honours-the-capability` and `workspace-root-confines-hover`, with Go twins. |
| **4** — Go port of profile and budgets | L | **LANDED** | The trust profile in Go: `Aontu.Trust` (`TrustOptions{IncludeNone, IncludeMem, IncludeRoot, Budget}`, `go/aontu.go`); enforcement in `go/source.go` (capability + realpath containment + `deniedKind` processor, the twin of the not-found flow) with the capability riding the parse meta bag (`trustSink`, the `notFoundSink` pattern) because the parser is CACHED per base; `parseWithTrust` (`go/lang.go`) returns the denial as `include_denied` BEFORE the not-found check; budgets on `Ctx` (zero = the spec constants, so a bare `&Ctx{}` behaves exactly as before). CLI flags and warning window in `go/cmd/aontu/main.go`; LSP workspace confinement in `go/lsp` (`trustFromInitialize`, `DiagnosticsTrust`). One canonical-side alignment landed with it: `CheckVars` reports a parse failure under its SPECIFIC code (`syntax`, `include_denied`) instead of a generic `parse`, matching the first-code contract errc rows pin. `include-trust.tsv` runs in `go/spec_test.go` under the same fixtures-root profile; per-port twins in `go/trust_test.go`, `go/cmd/aontu/trust_test.go`, `go/lsp/lsp_test.go`. **2026-08-26, the surface sweep (use-cases/REVIEW.md finding G):** the capability reached the bare command and the library, and stopped there. Every CLI VERB parsed its own argument tail and ran the unconfined system resolver with no flag at all — the surface an agent scripts; the REPL accepted `--trust` and dropped it, so the harness-driven `--jsonl` mode evaluated unconfined however it was invoked; and the LSP confined the diagnostics it published while leaving HOVER on the system resolver, so a workspace-confined session resolved an escaping include the moment a cursor rested on it. All three are closed in both ports: `takeTrust`/`verbTrust`/`entryRootOf` strip the flags ahead of each verb's own parse and turn them into the engine's capability (a bare `root` meaning the primary document's directory), `replState.trust` carries a session capability through `:load`, `:get`, `:why` and bare snippets, and hover plus hover-provenance run under the server's capability (`HoverTrust` in Go, the `trust` argument to `computeHover` in TypeScript). Two parity holes surfaced with it and were closed: Go's `PatchOptions.Trust` was declared but never reached the `Vet` call underneath `set`, and `breaking` read its own `$.aontu_policy.compat` declaration through an unconfined evaluation in BOTH ports — confining the comparison but not the question. Pinned by `every-verb-honours-the-capability` (each of the ten verbs asserted twice: the escape resolves under the default and is denied under `--trust none`), `verbs-take-include-root`, `repl-honours-the-capability` and `workspace-root-confines-hover`, with Go twins. |
| **5** — determinism byte-pinning | M | **LANDED** | `gens` documented in `docs/shared-spec.md`; the byte-exact rows live beside the behaviour they pin; repeatability enforced as a *runner property* — both runners re-run every `gens` row on a fresh engine. The **`deps` manifest** completed the phase: the resolved include closure as sorted, deduplicated `{path, capability}` entries — `result.deps` in TypeScript (`manifestOf`, `ts/src/aontu.ts`), `Aontu.IncludeDeps` in Go — hermeticity clause 1's "file set" made observable, deterministic by construction (no timestamps; the plugin's raw `wen`-stamped DependencyMap stays internal). Documented in `docs/reference-api.md` and `docs/trust.md`; pinned per port (`ts/test/trust.test.ts`, `go/trust_test.go`). |
| **6** — default flip | S | **PARTIAL** | The **warning window** is shipped, in both CLIs: under the default `'system'` posture, every resolution escaping the entry root (or resolving through a package) prints one stderr line naming `--trust system` / `--include-root` — once per resolution, pinned per port. `docs/trust.md` states the schedule. **What remains is the flip itself** — CLI entry-root confinement by default and the library's explicit-capability requirement — which the design stages at the NEXT MAJOR VERSION with a migration note; that is a release decision for the repository owner, not more code: the machinery, flags and denial semantics it needs are all landed. |

**Two departures the doc already records**: no `gens.tsv` bucket (rows
live beside their behaviour), and repeatability as a runner property
rather than dedicated rows. **One it does not**: a third budget,
`depth` (`MAXDEPTH`/`maxUniteDepth` = 1000, not the sketched 512),
landed in commit `90f3146` as a shared spec-visible constant.

**Phase 5 spent time graded PARTIAL after commit `87f4d37`
self-certified it landed** — the `deps` manifest was one of five
named deliverables, `go/lang.go` had never been touched for it, and
no test covered it. The grade above flipped to LANDED only when the
Go manifest and its tests existed. The lesson stands: under ADR-001,
a deliverable absent from one port's source cannot count.

**One designed guard was not built, and this register records the
gap deliberately rather than letting it pass as landed:** the
`reused_tree` debug-mode consumed-tree guard named by the G5 doc's
"Determinism, pinned" section exists in neither port and has no
`errcodes.tsv` row. Single-use trees remain a documented caveat
(docs/reference-api.md), enforced by nothing; the G5 doc now says so
in place.

## G6 — a distribution layer

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **0** — the hash form (`hcanon`) | S/M | **LANDED** | `ts/src/hcanon.ts` (`hcanon`, exported from `ts/src/aontu.ts`) and `go/hcanon.go` (`aontu.Hcanon`): exactly the unify-level canon with the two additions that close its semantic gaps — a closed map or list wrapped as `close({…})` / `close([…])`, and the type/hide marks rendered as `type(x)` / `hide(x)`. Both reuse parseable syntax, so the hash form is valid Aontu source, and every row asserts the property the hash rests on: `hcanon(unify(parse(hcanon(v)))) == hcanon(v)`, in both runners. `test/spec/hcanon.tsv` — 38 `hcanon` rows in the new mode (closedness at depth and under marks, spreads, optional keys, prefs, refs, escape-heavy strings, extreme and exact magnitudes, code-point key order, the deprecation vocabulary), beside 6 `canon` rows over the same sources so the "user-facing canon is UNCHANGED" claim is a pin rather than a promise. `docs/shared-spec.md` carries the new modes (and the `subsume`/`trim` modes it had not caught up with). **Departures:** (1) the marks PROPAGATE to every descendant at unification, so a wrapper is emitted only where a mark STARTS — the walk carries inherited marks down and a child whose mark its parent already carries renders bare; rendering every marked leaf would be correct but never minimal, and not what the source said. (2) The design's "`ts/src/val/Val.ts` (default `hcanon` delegating to `canon`)" landed as a standalone WALK instead of a per-Val method: the rendering has to carry inherited-mark state down the tree, which a no-argument getter on each Val cannot do without adding that state to every Val in the engine. Everything the walk does not need to descend — scalars, kinds, funcs, refs, constraints — still delegates to its own `canon`, which is where the cross-port parity already lives. (3) The junction parenthesisation rule is kept exactly, but post-unification junctions are flattened by `norm`, so no SOURCE reaches its wrapping arm; it is pinned by direct tests over constructed Vals in both ports, because a hash form that could render `(1\|2)&3` as the differently-parsing `1\|2&3` would be a pin that silently agrees with a document it should not. |
| **1** — the hash itself (`canonHash`) | S | **LANDED** | `canonHash` / `aontu.CanonHash`: `"aon1-" + base64url(SHA-256(UTF-8(hcanon(unify(v)))))`, unpadded (RFC 4648 §5), the scheme id there so a semantically stronger normal form is later an upgrade rather than a breakage. CLI verb `aontu hash [--form] [--format text\|json] <file>` in both ports (`ts/src/cli.ts`, `go/cmd/aontu/hash.go`), the document evaluated STANDALONE at its own root — which is what makes the pin transitive — with exit classes 0 hashed, 2 usage, 4 the document does not stand up on its own (a hash of a wreck would agree with every other wreck). 9 `hash` rows pinning full `aon1-…` strings, executed by BOTH runners; 3 cases in `ts/test/cli.test.ts` and 3 in `go/cmd/aontu/hash_test.go` holding each port's argument handling and the invariances (reformat, recomment, reorder keys → same pin; close a map → different pin); the two CLIs diffed byte-identical over a 10-case corpus (text, `--form` and JSON, exit codes included) — the version field and the host's unreadable-file wording excepted, G2 phase 3's same carve-outs. `docs/reference-api.md` carries the verb, the hash form's definition and the two exports. **Departure:** `--form` is not in the design. It prints the hashed TEXT instead of the digest, which is the first thing anyone needs the moment a pin moves and the only way to see what the engine actually hashed; without it a flapping pin is undiagnosable from the command line. |
| **2** — module identity and local resolution | M | **LANDED** | `ts/src/mod.ts` and `go/mod.go` (new): module-path routing (domain-shaped first segment, `@<major>` suffix, optional `#aon1-…` fragment), the project root found by walking up to a `mod.aon`, `aon_vendor/` then the content-addressed user cache, `mod-lock.aon` read as the JSON its canonical form IS, the `mod.main` entry read by EVALUATING the module file, and local integrity verification by recomputing the module's standalone canon-hash. The leg sits where the design put it — memory → MODULE → filesystem → package (`ts/src/lang.ts`, `go/source.go`) — with memory still first, so a sandbox and the spec suite can stub a module path without touching disk. Codes `module_missing`, `module_integrity` and `module_depth` in `errcodes.tsv`. Spec: `test/spec/mod.tsv` (21 rows) over real fixture trees under `test/spec/files/mod*/`, run under the FIXTURES trust root exactly as `file.tsv`'s are; per-port cache, host-filesystem and depth behaviour in `ts/test/mod.test.ts` and `go/mod_test.go`. Docs: "Modules" in [`docs/reference-language.md`](../reference-language.md#modules). **Departures:** two, recorded below.  **2026-08-27, the store belongs to the project, not to the file that names it (use-cases/REVIEW.md finding H, BUGS.md §31a).** Resolution walked up to the NEAREST `mod.aon` and stopped. A vendored module carries its own `mod.aon` — it is a project inside a project — so an import made from inside `aon_vendor/…/service@1/` looked for a store under `service@1/`, found none, and refused `module not fetched` while the module it wanted sat FLAT beside it, which is the only layout `mod vendor` writes. The tooling produced a tree the resolver could not read, and the workaround (a second `aon_vendor/` nested inside the dependency) could never have travelled anyway, because `manifest` excludes `aon_vendor/` from the published layer. `projectRoots` (`ts/src/mod.ts`, `go/mod.go`) now collects EVERY enclosing root and `resolveModule` tries each one's store and lockfile in turn, nearest first — so a module that ships its own vendor tree still wins for its own tree, and one that does not falls through to the consumer that vendored it. One-module-deep sharing became a dependency GRAPH. `mod-nested-has-its-own-root` records the nested root as resolving; twin tests `TestModTransitiveVendorResolves` and its TypeScript pair; use case 11's transitive probe asserts the closure evaluating and its pin agreeing with `aontu hash`, where it used to assert the two disagreeing. |
| **3** — module tooling (`tidy`, `vendor`) | L | **LANDED** | `ts/src/mod-tool.ts` and `go/modtool.go` (new): the dependency closure walked breadth-first from the project's own `mod.aon`, resolved by **minimum version selection** — each module taken at the highest of the minima anyone asked for and never higher, which is what makes a resolve reproducible and keeps one added dependency from moving another. It terminates without a cycle check because a module's selected version only ever rises. `tidy` recomputes every `canon` pin by evaluating the module in the store standalone (never carrying the old one forward — that would pin what the module USED to mean) and carries the `oci` digest over (the registry's word about bytes, which nothing local can hear), then writes `mod-lock.aon` in canonical form under a generated-file header; a closure with anything missing writes NOTHING, because a partial lock claims a resolve that never happened. `vendor` copies each locked module into `aon_vendor/` as a whole source tree — a module is more than its entry file — and leaves a module already resolving from there alone. CLI verb `aontu mod tidy|vendor [--format text|json] [dir]` in both ports (`runMod` in `ts/src/cli.ts`, new `go/cmd/aontu/mod.go`), exit classes 0 resolved, 1 missing, 2 usage. The lockfile header forced a comment-stripping reader in every consumer (`lockJson` in `ts/src/mod.ts`, `lockJSON` in `go/mod.go`), and the two G6.2 fixtures that carry a lockfile grew the header so the strip is pinned by the shared suite rather than only by the new tests. "Where the user cache is" was written twice the moment the tooling needed to write into the cache the resolver reads from, so the rule is now one function in each port (`modCacheDir` in `ts/src/mod.ts`, `aontu.ModCacheDir` in `go/aontu.go`), called by both the resolver and the command. **No spec rows**: nothing here is language behaviour — it is what a command does to a directory — so the parity discipline is the one G2.3 set for CLI verbs: 17 cases in `describe('mod-tool')` (`ts/test/mod.test.ts`) against 20 in Go — 11 at the package API in new `go/modtool_test.go`, 9 at the command in `go/cmd/aontu/mod_test.go`, the split the Go port's coverage attribution forces — plus the two CLIs diffed byte-for-byte over 22 invocations across twelve worlds (resolve, MVS at depth, a diamond where two modules bid for one dependency in the same round, a previous lockfile whose pins must be half kept and half recomputed, a module whose entry file is absent, a dependency key that is not a module path, missing, locked-in-cache, a store holding a subtree, an unreadable lockfile, a lockfile naming what no store has, and a bare directory for every argument error), comparing exit code, stdout, stderr, the written lockfile and the whole vendor tree — identical, the version series excepted. Docs: [`aontu mod`](../reference-api.md#aontu-mod) and the tooling paragraph in ["Modules"](../reference-language.md#modules). **Departures:** three, recorded below.  **2026-08-27, a pin that cannot be computed is not written, and verifying is not editing (use-cases/REVIEW.md finding H, BUGS.md §31b and §32).** Two holes on either side of the lockfile. (a) `tidy` pinned a module it could not evaluate: the hash it locked was `canonHash(nil)`, which EVERY unevaluable module hashes to, so two entirely different broken modules locked the identical pin and the "breaks on any semantic change in the transitive closure" contract was silently vacuous — while `aontu hash` refused the same file. Tidy now refuses it too, with the same wording (`does not evaluate on its own; nothing to pin`), reporting `verdict: error`, exit 4, and writing no lockfile: the phase's own rule that a partial lock is worse than none, applied to a pin that is present but means nothing. (b) Nothing CHECKED the store against the committed lock. `tidy` recomputes and rewrites by design, so a CI job that tidied before evaluating made the lockfile agree with a tampered store and then passed — the integrity pin defeated by the order of two commands. **New verb `aontu mod verify [--format text\|json] [dir]`** (`modVerify` in `ts/src/mod-tool.ts`, `ModVerify` in `go/modtool.go`; the verb in `ts/src/cli.ts` and `go/cmd/aontu/mod.go`) recomputes every pin, compares it to the lock, WRITES NOTHING, and refuses on any disagreement naming both hashes (`pinned <want> but the store means <got>`); a module that no longer stands up says so rather than reporting the hash of `nil` as a meaning. **And NOTHING TO CHECK IS NOT A PASS**, which is the obvious way to get this verb wrong: the gate walks what is LOCKED, so a project whose lockfile was never committed — or whose lockfile predates a dependency someone added — would verify clean over an empty set, absence reading as agreement, the same shape as the defect it exists to close. Every dependency the project itself declares must be in the lockfile before the pins mean anything (`verdict: unlocked`, naming `mod tidy` rather than a fetch, because what is absent is the PIN and not the module). Transitive dependencies need no separate check and get none — duplicating tidy's MVS walk would be a second definition of the closure that could disagree with the first — because a locked module's own imports are resolved when its pin is recomputed, so one that is unreachable makes its DEPENDANT fail to evaluate and lands in `mismatched`. Verdicts `ok`/`mismatch`/`unlocked`/`missing`, exit classes 0/1/1/1/2 — a mismatch is a refused gate, the class `breaking` uses. Parity by this phase's own discipline: `TestModVerify`, `TestModVerifyRefusesAnUncoveredProject`, `TestModVerifyReportsWhatNoStoreHolds` and `TestModVerifyCommand` against their TypeScript twins, plus the two CLIs diffed byte-identical over 17 tidy, verify, eval and usage invocations across four worlds. Use case 11 asserts the cold refusal and the tampered store reported with the lockfile byte-identical afterwards. |
| **4** — registry hooks: the publish boundary | M | **LANDED** | `aontu mod manifest [--against <dir>] [--format text|json] [dir]` in both ports (`modManifest` in `ts/src/mod-tool.ts`, `ModManifest` in `go/modtool.go`, the verb in `ts/src/cli.ts` and `go/cmd/aontu/mod.go`): the OCI artifact a publish would push, and the gate that decides whether it may be. **Everything a publish ASSERTS is local**, which is why the phase lands whole without the registry the push needs — config media type `application/vnd.aontu.module.v1+json`, one layer holding the module source tree (relative and forward-slashed so two implementations on two platforms describe the same layer; `aon_vendor/` excluded, because a published module carries its own sources and not a copy of everyone else's), and four annotations: the two OCI already has keys for (`org.opencontainers.image.title`/`.version`) and the two it does not (`com.github.rjrodger.aontu.canon`/`.major`). A module that publishes itself declares `mod.version`, and the **major an import spells lives inside it** — `1.4.2` publishes as `@1` — so the version scheme and the import path cannot disagree. **The publish-time breaking gate** invokes [G3](g3-subsumption-evolution.md) rather than restating it: `--against <prior tree>` runs `subsume(new, old)`, which is exactly `aontu breaking`'s backward check, and the verdict, the findings and the exit classes are that check's unchanged (`0` publishable, `1` breaking, `3` undecided, `4` nothing to mint, `2` usage) — three-valued plus error, so a question the checker cannot decide is not a pass. A prior version at a DIFFERENT major skips the gate: the major is in the path, a consumer of `@1` never sees `@2` unless it asks, and checking across majors would forbid the one change the version scheme exists to express. **"Has the truth changed?" needs no download**: the annotation carries the same canon-hash `tidy` locks and `aontu hash` prints, so a consumer compares one string, and the hash-keyed cache G6.2 already built is the same key. Parity by G2.3's CLI discipline, not spec rows (nothing here is language behaviour): 8 manifest cases in `ts/test/mod.test.ts` against 8 in Go — 6 at the package API in `go/modtool_test.go`, 2 at the command in `go/cmd/aontu/mod_test.go` — plus the `mod` probe grown to 36 invocations across fifteen worlds, every exit class included, diffed byte-for-byte on exit code, stdout, stderr, the written lockfile and the whole vendor tree (identical, the version series excepted). Docs: [`aontu mod`](../reference-api.md#aontu-mod) and ["Modules"](../reference-language.md#modules). **Departures:** three, recorded below. |

**Departures recorded by G6.2.**

1. **Verification is DEPTH-BOUNDED, and the bound is a stated
   refusal.** The design says verification recomputes the module's
   canon-hash locally, which means EVALUATING the module — and that
   evaluation resolves the module's own imports. A vendor tree that
   leads back to itself (a symlink is enough) would recurse until the
   host's stack gave out, and a verdict that depends on the host's
   stack size is precisely what [G5](g5-trust-contract.md)'s
   determinism clause forbids. `module_depth` (class `budget`, for the
   reason `unify_cycle` is) bounds it at sixteen, far above any real
   vendor nesting.
2. **The evaluator is INJECTED into the resolver, not imported by
   it.** Resolution needs two answers only evaluation can give — what
   a module file SAYS (`mod.main`) and what a module MEANS (its
   canon-hash) — and the resolver runs inside a parse that the
   evaluator started. In TypeScript the import would close a cycle
   around the whole language, so `Aontu`'s constructor hands the
   resolver a closure over itself; the Go port has no cycle to fear
   (one package) but takes the same shape, and had to make its default
   parser lazily initialised, because a package-level one was a static
   initialisation cycle through the very resolver it installs.

**Departures recorded by G6.3.**

1. **The NETWORK HALF is not in this build, and the CLI says so.**
   The design's phase 3 is `get`/`tidy`/`vendor`/`publish` over OCI.
   Fetching and publishing need a registry client and integration
   tests against a live registry — neither of which this build can
   have, and untestable network code would breach
   [ADR-002](../../ADR.md)'s floor rather than sit under a waiver. So
   the two local commands landed whole and the two network ones are
   NAMED rather than left to fall out as an unknown subcommand: a
   reader of the design will type `aontu mod get`, and is told which
   half is missing and where it is specified. The one place the
   absent half already shows is `tidy`'s missing report, which prints
   the step that would fix it.
2. **`vendor` cannot search the cache from a cold start.** The user
   cache is content-addressed — keyed by canon-hash, which is what
   makes a shared cache safe between projects — so a lookup needs the
   hash it is looking for. Without a lockfile there is nothing to
   search BY, and `vendor` on an unlocked project reports nothing
   rather than scanning the cache for a path it might match. `tidy`
   first, then `vendor`; the same ordering `tidy`'s own lookup
   already assumes when it reads the previous lock for a hash.
3. **No shared spec rows.** Every other landed phase added rows to
   `test/spec/*.tsv`; this one adds none, because nothing it does is
   language behaviour — the observable is what a command leaves in a
   directory. The parity discipline is the one G2 phase 3 set for CLI
   verbs instead: twin per-port tests plus a byte-for-byte diff of the
   two CLIs over a fixture corpus, extended here to compare the
   written lockfile and the whole vendor tree, not just the streams.
4. **`verify` is a verb the design did not name** (added 2026-08-27).
   The design's local half is `tidy` and `vendor`; the review found
   that neither can be a CI integrity gate, because `tidy`'s job is to
   rewrite the lockfile and `vendor`'s is to copy into it. Asking
   whether the store still means what is pinned is a different act
   from making it so, and a verb that answers by editing cannot be
   trusted to answer at all. `--check` on `tidy` was the smaller
   change and is what `trim` uses, but a flag that inverts a verb's
   effect reads as a mode of the same act; `verify` names the act,
   and leaves `tidy` exactly as specified.

**Departures recorded by G6.4.**

1. **The verb is `manifest`, not `publish`.** The design's phase 4 is
   hooks ON `aontu mod publish`, which needs the registry client phase
   3 could not ship. So the boundary landed as its own verb: it
   computes and gates exactly what a publish would send, and stops
   before sending it. That is not a smaller phase — the annotations and
   the gate ARE the phase, and the push is the one part that carries no
   semantics. It also turns out to be the more useful shape: a CI job
   wants to ask "would this publish be refused?" without publishing.
2. **The custom annotation keys are under `com.github.rjrodger.aontu`.**
   OCI asks a custom annotation key to be the reverse DNS of a domain
   its author controls, and the project's own home is the only domain
   it has. Inventing an `aontu.dev` would be a claim the project cannot
   back, and squatting a key nobody owns is worse than an ugly one. The
   two facts OCI already has predefined keys for use those, so only
   `canon` and `major` carry the prefix.
3. **The gate is BACKWARD, always.** `aontu breaking` honours `--mode`
   and the document's own `aontu_policy.compat`, including `none`. The
   gate does not: publishing under an unchanged major IS the promise
   that old documents keep working, and letting a module opt out of the
   check at the boundary where that promise is minted would make the
   gate advisory. A module that means to break bumps its major, which
   the gate already lets through; a module that wants the other modes
   still has the `breaking` verb.

Both remaining design items beyond this are network: `mod get` and
`mod publish` themselves (see the G6.3 departures).

G6's own risk row — "G1's new constraint syntax changes canon,
invalidating all pins" — materialised before the hash existed: G1.1
added five atoms to canon while G6 was still on paper, which is
exactly why the hash landed AFTER G1 completed rather than beside it,
and why the scheme id is in the string.

**One current-state claim went false and has been rewritten in the
doc**: it said parse-level canon is not in TS/Go parity, citing an
AGENTS.md entry. That divergence (#30) is fixed and the entry
deleted; parity is pinned by twin tests in both ports. The design
conclusion (scope the hash to post-unification canon) survives on
the corrected footing the doc now states — no shared spec mode
*observes* parse-level canon.

## G7 — a machine-facing access surface

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **1** — `get` and projections, TypeScript | M | **LANDED** | `ts/src/query.ts` (`get`, exported from `ts/src/aontu.ts`): evaluate the document, select the node at a path, render it as generated JSON (the default), canonical form, a `types` shape view, a `depth`-elided view, or a `keys` listing. Path parsing REUSES `anchorAt` — vet's `--at` walk, already type-directed and already in parity — so a path means exactly what a reference means by `$.a.b`, down to the canonical-decimal index rule. A refusal is a G2 finding (`no_path`, class `reference`) carrying a nearest-key suggestion, so `get` invents no error format. CLI verb `aontu get <path> [-c\|--canon] [--keys] [--types] [--depth n] [--format text\|json] <file>` in `ts/src/cli.ts`, exit classes 0 rendered / 1 the path names nothing / 2 usage / 4 the document does not stand up. `test/spec/query.tsv` — 92 rows in the new fifth-column mode; `ts/test/query.test.ts` (5 cases) and 3 cli cases hold the API and the command line. `docs/reference-api.md` and `docs/shared-spec.md` carry the verb and the mode. **Departures:** (1) THE PROJECTION PROPERTY IS ASSERTED, not claimed: every canon-shaped row additionally runs `subsume(view, truth)` in both runners and requires `subsumes` — G3 landed first, so what the design could only promise is now mechanically checked. It runs under the **values** profile, because a shape view ERASES defaults (`*8080\|integer` → `*integer\|integer`) and the `defaults` profile rightly calls that a break; the claim a projection makes is about admitted values, not about which one is generated. (2) `--types` lifts through the lattice's own `superior()` rather than a kind table, and leaves a value that is ALREADY an abstraction (a kind marker, a constraint, an unresolved reference) alone — lifting `integer` to `number` would generalise a shape view that was already a shape. (3) Junctions and prefs are TRANSPARENT to `--depth`: not a structural tier, so `*8080\|integer` projects its members rather than collapsing to `top` and discarding the alternatives. (4) `--depth` with the JSON view is a USAGE ERROR: eliding renders `top`, which JSON cannot say, and switching the view silently is the choice `trim --check` already refused. (5) The design's `[file]` optionality (stdin) is not taken: every other verb names its file, and an included document's base directory has to come from somewhere. |
| **2** — `get`, Go port | M | **LANDED** | `go/query.go` (`(*Aontu).Get`, `QueryOptions`, `QueryReport`) and `go/cmd/aontu/get.go`, mirroring the walk, the views, the exit classes and the JSON report; both runners execute every `query.tsv` row with no skip list, expectations parity-probed (87 cases diffed byte-for-byte, then 5 more for the list-spread arm) before any row was written. `go/query_test.go` (7 cases) holds the API and the arms no source reaches. The two CLIs diffed byte-identical over a 17-case corpus — the version series and the host's unreadable-file wording excepted, G2 phase 3's same carve-outs. **What the probe cost the engine** (the G2 phase-4 pattern): the canonical side was WRONG about a non-concrete value — `get $.k` on `k: integer` returned the string `null` under `collect`, where the Go port correctly refused; generation failures now read back off the context in TypeScript, and `query-k-json` pins the refusal. Two smaller fixes: the finding's path is now the normalised QUERIED path in both ports (it was the engine error's, which is empty for a parse failure), and the Go CLI's `get`, `hash` and `trim` verbs now build their engine through `aontuForFile`, so an error frame names the file rather than `<no-file>`. **Observed, not fixed:** for an unparseable document the TS error FRAME prints one more trailing source line than Go's. It is pre-existing (identical under the plain `aontu <file>` verb), it is frame prose rather than behaviour, and no row pins it. |
| **3** — provenance recorder and `why`, TypeScript | L | **LANDED** | `ts/src/provenance.ts` (the `Provenance` recorder and the record shape) and `why` in `ts/src/query.ts`, exported from `ts/src/aontu.ts`: what CONTRIBUTED to the value at a path, in order, each with the site it was written at. CLI verb `aontu why <path> [--format text\|json] <file>`, exit classes mirroring `get`'s. `test/spec/why.tsv` — 39 rows in a new five-column mode. **Departures, all of them about what a contribution IS** — the design named five instrumentation points (the `update()` site-drop, the conjunct fold, spread application, pref resolution, ref resolution); one is enough and the rest fall out: (1) the recorder hooks `unite` ALONE, the one place every meet passes through — G3's deprecation rider proved that point exists — plus a mark at the spread clone, which is the only role no operand can tell you about itself. A ref is still a `RefVal` when it meets its peer and a pref is still a `PrefVal`, so those two roles need no hook. (2) A contribution must be a value the author WROTE: the parsed tree is stamped before the fixpoint runs, and anything minted during unification (a kind lifted while a disjunct trials its members, a fold's intermediate) is the engine's own work and is dropped — without that rule the record for the design's own example carried a `number` nobody wrote. (3) Values structurally INSIDE a recorded contribution are dropped for the same reason, but a CONJUNCT expands into its terms: `a & b`, or two duplicate keys merged at parse, is several separately-written values, and the conjunct's own site is nowhere. (4) Contributions are ordered by SITE, not by meet order: the fold order is the fixpoint's business and would not survive the port. (5) Deduplication is by (path, val id) as designed, keyed on the path STRING rather than `ctx._pathidx` — the same rule, and the string is what the report prints. (6) Two evaluations are not needed: the recorder rides the one run the call already makes. **The cost is where the design put it:** off by default, one property load per meet on the uninstrumented path; an instrumented run additionally takes the no-op meets a bag normally skips, so a value written once and never met is still reported.  **2026-08-27, provenance through clones (use-cases/REVIEW.md finding E).** The recorder decided "did the author write this" by looking the operand's id up in a SET stamped over the parsed tree -- true of the parsed tree and of nothing derived from it -- so every value that reached a path through a clone was dark: a default flowing into a pack()-generated child, a shape carried by a $ref, one side of an id()-merge. `why` answered "(no contributions: nothing met at this path)" over a value it had just printed, with exit 0, which is the one statement an audit surface may not make (BUGS.md §22-24). The mark now lives ON the value (WRITTEN / base.fwrt) and Val.clone, Val.place and the disjunct fold carry it exactly as they carry the site -- the review's own recommendation, that provenance be part of the clone contract rather than a recorder bolted beside it. Values the engine MINTS are constructed rather than cloned and stay unmarked, which is what keeps the record to what the author can edit. Three pieces landed with it. (a) A MEMBER IS NOT A VALUE BESIDE ITS CONTAINER: which of the two the recorder saw was decided by evaluation order, so identical siblings under one spread template answered differently (one contribution at the first key, two at the second); containment is now a fact about the document, recorded at stamping time (INNER_OF / base.finner), and an operand is reported as the outermost written value it is part of. (b) markSpread's guard was a "done" flag where a CYCLE guard was meant, so the second key's application walked into an already-marked container and stopped, leaving every child the fixpoint had advanced in place unmarked. (c) THE VALUE THAT STANDS at a path is a contribution when nothing met there, because a generator places a value without meeting anything. One safety rule came with the extra reach: `set --in-place` REFUSES a path reached through a reference, because the literal it correctly reports belongs to the referent's line and splicing there would rewrite it for every reader while leaving the named path unmoved. Seven new rows -- why-spread-first-sibling and why-spread-later-sibling (the pair the review asked for), why-spread-untouched-later-sibling, why-pack-generated-default/-overridden, why-id-merge-first-position/-later-position -- and five existing goldens that recorded the defect now record the file and line the value came from. |
| **4** — `why`, Go port | L | **LANDED** | `go/provenance.go` and `(*Aontu).Why` in `go/query.go`, plus `go/cmd/aontu/why.go`; the recorder hangs off `Ctx.prov` and hooks the `unite` wrapper that already carries G3's deprecation rider. Both runners execute every `why.tsv` row with no skip list, expectations parity-probed (39 cases diffed field by field, records and refusals) before any row was written. `go/provenance_test.go` holds the ordering's last tiebreaks and the entry-file/trust wiring; the two CLIs diffed byte-identical over an 11-case corpus — the version series and the host's file-error wording excepted. **What the probe cost the engine:** three shapes where a value was never met at all (a lone leaf, a nested leaf, a ref target) recorded nothing in TypeScript and one contribution in Go, because the TS bags SKIP the identity meet as an optimisation; the skip now yields while recording, so both ports see the same meets. Go additionally stamps the entry document's file name (`stampURL`, vet's precedent) — the TypeScript side gets it from the parse `path` option — so a site names its file in both. **Carve-out (2026-08-24):** "its file" is the ENTRY document's, and under an `@"…"` include that is the wrong one — Go names the entry where TypeScript names the included file the value was written in, with the row and column right in both. Recorded as OPEN #66 in [`test/spec/divergent.tsv`](../../test/spec/divergent.tsv); verdicts, codes and positions are unaffected. **Observed, not fixed:** Go has no per-Val id, so the recorder keys on pointer identity, which says the same thing. |
| **5** — overlay `set` | M | **LANDED** | `ts/src/patch.ts` (`patch`, exported from `ts/src/aontu.ts`) and `go/patch.go` (`aontu.Patch`), with `aontu set <path>=<value>... --entry <file> --overlay <file> [--dry-run] [--format text\|json]` in both CLIs: an assignment becomes a path-flattened conjunct (`$.a.b=1` → `"a": "b": 1`, keys quoted so a segment may be a keyword, a number, or hold a space) appended to the overlay, and the verdict is G2's, unchanged — `vet(entry, overlay)` already asks exactly the right question, so the verb adds a writer, not a report. Exit codes are vet's verdict classes. `test/spec/patch.tsv` — 23 rows, parity-probed; `patch_assignment` registered in errcodes.tsv (class `parse`: what is malformed is source text). **The order-independence the whole verb rests on is ASSERTED, not claimed**: every row that stands up additionally runs the vet the other way round in both runners and requires the same verdict. **Departures:** (1) the engine returns the overlay TEXT and the CLI writes it — an engine that touched the filesystem could not be used by a server, and the CLI is the one place that knows about files. (2) The overlay is written ONLY when the change holds: an `invalid` or `error` verdict leaves the file exactly as it was, because a change the author still has to think about should not sit in their configuration while they do (the design said "appends, then re-evaluates"; on a refusal that would leave a broken overlay behind and the exit code is the only thing saying so). `--dry-run` writes nothing either way. (3) A missing overlay file is the empty overlay and is created, so "append to the overlay" does not require having made one first. (4) The entry and overlay file names ride as vet URLs as well as base paths, so a finding names the two files rather than the generic `schema`/`data` labels. **Stage 2 — the format-preserving in-place edit — LANDED 2026-08-25 as `--in-place`**, and one of its two stated prerequisites was wrong. The first was met as described (`why` IS the evaluated-path → contributing-span map, and sites carry `len`/`src` since G7's site-extent work). The comment-preserving CST was not needed AT ALL: a CST is what you need to RE-SERIALISE a document, and a targeted span splice serialises nothing — it replaces `len` code units at one offset and every other byte, comments and layout included, survives by never being read. **What the estimate missed in the other direction** is that `role === 'literal'` does NOT identify an editable span: a site names the TOKEN it points at, so a compound reports its OPENING token (`min(1)` reports `min`, `1+2` reports `1`, `{b:1}` reports `{`) while its canon is the whole thing, and splicing there edits the expression rather than the value — the same corruption class as the canon-length arithmetic, by another route. The shipped check parses the `src` ALONE and requires it to mean the contribution's own canon, which is the unifier deciding rather than a list of shapes to be incomplete about, and gets `0x1F` (canon `31`, not its own spelling) right without naming it. **The authority is the overlay text ALONE, with includes denied**, and that is not tidiness: a literal reached through `@"..."` cannot be told apart from the overlay's own by position -- an include holding `a: 42` at 1:4 and an overlay holding `x: 42` at 1:4 give the same site and the same text, so the span verification PASSES and a splice that trusted it rewrites `x` while reporting a replacement of `$.a`. The site's file cannot save it (a library caller need not pass a path, and this port names the entry document for an included value anyway, issue #76), so the ambiguity is removed at its source instead of detected. An overlay that loads anything is therefore refused outright, which subsumed a separate foreign-file check and left the span verification unreachable-but-kept in both ports, marked with its reason. Three codes registered (`patch_not_editable`, `patch_ambiguous`, `patch_span_mismatch`), all **warnings**: where the splice is refused the assignment is APPENDED exactly as it would have been without the flag, so the mode cannot turn a run that would have held into one that does not — asserted per row by both runners, which re-run every in-place row without the flag and require a verdict at least as good. 19 rows; `ts/test/patch.test.ts` (new) and `go/patch_test.go` cover what a row cannot reach, the file paths. **What the parity probe cost the ENGINE, the G2 phase-4 pattern again:** two pre-existing Go site divergences fixed rather than recorded — a value MINTED by unification claimed row 1 column 1, because Go's `sp` zero value is a real position (every constructor now starts at an `unsited` sentinel, which conjuncts, disjuncts, tops and nils each already did for their own reason); and a PIPED call was sited at its left operand, because `buildCall` took the position from the pipe's rule. Pinned by `vet-minted-*` and `why-piped-call-is-unsited`. A third, recorded not fixed in `test/spec/divergent.tsv` — and it is TWO entries rather than one: a literal in an included file is **#66**, recorded a week earlier and REDISCOVERED by this parity probe (the ledger's own failure mode, left visible), and a value minted during unification is **#76**, which fixing #66 does not settle. Neither is a one-line fix (Go's loader stamps no per-document url, and Go does not track parsed-versus-minted), and `set --in-place` safety is unaffected — the span verification catches what the file check cannot. |
| **6** — delivery: MCP server, grammar, skill, `agentsmd` | M | **LANDED** | Four deliverables. **The MCP server**: `ts/src/mcp.ts` (tools and protocol, transport-free) and `ts/src/mcp-server.ts` (NDJSON stdio), published as the `aontu-mcp` bin — the LSP's three-layer split. Six tools — `vet`, `get`, `why`, `diff`, `canon`, `summary` — each returning the SAME JSON contract the CLI prints; a tool that REFUSES answers with its own report and `isError: false`, which is reserved for a call that could not be made. Served evaluation is confined to no includes at all (G5). **`diff`**: `ts/src/diff.ts` and `go/diff.go`, path-addressed, with `test/spec/diff.tsv` (28 rows) asserting SYMMETRY in both runners. **The published grammar**: `grammar/aontu.gbnf` and `grammar/aontu.lark`, and `ts/test/grammar.test.ts`, which READS the gbnf file, interprets it as an ordered-choice PEG, and requires it to accept every canonical-form output in the shared suite (673 canon rows at landing; the corpus is the suite's live canon rows, so it grows with rule 5) while refusing the include directive and the over-approximations. **`aontu agentsmd`** in both CLIs, over `agentsMd`/`(*Aontu).AgentsMd`, with `test/spec/agentsmd.tsv` pinning the stanza BYTE FOR BYTE across ports; `--write` splices between markers and leaves the rest of the file alone. **The skill**: `docs/skill/` — trigger stub, grammar card, JSON-first example ladder, error-code index — with `ts/test/skill.test.ts` evaluating every example document, so a skill that teaches what the engine no longer does fails the build. **Departures:** (1) `diff` compares the HASH FORM, not the plain canon: canon drops closedness and the marks, so a canon diff would call `close({a:1})` and `{a:1}` identical, and a bag's own attributes diff at the `&`, `&closed`, `&type` and `&hide` pseudo-keys. G6 landing first is what made that available. (2) MCP RESOURCES are not implemented; the progressive disclosure the design wanted from them is the `summary` TOOL plus `get`, which is the same disclosure without a second protocol surface to keep in parity. (3) `diff` and `agentsMd` are in BOTH ports with shared rows, though only TypeScript serves MCP — behaviour belongs to the spec suite (ADR-001), and the Go API is what a gateway embeds. (4) The grammar's parity test interprets the gbnf file rather than shelling out to lark or llama.cpp: the discipline the design asked for, without a toolchain the CI does not have. |
| **7** — REPL inspection mode and hover-provenance | S | **LANDED** | The REPL gains `:load`, `:get`, `:keys` and `:why` in BOTH ports, over the query and provenance surfaces, plus a `--jsonl` session mode with no banner, no prompt and one JSON line per answer. **Closed 2026-08-24.** Both halves were fixed and are now driven by tests that go through the REAL entry points — `run()` in Go (`TestReplJSONLIsReachableOverAPipe`) and the SPAWNED binary in TypeScript (`repl-jsonl-is-reachable-over-a-pipe`), with `tty` false in both, since the whole reason the defect survived a green suite is that the old tests built the REPL state by hand. The Go switch gained its `--jsonl` case; and in BOTH ports the flag now overrides the TTY gate, which had read piped stdin as Aontu SOURCE — so the mode a harness drives was reachable only through a pty. The two CLIs were diffed byte-identical over a four-command scripted session. **What was missing:** the `--jsonl` FLAG does not exist in the Go CLI — `jsonl := false` at `go/cmd/aontu/main.go:399` is never reassigned because the argument switch has no case for it, so `aontu --jsonl` answers `unknown option --jsonl` and exits 2 while `helpText` at `:52` advertises it and `go/cmd/aontu/repl.go` carries the whole machinery behind it. `repl_test.go`'s `TestReplJSONLAnswersInOneLine` passes because it constructs `replState{JSONL: true}` directly, bypassing the parser, so the suite is green over unreachable code. By ADR-001 that makes the phase partial, not landed. In TypeScript the flag exists but the REPL is gated on `process.stdin.isTTY` (`ts/src/cli.ts:2285`), so piped commands are parsed as Aontu source and the mode is reachable only through a pty. The phase's other deliverables hold in both ports: `:load`, `:keys`, `:get` and `:why` all answer correctly in the Go REPL. Recorded 2026-08-21; see [`status-2026-08-21.md`](status-2026-08-21.md#9-the-register-is-accurate-its-siblings-are-not). The command handler is a PURE FUNCTION of (state, line) in both ports (`replCommand`, `ts/src/cli.ts` and `go/cmd/aontu/repl.go`) with file reading injected: a read loop is untestable, and every answer this REPL gives has to be as checkable as the CLI's. The two handlers were diffed line by line over a 24-line scripted session, in both output modes, before either was tested. **Hover provenance** in both language servers (`ts/src/lsp.ts`, `go/lsp/lsp.go`), config-gated by `initializationOptions.aontu.provenance` and off by default; `ValueSpan` gained the path the record is keyed by, and the markdown was diffed byte for byte. Diagnostics are unchanged. **Departures:** (1) the session flag is `--jsonl`, not the design's `--json`, which would read as the `:json` output mode the REPL already has. (2) `:load` holds the SOURCE, not the rendered document: every later question re-evaluates, which is what single-use trees require, and holding both texts would have made `:get`'s view flags answer from the wrong one. (3) Hover provenance costs a SECOND evaluation rather than instrumenting the hover's own: the recorder needs the parsed tree stamped before the fixpoint, which hover's evaluation has already passed by the time a candidate is chosen. It is gated for exactly that reason. |

G7.5's STAGE 2, the format-preserving in-place edit — what
[G2](g2-validation-verb.md) and [G3](g3-subsumption-evolution.md) defer
"applying a fix" to — **LANDED 2026-08-25**, in two steps on the same
day. First a site gained `len` (the span in UTF-16 code units) and
`src` (the text that span covers), in `vet`'s findings and `why`'s
record in both ports, so a single-value replacement became exact and
verifiable where it used to be sized by the canon and corrupt the
document. Then `aontu set --in-place` used them.

**The CST it was deferred behind was never needed**, and the reason
generalises: a CST is what you need to RE-SERIALISE a document, and a
targeted span splice serialises nothing — it replaces `len` code units
at one offset and every other byte, comments and layout included,
survives by never being read. A whole-document rewrite would still need
one; nothing here does. The phase's own text is superseded in place
(g7-machine-access.md), with what the estimate missed in the other
direction: the `literal` role does not identify an editable span, and
the check that does is a round trip through the unifier. The design's load-bearing premises for them were
re-verified and all still hold — `maxcc = 9`, the `DisjunctVal.gen`
fold defect, and per-request re-unification in hover, which is what
would make LSP hover-provenance a config-gated increment rather than a
new cost class. Two premises the recorder settled instead of using:
the `update()` site-drop needed no surgery (a meet is recorded where
it happens, so nothing has to survive the drop), and `ctx._pathidx`
was not the key (the path string is, and it is what the report
prints).

Two smaller corrections stand: the `no_path` code G7.1 proposed
already existed (`errcodes.tsv`, landed by G2.1) and is what `get`
reports, and `ctx.find`/`explain` — which design option A proposes
documenting — are already documented in `docs/reference-api.md`.

**One CLI-wide hazard the verb surface created, closed later.** Every
verb dispatches on the FIRST argument only, and anything that matched
no verb fell through to the bare form as a file name — where the last
name won. So a mistyped or nonexistent verb was a SILENT SUCCESS:
`aontu vet2 schema.aon good.json` printed `good.json` and exited 0,
which in a tool loop reads as a passing validation of the data. `diff`
is library API in both ports and not a CLI verb, so it failed exactly
this way. The bare form now takes exactly one document — it was always
documented as `aontu [options] [file]`, singular — and a second file
name is a usage error, exit 2, naming the likely cause. A file
genuinely named like a verb is still reachable as `./vet`. Raised by
the 2026-08-21 status report ([status-2026-08-21.md](status-2026-08-21.md) §5);
pinned in both ports by `cli-mistyped-verb-is-a-usage-error` /
`TestRunMistypedVerbIsAUsageError` and their two-file twins.

**The loop the verbs exist for is now executed end to end**, which
until 2026-08-25 nothing did: the shared suite pins each verb in
ISOLATION, so every verb could be right and the loop still not close —
and walking it by hand is what found both defects §5 of the status
report opens with. `cli-repair-loop` (`ts/test/cli.test.ts`) and
`go/cmd/aontu/repairloop_test.go` drive emit → vet → why → set →
re-vet through the whole command in both ports, asserting the EXIT
CODE at every step, because a harness reads nothing else between them.
Three arms: the loop that closes (3 → 0 → 0 → 0, ending `valid`), the
pinned value that refuses the repair and leaves both files untouched
(1), and the schema that does not stand up (4, now with the finding
that says why). The second arm is the one G7.5 stage 2 exists to
change; it is pinned here so that change is visible when it comes.

**And the teaching documents are executed too** (`ts/test/docs.test.ts`,
the same date): every `aontu`/`aon` example in `index.md`,
`tutorial.md`, `how-to.md` and `reference-language.md` must parse, and
every one that states its result — an `aontu` fence immediately
followed by a `json` fence — must generate exactly that. The skill
sources have been held this way since G7.6; the prose documentation
was not, and a Diátaxis review found two idioms it taught that did not
do what the prose said.

One open question the phases just landed did NOT settle, deliberately:
the escape spelling for a key containing a dot. `get` splits paths
exactly as a REFERENCE does, so `$.esc.a.b` names nothing when the key
is `a.b` — pinned by a row rather than papered over. Inventing a
spelling for the query surface alone would leave the language's own
references behind; it is G4's to settle for both at once.

## G8 — generation, on the total side of the fork

| Phase | Size | Status | Pin |
|-------|------|--------|-----|
| **0** — staging rule | S | **LANDED** | Both deliverables. The `DisjunctVal.gen` distribution defect was **fenced** by probed guard rows in `test/spec/disjunct.tsv` with G1.0. The `KeyFuncVal` `cc < 3` delay is now the settled-position rule: `AontuContext.settle` / `Ctx.settle`, set by the pass loop (`ts/src/unify.ts`, `go/unify.go`) on the first pass whose input model is identical to the previous pass's, and read by `key()` in `ts/src/val/KeyFuncVal.ts` and `go/func.go`. Zero behaviour change across the existing suite in both ports. **Departure from the design**, in two respects. (a) The rule reads MODEL stability, not "the data argument is DONE": `move()` hides its source one pass *after* it copies it, so a value whose own path and arguments have settled can still be moved, and only stability of the whole model rules that out. (b) It is stated in the pass loop rather than in `FuncBaseVal`, because that is where the two consecutive models exist to compare; `FuncBaseVal` reads the flag. Landing it also exposed a real defect: `ListVal` had no apply-once-per-element spread guard (the `_spr` stamp `MapVal` has always had), so a list template that RESIDUATES was met into each element again every pass and its canon doubled — invisible under a three-pass delay, fatal under a rule that waits for stability. Fixed in `ts/src/val/ListVal.ts` and `go/listval.go`; pinned by the four `spread-nested-list-key*` rows in `test/spec/spread.tsv`, which the old rule failed with a spurious `scalar_value` error. |
| **1** — `pack` and `each` | M | **LANDED** | `ts/src/val/PackFuncVal.ts` and `ts/src/val/EachFuncVal.ts` (new), the `"pack"`/`"each"` arms of `go/func.go` with `go/generate.go` (new); both in both registries (24 → 26 builtins), both arity tables, both LSP completion lists and both published grammars. Codes `pack_data`, `pack_key`, `each_data` in `errcodes.tsv`. Spec: `test/spec/gen-pack.tsv` (25), `gen-each.tsv` (20), `gen-spread.tsv` (9), `gen-close.tsv` (7), `gen-key.tsv` (10) — 71 rows, every expectation from a parity probe run through both engines. Docs: "Generating children" in [`docs/reference-language.md`](../reference-language.md#generating-children-pack-and-each). **Departures and discoveries:** four, all recorded below. |
| **2** — `filter` and `match` | M | **LANDED** | `ts/src/val/FilterFuncVal.ts` and `ts/src/val/MatchFuncVal.ts` (new), the `"filter"`/`"match"` arms of `go/func.go` with `filterFunc`/`matchFunc` in `go/generate.go`; the trial-meet helper is shared (`trialUnify` in `ts/src/val/FuncBaseVal.ts` and `go/generate.go`), and is the mechanism disjunction already uses. Both in both registries (26 → 28 builtins), arity tables, LSP completion lists and published grammars. Codes `filter_data` and `match_none` in `errcodes.tsv`. Spec: `test/spec/gen-filter.tsv` (16) and `gen-match.tsv` (16) — 32 rows, every expectation from a parity probe run through both engines. Docs: "Selecting" in [`docs/reference-language.md`](../reference-language.md#selecting-filter-and-match). **Departures:** three, recorded below — two of them semantic, and both because the design's own examples cannot be evaluated under the rules it stated. |
| **3** — placeholder `_` (the parser phase) | M/L | **LANDED** | `ts/src/val/PlaceVal.ts` and `go/place.go` (new): the hole, plus the `hasPlace`/`fillPlace` walk both ports share. A bare `_` is a value keyword in both parsers (`ts/src/lang.ts`, `go/lang.go`), in both published grammars and in both LSP literal lists; a call holding a hole waits for a peer and is rebuilt with the peer in it (`FuncBaseVal.unify`/`OpBaseVal.unify`, `go/func.go`/`go/op.go`), and a placeheld operator DRIVES in `unite` because its peer is its filling rather than its constraint. Inside a generator's template `_` binds the source child (`pack`, `each`, `filter` in both ports). Code `place_pair` in `errcodes.tsv`. Spec: `test/spec/place.tsv` (37 rows), including the four that pin the BREAKING CHANGE — quoted `"_"`, a longer bare word, and `_` as a key all stay text. Docs: "The placeholder `_`" in [`docs/reference-language.md`](../reference-language.md#the-placeholder-_). **Departure:** one, recorded below. |
| **4** — `\|>` sugar | S | **LANDED** | Parse-time only, as designed: `ts/src/lang.ts` and `go/lang.go` gained one infix operator (`\|>`, LOOSEST of them all, so `a & b \|> f` pipes the whole meet) and one shared call builder each — `buildCall`, which both the `f(...)` handler and the pipe go through, so the arity check, the comma-group rule and the raw-value conversion are stated once. Code `pipe_target` in `errcodes.tsv`; the token in both published grammars. Spec: `test/spec/pipe.tsv` (24 rows), whose canon rows all show CALLS — no Val ever holds a pipe, which is what keeps canon and the two ports' agreement about it untouched. The plan allowed dropping this phase if call nesting proved acceptable; there was no adoption evidence either way, so it landed rather than being dropped on a guess. **Departure:** one, recorded below. |
| **5** — arithmetic, aggregation and projection | L | **LANDED 2026-08-27** | The review's finding I (use-cases/REVIEW.md), and the phase G8 deliberately did not build: it PRE-REGISTERED the semantics ("Arithmetic semantics, pre-registered") and left the building to whoever came next, so that they would inherit one decision instead of making six under deadline. Ten built-ins, 28 → 38. **ARITHMETIC AS FUNCTIONS** — `add` `sub` `mul` `div` `mod` `rem` (`ts/src/val/arith.ts` + `ArithFuncVal.ts`, `go/arith.go`): `-` `*` `/` `%` stay reserved as the boundary requires, the exact ladder and R5 contagion are the tower's existing law applied to five more operations, integer division TRUNCATES TOWARD ZERO (stated once here rather than left to whichever host `/` each port calls — Go's Quo truncates and its Div FLOORS, so picking the wrong one is a silent one-off in every negative case), and `rem` and `mod` differ only in whose sign the answer follows, which is the whole reason both exist. Three refusals, each because the answer would be a value Aontu cannot carry: `divide_by_zero` in every leaf including floats, `float_overflow` for a non-finite binary64 result, and `inexact_divide` for div/mod/rem over the DECIMAL leaf (one third has no finite decimal form, so the operation either rounds — the one thing that leaf exists to prevent — or refuses). **AGGREGATION** — `sum` `least` `greatest` (`AggFuncVal.ts`, `go/agg.go`) fold a finite, settled bag, `sum` through `add` so the tower's law arrives with it; named for the LATTICE's extremes rather than `min`/`max`, which are already the atoms for a BOUND. `sum([])` is 0 and `least([])` is an error: addition has an identity, comparison has none. **PROJECTION** — `pick(d, k)`, without which the aggregates cannot reach the case that motivated them, because `sum` needs a bag of NUMBERS and a model holds a bag of RECORDS. **Departures, four.** (1) THE FAMILY IS NUMERIC where `+` is polymorphic, which is what makes `add` more than a second spelling: `"500m" + "500m"` is the string "500m500m" — how a Kubernetes quantity silently becomes nonsense — and `add("500m","500m")` is a located error. Two spellings, two meanings, both kept. (2) `div`/`mod`/`rem` refuse a bigdecimal rather than implementing exact decimal division; `add`/`sub`/`mul` work the full ladder. Scaling to integers is the way out and is the money wire convention anyway. (3) NO `superior()` ARM for either family: an unresolved call could only advertise a kind once both operands were concrete scalars, and at that point it has RESOLVED, so `super()` sees the result and the arm is unreachable — written, then removed. (4) ONE new code short of the design's expectation: the integer-range refusal REUSES `inexact_integer_sum` rather than minting an `integer_overflow` beside it. The registry is a public contract and one code for one condition beats two that describe it. **A DEFECT FOUND ON THE WAY** (use-cases/BUGS.md 39): `float_overflow` is reachable through `+`, where a non-finite sum used to escape as `[aontu/internal]` in TypeScript and as Go's raw `json: unsupported value: +Inf` — no code, no site, invisible to a harness grepping `[aontu/` — with a Go CLI test PINNING the marshaller error as expected behaviour. Both ports refuse it at the operation now. Spec: `test/spec/arith.tsv` (59 rows) and `agg.tsv` (44), every expectation obtained by running BOTH engines and diffing; `canon` rather than `gen` throughout, because half of what these promise is the KIND of the answer and a gen row cannot see one. Docs: "Arithmetic" and "Aggregating" in [`docs/reference-language.md`](../reference-language.md#arithmetic-add-sub-mul-div-mod-rem). |
| **6** — JSON Schema export and the money wire convention | M | **LANDED 2026-08-27** | The other half of the review's finding I (use-cases/REVIEW.md): the interop wall, which the review calls "also a language question -- the constraint algebra maps cleanly onto JSON Schema's core, and the mapping should be specified while both sides are small". **THE EXPORT** — `aontu jsonschema` (`ts/src/jsonschema.ts`, `go/jsonschema.go`), a library call, a CLI verb and an MCP tool in both ports, emitting draft 2020-12. The mapping: `re`→`pattern`, `min`/`max`→`minimum`/`maximum`, `length`→the length keywords for the value's own type, `neq`→`not`/`enum`, a disjunction→`anyOf` (or `enum` where every member is a literal), a preference→`default`, `close()`→`additionalProperties:false`, an optional key→absent from `required`, a spread-templated list→`items` and a written list→`prefixItems`+`items:false`. Walks the UNIFIED value, not the parse tree, so what is exported is what the model MEANS. **A LOSS IS NEVER SILENT, and never replaces the schema.** `must()`, an exact numeric leaf and an unresolved residue cannot be said in JSON Schema; each is reported as a `SchemaLoss` on stderr BESIDE the schema on stdout, because a weaker schema is still a usable one and a redirect must keep the two apart. `--strict` turns the report into a refusal; `--format json` puts both in one envelope. **THE MONEY WIRE CONVENTION** — the part of finding I that asked for a convention "more than it needs new machinery", and it took none. Money crosses as a decimal STRING at a fixed scale with an optional-but-CONSTANT conversion mark (`dec?: "bigdecimal:2"`) naming the leaf and the scale: optional so a producer is never asked for it, constant so one that sends it cannot contradict it (a preference could not make that check — it is a default, so `dec:"float"` would vet clean), and exported as a `const` outside `required` so a consumer holding only the JSON Schema learns both. [`docs/how-to.md`](../how-to.md#carry-exact-money-over-json) carries it with the three details that decide a correct implementation: the sign goes OUTSIDE the `0d` prefix (`0d-12.05` is not a literal), scale is not part of the value (`0d10.50` and `0d10.5` are the same number and canon prints the shorter), and at scale 0 the point must still be written or the value lands on the `biginteger` leaf. `use-cases/10-data-model/money-wire.aon` and `money-convert.aon` are the executable form; gap 1 ("exact money is unreachable from plain JSON") is answered. **A DEFECT FOUND ON THE WAY** (use-cases/BUGS.md 41), by the parity probe the convention needed anyway: a `NilVal` took its PATH from the operand it blames, which decides the site correctly and the path only by accident — every conflict inside a referenced record named the RECORD, identically for every one of its fields, and a conflict against a minted operand named `$`. Fixed in both ports by taking the driving location where it EXTENDS the operand's path; the unconditional form was tried and reverted (it moves every closed-key, spread-template and `--at` finding). One case stays open in `test/spec/divergent.tsv`: a reference to a target DEEPER than the referring field leaves one stale segment in TypeScript, whose real fix is a TS twin of Go's `cloneAt`/`overlayPath`. Spec: `test/spec/jsonschema.tsv` (54 rows) plus two in `vet.tsv`, every expectation obtained by running BOTH engines and diffing. |

**Departures and discoveries recorded by G8.1.**

1. **The template is CLONED per destination, never shared.** A spread
   may share a template that holds nothing path-dependent
   (`MapVal.spreadClone`), because a spread CONSTRAINS a child that
   already exists; a generator's template IS the child, and a child is
   a position. Sharing left every generated child pointing at the
   template's own parse-time location — visible as the site an error
   inside a generated child reports (`$.o.NaN` rather than `$.o.0`).
2. **`key()` under a call needed a rule, and the two ports needed
   DIFFERENT tests for it.** A `key()` the bag walk reaches directly is
   re-pathed by its own residuation clone every pass; one nested inside
   a function or operator ARGUMENT is never reached that way, so it
   answered for the position the template was WRITTEN at — which is the
   one position a template is never used at, and which made
   `"acme/" + key() + ":1.4.2"` (the design's own flagship line) answer
   the same wrong name for every generated child. Both ports now prefer
   the DRIVING position, and neither could use the other's test for
   when to: TypeScript's parse-time path for a function argument
   carries a segment that is not a key at all, so it asks whether the
   stored path IS a position; Go's carries the call's own path, so it
   asks whether the driver is DEEPER than anything the value has been
   placed at. Same answers, pinned by `gen-key.tsv`; recorded in
   DIVERGENCE.md.
3. **The Go port's path-dependence walk was missing operators.**
   `computePathFunc` (`go/mapval.go`) had no `*PlusOpVal` arm, while
   the TypeScript getter walks any array peg and therefore sees
   through one. A template holding `"x" + key()` was classified
   path-INdependent and shared, so every destination got the FIRST
   one's key. A generator's template is the first place that
   difference reaches the OUTPUT rather than a canon, which is how it
   surfaced.
4. **The comma group is expanded for a NAMED SET of functions.** Both
   parsers expanded a multi-argument call's comma group back into
   separate arguments for `deprecate` alone, by name. `pack` and
   `each` need the same, and the constraint atoms must NOT have it
   (`neq(1,2)` is one argument list, not two positions), so the test
   is now a set — `positionalArgFuncs` / `POSITIONAL_ARG_FUNCS` — in
   both ports rather than a name comparison.

One thing this phase did NOT fix, found while landing it and left
recorded rather than silently carried: **`"x" + key()` inside a `&:`
spread template does not resolve** (`mapval_spread_required`). It
predates the staging rule — verified against the tree as it stood
before G8 phase 0 (a pre-#68 branch commit whose hash was squashed
away) — and is a separate defect in how a bag decides it is
done while an operator inside a spread-applied child still holds a
residuating argument. `pack` and `each` are unaffected, which is why
this phase does not carry the fix.

**Departures recorded by G8.2.**

1. **`filter` selects by ALREADY SATISFIES, not by unifiability.** The
   design says "children of `data` that unify with `cond` are kept",
   and under that rule its own example — `filter($.services,
   {debug:true})` — keeps every service: a map is OPEN, so a service
   with no `debug` key unifies with `{debug:true}` perfectly well by
   gaining it. A filter that keeps everything that could be made to
   match keeps everything. What landed keeps a child when the meet
   CHANGES NOTHING (it succeeds and its answer is the child), which is
   the same question `subsume` asks, answered locally by canon
   equality. `gen-filter.tsv`'s first row is the case that settles it.
2. **`match` answers with the RESULT, not with `v & p & r`.** Under
   the design's rule every arm whose result is not itself a `v` is a
   contradiction — including the design's own example, whose scrutinee
   is a string and whose results are maps, and which therefore cannot
   be evaluated at all. A match MAPS a value to another value; a
   document that wants the scrutinee kept can say so, the scrutinee
   being a value it can name.
3. **Go's staged arguments are COPY-ON-WRITE.** A clone shares its
   arguments with the value it was cloned from — deliberately, for the
   sharing the `move()` ghost cases depend on — so driving an argument
   in place wrote it into every sibling clone as well. A generator's
   template, cloned once per destination, is exactly a set of siblings
   that must answer differently: `pack($.n, {t: match(key(), …)})`
   gave every child the FIRST child's answer. Each staged func now
   takes ownership of its argument list the first time it advances
   one. TypeScript needed no equivalent (its clone hands out a fresh
   arg array), which is the sort of asymmetry the shared rows exist to
   catch — `gen-match.tsv:match-inside-pack` is the row that caught it.

**Departure recorded by G8.3.**

1. **`filter`'s CONDITION is a template, not a driven argument.** The
   phase-2 implementation drove both of filter's arguments to done
   before firing, which is right for the data and wrong for the
   condition: a condition is tested against each child AT THAT CHILD'S
   POSITION, so it may hold a `_` (the child it is being tested
   against) or a relative reference, and neither has an answer at the
   call site. Driving it there froze both — `filter($.l, _)` could not
   resolve at all. The condition is now left standing and cloned per
   child, exactly as `pack`'s and `each`'s templates are. Found by the
   placeholder: the `_`-in-a-condition binding phase 2 wrote was
   unreachable until this changed, which is what the coverage floor is
   for.

**Departure recorded by G8.4.**

1. **A constraint atom that BUILT cannot be piped into.** The design
   said only that the piped value becomes the first argument. Rebuilding
   the call from the value the parser produced works for a function and
   for a call the arity check refused (which carries what it was written
   as), but not for a constraint atom that succeeded: an atom folds into
   a RESIDUAL at construction, and the Go port's residual keeps no atom
   name to rebuild from. Rather than let one port support `1 |>
   neq(2,3)` and the other not, both refuse it — and the refusal is
   defensible on its own terms, because an atom with a complete argument
   list is a residual rather than a call waiting for a subject, and
   `1 & neq(2,3)` is what that document meant. Pinned as
   `pipe.tsv:pipe-into-built-atom`.



## Corrections outstanding in the gap documents

Recorded here rather than fixed silently, because each is a change to a
design document and belongs in a commit with its reasoning.

**The list this section carried is now empty.** All ten entries have
been applied — four (the "design proposal" headers, `docs/trust.md`'s
depth-budget self-contradiction, `AGENTS.md` on the divergence ledger,
and `docs/test-coverage.md`'s per-file table) in commit `94b63f9`,
which is also the commit that wrote the list; the remaining six with
the G1 phase 4–5 landing. What changed, for a reader tracing the
history:

- G1's problem statement, Phase 6 text and Risks table, and its
  open-questions list now match what landed — the current builtin
  roster with the
  atoms routed through `constraintAtoms`, exactness rather than the
  `(2^53, 2^63)` magnitude band, and the two questions phase 0 decided
  (lazy endpoints with eager emptiness; `length` in Unicode code
  points) struck through with their rulings.
- All eight plan preambles now link protocol rule 5 above instead of
  restating a row count; none of the eight had a current one.
- `parse(canon(v)) == v` is gone from the gap documents' guarantees,
  replaced by canon convergence — the property both runners actually
  assert. It survives only where G1, G2 and G5 quote the retracted
  phrasing in order to retract it.
- The drifted `makeModelResolver` "~line 750" citations in G6 and G7
  now name the file without a line number, which is the form that
  cannot drift again.

Keep this section, and add to it, when the next phase lands
differently from its design: the standing hazard is a gap document
that reads as current while describing a rule the engine no longer
has.

## Where this is pinned

Nothing in this file is machine-checked; it is prose, held accurate by
protocol rule 1 alone. The suite counts in rule 5 are the exception —
they carry their reproduction commands, so a reader can falsify them in
two shell lines. If this register and a gap document disagree, **this
file is wrong until re-verified against the tree**: the gap documents
are older and were written before any of it landed, so they cannot be
evidence of status, but neither can a register nobody re-checked.
Re-derive from `test/spec/`, `ts/src/`, `go/` and `git log`.
