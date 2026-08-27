# Language reference

Complete, exhaustive description of the Aontu language: lexical
structure, every value form and operator, evaluation order, the
canonical form, and generation rules. Behaviour stated here is verified
by the shared [`test/spec/*.tsv`](../test/spec/) suite and holds in both
the TypeScript and Go implementations unless a difference is called out.

For the public programming interface see the
[API reference](reference-api.md). For the reasoning behind the model see
the [Explanation](explanation.md).

## Contents

- [Lexical structure](#lexical-structure)
- [The value lattice](#the-value-lattice)
- [Scalars](#scalars)
- [Scalar kinds (types)](#scalar-kinds-types)
- [Maps](#maps)
- [Lists](#lists)
- [Conjunction `&`](#conjunction-)
- [Disjunction `|`](#disjunction-)
- [Preference / default `*`](#preference--default-)
- [Optional keys `?`](#optional-keys-)
- [Spreads `&:`](#spreads-)
- [Generating children: `pack` and `each`](#generating-children-pack-and-each)
- [Selecting: `filter` and `match`](#selecting-filter-and-match)
- [The placeholder `_`](#the-placeholder-_)
- [The pipe `|>`](#the-pipe-)
- [References and paths](#references-and-paths)
- [Variables `$name`](#variables-name)
- [The `+` operator and grouping](#the--operator-and-grouping)
- [Functions](#functions)
- [Arithmetic: `add` `sub` `mul` `div` `mod` `rem`](#arithmetic-add-sub-mul-div-mod-rem)
- [Aggregating: `sum` `least` `greatest`](#aggregating-sum-least-greatest)
- [Marks: `type` and `hide`](#marks-type-and-hide)
- [Closed values: `close` / `open`](#closed-values-close--open)
- [Source loading `@"…"`](#source-loading-)
- [Operator precedence](#operator-precedence)
- [Canonical form](#canonical-form)
- [Generation](#generation)
- [Subsumption](#subsumption)
- [Errors](#errors)
- [The constraint algebra (specified)](#the-constraint-algebra-specified)

---

## Lexical structure

Aontu source is parsed by
[`@tabnas/jsonic`](https://github.com/tabnas/jsonic) with Aontu-specific
plugins, so the surface syntax is "relaxed JSON".

- **Whitespace** separates tokens; newlines and commas are
  interchangeable separators. `a:1 b:2`, `a:1, b:2`, and `a:1\nb:2` are
  equivalent.
- **Comments** begin with `#` and run to end of line. A file of only
  comments unifies to `{}`.
- **Keys** may be bare (`host`), and need quoting only if they contain
  separators or operator characters.
- **Bare strings** need no quotes (`name: Mercury`). Quote with `"…"` or
  `'…'` to include spaces or special characters (`name: "hi there"`).
- **Numbers** come in two families. A plain JSON number (`1`, `1.5`,
  `1e3`) is stored as an IEEE-754 double and takes `integer` or
  `float` kind; a `0d`-prefixed literal (`0d5`, `0d0.1`) is stored
  *exactly*, with no binary rounding anywhere, and takes `biginteger`
  or `bigdecimal` kind. Which of the four a literal takes is decided
  by its source text, never by its magnitude; the rule is stated in
  full under [Scalar kinds](#scalar-kinds-types).
- **Exact literals** are written `0d` (or `0D`) followed by digits.
  Digits alone give a biginteger (`0d123`); adding a `.` or an
  exponent gives a bigdecimal (`0d0.1`, `0d1e3`). The grammar is
  `0[dD] digits [ "." digits ] [ (e|E) [+-] digits ]`. The sign goes
  *before* the prefix — `-0d5`, never `0d-5` — and a marker with no
  digit after it is not a literal at all: `0d` is the bare string
  `"0d"`, and `0d.5` reads as member access on that string.
- **Other numeric forms.** Hexadecimal (`0x1f`), octal (`0o17`) and
  binary (`0b1010`) literals use lower-case prefixes, and belong to
  the plain family, not the exact one. (Only the exact marker also
  accepts its letter in upper case: `0D12` is a literal, `0X1F` is the
  bare string `"0X1F"`.) `_` may separate digits (`1_000_000`,
  `0d1_000`), but only singly and only *between* digits — a run that
  breaks the rule is not a number at all, so `1__0` is the string
  `"1__0"`, not `10`.
- **A number that cannot be stored exactly is refused.** An integer
  literal the double format would silently round is a located error
  naming the `0d` escape, not an approximation — see
  [Exact or refused](#exact-or-refused-lossy-literals).
- **Booleans** are `true` / `false`; **null** is `null`.

## The value lattice

Every Aontu value is a point in a lattice ordered from most general to
most specific:

```
                 top                 (fits anything)
        ┌─────────┼─────────┐
     string     number   boolean …   (kinds / types)
        │    ┌────┼────┐     │       (number is a pure
        │    │    │    │     │        supertype over four
      "ada"  1   1.5 0d0.1 true       numeric leaves — see
        └────┴────┴────┴─────┘        Scalar kinds)
                 ⊥  nil / bottom     (no value — a conflict)
```

- **`top`** is the unit: unifying anything with `top` yields the other
  value. It is what an unconstrained field is.
- **`nil`** (bottom) is the result of a failed unification. It carries an
  error message and cannot be generated.
- **Unification** of two values is their *greatest lower bound* — the
  most general value at least as specific as both. If none exists, the
  result is `nil`.

This ordering is why unification is order-independent and idempotent:
`a & b` equals `b & a`, and `a & a` equals `a`.

## Scalars

| Form        | Example source | Generates |
|-------------|----------------|-----------|
| integer     | `a:1`          | `1`       |
| negative    | `a:-5`         | `-5`      |
| float       | `a:1.5`        | `1.5`     |
| biginteger  | `a:0d5`        | `5`       |
| bigdecimal  | `a:0d0.1`      | `0.1`     |
| bare string | `a:hello`      | `"hello"` |
| quoted str  | `a:"hi there"` | `"hi there"` |
| boolean     | `a:true`       | `true`    |
| null        | `a:null`       | `null`    |

Two scalars unify only if they are of the same kind *and* equal
(`1 & 1` → `1`, `foo & foo` → `"foo"`); otherwise the result is a
conflict (`1 & 2` → error, and so is `1 & 1.0`).

## Scalar kinds (types)

A bare kind name is a *type*: the set of all scalars of that kind.

| Kind         | Matches                                        |
|--------------|------------------------------------------------|
| `string`     | any string                                     |
| `number`     | any numeric value — the supertype over the four leaves below |
| `integer`    | any value of *integer kind* (below)            |
| `float`      | any value of *float kind* (below)              |
| `biginteger` | any value of *biginteger kind* (below)         |
| `bigdecimal` | any value of *bigdecimal kind* (below)         |
| `boolean`    | `true` or `false`                              |
| `top`        | any value at all                               |

### The four numeric leaves

Every numeric value carries a **kind**, fixed when the value is built,
and it is the kind — not the magnitude — that decides what the value
unifies with. There are four numeric kinds, and `number` is not one of
them: `number` names the whole family and nothing else, so no value
ever has `number` kind.

```
number                   (a pure supertype — no value has this kind)
├── integer      a double, whole, in the int64 window   1     1e3
├── float        any other double                       1.5   1e21
├── biginteger   exact, whole, unbounded                0d5   0d1_000
└── bigdecimal   exact, with a point or an exponent     0d0.1 0d1e3
```

The two upper leaves hold IEEE-754 doubles — every value a plain JSON
number can hold exactly — and the source rule below decides which of
them a literal joins. The two lower leaves are reached only by writing
`0d`, and hold their digits *exactly*: no binary rounding, and no
precision limit but the [exactness budget](#the-exactness-budget).

The four leaves are **disjoint**. No value belongs to two of them, and
values of different leaves never unify however equal they look —
`1 & 1.0`, `5 & 0d5` and `0d5 & 0d5.0` are all conflicts. A cross-leaf
result would have to pick a kind, and either choice would make `&`
asymmetric in kind.

**Leaf by source.** Which leaf a literal lands in is decided by how it
is written, never by how large it is. A literal *without* the `0d`
prefix has **integer** kind if, and only if, all three of these hold:

1. its source text contains no `.`;
2. its value is integral (no fractional part);
3. its value lies within the int64 range, that is
   `-9223372036854775808 ≤ n < 9223372036854775808`.

Anything else has **float** kind. The upper bound is *exclusive*
because these values are doubles and 2^63−1 cannot be represented in
one: it rounds up to 2^63, and so falls outside the range.

A literal *with* the `0d` prefix has **bigdecimal** kind if its source
contains a `.` or an exponent, and **biginteger** kind otherwise.

```
1                      → integer     (no '.', integral, in range)
1e3                    → integer     (1000 — an exponent is not a '.')
9007199254740992       → integer
1.0                    → float       (rule 1: the source has a '.')
1.5                    → float       (rules 1 and 2)
1e21                   → float       (rule 3: beyond int64)
100000000000000000000  → float       (rule 3)
0d5                    → biginteger  (0d, digits only)
0d1_000                → biginteger
0d0.1                  → bigdecimal  (0d with a '.')
0d1e3                  → bigdecimal  (0d with an exponent)
```

The two families nearly mirror each other, with one asymmetry worth
remembering: a `.` splits the leaf in both, but an exponent splits it
only in the `0d` family — `1e3` is an integer, `0d1e3` a bigdecimal.

**Canon rendering.** Canon renders a number so that reparsing it
yields the same kind again, which takes three markers:

- an integer-kind value renders plainly: `1000`;
- a float-kind value always carries a fraction or an exponent, so
  a `.0` suffix is appended when the shortest rendering has neither:
  `1.0`, `100000000000000000000.0`;
- an exact value carries the `0d` marker, with any sign in front of
  it: `0d5`, `-0d5`, `0d0.1`.

Because `0d` names the *family* and not the leaf, one more marker is
needed to tell the two exact leaves apart, and it is the same `.0`
device: **an integral bigdecimal always renders with one decimal
place.** So `0d1e3` canons as `0d1000.0` while the biginteger `0d1000`
canons as `0d1000`. Without that, `canon(0d1e3)` would reparse as a
biginteger — a different lattice point, since the leaves are disjoint.

Exact values render in plain form at every magnitude, never in
scientific notation, and **one value has exactly one rendering**:
scale is presentation, not identity, so `0d0.10`, `0d0.1` and `0d1e-1`
all parse to the same value and all canon as `0d0.1`.

Points worth knowing:

- The same rules apply wherever a numeric value is built — a parsed
  literal, a `$var` binding, a raw value handed to the API — so a given
  number never has two different kinds depending on where it came from.
  Where there is no source text, condition 1 is vacuous and conditions
  2 and 3 decide.
- A literal that overflows the double range entirely (`1e999`) is not a
  number at all; it is an error. One that *underflows* to exactly zero
  (`1e-400`) is integer-kind `0`.
- Negative zero never survives, in any leaf: `-0.0` normalises to
  `0.0`, `-0d0` to `0d0`, and `-0d0.0` to `0d0.0`, in canon and in
  generated output alike.
- Aontu has no negative literals: `-` is a prefix operator applied to a
  positive literal. The int64 *minimum* therefore cannot be written as
  an integer-kind literal — `-9223372036854775808` negates the
  float-kind literal `9223372036854775808` and stays float kind. Write
  it `-0d9223372036854775808` to hold it exactly, as a biginteger.

### Exact or refused: lossy literals

An integer literal is stored only if the double format holds it
*exactly*. One that would be silently rounded is a located error
instead, and the message names the fix: write it with `0d`.

This is the rule most likely to surprise, because the input that
triggers it is ordinary JSON. Suppose a dump from an API carries a
64-bit record ID:

```aontu
id: 9007199254740993
```

That value is 2^53+1, the first whole number a double cannot hold.
Storing it anyway would yield 9007199254740992 — a different ID, with
nothing said about it. Aontu refuses instead:

```
[aontu/lossy_integer_literal]: Cannot resolve value at path $.id

This integer literal, 9007199254740993, is not exactly representable in
binary64, so storing it would silently round it to a DIFFERENT
number. Aontu refuses rather than corrupts: write it as a `0d`
literal to get the exact integer.
```

(That is the TypeScript wording; Go phrases the same refusal a little
differently. Both name the `0d` escape.)

Take the escape, and the document works again — exactly:

```aontu
id: 0d9007199254740993
```

```
canon      {"id":0d9007199254740993}
generates  {"id":9007199254740993}
```

One consequence to plan for: the rescued value has **biginteger**
kind, not `integer`, so a schema constraining it must say `biginteger`
(or the family, `number`). `id: integer` would now conflict.

```
id:0d9007199254740993 & biginteger   → {"id":0d9007199254740993}
id:0d9007199254740993 & number       → {"id":0d9007199254740993}
id:0d9007199254740993 & integer      → error
```

**The rule is exactness, not magnitude.** A shorter literal can be
refused while a much longer one is fine, because what matters is
whether the exact value happens to be a double:

```
9007199254740992       → integer  (2^53, exactly representable)
9007199254740993       → error    (2^53+1 is not)
100000000000000000000  → float    (10^20 — far larger, still exact)
0x7fffffffffffffff     → error    (2^63−1 rounds up to 2^63)
0x8000000000000000     → float    (2^63 itself is a power of two)
```

The refusal covers every integer-literal form, decimal and
base-prefixed alike, and it happens at parse time, so a lossy literal
never reaches unification.

### The exactness budget

The exact leaves have no precision limit in the ordinary sense — a
biginteger is as wide as its digits — but a bigdecimal is bounded, so
that a short source cannot demand unbounded work. The bound is one a
document can rely on:

> A bigdecimal may carry **at most 4096 coefficient digits** and an
> **absolute scale of at most 4096**.

The *coefficient* is the significant digits with the point removed;
the *scale* is where the point sits among them, which for a literal is
its fraction digits minus its exponent. So `0d1.5e-4095` has
coefficient 2 and scale 4096, and is the last value of its shape that
fits.

Both halves are checked independently, on literals (against the source
as written, before normalisation) and on every computed result.
Exceeding either is a located error — *"This exact decimal exceeds the
exactness budget"*. Aontu has no rounding mode and no precision
context, so a value beyond the budget is refused rather than
approximated.

```
0d1e-4096            → 0d0.000…0001   (scale 4096 — inside)
0d1e-4097            → error          (scale 4097 — outside)
0d1e4097             → error          (the bound is two-sided)
0d1e1000000000       → error          (refused before rendering it)
0d1e-4000 + 0d1e4000 → error          (the exact sum needs 8001 digits)
```

`biginteger` has no scale and no coefficient bound: a whole number of
ten thousand digits is an ordinary value.

### Unification rules

- **kind & matching scalar → the scalar.** `number & 2` → `2`;
  `string & hello` → `"hello"`; `1 & integer` → `1`;
  `0d1.5 & bigdecimal` → `0d1.5`.
- **kind & non-matching scalar → conflict.** `1 & string` → error;
  `1.0 & integer` → error (`1.0` is float kind whatever its value),
  and so are `1e21 & integer`, `0d5 & integer` and `1 & biginteger`.
- **kind & kind:** equal kinds unify to themselves; `number & <leaf>` →
  that leaf (`number & integer` → `integer`, `number & bigdecimal` →
  `bigdecimal`); two distinct leaves conflict, as do unrelated kinds.
- **scalar & scalar:** two concrete numbers are the same only when kind
  *and* value match. So `1 & 1.0` is a conflict, and `1|1.0` is a real
  two-branch disjunction — `(1|1.0) & 1.0` selects the float. Value
  comparison for the exact leaves is over the number, not its
  spelling: `0d1.5 & 0d1.50` is `0d1.5`.

No operator or function narrows a kind: see
[`+`](#the--operator-and-grouping) and
[`upper()`/`lower()`](#functions). For the reasoning behind the model —
why the bound is int64, why canon carries a `.0`, and how the two
implementations are held in step — see the
[number model design note](design/number-model.md); for why `number`
became a supertype and where the exact leaves came from, see
[the number tower](design/number-tower.md).

## Maps

A map is an unordered set of key/value pairs. Braces are optional at the
top level.

- **Literal:** `a:{b:1,c:2}` → `{"a":{"b":1,"c":2}}`.
- **Implicit nesting:** a chain of colons builds nested maps —
  `a:b:c:1` → `{"a":{"b":{"c":1}}}`.
- **Duplicate-key merge:** stating a key twice unifies the two values.
  `a:{b:1}, a:{c:2}` → `{"a":{"b":1,"c":2}}`; this recurses, so
  `a:b:c:1 a:b:d:2 a:e:3` → `{"a":{"b":{"c":1,"d":2},"e":3}}`.

Maps are **open** by default (extra keys may be unified in) until sealed
with [`close`](#closed-values-close--open).

## Lists

A list is an ordered sequence.

- **Literal:** `a:[1,2,3]` → `{"a":[1,2,3]}`. Elements may be
  whitespace-separated: `[1 2 3]`.
- **Mixed / nested / of maps:** `[1,two,true]`, `[[1,2],[3,4]]`,
  `[{x:1},{y:2}]` all work.
- Lists unify element-by-element by position (and support `&:` spreads,
  below).

## Conjunction `&`

`a & b` is the explicit unification of `a` and `b` — the same operation
that merges duplicate map keys.

```
a:1 & integer        → {"a":1}
a:number & integer   → {"a":integer}
a:{x:1} & {y:2}      → {"a":{"x":1,"y":2}}
a:{x:{p:1}} & {x:{q:2}} → {"a":{"x":{"p":1,"q":2}}}
```

Conjunction is commutative, associative, and idempotent. It **distributes
over disjunction**: `x & (a|b)` tries `x` against each alternative.

## Disjunction `|`

`a | b` is a choice of alternatives. It is kept open until something
selects a branch.

```
a:1|2                → canon {"a":1|2}
a:string|number      → canon {"a":string|number}
a:1|2|3              → canon {"a":1|2|3}
```

Unifying a concrete value selects the matching branch (others become nil
and drop out):

```
a:2  a:1|2           → {"a":2}
a:2  a:string|number → {"a":2}
```

`&` binds tighter than `|`, so `c & b | a` parses as `(c & b) | a`.

**An unresolved disjunction has no value** (ADR-007). More than one
alternative still admitted means the truth is not yet settled, so
generation refuses with `disjunct_no_gen`, class `incomplete` — the
same class a bare `string` residue answers:

```
a:1|2                → [aontu/disjunct_no_gen] at $.a
a:{x:1}|{y:2}        → [aontu/disjunct_no_gen] at $.a
```

Two things resolve it: a value that selects an alternative, or a
preference saying which one holds when nothing else does (below).
Alternatives that are the *same value* collapse first, so `1|1` and
`{a:1}|{a:1}` each generate that one value — sameness is structural
for maps and lists (container kind, closedness, marks, optional keys,
then the children).

An optional key whose value is an unresolved disjunction is dropped
rather than reported, as every other unresolved optional is.

## Preference / default `*`

`*x` marks `x` as **preferred** (a default). In a disjunction the
preferred branch is chosen unless unification forces another.

```
a:*1|number          → generates {"a":1};  canon {"a":*1|number}
a:*5                 → {"a":5}              (default with no alternatives)
a:*green|string      → {"a":"green"}
a:*1|number  a:2     → {"a":2}              (override beats default)
```

Defaults propagate through nesting and spreads. `pref(x)` is the
function form of `*x` (canon `*x`). Preferences can be ranked (a `*` of a
`*` outranks a single `*`); the lowest rank wins when two preferred
values meet. A ranked preference meets its peers exactly as rank 1
does — the **rank-uniform meet** (ADR-004): `a:**1.5 & float` is `1.5`
just as `a:*1.5 & float` is, and `**2|integer` met by a bare `integer`
keeps its default.

Overriding a **scalar** default is judged in two steps.

**A bare preference is gated by kind**, not by family: a concrete peer
replaces the default only where it is the same kind of thing. A peer of
another kind is a conflict, and that includes the other numeric leaf —
`a:*2 & 3.0` and `a:*2.2 & 3` are both errors, as is `a:*1.5 &
integer`. A kind peer the default already satisfies leaves the
preference standing (`a:*1.5 & float` and `a:*1.5 & number` are both
`1.5`).

**A preference conjoined with a disjunction names an alternative**
(ADR-007): `(A|B) & *A` is `*A|B`, the same value the direct spelling
denotes, so the two ways of writing an enum-with-default agree.

```
a:("1.0"|"1.1") & *"1.0"   → canon {"a":*"1.0"|"1.1"};  generates "1.0"
a:("1.0"|"1.1") & *"2.0"   → canon {"a":"1.0"|"1.1"}    (names nothing)
```

A preference naming no alternative is dropped: it has nothing to
prefer, and the default-validity lint below is what reports that shape.

**A preference inside a disjunction is gated by admission**
(ADR-004): an override must be admitted by the disjunction itself —
by at least one alternative, or by the preferred value. A preferred
branch contributes exactly its own value to the admitted set, so
`*'auto' | 'literal' | 'data'` is a true **enum with a default**:
unset generates `"auto"`, `'literal'` and `'data'` override, and
anything else is the empty disjunction (`[aontu/|:empty]`). A wider
alternative admits a wider override (`*8080 | integer` accepts any
integer), and a constraint alternative is consulted rather than
bypassed (`*8080 | (integer & min(1024) & max(65535))` refuses `80`
and accepts `2048`; `*8080 | (integer & neq(80))` refuses `80`). A
deliberately open default states its openness: `*x | top` admits every
override. The gate covers scalar preferred values — the same boundary
as the kind gate below.

```
a:*8080|integer  a:9090  → {"a":9090}     (same leaf: an alternative admits it)
a:*8080|integer  a:1.5   → refused        (other leaf: [aontu/|:empty])
a:*8080|number   a:1.5   → {"a":1.5}      (the branch admits the family)
k:*'auto'|'literal'|'data'  k:'autoo' → refused   (no alternative admits it)
port:*8080|(integer&neq(80))  port:80 → refused   (the exclusion is consulted)
x:*8080|string   x:8080  → {"x":8080}     (the preferred value admits itself)
```

**This is a breaking change** (2026-08-26, ADR-004). Before it, a
same-kind concrete peer replaced the preferred value with the other
alternatives never consulted, so `k:*'auto'|'literal'|'data'` +
`k:'autoo'` answered `"autoo"` with exit 0 — the fail-open enum of the
2026-08 language review (use-cases/REVIEW.md finding A). A document
that leaned on the open override keeps its meaning by writing the open
branch explicitly: `*x | top`.

**A structural default is not gated.** The yardstick is the preferred
value's `superior()`, and a map or a list has none — it is `top` — so
*any* peer overrides a preferred map or list, including one of another
kind, and it REPLACES rather than merges:

```
a:*1      a:"s"    → refused        (scalar: the gate applies)
a:*{x:1}  a:"s"    → {"a":"s"}      (structural: no gate)
a:*{x:1}  a:{y:2}  → {"a":{"y":2}}  (replaced, not merged)
```

Write `a:{x:*1}` rather than `a:*{x:1}` when you mean "a map whose `x`
defaults to 1" — the preference belongs on the scalar that has a kind to
defend. Pinned by the `pref-struct-*` rows in
[`test/spec/pref.tsv`](../test/spec/pref.tsv).

## Optional keys `?`

A key suffixed with `?` is optional. If it never receives a concrete
value, it is **dropped from the generated output** instead of erroring.

```
{x?:number, y:Y}     → {"y":"Y"}            (x unresolved → dropped)
{x?:top, y:Y}        → {"y":"Y"}
a:{y?:number,z:2} a:{}      → {"a":{"z":2}}
a:{y?:number,z:2} a:{y:11}  → {"a":{"y":11,"z":2}}   (filled → kept)
a:{y?:number,z:*3} a:{y:11} → {"a":{"y":11,"z":3}}   (default still applies)
```

Optionality survives references: a referenced map drops its unresolved
optional keys too.

## Spreads `&:`

A `&:` entry is a **template** unified into every other entry of its map
or list. The template itself is not emitted.

```
c:{&:{x:2}, y:{k:3}, z:{k:4}}
  → {"c":{"y":{"k":3,"x":2}, "z":{"k":4,"x":2}}}

a:b:{&:string, c:C, d:D}        → applies a type to every value
a:b:{&:{x:number}, c:{x:1}, d:{x:2}}   → constrains every child
a:b:{&:{name:.$KEY}, c:{}, d:{}}       → {"c":{"name":"c"},"d":{"name":"d"}}
a:b:{&:$.tmpl, …}                      → spread a referenced template
a:b:{&:x:*1|number, c:{x:2}, d:{}}     → defaults per child, overridable
```

Other forms:

- **Implicit / cross-statement:** `a:b:{} a:&:{x:1}` →
  `{"a":{"b":{"x":1}}}`.
- **Top-level:** `a:{} &:{x:1}` → `{"a":{"x":1}}` (applied to every root
  key).
- **Lists:** `[&:{x:1}, {y:1}, {y:2}]` → `[{y:1,x:1},{y:2,x:1}]`;
  canon keeps the spread: `[&:{"x":1},{"y":1,"x":1},…]`.

**Several templates apply independently, per child.** When one bag
accumulates more than one `&:` template — consecutive spreads, spreads
from different statements, templates arriving by reference through a
conjunction or an id-merge — every child meets the combined constraint
of all of them, and only that: children never meet each other's data
through the templates, whatever mix of literal values, kinds,
references, defaults or `key()` the templates carry. A key one
template requires is required at every child; a default one template
carries defaults (and stays overridable) per child.

```
w: &: {p:integer}
w: &: {r:integer}
w: x: {p:1, r:5}
w: y: {p:2, r:6}      → {"w":{"x":{"p":1,"r":5},"y":{"p":2,"r":6}}}
```

## Generating children: `pack` and `each`

A spread constrains children that already exist. `pack` and `each`
**make** them, from data that is already in the model — so the list of
names and the children built from it cannot drift apart:

```
names: [web, auth, billing]

deploy: close(pack($.names, {
  image: "acme/" + key() + ":1.4.2"
  replicas: *2 | integer
  port: *8080 | integer
}))

deploy: billing: replicas: 4      # an override composes as usual
```

`pack(data, tmpl)` makes one **keyed child** per child of `data`. The
keys are **data, never position**: for a list, the strings themselves
(a non-string element is an error, `pack_key`); for a map, its keys.
Each generated child is `tmpl` cloned at that destination, so `key()`
and relative references inside the template answer for the child
rather than for the call. Duplicate keys are not an error — the
colliding children unify, exactly as duplicate source keys merge.

**Instantiation is per destination, to the leaves** (ADR-005). The
clone a destination receives is a *full instance*: nothing in it —
not a call's arguments, not a preference's inner value, not an
operator's operands — is shared with the template or with any sibling
destination, and every path inside it is the destination's. So
`close({name: key()})`, `**key(1) | string` and `.a + 1` inside a
template all answer per child, in expressions and call arguments as
much as in bare positions; the first child's resolution can never
answer for the others. The same rule instantiates a `filter`
condition per trial and a spread constraint (`&:`) per application.

`each(data, tmpl?)` makes one **list element** per child of `data`,
each of them that child met with `tmpl`. The order is fixed: source
order for a list, sorted-key order for a map. Written with one
argument, `each(m)` is a map's children as a list.

```
ports: {http: 80, https: 443}
open:  each($.ports, integer)      → {"open":[80,443]}
names: each({b:2, a:1})            → {"names":[1,2]}
```

Once fired, generated children are **ordinary children**: a
destination `&:` spread applies to them, `close()` seals the generated
shape, references reach into them, and a template may itself contain a
generator.

Both **wait for the model to settle** before they fire, and fire
exactly once. A generator's data can still be merged into by a sibling
statement, an include or a spread after it first looks complete, and
children generated from a half-merged bag would be missing. The data
argument's **snapshot waits for the source too**: a reference like
`pack($.ports, …)` copies its target only once the target has finished
resolving in the tree, so a source augmented by a spread — even one
injecting relative references (`ports: &: {port: .containerPort}`) —
reaches the generator with those references already answered at the
source. Until it fires, a generator canons as its own call —
`pack($.n,…)` with the data reference still standing — which reparses
to the same value.

Neither can recurse. Both iterate a finite bag that already exists, so
the number of children either can produce is fixed by the data:
evaluation still terminates by construction.

## Selecting: `filter` and `match`

`filter(data, cond)` keeps the children of `data` that **already
satisfy** `cond` — keys preserved for a map, order for a list — and
drops the rest silently:

```
services: {web:{debug:true,port:80}, auth:{port:81}}
debugged: filter($.services, {debug:true})   → {"web":{...}}
sidecars: pack($.debugged, {image:"acme/debug:1.0"})
```

"Already satisfies" means the meet **changes nothing**: `cond` adds no
information the child did not have. Mere unifiability would not do —
a map is open, so `{port:81}` unifies with `{debug:true}` by *gaining*
the key, and a filter that kept everything that could be made to match
would keep everything. The condition is an ordinary value, so the
constraint atoms compose with it: `filter($.deploy, {replicas:min(3)})`.

`match(v, p1, r1, …, d?)` is a **bounded conditional**. The first
pattern in argument order that `v` unifies with selects its result,
which is the answer; a trailing argument — the one that makes the
argument count even — is the default:

```
tier: large
size: match($.tier, small, {cpu:1}, large, {cpu:8}, {cpu:2})
  → {"size":{"cpu":8}}
```

Patterns are matched by unifiability, so kinds and atoms work as
patterns (`match(x, integer, …, string, …)`, `match(n, min(0), …)`).
There are no guards, no comparisons beyond the atoms, and no
fallthrough. **No match and no default is an error** naming the
patterns that were tried, not an empty answer — a default is how a
document says the rest was meant to be allowed. An unselected result
is never evaluated, so a broken arm nobody takes is not an error the
document has to carry.

**A defaulted scrutinee matches as the value it generates** (ADR-004).
A settled scrutinee that carries an effective default — a preference,
or a disjunction holding one — is tested as the innermost preferred
value, not as the still-open preference. So with
`side_effect: *readonly | write | destructive`, the derivation
`match(.side_effect, destructive, true, false)` answers `false` when
`side_effect` is unset (the effective value is `"readonly"`), and
`true` only when it is genuinely `destructive`. Before this rule a
pattern could *select* an arm by overriding the default, deriving a
value that contradicted the one generated beside it. A pref-free open
disjunction still matches by plain unifiability.

Both wait for the model to settle before they answer, for the reason
`pack` and `each` do: a bag that is still being merged into is the
wrong bag to take a subset of, and a scrutinee that is still being
narrowed can match an earlier arm than the one it will end up matching.

## The placeholder `_`

A bare `_` is a **hole**: a call holding one waits, and whatever the
call is unified with fills it.

```
greeting: upper(_) & hello         → {"greeting":"HELLO"}
x: {&: {m: _ + 2}}   x: a: m: 1    → {"x":{"a":{"m":3}}}
```

The peer goes **into** the call and is not also a constraint on the
way out: `upper(_) & hello` is `"HELLO"`, not `"HELLO" & "hello"`.
Two holes meeting is an error — neither has a value to fill the other.

Inside a generator's template, `_` is the **source child** the
generated one is being made from:

```
ports: {http: 80, https: 443}
open:  pack($.ports, {port: _, name: key()})
  → {"open":{"http":{"name":"http","port":80},
             "https":{"name":"https","port":443}}}
```

A hole belongs to its **nearest enclosing generator** (ADR-005): an
outer generator's fill pass never reaches into a nested generator's
template (or a `filter`'s condition), so in
`pack($.envs, {services: pack($.fleet, {v: _})})` the inner `_` is
the fleet entry, not the env. A hole in a generator's *data* argument
is not a binding position, so it is still the outer generator's to
fill: `pack($.m, {inner: each(_)})` iterates the outer source child.
And wrapping a generator in a call (`close(pack(d, _ & t))`) does not
expose the template's hole to the wrapper's peers — an overlay
statement merges with the generated children, never with the
template.

For a `pack` over a list of names, `_` and `key()` are the same thing
— the name is the key. Over a map they differ: `key()` is the key, `_`
is the value. In a `filter` condition, `_` is the child being tested.

A hole is not a function parameter: it cannot be named, passed, or
partially applied, and there is no way to write one that is not
already inside a call. Unfilled at generation it is an error, exactly
as `top` is.

**Compatibility.** A bare `_` used to be the string `"_"`. It is a
hole now — a breaking change, pinned by `test/spec/place.tsv`. Quoted
`"_"` is still that string, any longer bare word containing it (`_b`)
is still ordinary text, and `_` as a **key** is still a key.

## The pipe `|>`

`x |> f(a)` **is** `f(x, a)`: the value on the left goes in as the
first argument of the call on the right. The right-hand side may also
be the bare name of a builtin, which is the short spelling:

```
name:  hello |> upper                 → {"name":"HELLO"}
open:  $.names |> pack({replicas:2})  → one child per name
sizes: $.ports |> each |> each        → pipes chain
```

It is **sugar and nothing else** — resolved while the source is read,
so no value ever holds a pipe and canon never emits the token. Every
canon row in `test/spec/pipe.tsv` shows a call.

The pipe binds **loosest** of all the infix operators, so
`a & b |> f` pipes the whole meet: a pipe reads as "and then", which
is a statement about everything to its left.

Piping into something that is not a call is an error, and so is piping
into a **constraint atom that already has its arguments**: an atom with
a complete argument list is a residual rather than a call waiting for a
subject, and `1 |> neq(2,3)` is asking for `1 & neq(2,3)` — which is
what `&` is for.

## References and paths

A reference resolves to the value at another location, then unifies in
place.

| Syntax    | Meaning                                              | Example |
|-----------|------------------------------------------------------|---------|
| `$.a.b`   | absolute path from the document root                 | `a:1 b:$.a` → `b:1` |
| `.a.b`    | path relative to the current map                     | `z:x:{a:62} z:y:.x.a` → `y:62` |
| `$.a.1`   | list index — a segment is numeric **only** as a plain decimal integer | `a:[10,20,30] b:$.a.1` → `b:20` |
| `.$KEY`   | the key under which the current value is stored      | `a:{k:.$KEY}` → `{"a":{"k":"a"}}` |

**Numeric segments are plain decimal integers, and nothing else is.**
`$.a.1` indexes a list and reaches the key `1`. Every other numeric
spelling — hex, `0d`, `_` separators, an exponent — addresses the key
spelled **exactly that way**, because that is what the spelling already
produces on the key side: `a:{0x0:1}` generates `{"0x0":1}`, not
`{"0":1}`, so `$.a.0x0` finds it and `$.a.0` does not.

In a path the dot is always the **separator**, never a decimal point.
That is why `$.a.1.0` is the two segments `1` and `0` — how a nested list
index is written (`a:[[1,2],[3,4]] b:$.a.1.0` → `b:3`) — rather than a
key spelled `1.0`.

References compose with unification and each other:

```
cross:  a:{x:1,y:$.b.x} b:{x:2,y:$.a.x}  → a.y=2, b.y=1
chain:  a:{v:$.b.v} b:{v:$.c.v} c:{v:99} → all v = 99
merge:  w:b:$.q.a & {y:2,z:3}            → referenced map unified with extra keys
```

An unresolvable path is an error: `a:$.nope` →
`Cannot resolve value: $.nope`.

## Variables `$name`

`$name` (a bare name with no leading dot) is **not** resolved from the
document — it is supplied by the calling program (see
[API reference](reference-api.md#variables)). The shared test set binds
`foo=11`, `bar="hello"`, `flag=true`, `obj={x:1}`:

```
a:$foo               → {"a":11}
a:$bar               → {"a":"hello"}
a:$obj               → {"a":{"x":1}}
a:$foo & number      → {"a":11}            (variables unify like values)
```

An unknown variable is a `Cannot resolve` error.

## The `+` operator and grouping

`+` adds numbers and concatenates strings; it chains left-to-right.
Parentheses group sub-expressions and a leading unary `+` is allowed.

```
x:1+2        → {"x":3}
x:1+2+3      → {"x":6}
x:1.5+2      → {"x":3.5}
x:a+b        → {"x":"ab"}
x:a+b+c      → {"x":"abc"}
x:(1+2)      → {"x":3}
x:(+3+4)     → {"x":7}
a:b:c:10+5   → {"a":{"b":{"c":15}}}
```

**Result kind: the exact ladder.** `+` never introduces a kind
narrower than its operands, and it never demotes. The three exact
leaves form a ladder,

```
integer  <  biginteger  <  bigdecimal
```

and a sum of exact operands takes the **widest** leaf present and is
computed exactly. `float` is not on that ladder: it keeps its classic
contagion with `integer` alone.

```
x:1+2                 → integer 3      canon {"x":3}
x:1+2.0               → float 3        canon {"x":3.0}
x:1.5+1.5             → float 3        canon {"x":3.0}
x:1+0d2               → biginteger 3   canon {"x":0d3}
x:0d2+0d3             → biginteger 5   canon {"x":0d5}
x:1+0d0.5             → bigdecimal 1.5 canon {"x":0d1.5}
x:0d2+0d0.5           → bigdecimal 2.5 canon {"x":0d2.5}
x:(1+2) & integer     → {"x":3}
x:(1.5+1.5) & integer → error          (the sum is float kind)
x:(1+0d2) & integer   → error          (the sum is a biginteger)
```

The widest operand anywhere in a chain decides, whichever end it
arrives at: `x:1+2+0d3` → `0d6`. A `*`-preferred operand contributes
its preferred value's kind. Results never demote, so a biginteger sum
that would fit an `integer` stays a biginteger, and an integral
bigdecimal sum stays a bigdecimal — `x:(0d0.5+0d0.5)&0d1.0` is
`0d1.0`, while `& 0d1` is a conflict.

**Exact arithmetic is exact.** Adding bigdecimals aligns the scales
and adds; nothing is rounded and no precision context is consulted, so
the answers are the ones decimal arithmetic gives on paper:

```
x:0d0.1+0d0.2          → {"x":0d0.3}    (binary64: 0.30000000000000004)
x:0d0.1+0d0.2+0d0.3    → {"x":0d0.6}    (binary64: 0.6000000000000001)
x:0d1.23+0d4.567       → {"x":0d5.797}
```

A sum too wide to hold is refused, never approximated — see
[the exactness budget](#the-exactness-budget).

**Float and exact never mix.** An exact value never silently becomes a
binary float, in either operand order. There is no promotion for this
pair; it is a hard error.

```
x:1.0+0d2   → error   (a float and a biginteger cannot mix)
x:0d0.5+1.0 → error   (the same refusal, operands the other way round)
```

Parentheses only decide *where* the refusal happens: `x:(1+0d2)+1.0`
and `x:(1+2.0)+0d3` both fail.

**Integer sums are exact too.** `integer + integer` is computed
exactly, and the answer must then satisfy the same storage contract
its operands did — integral, inside the int64 window, *and* exactly
representable as a double. A sum that fails any of the three is a
located error naming the `0d` escape, rather than a rounded value:

```
x:4503599627370496+4503599627370496 → {"x":9007199254740992}   (2^53)
x:9007199254740992+2                → {"x":9007199254740994}
x:9007199254740992+1                → error: … not exactly representable
x:9007199254740992+0d1              → {"x":0d9007199254740993}  (the escape)
x:4611686018427387904+4611686018427387904 → error (2^63, past int64)
```

**String concatenation renders digits, not kinds.** A `+` with a
string operand concatenates, and the numeric side contributes its
plain digits with **no `0d` marker** — the marker is canon decoration,
and it never leaks into a string.

```
x:q+0d5     → {"x":"q5"}
x:q+0d0.1   → {"x":"q0.1"}
x:0d5+q     → {"x":"5q"}
```

The digits are the value's own rendering minus the marker, so an
integral bigdecimal keeps its one decimal place: `x:q+0d1e3` is
`"q1000.0"`, while the biginteger `x:q+0d1000` is `"q1000"`. The plain
family is unchanged and still coerces with JavaScript rules, which
drop a trailing `.0`: `x:a+1.0` → `"a1"`, not `"a1.0"`.

Unary `-` negates a numeric operand exactly. It binds tighter than
`+`, `&` and `|` — `-1 & integer` is `(-1) & integer` — and, like `+`,
never narrows the kind and never yields `-0`.

## Functions

Aontu provides a fixed set of thirty-seven built-in functions. There
are no user-defined functions. Nineteen are the general-purpose
functions tabulated below; six more are
[the arithmetic family](#arithmetic-add-sub-mul-div-mod-rem) and three
[the aggregates](#aggregating-sum-least-greatest); and the
other nine — `min(x)`, `max(x)`, `above(x)`, `below(x)`, `neq(x,...)`,
`re(p)`, `length(c)`, `unique()` and `must(c,msg)` — are the constraint
atoms, whose meaning is defined in
[The constraint algebra](#the-constraint-algebra-specified).

| Function    | Effect | Example |
|-------------|--------|---------|
| `upper(x)`  | uppercase a string; **ceiling** of a number, keeping the argument's kind | `upper(abc)`→`"ABC"`, `upper(2)`→ integer `2`, `upper(1.1)`→ float `2`, `upper(0d1.1)`→ bigdecimal `0d2.0` |
| `lower(x)`  | lowercase a string; **floor** of a number, keeping the argument's kind   | `lower(ABC)`→`"abc"`, `lower(2)`→ integer `2`, `lower(1.9)`→ float `1`, `lower(0d1.9)`→ bigdecimal `0d1.0` |
| `copy(x)`   | deep copy of a value or referenced node; clears `type`/`hide` marks | `copy({a:1,b:2})`→`{a:1,b:2}`; `copy($.x)` |
| `key(n)`    | the ancestor key `n` levels up (`0` = own key, default `1` = parent). `n` must be an **integer** (`integer` or `biginteger`); anything else is an error. A level beyond the top of the path yields `""`. | at `a:b:c`: `key()`→`"b"`, `key(0)`→`"c"`, `key(2)`→`"a"`, `key(2.0)`→error |
| `pref(x)`   | mark `x` as preferred (same as `*x`)          | `pref(1)` canon `*1`; `pref(2),x:3`→`3` |
| `super(x)`  | the lattice-superior (generalisation/type) of `x` — for a concrete scalar, its kind | `super(1)` → `integer`, `super(1.5)` → `float`, `super(integer)` → `number` |
| `type(x)`   | mark `x` as a type/schema value               | `type(1) & number`→`1` |
| `hide(x)`   | mark `x` as hidden                            | `hide(world) & string`→`"world"` |
| `close(x)`  | seal a map/list against extra keys            | see [closed values](#closed-values-close--open) |
| `open(x)`   | reverse a `close`                             | `open(close({x:1})) & {y:2}`→`{x:1,y:2}` |
| `move(p)`   | resolve reference `p`, dropping unresolved optional keys | `m:{x?:number,y:Y} n:move($.m)`→`n:{y:"Y"}` |
| `path(p)`   | resolve a path expression (function form of a reference) | `path(x.a)` (relative), `path($.z.x.a)` (absolute) |
| `id(name)`  | declare the enclosing value an **entity** called `name`; every node in the evaluation with that name is unified with every other. See [Identity](#identity-idname) | `services: auth: id(svc/auth) & {port:8080}` |
| `refer(t?)` | constrain a string field to be an **entity address** that resolves; `t`, if given, is unified into the target. The field keeps the address. See [Entity references](#entity-references-refert) | `dependsOn: [&: refer($.std.Service), svc/auth]` |
| `pack(d, t)` | one keyed child per child of `d`, each of them `t` cloned at that destination. Keys are the strings of a list, or the keys of a map. See [Generating children](#generating-children-pack-and-each) | `deploy: pack($.names, {replicas:*2\|integer})` |
| `each(d, t?)` | one list element per child of `d`, each met with `t`. Source order for a list, sorted-key order for a map | `open: each($.ports, integer)` |
| `filter(d, c)` | the children of `d` that ALREADY satisfy `c` — the meet with `c` changes nothing. Keys kept for a map, order for a list; the rest are dropped, not refused. See [Selecting](#selecting-filter-and-match) | `debugged: filter($.services, {debug:true})` |
| `match(v, p, r, …, d?)` | the result of the first pattern `v` unifies with; a trailing argument is the default. No match and no default is an error naming the patterns tried | `size: match($.tier, small, {cpu:1}, {cpu:2})` |
| `deprecate(x, m)` | mark `x` deprecated; unifies exactly as `x`, and the record `m` (`{msg?, use?, since?}`, all strings; `use` is a path spelled as a string) rides the result through meets, reference clones and spread applications. Canon renders the call back; generation is unchanged. The point-of-use surfaces: a vet `deprecated` warning, the LSP Deprecated tag, and `aontu breaking --allow-deprecated-removal` | `port: deprecate(*8080\|integer, {msg:"renamed", use:"$.listen", since:"2.0.0"})` |

`super(x)` lifts its **argument** one step up the lattice, so for a
concrete scalar it yields that scalar's kind — and because `number`
sits above the four numeric leaves, the numeric side of the ladder has
a real middle rung: a leaf lifts to `number`, and `number` to `top`:

```
x:super(1)       → integer      x:super(a)          → string
x:super(1.5)     → float        x:super(true)       → boolean
x:super(0d5)     → biginteger   x:super(integer)    → number
x:super(0d1.5)   → bigdecimal   x:super(number)     → top
```

Being a kind, the result then constrains: `x:super(1) & 2` → `2`, while
`x:super(1) & 2.5` is a conflict. Where the argument has no meaningful
superior — a map, a list, a non-numeric kind, `top` — the result is
`top`.

`upper()` and `lower()` round a number without narrowing it: the result
carries the *argument's* kind, so `upper(2)` is an integer `2` (and
unifies with `integer`) while `upper(1.1)` is a float `2` (and does
not). On the exact leaves they are exact ceiling and floor — no
binary arithmetic is involved, and the kind still survives:

```
x:upper(0d1.1)   → {"x":0d2.0}     x:upper(-0d1.5)  → {"x":-0d1.0}
x:lower(0d1.9)   → {"x":0d1.0}     x:lower(-0d1.5)  → {"x":-0d2.0}
x:upper(0d5)     → {"x":0d5}       (a biginteger is already integral)
x:upper(0d1.1) & bigdecimal → {"x":0d2.0}
x:upper(0d1.1) & biginteger → error   (rounding does not change the leaf)
```

A bigdecimal result is still a bigdecimal, so it keeps the one decimal
place its leaf always renders, even when the value is whole.

Functions compose with operators and references:
`upper(a)+b`→`"Ab"`, `lower(1.1)+2`→`3`, `x:foo y:upper($.x)`→`y:"FOO"`,
`[lower(A),lower(B)]`→`["a","b"]`, and a function may be a preferred
default: `*upper(foo)`→`"FOO"`.

## Arithmetic: `add` `sub` `mul` `div` `mod` `rem`

Maths beyond `+` is spelled with **functions**. The tokens `-` `*` `/`
`%` stay reserved for the language's own use, so there is no infix
arithmetic to learn beyond `+` and unary `-`:

```
replicas: mul($.base.replicas, 2)
spare:    sub($.quota.cpu, $.used.cpu)
shards:   div($.total, $.per_shard)
```

Each takes exactly **two operands**, and both must be numbers. That is
what distinguishes `add` from `+`: the operator is polymorphic and will
happily concatenate, so a Kubernetes quantity written `"500m" + "500m"`
is the string `"500m500m"` and nothing complains. `add("500m","500m")`
is an error, because a function named for a numeric operation has no
business inventing a string.

```
x:add(1,2)        → {"x":3}          x:add("a","b")  → error, invalid-arg
x:sub(10,3)       → {"x":7}          x:add(true,1)   → error, invalid-arg
x:mul(6,7)        → {"x":42}         x:sub(integer,1)→ error, invalid-arg
```

**Kind follows the operands** (R5, and the same
[exact ladder](#the-four-numeric-leaves) `+` uses): integer with
integer is an integer, anything with a float is a float, and a mixed
exact operation promotes to the widest leaf and never demotes.

```
x:mul(2,3)         → {"x":6}      integer
x:mul(2,1.5)       → {"x":3.0}    float — never narrowed to integer 3
x:add(1,0d2)       → {"x":0d3}    biginteger, the wider operand
x:mul(2,0d1.5)     → {"x":0d3.0}  bigdecimal
x:add(1.0,0d2)     → error, exact_float_mix — as with `+`
```

**Integer division truncates toward zero**, and `rem` and `mod` differ
only in whose sign the answer follows — `rem`'s the dividend's, `mod`'s
the divisor's. That is the whole reason both exist:

```
x:div(7,2)   → {"x":3}     x:div(-7,2)  → {"x":-3}   (not -4)
x:rem(-7,2)  → {"x":-1}    x:mod(-7,2)  → {"x":1}
x:rem(7,-2)  → {"x":1}     x:mod(7,-2)  → {"x":-1}
```

Three things are refused rather than answered, each because the answer
would be a value Aontu cannot carry:

- **A zero divisor**, in every leaf including floats. A JSON superset
  has no notation for an infinity, so there is nothing `div(7,0)` could
  return (`divide_by_zero`).
- **A non-finite float result**: `mul(1.0e200,1.0e200)` overflows
  binary64 (`float_overflow`). The same check now governs `+`, where
  the sum used to escape as an internal error.
- **`div`, `mod` or `rem` over a bigdecimal.** One third has no finite
  decimal form, so exact decimal division either rounds — the one thing
  that leaf exists to prevent — or refuses (`inexact_divide`). Scale to
  integers first, which is how money should be carried anyway (minor
  units as an integer), or use floats if an approximation is acceptable.
  Note `0d10` is a *biginteger*, not a decimal, so `div(0d10,0d4)` is
  `0d2`; it is `0d10.0` that is refused.

An exact result that will not store is refused too, exactly as a sum is
(`inexact_integer_sum`): `mul(4503599627370496,4503599627370496)` is an
error rather than a rounded answer, and `0d` operands compute it
exactly.

The [pipe](#the-pipe-) reads well with them, and the operand order is
the written one: `x:10 |> sub(3)` is `sub(10,3)`, which is `7`.

## Aggregating: `sum` `least` `greatest`

`length()` counts a bag; these three fold one. Each takes a **single
bag** — a list or a map — and walks the children the model already
holds:

```
lines:  [1200, 450, 3000]
total:  sum($.lines)          → 4650
lowest: least($.lines)        → 450
peak:   greatest($.lines)     → 3000

hourly: {p50: 12, p95: 40, p99: 91}
spike:  greatest($.hourly)    → 91
```

A map is folded in **sorted-key order** and a list in source order,
which is `each`'s rule; for these three it changes nothing, since every
operation is commutative, but it is stated so that it cannot drift.

They are named `least` and `greatest` rather than `min` and `max`
because those two are already the constraint atoms for a lower and an
upper *bound*: `min(3)` means "at least 3", which is a statement about
a value, while `least($.xs)` picks an element out of a set. Two
different things do not share a spelling.

**`sum` folds with `add`**, so the whole [number tower](#arithmetic-add-sub-mul-div-mod-rem)
comes with it: a bag of integers sums to an integer, one float among
them makes the total a float, `0d` members keep it exact, and a total
that will not store is refused rather than rounded.

```
x:sum([1,2,3])         → {"x":6}       integer
x:sum([1,2.5])         → {"x":3.5}     float, by contagion
x:sum([0d1.5,0d2.5])   → {"x":0d4.0}   exact
x:sum([])              → {"x":0}
```

**`sum([])` is `0`, and `least([])` is an error.** Addition has an
identity, so the empty sum has an answer; comparison has none, and
answering with a zero or an infinity would be inventing a value the
data does not contain (`aggregate_empty`).

`least` and `greatest` return **one of the elements**, so the answer
keeps that element's own kind, and they compare with the tower's exact
comparator rather than through binary64 — `0d9007199254740993` and
`9007199254740992` share a float image but are correctly ordered here.

A value that is not a bag is `aggregate_data`; a member that is not a
number is `invalid-arg`, reported against the aggregate the author
wrote rather than against the `add` inside it.

There is no `fold` combinator and will not be one: a fold takes a
function, and this language has no user functions to give it. These
three are total because the bag is finite, the operation is fixed, and
each child is visited once — the same argument that makes `each` safe.

## Identity: `id(name)`

A document is a tree, and its only names are tree paths. `id(name)`
adds a second, **location-independent** name: it declares that the
value it is written on IS the entity called `name`.

```aon
services: auth: id(svc/auth) & {
  kind: service
  port: 8080
}
```

**Every node in one evaluation carrying the same id is unified with
every other.** Declaring two nodes the same entity *means* unifying
them, so the two descriptions meet and any contradiction between them
is an ordinary located error:

```aon
# catalog.aon
catalog: payments: id(svc/payments) & { owner: "team-pay", tier: 1 }

# deploy.aon
deploy: eu1: payments: id(svc/payments) & { replicas: 3, tier: 2 }
```

Without the ids these two files evaluate together in silence —
unification is path-aligned, so `tier:1` and `tier:2` are never
brought into contact and a consumer of `catalog.payments.tier` reads
a "fact" the deploy layout contradicts. With them, the run fails at
the two `tier` sites. Identity links that cannot fail are how
`owl:sameAs` produced silent corruption at web scale; unification
inverts that.

**The tree stays a tree.** After merging, *every* declared position
holds the merged value, and generation emits it at each path —
duplication, exactly as references generate today. Nothing is aliased
or shared, and the output shape is unchanged:

```
a: id(x) & {k:1}
b: id(x) & {j:2}
                    →  {"a":{"j":2,"k":1},"b":{"j":2,"k":1}}
```

A node with an `id()` is an independent entity; a node without one is
a component of its nearest identified ancestor, addressable only
relative to it.

### Names

A name is one or more letters, digits, `_`, `-` or `/`, and **no
dots** — a dot separates an entity name from a path inside that entity,
so a dotted name would be ambiguous. `/` parses as bare text and may be
written unquoted; `-` is not a bare-text character, so a name
containing one must be quoted:

```
id(svc/auth)     id(a_1)     id("team-pay")     id("svc.auth") → error
```

Anything that is not a string — a number, a boolean, a map — is not a
name (`id_name`). Two *different* names on one node is a contradiction,
not a merge: one node cannot be two entities (`id_conflict`).

### Canon and the hash

Canon renders the identity back as the conjunct you wrote, so canon
reparses to the same entity and re-reading is idempotent:

```
a: id(x) & {k:1}   →  canon  {"a":id("x")&{"k":1}}
```

This deliberately differs from the `type`/`hide` marks, which canon
drops: identity is semantic content, not presentation, and the
[canon-hash](#canonical-form) must see it — two documents that
disagree about which entity a node is do not mean the same thing.

### What does not carry identity

Three rules keep identity from leaking into values that merely look
like an entity:

1. **A reference's clone does not carry the id.** `b: $.a & {j:2}`
   constrains `b`, and does not push `j:2` back into `a`.
2. **`copy()` clears the id**, as it clears the marks — a copy of an
   entity is a second value shaped like it.
3. **A spread template may not stamp a constant id on every child.**
   `{&: id(svc/thing), a:{}, b:{}}` would declare every child to be one
   entity; it is refused (`id_spread`). To name each child, use a
   path-dependent argument — in a map template applied at the child
   position that is `key(0)`, the child's own key:

   ```aon
   services: {
     &: id(key(0))
     auth:    { port: 8080 }
     billing: { port: 8081 }
   }
   ```

   Plain `key()` reads one level *up*, so in a template it names the
   bag and every child collides on that one name. That is a defined
   result rather than a refusal: rule 3 is a syntactic guard on
   constants, and no parse-time check can know what a computed name
   will resolve to.

Because every position holds the one merged value, a mark on one
declaration reaches all of them: `a: hide(id(x) & {k:1})` hides the
entity, not just that declaration of it.

Identity is scoped to **one evaluated document-set**. There is no
cross-evaluation registry, and ids do not embed versions.

## Entity references: `refer(t?)`

An [identity](#identity-idname) gives a node a name; `refer` is how one
part of a document *points at* another by that name and has the
language check it.

```aon
services: {
  auth: id(svc/auth) & { kind: service, port: 8080 }
  billing: id(svc/billing) & {
    dependsOn: [&: refer({kind: service}), svc/auth]
  }
}
```

The list spread applies `refer` to every element, so `dependsOn`
generates `["svc/auth"]` — a list of **names**, checked. Neither of the
two things you could write before does that: a bare string checks
nothing, and `dependsOn: [$.services.auth]` embeds a full copy of the
auth node, because a reference resolves by cloning its target.

`refer(t)` says three things about the string it constrains:

1. It must be an **entity address**.
2. The address must **resolve** in this evaluation.
3. If `t` is given, `t` is unified **into** the target.

### Addresses

An address is an entity name, optionally followed by a dot-separated
path *inside* that entity:

```
svc/auth              the entity
svc/auth.ports.http   a node inside it
```

The two addressing schemes divide cleanly: `$.a.b` answers *where* — a
tree location — and an address answers *what*. Beneath entity
granularity the tree is authoritative again. The no-dots rule on ids is
what makes the split unambiguous. Only a string can be an address, and
a malformed one is refused at once (`refer_address`): no later pass can
repair it.

### Existence is decided, not deferred

A `refer` **residuates**: a target may be declared by a later conjunct,
include or spread, so the constraint retries each pass exactly as a
forward reference does. But within one evaluation the document-set is
fixed, so existence *is* decidable — an address that still names
nothing at the last pass is a located error (`refer_unresolved`), not
something to check later.

### Constraints flow through links

`refer(t)` does not merely *test* the target against `t`; it unifies
`t` into it, and into every position of that entity:

```
a: id(x) & {p:1}
c: id(x) & {q:2}
b: refer({r:3}) & "x"
                        →  a and c both {p:1, q:2, r:3}, b is "x"
```

Referring to something as a `Service` makes it one — and if it cannot
be, the conflict is an ordinary located error. Check-only semantics
would be non-monotone (true, then false as the target grows), and the
lattice guarantee is that more information never falsifies what has
already been observed.

Constraints written *alongside* a refer constrain the **link**, not the
target: `refer() & string & re("^svc/") & "svc/auth"` checks the
address itself. They are held until the address arrives, and then meet
it.

### The `std/system` vocabulary

Ports, components and relations need no syntax — they are schemas, and
one set of them ships with the engine:

```aon
@"std/system"

services: {
  auth: id(svc/auth) & $.std.Service & {
    ports: { http: { protocol: http } }
  }
  billing: id(svc/billing) & $.std.Service & {
    dependsOn: [&: refer(), svc/auth]
  }
}
relations: {
  dependsOn: $.std.Relation & {
    target: $.std.Service, inverse: dependedOnBy, acyclic: true
  }
}
```

| Schema | Says |
|--------|------|
| `$.std.Port` | one end of a connection: `direction` (default `in`) and an optional `protocol` |
| `$.std.Component` | a node with `ports`, each of which is a `Port` |
| `$.std.Service` | a Component whose `kind` is `service` |
| `$.std.Relation` | a declared relation: what its `target` must satisfy, the `inverse` that mirrors it, and whether it is `acyclic` |

`@"std/system"` is **bundled with the engine** — no filesystem, no
package resolution — so it resolves under every include capability
except `'none'`, which denies every include by definition. It is
**experimental** until the vocabulary can be versioned by canon-hash.

Two things about it are worth knowing, because they are the language
rather than the vocabulary:

- **A preferred member is one enum member, with the default role.**
  `direction: *in | out | inout` is a true enum-with-default under the
  admission gate (ADR-004): unset generates `in`, `out` and `inout`
  override, and any other value is refused (`[aontu/|:empty]`). It
  used to be otherwise — the preference held the disjunction open and
  any other string was admitted — which is exactly the fail-open
  default the 2026-08 language review retired. A vocabulary that wants
  an open field says so with a `| top` (or `| string`) branch.
- **`Service` is written out rather than as `$.std.Component & {kind:
  service}`.** A reference from one member of an included file to
  another does not survive the include, so each schema states itself;
  `$.std.Component & $.std.Service` still meets exactly as you would
  expect.

Everything here is ordinary unification, so an author who wants a
different vocabulary writes one the same way — and nothing in the
language knows these names.

### Declared relations

`$.std.Relation` says what a relation IS, and two of its fields are
checked over the whole finished model rather than by unification:

```aon
@"std/system"

relations: {
  dependsOn: $.std.Relation & { inverse: usedBy, acyclic: true }
}

a: id(a) & { dependsOn: [&: refer(), b] }
b: id(b) & { usedBy:    [&: refer(), a] }
```

- **`acyclic: true`** — the edges under that relation must have no
  cycle. The report names the entities the cycle runs through.
- **`inverse: <name>`** — for each `a --dependsOn--> b`, `b` must carry
  `a` under `<name>`. The report names the exact missing entry.
- **`target: <schema>`** — every far end must satisfy `<schema>`. This
  is the declared form of what [`refer(t)`](#entity-references-refert)
  does at each site, so the relation says once what every link would
  otherwise repeat. Satisfaction is the meet, and **not merely the
  absence of a conflict**: a target key the far end does not have
  unifies happily and leaves a hole, so the check asks what `refer(t)`
  answers at the site — can the far end still generate once the target
  is met? — and compares it with the far end alone, so a node already
  incomplete for its own reasons is not blamed on the relation pointing
  at it. The check never writes; flowing the type in here would be
  generation.

The `$.std.Relation` conjunct **documents** the declaration; it is not
what makes it one. The checking pass reads every map under `relations`
and takes its `acyclic` and `inverse` fields directly, so a bare
`dependsOn: { inverse: usedBy, acyclic: true }` declares the same
relation with no `@"std/system"` — which is what keeps the checks
available under the `'none'` include capability.

`aontu relations <file>` runs them, and the library exposes
`relationCheck(src)`. The closure question — does `a` reach `b` at any
remove? — is a separate verb, [`aontu reaches`](reference-api.md#aontu-reaches),
for the same reason and with the same answer about monotonicity. **Neither is a lattice constraint, deliberately.**
Both properties are global and non-monotone: an acyclic graph becomes
cyclic when one more edge unifies in, and an inverse that is present
becomes absent when the far side is narrowed. The lattice guarantee is
that more information never falsifies what has already been observed,
so a constraint that could be true and then false is not one the
lattice may hold. These are facts about a finished model, and a verb
that reports facts about a finished model is where they belong.

Relations are read from the `relations` key of the document root —
the vocabulary's convention, not the engine's. Nothing in the language
knows the name; the checking pass does.

Writing the inverse **for** you is generation, not validation, and is
not done here.

## Marks: `type` and `hide`

Marks are boolean flags carried on a value (set by `type()` / `hide()`,
or propagated by conjunction):

- A **type**-marked value is schema/metadata.
- A **hide**-marked value is intentionally excluded from output.

In both cases, **a map field whose value is type- or hide-marked is
omitted when the enclosing map is generated**, while still participating
in unification. A bare marked value at the top level still generates
(`type(1) & number`→`1`). `copy()` clears both marks, making the result
emittable again (`x:type({}) x:y:1 a:copy($.x)`→`{"a":{"y":1}}`).

**A mark belongs to the field its wrapper was written at** (ADR-005).
A reference to a `type()`/`hide()`-marked value copies the value with
the marks cleared — and that holds however the wrapper resolves:
a reference that lands on a still-unresolved `type()`/`hide()` call
waits for it to resolve at its *own* field rather than copying the
call, so the marks can never be re-stamped at the referring site. In
particular `m: hide(pack(...))` hides the field `m` exactly as
`hide({literal map})` does — the generated children stay usable
downstream (`out: pack($.m, {got:_})` emits their values) — and a
`type()`-marked alias referenced inside another `type()` body
constrains the referring field without suppressing its emission.

## Closed values: `close` / `open`

A **closed** map or list rejects any key/element not already present.

```
close({x:1})              → {"x":1}
close({x:1}) & {x:1}      → {"x":1}
close({x:1}) & {x:number} → {"x":1}        (narrowing existing keys is fine)
close({x:1}) & {y:2}      → error: closed   (adding a key is not)
close([1,2]) & [3,4,5]    → error: closed   (extending a list is not)
close(42)                 → 42              (scalars: close is a no-op)
close($.x)                → closes a referenced node
open(close({x:1})) & {y:2} → {"x":1,"y":2}  (open lifts the seal)
```

## Source loading `@"…"`

`@"path"` loads and parses another source file, then unifies the result
in place — so external files merge like any other value.

Source files use the `.aon` extension (preferred) or `.aontu`. When the
path has no extension, those two are tried in turn, so `@"foo"` resolves
`foo.aon` then `foo.aontu`.

```
@"foo.aon"                       → {"f":11}            (top level)
a:@"foo.aon"                     → {"a":{"f":11}}      (nested)
car:@"car.aon" car:{wheels:4}    → merges loaded + local
@"foo"                           → {"f":11}            (implicit .aon/.aontu)
```

A **relative** path resolves against a configurable base directory: the
`aontu` CLI sets it to the entry file's directory, and the Go API exposes
it via `NewWithBase` (the TypeScript API via the `path` option). A
relative load *inside* a loaded file resolves against **that file's own
directory**, so a chain of files (a → b → c) each resolves relative to
itself. Absolute paths ignore the base. Resolution tries, in order, an
in-memory resolver,
the filesystem, then package resolution (see
[API reference](reference-api.md#aontuoptions)). A conflict between a loaded
value and a local one is a normal unification
error.

### Modules

An import whose path is **domain-shaped and carries a major version**
is a MODULE import rather than a file path:

```
service: @"corp.example/schemas/service@1"
frozen:  @"corp.example/schemas/service@1#aon1-4vJemVYtWFR2mQeN…"
local:   @"./fragment.aon"        # unchanged — not a module
```

The routing is by shape alone: the first segment must contain a dot and
the path must end in `@<integer>`. Anything else falls through the
resolver chain exactly as before, so no existing include can be routed
somewhere new.

**Evaluation never touches the network.** A module resolves from local
stores only — `aon_vendor/` beside the project's `mod.aon`, then a
content-addressed user cache — and the cache is consulted only when the
expected hash is known, because that hash is its key. A module in
neither store is an error that names the step that fixes it:

```
module not fetched: corp.example/schemas/service@1 (run: aontu mod get)
```

The user cache is `$XDG_CACHE_HOME/aontu/mod` where that is set — an
explicit override wins on every platform — and otherwise the platform's
own cache location: `%LOCALAPPDATA%\aontu\mod` on Windows,
`~/.cache/aontu/mod` elsewhere. A host that offers none of those has no
user cache, and a module then resolves from `aon_vendor/` alone.

**The module file and the lockfile are ordinary Aontu.** `mod.aon`
declares the module's own path and entry file; the entry defaults to
`main.aon`:

```
mod: { path: "corp.example/schemas/service", main: "service.aon" }
```

`mod-lock.aon` is machine-written in **canonical form** — one line,
sorted keys, diffable, and (its leaves being scalars) valid JSON:

```
{"lock":{"corp.example/schemas/service@1":{"canon":"aon1-4vJe…","oci":"sha256:6b86…","v":"1.4.2"}}}
```

Each entry carries two pins with distinct roles: `oci` certifies *these
are the bytes the registry served*; `canon` certifies *this is the
meaning that was reviewed*. Only the second can be checked without the
registry, and it is the one evaluation checks — by unifying the module
**standalone** and comparing its [canon-hash](#canonical-form):

```
module integrity: corp.example/schemas/service@1 expected aon1-4vJe… got aon1-9kQz…
```

The pin survives comments, whitespace, formatting and refactoring; it
breaks on any semantic change in the module's transitive closure. An
inline `#aon1-…` fragment is the same check without a lockfile — the
degenerate mode for single-file and agent-sandbox use.

Under a **root** trust capability (`docs/trust.md`) the user cache is
not consulted at all: a confined evaluation sees the project's own
`aon_vendor/` and nothing else, which is what confinement means.

**The lockfile is maintained by tooling, not by hand.** `mod.aon`
declares what the project wants, under a `dep` map keyed by module
path:

```
mod: { path: "corp.example/app", main: "main.aon" }
dep: { "corp.example/schemas/service@1": { v: "1.4.2" } }
```

`aontu mod tidy` walks the closure — each module's own `mod.aon`
contributes its declarations — and resolves it by **minimum version
selection**: every module is taken at the highest of the minima anyone
asked for, and never higher. Resolving upgrades nothing, so the answer
is reproducible and adding one dependency cannot move another. It then
recomputes each `canon` pin from the module in the store and rewrites
`mod-lock.aon`; if any module is not in a store, or is in one but does
not evaluate on its own, the lockfile is left alone — a partial lock
claims a closure that was never resolved, and a pin computed from a
module that has no meaning is the same string for every broken module.

`aontu mod verify` asks the opposite question and **changes nothing**:
does every locked module still *mean* what the lockfile pins? It is
the CI gate, because `tidy` cannot be one — rewriting the lockfile is
tidy's job, so a job that tidies before evaluating simply makes the
lock agree with whatever the store now holds. A store that has drifted
is reported with both hashes; a project the lockfile does not cover is
refused rather than verified over nothing.

`aontu mod vendor` copies the locked closure into `aon_vendor/` as
whole source trees, which is what makes a project evaluable with no
cache and no network at all. It can only find what the lockfile pins —
the cache is keyed by canon-hash — so `tidy` comes first.

A module that publishes itself declares a version too, and the **major
an import spells lives inside it**: `version: "1.4.2"` publishes as
`@1`. `aontu mod manifest` prints the OCI artifact a publish would push
— the config media type, the source tree that is the layer, and the
annotations carrying path, version and canon-hash — and `--against` a
prior version's tree runs the
[breaking](reference-api.md#aontu-breaking) check between them. A
change that is breaking under an unchanged major refuses; a major bump
is where breaking is allowed, because a consumer of `@1` never sees
`@2` unless it asks.

That annotation is what makes "has the truth changed?" cheap: it is the
same canon-hash the lockfile pins, so a consumer compares one string
rather than downloading and parsing a module.

All of this is local. Fetching and publishing are the network half of
the design and are not in this build; see
[API reference](reference-api.md#aontu-mod).

## Operator precedence

From tightest to loosest binding (higher binding power binds first):

| Operator            | Form        | Notes |
|---------------------|-------------|-------|
| `$` (variable/abs)  | prefix      | tightest |
| `.` (path)          | prefix/infix |       |
| `*` (preference)    | prefix      |       |
| `-` / `+` (unary)   | prefix      | `-1 & integer` ≡ `(-1) & integer` |
| `+` (add/concat)    | infix       |       |
| `&` (conjunction)   | infix       | binds tighter than `\|` |
| `\|` (disjunction)  | infix       |       |
| `\|>` (pipe)        | infix       | loosest; sugar, never in canon |

So `c & b | a` ≡ `(c & b) | a`, `*1 | number` ≡ `(*1) | number`, and
`a & b |> f` ≡ `f(a & b)`.
Parentheses override precedence and also serve as function-call syntax.

## Canonical form

`unify(src).canon` (TS) / `Unify(src).Canon()` (Go) renders a unified
value as **reparseable source text**. Unlike generation it preserves
constraints, defaults, and open disjunctions. Rules:

- Maps render as `{"k":v,…}` with **quoted keys**, no spaces:
  `{"a":{"b":1,"c":2}}`. Lists as `[v,…]`.
- Strings are quoted (`"hello"`); numbers, booleans and `null` render
  literally; `top` renders as `top`.
- **Numbers render so that canon reparses to the same kind.** An
  integer-kind value renders plainly (`1000`). A float-kind value
  always carries a fraction or an exponent, so a `.0` suffix is
  appended when the shortest rendering has neither:

  ```
  1.0    → 1.0        1e21     → 1e+21        (already exponential)
  0.0    → 0.0        0.000001 → 0.000001     (already fractional)
  1e20   → 100000000000000000000.0
  ```

  This applies to **canon only**. String concatenation is unaffected:
  `a+1.0` is still `"a1"`.
- **Exact values carry the `0d` marker**, with any sign in front of
  it, in plain form at every magnitude — never scientific. An integral
  bigdecimal keeps one decimal place, which is what distinguishes it
  from the biginteger of the same value:

  ```
  0d5    → 0d5          0d1000  → 0d1000       (biginteger)
  -0d5   → -0d5         0d1e3   → 0d1000.0     (bigdecimal)
  0d0.10 → 0d0.1        0d1e-1  → 0d0.1        (one value, one rendering)
  ```

  Here too the marker is canon decoration only: `q+0d5` is `"q5"`.
- Negative zero never appears: it normalises to `0` (integer), `0.0`
  (float), `0d0` (biginteger) or `0d0.0` (bigdecimal), in canon and in
  generated output alike.
- Kinds render lowercase: `number`, `integer`, `float`, `biginteger`,
  `bigdecimal`, `string`, `boolean`.
- Conjunction: `a&b` (e.g. `number&"A"`). Disjunction: `a|b`
  (e.g. `1|2`, `string|number`). Preference: `*x` (e.g. `*1|number`).
- Spreads keep the `&:` entry: `{&:{"x":2},"y":{…}}`.

## Generation

`generate` / `Generate` produces a native value (JSON-compatible) and
requires the model to be **fully concrete**:

- Disjunctions must be resolved to a single branch; a `*`-preferred
  branch is generated as that value.
- Unresolved **optional** keys are dropped.
- **type/hide**-marked map fields are omitted.
- An unresolved **type**, an unresolved **conjunction**, a **nil**, or
  `top` cannot be generated and raises an error.

**Exact values generate exactly.** The `0d` marker is source syntax
and does not survive into output; the digits do, all of them. A JSON
number is arbitrary-precision text, so nothing is lost on the way out:

```
x:0d9007199254740993   → {"x": 9007199254740993}
x:0d0.1+0d0.2          → {"x": 0.3}
a:0d1000 b:0d1e3       → {"a": 1000, "b": 1000.0}
```

The last line is the leaf distinction reaching the output: a
biginteger emits `1000`, and the integral bigdecimal beside it emits
`1000.0`, because that trailing place is part of a bigdecimal's own
digits. The plain family behaves the other way — an integral float
loses its point, so `b:2.0` generates `2`.

The native values follow: `bigint` and `Decimal` in TypeScript,
`*big.Int` and `*aontu.Decimal` in Go, each carrying the exact value.
TypeScript's `JSON.stringify` cannot serialise a `bigint`, so the
library exports its own exact emitter (`exactJSON`) — the one the
`aontu` command uses.

Object key order is not significant in generated output, and within
the plain family neither is numeric kind. Between the exact leaves it
*is* significant, as the `1000` / `1000.0` pair shows, which is why the
shared suite pins those cases byte for byte rather than structurally.

## Subsumption

`A ⊒ B` ("A subsumes B") holds when **every instance the specific
value B admits, the general value A admits too**. It is the lattice's
own order, asked as a first-class query: `subsume(general, specific)`
in both engines ([G3](capability-review/g3-subsumption-evolution.md)),
running after evaluation on finished trees, never mutating them. The
verdict is three-valued plus `error` — `subsumes`, `does_not_subsume`
(with the failing path and both sides' canons as the witness),
`undecided` (always with a `sub_*` reason code, never silently), and
`error` for a source that does not stand up on its own. Findings reuse
the validation verb's report object with class `compat`; every code is
registered in `test/spec/errcodes.tsv`, and the whole behaviour is
pinned by `test/spec/subsume.tsv` in both engines.

**Soundness before completeness.** Where a rule cannot decide, the
answer folds toward `does_not_subsume` or `undecided`, never toward
"compatible": a gate that wrongly reports "breaking" costs a second
look, one that wrongly reports "compatible" ships the break.

### Profiles

| Profile | Compares |
|---------|----------|
| `values` | admitted value sets only |
| `defaults` (the default) | value sets, plus every effective default the specific side declares must survive into the general side unchanged |
| `gen` | `defaults`, plus the `type`/`hide` marks on corresponding nodes (they change the output shape) |

An **effective default** is a preference's own value, or, in a
disjunction holding several preferences, the value of the
lowest-ranked one (generation picks the lowest rank: `a:**1|*2`
generates `2`). Equal-rank preferences that disagree make the
effective default indeterminate (`sub_default_indeterminate`,
undecided). Adding a default where none existed is compatible;
changing or removing one is `compat_default_changed` — previously
generable documents materialise differently or become incomplete.

### Rules, by value former

| A (general) | B (specific) | A ⊒ B |
|-------------|--------------|-------|
| `top` | anything | yes |
| preference `*x` | — | compares as what it admits (its superior type); its default value is the profiles' business, not the value set's |
| unresolved residue (reference, variable, unreduced conjunct or function) on either side | — | `undecided` (`sub_unresolved`): there is no admitted set to compare |
| anything | disjunction | every specific alternative must be admitted by A; a concrete failing alternative is a witness (`compat_narrowed`), a non-concrete one is `undecided` (`sub_disjunct_distribution`) |
| disjunction | non-disjunction | some general alternative must admit B member-wise; failure with concrete B is a witness, otherwise `undecided` (`sub_disjunct_distribution`) — member-wise failure is not proof, the distribution case |
| scalar kind | scalar kind or scalar | the general kind admits the specific kind (`number ⊒ integer`) or the scalar's kind; distinct leaves are disjoint |
| scalar kind | constraint residual | the kind covers the residual's domain: `number` admits any numeric residual, a numeric leaf kind admits a residual pinned to that leaf, `string` admits any pattern residual |
| constraint residual | constraint residual | per the constraint algebra's own [subsumption table](#subsumption-1); a `must` on the general side is `undecided` (`sub_evaluate_only`) |
| constraint residual | scalar | membership, with `must` again `undecided`; `unique()` and `length` demands admit no scalar |
| concrete scalar | concrete scalar | identity — a concrete value subsumes only itself (kind included) |
| map | map | see below; anything else is `compat_narrowed` |
| list | list | element-wise by position, with the same required/optional shape as maps |

There is no nil rule: an error-free evaluated document carries no nil
(failing disjunct members are discarded and every other nil collects
an error), and a source that does not stand alone answers `error`
before the walk begins.

### Maps, lists, closedness, optionality, spreads

- Every **required** key of the general side must be present and
  required in the specific side, and subsume; a missing or
  optional-ised key is `compat_required_added` (instances without it
  are admitted by the specific side but refused by the general).
- An **optional** key (`k?:`) of the general side compares only when
  the specific side has it; the specific side making a general
  optional key required merely narrows, which is compatible.
- A **closed** general bag (`close(…)`) requires the specific side to
  be closed and inside its declared key set; an open specific side, or
  a surplus key, is `compat_narrowed`.
- A **spread** template (`&:`) on the general side governs the
  specific side's surplus keys and its template (a missing specific
  template compares as `top`, so a general-only template does not
  subsume an open specific bag). A specific-only template narrows the
  specific side and refuses nothing. A **path-dependent** template
  (one whose meaning depends on where it lands — `key()`, a
  reference) cannot be compared structurally:
  `sub_path_dependent_spread`, undecided.
- Under the `gen` profile, `type`/`hide` marks must agree on
  corresponding nodes (`compat_marks_changed`).

The `at` option anchors both documents at one path before comparing
(the validation verb's `--at`); a path missing from either side is an
`error` verdict.

### Default validity

The relation also powers an advisory lint: the validation verb reports
a `pref_not_instance` finding (severity `warning`, class `compat`)
when a disjunction's effective default is not an instance of any
**remaining** alternative. Under the admission gate (ADR-004) this is
no longer a soundness hole — the preferred branch contributes its own
value to the admitted set, so `level: *wran | info | warn | debug` is
a well-defined enum `{wran, info, warn, debug}` defaulting to `wran` —
but that spelling is also exactly the shape of a *typo'd* default
(`*warn` was probably meant), which nothing at meet time can
distinguish. The warning flags the boundary: a default drawn from the
written alternatives (`*8080 | integer`) is silent, a default that
widens them is worth a look. Repeating the branch
(`*warn | warn | error`) states "the default is a first-class member",
silences the lint, and enforces the same admitted set.

Failures surface as messages (thrown as `AontuError` in TS, returned as
`error` in Go):

| Situation              | Message (contains) |
|------------------------|--------------------|
| scalar conflict        | `Cannot unify value: 2 with value: 1` |
| kind conflict          | `Cannot unify value: string with value: 1` |
| cross-leaf conflict    | `different kinds cannot unify` (`1 & 1.0`, `5 & 0d5`) |
| nested conflict        | reports the clashing leaf values |
| unresolved reference   | `Cannot resolve value: $.nope` |
| unknown variable       | `Cannot resolve …` |
| extra key on closed    | `closed` |
| lossy integer literal  | `not exactly representable`, plus the `0d` hint |
| inexact integer sum    | `exactly representable`, plus `0d<digits>` |
| float mixed with exact | `cannot mix` (naming both leaves) |
| over the exact budget  | `exceeds the exactness budget`, `at most 4096` |
| conflict marker left in | `conflict marker was found` (code `merge_conflict`) |
| wrong argument count   | `takes exactly one argument, but was given 2` (code `func_arity`) |
| key or element with no value | `written with no value after the colon` (code `elided_value`) |

**Every built-in has a fixed arity, checked at parse.** Nearly all take
exactly one argument; the two exceptions are `key`, which takes none or
one (how many levels up the path to read — none means the parent), and
`neq`, which takes one or more exclusions. A wrong count is a mistake in
the source and is refused before anything is evaluated.

**An elided value is refused.** A key, element or spread written with
nothing after its colon (`a:`, `a?:`, `[,]`, `[1,,2]`, `x:$obj&:`) is a
mistake in the source
rather than a null — writing it as a null made the mistake
indistinguishable from a deliberate `a:null`. The error names the key or
index, not the container — except for a spread, which has no key of its
own and so refuses the map it belongs to.

Three things that look similar are not elisions and keep working: an
explicit `a:null`, a colon chain (`a: b:1`, whose value is the nested
pair), and a trailing comma (`[1,]`, `{a:1,}`).

A comma group and a written list are different counts:
`upper("a","b")` is two arguments and is refused, while
`upper(["a","b"])` is one — a list, which `upper` then refuses for its
kind rather than its count.

A **version-control conflict marker** is refused before the parse. None
of `<`, `=` and `>` is an operator, so a marker line would otherwise be
read as ordinary text and `<<<<<<< HEAD` would parse into the list
`["<<<<<<<","HEAD"]` — an unresolved merge quietly becoming a plausible
document. The match is git's exact shape: seven `<`, `=` or `>` at the
start of a line, followed by the end of the line or a space before the
branch label. A document may still write those characters freely
anywhere else, quoted or not (`a:"<<<<<<<"`, `a:<<<<<<`).

In conflict messages the operand later in the source is named first
("…value: `<later>` with value: `<earlier>`") so the two sites are
distinguishable.

## The constraint algebra (specified)

> **Status: phases 1 and 2 implemented (bounds, `neq`, `re`); the rest
> specified.** This section is the normative design of capability G1's
> constraint atoms
> ([docs/capability-review/g1-constraint-algebra.md](capability-review/g1-constraint-algebra.md),
> phase 0), re-derived over the four-leaf number tower. The bound
> atoms `min`/`max`/`above`/`below`, the exclusion `neq` and the
> pattern `re` are implemented in both engines and pinned by
> [`test/spec/constraint-bound.tsv`](../test/spec/constraint-bound.tsv)
> and [`test/spec/constraint-re.tsv`](../test/spec/constraint-re.tsv);
> violations raise the registered `constraint` code, and a pattern
> outside the portable subset raises `constraint_pattern`. `length`,
> `unique` and `must` still parse as `unknown_function` errors; their
> proposed spec rows live as **drafts** in
> [`test/spec/draft/`](../test/spec/draft/) and are promoted (after
> parity probing) as each implementation phase lands. Known phase-1
> limit: a preference meeting a constraint in a CONJUNCT
> (`min(1024) & *8080`) does not yet resolve to the default — use the
> disjunct form (`*8080 | (integer & min(1024))`) today. Under the
> admission gate (ADR-004) the disjunct form also ENFORCES on
> override: an out-of-bound peer is refused rather than silently
> bypassing the constraint branch, so the recommended spelling now
> both defaults and validates.

### Vocabulary

Nine builtins join the function registry. Eight are **Band A** — full
lattice citizens with defined meet, emptiness, subsumption, and
canonical form. One is **Band B** — evaluate-only, honestly reported
as such. There is no new grammar: atoms are ordinary functions.

| Atom | Band | Meaning |
|------|------|---------|
| `min(x)`  | A | value ≥ x (numeric, or string with lexical order) |
| `max(x)`  | A | value ≤ x |
| `above(x)`| A | value > x |
| `below(x)`| A | value < x |
| `neq(x, ...)` | A | value is none of the listed scalars (leaf-aware) |
| `re(p)`   | A | string matches pattern p (unanchored, portable subset) |
| `length(c)`  | A | length/count satisfies integer constraint c |
| `unique()`| A | members pairwise distinct (list elements, map values) |
| `must(c, msg)` | B | evaluate-only check with an author message |

### Bounds and the number tower

Three rulings, each forced by the tower's disjoint leaves
(`integer`, `float`, `biginteger`, `bigdecimal` under the pure
supertype `number`):

1. **Order is a property of the number line, not the leaf.** A
   numeric bound constrains the value's mathematical position and is
   satisfied by ANY numeric leaf at an admissible position:
   `min(0) & 0d5` is `0d5`, `above(1) & 1.5` is `1.5`. Comparison is
   exact across leaves — every binary64 is exactly a rational, so a
   `float` compares with an exact decimal without rounding, in both
   implementations. A numeric bound implies the kind `number` (the
   supertype); it never narrows the peer's leaf.
2. **Endpoints keep their written leaf.** Canon round-trips kind
   (rule R4), so `min(1)`, `min(1.0)` and `min(0d1)` are distinct
   canonical texts denoting the same bound point. When two endpoints
   at the SAME point meet (`min(1) & min(1.0)`), the survivor is the
   one whose leaf sits lowest in the tower order
   `integer < float < biginteger < bigdecimal` — a deterministic
   choice both implementations make identically.
3. **`neq` excludes by scalar identity — leaf and value** — because
   that is what scalar identity means in the lattice (`1 & 1.0` is a
   conflict; `1|1.0` keeps both alternatives). `neq(1)` excludes the
   integer `1` and admits the float `1.0`. To exclude a point on the
   whole number line, list its leaves: `neq(1, 1.0)` (the exact
   leaves are opt-in, so `0d`-free documents need only these two).

String bounds (`min("a")`) use lexical code-point order and imply
`string`. Mixing domains in one meet (`min(0) & min("a")`) is empty
and yields nil.

### The meet

`atom & atom` (same domain) is symbolic — decided at
schema-composition time, before any data arrives:

| Meet | Result |
|------|--------|
| interval & interval | intersection: `min(0) & min(5)` → `min(5)`; `min(2) & max(10) & max(7)` → `min(2)&max(7)` |
| `neq` & `neq` | exclusion-set union, arguments sorted |
| `re` & `re` | regex-set accumulation (patterns sorted; never simplified) |
| `length(c1)` & `length(c2)` | `length(c1 & c2)` — the count atom reuses the numeric algebra recursively |
| bound & kind | domain narrowing: `integer & min(0)` keeps both (interval gains the integral-domain flag); `number & min(0)` keeps `min(0)` (already implied); `string & min(0)` → nil |
| bound & concrete scalar | membership by exact comparison → the scalar, or a two-site nil |
| bound & `must` | both kept; `must` stays opaque |

Meets are commutative and idempotent by construction — normalisation,
not term order, defines the result — so the lattice guarantee is
preserved.

### Emptiness

Decided **eagerly at unification time** where it is exact, and never
guessed where it is not:

- Empty interval: `min(5) & max(3)` → nil, both sites reported.
- Integral gap: an integral-domain interval containing no integral
  value — `integer & above(1) & below(2)` → nil. (Applies when the
  domain is narrowed by `integer` or `biginteger`.)
- Point deletion **requires a narrowed leaf**: `min(3) & max(3)`
  admits the point 3 in any numeric leaf, so `neq(3)` (which excludes
  only the integer `3`) does NOT empty it — but
  `integer & min(3) & max(3) & neq(3)` → nil. This is the tower
  re-derivation of the pre-tower example, and the draft rows pin both
  directions.
- `length(c)` is empty iff `c & integer & min(0)` is.
- Regex emptiness is deliberately approximate: distinct `re` atoms
  accumulate and are never declared empty — sound (no false
  conflicts), incomplete (some contradictions surface only against
  data).

### Subsumption

*Live in both engines: the
[G3](capability-review/g3-subsumption-evolution.md) `subsume` query
implements this table (its per-former rules are in
[Subsumption](#subsumption) above). It completes phase 0's three
tables (meet, emptiness, subsumption). One mapping to note: the
query answers the `must` row's "never" as `undecided` with reason
`sub_evaluate_only` — the admitted set is opaque, which is honest
indecision rather than a decided refusal.*

`A ⊒ B` ("A subsumes B", B is an instance of A) holds when **every
value B admits, A admits too**. It is the lattice's own order, and for
this algebra it is decided per atom family rather than by search. Three
properties make it useful: it is reflexive (`A ⊒ A`), transitive, and
`A ⊒ B` exactly when `A & B` is `B` — so an implementation has a free
cross-check against the meet table.

**Soundness before completeness.** Where a rule below cannot decide, the
answer is **not subsumed**, never a guess. That direction is the safe
one for the query G3 puts on top: a compatibility check that wrongly
reports "breaking" costs a reviewer a second look, while one that
wrongly reports "compatible" ships the break. Two rules are approximate
in this sense and are marked; the rest are exact.

| A (general) | B (specific) | A ⊒ B when |
|-------------|--------------|------------|
| no kind     | any          | always — an unnarrowed residual admits every leaf its domain has |
| `number`    | any numeric leaf, or a numeric residual | always — the supertype admits every leaf |
| leaf `k`    | leaf `k'`    | `k == k'`; distinct leaves are disjoint, so neither subsumes the other |
| interval    | interval     | A's interval contains B's: A's lower endpoint is at or below B's, A's upper at or above, and where endpoints coincide A's may not be the open one |
| interval    | concrete scalar | the scalar is admitted by A (the membership rule of the meet) |
| no bound on a side | any    | an absent endpoint is ±∞ and contains everything |
| `neq(S)`    | `neq(T)`     | `S ⊆ T` — excluding *fewer* values is more general. `neq(1) ⊒ neq(1,2)` |
| `neq(S)`    | concrete scalar | the scalar is in neither S nor excluded by A's other atoms |
| `re(P)`     | `re(Q)`      | **approximate**: `P ⊆ Q` as a *set of pattern strings*. Adding a pattern narrows, so `re("a") ⊒ re("a")&re("b")` |
| `length(c)`    | `length(d)`     | `c ⊒ d`, recursively — the count atom reuses this same table over the integer domain |
| absent `length`/`unique` | present | always — an unsized residual admits every size |
| `unique()`  | `unique()`   | always (reflexive); nothing else subsumes or is subsumed by it |
| `must(…)`   | anything     | **never** — a Band B predicate is opaque, so A's admitted set is unknown |
| anything    | `must(…)`    | decided by A's other atoms alone; an extra `must` on B can only narrow B |
| anything    | nil (empty)  | always — the empty set is an instance of everything |

A whole residual subsumes another when **every** row above holds for the
corresponding atom families, and the domains agree (a numeric residual
never subsumes a string one, or a container one).

**Why the two approximations are where they are.** `re` compares
patterns as *text* because deciding that `^a` admits everything `^ab`
admits is regex containment, which this algebra deliberately does not
do — the same ruling that stops two `re` atoms being declared empty at
composition time. `must` is opaque by construction: that is what Band B
*means*. In both cases the answer is "not subsumed", so the error is
always toward reporting a difference that is not there.

**One consequence worth stating outright.** Subsumption is decided over
the *normalised* residual, so two spellings of one constraint subsume
each other in both directions. `min(0)&max(10)` and `max(10)&min(0)`
normalise identically, and the canonical atom order below is what makes
that true by construction rather than by a special case.

### Endpoint tightening: lazy endpoints, eager emptiness

The pre-tower draft left open whether `integer & above(0.5)` should
rewrite to `integer&min(1)`. **Decided: no endpoint rewriting.**
Under the tower, a synthesised endpoint must be given a leaf the
author never wrote (`1`? `0d1`?), and that invented spelling leaks
into canonical text and, later, canon hashes. Emptiness needs no
synthesis, so the algebra keeps *eager emptiness* (the
composition-time contradiction detection that is the point of Band A)
with *lazy endpoints* (canon stays what was written, normalised only
by the meet rules above).

### Canonical form

A residual constraint renders as its normalised atoms joined by `&`
in a fixed order — **kind, lower bound (`min`/`above`), upper bound
(`max`/`below`), `neq` (arguments sorted), `re` (patterns sorted),
`length`, `unique`, `must`** — no spaces, reparseable, endpoint leaves
preserved:

```aon
a: integer & max(10) & min(0) & min(2)
# canon: {"a":integer&min(2)&max(10)}
```

`parse(canon(v)) == v` holds for every atom and every normalisation
rule: the reparse produces a conjunct of atoms that normalises back
to the identical residual. Draft rows pin a round-trip and an
order-independence case (`min(0)&max(10)` vs `max(10)&min(0)` →
identical canon) for each rule.

Two renderings follow from that round trip rather than from taste:

- **`length`'s argument renders unabridged**, implied parts and all:
  `length(3)` canonicalises to `length(integer&min(3)&max(3))`, because that
  *is* the residual the count must satisfy (`length(c)` always meets
  `integer & min(0)`; see [`length` semantics](#length-semantics)).
  Abbreviating it would mean a second set of rules for when the implied
  parts may be dropped, and canon is a normal form — [G6](capability-review/g6-distribution.md)
  hashes it — not a pretty-printer.
- **A bare domain is spelled out when nothing implies it.** An order
  atom's argument names its own domain, so `min(2)` need not say
  `number`. A sizing residual carries no order, so `string & length(3)`
  renders as `string&length(...)`: drop the `string` and the reparse would
  admit lists and maps of three members too.

### `re` and the portable pattern subset

`re(p)` admits a string matching `p`. Matching is **unanchored** in
both implementations, so `re("el")` admits `"hello"`; anchor with `^`
and `$` to constrain the whole string. The string kind is implied, so
`string & re("x")` canonicalises to `re("x")` — the same rule that
makes `number & min(0)` canonicalise to `min(0)`.

A pattern must mean the same thing in both implementations **and cost
about the same to evaluate**, and the two host regex engines guarantee
neither: TypeScript compiles with JavaScript's backtracking `RegExp`, Go
with RE2 — a different language, in a different complexity class, over a
different alphabet.

Aontu therefore **defines** the pattern language and rewrites your
pattern into a form neither engine can read two ways
([ADR-003](../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted)).
Only the rewritten form reaches a host engine.

**What `re` accepts**

| | |
|---|---|
| literals | `a`, and `\` before any of `. \ + * ? ( ) [ ] { } \| ^ $ /` to mean it literally; `\xHH` |
| classes | `[abc]`, `[^abc]`, `[a-z]`; `\-` inside a class for a literal hyphen |
| abbreviations | `\d \D \w \W \s \S` and `.` |
| repetition | `*` `+` `?` `{n}` `{n,}` `{n,m}` with every count **1000 or less**, and the lazy forms `*?` `+?` `??` |
| grouping | `(…)`, `(?:…)`, alternation `a|b` |
| anchors | `^` `$` `\A` `\z` `\b` `\B` |
| control | `\t \n \r \f \v` |

**Aontu defines the abbreviations**, and inherits neither host's:

| written | means | 
|---|---|
| `\d` / `\D` | `[0-9]` / `[^0-9]` |
| `\w` / `\W` | `[0-9A-Za-z_]` / `[^0-9A-Za-z_]` |
| `\s` / `\S` | `[ \t\n\r\f\v]` / `[^ \t\n\r\f\v]` |
| `.` | `[^\n]` |
| `\A` / `\z` | `^` / `$` |

These are the small ASCII sets deliberately. **`\s` is those six
characters only** — it does *not* match U+00A0 or the other Unicode
spaces, though JavaScript's `\s` does, because a non-breaking space in
a config value is a mistake worth catching rather than a space worth
accepting in silence. Matching counts **code points**, not UTF-16 code
units, in both implementations.

**What `re` refuses**, and why rewriting cannot help:

| Construct | Why |
|-----------|-----|
| backreferences `\1`–`\9`, `\k<name>` | RE2 has no equivalent, and a pattern using one is not a regular expression at all |
| lookaround `(?=)` `(?!)` `(?<=)` `(?<!)` | same — not in RE2 |
| any `(?…)` but `(?:` | named groups are spelled `(?P<n>` in RE2 and `(?<n>` in JavaScript; inline flags change the meaning of everything after them |
| `\p{…}`, `\x{…}`, `\u`, `\Z` | spelled differently, or read as a literal by one engine |
| POSIX classes `[[:alpha:]]` | RE2 only |
| empty classes `[]`, `[^]` | a never-matching class in JavaScript, a parse error in RE2 |
| a repeat count above **1000** (`a{1001}`, `a{2,1001}`) | RE2 refuses to compile it and JavaScript accepts it, so the same schema was valid in one implementation and not the other. The bound is **Aontu's**, checked in the normaliser before either engine sees the pattern, which is why the refusal is the same in both ([ADR-003](../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted)) |
| a quantifier applied to `^`, `$`, `\b` or `\B` | there is nothing to repeat: JavaScript under the `u` flag calls it a syntax error, RE2 quantifies the assertion and matches |
| a `{` that opens no counted quantifier (`x{y}`), or a `}` that closes none | JavaScript reads each as a lone quantifier bracket and refuses; RE2 reads both as literals |
| a quantifier on a group containing a quantifier or an alternation | **cost, not meaning** — see below |

The last one is different in kind. `(a+)+$` against twenty-nine `a`s and
a `!` takes **45 seconds** in JavaScript and 0.065s under RE2, growing
exponentially; a regex match is counted by no evaluator budget ([the
trust contract](trust.md), clause 2), so without this rule an untrusted
schema could stall the TypeScript evaluator indefinitely. Rewriting
cannot fix a complexity difference, so this one is refused rather than
normalised. `(?:a|b)+` is caught by it too, though it is safe — deciding
that two alternation branches cannot both match is real work. Write
`[ab]+`. Unquantified groups, top-level alternation, `(?:ab)+`, `(a)(b)`
and `(a)+` all pass, and a quantifier inside a character class is a
literal character (`[a+]+` is fine).

The refusal message names the offending construct *and* restates this
whole table, so an author never has to find this page to recover.

Patterns **accumulate** and are never simplified: `re("x") & re("a")`
keeps both (sorted by pattern text in canon), and a value must match
every one. Two `re` atoms are never declared empty at composition time,
because deciding that one pattern excludes another is regex containment
— which this algebra deliberately does not do. A contradiction between
patterns therefore surfaces against data, not against the schema.

Canon renders the pattern **as written**, never the rewritten form:
canon round-trips source, and [G6](capability-review/g6-distribution.md)'s
semantic hash will be taken over canon.

### `length` semantics

`length` applies to strings, lists, and maps, with the domain fixed by
the peer:

- **strings**: length in **Unicode code points** — not UTF-16 code
  units (TS's native count) and not bytes (Go's): `length(1) & "𝄞"`
  holds, in both implementations. Astral-plane rows are part of the
  draft suite, not an implementation accident.
- **lists**: element count. **maps**: entry count.

Its argument is any integer-domain constraint: `length(3)` means exactly
3; `length(min(2) & max(5))` means between 2 and 5. Every argument meets
`integer & min(0)` — a count is a non-negative whole number — which is
what makes `length(max(-1))` and `length(1.5)` empty on their own, and what
canon renders.

Like every other atom's argument, it **residuates** until it settles
(G1 phase 4): `length($.n)` waits for `$.n`, then checks the count. Only
a *settled* argument of the wrong shape — a string, a boolean, a
contradictory kind — is refused.

A sizing residual has **no domain of its own** — a count says nothing
about what is counted — so meeting a kind *sets* one rather than merely
agreeing with it. `string & length(3)` is a three-character string, and
`number & length(3)` is empty, because a number has neither a length nor
members. `min(2) & unique()` and `re("^a") & unique()` are empty for the
same reason.

**`length` counts what generates.** An optional key that never resolves is
dropped at generation, so it does not count:
`length(1) & {x:1, y?:number}` **holds**, because the generated value is
`{"x":1}`. The constraint is a claim about the data, and the data is
what comes out.

**When the count is decided.** An optional key **survives unification
carrying its unresolved value** — `{x:1, y?:number}` canonicalises as
`{"x":1,"y"?:number}` — and is dropped only in generation
(`BagVal.gen`). It is tempting to conclude that the count is therefore
unknowable until generation, and that `length` must wait for a drop. It
must not: nothing in the fixpoint performs that drop, so an atom waiting
for it waits forever.

The count is knowable earlier, because *whether a member will generate*
is decided before generation runs. A member is skipped by generation
when it carries a `type` or `hide` mark, or when it is an optional key
whose value cannot generate. So:

- **Every optional child settled** — this includes `{x:1, y?:number}`,
  where the map converges immediately and `y` simply holds an
  unresolved kind. The count is known, and `length` decides at composition
  time like every other atom, `length(1) & {x:1, y?:number}` included.
- **Some optional child still converging** — `{x:1, y?:$.z}` before `z`
  resolves, where the child's fate genuinely is not yet decided. `length`
  **residuates**: it stays in place and is retried, exactly as an
  arithmetic operator with a non-concrete operand does.

So `length` is eager in the ordinary case and defers only where the answer
is not yet determined, which is the same discipline every other
deferring value in the language follows. What is never deferred is the
atom's own arithmetic: `length(min(5) & max(3))` is empty at composition
time whatever map it meets, because the inner interval is empty on its
own.

### Sizing atoms fold last

There is one more rule the sizing atoms need, and it is not shared with
the order atoms: **`length` and `unique` are the last terms of a conjunct
to fold.**

An order atom may decide the moment it meets a scalar, because meeting
further scalars can only narrow: `min(2) & 1 & 2` is a conflict however
it is grouped. A sizing atom cannot, because meeting further containers
*grows* the member set:

```aon
a: length(2)
a: {x:1}
a: {y:2}
```

Layering fragments like this is the point of the language, and an atom
that folded early would count `{x:1}` alone and refuse it. So the two
kinds of atom take different slots in the conjunct sort order (`cjo`):
the order atoms fold before containers, the sizing atoms after every
value that could contribute a member. The size is then read once, from
the merged container.

Written order does not matter — `a: {x:1} a: {y:2} a: length(2)` is the
same value — which is the property the sort order exists to guarantee.

**`must` folds last for the same reason**, and the slot is named for
what the three atoms share rather than for sizing alone: `length`,
`unique` and `must` all need the *whole* value. An evaluate-only check
run against the first fragment would refuse `a: must(length(2),m)` /
`a: {x:1}` / `a: {y:2}` on a count of one, exactly as an early-folding
`length` would.

### `unique` semantics

`unique()` holds when the members of a container are **pairwise
distinct**, compared by **canonical form**: two members are the same
member exactly when their canons are equal.

Canon is the right yardstick because it is already this language's
normal form for "the same value" — `ConstraintVal.same` compares canons,
and `DisjunctVal` deduplicates members that way. It is deterministic,
byte-identical across the two implementations (every `canon` spec row
pins that), and it is defined for *every* value, which scalar identity
is not.

For scalar members it reduces exactly to scalar identity — leaf *and*
value — because canon round-trips kind: `1` and `1.0` canon differently,
so `[1, 1.0]` is distinct under the number tower, exactly as `1 & 1.0`
is a conflict. For **container** members it gives structural equality
without a separate rule: `[{x:1},{x:1}]` is not unique, because both
elements canon as `{"x":1}`, and `[{x:1},{x:2}]` is.

It applies to two shapes:

- **lists**: the elements are pairwise distinct.
- **maps**: the entry *values* are pairwise distinct. (Keys are
  distinct by construction, so there is nothing to check there.)

Any other peer — a string, a number, a boolean, `null` — is a domain
conflict: no scalar has members. The members it does compare are the
members that *generate*, the same set `length` counts, so a `hide`n entry
and a dropped optional are not members here either.

**`unique(k)` is uniqueness by projection.** "No two services share a
port" compares one field of each member rather than the whole member,
and the atom's single argument is that projector — the arity was
reserved for it, and is now spent:

```aon
services: unique(port) & {
  api:  { port: 8080, name: "api"  }
  auth: { port: 8443, name: "auth" }
}
```

A member with no such key **fails** rather than being skipped:
distinctness that cannot be shown is distinctness the collection does
not have, and skipping would let one keyless record hide a duplicate.
A member that is not a map fails for the same reason — it has no key
to project.

`unique(a) & unique(b)` demands **both**; the keys accumulate rather
than the later one replacing the earlier, since each names a different
axis of distinctness and dropping either would silently weaken the
constraint. Canon renders them sorted after the bare atom
(`unique()&unique("a")&unique("b")`), so two documents saying the same
thing render the same string. In subsumption, a general `unique(k)`
needs the same key on the specific side — distinctness on `port` says
nothing about distinctness on `name` — while a specific that adds a
key still subsumes, because more distinctness is narrower.

### Cross-field bounds and residuation

An atom whose argument contains an unresolved reference, or whose
peer is not yet concrete, **residuates**: no error, stays in place,
re-evaluated on later fixpoint passes. Atoms only ever suspend or
intersect — never force evaluation — so evaluation order cannot
change results.

```aon
scaling: {
  floor: 2
  ceiling: 10
  target: integer & min($.scaling.floor) & max($.scaling.ceiling)
}
# target normalises to integer&min(2)&max(10) once floor/ceiling resolve
```

A residual that survives to generation is an error, exactly like an
unresolved kind today; exhaustion of the pass budget while residuals
are still refining is `budget_passes` ([the trust
contract](trust.md), clause 2).

### Band B: `must`

`must(c, msg)` wraps any Aontu value as an evaluate-only check: it
residuates until its peer is concrete, then requires the peer to
unify with `c`; on failure the author's message is attached to the
nil (`NilVal.details`). `must` never participates in emptiness or
subsumption, and any report including one states that the check was
evaluate-only — the honest channel for domain rules beyond the
algebra.

### Errors

A constraint violation is an ordinary two-site nil in the existing
message family (`Cannot unify value: 99999 with value: max(65535)`),
with machine-readable `details`: the failing atom, the normalised
admissible interval/sets, and any `must` message. Codes ride the
[error-code registry](../test/spec/errcodes.tsv); rendering into
reports belongs to the vet verb (G2).
