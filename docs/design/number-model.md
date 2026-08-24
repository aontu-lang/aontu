# Design note: the number model

Status: **implemented** in both ports — and since **amended by the
number tower** ([number-tower.md](number-tower.md)), whose D7
reversed this note's rounding edges: literals this model let round
silently are now located `lossy_integer_literal` errors, and the
passages below that describe the old behaviour carry inline
corrections. The rules are pinned by
[`test/spec/number-model.tsv`](../../test/spec/number-model.tsv), run
by `ts/test/spec.test.ts` and `go/spec_test.go`, plus canon rows in
[`test/spec/scalar.tsv`](../../test/spec/scalar.tsv)
that changed with rule R4.

This note is the record of *why* Aontu's numbers behave as they do. It
states the model, then the six rules that make it well defined, each
with the defect it fixes; then the edges that remain open, and a short
comparison with a sibling language that solved the same problem
differently.

The spec file is the executable version of this note. Where the two
disagree, the spec wins — and this note is wrong.

## Contents

- [The model](#the-model)
- [What reaches the model](#what-reaches-the-model)
- [The six rules](#the-six-rules)
  - [R1 — kind classification of a numeric literal](#r1--kind-classification-of-a-numeric-literal)
  - [R2 — negative zero never survives](#r2--negative-zero-never-survives)
  - [R3 — kind-aware scalar identity](#r3--kind-aware-scalar-identity)
  - [R4 — canon round-trips kind](#r4--canon-round-trips-kind)
  - [R5 — kind contagion](#r5--kind-contagion)
  - [R6 — `super(x)` lifts its argument](#r6--superx-lifts-its-argument)
- [Where the rules live](#where-the-rules-live)
- [Known edges](#known-edges)
- [Comparison: boru](#comparison-boru)

## The model

Aontu has **two numeric kinds and one representation**.

The kinds are `integer` and `number`. They are lattice neighbours, not
separate towers: `integer` sits directly below `number`, so
`number & integer` is `integer`, and a concrete integer satisfies the
`number` constraint (`1 & number` → `1`). Two *concrete* scalars of
different kinds are unrelated points, however, so `1 & 1.0` is a
conflict — see [R3](#r3--kind-aware-scalar-identity).

The representation is IEEE-754 binary64 — a JavaScript number, a Go
`float64` — and there is only one of it. **Kind is a tag on a value,
not a second storage format.**

That last point is easy to get wrong when reading the Go port, because
`go/scalar.go` really does store an integer-kind peg in an `int64`:

```go
func newInteger(i int64) *ScalarVal { … }
func newNumber(f float64) *ScalarVal { … }
```

The `int64` buys **no extra range and no extra precision**, because
nothing ever puts a value into it that did not arrive as a `float64`
first:

- every numeric token the lexer emits carries a `float64` payload,
  including the big base-prefixed literals that `tsNumCheck` in
  `go/lang.go` constructs by hand (`l.Token("#NR", jsonic.TinNR, f,
  src)`);
- `numberVal` (`go/lang.go`) is the *only* route from a literal to an
  integer-kind value, and it is `newInteger(int64(n))` for a `float64`
  `n`;
- `asValDepth` (`go/lang.go`) has a `case float64` and no `case
  int64`, so raw parse nodes take the same route;
- even arithmetic runs in binary64: `plusAdd` (`go/op.go`) routes both
  operands through `primFloat` and adds as `float64`, so `1+2` is a
  float64 addition that is *re-tagged* integer afterwards.

So the `int64` is **kind bookkeeping plus exact formatting**: it lets
`Canon()` print an integer with `strconv.FormatInt` instead of a
float formatter, and it lets the type switch decide a kind. The
TypeScript port, which is canonical, holds both kinds in a plain JS
number and needs no such storage at all
(`ts/src/val/IntegerVal.ts`, `ts/src/val/NumberVal.ts`).

**What one representation buys.** Aontu is a superset of JSON, and
JSON has exactly one number type. Keeping one representation means
generated output is the native value with no conversion step (the only
normalisation is negative zero, [R2](#r2--negative-zero-never-survives));
arithmetic has one domain and no promotion ladder; and the two ports
have one number to agree about rather than a cross-product of storage
formats. It also means the kind rules can be stated as pure predicates
over a `float64`, which is what makes them portable — and what makes
`isIntegerKind` the single shared definition in both ports
(`ts/src/val/numkind.ts`, `go/lang.go`).

**What it costs.** R1's int64 window is a *classification* boundary,
not a storage guarantee: a literal above 2^53 is already rounded
before any rule sees it. *(When this was written,
`x:9007199254740993` generated `9007199254740992` in both ports, the
agreement pinned as `lossy-above-pow53`; the tower's D7 flipped that
row to `lossy-above-pow53-err` — the rounding is now a located
refusal.)* Exact decimal
arithmetic is not available at all. Both costs are taken deliberately;
see [Known edges](#known-edges) and
[Comparison: boru](#comparison-boru).

## What reaches the model

R1 tests the literal's *source text*, so it is worth stating what a
numeric literal can look like. All of the following are pinned in
`test/spec/number-model.tsv`.

- **Decimal, with optional exponent.** The exponent marker may be
  upper or lower case and its sign is optional: `1e3`, `1E3`, `1e+3`,
  `1e-7`.
- **Base prefixes:** `0x1f`, `0o17`, `0b1010`. *(The upper-case
  forms were a live TypeScript/Go divergence when this was written;
  the divergence is fixed — `0X1F` is 31 in both ports, pinned by
  `number-model.tsv`'s `base-upper-*` rows — and the ledger entry is
  closed.)*
- **Leading zeros are decimal, never octal:** `08` is 8, not an error.
- **A leading dot is not a number.** `.5` is a relative path
  reference, so it is an unresolvable ref rather than `0.5`.
- **Digit separators** are legal only as a *single* separator
  *between* digits. A run that breaks the rule is not a number at all
  — it falls through to text, so `1__0` is the string `"1__0"`, never
  `10`. A typo surfaces as a string rather than as a different number.
- **There are no negative literals.** `-` is a prefix operator that
  binds tighter than `+`, `&` and `|` and looser than `.`, so `-1 & -1`
  is `(-1) & (-1)`.
- **`NaN` and `Infinity` are not literals.** They carry no special
  lexing, so they are bare text and unify as strings (`x:NaN & string`
  succeeds; `x:NaN & number` is an error).
- **A numeric map key is not a number.** The key keeps its source text
  verbatim, so `1.5:x` generates `{"1.5":"x"}` and `0x10:x` generates
  `{"0x10":"x"}`. Keys never pass through the number model.
- **An overflowing literal is not a number either.** `1e400` lexes to
  a non-finite value and becomes a `not_number` error nil, which
  `generate()` reports as `Cannot resolve value`. An *underflowing*
  literal is not an error: `1e-400` is exactly `0`.

## The six rules

### R1 — kind classification of a numeric literal

**Rule.** A numeric literal has **integer** kind if and only if all
three hold:

1. its source text contains no `.`;
2. its value is integral;
3. its value lies within the int64 range, tested as
   `n >= -9223372036854775808.0 && n < 9223372036854775808.0`.

Otherwise it has **number** kind. A non-finite value is neither: it
stays a `not_number` error nil.

The upper bound is **exclusive** because 2^63−1 is not representable
in a `float64` and rounds up to 2^63. That is why
`0x7fffffffffffffff` — which looks like the largest `int64` — is
number kind.

The same rule applies at *every* construction site, including the ones
with no source text: the raw/implicit-list path (`rawToVal` in
`ts/src/lang.ts`, `asValDepth` in `go/lang.go`), `$var` bindings
(`ts/src/val/VarVal.ts`), and operator results. There condition 1 is
vacuous and conditions 2 and 3 decide. Routing every site through one
helper is the point: the sites cannot drift from each other, and they
cannot drift across the two ports.

**Worked examples.**

| Source | Value | Has `.`? | Integral? | In int64 range? | Kind |
|---|---|---|---|---|---|
| `1` | 1 | no | yes | yes | integer |
| `1.0` | 1 | **yes** | yes | yes | number |
| `1.` | 1 | **yes** | yes | yes | number |
| `1e3` | 1000 | no | yes | yes | integer |
| `1e-400` | 0 | no | yes | yes | integer |
| `9007199254740992` | 2^53 | no | yes | yes | integer |
| `1e21` | 1e21 | no | yes | **no** | number |
| `100000000000000000000` | 1e20 | no | yes | **no** | number |
| `0x7fffffffffffffff` | 2^63 | no | yes | **no** | number |
| `0xffffffffffffffff` | 2^64 | no | yes | **no** | number |
| `1e400` | ∞ | — | — | — | `not_number` nil |

So `x:1e3 & integer` succeeds and `x:1e21 & integer` is an error, in
both ports. *(Two rows of this table no longer produce values at
all: the tower's D7 checks integer-source literals for exactness,
so `0x7fffffffffffffff` (2^63−1) and `0xffffffffffffffff` (2^64−1) —
whose "Value" column above already shows the rounding — are now
located `lossy_integer_literal` errors rather than number-kind
values. `1e21` and `100000000000000000000` stand: each is exactly
representable.)*

**The defect it fixes.** The two implementations classified the same
literal differently. TypeScript tested
`Number.isInteger(r.node) && !r.o0.src.includes('.')` — no range
condition at all — so `1e21`, `100000000000000000000`,
`0x7fffffffffffffff` and `0xffffffffffffffff` were all *integer* kind.
Go tested `!strings.Contains(src, ".") && n == float64(int64(n))`, and
for every one of those values the round-trip failed, so they were all
*number* kind. `a: 1e21 & integer` therefore **succeeded in TypeScript
and failed in Go** — a silent, magnitude-dependent parity break, of
exactly the sort the shared spec exists to catch.

**Why the range test is written the way it is.** Go's specification
says that converting a float to an integer type when the value is out
of the destination's range has *implementation-dependent* behaviour.
On amd64 the conversion saturates to `-9223372036854775808`, so
`n == float64(int64(n))` is false for every out-of-range `n` — which
happens to be the answer we want, by accident, on this platform. It is
not a contract. The rule is therefore written as an explicit comparison
against the exact `float64` bounds, and the conversion happens only
*after* the comparison has passed:

```go
func isIntegerKind(n float64, src string) bool {
	if strings.Contains(src, ".") {
		return false
	}
	return n == math.Trunc(n) && int64MinFloat <= n && n < int64LimitFloat
}
```

Both `-2^63` and `2^63` are exactly representable in binary64, so the
bounds themselves are exact. The comment on `isIntegerKind` in both
ports says this too; it is repeated here because it is the one place
in the number model where a natural-looking expression is wrong.

### R2 — negative zero never survives

**Rule.** Negative zero never appears in the AST, in generated output,
or in canon. Three sites enforce it:

1. unary minus producing zero yields positive zero, for both kinds;
2. the generate path normalises `-0` to `0`;
3. the number formatter renders both zeros as `"0"`.

**Worked example.** `a:-0.0` generates `{"a":0}` and canons to
`{"a":0.0}` (the `.0` is [R4](#r4--canon-round-trips-kind)); `a:-0`
generates `{"a":0}` and canons to `{"a":0}`.

**The defect it fixes.** TypeScript already did all three — the
negation site normalises, `ScalarVal.gen` maps `-0` to `0`, and
JavaScript's `String(-0)` is `"0"` for free. Go did only the integer
half: an `int64` has no negative zero, so `a:-0` was fine, but the
number half was untouched and **`a:-0.0` emitted `-0`** — in generated
JSON *and* in canon. Go now normalises in `negate` (via `negZero`), in
`ScalarVal.Gen`, and in `formatNumber`.

Belt and braces is deliberate. The negation site alone is not enough:
`+` can produce a negative zero, and so can the exported `NewNumber`
constructor, neither of which goes through `negate`.

### R3 — kind-aware scalar identity

**Rule.** Two concrete scalars are "the same" only when **kind and
value both match**.

**Worked example.** `x:1|1.0` keeps both alternatives and canons to
`{"x":1|1.0}`; `x:(1|1.0) & 1.0` resolves to the float (canon
`{"x":1.0}`); `x:(1.0|1) & 1` resolves to the integer (canon
`{"x":1}`).

**The defect it fixes.** This was an internal inconsistency in
TypeScript, not a difference of opinion between the ports.
`NumberVal.unify` and `IntegerVal.unify` have always compared `kind`
as well as `peg`, so `1 & 1.0` was already a conflict. But
`ScalarVal.same` — the predicate the disjunct deduplicator uses —
compared `peg` alone, a leftover from before `integer` and `number`
became distinct kinds. So the two `1`s in `1|1.0` looked identical to
the deduplicator and **the float alternative was dropped**: `x:1|1.0`
canoned to `{"x":1}`, and `x:(1|1.0) & 1.0` then failed with
`scalar_kind` — a disjunct that discarded the very branch that would
have matched.

Go's `valSame` (`go/disjunct.go`) already compared kind and needed no
change; it kept both members all along. Its canon *rendering* of them
was indistinguishable (`{"x":1|1}`), which is what R4 fixes.

### R4 — canon round-trips kind

**Rule.** Canon must reparse to a value of the same kind. A
number-kind scalar therefore always renders with a fraction or an
exponent: take its JS-`Number.toString` rendering and, if that
rendering contains none of `.`, `e`, `E`, `N` (NaN) or `I` (Infinity),
append `.0`. Integer-kind canon is unchanged.

**Worked examples.**

| Value | `Number.toString` | Canon |
|---|---|---|
| number `1` | `1` | `1.0` |
| number `0` | `0` | `0.0` |
| number `1.5` | `1.5` | `1.5` (unchanged) |
| number `1e21` | `1e+21` | `1e+21` (unchanged) |
| number `0.000001` | `0.000001` | `0.000001` (unchanged) |
| number `1e20` | `100000000000000000000` | `100000000000000000000.0` |
| integer `1000` | — | `1000` |

**This applies to canon only.** String coercion inside the `+`
operator keeps JavaScript parity and must **not** gain the suffix:
`"a"+1.0` is `"a1"`, not `"a1.0"`. In Go that means `formatNumber`
(used by `primStr`, and pinned against `String(v)` in Node by
`go/scalar_format_test.go`) is left alone, and the suffix is added by
a separate `canonNumber` on the canon path. That test file passes
unchanged.

**The defect it fixes.** Canon is meant to be a faithful textual form
of a unified value — you should be able to feed it back in. Before
R4 it was not, for any integral number-kind value: `x:1.0` canoned to
`{"x":1}`, which reparses as an *integer*. Combined with R3 the loss
was visible in one line: a disjunct holding both kinds rendered as
`{"x":1|1}` in Go, two alternatives that print identically and reparse
as one. The two flipped rows in `test/spec/scalar.tsv`
(`big-fixed-canon`, `hex-big-canon`) are the same fix at the other end
of the range — both of those values are number kind under R1, so both
gained the suffix.

### R5 — kind contagion

**Rule.** No operator or function may introduce a kind *narrower* than
its inputs.

- **`+` over numerics** yields integer kind if and only if **both**
  operands are integer kind **and** the result itself satisfies R1's
  conditions 2 and 3; otherwise number kind. A `pref` operand
  contributes its preferred value's kind. String and boolean cases are
  unchanged.
- **`upper()` / `lower()` on numerics** keep the **argument's** kind.
  The values are unchanged (ceiling and floor respectively).

**Worked examples.**

| Source | Result | Kind |
|---|---|---|
| `1+2` | `3` | integer |
| `1.5+1.5` | `3.0` | number |
| `1+1.0` | `2.0` | number |
| `pref(1)+2` | `3` | integer |
| `pref(1.0)+2` | `3.0` | number |
| `4611686018427387904+4611686018427387904` | `9223372036854776000.0` | number (2^63 — left the range) |
| `upper(2)` | `2` | integer |
| `upper(1.1)` | `2.0` | number |
| `lower(1.9)` | `1.0` | number |

So `x:(1.5+1.5) & integer` is an error, and `x:upper(2) & integer`
succeeds.

**The defect it fixes.** Both ports re-derived the result kind from
the result *value* alone — `Number.isInteger(peg)` in TypeScript,
`p == float64(int64(p))` in Go — with no reference to the operands. So
`1.5+1.5` produced an **integer** 3, and `x:(1.5+1.5) & integer`
succeeded in both ports. Adding two floats cannot produce an integer;
the arithmetic is not the problem, the classification is.

`upper()`/`lower()` had the mirror-image defect, in the other
direction: they always built a number-kind result (`makeScalar` in
TypeScript, `newNumber` in Go), so `upper(2)` *widened* an integer to
a number and `x:upper(2) & integer` **failed in both ports**. That was
also self-contradictory, because both functions already advertised the
argument's kind through `superior()` — the value they actually
produced disagreed with the type they claimed. Carrying the argument's
kind (`makeScalarLike` in `ts/src/val/valutil.ts`; the `sv.kind ==
KindInteger` branch in `go/func.go`) makes the advertisement true.

Note the second clause of the `+` rule: two integer-kind operands can
still sum out of the int64 range, and when they do the result is
number kind. That is a widening, which R5 permits; only narrowing is
forbidden.

### R6 — `super(x)` lifts its argument

**Rule.** `super(x)` returns the lattice-superior of its
**argument** — for a concrete scalar, its kind. Where the argument
has no meaningful superior (its `superior()` answers top), the
previous behaviour stands.

**Worked examples.**

| Source | Canon |
|---|---|
| `x:super(1)` | `{"x":integer}` |
| `x:super(1.5)` | `{"x":number}` |
| `x:super(a)` | `{"x":string}` |
| `x:super(true)` | `{"x":boolean}` |

And it composes: `x:super(1) & 2` generates `{"x":2}`, while
`x:super(1) & 2.5` is an error — `super(1)` is the `integer`
constraint, and `2.5` is not an integer.

**The defect it fixes.** Both ports returned the *function's own*
superior rather than the argument's, which is top. So every
`super(...)` call canoned to `{"x":top}` and generated
`Cannot resolve value` — the function was **inert**, and
`super(1) & 2.5` happily produced `2.5` because unifying with top is
the identity. Nothing about `super()` worked.

There was a documentation defect alongside the code one. The function
table in [`docs/reference-language.md`](../reference-language.md) gave
the example `super(1)` → `number`, which is wrong under the current
lattice: `1` is an integer literal (R1), and an integer's immediate
superior is `integer`, not `number`. It is corrected there; the rule
above is the one both ports implement.

## Where the rules live

| Rule | TypeScript | Go |
|---|---|---|
| R1 | `ts/src/val/numkind.ts` (`isIntegerKind`), applied in `ts/src/lang.ts` (val rule, `rawToVal`, negation) and `ts/src/val/VarVal.ts`; guarded in `ts/src/val/IntegerVal.ts` | `go/lang.go` (`isIntegerKind`, `numberVal`, `asValDepth`) |
| R2 | `ts/src/lang.ts` (`negative-prefix`), `ts/src/val/ScalarVal.ts` (`gen`) | `go/lang.go` (`negate`, `negZero`), `go/scalar.go` (`Gen`, `formatNumber`) |
| R3 | `ts/src/val/ScalarVal.ts` (`same`) | `go/disjunct.go` (`valSame`) — already correct |
| R4 | `ts/src/val/NumberVal.ts` (`canon`) | `go/scalar.go` (`canonNumber`) |
| R5 | `ts/src/val/PlusOpVal.ts`, `ts/src/val/valutil.ts` (`makeScalarLike`), `ts/src/val/UpperFuncVal.ts`, `ts/src/val/LowerFuncVal.ts` | `go/op.go` (`operate`, `unpref`, `isIntegerScalar`), `go/func.go` (`upperLower`) |
| R6 | `ts/src/val/SuperFuncVal.ts` | `go/func.go` (`resolve`, `case "super"`) |

## Known edges

These are real limitations, not oversights. Each is listed with what a
future change would have to look like.

**1. Literals above 2^53 are inexact.** *(Resolved — the tower's D7
took exactly the "future change" this edge described.)* A binary64
mantissa is 53 bits, so at this model's landing `9007199254740993`
became `9007199254740992` before any rule ran — with integer kind
and no signal, the shared limit pinned as `lossy-above-pow53`.

*The future change happened*: the lexer now carries the literal's
source digits, exactness is checked wherever the source is
integer-shaped, and a literal whose value is not exactly
representable is the located `lossy_integer_literal` error
(`lossy-above-pow53-err`, `hex-max-int64-lossy-err`), with the `0d`
exact leaves for values that need more — see
[number-tower.md](number-tower.md) and
[Comparison: boru](#comparison-boru).

**2. Integer-kind canon diverged between the ports above 2^53, for
values needing more than 17 significant digits.** *(Resolved — by
the tower's unplanned Phase 8, the exact-integer rendering, which
closed #21.)* At this model's landing it was the same storage
difference seen from the formatting side: `x:4611686018427387904`
(2^62 — exactly representable, so a valid plain integer literal
that D7 does not touch) canoned to `4611686018427387904` in Go
(`strconv.FormatInt` on the `int64`) and to `4611686018427388000` in
TypeScript (`Number.toString`, at most 17 significant digits). Both
denoted the same `float64`. Phase 8 made TypeScript render the
exact digits too (`IntegerVal.canon` via `integerDigits`,
BigInt-backed — see
[number-tower.md](number-tower.md)), so an exact plain integer
above 2^53 remains valid source and now canons identically in both
ports; D7 separately turned the INEXACT integer-source literals
into located errors, so neither exact nor lossy literals can render
two ways any more. Number-kind values were always
unaffected — they go through the shared JS-style formatter.

*A future change* means choosing a single rendering for the whole
(2^53, 2^63) window, which is a language decision about what an
integer-kind value *is*, and then changing one port's storage or the
other's formatter.

**3. The int64 minimum is not expressible as an integer-kind
literal.** Aontu has no negative literals: `-` is a prefix operator.
So `-9223372036854775808` is `-(9223372036854775808)`, and the operand
`9223372036854775808` is 2^63 — outside the range by R1's exclusive
upper bound, hence number kind. R5 forbids the negation from narrowing
it back, so the result is a number and
`x:-9223372036854775808 & integer` is an error (pinned as
`neg-int64-min-err`). The value is reachable only through the API
(`aontu.NewInteger(math.MinInt64)`; `new IntegerVal({peg: …})` in
TypeScript), where it immediately meets edge 2.

*A future change* has to be a **lexer** change: making a
sign-prefixed digit run a single literal token, so that
`-9223372036854775808` is classified as one value in range.
Special-casing unary minus is not an option: the operand is genuinely
number kind, and letting the operator narrow it would violate R5.

**4. `NaN` and `Infinity` are not literals at all.** JSON has no
notation for them and Aontu is a superset of JSON, so Aontu does not
invent one. `NaN` and `Infinity` are bare text and unify as strings;
`x:NaN+1` is the string `"NaN1"`; `-Infinity` is unary minus applied
to a string, which is a `negative` error nil. There is no way to
manufacture a non-finite value from source either, because an
overflowing literal is a `not_number` error nil rather than ±∞.

The two APIs are not symmetric here, which is worth knowing: Go's
exported `NewNumber` (`go/construct.go`) accepts a non-finite
`float64` — `formatNumber` and `canonNumber` both carry branches for
`NaN`/`Infinity` — while TypeScript's `NumberVal` constructor throws
on one (`ts/src/val/NumberVal.ts`).

*A future change* would need reserved lowercase literals (boru's
`inf` / `-inf` / `nan`), a decision about what they mean under
unification and in generated JSON (where they cannot be serialised),
and a matching guard on the Go constructor. Adding them purely for
symmetry would break the JSON-superset property, so the bar is a
concrete need, not tidiness.

## Comparison: boru

[boru](https://github.com/boru-lang/boru) (MIT, same author family) is
a data/query language whose parser is built on the same
`tabnas/jsonic` lexer. It went through the identical failure mode
first, and its solution is a useful yardstick for what Aontu chose.

**boru had the same bug, worse.** That repository's
`design/INTEGER-OVERFLOW-STRATEGY.5.md` records **three contradictory
silent behaviours**: a lexer that degraded big literals to float, and
`pow` and `mul` that wrapped two's-complement. Its literal path was,
verbatim,

```go
if f == float64(int64(f)) && !math.IsInf(f, 0) && !math.IsNaN(f) {
    return eng.NewInteger(int64(f))
}
```

— the same expression R1 forbids, with the same consequence: a value
above 2^53 silently changed and kept the `Integer` type, and
`9223372036854775807` could not be written as an `Integer` at all. The
document's own conclusion is the one worth stealing: *documentation
cannot be the fix for a silent wrong answer*. Three code paths meant
"what does `Integer` mean at its boundary" was decided three different
ways by accident, because it was never decided in one place. Aontu's
`isIntegerKind` — one predicate, every construction site, both
ports — is the direct answer to that.

**What boru built instead.** Four leaves under `Scalar/Number`:
`Integer` (int64, checked overflow, loud `[boru/integer_overflow]`),
`Float` (IEEE-754 binary64, with `inf`/`-inf`/`nan` literals and a
`float_overflow` error instead of manufacturing infinity), and two
arbitrary-precision leaves opted into by a `0d` literal prefix —
`BigInteger` (`math/big`) and `BigDecimal` (`cockroachdb/apd`, exact
base-10, scale preserved on round-trip). The governing creed is *never
silently lose information*: mixing a Big leaf with a binary `Float` is
a hard `type_error` in **both** directions, and Float-to-Big
conversion is refused unless the caller names an accuracy mode.

Three further pieces of that design are relevant here:

- **Print-then-parse identity per leaf.** A boru `Float` always
  renders with a `.0` or an exponent. That is exactly the rule Aontu
  has adopted as [R4](#r4--canon-round-trips-kind).
- **Two deliberate ordering regimes.** IEEE-unordered relationals
  (`nan lt 5.0` is false, and so is `nan gte 5.0`), plus a lawful
  *total* order used by `sort`/`cmp` where NaN is greatest and `-0.0`
  sorts first. Aontu has no comparison operators at all (see the
  precedence table in the language reference) and no non-finite
  values, so it needs neither regime today — but the split is the
  right shape if it ever does.
- **A stricter parity method.** Shared TSV corpora run by
  *independently written* runners; a `make crossdiff` that diffs full
  value streams row-for-row; a parity-probe rule that corpus rows must
  be generated by asking **both** engines rather than baselining one;
  and `parser/spec/divergent.tsv`, a divergence ledger that is
  currently empty. Aontu already keeps the ledger
  ([`test/spec/divergent.tsv`](../../test/spec/divergent.tsv), two
  entries) and the shared corpus, but its runners share the spec, not
  the method: there is no crossdiff, and rows are not required to have
  been produced by both engines. The R1 and R2 divergences above are
  exactly the kind a crossdiff finds first.

boru's type system also ships **scalar refinements** — `(Integer gt
0)`, `between 5 10 Integer` — with closed-form complements in the type
algebra. Aontu's constraint algebra is a separate question, treated in
[`docs/capability-review/`](../capability-review/index.md).

**What Aontu deliberately did not adopt.**

- **No four-leaf tower.** Two kinds over one representation is the
  whole model. A tower buys exactness at the cost of a promotion
  ladder, cross-leaf conversion rules, a mixed-arithmetic error class,
  and a second storage format in each port — for a *configuration
  unifier*, whose numbers are ports, sizes, timeouts and version
  components, none of which need 34 significant decimal digits. Aontu
  is also a superset of JSON, and a JSON document cannot express a
  `BigDecimal`; a tower would make a value that cannot be generated.
- **No `inf`/`nan` literals.** For the same reason: JSON has neither,
  so neither does Aontu. boru is not constrained that way — it is a
  language with its own value notation, not a JSON superset — which is
  why the same decision comes out differently there.

**The door left open.** If exact decimals are ever genuinely needed —
money in a configuration, most plausibly — boru's **opt-in `0d`
literal prefix is the design to copy**. Its virtue is not the
arbitrary-precision arithmetic; it is that a new leaf reached only
through a new literal syntax **adds a kind without changing the
meaning of any existing document**. Every `1`, `1.0` and `1e21` already
written keeps its kind, its value and its canon. That property is what
makes the change affordable later, and it is the reason not to
pre-emptively build the tower now.

*Update: the door has been walked through. The decision to mirror
boru's structure — and the full design, including the places where
unification forces deviations from boru — is worked out and LANDED
in [number-tower.md](number-tower.md). The classification rules in
this document stand; the tower extends them, and its D7 reverses the
rounding edges recorded above — silent rounding of integer-source
literals is now a located error, as each corrected passage notes in
place.*
