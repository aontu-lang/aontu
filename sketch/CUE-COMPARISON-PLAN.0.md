# A plan from the CUE comparison

**Status:** Proposal, 2026-11-20. Nothing here is decided or scheduled.
Each task that adds to the language waits on a ruling, and the rulings
are the first task. A built-in that is adopted becomes a phase of a gap
document under `sketch/capability-review/` and a row of the register,
under the same-commit rule
([capability-review.md](../docs/contributing/capability-review.md)).
**Basis:** [CUE-COMPARISON.0.md](CUE-COMPARISON.0.md), which compares
aontu with CUE v0.17.1 and v0.18.0-rc.4, and its section
[What comprehensions do that the built-ins do not](CUE-COMPARISON.0.md#what-comprehensions-do-that-the-built-ins-do-not).
**Scope:** Part 1 only: what gives aontu the functionality that
comprehensions give CUE. The comparison's other findings (interchange,
the language server, the package repository, and the issues
[#860](https://github.com/aontu-lang/aontu/issues/860) and
[#862](https://github.com/aontu-lang/aontu/issues/862)) are for later
parts.

Every example below was run. The CUE code ran through `cue` v0.17.1 and
v0.18.0-rc.4, and the code under "aontu today" through both engines at
`main` (`967c5f3`). Each pair gave the same answer, which is printed
once. Code under "aontu, proposed" is a proposal and doesn't give its
answer today. Each proposed line was run as well, to see what it does
now. Ten are refused: as `unknown_function`, as `func_arity` for a
third argument to `pack`, or as `invalid-arg`, `each_data` or
`listval_no_gen` where the unknown call is an argument. Two evaluate
and answer an empty list, because an unknown call in a `filter`
condition or under `maybe` is silent today
([#870](https://github.com/aontu-lang/aontu/issues/870)).

## What is missing

A CUE comprehension binds names: the member, its key or position, and
every name of a clause outside it. Each can be used in the body and in
the key of what the body makes. aontu's generators bind less:

| A comprehension has | aontu has today | So this takes a construction |
|---|---|---|
| a field of the member, `x.port` | `_`, the member whole; only an `emit` body reads a field, as `.port` | a projection that keeps its keys, a condition over two fields |
| a member by a computed key, `teams[s.team]`, `ys[i]` | paths whose steps are written, or named by a host variable | a lookup, a pairing by position |
| a computed key, `(x.name): …` | `pack`, keyed by its data's own keys or strings | a map keyed by a field, a prefix, two fields |
| the position as a number, `for i, x in xs` | `key()`, the position as text | an offset, a neighbour, a slice, a reversal |
| a loop over a number, `list.Range(0, n, 1)` | generators over bags that exist | no spelling at all |
| an outer clause's names in an inner clause | the nearest generator's `_` only | an inner loop that reads the outer member |

Five additions close the six rows. None is a keyword, a token or a
function a document defines.

## The decisions this plan keeps

| Decision | Recorded in | What it means here |
|---|---|---|
| No comprehension keywords, no computed-key syntax, no string interpolation | the boundary of [G8](capability-review/g8-generation.md) | each addition is a built-in, or an argument of one |
| No user-defined functions | G8, option D | nothing here names a function in a document |
| Evaluation terminates, and exhaustion is a coded error, never a truncation | [the trust contract](../docs/trust.md), clause 2 | a loop driven by a number needs a budget and a code |
| Generated children are keyed by data, not by position | G8's survey of Terraform's `count` | a computed key reads a field of the data; a position as a number is for a list's elements |
| The call surface is declared | [ADR-017](../ADR.md#adr-017--the-builtin-call-surface-is-declared-parsed-by-both-ports) | each addition is one line of `test/spec/signature.tsv` |
| Both ports, shared rows, and one definition | [ADR-001](../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec), [ADR-002](../ADR.md#adr-002--test-coverage-stays-at-100--in-both-implementations) | a task is done when both engines pass rows that the parity probe wrote, and `spec/` states the meaning |
| A ruling comes before the code | [`admin/issue-plan.md`](../admin/issue-plan.md) | task C0 |

Two of the additions reopen questions that G8 recorded. Its question on
keying `pack` over a list of maps was settled as a refusal, with "add a
key-selector argument" the option not taken: C2 asks for that argument.
Its question on `_` under nesting left "an explicit depth argument
mirroring `key(n)`" open as an additive option: C5 is that option.

## The tasks

Sizes use the register's scale: S, M and L.

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| C0 | Put the thirteen questions below to the maintainer, and record each ruling | ruling | nothing | S |
| C1 | `at(d, ...k)`: the member of a bag at a key or a position | built-in | C0 | M |
| C2 | `pack(d, t, k)`: a third argument that makes each child's key | built-in | C0, C1 | M |
| C3 | `index(up?)`: a position as an integer | built-in | C0 | S |
| C4 | `range(n)`: a loop driven by a number, under a budget | built-in | C0 | S |
| C5 | `outer(up?)`: the member of an enclosing generator | built-in | C0, C1 | M |
| C6 | Fix the four defects on these routes: [#754](https://github.com/aontu-lang/aontu/issues/754), [#850](https://github.com/aontu-lang/aontu/issues/850), [#868](https://github.com/aontu-lang/aontu/issues/868), [#870](https://github.com/aontu-lang/aontu/issues/870) | fix | nothing | M |
| C7 | Pin today's routes as shared rows, so each addition is held to the answer its route gives now | guard | nothing | S |
| C8 | A how-to guide that maps each comprehension idiom to aontu, every entry executed | docs | C7 | M |

C6 and C7 need no ruling and can start now. C1 comes first among the
built-ins, because C2 and C5 are written with it.

### What a built-in task delivers

Each of C1 to C5 lands as one change that holds all of these:

- its line in `test/spec/signature.tsv`, and the copies `make sig`
  writes;
- the built-in in both engines, with the hints for its refusals;
- its name in the four published grammars under `grammar/`, and the
  copies the build makes of them;
- its entry in the language reference, the functions table that is
  generated from the signature, and both language servers' rosters;
- its meaning in the definition under `spec/`, with the generated rows
  that hold both engines to it;
- shared rows written by the parity probe, the row of each route it
  replaces among them (C7);
- a row in `test/spec/errcodes.tsv` for each new code;
- its row in the progress register, and the changelog.

## C1: the member at a key or a position

**Proposed:** `at(d: map|list, ...k: (string|integer)) : any`

`at(d, k)` reads what a path step reads: in a map the member under the
key `k` spells, in a list the member at the index it spells. More keys
step further, so `at(d, a, b)` is `at(at(d, a), b)`. Each key is read
as its value, so it can be computed: a relative path, `key()`, a sum,
another `at`. The answer is a copy, as a reference's is. A step that
names nothing is refused as a path's is, and `maybe(at(…))` is absence.

This one built-in is both a field of the member, `at(_, port)`, and a
lookup, `at($.teams, .team)`.

### A field of each member, keys kept

CUE:

```cue
svc: {
	a: {port: 1, cfg: {x: 1}}
	b: {port: 2, cfg: {x: 2}}
}
ports: {for k, v in svc {(k): v.port}}
cfgs: {for k, v in svc {(k): v.cfg}}
```

aontu today. A number is unwrapped by an aggregate, and a record takes
a checked link with a built address:

```aontu
svc: {
  a: { port: 1, cfg: { x: 1 } }
  b: { port: 2, cfg: { x: 2 } }
}
ports: pack($.svc, sum(pick([_], port)))
cfgs: pack($.svc, {})
links: hide(emit(pack($.svc, _ & { id: key() }), {
  match: any
  body: [relate(.cfg) & path("$.cfgs." + .id)]
}))
```

Both answer:

```json
{ "ports": { "a": 1, "b": 2 }, "cfgs": { "a": { "x": 1 }, "b": { "x": 2 } } }
```

aontu, proposed:

```aontu
ports: pack($.svc, at(_, port))
cfgs: pack($.svc, at(_, cfg))
```

This closes [#861](https://github.com/aontu-lang/aontu/issues/861).

### A lookup by a field of the member

CUE:

```cue
teams: {core: {email: "core@x"}, web: {email: "web@x"}}
svc: {a: {team: "core"}, b: {team: "web"}}
owners: {for k, s in svc {(k): teams[s.team].email}}
```

aontu today. Each team is stamped with its own key, a `filter` finds
it by a climb of three dots, and `join` unwraps the one answer:

```aontu
teams: { core: { email: "core@x" }, web: { email: "web@x" } }
svc: { a: { team: core }, b: { team: web } }
tst: hide(pack($.teams, _ & { id: key() }))
svc: &: { owner: join(pick(filter($.tst, { id: ...team }), email)) }
owners: pack($.svc, join(pick([_], owner)))
```

Both answer:

```json
{ "owners": { "a": "core@x", "b": "web@x" } }
```

aontu, proposed:

```aontu
owners: pack($.svc, at($.teams, at(_, team), email))
```

### A condition over two fields, and two lists paired by position

CUE:

```cue
xs: [{a: 3, b: 1}, {a: 1, b: 2}]
big: [for x in xs if x.a > x.b {x.a}]

ks: ["a", "b"]
ys: [1, 2]
pairs: [for i, x in ks {k: x, y: ys[i]}]
```

aontu today. The condition needs a derived field, and the pairing a
stamp and a `filter` by `key(3)`:

```aontu
xs: [{ a: 3, b: 1 }, { a: 1, b: 2 }]
tmp: hide(each($.xs, _ & { d: sub(.a, .b) }))
big: pick(filter($.tmp, { d: above(0) }), a)

ks: [a, b]
ys: [1, 2]
yi: hide(each($.ys, { i: key(), y: _ }))
pairs: each($.ks, { k: _, y: sum(pick(filter($.yi, { i: key(3) }), y)) })
```

Both answer:

```json
{ "big": [3], "pairs": [{ "k": "a", "y": 1 }, { "k": "b", "y": 2 }] }
```

aontu, proposed:

```aontu
big: pick(filter($.xs, { a: above(at(_, b)) }), a)
pairs: each($.ks, { k: _, y: at($.ys, key()) })
```

### Questions for the ruling

1. **The name.** `at` is recommended: it is short, and no document uses
   it as a call. `member` and `get` are the others; `get` is already
   two verbs of the command line.
2. **A member that isn't there.** Recommended: refused as `no_path`, and
   absence under `maybe`, as a path is. The other reading is absence
   outright.
3. **A marked member.** Recommended: `at` reads a `hide()` or `type()`
   member as a path does. The other reading skips it, as a bag reader
   does.
4. **An index from the end.** Recommended: `at(xs, -1)` is refused, and
   a count with `sub` reaches the last member. The other reading counts
   from the end.

## C2: a key for each child of `pack`

**Proposed:** `pack(d: map|list, template t: any, template k?: string) : map`

With `k`, each member's child stands under the key that `k` answers
for that member, in place of the member's own key or text. `k` is read
once for each member, where the member stands: `_` is the member and
`key(0)` its own key or position. It must settle to a string, or the
call is refused as `pack_key`. `t` is read at the child's place, as it
is today, and children whose keys collide unify, as they do today.

### A map keyed by a field, and by two

CUE:

```cue
xs: [{ns: "a", name: "web", port: 80}, {ns: "b", name: "db", port: 5432}]
byname: {for x in xs {(x.name): x}}
ports: {for x in xs {"\(x.ns)/\(x.name)": x.port}}
```

aontu today. The record takes links, and the built key a stamp, a
`pack` over the picked keys and a `filter` by `key(2)` back into the
source:

```aontu
xs: [{ ns: a, name: web, port: 80 }, { ns: b, name: db, port: 5432 }]
byname: pack(pick($.xs, name), {})
links: hide(emit($.xs, { match: any, body: [relate(_) & path("$.byname." + .name)] }))
st: hide(each($.xs, _ & { id: .ns + "/" + .name }))
ports: pack(pick($.st, id), sum(pick(filter($.st, { id: key(2) }), port)))
```

Both answer:

```json
{ "byname": { "db":  { "name": "db",  "ns": "b", "port": 5432 },
              "web": { "name": "web", "ns": "a", "port": 80 } },
  "ports": { "a/web": 80, "b/db": 5432 } }
```

aontu, proposed:

```aontu
byname: pack($.xs, _, at(_, name))
ports: pack($.xs, at(_, port), at(_, ns) + "/" + at(_, name))
```

The same argument gives a prefix on every key, `pack($.m, _, "svc-" +
key(0))`, and an inverted map once each member carries its key.

### Questions for the ruling

5. **Reopen G8's settled question?** Recommended: yes. Six probes (k10,
   k11 and k14 to k17) reach a keyed result only by packing over picked
   keys and looking each member up again. Keeping the refusal leaves
   that route, documented in C8.
6. **The spelling.** Recommended: the optional third argument, so
   there is one keyed generator. The other is a new built-in that takes
   the key before the value, as CUE writes `(key): value`.
7. **What `k` may read.** Recommended: `_` and `key(0)` only. The other
   reading lets a relative path in `k` name the member's field, as it
   does in a spread's template.
8. **The key's kind.** Recommended: a string only, as `pack_key` holds
   today. The other reading takes a number by its text.

## C3: a position as an integer

**Proposed:** `index(up?: integer|biginteger) : integer`

`index` answers what `key` answers, as an integer, where the level it
names is a position in a list. Where that level is a map's key, the
call is refused. `up` counts as `key`'s does: `0` is the value's own
level, and the default is `1`.

G8 records why children are keyed by data and not by position. `index`
keys nothing: it reads the position a list element already has, which
`key()` already answers as text.

### A number from each position

CUE:

```cue
hosts: ["a", "b", "c"]
nodes: [for i, h in hosts {host: h, port: 8000 + i}]
```

aontu today. A position is text, so a written list of numbers stands
in, and each member finds its number by `key(3)`:

```aontu
hosts: [a, b, c]
nums: hide(each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { i: key(), n: _ }))
nodes: each($.hosts, {
  host: _
  port: add(8000, sum(pick(filter($.nums, { i: key(3) }), n)))
})
```

Both answer:

```json
{ "nodes": [{ "host": "a", "port": 8000 }, { "host": "b", "port": 8001 },
            { "host": "c", "port": 8002 }] }
```

aontu, proposed:

```aontu
nodes: each($.hosts, { host: _, port: add(8000, index()) })
```

With C1 it also gives a member's neighbour, which the comparison's
probe k36 reaches through five helper fields. CUE writes
`[for i, x in xs if i > 0 {x - xs[i-1]}]`, and the proposed spelling
is one line, where the first member's missing neighbour is an absence
that drops its element:

```aontu
steps: each($.xs, sub(_, maybe(at($.xs, sub(index(0), 1)))))
```

### Question for the ruling

9. **A position as a number at all.** Recommended: `index(up?)`, the
   sibling of `key(up?)`. The others are a conversion from text to a
   number, which raises which numeric leaf a text names, or leaving
   positions as text.

## C4: a loop driven by a number

**Proposed:** `range(n: integer|biginteger) : list`

`range(n)` is the list of the integers from `0` up to, and not
including, `n`. `range(0)` is `[]`. A negative `n` is refused, and so
is an `n` past a budget that the trust contract names, with a code of
class `budget`. It is never cut short.

This is the one comprehension idiom with no spelling today (k30), and
the one addition that touches the termination guarantee: every other
generator takes its size from data that exists, and `range` takes it
from a value.

### A list of `n` things

CUE:

```cue
import "list"

n: 3
nodes: [for i in list.Range(0, n, 1) {"node-\(i)"}]
```

aontu today. A written list is the bound. Past it the answer is the
bound's, with no finding (k32):

```aontu
n: 3
nodes: each(filter([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], below($.n)), "node-" + _)
```

Both answer:

```json
{ "nodes": ["node-0", "node-1", "node-2"] }
```

aontu, proposed:

```aontu
nodes: each(range($.n), "node-" + _)
```

### Questions for the ruling

10. **A counted loop at all.** Recommended: `range(n)` under a new
    budget in clause 2 of the trust contract. The others are
    `range(n, max)`, where the document writes its own bound and a
    larger `n` is refused, or keeping the refusal, with the written
    list as the documented route.
11. **The budget.** Its name, its size, and whether it is one of
    `trust.budget`'s numbers that a host may raise.

## C5: the member of an enclosing generator

**Proposed:** `outer(up?: integer|biginteger) : any`

Inside a generator's template, `_` is the member the nearest generator
is working on. `outer()` is the member of the generator one level
further out, and `outer(2)` the one beyond it. Outside a nested
generator it is refused, as an unbound `_` is.

### An inner loop that reads the outer member

CUE:

```cue
svcs: [{name: "web", ports: [80, 443]}, {name: "db", ports: [5432]}]
out: [for s in svcs for p in s.ports {"\(s.name):\(p)"}]
```

aontu today. The outer member is kept, the inner list is built beside
it by a climb of two dots, and an `emit` flattens the result:

```aontu
svcs: [{ name: web, ports: [80, 443] }, { name: db, ports: [5432] }]
tmp: hide(each($.svcs, _ & { pairs: each(.ports, ..name + ":" + _) }))
out: emit($.tmp, { match: any, body: [.pairs] })
```

Both answer:

```json
{ "out": ["web:80", "web:443", "db:5432"] }
```

aontu, proposed, with C1:

```aontu
out: emit($.svcs, { match: any, body: [each(.ports, at(outer(), name) + ":" + _)] })
```

It also takes the counted level out of a grouping. CUE writes
`{for x in xs {(x.team): [for y in xs if y.team == x.team {y.name}]}}`,
today's route is `pack(pick($.xs, team), pick(filter($.xs, { team:
key(2) }), name))` (k12), where `key(3)` answers every group as `[]`
(k13), and with C1 and C2 the proposed spelling counts nothing:

```aontu
byteam: pack($.xs, pick(filter($.xs, { team: at(outer(), team) }), name), at(_, team))
```

### Questions for the ruling

12. **G8's open question.** Recommended: innermost binding stands for
    `_`, and the depth form arrives as the function `outer(up?)`. The
    other is to leave nested loops to climbs, as k7 and k8 write them.
13. **What counts as a level.** Recommended: each construct that binds
    `_`: `each`, `pack`, an `emit` body, a `filter` condition and
    `apply`.

## C6: the defects on these routes

Four open issues sit on the routes above. They are defects, so they
are issues and not designs:

- [#754](https://github.com/aontu-lang/aontu/issues/754): in a member a
  generator makes, a `filter`'s condition reads no relative path and
  answers empty, in both ports.
- [#850](https://github.com/aontu-lang/aontu/issues/850): a `match`
  whose result is a relative reference overflows the TypeScript stack.
- [#868](https://github.com/aontu-lang/aontu/issues/868): a `match`
  whose pattern is a relative reference overflows the TypeScript stack,
  and one whose pattern is a bound over it is `mapval_no_gen`, where Go
  answers both.
- [#870](https://github.com/aontu-lang/aontu/issues/870): a call
  refused at parse, an unknown name or a wrong count, is silent inside
  a trial, in both ports. `filter($.xs, length(3))`, with the retired
  name, answers `[]`.

Each fix lands with the shared row that pins it. They matter more once
C1 and C5 make conditions inside generated members common. #870 bears
on every built-in here: until it is fixed, a name that becomes a
built-in changes the answer of any document that holds it in a trial
today, with no finding before or after.

## C7: pin today's routes

The comparison's probes k1 to k38 are aontu documents that both
engines answer alike. As shared rows they hold three things:

- the routes that work today keep working;
- each built-in of C1 to C5 is written against the answer its route
  gives now, in the same file;
- the silent answers stay visible: the miscounted level (k13), the
  condition that reads nothing (k4) and the list past its written
  bound (k32).

Every expectation comes from the parity probe. The probes are also the
seed of the differential corpus that
[CONFIG-LANGUAGES-PLAN.0.md](CONFIG-LANGUAGES-PLAN.0.md) lists as L6.

## C8: the guide

A how-to page under `docs/how-to/` that maps each comprehension idiom
to aontu, in the order a CUE user reaches for them, with every example
executed by the documentation tests. It starts from what is direct
today, and each of C1 to C5 shortens its entries in the change that
lands it. This is the pattern catalogue that the same plan lists as M8,
and part of its H3.

What is direct today, for the guide's first entries:

```cue
xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]
out: [for x in xs if x.port > 1000 {name: x.name, addr: "\(x.host):\(x.port)"}]

ns: [1, 2, 3]
twice: [for n in ns let y = n * 2 {v: y}]

m: {b: 1, a: 2}
pairs: [for k, v in m {"\(k)=\(v)"}]
```

```aontu
xs: [{ name: web, host: h1, port: 80 }, { name: db, host: h2, port: 5432 }]
out: emit(filter($.xs, { port: above(1000) }), {
  match: any
  body: [{ name: .name, addr: .host + ":" + .port }]
})

ns: [1, 2, 3]
twice: each($.ns, apply(mul(_, 2), { v: _ }))

m: { b: 1, a: 2 }
pairs: each(pack($.m, key(0) + "=" + _), _)
```

Both answer the same, but for `pairs`, which aontu writes in key
order and CUE in source order:

```json
{ "out": [{ "name": "db", "addr": "h2:5432" }],
  "twice": [{ "v": 2 }, { "v": 4 }, { "v": 6 }],
  "pairs": ["a=2", "b=1"] }
```

## Which task makes which idiom direct

| What the comprehension does | Probes | Direct with |
|---|---|---|
| reads a field of the member in a template | k37 | C1 |
| keeps the keys while projecting a field | k18, g1 | C1 |
| compares two fields of one member | k4, k5 | C1 |
| looks a value or a record up by a member's field | k19, k20 | C1 |
| pairs two lists by position | k21 | C1 |
| keeps the members another list names | k9 | C1 and C2 |
| keys a map by a field, a prefix or two fields | k10, k11, k15, k16 | C2, with C1 |
| inverts a map | k14 | C2, with C1 |
| groups by a field | k12, k13 | C2 and C5, with C1 |
| pairs every member of two lists, keyed by both | k17 | C2 and C5 |
| reads the outer member in an inner loop | k7, k8 | C5, with C1 |
| uses a position as a number | k33 to k36 | C3, with C1 |
| loops over a number | k30 to k32 | C4 |

## Order

1. C0, the rulings. C6 and C7 beside it, since neither waits on one.
2. C1, then C2. Together they make nine of the thirteen rows above
   direct or shorter.
3. C5, then C3.
4. C4, last, because it alone changes a trust number.
5. C8 starts after C7 and is revised by each landing.

## Not proposed

| Considered | Why it is left out |
|---|---|
| `for` and `if` keywords, computed keys in a map literal, interpolation | G8's boundary. Each addition above is a call. |
| A path anchored at the hole, `_.port` | a new form of path where a call does the same, and G8 prefers a function to a token |
| A relative path in an `each` or `pack` template that reads the member's field | it reads the instance today, and documents rely on that |
| A built-in that flattens | an `emit` body's lists splice, and `+` joins two lists |
| A built-in that groups members into lists | CUE has none either. The grouping above takes C2 and C5. |
| A built-in that counts | `sum(each(d, 1))` counts today. It can be revisited when `at` makes the last member a common ask. |
| A finding for a `filter` condition that reads nothing | it would change answers that rows pin. C7 pins the silent answer instead, and C1 removes the usual reason to write one. |

## Done when

Each row of the table under
[Which task makes which idiom direct](#which-task-makes-which-idiom-direct)
has a spelling of one call, or of calls nested without a helper field,
that answers what its route answers today.
