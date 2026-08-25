# Changelog

All notable changes to this project are documented here. The TypeScript
package (`ts/`, npm `aontu`) and the Go module (`go/`,
`github.com/rjrodger/aontu/go`) are versioned independently; entries note
which implementation each change affects.

## Unreleased — TypeScript 0.53.0 line

### Fixed — a sixth verdict flip, and two costs on the refusal path

Raised by the automated review on #72 and confirmed by measurement.

- **A quantifier on `\b` or `\B` flipped the verdict.** The rule that
  refuses `^{1}` and `${1}` — nothing to repeat, a syntax error under
  JavaScript's `u` flag and an accepted assertion under RE2 — shipped
  covering the two anchors only, on a comment asserting that the word
  boundaries "quantify identically in both". They do not:
  `re("\\b{1}x")` was `constraint_pattern` in TypeScript and an
  accepted schema in Go. All four assertions now take the same rule,
  refused in the normaliser before either engine compiles
  ([ADR-003](ADR.md)). The shared row that claimed to pin this tested
  a quantified **backspace** — one backslash where the regex needs two
  — so it passed while the real case diverged; it is renamed for what
  it tests, and the boundary rows it was standing in for are added.
- **Rejecting a long repeat bound was quadratic in Go.** The scan
  built the digit run into a string one character at a time, rebuilding
  the whole immutable string per digit, so `x{111…1}` with 200 000
  digits took **8.0 s** and gigabytes of transient copying before the
  overflow was ever detected — on a path that runs over a
  caller-supplied pattern and is counted by no evaluator budget. The
  digits are folded as they are read: the same input now takes 8 ms.
  Every verdict, and the order the two failures are detected in, is
  unchanged.
- **The packaged skill shipped two broken links.** `prepack` copies
  `docs/skill/` to the package root, two levels closer to it, so
  `../../grammar/aontu.gbnf` resolved outside the tarball and
  `../../test/spec/errcodes.tsv` named a tree the tarball does not ship
  at all. Staging now rewrites both and refuses to pack if a rewrite
  stops matching; a test fails in CI if a new escaping link is added.

### Fixed — the report says WHAT, not only whose fault it is

Four defects the 2026-08-21 status report's repair-loop walkthrough
turned up, all of them in the part an agent loop reads. Fixed in both
implementations.

- **`vet`'s `error` verdict now carries its finding.** A schema that
  does not stand up — a contradiction inside it, a document that will
  not parse, a merge marker — used to answer `findings: []` with exit
  4, so a caller was told the truth was unusable and never what or
  where, while `aontu <schema>` rendered the same fault in full. The
  finding now travels with the verdict, every site in the schema. Two
  causes, and the second is the general one: the provenance walk
  stopped AT a nil, so a failure's OPERANDS — which are what a
  finding's sites are — went unstamped and named no file. Both walks
  now descend into them. `aontu set` inherits the finding: an entry
  that will not parse names the parser's code.
- **A parse failure keeps its position.** The machine-readable path
  reported `row: -1, col: -1` for a fault the human renderer draws a
  caret under; the parser knew all along and the rendered message held
  the only copy. Sites now carry the real 1-based row and column.
- **`vet --at` naming nothing reports too**, with the same `no_path`
  finding `get` and `why` give — "did you mean" included — instead of
  exit 4 and an empty list.
- **A mistyped verb is a usage error, not a silent success.** Verb
  dispatch reads the first argument only, and anything matching no
  verb fell through to the bare form as a file name, last one winning
  — so `aontu vet2 schema.aon good.json` printed `good.json` and
  **exited 0**, which in a tool loop reads as a passing validation.
  The bare form has always been documented as `aontu [options]
  [file]`, singular; a second file name is now exit 2, naming the
  likely cause. A file genuinely named like a verb is still reachable
  as `./vet`.

### Added — the loop, and the documentation, are executed

- **An end-to-end repair-loop test**, in both implementations:
  emit → vet → why → set → re-vet through the whole command, with the
  exit code asserted at every step. The shared suite pins each verb in
  isolation, so every verb could be right and the loop still not
  close. Three arms — the loop that closes, the pinned value that
  refuses the repair and leaves both files untouched, and the schema
  that does not stand up.
- **The teaching documents are held to the engine.** Every
  `aontu`/`aon` example in `index.md`, `tutorial.md`, `how-to.md` and
  `reference-language.md` must parse, and every one that states its
  result must generate exactly that. The skill sources were already
  executed this way; the prose documentation was not.

### Fixed — the two release blockers (security, and cross-port parity)

Both were found by driving the delivered surface end to end
(`docs/capability-review/status-2026-08-21.md`) and had to be closed
before this line could be published.

- **A served evaluation no longer executes caller-supplied code.**
  `vet`, `get`, `why` and `diff` took no trust profile at all, so a
  document containing `@"x.js"` was `require()`d in the evaluating
  process — and four of the MCP server's six tools ran that way while
  the module and the API reference both claimed confinement. The
  library entry points now take a `trust` option, and the MCP server
  INJECTS the confined profile into every tool from one place, so a
  tool cannot run unconfined without visibly discarding it. Covered
  per tool from the live tool list, and against the spawned
  `bin/aontu-mcp.js`.
- **The two ports no longer disagree about `vet`'s verdict.** Five
  constructs flipped, in both directions:
  a call whose target is not a name (`f(1)(2)`, `(1)(2)`,
  `upper("x")(2)`) — Go returned the last term and answered `valid`
  where TypeScript refused; `path()` given something that is not a
  path (`path([1,2])`, and every spelling of a `-0` segment) — Go
  handed the argument back; and two regex cases where RE2's own
  compile failure reached the user, contrary to ADR-003 — a repeat
  count above 1000, and a brace that opens no counted quantifier
  (`x{y}`), which JavaScript's `u` flag calls a syntax error and RE2
  reads as a literal. The repeat bound is now Aontu's, checked in the
  normaliser before either engine compiles. Two more of the same
  family, found by sweeping around it: a quantifier applied to `^` or
  `$`, and a `}` that closes no counted quantifier — JavaScript's `u`
  flag calls each a syntax error where RE2 accepts it. Shared rows pin
  all of it, in both runners (counts live in the register). The sweep
  stopped one construct short: `\b` and `\B` are assertions too, and
  the entry above closes them.
- **A refused call keeps its position and its code.** The non-name
  refusal is sited where TypeScript sites it, rather than rendering
  `<no-file>:-1:-1`, and survives a pipe (`0 |> f(1)(2)`) as
  `unknown_function` instead of being reclassified `pipe_target`.

One related divergence is recorded rather than fixed: under an
`@"…"` include the Go port names the entry file on a schema-role
site where TypeScript names the included file (row and column agree)
— OPEN #66 in `test/spec/divergent.tsv`.

### Added — the rest of the capability review (G1 completion, G3–G8)

Everything after `re()` below landed in this line too; this heading
summarises rather than itemises, and the
[progress register](docs/capability-review/progress.md) is the
per-phase record with pins. In both implementations unless noted:

- **Constraint algebra completed** (G1 phases 3–6): `length` and
  `unique`, cross-field arguments with residuation, the `must`
  evaluate-only check, and the `lossy_integer_literal` exactness
  rule.
- **`aontu vet` completed** (G2 phases 3–6): the CLI verb, the Go
  port, SARIF and `--watch`, the in-repo `vet-action/`, and
  multi-error collection.
- **Subsumption and evolution** (G3): the `subsume` and `breaking`
  verbs, `$.aontu_policy.compat`, `deprecate()`, the
  default-validity lint, and `trim --check`.
- **Identity and relations** (G4): `id()`, `refer()`, the derived
  entity/edge graph, the bundled `std/system` vocabulary, and
  `aontu relations`.
- **The trust profile** (G5): include capability, deterministic
  `passes`/`depth` budgets, and the include manifest — the
  capability default flip is still staged for the next major.
- **Distribution, local half** (G6): the hash form and
  `aontu hash`, module identity and resolution,
  `mod tidy`/`mod vendor`/`mod manifest`,
  and the publish boundary; the two network verbs are not built.
- **Machine access** (G7): `aontu get`, `why` with the provenance
  recorder, the overlay `set`, the path-addressed `diff` (API and
  MCP), the MCP server
  (TypeScript), the published grammars, `agentsmd`, the skill, and
  the REPL inspection mode (`--jsonl` still unreachable in the Go
  CLI — the register's G7.7 records it).
- **Generation** (G8): `pack`, `each`, `filter`, `match`, the
  placeholder `_`, and the `|>` pipe.

### Added — `re()`, pattern membership in the constraint algebra

The constraint algebra gains its sixth atom (capability G1 phase 2).
`re(p)` admits a string matching `p`, in both implementations:

```
name: string & re("^[a-z][a-z0-9-]{0,62}$")
```

- **Matching is unanchored**, as it is in both host engines, so
  `re("el")` admits `"hello"`. Anchor with `^` and `$` to constrain the
  whole string.
- **The string kind is implied**, so `string & re("x")` canonicalises to
  `re("x")` — the same rule that already makes `number & min(0)`
  canonicalise to `min(0)`.
- **Patterns accumulate and are never simplified.** `re("x") & re("a")`
  keeps both, sorted by pattern text, and a value must match every one.
  Two patterns are never declared empty at composition time: that would
  be regex containment, which this algebra deliberately does not do, so
  a contradiction between patterns surfaces against data instead.

**Aontu defines the pattern language; the host engines are rewritten to
it** (new **ADR-003**). TypeScript compiles with JavaScript's
backtracking `RegExp` and Go with RE2 — different languages, in
different complexity classes, over different alphabets. Rather than
enumerate the differences and refuse them (which leaked three times:
`\A` is an anchor in RE2 and a literal `A` in JavaScript, `\s` matched
U+00A0 in one engine only, and `.` counted UTF-16 units in one and code
points in the other), `re()` **normalises** the pattern before either
engine compiles it:

    \d  [0-9]              \D  [^0-9]
    \w  [0-9A-Za-z_]       \W  [^0-9A-Za-z_]
    \s  [ \t\n\r\f\v]      \S  [^ \t\n\r\f\v]
    .   [^\n]              \A  ^        \z  $

These are Aontu's definitions, not either host's. Note that **`\s` is
those six ASCII characters only** — it does not match U+00A0, though
JavaScript's does. Matching counts code points in both.

Refusal is reserved for what rewriting cannot reach: constructs one
engine lacks (backreferences, lookaround), spellings that change meaning
wholesale (any `(?…)` but `(?:`), and a quantifier applied to a group
containing a quantifier or an alternation — that last about *cost*, not
meaning, since `(a+)+$` against twenty-nine characters takes 45 seconds
in JavaScript and 0.065s under RE2, and a regex match is counted by no
evaluator budget. Refusals raise the registered `constraint_pattern`
code, and the message restates the whole accepted subset so an author
need not consult the reference.

Canon renders the pattern **as written**, never the rewritten form.

Pinned by the new `test/spec/constraint-re.tsv` (89 shared rows,
promoted from `test/spec/draft/` with every expectation re-probed
through both engines). The builtin registry goes from 17 to 18 names,
in both ports and both LSP completion lists. `test/spec/files/regex-corpus.tsv`
is a differential corpus of 400 generated patterns: both ports run their
own normaliser over it and must reproduce the pinned verdict byte for
byte, so a drift fails in whichever port drifted.

## Go 0.1.4 — 2026-06-22 · TypeScript 0.47.0 (unreleased)

### Breaking — the number tower (TypeScript and Go)

`number` is no longer a leaf of the lattice. It is now the pure
supertype of four **disjoint** numeric leaves — `integer`, the new
`float`, and two new exact leaves, `biginteger` and `bigdecimal`,
reached only through the new `0d` literal prefix:

```
number                the set of all numeric values
├── integer           int64-window exact
├── float             IEEE-754 binary64        (what number used to name)
├── biginteger        unbounded exact integer  (0d123)
└── bigdecimal        exact base-10 decimal    (0d0.1)
```

Alongside it, every numeric operation the language has is now **exact
or an error**: nothing rounds silently any more, in either port. The
rationale is in `docs/design/number-tower.md`; the contract is pinned
by the shared `test/spec/number-tower.tsv` and is identical in both
implementations.

**Migration in two lines.** A schema that said `number` and *meant*
binary64 must now say `float`. A value that binary64 cannot hold
exactly must now be written `0d` — where such a value was previously
rounded in silence, it is now refused.

- **`number` widens to a supertype; `float` names the binary64 leaf.**
  `number` now admits a value of *any* numeric leaf and no concrete
  value ever carries it; `float` is a new kind keyword for the
  IEEE-754 binary64 leaf. Kind meets follow from disjointness:
  `number & float` → `float`, `number & 1.5` → `1.5`, and
  `float & integer` is an error (two leaves describe disjoint value
  sets, so they have no common lower bound). The `super()` ladder
  gains its real rung: `super(1.5)` → `float` (was `number`),
  `super(float)` → `number`, `super(number)` → `top` — one landed row
  (`number-model.tsv:super-float-canon`) flips. What breaks: a schema
  written `a: number` still admits everything it admitted, and now
  *also* admits `0d` values — the new schema subsumes the old, so
  existing data is unaffected, but a schema that meant "binary64 only"
  silently became more permissive. *Write `float` where you meant the
  binary64 leaf, and keep `number` where you meant "any number".*

- **`0d` literals, and the two exact leaves.** `0d` opts a literal into
  an exact leaf, and the leaf follows the source exactly as R1's `.`
  rule already did: digits only is a **biginteger** (`0d5`, `-0d5`,
  `0d123456789012345678901234567890`), while a `.` or an exponent
  anywhere makes it a **bigdecimal** (`0d0.1`, `0d1.5e2`, `0d1e3`).
  The exact leaves are reached *only* this way — never by promotion,
  coercion or inference — so a document that writes neither `0d` nor
  `float` means exactly what it meant before. Details that are
  contract, not incidental:
  - **One value, one rendering.** Scale is presentation, not identity,
    so a literal normalises at parse: `0d0.10`, `0d0.1` and `0d1e-1`
    are the same value and canon as `0d0.1`. An integral bigdecimal
    keeps one decimal place (`0d1e3` canons as `0d1000.0`), because
    `0d1000` would reparse as a *biginteger*. Negative zero never
    survives: `-0d0` is `0d0`, `-0d0.0` is `0d0.0`.
  - **The leaves are disjoint.** `5 & 0d5`, `1.5 & 0d1.5` and
    `0d5 & 0d5.0` are all errors, for the same reason `1 & 1.0` is:
    a cross-leaf meet would have to pick a kind, which makes `&`
    asymmetric in kind.
  - **The sign goes before the prefix** (`-0d5`). `0d-5`, `0d.5` and a
    bare `0d` are not literals.
  - **An exactness budget, not a rounding mode.** At most 4096
    coefficient digits and an absolute scale of at most 4096, checked
    at parse and at every operation; beyond it the value is refused
    (`decimal_budget`), never approximated. `0d1e1000000000` is
    rejected on sight rather than materialising a gigabyte of zeros.
  - **Programmatic construction obeys the same contract**, including
    the budget: Go gains `NewBigInteger(*big.Int)` and
    `NewBigDecimal(string)`, TypeScript `BigIntegerVal` (a `bigint`)
    and `BigDecimalVal` (a string). A float argument is deliberately
    not accepted — it has already rounded before the library can see
    it.

  What breaks: `0d12` used to be the bare string `"0d12"`, `0d1.5`
  used to be a path-reference error, and `-0d5` used to be a
  `negative` error. *Quote it (`"0d12"`) to keep the string.*

- **Arithmetic is exact, and `integer + integer` now refuses an inexact
  sum.** The exact ladder is `integer < biginteger < bigdecimal`: a
  mixed exact operation promotes to the widest operand, is computed
  exactly, and never demotes (`1 + 0d0.5` → `0d1.5`, `0d7 + -0d2` →
  `0d5`). `0d0.1 + 0d0.2` is `0d0.3`, which is the reason the exact
  leaves exist — binary64 gives `0.30000000000000004`. `float` stays
  off that ladder with its existing contagion against `integer`
  (`1 + 2.0` → `3.0`, unchanged), and mixing it with either exact leaf
  is a hard error in **both** operand orders (`1.0 + 0d2` and
  `0d0.5 + 1.0` are both `exact_float_mix`): an exact value never
  silently becomes a binary float. `upper()`/`lower()` are exact
  ceiling/floor keeping the argument's kind, unary minus negates
  exactly, and string concatenation renders marker-free digits
  (`"q" + 0d0.1` is `"q0.1"`, never `"q0d0.1"`).

  The breaking part is plain `integer + integer`. It is now computed
  exactly — `bigint` in TypeScript, checked `int64` in Go — and the
  exact answer must then satisfy the same storage contract R1 applies
  to a literal: integral, inside int64, **and** exactly representable
  in binary64. Binary64 addition silently rounded sums of exact
  operands, so `4503599627370496 + 4503599627370497` produced
  `9007199254740992` instead of `…993`; it is now an
  `inexact_integer_sum` error. The exactly-representable half of the
  test is what keeps the ports together: Go's `int64` can hold sums
  TypeScript's double cannot, so both refuse rather than diverge.
  *Write the operands as `0d` literals for a sum that leaves the exact
  binary64 window.*

- **Lossy integer literals are refused, with a `0d` escape.** An
  integer-source literal — plain decimal, or `0x`/`0o`/`0b`, with or
  without a non-negative exponent — whose value binary64 cannot hold
  exactly is now a located parse error (`lossy_integer_literal`) whose
  hint names the fix. **The rule is exactness, not magnitude.**
  `9007199254740992` (2^53), `100000000000000000000` (10^20), `1e21`
  and `0x10000000000000000000000000000000` (2^124, a power of two) are
  all exact and remain values; `9007199254740993` (2^53+1),
  `0x7fffffffffffffff` (2^63−1, which rounds *up* to 2^63) and
  `0xffffffffffffffff` (2^64−1) are refused. Literals and computed
  sums ask one shared exactness predicate, so they cannot disagree
  about what exact means. Six landed rows flip
  (`scalar.tsv:hex-big`/`hex-big-canon` and the `number-model.tsv`
  lossy rows).

  This reaches beyond `0d`-using documents: a plain JSON document
  containing `{"x":9007199254740993}` writes no `0d` at all, yet flips
  from silently generating a rounded number to an error. That is the
  deliberate point — refusal over corruption — but it means the
  JSON-superset guarantee is "every JSON document parses", not "every
  JSON document behaves identically". *Write `0d9007199254740993` to
  keep the exact value.*

- **Exact generation, and a new public `exactJSON` export
  (TypeScript).** An exact value now reaches JSON as exact digits. Go
  `Generate` returns `*big.Int` for a biginteger and `*Decimal` for a
  bigdecimal; `encoding/json` already emits exact digits for the
  former and the latter has a `MarshalJSON`, so the Go CLI is
  unchanged. TypeScript `generate()` returns a native `bigint` and a
  `Decimal` — and `JSON.stringify` **throws** on a `bigint`, with no
  replacer able to emit an unquoted number. TypeScript therefore gains
  its own emitter, `exactJSON(value, indent?)`, exported publicly
  alongside the `Decimal` class; the CLI (indented) and the shared
  suite's byte-exact `gens` mode (compact) both go through it, so
  neither can drift from the other or from Go. JSON itself was never
  the obstacle — a JSON number is arbitrary-precision text.

  What breaks: a TypeScript consumer of `generate()` on a document
  that uses `0d` receives `bigint`/`Decimal` where it expected
  `number`, and `JSON.stringify` on that output throws. *Use
  `exactJSON`.* A `0d`-free document generates exactly what it
  generated before.

- **An integer past 2^53 now generates as a `bigint` (TypeScript).**
  Aontu's `integer` leaf is an int64 window, but TypeScript stores it in
  a double, and above `Number.MAX_SAFE_INTEGER` a double no longer
  renders its own digits: `x:1152921504606846976` (2^60) generated and
  canoned as `1152921504606847000` — a *different* integer that merely
  rounds to the same double — while Go printed the true value from its
  int64. That was the parity ledger's last entry (issue #21), and it is
  now closed: TypeScript renders an integer-kind value by its exact
  digits in canon, and `generate()` hands back a `bigint` past the
  safe-integer line so `exactJSON` can write those digits. `Number.
  isSafeInteger` is the threshold because it is exactly "this double is
  an integer that renders its own digits".

  This is not a rendering choice made to force agreement: the tower's
  refusal of lossy literals means both ports now hold *exactly* the
  value the source asked for, so there is a right answer, and Go was
  already printing it.

  What breaks: a TypeScript consumer reading an integer above 2^53 out
  of `generate()` receives a `bigint` where it expected a `number`, so
  `out.x + 1` throws a `TypeError`. Those are precisely the values that
  were already silently wrong — a loud failure replaces a quiet one.
  *Nothing below 2^53 changes, in type or in bytes.* Go is unaffected:
  its leaf is an int64, exact at every magnitude, so it returns an
  `int64` throughout. The serialised JSON now agrees in both ports.

- **`NewInteger` refuses an inexact `int64` (Go).** Programmatic
  construction now obeys the same storage contract as a literal:
  `NewInteger(9007199254740993)` was exact in Go and unreachable in the
  canonical TypeScript port, a divergence no parse-time rule could see
  because no literal can express it. An `int64` that binary64 cannot
  carry exactly now yields a nil value carrying the same "not exactly
  representable" hint — and the same `0d` escape — that a lossy literal
  gets, so it surfaces at `Generate` rather than corrupting the
  document. The signature is unchanged. *Use `NewBigInteger` for an
  exact integer of any size.* The rule is exactness, not magnitude:
  `math.MinInt64` is a power of two and still constructs.

- **Three new reserved words, plus the `0d` prefix.** `float`,
  `biginteger` and `bigdecimal` are kind keywords; all three were
  ordinary bare strings, as was any `0d…` run. Nothing in the
  repository, the shared suite, the docs or the editor files used any
  of them meaningfully, but a real document might. The concrete shape
  this takes for a *reference* is worth naming: `a:$.float` against a
  `float:` key now fails exactly as `a:$.number` already did — the
  pre-existing keyword-versus-path behaviour, reached by one more
  word. *Quote them (`"float"`) to keep the string.*

- **A preference is now overridden by a peer of a sibling numeric
  leaf.** `a:*2 & 3.0` was an error and now yields `3.0`. This is a
  loosening, and it removes an asymmetry that existed only because
  `number` was simultaneously the binary64 leaf and `integer`'s parent
  — the mirror case `a:*2.2 & 3` already worked. `PrefVal` uses
  `superior()` as its override gate, so moving a float value's
  superior from `number` to `float` would otherwise have *tightened*
  four behaviours both ports agreed on before the tower (`*2.2 & 3`,
  `*lower(2.2) & 3`, `*upper(1.1) & 3`, `*1.5 & integer`); the gate
  therefore tests the numeric **family**, not the leaf. *Nothing to do
  unless you relied on the error.*

- The shared spec gains `test/spec/number-tower.tsv`, and the runners
  gain a fourth mode, `gens`, which compares the **byte-exact** JSON
  serialisation of a generated value. The existing `gen` mode decodes
  through float64 on both sides, so two distinct exact integers above
  2^53 compare equal there — exactness is unassertable without `gens`.

### Fixed — spreads & `type()` (TypeScript and Go)

- **`key()` through spreads (TypeScript and Go)**: `key()` (and other
  path-dependent functions) no longer leak the *source* key when a spread
  is applied through a `$ref` (`&:$.ref`) or through nested maps — they
  resolve to the destination key at each level. The TypeScript behaviour
  was brought to full Go parity.
- **`type()` spreads now apply (TypeScript and Go)**: a `type()` used as a
  spread emits its constrained values at the destination rather than
  marking the destination as a type, so `&:type({k:key(),x:number})`
  behaves like the non-type spread `&:{k:key(),x:number}` (`key()`
  resolves to the destination key, kinds constrain, fields are emitted).
  This holds for both inline and `$ref` spreads and for nested types;
  previously an inline `type()` spread dropped the child in TypeScript and
  a `type()`+`key()` spread errored in Go. Type/hide marks on applied
  spreads are cleared recursively.
- Salvaged the `perf0` spread spec corpus into the shared
  `test/spec/spread-*.tsv` suite, run by both implementations.

### Fixed — fragility audit

- **Deep-structure marks (TypeScript)**: `walk()` defaulted to a depth
  limit of 32 and silently returned partial, so `$ref`/function
  mark-clearing missed marks on structures nested deeper than 32 levels
  (wrong gen output). The default is now high enough that real configs
  are never truncated while still bounding accidentally-cyclic walks.
- **Deep-input safety (Go)**: `asVal` now bounds its recursion
  (`maxNodeDepth`), so pathologically deep input yields a clean
  `max_depth` error instead of an unrecoverable stack overflow; this
  also transitively bounds `setPaths`/`clonePath`. (Extremely deep input
  can still exhaust the underlying `@tabnas` parser, which has no depth
  option — a dependency limit.)
- **Trial-mode exception safety (TypeScript)**: `DisjunctVal.unify`
  restores the swapped `ctx.err`/`ctx._trialMode` in a `finally`, so a
  throw inside a member trial can no longer leak `_trialMode=true` (which
  would collapse later real errors to the shared `TRIAL_NIL` sentinel).
- **Disjunct defaults (TypeScript and Go)**: when generating a disjunction
  with preference (`*`) members, the fold over the preferred members
  indexed the unfiltered member list, so prefs that were not the leading
  alternatives were skipped (`1 | *{x:1} | *{y:2}` produced `{x:1}`
  instead of `{x:1,y:2}`). Both implementations now fold over the filtered
  list. Regression rows added to `test/spec/disjunct.tsv`.
- **`unknown_var` diagnostic (TypeScript)**: an undefined `$var` reported
  `invalid_var_kind` because the `unknown_var` branch fell through the
  `typeof` ladder; it now reports `unknown_var`. (Go already reported it
  correctly.)
- **`NumberVal` validation (TypeScript)**: the constructor used the
  coercing global `isNaN`, which accepts `null`/`''` as numbers; it now
  uses `Number.isFinite`, matching `IntegerVal`.
- **Robustness (TypeScript)**: `isExpect` is now declared/defaulted on the
  `Val` prototype like every other type discriminator (previously it
  worked only because `undefined` is falsy); the unify catch-all now
  preserves the original error message (and flags stack-overflow
  `RangeError`s) on the `internal` Nil instead of discarding it.

### Changed — hardening & docs (fragility audit)

- **Go**: the per-base parser cache (`langForBase`) is now bounded
  (`maxLangCache`) so long-running hosts (e.g. the LSP) cannot grow it
  without limit.
- **Go**: a source map key in the reserved sentinel namespace (prefix
  `\x00aontu_`, used internally for key order / spreads / optional keys)
  is now rejected with a clean parse error instead of silently colliding
  with that internal state. (The TS implementation stores the state under
  a `Symbol` and is already immune.)
- Documented that a `parse()`/`Parse()` result is **single-use**:
  `unify`/`generate` refine the tree in place (the MapVal/ListVal TOP
  fast-path returns `this`), so the same Val must not be re-unified,
  re-generated, or shared across threads. The public entry points
  re-parse per call, so this only affects callers that hold a parsed Val.
- Documented the security model of the `@"file"`/`@"pkg"` resolvers
  (they read any reachable file/module; supply a confined resolver in
  less-trusted contexts), the process-global Val id counter's growth, and
  the requirement to pin `@tabnas` versions exactly because the spread /
  optional rules depend on parser internals.

### Changed — parser packages (TypeScript and Go)

- **Go**: migrated the parser from the `github.com/jsonicjs/*` Go modules
  to the `github.com/tabnas/*` modules (`tabnas/jsonic`, `tabnas/expr`,
  `tabnas/multisource`, `tabnas/path`, `tabnas/directive`). Behaviour
  unchanged; the full suite passes. Adaptations: the `RuleSpec` API moved
  from exported slice fields to methods (`PrependOpen`/`AddClose`/`AddAC`);
  and the map `Merge` now returns the value as-is for a new key
  (`prev == nil`) — `tabnas/multisource` calls `Merge` for every key of a
  top-level `@"file"` load, and `asVal(nil)` is an empty map, so the old
  code wrongly produced `{} & val` and dropped the loaded keys.

- **TypeScript**: migrated the parser from the `@jsonic`/`jsonic` packages
  to the `@tabnas` packages (`@tabnas/jsonic`, `@tabnas/expr`,
  `@tabnas/multisource`, `@tabnas/path`, `@tabnas/directive`,
  `@tabnas/debug`). Behaviour is unchanged — the full suite (393 tests)
  passes. Three integration points needed adapting to `@tabnas`'s parser:
  - the parser core is split into `@tabnas/parser` + `@tabnas/jsonic`, so
    plugin `Plugin` types are reconciled via a small `asPlugin` cast and
    the model resolver is typed against `Tabnas`;
  - literal scalars are wrapped into Vals in the `val` rule's *after-close*
    (`.ac`) hook rather than before-close, because `@tabnas` re-resolves
    the scalar token during before-close;
  - `MultiSource` is applied before the grammar customisation so the `@`
    directive's `val` alt survives, and the spread/optional `val→map`
    dives reset to a fresh node (`@tabnas` parent-seeds a descended node,
    which otherwise made nested `&:`/`?:` maps share — and self-reference —
    their parent's node).
- Requires Node.js >= 24 (the `@tabnas` packages require it; CI already
  runs node 24.x).

### Changed — source file extensions

- `.aon` is now the **preferred** Aontu source extension; `.aontu` also
  works. Both are tried (in that order) for extension-less `@"path"`
  loads.
- **`.jsonic` is retired**: it is no longer in the implicit-extension
  search or the resolver's processor configuration in either
  implementation. (An explicitly named file still parses via the default
  processor, but `.jsonic` is no longer a recognised Aontu extension.)
- All shared-spec and test fixtures renamed from `.jsonic` to `.aon`;
  docs updated accordingly.

### Added — Language Server (LSP)

- New `aontu-lsp` Language Server in both implementations, reporting
  unification diagnostics over stdio (TypeScript `bin` `aontu-lsp` →
  `dist/lsp-server.js`; Go `go/cmd/aontu-lsp`). The two servers are kept
  in parity: same capabilities and identical diagnostic text.
- The LSP logic is exposed as a reusable library, separate from serving:
  - analysis — `computeDiagnostics(src)` (`ts/src/lsp.ts`) and
    `lsp.Diagnostics(src)` (`go/lsp`, built on the new
    `aontu.Check(src) []Problem` in `package aontu`);
  - a transport-agnostic protocol handler — `LspHandler` (TS) /
    `lsp.Handler` (Go);
  - a thin stdio JSON-RPC server on top.
- Diagnostics report genuine errors only (conflicts, unresolved
  references, unknown functions, syntax errors); valid non-concrete
  schemas such as `a:string` produce none. Full documentation in
  `docs/lsp.md`.
- **Hover** (`textDocument/hover`): resolves the value under the cursor
  from the unified tree and shows its canon and kind. Library:
  `computeHover` (TS) / `lsp.Hover` (Go), built on the new
  `(*aontu.Aontu).Spans` core API.
- **Completion** (`textDocument/completion`): the built-in functions,
  scalar-kind keywords and literals. Library: `computeCompletions` (TS) /
  `lsp.Completions` (Go); function names sourced from the engine
  (`aontu.BuiltinFuncNames`).
- (Go) Reference, dot, and unknown-function NilVals now carry source byte
  offsets, so `no_path` and `unknown_function` diagnostics are positioned
  precisely (matching TS).

### Added — editor plugins

- `editors/` now contains thin LSP-client plugins that launch `aontu-lsp`:
  **VS Code** (`editors/vscode`), **Emacs** (`editors/emacs`, Eglot and
  lsp-mode, with a major mode + syntax), and **Vim/Neovim**
  (`editors/vim`, filetype/syntax + Neovim built-in LSP autostart). All
  associate `.aon` and `.aontu`.
- The LSP **library is server-independent** in both languages (Go `lsp`
  package does not import `cmd/aontu-lsp`; TS `lsp.ts` does not import
  `lsp-server.ts`), so third parties can reuse the analysis + handler with
  their own transport. Documented under "Bring your own server" in
  `docs/lsp.md`.

### Breaking (TypeScript)

- **Number model is now CUE-faithful and matches the Go port.** `integer`
  and `number` are distinct kinds, so two concrete literals of different
  kind no longer unify: `1 & 1.0` now errors (`scalar_kind`) instead of
  resolving to `1`. Previously the canonical TS treated `1` and `1.0` as
  equal because JavaScript has a single number type. Kind-constraint
  cases are unchanged (`number & 1` → `1`, `integer & 1` → `1`).
- **Negative zero normalises to `0`** in generated output and the AST,
  matching the Go port (JSON has no `-0`). Previously TS preserved `-0`.

### Breaking — number model (TypeScript and Go)

The kind of a numeric literal, the canonical rendering of a number, and
the result kind of `+`, `upper()`, `lower()` and `super()` are now a
single contract, identical in both implementations and pinned by the
101 rows of the new `test/spec/number-model.tsv`. Everywhere the two
ports previously disagreed about a number, they now agree. Full
rationale in `docs/design/number-model.md`; the rules are stated in
`docs/reference-language.md`.

- **A numeric literal has `integer` kind only if it fits int64.** The
  rule is now: the source text contains no `.`, **and** the value is
  integral, **and** the value lies in
  `-9223372036854775808 ≤ n < 9223372036854775808`. The upper bound is
  exclusive because 2^63−1 is not representable as an IEEE-754 double
  — it rounds up to 2^63. So `1e21`, `100000000000000000000`,
  `0x7fffffffffffffff` and `0xffffffffffffffff` are `number` kind and
  **no longer unify with `integer`**; `1e3` and `9007199254740992` are
  still `integer`, and `1.0` is still `number`. TypeScript previously
  called all of those `integer` (it tested only for an integral value),
  while Go called them `number` — so `1e21 & integer` succeeded in one
  port and errored in the other. Go reached its answer via
  `n == float64(int64(n))`, and converting an out-of-range float64 to
  an int64 is *implementation-dependent* per the Go spec, so it was not
  guaranteed either; the bound is now compared against the float64
  limits explicitly, before any conversion. *If you constrain a value
  of that magnitude, write `& number` instead of `& integer`.* The rule
  now lives in one helper per port (`ts/src/val/numkind.ts`,
  `isIntegerKind` in `go/lang.go`) and is applied at **every**
  construction site — parsed literal, `$var` binding, raw value from
  the API — so the same number can no longer acquire different kinds by
  different routes.

- **Canon renders a number-kind value with a fraction or an exponent.**
  Canon must reparse to a value of the same kind, so a number-kind
  value whose shortest rendering carries neither a `.` nor an exponent
  now gains a `.0` suffix: `1.0` canons as `1.0` (was `1`), `0.0` as
  `0.0`, and `1e20` as `100000000000000000000.0`. Already-unambiguous
  renderings are untouched (`1e21` → `1e+21`, `0.000001` →
  `0.000001`), and integer-kind canon is unchanged (`1000`). *Anything
  that compares canon text will see new output* — two rows in
  `test/spec/scalar.tsv` flipped accordingly. **Generation is
  unaffected** (`generate` still yields `1` for `1.0`), and so is
  string coercion inside `+`: `a+1.0` is still `"a1"`, never `"a1.0"`.

- **`+` no longer narrows the kind of its operands.** A numeric sum has
  `integer` kind only when **both** operands are of `integer` kind and
  the sum itself satisfies the literal rule; otherwise the result is
  `number` kind. Both ports previously re-derived the kind from the
  result value alone, so `1.5+1.5` produced an `integer` `3` and
  `(1.5+1.5) & integer` succeeded — **it now errors**. `1+1.0` is
  likewise `number`. `1+2` is still `integer`, and a `*`-preferred
  operand contributes its preferred value's kind. *Replace
  `& integer` with `& number` on any sum that can take a fractional
  operand.*

- **`super(x)` is no longer inert.** It returned the `super()`
  function's own superior — `top` — so it unified with anything. It now
  returns the lattice-superior of its **argument**: `super(1)` →
  `integer`, `super(1.5)` → `number`, `super(a)` → `string`,
  `super(true)` → `boolean`. Where the argument has no meaningful
  superior (a map, a list, a bare kind, `top`) the result is still
  `top`. *A `super()` that was previously a no-op will now constrain* —
  `super(1) & 2.5` is a conflict where it used to succeed. (The
  language reference's `super(1)` → `number` example was wrong under
  the documented lattice — `number ⊐ integer ⊐ 1` — and has been
  corrected to `integer`.)

- **Malformed digit separators are rejected instead of silently
  accepted.** A `_` is legal only as a *single* separator *between*
  digits. A run that breaks the rule is no longer a number at all: it
  falls through to text, so `1__0` is the string `"1__0"` (was `10`)
  and `0x_ff` / `0xff_` are strings (were `255`). A typo now surfaces
  as a string rather than becoming a different number. `1_000_000`,
  `0xf_f`, `1_0.5_1` and `1e1_0` are unaffected.

### Fixed — number model (TypeScript and Go)

- **Unary `-` bound looser than every infix operator (TypeScript and
  Go).** Every aontu operator is re-based far above the `@tabnas/expr`
  defaults, but the unary prefixes were not, so `-1 & integer` parsed
  as `-(1 & integer)` — whose operand is an unresolved conjunction,
  which negation rejects. `-1 & integer`, `-2+3` and `-1|2` therefore
  all collapsed to `nil` in **both** ports; they now yield `-1`, `1`
  and `-1|2`. Unary `-`/`+` now bind tighter than `+`, `&` and `|`, and
  looser than `.`.
- **`upper()` / `lower()` narrowed an integer argument (TypeScript and
  Go).** Both returned a plain number-kind value, so `upper(2) &
  integer` errored. The ceiling/floor now keeps the **argument's**
  kind: `upper(2)` is an `integer` `2`, `upper(1.1)` a `number` `2`.
  This also makes the actual result kind agree with the `superior()`
  these functions already advertised.
- **`1|1.0` collapsed to a single alternative (TypeScript).**
  `ScalarVal.same` compared only the value — a leftover from before
  `integer` and `number` became distinct kinds — so disjunct
  deduplication merged the two branches and `(1|1.0) & 1.0` then
  errored. It now compares kind as well, so `1|1.0` keeps both
  alternatives and `(1|1.0) & 1.0` resolves to the float. (Go's
  `valSame` already compared kind; its canon for `1|1.0` was the
  ambiguous `1|1`, which the canon rule above resolves to `1|1.0`.)
- **Negative zero survived in Go.** `-0.0` generated `-0` and canoned
  as `-0`. Unary minus now yields positive zero for both kinds, the
  generate path normalises `-0` to `0`, and the number formatter
  renders both zeros as `0` — the three things TypeScript already did.
  `-0` generates `0` and canons as `0`; `-0.0` generates `0` and canons
  as `0.0`.
- **Negating the int64 minimum wrapped in Go.** `negate` applied
  two's-complement wrap-around to `math.MinInt64` (reachable only
  through the `NewInteger` API — no literal can express it). It now
  widens to a `number` instead.

### Fixed (Go)

- Unknown function calls now error with `unknown_function` instead of
  silently degrading to parenthesised grouping (`x:foo(1)` previously
  returned `{"x":1}`; it now errors, matching the canonical TS).
- Unifying two `close`d maps now selects a deterministic driver (fewer
  keys, then lexicographic key order), so the result is independent of
  operand order, matching `ts/src/val/MapVal.ts`.
- `jsonString` canon escaping now covers `\b`, `\f` and other control
  characters (`\u00XX`), matching JavaScript's `JSON.stringify`.

### Changed

- (Go CLI) The REPL no longer silently truncates lines over 64 KB,
  reports scanner errors, and no longer ignores stdin read errors.
- (TypeScript) Internal type-discriminator flags corrected for
  consistency (`LowerFuncVal` → `isLowerFunc`, `OpBaseVal` → `isOp`,
  `NullVal`'s `isNull` now has a prototype default). No behaviour change;
  these flags were previously never read.

### Documentation / tests

- Expanded the shared spec (`test/spec/*.tsv`) with order-independence
  and commutativity cases (refs, chained refs, disjunction, spread+pref),
  scalar edges (`1.0`, `-0`), the `1 & 1.0` conflict, and an
  unknown-function error row — each verified to pass identically in both
  implementations.
- `AGENTS.md` documents the in-place mutation caveat (parsed `Val`s are
  single-use), and the remaining known TS/Go divergences: numeric canon
  formatting is guaranteed only for a documented decimal subset
  (`0` and roughly `1e-6 ≤ |x| < 1e20`), error message text, and
  parse-level canon.
- New shared spec file `test/spec/number-model.tsv` (101 rows) pins the
  number model end to end: kind classification and the int64 bound,
  negative zero, kind-aware scalar identity, kind-preserving canon,
  kind contagion through `+` / `upper()` / `lower()`, `super()`, and
  the lexical edges (base prefixes, digit separators, exponents,
  leading zeros, numeric map keys, unary minus).
- New `test/spec/divergent.tsv` — a parity ledger recording behaviours
  where the two ports are known to disagree, so a divergence is tracked
  rather than rediscovered or accidentally baselined as the contract.
  Every entry is commentary (a row here could not pass in both ports by
  definition, so the file contributes none), and it currently records
  two: upper-case base prefixes (`0X1F`), and integer-kind values above
  2^53 that need more than 17 significant digits to write exactly.
- `docs/reference-language.md` states the number model: the three-part
  integer-kind rule and what falls outside int64, the kind-preserving
  results of `+`, `upper()`, `lower()` and `super()`, and the canonical
  rendering of number-kind values. New design note
  `docs/design/number-model.md` carries the rationale.
