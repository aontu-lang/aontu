# Language reference

Complete, exhaustive description of the aontu language: lexical
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
- [Container kinds: `map()` and `list()`](#container-kinds-map-and-list)
- [Conjunction `&`](#conjunction-)
- [Disjunction `|`](#disjunction-)
- [Preference / default `*`](#preference--default-)
- [Optional keys `?`](#optional-keys-)
- [Spreads `&:`](#spreads-)
- [Generating children: `pack` and `each`](#generating-children-pack-and-each)
  - [Making elements: `each`](#each-the-order-preserving-map)
  - [The `_ & …` idiom](#the-_---idiom-construction-and-bound)
- [Selecting: `filter` and `match`](#selecting-filter-and-match)
- [The placeholder `_`](#the-placeholder-_)
- [Transforming: `emit`](#transforming-emit)
- [References and paths](#references-and-paths)
  - [Recursive references (fixpoints)](#recursive-references-fixpoints)
- [Variables `$name`](#variables-name)
- [Aliases `%`](#aliases-)
- [The `+` operator and grouping](#the--operator-and-grouping)
- [Functions](#functions)
- [Arithmetic: `add` `sub` `mul` `div` `mod` `rem`](#arithmetic-add-sub-mul-div-mod-rem)
- [Projecting fields: `pick`](#projecting-fields-pick)
- [Optional input: `maybe`](#optional-input-maybe)
- [Ordering: `sort`](#ordering-sort)
- [Aggregating: `sum` `least` `greatest`](#aggregating-sum-least-greatest)
- [Folding to a string: `join`](#folding-to-a-string-join)
- [Text: `esc` `usc` `rep` `split`](#text-esc-usc-rep-split)
- [Linking: the tree is the namespace](#linking-the-tree-is-the-namespace)
- [First-class paths: `path(p?)`](#first-class-paths-pathp)
- [Checked links: `refer(t?)`](#checked-links-refert)
  - [Declared relations](#declared-relations)
- [Marks: `type` and `hide`](#marks-type-and-hide)
- [Closed values: `close` / `open`](#closed-values-close--open)
- [Source loading `@"…"`](#source-loading-)
  - [Text: `.txt` and `--text-ext`](#text-txt-and---text-ext)
- [Operator precedence](#operator-precedence)
- [Canonical form](#canonical-form)
- [The formatted form](#the-formatted-form)
- [The published grammar](#the-published-grammar)
- [Generation](#generation)
- [Subsumption](#subsumption)
- [Errors](#errors)
- [Grammars: `abnf()` and `parse()`](#grammars-abnf-and-parse)
  - [A grammar reads better in backticks](#a-grammar-reads-better-in-backticks)
  - [A grammar can say what it builds](#a-grammar-can-say-what-it-builds)
  - [Shaping an unannotated tree](#shaping-an-unannotated-tree)
- [The constraint algebra](#the-constraint-algebra)
  - [Named constraint aliases](#named-constraint-aliases)

---

## Lexical structure

aontu source is parsed by
[`@tabnas/jsonic`](https://github.com/tabnas/jsonic) with aontu-specific
plugins, so the surface syntax is "relaxed JSON".

- **Whitespace** separates tokens; newlines and commas are
  interchangeable separators. `a:1 b:2`, `a:1, b:2`, and `a:1\nb:2` are
  equivalent.
- **Comments** begin with `#` and run to end of line. A file of only
  comments unifies to `{}`.
- **Bare strings** need no quotes (`name: Mercury`), and may hold
  letters, digits, `-` and `_`, and nothing else. So `owner:
  team-payments`, `on: 2026-09-05` and `id: user_42` are bare strings.
  Every other punctuation character is either syntax, where the
  grammar gives it a meaning, or an error where it does not: `x=y`,
  `6/2`, `50%` and `>10` are refused with `[aontu/bare_punct]`, which
  names the character, rather than read as strings. Quote with `"…"`,
  `'…'` or `` `…` `` to include spaces or any other character
  (`name: "hi there"`, `ratio: "6/2"`). All three are the same kind of
  value; only what they may contain differs.
- **Keys** follow the same rule: bare when they hold only letters,
  digits, `-` and `_` (`host`, `a-b`), quoted otherwise.
- **Backtick strings may span lines.** `"…"` and `'…'` refuse a
  literal newline; `` `…` `` accepts one, so a backtick string carries
  several lines of text as one scalar. This is what lets a document hold a
  block of another language: a shell script, a template, a fragment
  of generated source. Escapes are processed in all three forms, so
  `\t` is a tab and `` \` `` is a literal backtick. A **literal**
  control character in the source is refused
  (`[aontu/unprintable]`), including a literal tab: write `\t`.
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
  *before* the prefix (`-0d5`, never `0d-5`) and a marker with no
  digit after it is not a literal at all: `0d` is the bare string
  `"0d"`, and `0d.5` reads as member access on that string.
- **Other numeric forms.** Hexadecimal (`0x1f`), octal (`0o17`) and
  binary (`0b1010`) literals use lower-case prefixes, and belong to
  the plain family, not the exact one. (Only the exact marker also
  accepts its letter in upper case: `0D12` is a literal, `0X1F` is the
  bare string `"0X1F"`.) `_` may separate digits (`1_000_000`,
  `0d1_000`), but only singly and only *between* digits: a run that
  breaks the rule is not a number at all, so `1__0` is the string
  `"1__0"`, not `10`.
- **A number that cannot be stored exactly is refused.** An integer
  literal the double format would silently round is a located error
  naming the `0d` escape, not an approximation: see
  [Exact or refused](#exact-or-refused-lossy-literals).
- **Booleans** are `true` / `false`; **null** is `null`.

A backtick string is how a document holds a block of another
language. Here `greet.aon` carries a shell script as one value:

<!-- test: scenario backtick-multiline -->
<!-- test: file greet.aon -->
```aon
greet: `#!/bin/sh
echo "hi"
`
tab: `x\ty`
```

<!-- test: run -->
```sh
$ aontu -c greet.aon
{"greet":"#!/bin/sh\necho \"hi\"\n","tab":"x\ty"}
$ echo $?
0
```

The relaxed forms combine in one document:

```aon
a: 1
b: 2
c: Mercury
d: "hi there"
```

```json
{"a":1,"b":2,"c":"Mercury","d":"hi there"}
```

## The value lattice

Every aontu value is a point in a lattice ordered from most general to
most specific:

![The value lattice: top at the join; string, number, boolean and null under it; path() under string; integer, float, biginteger and bigdecimal under number; nil at the meet, below every kind.](figures/value-lattice.svg)

The engine draws this figure itself: it is
[`aontu view lattice`](reference-api.md#aontu-view) over a document
with no values in it. Run the same verb over your own document and
each node carries a count of the values that landed there.

- **`top`** is the unit: unifying anything with `top` yields the other
  value. It is what an unconstrained field is.
- **`nil`** (bottom) is the result of a failed unification. It carries an
  error message and cannot be generated.
- **Unification** of two values is their *greatest lower bound*: the
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
| `number`     | any numeric value: the supertype over the four leaves below |
| `integer`    | any value of *integer kind* (below)            |
| `float`      | any value of *float kind* (below)              |
| `biginteger` | any value of *biginteger kind* (below)         |
| `bigdecimal` | any value of *bigdecimal kind* (below)         |
| `boolean`    | `true` or `false`                              |
| `top`        | any value at all                               |

The path kind is spelled `path()` rather than a bare word, and sits
under `string`: see [First-class paths](#first-class-paths-pathp).
The container kinds are `map()` and `list()`: see
[Container kinds](#container-kinds-map-and-list).

### The four numeric leaves

Every numeric value carries a **kind**, fixed when the value is built,
and it is the kind (not the magnitude) that decides what the value
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

The two upper leaves hold IEEE-754 doubles (every value a plain JSON
number can hold exactly) and the source rule below decides which of
them a literal joins. The two lower leaves are reached only by writing
`0d`, and hold their digits *exactly*: no binary rounding, and no
precision limit but the [exactness budget](#the-exactness-budget).

The four leaves are **disjoint**. No value belongs to two of them, and
values of different leaves never unify however equal they look: `1 &
1.0`, `5 & 0d5` and `0d5 & 0d5.0` are all conflicts. A cross-leaf result
would have to pick a kind, and either choice would make `&` asymmetric
in kind.

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

The two families nearly mirror each other, with one asymmetry: a `.`
splits the leaf in both, but an exponent splits it only in the `0d`
family: `1e3` is an integer, `0d1e3` a bigdecimal.

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
biginteger: a different lattice point, since the leaves are disjoint.

Exact values render in plain form at every magnitude, never in
scientific notation, and **one value has exactly one rendering**:
scale is presentation, not identity, so `0d0.10`, `0d0.1` and `0d1e-1`
all parse to the same value and all canon as `0d0.1`.

Edge cases:

- The same rules apply wherever a numeric value is built (a parsed
  literal, a `$var` binding, a raw value handed to the API) so a given
  number never has two different kinds depending on where it came from.
  Where there is no source text, condition 1 is vacuous and conditions
  2 and 3 decide.
- A literal that overflows the double range entirely (`1e999`) is not a
  number at all; it is an error. One that *underflows* to exactly zero
  (`1e-400`) is integer-kind `0`.
- Negative zero never survives, in any leaf: `-0.0` normalises to
  `0.0`, `-0d0` to `0d0`, and `-0d0.0` to `0d0.0`, in canon and in
  generated output alike.
- aontu has no negative literals: `-` is a prefix operator applied to a
  positive literal. The int64 *minimum* therefore cannot be written as
  an integer-kind literal: `-9223372036854775808` negates the
  float-kind literal `9223372036854775808` and stays float kind. Write
  it `-0d9223372036854775808` to hold it exactly, as a biginteger.

### Exact or refused: lossy literals

An integer literal is stored only if the double format holds it
*exactly*. One that would be silently rounded is a located error
instead, and the message names the fix: write it with `0d`.

The input that triggers this rule is ordinary JSON: for example, a
64-bit record ID in a dump from an API. `id: 9007199254740993` is
2^53+1, the first whole number a double cannot hold. Storing it anyway
would yield 9007199254740992, a different ID, with nothing said about
it. aontu refuses:

<!-- test: scenario lossy-literal -->
<!-- test: run -->
```sh
$ echo 'id: 9007199254740993' | aontu
[aontu/lossy_integer_literal]: Cannot resolve value at path $.id

This integer literal, 9007199254740993, is not exactly representable in
binary64, so storing it would silently round it to a DIFFERENT
number. aontu refuses rather than corrupts: write it as a `0d`
literal to get the exact integer.
...
$ echo $?
1
```

(That is the TypeScript wording; Go phrases the same refusal
differently. Both name the `0d` escape.)

Take the escape and the document works again, exactly: in generated
output and in canonical form:

<!-- test: run -->
```sh
$ echo 'id: 0d9007199254740993' | aontu
{
  "id": 9007199254740993
}
$ echo 'id: 0d9007199254740993' | aontu -c
{"id":0d9007199254740993}
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

The exact leaves have no precision limit in the ordinary sense (a
biginteger is as wide as its digits) but a bigdecimal is bounded, so
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
Exceeding either is a located error: *"This exact decimal exceeds the
exactness budget"*. aontu has no rounding mode and no precision
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
  two-branch disjunction: `(1|1.0) & 1.0` selects the float. Value
  comparison for the exact leaves is over the number, not its
  spelling: `0d1.5 & 0d1.50` is `0d1.5`.

No operator or function narrows a kind: see
[`+`](#the--operator-and-grouping) and
[`upper()`/`lower()`](#functions). The int64 window, the `.0` canon
suffix and the `0d` marker are stated in
[the four numeric leaves](#the-four-numeric-leaves) and
[Canonical form](#canonical-form).

## Maps

A map is an unordered set of key/value pairs. Braces are optional at the
top level.

- **Literal:** `a:{b:1,c:2}` → `{"a":{"b":1,"c":2}}`.
-  **Implicit nesting:** a chain of colons builds nested maps: `a:b:c:1`
  → `{"a":{"b":{"c":1}}}`.
- **Duplicate-key merge:** stating a key twice unifies the two values.
  `a:{b:1}, a:{c:2}` → `{"a":{"b":1,"c":2}}`.

The merge recurses through nesting:

<!-- fmt: keep the statements the merge law reads as one map -->
```aon
a: b: c: 1
a: b: d: 2
a: e: 3
```

```json
{"a":{"b":{"c":1,"d":2},"e":3}}
```

Maps are **open** by default (extra keys may be unified in) until sealed
with [`close`](#closed-values-close--open).

## Lists

A list is an ordered sequence.

- **Literal:** `a:[1,2,3]` → `{"a":[1,2,3]}`. Elements may be
  whitespace-separated: `[1 2 3]`.
- **Mixed / nested / of maps:** `[1,two,true]`, `[[1,2],[3,4]]`,
  `[{x:1},{y:2}]` all work.
- **A pair is a single-key map element:** `[a:1, b:2]` is
  `[{a:1}, {b:2}]`: the braces are optional for a one-key map in list
  position, and the two spellings are the same document. An optional
  pair carries its `?` into the element (`[a?:1]` is `[{a?:1}]`), a
  numeric key is a key of the element map and never an index into the
  list (`[0:1]` is `[{"0":1}]`), and a chain nests (`[a:b:1]` is
  `[{a:{b:1}}]`).
- Lists unify element-by-element by position (and support `&:` spreads,
  below).

The pair form reads naturally for ordered records:

```aon
routes: [get:"/health" post:"/orders"]
```

```json
{ "routes": [ { "get": "/health" }, { "post": "/orders" } ] }
```

## Container kinds: `map()` and `list()`

`{}` and `[]` are the container *units*: each admits any value of its
shape, and generates empty when nothing else arrives. `map()` and
`list()` are the container *kinds*: each admits exactly the same
values and defaults to nothing, as `string` does. The kind is the
spelling of "a map must be supplied here": an unmet unit silently
manufactures its empty value, an unmet kind refuses to generate.

```aon
required: map() & { a:1 }
```

```json
{ "required": {"a": 1} }
```

The contrast, unmet:

<!-- test: scenario container-kinds -->
<!-- test: run -->
```sh
$ echo 'y: {}' | aontu -c
{"y":{}}
$ echo 'y: map()' | aontu
[aontu/mapval_no_gen]: Cannot resolve value at path $.y
...
$ echo $?
1
```

A kind mismatch refuses with the unit's own codes (`[aontu/map]`,
`[aontu/list]`): `map() & [1]` is the same fact `{} & [1]` reports.
Neither function takes arguments: element constraints belong to the
spreads (`{&: V}`, `[&: V]`). The kinds settle inside `type()` bodies,
[meet](unification.md) the unit literals (`map() & {}` is `{}`: an
explicitly supplied empty map satisfies the kind), and subsume their
containers (`map()` subsumes `{a:1}`). Pinned by
[`test/spec/containerkind.tsv`](../test/spec/containerkind.tsv).

## Conjunction `&`

`a & b` is the explicit unification of `a` and `b`: the same operation
that merges duplicate map keys.

```aon
a: 1 & integer
b: { x:1 } & { y:2 }
c: { x:p:1 } & { x:q:2 }
```

```json
{"a":1,"b":{"x":1,"y":2},"c":{"x":{"p":1,"q":2}}}
```

Two kinds meet to the narrower kind and stay a kind: `number & integer`
canons as `integer` and does not generate on its own.

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

```aon
a: 2
a: 1|2
b: 2
b: string|number
```

```json
{"a":2,"b":2}
```

`&` binds tighter than `|`, so `c & b | a` parses as `(c & b) | a`.

**An unresolved disjunction has no value**. More than one alternative
still admitted means the truth is not yet settled, so generation refuses
with `disjunct_no_gen`, class `incomplete`: the same class a bare
`string` residue answers:

```
a:1|2                → [aontu/disjunct_no_gen] at $.a
a:{x:1}|{y:2}        → [aontu/disjunct_no_gen] at $.a
```

Two things resolve it: a value that selects an alternative, or a
preference saying which one holds when nothing else does (below).
Alternatives that are the *same value* collapse first, so `1|1` and
`{a:1}|{a:1}` each generate that one value: sameness is structural
for maps and lists (container kind, closedness, marks, optional keys,
then the children).

An optional key whose value is an unresolved disjunction is dropped
rather than reported, as every other unresolved optional is.

## Preference / default `*`

`*x` marks `x` as **preferred** (a default). In a disjunction the
preferred branch is chosen unless unification forces another.

```aon
a: *1|number
b: *5
c: *green|string
d: *1|number
d: 2
```

```json
{"a":1,"b":5,"c":"green","d":2}
```

The preference survives in canonical form (`a` above canons as
`{"a":*1|number}`) because a default is constraint information, not a
resolved value.

Defaults propagate through nesting and spreads. `pref(x)` is the
function form of `*x` (canon `*x`). Preferences can be ranked (a `*` of
a `*` outranks a single `*`); the lowest rank wins when two preferred
values meet. A ranked preference meets its peers exactly as rank 1
does: the **rank-uniform meet**: `a:**1.5 & float` is `1.5` just as
`a:*1.5 & float` is, and `**2|integer` met by a bare `integer` keeps its
default.

Overriding a default is judged in two steps, and they are the two arms
of the disjunction `*x` stands for: `*x & peer` is `(x & peer) |
(super(x) & peer)`.

**The preferred value answers first.** A peer it still admits leaves
the preference standing, narrowed to what survived: `a:*1.5 & float`
and `a:*1.5 & number` are both `1.5`, `a:*8080 & min(1024)` is still
`*8080`, and `a:*integer & 7` is `*7`.

**Otherwise its type answers, and that is the override.** `a:*8080 &
9090` is `9090`: `8080` cannot admit it, `integer` can. When neither
arm admits the peer, nothing is left of the disjunction and the
refusal is `empty`: `a:*2 & 3.0`, `a:*2.2 & 3` and `a:*1.5 & integer`
are all errors, because the numeric leaves are disjoint.

The type is `super(x)`, so the rule reaches every kind of
default: `super(integer)` is `number`, so `a:*integer & 7` narrows and
`a:*integer & "s"` refuses.

**Two defaults of the same rank must agree.** `a:*1` beside `a:*7` is
`pref_rank_clash`, in that spelling and in `a:*1|*7`: the disagreement
is between the DEFAULTS, and the fix is to rank one of them (`**`).
Compatible defaults fold: `a:*1` beside `a:*integer` is `*1`.

**A preference conjoined with a disjunction names an alternative**:
`(A|B) & *A` is `*A|B`, the same value the direct spelling denotes, so
the two ways of writing an enum-with-default agree.

```aon
a: ("1.0"|"1.1") & *"1.0"
```

```json
{"a":"1.0"}
```

The canon is `{"a":*"1.0"|"1.1"}`. A preference that names no
alternative is dropped (it has nothing to prefer) so
`("1.0"|"1.1") & *"2.0"` canons as `"1.0"|"1.1"`. The default-validity
lint below is what reports that shape.

**A preference inside a disjunction is gated by admission**: an override
must be admitted by the disjunction itself: by at least one
alternative, or by the preferred value. A preferred branch contributes
exactly its own value to the admitted set, so `*'auto' | 'literal' |
'data'` is a true **enum with a default**: unset generates `"auto"`,
`'literal'` and `'data'` override, and anything else is the empty
disjunction (`[aontu/empty]`). A wider alternative admits a wider
override (`*8080 | integer` accepts any integer), and a constraint
alternative is consulted rather than bypassed (`*8080 | (integer &
min(1024) & max(65535))` refuses `80` and accepts `2048`; `*8080 |
(integer & neq(80))` refuses `80`). A deliberately open default states
its openness: `*x | top` admits every override. The gate covers scalar
preferred values: the same boundary as the kind gate above.

```aon
a: *8080|integer
a: 9090
b: *8080|number
b: 1.5
c: *8080|string
c: 8080
```

```json
{"a":9090,"b":1.5,"c":8080}
```

An alternative admits `a`'s override (same leaf); the `number` branch
admits `b`'s float; the preferred value admits itself at `c`. An
override nothing admits is the empty disjunction:

<!-- test: scenario enum-gate -->
<!-- test: run -->
```sh
$ echo 'k: *auto | literal | data  k: autoo' | aontu
[aontu/empty]: Cannot unify values at path $.k
...
$ echo $?
1
```

The refusals follow the same rule at every width: `*8080 | integer`
met by `1.5` is `[aontu/empty]` (the other numeric leaf), and
`*8080 | (integer & neq(80))` met by `80` is refused because the
exclusion is consulted, not bypassed.

A document that wants an open override says so by writing the open
branch explicitly, `*x | top`.

**A structural default is gated too**, by the same rule as every
other: the peer must pass `super(x)`, and `super({x:1})` is
`{x:integer}`. A map default therefore MERGES with a map that adds a
key (the preferred value itself admits it) and refuses a value of
another kind outright:

```aon
a: *{ x:1 }
a: y: 2
b: *{ x:1 }
b: x: 2
```

```json
{"a":{"x":1,"y":2},"b":{"x":2}}
```

`a` keeps its `x` default and gains `y`; `b`'s `x` is overridden,
because `{x:1}` cannot admit `{x:2}` but its type can. A peer of
another kind (`a: "s"`) refuses, as the scalar case always did.

A document that wants a structural default any peer may replace says so
by writing the open branch explicitly, `*{x:1} | top`.

Writing `a:{x:*1}` rather than `a:*{x:1}` is still the clearer
spelling when you mean "a map whose `x` defaults to 1", and it is what
`pref({x:1})` produces. Pinned by the `pref-struct-*` rows in
[`test/spec/pref.tsv`](../test/spec/pref.tsv).

## Optional keys `?`

A key suffixed with `?` is optional. If it never receives a concrete
value, it is **dropped from the generated output** instead of erroring.

<!-- fmt: keep a schema and its data as separate statements -->
```aon
x?: number
y: Y
a: {y?:number, z:2}
a: {}
b: {y?:number, z:2}
b: {y:11}
c: {y?:number, z:*3}
c: {y:11}
```

```json
{"a":{"z":2},"b":{"y":11,"z":2},"c":{"y":11,"z":3},"y":"Y"}
```

The unresolved `x?` is dropped, `b`'s filled `y` is kept, and `c`'s
default still applies beside the filled key.

Optionality survives references: a referenced map drops its unresolved
optional keys too.

## Spreads `&:`

A `&:` entry is a **template** unified into every other entry of its map
or list. The template itself is not emitted:

```aon
c: { &: { x:2 } y:k:3 z:k:4 }
```

```json
{"c":{"y":{"k":3,"x":2},"z":{"k":4,"x":2}}}
```

A template may be a kind (`&: string`), a constraint map
(`&: {x:number}`), a referenced value (`&: $.tmpl`), or carry a
per-child overridable default (`&: x: *1|number`). A template that
names each child uses `key()`:

```aon
a: b: { &: { name:key() } c: {} d: {} }
```

```json
{"a":{"b":{"c":{"name":"c"},"d":{"name":"d"}}}}
```

Other forms:

- **Implicit / cross-statement:** `a:b:{} a:&:{x:1}` →
  `{"a":{"b":{"x":1}}}`.
- **Top-level:** `a:{} &:{x:1}` → `{"a":{"x":1}}` (applied to every root
  key).
- **Lists:** the spread applies to every element, and canon keeps the
  spread entry (`[&:{"x":1},{"y":1,"x":1},…]`):

```aon
l: [&: { x:1 } y:1 y:2]
```

```json
{"l":[{"y":1,"x":1},{"y":2,"x":1}]}
```

**Several templates apply independently, per child.** When one bag
accumulates more than one `&:` template (consecutive spreads, spreads
from different statements, templates arriving by reference through a
conjunction or an id-merge) every child meets the combined constraint
of all of them, and only that: children never meet each other's data
through the templates, whatever mix of literal values, kinds,
references, defaults or `key()` the templates carry. A key one
template requires is required at every child; a default one template
carries defaults (and stays overridable) per child.

<!-- fmt: keep two spreads written as separate statements -->
```aon
w: &: {p: integer}
w: &: {r: integer}
w: x: {p:1, r:5}
w: y: {p:2, r:6}
```

```json
{"w":{"x":{"p":1,"r":5},"y":{"p":2,"r":6}}}
```

## Generating children: `pack` and `each`

A spread constrains children that already exist. `pack` and `each`
**make** them, from data that is already in the model, so the list of
names and the children built from it cannot drift apart:

```aon
names: [web auth billing]

deploy: close(pack($.names, {
  image: "acme/" + key() + ":1.4.2"
  replicas: *2|integer
  port: *8080|integer
}))

deploy: billing: replicas: 4 # an override composes as usual
```

```json
{"names": ["web", "auth", "billing"],
 "deploy": {
   "web":     {"image": "acme/web:1.4.2",     "replicas": 2, "port": 8080},
   "auth":    {"image": "acme/auth:1.4.2",    "replicas": 2, "port": 8080},
   "billing": {"image": "acme/billing:1.4.2", "replicas": 4, "port": 8080}}}
```

`pack(data, tmpl)` makes one **keyed child** per child of `data`. The
keys are **data, never position**: for a list, the strings themselves
(a non-string element is an error, `pack_key`); for a map, its keys.
Each generated child is `tmpl` cloned at that destination, so `key()`
and relative references inside the template answer for the child
rather than for the call. Duplicate keys are not an error: the
colliding children unify, exactly as duplicate source keys merge.

**Instantiation is per destination, to the leaves**. The clone a
destination receives is a *full instance*: nothing in it (not a call's
arguments, not a preference's inner value, not an operator's operands) is
shared with the template or with any sibling destination, and every path
inside it is the destination's. So `close({name: key()})`, `**key(1) |
string` and `.a + 1` inside a template all answer per child, in
expressions and call arguments as much as in bare positions; the first
child's resolution can never answer for the others. The same rule
instantiates a `filter` condition per trial and a spread constraint
(`&:`) per application.

`each(data, tmpl)` makes one **list element** per child of `data`. It
is documented in full [below](#each-the-order-preserving-map); what
matters here is that the same `_` that binds the source child also
lets it be kept, so `each(d, _ & t)` is every member of `d` met with
`t`, and `each(d, _)` is a map's children as a list. The order is
fixed: source order for a list, sorted-key order for a map.

```aon
ports: { http:80 https:443 }
open: each($.ports, _ & integer)
names: each({ b:2 a:1 }, _)
```

```json
{"ports":{"http":80,"https":443},"open":[80,443],"names":[1,2]}
```

Once fired, generated children are **ordinary children**: a
destination `&:` spread applies to them, `close()` seals the generated
shape, references reach into them, and a template may itself contain a
generator.

Both **wait for the model to settle** before they fire, and fire exactly
once. A generator's data can still be merged into by a sibling
statement, an include or a spread after it first looks complete, and
children generated from a half-merged bag would be missing. The data
argument's **snapshot waits for the source too**: a reference like
`pack($.ports, …)` copies its target only once the target has finished
resolving in the tree, so a source augmented by a spread (even one
injecting relative references (`ports: &: {port:
.containerPort}`)) reaches the generator with those references already
answered at the source. Until it fires, a generator canons as its own
call (`pack($.n,…)` with the data reference still standing) which reparses
to the same value.

Neither can recurse. Both iterate a finite bag that already exists, so
the number of children either can produce is fixed by the data:
evaluation still terminates by construction.

### `each`, the order-preserving map

`each(data, tmpl)` makes one **list element** per child of `data`,
being `tmpl` instantiated at that position with `_` bound to the
source child. Written plainly it **replaces** rather than meets: the
element is the template and nothing else, which is what makes it a
construction. Mentioning the hole keeps the child; that is the
[`_ & …` idiom](#the-_---idiom-construction-and-bound) below.

```aon
names: [web auth billing]
files: each($.names, { path:_ + ".ts" })
consts: each($.names, upper(_))
tag: join(each(split("index-build", "-"), upper(_)), "_")
```

```json
{"names": ["web", "auth", "billing"],
 "files": [{"path": "web.ts"}, {"path": "auth.ts"}, {"path": "billing.ts"}],
 "consts": ["WEB", "AUTH", "BILLING"],
 "tag": "INDEX_BUILD"}
```

The order is the data's (source order for a list, sorted-key order for
a map) through the one rule every bag reader uses, and a hidden
child or an unfilled optional is skipped as generation would skip it.
That order is why the list generator is a built-in at all:
`pick(pack(d, {f: t}), f)` maps too, but through a map, so it re-sorts
to code-point order, and the fields of a struct, the imports of a file
or an index in the model's order would come out alphabetised. With
`split` and `join` it closes the name-derivation chain, as `tag`
shows. Like `pack`, it waits for the model to settle and fires once; a
`_` inside its template is its own to bind, never an enclosing
generator's.

### The `_ & …` idiom: construction and bound

`_` inside a generator's template binds the **source child**. Whether
that child survives into the element is decided by one thing: whether
the template mentions the hole.

```aon
ports: [containerPort:80 containerPort:443]
plain: each($.ports, { protocol:TCP })
bound: each($.ports, _ & { protocol:TCP })
```

```json
{"ports": [{"containerPort": 80}, {"containerPort": 443}],
 "plain": [{"protocol": "TCP"}, {"protocol": "TCP"}],
 "bound": [{"containerPort": 80, "protocol": "TCP"},
           {"containerPort": 443, "protocol": "TCP"}]}
```

`plain` **replaces**: the element is the template, and the port
numbers are gone. `bound` **meets**: `_ & {protocol:TCP}` is the child
unified with the template, so each entry keeps its `containerPort` and
gains a `protocol`. One generator, two jobs, and the `_` says which.

Three shapes cover most uses:

| written | the element is | use it for |
|---|---|---|
| `each(d, t)` | `t`, instantiated | building new records from data |
| `each(d, _ & t)` | the child, met with `t` | constraining or extending members |
| `each(d, _)` | the child itself | a map's values as a list |

**`each(d, _ & t)` is a bound**, so everything a meet does applies: a
kind checks the members, a constraint atom bounds them, and a
preference supplies a default the member may override.

```aon
ports: [8080 443]
checked: each($.ports, _ & integer)

m: { b:2 a:1 }
vals: each($.m, _)
```

```json
{"ports": [8080, 443], "checked": [8080, 443],
 "m": {"a": 1, "b": 2}, "vals": [1, 2]}
```

**`each(d, _)` is the map-to-list conversion**: the template is the
hole and nothing else, so every member arrives unchanged, in
sorted-key order for a map and source order for a list.

The same `_` binds in a `pack` template, a `filter` condition and an
`emit` body, and it always names the value that construct is working
on. Two rules are worth knowing:

- **The hole belongs to the nearest enclosing generator.** In
  `pack($.m, {inner: each(_, _)})` the first `_` is the *pack's*
  source child, because a generator's data argument is not a binding
  position, and the second is the `each`'s own.
- **A spread has no hole.** `&: {n: _}` leaves `_` unfilled; inside a
  spread, name the child's fields with a relative reference (`.k`) and
  its key with `key()`.

A meet cannot select, so `_` does not reach into the child: asking for
one of its fields with `each($.lines, _ & _.amount)` asks for
something that is both the whole record and one of its fields. Use
[`pick`](#projecting-fields-pick) to project a field.

## Selecting: `filter` and `match`

`filter(data, cond)` keeps the children of `data` that **already
satisfy** `cond` (keys preserved for a map, order for a list) and
drops the rest silently:

```aon
services: { web: { debug:true port:80 } auth:port:81 }
debugged: filter($.services, { debug:true })
sidecars: pack($.debugged, { image:"acme/debug:1.0" })
```

```json
{"services": {"web": {"debug": true, "port": 80}, "auth": {"port": 81}},
 "debugged": {"web": {"debug": true, "port": 80}},
 "sidecars": {"web": {"image": "acme/debug:1.0"}}}
```

"Already satisfies" means the meet **changes nothing**: `cond` adds no
information the child did not have. Mere unifiability would not do: a map
is open, so `{port:81}` unifies with `{debug:true}` by *gaining* the
key, and a filter that kept everything that could be made to match would
keep everything. The condition is an ordinary value, so the constraint
atoms compose with it: `filter($.deploy, {replicas:min(3)})`.

`match(v, p1, r1, …, d?)` is a **bounded conditional**. The first
pattern in argument order that `v` unifies with selects its result,
which is the answer; a trailing argument (the one that makes the
argument count even) is the default:

```aon
tier: large
size: match($.tier, small, { cpu:1 }, large, { cpu:8 }, { cpu:2 })
```

```json
{"tier":"large","size":{"cpu":8}}
```

Patterns are matched by unifiability, so kinds and atoms work as
patterns (`match(x, integer, …, string, …)`, `match(n, min(0), …)`).
There are no guards, no comparisons beyond the atoms, and no
fallthrough. **No match and no default is an error** naming the
patterns that were tried, not an empty answer: a default is how a
document says the rest was meant to be allowed. An unselected result
is never evaluated, so a broken arm nobody takes is not an error the
document has to carry.

**A defaulted scrutinee matches as the value it generates**. A settled
scrutinee that carries an effective default (a preference, or a
disjunction holding one) is tested as the innermost preferred value,
not as the still-open preference. So with `side_effect: *readonly |
write | destructive`, the derivation `match(.side_effect, destructive,
true, false)` answers `false` when `side_effect` is unset (the effective
value is `"readonly"`), and `true` only when it is genuinely
`destructive`. Before this rule a pattern could *select* an arm by
overriding the default, deriving a value that contradicted the one
generated beside it. A pref-free open disjunction still matches by plain
unifiability.

Both wait for the model to settle before they answer, for the reason
`pack` and `each` do: a bag that is still being merged into is the
wrong bag to take a subset of, and a scrutinee that is still being
narrowed can match an earlier arm than the one it will end up matching.

**A `match` does not fire on an unfilled hole.** `match(_, …)` outside
a generator's template never answers: the peer that would fill the hole
is not also checked against the arm the fill selects (see
[The placeholder `_`](#the-placeholder-_)), so a `match` written as a
schema would accept every document it was asked about. The call stands
unresolved instead, and a `vet` run says so. Inside a generator's
template the hole is the source child, the scrutinee is a value by the
time the match runs, and the form works as documented above.

## The placeholder `_`

A bare `_` is a **hole**: a call holding one waits, and whatever the
call is unified with fills it.

<!-- fmt: keep a template and a key written as separate statements -->
```aon
greeting: upper(_) & hello
x: {&: {m: _ + 2}}
x: a: m: 1
```

```json
{"greeting":"HELLO","x":{"a":{"m":3}}}
```

The peer goes **into** the call and is not also a constraint on the
way out: `upper(_) & hello` is `"HELLO"`, not `"HELLO" & "hello"`.
Two holes meeting is an error: neither has a value to fill the other.
`match` is the one call a peer does not fill, because the arm it would
select is not then checked against that peer: see
[Selecting](#selecting-filter-and-match).

Inside a generator's template, `_` is the **source child** the
generated one is being made from:

```aon
ports: { http:80 https:443 }
open: pack($.ports, { port:_ name:key() })
```

```json
{"ports": {"http": 80, "https": 443},
 "open":  {"http":  {"name": "http",  "port": 80},
           "https": {"name": "https", "port": 443}}}
```

A hole belongs to its **nearest enclosing generator**: an outer
generator's fill pass never reaches into a nested generator's template
(or a `filter`'s condition), so in `pack($.envs, {services:
pack($.fleet, {v: _})})` the inner `_` is the fleet entry, not the env.
A hole in a generator's *data* argument is not a binding position, so it
is still the outer generator's to fill: `pack($.m, {inner: each(_, _)})`
iterates the outer source child. A generator whose data is a hole is
filled by its **peer**, exactly as any other call is (`["a"] &
pack(_, {x:1})` packs the list) which is what lets a rule table be named
(see [Transforming](#transforming-emit)). And wrapping a generator in a call
(`close(pack(d, _ & t))`) does not expose the template's hole to the
wrapper's peers: an overlay statement merges with the generated
children, never with the template.

For a `pack` over a list of names, `_` and `key()` are the same
thing: the name is the key. Over a map they differ: `key()` is the key,
`_` is the value. In a `filter` condition, `_` is the child being
tested.

A hole is not a function parameter: it cannot be named, passed, or
partially applied, and there is no way to write one that is not
already inside a call. Unfilled at generation it is an error, exactly
as `top` is.

A bare `_` is a hole, pinned by `test/spec/place.tsv`. Quoted `"_"`
is that string, any longer bare word containing it (`_b`) is ordinary
text, and `_` as a **key** is a key.

## Transforming: `emit`

`emit(select, table)` applies a **rule table** to a selection of nodes.
For every node, in order, the first template whose `match` the node
unifies with is taken, and its `body` is instantiated against that
node. The answer is one flat list of pieces:

```aon
services: [{ kind:sqs pin:"srv:a" } { kind:http path:"/a" }]

lines: emit($.services, [
  { match:kind:sqs body: ["listen(" + .pin + ")"] }
  { match:kind:http body: ["serve(" + .path + ")"] }
])
```

```json
{"services": [{"kind": "sqs", "pin": "srv:a"}, {"kind": "http", "path": "/a"}],
 "lines": ["listen(srv:a)", "serve(/a)"]}
```

A **table is a list of templates**, tried in order, and each template
is a map naming both a `match` and a `body`. A table of one may be
written as the template map itself. Both keys are required: a template
with no pattern would claim every node by accident, and one with no
body would claim a node and emit nothing.

**The body is a list, and the result is flat.** A body element that is
itself a list splices into the answer rather than nesting, which is
what lets one dispatch compose into another.

**Two things inside a body name the matched node**: `_` is the node,
and a *relative* reference is a field of it: `.pin` is that node's
`pin`. An absolute reference (`$.x`) is untouched and still reads the
document root. A relative reference the node cannot answer is an error
(`emit_ref`) reported against the node, not a miss somewhere else:
inside a body, only a chain of plain names is a field, so a parent step
has no answer at a node that is an origin rather than a position.

**An empty selection emits nothing**, and that is the whole conditional
mechanism: there is no `when` directive because there is nothing for one
to do. A dispatch over a `filter` that selects nothing contributes
nothing:

```aon
services: [{ name:web logs: [] }]

lines: emit($.services, {
  match: name: string
  body: [
    "start " + .name
    emit(filter(.logs, { level:debug }), {
      match: level: debug
      body: ["debug on"]
    })
  ]
})
```

```json
{"services": [{"name": "web", "logs": []}], "lines": ["start web"]}
```

**No match is an error** (`emit_none`), naming the patterns that were
tried, rather than an empty answer or a copy of the node. A template
whose `match` is `any`, written last, is how a document says the rest
of the selection was meant to be allowed.

### A named table

A table written as an ordinary field is evaluated where it sits, so the
relative references in its bodies resolve there and miss. The position
that holds a table unevaluated is the one position the language never
drives: a call's template argument. Write the table as an `emit` whose
**selection is a hole**, and it is a rule set waiting for its nodes:

```aon
%wire = emit(_, { match:pin:string body: ["client(" + .pin + ")"] })

listen: [pin:"srv:a"]
client: [pin:"srv:b"]

a: emit($.listen, %wire)
b: $.client & %wire
```

```json
{"listen": [{"pin": "srv:a"}], "client": [{"pin": "srv:b"}],
 "a": ["client(srv:a)"], "b": ["client(srv:b)"]}
```

Passing the nodes by call and by meet are the same dispatch. A named
table is also how one rule set serves two outputs: naming a value is
something the language already does, so no keyword is needed for it.

### Recursion, and what bounds it

A named table may name **itself**, which is how a rule set walks a
nested structure into nested output:

```aon
tree: [{ name:a kids: [{ name:b kids: [] }] }]

%walk = emit(_, {
  match: name: string
  body: ["<" + .name + ">" emit(.kids, %walk) "</" + .name + ">"]
})

out: emit($.tree, %walk)
```

```json
{"tree": [{"name": "a", "kids": [{"name": "b", "kids": []}]}],
 "out": ["<a>", "<b>", "</b>", "</a>"]}
```

`emit` is the one form here that recurses, and what bounds it is the
**selection**: each dispatch descends into a finite bag that already
exists in the model, and a selection that empties emits nothing. A rule
set that walks into itself without descending is refused as a spent
depth budget, like any other runaway descent.

Like the other combinators, `emit` waits for the model to settle before
it fires: a selection that is still being merged into is the wrong set
of nodes to dispatch over. Until it fires it canons as its own call.

### Replacing text in a body: `replace` and `esc`

A body line is target text, and a value reaches it through a
**`replace`** map rather than a hole: each key is an exact string the
body already holds as ordinary text, and its value is evaluated
against the matched node. Every value is **escaped** by the template's
`esc` convention: the C/JSON escape when the key is absent; `sq` for a
single-quoted literal; `sql`, `shell`, `xml`, `uri` or `regex` by
name; and `none` for a value that is not going into a literal at all:

```aon
services: [{ name:"o'brien" pin:"srv:a" }]

lines: emit($.services, {
  match: name: string
  esc: sq
  replace: { NAME:.name PIN:.pin }
  body: ["seneca.client({type:'sqs',pin:'PIN'})" "await getSeneca('NAME')"]
})
```

```json
{"services": [{"name": "o'brien", "pin": "srv:a"}],
 "lines": ["seneca.client({type:'sqs',pin:'srv:a'})", "await getSeneca('o\\'brien')"]}
```

There is no delimiter to collide with the target's own syntax, so a
deployment template's `${self:provider.stage}` and a backtick string
survive untouched. Three rules bound the substitution: a line is
scanned once, left to right, taking the longest key at each position;
a substituted value is never scanned again, so no value can introduce
a key; and a template's replacements touch its own literal lines
only: a piece spliced in from a nested dispatch carries that template's
replacements and is finished. A number or a boolean value spells
itself, as it does after `+`; a map, a list or a null is refused
(`replace_value`).

Two checks run on the template before any node is visited: a key
inside another key is ambiguous whatever the order
(`replace_overlap`), and a key the body's literal lines do not hold
means the template has drifted from its map (`replace_unused`).

## References and paths

A reference resolves to the value at another location, then unifies in
place.

| Syntax    | Meaning                                              | Example |
|-----------|------------------------------------------------------|---------|
| `$.a.b`   | absolute path from the document root                 | `a:1 b:$.a` → `b:1` |
| `.a.b`    | path relative to the current map                     | `z:x:{a:62} z:y:.x.a` → `y:62` |
| `$.a.1`   | list index: a segment is numeric **only** as a plain decimal integer | `a:[10,20,30] b:$.a.1` → `b:20` |

**Numeric segments are plain decimal integers, and nothing else is.**
`$.a.1` indexes a list and reaches the key `1`. Every other numeric
spelling (hex, `0d`, `_` separators, an exponent) addresses the key
spelled **exactly that way**, because that is what the spelling already
produces on the key side: `a:{0x0:1}` generates `{"0x0":1}`, not
`{"0":1}`, so `$.a.0x0` finds it and `$.a.0` does not.

In a path the dot is always the **separator**, never a decimal point.
That is why `$.a.1.0` is the two segments `1` and `0` (how a nested list
index is written (`a:[[1,2],[3,4]] b:$.a.1.0` → `b:3`)) rather than a
key spelled `1.0`.

References compose with unification and each other: cross-references,
chains, and a referenced map met with extra keys:

```aon
a: { x:1 y:$.b.x }
b: { x:2 y:$.a.x }
c: v: $.d.v
d: v: 99
q: a: x: 1
w: b: $.q.a & { y:2 z:3 }
```

```json
{"a": {"x": 1, "y": 2},
 "b": {"x": 2, "y": 1},
 "c": {"v": 99},
 "d": {"v": 99},
 "q": {"a": {"x": 1}},
 "w": {"b": {"x": 1, "y": 2, "z": 3}}}
```

An unresolvable path is an error: `a:$.nope` →
`Cannot resolve value: $.nope`.

### Recursive references (fixpoints)

A reference to a value **inside that value** is the fixpoint, not an
error. `$.schema.Step` written inside `Step` means "a `Step`, by this
very definition", and the schema applies at every depth of the data:

```aon
schema: hide({ Step: { label:string then?:$.schema.Step } })
doc: $.schema.Step & { label:"start" then:label:"finish" }
```

```json
{"doc": {"label": "start", "then": {"label": "finish"}}}
```

The recursive position expands **one level per meet with concrete
data**, so the checks descend exactly as far as the data does and no
further. Data is finite, so evaluation terminates; the depth budget
is the backstop (`recursion_budget`).

**Guardedness is emergent: the data decides, never a static
analysis.** Under an optional key (`then?:`) the chain ends where
the data ends. A ranked default works the same way:

```aon
schema: hide({ Node: { v:integer next: *null|$.schema.Node } })
doc: $.schema.Node & { v:1 next:v:2 }
```

```json
{"doc": {"v": 1, "next": {"v": 2, "next": null}}}
```

A **required** recursive position that never meets data refuses at
generation, at the exact place no finite document can fill:

```
schema: hide({Step: {label: string, then: $.schema.Step}})
doc: $.schema.Step & {label: "start"}
→ [aontu/recursion_unexpanded]: Cannot recurse value at path $.doc.then
```

In [canonical form](#canonical-form) and the `aon1-` hash the
recursion stays **symbolic**: the instance unrolls to its data and
then says `$.schema.Step`; the definition stays one reference deep.
A recursive schema's canon is finite, reparses to itself, and its
hash pins the mu-form: one string for an infinitely deep type:

```
{"doc":{"label":"start","then"?:{"label":"finish","then"?:$.schema.Step}},
 "schema":{"Step":{"label":string,"then"?:$.schema.Step}}}
```

Mutual recursion (`A` referencing `B` referencing `A`) works the same
way, and so does a recursive [alias](#aliases-), which is enough to
write the JSON value space in one line:

```aon
%json = null|boolean|number|string|[&: %json]|{ &: %json }
x: %json & { a: [1 "two" b:true] }
```

```json
{"x": {"a": [1, "two", {"b": true}]}}
```

[Subsumption](#subsumption) over an unexpanded recursive position
answers `undecided` rather than guessing. The degenerate
self-reference with no structure at all (`a: $.a`) is a residual that
can never expand: its canon is exactly `{"a":$.a}` and generation
refuses with `recursion_unexpanded`. A cycle THROUGH other values
(`a:$.b b:$.a`) is still `path_cycle`: two references chasing each
other name no definition at all.

For the recipe form see
[Define a recursive schema](how-to/define-a-recursive-schema.md); the
live version, with its checks, is
[use-cases/13-recursive-schema](../use-cases/13-recursive-schema/).

## Variables `$name`

`$name` (a bare name with no leading dot) is never resolved from the
document. The calling program supplies it (see
[API reference](reference-api.md#variables)). The shared test set binds
`foo=11`, `bar="hello"`, `flag=true`, `obj={x:1}`:

```
a:$foo               → {"a":11}
a:$bar               → {"a":"hello"}
a:$obj               → {"a":{"x":1}}
a:$foo & number      → {"a":11}            (variables unify like values)
```

An unknown variable is a `Cannot resolve` error.

## Aliases `%`

An **alias** is a name for a value, written with a leading `%`.
`%name = value` at the top level of a file declares one; `%name` in
value position uses it. The `=` is the declaration operator, and it is
an operator nowhere else: `foo = 1` without the sigil is not a
declaration, and neither it nor `a: x=y` is a value: a `=` outside a
declaration is punctuation outside its syntax, refused with
`[aontu/bare_punct]` (see [Lexical structure](#lexical-structure)).
Unlike a
[reference](#references-and-paths), which spells a path into the tree,
an alias names the value directly and belongs to no path:

```aon
%port = integer & min(1) & max(65535)

listen: %port
listen: 8080
admin: %port
admin: 443
```

```json
{ "listen": 8080, "admin": 443 }
```

**The declaration is not part of the document.** It does not generate,
and it does not appear in canon, so the file above and the file with
`integer & min(1) & max(65535)` written out at both keys are the same
document and produce the same [`aon1-` hash](#canonical-form). That is
the whole of what an alias is: a name for a value, and nothing else.

**A colon does not declare.** `%name: value` was the declaration form
until 0.57.0. It is now refused, with the code `alias_colon`, rather
than read as an ordinary key named `%name`, which is what the text would
otherwise become, and which would generate a `"%name"` field and leave
every `%name` use resolving to nothing, neither of them saying why. The
refusal points at the name; write `=`.

**Inside a spread template.** `{&: {a: %D}}` does not resolve the
reference when it is written (a template applies to children that have
not arrived) so the reference stands in the evaluated document. Canon
spells it as the value it names, at any depth: `%u = integer` with
`t: {&: %u}` canons as `{"t":{&:integer}}`, and the file produces the
same [`aon1-` hash](#canonical-form) as the file with `integer`
written in the template. A template that reads its own position, such
as `%row = {name: key()}`, canons as the template (`{"name":key()}`),
not as what `key()` answered at the declaration. One reference keeps
its name: a recursive alias's reference to itself inside its own
template (`%json = null | boolean | number | string | [&: %json] |
{&: %json}`), which no finite text can write out. Such a document
generates and hashes, and its canon is the same in both
implementations, but the canon does not reparse on its own.

**An alias is not a path segment.** `$.%foo` is refused, at any depth:
the alias namespace and the path namespace are disjoint, and an alias
is reached by writing `%foo` and only that.

**A declaration sits at the root of the document.** A nested
`x: { %a = 1 }` is refused: `%a` resolves from the root, so a nested
declaration would be erased from the output (it *is* a declaration) and
still unreachable by any reference (it is *not* at the root): a name
that exists nowhere.

Where the declaration *lands* is what decides this, not where it was
written, which is what makes the two include shapes differ:

- `a: @"f.aon"` is **refused** if `f.aon` declares an alias. The
  declaration is at the root of its own file but not of the document,
  and left writable a `%b` in the *including* file is what `f.aon`'s own
  `%b` would reach.
- `@"f.aon"` spliced at the root is **accepted**. There is one root map,
  so there is no second scope for a name to leak out of, and the
  declaration is a declaration of that one document.

There is no construct for carrying a name across a file boundary
deliberately.

**The `%` is part of the name.** A quoted `"%a"` is an ordinary key or
string, and a `%` anywhere but on an alias name is refused like any
other stray punctuation (`b: 50%` is `[aontu/bare_punct]`; write
`"50%"`):

```aon
a: "%foo"
b: "50%"
```

```json
{ "a": "%foo", "b": "50%" }
```

An alias resolves exactly the way a path reference does, which is where
its properties come from rather than from rules of its own:

- **Order is irrelevant**: a use may precede its declaration.
- **An alias may name another alias**, and a cycle is refused. So is a
  cycle that runs through the document (`%a = $.x` with `x: %a`), because
  there is one reference graph, not two.
- **Two declarations of one name unify**, exactly as two statements for
  one key do: `%n = 1` with `%n = integer` is `1`, and `%n = 1` with
  `%n = 2` is a conflict.
- **A use of an undeclared name is refused**, naming the name.

Aliases are not passed to generated children: a spread template sees the
*expansion*, so children are constrained by the value and acquire no
name.

```aon
%row = { kind:string id:integer }

table: { &: %row a: { kind:user id:1 } b: { kind:user id:2 } }
```

```json
{ "table": { "a": { "kind": "user", "id": 1 },
             "b": { "kind": "user", "id": 2 } } }
```

## The `+` operator and grouping

`+` adds numbers and concatenates strings; it chains left-to-right.
Parentheses group sub-expressions and a leading unary `+` is allowed.

```aon
a: 1 + 2
b: 1 + 2 + 3
c: 1.5 + 2
d: p + q
e: p + q + r
f: (1 + 2)
g: ( + 3 + 4)
h: i: j: 10 + 5
```

```json
{"a":3,"b":6,"c":3.5,"d":"pq","e":"pqr","f":3,"g":7,"h":{"i":{"j":15}}}
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
bigdecimal sum stays a bigdecimal: `x:(0d0.5+0d0.5)&0d1.0` is
`0d1.0`, while `& 0d1` is a conflict.

**Exact arithmetic is exact.** Adding bigdecimals aligns the scales
and adds; nothing is rounded and no precision context is consulted, so
the answers are the ones decimal arithmetic gives on paper:

```
x:0d0.1+0d0.2          → {"x":0d0.3}    (binary64: 0.30000000000000004)
x:0d0.1+0d0.2+0d0.3    → {"x":0d0.6}    (binary64: 0.6000000000000001)
x:0d1.23+0d4.567       → {"x":0d5.797}
```

The same sums, run through the CLI:

<!-- test: scenario exact-sums -->
<!-- test: run -->
```sh
$ echo 'x: 0d0.1 + 0d0.2' | aontu
{
  "x": 0.3
}
$ echo 'x: 0d0.1 + 0d0.2 + 0d0.3' | aontu
{
  "x": 0.6
}
```

A sum too wide to hold is refused, never approximated: see
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
its operands did: integral, inside the int64 window, *and* exactly
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
plain digits with **no `0d` marker**: the marker is canon decoration,
and it never leaks into a string.

```aon
a: q + 0d5
b: q + 0d0.1
c: 0d5 + q
d: q + 0d1e3
e: q + 0d1000
```

```json
{"a":"q5","b":"q0.1","c":"5q","d":"q1000.0","e":"q1000"}
```

The digits are the value's own rendering minus the marker, so the
integral bigdecimal at `d` keeps its one decimal place while the
biginteger at `e` does not. The plain family is unchanged and still
coerces with JavaScript rules, which drop a trailing `.0`:
`x:a+1.0` → `"a1"`, not `"a1.0"`.

**Two lists concatenate.** A `+` whose operands are both lists answers
one list: the left's elements, then the right's, each cloned into its
new index. An empty operand contributes nothing. This is how a
document assembles a list from a written head and a computed tail:

```aon
a: [1] + [2]
b: [] + [2]
c: ["x"] + each(["y"], _)
```

```json
{"a":[1,2],"b":[2],"c":["x","y"]}
```

A list with a scalar is not a sum and is refused, in either order.

**A sum of an absence is absent.** `maybe()` travels through `+` the
way it travels through a call, on either side and whatever the other
operand is, so an optional tail needs no guard:

<!-- test: run -->
```sh
$ echo 'a: 1  b: [1] + maybe($.gone)  c: "x" + maybe($.gone)' | aontu
{
  "a": 1
}
```

See [Optional input: `maybe`](#optional-input-maybe).

Unary `-` negates a numeric operand exactly. It binds tighter than
`+`, `&` and `|` (`-1 & integer` is `(-1) & integer`) and, like `+`,
never narrows the kind and never yields `-0`.

## Functions

aontu provides a fixed set of built-in functions. There are no
user-defined functions. This alphabetical index lists every built-in;
the links lead to its detailed behaviour and examples.

The argument modes describe how a call uses its arguments: `template`
is instantiated for a selected value, `trial` supplies a condition,
`projector` names a field or index, `capture` preserves a path's spelling,
and `text` supplies literal text. An unmarked argument supplies a value.

For collection operations, compare [pack and each](#generating-children-pack-and-each),
[the `_ & …` idiom](#the-_---idiom-construction-and-bound), [filter and
match](#selecting-filter-and-match), [pick](#projecting-fields-pick),
and [emit](#transforming-emit).
`pack` and `each` construct collections; `filter` selects members;
`pick` projects a field; `emit` applies a rule table and flattens its output.

### `abnf(g: string) : string`

Compile an RFC 5234 ABNF grammar and answer its source, so a parser is an ordinary string. A grammar that does not compile is refused here, once, rather than at every site that parses with it. See [grammars](#grammars-abnf-and-parse).

Example: `G: abnf("v = 1*DIGIT")`

### `above(n: number|string) : constraint`

Constrain a numeric or string value to be strictly greater than a bound. See [bounds](#the-constraint-algebra).

Example: `integer & above(0)`

### `acyclic() : constraint`

Require the edges of a declared relation to contain no cycle. See [declared relations](#declared-relations).

Example: `rel() & acyclic()`

### `add(a: number, b: number) : number`

Add two numbers under the [number-tower rules](#arithmetic-add-sub-mul-div-mod-rem).

Example: `add(2, 3)` → `5`

### `below(n: number|string) : constraint`

Constrain a numeric or string value to be strictly less than a bound. See [bounds](#the-constraint-algebra).

Example: `integer & below(10)`

### `close(m: any) : any`

Seal a map/list against extra keys.

Example: see [closed values](#closed-values-close--open)

### `content(spec: string|map) : map`

A Jostraca Content component: a span of target text. A bare string
fills `src`.

Example: `content("export const N = 1\n")`

### `copy(v: any) : any`

Deep copy of a value or referenced node; clears `type`/`hide` marks.

Example: `copy({a:1,b:2})`→`{a:1,b:2}`; `copy($.x)`

### `copyfiles(spec: string|map) : map`

A Jostraca CopyFiles component: files copied verbatim from `from`.
Named `copyfiles` because `copy` already copies a VALUE.

Example: `copyfiles("assets")`

### `deprecate(v: any, r?: map) : any`

Mark `x` deprecated; unifies exactly as `x`, and the record `m` (`{msg?, use?, since?}`, all strings; `use` is a path spelled as a string) rides the result through meets, reference clones and spread applications. Canon renders the call back; generation is unchanged. The point-of-use surfaces: a vet `deprecated` warning, the LSP Deprecated tag, and `aontu breaking --allow-deprecated-removal`.

Example: `port: deprecate(*8080|integer, {msg:"renamed", use:"$.listen", since:"2.0.0"})`

### `div(a: number, b: number) : number`

Divide two numbers; integer division truncates towards zero. See [arithmetic and refusals](#arithmetic-add-sub-mul-div-mod-rem).

Example: `div(7, 2)` → `3`

### `each(d: map|list, template t: any) : list`

Construct one list element per source child by instantiating a template with `_` bound to that child. See [form](#each-the-order-preserving-map).

Example: `each([a, b], upper(_))` → `["A", "B"]`

### `emit(s: map|list, template t: map|list) : list`

One flat list of pieces from a selection and a rule table: for each node, the first template whose `match` it unifies with, its `body` instantiated at that node. See [Transforming](#transforming-emit).

Example: `lines: emit($.services, {match:{pin:string}, body:[.pin]})`

### `esc(s: string, variant?: string) : string`

Escape a string using a named convention; the default is JSON-style double-quoted text. See [escaping](#escs-variant-and-uscs-variant).

Example: `esc("<a>", xml)`

### `file(spec: string|map, children?: list) : map`

A Jostraca File component named by `name`, holding content, lines,
fragments, injections and copies.

Example: `file("index.ts", [content("export {}\n")])`

### `filter(d: map|list, trial c: any) : map|list`

The children of `d` that ALREADY satisfy `c`: the meet with `c` changes nothing. Keys kept for a map, order for a list; the rest are dropped, not refused. See [Selecting](#selecting-filter-and-match).

Example: `debugged: filter($.services, {debug:true})`

### `folder(spec: string|map, children?: list) : map`

A Jostraca Folder component named by `name`, holding folders, files
and copies.

Example: `folder("src", [file("index.ts")])`

### `fragment(spec: string|map, children?: list) : map`

A Jostraca Fragment: a file read from `from` with its `<[SLOT]>`
markers filled by the slots beneath it.

Example: `fragment("head.ts", [slot("body")])`

### `greatest(d: map|list) : number`

Return the greatest numeric member, preserving its kind. An empty collection is refused. See [aggregates](#aggregating-sum-least-greatest).

Example: `greatest([2, 7, 4])` → `7`

### `hide(v: any) : any`

Mark `x` as hidden.

Example: `hide(world) & string`→`"world"`

### `inject(spec: string|map, children?: list) : map`

A Jostraca Inject: a body written between markers in a file that
already exists.

Example: `inject("routes", [line("app.use(r)")])`

### `inverse(projector k: string) : constraint`

Require every edge of a declared relation to have a corresponding edge under the named inverse. See [declared relations](#declared-relations).

Example: `rel() & inverse(usedBy)`

### `join(d: map|list, sep?: string) : string`

Join collection members as text, with an optional separator. See [join](#folding-to-a-string-join).

Example: `join([a, b], ", ")` → `"a, b"`

### `key(up?: integer|biginteger) : string`

The ancestor key `n` levels up (`0` = own key, default `1` = parent). `n` must be an **integer** (`integer` or `biginteger`); anything else is an error. A level beyond the top of the path yields `""`.

Example: at `a:b:c`: `key()`→`"b"`, `key(0)`→`"c"`, `key(2)`→`"a"`, `key(2.0)`→error

### `least(d: map|list) : number`

Return the least numeric member, preserving its kind. An empty collection is refused. See [aggregates](#aggregating-sum-least-greatest).

Example: `least([2, 7, 4])` → `2`

### `length(n: number|constraint) : constraint`

Constrain a string length or collection size. See [length semantics](#length-semantics).

Example: `list() & length(min(1))`

### `line(spec: string|map) : map`

A Jostraca Line: a span of target text with a newline added, which
is the whole difference from `content`.

Example: `line("import fs from 'fs'")`

### `list() : list`

The list **kind**: admits any list, defaults to nothing.

Example: `y: list() & [1]`→`[1]`

### `listitems(spec: map, children?: list) : map`

A Jostraca ListItems over the list at `item`. The bag is required
and must be a list: a missing one would render nothing, silently.

Example: `listitems({item: $.rows}, [line("x")])`

### `lower(s: string|number, start?: integer|biginteger, len?: integer|biginteger) : string`

Lowercase a string, or a run of it; **floor** of a number, keeping the argument's kind. The range is `upper`'s; see [`upper`](#uppers-stringnumber-start-integerbiginteger-len-integerbiginteger--string).

Example: `lower(ABC)`→`"abc"`, `lower("FOO",1,-1)`→`"Foo"`, `lower("FOOBAR",-3,-1)`→`"fooBAR"`, `lower(1.9)`→ float `1`

### `map() : map`

The map **kind**: admits any map, defaults to nothing. See [Container kinds](#container-kinds-map-and-list).

Example: `y: map() & {a:1}`→`{a:1}`; `y: map()`→ error

### `match(s: any, ...pr: (trial any, any), dflt?: any) : any`

The result of the first pattern `v` unifies with; a trailing argument is the default. No match and no default is an error naming the patterns tried.

Example: `size: match($.tier, small, {cpu:1}, {cpu:2})`

### `max(n: number|string) : constraint`

Constrain a numeric or string value to be at most the bound. See [bounds](#the-constraint-algebra).

Example: `integer & max(10)`

### `maybe(v: any) : any`

The value when it resolves, and **absence** when the only thing wrong is that it is not there. See [Optional input](#optional-input-maybe).

Example: `maybe($.gone)` generates nothing; `maybe($.here)` is `$.here`

### `min(n: number|string) : constraint`

Constrain a numeric or string value to be at least the bound. See [bounds](#the-constraint-algebra).

Example: `integer & min(0)`

### `mod(a: number, b: number) : number`

Compute a modulo whose nonzero result follows the divisor's sign. See [arithmetic](#arithmetic-add-sub-mul-div-mod-rem).

Example: `mod(-7, 3)` → `2`

### `move(v: any) : any`

Resolve reference `p`, dropping unresolved optional keys.

Example: `m:{x?:number,y:Y} n:move($.m)`→`n:{y:"Y"}`

### `mul(a: number, b: number) : number`

Multiply two numbers under the [number-tower rules](#arithmetic-add-sub-mul-div-mod-rem).

Example: `mul(2, 3)` → `6`

### `must(trial c: any, text msg: string) : constraint`

Apply an evaluation-time condition with an author-supplied failure message. See [must](#band-b-must).

Example: `must(min(1), "must be positive")`

### `neq(...vals: number|string) : constraint`

Exclude the listed numeric or string values. See [constraint atoms](#the-constraint-algebra).

Example: `string & neq("reserved")`

### `nom(name: string, style?: string|list, acronyms?: list) : string|map`

One name in one spelling, or every spelling as a map when no style
is named: `camel`, `dot`, `kebab`, `pascal`, `path`, `snake`,
`text`, `title` and `upper`. An acronym list keeps `id` as `ID`.

Example: `nom("planet_body", pascal)` → `"PlanetBody"`

### `open(m: any) : any`

Reverse a `close`.

Example: `open(close({x:1})) & {y:2}`→`{x:1,y:2}`

### `pack(d: map|list, template t: any) : map`

One keyed child per child of `d`, each of them `t` cloned at that destination. Keys are the strings of a list, or the keys of a map. See [Generating children](#generating-children-pack-and-each).

Example: `deploy: pack($.names, {replicas:*2|integer})`

### `parse(g: string, v?: string) : map|list|constraint`

Parse a string under a grammar and answer what the grammar says it builds: the syntax tree, or the map or list a **value annotation** asks for. With no value, the grammar as a **constraint** on whatever meets it, answering that value unchanged. A failure to parse is a failure to unify. See [grammars](#grammars-abnf-and-parse).

Example: `parse($.G, "12")` → `{rule:"v" src:"12" kids:[...]}`; `*"" | parse($.G)`

### `path(capture p?: path) : path`

**capture** `p` as a path value: the spelling, never the resolution; with no argument, the path **kind**. See [First-class paths](#first-class-paths-pathp).

Example: `dep: path(.auth)` generates `".auth"`; `host: path()`

### `pick(d: map|list, projector k: string|integer) : any`

Project one field or index from every collection member into a list. See [pick](#projecting-fields-pick).

Example: `pick([{n:a}, {n:b}], n)` → `["a", "b"]`

### `pref(v: any) : any`

Mark `x` as preferred (same as `*x`).

Example: `pref(1)` canon `*1`; `pref(2),x:3`→`3`

### `project(spec?: string|map, children?: list) : map`

The Jostraca Project root; its `folder` is the output directory and
is the one prop that is not required.

Example: `project("./build", [folder("src")])`

### `re(text p: string) : constraint`

Constrain a string to match a portable regular expression. See [patterns](#re-and-the-portable-pattern-subset).

Example: `string & re("^[a-z]+$")`

### `refer(template t?: any) : constraint`

Constrain a field to a **path value whose address resolves**; `t`, if given, is unified into the target. The field keeps the address. See [Checked links](#checked-links-refert).

Example: `dependsOn: [&: refer($.aontu.System.Service), path($.services.auth)]`

### `rel(template t?: any) : constraint`

Declare a field as a relation and optionally constrain its targets. See [declared relations](#declared-relations).

Example: `dependsOn: rel() & [path($.auth)]`

### `rem(a: number, b: number) : number`

Compute the remainder of truncating division. See [arithmetic](#arithmetic-add-sub-mul-div-mod-rem).

Example: `rem(-7, 3)` → `-1`

### `rep(s: string, text p: string, text sub: string) : string`

Replace every pattern match in a string. See [replacement syntax](#reps-pattern-sub).

Example: `rep("a1b2", "[0-9]", "_")`

### `slot(spec: string|map, children?: list) : map`

A Jostraca Slot: the body that fills a fragment's named marker.

Example: `slot("body", [line("return 1")])`

### `sort(d: map|list, projector k?: string|integer, dir?: string) : list`

Order a collection's members into a list, by a projected field or by the members themselves. See [Ordering](#ordering-sort).

Example: `sort([3, 1, 2])` → `[1, 2, 3]`

### `split(s: string, sep: string|constraint) : list`

Split a string using a literal separator or a pattern constraint. See [split](#splits-sep).

Example: `split("a,b", ",")` → `["a", "b"]`

### `sub(a: number, b: number) : number`

Subtract the second number from the first. See [arithmetic](#arithmetic-add-sub-mul-div-mod-rem).

Example: `sub(7, 2)` → `5`

### `sum(d: map|list) : number`

Add the numeric members of a collection; an empty collection sums to zero. See [aggregates](#aggregating-sum-least-greatest).

Example: `sum([2, 3])` → `5`

### `super(t: any) : any`

The immediate parent type of `x`, structurally: a scalar's kind, a kind's parent, a container of its children's parents.

Example: `super(1)` → `integer`, `super(integer)` → `number`, `super({a:1})` → `{a:integer}`

### `translate(s: string, from: string, to?: string) : string`

Map the characters of `s` from one set to another. A range expands
(`a-z`), a short `to` pads with its last character, and an omitted
`to` deletes every character named in `from`.

Example: `translate("a-b-c", "-", "_")` → `"a_b_c"`

### `type(t: any) : any`

Mark `x` as a type/schema value.

Example: `type(1) & number`→`1`

### `unique(projector k?: string) : constraint`

Require distinct members, optionally comparing a named field. See [unique semantics](#unique-semantics).

Example: `list() & unique(id)`

### `upper(s: string|number, start?: integer|biginteger, len?: integer|biginteger) : string`

Uppercase a string, or a run of it; **ceiling** of a number, keeping the argument's kind.

`start` is a boundary. Zero or positive, the run begins there and reaches forward; negative, it counts from the end and the run stops there, the character it lands on being the first one left alone. `len` is how many characters; `-1`, which is also the default, is the whole source. Both ends clamp, so a run past either end does as much as exists. Indices are code points. A range on a number is refused.

Example: `upper(abc)`→`"ABC"`, `upper("foo",0,1)`→`"Foo"`, `upper("foo",1)`→`"fOO"`, `upper("foo",-1,2)`→`"FOo"`, `upper(1.1)`→ float `2`

### `usc(s: string, variant?: string) : string`

Decode text escaped with the named convention, refusing malformed input. See [escaping](#escs-variant-and-uscs-variant).

Example: `usc(esc("<a>", xml), xml)` → `"<a>"`


### Parent types

`super(x)` answers the immediate parent type of its **argument**. For
a concrete scalar that is the scalar's kind, and for a kind it is the
kind's own parent: `number` sits above the four numeric leaves, so
the numeric ladder has a real middle rung. For structured arguments,
`super` descends: a map lifts to the map of its values' parents (key
optionality, closedness and any `&:` spread carried over, the spread
template lifted), a list lifts element by element, a preference lifts
to its value's parent, a disjunction lifts arm by arm, and a
constraint lifts to the kind it constrains: its absorbed leaf kind
when it has one, otherwise the domain its atoms compare in.

<!-- test: scenario super-parent-type -->
<!-- test: run -->
```sh
$ echo 'a: super(1)  b: super(1.5)  c: super(integer)  d: super(number)' | aontu -c
{"a":integer,"b":float,"c":number,"d":top}
$ echo 'e: super({port: 8080, name?: web})  f: super([1, on])' | aontu -c
{"e":{"name"?:string,"port":integer},"f":[integer,string]}
$ echo 'g: super(*8080)  h: super(1|2)  i: super(min(3))  j: super(integer & min(3))' | aontu -c
{"g":integer,"h":integer,"i":number,"j":integer}
$ echo $?
0
```

The result is a type, so it constrains: lifting an example produces
a schema the example itself satisfies:

<!-- test: scenario super-as-schema -->
<!-- test: run -->
```sh
$ echo 'x: super({a:1}) & {a: 7}' | aontu
{
  "x": {
    "a": 7
  }
}
$ echo 'x: super({a:1}) & {a: 7.5}' | aontu
[aontu/no_scalar_unify]: Cannot unify values at path $.x.a
...
$ echo $?
1
```

The answer is `top` only where `top` is the immediate parent: the
root kinds (`number`, `string`, `boolean`), `top` itself, a
disjunction with an arm that lifts to `top`, and a constraint that
admits several container kinds (`length(n)` constrains strings, lists
and maps alike). Two edges are pinned in `test/spec/super.tsv`: a
recursion residual met by `super` stays a symbolic call (the finite
spelling of a lift that is itself recursive) which generation
refuses like any unresolved call, and `super(null)` answers the null
kind, which canon prints as `null`, the same spelling as the value.

### Rounding numbers

`upper()` and `lower()` round a number without narrowing it: the result
carries the *argument's* kind, so `upper(2)` is an integer `2` (and
unifies with `integer`) while `upper(1.1)` is a float `2` (and does
not). On the exact leaves they are exact ceiling and floor: no
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

### Composing calls

Functions compose with operators, references, list elements, and the
preference mark:

```aon
a: upper(abc) + def
b: lower(1.1) + 2
c: foo
d: upper($.c)
e: [lower(A) lower(B)]
f: *upper(foo)
```

```json
{"a":"ABCdef","b":3,"c":"foo","d":"FOO","e":["a","b"],"f":"FOO"}
```

## Arithmetic: `add` `sub` `mul` `div` `mod` `rem`

Maths beyond `+` is spelled with **functions**. The tokens `-` `*` `/`
`%` stay reserved for the language's own use, so there is no infix
arithmetic to learn beyond `+` and unary `-`:

```aon
replicas: mul($.base.replicas, 2)
spare: sub($.quota.cpu, $.used.cpu)
shards: div($.total, $.per_shard)
```

Each takes exactly **two operands**, and both must be numbers. That is
what distinguishes `add` from `+`: the operator is polymorphic and will
happily concatenate, so a Kubernetes quantity written `"500m" + "500m"`
is the string `"500m500m"` and nothing complains. `add("500m","500m")`
is an error, because a function named for a numeric operation has no
business inventing a string.

```aon
a: add(1, 2)
b: sub(10, 3)
c: mul(6, 7)
```

```json
{"a":3,"b":7,"c":42}
```

A non-number operand is an `invalid-arg` error whatever its shape:
`add("a","b")`, `add(true,1)` and `sub(integer,1)` are all refused.

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
only in whose sign the answer follows: `rem`'s the dividend's, `mod`'s
the divisor's. That is the whole reason both exist:

```aon
a: div(7, 2)
b: div(-7, 2)
c: rem(-7, 2)
d: mod(-7, 2)
e: rem(7, -2)
f: mod(7, -2)
```

```json
{"a":3,"b":-3,"c":-1,"d":1,"e":1,"f":-1}
```

`b` is `-3`, not `-4`: truncation, not flooring.

Three things are refused rather than answered, each because the answer
would be a value aontu cannot carry:

- **A zero divisor**, in every leaf including floats. A JSON superset
  has no notation for an infinity, so there is nothing `div(7,0)` could
  return (`divide_by_zero`).
- **A non-finite float result**: `mul(1.0e200,1.0e200)` overflows
  binary64 (`float_overflow`). The same check governs `+`.
- **`div`, `mod` or `rem` over a bigdecimal.** One third has no finite
  decimal form, so exact decimal division either rounds (the one thing
  that leaf exists to prevent) or refuses (`inexact_divide`). Scale to
  integers first, which is how money should be carried anyway (minor
  units as an integer), or use floats if an approximation is acceptable.
  Note `0d10` is a *biginteger*, not a decimal, so `div(0d10,0d4)` is
  `0d2`; it is `0d10.0` that is refused.

An exact result that will not store is refused too, exactly as a sum is
(`inexact_integer_sum`): `mul(4503599627370496,4503599627370496)` is an
error rather than a rounded answer, and `0d` operands compute it
exactly.

## Projecting fields: `pick`

`pick(data, key)` returns a list containing the named field from each
member of a map or list. Use it to turn records into the values that
an aggregate or a string join needs:

```aon
lines: [amountCents:1200 amountCents:450]
amounts: pick($.lines, amountCents)
total: sum($.amounts)
```

```json
{"amounts":[1200,450],"lines":[{"amountCents":1200},{"amountCents":450}],"total":1650}
```

`amountCents` is a field name supplied to the projector argument.
The bare word and the quoted string `"amountCents"` name the same key.
The result preserves each selected value's kind and structure; picking
a map-valued field returns that map as one element, without flattening it.

### Order and list indexes

A list is visited in source order. A map is visited in sorted-key order,
and its keys do not appear in the resulting list. For members that are
lists, supply a zero-based integer index:

```aon
records: { z:name:last a:name:first }
names: pick($.records, name)
first: pick([[9 8] [7 6]], 0)
empty: pick([], name)
```

```json
{"empty":[],"first":[9,7],"names":["first","last"],"records":{"a":{"name":"first"},"z":{"name":"last"}}}
```

The empty collection returns an empty list. As with `each`, hidden or
type-marked collection members and unfilled optional members are skipped.
This selection happens before `pick` reads the requested field.

### Missing fields and invalid arguments

Every selected member must contain the requested field or index.
A missing key, an out-of-range index, or a scalar member is `pick_key`.
The call refuses the projection instead of returning a shorter list:

<!-- test: scenario pick-missing-field -->
<!-- test: run -->
```sh
$ echo 'x: pick([{a:1}, {b:2}], a)' | aontu
[aontu/pick_key]: Cannot pick value at path $.x
...
$ echo $?
1
```

A non-collection input is `aggregate_data`. The key must be a string
name or an `integer` index; a float such as `0.0`, a kind, or a list is
`invalid-arg`. A missing argument is `func_arity`.

A projector names one key, not a dotted path expression. Project twice
to select through two levels:

```aon
records: [address:city:Dublin address:city:Cork]
cities: pick(pick($.records, address), city)
```

```json
{"cities":["Dublin","Cork"],"records":[{"address":{"city":"Dublin"}},{"address":{"city":"Cork"}}]}
```

### Choose projection or construction

Use `pick(records, name)` to extract a field. Use
[`each`](#each-the-order-preserving-map) when each output element needs
an expression or a new structure. The bound spelling `each(records, _ &
t)` unifies each source member with a template; it preserves that
member's information rather than extracting one field from it.

Compose the resulting list with [sum](#aggregating-sum-least-greatest)
for a total or [join](#folding-to-a-string-join) for a line of text.

## Optional input: `maybe`

A path that names nothing is `no_path`, and that is right: a typo
should be loud. It leaves a document that reads **optional** input with
nothing to say, though, because the miss refuses the whole call.
`maybe(v)` is the value when it resolves, and **absence** when the only
thing wrong is that it is not there.

**Absence generates nothing**, at a required key as readily as at an
optional one, and from a list without leaving a hole. That is the whole
difference from `top`, which is not generable and refuses with
`mapval_no_gen`.

<!-- test: run -->
```sh
$ echo 'a: 1  b: maybe($.gone)  c: [1, maybe($.gone), 2]' | aontu
{
  "a": 1,
  "c": [
    1,
    2
  ]
}
```

**A call on an absent argument is no call.** Absence travels through
every built-in, in any argument position, and through
[`+`](#the--operator-and-grouping), so a transform written against
optional input needs no guard around it.

<!-- test: run -->
```sh
$ echo 'a: 1  b: each(maybe($.tags), {t:_})  c: join(maybe($.tags), "-")' | aontu -c
{"a":1,"b":maybe(),"c":maybe()}
```

**Absence is the unit of `&`**, on either side, so meeting it with a
constraint leaves the constraint:

<!-- test: run -->
```sh
$ echo 'a: 1 & maybe($.gone)  b: maybe($.gone) & 2' | aontu -c
{"a":1,"b":2}
```

**Only a missing referent is forgiven.** A conflict inside the argument
is the document's own bug and is reported where it happened, not
swallowed:

<!-- test: scenario maybe-keeps-conflict -->
<!-- test: run -->
```sh
$ echo 'b: maybe(1 & 2)' | aontu
[aontu/scalar_value]: Cannot unify values at path $.b
...
$ echo $?
1
```

**It waits for the model.** A reference that has not resolved yet is
not a reference to nothing, so `maybe` fires only once the document has
settled, the way [`each`](#each-the-order-preserving-map) and
[`pack`](#generating-children-pack-and-each) do. A forward reference
therefore answers the value:

<!-- test: run -->
```sh
$ echo 'b: maybe($.x)  x: 1' | aontu -c
{"b":1,"x":1}
```

**It cannot make a containing map vanish.** Absence travels through a
call and out of a list element, not out of a map that still has other
keys: `{k:"frag", n: emit(maybe($.tags), t)}` drops `n` and keeps a
`{k:"frag"}` behind. Write the whole element as the optional thing, not
one of its fields.

**A constrained list refuses it.** Absence leaves a plain list without
a hole, but a list carrying a spread meets every element against the
spread's template, and absence is not a member that template admits:

<!-- test: scenario maybe-under-a-spread -->
<!-- test: run -->
```sh
$ echo 'x: ["a", maybe($.gone)]' | aontu -c
{"x":["a",maybe()]}
$ echo 'x: [&: string]  x: ["a", maybe($.gone)]' | aontu
[aontu/listval_no_gen]: Cannot resolve value at path $.x.1
...
$ echo $?
1
```

So an optional member of a list a schema constrains is written as an
optional KEY of the map that holds it, or the spread is dropped from
the list.

## Ordering: `sort`

Generation supplies two orders, and neither is the one a report or a
rendered file wants: a map generates in **sorted-key** order and a list
in **source** order. `sort(data)` is the third.

**It answers a list, from either container.** A map has no order of its
own to be put in, which is the reason `Semver` is a list as well.

<!-- test: run -->
```sh
$ echo 'a: sort([3, 1, 2])  b: sort({x:"c", y:"a"})' | aontu -c
{"a":[1,2,3],"b":["a","c"]}
```

**The second argument projects**, exactly as `pick`'s does: a key name
for a map member, an index for a list member.

<!-- test: run -->
```sh
$ echo 'a: sort([{n:"b"}, {n:"a"}], n)' | aontu -c
{"a":[{"n":"a"},{"n":"b"}]}
```

**The third is `asc` or `desc`**, and omitting it is `asc`. The
projector comes first, so a keyless descending sort writes the empty
projector, which means the member itself.

<!-- test: run -->
```sh
$ echo 'a: sort([{n:1}, {n:3}], n, desc)  b: sort([1, 3, 2], "", desc)' | aontu -c
{"a":[{"n":3},{"n":1}],"b":[3,2,1]}
```

**Equal keys keep source order**, in both directions. The source
position breaks every tie, which makes the order a total one, so the
two implementations answer the same list whatever their own sort does
with equals.

<!-- test: run -->
```sh
$ echo 'a: sort([{k:1,v:"a"}, {k:1,v:"b"}, {k:0,v:"c"}], k, desc)' | aontu -c
{"a":[{"k":1,"v":"a"},{"k":1,"v":"b"},{"k":0,"v":"c"}]}
```

**There are two orders and no third.** Numbers compare through the
exact comparator, never through binary64, so a bigdecimal and an
integer in one bag order by their values. Text compares by code point.
A bag that mixes the two, or that holds a boolean, a null or a
container, has no order to be put in and is refused (`sort_domain`). A
member with no key to order by is `sort_key`, for the reason
[`pick`](#projecting-fields-pick) refuses one: a shorter list is a
different answer. A direction naming no direction is `sort_dir`.

<!-- test: run -->
```sh
$ echo 'a: sort([0d9007199254740993, 9007199254740992])' | aontu -c
{"a":[9007199254740992,0d9007199254740993]}
```

**A sort sees the members generation emits**, the rule every bag reader
follows: a `hide()`- or `type()`-marked child is not one, and neither
is an optional key that generates nothing.

Composed with [`pick`](#projecting-fields-pick) it turns a bag of
records into an ordered line of source, and with
[`join`](#folding-to-a-string-join) into the text of one:

<!-- test: run -->
```sh
$ echo 'cols: [{n:"id"}, {n:"age"}]  sql: join(pick(sort($.cols, n), n), ", ")' | aontu -c
{"cols":[{"n":"id"},{"n":"age"}],"sql":"age, id"}
```

## Aggregating: `sum` `least` `greatest`

`length()` counts a bag; these three fold one. Each takes a **single
bag** (a list or a map) and walks the children the model already
holds:

```aon
lines: [1200 450 3000]
total: sum($.lines)
lowest: least($.lines)
peak: greatest($.lines)

hourly: { p50:12 p95:40 p99:91 }
spike: greatest($.hourly)
```

```json
{"lines": [1200, 450, 3000],
 "total": 4650, "lowest": 450, "peak": 3000,
 "hourly": {"p50": 12, "p95": 40, "p99": 91},
 "spike": 91}
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
comparator rather than through binary64: `0d9007199254740993` and
`9007199254740992` share a float image but are correctly ordered here.

A value that is not a bag is `aggregate_data`; a member that is not a
number is `invalid-arg`, reported against the aggregate the author
wrote rather than against the `add` inside it.

There is no `fold` combinator and will not be one: a fold takes a
function, and this language has no user functions to give it. These
three are total because the bag is finite, the operation is fixed, and
each child is visited once: the same argument that makes `each` safe.

## Folding to a string: `join`

`join(coll, sep?)` folds a bag into one string: every member rendered
as text, with `sep` between them. It is the counterpart of `sum`: one
takes a bag to a number, the other to a string.

<!-- test: scenario join-fold -->
<!-- test: run -->
```sh
$ echo 'ports: [8080, 443]  addr: join($.ports, "-")' | aontu -c
{"addr":"8080-443","ports":[8080,443]}
```

**The separator defaults to the empty string**, so `join(coll)` is
concatenation. That is why there is no `concat` and no `lines`: with a
separator argument, one function covers both.

<!-- test: run -->
```sh
$ echo 'a: join([x, y, z])  b: join([x, y, z], ", ")' | aontu -c
{"a":"xyz","b":"x, y, z"}
```

**A fold sees the members generation emits.** `join`, and with it
`each`, `emit`, `filter`, `pack`, `pick` and the aggregates, read a
bag's *members*: a `hide()`- or `type()`-marked child is not one, and
an optional key whose value generates nothing is not one, so a value
the document withholds from its output never reaches a string or a
total the document computes. Canon still shows the whole document; the
fold does not.

<!-- test: run -->
```sh
$ echo 'm: {a: "keep", b: hide("SECRET")}  s: join($.m, "-")' | aontu -c
{"m":{"a":"keep","b":"SECRET"},"s":"keep"}
```

A reference still lifts a hidden bag: `each($.schema.entities, _)`
under `schema: hide({…})` sees every entity, because there the mark
belongs to the schema, not to any one entity.

**`join` folds with `+`**, exactly as `sum` folds with `add`. The
number-to-text rule is therefore `+`'s own and not a second one: no
`0d` marker, no `.0` float suffix, and the exact digits of a big
integer.

<!-- test: run -->
```sh
$ echo 'a: join([1, 2.0, 0d0.5, true], "|")' | aontu -c
{"a":"1|2|0.5|true"}
```

**`join([])` is `""`**, concatenation's identity: the parallel of
`sum([]) == 0`, and the opposite of `least([])`, which refuses because
comparison has no identity to answer with.

A map folds in **sorted-key order** and a list in source order, which
is `each`'s rule and `pick`'s. For a generated file this matters: list
order is *source* order, so a list is what a transform should build
its lines in.

<!-- test: run -->
```sh
$ echo 'm: {b: B, a: A}  x: join($.m, ",")' | aontu -c
{"m":{"a":"A","b":"B"},"x":"A,B"}
```

Composed with `pick`, it is the step that turns a bag of records into
a line of source:

<!-- test: run -->
```sh
$ echo 'cols: [{n: id}, {n: email}]  sql: join(pick($.cols, n), ", ")' | aontu -c
{"cols":[{"n":"id"},{"n":"email"}],"sql":"id, email"}
```

**A member that is settled but not text is an error** (`join_member`),
raised at the member rather than at generation. `+` with a string on
the left *residuates* on a map or a null rather than refusing, so
folding blindly would report the failure late and name the whole call
instead of the member that caused it.

<!-- test: run -->
```sh
$ echo 'a: join([{x: 1}], ",")' | aontu
[aontu/join_member]: Cannot join value at path $.a
...
$ echo $?
1
```

**A member that is merely unresolved is not an error at all.** The call
stays residual and generation reports ordinary incompleteness, so
`join` can be written in a schema over data that has not arrived:

<!-- test: run -->
```sh
$ echo 'names: [string]  line: join($.names, ",")' | aontu -c
{"line":join([string],","),"names":[string]}
```

The separator must be a **string**. A number would render perfectly
well through `+` and is still refused: the separator is not a member of
the fold but the parameter naming the text between members, and
`join(x, 5)` is far likelier a mistake than an intent (`invalid-arg`).

A value that is not a bag is `aggregate_data`, as it is for the
aggregates.

## Text: `esc` `usc` `rep` `split`

Four ordinary string functions. They return values and compose with
`+`, and they know nothing about generation, but they are what a
generator needs, because a generator interpolates values into literals
and derives names from data.

### `esc(s, variant?)` and `usc(s, variant?)`

`esc` makes a string safe to place inside a literal; `usc` reads it
back out. **A variant names a convention, not a language**: several
languages share one convention, and one language has several: a C-family
literal escapes differently in each quote, and SQL spells a literal one
way and an identifier another.

| variant | convention |
|---------|------------|
| *(none)* | C / JSON, double-quoted: TypeScript, JavaScript, Java, C, C++, C#, Go, Rust, Swift, Kotlin, Scala and JSON itself |
| `sq` | single-quoted C-family |
| `sql` | standard SQL, which doubles the quote |
| `shell` | POSIX single-quote |
| `xml` | the five entities; covers HTML |
| `uri` | percent-encoding, RFC 3986 |
| `regex` | the metacharacters the pattern subset admits |

```aon
plain: esc("plain text")
inner: esc("it\'s", sq)
table: esc("o\'brien", sql)
markup: esc("<a>&", xml)
address: esc("a b/c", uri)
pattern: esc("a.b", regex)
```

```json
{"plain": "plain text", "inner": "it\\'s", "table": "o''brien",
 "markup": "&lt;a&gt;&amp;", "address": "a%20b%2Fc", "pattern": "a\\.b"}
```

**Escaping a value that was already safe changes nothing**, which is
what makes it cheap enough to do by default. An unknown variant is
refused at the call (`esc_variant`) rather than passed through, so a new
convention arrives by name rather than by a silent change in what an
existing one does.

**`usc` is the left inverse, and it is partial.** `usc(esc(s))` is `s`
for every `s` and every convention. The other direction does not hold:
several spellings escape to one value, so `esc(usc(t))` is `t` only for
canonically escaped `t`. Text with no original (a truncated code-point
escape, an escape the convention does not define, a lone quote where the
convention doubles it) is refused (`usc_malformed`) rather than answered
with a different string.

### `rep(s, pattern, sub)`

Every match of `pattern` in `s` replaced by `sub`. The pattern is the
**same portable subset [`re`](#re-and-the-portable-pattern-subset)
takes**, so a document has one regexp language rather than two. The
substitution is `$1` to `$9` for the numbered groups, `$&` for the whole
match and `$$` for a literal `$`.

```aon
day: rep("2026-09-04", "([0-9]+)-([0-9]+)-([0-9]+)", "$3/$2/$1")
words: rep("aim:ingest,process:episode", "[,:]", " ")
```

```json
{"day": "04/09/2026", "words": "aim ingest process episode"}
```

**It replaces every match**: a replace-the-first default silently does
the wrong thing in a generator that normalises separators, and anchoring
the pattern is how a document asks for one. A `$` naming nothing, or a group the pattern
has not got, is refused (`rep_sub`) rather than expanded to the empty
string: a file written with a hole in it and no complaint is the failure
that refusal exists to close.

### `split(s, sep)`

The fields of `s`. **A plain string separator is a literal and an
`re(…)` argument is a pattern**: the asymmetry with `rep` is deliberate,
since splitting is usually on a literal, and it removes the trap where
`split(v, ".")` silently cuts between every character.

```aon
fields: split("a,,b", ",")
chars: split("abc", "")
runs: split("a1b22c", re("[0-9]+"))
whole: split("abc", ",")
```

```json
{"fields": ["a", "", "b"], "chars": ["a", "b", "c"],
 "runs": ["a", "b", "c"], "whole": ["abc"]}
```

Empty fields are **preserved**, so `join` is the inverse:
`join(split(s, sep), sep)` is `s`. An empty separator yields the code
points, and a separator that does not occur yields the whole string as
one field.

## Linking: the tree is the namespace

A document is a tree, and its only names are tree paths. That is
deliberate, and it is the whole of the addressing story: there is no
second namespace, no registry of declared names, and nothing a document
can say that makes two positions one node.

Two consequences follow, and both are what the design is for.

**A model can be instantiated more than once.** Mount the same file at
two paths and you get two independent nodes, each with its own values.
Write the model as `model.aon`:

<!-- test: scenario reuse -->
<!-- test: file model.aon -->
```aon
auth: { port:80 region: *"eu"|string }
billing: dep: refer() & path(..auth)
```

and mount it twice from `main.aon`:

<!-- test: file main.aon -->
```aon
tenantA: m: @"model.aon"
tenantB: { m:@"model.aon" m:auth:region:"us" }
```

Each instance resolves its own internal link inside itself, and the
per-tenant override is an ordinary narrowing rather than a
contradiction. A global name on `auth` would have made the two
instances one entity and the second override an error, which is why
there are no global names.

**Bringing two descriptions into contact is something you write.**
Unification is path-aligned, so a catalog file and a deploy file that
describe the same real-world thing at different paths do not meet on
their own. Point one at the other and they do:

```aon
catalog: payments: { owner:"team-pay" tier:1 }
deploy: eu1: payments: $.catalog.payments & { replicas:3 tier:2 }
```

The two `tier` values now meet, and disagree, so the run fails at the
site that says so. A reference is directional (`deploy` is narrowed,
`catalog` is not) and that directionality is what keeps two unrelated
models from silently merging because they happened to choose the same
word.

## First-class paths: `path(p?)`

`path(p)` **captures** the path expression `p` as a value: the
spelling, never the resolution. A plain reference resolves; a capture
is the address itself, as data.

```aon
a: b: 1
emb: $.a.b # a reference: the value at the path
cap: path($.a.b) # a capture: the path itself
```

```json
{ "a": {"b": 1}, "cap": "$.a.b", "emb": 1 }
```

This is the one non-strict argument position in the language: every
other call reads its argument's value, `path(p)` reads its spelling. The
captured spelling is the address grammar `refer` reads (`$.a.b` from the
document root, `.b` from the sibling scope, one more leading dot per
parent step) and a bare dotted argument is relative (`path(q.r)` captures
`.q.r`).

A bare string is **never** a path: the call's own argument is the one
conversion the language has. A string *literal* argument is address text
(`path("$.a")` is the capture `path($.a)`), and text with no anchor is
**relative**: `path("auth")` is `path(.auth)`, the address the raw
spelling captures. A *computed* argument (an expression, a reference to
a string) evaluates first, and the result converts by the same grammar,
which is what makes an address buildable:

```aon
names: { web: {} db: {} }
accounts: pack($.names, { for:refer() & path("$.names." + key()) })
```

```json
{ "accounts": { "db": {"for": "$.names.db"}, "web": {"for": "$.names.web"} },
  "names": { "db": {}, "web": {} } }
```

Text that spells no address even once anchored (an empty string, an
empty segment (`"a..b"`), a broken `$` spelling) refuses at the call
(`path_address`); a number or a container argument is refused as
`invalid-arg`.

`path()` with no argument is the path **kind**: the set of all path
values. It sits under `string` in the kind lattice, so `string` admits a
path value and the string constraints apply to spellings, but the kind
does **not** promote: `path() & "$.a"` refuses (`no_scalar_unify`)
exactly as `integer & "x"` does, because outside the `path(...)` call a
string never becomes a path.

Everything else about a path value is what scalars already do, made
precise by three rules:

1. **Meets are syntactic, by the prefix rule.** Two path values meet
   when one spells a *prefix* of the other (the same anchor, the
   shorter path's segments starting the longer path) and the result is the
   **longer**: a path can always be told more precisely.
   `path($.a) & path($.a.b)` is `path($.a.b)`; incomparable
   spellings (`path($.a) & path($.b)`, or different anchors) refuse
   (`scalar_value`); and a path value refuses a plain string
   *literal* (`path($.a) & "$.a"` is `scalar_kind`) exactly as the
   number tower's leaves refuse each other. Subsumption follows the
   meet: a prefix subsumes its extensions.
2. **A path value is data.** `path($.nope)` generates `"$.nope"`:
   existence is `refer`'s contract, not the value's, so a document may
   address things outside this evaluation. `path(p) & refer()` is the
   checked link: see [Checked links](#checked-links-refert).
3. **Generation and canon.** A path value generates as its address
   string; its canonical form is the call (`path($.a.b)`), which
   reparses to the same value: the call form is the literal syntax
   for this kind.

The kind settles inside `type()` bodies, which a `refer` cannot
(see [Checked links](#checked-links-refert)), so a vocabulary can
declare a path-valued field for the data to meet:

```aon
Service: type({ host:path() })
db: $.Service & { host:path($.hosts.h1) }
hosts: h1: {}
```

```json
{ "db": {"host": "$.hosts.h1"}, "hosts": {"h1": {}} }
```

Pinned by [`test/spec/path.tsv`](../test/spec/path.tsv).

## Checked links: `refer(t?)`

A reference (`$.a.b`) resolves by *cloning* its target into place, so
`dependsOn: [$.services.auth]` generates a full copy of the auth node
where the author meant a name. A bare string generates the name and
checks nothing. `refer` is the third option: the field keeps the
address string, and the language checks it.

```aon
services: auth: { kind:service port:8080 }
services: billing: dependsOn: [&: refer({ kind:service }) path($.services.auth)]
```

```json
{"services": {
   "auth":    {"kind": "service", "port": 8080},
   "billing": {"dependsOn": ["$.services.auth"]}}}
```

The list spread applies `refer` to every element, so `dependsOn`
generates a list of **addresses**, checked.

`refer(t)` says three things about the string it constrains:

1. It must be a **tree address**.
2. The address must **resolve** in this evaluation.
3. If `t` is given, `t` is unified **into** the target.

### Addresses

An address is a path, in the two spellings a reference already uses:

```
$.services.auth   from the document root
.auth             beside the link itself
..auth            one level up from there
```

`$.a.b` is absolute. A leading `.` reads the link's own sibling scope,
and every further dot is one step up: the same reduction a relative
reference performs. `$` alone is not an address: the whole document has
no enclosing position, so nothing could be written back into it.

Relative addressing is what makes a model reusable. A link written
`..auth` means a different node from each position the model is mounted
at, so the same file instantiated twice gives two self-contained
instances.

Only a [path value](#first-class-paths-pathp) can be an address: a bare
string never is (`refer() & "$.a"` refuses (`refer_address`)) and
`path("...")` is the one conversion. A second path peer refines the
address by the prefix rule (`refer() & path($.a) & path($.a.b)` links to
`$.a.b`), and a relative address that climbs off the top of the tree is
refused outright: no later pass can grow a tree upwards.

### Existence is decided, not deferred

A `refer` **residuates**: a target may be introduced by a later
conjunct, include or spread, so the constraint retries each pass
exactly as a forward reference does. But within one evaluation the
document-set is fixed, so existence *is* decidable: an address that
still names nothing at the last pass is a located error
(`refer_unresolved`), not something to check later.

### Constraints flow through links

`refer(t)` does not merely *test* the target against `t`; it unifies
`t` into it, at the position the address names:

```aon
a: p: 1
b: refer({ r:3 }) & path($.a)
```

```json
{"a": {"p":1, "r":3}, "b": "$.a"}
```

Referring to something as a `Service` makes it one, and if it cannot
be, the conflict is an ordinary located error. Check-only semantics
would be non-monotone (true, then false as the target grows), and the
lattice guarantee is that more information never falsifies what has
already been observed.

Constraints written *alongside* a refer constrain the **link**, not the
target: `refer() & string & re("auth$") & path($.services.auth)` checks the
address itself. They are held until the address arrives, and then meet
it.

### The argument is a template, not an address

`refer(t)` takes the value the **target** must satisfy. The address
comes from the `path()` beside it, never from the argument, so
`refer(key())` does not mean "link to the node this key names". It means
"the target must unify with whatever `key()` answers here", and `key()`
answers with a *string*, so the link is constrained to a target that is
that string. At the root of a document `key()` is `""`, which leaves
`refer("")`: a link with no address, which cannot generate.

```
link: refer(key())     → [aontu/mapval_no_gen] at $.link
                         value was: refer("")
```

**A key does not survive a reference.** `key()` is path-dependent (it
answers for the destination it lands at) and a reference is a new
destination, so referring to a field whose value came from `key()`
re-fires it at the referring site rather than carrying the target's
key across. There is no built-in that takes a `path()` value and
yields its last segment.

Generate the link and the name together instead, from the one place
the key is already in hand. Inside a `pack` template `key()` is the
child's own key, so it can build the address and stand as a value at
the same time:

```aon
services: { auth:port:8080 billing:port:9090 }
names: [auth billing]
links: pack($.names, { to:refer() & path("$.services." + key()) name:key() })
```

```json
{"services": {"auth": {"port": 8080}, "billing": {"port": 9090}},
 "names": ["auth", "billing"],
 "links": {"auth":    {"to": "$.services.auth",    "name": "auth"},
           "billing": {"to": "$.services.billing", "name": "billing"}}}
```

`to` is checked (a name with no service refuses) and `name` is the
same key as an ordinary string.

### The bundled vocabularies

**Seven vocabularies ship with the engine**, served from it rather than
from disk, and **every one of them is named under `aontu:`**. That is
the whole rule: a language-supplied schema has one spelling, and the
scheme is what stops a file on disk from standing in front of it.

| name | what it is |
|---|---|
| `aontu:system` | ports, components and services: [below](#the-aontusystem-vocabulary) |
| `aontu:view` | the schema for one declaration of a [view document](reference-api.md#aontu-view), `$.aontu.View.Figure`, which types every option the verb reads so a typo is refused at evaluation |
| `aontu:code` | the output vocabulary a transform evaluates to |
| `aontu:render` | the data `render` applies to a unit of one language |
| `aontu:render/lang/text` | the text profile |
| `aontu:render/lang/markdown` | the markdown profile |
| `aontu:render/lang/typescript` | the TypeScript profile |
| `aontu:render/lang/go` | the Go profile |

The last six are described [after the system vocabulary](#the-aontu-models).

### The `aontu:` models

A name that begins `aontu:` is a **language-supplied model**, and it
resolves from the engine's own table and nowhere else: the memory,
module, file and package legs are never asked, so no file can shadow
one, and a name the engine does not serve is refused naming the set
rather than looked for on disk.

**Everything an `aontu:` model defines lands under the single root key
`aontu`**, so including one never takes a name a document wants:

| include | defines |
|---|---|
| `@"aontu:system"` | `$.aontu.System.Port`, `.Component`, `.Service`, `.Semver` |
| `@"aontu:view"` | `$.aontu.View.Figure` |
| `@"aontu:code"` | `$.aontu.Code.units` |
| `@"aontu:render"` | `$.aontu.Lang` |

One key is reserved instead of eight, it is named for the language
rather than for a domain, and `$.aontu` anywhere tells a reader at once
that the subtree is not the document's own.

**A path part that names a type is CamelCase.** That is why every
bundled key above is capitalised, and why the members under them
(`Port`, `Service`, `Figure`) always were: the case of a segment says
what kind of thing it names. It is a **convention and only a
convention**: the engine does not check it, `aontu vet` says nothing
about a lowercase `type()`, and a document is free to ignore it. The
bundled models follow it so there is one worked example to copy.

The SCHEME name is unaffected and stays lowercase: `@"aontu:system"`
loads the model, `$.aontu.System` is where its content lands, and a
source name is not a path. Write this as `models.aon`:

<!-- test: scenario aontu-models -->
<!-- test: file models.aon -->
```aon
@"aontu:code"

aontu: Code: units: [
  { path:"hello.py" lang:"python" decls: [{ k:"frag" n: ["print('hello')"] }] }
]
```

<!-- test: run -->
```sh
$ aontu models.aon
{
  "aontu": {
    "Code": {
      "units": [
        {
          "decls": [
            {
              "k": "frag",
              "n": [
                "print('hello')"
              ]
            }
          ],
          "lang": "python",
          "path": "hello.py"
        }
      ]
    }
  }
}
```

A name the engine does not serve is refused, and the refusal names
the set. Write this as `nope.aon`:

<!-- test: file nope.aon -->
```aon
@"aontu:nope"
```

<!-- test: run -->
```sh
$ aontu nope.aon
source not found: aontu:nope (the language-supplied models are aontu:code, aontu:render, aontu:render/lang/go, aontu:render/lang/markdown, aontu:render/lang/text, aontu:render/lang/typescript, aontu:system, aontu:view)
$ echo $?
1
```

**`aontu:code`** is the output vocabulary: an instance of it is what a
transform evaluates to, and what `aontu render` turns into bytes. Its
root is `aontu: Code: { source?, units }`, each unit a `path`, a `lang` and a
list of declarations: `record`, `enum`, `alias`, `const`, `func`, a
verbatim `text` escape, or a `frag`, a flat list of pieces each
carrying its own depth: a `line` (or a bare string, which is a line at
depth 0), a `blank`, or a `raw`. No inline piece may hold a line
terminator; the vocabulary refuses one at the node, before any
renderer runs. Container types take only leaf types (anything deeper is
a named `alias` plus a `ref`) which is what keeps the schema's meet
linear. The root is not `type()`-marked, because `render` reads the
instance through generation; a document that includes the vocabulary
and writes no units generates `aontu: {Code: {units: []}}`.

**`aontu:render`** is the schema of a render profile: the data a unit
of one language is rendered under: its `lang`, an `indent`, and
optionally the comment forms, the string quote and escape table, the
identifier rules and the type forms. A profile is data and only data:
a field belongs in it only if the renderer applies it without looking
at the shape of any node.

**`aontu:render/lang/typescript`** and **`aontu:render/lang/go`** are the two
bundled profiles with a lowering: the data a unit of that language
renders under: two spaces or a tab, the comment forms, the string
escapes by decimal code point, the reserved words, the case style per
role and (Go) the acronym set that spells `ID`, and the type forms with
the precedences that put the parentheses in `(string | null)[]`. A
declaration in a unit of either language lowers to its target (an
exported interface or a struct, an enum, a type alias, a constant, a
function) and the loss report names what the target's type system does
not enforce; see [`aontu render`](reference-api.md#aontu-render).

**`aontu:render/lang/markdown`** is fragment-shaped like the text profile,
and carries what markdown has of its own: the HTML comment form, and
the template marker its files write, `<!--- … -->`.

**A profile is where a language is configured**, not only where it is
rendered. Its `template` block names the marker a generator written in
that language carries and the extensions that marker belongs to, so
`aontu render`, `aontu template` and `aontu fmt` read one file rather
than repeating a `--marker` flag. A marker carries its own closer after
a space where the opener does not imply one, which is what reaches a
block comment the engine has never seen:

<!-- test: skip the file it configures is the reader's own language -->
```aon
aontu: render: Lang: template: { marker:"(*-" close:"*)" ext: ["ml" "mli"] }
```

**`aontu:render/lang/text`** is the bundled profile of every other language:
`lang: "text"`, an indent of two spaces, and nothing else, since a fold
over fragments applies nothing else. Every unit whose declarations are
fragments and text escapes renders under it whatever its `lang` says,
so a Python module, a YAML manifest or a `Makefile` needs no profile of
its own; a unit with a declaration needs a profile whose language has a
lowering, and one whose language has none is refused
(`render_profile`).

Every bundled model is **experimental** until the vocabulary can be
versioned by canon-hash.

### The `aontu:system` vocabulary

Ports, components and relations need no syntax: they are schemas, and
one set of them ships with the engine. Write this as `system.aon`:

<!-- test: scenario std-system -->
<!-- test: file system.aon -->
```aon
@"aontu:system"

services: {
  auth: $.aontu.System.Service & {
    ports: http: protocol: http
    dependedOnBy: rel() & [path($.services.billing)]
  }
  billing: $.aontu.System.Service & {
    dependsOn: rel($.aontu.System.Service) & inverse(dependedOnBy) & acyclic() & [
      path($.services.auth)
    ]
  }
}
```

<!-- test: run -->
```sh
$ aontu system.aon
{
  "aontu": {
    "System": {}
  },
  "services": {
    "auth": {
      "dependedOnBy": [
        "$.services.billing"
      ],
      "kind": "service",
...
```

| Schema | Says |
|--------|------|
| `$.aontu.System.Port` | one end of a connection: `direction` (default `in`) and an optional `protocol` |
| `$.aontu.System.Component` | a node with `ports`, each of which is a `Port` |
| `$.aontu.System.Service` | a Component whose `kind` is `service` |
| `$.aontu.System.Semver` | a version as an ordered tuple, `[major minor patch pre-release build]`, with the tail defaulted: `[1]` is `[1 0 0 "" ""]` |

**`Semver` is a list, not a string and not a map.** A version is
compared rather than read, and comparison runs component by component
from the left, an order a list has and the other two do not: `"1.10.0"`
sorts below `"1.9.0"` as text, and a map has no order of its own to
compare along.

**The tail is defaulted**, so a version may be written as short as it
is meant: `[1]` is `[1 0 0 "" ""]`, and `[1 2]` is `[1 2 0 "" ""]`. The
arity is five, so a sixth element is refused (`[aontu/constraint]`).
Write this as `version.aon`:

<!-- test: scenario aontu-system-semver -->
<!-- test: file version.aon -->
```aon
@"aontu:system"
v: $.aontu.System.Semver & [1]
pre: $.aontu.System.Semver & [1 2 3 "alpha.1"]
```

<!-- test: run -->
```sh
$ aontu version.aon
{
  "aontu": {
    "System": {}
  },
  "pre": [
    1,
    2,
    3,
    "alpha.1",
    ""
  ],
  "v": [
    1,
    0,
    0,
    "",
    ""
  ]
}
```

Three things about the two string parts are worth knowing:

- **Both are checked by grammar, not by pattern.**
  [semver.org 2.0.0](https://semver.org) spells each as dot-separated
  identifiers, which as a pattern is a quantified group holding a
  quantifier, the one shape `re()` refuses outright
  (`constraint_pattern`, for backtracking exponentially; see
  [The constraint algebra](#the-constraint-algebra)). The vocabulary
  carries an ABNF grammar for each instead and applies it with
  `parse()`, so `"beta_1"`, `"alpha..1"` and `"01"` are all refused
  (`[aontu/empty]`) where an alphabet pattern admitted the last two.
  The two grammars are members of the model in their own right,
  `semverPreRelease` and `semverBuild`, hidden so a schema's grammar
  does not generate into the document it checks, and lower-case because
  the case of a bundled key says whether it names a type. See
  [grammars](#grammars-abnf-and-parse).
- **The two grammars differ where the spec does.** A wholly numeric
  pre-release identifier may not carry a leading zero, because
  pre-releases are compared numerically; a build identifier may,
  because build metadata is never compared. So `[1 0 0 "01"]` is
  refused, `[1 0 0 "0alpha"]` stands, and so does
  `[1 0 0 "" "001"]`.
- **Build metadata comes last.** The spec says it MUST be ignored when
  determining precedence, and last is the one position where a
  comparison that walks the tuple from the left can stop before it
  without leaving a hole.

Leading zeroes need no rule in the numeric parts: they are integers, and
`01` is not a distinct integer literal, so the spec's "MUST NOT contain
leading zeroes" is impossible to write there rather than merely
forbidden.

`@"aontu:system"` is **bundled with the engine** (no filesystem, no
package resolution) so it resolves under every include capability
except `'none'`, which denies every include by definition. It is
**experimental** until the vocabulary can be versioned by canon-hash.

Two of its behaviours are the language rather than the vocabulary:

- **A preferred member is one enum member, with the default role.**
  `direction: *in | out | inout` is a true enum-with-default under the
  admission gate: unset generates `in`, `out` and `inout`
  override, and any other value is refused (`[aontu/empty]`). A
  vocabulary that wants an open field says so with a `| top` (or
  `| string`) branch.
- **`Service` is written out rather than as `$.aontu.System.Component & {kind:
  service}`.** A reference from one member of an included file to
  another does not survive the include, so each schema states itself;
  `$.aontu.System.Component & $.aontu.System.Service` still meets exactly as you would
  expect.

Everything here is ordinary unification, so an author who wants a
different vocabulary writes one the same way, and nothing in the
language knows these names.

### Declared relations

A relation is declared AT ITS FIELD: `rel(t)` says the field's strings
are tree addresses and flows `t` into every target, and the two
GRAPH ATOMS declare the properties that hold over the whole edge set:

```aon
a: dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.b)]
b: usedBy: rel() & [path($.a)]
```

```json
{"a": {"dependsOn": ["$.b"]}, "b": {"usedBy": ["$.a"]}}
```

- **`acyclic()`**: the edges under this relation must have no cycle.
  The error names the nodes the cycle runs through, closing back on
  the first.
- **`inverse(<name>)`**: for each `a --dependsOn--> b`, `b` must carry
  `a` under `<name>`, as an edge of that relation. The error names the
  exact missing entry. Writing the inverse **for** you is generation,
  not validation, and is not done here.
- The `target` half of the old declaration is `rel(t)` itself: the
  type flows into each far end at the site, so a conflict or a hole is
  an ordinary located evaluation error.

The atoms are **lattice-inert, deliberately.** Both properties are
global and non-monotone: an acyclic graph becomes cyclic when one more
edge unifies in, and an inverse that is present becomes absent when the
far side is narrowed. The lattice guarantee is that more information
never falsifies what has already been observed, so a constraint that
could be true and then false is not one the lattice may hold. During
unification the atoms only REGISTER the declaration (the predicate is
the key they sit on) and ride the field's value; the verdict lands at
GENERATION (where no more information can arrive) as a located
`relation_cycle` or `relation_inverse_missing` at the offending edge,
exactly as an unmet sizing atom refuses. `aontu relations <file>`
reports the same findings without generating, and the library exposes
`relationCheck(src)`. The closure question (does `a` reach `b` at any
remove?) is a separate verb, [`aontu reaches`](reference-api.md#aontu-reaches).

There is no reserved `relations:` key: a document that writes one has
written ordinary data. The tree is user space at every level.

For the working recipes see
[Check relations](how-to/check-relations.md) and
[Query reachability](how-to/query-reachability.md); the live version,
with its checks, is [use-cases/12-relations](../use-cases/12-relations/).

## Marks: `type` and `hide`

Marks are boolean flags carried on a value (set by `type()` / `hide()`,
or propagated by conjunction):

- A **type**-marked value is schema/metadata.
- A **hide**-marked value is intentionally excluded from output.

In both cases, **a map field whose value is type- or hide-marked is
omitted when the enclosing map is generated**, while still participating
in unification. A bare marked value at the top level still generates
(`type(1) & number`→`1`). `copy()` clears both marks, making the result
emittable again:

```aon
x: type({})
x: y: 1
a: copy($.x)
```

```json
{"a":{"y":1}}
```

**A mark belongs to the field its wrapper was written at**. A reference
to a `type()`/`hide()`-marked value copies the value with the marks
cleared, and that holds however the wrapper resolves: a reference that
lands on a still-unresolved `type()`/`hide()` call waits for it to
resolve at its *own* field rather than copying the call, so the marks
can never be re-stamped at the referring site. In particular `m:
hide(pack(...))` hides the field `m` exactly as `hide({literal map})`
does (the generated children stay usable downstream (`out: pack($.m,
{got:_})` emits their values)) and a `type()`-marked alias referenced
inside another `type()` body constrains the referring field without
suppressing its emission.

## Closed values: `close` / `open`

A **closed** map or list refuses any key/element not already present.
Narrowing an existing key is fine, and `open` lifts the seal:

```aon
a: close({ x:1 }) & { x:number }
b: open(close({ x:1 })) & { y:2 }
c: close(42)
```

```json
{"a":{"x":1},"b":{"x":1,"y":2},"c":42}
```

`close` on a scalar is a no-op (`c` above), and `close($.x)` closes a
referenced node. Adding a key or extending a list is refused:

```
close({x:1}) & {y:2}      → error: closed
close([1,2]) & [3,4,5]    → error: closed
```

## Source loading `@"…"`

`@"path"` loads and parses another source file, then unifies the result
in place, so external files merge like any other value.

Source files use the `.aon` extension (preferred) or `.aontu`. When the
path has no extension, those two are tried in turn, so `@"foo"` resolves
`foo.aon` then `foo.aontu`.

**The extension decides what the file is**, and it says which of three
things:

| extension | what it is |
|---|---|
| `.aon`, `.aontu` | **aontu source**: the language, with everything in it |
| `.json`, `.jsonld`, `.jsonc`, `.json5`, `.jsonic`, `.jsc`, `.toml`, `.yaml`, `.yml`, `.ini` | **configuration data**, read by that format's own parser |
| `.txt`, and whatever `--text-ext` names | **text**: the file's bytes, as one string |
| anything else | refused, by name |

Every one of those formats maps onto JSON, which is why one word covers
them: a `.toml` file is a map of scalars, lists and maps, and so is the
`.aon` file that unifies with it. What a data format does not get is
the language: a `&` in a YAML file is a YAML anchor, not a spread key,
because the YAML parser reads it, not this one.

Write `vocab.jsonld`:

<!-- test: scenario include-extension -->
<!-- test: file vocab.jsonld -->
```json
{"name": "aontu", "tags": ["config", "types"]}
```

and load it from `main.aon`:

<!-- test: file main.aon -->
```aon
schema: @"vocab.jsonld"
```

<!-- test: run -->
```sh
$ aontu main.aon
{
  "schema": {
    "name": "aontu",
    "tags": [
      "config",
      "types"
    ]
  }
}
```

### Text: `.txt` and `--text-ext`

A `.txt` file is read as **one string**. Nothing parses it, so nothing
in it can mean anything, which is what makes it the safe third
category. Write `notes.txt`:

<!-- test: file notes.txt -->
```
Deploy freezes over the holiday period.
```

and load it as a value in `main.aon`:

<!-- test: file main.aon -->
```aon
notes: @"notes.txt"
```

<!-- test: run -->
```sh
$ aontu -c main.aon
{"notes":"Deploy freezes over the holiday period.\n"}
```

The result is an ordinary string, so the language's string operations
reach it and a schema can constrain it: `notes: string & length(1)`
holds, and `upper(@"notes.txt")` uppercases the file.

**Other extensions need an allowance.** `--text-ext md,sql` reads those
as text too, for a project that keeps its prose in `.md` or its queries
in `.sql`. Every verb takes it, and the dots are optional
(`--text-ext .md`). Two limits: an extension the table already names
keeps its meaning, so `--text-ext toml` does not re-read TOML as a
string; and `.js` stays refused however the flag is spelled.

A config file in any of those formats reads the same way. Write
`server.toml`:

<!-- test: file server.toml -->
```toml
port = 8080
hosts = ["a", "b"]
```

and hold it to a schema in `main.aon`:

<!-- test: file main.aon -->
```aon
port: integer
hosts: [string]

@"server.toml"
```

<!-- test: run -->
```sh
$ aontu main.aon
{
  "hosts": [
    "a",
    "b"
  ],
  "port": 8080
}
```

**A format's own semantics are the ones that apply.** INI has no types,
so `port=8080` read from a `.ini` is the string `"8080"`, and a schema
wanting a number has to say so. A malformed config file refuses the
whole document rather than becoming an empty value under the key that
included it.

Every other extension (and a name with no extension at all) is
refused by name rather than guessed at. Put rows in `rows.csv`:

<!-- test: file rows.csv -->
```
port,host
8080,local
```

and ask for it in `main.aon`:

<!-- test: file main.aon -->
```aon
rows: @"rows.csv"
```

<!-- test: run -->
```sh
$ aontu main.aon
include not readable: rows.csv (extension: .csv)
$ echo $?
1
```

A guess would be worse than the refusal, and it was: read as text, a
vocabulary became a string that a schema then validated nothing
against; read as aontu, prose became a parse error at a line nobody
wrote. Both exited 0. Reading a file as text is a category the table
now *names* (that is what `.txt` is) and the difference is that it is
stated rather than a fallback for whatever the table failed to
recognise.

```
@"foo.aon"                       → {"f":11}            (top level)
a:@"foo.aon"                     → {"a":{"f":11}}      (nested)
car:@"car.aon" car:{wheels:4}    → merges loaded + local
@"foo"                           → {"f":11}            (implicit .aon/.aontu)
```

To see the merge, write `foo.aon`:

<!-- test: scenario include -->
<!-- test: file foo.aon -->
```aon
f: 11
```

a second file, `car.aon`:

<!-- test: file car.aon -->
```aon
doors: 2
```

and an entry file, `main.aon`, loading both:

<!-- test: file main.aon -->
```aon
@"foo.aon"
car: @"car.aon"
car: wheels: 4
```

<!-- test: run -->
```sh
$ aontu main.aon
{
  "car": {
    "doors": 2,
    "wheels": 4
  },
  "f": 11
}
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

**Shape routes; validity refuses.** A path that routes here is not yet
a path that may become a directory, and a module path becomes a real
directory on every platform the toolchain runs on. So the path is
checked before anything is built from it: no element may be empty,
begin or end with `.`, or be a reserved device name (`nul`, `con`,
`com1`…), and the path is bounded in length and element count. These
are Go's module-path rules, adopted for Go's reason.

```
module path: corp.example/../schemas@1 (an element begins or ends with ".")
```

The rule against a leading or trailing `.` is what forbids `..`, and it
is stated as the rule rather than as a ban on the two dangerous
spellings, which would miss the third. The routing predicate is
deliberately *not* tightened to do this work: what it rejects falls
through to the file resolver, so a stricter pattern would silently
re-route documents that resolve today.

**Uppercase is escaped on disk.** `corp.example/Widgets` and
`corp.example/widgets` are two module identities and, on a
case-insensitive filesystem, one directory, so an uppercase letter is
written `!`+lowercase in the store, Go's rule for Go's reason. The
written path stays the identity; only the directory is escaped.

**Evaluation never touches the network.** A module resolves from local
stores only (`aontu_meta/vendor/` in the project that declares `mod.aon`,
then a
content-addressed user cache) and the cache is consulted only when the
expected hash is known, because that hash is its key. A module in
neither store is an error that names the step that fixes it:

```
module not fetched: corp.example/schemas/service@1 (run: aontu mod get)
```

The user cache is `$XDG_CACHE_HOME/aontu/mod` where that is set (an
explicit override wins on every platform) and otherwise the platform's
own cache location: `%LOCALAPPDATA%\aontu\mod` on Windows,
`~/.cache/aontu/mod` elsewhere. A host that offers none of those has no
user cache, and a module then resolves from `aontu_meta/vendor/` alone.

**The module file and the lockfile are ordinary aontu.** `mod.aon`
declares the module's own path and entry file; the entry defaults to
`main.aon`:

```aon
mod: { path:"corp.example/schemas/service" main:"service.aon" }
```

`aontu_meta/mod-lock.aon` is machine-written in **canonical form**: one line,
sorted keys, diffable, and (its leaves being scalars) valid JSON:

<!-- fmt: keep a lock file, shown as the tool writes it -->
```aon
{"lock":{"corp.example/schemas/service@1":{"canon":"aon1-4vJe…","oci":"sha256:6b86…","v":"1.4.2"}}}
```

Each entry carries two pins with distinct roles: `oci` certifies *these
are the bytes the registry served*; `canon` certifies *this is the
meaning that was reviewed*. Only the second can be checked without the
registry, and it is the one evaluation checks: by unifying the module
**standalone** and comparing its [canon-hash](#canonical-form):

```
module integrity: corp.example/schemas/service@1 expected aon1-4vJe… got aon1-9kQz…
```

The pin survives comments, whitespace, formatting and refactoring; it
breaks on any semantic change in the module's transitive closure. An
inline `#aon1-…` fragment is the same check without a lockfile: the
degenerate mode for single-file and agent-sandbox use.

Under a **root** trust capability (`docs/trust.md`) the user cache is
not consulted at all: a confined evaluation sees the project's own
`aontu_meta/vendor/` and nothing else, which is what confinement means.

**The lockfile is maintained by tooling, not by hand.** `mod.aon`
declares what the project wants, under a `dep` map keyed by module
path:

```aon
mod: { path:"corp.example/app" main:"main.aon" }
dep: "corp.example/schemas/service@1": v: "1.4.2"
```

`aontu mod tidy` walks the closure (each module's own `mod.aon`
contributes its declarations) and resolves it by **minimum version
selection**: every module is taken at the highest of the minima anyone
asked for, and never higher. Resolving upgrades nothing, so the answer
is reproducible and adding one dependency cannot move another. It then
recomputes each `canon` pin from the module in the store and rewrites
`aontu_meta/mod-lock.aon`; if any module is not in a store, or is in one but does
not evaluate on its own, the lockfile is left alone: a partial lock
claims a closure that was never resolved, and a pin computed from a
module that has no meaning is the same string for every broken module.

`aontu mod verify` asks the opposite question and **changes nothing**:
does every locked module still *mean* what the lockfile pins? It is
the CI gate, because `tidy` cannot be one: rewriting the lockfile is
tidy's job, so a job that tidies before evaluating makes the
lock agree with whatever the store now holds. A store that has drifted
is reported with both hashes; a project the lockfile does not cover is
refused rather than verified over nothing.

`aontu mod vendor` copies the locked closure into `aontu_meta/vendor/` as whole
source trees, which is what makes a project evaluable with no cache and
no network at all. It can only find what the lockfile pins (the cache is
keyed by canon-hash) so `tidy` comes first.

A module that publishes itself declares a version too, and the **major
an import spells lives inside it**: `version: "1.4.2"` publishes as
`@1`. `aontu mod manifest` prints the OCI artifact a publish would
push (the config media type, the source tree that is the layer, and the
annotations carrying path, version and canon-hash) and `--against` a
prior version's tree runs the
[breaking](reference-api.md#aontu-breaking) check between them. A change
that is breaking under an unchanged major refuses; a major bump is where
breaking is allowed, because a consumer of `@1` never sees `@2` unless
it asks.

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
| `\|` (disjunction)  | infix       | loosest |

So `c & b | a` ≡ `(c & b) | a` and `*1 | number` ≡ `(*1) | number`.
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
  it, in plain form at every magnitude: never scientific. An integral
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
- Conjunction: `a&b` (for example `number&"A"`). Disjunction: `a|b`
  (for example `1|2`, `string|number`). Preference: `*x` (for example `*1|number`).
- Spreads keep the `&:` entry: `{&:{"x":2},"y":{…}}`.

## The formatted form

`aontu fmt` writes a document in one agreed form, in the tradition of
`gofmt`, so that layout is never argued about and a diff shows only
what changed. The form is a spelling of the document and not a change
to it: what the formatter writes evaluates to the same value, has the
same canon-hash, and is a fixed point of the formatter. The verb is in
the [API reference](reference-api.md#aontu-fmt); how to run it on a
file or gate a repository is a
[how-to](how-to/format-a-document.md). This section is the form.

**Lines.** Two spaces per level of indentation, never a tab. Line
endings are `LF`, no line ends in whitespace, and the file ends in one
newline. A packing budget of 80 columns decides between two legal
spellings of a value, one line or several, and nothing else: the
formatter never breaks a line. A string 200 columns wide stays 200
columns wide, and an expression the author wrote on one line stays on
it however wide it is.

**Pairs.** A pair is `key: value`, no space before the colon and one
after, and the key, the colon and the value are never on different
lines. At statement level every pair has its own line, so `a: 1 b: 2`
on one line becomes two. Inside an inline container the colon is
tight, `{ a:1 b:2 }`, and the space between pairs is what separates
them. An optional key keeps its marker tight, `port?: integer`; a
spread is `&: value`; an alias declaration is `%Name = value`.

**Braces are for shape, not for nesting.** A pair whose value is a map
holding exactly one entry is written as a chain: `a: {b: 1}` is
`a: b: 1`, recursively, and the root map has no braces at all. A
one-key map in list position is a pair element, `[a:1 b:2]` for
`[{a:1}, {b:2}]`. A map whose only entry is a spread keeps its braces,
`a: { &: integer }`, because the braces are what say "a map shape": a
spread alone reads as a constraint on `a` rather than on its members.
A map that is an operand or an argument keeps its braces too,
`a: { b:1 } & T`, `s: close({ a:1 })`: those are expressions, and
inside them the rules apply again to each entry.

**Repeat the prefix.** A pair in statement position whose value is a
plain map is laid out in this order: on one line, `key: { a:v b:v }`,
when that fits the budget and the map holds no comment and no value
that spans lines; else as one statement per entry, each carrying the
key again, when every entry is a one-liner that way:

```aon
server: host: "0.0.0.0"
server: port: 8080
server: tls: { enabled:true cert:"/etc/tls/edge/cert.pem" }
```

and otherwise as a braced block, `key: {` on the pair's line, each
entry a statement one level in, and `}` alone on its line. The repeat
is legal because a key written twice is a meet, and the meet of two
maps with disjoint keys is their union: the three statements above and
`server: { host: "0.0.0.0", port: 8080, tls: { ... } }` are one document,
with one canon-hash. It applies recursively, so a nested map that fits
stays on its line and one that does not is descended into under the
longer prefix, `a: b: c: 1` / `a: b: d: 2`; there is no cap on how many
statements a map becomes.

**The descent stops at a record.** A record is a map of several
entries, every one of them a value rather than another map: a field, an
error, a row. The prefix reaches through a map that holds maps, because
those keys are a path and a line carrying all of them says where it is;
where the descent reaches a record instead, that map is written as a
braced block under the prefix rather than dissolved into it, because
its keys are what the thing IS and repeating the prefix in front of
each of them says nothing:

```aon
entity: planet: table: "planets"
entity: planet: field: id: {
  name: "id"
  json: "id"
  kind: "string"
  required: true
  pk: true
  write: true
  fk: false
}
```

A one-entry map is a chain at every width and is not a record; nor is
a map holding a spread. The block replaces a descent and never rescues
one: where the deeper repeat could not have been written anyway (a list
too wide under the longer prefix, a value spanning lines) the statement
is a braced block by the rule above, exactly as it was before this. And
the statement's own map is not reached by a descent, so a flat
`server: host:` / `server: port:` is written as the repeat it has
always been, and so is a record a chain leads to and nothing else does.

Merging goes the other way too: adjacent
statements naming one key are one map to the formatter, which then
lays that map out by the same procedure, so `s: a: 1` / `s: b: 2` is
written `s: { a:1 b:2 }`. Only adjacent statements merge; a `server:`
line, something else, then another `server:` line stays as it is,
because the formatter never reorders. A statement's trailing comment
travels onto the entry it stood beside; comments and blank lines
between merged statements stay between the entries.

The rule touches nothing but a plain map in statement position. A map
wrapped in a call is an expression, and splitting it changes the
document: `s: close({a: 1})` / `s: close({b: 2})` does not evaluate
where `s: close({a: 1, b: 2})` does. The same holds for an operand of
`&` or `|`, a list element, a map with a comment on its opening line or
as its last entry, and a map holding two spreads, which the engine
keeps as a conjunction. Every repeat and every merge is checked with
the engine before it is written, the two spellings evaluated in
isolation and compared, and a rewrite the engine evaluates differently
is not made: the statement keeps its braces.

**Containers.** A map whose one-line spelling fits is written on one
line, padded inside the braces and with the colons tight; a list is
not padded: `limits: { rps:100 burst:200 }`, `ports: [80 443 8080]`,
`routes: [get:"/health" post:"/orders"]`. A container goes to several
lines when it does not fit, when it holds a comment, or when an
element is itself several lines. A list then puts each element on its
own line one level in, with the closing bracket alone on a line; a map
in statement position repeats or blocks as above; a map in expression
position is a braced block, `{` at the end of the line that opens it
and `}` alone, which is the ordinary spelling of a constrained map:

```aon
CatalogEntry: $.aontu.System.Service & {
  owner: %Owner
  tier: 1|2|3
  dependsOn?: rel($.aontu.System.Service) & %CatalogAddr & acyclic() & inverse(dependedOnBy)
}
```

That third line is 83 columns where it sits, and stays so.

Empty containers are `{}` and `[]`, always inline.

**Separators.** No commas between pairs or between elements: a newline
or a space separates, and commas on input are dropped, trailing ones
included. Inside a call's argument list the author's separators are
kept, a comma or a space, with one space after a comma, because the
parser reads a run of arguments such as `must((v) => 0 <= v, "…")`
exactly as it reads `match(.t, "string", "x")`.

**Comments.** Every `#` comment is kept, its text untouched. A comment
on its own line attaches to the statement that follows it and is
indented to that statement's level; a blank line between the two
stays. A trailing comment stays on its line, one space after the last
token, and trailing comments are not aligned into a column. A comment
inside a container puts the container on several lines, which is the
only way the comment keeps its place; a comment on the line that opens
a block stays there, `server: { # what the edge sees`.

**Blank lines.** A blank line is a paragraph break the author chose,
and the formatter keeps it: any run of blank lines becomes one. None at
the start or end of a block, none at the start of the file, and one at
the end, which is the final newline.

**Keys and strings.** A key is bare when it can be: a quoted key whose
text is a legal bare key, `[A-Za-z_][A-Za-z0-9_]*`, is written bare, so
`"host": 1` becomes `host: 1`. Quoting that means something is never
touched: `"a?": 1` is a key named `a?`, where `a?: 1` is an optional
`a`. A single-quoted string becomes double-quoted, `'plain'` to
`"plain"`, unless it holds a double quote; a backtick string is
verbatim, newlines and indentation included; a string's content is
never changed; and a bare string stays bare, a quoted one quoted.

**Numbers.** A number's source text is copied exactly. `1`, `1.0`,
`0d1` and `0d1.0` are four kinds, and `1_000`, `0x1f` and `1e3` are
spellings the author chose.

**Operators and calls.** Binary operators are spaced, `a & b`, `a | b`,
`a + b`; a preference is tight, `*8080 | 9090`; a call is
`name(arg, arg)` with no space before the parenthesis and none inside
it, and an empty argument list is `name()`. References and paths are
copied as written. Parentheses are the author's: the formatter neither
adds nor removes a grouping parenthesis. A line break the author put
inside an expression is kept, at its operator, which then leads its
continuation line one level in:

```aon
out: `a` + .b
  + match(.t, "string", `TEXT`)
```

A call that does not fit on its line hugs its last argument to the
parentheses when that argument is a container, an unbroken expression
that ends in one, or a call whose own last argument hugs, which is the
schema idiom `type(close({` … `}))`; otherwise the arguments go one per
line, one level in, with the closing parenthesis alone. Arguments that
hold no container stay on one line however wide it is: a scalar is no
narrower on a line of its own.

**The root, and what never changes.** The root map has no braces.
Includes and alias declarations are statements like any other, kept
where the author put them and in that order. The formatter never
reorders a key, an element, an include or a declaration; never renames
a key; never introduces an alias; never resolves an include or reads a
file it was not given; never changes a number, a string's content or a
parenthesis; and never breaks a line.

## The published grammar

Canon is the shape a grammar can be written for (every key quoted,
one spelling per construct) and
[`grammar/aontu.abnf`](../grammar/aontu.abnf) is that grammar, in
RFC 5234 notation with RFC 7405's case-sensitive `%s"…"` literals.
The same rules are published for two machine consumers as
[`aontu.gbnf`](../grammar/aontu.gbnf) and
[`aontu.lark`](../grammar/aontu.lark); this is the form to read.

It is the **emission surface**: what a document should be allowed to
write, a superset of JSON plus the operators, constraints and marks
canon emits. It is **conservative by construction** (it may accept
less than the parser does, never more) and it makes two deliberate
exclusions. `@"…"` includes are absent, because a generated document
should describe values rather than reach for files. So are unquoted
keys and the other spellings the parser tolerates, because canon does
not emit them.

The grammar is executed, not merely published: `ts/test/grammar.test.ts`
reads the file, interprets it, and requires it to accept **every
canonical-form output in the shared spec suite** (several hundred of
them) and to refuse the excluded forms. A rule the engine has
outgrown fails the suite.

### How a value composes

Whitespace is permitted between every element and is not drawn; the
`ws` rule in the grammar text carries it. Each track is one rule, and a
box in one is a link to its own track.

![Railroad diagram of the aontu grammar's structural rules: a value is a disjunction of conjunctions of prefixed sums, and an atom is a map, list, function call, reference, kind, placeholder, scalar or parenthesised value.](figures/aontu-syntax.svg)

### How one is spelled

The scalar forms, the character rules behind a string, the four numeric
spellings, and whitespace itself.

![Railroad diagram of the aontu grammar's lexical rules: the kind names, the scalar forms, a string as a quoted run of escaped or unescaped characters, the exact 0d literal, the plain number with its optional fraction and exponent, and whitespace.](figures/aontu-lexical.svg)

The function-name rule is drawn as one node rather than as a fan of
alternatives; the names are in the grammar text and in
[Functions](#functions), with what each one means.

## Generation

This section is about producing a **value** from a model. Producing
target-language **source** from one is a different thing with the same
name: see [Generate code from a model](how-to/generate-code.md).

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

The last line, run through the CLI's exact emitter:

<!-- test: scenario exact-gen -->
<!-- test: run -->
```sh
$ echo 'a: 0d1000 b: 0d1e3' | aontu
{
  "a": 1000,
  "b": 1000.0
}
```

That is the leaf distinction reaching the output: a
biginteger emits `1000`, and the integral bigdecimal beside it emits
`1000.0`, because that trailing place is part of a bigdecimal's own
digits. The plain family behaves the other way: an integral float
loses its point, so `b:2.0` generates `2`.

The native values follow: `bigint` and `Decimal` in TypeScript,
`*big.Int` and `*aontu.Decimal` in Go, each carrying the exact value.
TypeScript's `JSON.stringify` cannot serialise a `bigint`, so the
library exports its own exact emitter (`exactJSON`): the one the
`aontu` command uses.

Object key order is not significant in generated output, and within
the plain family neither is numeric kind. Between the exact leaves it
*is* significant, as the `1000` / `1000.0` pair shows, which is why the
shared suite pins those cases byte for byte rather than structurally.

## Subsumption

`A ⊒ B` ("A subsumes B") holds when **every instance the specific
value B admits, the general value A admits too**. It is the lattice's
own order, asked as a first-class query: `subsume(general, specific)`
in both engines, running after evaluation on finished trees, never
mutating them. The
verdict is three-valued plus `error`: `subsumes`, `does_not_subsume`
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
changing or removing one is `compat_default_changed`: previously
generable documents materialise differently or become incomplete.

### Rules, by value former

| A (general) | B (specific) | A ⊒ B |
|-------------|--------------|-------|
| `top` | anything | yes |
| preference `*x` |: | compares as what it admits (its superior type); its default value is the profiles' business, not the value set's |
| unresolved residue (reference, variable, unreduced conjunct or function) on either side |: | `undecided` (`sub_unresolved`): there is no admitted set to compare |
| anything | disjunction | every specific alternative must be admitted by A; a concrete failing alternative is a witness (`compat_narrowed`), a non-concrete one is `undecided` (`sub_disjunct_distribution`) |
| disjunction | non-disjunction | some general alternative must admit B member-wise; failure with concrete B is a witness, otherwise `undecided` (`sub_disjunct_distribution`): member-wise failure is not proof, the distribution case |
| scalar kind | scalar kind or scalar | the general kind admits the specific kind (`number ⊒ integer`) or the scalar's kind; distinct leaves are disjoint |
| scalar kind | constraint residual | the kind covers the residual's domain: `number` admits any numeric residual, a numeric leaf kind admits a residual pinned to that leaf, `string` admits any pattern residual |
| constraint residual | constraint residual | per the constraint algebra's own [subsumption table](#subsumption-1); a `must` on the general side is `undecided` (`sub_evaluate_only`) |
| constraint residual | scalar | membership, with `must` again `undecided`; `unique()` and `length` demands admit no scalar |
| concrete scalar | concrete scalar | identity: a concrete value subsumes only itself (kind included) |
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
  (one whose meaning depends on where it lands: `key()`, a
  reference) cannot be compared structurally:
  `sub_path_dependent_spread`, undecided.
- Under the `gen` profile, `type`/`hide` marks must agree on
  corresponding nodes (`compat_marks_changed`).

The `at` option anchors both documents at one path before comparing
(the validation verb's `--at`); a path missing from either side is an
`error` verdict.

### Default validity

The relation also powers an advisory lint: the validation verb reports a
`pref_not_instance` finding (severity `warning`, class `compat`) when a
disjunction's effective default is not an instance of any **remaining**
alternative. Under the admission gate this is no longer a soundness
hole (the preferred branch contributes its own value to the admitted set,
so `level: *wran | info | warn | debug` is a well-defined enum `{wran,
info, warn, debug}` defaulting to `wran`) but that spelling is also
exactly the shape of a *typo'd* default (`*warn` was probably meant),
which nothing at meet time can distinguish. The warning flags the
boundary: a default drawn from the written alternatives (`*8080 |
integer`) is silent; a default that widens them is what the warning reports.
Repeating the branch (`*warn | warn | error`) states "the default is a
first-class member", silences the lint, and enforces the same admitted
set.

## Errors

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
one (how many levels up the path to read: none means the parent), and
`neq`, which takes one or more exclusions. A wrong count is a mistake in
the source and is refused before anything is evaluated.

**An elided value is refused.** A key, element or spread written with
nothing after its colon (`a:`, `a?:`, `[,]`, `[1,,2]`, `x:$obj&:`) is a
mistake in the source
rather than a null: writing it as a null made the mistake
indistinguishable from a deliberate `a:null`. The error names the key or
index, not the container, except for a spread, which has no key of its
own and so refuses the map it belongs to.

Three things that look similar are not elisions and keep working: an
explicit `a:null`, a colon chain (`a: b:1`, whose value is the nested
pair), and a trailing comma (`[1,]`, `{a:1,}`).

A comma group and a written list are different counts:
`upper("a","b")` is two arguments and is refused, while
`upper(["a","b"])` is one: a list, which `upper` then refuses for its
kind rather than its count.

A **version-control conflict marker** is refused before the parse, with
a code of its own, `merge_conflict`. A marker line would otherwise fall
to the bare-string rule (`<` and `=` are punctuation outside any
syntax) and be refused as a stray character, which says nothing about
the merge that left it there. The match is git's exact shape: seven
`<`, `=` or `>` at the start of a line, followed by the end of the line
or a space before the branch label. A document may still write those
characters anywhere else in a quoted string (`a:"<<<<<<<"`); a bare
`a:<<<<<<` is refused, but as `bare_punct`, never as a conflict.

In conflict messages the operand later in the source is named first
("…value: `<later>` with value: `<earlier>`") so the two sites are
distinguishable.

## Grammars: `abnf()` and `parse()`

`re()` is deliberately small: the portable pattern subset both engines
agree on. Real formats are published as **grammars** rather than as
regexes, and transcribing one into that subset is at best lossy. `abnf()`
takes the grammar as written.

**`abnf(g)` compiles an RFC 5234 grammar and answers its source**, so a
parser is an ordinary string that canons, hashes and unifies like any
other. The compile is what the call is for: a grammar that does not
compile is refused where it is DECLARED, once, rather than at every site
that parses with it. Write this as `grammar.aon`:

<!-- test: scenario abnf-parse -->
<!-- test: file grammar.aon -->
```aon
G: abnf("v = n \".\" n\nn = 1*d\nd = %x30-39\n")
a: parse($.G, "1.2")
```

<!-- test: run -->
```sh
$ aontu grammar.aon
{
  "G": "v = n \".\" n\nn = 1*d\nd = %x30-39\n",
  "a": {
    "kids": [
      {
        "kids": [],
        "rule": "d",
        "src": "1"
      },
      {
        "kids": [
          {
            "kids": [],
            "rule": "d",
            "src": "2"
          }
        ],
        "rule": "n",
        "src": "2"
      }
    ],
    "rule": "v",
    "src": "1.2"
  }
}
```

**`parse(g, v)` answers the syntax tree** as ordinary maps and lists:
`rule` names the production that matched, `src` the text it matched, and
`kids` its children. `kids` is always present and always a list, so a
schema written against the tree need not ask whether a leaf has the key.

**A failure to parse is a failure to unify.** The call answers a refusal
(`parse_failed`), so a field is refused rather than set to a value
meaning "no". That is what lets a grammar act as a check:

```aon
G: abnf("v = 1*d\nd = %x30-39\n")
ok: parse($.G, "12") # the tree
no: parse($.G, "x") # [aontu/parse_failed]
```

**`parse(g)` with no value is the grammar as a constraint**, which is
what a schema position wants: there is no value there yet to hand the
call. It is value-preserving, like every other atom in
[the constraint algebra](#the-constraint-algebra): it admits a string
the grammar accepts and answers that string, so it stays idempotent and
order-independent under a meet, and a default can sit beside it. Write
this as `check.aon`:

<!-- test: scenario abnf-constraint -->
<!-- test: file check.aon -->
```aon
G: abnf("v = 1*d\nd = %x30-39\n")
tag: *""|parse($.G)
ver: (*""|parse($.G)) & "12"
```

<!-- test: run -->
```sh
$ aontu check.aon
{
  "G": "v = 1*d\nd = %x30-39\n",
  "tag": "",
  "ver": "12"
}
```

`tag` takes its default because nothing met it; `ver` was written with
`"12"`, the grammar accepts it, and the field keeps the string it was
given. Written with `"xy"` instead, both branches fail and the
disjunction is empty (`[aontu/empty]`). The tree is what the
two-argument form is for: a constraint that also rewrote its value would
have to carry the grammar that produced it for a second meet to mean
anything, and nothing needs that yet. `aontu:system`'s `Semver` is the
worked use: see [The `aontu:system` vocabulary](#the-aontusystem-vocabulary).

Four things are worth knowing before writing a grammar:

- **Whitespace is not skipped.** The grammars run here describe strings
  with no spaces in them, so `1 . 2` does not parse as `1.2`.
- **The empty string parses under no grammar.** The host engine answers
  an empty tree for empty input, which would make `parse(g, "")` succeed
  everywhere; it is refused instead.
- **The parse is bounded** at 100 000 steps. A grammar needing more is
  refused rather than run, for the reason `re()` refuses a pattern that
  backtracks exponentially.
- **`src` is the text the rule matched**, assembled from what the
  grammar consumed rather than sliced out of the input.
- **A character class must not contain a literal used elsewhere.**
  Write `digit = "0" / positive-digit`, never `digit = %x30-39`, when
  `"0"` also appears on its own. Where a class overlaps a literal the
  class wins, and the literal's alternative silently becomes
  unreachable, so a grammar that looks right refuses input it names.

The overlap rule is worth a moment, because a grammar that breaks it
looks correct and fails on ordinary input. The no-leading-zero rule of a
semantic version needs `"0"` as an alternative of its own:

<!-- test: skip an ABNF fragment, not an aontu document; the overlap rule it shows is pinned by the grammars in `aontu:system` and their rows in test/spec/aontu-system.tsv -->
```abnf
numeric-identifier = "0" / positive-digit *digit
positive-digit     = %x31-39
digit              = "0" / positive-digit
```

`digit` is spelled `"0" / positive-digit` rather than `%x30-39` so that
a `0` is always the same token wherever it appears. Spell it as the
class and `numeric-identifier`'s `"0"` branch is never reached, so
`1.0.0` stops parsing while `1.2.3` still does.

### A grammar reads better in backticks

A backtick string spans lines, so a grammar can be written as a grammar
rather than as a run of escapes. Write this as `media.aon`:

<!-- test: scenario abnf-backtick -->
<!-- test: file media.aon -->
```aon
G: abnf(
  `
media = "@" type "/" sub
type = 1*ALPHA
sub = 1*ALPHA
ALPHA = %x61-7A
`
)

ok: "@text/plain" & parse($.G)
```

<!-- test: run -->
```sh
$ aontu media.aon
{
  "G": "\nmedia = \"@\" type \"/\" sub\ntype = 1*ALPHA\nsub = 1*ALPHA\nALPHA = %x61-7A\n",
  "ok": "@text/plain"
}
```

The leading newline is part of the string and costs nothing: a grammar
is a list of rules, and ABNF ignores a blank line. The bundled
[`aontu:system`](#the-aontusystem-vocabulary) model still spells its two
grammars with `\n` escapes, because its text is held in a raw string
literal in each port and a raw string cannot contain a backtick.

### A grammar can say what it builds

The tree is the default, not the only answer. A **value annotation**, a
trailing comment on a production, says what that rule should build
instead. Write this as `build.aon`:

<!-- test: scenario abnf-build -->
<!-- test: file build.aon -->
```aon
G: hide(
  abnf(
    `
ver = maj "." min "." pat   ; @object maj min pat
maj = 1*DIGIT
min = 1*DIGIT
pat = 1*DIGIT
DIGIT = %x30-39
`
  )
)

v: parse($.G, "1.2.30")
```

<!-- test: run -->
```sh
$ aontu build.aon
{
  "v": {
    "maj": "1",
    "min": "2",
    "pat": "30"
  }
}
```

Nothing in `1.2.30` spells `maj`. The keys come from the comment, and
`; @object` names one member per part of the rule that produces a value:
a rule reference, a group or a repetition. A literal produces nothing
and is never named, which is why `"."` is not a member and three
references take three names.

**`; @array` names nothing** and takes every part that produces a value
as an element, in order. Shapes compose, because a part whose own rule
is annotated is assigned whole. Write this as `list.aon`:

<!-- test: scenario abnf-list -->
<!-- test: file list.aon -->
```aon
G: hide(
  abnf(
    `
list = "[" entry *( "," entry ) "]"   ; @array
entry = key "=" val   ; @object key val
key = 1*ALPHA
val = 1*DIGIT
ALPHA = %x61-7A
DIGIT = %x30-39
`
  )
)

entries: parse($.G, "[width=10,height=20]")
```

<!-- test: run -->
```sh
$ aontu list.aon
{
  "entries": [
    {
      "key": "width",
      "val": "10"
    },
    {
      "key": "height",
      "val": "20"
    }
  ]
}
```

A repetition contributes one element per item, so a list comes out a
list rather than the run's matched text.

Five things to know before writing one:

- **It is about the output, never the language.** A comment is the one
  place in RFC 5234 that carries no meaning of its own, so delete every
  annotation and the same inputs parse. You get the tree back.
- **Every leaf is still text.** The annotation chooses the container,
  and there is no scalar form, so `"30"` is a string and stays one.
- **The leading fold is answered, not removed.** Naming a member keeps
  it, so the `"v"` the next section needs is unnecessary here. Where the
  fold would erase a member's own built value the compile is REFUSED,
  with a diagnostic naming the rule and what to write instead.
- **A rule that builds a value contributes no text** to whatever
  contains it. Mixing the two is supported; just do not read `src` on a
  node that contains an annotated rule.
- **The refusals are deliberate.** More than one alternative, a member
  count that does not match the parts, a duplicate member name, and a
  leading member whose own rule builds a value are all refused where the
  grammar is declared rather than built into a differently-shaped value.

**Either builder nests inside the other.** An `@array` is a member of
an `@object`, an element of another `@array`, or an object's only
member, and answers the same value in both engines.

### Shaping an unannotated tree

The answer is the RAW tree, so a document that wants natural structure
builds it with the language's own verbs. Three do the work:
[`pick`](#projecting-fields-pick) projects one field of every child,
[`filter`](#selecting-filter-and-match) selects children by rule, and
[`join`](#folding-to-a-string-join) folds a one-element selection back
to a scalar. `hide()` keeps the grammar and the tree out of the
generated document. Write this as `shape.aon`:

<!-- test: scenario abnf-shape -->
<!-- test: file shape.aon -->
```aon
G: hide(
  abnf(
    `
ver = "v" maj "." min "." pat
maj = 1*DIGIT
min = 1*DIGIT
pat = 1*DIGIT
DIGIT = %x30-39
`
  )
)

t: hide(parse($.G, "v1.2.30"))

parts: pick($.t.kids, src)
names: pick($.t.kids, rule)
minor: join(pick(filter($.t.kids, { rule:"min" }), src))
whole: $.t.src
```

<!-- test: run -->
```sh
$ aontu shape.aon
{
  "minor": "2",
  "names": [
    "maj",
    "min",
    "pat"
  ],
  "parts": [
    "1",
    "2",
    "30"
  ],
  "whole": "v1.2.30"
}
```

**A leading field loses its name**, and that is the one shape rule a
grammar author has to know. The compiler folds a production's first
element into the parent's node, so `ver = maj "." min "." pat` answers a
first child named `DIGIT` where the version above answers `maj`. The fix
is the `"v"` above: give the production a leading terminal and every
field keeps its name. Both engines do this identically, so it is a
property of the grammar compiler rather than a difference between the
ports.

Both limits belong to the tree, and the annotation above answers the
first: name the members and the leading field keeps its name with no
terminal in front of it. The second it does not answer. Every leaf is
the **text** the rule matched, so `"30"` is a string under either
spelling, and nothing turns it into `30`.

## The constraint algebra

> All nine atoms (the bounds `min`/`max`/`above`/`below`, the
> exclusion `neq`, the pattern `re`, the sizing atoms `length` and
> `unique`, and the evaluate-only `must`) are implemented in both
> engines over the four-leaf number tower, pinned by the
> [`test/spec/constraint-*.tsv`](../test/spec/) suites. Violations
> raise the registered `constraint` code, and a pattern outside the
> portable subset raises `constraint_pattern`. Known limit: a
> preference meeting a constraint in a CONJUNCT (`min(1024) & *8080`)
> does not resolve to the default: use the disjunct form
> (`*8080 | (integer & min(1024))`). Under the admission gate
> the disjunct form also ENFORCES on override: an
> out-of-bound peer is refused rather than silently bypassing the
> constraint branch, so the recommended spelling both defaults and
> validates.

### Vocabulary

Nine builtins join the function registry. Eight are **Band A**: full
lattice citizens with defined meet, emptiness, subsumption, and
canonical form. One is **Band B**: evaluate-only, and reported
as such. There is no new grammar: atoms are ordinary functions.

| Atom | Band | Meaning |
|------|------|---------|
| `min(n: number\|string) : constraint` | A | value ≥ x (numeric, or string with lexical order) |
| `max(n: number\|string) : constraint` | A | value ≤ x |
| `above(n: number\|string) : constraint` | A | value > x |
| `below(n: number\|string) : constraint` | A | value < x |
| `neq(...vals: number\|string) : constraint` | A | value is none of the listed scalars (leaf-aware) |
| `re(text p: string) : constraint` | A | string matches pattern p (unanchored, portable subset) |
| `length(n: number\|constraint) : constraint` | A | length/count satisfies integer constraint c |
| `unique(projector k?: string) : constraint` | A | members pairwise distinct (list elements, map values) |
| `must(trial c: any, text msg: string) : constraint` | B | evaluate-only check with an author message |

### Bounds and the number tower

Three rulings, each forced by the tower's disjoint leaves
(`integer`, `float`, `biginteger`, `bigdecimal` under the pure
supertype `number`):

1. **Order is a property of the number line, not the leaf.** A
   numeric bound constrains the value's mathematical position and is
   satisfied by ANY numeric leaf at an admissible position:
   `min(0) & 0d5` is `0d5`, `above(1) & 1.5` is `1.5`. Comparison is
   exact across leaves: every binary64 is exactly a rational, so a
   `float` compares with an exact decimal without rounding, in both
   implementations. A numeric bound implies the kind `number` (the
   supertype); it never narrows the peer's leaf.
2. **Endpoints keep their written leaf.** Canon round-trips kind
   (rule R4), so `min(1)`, `min(1.0)` and `min(0d1)` are distinct
   canonical texts denoting the same bound point. When two endpoints
   at the SAME point meet (`min(1) & min(1.0)`), the survivor is the
   one whose leaf sits lowest in the tower order
   `integer < float < biginteger < bigdecimal`: a deterministic
   choice both implementations make identically.
3. **`neq` excludes by scalar identity (leaf and value**) because
   that is what scalar identity means in the lattice (`1 & 1.0` is a
   conflict; `1|1.0` keeps both alternatives). `neq(1)` excludes the
   integer `1` and admits the float `1.0`. To exclude a point on the
   whole number line, list its leaves: `neq(1, 1.0)` (the exact
   leaves are opt-in, so `0d`-free documents need only these two).

String bounds (`min("a")`) use lexical code-point order and imply
`string`. Mixing domains in one meet (`min(0) & min("a")`) is empty
and yields nil.

### The meet

`atom & atom` (same domain) is symbolic: decided at
schema-composition time, before any data arrives:

| Meet | Result |
|------|--------|
| interval & interval | intersection: `min(0) & min(5)` → `min(5)`; `min(2) & max(10) & max(7)` → `min(2)&max(7)` |
| `neq` & `neq` | exclusion-set union, arguments sorted |
| `re` & `re` | regex-set accumulation (patterns sorted; never simplified) |
| `length(c1)` & `length(c2)` | `length(c1 & c2)`: the count atom reuses the numeric algebra recursively |
| bound & kind | domain narrowing: `integer & min(0)` keeps both (interval gains the integral-domain flag); `number & min(0)` keeps `min(0)` (already implied); `string & min(0)` → nil |
| bound & concrete scalar | membership by exact comparison → the scalar, or a two-site nil |
| bound & `must` | both kept; `must` stays opaque |

Meets are commutative and idempotent by construction (normalisation,
not term order, defines the result) so the lattice guarantee is
preserved.

### Emptiness

Decided **eagerly at unification time** where it is exact, and never
guessed where it is not:

- Empty interval: `min(5) & max(3)` → nil, both sites reported.
- Integral gap: an integral-domain interval containing no integral
  value: `integer & above(1) & below(2)` → nil. (Applies when the
  domain is narrowed by `integer` or `biginteger`.)
- Point deletion **requires a narrowed leaf**: `min(3) & max(3)`
  admits the point 3 in any numeric leaf, so `neq(3)` (which excludes
  only the integer `3`) does NOT empty it, but
  `integer & min(3) & max(3) & neq(3)` → nil. This is the tower
  re-derivation of the pre-tower example, and the spec rows pin both
  directions.
- `length(c)` is empty iff `c & integer & min(0)` is.
- Regex emptiness is deliberately approximate: distinct `re` atoms
  accumulate and are never declared empty: sound (no false
  conflicts), incomplete (some contradictions surface only against
  data).

### Subsumption

*The `subsume` query implements this table in both engines (its
per-former rules are in [Subsumption](#subsumption) above). One
mapping to note: the
query answers the `must` row's "never" as `undecided` with reason
`sub_evaluate_only`: the admitted set is opaque, which is
undecided rather than refused.*

`A ⊒ B` ("A subsumes B", B is an instance of A) holds when **every
value B admits, A admits too**. It is the lattice's own order, and for
this algebra it is decided per atom family rather than by search. Three
properties make it useful: it is reflexive (`A ⊒ A`), transitive, and
`A ⊒ B` exactly when `A & B` is `B`, so an implementation has a free
cross-check against the meet table.

**Soundness before completeness.** Where a rule below cannot decide, the
answer is **not subsumed**, never a guess. That direction is the safe
one for the `subsume` query built on it: a compatibility check that wrongly
reports "breaking" costs a reviewer a second look, while one that
wrongly reports "compatible" ships the break. Two rules are approximate
in this sense and are marked; the rest are exact.

| A (general) | B (specific) | A ⊒ B when |
|-------------|--------------|------------|
| no kind     | any          | always: an unnarrowed residual admits every leaf its domain has |
| `number`    | any numeric leaf, or a numeric residual | always: the supertype admits every leaf |
| leaf `k`    | leaf `k'`    | `k == k'`; distinct leaves are disjoint, so neither subsumes the other |
| interval    | interval     | A's interval contains B's: A's lower endpoint is at or below B's, A's upper at or above, and where endpoints coincide A's may not be the open one |
| interval    | concrete scalar | the scalar is admitted by A (the membership rule of the meet) |
| no bound on a side | any    | an absent endpoint is ±∞ and contains everything |
| `neq(S)`    | `neq(T)`     | `S ⊆ T`: excluding *fewer* values is more general. `neq(1) ⊒ neq(1,2)` |
| `neq(S)`    | concrete scalar | the scalar is in neither S nor excluded by A's other atoms |
| `re(P)`     | `re(Q)`      | **approximate**: `P ⊆ Q` as a *set of pattern strings*. Adding a pattern narrows, so `re("a") ⊒ re("a")&re("b")` |
| `length(c)`    | `length(d)`     | `c ⊒ d`, recursively: the count atom reuses this same table over the integer domain |
| absent `length`/`unique` | present | always: an unsized residual admits every size |
| `unique(k)` | `unique()`   | always (reflexive); nothing else subsumes or is subsumed by it |
| `must(f)`   | anything     | **never**: a Band B predicate is opaque, so A's admitted set is unknown |
| anything    | `must(…)`    | decided by A's other atoms alone; an extra `must` on B can only narrow B |
| anything    | nil (empty)  | always: the empty set is an instance of everything |

A whole residual subsumes another when **every** row above holds for the
corresponding atom families, and the domains agree (a numeric residual
never subsumes a string one, or a container one).

**Why the two approximations are where they are.** `re` compares
patterns as *text* because deciding that `^a` admits everything `^ab`
admits is regex containment, which this algebra deliberately does not
do: the same ruling that stops two `re` atoms being declared empty at
composition time. `must` is opaque by construction: that is what Band B
*means*. In both cases the answer is "not subsumed", so the error is
always toward reporting a difference that is not there.

**Normalisation makes the spelling irrelevant.** Subsumption is decided
over the *normalised* residual, so two spellings of one constraint
subsume each other in both directions. `min(0)&max(10)` and `max(10)&min(0)`
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
in a fixed order (**kind, lower bound (`min`/`above`), upper bound
(`max`/`below`), `neq` (arguments sorted), `re` (patterns sorted),
`length`, `unique`, `must`**) no spaces, reparseable, endpoint leaves
preserved:

```aon
a: integer & max(10) & min(0) & min(2)
# canon: {"a":integer&min(2)&max(10)}
```

`parse(canon(v)) == v` holds for every atom and every normalisation
rule: the reparse produces a conjunct of atoms that normalises back
to the identical residual. Spec rows pin a round-trip and an
order-independence case (`min(0)&max(10)` vs `max(10)&min(0)` →
identical canon) for each rule.

Two renderings follow from that round trip rather than from taste:

-  **`length`'s argument renders unabridged**, implied parts and all:
  `length(3)` canonicalises to `length(integer&min(3)&max(3))`, because
  that *is* the residual the count must satisfy (`length(c)` always
  meets `integer & min(0)`; see [`length`
  semantics](#length-semantics)). Abbreviating it would mean a second
  set of rules for when the implied parts may be dropped, and canon is a
  normal form ([`aontu hash`](reference-api.md#aontu-hash) digests it) not
  a pretty-printer.
- **A bare domain is spelled out when nothing implies it.** An order
  atom's argument names its own domain, so `min(2)` need not say
  `number`. A sizing residual carries no order, so `string & length(3)`
  renders as `string&length(...)`: drop the `string` and the reparse would
  admit lists and maps of three members too.

### `re` and the portable pattern subset

`re(p)` admits a string matching `p`. Matching is **unanchored** in
both implementations, so `re("el")` admits `"hello"`; anchor with `^`
and `$` to constrain the whole string. The string kind is implied, so
`string & re("x")` canonicalises to `re("x")`: the same rule that
makes `number & min(0)` canonicalise to `min(0)`.

A pattern must mean the same thing in both implementations **and cost
about the same to evaluate**, and the two host regex engines guarantee
neither: TypeScript compiles with JavaScript's backtracking `RegExp`, Go
with RE2: a different language, in a different complexity class, over a
different alphabet.

aontu therefore **defines** the pattern language and rewrites your
pattern into a form neither engine can read two ways. Only the rewritten
form reaches a host engine.

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

**aontu defines the abbreviations**, and inherits neither host's:

| written | means | 
|---|---|
| `\d` / `\D` | `[0-9]` / `[^0-9]` |
| `\w` / `\W` | `[0-9A-Za-z_]` / `[^0-9A-Za-z_]` |
| `\s` / `\S` | `[ \t\n\r\f\v]` / `[^ \t\n\r\f\v]` |
| `.` | `[^\n]` |
| `\A` / `\z` | `^` / `$` |

These are the small ASCII sets deliberately. **`\s` is those six
characters only**: it does *not* match U+00A0 or the other Unicode
spaces, though JavaScript's `\s` does, because a non-breaking space in
a config value is a mistake worth catching rather than a space worth
accepting in silence. Matching counts **code points**, not UTF-16 code
units, in both implementations.

**What `re` refuses**, and why rewriting cannot help:

| Construct | Why |
|-----------|-----|
| backreferences `\1`–`\9`, `\k<name>` | RE2 has no equivalent, and a pattern using one is not a regular expression at all |
| lookaround `(?=)` `(?!)` `(?<=)` `(?<!)` | same: not in RE2 |
| any `(?…)` but `(?:` | named groups are spelled `(?P<n>` in RE2 and `(?<n>` in JavaScript; inline flags change the meaning of everything after them |
| `\p{…}`, `\x{…}`, `\u`, `\Z` | spelled differently, or read as a literal by one engine |
| POSIX classes `[[:alpha:]]` | RE2 only |
| empty classes `[]`, `[^]` | a never-matching class in JavaScript, a parse error in RE2 |
| a repeat count above **1000** (`a{1001}`, `a{2,1001}`) | RE2 refuses to compile it and JavaScript accepts it, so the same schema was valid in one implementation and not the other. The bound is **aontu's**, checked in the normaliser before either engine sees the pattern, which is why the refusal is the same in both |
| a quantifier applied to `^`, `$`, `\b` or `\B` | there is nothing to repeat: JavaScript under the `u` flag calls it a syntax error, RE2 quantifies the assertion and matches |
| a `{` that opens no counted quantifier (`x{y}`), or a `}` that closes none | JavaScript reads each as a lone quantifier bracket and refuses; RE2 reads both as literals |
| a quantifier on a group containing a quantifier or an alternation | **cost, not meaning**: see below |

The last one is different in kind. `(a+)+$` against twenty-nine `a`s and
a `!` takes **45 seconds** in JavaScript and 0.065s under RE2, growing
exponentially; a regex match is counted by no evaluator budget ([the
trust contract](trust.md), clause 2), so without this rule an untrusted
schema could stall the TypeScript evaluator indefinitely. Rewriting
cannot fix a complexity difference, so this one is refused rather than
normalised. `(?:a|b)+` is caught by it too, though it is safe: deciding
that two alternation branches cannot both match is real work. Write
`[ab]+`. Unquantified groups, top-level alternation, `(?:ab)+`, `(a)(b)`
and `(a)+` all pass, and a quantifier inside a character class is a
literal character (`[a+]+` is fine).

The refusal message names the offending construct *and* restates this
whole table, so an author never has to find this page to recover.

Patterns **accumulate** and are never simplified: `re("x") & re("a")`
keeps both (sorted by pattern text in canon), and a value must match
every one. Two `re` atoms are never declared empty at composition time,
because deciding that one pattern excludes another is regex
containment, which this algebra deliberately does not do. A contradiction
between patterns therefore surfaces against data, not against the
schema.

Canon renders the pattern **as written**, never the rewritten form:
canon round-trips source, and the semantic hash
([`aontu hash`](reference-api.md#aontu-hash)) is taken over canon.

### `length` semantics

`length` applies to strings, lists, and maps, with the domain fixed by
the peer:

- **strings**: length in **Unicode code points**: not UTF-16 code
  units (TS's native count) and not bytes (Go's): `length(1) & "𝄞"`
  holds, in both implementations. Astral-plane rows are part of the
  spec suite, not an implementation accident.
- **lists**: element count. **maps**: entry count.

Its argument is any integer-domain constraint: `length(3)` means exactly
3; `length(min(2) & max(5))` means between 2 and 5. Every argument meets
`integer & min(0)` (a count is a non-negative whole number) which is
what makes `length(max(-1))` and `length(1.5)` empty on their own, and what
canon renders.

Like every other atom's argument, it **residuates** until it settles:
`length($.n)` waits for `$.n`, then checks the count. Only
a *settled* argument of the wrong shape (a string, a boolean, a
contradictory kind) is refused.

A sizing residual has **no domain of its own** (a count says nothing
about what is counted) so meeting a kind *sets* one rather than merely
agreeing with it. `string & length(3)` is a three-character string, and
`number & length(3)` is empty, because a number has neither a length nor
members. `min(2) & unique()` and `re("^a") & unique()` are empty for the
same reason.

**`length` counts what generates.** An optional key that never resolves
is dropped at generation, so it does not count. The constraint is a
claim about the data, and the data is what comes out:

```aon
a: string & length(3)
a: abc
b: length(1) & { x:1 y?:number }
```

```json
{"a":"abc","b":{"x":1}}
```

`b` holds because the generated value is `{"x":1}`: one member.

**When the count is decided.** An optional key **survives unification
carrying its unresolved value** (`{x:1, y?:number}` canonicalises as
`{"x":1,"y"?:number}`) and is dropped only in generation
(`BagVal.gen`). It is tempting to conclude that the count is therefore
unknowable until generation, and that `length` must wait for a drop. It
must not: nothing in the fixpoint performs that drop, so an atom waiting
for it waits forever.

The count is knowable earlier, because *whether a member will generate*
is decided before generation runs. A member is skipped by generation
when it carries a `type` or `hide` mark, or when it is an optional key
whose value cannot generate. So:

- **Every optional child settled**: this includes `{x:1, y?:number}`,
  where the map converges immediately and `y` holds an
  unresolved kind. The count is known, and `length` decides at composition
  time like every other atom, `length(1) & {x:1, y?:number}` included.
- **Some optional child still converging**: `{x:1, y?:$.z}` before `z`
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
a: { x:1 y:2 }
```

```json
{"a":{"x":1,"y":2}}
```

Layering fragments like this is the point of the language, and an atom
that folded early would count `{x:1}` alone and refuse it. So the two
kinds of atom take different slots in the conjunct sort order (`cjo`):
the order atoms fold before containers, the sizing atoms after every
value that could contribute a member. The size is then read once, from
the merged container.

Written order does not matter (`a: {x:1} a: {y:2} a: length(2)` is the
same value) which is the property the sort order exists to guarantee.

**`must` folds last for the same reason**, and the slot is named for
what the three atoms share rather than for sizing alone: `length`,
`unique` and `must` all need the *whole* value. An evaluate-only check
run against the first fragment would refuse `a: must(length(2),m)` /
`a: {x:1}` / `a: {y:2}` on a count of one, exactly as an early-folding
`length` would.

**And "last" reaches past the document.** Sorting the atom to the end of
its conjunct is only half the rule, because a container can settle in
one document and still gain members from another: the data half of a
[`vet`](reference-api.md#aontu-vet) meet, an
[`@` include](#source-loading-), a later [`pack`](#generating-children-pack-and-each).
An atom that decided when its own conjunct settled decided too early
there, and `vet` then reported `valid` for data the evaluator refuses.

So a sizing verdict is taken only when **more members cannot change
it**: members accumulate under unification, they are never removed:

| reading | permanent? | what happens |
|---|---|---|
| an upper bound **violated** | yes: more members only add | refuse now |
| an upper bound **satisfied** | no | the atom stays on the value |
| a lower bound **satisfied** | yes | that reading is spent |
| a lower bound **violated** | no | the atom stays on the value |
| a **duplicate** found | yes | refuse now |
| distinctness **so far** | no | the atom stays on the value |

Anything provisional **residuates**, exactly as an atom over a container
that has not settled does, and is decided at **generation**, which is
where nothing more can arrive. So `length(min(1)) & {&: {r: integer}}`
no longer refuses the schema it was written for, and
`length(max(2)) & {&: {r: integer}}` no longer passes three records.
A residuated atom is visible in [canon](#canonical-form), which is the
correct rendering: the value really does still carry the constraint.

### `unique` semantics

`unique()` holds when the members of a container are **pairwise
distinct**, compared by **canonical form**: two members are the same
member exactly when their canons are equal.

Canon is the right yardstick because it is already this language's
normal form for "the same value": `ConstraintVal.same` compares canons,
and `DisjunctVal` deduplicates members that way. It is deterministic,
byte-identical across the two implementations (every `canon` spec row
pins that), and it is defined for *every* value, which scalar identity
is not.

For scalar members it reduces exactly to scalar identity (leaf *and*
value) because canon round-trips kind: `1` and `1.0` canon differently,
so `[1, 1.0]` is distinct under the number tower, exactly as `1 & 1.0`
is a conflict. For **container** members it gives structural equality
without a separate rule: `[{x:1},{x:1}]` is not unique, because both
elements canon as `{"x":1}`, and `[{x:1},{x:2}]` is.

It applies to two shapes:

- **lists**: the elements are pairwise distinct.
- **maps**: the entry *values* are pairwise distinct. (Keys are
  distinct by construction, so there is nothing to check there.)

Any other peer (a string, a number, a boolean, `null`) is a domain
conflict: no scalar has members. The members it does compare are the
members that *generate*, the same set `length` counts, so a `hide`n entry
and a dropped optional are not members here either.

**`unique(k)` is uniqueness by projection.** "No two services share a
port" compares one field of each member rather than the whole member,
and the atom's single argument is that projector: the arity was
reserved for it, and is now spent:

```aon
services: unique(port) & {
  api: { port:8080 name:"api" }
  auth: { port:8443 name:"auth" }
}
```

```json
{"services": {
   "api":  {"port": 8080, "name": "api"},
   "auth": {"port": 8443, "name": "auth"}}}
```

A member with no such key **fails** rather than being skipped:
distinctness that cannot be shown is distinctness the collection does
not have, and skipping would let one keyless record hide a duplicate.
A member that is not a map fails for the same reason: it has no key
to project.

`unique(a) & unique(b)` demands **both**; the keys accumulate rather
than the later one replacing the earlier, since each names a different
axis of distinctness and dropping either would silently weaken the
constraint. Canon renders them sorted after the bare atom
(`unique()&unique("a")&unique("b")`), so two documents saying the same
thing render the same string. In subsumption, a general `unique(k)`
needs the same key on the specific side (distinctness on `port` says
nothing about distinctness on `name`) while a specific that adds a
key still subsumes, because more distinctness is narrower.

### Cross-field bounds and residuation

An atom whose argument contains an unresolved reference, or whose
peer is not yet concrete, **residuates**: no error, stays in place,
re-evaluated on later fixpoint passes. Atoms only ever suspend or
intersect (never force evaluation) so evaluation order cannot
change results.

```aon
scaling: floor: 2
scaling: ceiling: 10
scaling: target: integer & min($.scaling.floor) & max($.scaling.ceiling)

# target normalises to integer&min(2)&max(10) once floor/ceiling resolve
```

A residual that survives to generation is an error, exactly like an
unresolved kind today; exhaustion of the pass budget while residuals
are still refining is `budget_passes` ([the trust
contract](trust.md), clause 2).

### Band B: `must`

`must(c, msg)` wraps any aontu value as an evaluate-only check: it
residuates until its peer is concrete, then requires the peer to
unify with `c`; on failure the author's message is attached to the
nil (`NilVal.details`). `must` never participates in emptiness or
subsumption, and any report including one states that the check was
evaluate-only: the channel for domain rules beyond the
algebra.

### Errors

A constraint violation is an ordinary two-site nil in the existing
message family (`Cannot unify value: 99999 with value: max(65535)`),
with machine-readable `details`: the failing atom, the normalised
admissible interval/sets, and any `must` message. Codes ride the
[error-code registry](../test/spec/errcodes.tsv); rendering into
reports belongs to [`aontu vet`](reference-api.md#aontu-vet).

### Named constraint aliases

The algebra has no `int8`, `uint16` or `port` keyword, and does not
need one. A constraint is an ordinary value, so a name for one is an
ordinary field, and a `type()`-marked block gives you a library of
them that unifies like everything else and emits nothing.

This section names constraints by their **path** (`$.type.port`). For
the name-only spelling, `%port`, see [Aliases `%`](#aliases-); the two
are the same idea reached two ways, and a `%` alias may hold a
constraint just as a `type()` field can:

```aon
type: type({})

type: {
  uint8: integer & min(0) & max(255)
  int8: integer & min(-128) & max(127)
  port: integer & min(1) & max(65535)
}

listen: $.type.port
listen: 8080
```

```json
{ "listen": 8080 }
```

Three properties make this work, and all three are rules stated
elsewhere in this document rather than anything special to constraints:

- **The block is schema, so it does not generate.** `type()` marks its
  value as metadata, and a map field whose value is type-marked is
  omitted from the enclosing map ([Marks](#marks-type-and-hide)). The
  aliases are present for unification and absent from output.
- **A reference copies with the marks cleared.** `$.type.port` lands on
  a type-marked value and yields an unmarked one, so `listen` emits
  normally.
- **The alias is a constraint, not a value**, so it meets the concrete
  value at the referring field exactly as if it had been written there.

The key name is not reserved: `type` above is a field called `type`
that happens to be `type()`-marked. `defs`, `schema` or anything else
reads the same to the engine.

An out-of-range value is refused at the field that holds it. Write
this as `uint8.aon`:

<!-- test: scenario alias-range -->
<!-- test: file uint8.aon -->
```aon
type: type({})
type: uint8: integer & min(0) & max(255)
a: $.type.uint8
a: 300
```

<!-- test: run -->
```sh
$ aontu uint8.aon
[aontu/constraint]: Cannot unify values at path $.a
...
$ echo $?
1
```

`300` does not satisfy `max(255)`.

**Name the kind as well as the bounds.** `min(0) & max(255)` alone is a
bound on *numbers*, so `1.5` satisfies it; a sized integer is
`integer & min(0) & max(255)`. This is the one mistake the idiom
invites, and the reason the aliases above all lead with `integer`:

```aon
loose: type({})
loose: byteish: min(0) & max(255)
a: $.loose.byteish
a: 1.5
```

```json
{ "a": 1.5 }
```

Because an alias is a value, the aliases compose: one can be
written in terms of another, and a reference to an alias may be met
with further constraints at the point of use.

```aon
type: type({})
type: { n:integer & min(0) u8:$.type.n & max(255) }

small: $.type.u8 & max(15)
small: 12
```

```json
{ "small": 12 }
```

`u8` is written in terms of `n`, and `small` narrows `u8` again where
it is used. Nothing here is special to constraints: it is the meet,
applied to values that happen to be constraints.

A value that violates the composition is refused against the whole
residual, not against whichever atom noticed first:

```
Cannot unify value: 20 with value: integer&min(0)&max(15)
```

`max(255)` is absent because `max(15)` subsumes it, and `integer` and
`min(0)` are present because `20` still has to satisfy them. That
normalised form is what `vet --format json` reports as `expected`, and
what the value's [canon](#canonical-form) states.
