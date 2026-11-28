---
description: Write each CUE comprehension in aontu, from a filtered list of new records to a map keyed by a field, with `each`, `pack`, `filter`, `emit`, `match`, `apply` and `at`.
group: coming-from
order: 20
---

# Map CUE comprehensions to aontu

A CUE comprehension is a `for` clause, with `if` and `let` clauses
beside it. aontu has no clauses. Its generators are built-in calls
that walk a list or a map that already exists, and each CUE idiom has
a spelling in them.

This guide takes the idioms in the order a CUE user reaches for them:
a list made from a list, a choice under a condition, a local value, the
keys of a map, a field of the member, a lookup, and a map with computed
keys. The last section gives the idioms that take a longer
construction today. For the rest of the language, see
[Move from CUE to aontu](aontu-for-cue-users.md).

Each CUE example is a file in [aontu's CUE corpus](../../test/cue/),
and each CUE answer the guide states is that of CUE v0.17.1. Each aontu
example runs in the test suite, and both aontu implementations,
TypeScript and Go, give the answer shown. An answer is the whole
document, so it repeats the input beside the field the example makes.

## Read the member in a template

A generator applies a template to each member of its data. The
template reads the member in four ways:

- `_` is the member, whole.
- `at(_, name)` is the member's field `name`.
- `key(0)` at the top of the template, and `key()` inside a map in it,
  is the member's key in a map or its position in a list, as text.
- In an `emit` body, a relative path such as `.name` is the member's
  field `name`.

A relative path anywhere else in a template reads the output being
made, not the member. So `each($.xs, { n:.name })` is refused as
`no_path`, and `each($.xs, { n:at(_, name) })` answers.

A map writes its keys in key order, and a generator walks a map in key
order. CUE keeps the order of the source. The two answers are equal as
JSON maps, but a list made from a map's members can differ in order,
and this guide says so at each example where it does.

## Make a list from each member

A new record from each member is an `emit`. Its body is a list, and the
body's elements are spliced into the answer. In CUE:

<!-- test: quote test/cue/k1.cue -->
```cue
xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]
out: [for x in xs {name: x.name, addr: "\(x.host):\(x.port)"}]
```

In aontu:

```aontu
xs: [{ name:web host:h1 port:80 } { name:db host:h2 port:5432 }]
out: emit($.xs, { match:any body: [{ name:.name addr:.host + ":" + .port }] })
```

```json
{"out":[{"addr":"h1:80","name":"web"},{"addr":"h2:5432","name":"db"}],"xs":[{"host":"h1","name":"web","port":80},{"host":"h2","name":"db","port":5432}]}
```

A condition on a field is a `filter`. It keeps each member that its
pattern admits, and `pick` takes one field from each member it kept:

<!-- test: quote test/cue/k2.cue -->
```cue
xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]
out: [for x in xs if x.port > 1000 {x.name}]
```

```aontu
xs: [{ name:web host:h1 port:80 } { name:db host:h2 port:5432 }]
out: pick(filter($.xs, { port:above(1000) }), name)
```

```json
{"out":["db"],"xs":[{"host":"h1","name":"web","port":80},{"host":"h2","name":"db","port":5432}]}
```

The two compose. An `emit` over a `filter` is CUE's `for` with an `if`
and a new record:

```aontu
xs: [{ name:web host:h1 port:80 } { name:db host:h2 port:5432 }]

out: emit(filter($.xs, { port:above(1000) }), {
  match: any
  body: [{ name:.name addr:.host + ":" + .port }]
})
```

```json
{"out":[{"addr":"h2:5432","name":"db"}],"xs":[{"host":"h1","name":"web","port":80},{"host":"h2","name":"db","port":5432}]}
```

A pattern says `or` with `|`, `and` with two fields in one map, and
`not` with `neq`:

<!-- test: quote test/cue/k3.cue -->
```cue
xs: [{n: "a", env: "prod", tier: "gold"}, {n: "b", env: "dev", tier: "gold"}, {n: "c", env: "dev", tier: "tin"}]
or: [for x in xs if x.env == "prod" || x.tier == "gold" {x.n}]
and: [for x in xs if x.env == "dev" && x.tier == "gold" {x.n}]
not: [for x in xs if x.env != "prod" {x.n}]
```

```aontu
xs: [
  { n:a env:prod tier:gold }
  { n:b env:dev tier:gold }
  { n:c env:dev tier:tin }
]

or: pick(filter($.xs, { env:prod }|{ tier:gold }), n)
and: pick(filter($.xs, { env:dev tier:gold }), n)
not: pick(filter($.xs, { env:neq(prod) }), n)
```

```json
{"and":["b"],"not":["b","c"],"or":["a","b"],"xs":[{"env":"prod","n":"a","tier":"gold"},{"env":"dev","n":"b","tier":"gold"},{"env":"dev","n":"c","tier":"tin"}]}
```

A bound in a pattern can read a value elsewhere in the document by an
absolute path:

<!-- test: quote test/cue/k38.cue -->
```cue
limit: 2
xs: [{a: 3}, {a: 1}]
out: [for x in xs if x.a > limit {x}]
```

```aontu
limit: 2
xs: [a:3 a:1]
out: filter($.xs, { a:above($.limit) })
```

```json
{"limit":2,"out":[{"a":3}],"xs":[{"a":3},{"a":1}]}
```

A sum over the list a body makes is CUE's `list.Sum` over a
comprehension:

<!-- test: quote test/cue/k27.cue -->
```cue
import "list"
lines: [{qty: 2, price: 5}, {qty: 1, price: 7}]
out: list.Sum([for l in lines {l.qty * l.price}])
```

```aontu
lines: [{ qty:2 price:5 } { qty:1 price:7 }]
out: sum(emit($.lines, { match:any body: [mul(.qty, .price)] }))
```

```json
{"lines":[{"price":5,"qty":2},{"price":7,"qty":1}],"out":17}
```

## Flatten and join lists

An `emit` body that is a member's list splices that list's elements,
so it flattens:

<!-- test: quote test/cue/k6.cue -->
```cue
svcs: [{name: "web", ports: [80, 443]}, {name: "db", ports: [5432]}]
out: [for s in svcs for p in s.ports {p}]
```

```aontu
svcs: [{ name:web ports: [80 443] } { name:db ports: [5432] }]
out: emit($.svcs, { match:any body: [.ports] })
```

```json
{"out":[80,443,5432],"svcs":[{"name":"web","ports":[80,443]},{"name":"db","ports":[5432]}]}
```

Two lists end to end are `+`:

<!-- test: quote test/cue/k28.cue -->
```cue
a: [1, 2]
b: [3]
out: [for x in a {x}, for y in b {y}]
```

```aontu
a: [1 2]
b: [3]
out: $.a + $.b
```

```json
{"a":[1,2],"b":[3],"out":[1,2,3]}
```

## Choose a value under a condition

A field or an element under a condition is a `match`. It tests a value
against each pattern in turn and answers the value paired with the
first pattern that admits it. A block of fields under a condition is a
`match` met with the fields that are always there:

<!-- test: quote test/cue/k22.cue -->
```cue
env: "prod"
out: {name: "web", if env == "prod" {replicas: 3, tier: "gold"}}
```

```aontu
env: prod
out: { name:web } & match($.env, prod, { replicas:3 tier:gold }, {})
```

```json
{"env":"prod","out":{"name":"web","replicas":3,"tier":"gold"}}
```

An element under a condition is a `match` whose last value is
`maybe($.none)`. `$.none` names nothing, so `maybe` makes it an absence,
and an absent element is left out of the list:

<!-- test: quote test/cue/k23.cue -->
```cue
debug: false
out: ["run", if debug {"--verbose"}, "now"]
```

```aontu
debug: false
out: [run match($.debug, true, "--verbose", maybe($.none)) now]
```

```json
{"debug":false,"out":["run","now"]}
```

A chain of conditions where the first that holds wins is one `match`
with a pattern for each condition:

<!-- test: quote test/cue/k24.cue -->
```cue
n: 7
out: [if n < 3 {"small"}, if n >= 3 && n < 10 {"medium"}, if n >= 10 {"large"}][0]
```

```aontu
n: 7
out: match($.n, below(3), small, below(10), medium, large)
```

```json
{"n":7,"out":"medium"}
```

A test for a field that is present is a pattern that holds the field,
`{ opt:any }`:

<!-- test: quote test/cue/k25.cue -->
```cue
x: {opt: 1}
y: {}
out: [[if x.opt != _|_ {true}, false][0], [if y.opt != _|_ {true}, false][0]]
```

```aontu
x: opt: 1
y: {}
out: [match($.x, { opt:any }, true, false) match($.y, { opt:any }, true, false)]
```

```json
{"out":[true,false],"x":{"opt":1},"y":{}}
```

## Name a value inside the loop

A `let` clause is an `apply`. `apply(v, t)` reads the template `t`
once, with `_` as the value `v`:

```aontu
ns: [1 2 3]
twice: each($.ns, apply(mul(_, 2), { v:_ }))
```

```json
{"ns":[1,2,3],"twice":[{"v":2},{"v":4},{"v":6}]}
```

A `let` that a later `if` tests is an `apply` inside the `each`, then a
`filter` over what the `each` made. In CUE:

<!-- test: quote test/cue/k26.cue -->
```cue
xs: [{a: 1}, {a: 2}, {a: 3}]
out: [for x in xs let y = x.a * 2 if y > 2 {v: y}]
```

In aontu:

```aontu
xs: [a:1 a:2 a:3]
out: filter(each($.xs, apply(mul(at(_, a), 2), { v:_ })), { v:above(2) })
```

```json
{"out":[{"v":4},{"v":6}],"xs":[{"a":1},{"a":2},{"a":3}]}
```

## Walk the keys of a map

`pack` over a map makes one child for each key, and `key(0)` in its
template is the key. `each` over the map that `pack` made is a list:

<!-- test: quote test/cue/k29.cue -->
```cue
m: {b: 1, a: 2}
out: [for k, _ in m {k}]
```

```aontu
m: { b:1 a:2 }
out: each(pack($.m, key(0)), _)
```

```json
{"m":{"a":2,"b":1},"out":["a","b"]}
```

CUE answers `["b","a"]`, in the order of the source, and aontu answers
`["a","b"]`, in key order. A key and its value together are the same
two calls, with `_` for the value:

```aontu
m: { b:1 a:2 }
pairs: each(pack($.m, key(0) + "=" + _), _)
```

```json
{"m":{"a":2,"b":1},"pairs":["a=2","b=1"]}
```

CUE writes these pairs in the order of the source too, `b=1` first.

## Read a field of the member

`at(_, name)` reads a field of the member, in any template. In CUE:

<!-- test: quote test/cue/k37.cue -->
```cue
xs: [{name: "web"}, {name: "db"}]
out: [for x in xs {n: x.name}]
```

In aontu:

```aontu
xs: [name:web name:db]
out: each($.xs, { n:at(_, name) })
```

```json
{"out":[{"n":"web"},{"n":"db"}],"xs":[{"name":"web"},{"name":"db"}]}
```

Over a map, `pack` keeps each member's key, so one field of each member
is a map with the same keys:

<!-- test: quote test/cue/k18.cue -->
```cue
svc: {a: {cfg: {x: 1}}, b: {cfg: {x: 2}}}
out: {for k, v in svc {(k): v.cfg}}
```

```aontu
svc: { a:cfg:x:1 b:cfg:x:2 }
out: pack($.svc, at(_, cfg))
```

```json
{"out":{"a":{"x":1},"b":{"x":2}},"svc":{"a":{"cfg":{"x":1}},"b":{"cfg":{"x":2}}}}
```

`at` reads what a path step reads, and the field can hold a value of
any kind. For more information, see
[The member at a key: `at`](../reference-language.md#the-member-at-a-key-at).

## Compare two fields of one member

A condition over two fields of one member is a `match` over a
computed value. `sub` gives the difference of the two fields, the
pattern `above(0)` tests it, and `maybe($.none)` leaves out a member
the pattern doesn't admit:

<!-- test: quote test/cue/k4.cue -->
```cue
xs: [{a: 3, b: 1}, {a: 1, b: 2}]
out: [for x in xs if x.a > x.b {x}]
```

```aontu
xs: [{ a:3 b:1 } { a:1 b:2 }]
out: each($.xs, match(sub(at(_, a), at(_, b)), above(0), _, maybe($.none)))
```

```json
{"out":[{"a":3,"b":1}],"xs":[{"a":3,"b":1},{"a":1,"b":2}]}
```

To keep one field and not the whole member, put `at(_, a)` where `_`
is:

<!-- test: quote test/cue/k5.cue -->
```cue
xs: [{a: 3, b: 1}, {a: 1, b: 2}]
out: [for x in xs if x.a > x.b {x.a}]
```

```aontu
xs: [{ a:3 b:1 } { a:1 b:2 }]
out: each($.xs, match(sub(at(_, a), at(_, b)), above(0), at(_, a), maybe($.none)))
```

```json
{"out":[3],"xs":[{"a":3,"b":1},{"a":1,"b":2}]}
```

Write this comparison with `match`, not with a bound in a `filter`
pattern. A bound whose argument reads the member, as `above(.b)` and
`above(at(_, b))` do, reads nothing while `filter` tries the member.
Such a `filter` keeps no member, and it isn't refused:

```aontu
xs: [{ a:3 b:1 } { a:1 b:2 }]
out: filter($.xs, { a:above(.b) })
```

```json
{"out":[],"xs":[{"a":3,"b":1},{"a":1,"b":2}]}
```

## Look a value up by a field of the member

`at` takes a computed key. A key read from the member looks a record up
in another map, and a further key steps into that record:

<!-- test: quote test/cue/k19.cue -->
```cue
teams: {core: {email: "core@x", tier: 1}, web: {email: "web@x", tier: 2}}
svc: {a: {team: "core"}, b: {team: "web"}, c: {team: "core"}}
out: {for k, s in svc {(k): teams[s.team].email}}
```

```aontu
teams: { core: { email:"core@x" tier:1 } web: { email:"web@x" tier:2 } }
svc: { a:team:core b:team:web c:team:core }
out: pack($.svc, at($.teams, at(_, team), email))
```

```json
{"out":{"a":"core@x","b":"web@x","c":"core@x"},"svc":{"a":{"team":"core"},"b":{"team":"web"},"c":{"team":"core"}},"teams":{"core":{"email":"core@x","tier":1},"web":{"email":"web@x","tier":2}}}
```

Without the last key, the answer is the whole record:

<!-- test: quote test/cue/k20.cue -->
```cue
teams: {core: {email: "core@x", tier: 1}, web: {email: "web@x", tier: 2}}
svc: {a: {team: "core"}, b: {team: "web"}, c: {team: "core"}}
out: {for k, s in svc {(k): owner: teams[s.team]}}
```

```aontu
teams: { core: { email:"core@x" tier:1 } web: { email:"web@x" tier:2 } }
svc: { a:team:core b:team:web c:team:core }
out: pack($.svc, { owner:at($.teams, at(_, team)) })
```

```json
{"out":{"a":{"owner":{"email":"core@x","tier":1}},"b":{"owner":{"email":"web@x","tier":2}},"c":{"owner":{"email":"core@x","tier":1}}},"svc":{"a":{"team":"core"},"b":{"team":"web"},"c":{"team":"core"}},"teams":{"core":{"email":"core@x","tier":1},"web":{"email":"web@x","tier":2}}}
```

## Pair two lists by position

`key()` inside a map in an `each` template is the member's position.
`at` reads the other list at that position:

<!-- test: quote test/cue/k21.cue -->
```cue
xs: ["a", "b"]
ys: [1, 2]
out: [for i, x in xs {k: x, y: ys[i]}]
```

```aontu
xs: [a b]
ys: [1 2]
out: each($.xs, { k:_ y:at($.ys, key()) })
```

```json
{"out":[{"k":"a","y":1},{"k":"b","y":2}],"xs":["a","b"],"ys":[1,2]}
```

## Take the last member

A negative position counts from the end of a list, so `at($.xs, -1)` is
the last member:

<!-- test: quote test/cue/k33.cue -->
```cue
xs: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]
out: xs[len(xs)-1]
```

```aontu
xs: [a b c d e f g h i j k l]
out: at($.xs, -1)
```

```json
{"out":"l","xs":["a","b","c","d","e","f","g","h","i","j","k","l"]}
```

## Key a map by a field of each member

`pack(d, t, k)` takes a third argument, a template that makes each
child's key. `k` reads the member as `_` and its own key or position as
`key(0)`, and it must answer a string. Keyed by a field:

<!-- test: quote test/cue/k10.cue -->
```cue
xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]
out: {for x in xs {(x.name): x.port}}
```

```aontu
xs: [{ name:web host:h1 port:80 } { name:db host:h2 port:5432 }]
out: pack($.xs, at(_, port), at(_, name))
```

```json
{"out":{"db":5432,"web":80},"xs":[{"host":"h1","name":"web","port":80},{"host":"h2","name":"db","port":5432}]}
```

With `_` as the value, each child is the whole record:

<!-- test: quote test/cue/k11.cue -->
```cue
xs: [{name: "web", port: 80}, {name: "db", port: 5432}]
out: {for x in xs {(x.name): x}}
```

```aontu
xs: [{ name:web port:80 } { name:db port:5432 }]
out: pack($.xs, _, at(_, name))
```

```json
{"out":{"db":{"name":"db","port":5432},"web":{"name":"web","port":80}},"xs":[{"name":"web","port":80},{"name":"db","port":5432}]}
```

A key built from two fields joins them with `+`:

<!-- test: quote test/cue/k16.cue -->
```cue
xs: [{ns: "a", name: "web", port: 80}, {ns: "b", name: "web", port: 81}]
out: {for x in xs {"\(x.ns)/\(x.name)": x.port}}
```

```aontu
xs: [{ ns:a name:web port:80 } { ns:b name:web port:81 }]
out: pack($.xs, at(_, port), at(_, ns) + "/" + at(_, name))
```

```json
{"out":{"a/web":80,"b/web":81},"xs":[{"name":"web","ns":"a","port":80},{"name":"web","ns":"b","port":81}]}
```

A prefix on every key of a map reads the member's own key:

<!-- test: quote test/cue/k15.cue -->
```cue
m: {a: 1, b: 2}
out: {for k, v in m {"svc-\(k)": v}}
```

```aontu
m: { a:1 b:2 }
out: pack($.m, _, "svc-" + key(0))
```

```json
{"m":{"a":1,"b":2},"out":{"svc-a":1,"svc-b":2}}
```

The three answers are maps, so aontu writes them in key order and CUE
in the order of the source. Children whose keys collide unify, as two
fields with the same key do.

To invert a map, first give each member its own key as a field, then
key by the value:

<!-- test: quote test/cue/k14.cue -->
```cue
m: {a: "x", b: "y"}
out: {for k, v in m {(v): k}}
```

```aontu
m: { a:x b:y }
st: hide(pack($.m, { k:key() v:_ }))
out: pack($.st, at(_, k), at(_, v))
```

```json
{"m":{"a":"x","b":"y"},"out":{"x":"a","y":"b"}}
```

For more information, see
[A key for each child](../reference-language.md#a-key-for-each-child).

## Keep the members another list names

A map keyed by a field is a lookup table. `pack` over the list of
names reads each name from that table:

<!-- test: quote test/cue/k9.cue -->
```cue
import "list"
allowed: ["web", "cache"]
xs: [{name: "web"}, {name: "db"}, {name: "cache"}]
out: [for x in xs if list.Contains(allowed, x.name) {x.name}]
```

```aontu
allowed: [web cache]
xs: [name:web name:db name:cache]
out: pick(pack($.allowed, at(pack($.xs, _, at(_, name)), key(0))), name)
```

```json
{"allowed":["web","cache"],"out":["cache","web"],"xs":[{"name":"web"},{"name":"db"},{"name":"cache"}]}
```

CUE answers `["web","cache"]`, in the order of `xs`, and aontu answers
`["cache","web"]`. The `pack` over `allowed` makes a map, and the map
writes its keys in key order.

## Write the longer constructions

The idioms in this section have a spelling in aontu today, but it
takes helper fields or a bound written into the document. Each is
shown as it's written today.

### Read the outer member in an inner loop

In a template inside another, `_` is the inner member. The outer
member's field is read by a climb. A relative path's first dot names
the map or list that holds it, and each further dot climbs a step, so
`..name` in the inner template reads the field `name` of the outer
member. Keep the outer member, build the inner list beside it, and
flatten with `emit`:

<!-- test: quote test/cue/k7.cue -->
```cue
svcs: [{name: "web", ports: [80, 443]}, {name: "db", ports: [5432]}]
out: [for s in svcs for p in s.ports {"\(s.name):\(p)"}]
```

```aontu
svcs: [{ name:web ports: [80 443] } { name:db ports: [5432] }]
tmp: hide(each($.svcs, _ & { pairs:each(.ports, ..name + ":" + _) }))
out: emit($.tmp, { match:any body: [.pairs] })
```

```json
{"out":["web:80","web:443","db:5432"],"svcs":[{"name":"web","ports":[80,443]},{"name":"db","ports":[5432]}]}
```

Every pair from two lists is the same construction:

<!-- test: quote test/cue/k8.cue -->
```cue
as: ["a", "b"]
bs: ["x", "y"]
out: [for a in as for b in bs {"\(a)-\(b)"}]
```

```aontu
as: [a b]
bs: [x y]
tmp: hide(each($.as, { a:_ row:each($.bs, ..a + "-" + _) }))
out: emit($.tmp, { match:any body: [.row] })
```

```json
{"as":["a","b"],"bs":["x","y"],"out":["a-x","a-y","b-x","b-y"]}
```

The same pairs as the keys of a map take one more step. The pairs are
made as a list, and a `pack` over it splits each key back into its
parts:

<!-- test: quote test/cue/k17.cue -->
```cue
as: ["a", "b"]
bs: ["x", "y"]
out: {for a in as for b in bs {"\(a)-\(b)": {left: a, right: b}}}
```

```aontu
as: [a b]
bs: [x y]
tmp: hide(each($.as, { a:_ row:each($.bs, ..a + "-" + _) }))
keys: hide(emit($.tmp, { match:any body: [.row] }))
out: pack($.keys, { parts:hide(split(key(), "-")) left:.parts.0 right:.parts.1 })
```

```json
{"as":["a","b"],"bs":["x","y"],"out":{"a-x":{"left":"a","right":"x"},"a-y":{"left":"a","right":"y"},"b-x":{"left":"b","right":"x"},"b-y":{"left":"b","right":"y"}}}
```

### Group members by a field

A grouping is a `pack` over the values of the field, with a `filter`
in the template that keeps the members whose field matches the group's
key. In the pattern, `key(2)` reads the group's key, two levels out
from the pattern's field:

<!-- test: quote test/cue/k12.cue -->
```cue
xs: [{name: "a", team: "core"}, {name: "b", team: "web"}, {name: "c", team: "core"}]
out: {for x in xs {(x.team): [for y in xs if y.team == x.team {y.name}]}}
```

```aontu
xs: [{ name:a team:core } { name:b team:web } { name:c team:core }]
out: pack(pick($.xs, team), pick(filter($.xs, { team:key(2) }), name))
```

```json
{"out":{"core":["a","c"],"web":["b"]},"xs":[{"name":"a","team":"core"},{"name":"b","team":"web"},{"name":"c","team":"core"}]}
```

Count the levels with care. With `key(3)`, the pattern reads a key that
isn't the group's. Every group is then empty, and nothing is refused:

```aontu
xs: [{ name:a team:core } { name:b team:web } { name:c team:core }]
out: pack(pick($.xs, team), pick(filter($.xs, { team:key(3) }), name))
```

```json
{"out":{"core":[],"web":[]},"xs":[{"name":"a","team":"core"},{"name":"b","team":"web"},{"name":"c","team":"core"}]}
```

### Reverse, slice, or compare with the member before

A position is text, so arithmetic on a position takes a list of
numbers written into the document, read at each position by `key(3)`.
A list reversed is sorted by that number, in descending order:

<!-- test: quote test/cue/k34.cue -->
```cue
import "list"
xs: ["c", "a", "b"]
out: list.Reverse(xs)
```

```aontu
xs: [c a b]
nums: hide(each([0 1 2 3 4 5 6 7 8 9], { i:key() n:_ }))
s1: hide(each($.xs, { v:_ n:sum(pick(filter($.nums, { i:key(3) }), n)) }))
out: pick(sort($.s1, n, desc), v)
```

```json
{"out":["b","a","c"],"xs":["c","a","b"]}
```

A slice keeps the positions a bound admits:

<!-- test: quote test/cue/k35.cue -->
```cue
xs: [1, 2, 3, 4]
out: xs[1:3]
```

```aontu
xs: [1 2 3 4]
nums: hide(each([0 1 2 3 4 5 6 7 8 9], { i:key() n:_ }))
s1: hide(each($.xs, { v:_ n:sum(pick(filter($.nums, { i:key(3) }), n)) }))
out: pick(filter($.s1, { n:min(1) & below(3) }), v)
```

```json
{"out":[2,3],"xs":[1,2,3,4]}
```

Each member set against the one before it takes five helper fields:

<!-- test: quote test/cue/k36.cue -->
```cue
xs: [3, 5, 9]
out: [for i, x in xs if i > 0 {x - xs[i-1]}]
```

```aontu
xs: [3 5 9]
nums: hide(each([0 1 2 3 4 5 6 7 8 9], { i:key() n:_ }))
st: hide(each($.xs, { i:key() v:_ }))

m: hide(pack(pick($.st, i), {
  v: sum(pick(filter($.st, { i:key(3) }), v))
  n: sum(pick(filter($.nums, { i:key(3) }), n))
}))

m2: hide(each($.m, _ & { p:"" + sub(.n, 1) }))

m3: hide(pack(pick($.m2, p), {
  prev: sum(pick(filter($.st, { i:key(3) }), v))
  v: sum(pick(filter($.m2, { p:key(3) }), v))
  n: sum(pick(filter($.m2, { p:key(3) }), n))
}))

out: emit(sort(filter($.m3, { n:above(0) }), n), {
  match: any
  body: [sub(.v, .prev)]
})
```

```json
{"out":[2,4],"xs":[3,5,9]}
```

The written list holds 10 numbers, so these three constructions read a
list of at most 10 members.

### Loop a number of times

A generator walks a list or a map that exists, and a number is neither.
A loop driven by a number alone is refused with `each_data`. In CUE:

<!-- test: quote test/cue/k30.cue -->
```cue
import "list"
n: 3
out: [for i in list.Range(0, n, 1) {"node-\(i)"}]
```

The nearest aontu:

<!-- test: quote test/cue/k30.aontu -->
```aontu
n: 3
out: each($.n, "node-" + key())
```

A list of numbers written into the document stands in for the range,
and a `filter` keeps the numbers below `n`:

```aontu
n: 3
out: each(filter([0 1 2 3 4 5 6 7 8 9], below($.n)), "node-" + _)
```

```json
{"n":3,"out":["node-0","node-1","node-2"]}
```

The written list is the bound. Past it, the answer is the bound's, and
nothing is refused. With `n` at 12, the count is 10:

```aontu
n: 12
out: sum(each(filter([0 1 2 3 4 5 6 7 8 9], below($.n)), 1))
```

```json
{"n":12,"out":10}
```

Write the list at least as long as the largest value `n` can take, and
bound `n` with `max`, so that a larger value is refused.

Each built-in used here is listed in the
[functions reference](../reference-functions.md), and generators in
full in
[Generating children: `pack` and `each`](../reference-language.md#generating-children-pack-and-each).
