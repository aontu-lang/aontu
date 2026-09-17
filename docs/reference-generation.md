# Generation reference

Complete, exhaustive description of how aontu computes a value from a
model: the generators `pack` and `each`, which make children from data
the model already holds rather than [meeting](unification.md) children
an author wrote, the selectors `filter` and `match`, the hole `_` they
bind, the rule tables `emit` dispatches, the rules `generate` follows,
and the component tree a generator answers. Behaviour stated here is
verified by the shared [`test/spec/*.tsv`](../test/spec/) suite and
holds in both the TypeScript and Go implementations unless a difference
is called out.

For the core language, from scalars to subsumption, see the
[Language reference](reference-language.md). For every built-in
function, with its signature and its behaviour, see the
[Functions reference](reference-functions.md). For the verbs that
evaluate a model and write what it answers see the
[API reference](reference-api.md), and for a generator built end to end
against its goldens see
[Generate code from a model](how-to/generate-code.md).

## Contents

- [Generating children: `pack` and `each`](#generating-children-pack-and-each)
  - [Making elements: `each`](#each-the-order-preserving-map)
  - [The `_ & …` idiom](#the-_---idiom-construction-and-bound)
- [Selecting: `filter` and `match`](#selecting-filter-and-match)
- [The placeholder `_`](#the-placeholder-_)
- [Transforming: `emit`](#transforming-emit)
  - [A named table](#a-named-table)
  - [Recursion, and what bounds it](#recursion-and-what-bounds-it)
  - [Replacing text in a body: `replace` and `esc`](#replacing-text-in-a-body-replace-and-esc)
- [Generation](#generation)
- [The component tree](#the-component-tree)

---

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
[`split`](reference-functions.md#text-esc-usc-rep-split) and
[`join`](reference-functions.md#folding-to-a-string-join) it closes the
name-derivation chain, as `tag` shows. Like `pack`, it waits for the
model to settle and fires once; a `_` inside its template is its own to
bind, never an enclosing generator's.

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
on. Two rules govern it:

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
[`pick`](reference-functions.md#projecting-fields-pick) to project a field.

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
keep everything. The condition is an ordinary value, so the
[constraint atoms](reference-functions.md#the-constraint-algebra)
compose with it: `filter($.deploy, {replicas:min(3)})`.

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
[`esc` convention](reference-functions.md#text-esc-usc-rep-split): the
C/JSON escape when the key is absent; `sq` for a single-quoted literal;
`sql`, `shell`, `xml`, `uri` or `regex` by name; and `none` for a value
that is not going into a literal at all:

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

## The component tree

The ten component functions (`project`, `folder`, `file`, `content`,
`line`, `fragment`, `slot`, `inject`, `copyfiles`, and `listitems`)
answer a **component tree**, which generates as any other value does.
Each node's `cmp` key is the component name a generator runtime looks
up: `Project`, `CopyFiles`, `ListItems`, and the rest.
[jostraca](https://github.com/jostraca/jostraca) is one such runtime,
and reads the tree directly.

[`aontu render`](reference-api.md#aontu-render) hands the tree to that
runtime, which writes the files. Each of the ten functions carries its
signature, and the node it builds, in
[Functions](reference-functions.md#functions).
