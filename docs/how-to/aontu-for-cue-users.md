---
description: Map what you write in CUE to what aontu writes, know where the same text gives another answer, and find the aontu verb for each `cue` command.
group: coming-from
order: 10
---

# Move from CUE to aontu

aontu and CUE share a core. Both evaluate by unification, with
disjunctions, `*` defaults, closed structures, and constraints that
meet as values. Their surfaces differ, so a CUE file is not an aontu
file, and some text that both read gives two different answers.

This guide takes the differences in the order you meet them: the
spelling of each CUE form, the text that answers differently, what
aontu has no form of, and the commands. The CUE answers are those of
CUE v0.17.1, and of v0.18.0-rc.4 where the two releases differ. Each
pair of examples is a pair of files in
[aontu's CUE corpus](../../test/cue/). The test suite runs each aontu
file through both aontu implementations, TypeScript and Go, and holds
both to one answer.

## Write the same thing in aontu's spelling

A bare word in aontu is a string, so a reference is a path, and a
field kept out of the output is marked with a call rather than named
with an underscore. In CUE:

<!-- test: quote test/cue/m12.cue -->
```cue
_h: 1
a: _h + 1
```

In aontu:

<!-- test: quote test/cue/m12.aontu -->
```aontu
h: hide(1)
a: $.h + 1
```

Both answer:

```json
{ "a": 2 }
```

`$.h` reads from the root of the document. A path that starts with
`.` reads the map the reference sits in.

CUE builds text by interpolation, and aontu builds it with `+`, which
writes a number into the text:

<!-- test: quote test/cue/g5.cue -->
```cue
port: 80
url: "http://h:\(port)"
```

<!-- test: quote test/cue/g5.aontu -->
```aontu
port: 80
url: "http://h:" + $.port
```

Both answer:

```json
{ "port": 80, "url": "http://h:80" }
```

A field under a condition is a `match`. It tests a value against a
pattern and answers the value paired with the first pattern that
admits it:

<!-- test: quote test/cue/g3.cue -->
```cue
env: "prod"
if env == "prod" {replicas: 3}
```

<!-- test: quote test/cue/g3.aontu -->
```aontu
env: prod
replicas?: match($.env, prod, 3, any)
```

Both answer:

```json
{ "env": "prod", "replicas": 3 }
```

A `let` is an alias, declared with `%` and kept out of the output.
Arithmetic other than `+` and unary `-` is a call:

<!-- test: quote test/cue/r8.cue -->
```cue
let x = 2
a: x * 3
```

<!-- test: quote test/cue/r8.aontu -->
```aontu
%x = 2
a: mul(%x, 3)
```

Both answer:

```json
{ "a": 6 }
```

The three tables that follow give the rest, one CUE form to a row,
each with the aontu spelling that says the same thing.

### Kinds and constraints

aontu names its kinds in full and writes each constraint as a call:

<!-- cue: s4 c13 c1 c3 c7 c4 c6 c8+c9 c10 c18 c15 c11 c13 c14 c16+c17 s7 s9 -->
| CUE | aontu |
|---|---|
| `int` | `integer` |
| `_` | `any` |
| `>=1`, `<=10` | `min(1)`, `max(10)` |
| `>10`, `<5` | `above(10)`, `below(5)` |
| `!=3` | `neq(3)` |
| `=~"^a"` | `re("^a")` |
| `!~"^a"` | `nof(0, re("^a"))` |
| `strings.MinRunes(3)`, `list.MinItems(2)` | `len(min(3))`, `len(min(2))` |
| `list.UniqueItems()` | `unique()` |
| `list.Contains(10)` | `contains(min(10))` |
| `math.MultipleOf(5)` | `mulof(5)` |
| `matchN(1, [int, string])` | `nof(1, integer, string)` |
| `matchIf({k!: _}, {n!: _}, _)` | `when({k: any}, {n: any})` |
| `error("a must not be negative")` | `must(min(0), "a must not be negative")` |
| `time.Format("2006-01-02")`, `net.IPv4` | `format("date")`, `format("ipv4")` |
| `9007199254740993` | `0d9007199254740993` |
| `0.1 + 0.2` | `0d0.1 + 0d0.2` |

The last two rows are exact numbers. A plain aontu number is a binary64
double, and a `0d` number keeps every digit. For more information, see
[The four numeric leaves](../reference-language.md#the-four-numeric-leaves).

### Schemas, templates, and names

A definition in CUE is a closed value kept out of the output. aontu
marks each of those properties with a call of its own:

<!-- cue: m14 m5 m8 x5 m21 m13 m12 m9 m10 g12+x7 m17 m4 -->
| CUE | aontu |
|---|---|
| `#Port: int & >=1` | `type({ Port: integer & min(1) })` |
| `#A: {x: int}`, then `#A & {x: 1, y: 2}` | `close({x: integer}) & {x: 1, y: 2}` |
| `#A: {x: int, ...}` | `open(close({x: integer}))` |
| `{#A..., x: 1, y: 2}` | `open(%A) & {x: 1, y: 2}` |
| `{#A, x: 1}` | `%A & {x: 1}` |
| `#D: {x: 1}`, then `a: #D` | `%D = {x: 1}`, then `a: %D` |
| `_h: 1` | `h: hide(1)` |
| `[string]: int` | `&: integer` |
| `[=~"^x"]: int` | `&: match(key(0), re("^x"), integer, any)` |
| `[N=_]: { name: N }`, `[string]~(K,_): {name: K}` | `&: { name: key() }` |
| `[...int]` | `[&: integer]` |
| `x!: int` | `x: integer` |

The `&:` entry is a spread. It unifies one template into every key of
a map, or every element of a list. `key()` in the template reads the
key it is applied at.

CUE writes a pattern that names its key in two ways. v0.17.1 takes
`[N=_]`, and v0.18.0-rc.4 refuses that alias and takes the postfix
form, `[string]~(K,_)`. aontu writes `key()` for both. The spread
`#A...` is a v0.18 form too, and v0.17.1 refuses it.

A key pattern also has a short form, `keyed`. CUE:

<!-- test: quote test/cue/m10.cue -->
```cue
m: [=~"^x"]: int
m: {xa: 1, b: "s"}
```

aontu:

```aontu
m: { &: keyed(re("^x"), integer) xa:1 b:"s" }
```

Both answer:

```json
{ "m": { "b": "s", "xa": 1 } }
```

`keyed(p, t)` means the guarded spread in the table,
`match(key(0), p, t, any)`. A pattern declares no key, so a closed map
refuses a key that only its pattern admits. A type that takes
patterned keys is held open, and closed again by `nil` as the last
argument. For more information, see
[Hold keys to a pattern](hold-keys-to-a-pattern.md).

### References and computation

Every reference in aontu is a path, and every computation but `+` is a
built-in call:

<!-- cue: r1+x6 r2 r7 s11 s12 g5 g3 x2 x1 g11 g13 g13 g7 g6 -->
| CUE | aontu |
|---|---|
| `y: x`, `y: self.x` | `y: .x` |
| `b: {c: a}` | `b: {c: $.a}` |
| `a[1]` | `$.a.1` |
| `7 / 2` | `div(7.0, 2)` |
| `6 * 7` | `mul(6, 7)` |
| `"http://h:\(port)"` | `"http://h:" + $.port` |
| `if env == "prod" {replicas: 3}` | `replicas?: match($.env, prod, 3, any)` |
| `if n >= 2 { size: "big" } else { size: "small" }` | `size: match($.n, min(2), big, small)` |
| `try { c: a.y? + 1 } else { c: 0 }` | `c: add(maybe($.a.y), 1) & *0` |
| `m: {(k): 1}` | `m: pack([$.k], 1)` |
| `len(l)` | `sum(each($.l, 1))` |
| `list.Max([1, 5, 3])` | `greatest([1, 5, 3])` |
| `list.Sum`, `list.Sort` | `sum`, `sort` |
| `strings.ToUpper`, `strings.Split`, `strings.Join` | `upper`, `split`, `join` |

`maybe` lets a missing path through every built-in and through `+`
as absence, so the default `*0` answers. `self` is a v0.18 form, and
v0.17.1 refuses it. For more information, see
[References and paths](../reference-language.md#references-and-paths)
and [Optional input: `maybe`](../reference-language.md#optional-input-maybe).

## Expect a different answer from the same text

Some text means one thing in CUE and another in aontu. The bare word
is the first a CUE user meets. In aontu it is a string:

<!-- test: quote test/cue/s18.aontu -->
```aontu
a: Mercury
```

```json
{ "a": "Mercury" }
```

In CUE the same line is a reference, and CUE refuses it because no
field is named `Mercury`. A lone default is the second. aontu reads
`*1` as a default that any integer overrides:

<!-- test: quote test/cue/d1.aontu -->
```aontu
a: *1
a: 2
```

```json
{ "a": 2 }
```

CUE allows `*` only on an alternative of a disjunction, and refuses
the same two lines.

The table gives every place where the corpus finds the two answers
apart. Each aontu cell starts with aontu's text, and a CUE
cell gives the CUE text where it differs:

<!-- cue: s5 s6+n1 s8+s9 s22 s21 s15 s24 s23 x9 s18 s19 s17 d1 d5 d6 m1+d11 m4+m22 m16+m15 x8 r4 g10 g12 -->
| Where | aontu | CUE v0.17.1 |
|---|---|---|
| The empty string | `a: string & ""` is refused, `string_empty`: `string` is a non-empty string | `{"a":""}` |
| Integer precision | `id: 9007199254740993` is refused, `lossy_integer_literal`, and `9007199254740992 + 1` is refused, `inexact_integer_sum` | `{"id":9007199254740993}` and `{"a":9007199254740993}` |
| Decimal arithmetic | `a: 0.1 + 0.2` is `{"a":0.30000000000000004}`, and `0d0.1 + 0d0.2` is `{"a":0.3}` | `{"a":0.3}` |
| The kind of `1e3` | `a: 1e3 & integer` is `{"a":1000}` | `a: 1e3 & int` is refused: `conflicting values 1E+3 and int (mismatched types float and int)` |
| A whole float | `b: 1.0 & number` is `{"a":1,"b":1}` | `{"a":1,"b":1.0}` |
| `+` with text and a number | `a: "port:" + 80` is `{"a":"port:80"}` | refused: `invalid operands "port:" and 80 to '+' (type string and int)` |
| `+` with two lists | `a: [1, 2] + [3]` is `{"a":[1,2,3]}` | refused: `Addition of lists is superseded by list.Concat` |
| `div` and `mod` of a negative number | `a: div(-7, 2)` is `-3`, and `e: mod(7, -2)` is `-1` | `-4` and `1` |
| Equality | `match({x: 1, y: 2}, {x: 1}, yes, no)` is `"f":"yes"`: the value admits the pattern | `{x: 1, y: 2} == {x: 1}` is `"f":false` |
| A bare word | `a: Mercury` is `{"a":"Mercury"}` | refused: `reference "Mercury" not found` |
| Single quotes | `a: 'abc'` is `{"a":"abc"}` | bytes, written as `{"a":"YWJj"}` |
| `1Ki` | `a: 1Ki` is `{"a":"1Ki"}` | `{"a":1024}` |
| A lone default | `a: *1`, `a: 2` is `{"a":2}` | refused: `preference mark not allowed at this position` |
| Two defaults that disagree | `a: *1 \| *2` is refused, `pref_rank_clash` | refused: `incomplete value 1 \| 2` |
| Ranked defaults | `a: *1 \| **2` is `{"a":1}`: `**` outranks `*` | no ranks: `a: *1 \| 2` |
| An optional key with a value | `x?: 1`, `y: 2` is `{"x":1,"y":2}` | `{"y":2}`: an optional field is never written |
| A key that data must supply | `x: integer` is refused, `mapval_no_gen`, and `x: 1` is `{"x":1}` | `x!: int` is refused: `field is required but not present`, and so is `x!: 1` |
| A list literal | `l: [integer, integer] & [1, 2, 3]` is `{"l":[1,2,3]}`, and `close([integer, integer])` fixes the length | refused: `incompatible list lengths (2 and 3)` |
| A field beside an embedded closed schema | `b: %A & {y: 1}` is refused, `closed` | `b: {#A, y: 1}` is `{"b":{"x":0,"y":1}}` |
| A cycle that a value resolves | `a: $.b`, `b: $.a`, `a: 1` is refused, `path_cycle` | `a: b`, `b: a`, `a: 1` is `{"a":1,"b":1}` |
| Output order | `l: each($.m, _)` is `{"l":[1,2],"m":{"a":1,"b":2}}`: keys are written sorted, and a map is walked in key order | `[for _, v in m {v}]` is `{"l":[2,1],"m":{"a":1,"b":2}}`: keys keep their source order |
| A key in a pattern | `&: { name: key() }` | `[N=_]: { name: N }` |

Each aontu answer is stated in the language reference. For more
information, see
[The empty string](../reference-language.md#the-empty-string-empty),
[Exact or refused: lossy literals](../reference-language.md#exact-or-refused-lossy-literals),
[The `+` operator](../reference-language.md#the--operator-and-grouping),
[Preference](../reference-language.md#preference--default-),
[Optional keys](../reference-language.md#optional-keys-), and
[Lists](../reference-language.md#lists).

### Where the CUE release decides

Three of those answers move between the two CUE releases. aontu
answers each the same either way:

<!-- cue: n2 x8 g12 -->
| Where | aontu | CUE v0.17.1 | CUE v0.18.0-rc.4 |
|---|---|---|---|
| Integer arithmetic past 34 digits | `0d12345678901234567890123456789012345678 + 1` is `12345678901234567890123456789012345679` | `1.234567890123456789012345678901235E+37`, rounded without an error | `12345678901234567890123456789012345679` |
| A field beside an embedded closed schema | refused, `closed` | `{"b":{"x":0,"y":1}}` | refused: `field not allowed` |
| A key in a pattern | `&: { name: key() }` | `[N=_]: { name: N }` | refused: `old-style alias syntax (=) is not allowed as of language version v0.18.0` |

## Find the nearest spelling where aontu has no form

Five things in CUE have no aontu form. Each is left out on purpose,
and each has a nearest spelling.

### Operators for constraints and comparison

CUE writes a bound as `>=1`, a pattern as `=~`, and compares with `==`,
`<` and `&&`. aontu names each constraint as a call, as the first
table shows, and has no comparison or logical operator. `match` and
`filter` ask whether a value is admitted by a pattern, and `&` and `|`
join constraints.

### Interpolation

aontu has no `\(x)` form in a string. Build text with `+`, which
writes a number into the text, and with the text built-ins: `join`,
`upper`, `lower`, `split`, `rep`, and their kin.

### Comprehension keywords

aontu has no `for`, `if`, or `let` clause. The built-ins `each`,
`pack`, `filter`, `emit`, `match`, and `apply` iterate a list or a map
that already exists. A loop whose length comes from a number alone
therefore has no spelling. In CUE:

<!-- test: quote test/cue/k30.cue -->
```cue
import "list"
n: 3
out: [for i in list.Range(0, n, 1) {"node-\(i)"}]
```

The nearest aontu, which is refused with `each_data`:

<!-- test: quote test/cue/k30.aontu -->
```aontu
n: 3
out: each($.n, "node-" + key())
```

A number can still bound a loop over a list the document writes:
`each(filter([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], below($.n)), "node-" + _)`
answers `["node-0","node-1","node-2"]`. For the spelling of each
comprehension, see
[Generating children: `pack` and `each`](../reference-language.md#generating-children-pack-and-each),
[Selecting: `filter` and `match`](../reference-language.md#selecting-filter-and-match),
and [Transforming: `emit`](../reference-language.md#transforming-emit).

### User-defined functions

aontu has a fixed set of built-ins and no user-defined functions, so
that every evaluation terminates. CUE v0.18.0-rc.4 previews them, and
v0.17.1 refuses the preview:

<!-- test: quote test/cue/x3.cue -->
```cue
@experiment(functions)
_add: func(a: int, b: int = 10) -> int: a + b
x: _add(1)
y: _add(1, 2)
```

The nearest aontu applies a template to one value:

<!-- test: quote test/cue/x3.aontu -->
```aontu
x: apply(1, add(_, 10))
y: apply(1, add(_, 2))
```

```json
{ "x": 11, "y": 3 }
```

`_` in the template is the value `apply` was given. For the reason,
see [Termination is part of the offer](../explanation.md#termination-is-part-of-the-offer).

### Workflows

`cue cmd` runs tasks that execute programs, call HTTP, and write files.
An aontu evaluation reads no clock, randomness, environment, or
network. To write files from a model, describe them as a
component tree and run `aontu render`. For more information, see
[The trust contract](../trust.md) and the
[Generation reference](../reference-generation.md).

## Run the aontu verb for each `cue` command

Each `cue` command has an aontu verb that does its work:

| CUE | aontu |
|---|---|
| `cue export` | `aontu <file>`, which prints the generated JSON |
| `cue eval` | `aontu -c <file>`, which prints the canonical form with its constraints |
| `cue def --out jsonschema` | `aontu jsonschema <file>`, which exports JSON Schema 2020-12 and reports each loss |
| `cue vet` | `aontu vet <schema> <data>`, which answers a verdict with each finding's code and both sites |
| `cue fmt` | `aontu fmt` |
| `cue trim` | `aontu trim --check`, which reports the entries a template already implies and rewrites nothing |
| `cue mod` | `aontu sync`, `aontu add`, `aontu publish` and `aontu pkg` |
| `-t name=value` into `@tag(name)` | `--var name=value` into `$name` |

Two of these differ in what they do. `aontu trim --check` reports and
leaves the file alone, where `cue trim` rewrites it. `aontu sync`
writes a lockfile, and the CUE module system has none. For every flag,
see the [command-line interface](../reference-api.md#command-line-interface).
