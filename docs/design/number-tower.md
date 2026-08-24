# Design: the number tower

*Status: **IMPLEMENTED** (August 2026), in both ports, through the
phases below — Phases 0–7 as planned plus the unplanned Phase 8,
which closed #21. Direction decided — Aontu mirrors boru's
number type structure; this document works out how, and records the
implications and the places where Aontu must deviate. It builds on
[number-model.md](number-model.md), whose six rules (R1–R6) each
*extend* to the new leaves rather than change, and supersedes parts of
the [G1](../capability-review/g1-constraint-algebra.md) boundary.*

*Reconciled with what landed. Where building the thing proved a
decision wrong or incomplete, the correction appears as an
**AMENDED** note beside the text it corrects, rather than by rewriting
the original reasoning away: the reasoning is the record, and the
amendments are what checking it against two working engines changed.
The tense below is the design's own — read it as the decision, and the
amendments as the outcome.*

Every behavioural claim about boru below was verified by building and
running its CLI from a local clone; every claim about Aontu's current
behaviour was verified against both implementations.

## The decision

Aontu adopts the structure of boru's `Scalar/Number` subtree:

```
number                        (becomes a pure supertype)
├── integer      int64-window exact       (exists today)
├── float        IEEE-754 binary64       (today's "number" leaf, renamed)
├── biginteger   unbounded exact integer  (new, opt-in via 0d)
└── bigdecimal   exact base-10 decimal    (new, opt-in via 0d)
```

The two new leaves are reached only by literal syntax — the `0d`
prefix (`0d123` → biginteger; a `.` or exponent in the source, as in
`0d0.1` or `0d1e3`, → bigdecimal) — never by promotion, coercion, or
inference. A document that does not write `0d` or `float` means
exactly what it means today. That property is why boru's design is
the right one to copy: an opt-in prefix adds a leaf without changing
the meaning of any existing document.

Scope: the `number` subtree only. Boru's wider tree (String
subtypes, Microns, Path) is out of scope, though the restructured
`ScalarKindVal` lattice deliberately leaves room for depth elsewhere
later.

## Why unification changes the design

Boru is an evaluator: values are computed, compared, and printed.
Aontu is a unifier: values are points in a lattice obeying laws —
`a & a == a`, `a & b == b & a`, and canon is a function of the value.
Three boru behaviours, all verified live, are incompatible with those
laws, and Aontu must deviate on each:

1. **Boru preserves decimal scale in rendering but not in identity.**
   `0d0.10 eq 0d0.1` is true, yet `0d0.10` renders back as `0d0.10`.
   That is one value with two renderings — legal in an evaluator,
   impossible where canon must be a function of the value: if they
   are the same value they must render identically, and if they were
   distinct values then `0d0.10 & 0d0.1` would have to *fail* while
   being numerically equal. So Aontu normalises at parse: trailing
   zeros dropped, exponents folded, one rendering per value. Scale is
   presentation, not value, in a unification lattice.

2. **Boru's decimal arithmetic silently rounds.** The apd context
   (IEEE decimal128: 34 significant digits, round-half-even) is
   threaded through *every* decimal operation, not just division —
   verified: `0d1234567890123456789012345678901234.5 add 0d0` loses
   its fraction. Boru needs this because it has division; rounding
   somewhere is unavoidable. Aontu's entire numeric operator surface
   is `+`, `upper()`/`lower()` (ceiling/floor), and unary minus — all
   of which are **exact** in scaled-decimal arithmetic. Aontu
   therefore adopts *exact-always* semantics: no context, no rounding
   mode, no `with-decimal` machinery — and where boru rounds
   silently, Aontu errors loudly (a spec-fixed coefficient budget,
   below). For a ground-truth language, silent rounding is precisely
   the failure mode the exact leaves exist to eliminate.

3. **Boru's `eq` crosses leaves; Aontu's unification must not.**
   In boru, `5 eq 0d5` and `0.5 eq 0d0.5` are true (comparison
   projects both sides to an exact rational) while `0.1 eq 0d0.1` is
   honestly false. Aontu's landed R3 discipline is that concrete
   scalars of different kinds never unify (`1 & 1.0` errors), and the
   tower keeps it: `5 & 0d5` is an error. The argument is not purism:
   if cross-leaf unification succeeded, the result would have to
   *have* a kind, and either choice makes `&` asymmetric in kind —
   exactly the ambiguity that made `1 & 1.0` an error. Equality
   *tests* across leaves belong to G1's future comparison atoms (which
   should use boru's exact-rational ordering), not to unification.

Everything else mirrors boru directly.

## The design, decision by decision

### D1 — `number` becomes a pure supertype; `float` is a new kind keyword

Today `number` is simultaneously the binary64 leaf and the parent of
`integer`. Under the tower it is only the parent: the set of all
numeric values, of any leaf. The binary64 leaf gets the keyword
`float`.

Kind-with-kind meets: `number & <leaf>` → that leaf; two distinct
leaves → error (disjoint value sets have no common lower bound);
`number & number` → `number`. Kind-with-value: `number & v` → `v`
for a value of any numeric leaf; `<leaf> & v` → `v` only when `v` is
of that leaf.

The `super()` ladder gains a real rung: `super(1)` → `integer`,
`super(1.5)` → `float` (today: `number` — one landed spec row flips),
`super(integer)` → `number`, `super(number)` → `top`.

Migration is remarkably gentle: a schema constraint written `number`
keeps admitting everything it admitted (and additionally admits the
new exact leaves — see Implications). Nothing in the repository or
the shared suite uses `float` as a meaningful token today (verified:
it is a bare-text string in both ports, appearing in zero spec-row
sources).

### D2 — leaves are disjoint; identity is kind + value

Mirrors boru's typing exactly (`0d5 is Integer` → false, verified).
`integer & biginteger` (kinds) → error; `5 & 0d5` (values) → error;
`1 & 1.0` stays an error. R3's identity rule extends: two concrete
scalars are the same only when kind and value both match, where
"value match" for the big leaves is numeric comparison of the exact
representation — **never** Go pointer equality. (Audit fact: today's
`ps.peg == s.peg` in `go/scalar.go` and `go/disjunct.go` would
compare `*big.Int` pointers, silently breaking dedup and unification
— these become per-kind value comparisons.)

### D3 — literal syntax mirrors boru's matcher, minus its warts

Accepted: `[+-]? 0[dD] digits [. digits] [(e|E) [+-] digits]`, with
single `_` separators between digits (the landed separator rule
applies unchanged). Leaf choice follows the source, mirroring both
boru and Aontu's own R1 precedent (`.` in source decides): a `0d`
literal containing `.`, `e`, or `E` is bigdecimal; digits only is
biginteger.

Two boru edges are deliberately not mirrored: `0d-5` evaluates in
boru only through a text-fallback accident (its own matcher rejects
it) — Aontu rejects it cleanly, the sign belongs before the prefix
(`-0d5`); and `0d.5` / bare `0d` are not literals at all. *(As
landed — and as `docs/reference-language.md` documents — they are
not syntax ERRORS either: a marker with no digit after it falls
back to the grammar it always had, so bare `0d` is the string
`"0d"` and `0d.5` reads as member access on it.)*

Baseline change to pin first: today `0d12` is the bare string
`"0d12"` in both ports, `0d1.5` is a path-ref error (the `.` splits
it), and `-0d5` is a `negative` error. The literal must win over the
member-access grammar for the dotted forms — the matcher claims a
trailing `.` only when a digit follows, so `x:0d1.5` is one literal
while dot-adjacency edges (`0d1.e2`) fall out of the grammar and get
pinned in the spec phase.

**AMENDED — the two ports claim the run by different hooks, and must.**
The accept language is shared: one regexp, byte-identical in
`exactLiteralRe` (`go/lang.go`) and `BIG_LITERAL_RE`
(`ts/src/val/Decimal.ts`), kept RE2-compatible for exactly that reason,
with the sign deliberately outside it (`-0d5` is the existing unary
prefix; a `[+-]?` in the pattern would claim the `+` of `0d1 +0d2` and
silently turn an addition into an implicit list). What differs is the
hook that gets to claim the source, and the design named only one:

- **Go — the documented `value.def` + `Consume` route**, as designed. A
  regexp value definition with `Consume: true` is matched against the
  full forward source, so it claims the whole run *including* the `.`
  before either the number matcher (which declines `0d…` as not fully
  numeric) or the dot token can split it.
- **TypeScript — the text matcher's `check` hook**, because the
  `value.def` route does not work in this grammar. A value def — even a
  consuming one, even matched against the full forward source — is
  applied *inside* the text matcher, **after** its ender regexp has
  already carved the run at the `.`. The def duly claims `0d1.5` whole,
  and the matcher then still emits the ender's `.` as a fixed token, so
  `x:0d1.5` lexed as the bigdecimal *followed by a dangling
  member-access dot* — a path cycle. Verified, not theorised. The
  `check` hook runs **before** that ender regexp and returns the token
  outright, so the run is claimed whole and nothing else is emitted.
  (It is the sibling of the `Number.Check` hook the Go port already
  uses for big base-prefixed literals, so this is a hook the two ports
  were already using asymmetrically.)

A `match.value` matcher also claims it correctly in TypeScript and was
rejected on cost, not correctness: it is a candidate at *every* lex
position and materialises the forward source there — ~8% on a
text-heavy document, for a syntax almost none of them use. The `check`
hook only runs where the text matcher already runs, and measures at
parity with not having it. Its own cost is paid down by a two-char-code
guard before any regexp or allocation.

The lesson worth carrying: the D3 claim rule is a *language* decision
and is shared; which lexer hook enforces it is a per-port
implementation detail, and a design that names one hook for both ports
is over-specifying. The shared artefact is the regexp and the spec
rows, not the wiring.

### D4 — one value, one rendering: normalise at parse

`0d0.10`, `0d0.1`, and `0d1e-1` all parse to the same value, whose
canon is `0d0.1`. Rendering is boru's otherwise: sign before the
marker (`-0d5`), plain form at every magnitude, never scientific.

The `0d` prefix identifies the *family*, not the leaf, so the R4
`.0`-suffix device recurs for the leaf split: an **integral
bigdecimal always renders with one decimal place**. `0d1.5e2` (its
source has an exponent, so it is bigdecimal by D3) has value 150 and
canon `0d150.0`; `0d1e3` canons as `0d1000.0`; plain `0d1000` stays
biginteger and canons as `0d1000`. Without the marker,
`parse(canon(0d1e3))` would come back as a *biginteger* — a
kind-flipping canon of exactly the sort R4 exists to prevent.
Normalisation is therefore: strip fraction to minimal scale, fold
exponents, but never below one decimal place for a bigdecimal.
(Bigdecimal 1000 and biginteger 1000 are distinct lattice points —
kinds are disjoint per D2 — so their canons must differ.)

**AMENDED — the normal form is one invariant, and it is load-bearing
for D2 and D5.** Both ports arrived independently at the same rule, and
it is worth stating as an invariant rather than as a procedure, because
three of this document's separate requirements fall out of it:

> A Decimal is `(coefficient, scale)` with **scale always ≥ 1**.
> Trailing zeros are stripped only while `scale > 1`; a scale below 1
> (including a negative one, from an exponent) is folded into the
> coefficient; zero is `(0, scale 1)`. Normalisation happens in the
> **constructor**, so every Decimal that exists is already in this form.

From which: one value has one rendering, because `0d0.10`, `0d0.1` and
`0d1e-1` cannot survive construction as different objects; the integral
bigdecimal keeps its `.0` for free, because the floor at scale 1 *is*
the marker this section argues for; and **negative zero cannot exist**,
because the coefficient is a big integer and big integers have no
signed zero — so D5 costs nothing at all on this leaf.

The consequence that matters most is for D2. Because normalisation is
an invariant of the type and not a step some paths take, **identity is
a two-field comparison** — coefficient and scale — rather than a
numeric comparison that has to align scales before it can answer.
`0d0.10 & 0d0.1` succeeds by comparing equal fields, not by computing
that two differently-scaled values are numerically equal. A design that
normalised at *canon* rather than at *construction* would have had to
put scale alignment inside `same()`/`valSame`, in both ports, on the
hot path of every disjunct dedup.

### D5 — negative zero: R2 extends to the tower

`-0d0` and `-0d0.0` normalise to `0d0` everywhere (AST, gen, canon).
Deviation from boru, which preserves `-0d0.0` through rendering and
gives it a totalOrder slot. Aontu has no total-order surface, R2 is
a landed rule, and JSON has no negative zero.

### D6 — arithmetic: the exact ladder, exact-always, loud limits

The `+` promotion rules mirror boru's tower with one substitution
(no rounding):

- exact ladder: `integer < biginteger < bigdecimal` — a mixed exact
  operation promotes to the widest operand, computed exactly
  (`1 + 0d0.5` → `0d1.5`);
- `float` stays off the ladder with classic contagion against
  `integer` only (`1 + 2.0` → `3.0`, unchanged R5 behaviour);
- **float ⊕ big is a hard error, both orders** — "a Big type never
  silently becomes a binary Float" (boru's rule, mirrored verbatim;
  its two-sided error message naming both leaves is worth copying);
- `integer + integer` is **computed exactly** and its result must
  satisfy the R1 storage contract (integral, int64 range, *and*
  exactly representable in binary64) or it is a located error with
  the `0d` hint. Today's float64 addition silently rounds sums of
  exact operands — `4503599627370496 + 4503599627370497` yields
  `9007199254740992` instead of `…993` — which the tower's
  exact-or-error creed cannot tolerate. TypeScript computes the sum
  in `bigint`, Go in checked `int64` (boru's checked-add precedent);
  both then apply the same storage test, so a sum Go could hold but
  TypeScript could not (double-inexact above 2^53) errors in *both*
  ports rather than diverging. Result kind is unchanged R5.

String concatenation is defined for the new leaves and uses the
**plain digit rendering, without the `0d` marker** — `"x" + 0d5` →
`"x5"`, `"q" + 0d0.1` → `"q0.1"` — matching the existing rule that
concatenation renders digits, not kind decoration (`"q" + 0.001` is
`"q0.001"`, and the R4 canon suffix never leaks into strings). This
must be stated because the audit shows both ports would otherwise
fail differently: TypeScript's `+` would leave the op unresolved
while Go's `primStr` would coerce a big peg to the empty string — a
silent divergence. The string × leaf pairs join the cross-product
rows.

`upper()`/`lower()` on the big leaves are exact ceiling/floor and
keep the argument's kind (R5). Unary minus negates exactly. Results
never demote (`0d7 + -0d2` is biginteger `0d5`, mirroring boru).

Where boru consults its 34-digit context, Aontu instead enforces an
**exactness budget**: a fixed, spec-pinned limit on *both* the
coefficient digits *and* the absolute scale of any bigdecimal
(proposed: 4096 each), enforced at parse time, through every
operation, and at render. A literal or an exact result that exceeds
either bound is a located error (`decimal_budget`), never a rounded
value. Both bounds are needed: scale alignment can inflate
coefficients without bound (`0d1e4000 + 0d1e-4000`), and a
one-digit-coefficient literal like `0d1e1000000000` would otherwise
sail past a result-coefficient check only to demand a gigabyte of
zeros at plain-form render time (and overflow an `int32` scale
field) without any arithmetic occurring. The budget is a resource
guarantee in the G5 family — deterministic, identical in both ports,
and pinned by spec rows at both boundaries.

**AMENDED — the budget is checked on the SOURCE form, before
normalisation, and every construction route asks the same question.**
The proposed bounds landed as proposed (4096 coefficient digits, 4096
absolute scale), but "enforced at parse time" turned out to be too
loose a statement of *when*. Normalising an over-budget value **is** the
resource event the bound exists to prevent: the constructor folds a
scale below 1 by multiplying the coefficient by 10^−scale, so a Decimal
built first and measured afterwards has already done the damage. The
order is therefore part of the rule — measure the coefficient digits
and the scale **as the source writes them**, and only then construct.

That ordering is also what makes the bound cheap to state and impossible
to get subtly wrong per route. It is written once —
`overBudget(coeffDigits, scale)` — and asked by *both* routes into the
leaf: the `0d` literal, and D8's exact-input API. This was found as a
real defect rather than reasoned about in advance: TypeScript's
`Decimal.fromString` (the route behind the string-accepting constructor)
normalised before checking, so it built whatever it was asked for —
verified turning `1e200000` into a 200,002-digit coefficient in 31ms,
with `1e1000000000` exhausting memory — while the literal path refused
the same input. It was simultaneously a **cross-port divergence**, since
Go's `NewBigDecimal` already routed through the literal path's checker,
so the two ports disagreed about whether an over-budget string is a
value. The general form of the lesson: a resource bound stated against
"the parser" rather than against *the type's constructors* leaves every
non-parser route into the type unguarded, and the exact-input API is
precisely such a route — offered by this document, in the same
document that sets the bound.

### D7 — lossy literals become errors with a migration path

This adopts G1's already-designed Phase 6, improved by the tower's
existence: an integer-source literal (decimal or base-prefixed)
whose value cannot be held exactly becomes a located parse-time
error whose hint names the fix — *"write `0d<digits>` for an exact
integer"*. Boru's equivalent error suggests only an approximate
float, even though its own `0d` form would be exact (verified); Aontu
should not repeat that missed opportunity.

This flips four rows to `err`: the three G1-sanctioned hex rows
(`hex-big`, `hex-big-canon`, `hex-huge`) **and**
`number-model.tsv:lossy-above-pow53`, whose source
`9007199254740993` pins today's silent rounding and is precisely the
behaviour D7 abolishes — leaving it in `gen` mode would make a
correct D7 implementation fail the shared contract. Together these
**resolve issue #21** exactly as its ledger entry prescribes: the
divergent (2^53, 2^63) window becomes a refusal in both ports, and
the ledger entry is deleted rather than answered with a renderer
choice.

**AMENDED — the rule is EXACTNESS, not magnitude, and both claims in
that last paragraph are wrong because they read it as magnitude.**

*`hex-huge` does not flip.* Its source,
`0x10000000000000000000000000000000`, is 2^124 — a **power of two**,
therefore exactly representable in binary64, therefore still a perfectly
good value. It is refused by no part of D7. The three rows that do flip
are the genuinely inexact literals: `0xffffffffffffffff` (2^64−1),
`0x7fffffffffffffff` (2^63−1, which rounds *up* to 2^63) and
`9007199254740993` (2^53+1). The shared suite makes the point
deliberately, by keeping `hex-huge` as a value directly beneath the
refused `hex-big` — a literal eighteen orders of ten *larger* than the
one above it that is refused. The same correction applies to
implication 3 below, and to G1, which listed `hex-huge` for the same
reason.

*Issue #21 is not resolved by this phase, and its ledger entry stays.*
The claim rested on "every input in the divergent window is exactly
such a literal", which is the magnitude reading again. #21 is about
integer-kind values that need more than 17 significant digits to write
exactly; D7 refuses a literal that is not exactly representable, not one
that is merely large. Re-probed against both CLIs after Phases 4–6
landed: `x:1152921504606846976` (2^60) and `x:9223372036854774784`
(2^63−1024, where the binary64 spacing is 1024) are both exact, both
still parse in both ports, and both still render differently (TypeScript
`…847000` and `…775000`; Go the exact digits). D6's exact integer sums
open a *second* route into the same window from operands D7 accepts —
`576460752303423488+576460752303423488` is a sum of powers of two and
diverges identically.

What is true after this phase is a better position than before it, and
it changes what closing #21 would mean: every case that still diverges
is now one where **both ports hold exactly the value the source asked
for**, so the old objection — that agreeing on the text would only be
agreeing on a wrong number — no longer applies. There is now a right
answer and Go already prints it. Closing #21 means rendering an
integer-kind peg by its exact digits in TypeScript (the peg is integral
and inside the int64 window by construction, so `BigInt(peg).toString()`
is exact), in canon **and** in the Phase 5 exact-JSON emitter alike,
since `JSON.stringify` of the same JS number reproduces the 17-digit
form. That is an engine change, and it is not this phase's.

**RESOLVED — #21 is closed, and this closed the ledger's last
number entry** (the ledger itself is not empty today: #24, lone
surrogates, was reopened the same day this landed). That
engine change landed: `IntegerVal.canon` renders `BigInt(peg).toString()`,
and `IntegerVal.gen` returns a **`bigint`** for a value past
`Number.MAX_SAFE_INTEGER` so the exact-JSON emitter writes the exact
digits. The emitter half is not optional and could not be solved inside
the emitter: by the time `exactJSON` holds a JS number, an integer-kind
2^60 (whose exact digits are the answer) is indistinguishable from a
float-kind `1e21` (whose shortest form `1e+21` is the answer, in both
ports). The kind has to travel *with* the value.

`Number.isSafeInteger` is the threshold because it is exactly "this
double is an integer that renders its own digits". A tighter predicate
(`BigInt(peg).toString() === String(peg)`) would keep marginally more
values as `number` — 2^54 among them — at the cost of a contract no
consumer can evaluate in their head, and of handing back numbers that
are unsafe for arithmetic as well as for printing.

This is a **breaking change** for a TypeScript consumer reading integers
above 2^53 out of `generate()`; those are precisely the values that were
already silently wrong, and a `TypeError` on `out.x + 1` is the better
failure. It also makes the native type differ between the ports — Go
returns an `int64` at every magnitude — which is forced by the storage
rather than chosen, and is why the runtime types are pinned per-port
(`ts/test/exactjson.test.ts`, `go/generate_test.go`) while the shared
`gens` rows pin the bytes they agree on.

One shared row changed mode as a consequence:
`number-model.tsv:pow53-integer` moves from `gen` to `gens`, because 2^53
is the first value TypeScript generates as a `bigint` and `gen` decodes
its expectation with `JSON.parse` — a bigint can never deep-equal a
float64, whatever the digits say. The R1 assertion is untouched: the
`& integer` in the source still errors unless 2^53 has integer kind.

### D8 — representation: no new dependencies

- **Go:** biginteger is `*big.Int` (pointer, mandatorily — a
  non-pointer `big.Int` in an `any` marshals as `{}`, verified);
  bigdecimal is a small struct `(coeff *big.Int, scale int32)`.
  **No apd dependency**: apd exists to round, and Aontu never
  rounds. Exact add/negate/ceil/floor over coefficient-and-scale is
  a few dozen lines.
- **TypeScript:** biginteger is a native `bigint`; bigdecimal is a
  dependency-free Decimal class — boru already proved this exact
  shape (`unscaled bigint + scale`) renders byte-identically to
  Go across a divergence-ledger's worth of edge cases, minus the
  negZero flag D5 removes.
- Pointer pegs are treated as immutable, matching the engine's
  existing immutability contract (clones share them; nothing may
  mutate them in place).
- **Programmatic construction obeys the same storage contract.**
  Today Go's `NewInteger` accepts any `int64` while TypeScript's
  `IntegerVal` holds a JS number — so the nominal value
  `9007199254740993` is exact in Go and silently `…992` in the
  canonical port, a parity hole no parse-time rule can see. Under
  the tower, Go's `NewInteger` rejects an int64 that is not exactly
  representable in binary64 (the R1 storage test, applied to API
  input), and both ports gain exact-input constructors for the big
  leaves (`NewBigInteger`/`NewBigDecimal` in Go; `bigint`- and
  string-accepting constructors in TypeScript, where a `number`
  argument is already rounded before the library can inspect it).
  Exact values above 2^53 enter through the big leaves or not at
  all — in both ports alike.

  **AMENDED — the exact-input constructors landed and share the D6
  bound; the `NewInteger` half did not land.** `NewBigInteger(*big.Int)`
  (copying its argument, so a caller may keep mutating theirs) and
  `NewBigDecimal(string) (Val, error)` exist in Go, with
  `bigint`-accepting and string-accepting constructors in TypeScript,
  and both string routes are gated by the same `overBudget` check as the
  literal — see the D6 amendment, where getting that wrong was the
  actual defect. The one clause still outstanding is Go's `NewInteger`:
  it accepts any `int64` unchecked, so the parity hole this bullet
  opens with is still open — `NewInteger(9007199254740993)` is exact in
  Go and `…992` in TypeScript. It is small (one call to the exactness
  predicate that Phases 4 and 6 already share) and it is the API-side
  face of #21, which the D7 amendment above leaves open for the same
  underlying reason.

  **AMENDED AGAIN — the `NewInteger` clause has now landed, and D8 is
  complete.** `NewInteger` refuses an `int64` that `isExactInBinary64`
  rejects, so programmatic construction obeys the same storage contract
  as a literal and the API can no longer build a value the canonical
  port cannot hold. The refusal is a **nil value**, not a panic and not
  a second return: aontu errors are values, so it flows through
  unification and surfaces at `Generate` carrying the same
  `lossy_integer_literal` hint (and the same `0d` escape) that D7's
  literal rule gives — which also leaves the signature `NewInteger(int64)
  Val` unchanged, since this narrows what the function accepts rather
  than how it is called. `math.MinInt64` is a power of two and so stays
  constructible, keeping the negation path in `lang.go` reachable.

### D9 — the generate contract (the hard consumer-facing change)

Generated native values: Go returns `*big.Int` and `*Decimal`, both
implementing `json.Marshaler` to emit **exact digits as a raw JSON
number** — verified: `encoding/json` already does this for
`*big.Int` (`{"a":1267650600228229401496703205379}`), so the Go CLI
works unchanged. TypeScript returns `bigint` for biginteger and a
`Decimal` instance for bigdecimal — and `JSON.stringify` **throws on
bigint** (verified; a replacer cannot emit an unquoted number), so
an exact JSON emitter is required. JSON itself is not the obstacle —
JSON numbers are arbitrary-precision text; only JavaScript's
serialiser is.

The TypeScript emitter is a **documented public library export**,
not a CLI internal: a library consumer whose document contains a
biginteger has no other supported way to produce the promised exact
JSON, so hiding the only implementation behind the command line
would break the contract D9 makes. The CLI consumes the same export.

**AMENDED — the export is `exactJSON(value, indent?)`**, exported from
`aontu` alongside the `Decimal` class (the type a bigdecimal generates
as; a biginteger generates as the language's own `bigint`). The indent
argument is what keeps there being *one* implementation rather than two:
the CLI passes `2` and the shared suite's `gens` mode passes none, so
the pretty and compact forms cannot drift from each other, or from Go.

Two testing consequences, because byte-exact serialisation cannot
see the difference: an integral bigdecimal (`0d1e3`) and a
biginteger can emit the *same* raw JSON number even if `generate()`
returns the wrong runtime type. The native-type contract is
therefore pinned by **per-port API tests** (TypeScript asserting
`typeof`/`instanceof`, Go asserting the concrete type) alongside the
`gens` rows — canon pins the AST kind, `gens` pins the bytes, and
only the API tests pin the runtime object.

This is an API-surface change for TS consumers of `generate()`
(a document using `0d` can yield `bigint`/`Decimal` values), and it
is confined to documents that opt in — a `0d`-free document
generates exactly what it generates today.

### D10 — the spec suite needs a byte-exact gen mode first

Verified: both runners currently collapse gen values through float64
(TS: `JSON.parse` + `deepStrictEqual`, which is also type-strict
against `bigint`; Go: `jsonEqual` without `UseNumber`), so `2^100`
and `2^100 + 3` would compare **equal** — exactness is unassertable,
not merely awkward. The byte-exact generated-output mode already
designed in [G5](../capability-review/g5-trust-contract.md) (`gens`:
compare marshalled bytes) is therefore a hard prerequisite, and
lands as Phase 0. Canon mode remains the kind-faithful surface — the
number-model lesson repeating at the next scale.

## Implications

**Breaking-change inventory** (all gated on a breaking release, all
pinned with baseline rows first):

1. `0d`-prefixed bare strings and the words `float`, `biginteger`,
   `bigdecimal` change meaning. Verified: nothing in the repository,
   suite, docs, or editor files uses any of them meaningfully today;
   real-world documents using them as bare strings must quote them.
   Note the concrete shape this takes for a *reference*: `a:$.float`
   against a `float:` key now fails exactly as `a:$.number` already
   does — the pre-existing keyword-versus-path behaviour, reached by
   one more word.

   *Landed in Phase 1 (implementation note).* A preference is
   overridden by a peer of a **sibling numeric leaf**, where before it
   was not: `a:*2 & 3.0` was an error and now yields `3.0`. This is a
   loosening, and it removes an asymmetry that existed only because
   `number` was simultaneously the binary64 leaf and `integer`'s
   parent — the mirror case `a:*2.2 & 3` already worked. `PrefVal`
   therefore gates an override on the *family* (`number`) rather than
   the leaf; gating on the leaf instead would tighten four behaviours
   that both ports agreed on before the tower, breaking landed rows
   (`var.tsv:var-pref-kind-narrow` among them). Pinned by the
   `pref-*` rows in number-tower.tsv, in both ports.
2. `super(1.5)` flips from `number` to `float` (one landed row).
3. **Lossy integer literals become errors (D7)** — and this reaches
   further than the four flipped spec rows (`hex-big`,
   `hex-big-canon`, `hex-huge`, `lossy-above-pow53`)
   [**AMENDED**: `hex-huge` is 2^124, exact, and does **not** flip —
   see D7; the flips are the inexact literals, `hex-big`,
   `hex-big-canon`, `hex-max-int64` and `lossy-above-pow53`]: a plain JSON
   document containing `{"x":9007199254740993}` is `0d`-free yet
   flips from silently generating a rounded value to a located
   error with a `0d` hint. That is the deliberate point of D7 —
   refusal over corruption — but it means the JSON-superset
   guarantee is "every JSON document parses", not "every JSON
   document behaves identically". Likewise D6's exact integer sums:
   an addition that silently rounded now errors.
4. **`number` widens.** A schema saying `a: number` now also admits
   `0d` values. Subsumption-wise the new schema subsumes the old —
   backward compatible for all existing data — but a schema that
   *meant* "binary64 only" silently became more permissive and must
   say `float` to keep its meaning. This is the subtlest implication
   in the set and leads the migration notes.
5. TS `generate()` can return `bigint`/`Decimal` for opting-in
   documents (D9).
6. Any future canon-hash pins ([G6](../capability-review/g6-distribution.md))
   made before this lands would be invalidated by the canon changes —
   an argument for sequencing the tower before G6 ships hashing.

**What deliberately does not change:** the R1 integer window, the
R2/R3/R4/R5 rules (each *extends* to the new leaves), and the
absence of `inf`/`nan` literals — an overflowing literal stays an
error, and the exact leaves cannot overflow, only exhaust their
budget. A document is untouched iff it avoids all of: `0d`-prefixed
or newly reserved bare words (implication 1), lossy integer literals
(implication 3), and integer sums that silently rounded (D6). Every
value that is exact today means exactly what it meant; what changes
is that the *inexact* cases stop being silent — the claim is meaning
stability, not universal behaviour stability.

**Knock-ons for the capability review:** G1's constraint atoms must
range over the tower (`min(0)` against a bigdecimal — recommend
boru's exact-rational ordering for bound comparison, since bounds are
about order, not identity; an open question below). G3 gains a clean
compat story for implication 4. G5 owns the coefficient budget. G6
should land after canon stabilises. The number-model design record
gains a successor section rather than an edit — its rules stand.

**Cost assessment.** The full checklist of touch points was audited
(every Kind switch and construction site in both ports, both LSP
keyword lists, both editors' syntax files, the hints tables, four
docs). The genuinely novel work is: two Val leaves ×2 ports, the
lexer matcher ×2, exact scaled arithmetic (~dozens of lines, no
dependencies), the TS JSON emitter, and the `gens` runner mode ×2.
Boru's version cost far more — apd, contexts, `with-decimal`, a
render-parity saga — and Aontu escapes almost all of it for one
reason worth stating plainly: **its operator surface is tiny, and
every operation it has is exact.** The tower's price scales with the
operator surface, which is an argument for G8's maths-as-functions
adopting the same exact-or-error discipline rather than importing
floats' behaviour.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bare-string meaning changes go unnoticed downstream | Certain (for affected docs) | Low | Baseline rows pinned before the flip; loud CHANGELOG breaking section; quoting rescues every case |
| Pointer-peg equality bugs in Go (`==` on `*big.Int`) | Medium | High | D2 makes identity per-kind value comparison; property tests over the lattice laws with big-leaf generators; the known sites are already enumerated |
| TS exact-JSON emitter diverges from Go's marshaller | Medium | Medium | `gens` byte-exact rows executed by both runners; parity-probe discipline (both engines, never one) |
| Coefficient or scale blow-up as a resource attack (`0d1e4000 + 0d1e-4000`; the one-digit scale bomb `0d1e1000000000`) | Low | Medium | D6's dual budget — coefficient digits *and* absolute scale — enforced at parse, operation, and render, deterministic and spec-pinned at both boundaries |
| `0d` matcher vs dot/path grammar interactions | Medium | Medium | Mirror boru's claim rule (trailing `.` only before a digit); pin the `0d1.e2`-class edges in the spec phase; the landed separator machinery already covers `_` edges |
| `number`-widening surprises schema authors | Medium | Low | Migration note leads the CHANGELOG; `float` spelling is a one-word fix; G3's subsume verb (when it lands) mechanically confirms compatibility |
| Two new kinds double the R5 contagion surface | Low | Medium | The promotion table is small and closed; pin the full operand-pair cross-product as spec rows, boru's `numeric-cross-product.tsv` being the template |

## Implementation plan

Spec-first throughout: every phase lands its TSV rows before code,
TypeScript then Go, parity-probed. Nothing may regress the landed
number-model rows except the flips this document names.

**All of it landed, in this order, and the method held**: every phase
committed its `test/spec/number-tower.tsv` rows first, failing, and the
engine change second. The phases below are kept in the future tense they
were written in; the amendments record where the plan met the code.

- **Phase 0 — baseline + machinery (S/M).** Pin today's meaning of
  `0d…`/`float`/`biginteger`/`bigdecimal` bare text in both ports;
  add the byte-exact `gens` mode to both runners (D10).
- **Phase 1 — kind lattice (M).** `float` keyword; `number` to pure
  supertype; kind meets; `super()` ladder; flip `super-float-canon`.
  Touches the enumerated keyword sites (parser defs, marker
  classes/Kind enum, LSP lists, hints, editors, docs tables).
- **Phase 2 — literals and leaves (L).** The `0d` matcher ×2;
  `BigIntegerVal`/`BigDecimalVal` (TS) and Kind members + pegs (Go);
  parse-time normalisation incl. the integral-bigdecimal `.0`
  marker (D4); the parse-time scale bound (D6); canon; R2 extension
  (D5); the programmatic-construction contract and exact-input
  constructors (D8).
- **Phase 3 — identity (S).** Per-kind value comparison in unify and
  disjunct sameness; kill the pointer-equality hazards.
- **Phase 4 — arithmetic (M).** The `+` ladder, exact integer sums
  with the storage-contract error, float⊕big error, string × leaf
  concatenation, `upper`/`lower`/negate on the new leaves, the
  exactness budget at the operation boundary. Cross-product spec
  rows including the string pairs.
- **Phase 5 — generate (M).** Go marshallers; the TS exact JSON
  emitter as a documented public export, consumed by the CLI;
  per-port API tests pinning the native runtime types (D9); API
  documentation of the new native types.
- **Phase 6 — lossy literals (S).** D7's errors with the `0d` hint;
  flip the four rows; delete the ledger entry; close #21.
  **AMENDED**: three rows flip, not four — `hex-huge` is exact and
  stays a value — and the ledger entry and #21 both **stay open**, for
  the reasons in the D7 amendment. Literals and computed sums were
  given one shared exactness predicate so the two cannot disagree about
  what exact means.
- **Phase 8 — exact integer rendering (S), unplanned.** The work the
  Phase 6 amendment identified and could not do: TypeScript renders an
  integer-kind value by its exact digits, in canon and in generated
  JSON alike (the latter by generating a `bigint` past
  `Number.MAX_SAFE_INTEGER`, since the emitter cannot recover the kind
  from a JS number). Ten new rows in `number-tower.tsv` pin both routes
  into the window and the values beneath it; `pow53-integer` moves from
  `gen` to `gens`. This closes #21 — the ledger's last NUMBER entry,
  though not its last entry outright (#24, lone surrogates, was
  reopened the same day) — and
  with D8's `NewInteger` clause landing alongside it, completes the
  tower.
- **Phase 7 — docs (M).** number-model.md successor section;
  reference/tutorial; CHANGELOG breaking inventory (implications
  1–6); migration notes led by the `number`-vs-`float` distinction.
  **AMENDED**: this pass also reconciles *this document* with what
  landed — the amendments throughout — since three of its decisions
  turned out to be wrong or incomplete once there were two engines to
  check them against.

## Open questions

- **Keyword spellings.** `biginteger`/`bigdecimal` mirror boru and
  are unambiguous; `bigint`/`decimal` are shorter but `decimal`
  is a likelier bare-string collision in real documents. Mirror
  names recommended; decide once, before Phase 1.
  **RESOLVED**: the mirror names, as recommended — `biginteger` and
  `bigdecimal` in both ports, in the parser value definitions, both LSP
  completion lists and hover labels, and both editors' syntax files.
- **Cross-leaf bounds in G1.** Should `min(0)` constrain a
  bigdecimal? Recommended yes, via exact-rational ordering (boru's
  `toRatExact` precedent) — bounds are about order, not identity —
  but the decision belongs to G1's algebra and needs its emptiness
  and subsumption rules extended leaf-wise.
  **RESOLVED as recommended**: order is a property of the number
  line; a bound admits any numeric leaf at an admissible position,
  compared exactly, and never narrows the peer's leaf. The leaf-wise
  emptiness rules (integral-gap on narrowed domains; point-deletion
  only under a narrowed leaf, since `neq` excludes by scalar
  identity), the endpoint-leaf canon rule, and the lazy-endpoint /
  eager-emptiness ruling are in
  [`docs/reference-language.md`](../reference-language.md#the-constraint-algebra-specified),
  "The constraint algebra"; the once-drafted rows are promoted —
  `test/spec/constraint-*.tsv` (the draft directory now holds only
  its README).
- **Conversion functions.** With cross-leaf unification refused,
  deliberate conversion (`0d5` to integer 5) has no spelling. Boru's
  `convert` + accuracy-mode design is the reference; in Aontu this
  is function territory and belongs with G8's roster, not the tower.
- **`biginteger` vs `integer` subtyping.** The tower makes them
  disjoint (mirror). The alternative — `integer ⊑ biginteger`, every
  int64 value also a biginteger — reads attractively but breaks gen
  type stability (would `5` generate as `bigint`?) and boru's
  no-silent-demotion rule; rejected, recorded here because it will
  be asked.
- **Dot-adjacency edges.** The exact parse of `0d1.e2` and friends
  falls out of matcher-vs-path-grammar interaction; pin whatever
  both ports agree on in Phase 2, and only design further if the
  agreed behaviour is unacceptable.
  **RESOLVED, and the agreed behaviour is acceptable.** The claim rule
  (a trailing `.` only when a digit follows) turns out to answer the
  whole family uniformly: `0d1.`, `0d5.foo`, `0d1.e2` and `0d1.5.2`
  each lex as an exact literal *followed by member access* and die as
  an unresolvable path. No design was needed beyond it. Two edges were
  worth pinning alongside: `0d5.foo` is the one case that genuinely
  differed between the ports (bare text in TypeScript, a parse error in
  Go) and now agrees — the D3 amendment's `check` hook is what closed
  it; and a `0d` run in **key** position is text, dotted forms
  included, since the literal is value syntax only, exactly as `float`
  is.
