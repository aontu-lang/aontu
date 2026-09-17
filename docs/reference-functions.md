# Functions reference

aontu has 64 built-in functions and no user-defined ones. The name set
is closed: `test/spec/signature.tsv` declares one line per built-in, both
implementations carry a copy of that file inlined at build time, and a
name the engine does not hold is refused while the document is parsed.

This page is normative for the call surface. It states how many
arguments each name takes, which mode each argument slot is read in,
which kinds a slot admits, the result word the declaration gives, and
what a call is refused for. It tabulates that surface, then slices it
by result word, by rest slot, and by argument mode. It says nothing
about what any function means.

What each function means, with an example, is the language reference's
[Functions](reference-language.md#functions) index: one entry per
built-in, keyed by its whole signature. Nothing here repeats it. The
refusal codes named below are registered in `test/spec/errcodes.tsv`,
each with its class and the version it appeared in.

## Contents

- [How a call is checked](#how-a-call-is-checked)
- [Argument modes](#argument-modes)
  - [`value`](#value)
  - [`capture`](#capture)
  - [`template`](#template)
  - [`trial`](#trial)
  - [`projector`](#projector)
  - [`text`](#text)
- [The call surface](#the-call-surface)
- [Slices](#slices)
- [Related](#related)

---

## How a call is checked

Two checks run, at two different times, and they answer different codes.

The arity is decided at parse. The permitted count comes from the
declaration: a required slot raises the minimum, an optional slot raises
the maximum only, and a rest slot leaves the maximum open while counting
its group's length toward the minimum. The value builder compares that
interval against the number of comma-separated terms the author wrote
and, on a miss, puts a nil carrying `func_arity` where the call was. Its
class is `parse`. No argument has been evaluated at that point, so the
same broken reference is invisible while the count is wrong and reported
once the count is right:

<!-- test: run -->
```sh
$ echo 'a: add($.nope)' | aontu
[aontu/func_arity]: Cannot resolve value at path $.a
...
add takes exactly two arguments, but was given 1.
...
$ echo $?
1
$ echo 'a: add(1, $.nope)' | aontu
[aontu/no_path]: Cannot resolve value at path $.a
...
$ echo $?
1
```

The wording in that message is rendered from the interval and collapses
cases, so it is not itself the interval: `rep` takes three arguments and
prints `rep takes exactly one argument`, `project` takes none to two and
prints `project takes no arguments or one`, and `match`'s floor of three
is invisible in `match takes one or more arguments`. Read the arity
column of [the call surface](#the-call-surface) for the bound.

A list literal is one written term. `add([1 2])` therefore misses
`add`'s interval of two, while `neq([1 2])` satisfies `neq`'s minimum of
one and the atom then reads the list as its exclusions:

```aon
n: 3 & neq([1 2])
```

```json
{
  "n": 3
}
```

Kinds are checked at evaluation, after every argument has settled and
before the function resolves. The signature gate walks the declared
slots, stops at a rest slot, and reads only a slot whose mode is `value`
and whose declared type words are all scalar kinds: `string`, `number`,
`integer`, `float`, `biginteger`, `bigdecimal`, `boolean`, and `path`. A
slot declared `any`, `map`, `list`, or `constraint` is skipped, and so
is an argument that is absent, nil, or unsettled. What the gate admits
is a concrete scalar whose leaf kind is or sits below one of the
declared words, so `number` admits every numeric leaf and `string`
admits a path, while a scalar kind written in place of a value is
refused. A miss is `func_arg`, class `conflict`, and the message prints
the whole declaration and names the slot by number and by name:

<!-- test: run -->
```sh
$ echo 'a: upper(true)' | aontu
[aontu/func_arg]: Cannot unify values at path $.a
...
  argument 1 (`s`) was `true`.
...
$ echo $?
1
```

Eighteen names have a gated slot. The declaration alone would gate 23:
`key` is exempt by name, because its argument is a level rather than a
kind and `key_level` says what is wrong with a bad one, and `min`,
`max`, `above`, and `below` are constraint atoms that never reach the
gate, so a bad argument to one of those is `invalid-arg`. One further
boundary sits inside `parse`, whose one-argument form is the constraint
form and [meets](unification.md) its peer instead of resolving: so
`parse(1)` is `mapval_no_gen` and `parse(1, "x")` is `func_arg`.

Absence outranks the gate. The first absent argument drops the whole
call, unless the function forgives absence, and `maybe` is the only
built-in that does. A boolean in a gated slot is therefore silent when
an earlier slot is absent:

```aon
a: upper(maybe($.nope), true)
```

```json
{}
```

The order a call is refused in, first to last:

1. `func_arity`, from the written count, at parse.
2. Whatever refuses while the value-mode arguments are driven. A broken
   reference is `no_path`.
3. Absence, which drops the call.
4. `func_arg`, from the signature gate.
5. The function's own reading of its slots, which is `invalid-arg` or a
   code of that verb's own.

There is no declaration form for a function anywhere in the grammar:
the `func` rule enumerates the built-in names and admits no other
([The published grammar](reference-language.md#the-published-grammar)).
A name the engine does not hold answers `unknown_function`, class
`reference`, also at parse, and a call cannot be applied to a further
argument list:

<!-- test: run -->
```sh
$ echo 'a: nonesuch(1)' | aontu
[aontu/unknown_function]: Cannot resolve value at path $.a
...
$ echo $?
1
$ echo 'a: add(1)("x")' | aontu
[aontu/unknown_function]: Cannot resolve value at path $.a
...
$ echo $?
1
```

A name in a value position is an ordinary string, because only `name(`
builds a call:

```aon
a: upper
```

```json
{
  "a": "upper"
}
```

An alias may hold a call, which is how a named constraint and a named
`emit` table are written ([Named constraint
aliases](reference-language.md#named-constraint-aliases)), and it still
cannot be a function name: `%Up = upper` followed by `%Up("x")` is
`unknown_function`.

```aon
%U = upper("x")
n: %U
```

```json
{
  "n": "X"
}
```

There is no partial application. The arity is a closed interval checked
against the written count, so an under-supplied call is a refusal, not a
[residual](unification.md) function waiting for the rest. A parse-time
nil is reported where the value is reached rather than where it was
built, so a miss inside a losing disjunct branch is silent:

```aon
a: *1|add(1)
```

```json
{
  "a": 1
}
```

## Argument modes

A declaration marks each slot with the mode it is read in and leaves
`value` unmarked. There are six: `value`, `capture`, `template`,
`trial`, `projector`, and `text`. The grammar of the declaration line,
including the mode vocabulary, is the header of
`test/spec/signature.tsv`.

The mode decides what the evaluator does with a slot before the function
resolves. It also decides which refusal a bad argument gets, because the
signature gate reads value-mode slots only: in every other mode the
refusal comes from the function's own reading of the settled argument.

### `value`

An unmarked slot is driven to a value. Every argument not yet settled is
unified against [top](unification.md) before the call resolves, and the
call resolves only once all of them have settled. This is the only mode
the signature gate reads. At least one value slot appears in 54 of the
64 names, and 49 names carry nothing else.

The declared words are read as kinds, so a numeric leaf fits `number`
and a path fits `string`:

```aon
n: add(1.5, 2)
s: upper(path($.n))
```

```json
{
  "n": 3.5,
  "s": "$.N"
}
```

`upper` declares `s: string|number`, and the path was admitted as a
string.

### `capture`

One slot, `path(capture p?: path)`. The argument's spelling is read and
its value is never asked for: a reference becomes the address it spells,
a literal string is converted by that same address grammar, and anything
else is passed through to the function. `test/spec/path.tsv` states the
rule as the one non-strict argument position in the language.

```aon
k: "a"
p: path($.k)
```

```json
{
  "k": "a",
  "p": "$.k"
}
```

`$.k` holds the string `"a"`, and the capture is the address. Text that
the address grammar refuses is `path_address`; a computed argument that
is neither a string nor a reference is `invalid-arg`.
`path()` with no argument is the path kind, which generates nothing and
answers `mapval_no_gen`.

### `template`

Five slots: `refer`'s and `rel`'s only argument, and the second argument
of `pack`, `each`, and `emit`. The mode is enforced two ways.

`pack`, `each`, and `emit` never drive the template. Each instantiates
it per destination instead: the template is cloned, re-pathed to the
destination, and the placeholder `_` is bound to the source child, so a
call the template holds resolves at the instance rather than at the call
site.

```aon
out: each([1 2], add(_, 10))
```

```json
{
  "out": [
    11,
    12
  ]
}
```

Written on its own, `out: add(_, 10)` answers `mapval_no_gen`, because
no hole is filled at a call site. A failure inside one of these
templates is reported at the instance position: `each([1 2], $.nope)`
answers `no_path` at `$.out.0` rather than at `$.out`.

`refer` and `rel` drive the template at the call site like any value,
and the meet with the link's target unifies it into the target, so a
path-sensitive part of the template answers for the link field rather
than for the target. The semantics are
[The argument is a template, not an
address](reference-language.md#the-argument-is-a-template-not-an-address).

### `trial`

Three slots: `must`'s check, `filter`'s condition, and the odd members
of `match`'s rest group. The argument is unified against a candidate in
a sandbox that has its own error sink, and the sandbox is discarded
afterwards, so a failed trial is a false answer rather than an error in
the document.

```aon
out: filter([1 2 3], min(2))
```

```json
{
  "out": [
    2,
    3
  ]
}
```

The rejected member is silent. `filter` keeps a member only where the
meet changes nothing, which `test/spec/gen-filter.tsv` states as its
contract; `match` answers `match_none` when no pattern is met and no
default was written, naming the patterns it tried; `must` runs its check
against a clone of the peer, so the check never contributes to the
value, and folds last so that it sees the finished one. A `must` check
that holds `move(…)`, or that already holds a nil, is `invalid-arg` at
construction: a check that would have an effect is refused rather than
run. Pinned by `test/spec/constraint-must.tsv`.

### `projector`

Four slots: `unique`'s and `inverse`'s only argument, and the second
argument of `pick` and `sort`. The slot names a key, a list index, or a
relation name, never a value to compare. The mode is enforced two ways.

`pick` and `sort` never drive the slot, so the name is written
literally: a string bare or quoted, or an integer index, and for `sort`
the empty string as well, meaning the member itself. A reference or an
expression is `invalid-arg`, and the canon in the message shows the slot
unmoved while the data argument has settled:

<!-- test: run -->
```sh
$ echo 'out: pick([{ ab: 1 }], "a" + "b")' | aontu
[aontu/invalid-arg]: Cannot pick value at path $.out
...
 Cannot pick value: pick([{"ab":1}],"a"+"b")
...
$ echo $?
1
```

A literal key is what the two of them take:

```aon
out: pick([n:1 n:2], n)
```

```json
{
  "out": [
    1,
    2
  ]
}
```

`unique` and `inverse` do resolve the slot, and then require what it
settles to be a name: `unique` demands a string leaf, and `inverse`
demands a D-1 name, a letter or `_` then letters, digits, `_` or `-`,
answering `inverse_name` otherwise. So `unique($.k)` and `inverse($.n)`
both work where the reference settles to a name, and `inverse("$.x")`
does not. Rows: `test/spec/agg.tsv:115-122` and
`test/spec/sort.tsv:70-72`.

### `text`

Three names and four slots: `re`'s pattern, `must`'s message, and
`rep`'s pattern and substitution. A text slot settles to a string like
any other, so a reference resolves in it. What the mode changes is that
the settled string is then read as text in another notation rather than
compared as a value.

```aon
p: "a"
out: rep("abc", $.p, "z")
```

```json
{
  "out": "zbc",
  "p": "a"
}
```

Because the gate reads value slots only, a non-string in a text slot is
`invalid-arg` from the function's own reading and never `func_arg`. One
call carries both codes: `test/spec/str.tsv:132-134` pins
`rep(1, "a", "b")` as `func_arg` from slot 1, which is value mode, and
`rep("a", 1, "b")` and `rep("a", "a", 1)` as `invalid-arg` from slots 2
and 3, which are text mode.

The notation each slot is read in has its own refusals. A pattern
outside the portable subset is `constraint_pattern` in `re` and
`rep_pattern` in `rep`, a substitution naming a group the pattern has
not got is `rep_sub`, and a `must` message that is not a string leaf is
`invalid-arg`. The subset itself is
[`re` and the portable pattern
subset](reference-language.md#re-and-the-portable-pattern-subset).

## The call surface

One row per declared name, in alphabetical order. The signature cell is
the declaration line from `test/spec/signature.tsv`, with the type
alternation's `|` escaped for the cell. The arity is the interval the
engine derives from that line, written as a count, a range, or a floor
with `n` for a rest slot. The modes are those the name's slots use, and
`none` where the name has no slots. The result is the declaration's
result word.

The table is generated from the engine's registry and gated against it:
`ts/test/docs.test.ts` re-renders every signature printed on a
documentation page and fails on a difference of one space.

| signature | arity | modes | result |
|---|---|---|---|
| `abnf(g: string) : string` | `1` | `value` | `string` |
| `above(n: number\|string) : constraint` | `1` | `value` | `constraint` |
| `acyclic() : constraint` | `0` | none | `constraint` |
| `add(a: number, b: number) : number` | `2` | `value` | `number` |
| `below(n: number\|string) : constraint` | `1` | `value` | `constraint` |
| `close(m: any) : any` | `1` | `value` | `any` |
| `content(spec: string\|map) : map` | `1` | `value` | `map` |
| `copy(v: any) : any` | `1` | `value` | `any` |
| `copyfiles(spec: string\|map) : map` | `1` | `value` | `map` |
| `deprecate(v: any, r?: map) : any` | `1..2` | `value` | `any` |
| `div(a: number, b: number) : number` | `2` | `value` | `number` |
| `each(d: map\|list, template t: any) : list` | `2` | `value`, `template` | `list` |
| `emit(s: map\|list, template t: map\|list) : list` | `2` | `value`, `template` | `list` |
| `esc(s: string, variant?: string) : string` | `1..2` | `value` | `string` |
| `file(spec: string\|map, children?: list) : map` | `1..2` | `value` | `map` |
| `filter(d: map\|list, trial c: any) : map\|list` | `2` | `value`, `trial` | `map\|list` |
| `folder(spec: string\|map, children?: list) : map` | `1..2` | `value` | `map` |
| `fragment(spec: string\|map, children?: list) : map` | `1..2` | `value` | `map` |
| `greatest(d: map\|list) : number` | `1` | `value` | `number` |
| `hide(v: any) : any` | `1` | `value` | `any` |
| `inject(spec: string\|map, children?: list) : map` | `1..2` | `value` | `map` |
| `inverse(projector k: string) : constraint` | `1` | `projector` | `constraint` |
| `join(d: map\|list, sep?: string) : string` | `1..2` | `value` | `string` |
| `key(up?: integer\|biginteger) : string` | `0..1` | `value` | `string` |
| `least(d: map\|list) : number` | `1` | `value` | `number` |
| `length(n: number\|constraint) : constraint` | `1` | `value` | `constraint` |
| `line(spec: string\|map) : map` | `1` | `value` | `map` |
| `list() : list` | `0` | none | `list` |
| `listitems(spec: map, children?: list) : map` | `1..2` | `value` | `map` |
| `lower(s: string\|number, start?: integer\|biginteger, len?: integer\|biginteger) : string` | `1..3` | `value` | `string` |
| `map() : map` | `0` | none | `map` |
| `match(s: any, ...pr: (trial any, any), dflt?: any) : any` | `3..n` | `value`, `trial` | `any` |
| `max(n: number\|string) : constraint` | `1` | `value` | `constraint` |
| `maybe(v: any) : any` | `1` | `value` | `any` |
| `min(n: number\|string) : constraint` | `1` | `value` | `constraint` |
| `mod(a: number, b: number) : number` | `2` | `value` | `number` |
| `move(v: any) : any` | `1` | `value` | `any` |
| `mul(a: number, b: number) : number` | `2` | `value` | `number` |
| `must(trial c: any, text msg: string) : constraint` | `2` | `trial`, `text` | `constraint` |
| `neq(...vals: number\|string) : constraint` | `1..n` | `value` | `constraint` |
| `nom(name: string, style?: string\|list, acronyms?: list) : string\|map` | `1..3` | `value` | `string\|map` |
| `open(m: any) : any` | `1` | `value` | `any` |
| `pack(d: map\|list, template t: any) : map` | `2` | `value`, `template` | `map` |
| `parse(g: string, v?: string) : map\|list\|constraint` | `1..2` | `value` | `map\|list\|constraint` |
| `path(capture p?: path) : path` | `0..1` | `capture` | `path` |
| `pick(d: map\|list, projector k: string\|integer) : any` | `2` | `value`, `projector` | `any` |
| `pref(v: any) : any` | `1` | `value` | `any` |
| `project(spec?: string\|map, children?: list) : map` | `0..2` | `value` | `map` |
| `re(text p: string) : constraint` | `1` | `text` | `constraint` |
| `refer(template t?: any) : constraint` | `0..1` | `template` | `constraint` |
| `rel(template t?: any) : constraint` | `0..1` | `template` | `constraint` |
| `rem(a: number, b: number) : number` | `2` | `value` | `number` |
| `rep(s: string, text p: string, text sub: string) : string` | `3` | `value`, `text` | `string` |
| `slot(spec: string\|map, children?: list) : map` | `1..2` | `value` | `map` |
| `sort(d: map\|list, projector k?: string\|integer, dir?: string) : list` | `1..3` | `value`, `projector` | `list` |
| `split(s: string, sep: string\|constraint) : list` | `2` | `value` | `list` |
| `sub(a: number, b: number) : number` | `2` | `value` | `number` |
| `sum(d: map\|list) : number` | `1` | `value` | `number` |
| `super(t: any) : any` | `1` | `value` | `any` |
| `translate(s: string, from: string, to?: string) : string` | `2..3` | `value` | `string` |
| `type(t: any) : any` | `1` | `value` | `any` |
| `unique(projector k?: string) : constraint` | `0..1` | `projector` | `constraint` |
| `upper(s: string\|number, start?: integer\|biginteger, len?: integer\|biginteger) : string` | `1..3` | `value` | `string` |
| `usc(s: string, variant?: string) : string` | `1..2` | `value` | `string` |

A result word of `constraint` marks a residual whose meet depends on the
peer it lands beside; `any` is the result word where the function is a
wrapper and answers whatever it was given.

## Slices

The same 64 names, cut by result word, by rest slot, and by argument
mode. Every count below is over the whole surface.

Thirteen names answer `constraint`: `above`, `acyclic`, `below`,
`inverse`, `length`, `max`, `min`, `must`, `neq`, `re`, `refer`, `rel`,
and `unique`. Their algebra, including which pairs have a meet and what
each one is refused for, is
[The constraint algebra](reference-language.md#the-constraint-algebra).

Twelve names answer `map`. Ten of those are the component functions,
built from one class in the engine and written as a tree that a
generator walks: `content`, `copyfiles`, `file`, `folder`, `fragment`,
`inject`, `line`, `listitems`, `project`, and `slot`. The other two are
`map()`, which is the map kind, and `pack`. What the tree is turned into
is [Generation](reference-language.md#generation).

Nine names answer `string`: `abnf`, `esc`, `join`, `key`, `lower`,
`rep`, `translate`, `upper`, and `usc`. Three of them, `esc`, `usc`, and
`rep`, are the text verbs, together with `split`, which answers `list`:
[Text: `esc` `usc` `rep`
`split`](reference-language.md#text-esc-usc-rep-split).

One name answers `path`, and it is `path` itself, which also holds the
only slot in `capture` mode:
[First-class paths: `path(p?)`](reference-language.md#first-class-paths-pathp).

The ten result words, and the names under each:

| result | count | names |
|---|---|---|
| `any` | 12 | `close`, `copy`, `deprecate`, `hide`, `match`, `maybe`, `move`, `open`, `pick`, `pref`, `super`, `type` |
| `constraint` | 13 | `above`, `acyclic`, `below`, `inverse`, `length`, `max`, `min`, `must`, `neq`, `re`, `refer`, `rel`, `unique` |
| `list` | 5 | `each`, `emit`, `list`, `sort`, `split` |
| `map` | 12 | `content`, `copyfiles`, `file`, `folder`, `fragment`, `inject`, `line`, `listitems`, `map`, `pack`, `project`, `slot` |
| `map\|list` | 1 | `filter` |
| `map\|list\|constraint` | 1 | `parse` |
| `number` | 9 | `add`, `div`, `greatest`, `least`, `mod`, `mul`, `rem`, `sub`, `sum` |
| `path` | 1 | `path` |
| `string` | 9 | `abnf`, `esc`, `join`, `key`, `lower`, `rep`, `translate`, `upper`, `usc` |
| `string\|map` | 1 | `nom` |

Two names take a rest slot, spelled `...` in the declaration. `neq`
takes one or more single values and has a floor of one. `match` takes a
repeating pair whose first member is the pattern and whose second is the
answer, and the pair's length counts toward the floor, which is why the
floor is three: a scrutinee, a pattern, and an answer. `match` is
specified at [Selecting: `filter` and
`match`](reference-language.md#selecting-filter-and-match), `neq` at
[The constraint algebra](reference-language.md#the-constraint-algebra).

Fifteen names use at least one mode other than `value`, three have no
slots at all (`acyclic`, `list`, and `map`), and 23 have at least one
optional slot. The five non-value modes, and the names that use them:

| mode | count | names |
|---|---|---|
| `template` | 5 | `each`, `emit`, `pack`, `refer`, `rel` |
| `projector` | 4 | `inverse`, `pick`, `sort`, `unique` |
| `trial` | 3 | `filter`, `match`, `must` |
| `text` | 3 | `must`, `re`, `rep` |
| `capture` | 1 | `path` |

The five template slots are specified at
[Generating children: `pack` and
`each`](reference-language.md#generating-children-pack-and-each),
[Transforming: `emit`](reference-language.md#transforming-emit), and
[Checked links: `refer(t?)`](reference-language.md#checked-links-refert).
The three trial slots are at
[Selecting: `filter` and
`match`](reference-language.md#selecting-filter-and-match) and
[Band B: `must`](reference-language.md#band-b-must). The four projector
slots are at
[Projecting fields: `pick`](reference-language.md#projecting-fields-pick),
[Ordering: `sort`](reference-language.md#ordering-sort),
[`unique` semantics](reference-language.md#unique-semantics), and
[Declared relations](reference-language.md#declared-relations).

Two names carry two non-value modes at once: `must`, whose check is
`trial` and whose message is `text`, and `match`, whose rest group pairs
a `trial` member with a `value` one.

## Related

- [Language reference: Functions](reference-language.md#functions). One
  entry per built-in, keyed by its signature: what the function means,
  and an example.
- [Composing calls](reference-language.md#composing-calls). Where a call
  may be written, and what it may stand in for.
- [Errors](reference-language.md#errors). How a refusal is reported, and
  what a message carries.
- [Unification](unification.md). Meet, top, bottom, and residual, which
  the modes and result words above are stated in terms of.
- [API reference](reference-api.md). Calling the engine, and reading the
  refusals it answers with, from TypeScript or Go.
