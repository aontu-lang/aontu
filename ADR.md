# Architecture Decision Record

This is the register of **fundamental** decisions for Aontu: the small
set of choices that everything else in the repository is built on, and
that a contributor (human or agent) must not quietly reverse.

An entry belongs here when reversing it would change what the project
*is* rather than how one part of it works. Ordinary design choices —
which data structure a pass uses, how a message is worded — live in the
code and in [`docs/`](docs/), not here.

Each entry states the decision, the context that forced it, the
consequences we accept in exchange, and how the decision is enforced in
practice. Entries are append-only and numbered in order. A decision that
no longer holds is not deleted: its status changes to **Superseded by
ADR-NNN**, so the reasoning that led there stays readable.

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-001](#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec) | TypeScript and Go stay at full parity, driven by a shared spec | Accepted |
| [ADR-002](#adr-002--test-coverage-stays-at-100--in-both-implementations) | Test coverage stays at 100 % in both implementations | Accepted |
| [ADR-003](#adr-003--host-provided-semantics-are-normalised-not-trusted) | Host-provided semantics are normalised, not trusted | Accepted |
| [ADR-004](#adr-004--a-preference-override-must-be-admitted-by-its-disjunction) | A preference override must be admitted by its disjunction | Accepted |
| [ADR-005](#adr-005--template-instantiation-is-per-destination) | Template instantiation is per-destination | Accepted |

---

## ADR-001 — TypeScript and Go stay at full parity, driven by a shared spec

**Status:** Accepted

### Context

Aontu ships two implementations: TypeScript in [`ts/`](ts/) (canonical,
published to npm) and Go in [`go/`](go/) (a port). Two implementations
of a *language* are not two libraries that happen to do similar things.
A configuration document is an asset that outlives the tool that reads
it: the same `.aontu` file gets unified by a Node CLI in a developer's
editor, by a Go binary in a deployment pipeline, and by an LSP server in
between. If those disagree — even about which of two conflicting values
is named first in an error — the language has no single meaning, and
every document becomes implementation-specific in a way its author
cannot see.

The failure mode is not dramatic. It is a slow drift: a port fixes a bug
the canonical side still has, an optimisation reorders a fold, a
convenience is added on one side only. Each step is defensible in
isolation and the sum is two dialects.

### Decision

**The two implementations are kept at full parity for every behaviour
either of them exposes, and that parity is proved by a shared,
data-driven spec rather than by inspection.**

Concretely:

1. **TypeScript is canonical.** Where the two disagree and neither is
   obviously broken, the TypeScript behaviour is the specification and
   the Go port changes. The port mirrors TS *structure*, not just TS
   results, so the two stay readable side by side — a reviewer must be
   able to hold `ts/src/val/RefVal.ts` and `go/ref.go` open together and
   match them arm for arm.

2. **Shared rows are the contract.** Behaviour is pinned in
   `test/spec/*.tsv`, loaded and executed by *both* engines
   (`ts/test/spec.test.ts` and `go/spec_test.go`). A row is the
   preferred form of every test: it costs one line, it checks both
   implementations, and it cannot rot on one side only. Per-port unit
   tests are for what a row cannot express — internal representation,
   defensive branches, tooling walks — never for language behaviour.

3. **Probe both engines before pinning.** A new row's expectation is
   *derived by running both implementations and comparing bytes*, never
   written from belief about what should happen. Where they already
   agree, the row locks the agreement in. Where they differ, the
   difference is a finding, not a nuisance.

4. **Divergences are registered, never absorbed.** A difference that
   cannot be fixed immediately (an upstream lexer bug, a decision the
   maintainer must make) is written into the ledger
   [`test/spec/divergent.tsv`](test/spec/divergent.tsv) with an issue
   number, and removed — not amended, not marked "closed" in place — the
   moment shared rows cover the fixed behaviour. An unregistered
   divergence is a defect.

5. **Errors are behaviour.** Codes, classes, hint text, frame layout and
   operand order are part of what the language promises, and are pinned
   like any other result (`test/spec/errcodes.tsv`, `error.tsv`, the
   `errc` mode, and byte-exact full-message twins).

### Consequences

- Any change to language behaviour is a change to **both** ports plus
  the rows that pin it, in one commit. A PR that moves one side only is
  incomplete by construction.
- Porting effort is a permanent cost of every feature, and features are
  designed knowing this. It is bought back in confidence: two
  independent implementations agreeing byte-for-byte on ~1,500 cases is
  a much stronger statement than either passing its own suite.
- Some Go code exists only to mirror a TypeScript shape (a defensive arm
  the Go control flow cannot reach). We keep it, marked and justified,
  rather than let the two structures drift apart — see ADR-002 for how
  such code is accounted for.
- The shared suite constrains refactoring: an internal change that alters
  an error's operand order shows up as failing rows. That friction is
  the mechanism working, not a problem with the suite.

See [`docs/shared-spec.md`](docs/shared-spec.md) for the row formats and
the ledger protocol, and [`AGENTS.md`](AGENTS.md) for the probe-first
workflow.

---

## ADR-002 — Test coverage stays at 100 % in both implementations

**Status:** Accepted

### Context

ADR-001 makes the shared spec the contract, but a contract only binds
the code it actually executes. Coverage is how we tell the difference
between "the suite passes" and "the suite exercises the engine". A
partially-covered engine hides two specific dangers:

- **Silent asymmetry.** A branch that no test reaches can be correct in
  one port and wrong in the other, and the shared rows will never say
  so. Uncovered code is precisely where ADR-001's guarantee stops
  holding.
- **Unfalsifiable claims.** "Behaviour X is pinned" is only true if some
  row or test drives the code implementing X. Without coverage as a
  check, that claim degrades quietly as the engine changes underneath.

A target below 100 % does not work as a policy, because it gives no
signal: at 95 % the uncovered 5 % is an unexamined pile that grows
whenever someone is in a hurry, and no reviewer can tell a deliberate
gap from an accident.

### Decision

**Both implementations are held at 100 % coverage — Go statement
coverage and TypeScript line, branch and function coverage — with every
exclusion carrying a written justification in the source.**

Concretely:

1. **100 % is the floor, checked by `make cov`.** Dropping below it is a
   regression like a failing test, not a style nit.

2. **A gap is closed with a test, in this order of preference:**
   (a) a shared row in `test/spec/*.tsv` — one row lifts both engines;
   (b) a per-port unit test, when no source input can reach the code
   (internal representation, tooling walks, constructed-Val paths);
   (c) an exclusion marker, only when neither is possible.

3. **Exclusions are rare, marked, and argued.** A marker
   (`/* node:coverage ignore next N */` in TypeScript,
   `//coverage:ignore` in Go) must be accompanied by a comment saying
   *what state would be required to reach the code and why nothing can
   produce it*. "Hard to test" is not a justification; "this arm mirrors
   the canonical port's shape and this port's control flow cannot reach
   it" is. Reviewers treat an unexplained marker as a defect.

4. **Prefer deleting dead code to excluding it.** When investigation
   shows a branch is unreachable *and* nothing depends on its shape, the
   right change is to remove it. Markers are for code that must stay:
   ADR-001 mirrors, API-mandated error returns, defensive guards on
   external contracts, and language/runtime artifacts (compiler-emitted
   helpers, export blocks, process entry points).

5. **Coverage is never bought with hollow tests.** A test exists to pin
   behaviour; if the only reason to write it is to move the number, that
   is a signal the code is dead (rule 4) or that the real assertion has
   not been found yet. Tests that call code without asserting its effect
   are worse than the gap they close, because they make the counter lie.

### Consequences

- New code arrives with its tests, because merging it otherwise breaks
  the floor. This is the point.
- Some of the suite exists to reach defensive code rather than to
  describe language behaviour. Those tests live in clearly-named
  per-port files (`go/coverage*_test.go`, `ts/test/coverage*.test.ts`)
  so the behavioural suites stay readable as documentation.
- The measurement pipeline is part of the deal and is maintained as
  such: `make cov-go` runs the command binaries under `GOCOVERDIR` so
  their `main()` functions are genuinely executed rather than waved off;
  the TypeScript entry points are thin `bin/` wrappers so the
  instrumented modules contain no unexecutable process glue; and the
  gate reads the lcov report rather than the runner's own summary
  table, which miscounts `export` accessors. `make cov` FAILS below
  100 % — the floor is checked, not eyeballed.
- The remaining exclusions are enumerated with their rulings in
  [`docs/test-coverage.md`](docs/test-coverage.md). That list is meant
  to stay short and to be re-examined whenever the surrounding code
  changes: an exclusion whose justification no longer holds is a bug.
  As of the round that first reached 100 %, it is twenty Go statements
  (plugin registration, pre-vetted digit parses, ADR-001 shape mirrors,
  two `main()`s) and, in TypeScript, the export blocks alone.

---

## ADR-003 — Host-provided semantics are normalised, not trusted

**Status:** Accepted

### Context

ADR-001 keeps two implementations at one meaning. It is enforceable
because almost everything either port does is *ours*: we wrote the
unifier, the number tower, the canon renderer, so when they disagree one
of them has a bug we can fix.

`re()` broke that assumption. A pattern is handed to a **host**
subsystem — JavaScript's `RegExp` in TypeScript, RE2 in Go — and those
are not two implementations of one specification. They are different
languages, in different complexity classes, over different alphabets.
Neither can be fixed from this repository.

The first attempt was a **blacklist**: enumerate the constructs known to
differ, refuse those, hand the rest to the host engines. It leaked three
times in one day.

1. `\A` and `\z` are anchors in RE2 and *identity escapes* — a literal
   `A`, a literal `z` — in JavaScript. Both engines compiled the pattern
   and returned different answers.
2. `\s` is Unicode whitespace in JavaScript and ASCII-only in RE2, so
   `re("^\s$")` matched U+00A0 in one port and refused it in the other.
3. JavaScript matches UTF-16 **code units** where RE2 matches **code
   points**, so `re("^.$")` accepted U+1D11E in Go and refused it in
   TypeScript — and `re("^..$")` did the exact reverse.

Two of the three were found by review and one while writing
documentation; none by a test. That is the diagnostic. A blacklist's
correctness is a claim about the *author's knowledge* of two large
external systems, it degrades silently as those systems evolve, and
nothing in the suite can falsify it.

The three failures also share a shape. Every one is a construct whose
expansion is **engine-defined** — an abbreviation (`\s`, `\d`, `.`), a
spelling (`\A`), or the alphabet itself. Strip those away and what
remains is the classical regular-expression core, whose meaning over a
fixed alphabet is mathematically determined and leaves no room to
disagree.

### Decision

**Where a host subsystem supplies semantics, Aontu defines the meaning
and rewrites the input to an unambiguous form. The host is given only
constructs it cannot interpret two ways.**

Concretely, for `re()`:

1. **Aontu defines the abbreviations**, and inherits neither host's:
   `\d` is `[0-9]`, `\w` is `[0-9A-Za-z_]`, `\s` is
   `[ \t\n\r\f\v]`, `.` is `[^\n]`, `\A` is `^`, `\z` is `$`,
   and the negated forms follow. The definitions are the small ASCII
   ones deliberately: a config value containing U+00A0 is a mistake to
   catch, not a space to accept in silence.

2. **Normalisation happens before compilation.** `normaliseRe`
   (`ts/src/val/ConstraintVal.ts`, `go/constraint.go`) rewrites the
   pattern; only the rewritten form reaches `RegExp` or `regexp`. The
   two normalisers are mirrored statement for statement.

3. **The alphabet is fixed.** TypeScript compiles with the `u` flag so
   both engines match code points.

4. **Refusal is reserved for what cannot be rewritten**: a construct one
   engine simply lacks (backreferences, lookaround — not regular
   languages at all), a spelling whose meaning changes wholesale
   (`(?...)` other than `(?:`), and a difference of *cost* rather than
   meaning (a quantifier over a group containing a quantifier or
   alternation — see ADR-003's consequence on termination below).

5. **Canon renders the pattern as written, never the normalised form.**
   Canon round-trips source and G6's semantic hash will be taken over
   canon, so normalisation must not leak into it.

6. **The claim is checked, not asserted.**
   `test/spec/files/regex-corpus.tsv` pins the verdict of both
   normalisers over a generated corpus; both ports assert against it, so
   a drift fails in whichever port drifted. The corpus is generated
   offline and committed — a fuzzer that reseeds in CI is a flaky test,
   and this project pins determinism as a contract.

### Consequences

- **The guarantee stops depending on our knowledge of the hosts.** We no
  longer have to know every difference between `RegExp` and RE2; we have
  to know that the constructs we emit are unambiguous, which is a much
  smaller and more stable claim.
- **Authors get a larger subset, not a smaller one.** `\s`, `\d`,
  `\A` and `.` are all usable again. Normalising is strictly more
  permissive than refusing.
- **Aontu owns a semantic decision it previously delegated.** `\s` no
  longer means what your regex habits expect in either language; it
  means what this ADR says. That must be documented at the point of use,
  and the refusal message names the subset.
- **One axis is not closed by this decision.** Complexity is not a
  property of the pattern language: JavaScript's backtracking makes
  `(a+)+$` exponential where RE2 is linear, and no rewriting fixes that.
  It is held by a syntactic restriction instead, which is why
  `docs/trust.md` clause 2 says pattern matching is bounded *by
  construction* rather than by budget. **The principled end state is to
  own the matcher** — parse to an AST, compile to a Thompson NFA, run it
  in both ports — at which point there is no host subsystem, the
  restriction can be lifted, and the termination clause becomes true
  rather than approximated. That is recorded here as the accepted
  direction, not scheduled.
- **The rule generalises beyond regex**, and is stated that way on
  purpose. Any future capability that delegates meaning to a host
  subsystem — a date parser, a collation order, a number formatter —
  inherits this decision: define it here, rewrite the input, and give
  the host only what it cannot misread.

See [`docs/reference-language.md`](docs/reference-language.md#re-and-the-portable-pattern-subset)
for the author-facing subset, and
[`docs/trust.md`](docs/trust.md#clause-2--termination) for the
termination consequence.

---

## ADR-004 — A preference override must be admitted by its disjunction

**Status:** Accepted (2026-08-26)

### Context

`*x` is a default, and the single most common schema pattern in
existence is "one of A|B|C, default A". Until this decision, aontu had
no on-field spelling for it: a same-kind concrete peer replaced a
preferred value *without consulting the disjunction's other
alternatives*, so `k: *'auto'|'literal'|'data'` met by `k: 'autoo'`
answered `"autoo"` with exit 0, and `port: *8080 | (integer & neq(80))`
met by `port: 80` bypassed an alternative that *explicitly excludes*
the override. The 2026-08 language review
([use-cases/REVIEW.md](use-cases/REVIEW.md), finding A;
[use-cases/BUGS.md](use-cases/BUGS.md) §1–5) verified the consequence
across five forms and across all four production consumers: every one
had independently concluded literal disjunctions cannot be used, and
kept enums in strings, downstream code, or prose. A `*` that widens
the admitted set to its whole kind is not a default in the sense any
user of any config system understands the word.

Two adjacent defects share the root. A rank≥2 preference read its
override gate from its immediate peg — itself a preference, whose
superior is top — so ANY conjunct silently swallowed a ranked default
(`**1.5 & float` was an error; `**2|integer` met by `integer` lost the
default). And `match()` tested its patterns against the still-open
preference, so a pattern could *select an arm by overriding the
default*, deriving a value that contradicted the value generated
beside it.

### Decision

**A peer that meets a scalar preference inside a disjunction must be
admitted by the disjunction itself: by at least one alternative, or by
the preferred value (the preferred branch's own admitted set). An
inadmissible override makes the meet the empty disjunction — the
existing `|:empty` refusal.** With it, two companion rules:

1. **The rank-uniform meet.** A preference of any rank defends the
   *innermost* preferred value's kind: `**1.5` gates exactly as `*1.5`
   does. One rule, every rank.
2. **The defaulted scrutinee.** `match()` on a settled scrutinee that
   carries an effective default tests patterns against the
   generation-effective value — the value the document will actually
   emit — never against the open preference.

The bare-preference kind gate is unchanged (`a:*1` + `a:2` is 2,
`a:*1` + `a:"s"` is refused), and structural defaults stay ungated,
the same boundary the kind gate always had.

### Consequences

- **This is a breaking language change**, taken deliberately.
  `*'auto'|'literal'|'data'` now means what every consumer already
  believed it means. The one known idiom that leaned on the open
  override — apidef's machine-emitted `*(x)|top` — keeps its meaning
  *because* of the gate's shape: the `top` branch admits every
  override, so a deliberately open default states its openness
  explicitly (`*x | top`).
- **The `pref_not_instance` lint becomes advisory.** The soundness
  hole it guarded (a generated default the disjunct itself refuses) no
  longer exists; it now marks a default that is admitted only by being
  the default — the shape of a typo — and its sanctioned fix (repeat
  the branch) now genuinely enforces. See the decision note in
  `ts/src/vet.ts`.
- **The bundled `std/system` vocabulary tightens.**
  `direction: *in|out|inout` is a true enum-with-default; `sideways`
  is now refused.
- **Enforced by the shared spec** (ADR-001 discipline): the
  `pref-admit-*` rows in `test/spec/pref.tsv`, the flipped
  `pref-nested-concrete-wins` and `pref-rank2-*` rows there, the
  flipped `port-direction-refuses-nonmember` row in
  `test/spec/std-system.tsv`, the `vet-enum-default-*` rows in
  `test/spec/vet.tsv`, and the `match-defaulted-scrutinee-*` rows in
  `test/spec/gen-match.tsv` — every expectation parity-probed in both
  engines.

See [`docs/reference-language.md`](docs/reference-language.md#preference--default-)
for the author-facing rules.

---

## ADR-005 — Template instantiation is per-destination

**Status:** Accepted (2026-08-26)

### Context

The generation story (G8) rests on one sentence of the language
reference: *"Each generated child is `tmpl` cloned at that
destination, so `key()` and relative references inside the template
answer for the child."* The 2026-08 language review
([use-cases/REVIEW.md](use-cases/REVIEW.md), finding B;
[use-cases/BUGS.md](use-cases/BUGS.md) §8–12, §33–35) verified that
the clone was not an instance: the base clone shares a call's
argument Vals, a preference's inner value and an operator's operands
by reference (deliberately — the move()/copy() ghost rows pin that
sharing), so the moment a template composed — `close()` around it, a
rank-2 default in it, an expression in it, a nested generator, a
`hide()`/`type()` wrapper near it — the FIRST destination's
resolution of the shared innards answered for every destination.
Every failure was silent wrong output with exit 0, in the exact
idioms generation exists for: per-child keys stamped with the first
child's key, overlays absorbed into template holes, a nested pack's
`_` bound to the outer source, hidden generated children emitting
empty, type-marked aliases suppressing the fields that referenced
them.

### Decision

**A value that is multiplied over destinations is instantiated per
destination, fully.** Concretely, three rules:

1. **The instance owns its structure, to the leaves.** Pack/each
   template clones, filter-condition trials and applied spread
   constraints deep-clone function arguments, preference pegs and
   operator operands (the `dup` clone flag in TypeScript,
   `instanceClone` in Go), and every path inside the instance is
   normalised to the destination — the path shape the parser itself
   would assign there (`repathInstance` in TS mirrors the Go
   `setPaths`). Nothing else changes its sharing: residuation,
   reference-resolution and move()/copy() clones keep the pinned
   ghost semantics.
2. **A hole belongs to its nearest enclosing generator.** Neither the
   hole test (`hasPlace`) nor the fill walk crosses into a
   generator's template or condition argument from outside; a hole in
   a *data* argument is not a binding position and stays visible.
3. **A mark belongs to the field its wrapper was written at.** A
   reference that finds a still-pending `type()`/`hide()` call defers
   until the wrapper has resolved at its own field, then copies with
   marks cleared as the marks contract documents — it never clones
   the call to resolve (and stamp) at the referring site. A marked
   peer-only child in a map meet is carried, never wrapped as an
   expectation.

### Consequences

- The documented template contract becomes true under composition:
  `close × pack × key()`, rank-pref × key() × pack,
  close × pack × hole × overlay, nested pack × hole,
  hide × pack × downstream-ref, type-mark × alias-ref × conjunction
  (inline and include-crossing), and expressions in templates all
  answer per destination. The review's minimal repros are the
  acceptance suite and every fixed behaviour is pinned by
  parity-probed shared rows (see the CHANGELOG entry for the list).
- One canon flip, deliberate: a path-dependent spread template canons
  as written instead of with the last destination's resolution baked
  into it (`spread.tsv` spread-close-template-canon). Applications
  are unchanged.
- Instantiation costs a deep clone per destination for
  path-dependent templates. The cost is scoped — the path-independent
  sharing tiers (`spreadClone` tiers 1–2) are untouched, and a
  400-service double-close pack model evaluates in ~0.25s (TS) /
  ~0.10s (Go).
- What this ADR does NOT fix is named in BUGS.md: the unequal-spread
  sibling crosswire (§6–7, the `TODO: handle existing spread!`
  machinery) and expressions reading the generated child's own fields
  through a merge (§36) have different roots and remain open.
- Enforced by the shared spec (ADR-001 discipline) and by both ports
  changing together; the mark/hole rules are author-facing in
  [`docs/reference-language.md`](docs/reference-language.md)
  ("Generating children", "The placeholder `_`", "Marks").
