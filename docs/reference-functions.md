# Functions reference

The aontu function library: every built-in the language declares,
indexed alphabetically with its signature, then a section for each
family, from arithmetic to the constraint algebra. Behaviour stated
here is verified by the shared [`test/spec/*.tsv`](../test/spec/) suite
and holds in both the TypeScript and Go implementations unless a
difference is called out.

The operators and the rest of the core language, from scalars to
subsumption, are in the [Language reference](reference-language.md). The
generators, the selectors and the rules `generate` follows are in the
[Generation reference](reference-generation.md). The verbs that evaluate
a model and write what it answers are in the
[API reference](reference-api.md).

## Contents

- [Functions](#functions)
- [Arithmetic: `add` `sub` `mul` `div` `mod` `rem`](#arithmetic-add-sub-mul-div-mod-rem)
- [Projecting fields: `pick`](#projecting-fields-pick)
- [Optional input: `maybe`](#optional-input-maybe)
- [Ordering: `sort`](#ordering-sort)
- [Aggregating: `sum` `least` `greatest`](#aggregating-sum-least-greatest)
- [Folding to a string: `join`](#folding-to-a-string-join)
- [Text: `esc` `usc` `rep` `split`](#text-esc-usc-rep-split)
- [First-class paths: `path(p?)`](#first-class-paths-pathp)
- [Checked links: `refer(t?)`](#checked-links-refert)
  - [Declared relations](#declared-relations)
- [Grammars: `abnf()` and `parse()`](#grammars-abnf-and-parse)
  - [A grammar reads better in backticks](#a-grammar-reads-better-in-backticks)
  - [A grammar can say what it builds](#a-grammar-can-say-what-it-builds)
  - [Shaping an unannotated tree](#shaping-an-unannotated-tree)
- [The constraint algebra](#the-constraint-algebra)
  - [Named constraint aliases](#named-constraint-aliases)

---

## Functions

aontu provides a fixed set of built-in functions. There are no
user-defined functions. This alphabetical index lists every built-in;
the links lead to its detailed behaviour and examples.

The argument modes describe how a call uses its arguments: `template`
is instantiated for a selected value, `trial` supplies a condition,
`projector` names a field or index, `capture` preserves a path's spelling,
and `text` supplies literal text. An unmarked argument supplies a value.

For collection operations, compare
[pack and each](reference-generation.md#generating-children-pack-and-each),
[the `_ & …` idiom](reference-generation.md#the-_---idiom-construction-and-bound),
[filter and match](reference-generation.md#selecting-filter-and-match),
[pick](#projecting-fields-pick), and
[emit](reference-generation.md#transforming-emit). `pack` and `each`
construct collections; `filter` selects members; `pick` projects a
field; `emit` applies a rule table and flattens its output.

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

Example: see [closed values](reference-language.md#closed-values-close--open)

### `content(spec: string|map) : map`

A text node of the
[component tree](reference-generation.md#the-component-tree): a span of
target text, added with no newline of its own, which is the whole
difference from `line`. A bare string fills `src`, and an empty span is
a value rather than a mistake.

Example: `content("export const N = 1\n")`

### `copy(v: any) : any`

Deep copy of a value or referenced node; clears `type`/`hide` marks.

Example: `copy({a:1,b:2})`→`{a:1,b:2}`; `copy($.x)`

### `copyfiles(spec: string|map) : map`

A copy node of the
[component tree](reference-generation.md#the-component-tree): files
copied verbatim from `from` into the output. Named `copyfiles` because
`copy` already copies a VALUE.

Example: `copyfiles("assets")`

### `deprecate(v: any, r?: map) : any`

Mark `x` deprecated; unifies exactly as `x`, and the record `m` (`{msg?, use?, since?}`, all strings; `use` is a path spelled as a string) rides the result through [meets](unification.md), reference clones and spread applications. Canon renders the call back; generation is unchanged. The point-of-use surfaces: a vet `deprecated` warning, the LSP Deprecated tag, and `aontu breaking --allow-deprecated-removal`.

Example: `port: deprecate(*8080|integer, {msg:"renamed", use:"$.listen", since:"2.0.0"})`

### `div(a: number, b: number) : number`

Divide two numbers; integer division truncates towards zero. See [arithmetic and refusals](#arithmetic-add-sub-mul-div-mod-rem).

Example: `div(7, 2)` → `3`

### `each(d: map|list, template t: any) : list`

Construct one list element per source child by instantiating a template with `_` bound to that child. See [form](reference-generation.md#each-the-order-preserving-map).

Example: `each([a, b], upper(_))` → `["A", "B"]`

### `emit(s: map|list, template t: map|list) : list`

One flat list of pieces from a selection and a rule table: for each node, the first template whose `match` it unifies with, its `body` instantiated at that node. See [Transforming](reference-generation.md#transforming-emit).

Example: `lines: emit($.services, {match:{pin:string}, body:[.pin]})`

### `esc(s: string, variant?: string) : string`

Escape a string using a named convention; the default is JSON-style double-quoted text. See [escaping](#escs-variant-and-uscs-variant).

Example: `esc("<a>", xml)`

### `file(spec: string|map, children?: list) : map`

A file node of the
[component tree](reference-generation.md#the-component-tree), named by
`name` and holding content, lines, fragments, injections, and copies:
one file of the output. Wherever `line` is admitted a bare string stands
for it, which is what a template body line becomes.

Example: `file("index.ts", ["export {}\n"])`

### `filter(d: map|list, trial c: any) : map|list`

The children of `d` that ALREADY satisfy `c`: the meet with `c` changes nothing. Keys kept for a map, order for a list; the rest are dropped, not refused. See [Selecting](reference-generation.md#selecting-filter-and-match).

Example: `debugged: filter($.services, {debug:true})`

### `folder(spec: string|map, children?: list) : map`

A folder node of the
[component tree](reference-generation.md#the-component-tree), named by
`name` and holding folders, files, and copies: one directory of the
output.

Example: `folder("src", [file("index.ts")])`

### `fragment(spec: string|map, children?: list) : map`

A fragment node of the
[component tree](reference-generation.md#the-component-tree): a file
read from `from`, reaching the output with its `<[SLOT]>` markers filled
by the slots beneath it.

Example: `fragment("head.ts", [slot("body")])`

### `greatest(d: map|list) : number`

Return the greatest numeric member, preserving its kind. An empty collection is refused. See [aggregates](#aggregating-sum-least-greatest).

Example: `greatest([2, 7, 4])` → `7`

### `hide(v: any) : any`

Mark `x` as hidden.

Example: `hide(world) & string`→`"world"`

### `inject(spec: string|map, children?: list) : map`

An injection node of the
[component tree](reference-generation.md#the-component-tree): a body
written between markers in an output file that already exists.

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

A text node of the
[component tree](reference-generation.md#the-component-tree): a span of
target text with a newline added, which is the whole difference from
`content`. An empty span is a blank line.

Example: `line("import fs from 'fs'")`; `line("")` is a blank line

### `list() : list`

The list **kind**: admits any list, defaults to nothing.

Example: `y: list() & [1]`→`[1]`

### `listitems(spec: map, children?: list) : map`

A repetition node of the
[component tree](reference-generation.md#the-component-tree), over the
list at `item`: its children are written once for each member. The bag
is required and must be a list: a missing one would render nothing,
silently.

Example: `listitems({item: $.rows}, [line("x")])`

### `lower(s: string|number, start?: integer|biginteger, len?: integer|biginteger) : string`

Lowercase a string, or a run of it; **floor** of a number, keeping the argument's kind. The range is `upper`'s; see [`upper`](#uppers-stringnumber-start-integerbiginteger-len-integerbiginteger--string).

Example: `lower(ABC)`→`"abc"`, `lower("FOO",1,-1)`→`"Foo"`, `lower("FOOBAR",-3,-1)`→`"fooBAR"`, `lower(1.9)`→ float `1`

### `map() : map`

The map **kind**: admits any map, defaults to nothing. See [Container kinds](reference-language.md#container-kinds-map-and-list).

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

One keyed child per child of `d`, each of them `t` cloned at that destination. Keys are the strings of a list, or the keys of a map. See [Generating children](reference-generation.md#generating-children-pack-and-each).

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

The root node of the
[component tree](reference-generation.md#the-component-tree); its
`folder` is the output directory and is the one prop that is not
required.

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

A slot node of the
[component tree](reference-generation.md#the-component-tree), beneath a
fragment: the body that fills the marker of that name.

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
recursion [residual](unification.md) met by `super` stays a symbolic
call (the finite spelling of a lift that is itself recursive) which
generation refuses like any unresolved call, and `super(null)` answers
the null kind, which canon prints as `null`, the same spelling as the
value.

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

**Kind follows the operands** (R5, and the same [exact
ladder](reference-language.md#the-four-numeric-leaves) `+` uses):
integer with integer is an integer, anything with a float is a float,
and a mixed exact operation promotes to the widest leaf and never
demotes.

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
[`each`](reference-generation.md#each-the-order-preserving-map) when
each output element needs an expression or a new structure. The bound
spelling `each(records, _ & t)` unifies each source member with a
template; it preserves that member's information rather than extracting
one field from it.

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
[`+`](reference-language.md#the--operator-and-grouping), so a transform
written against optional input needs no guard around it.

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
settled, the way
[`each`](reference-generation.md#each-the-order-preserving-map) and
[`pack`](reference-generation.md#generating-children-pack-and-each) do.
A forward reference therefore answers the value:

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
values. It sits under `string` in the kind [lattice](unification.md),
so `string` admits a path value and the string constraints apply to
spellings, but the kind does **not** promote: `path() & "$.a"` refuses
(`no_scalar_unify`) exactly as `integer & "x"` does, because outside
the `path(...)` call a string never becomes a path.

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

**Five vocabularies ship with the engine**, served from it rather than
from disk, and **every one of them is named under `aontu:`**. That is
the whole rule: a language-supplied schema has one spelling, and the
scheme is what stops a file on disk from standing in front of it.

| name | what it is |
|---|---|
| `aontu:system` | ports, components and services: [below](#the-aontusystem-vocabulary) |
| `aontu:view` | the schema for one declaration of a [view document](reference-api.md#aontu-view), `$.aontu.View.Figure`, which types every option the verb reads so a typo is refused at evaluation |
| `aontu:profile` | a language declared as data, which `template` and `fmt` read through `--profile` |
| `aontu:lang/text` | the text profile |
| `aontu:lang/markdown` | the markdown profile |

The last three are described [after the system vocabulary](#the-aontu-models).

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
| `@"aontu:profile"` | `$.aontu.Profile`, `$.aontu.Lang` |

One key is reserved instead of six, it is named for the language
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
@"aontu:profile"

aontu: Lang: { lang:"ocaml" template: { marker:"(*-" close:"*)" ext: [ml] } }
```

<!-- test: run -->
```sh
$ aontu models.aon
{
  "aontu": {
    "Lang": {
      "indent": {
        "unit": " ",
        "width": 2
      },
      "lang": "ocaml",
      "template": {
        "close": "*)",
        "ext": [
          "ml"
        ],
        "marker": "(*-"
      }
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
source not found: aontu:nope (the language-supplied models are aontu:lang/markdown, aontu:lang/text, aontu:profile, aontu:system, aontu:view)
$ echo $?
1
```

**`aontu:profile`** is the schema of a language profile: a language
declared as data, which `aontu template` and `aontu fmt` read through
`--profile`. It carries the language's `lang`, an `indent`, optionally
the comment forms, and the `template` block below. A profile is data
and only data. Its root is not `type()`-marked, because a profile is
read through generation; `$.aontu.Profile` names the schema with
`type()`, so naming it neither generates it nor asks a document to fill
it, and `$.aontu.Lang` is where one lands.

**A profile is where a language is configured.** Its `template` block
names the marker a generator written in that language carries and the
extensions that marker belongs to, so `aontu template` and `aontu fmt`
read one file rather than repeating a `--marker` flag. A marker carries
its own closer after a space where the opener does not imply one, which
is what reaches a block comment the engine has never seen:

<!-- test: skip the file it configures is the reader's own language -->
```aon
aontu: Lang: template: { marker:"(*-" close:"*)" ext: ["ml" "mli"] }
```

**`aontu:lang/text`** and **`aontu:lang/markdown`** are the two bundled
profiles. `text` is `lang: "text"` and an indent of two spaces, and
nothing else; `markdown` is that plus what markdown has of its own, the
HTML comment form and the template marker its files write,
`<!--- … -->`. A language the bundled pair does not cover writes its own
profile and passes it with `--profile`.

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

The two string parts differ in three ways:

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

Four things govern a grammar:

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
  grammar is declared rather than built into a differently shaped value.

**Either builder nests inside the other.** An `@array` is a member of
an `@object`, an element of another `@array`, or an object's only
member, and answers the same value in both engines.

### Shaping an unannotated tree

The answer is the RAW tree, so a document that wants natural structure
builds it with the language's own verbs. Three do the work:
[`pick`](#projecting-fields-pick) projects one field of every child,
[`filter`](reference-generation.md#selecting-filter-and-match) selects
children by rule, and [`join`](#folding-to-a-string-join) folds a
one-element selection back to a scalar. `hide()` keeps the grammar and
the tree out of the generated document. Write this as `shape.aon`:

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
per-former rules are in [Subsumption](reference-language.md#subsumption)). One
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
[`@` include](reference-language.md#source-loading-), a later
[`pack`](reference-generation.md#generating-children-pack-and-each).
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
no longer refuses the schema it was written for, and `length(max(2)) &
{&: {r: integer}}` no longer passes three records. A residuated atom is
visible in [canon](reference-language.md#canonical-form), which is the
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
the name-only spelling, `%port`, see [Aliases
`%`](reference-language.md#aliases-); the two are the same idea reached
two ways, and a `%` alias may hold a constraint just as a `type()` field
can:

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

Three properties make this work, and all three are rules stated in the
language reference rather than anything special to constraints:

- **The block is schema, so it does not generate.** `type()` marks its
  value as metadata, and a map field whose value is type-marked is
  omitted from the enclosing map
  ([Marks](reference-language.md#marks-type-and-hide)). The aliases are
  present for unification and absent from output.
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
what the value's [canon](reference-language.md#canonical-form) states.
