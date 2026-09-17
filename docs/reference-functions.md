# Functions reference

aontu has 64 built-in functions and no user-defined ones. The name set
is closed: `test/spec/signature.tsv` declares one line per built-in, both
implementations carry a copy of that file inlined at build time, and a
name the engine does not hold is refused while the document is parsed.

This page is normative for the call surface. It states how many
arguments each name takes, which mode each argument slot is read in,
which kinds a slot admits, the result word the declaration gives, and
what a call is refused for. It tabulates that surface, then slices it
by argument mode, by result word, by rest slot, and by optional slot.
It says nothing
about what any function means.

What each function means, with an example, is the language reference's
[Functions](reference-language.md#functions) index: one entry per
built-in, keyed by its whole signature. Nothing here repeats it. Each
refusal code named below, with its class and the version it was
registered at, is the [errors reference](reference-errors.md#the-codes),
which is normative for the registry and for the shape of a report.

## Contents

- [How a call is checked](#how-a-call-is-checked)
- [Argument modes](#argument-modes)
- [The call surface](#the-call-surface)
- [Slices](#slices)
- [Related](#related)

---

## How a call is checked

The arity is decided at parse, the kinds at evaluation, and the two
answer different codes.

The permitted count comes from the declaration: a required slot raises
the minimum, an optional slot raises the maximum only, and a rest slot
leaves the maximum open while counting its group's length toward the
minimum. The value builder compares that interval against the number of
comma-separated terms the author wrote and, on a miss, puts a nil
carrying `func_arity` where the call was. Its class is `parse`. No
argument has been evaluated at that point, so the same broken reference
is invisible while the count is wrong and reported once the count is
right:

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
is invisible in `match takes one or more arguments`. The bound is the
arity column of [the call surface](#the-call-surface). The count is of
written terms, so a list literal counts as one: `add([1 2])` misses
`add`'s interval of two, while `neq([1 2])` meets `neq`'s minimum of one
([Errors](reference-language.md#errors)).

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

Eighteen names have a gated slot. The declaration alone would gate 23:
`key` is exempt by name and answers `key_level` for a bad argument, and
`min`, `max`, `above`, and `below` are constraint atoms that never reach
the gate, so a bad argument to one of those is `invalid-arg`. One
further boundary sits inside `parse`, whose one-argument form is the
constraint form and [meets](unification.md) its peer instead of
resolving: so `parse(1)` is `mapval_no_gen` and `parse(1, "x")` is
`func_arg`.

Absence is decided before the signature gate: the first absent argument
drops the whole call, and `maybe` is the only built-in that forgives it
([Optional input: `maybe`](reference-language.md#optional-input-maybe)).

The order a call is refused in, first to last:

1. `func_arity`, from the written count, at parse.
2. Whatever refuses while the value-mode arguments are driven. A broken
   reference is `no_path`.
3. Absence, which drops the call.
4. `func_arg`, from the signature gate.
5. The function's own reading of its slots, which is `invalid-arg` or a
   code of that verb's own.

There is no declaration form for a function anywhere in the grammar:
the `name` rule enumerates the built-in names and the `func` rule admits
no other
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
builds a call
([Lexical structure](reference-language.md#lexical-structure)):

```aon
a: upper
```

```json
{
  "a": "upper"
}
```

An alias ([Aliases `%`](reference-language.md#aliases-)) may hold a
call, which is how a named constraint and a named `emit` table are
written ([Named constraint
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

There is no partial application: an under-supplied call is `func_arity`
at parse ([Limitations and
trade-offs](explanation.md#limitations-and-trade-offs)). A parse-time
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
`value` unmarked. The mode decides what the evaluator does with the slot
before the function resolves, and which refusal a bad argument gets: the
signature gate reads value-mode slots only, so in every other mode the
refusal comes from the function's own reading of the settled argument.
What each mode word means is the language reference's
[Functions](reference-language.md#functions) index intro. The grammar of
the declaration line is the header of `test/spec/signature.tsv`.

An unmarked slot is driven: it is unified against
[top](unification.md) before the call resolves, and the call resolves
only once every value slot has settled. At least one value slot appears
in 54 of the 64 names, and 46 of those carry no other mode. Three names
have no slots at all (`acyclic`, `list`, and `map`), so 49 of the 64 use
no mode but `value`, and 15 carry at least one slot in another mode.

The five other modes, the slots that carry them, what the evaluator does
with the slot, and where the semantics are specified:

- `template`, five slots: `each`'s, `emit`'s, and `pack`'s second
  argument, and `refer`'s and `rel`'s only argument. `pack`, `each`, and
  `emit` instantiate the template per destination rather than driving
  it; `refer` and `rel` drive it at the call site.
  [Generating children: `pack` and
  `each`](reference-language.md#generating-children-pack-and-each),
  [Transforming: `emit`](reference-language.md#transforming-emit),
  [The placeholder `_`](reference-language.md#the-placeholder-_),
  [Checked links: `refer(t?)`](reference-language.md#checked-links-refert),
  and [The argument is a template, not an
  address](reference-language.md#the-argument-is-a-template-not-an-address).
- `projector`, four slots: `pick`'s and `sort`'s second argument, and
  `inverse`'s and `unique`'s only argument. `pick` and `sort` never
  drive the slot (`test/spec/agg.tsv:115-122`,
  `test/spec/sort.tsv:70-72`); `inverse` and `unique` do, and then
  require the settled value to be a name
  (`test/spec/relation.tsv:112-113,170-174`,
  `test/spec/constraint-length.tsv:79-90`).
  [Projecting fields: `pick`](reference-language.md#projecting-fields-pick),
  [Ordering: `sort`](reference-language.md#ordering-sort),
  [`unique` semantics](reference-language.md#unique-semantics), and
  [Declared relations](reference-language.md#declared-relations).
- `trial`, three slots: `must`'s check, `filter`'s condition, and the
  odd members of `match`'s rest group. The argument is unified against a
  candidate in a sandbox with an error sink of its own, and the sandbox
  is discarded afterwards, so a failed trial is a false answer rather
  than an error in the document.
  [Selecting: `filter` and
  `match`](reference-language.md#selecting-filter-and-match),
  [Band B: `must`](reference-language.md#band-b-must), and
  [Sizing atoms fold last](reference-language.md#sizing-atoms-fold-last).
- `text`, four slots in three names: `re`'s pattern, `must`'s message,
  and `rep`'s pattern and substitution. The slot settles to a string
  like any other, and the settled string is then read as text in another
  notation rather than compared as a value.
  [`re` and the portable pattern
  subset](reference-language.md#re-and-the-portable-pattern-subset) and
  [`rep(s, pattern, sub)`](reference-language.md#reps-pattern-sub).
- `capture`, one slot, `path`'s. The slot is read for its spelling and
  its value is never asked for, which is the one argument position the
  evaluator does not drive.
  [First-class paths: `path(p?)`](reference-language.md#first-class-paths-pathp).

Five non-value slots answer a code of their own rather than
`invalid-arg`:

| name | slot | mode | code |
|---|---|---|---|
| `inverse` | `k` | `projector` | `inverse_name` |
| `path` | `p` | `capture` | `path_address` |
| `re` | `p` | `text` | `constraint_pattern` |
| `rep` | `p` | `text` | `rep_pattern` |
| `rep` | `sub` | `text` | `rep_sub` |

Every other non-value slot answers `invalid-arg`, `path`'s included
where the argument is neither address text nor a reference. One call
carries a code from each side of the gate: `test/spec/str.tsv:132-134`
pins `rep(1, "a", "b")` as `func_arg` from slot 1, which is value mode,
and `rep("a", 1, "b")` and `rep("a", "a", 1)` as `invalid-arg` from
slots 2 and 3, which are text mode.

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
peer it lands beside. `any` is the result word where the declaration
cannot name the result: ten wrappers that answer whatever they were
given, plus `pick`, which answers a projection out of every child, and
`match`, which answers one of its pattern results.

## Slices

The same 64 names, cut by result word, by rest slot, and by optional
slot. Every count below is over the whole surface. The mode slice is
[Argument modes](#argument-modes).

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

The algebra of the thirteen that answer `constraint`, including which
pairs have a meet and what each one is refused for, is
[The constraint algebra](reference-language.md#the-constraint-algebra).
Ten of the twelve that answer `map` are the component functions, written
as a tree that a generator walks: the tree's shape and each component's
props are the [generation reference](reference-generation.md), and what
the tree is turned into is
[Generation](reference-language.md#generation). The other two are
`map()`, which is the map kind, and `pack`. Three of the nine that
answer `string` are the text verbs, `esc`, `usc`, and `rep`, together
with `split`, which answers `list`:
[Text: `esc` `usc` `rep`
`split`](reference-language.md#text-esc-usc-rep-split). The one name
that answers `path` is `path` itself:
[First-class paths: `path(p?)`](reference-language.md#first-class-paths-pathp).

Two names take a rest slot, spelled `...` in the declaration. `neq`
takes one or more single values and has a floor of one. `match` takes a
repeating pair whose first member is the pattern and whose second is the
answer, and the pair's length counts toward the floor, which is why the
floor is three: a scrutinee, a pattern, and an answer. `match` is
specified at [Selecting: `filter` and
`match`](reference-language.md#selecting-filter-and-match), `neq` at
[The constraint algebra](reference-language.md#the-constraint-algebra).

Twenty-three names have at least one optional slot. `must` is the one
name that carries two non-value modes, its check `trial` and its message
`text`. `match` is the one name whose rest group pairs a `trial` member
with a `value` one.

## Related

- [Language reference: Functions](reference-language.md#functions). One
  entry per built-in, keyed by its signature: what the function means,
  and an example.
- [Composing calls](reference-language.md#composing-calls). Where a call
  may be written, and what it may stand in for.
- [Errors reference](reference-errors.md#the-codes). Every registered
  code, its class, the version it was registered at, and the shape of
  the report a refusal is carried in.
- [Generation reference](reference-generation.md). The component tree
  the ten component functions build, and what each verb writes when
  handed one.
- [Unification](unification.md). Meet, top, bottom, and residual, which
  the modes and result words above are stated in terms of.
- [API reference](reference-api.md). Calling the engine, and reading the
  refusals it answers with, from TypeScript or Go.
