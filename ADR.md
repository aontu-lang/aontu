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
| [ADR-006](#adr-006--template-application-is-stateless-and-a-generator-snapshots-a-settled-source) | Template application is stateless, and a generator snapshots a settled source | Accepted |
| [ADR-007](#adr-007--an-unresolved-disjunction-is-not-a-value-and-vet-asks-the-same-question-the-evaluator-does) | An unresolved disjunction is not a value, and vet asks the same question the evaluator does | Accepted |
| [ADR-008](#adr-008--constraints-are-named-not-spelled-with-operators) | Constraints are named, not spelled with operators | Accepted |
| [ADR-009](#adr-009--there-are-no-reserved-path-elements-key-self-and-parent-are-removed) | There are no reserved path elements: `$KEY`, `$SELF` and `$PARENT` are removed | Accepted |
| [ADR-010](#adr-010--no-magic-keys-or-paths-the-tree-at-all-levels-is-user-space) | No magic keys or paths: the tree at all levels is user space | Accepted |
| [ADR-011](#adr-011--the-star-is-sugar-the-disjunction-is-the-structure) | The star is sugar; the disjunction is the structure | Accepted |
| [ADR-012](#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused) | An include's extension decides what the file is: Aontu source, config data, or refused | Accepted |
| [ADR-013](#adr-013--the-project-operates-one-transparency-log-and-nothing-else) | The project operates one transparency log, and nothing else | Accepted |

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
- File-system conventions (`mod-lock.aon`, `aon_vendor/`) are outside
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

**The extension decides, from a fixed table, and it says which of TWO
things the file is.**

| extension | what it is |
|---|---|
| `.aon`, `.aontu` | **Aontu source** — the language, with types, defaults, references, constraints, its own includes |
| `.json`, `.jsonld`, `.jsonc`, `.json5`, `.jsonic`, `.jsc`, `.toml`, `.yaml`, `.yml`, `.ini` | **configuration data** — parsed by that format's own parser into the JSON value it denotes |
| anything else, and a name with no extension | refused, by name, with `include_extension` |

```
include not readable: notes.txt (extension: .txt)
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
opening one, and the module system (G6, `aon_vendor/`) is unaffected —
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
**Status:** Accepted

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
