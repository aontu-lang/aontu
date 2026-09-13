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

An entry that should not have been admitted is not deleted either. Its
status becomes **Relocated to #NNN**, its record moves to that issue in
full, and its heading stays here so the citations in the code, the spec
and the CHANGELOG still resolve. Numbers are never reused.

An entry whose own enforcement clause has been reached — it said what
would end it, and that happened — becomes **RETIRED <date>**. Its
heading and status stay for the same reason, and its body is replaced
by what reached the clause and where the record now lives, which for a
capability decision is the phase rows it governed in
[`docs/capability-review/progress.md`](docs/capability-review/progress.md).

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-001](#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec) | TypeScript and Go stay at full parity, driven by a shared spec | Accepted |
| [ADR-002](#adr-002--test-coverage-stays-at-100--in-both-implementations) | Test coverage stays at 100 % in both implementations | Accepted |
| [ADR-003](#adr-003--host-provided-semantics-are-normalised-not-trusted) | Host-provided semantics are normalised, not trusted | Accepted |
| [ADR-004](#adr-004--a-preference-override-must-be-admitted-by-its-disjunction) | A preference override must be admitted by its disjunction | Accepted |
| [ADR-005](#adr-005--template-instantiation-is-per-destination) | Template instantiation is per-destination | Accepted |
| [ADR-006](#adr-006--template-application-is-stateless-and-a-generator-snapshots-a-settled-source) | Template application is stateless, and a generator snapshots a settled source | Accepted |
| [ADR-007](#adr-007--an-unresolved-disjunction-is-not-a-value-and-vet-asks-the-same-question-the-evaluator-does) | An unresolved disjunction is not a value, and vet asks the same question the evaluator does | Accepted |
| [ADR-008](#adr-008--constraints-are-named-not-spelled-with-operators) | Constraints are named, not spelled with operators | Accepted |
| [ADR-009](#adr-009--there-are-no-reserved-path-elements-key-self-and-parent-are-removed) | There are no reserved path elements: `$KEY`, `$SELF` and `$PARENT` are removed | Accepted |
| [ADR-010](#adr-010--no-magic-keys-or-paths-the-tree-at-all-levels-is-user-space) | No magic keys or paths: the tree at all levels is user space | Accepted |
| [ADR-011](#adr-011--the-star-is-sugar-the-disjunction-is-the-structure) | The star is sugar; the disjunction is the structure | Accepted |
| [ADR-012](#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused) | An include's extension decides what the file is: Aontu source, config data, or refused | Accepted |
| [ADR-013](#adr-013--the-project-operates-one-transparency-log-and-nothing-else) | The project operates one transparency log, and nothing else | Superseded in part by [ADR-019](#adr-019--the-project-stores-module-bytes-and-federates-the-log) |
| [ADR-014](#adr-014--the-tree-is-the-namespace-there-is-no-identity-mark) | The tree is the namespace: there is no identity mark | Accepted |
| [ADR-015](#adr-015--paths-are-first-class-values-pathp-captures-and-a-vacuous-constructor-call-is-a-kind) | Paths are first-class values: `path(p)` captures, and a vacuous constructor call is a kind | Superseded in part by [ADR-016](#adr-016--a-string-is-never-a-path-conversion-lives-in-the-call-and-paths-meet-by-prefix) |
| [ADR-016](#adr-016--a-string-is-never-a-path-conversion-lives-in-the-call-and-paths-meet-by-prefix) | A string is never a path: conversion lives in the call, and paths meet by prefix | Accepted |
| [ADR-017](#adr-017--the-builtin-call-surface-is-declared-parsed-by-both-ports) | The builtin call surface is declared, parsed by both ports | Accepted |
| [ADR-018](#adr-018--the-pipe-operator-is-removed) | The pipe operator is removed | Relocated to [#188](https://github.com/aontu-lang/aontu/issues/188) |
| [ADR-019](#adr-019--the-project-stores-module-bytes-and-federates-the-log) | The project stores module bytes, and federates the log | Accepted |
| [ADR-020](#adr-020--a-module-path-is-domainpath-and-the-domain-is-a-proved-namespace) | A module path is `<domain>/<path>`, and the domain is a proved namespace | Superseded in part by [ADR-022](#adr-022--compatibility-is-computed-so-the-major-leaves-the-name) |
| [ADR-021](#adr-021--the-project-hosts-private-packages-with-authenticated-reads) | The project hosts private packages, with authenticated reads | Accepted |
| [ADR-022](#adr-022--compatibility-is-computed-so-the-major-leaves-the-name) | Compatibility is computed, so the major leaves the name | Accepted |
| [ADR-023](#adr-023--g9-completes-at-the-renderer-the-reflection-sidecar-the-jostraca-bridge-and-string-interpolation-are-retired) | G9 completes at the renderer: the reflection sidecar, the Jostraca bridge and string interpolation are retired | RETIRED 2026-09-11 |
| [ADR-024](#adr-024--the-forges-token-authorises-a-publish-and-sigstore-is-one-provider-of-the-proof-not-its-definition) | The forge's token authorises a publish, and Sigstore is one provider of the proof, not its definition | Accepted |
| [ADR-025](#adr-025--a-references-copy-is-an-instance-and-a-match-does-not-fire-on-an-unfilled-hole) | A reference's copy is an instance, and a match does not fire on an unfilled hole | Accepted |
| [ADR-026](#adr-026--each-is-retired-form-carries-the-bound) | `each` is retired: `form` carries the bound | Relocated to [#189](https://github.com/aontu-lang/aontu/issues/189) |
| [ADR-027](#adr-027--the-list-generator-is-named-each-and-_--t-is-its-bound) | The list generator is named `each`, and `_ & t` is its bound | Relocated to [#189](https://github.com/aontu-lang/aontu/issues/189) |
| [ADR-028](#adr-028--every-language-supplied-schema-is-named-under-aontu) | Every language-supplied schema is named under `aontu:` | Accepted |
| [ADR-029](#adr-029--a-bundled-model-lands-under-aontu-not-at-the-document-root) | A bundled model lands under `$.aontu`, not at the document root | Accepted |
| [ADR-030](#adr-030--the-path-of-a-meet-is-the-slot-it-was-driven-at) | The path of a meet is the slot it was driven at | Accepted |
| [ADR-031](#adr-031--a-path-part-that-names-a-type-is-camelcase) | A path part that names a type is CamelCase | Relocated to [#190](https://github.com/aontu-lang/aontu/issues/190) |
| [ADR-032](#adr-032--code-comments-are-sparse-and-terse-intent-lives-in-names-requirements-live-in-documents) | Code comments are sparse and terse: intent lives in names, requirements live in documents | Accepted |
| [ADR-033](#adr-033--a-grammar-is-a-string-and-parsing-is-a-function) | A grammar is a string, and parsing is a function | Accepted |
| [ADR-034](#adr-034--absence-is-a-value-and-maybe-is-where-it-is-made) | Absence is a value, and `maybe` is where it is made | Accepted |
| [ADR-035](#adr-035--a-language-is-configured-in-its-profile-and-a-marker-may-name-its-closer) | A language is configured in its profile, and a marker may name its closer | Accepted |
| [ADR-036](#adr-036--a-bundled-model-is-a-file-in-aontu-not-a-string-in-each-port) | A bundled model is a file in `aontu/`, not a string in each port | Accepted |
| [ADR-037](#adr-037--two-lists-concatenate-under--and-a-sum-of-an-absence-is-absent) | Two lists concatenate under `+`, and a sum of an absence is absent | Accepted |

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
[`docs/trust.md`](docs/trust.md#clause-2-termination) for the
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
   ghost semantics. *(Amended 2026-09-07 by
   [ADR-025](#adr-025--a-references-copy-is-an-instance-and-a-match-does-not-fire-on-an-unfilled-hole):
   a reference's copy IS a destination and instantiates fully —
   EXCEPT of a target holding a staged call, which has not decided
   yet and whose arguments the copy still shares. That exception is
   what keeps the ghost rows pinned.)*
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

---

## ADR-006 — Template application is stateless, and a generator snapshots a settled source

**Status:** Accepted (2026-08-26)

### Context

ADR-005 made a template instance own its structure, and named what it
did not fix: the unequal-spread sibling crosswire
([use-cases/BUGS.md](use-cases/BUGS.md) §6–§7), expressions reading
the generated child's own fields through a merge (§36), and — in the
same family — a generator over spread-augmented data dying as
`mapval_no_gen`. Execution found the roots, and they are about
*application*, not instantiation:

- The combination of two unequal `&:` templates (the spread meet in
  MapVal/ListVal, marked `TODO: handle existing spread!`) bakes a key
  present in only one side into the combined map as an `ExpectVal` —
  and an ExpectVal accumulated its peers by MUTATING ITSELF. A
  path-independent combined template is shared across every
  destination (the spreadClone sharing tier), so one stateful node
  unified each sibling's own data with the next sibling's. Every
  spelling that combines unequal templates hit it: cross-statement
  spreads, templates arriving by reference through a conjunction, and
  both views of an id-merge.
- The same expectation wrap FROZE any value that could still resolve
  by itself: an operator arriving as a peer-only key was wrapped, an
  expectation only advances when a peer arrives, and the residue
  blamed a spread that existed nowhere (`mapval_spread_required` on
  `deploy: web: {surge: $.deploy.web.replicas + 1}` — and equally on
  the pack-free `a:{x:1} a:{y:.x+1}`).
- A staged generator's data argument resolved its reference EARLY: the
  copy was taken while the source was still resolving, rebased to the
  argument's location — a place no root traversal reaches — so a
  spread-injected relative reference in the copy could never resolve
  and the generator never fired.

### Decision

**Two rules.**

1. **Template application is stateless.** Nothing shared between
   destinations may accumulate what a destination taught it.
   Concretely: `ExpectVal.unify` is pure — a non-escaping peer rides a
   NEW expectation node and the met node is never mutated; a carried
   expectation is re-wrapped fresh at its destination (so its
   key/parent name that bag); and a peer-only OPERATOR is carried,
   never wrapped — it keeps computing exactly as it does written
   inline, and one that can never resolve is honest `*_no_gen` / ref
   residue naming the real expression and path. Consequence: each
   child meets each template independently, and children never meet
   each other's data.
2. **A generator snapshots a settled source.** A staged function's
   data argument (`pack`, `each`, `filter`, `match`) resolves
   references under a snapshot flag (`argsnap`): the target is copied
   only once it has finished resolving in the tree — where its own
   spreads and relative references answer at their real location.
   This is the documented staging rule finished: the generator waits
   for the source, then copies it whole.

### Consequences

- The review's remaining minimal repros are the acceptance suite and
  all evaluate green: `two-spreads*.aon` (direct and vet forms),
  `idmerge-ref-templates.aon`, `oneview-ref-templates.aon`,
  `spread-then-pack.aon`, `merge-expr-onto-pack-child.aon` (§36 lands
  as outcome (a): it *works* — `surge: 3`).
- One deliberate canon flip rides rule 2: an unfired generator over a
  permanently stuck source canons with its data reference still
  standing (`pack($.n,{"x":1})`), which reparses to the same document,
  instead of with a baked-in copy of the stuck value. The flipped rows
  (`gen-each.tsv` each-unfired-*, `gen-pack.tsv` pack-unfired-canon)
  carry the note, parity-probed.
- The settled-source snapshot also stops a mid-resolution copy from
  re-stamping entity ids inside a hidden `filter()` witness: use-case
  05's generated registry was silently MISSING its `owner` role (the
  id-merge pulled the witness's hide mark onto the real role), and the
  eval-path diagnostic that rode the same artifact is gone — both
  recorded with dated notes in that use case.
- Enforced by the shared spec (ADR-001 discipline), both ports
  changing together: the `spread-interleave.tsv` spread-unequal-*
  composition matrix (unequal spreads × literal / ref-arriving /
  key()-bearing templates × 2,3 children × map,list, plus
  requiredness, defaults and id-merge through the combine), `vet.tsv`
  vet-unequal-spread-depths, `gen-pack.tsv`
  pack-over-spread-augmented / pack-merge-expr-onto-child,
  `gen-each.tsv` each-over-spread-augmented, `plus.tsv`
  peer-key-expr*. Author-facing rules in
  [`docs/reference-language.md`](docs/reference-language.md)
  ("Spreads `&:`", "Generating children").

---

## ADR-007 — An unresolved disjunction is not a value, and vet asks the same question the evaluator does

**Status:** Accepted (2026-08-27)

### Context

Aontu's identity is "the gate agents are validated against". The 2026-08
language review ([use-cases/REVIEW.md](use-cases/REVIEW.md), finding C;
[use-cases/BUGS.md](use-cases/BUGS.md) §13–17) found that **vet and
one-document evaluation returned opposite verdicts for identical
compositions**, which is the difference between a guardrail and a
decoration. Two causes account for most of it.

**Generation folded a disjunction's members together.** `DisjunctVal.gen`
took the surviving alternatives, unified them with each other, and
emitted the result. That value is in no branch of the disjunction:
`({x:1}|{y:2}) & {z:3}` generated `{x:1,y:2,z:3}`, a map the model never
admits. Worse for the gate, `role: 'a'|'b'` with no data died as a
scalar_value CONFLICT — the conflict of the fold, not of anything the
author wrote — and vet's incompleteness pass, which keeps
incomplete-class findings, filtered it out. A missing required enum
field, the commonest schema idiom there is, vetted **valid with zero
findings**.

**Vet met the SETTLED schema, not the schema.** Step 1 evaluated the
schema alone to decide whether it stands up before any data is blamed
for it — a diagnosis — and that settled tree was then used as the left
side of the meet. Every reference in the schema had therefore already
resolved against the schema's own values and been replaced by them.
`a:integer b:$.a` settled to `a:integer b:integer`, and data
`{a:3,b:4}` vetted valid, while the same four lines as one document
refuse with `scalar_value`.

A third, smaller cause: vet's residue check *generates* the anchored
meet, and generation honours the output marks. A `--at` anchor sitting
under a `type()` — the ordinary way a schema names a reusable
definition — generated nothing, reported nothing, and vetted valid for
data missing a required key.

### Decision

**1. An unresolved disjunction is incomplete residue, not a value.**
Generation answers the preferred alternative when there is one (that is
what `*` is for), or the single surviving alternative; more than one
alternative still admitted raises `disjunct_no_gen`, class
`incomplete` — the same class a bare `string` residue answers, and the
same answer CUE gives for a non-concrete export. Members are never
folded together.

**2. `vet(S, D)` and `eval(S ∪ D)` are the same question.** The schema
is parsed AGAIN for the meet, so the fixpoint runs once over both
documents and references, spreads and generators all see the data. The
standalone pass remains, as the diagnosis it always was: a schema that
does not stand up is still an `error` verdict rather than the data's
fault. (Parsed trees are single-use, hence a second parse.) A `--at`
path that exists only in the settled tree — one a spread or generator
mints — falls back to the settled anchor, so no such path stops working.

**3. Under `--at`, the completeness probe descends through the output
marks.** A mark is a decision about output; `--at` names the truth to
validate against explicitly, so `type()` or `hide()` on the anchor is
not a reason to check nothing.

Two consequences fell out and are part of the decision:

- **Two bags are the same value when they have the same shape.** The
  disjunct dedup compared object identity, so `x:*{a:1}|{a:number}` met
  by `x:{a:2}` left `{"a":2}|{"a":2}` — a disjunction of one value
  spelled twice. The old fold hid it; rule 1 does not, and a
  disjunction whose alternatives are all the same value *is* resolved.
- **A narrowed disjunction keeps its site.** The meet mints a fresh
  disjunction, which arrived unsited and file-less, so every finding
  naming a disjunction that had met anything pointed at row −1 with no
  file. It now carries the site of the one it came from (the review's
  finding F, in part).
- **A preference conjoined with a disjunction is a preference on the
  alternative it names**: `(A|B) & *A` is `*A|B`, the same value the
  direct spelling denotes. Distribution carried the peer to each
  member, and the kind gate then replaced a scalar preference *by* the
  concrete member it met — so the preference simply vanished, and the
  enum-with-default written this way round held no default at all. The
  fold hid it; rule 1 does not. A preference naming no alternative is
  dropped, as before, and the default-validity lint is what reports
  that shape.

The `--at` exception to rule 2 is part of the decision, not an
oversight: an anchor is a *subtree lifted out of* the schema, and an
absolute reference inside it (`$.OrderPlaced`, the
discriminated-union idiom) names a sibling of the document root, which
the lifted subtree no longer has. The settled tree is where such a
reference has already been resolved and substituted, so an anchored run
keeps meeting it. Leaving this to whether `anchorAt` happens to find
the path in an unresolved tree is what the two ports did while this
change was being written, and they answered differently — an ADR-001
divergence that only an explicit rule prevents. Pinned by
`vet.tsv:vet-at-absolute-ref-*`.

### Consequences

- **Breaking.** `1|2`, `null|top` and `({x:1}|{y:2}) & {z:3}` no longer
  generate. The spelling that decides them is a preference (`*null|top`)
  or a value that selects one alternative — which is what the model
  always meant. Documents that relied on the fold were relying on a
  value in no branch of their own disjunction.
- Schemas whose references were previously spent by the standalone pass
  now enforce against the data. This turns silent passes into findings;
  it cannot turn a finding into a pass.
- `disjunct_no_gen` is registered in `test/spec/errcodes.tsv` (class
  `incomplete`, since 0.53.0) with hints in both ports.
- Enforced by the shared spec (ADR-001 discipline), both ports changing
  together: `disjunct.tsv` (the pref-null rows, four `disjunct_no_gen`
  rows for the unresolved forms, and the sameness-strictness rows),
  `vet.tsv` (vet-enum-missing-is-incomplete and its two controls,
  vet-at-marked-anchor-*, vet-schema-reference-*, vet-at-absolute-ref-*,
  vet-closed-list-* and vet-junction-site), `pref.tsv` (the
  distribution rows), plus the re-probed site columns across
  `subsume.tsv`, `edge.tsv`, `number-tower.tsv` and `place.tsv`.
- **The invariant itself is now asserted**, which is what the review
  asked for: `ts/test/veteval.test.ts` and `go/veteval_test.go` read
  the shared spec's own `vet` rows, compute `vet(S,D)` and
  `eval(S ∪ D)` for each, and require them to agree on accept/reject.
  The corpus is the spec, so it grows with every row anyone adds
  rather than with a fixture list someone has to remember to extend.
  Rows with no single-document spelling (`--at`, `--closed`,
  `--partial`, `--maxErrors`, a file-loading fixture, or a rootless
  literal carrying an absolute reference) are skipped, and the skip
  count is itself bounded so the check cannot go green over nothing.
  Every one of §13–§15 would have failed it.
- Four use-case gaps closed with it, each recorded in its own case:
  a required enum field could be omitted (03 gap 1, 04 gap 2, 05 gap 5);
  enum findings had no schema location (03 gap 9); two contracts
  differing only in a conjunct default hashed identically (07); and
  `aontu set` accepted writes its own `must()` audits refuse, catching
  them only post-hoc in the assembled view (08). The last is the
  sharpest: the write path and the read path now agree, so a refused
  write is never written.
- **Still open at this decision:** BUGS.md §16 (a sizing atom sharing a
  conjunct with a spread template is discharged against that layer
  alone) and §17 (a map-argument `must()` is consumed by the schema
  layer). Both are the same shape — a check that must RESIDUATE until
  its peer is concrete, discharged early instead — and both are engine
  defects rather than staging ones: they reproduce in a plain two-tree
  meet, and are recorded rather than fixed here.

---

## ADR-008 — Constraints are named, not spelled with operators

**Status:** Accepted

### Context

[`docs/design/AONTUCONSTRAINTS.0.md`](docs/design/AONTUCONSTRAINTS.0.md)
proposes CUE's operator spellings for the constraint families it
designs: `>10`, `>=10`, `<5`, `!=0` for bounds (§6), `=~"p"` and `!~"p"`
for patterns (§7). Its §10 budgets a **lexing break** for them — bare
values beginning with `> < = !` change meaning — and its §12 schedules
them as phases P1 and P2.

Those phases landed before that note was written, under different
syntax. G1 shipped the whole family as **named atoms**: `min`, `max`,
`above`, `below`, `neq`, `re`, joined by `length`, `unique` and `must`.
Composition needed no new syntax because `&` already exists —
`port: integer & min(1024) & max(65535)`.

So the note's proposal is not a gap to fill. It is a **second spelling
for machinery that is already complete**, and the question it leaves
open is whether to adopt it as sugar.

The argument for adopting it is real and should be recorded rather than
strawmanned. CUE is the only widely used configuration language sharing
aontu's commutative-unification core, which makes CUE notation the thing
a new user most plausibly arrives holding; and today that notation fails
differently from how a CUE user would read it. `port: >=1024` is not a
syntax error — it is the bare string `">=1024"`, so a schema written in
CUE's operators parses and imposes no constraint. The note called this
"worse than unsupported, since it produces a well-formed wrong config".

*That grading was withdrawn on the same day this entry was accepted, and
the sentence is kept only because the argument below responds to it.*
Those characters are not reserved, so the behaviour is the bare-string
rule applying uniformly — `port: high` is `"high"` for the same reason —
and calling it a wrong config assumes an intent the document never
states. [`use-cases/BUGS.md`](use-cases/BUGS.md) §45 recorded it as a
critical defect and is retracted.

### Decision

**Aontu does not adopt CUE's operator spellings for constraints.** There
is one way to write each constraint, and it is the named atom.

This is a decision about the language's surface, not about the
constraint algebra, which is unchanged and complete.

Three reasons, in the order they weigh:

1. **One spelling per concept.** Two ways to write a bound means two
   things to parse, two things to canon (and a decision about which one
   canon emits), two things in the grammar files shipped for constrained
   decoding, two things in the LSP's completion list, two things in
   every error message that quotes a residual, and two things a reader
   has to recognise. `min(10)` and `>=10` would denote one value; the
   cost is paid at every surface that renders it.
2. **The named form composes with everything already built; the
   operator form does not extend.** `min` takes a reference or an
   expression as its argument (`min($.floor)`) because it is an atom in
   the same registry as every other builtin, settling through the same
   `settle` discipline. An operator prefix has no obvious spelling for
   that, and the families that arrived after the note — `length`,
   `unique(k)`, `must` — have no operator at all. The sugar would cover
   a shrinking fraction of the vocabulary.
3. **The break buys nothing back.** §10's lexing break was the price of
   *acquiring* bounds. Acquired differently, the same break would now be
   paid purely for a synonym.

Adopting CUE's spelling later would be a reversal of this entry, and
needs a new ADR.

### Consequences

- **`aontu` and `cue` documents are not interchangeable at the
  constraint layer, and the project should say so** rather than let a
  reader infer it from the shared core. The positioning claim in
  AONTUCONSTRAINTS.0.md §1 is about the *lattice*, not the notation.
- **A bare value containing `> < = !` is ordinary text, and stays so.**
  This follows directly, and is not an unfinished edge. Those characters
  are not reserved, so `port: >=1024` produces `">=1024"` exactly as
  `port: high` produces `"high"`. There is no silent failure to close:
  reading one requires assuming the author meant a bound, which is an
  assumption about intent that neither the document nor the engine can
  make. An earlier draft of this entry proposed **refusing** such bare
  strings; that is **withdrawn**, because carving `> < = !` out of the
  bare-string rule to serve a guess about intent would make `a: >x` an
  error while `a: ?x` stayed fine. What remains is discoverability — the
  named atoms should be easy to find from where a CUE-trained reader
  looks, which is what the reference and how-to now provide.
- **The sized-integer sugar (`int8`, `uint16`) is untouched by this
  entry.** It is a name for a bounded `integer`, not an operator, so it
  is a *named* form and this decision does not bear on it. It remains
  unbuilt and undecided.
- **`docs/design/AONTUCONSTRAINTS.0.md` §6, §7, §10 and §12 now carry
  this decision inline**, because a design note that proposes a syntax
  is exactly where a future contributor will look for permission to
  build it.

### Enforcement

Prose, and this entry. There is no test for a syntax that does not
exist — a spec row can only pin what an engine does, and what both
engines do with `>10` is read it as text, which pins the bare-string
rule rather than this decision. The two are independent, and conflating
them is what made the retracted §45 look like a defect.

## ADR-009 — There are no reserved path elements: `$KEY`, `$SELF` and `$PARENT` are removed

**Date:** 2026-08-28
**Status:** Accepted

### Context

A path segment spelled `$name` is a variable reference, resolved from
the variable table. Three names never reached that table: `RefVal.find`
(and its Go twin) matched `KEY`, `SELF` and `PARENT` by name first and
switched on them. Measured against the engines rather than the
documentation, the three were worth very different things:

- **`$PARENT` did nothing.** Both ports computed the same slice
  endpoint for PARENT mode as for the default, so `$PARENT.c` was
  `.c` — including failing identically at depth.
- **`$SELF` was `$.` under a misleading name.** SELF mode sliced the
  base path to zero, i.e. root-absolute. `$SELF.q` was `$.q`; it
  resolved from the ROOT, not from self.
- **`.$KEY` was an early-bound `key()`.** In a literal position the two
  agreed everywhere probed — map, deep map, list index, spread
  template, `pack` template, at root, in meets, inside
  `close`/`hide`/`+`/`upper`/`id`. They parted where a value TRAVELS:
  under `move()` `.$KEY` named the source and `key()` names the
  destination; in a `type()` block referenced elsewhere `.$KEY` named
  the definition and `key()` names the using site. `key()` also takes a
  LEVEL (`key(0)`, `key(2)`), which `.$KEY` had no spelling for —
  leading dots were ignored, so `..$KEY` was `.$KEY`.

Two silent defects came with the interception. `$KEY` had to be the last
segment (`$KEY.x` was a `ref` refusal), but when it WAS last everything
before it was discarded without complaint: `z:{q:9}` with
`a:{b:$.z.$KEY}` answered `"a"`, not `9`. And because the match ran
before the variable table was consulted, the three names could not be
used as ordinary variables at all.

### Decision

**Remove all three. Every `$name` in a path is an ordinary variable.**
`key()` is the replacement for `.$KEY`; `$.x` and `.x` were always what
`$SELF.x` and `$PARENT.x` meant.

An unbound `$KEY` is now `unknown_var`, exactly like `$nosuch` — the
loud failure, located and coded, rather than a silent wrong value. A
BOUND one resolves like any other variable, which is the half that says
the names are freed rather than merely broken.

### Consequences

- **Breaking, at the surface language.** A document using `.$KEY` stops
  working and says so. `use-cases/BUGS.md` §51 records the three shapes
  where the rewrite to `key()` changes a value — always from the wrong
  answer to the right one.
- **`key()` is the only spelling of the enclosing key**, so there is one
  answer to how it behaves rather than two that agree until they do not.
- Two defects recorded against `$KEY` in podmind's models, which carried
  workarounds for them, are retired with the spelling.
- **The removal uncovered a live parity break in `key()`**
  (`use-cases/BUGS.md` §50): the only test covering a spread template
  read through a deep reference used `.$KEY`, whose different code path
  hid it. That is an argument for the removal, not against it — a second
  spelling was masking a defect in the first.

### Enforcement

`test/spec/edge.tsv` pins the three names as ordinary variables
(`edge-key-name-is-a-var`, `edge-self-name-is-a-var`,
`edge-key-name-mid-path`, `edge-self-name-alone`,
`edge-self-name-mid-abs-path`, `edge-parent-name-mid-abs-path`), each
paired with the surviving spelling that carries what the removed name
meant (`edge-abs-into-missing-root`, `edge-relative-sibling`).
`edge-parent-name-resolves` binds a variable literally called `PARENT`
in both runners' `specVars` and reads it as a path segment, which is
what distinguishes a freed name from a broken one.

## ADR-010 — No magic keys or paths: the tree at all levels is user space

**Date:** 2026-08-28
**Status:** Accepted

### Context

Reserved meaning has crept into the value tree twice, by two different
doors. ADR-009 closed one: the three path elements (`$KEY`, `$SELF`,
`$PARENT`) that were intercepted by name before the variable table was
consulted. The other door is still open: the `relations:` key at the
document root, which the `relations` verb reads as configuration
(`ts/src/relation.ts`, `go/relation.go`) — the engine's own comment
concedes the shape: "Nothing in the engine knows the name `relations`;
this pass does." An author whose document is *about* database
relations cannot use that word at the root without a verb reading
their data as directives.

Everything else the language reserves is carried by grammar the author
visibly opts into: operators and sigils in key position (`&:`, `?:`,
`%name:`), call syntax in value position (`min(1)` — the parentheses
are the claim, and `min: 1` stays an ordinary key), quoting to opt out
(`"%a"` is an ordinary key). The one internal namespace — the
NUL-prefixed sentinel prefix — is unspellable by construction and
panics if forged, so it claims nothing an author can write.

### Decision

**A plain, spellable key name never carries engine- or verb-assigned
meaning — at any depth, the root included. Nor does any tree location
single out plain-named children for special reading.** Reserved
meaning is carried only by syntax: an operator, a sigil, or a call —
something the grammar marks and quoting escapes.

Two boundaries, so the rule cuts where intended:

- **Libraries may establish conventions in user space.** `std/system`
  populating `std:` is legitimate: a library is opted into by
  inclusion and displaced by not including it. The prohibition binds
  the engine and the verbs, which an author cannot opt out of.
- **Internal sentinels must be unspellable, never merely unlikely.**
  The reserved-prefix rule (a NUL no spelling produces, a panic if
  forged) is the required shape for any internal namespace.

### Consequences

- The `relations:` convention was a **standing violation**,
  grandfathered until `docs/design/RELATIONS.0.md` P2 replaced it with
  value-level atoms — **discharged 2026-08-29**: the engine reads no
  plain-named key anywhere, `relations:` is ordinary user data
  (pinned by `relation.tsv` `relations-key-is-user-space` /
  `relations-key-generates-as-data`), and the rule now binds with no
  exceptions. A capability that needs a home in the tree gets syntax,
  or it gets a function.
- ADR-009's removal is ratified as an instance of this rule rather
  than a one-off.
- File-system conventions (`aontu_meta/mod-lock.aon`, `aontu_meta/vendor/`) are outside
  the tree and outside this rule.

### Enforcement

Prose, this entry, and the retirement it scheduled — now landed: the
`relation.tsv` rows pinned the grandfathered convention until
RELATIONS.0.md P2, and P2's rows pin its absence. There is no
mechanical gate for "no verb reads a plain key" — review carries it,
as ADR-008's decision is carried.


## ADR-011 — The star is sugar; the disjunction is the structure

**Date:** 2026-08-29
**Status:** Accepted

### Context

`a: *x` and `a: *x | super(x)` were two separately implemented
mechanisms that happened to agree on the common case. A probe of the
whole cross product — both ports, byte-identical — found that they
disagreed in four places:

| Case | `a: *1` | `a: *1 \| super(1)` |
|---|---|---|
| peer `1.5` | refuses `no_scalar_unify` | refuses `\|:empty` |
| peer `*7` | refuses `scalar_value` | answers `*7` |
| `%x: {p:1}`, peer `{q:2}` | `{q:2}` — default dropped | keeps both |
| `%x: {p:1}`, peer `"s"` | `"s"` — default dropped | refuses |

and two more the long form exposed by construction: `*integer` gated
nothing, so a string overrode a kind default; and a rank ladder inside
one disjunction (`*1 | **2`) discarded every arm but the lowest at
parse time, so eliminating that arm lost the whole default instead of
promoting the next.

The gate had also been asking the wrong question. It tested whether
the peer resolved to EXACTLY the preferred value's type, so any
narrowing at all counted as an override: `*8080 & min(1024)` dropped
the default and answered the bare constraint, where the long form's
`(8080 & min(1024)) | (integer & min(1024))` plainly keeps it.

### Decision

**`*x` is sugar for `*x | super(x)`, and the long form is the
structure. Where the two disagree, the long form wins.** The
desugaring is SEMANTIC: the meet distributes over the disjunction the
star stands for, and no spelling is rewritten.

    *x & peer   ==   (x & peer)  |  (super(x) & peer)

The first arm decides. A peer the preferred value itself admits leaves
the default standing, narrowed to what survived; otherwise the second
arm answers, and that is the override; and when both are empty, so is
the disjunction — the refusal is `empty`, at every rank and for every
shape.

Five consequences, spelled out with their reasoning in
[docs/design/DEFAULTS.0.md](docs/design/DEFAULTS.0.md): one refusal
code (R1); equal-rank defaults that cannot agree refuse as
`pref_rank_clash` rather than as a conflict between the values they
hold (R2); a container default is leafwise in what it admits, so a map
peer MERGES and another kind refuses (R3); the override gate is
`super()`, retiring the ungated kind and constraint pegs (R4); and
rank orders the SURVIVING arms rather than collapsing them at parse,
so eliminating one promotes the next (R5).

Canon and the `aon1-` hash keep the written spelling (R6). A
parse-time rewrite of `*x` to `*x | super(x)`, or of `*{p:1}` to
`{p: *1}`, would rehash every document that carries a default and — in
the container case — stop canon round-tripping and strip the star from
a defaulted alternative.

**One frozen error code is renamed**, against the registry's own
append-only rule: `|:empty` and `|:empty-dist` become `empty` and
`empty-dist`. The `|:` prefix named a spelling the author may never
have written — a bare `*x` default refuses with this code now — and a
code that lies about its own origin is worse than a frozen name. The
exception is recorded in `test/spec/errcodes.tsv` beside the rule it
suspends: a rename needs an ADR, and nothing else does.

### Consequences

This COMPLETES ADR-004 rather than reversing it. ADR-004 said a
default inside a disjunction must be admitted by that disjunction;
this says a default IS a disjunction with its own type, so there is
one rule where there were two. Every ADR-004 admission refusal stands,
including the fail-open enum (`k:*'auto'|'literal'|'data'` refusing
`'autoo'`) that motivated it.

Eighteen pinned rows change, listed in the design note, each replaced
by a row naming the rule that moved it. The visible costs are that a
default the peer merely satisfies now SURVIVES in canon (`*1 & 1` is
`*1`, where the star used to be consumed — the generated value is
unchanged), and that a structural default no longer accepts a value of
another kind. The replace-anything reading stays spellable as
`*{p:1} | top`.

`test/spec/defaults.tsv` (29 rows, both runners) pins the rules;
`pref_rank_clash` joins the registry.

## ADR-012 — An include's extension decides what the file is: Aontu source, config data, or refused

**Date:** 2026-08-30
**Status:** Accepted

### Context

`@"file"` reads a file. What the engine did with the bytes depended on
the file's extension, and the two ports had different rules — so the
same document and the same file evaluated to different values. Probed
with the identical content `{"a":1,"b":{"c":2}}` under six names, both
ports (`use-cases/BUGS.md` §49):

| file | TypeScript | Go |
|---|---|---|
| `v.aon` | the map | the map |
| `v.json` | `Cannot convert object to primitive value` | the map |
| `v.jsonld` | the content, as a **string** | the map |
| `v.txt`, `v.dat`, `vnoext` | the content, as a **string** | the map |

One line on each side: `ts/src/lang.ts` registered
`processor: {aontu, aon}` and let every other extension fall through to
multisource's default, which hands the file back as raw text;
`go/source.go` registered the empty kind, the fallback for an
unrecognised extension, and so parsed everything as Aontu source.
Either rule is defensible; having both is not, and ADR-001 says so.

`.json` was worse than either. It is the one extension with an upstream
default processor, which returns a plain JS object where the aontu
grammar produces Vals, so the tree met a value it could not convert and
raised an unhandled internal error with no code, no path and no site —
the shape a harness grepping `[aontu/` cannot see at all.

The grade was critical because the failure is a well-formed WRONG
document: `schema: @"vocab.jsonld"` gave a map in Go and a string in
TypeScript, and both exited 0. A document pinning a vendored vocabulary
validated against the vocabulary in one port and against a 40 KB string
in the other.

### Decision

**The extension decides, from a fixed table, and it says which of THREE
things the file is.**

| extension | what it is |
|---|---|
| `.aon`, `.aontu` | **Aontu source** — the language, with types, defaults, references, constraints, its own includes |
| `.json`, `.jsonld`, `.jsonc`, `.json5`, `.jsonic`, `.jsc`, `.toml`, `.yaml`, `.yml`, `.ini` | **configuration data** — parsed by that format's own parser into the JSON value it denotes |
| `.txt`, plus whatever `--text-ext` names | **text** — the file's bytes, as one string scalar |
| anything else, and a name with no extension | refused, by name, with `include_extension` |

```
include not readable: rows.csv (extension: .csv)
```

**Every one of those formats maps onto JSON**, which is why one word
covers them: a `.toml` file is a map of scalars, lists and maps, and so
is the `.aon` file that unifies with it. What a data format does NOT
get is the language — a `&` in a YAML file is a YAML anchor, not a
spread key, because the YAML parser reads it, not this one. A model is
usually asked to meet configuration somebody else already wrote, and
"rewrite it into `.aon` first" is not an answer.

**The parsers are @tabnas's, one per format, and BOTH PORTS RUN THE
SAME ONES.** That is what makes the shared spec rows possible: the two
implementations agree because they are running one grammar, not because
two hand-written readers were kept in step. It is also why the table
can grow without a second round of parity work.

Three alternatives were weighed and refused. Parsing everything as
Aontu (Go's rule) makes `@"notes.txt"` a parse error at a line the
author never wrote — and cannot read TOML or YAML at all. Reading
everything but `.aon` as text (TypeScript's rule) keeps the critical
shape, the silently stringified vocabulary. Refusing every non-`.aon`
include is safe and leaves ONTOLOGY P1 with nothing to import.

### Amendment, 2026-09-03: text is the third thing an extension can mean

`notes: @"notes.txt"` is a document loading prose into a string, and
the original ruling refused it — because at the time "unknown
extension" and "read it as text" were the same case, and reading an
unknown extension as text is precisely the defect this record was
written to end. `.txt` was collateral: a legitimate use, refused for
resembling a bug.

**A third category, `text`: the file's bytes become one string
scalar.** No parser is chosen, which is the whole reason it is safe to
add — there is nothing for two implementations to disagree about, so
the ADR-001 objection that keeps `.csv` out does not apply here. `.txt`
is in the table; `AontuOptions.textExt` (the CLI's `--text-ext md,sql`,
honoured by every verb) widens the set, because which name a project
keeps its templates under is the project's business and not this
table's.

**A widening never overwrites.** An extension the table already names
keeps its meaning — `--text-ext toml` cannot re-read TOML as a string,
because documents rely on what it means today. And `.js` stays refused
however the flag is spelled: it is the extension this record singles
out, and a widening that can reach the one name the rule names is a
widening whose limit nobody can state. Both ports hold that list, and
the two CLIs are diffed on `--text-ext js` — because they disagreed
there once, Go reading the file where TypeScript refused it.

**`.csv` is deliberately absent, and the reason is ADR-001.** The two
ports' CSV parsers disagree about what a CSV file even is: `@tabnas/csv`
answers header-keyed records with string fields, `github.com/tabnas/csv/go`
answers raw rows including the header, with numbers parsed. Admitting
it would admit a divergence into the one thing this project refuses to
have one in. `test/spec/file.tsv`'s `load-ext-csv` pins the refusal, so
the day the two parsers agree the row is what says so.

**`.jsonld` reads as JSON**, because it is JSON: a `@context` is a key
like any other here, and what it MEANS is the vocabulary's business,
not the reader's. That is what `docs/design/ONTOLOGY.0.md` §3.1 needed,
every vocabulary its phase P1 imports being `.json` or `.jsonld` —
schema.org ships `schemaorg-current-https.jsonld`, microformats2
parsers emit JSON, DCMI publishes RDF serialisations.

**The refusal is raised, not injected.** In both ports the decision is
made in the RESOLVER, not the processor: a bare-member include
(`@"notes.txt"` at the top of a file) merges into the enclosing map,
and a nil contributes no keys, so an injected refusal would vanish and
leave a plausible, silently-partial document — the same reason
`include_denied` and `multisource_not_found` are raised.

**Trust decides first.** A file outside the confinement root is
`include_denied` whatever it is called: answering `include_extension`
there would confirm the file exists.

### Consequences

`.js` IS NO LONGER INCLUDABLE, in either port. multisource's `js`
processor `require()`s the file in the evaluating process, so
`@"x.js"` was arbitrary code execution — named as a hazard in
`docs/trust.md`, in the MCP server, and in `vet`, `diff` and `query`,
each of which told callers to set a trust profile because of it. It is
now refused by the same rule that refuses `.txt`. The trust profile is
still the confinement surface for everything else an include can reach.

The TypeScript package leg narrows with it: `@"some-pkg"` resolving to
a `.js` entry point now refuses. The Go port has no package leg at all
(`docs/test-coverage.md`), so this closes a divergence rather than
opening one, and the module system (G6, `aontu_meta/vendor/`) is unaffected —
a module states `kind: 'aon'` by construction, as the bundled
vocabulary does.

`include_extension` joins the registry (class `parse`, 0.54.0).
`test/spec/file.tsv` pins the rule in both runners: every format that
reads, the extensions that refuse, the extension being NAMED, the four
bare-member positions where a refusal must not vanish, the precedence
of not-found over extension, and `.csv`'s absence.

**Two consequences of reading data with a data parser.** A format's own
semantics are the ones that apply: `.ini` has no types, so `port=8080`
is the STRING `"8080"` and a schema wanting `port: integer` has to say
so (pinned by `load-ext-ini`). And a malformed config file refuses the
document rather than becoming an anonymous nil under the key that
included it — with one divergence, recorded in `DIVERGENCE.md` #67:
TypeScript's reader throws, so the frame it drew (the `.toml`, its
line, its caret) reaches the user, where Go's outer parse fails
afterwards and names its own `@`. Same verdict, same class, same exit
code; different prose, which is already the carve-out the shared spec
makes for messages.

**This adds nine runtime dependencies to each port** — one parser per
format. They are all @tabnas packages, all pure parsers with no I/O,
and the browser bundle the playground ships grows with them.
---

## ADR-013 — The project operates one transparency log, and nothing else

**Date:** 2026-08-30
**Status:** Superseded in part, 2026-09-04, by
[ADR-019](#adr-019--the-project-stores-module-bytes-and-federates-the-log).
Constraint 1 ("it stores no module source, ever") is reversed, and the
service this entry admits is no longer the one the project runs: the log
federates to Sigstore and a module repository takes its place.
Constraints 2 to 5 survive verbatim and bind the repository instead —
they were the reason this entry was admissible, and ADR-019 inherits
rather than relaxes them.

### Context

[G6](docs/capability-review/g6-distribution.md) surveyed five ways to
distribute modules and rejected one by name — *"E. A bespoke hosted
registry service … infrastructure the project must run forever, and
OCI already provides storage, auth, replication, and org familiarity"*
— then restated the rejection as a boundary: **"No project-operated
central registry service — any OCI registry works; running
infrastructure forever is not a language feature."** That bullet is the
only one in G6's boundary list carrying no "in v1" qualifier; its
neighbours all have one, so the omission was deliberate.

The boundary was right, and it is not what this ADR reverses. G6's
reasoning has two halves, and only one of them survives contact with a
transparency log:

| G6's reason to reject a service | Applies to a log? |
|---|---|
| OCI already provides storage, auth, replication, org familiarity | **No.** A transparency log provides none of those, and OCI provides no transparency log. There is nothing to reuse. |
| Infrastructure the project must run forever | **Yes.** Unchanged, and the whole cost. |

What forced the question is what a lockfile cannot do. G6's canon-hash
pins meaning *for a project that already resolved a version*. It says
nothing about the **first** resolution — the moment a new machine, a
new contributor, or an agent session first asks what
`corp.example/schemas/service@1` at `1.4.2` means. Two developers can
each hold a lockfile, each verify perfectly, and hold different truths
under the same name, with nothing in the language able to detect it. A
lockfile is a private memory; the missing thing is a **public,
append-only, independently auditable statement** that a given version
resolved to a given meaning, which no amount of local pinning can
supply.

A [design review](docs/capability-review/g10-transparency.md) of a
forge-tag transparency registry found the log sound and the substrate
wrong. Reviewing it also established that the "forever" cost is
bounded in a way a registry's is not: a log that stores no artifacts
can be frozen, replicated by anyone, and audited by software the
project did not write.

### Decision

**The project operates exactly one service — an append-only
transparency log over module release records — and the constraints that
bound its cost are part of the decision, not implementation detail.**

Five constraints, each load-bearing:

1. **It stores no module source, ever.** The log holds hashes and
   metadata. Artifacts live in OCI registries, which G6's decision
   already settled and which this ADR does not disturb. A log that
   began caching artifacts would be the registry G6 rejected, wearing
   a different name.

2. **A build that has a lockfile never touches it.** Evaluation is
   hermetic ([G5](docs/capability-review/g5-trust-contract.md)) and
   stays so; `mod get` consults the log only when *adding* a version
   the lockfile does not already pin. This is what bounds the failure:
   if the service dies tomorrow, every existing project keeps
   building, and only the adoption of new dependencies stalls. A
   design that put the log on the path of an ordinary build would
   breach this ADR, not merely inconvenience users.

3. **It is publicly replicable, in a standard format.** Log data is
   served as C2SP `tlog-tiles` static objects, so third-party
   auditors and witnesses that already exist can consume it. A
   bespoke protocol would make "independently auditable" a claim
   rather than a fact, and would make every auditor the project's own
   work to write, staff and fund.

4. **Its client half is in both ports, under
   [ADR-001](#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec).**
   Checkpoint and proof *verification* is language behaviour: two
   implementations that disagree about whether a proof verifies is a
   silent security divergence, the worst class of parity breach. Only
   the *serving* half — the sequencer, the tile writer — lives in one
   place, as the MCP server does.

5. **It has a stated exit.** The log can be frozen: its final
   checkpoint published, its tiles archived, its data mirrored. Every
   lockfile that references it keeps verifying, because verification
   is a proof against a checkpoint the lockfile already carries, not a
   request to a running service. A service that could not be shut down
   without breaking existing builds would not be admissible under this
   ADR.

The G6 boundary bullet is amended in the same commit as this entry, to
say what it now means: no project-operated *registry*; a transparency
log is not a registry, and is admitted by this ADR under the five
constraints above.

### Consequences

**We accept a recurring operational obligation** — a signing key with
custody arrangements, an alert on checkpoint age, and someone to answer
it. This is the cost, it is real, and constraint 5 is what keeps it
from being unbounded.

**We accept that the log's value is small until the ecosystem is.** At
zero third-party publishers it proves almost nothing, and the honest
reason to build it early is that its *format* becomes a compatibility
commitment the moment anything is signed — the leaf schema, the
checkpoint encoding, and the `aon1-` scheme id's role in surviving a
canon change are all cheaper to get right before there is a log to
migrate.

**What this does not license.** It admits one service, narrowly scoped.
It is not a precedent for a hosted evaluator, a package CDN, a hosted
query surface, or any second service; each would need its own entry
here. And it does not weaken
[ADR-002](#adr-002--test-coverage-stays-at-100--in-both-implementations):
the network code that talks to the log reaches the coverage floor
through an injected seam, exactly as `ModuleFs` and `ModuleEval`
already do, or it does not land.

The design, its phases and its open questions are
[G10](docs/capability-review/g10-transparency.md); status is the
[progress register](docs/capability-review/progress.md).

## ADR-014 — The tree is the namespace: there is no identity mark

**Date:** 2026-08-30
**Status:** Accepted

### Context

G4 phase 1 gave any node a second, **location-independent** name.
`id(name)` declared that the enclosing value IS the entity `name`, and
every node in one evaluation carrying that name was unified with every
other. It bought three things: two files describing one thing could be
brought into contact without either naming the other's paths; `refer()`
had something to address; and the edge set had nodes to connect.

The names lived in one flat, global namespace per evaluation. There was
no module scoping, by design — G6's boundary refuses import namespaces
outright — and the name grammar forbade the punctuation namespacing
usually rides on (no dots, no slash). Two documents that chose the same
word were one entity.

The obvious cost is a collision between unrelated vendored models, and
that cost is real but survivable: it is silent only when the two
descriptions happen to be compatible. The cost that decides it is
sharper, and it hits a single author with no third party involved:

**A model carrying an `id()` cannot be instantiated twice.**

```
# model.aon
user: id(User) & { region: "eu" }

# main.aon
tenantA: { m: @"model.aon" }
tenantB: { m: @"model.aon", m: { user: { region: "us" } } }
  → [aontu/scalar_value] at $.tenantB.m.user.region: "eu" with "us"
```

Two mounts of one file are one entity, so a per-instance override is a
contradiction. The escape hatch does not save it: a bare `id()` names
itself by its enclosing key, which is the *same* key in both instances.
Only the full path disambiguates — which is the argument, made by the
feature's own fallback.

### Decision

**`id()` is removed. A node's address is its path, and there is no
second namespace.**

`refer(t?)` keeps every property that made it worth having — a link
rather than an embedding, checked existence, constraint flow into the
target — and takes a **tree address** instead of an entity address:
`$.services.auth` from the document root, `.auth` from the link's own
sibling scope, one further step up per further dot. `$` alone is not an
address: the whole document has no enclosing position to be written
back into.

The derived graph is path-native. There is no entity index, because
there is nothing to index; a link's source node is **derived** from
where the link sits (strip the list indices; the first real key above
is the relation, its parent the source) rather than declared by a mark.
`relations` and `reaches` take and report `$.dotted` node paths.

### Consequences

**Cross-file contact is a reference, and directional.** The catalog and
deploy views meet because one of them says `$.catalog.payments`, and
the failure is the same located `scalar_value` at the same path that
the shared id produced. What is lost is bidirectionality — the catalog
is not narrowed by the deploy — and the ability for two files to agree
without either naming the other. That second one is exactly the
mechanism that made a model non-reusable; the two are one property seen
from opposite sides, and the reuse case is worth more.

**Relative addressing is what makes a model reusable.** A link written
`..auth` resolves inside whichever instance holds it, so the same file
mounted at two paths gives two self-contained instances. This is new
capability, not a consolation: entity addressing could not express it
at all.

**A link's stamp is the RESOLVED path, not the written spelling.** A
relative address means a different node from each position it is
written at, so an edge set whose far ends were spellings could not be
traversed. The link's own *value* is still what the author wrote — a
link is what it says, an edge is where it goes.

**The type flow is recorded, not only written.** `refer(t)` unifies `t`
into a node the meet is not currently at — the one non-local effect in
the evaluator — and a pass BUILDS a new tree from the old one, so a
write into the previous pass's tree does not survive a subtree the pass
rebuilds. That happens whenever a link sits inside its own target, or
two nodes link at each other (every inverse pair). `applyFlows` replays
each recorded flow onto the pass's own result, keyed by path. Keyed by
path is the point: re-uniting the same type at the same position is
idempotent, so replaying every flow every pass is correct and not
merely cheap.

**Reachability granularity narrows.** A link into `$.a.ports.http`
reaches *that node*, not `$.a`. Entity addressing widened it to the
nearest identified ancestor; with no declared boundary there is nothing
to widen to. Both verbs agree on the narrower rule, which is what
matters — they would otherwise disagree about what an edge connects.

**Gone with the mark:** `id_name`, `id_conflict`, `id_spread`; the
identity merge and its registry; the identity rider in `unite`; the
canon and canon-hash wrappers (identity was semantic content, so it was
in the `aon1-` hash — two documents that differed only in their ids no
longer differ at all); and the three clearing rules, which existed
solely to stop a global name leaking through a reference clone, a
`copy()`, or a spread template. The builtin roster goes 41 → 40.

**Relation predicates are unaffected.** `inverse(dependedOnBy)` still
takes a D-1 name: a relation is a vocabulary term, not an address.

This does not reverse ADR-001 or ADR-002 — both ports and the shared
spec move together, and coverage stays at 100 %. It does supersede G4
phase 1 in `docs/capability-review/g4-identity-relations.md`; the
progress register records the retirement.

## ADR-015 — Paths are first-class values: `path(p)` captures, and a vacuous constructor call is a kind

**Date:** 2026-08-31
**Status:** Superseded in part by [ADR-016](#adr-016--a-string-is-never-a-path-conversion-lives-in-the-call-and-paths-meet-by-prefix)

### Context

An address was a string. `refer(t)` checked one, generation emitted
one, and the graph read them — but the value model never held one: a
resolved link was a `StringVal` carrying a side-channel `link` stamp,
addresses in data were indistinguishable from ordinary strings until a
`refer` met them, the address grammar was checked at unification time
rather than parse time, and no tooling could see an address as
anything but text. Shoving a structured value into a string and
stamping it is the classic symptom of a missing kind.

At the same time, `path(p)` — the function form of a reference, from
the language's earliest era — had become fully redundant: every
spelling it covered has a bare-reference form (`path(x.a)` is `x.a`,
`path("team-pay")` is `$."team-pay"`), and no document in the
repository used it. And the kind system had a latent asymmetry: scalar
kinds default to nothing (`y: string` refuses to generate unmet),
while the container units default to empty (`y: {}` generates `{}`),
so "this must be a map, and it must be supplied" had no spelling at
all.

A sigil for path literals (`%$.a.b`) was considered and rejected: `%`
is the alias sigil with a third meaning already reserved (IDEAS.md),
and the recorded principle — G4's design space, option D — is that
everything a sigil can say, a builtin can say.

### Decision

`path(p)` **captures** its argument: the spelling, never the
resolution. This is the language's one non-strict argument position,
and the capture runs in prepare, before the argument is driven. The
captured value is a scalar of a new kind sitting **under `string`**
in the kind lattice (`KIND_PARENT` gains one row, exactly as the
number tower's leaves did), whose peg is the address spelling in the
grammar `refer` reads. Meets are syntactic — two path values meet
only when they spell the same address, and a path value refuses a
plain string literal exactly as the tower's leaves refuse each other.
Generation emits the address string; canon renders the call back,
which reparses to the same value.

`path()` with no argument is the path **kind**. It promotes: a string
value that spells an address is admitted as the path value — the
mirror of `number & 1`, and the bridge that keeps the schema/data
split intact (the schema writes the kind, plain JSON-shaped data
writes the string, the meet promotes). Promotion happens at the kind,
never between two concrete values. A string that is not an address
refuses with the new code `path_address` (class `parse`).

`map()` and `list()` are the container **kinds**: they admit exactly
what the units admit and default to nothing. The convention this
establishes: **a value constructor's vacuous call is its kind; the
literal is its unit.** `refer()` is unaffected — it is a constraint,
not a constructor, and its vacuous form stays the unmet constraint.

`refer` and `rel` accept path values as addresses. Existence stays
`refer`'s contract: a path value is data (`path($.nope)` generates),
because a self-checking value would be a global constraint — it would
keep the pass loop alive, hang inside `type()` bodies exactly as
`refer` does (G4 phase 4), and stop module fragments that address
their consumer's tree from standing alone.

Repurposing a shipped builtin is a breaking change, accepted here
because the old meaning had a complete replacement spelling and zero
uses; the CHANGELOG carries the migration note.

### Consequences

The verbs separate cleanly: `$.a` embeds, `path($.a)` names,
`refer()` asserts, `rel()` declares. A vocabulary can declare a
path-valued field (`type({host: path()})`) and settle, which `refer`
inside a `type()` body cannot. `map()` unmet and `refer()` unresolved
are the same flavour of requiredness at the value and graph levels.

Not done here, recorded as future work in
`docs/design/PATHS.0.md`: the resolved-link stamp (`link`/`relkey` on
a `StringVal`) is not yet replaced by intrinsic path values, the
graph still reads stamps rather than values, and the refer flow's
effect-timing questions (disjunct-branch leaks, generation-time
preference collapse against unification-time address need) are
orthogonal to representation and untouched.

This does not reverse ADR-001 or ADR-002: both ports land together,
the shared rows live in `test/spec/path.tsv` and
`test/spec/containerkind.tsv`, and coverage stays at 100 %.

## ADR-016 — A string is never a path: conversion lives in the call, and paths meet by prefix

**Date:** 2026-08-31
**Status:** Accepted

### Context

ADR-015 made paths first-class but left two bridges to the string era
standing: the path kind PROMOTED a string that spelled an address
(`path() & "$.a"` became the path value), and `refer()`/`rel()` still
accepted a bare string as an address, so every pre-ADR-015 document
kept evaluating unchanged. The cost of the bridges was the ambiguity
they preserved: whether `"$.a"` in a document was a path depended on
what later met it, which is exactly the property a first-class kind
exists to remove. And two path values could meet only when equal,
though one address that opens another is not a disagreement — it is
the same place, told more precisely.

### Decision

**A bare string is never a path.** The one conversion the language
has is the `path(...)` call's own argument: a string literal converts
at capture, and a COMPUTED argument — an expression, a reference to a
string — evaluates first and converts by the same grammar at resolve,
which keeps addresses buildable (`refer() & path("$.customers." +
key())`). Everywhere else a string stays a string: the kind does not
promote (`path() & "$.a"` refuses as `integer & "x"` does), `refer()`
refuses a string address (`refer_address`), and `rel()` refuses
string leaves (`rel_address`).

*Amended (same review, after landing):* inside the call, string text
with NO anchor converts as RELATIVE — `path("a.b")` is `path(.a.b)`,
the address the raw spelling `path(a.b)` captures — because only raw
reference spellings are meant to escape evaluation, not string text
that happens to lack its `$.` or `.`. Only the anchor is supplied:
text that spells nothing once anchored (an empty string, an empty
segment, a broken `$` spelling) still refuses (`path_address`). It
remains true that a bare string is never a path: the conversion, as
before, happens only inside `path(...)`.

**Paths meet by the prefix rule.** Two path values unify when one
spells a prefix of the other — same anchor, the shorter's segments
opening the longer's — and the result is the LONGER. Incomparable
spellings refuse as unequal scalars (`scalar_value`). Subsumption
follows the meet: a prefix subsumes its extensions. The refer
residual folds AFTER plain values (cjo 120000) so sibling paths merge
before it settles, a second path peer refines a pending address by
the same rule, and the RESOLVED LINK is itself a path value — a
string link could not meet its own address re-stated.

The string-domain constraints treat a path value as a string with
more structure: `re()` and `length()` check the spelling, `neq()`
takes path arguments and excludes by path identity (kind AND
spelling — a plain string that happens to spell the address is not
excluded), and the pattern/message ARGUMENT positions stay
plain-string-only.

### Consequences

Data documents that carry addresses are Aontu documents now: a JSON
file cannot spell a path, and the corpus's agent-emitted records
(01-service-catalog's scaffolder candidate, 05-rbac-policy's audits,
10-data-model's order batches) moved from `.json` to `.aon` with
`path(...)` spellings. Canon renders every address as the call
(`refer(t)&path($.a)`, links as `path($.a)`), because a bare string
address no longer reparses. `use:` fields in `deprecate()` records
and other path-SHAPED prose stay strings — nothing checks them as
addresses, which is now visible in the spelling.

This supersedes ADR-015's promotion paragraph; the shared rows are
`test/spec/path.tsv` (amended) and the swept `refer`/`rel`/
`relation`/`graph`/`reach` suites. Both ports land together
(ADR-001) and coverage stays at 100 % (ADR-002).

## ADR-017 — The builtin call surface is declared, parsed by both ports

**Date:** 2026-08-31
**Status:** Accepted

### Context

The language recorded how many arguments each builtin takes and
nothing else: a `[min, max]` arity table per port, a second table for
positional comma groups, hand-rolled per-function argument checks in
each port with ad-hoc codes, hand-written signature headers in the
docs, an LSP that could only say "Aontu built-in function", and drift
gates that compared name sets alone. The cost was measured, not
theoretical: the `re`-pattern parity gap (TS refused a path value as
pattern text, Go accepted it) existed precisely because "the pattern
is string text" lived in two hand-rolled checks instead of one table.

### Decision

**The call surface is DECLARED, in the signature syntax itself**, in
`test/spec/signature.tsv` — one line per builtin, e.g.
`pack(d: map|list, template t: any) : map`. The mode vocabulary
(`value` unmarked; `capture`, `template`, `trial`, `projector`,
`text`) says what plain pseudo-TypeScript cannot: how each argument
is READ.

**Both ports parse the one declaration with a custom tabnas
grammar** (`ts/src/sig.ts`, `go/sig.go` — the same `@tabnas` engine
the aontu grammar extends), each embedding a build-time-inlined copy
(`make sig`) asserted byte-identical in its suite. Neither port
authors a table: the arity and positional tables are DERIVED from
the parse, the runtime signature gate (`func_arg`, with the rendered
signature line and the offending argument in its hint) reads it, and
the docs functions table and both LSPs (completion detail,
signatureHelp) render from it, drift-gated.

**The parity gate is the round-trip**: `render(parse(line))` is the
line, checked by both suites over every declaration row. With one
declaration and two parsers of it, registry drift between the ports
has no place to live.

### Consequences

Fifteen spec rows moved from bare `invalid-arg` to `func_arg` (the
case family's operand, the arithmetic operands, join's separator);
every bespoke code stays. Design and deltas:
docs/design/SIGNATURES.0.md.

## ADR-018 — The pipe operator is removed

**Date:** 2026-08-31
**Status:** Relocated to [#188](https://github.com/aontu-lang/aontu/issues/188)

Not an entry for this register, by the test at the head of this file:
removing one grammar token changes how one part of the language works,
not what the project is, and the entry weighed no alternative — it says
so itself. The one durable rule it stated, that a code removal is an ADR
matter, is [ADR-011](#adr-011--the-star-is-sugar-the-disjunction-is-the-structure)'s
precedent rather than this entry's.

**The decision stands and shipped**: `|>` is gone from both grammars,
and `x |> f(a)` is written `f(x, a)`. The full record, context and
consequences included, is
[#188](https://github.com/aontu-lang/aontu/issues/188).

---

## ADR-019 — The project stores module bytes, and federates the log

**Date:** 2026-09-04
**Status:** Accepted

### Context

[ADR-013](#adr-013--the-project-operates-one-transparency-log-and-nothing-else)
admitted exactly one service and bound it with five constraints, the
first of which was that it stores no module source, ever — "a log that
began caching artifacts would be the registry
[G6](docs/capability-review/g6-distribution.md) rejected, wearing a
different name." That sentence was right about the risk and wrong about
the arithmetic, and both halves are worth stating.

**What the no-bytes position cost.** A design note written under the
constraint states the consequence in its own first section: Go's
integrity comes from its checksum database, Go's availability comes from
a proxy that stores module bytes, and refusing to store bytes means a
record can prove what a release *was* without being able to hand it
over. A log proves; it does not serve. The answer offered was
`aontu_meta/vendor/`, which is consumer-side discipline rather than an
ecosystem guarantee. A commissioned survey of the field then found the
availability answer incomplete, and named the second hole: with no
stored bytes there is nowhere to put the mutable metadata channel —
withdrawal, advisories, revocation — that every mature ecosystem ended
up needing.

**What the arithmetic turned out to be.** G6 rejected a hosted registry
as "infrastructure the project must run forever", and ADR-013 conceded
that half of the reasoning applies to a log "unchanged, and the whole
cost". Costed against current object-storage rates, storage is not the
expense at any scale this project will reach: a hundred thousand stored
versions sits inside a free tier, and a million costs single-digit
dollars a month. Egress, which is the line item that makes a package
CDN expensive, is zero on the chosen provider. The design note carries
the table.

The cost that is real is not infrastructure. **A repository that stores
what other people publish is a moderation venue**, and that obligation
is denominated in a named human rather than in dollars. It is accepted
here explicitly rather than discovered later.

Two developments made the reversal cheaper than it would have been when
ADR-013 was written. Sigstore's Rekor v2 reached general availability
and is served as C2SP `tlog-tiles` static objects with `sumdb/note`
checkpoints — the exact format the client half already verifies against
689 upstream-generated vectors. And the artifact channel ADR-013
assumed, an OCI registry, was foreclosed by a later constraint, leaving
the artifact question open rather than settled.

### Decision

**The project stores module bytes, and operates a module repository
instead of a transparency log.** Attestation federates to Sigstore.

ADR-013's constraint 1 is reversed. Its constraints 2 to 5 are inherited
verbatim and bind the repository, because they are what made an operated
service admissible at all:

1. **A build that has a lockfile never touches it.** Evaluation stays
   hermetic; the repository is consulted only when *adding* a version
   the lockfile does not already pin. If the service dies tomorrow,
   every existing project keeps building.
2. **It is publicly replicable, in a standard format.** The read path is
   static, content-addressed objects in a GOPROXY-shaped layout, served
   from a bucket with no code on the read path. Mirroring is a directory
   copy, which is the property that makes constraint 4 real.
3. **Its client half is in both ports, under
   [ADR-001](#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec).**
   Pin checking and proof verification are language behaviour. Only the
   publish path lives in one place.
4. **It has a stated exit.** The bucket can be frozen and mirrored, and
   a frozen mirror still *serves* — a stronger exit than the log's,
   which could only prove.

Three constraints are new, and are the ones this entry adds rather than
inherits:

5. **The service fetches nothing, parses nothing and evaluates nothing.**
   A publisher uploads; the repository stores. This is what keeps the
   entire ingestion threat model deleted — no forge adapters, no SSRF
   allowlist, no observation queue, no negative caching — and reversing
   it re-opens all of it. A repository that evaluated submissions would
   be running attacker-chosen input through the evaluator on a server.
   *(Amended same day by
   [ADR-022](#adr-022--compatibility-is-computed-so-the-major-leaves-the-name):
   **the fetching half is untouched** and is what deletes the ingestion
   threat model. Evaluation is now permitted **at publish only** — on
   authenticated input, under a deterministic budget, once per publish —
   so that backwards compatibility can be enforced rather than trusted.
   Never at read, never on unauthenticated input. The concern this
   clause names is answered rather than dismissed: publication requires
   a proved namespace, so the input is not attacker-chosen in the sense
   that mattered when the service also held no bytes.)*
6. **It operates no transparency log.** Identity, signing and the log
   are Sigstore's: Fulcio for publisher identity, Rekor v2 for the log,
   the Sigstore bundle as the stored proof, the TUF trust root for
   rotation. This retires key custody, checkpoint signing, witness
   recruitment, and the unanswered objection that a Worker's secrets are
   readable by whatever is deployed to that Worker.
   *(Qualified 2026-09-06 by [ADR-024](#adr-024--the-forges-token-authorises-a-publish-and-sigstore-is-one-provider-of-the-proof-not-its-definition):
   Sigstore supplies these as a **provider** under a proof contract
   stated in the project's own terms, and a publish is authorised from
   the forge's token rather than from a Fulcio certificate. The
   constraint itself — the project operates no log — is unchanged.)*
7. **Withdrawal changes selection, not history.** A retracted or
   tombstoned version stops being selected and stops being served, but
   the record of what was published — its pins and its signature bundle
   — is retained and stays verifiable. Erasure is reserved for content
   that cannot lawfully be retained, and leaves a tombstone behind.

### Consequences

**We accept a moderation obligation**: an abuse contact, a named
responder, a stated turnaround, and a takedown runbook that exists
before the first public publish rather than after the first incident.
The storage provider is itself a host with its own removal process, so a
project whose only takedown path runs through its provider has account
suspension as a failure mode, which takes down every module at once.
This is the recurring cost, and it does not shrink with automation.

**We accept a second checkable pin.** The archive digest becomes a pin a
client can verify before parsing, alongside the canon-hash it verifies
after evaluating. This is a gain rather than a complication — it gives
back a cheap pre-parse gate, which is the answer to the objection that
hashing meaning makes the evaluator the verification surface — but the
order is now a specified behaviour in both ports, not an implementation
detail, and a client that checks only the cheap pin is a defect.

**We do not accept provenance as a control.** The survey's finding
stands and is not softened by adopting more of Sigstore: no mainstream
package manager verifies provenance at install by default, and malicious
packages shipped with cryptographically valid attestations twice in
2026. Sigstore is adopted for tooling reuse and forensics. No safety
claim is made to users on its basis.

**What this does not license.** It admits one service, narrowly scoped,
exactly as ADR-013 did — and it is the *replacement* for that service,
not an addition to it. It is not a precedent for a hosted evaluator, a
query surface, a hosted build, or a second service; each would need its
own entry. *(One since has:
[ADR-021](#adr-021--the-project-hosts-private-packages-with-authenticated-reads)
admits a hosted private tier through this clause rather than around it,
and inherits constraint 1 — a locked build contacts neither service.)*
It does not weaken
[ADR-002](#adr-002--test-coverage-stays-at-100--in-both-implementations):
the network code reaches the coverage floor through an injected seam, as
`ModuleFs` and `ModuleEval` already do, or it does not land. And it does
not disturb [G5](docs/capability-review/g5-trust-contract.md): no
include is ever executed in the evaluating process, and a repository
changes where bytes come from, never what they are allowed to do.

The G6 boundary bullet and the
[G10](docs/capability-review/g10-transparency.md) boundary are amended
in the same commit as this entry. The design, its cost model, its
registry-management policy and its open questions are `REPOSITORY.0.md`
in `aontu-lang/system`; status is the
[progress register](docs/capability-review/progress.md).

---

## ADR-020 — A module path is `<domain>/<path>`, and the domain is a proved namespace

**Date:** 2026-09-04
**Status:** Superseded in part, same day, by
[ADR-022](#adr-022--compatibility-is-computed-so-the-major-leaves-the-name).
**The major version leaves the path**, because subsumption decides
backwards compatibility and the repository enforces it — so the naming
scheme no longer has to make the unsafe substitution unspellable. Parts
2, 3, 4 and 6 are unchanged, and part 1 is reinforced rather than
disturbed: with the major gone, the last piece of resolution semantics
leaves the string, and the path is purely a name.

### Context

[G6](docs/capability-review/g6-distribution.md) settled that a module
path is domain-based, CUE/Go-style, with the major version in the path,
and `MODULE_RE` in both ports has enforced a domain-shaped first segment
since. What was never settled is **which domains**, and the gap was
load-bearing in a way that only became visible once
[ADR-019](#adr-019--the-project-stores-module-bytes-and-federates-the-log)
gave the project somewhere to publish to.

Two problems sat in that gap.

**Ownership was unprovable.** A domain-shaped name ties identity to DNS
control, which is the structural reason Go and Cargo were immune to
dependency confusion. But nothing checked it. A commissioned survey put
the requirement precisely: bind trust to a first-seen key or first-seen
resolution, "not to whoever controls the DNS at fetch time", because
domain ownership is a fact about today rather than about when a module
was published.

**Addressing a forge appeared to require putting DNS in the trust base.**
The one ground on which the forge-tag registry design was rejected and
which survived every later revision was that domain-based paths "cannot
address a forge repository without Go's `?go-get=1` vanity protocol,
which puts arbitrary DNS holders inside the trust base". A later design
note compounded this by rejecting `github.com/alice/widgets` as a
spelling that "discards the domain-shaped identity" — which is not true,
and `MODULE_RE` matching it unamended is the proof.

### Decision

**Every module path is `<domain>/<path>`. The domain is a namespace the
publisher must prove, and it is never resolved.**

Five parts, each load-bearing:

1. **The path is a name, not a fetch instruction.** Bytes always come
   from the repository, whatever the path says. Nothing performs DNS
   resolution on a module path at install time. This is what separates
   the convention from Go's, and it is what retires the rejection ground
   above rather than trading against it.

2. **Admission is tiered.** Tier A is forge namespaces —
   `github.com/<org>/<repo>`, `gitlab.com/<group>[/<subgroup>…]/<project>`
   and their equivalents — and is what exists first. Tier B is verified
   domains, `corp.example/schemas/service`, and comes later.

3. **A host is admissible only when publishing from it both proves
   namespace ownership cryptographically at publish time and issues a
   stable identifier for that namespace which is never reused.** GitHub
   Actions' OIDC token carries a `repository` claim and GitLab's a
   `project_path`, both of which Fulcio records in the issued
   certificate; GitHub's `repository_id` and `repository_owner_id`, and
   GitLab's `project_id` and `namespace_id`, supply the second half. A
   forge with no OIDC cannot be admitted, because there would be nothing
   to check; **a forge that publishes only paths cannot be admitted
   either**, because names are recycled and part 4 would have nothing
   durable to record. The allowlist is the output of this rule, not a
   curated list, so admitting a new host is a factual question rather
   than a policy argument.
   *(Amended 2026-09-06 by [ADR-024](#adr-024--the-forges-token-authorises-a-publish-and-sigstore-is-one-provider-of-the-proof-not-its-definition):
   the claims are verified from the forge's token directly, by the
   write path. Fulcio's copy of them in a certificate must agree, but
   it is not what decides admission — so admissibility is bounded by
   this rule and not by the issuers Fulcio accepts.)*

4. **Ownership is checked per publish, and the signing subject is
   recorded — as an identifier pair, never as a name.** To publish
   `github.com/alice/widgets@1` the signing certificate must carry
   `repository = alice/widgets` *(ADR-024: the forge's token must carry
   it, verified by the write path; a certificate accompanying the upload
   must agree)*. There is no account, no name
   reservation, and no squatting policy, because a name nobody can prove
   they own is a name nobody can publish. But the namespace check alone
   cannot tell a legitimate transfer from a hostile one — see the
   repojacking consequence below — so **the subject is the pair
   `(owner_id, repository_id)`**, recorded at a path's first publish,
   with a later change of that pair treated as an event rather than a
   routine publish. A subject defined by name would inherit the very
   problem it exists to solve.

5. **No module is unnamespaced.** Namespacing is a property of the name
   rather than a feature the repository adds, so it cannot be opted out
   of or forgotten.

6. **A rename is a new module plus one signed forward link, and nothing
   follows it automatically.** The old path publishes a `moved`
   declaration in a new, higher version — Go's `retract` shape — naming
   the destination and signed by the namespace it is leaving. Resolution
   of a moved module *refuses*, naming the destination; it never
   redirects, because a name that quietly means something else is the
   failure this entry exists to prevent. A moved path is then frozen
   against further publication by anyone.

### Consequences

**We accept that a tier-A name is bound to its forge.** A publisher who
leaves GitHub changes the module path, and a changed path is a new
module identity. Go accepts the same cost. Tier B is the graduation
path, and graduating is the rename part 6 describes.

The rename is cheaper here than in Go for a reason worth recording: the
canon-hash covers the evaluated value and contains no module path, so a
module republished byte-identically at a new path keeps **the same
pin**. A rename is continuity of meaning with a discontinuity of name.
Locked builds never notice one, because the old path's objects are never
deleted and a build with a lockfile does not consult the repository.
And when both paths appear in one closure, unification is idempotent, so
two identical copies unify rather than colliding as duplicate types
would — the case that makes renames painful in Go is mild in a data
language, which is why a consumer-side alias is deferred rather than
built.

**We accept repojacking as the cost of a forge-shaped name.** A
per-publish namespace check cannot distinguish an abandoned account
taken over from one legitimately transferred, and GitHub retires a
namespace only above 100 clones at rename time. This is documented as
hitting Go hardest of any ecosystem, for exactly the reason it applies
here: Go module paths are forge paths. Two properties of this design
blunt it — no published version can be altered, because the service
never fetches from a forge, and every existing lockfile is pinned by
meaning and digest — but a taken-over namespace can still publish a
*new* version. Recording the signing subject (part 4) and gating a
subject change behind cooldown is the mitigation, and it is a lever Go
does not have because admission is ours to decide. Part 6's freeze
closes the rename-shaped half of the window outright.

**We accept the forge's identifier promise as an inherited invariant.**
Defining the subject as `(owner_id, repository_id)` makes the control
decidable with no threshold to tune: a workflow rename, a repository
rename, an owner rename and a new commit all leave the pair untouched,
while a transfer moves the owner half and a delete-and-recreate moves
both. The false positive that made this look hard — ordinary workflow
maintenance reading as a takeover — cannot occur, because a Fulcio
identity names a workflow but the subject does not. The same primitive
was reached independently by Microsoft Entra, which migrated GitHub
Actions federated credentials to immutable subjects against this exact
attack. What we accept in exchange is that the pair's immutability is
the forge's promise rather than a cryptographic property: it is
documented, and load-bearing for other people's security as well as
ours, but a host that broke it would silently turn every recorded
subject into a mismatch.

**We accept a case rule.** `MODULE_RE` restricts the domain to lowercase
but admits mixed case in path elements, and forge namespaces are
case-insensitive for lookup, so `github.com/Alice/Widgets` and
`github.com/alice/widgets` would otherwise be two names for one
repository. Tier-A elements are normalised to lowercase at publish, and
a path colliding case-insensitively with an existing one is refused.

**We accept that per-host shape is data, not inference.** GitHub
namespaces are exactly two segments; GitLab subgroups are
variable-depth, so the boundary between project and subdirectory cannot
be derived from the string and is recorded at publish.

**The naming rule itself costs nothing to build.** `MODULE_RE` accepts a
tier-A path today and `validateModulePath` already applies Go's rules,
so parts 1 to 5 are repository admission policy rather than a language
change. A local, vendored or privately-hosted module keeps whatever
domain-shaped path it has, and nothing that evaluates today stops
evaluating. No shared spec row changes, because no language behaviour
changes.

**Part 6 is the exception, and it is language work.** `moved` is a field
in `mod.aon`, which resolution already reads locally, and `module_moved`
is an addition to the error-code contract. Both land in both ports under
[ADR-001](#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec),
and because the check is local — a vendored module can carry `moved` —
it is expressible as shared spec rows, unlike the network verbs that
G6 phase 3 had to cover by CLI parity instead. A code *removal* is
already settled as a decision-record matter
([ADR-011](#adr-011--the-star-is-sugar-the-disjunction-is-the-structure)
is the precedent); this addition is recorded here so it is deliberate
rather than incidental.

**What this does not license.** It does not admit resolution of a module
path over the network, in any tier, for any purpose — that is part 1,
and reversing it reinstates the trust-base objection this entry exists
to retire. It does not make a moved name follow automatically, which is
part 6 and the same objection wearing a friendlier face. It does not
make ownership a claim the publisher asserts rather than proves. And it
is not a private-module or authentication design, which stays out of
scope for the reason G6 gave.

The design is `REPOSITORY.0.md` in `aontu-lang/system` — §3a for the two
tiers, §3b for the rename, §7.6 for repojacking and what it costs;
status is the [progress register](docs/capability-review/progress.md).

---

## ADR-021 — The project hosts private packages, with authenticated reads

**Date:** 2026-09-04
**Status:** Accepted

### Context

[ADR-019](#adr-019--the-project-stores-module-bytes-and-federates-the-log)
admits exactly one service and says plainly what it does not license:
it "is not a precedent for a hosted evaluator, a query surface, a hosted
build, or a second service; each would need its own entry." A hosted
private tier is such a second service. This is that entry.

The design note reached the opposite conclusion first, and the reasoning
is worth keeping because it is the list of obligations this entry now
carries rather than avoids. Three objections were raised against a
private tier: it appeared to reverse the static read path that makes the
public design cheap, mirrorable and structurally resistant to
denial of service; it means holding other people's confidential
configuration, where a breach is categorically worse than for public
data; and it brings accounts, billing, support and availability
commitments — an operational business rather than a language feature.

The first objection turned out to rest on a false choice. A private tier
does not have to *replace* the static read path; it can sit beside it.
The second and third are real and are accepted below as costs rather
than dissolved.

What makes the tier tractable is that the two hardest parts are already
solved by decisions taken for other reasons.
[ADR-020](#adr-020--a-module-path-is-domainpath-and-the-domain-is-a-proved-namespace)
established that identity is delegated to the forge rather than
operated, which supplies an answer to "who may read this" without the
project running accounts. And ADR-019's constraint 1 — a build with a
lockfile never contacts the service — means an outage of a paid,
authenticated service still cannot stop anybody's build.

### Decision

**The project hosts private packages and serves them over authenticated
reads.** The public tier is unchanged; the private tier is additive.

Seven constraints bound it, and they are the decision rather than
implementation detail:

1. **The public read path is unchanged and stays mirrorable.** Static
   objects, no code, and every anonymous public request still costs at
   most one object read. A change that degrades the public path in order
   to serve the private one breaches this entry.

2. **Authentication is delegated, never operated.** Who may read a
   tier-A private package is whoever may read the corresponding forge
   repository; the forge already maintains that and already handles
   joiners and leavers. The project runs no accounts, teams,
   invitations, seats, or role administration of its own.

3. **No long-lived read credentials.** CI authenticates by OIDC, as
   publishing already does; humans get short browser-initiated sessions.
   npm spent late 2025 revoking exactly this class of credential, and
   reintroducing it here would be adopting what that ecosystem had just
   removed.

4. **The authenticating code never serves bytes.** It checks a
   credential and issues a short-lived presigned URL; content travels
   from object storage to the client. Cost and latency stay flat in
   package size, and egress stays free.

5. **A locked build still never contacts the service.** ADR-019's
   constraint 1 survives verbatim, so a vendored or cached private
   package builds offline exactly as a public one does — and an outage
   of a *paid* service still cannot break a build, which is what keeps
   the availability commitment bounded.

6. **A private package is indistinguishable from a non-existent one.**
   An unauthorised reader gets the same answer, in the same time, with
   no public listing and no index entry. A distinguishable refusal would
   disclose the name, which is the substance of what is being protected.

7. **The exit is export, not mirror.** ADR-019's stated exit was to
   freeze the bucket and let anyone mirror it, and private data cannot
   be published to a mirror. Every customer can therefore export
   everything they have stored, at any time, without asking — designed
   in from the first version rather than added when somebody leaves.

### Consequences

**We accept custody of confidential configuration.** Infrastructure
topology, IAM shapes, internal hostnames and allowed-origin lists are
exactly the material this language is used to express. A breach is
categorically worse than for public data, and the obligations that
follow — encryption at rest, access logs the customer can read, and a
breach-notification duty measured in hours — are part of the decision,
not operational detail to settle later.

**We accept that some denial-of-service surface returns.** The public
tier's structural defence is that no anonymous request makes the service
do work. An authentication endpoint is anonymous-reachable and does
work, so it is rate-limited separately from the public path and ordered
to reject cheaply before it checks expensively. This is a bounded
exception to a property the public path keeps in full.

**We accept an operational business.** A status page, an availability
commitment, support, billing and usage metering. This is the real cost
and it is not technical. Two consequences reach the design and so are
recorded here: **metering must exist from the first private version**,
because billing retrofitted onto unmetered history is guesswork; and
**the free public tier must not subsidise an unbounded private one**, so
quotas and the missing hard spend cap apply to both.

**What this does not license.** It admits a second service, narrowly
scoped, and is not a precedent for a third. It does not admit a hosted
evaluator, a hosted build, or a query surface — each would still need
its own entry. It does not weaken
[ADR-002](#adr-002--test-coverage-stays-at-100--in-both-implementations):
the client half reaches the coverage floor through an injected seam like
every other network path, or it does not land. And it does not touch
[G5](docs/capability-review/g5-trust-contract.md): a private package is
data on the same terms as a public one, and where its bytes came from
changes nothing about what they are permitted to do.

The design, its seven constraints and the four questions it leaves open
are `REPOSITORY.0.md` §10.6 in `aontu-lang/system`; status is the
[progress register](docs/capability-review/progress.md).

---

## ADR-022 — Compatibility is computed, so the major leaves the name

**Date:** 2026-09-04
**Status:** Accepted

### Context

[ADR-020](#adr-020--a-module-path-is-domainpath-and-the-domain-is-a-proved-namespace)
put the major version in the path, Go-style, and the design note called
that "what makes MVS sound". **That overstated it**, and the correction
is the whole of this entry.

Minimum version selection **substitutes upward**: a dependency that asks
for `core` 1.1.0 is handed 1.3.0 when something else asked for that, and
it was never tested against it. So MVS is only safe under the *import
compatibility rule* — a newer version must work wherever an older one
did. Nor can the claim travel with each requirement, because **MVS has
no upper bounds**: npm's `^1.1.0` says "and not 2.x", while an MVS
requirement is a bare minimum. The compatibility claim has to come from
somewhere else entirely, and putting the major in the name is one way to
supply it: `@1` and `@2` become different packages, so the unsafe
substitution is unspellable.

It is not the only way, and for this project it is the weaker one.

**In Go, a SemVer major is a promise the toolchain cannot check.**
Nothing verifies that v1.3.0 really is compatible with v1.1.0; the
version number is trusted. Most major bumps are therefore precautionary
— published because the author *thinks* something broke.

**Here it is decidable.** [G3](docs/capability-review/g3-subsumption-evolution.md)
subsumption answers exactly the question the rule asks: does every
instance the old version admits, the new one admit too? Two properties
make that compose:

- **Subsumption is transitive**, so checking each version against only
  its immediate predecessor establishes compatibility with *every*
  predecessor. One check per publish, not one per pair.
- **Unification is monotone** — loosening a conjunct loosens the meet —
  so pairwise-enforced compatibility yields **closure-wide**
  compatibility with no extra work.

One premise also changed underneath the earlier reasoning.
[ADR-019](#adr-019--the-project-stores-module-bytes-and-federates-the-log)
made the repository store the source, so "the service does not have the
bytes" is no longer a reason it cannot check anything.

### Decision

**Compatibility is computed and enforced, so the major leaves the name.**

1. **A package path carries no major version.**
   `corp.example/schemas/service`, not `corp.example/schemas/service@1`.

2. **The repository refuses a publish that is not backwards compatible
   with its predecessor**, decided rather than asserted by a version
   number. **Compatibility has three components, and all three must
   hold:**

   | | Requires | Answered by |
   |---|---|---|
   | **Acceptance** | The new version admits every document the old one admitted | Subsumption |
   | **Determination** | Every position the old version resolved to a value, the new one still resolves | Canonical-form comparison |
   | **Agreement** | Where both resolve a position, they resolve it to the same value | Canonical-form comparison |

   Together these say what a consumer actually needs: **any document
   that evaluated successfully under the old version evaluates
   successfully under the new one, to the same value.**

   Subsumption alone gives only the first, and an earlier draft of this
   entry stopped there and called it strict. It is not. `a: integer`
   subsumes `a: 8080` — the check passes — while the old version
   produces `{"a": 8080}` and the new one refuses with
   `[aontu/mapval_no_gen]`, so a consumer who supplied nothing had a
   working build and now has an error. Acceptance and outcome are
   different questions, and for a language whose payload is a *value*
   it is outcome that consumers depend on.

   Components 2 and 3 are a structural walk rather than a new theory:
   evaluate both versions standalone, take `hcanon` of each, and
   classify every difference as **constraint-only** (outcome-neutral,
   passes) or **outcome-affecting** (a determined value appeared,
   vanished or changed). **The check is conservative: where it cannot
   prove a difference outcome-neutral, it refuses.** For packages with
   conditional or computed structure, "for every consumer input" is not
   decidable in general, and refusing is the correct direction for a
   guarantee that claims to be strict.

   A genuine break therefore requires a new name, chosen by the
   publisher — but only when the break is real and verified, not
   whenever an author fears one.

3. **ADR-019's constraint 5 is amended.** The service still **fetches
   nothing** — that is what keeps the ingestion threat model deleted,
   and it is untouched — but it **may evaluate at publish**: on
   authenticated input only, under a deterministic budget, one
   evaluation per publish. Never at read, and never on unauthenticated
   input.

4. **Every reference self-describes**, and nothing is inferred from
   absence:

   | Form | Means |
   |---|---|
   | `corp.example/schemas/service` | a package |
   | `./f.aon`, `../g.json`, `/abs/h.aon` | a local file |
   | `alias:legacy` | a package alias |

   A local file reference **must** carry `./`, `../` or `/`. This is
   what removes the ambiguity the major used to resolve by accident: a
   bare `foo.aon` is domain-shaped enough to look like a package, and
   the leading `./` is what tells the two apart.

5. **Coexistence is by alias, declared by the consumer.** A project that
   genuinely needs two versions of one package names the second itself,
   rather than every publisher encoding "somebody might need two of me"
   in their name forever.

### Consequences

**We accept an evaluator on the publish path.** A server-side evaluator
defect becomes reachable by an authenticated publisher. It is bounded by
three things — publication requires a proved namespace under ADR-020, it
is one evaluation per publish rather than per read, and the deterministic
evaluation budget applies. That budget is therefore now a **server**
requirement and not only a client one.

**Defaults are covered by component 3, not left as a gap.** An earlier
draft of this entry recorded "subsumption does not cover defaults" as an
accepted hole: `port: integer & *8080` becoming `integer & *9090` leaves
the admitted set identical, so a subsumption-only check passes while
every consumer relying on the default gets a different value. That is
the hostile-value class arriving through a nominally compatible release,
and it is not something to accept — it is the reason the definition has
three parts. Agreement refuses it.

**We accept that "declared" still needs a shape.** A publisher who
genuinely intends an outcome change has two possible routes — a new
name, or an acknowledgement that consumers see at resolve time — and
this entry does not choose between them. What it fixes is that the
change cannot happen *silently*.

**We accept a migration diagnostic.** With `./` mandatory, a bare
`@"foo.aon"` classifies as a package and would fail with "package not
found", which is the wrong message for what will be the commonest
mistake. A reference whose final segment carries a known file extension
and no `./` refuses with *"local files need a `./` prefix"*. Routing
stays a shape rule; only the error is special-cased.

**Aliased versions may meet, and component 3 is why.** An earlier
draft required separate subtrees. Constraints meet without trouble —
`integer & 8080` is `8080`, the narrower — but two aliased versions
could still clash on a **default**, and under a subsumption-only
definition nothing prevented it: `*8080 & *9090` refuses with
`pref_rank_clash`, defaults having no meet of their own.

**Component 3 removes the restriction**: versions
sharing a name now agree wherever both determine a value, so the clash
cannot arise between them. A consumer may still rank a default
(`**9090`) to state deliberately which layer is weaker, but nothing
forces the separation.

The reasoning here reversed twice while this entry was drafted, and why
is worth recording: **whether two versions can meet is downstream of
whether the compatibility check covers outcomes.** It was never an
independent question about aliases.

**What this supersedes and what survives.** ADR-020's part 2 (two
admission tiers), part 3 (a host must prove ownership and issue a
stable identifier), part 4 (the subject is an identifier pair) and part
6 (renames by one signed forward link) are unchanged. Its part 1 — the
path is a name and never a fetch instruction — is not merely unchanged
but reinforced, since dropping the major removes the last piece of
resolution semantics from the string. Only the major-in-path element
goes.

**What this does not license.** Evaluation at read, in any tier, for any
purpose. Evaluation of unauthenticated input. And it does not weaken
ADR-019's constraint 5 on **fetching**, which is the half that deletes
the ingestion threat model and is untouched here.

The design is `CLI.0.md` §3.3 and `REPOSITORY.0.md` §3a in
`aontu-lang/system`.

---

## ADR-023 — G9 completes at the renderer: the reflection sidecar, the Jostraca bridge and string interpolation are retired

**Date:** 2026-09-05
**Status:** RETIRED 2026-09-11 — its own enforcement clause reached

Not an entry for this register any more, and the entry said how it
would end: *"A future phase that adds a reflection surface, a
file-merge dependency or an interpolation syntax supersedes this entry
rather than amending a row."* The Jostraca component primitives are a
production design choice as of 2026-09-11 — `project`, `folder`,
`file`, `content` and the rest are aontu functions, built in both
implementations for [ADR-001](#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec)
parity and pinned by `test/spec/cmp.tsv` — so the ground this entry
stood on for phase 7 is gone, and that phase's row in
[`docs/capability-review/progress.md`](docs/capability-review/progress.md)
carries what landed. It retired the bridge on an 11x install growth
and a merge-over-hand-edits lifecycle; the components take no
dependency in either direction and build a plan, which is a different
thing from the bridge this refused.

**The other two retirements stand, on their own evidence and not on
this entry.** Phase 5 is not built because a transform states its facts
as data and the vocabulary vets them
([GENERATION-FORMS.0.md](docs/design/GENERATION-FORMS.0.md) is where
the embedding surface was measured); phase 8 is not built because
`${expr}` was measured to break on this project's own material
([TEMPLATE.0.md](docs/design/TEMPLATE.0.md)), and `replace` carries it
instead. The register's rows for those two phases are the record.

**The parity boundary this entry drew is withdrawn with it.** It read
ADR-001's obligation as covering the language and the verbs but not an
embedding surface. Nothing turns on that reading now: the components
are held to full parity like every other builtin.

---

## ADR-024 — The forge's token authorises a publish, and Sigstore is one provider of the proof, not its definition

**Date:** 2026-09-06
**Status:** Accepted

### Context

[ADR-019](#adr-019--the-project-stores-module-bytes-and-federates-the-log)'s
constraint 6 federated identity, signing and the log to Sigstore, and
its consequences adopted Sigstore "for tooling reuse and forensics",
with no safety claim made on it. The design note's §6 lists six
components — Fulcio, Rekor v2, the bundle, `cosign`, the TUF trust
root, the conformance suite — and reads as one dependence. Asked what
the dependence actually *is*, it separates into four kinds, and they
are not equally deep.

**Formats.** The log is C2SP `tlog-tiles` with `sumdb/note`
checkpoints, which is Go's format and modern Certificate Transparency's
before it is Sigstore's. The client in `aontu-lang/mod` is therefore
provider-neutral already: it verifies Rekor v2, a self-hosted static
log or a Sunlight log identically. What is Sigstore's own is the bundle
envelope and the certificate extensions in which Fulcio relays the
forge's claims — open specifications, and Sigstore's to change.

**Services, at publish time.** Fulcio mints a certificate and Rekor
records an entry when a package is published, and a client refreshes
the Sigstore trust root. A locked build touches none of these
(ADR-019, constraint 1), and a stored bundle carries its own inclusion
proof, so a proof already stored verifies offline against an archived
root.

**Trust.** The forge is the root of identity either way. Fulcio is a
notary: it turns an OIDC token that lives for minutes into a certificate
that is durable and publicly logged. What that buys is the property
`REPOSITORY.0.md` §8.0 rests on — the publisher signs with a key the
operator never holds, so a compromised bucket, Worker or provider can
withhold bytes but cannot make wrong bytes verify. What it costs is
§8.4's: a Fulcio compromise mints a certificate for any identity, with
no second opinion.

**Tooling.** `cosign` for publishers, `sigstore-js` and `sigstore-go`
in the two ports, the conformance suite in CI. These are heavy for this
project, which has taken seven dependencies in its life and declined an
eighth on install size
([ADR-023](#adr-023--g9-completes-at-the-renderer-the-reflection-sidecar-the-jostraca-bridge-and-string-interpolation-are-retired));
`sigstore-js` carries a large transitive tree of its own.

Two couplings were in the design and recorded nowhere.
[ADR-020](#adr-020--a-module-path-is-domainpath-and-the-domain-is-a-proved-namespace)'s
admission rule was written against the claims Fulcio records in a
certificate, so tier-A admissibility was silently bounded by the OIDC
issuers Fulcio accepts and not only by the rule the entry states. And
the public log excludes private packages by construction (§10.3a),
while the local registry of §10.7 serves packages that carry no bundle
at all — so two of the design's three deployment modes already had no
Sigstore path, and nothing said what verification meant for them.

Underneath both sits one conflation. §3a says "the Sigstore certificate
accompanying the upload must carry `repository = alice/widgets`": the
decision to *admit* a publish was being taken from a certificate. npm
and PyPI trusted publishing take it from the forge's own OIDC token,
verified directly against the forge's published keys, and use Sigstore
only for the provenance attestation that travels with the artifact.
Authorisation and attestation are different acts, and separating them
removes Fulcio from the admission path at no cost.

Living without Sigstore altogether is possible, and its shape is known:
the write path verifies the token, the repository signs the manifest
with a key of its own, and a static `tlog-tiles` log in the bucket
carries first observation. That is
[ADR-013](#adr-013--the-project-operates-one-transparency-log-and-nothing-else)'s
design plus storage — the Go model, operated by us — and it gives up
exactly what ADR-019 federated to obtain: an integrity root outside the
operator, and no keys to hold. Reopening that would be the third
reversal of one axis in a week. The right move is to make the dependence
one on an interface the project owns, so that Sigstore is a provider of
it rather than its definition.

### Decision

**A publish is authorised from the forge's own token, verified directly.
What a client verifies on first acquisition is stated in the project's
own terms, and a Sigstore bundle is one encoding of it.**

Five parts:

1. **Authorisation is the forge's token.** The write path verifies the
   OIDC token against the forge's published key set and reads from it
   the namespace claim, the identifier pair, the trigger and the runner
   environment. ADR-020's admission rule, the subject pair of
   `REPOSITORY.0.md` §7.6 and the trusted-trigger requirement of its
   §8.1 are all decided from the token, never from a certificate. Fulcio
   is not on the authorisation path, so a host is tier-A admissible
   under ADR-020's rule alone; which attestation providers can serve it
   is a separate fact.

2. **A proof is verified under a contract the project owns.** A client
   accepts a package version on first acquisition when three things
   hold: the manifest — the archive digest, the file manifest and the
   canon-hash of each module — is signed; the signer is an identity the
   proof names, and the client's trust configuration accepts that
   identity for the package's name; and, where the trust configuration
   requires it, an inclusion proof places the signed manifest in a
   `tlog-tiles` log whose checkpoint key the client trusts, checked by
   the client `aontu-lang/mod` already is. Nothing in the contract names
   Sigstore, Fulcio or Rekor.

3. **A Sigstore bundle is one encoding of the proof.** For a public
   tier-A package the default provider is the Sigstore public-good
   instance: identity from Fulcio, the log Rekor v2, the envelope the
   bundle, stored verbatim beside the archive as §2 says, and the
   certificate's claims required to agree with the token's. The provider
   sits behind the same injected seam the fetch path uses, and its
   verifier — `sigstore-js` and `sigstore-go`, or something narrower — is
   held to differential vectors from a pinned reference exactly as the
   log client is.

4. **The contract admits more than one provider, and a second proves
   the seam before the first third-party publish.** The second is the
   minimal one the design already needs: a signature by a named key,
   with no log, which is what the local registry of §10.7 serves and
   what a private package under §10.3a can carry. Its trust entry names
   the key. Whether that provider ever gains a log is §13's
   private-provenance question; a project-operated log would reverse
   ADR-019's constraint 6 and needs its own entry, and nothing here
   decides it.

5. **The exit is a provider swap.** A change in the public instance's
   terms, formats, issuer list or availability is answered by another
   provider under the same contract, never by a change to what a client
   verifies. Publishing over a provider stops when that provider does;
   builds, and verification of proofs already stored, do not.

### Consequences

**We accept ordinary token hygiene on the write path.** Key-set refresh,
an audience bound to the repository, expiry and replay checks, clock
skew. The write path already authenticates publishers under ADR-019;
this changes what it verifies, not that it does.

**We accept that the operator-independent signature is a property of a
provider, not of the contract.** Under the Sigstore provider a
compromised Worker cannot make wrong bytes verify, which is §8.0's
property intact. Under a key provider whose key the operator holds, it
can — and any name trusted to such a key is trusted to whoever holds it.
The trust configuration is where that is visible, which is why §10.7's
rule that routing and trust are separate lists is load-bearing here
rather than a tidiness.

**We accept two things the client must carry.** The Sigstore trust root
for the first provider, refreshed through TUF, and a trust configuration
that names acceptable signers per name pattern. Its default for a public
name is the forge identity via Fulcio with inclusion required, and that
default is what makes first-acquisition verification mandatory (§8.0)
rather than a signal whose absence means nothing.

**We accept a specification to write, in the public repository.** The
manifest is an aontu document, under `CLI.0.md` §5's rule that the
toolchain invents no formats. The proof's fields and the trust
configuration's shape are specified in `aontu-lang/mod`, beside the leaf
and checkpoint specification the
[G10](docs/capability-review/g10-transparency.md) split already places
there — because they are what a client relies on to verify, and the
split's one hard rule is that nothing of that kind lives in
`aontu-lang/system`. The write path's token verification and the roster
of providers the service offers are operational and stay in `system`.
The second provider needs no envelope invented for it: a detached
signature over the manifest is the whole of it.

**What this does not license.** It does not reverse ADR-019's
constraint 6: the project operates no log. It makes no safety claim on
any signature — ADR-019's finding that provenance is forensics stands.
It does not admit network resolution of a module path (ADR-020, part
1). It does not weaken
[ADR-002](#adr-002--test-coverage-stays-at-100--in-both-implementations):
each provider reaches the floor through the seam, or does not land. And
it does not decide private-package provenance, which stays §13's
question.

**Enforcement.** ADR-019's constraint 6 and ADR-020's parts 3 and 4
carry inline notes pointing here. `REPOSITORY.0.md` §3a, §6, §7.6 and
§8.4 carry dated amendments in `aontu-lang/system`, and its README
records the change. The G10 boundary gains "no provider-specific
verification contract"; the G6 boundary's signing bullet is annotated;
the register's G10 section records this entry without moving a row. A
phase-3 implementation whose client verifies a bundle outside the
contract, or whose write path decides admission from a certificate,
breaches this entry.

---

## ADR-025 — A reference's copy is an instance, and a match does not fire on an unfilled hole

**Date:** 2026-09-07
**Status:** Accepted

### Context

Running the whole use-case corpus under BOTH ports — the Go leg had
never been run over it — turned up two divergences that the shared
spec did not reach, and neither port was simply right.

**A finding under a list spread named the wrong element.**
`items: [&: $.entities.User]` over a `close({...})` target reported
the second element's bad email at `$.items.0.email` in TypeScript and
at `$.items.1.email` in Go. The Go answer had been recorded in
`use-cases/03-api-contract` as the correct one and a TypeScript-only
defect. It was neither: with two bad elements and a good one between
them, TypeScript reported both findings at the FIRST element's path
and Go both at the LAST. [ADR-005](#adr-005--template-instantiation-is-per-destination)'s
rule — *nothing path-dependent may be shared between two
destinations, or the first destination's resolution answers for them
all* — had been applied to spreads, generators and filter conditions
and deliberately withheld from reference resolution, whose sharing the
move()/copy() "ghost" canon rows pinned. A reference is a
destination. Sharing a call's argument map across three list elements
is that exact failure, arriving by a different road.

**A `match(_)` written as a schema vetted VALID over data its own arm
refuses.** The placeholder rule (ADR-005 rule 2, G8 phase 3) puts the
peer INTO a call holding a hole and does not keep it as a constraint
on the way out: `upper(_) & "hello"` is `"HELLO"`, not
`"HELLO" & "hello"`. That is right for a transformation. Applied to
`Event: match(_, {type:"order.placed"}, $.Placed)`, the document is
consumed selecting the arm and then never checked against it, so Go
answered `verdict: valid`, exit 0, for a payload violating the
`min(0)` printed in the arm beside it. TypeScript never reached the
rule, because `MatchFuncVal.unify` gates on its driven arguments
alone — an accident that happened to be the safe answer.

### Decision

1. **A reference's copy owns its arguments, unless what it copies has
   not decided yet.** Reference resolution uses the per-destination
   instantiation clone (`clone(ctx, {dup: true})` in TypeScript,
   `instanceClone` in Go), the same one a spread or a generator uses.
   The exception is a target with a STAGED call standing anywhere in
   it (`holdsStaged`): a staged call's arguments are still being
   driven at its own site under the staging rule, and a copy that
   owned them would drive its own set at the referring position
   instead — the relative `.side_effect` in a `match()` would read
   the referring field's siblings, and an alias naming an `emit` rule
   table (a template, which is exactly a value copied before it
   resolves) would read its recursive `%w` as a self-reference. The
   copy shares what the source is still settling, and owns the rest.
   The default shallow clone also remains for residuation, which
   stays at one position and wants the sharing.
2. **A match does not fire on an unfilled hole.** A `match` whose
   scrutinee is still `_` residuates rather than taking the fill
   path, in both ports, and the run reports `incomplete` with
   `[aontu/conjunct]` rather than a verdict it did not earn. A hole
   inside a GENERATOR template is untouched: the generator fills it
   at each destination, so the scrutinee is a value by the time the
   match runs.
3. **A finding raised on an anchored meet stands at the anchor's own
   path.** `vet --at '$.E'` reports `$.E`, not the lifted root `$` —
   the address a reader, `get` and a repair agent can use. TypeScript
   already did this by driving the meet at the anchor's path; the Go
   meet now carries it too.

### Consequences

- Each element of a list spread carries its own path, so a finding
  names the element it is about. `use-cases/03-api-contract` drops
  its gap-8 workaround and pins `$.items.1.email`. Shared row:
  `vet-list-spread-ref-owns-its-args`.
- **No canon row changes.** The `move()`/`copy()` "ghost" rows
  (`func.tsv` ghost-\*-innard, move-chain, move-shallower-dest,
  `spread.tsv` spread-hidden-key-resolves) all copy a target holding
  a pending `key()` — a staged call — so they take the exception and
  keep the sharing they pin. The change reaches only what a copy is
  free to own, which is what the corpus divergence was about.
- `vet` no longer answers `valid` for a `match(_)` anchor. The form
  stays a documented gap — a discriminated union is still written as
  a union — but the gap now reports itself. Shared row:
  `vet-match-hole-scrutinee-does-not-settle`.
- Instantiation costs a deep clone per reference resolution of a
  call-bearing target. Scoped the same way ADR-005's cost is: a
  target with no path-dependent structure is unaffected, and the full
  suite and corpus timings are unchanged.
- Enforced by the shared spec (ADR-001 discipline) and by both ports
  changing together. The ledger entries are
  [use-cases/BUGS.md](use-cases/BUGS.md) §90 and §91, with repros
  under `use-cases/repros/`.


## ADR-026 — `each` is retired: `form` carries the bound

**Date:** 2026-09-08
**Status:** Relocated to [#189](https://github.com/aontu-lang/aontu/issues/189)

Not an entry for this register, by the test at the head of this file: it
decides which of two builtins survives, and its own reasoning is an
application of an existing rule rather than a new one —
"[ADR-008](#adr-008--constraints-are-named-not-spelled-with-operators)'s,
generalised past constraints: **one spelling per concept**".

**The decision stands and shipped**, and it is half of one decision:
[ADR-027](#adr-027--the-list-generator-is-named-each-and-_--t-is-its-bound)
put the name `each` back on the survivor. Both records are
[#189](https://github.com/aontu-lang/aontu/issues/189).

## ADR-027 — The list generator is named `each`, and `_ & t` is its bound

**Date:** 2026-09-09
**Status:** Relocated to [#189](https://github.com/aontu-lang/aontu/issues/189)

Not an entry for this register, by the test at the head of this file: it
names one function, its argument is a preference stated after the fact,
and its central consequence was a release-ordering instruction, which
expires. It is the second half of
[ADR-026](#adr-026--each-is-retired-form-carries-the-bound)'s decision.

**The decision stands and shipped.** The list generator is
`each(d, t)`; `each(d, _ & t)` is the bound, `each(d, _)` the members as
a list, and `form` is gone. The sequencing instruction it carried was
overtaken — both halves ship in one release, with the upgrade warning
the CHANGELOG carries in its place. Both records are
[#189](https://github.com/aontu-lang/aontu/issues/189).

## ADR-028 — Every language-supplied schema is named under `aontu:`

**Date:** 2026-09-09
**Status:** Accepted

### Context

The engine bundled seven schemas and served them under **two** naming
schemes. Five carried the `aontu:` prefix
([MODELS.0.md](design/MODELS.0.md) D1, RENDER.0.md P0) — `aontu:code`,
`aontu:profile` and the three language profiles. Two did not:
`std/system` (G4 phase 4) and `std/view`, spelled as bare paths, each
also answering to a `.aon` suffix.

The prefix is not decoration. It is Node's `node:fs` device: a spelling
no relative path, package name or module path can produce. That is what
makes an `aontu:` name **unshadowable** — the memory, module, file and
package legs are never asked, so no file on disk can stand in front of
one, and an unknown name is refused naming the set rather than searched
for.

The `std/` names had none of that. `std/system` is a perfectly ordinary
relative path, and the engine needed a **second resolution leg**, below
the scheme leg, that matched bare names against the same table before
the memory leg was asked. Two spellings for one idea, and a
shadowing-avoidance argument that had to be made twice, differently.

Three further asymmetries came with it:

- `std/system.aon` resolved, while `aontu:code.aon` is refused — the
  scheme is not a directory, but the bare names behaved like one.
- The `aontu:` models are held to the formatter (MODELS.0.md D4) and
  the `std/` vocabularies were not, because that test iterates the
  models by prefix. Neither was fmt-clean.
- Every other model's name matches the root key it defines —
  `aontu:code` gives `code:`, `aontu:profile` gives `profile:`,
  `std/view` gives `view:`. `std/system` gave `std:`.

### Decision

**Every language-supplied schema is named under `aontu:`, and `std` is
retired.**

    std/system, std/system.aon  ->  aontu:system
    std/view,   std/view.aon    ->  aontu:view

`std` goes as a *name* and as a *root key*: `aontu:system` defines
`system:`, so `$.std.Port` is now `$.system.Port`. Retiring the prefix
while leaving the key would keep the word in every document that used
the vocabulary, which is not retiring it.

The `.aon` spellings go with it. The scheme is not a directory, and
that was already true of the other five.

### Consequences

- **This is a breaking change, and it is loud.** `@"std/system"` is
  refused with `multisource_not_found`, and `$.std.Port` no longer
  resolves. There is no spelling under which an old document quietly
  keeps working.
- **The engine loses a resolution leg.** With every bundled name
  carrying the prefix, the bare-name leg in `ts/src/lang.ts` and
  `go/source.go` is unreachable and is deleted. One leg now answers for
  every language-supplied schema, and ADR-002 would have caught the dead
  code if it had been left.
- **Both vocabularies are now held to the formatter**, having joined
  the set that test iterates, and are reformatted to the agreed form.
  Their canon and canon-hash pins move with the root key; both were
  re-probed against both engines.
- `test/spec/std-system.tsv` and `std-view.tsv` become
  `aontu-system.tsv` and `aontu-view.tsv`. The `.aon` rows become
  refusal rows, which is what `aontu-scheme.tsv` already pins for
  `aontu:code.aon`.
- The dependency-kind label `std`, recorded for a bundled source, is
  left alone: it names a source's PROVENANCE (engine-bundled), not a
  name, and it is not user-visible.
- **The landing key was moved again before either shipped.** This
  decision left `aontu:system` defining `system:`, which
  [ADR-029](#adr-029--a-bundled-model-lands-under-aontu-not-at-the-document-root)
  found to be a collision with a name a document wants for itself.
  `$.std.Port` is `$.aontu.System.Port`, not `$.system.Port`. The rest
  of this decision stands.


## ADR-029 — A bundled model lands under `$.aontu`, not at the document root

**Date:** 2026-09-09
**Status:** Accepted

### Context

[ADR-028](#adr-028--every-language-supplied-schema-is-named-under-aontu)
put every language-supplied schema under the `aontu:` scheme. What it
did not change is where an included model's content *lands*: each took
a root key of its own, named for itself — `aontu:system` defined
`system:`, `aontu:code` defined `code:`, `aontu:profile` defined
`profile:`.

Those are ordinary, desirable key names. A document about services
wants `$.system`; a document about generated output wants `$.code`; a
document about a rendering profile wants `$.profile`. Including a
vocabulary took the name away, and the collision was silent: the
document's own `system:` and the vocabulary's would simply unify, and
the failure would surface somewhere else entirely.

The scheme already solved the same problem one level up. `aontu:` is a
prefix a user's file cannot spell, which is what makes a bundled name
safe. The landing site needed the same treatment.

### Decision

**Everything an `aontu:` model defines lands under the single root key
`aontu`.**

    @"aontu:system"   ->  $.aontu.System.Port, .Component, .Service, .Semver
    @"aontu:view"     ->  $.aontu.View.Figure
    @"aontu:code"     ->  $.aontu.Code.units
    @"aontu:profile"  ->  $.aontu.Profile

One key is reserved instead of seven, it is named for the language
rather than for a domain a user might want, and a reader seeing
`$.aontu` anywhere knows immediately that it is not the document's own.

### Consequences

- **This is a breaking change, and it is loud.** `$.system.Port` and
  `$.code.units` no longer resolve; a document that wrote them fails at
  the reference.
- **The renderer reads `$.aontu.Code`**, and `renderProfile` reads
  `$.aontu.Profile`. That is a change to the verb's input contract, and
  every transform moves with it.
- **Coverage got a better rule, not just a moved one.** The dead-path
  walk excluded exactly the `code` node before, so a document that
  included a *vocabulary* had its `$.system` or `$.profile` reported as
  dead model. The exclusion is now the whole `aontu` namespace, which
  is the honest rule: nothing under it is the user's model. The
  previous behaviour was a latent wart that only this change made
  systematic enough to see.
- Row names, expectations and every worked example move with it. The
  `render` reports carry `$.aontu.Code.units.N` paths.


## ADR-030 — The path of a meet is the slot it was driven at

**Date:** 2026-09-09
**Status:** Accepted

### Context

A conflict's `path` is the one line of an error both ports hold to byte
parity, and it is what a repair loop edits. It was wrong, and wrong
DIFFERENTLY in each port, whenever the schema arrived through an
include:

    @"aontu:system"
    p: $.aontu.System.Port & { direction: 1 }

    TypeScript:  $.p.system.Port.direction
    Go:          $.p.direction.Port.direction
    Correct:     $.p.direction

The same meet written inline, or through a reference to a schema in the
same document, already agreed on `$.p.direction` in both ports — so this
was not a general path bug but one specific to a value that arrives by
REFERENCE, whose children are re-pathed onto the referring field rather
than rebased under it (use-cases/BUGS.md §41).

Both ports already carried the same rule, and the same comment: *the
path is where the meet is, not where the operand was written.* Both
applied it only when the operand's path was a strict PREFIX of the
descended path, on the reasoning that a nil minted away from the descent
should keep its operand's path. That guard cannot see this case. The
corrupt path is not shorter than the right answer — in Go it EXTENDS it
— so it reads as a legitimately deeper location.

No spec row caught it because `errc` rows compare the error CODE, and
the codes always agreed. The path, the half that diverged, was pinned
nowhere.

### Decision

**A meet of two operands is attributed to the slot it was driven at.**
When a nil is minted with both a primary and a secondary operand, and
the context knows a slot, the slot is the path.

**A single-operand nil is left alone.** A residue, a closed key, a
generation failure and an `--at` finding are not meets; they are facts
about one value, and the operand's own path is the right answer for
them. Taking the context path for those was tried before and reverted,
which is what the prefix guard was protecting — it is kept, as the
fallback for the single-operand case.

In Go one further change was needed: the slot hint is single-use per
`unite`, so the disjunct's trials had consumed it and `ctx.slot` was
EMPTY by the time the empty-disjunction nil was minted. The captured
slot is restored before minting it, which is the state the canonical
port is already in at that point.

### Consequences

- **The two ports agree**, and `test/spec/error.tsv` now pins the path
  in `err` mode for the include, inline, local-reference and spread
  cases. The inline and local-reference rows were already correct and
  are pinned so the fix cannot be undone by regressing them.
- **A conflict inside a SPREAD template now names the instance.**
  `services:&:{port:integer}` against `services:{auth:{port:"80"}}`
  reported `$.services.port`, the template's position, which is not a
  path in the document at all. It now reports `$.services.auth.port`,
  the field to edit. Both ports were re-probed and agree. This was a
  KNOWN limitation, recorded in the vet tests as "naming the instance
  path is a phase-3 report concern"; it is delivered here as a
  consequence rather than as its own phase.
- The underlying re-pathing of a by-reference value's children
  (BUGS.md §41) is NOT fixed. It is now invisible for a meet, which is
  where it surfaced; a single-operand nil on such a value can still
  carry the re-based path.


## ADR-031 — A path part that names a type is CamelCase

**Date:** 2026-09-09
**Status:** Relocated to [#190](https://github.com/aontu-lang/aontu/issues/190)

Not an entry for this register, and the entry says so itself: "**It
binds the bundled models and nothing else.** This is a convention, not a
rule the engine enforces … for a matter of taste." A convention that
binds four keys and is enforced by nothing belongs with the models it
describes, not among the decisions everything is built on.

**The convention stands and shipped**: `$.aontu.System.Port`, and
`.View`/`.Code`/`.Profile` with it, while the scheme name stays
lowercase. The full record is
[#190](https://github.com/aontu-lang/aontu/issues/190).

---

## ADR-032 — Code comments are sparse and terse: intent lives in names, requirements live in documents

**Date:** 2026-09-10
**Status:** Accepted

### Context

A comment is the only artifact in this repository that nothing executes
and nothing checks. Every other claim is held up by something: the
shared spec runs in both engines (ADR-001), the coverage floor is
measured (ADR-002), the documented examples are executed by
`ts/test/docs.test.ts`, the progress register's structure is derived
from its own rows by `ts/test/capability-review.test.ts`. A comment is
asserted once, at the moment it is written, and from then on it drifts
as the code beneath it changes. Nothing announces the drift.

Measured on 2026-09-10, before this decision, the first-party source
carried 35,762 comment lines against 88,227 lines of code — two lines
of unchecked prose for every five lines of checked code — and a
mechanical scan of that prose found 50 comments naming symbols the code
no longer defines, 27 naming paths that do not exist, and 1,098 stating
counts that nothing recomputes. Those are the failures that can be
found by machine. The ones that cannot be found by machine are the
reason for this entry: a comment that describes what the code *used to*
do, or what a rule *is supposed to* be, reads exactly like one that is
still true.

Three kinds of comment fail in three distinct ways, and all three were
present at scale:

- **The requirement in the code.** A comment stating a business rule or
  a requirement duplicates a document. When the rule changes, the
  document is edited and the ticket is closed; the comment is not, and
  the codebase now carries two answers with no way to tell which is
  current.
- **The restatement.** A comment that says what the next line says adds
  a second thing to keep in sync and pays nothing for it. It is the
  cheapest comment to write and the first to go wrong under a rename.
- **The biography.** What broke, what was tried, what a review said,
  what the author expected — a commit message stranded in the working
  tree. It is unfalsifiable by construction: nothing in the tree can
  contradict a claim about the past.

Against that sits the one case that genuinely pays: code that is
intricate, or whose correct form is *surprising* — where a reader's
first instinct is to simplify it and thereby break it. There, two lines
of prose are cheaper than the defect they prevent.

### Decision

**Code comments are sparse and terse. They exist only for code that is
intricate or surprising. Semantic intent is carried by identifier
names; business logic and requirements are carried by documents.**

1. **A comment must say something the code cannot.** Why an unobvious
   form is required, what invariant a maintainer would otherwise break,
   what outside this file forces this shape. If a competent reader
   reaches the same understanding from the code itself, the comment is
   noise and is deleted.

2. **Intent goes in the name.** Renaming a value, extracting a function,
   or introducing a named constant is always preferred to a comment
   explaining the unnamed version. A comment that could be a name is a
   defect in the name.

3. **Business logic and requirements go in documents** — `docs/`, this
   register, the design notes — never in code comments. Code implements
   a rule; the rule's statement and its reasoning live where they can be
   read whole, reviewed as prose, and cited.

4. **Terse means terse.** A comment that runs to paragraphs is a
   document in the wrong file. Move what is durable into a document and
   delete the rest.

5. **What a comment says must be checkable at the point of reading.**
   Paths, symbols and decision numbers it names must resolve. Issue
   numbers, dates, version numbers and counts must not appear: each was
   true once, and a reader has no way to test it now.

6. **History belongs to git.** The narrative of how the code came to be
   is recorded in commit messages, in issues, and — when it is
   fundamental — in this register. The working tree carries the code,
   not its biography.

7. **A coverage exclusion's justification (ADR-002, rule 3) is a
   comment like any other.** It is still required, and it is still held
   to this entry: state the unreachable state in a line or two, not in
   an essay.

### Consequences

- **Deletion is the default.** When a comment fails any rule above, the
  first move is to remove it, not to rewrite it. Prose worth keeping is
  moved to a document in the same commit; prose not worth a document is
  not worth a comment either.
- **Some rationale leaves the tree and lands nowhere.** That is accepted
  deliberately: it remains in git history, which is where a question
  about the past is answered. `git log -L` and `git blame` are the
  supported way to read it.
- **The gate is not only about form.** Its accuracy rules — resolvable
  paths, resolvable symbols, resolvable decision numbers, no
  unverifiable claims — mean a comment that has gone stale fails the
  build in the same way a broken test does. This is the point of the
  entry: comments become checkable, or they do not survive.
- **A dense file fails even when every comment in it is defensible.**
  The budget is a property of the file, and a file that needs a great
  deal of explanation is reporting a defect in its structure or its
  names, which is the finding.
- **Reviewers and agents stop asking for explanation in code.** "Add a
  comment explaining this" is, under this entry, a request to rename
  something or to write a document.

### Enforcement

`ts/scripts/comment-gate.cjs` is the checker; `make comments` runs it,
`ts/test/comments.test.ts` fails the suite on any finding — so the gate
runs in CI on every push and pull request, inside the TypeScript job —
and `.githooks/pre-push` (installed by `make hooks`) refuses the push
locally before CI is spent on it. One implementation, three callers, so
the local gate and the CI gate cannot disagree.

Scope is source in the implementation languages: every `.ts`, `.go` and
`.rs` file in the repository — `ts/src`, `ts/test`, `go` and the editor
extension today, and a Rust tree from the day one appears. Build and
release tooling written in `.cjs`, `.mjs` or `.js` is not source in this
sense and is out. Generated sources (`ts/src/sigdecl.ts`,
`ts/src/helpdoc.ts`) and the committed build output (`ts/dist`,
`ts/dist-test`) are out — their comments belong to their generators — as
are the worked-example corpora (`use-cases/`, `test/system/`), whose
`.ts` and `.go` files are fixtures compared byte for byte against what a
generator writes. License headers and tool directives (`//go:build`,
`//go:embed`, `/* node:coverage ignore */`, `@ts-`, `eslint`) are not
prose and are exempt.

| rule | fails when |
|------|-----------|
| `long-block` | a comment block runs longer than 5 lines |
| `dense-file` | comment lines exceed 12 % of a file's code lines |
| `narrative` | first person, history, or a reference to a review, issue or commit |
| `requirements` | requirement or business-rule vocabulary |
| `commented-code` | code that has been commented out rather than deleted |
| `count-claim` | a count nothing recomputes ("three passes", "48 builtins") |
| `dated-claim`, `issue-ref`, `version-claim` | a claim a reader cannot check from the tree |
| `stale-path` | a path that does not resolve |
| `stale-symbol` | a backticked symbol the code does not define |
| `stale-adr` | a decision number this register does not carry |

### Amendment, 2026-09-10: the gate reads `.ts`, `.go` and `.rs`

As first written the gate also read the repository's own tooling —
`ts/scripts`, `web/build`, the editor plugin's build script — in `.cjs`,
`.mjs` and `.js`. It no longer does. The rule is enforced on source in
the implementation languages, wherever that source lives, which is how a
Rust tree comes under it on the day it appears rather than by an edit
here.

The tooling files keep the prune they were given under the first scope.
Nothing re-adds their prose, and nothing now checks it.


## ADR-033 — A grammar is a string, and parsing is a function

**Date:** 2026-09-09
**Status:** Accepted *(Amended 2026-09-10: the one-argument constraint
form, and `Semver` rebuilt on it. Amended 2026-09-12: a grammar may now
choose its own output shape, so `parse(g, v)` answers a map OR a list.)*

### Context

`re()` is the only way a document can say what a string may look like,
and it is deliberately small: the portable regex subset both host
engines agree on, with a guard that refuses a quantified group holding
a quantifier (`constraint_pattern`) because that backtracks
exponentially in one port. Real formats are published as grammars, not
as regexes — semver, RFC 3986 URIs, media types — and transcribing one
into the `re()` subset is at best lossy and at worst impossible: the
semver pre-release grammar cannot be written at all.

`@tabnas/abnf` compiles RFC 5234 ABNF to a `@tabnas/parser` grammar,
and both are already dependencies of both ports, so the capability is a
call away rather than a new engine.

### Decision

**`abnf(src) : string`** compiles a grammar and answers the grammar
SOURCE. A parser is an ordinary string value: it canons, it hashes and
it unifies with no new kind in the lattice. The compile is what the
call is for — a grammar that does not compile is refused at the
DECLARATION, once, with the compiler's own first line as the reason,
rather than at every site that parses with it.

**`parse(g, v) : map`** applies a grammar to a string and answers the
tabnas AST — `{rule, src, kids}` all the way down — as ordinary maps
and lists. `kids` is always present and always a list, so a vocabulary
written against the AST need not ask whether a leaf has the key.

**`parse(g) : constraint`** — the one-argument form — is the same
grammar as a CONSTRAINT on whatever meets it, which is what a schema
position wants: there is no value there yet to hand the call. It is
VALUE-PRESERVING, like every other atom in the algebra: it admits a
string the grammar accepts and answers that string unchanged, so it
stays idempotent and order-independent under a meet and a default can
sit beside it (`*"" | parse(G)`). Once its grammar argument settles the
constraint is a STABLE value, exactly as a residual constraint atom is,
so a `type()` holding one resolves rather than waiting for a value that
may never come.

**A failure to parse is a failure to unify.** The call answers a
located nil (`parse_failed`), so a field is refused rather than set to
a value meaning "no". Both forms refuse the same way.

**The parse is bounded.** The host engine's cancellation hook is called
every 100 rule iterations and refuses past 100 000 steps. This is a
constant, not a trust knob: the budgets a profile may lower or raise
bound aontu's own evaluation, and this bounds a third party's grammar.
Without it `abnf()` would reopen exactly the hole `constraint_pattern`
exists to close, and the compiler's own notes warn that pathological
grammars grow under Paull's algorithm.

**The empty string is not a parse.** Both host engines answer an empty
tree for empty input rather than refusing it, which would make
`parse(g, "")` succeed under every grammar. A validator whose whole job
is to refuse malformed input cannot have that, so the pair refuses it
itself.

### Consequences

- **Whitespace is not skipped.** The grammars aontu runs describe
  strings with no spaces in them, and the host lexer would otherwise
  read `1 . 2 . 3` as `1.2.3` — accepting input the grammar's author
  did not. The engine is constructed with space lexing off.
- **The TypeScript port's `@tabnas/parser` moves to 0.9.0**, which the
  Go port already pinned. The cancellation hook is 0.9.0's; the two
  ports were on different versions of the engine's own parser before
  this, and are not now. All three grammar packages are pinned
  EXACTLY and identically across the ports — `parser` 0.9.0, `abnf`
  0.4.7, `bnf` 0.1.10 — rather than by range: `bnf` 0.1.11 peer-asks
  for `parser` 0.9.1, and 0.9.1 regresses `path($.z.x.a)` in
  TypeScript alone (it captures `.x.a`), which ADR-001 makes fatal.
  A range would have let a fresh install cross that line silently.
- **The answer is what the GRAMMAR says it is** (amended 2026-09-12).
  An unannotated production still answers the raw AST, verbose and with
  `src` the concatenation of matched tokens rather than a slice of the
  input. A production carrying a **value annotation** — a trailing RFC
  5234 comment, `; @object <names…>` or `; @array` — answers the map or
  list it names instead, built by the engine's own native-value builders
  (`@object$`, `@array$`, `@key$`, `@setval$`, `@push$`). The original
  consequence here said a document could not choose the output shape
  until a builtin could be named as DATA. That is what
  [GRAMMAR-SHAPE.0.md](docs/design/GRAMMAR-SHAPE.0.md) asked upstream
  for and what `@tabnas/abnf` 0.4.11 delivered: the compiled grammar
  names the builders and carries no closures, so a document chooses its
  shape by writing a comment.
- **The annotation is about the OUTPUT, never the language.** A comment
  is the one place in RFC 5234 that carries no meaning of its own, so
  deleting every annotation leaves the same inputs parsing and gives the
  tree back. That is a compatibility commitment: the `shape-*` rows are
  unannotated and unchanged.
- **Shaping an unannotated tree is still the LANGUAGE's job.** `pick`
  projects one field of every child, `filter` selects children by rule,
  `join` folds a one-element selection back to a scalar; the `shape-*`
  rows pin it. Two limits went with it and only one is gone: a
  production's leading element folds into the parent, so an unannotated
  field loses its name unless the production starts with a terminal —
  an annotation names the member and keeps it, and where the fold would
  erase an annotated value the compile REFUSES rather than mis-building.
  Every leaf is still the TEXT the rule matched, so `"30"` never
  becomes `30`: the annotation chooses the container and there is no
  scalar form. That is the remaining upstream ask.
- **A parser is a constraint, and it is not a TRANSFORMING one.**
  `parse(g)` preserves its peer, as every other atom in the algebra
  does, which is what keeps it idempotent and order-independent under
  a meet with no extra machinery. A constraint that also REWROTE its
  value to the tree would need the result to carry the grammar that
  produced it for a second meet to mean anything, and nothing needs
  that while the tree is what the two-argument form is for. That step
  is a later decision, not this one.
- **`Semver` uses the pair, and stays a list.** The tuple is now
  `[major minor patch pre-release build]`, five elements, with the two
  string parts checked by an ABNF grammar applied through `parse(g)`. This is the decision's own validation: the pre-release
  shape is precisely what `re()` cannot express (a quantified group
  holding a quantifier, refused as `constraint_pattern`), so the
  vocabulary previously checked its ALPHABET and let `"alpha..1"` and
  `"01"` through. Both are now refused, and the build part is carried
  rather than dropped.
  - The grammars are MEMBERS of the vocabulary, `semverPreRelease` and
    `semverBuild`, `hide()`n so a schema's grammar does not generate
    into the document it checks. The rule that made `Service` write
    itself out is narrower than it was stated: a reference between
    members survives an include when the target carries no `type()`
    mark, and a grammar is an ordinary string. They are lower-case
    where every other member is CamelCase, because the case of a
    bundled key says whether it names a TYPE.
  - The numeric parts stay INTEGERS in a list, not a parsed dotted
    string, for the reason ADR-028 chose a list: a version is COMPARED,
    component by component from the left, which a string does not do by
    itself. Build metadata comes LAST because the spec says it MUST be
    ignored when determining precedence, and last is the one position
    where a comparison can stop before it without leaving a hole.
  - The two grammars differ where the spec does: a wholly numeric
    pre-release identifier may not carry a leading zero, a build
    identifier may.
  - This needed no version bump. The bare-`"0"` disagreement that held
    this back is avoided outright by the `digit = "0" / positive-digit`
    factoring below, which never puts a class and a literal in the same
    slot, so both grammars parse identically on the pinned 0.9.0/0.4.7
    pair.

- **A class must not contain a literal used elsewhere.** Write
  `digit = "0" / positive-digit`, not `digit = %x30-39`, whenever `"0"`
  also appears as a literal. Where a character class overlaps a fixed
  literal, the class wins the cut, and the literal's alternative
  becomes unreachable. It is the shape `@tabnas/semver`'s own grammar
  uses throughout, and the reason its pre-release factoring works.
  A related limit survives in both ports EQUALLY, so it is a grammar
  fact and not a parity break: an alternative shaped `LITERAL [ group ]`
  can fail on re-entry to its rule when the optional's contents put the
  overlapping class in the same lookahead slot.

---

## ADR-034 — Absence is a value, and `maybe` is where it is made

**Date:** 2026-09-11
**Status:** Accepted

### Context

A path that names nothing is `no_path`, class `reference`, and that is
right: a misspelled path should be loud, and the code carries a "did
you mean" contract that names what is actually there.

It leaves a document that reads OPTIONAL input with nothing to say.
The miss refuses the whole enclosing call, so `each($.tags, t)` cannot
be written against a record that may carry no tags, and there is no
falsy value to test for either: aontu has no undefined, and `top` is
not it, because `top` is not generable and a required key holding one
is `mapval_no_gen`.

The language already has a notion of "contributes nothing without
complaint" -- the optional key whose value generates nothing, which
`BagVal.gen` drops and `bagMembers` skips. What it has never had is a
VALUE that says it.

### Decision

**`maybe(v) : any`** answers `v` when it resolves, and ABSENCE when the
only thing wrong is that `v` is not there.

**Absence is a value class**, `AbsentVal`, and it is `top` with one
difference: it is generable, and it generates nothing. A bag therefore
drops it at a REQUIRED key as readily as at an optional one, and a list
drops it without leaving a hole. That single difference is the whole
mechanism; generation is not changed.

**Only a missing referent is forgiven.** The argument is driven with
the error list swapped for a throwaway one, and the result is forgiven
only if it is a nil of class `reference`. A conflict inside the
argument is the document's own bug and is reported where it happened.

**Absence propagates through a call**, in every argument position and
for every built-in: a call on an absent argument is not a failed call,
it is no call. The rule lives in the shared function machinery, ahead
of the signature gate (which has no word for an argument that is not
there) and ahead of a builtin's own deferral (absence is settled, so
waiting on it would wait forever). `maybe` itself is the one exemption,
being where absence is made.

**Absence is the unit of the meet, on either side.** `&` dispatches on
its left operand, so the identity is answered in `unite` rather than in
`AbsentVal.Unify` alone, or `1 & maybe($.gone)` would refuse where
`maybe($.gone) & 1` does not.

**`maybe` is STAGED.** It fires only once the model has settled, the
staging `pack`, `each`, `pick` and the aggregates already use. A
reference that has not resolved YET is not a reference to nothing, and
without the wait the answer would depend on which consumer looked
first.

### Consequences

- **A constructor, not a lattice citizen.** Answering absence for a
  path that a later meet could supply is not monotone, which is why the
  staging above is load-bearing rather than an optimisation. The
  language already draws this line: `each` constructs and does not
  meet, and ADR-026 recorded why that is a different kind of thing from
  a bound.
- **It blunts the best error the engine has.** `maybe($.aontu.System.Compnent)`
  is a typo that now renders as nothing at all. Scoping the forgiveness
  to class `reference` keeps conflicts loud, and nothing can tell a
  deliberate absence from a misspelling, because nothing can.
- **It does not reach out of a containing map.** Absence travels
  through a call and out of a list element; a map with other keys is
  still a map with one key fewer. A generated unit written as
  `{k:"frag", of: emit(maybe($.tags), t)}` therefore keeps a
  `{k:"frag"}` behind. The element is what must be optional, not one of
  its fields. Making `&` absorbing would reach further and is refused:
  it would make the meet non-monotone in the useful direction, and the
  guard would read backwards, answering the value when it is present.
- **A template position is not an argument position.** A `maybe` inside
  `pack`'s or `each`'s template is cloned per destination and forgives
  there, which is what a template is for. A `maybe` AS the template is
  not driven at the call and does not propagate.

### Alternatives rejected

**Make `no_path` answer top.** Silences every typo in the language, not
just the ones an author opted into, and top at a required key still
refuses at generation, so it would not even close the gap.

**A `default(v, d)` instead.** Needs a value to stand in with, and the
optional-section case has none: the right answer is that the key is not
there, not that it holds an empty list.

**Teach each bag reader about absence.** Twenty sites in two ports with
a spec row each, and every builtin added later would have to remember.
One site in the shared machinery covers them all.

---

## ADR-035 — A language is configured in its profile, and a marker may name its closer

**Date:** 2026-09-11
**Status:** Accepted

### Context

A generator written in the target's own syntax carries a MARKER, and
the marker was decided by a table keyed on the file's extension, with
`--marker` as the escape hatch for a language the table had never seen.
Two things were wrong with that.

The escape hatch did not reach a block comment. `isBlock` tested for
`/*` and the closer was the constant `*/`, so `--marker '<!--'` was
accepted, recognised the opener, and left the `-->` sitting in the
aontu source. Every language whose only comment is a block form was
unreachable, markdown among them.

And the marker was the one thing about a language that had nowhere to
live. `aontu:profile` already holds what `aontu render` applies to a
unit of one language, a `--profile` file already declares a language as
data, and `aontu render`, `aontu template` and `aontu fmt` all decide a
marker -- but a marker could only be repeated as a flag.

### Decision

**A marker may carry its own closer after a space.** A comment opener
holds no space, so the space is free to separate the two: `--marker
'(*- *)'` is the OCaml block form. The closer is IMPLIED for `/*` and
`<!--`, the two openers the bundled table uses, and named otherwise. An
empty closer is the line form, which is every other marker in the
table.

**Markdown is a known language.** `md` and `markdown` mark with
`<!--- … -->`, the HTML comment plus the dash every marker in the table
carries, and `aontu:lang/markdown` joins the bundled profiles: the text
profile's shape, plus the comment form and the template marker that are
markdown's own.

**The profile is where a language is configured.** `%profile` gains a
`template` block naming the `marker`, an optional `close`, and the
`ext` list the marker belongs to, and `aontu template` and `aontu fmt`
gain the `--profile` that `aontu render` already had. One file declares
a language once -- its name, its extensions, its marker, its
indentation -- and all three verbs read it. `--marker` still wins where
it is given, being the per-call override.

### Consequences

- **Three verbs, one file.** A project that generates OCaml writes
  `ocaml.aon` once and passes `--profile ocaml.aon` to whichever verb
  it is running, instead of repeating a marker flag whose spelling has
  to match across a Makefile, a CI job and an editor command.
- **The profile-file loader is shared.** `render` had it; `template`
  and `fmt` now call the same function, so the duplicate-lang refusal
  and the vet against `aontu:profile` are one implementation.
- **The bundled model set grew**, which moves the hash of the profile
  vocabulary and of every bundled profile: `template?` is a new
  optional key in `%profile`, and a canon hash covers the whole
  document. The four hashes in `aontu-profile.tsv` are re-pinned from
  both engines in the same change.
- **`render` loads its profiles before it desugars.** It read the
  marker first and the profiles after, which would have made the entry
  file the one place a declared marker could not reach.

### Alternatives rejected

**Extend `--marker` and stop there.** A pair form on the flag reaches
every language, and leaves the marker a thing repeated at every call
site rather than declared once. The profile already existed and already
meant "this language, as data".

**A project configuration file.** aontu has no such concept, and adding
one to carry a single field would be a second place for a language to
be described.

**Guess the closer from the opener's brackets.** `(*` to `*)` inverts;
`<!--` to `-->` does not, and `{-` to `-}` is a third rule. A table of
two, plus an explicit closer, says what is known and asks for the rest.


---

## ADR-036 — A bundled model is a file in `aontu/`, not a string in each port

**Date:** 2026-09-11
**Status:** Accepted

### Context

The eight models the `aontu:` scheme serves — `aontu:system`,
`aontu:view`, `aontu:code`, `aontu:profile` and the four language
profiles — were written twice: once as `String.raw` constants in
`ts/src/std.ts` and once as raw-string constants in `go/std.go`. The
two copies had to be the same bytes, and nothing but a reviewer's eye
held them there. Every edit to a vocabulary was two edits in two
languages, in a form neither the formatter, the linter nor an editor
could see as aontu source: the models were held to `aontu fmt` by a
test in each port, which had to read them back out of the constant to
do it.

That is ADR-001's problem — parity between the ports — solved for
behaviour by the shared spec in `test/spec/*.tsv`, and left unsolved
for the one thing the ports literally share: source text.

The name `std` was already retired ([ADR-028](#adr-028--every-language-supplied-schema-is-named-under-aontu))
as a model name and as a root key, and survived only in the file names
and the identifiers.

### Decision

**The source of a bundled model is a file.** `aontu/` at the repository
root holds one SUBFOLDER PER MODULE, and a module is a directory
holding a file named after it: `aontu/lang/go/go.aon` is
`aontu:lang/go`. The path after the scheme IS the path in the tree, so
a name and its file are the same spelling, and a module is free to grow
a sibling — a README, a fixture — without a second module appearing
beside it.

**Both ports inline it at build time.** `make aontu` runs
`ts/scripts/aontu.cjs`, which writes `ts/src/aontumodel.ts` and, for
Go, mirrors the tree into `go/aontumodel/` and writes the `//go:embed`
table `go/aontumodel.go`. The Go half must be a committed copy —
`//go:embed` cannot read above its own package directory — which is
the arrangement `make helpdoc` and `make sig` already use.

**A copy nothing compares is a second source of truth.** Each port
asserts both halves of the drift: that every inlined model is identical
with its file, and that the tree serves exactly the models the table
lists, so a model ADDED and not regenerated fails too.

**`std` is gone as a name.** `ts/src/std.ts` and `go/std.go` are
deleted; `STD_SOURCES` is `AONTU_SOURCES` and `stdSources` is
`aontuSources`. The include manifest records a bundled model under the
capability `aontu` where it recorded `std`.

### Consequences

- **A vocabulary is edited once, as aontu.** The file is what `aontu
  fmt`, `--lint`, an editor's syntax highlighting and the LSP already
  understand, and the fmt-clean tests in both ports now read the same
  bytes the author edited.
- **Parity is structural, not clerical.** The ports cannot disagree
  about a model's text, because neither holds it — they hold a
  generated copy of one file, and a test in each fails when the copy is
  stale.
- **The manifest's capability name changed**, from `std` to `aontu`. It
  is the label on a dependency record, not an input: a trust profile
  has never been able to name it, and the `aontu:` leg resolves under
  every include capability but `none`.
- **A new model is a new folder**, and `make aontu` is the only other
  step. Nothing in either port is edited by hand.
- **A third port would inherit the tree**, rather than transcribing the
  models a third time.

### Alternatives rejected

**Keep the constants and add a parity test.** A test that two hand-kept
copies match tells an author they have diverged AFTER they have written
the edit twice. The cost was the second writing, not the detection.

**Generate one port from the other.** It makes the TypeScript copy the
source and the Go copy derived, which is true of the implementations
(the canonical port) but false of the models: neither port authors
them.

**`//go:embed` the top-level tree directly.** It cannot: the directive
reads only from its own package directory downward. The committed
mirror is the price, and a test is what keeps it honest.

**One file per model at the tree root** (`aontu/system.aon`), no
subfolders. `aontu:lang/go` would then be `aontu/lang-go.aon`, spelling
a path with a hyphen, and a model would have nowhere to keep anything
beside its source.


---

## ADR-037 — Two lists concatenate under `+`, and a sum of an absence is absent

**Date:** 2026-09-11
**Status:** Accepted

### Context

A generated section has two halves: the literal scaffolding that heads
it, and the rows a call produces. `aontu:code` takes them as separate
fragments, because a fragment's `of` is a list and `emit` answers a
list, and there was no way to write one list made of both. So a
document that reads optional input renders the heading of a section
that is not there: `tags:` with nothing under it, an empty table
header. [ADR-034](#adr-034--absence-is-a-value-and-maybe-is-where-it-is-made)
made the ROWS vanish and could not reach their heading, which is a
sibling with its own literal `of`.

`+` already meant concatenation for text and addition for numbers. On
two lists it residuated and failed at generation, which
`edge-plus-lists` pinned as the recorded behaviour rather than as a
decision.

### Decision

**Two lists concatenate.** `["a"] + ["b"]` is `["a","b"]`, and `[]` is
the identity. A list mixed with a scalar still residuates, exactly as a
boolean mixed with a number does: `+` refuses nothing it did not refuse
before.

**A sum of an absence is absent.** Either operand being absence makes
the whole `+` absence, which is what is meant to carry a heading away
with the rows it heads:

```aon
of: ["tags:"] + emit(sort(maybe($.tags)), %tag)
```

This is ADR-034's rule for a call, applied to the operator: a sum of
what is not there is not there. It is ABSORPTION, not the identity that
absence is under `&` -- `&` narrows and `+` computes, and a computation
over nothing has no answer. The operator's half of the scaffolding
problem is all this decides; the absence still has to reach generation,
and under a SCHEMA it does not yet -- see the consequences.

**An op sorts before the kinds in a conjunct.** Its operands may be
staged calls, and only the op knows to wait for them; a kind met first
refuses the unresolved op outright. `cjo` 48000 puts every op above the
kinds and the concrete values and below the constraint algebra.

### Consequences

- **`AbsentVal.Unify` needs its top arm back in Go, and not in
  TypeScript.** It was removed from both as unreachable, on evidence:
  nothing met an absence with top. Go's `+` answering an absence into a
  slot whose peer is top is that path -- it MEETS an op's result where
  the canonical port PLACES it -- and without the arm Go loses the
  absence and renders the key as `top`. TypeScript still never meets
  the pair, so the arm stays out there: `edge-plus-list-absent` is the
  guard, since a port that answered top for it would fail to generate.
  The two ports agree on every observable, and differ on the route.
- **An op at a key inside a map still refuses.** `{of: ["a"] + emit(…)}`
  is refused where the map meets a schema, because `ListVal.unify`
  refuses an op whose operand is a staged call and a map's per-key meet
  does not go through the conjunct order above. That predates this
  change -- `{of: string}` against `{of: "a" + join(…)}` fails the same
  way without it -- so the order fixes the top-level shapes and not
  this one. Filed as [BUGS.md §92](use-cases/BUGS.md) rather than
  rushed into this change. **Closed 2026-09-11**, by the rule this
  decision states rather than by the mechanism it used: an op DRIVES
  the meet while an operand has not decided, wherever it is met, which
  is what a staged CALL already did.
- **The scaffolding case is not finished.** Absence under a
  schema-constrained list is refused, not dropped, in both ports, so
  writing the sum above inside `aontu:code`'s `decls` (or under any
  `[&: ...]`) is `func_arity` / `listval_no_gen` rather than a section
  that vanishes. That is ADR-034's territory, not this decision's --
  the operator rule above holds wherever absence generates at all --
  and it is filed as [BUGS.md §94](use-cases/BUGS.md). Until it is
  closed, the heading and its rows vanish together only where no
  schema constrains the list.
- **A pinned row changed meaning.** `edge-plus-lists` pinned
  `mapval_no_gen` for `[1]+[2]`; it now pins the concatenation. The row
  recorded what `+` did not do, not a decision that it should not.

### Alternatives rejected

**A `cat(...)` builtin.** A second name for what `+` already means on
text, and one more thing to know.

**`emit` gains `head:`/`foot:`**, emitted once around a non-empty
selection. Targeted at this shape and it needs no absence rule, but it
answers only for `emit`: a heading over a `sort` or an `each` would
still have nowhere to live.
