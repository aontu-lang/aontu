# The lang refinement plan

**Status:** Ruled, 2026-11-22. Part 1's thirteen questions were put to
the maintainer on 2026-11-21, and each has its ruling beside it and in
[The rulings](#the-rulings): all five built-ins are adopted. Parts 2
to 7 were added that day and ruled that day: questions 14 to
29 have their rulings beside them and in
[The rulings on parts 2 to 7](#the-rulings-on-parts-2-to-7). Part 5,
OpenAPI, is deferred. Parts 8 to 11 take in the open issues, and
their questions, 30 to 51, were ruled on 2026-11-21 and 2026-11-22:
[The rulings on parts 8 to 11](#the-rulings-on-parts-8-to-11). Nothing
is scheduled. An adopted built-in becomes a phase of a gap document
under `sketch/capability-review/` and a row of the register, under
the same-commit rule
([capability-review.md](../docs/contributing/capability-review.md)).
The rulings here are numbered within this plan. A decision of the
definition has its own number, in section 7 of
[DEFINITION.0.md](DEFINITION.0.md), and is cited as one.
**Basis:** [CUE-COMPARISON.0.md](CUE-COMPARISON.0.md), which compares
aontu with CUE v0.17.1 and v0.18.0-rc.4, and its section
[What comprehensions do that the built-ins do not](CUE-COMPARISON.0.md#what-comprehensions-do-that-the-built-ins-do-not).
**Formerly:** `CUE-COMPARISON-PLAN.0.md`, "A plan from the CUE
comparison". The maintainer renamed it on 2026-11-21.
**Scope:** Eleven parts, listed under [The parts](#the-parts). Part 1
is what gives aontu the functionality that comprehensions give CUE.
Parts 2 to 7 take six more of the comparison's findings. Parts 8 to 10
answer three issues that ask for something new, and part 11 places
every open issue. Input and output have a note and rulings of their
own, [IO-FORMATS.0.md](IO-FORMATS.0.md). The rest is listed under
[What stays outside](#what-stays-outside).

Every example below was run. The CUE code ran through `cue` v0.17.1 and
v0.18.0-rc.4, and the code under "aontu today" through both engines at
`main` (`967c5f3` for part 1, `7da884f` for parts 2 to 7). Each pair
gave the same answer, which is printed once. Code under "aontu,
proposed" is a proposal and doesn't give its answer today. Each
proposed line was run as well, to see what it does now. Of part 1's,
twelve are refused: as `unknown_function`, as `func_arity` for a third
argument to `pack`, or as `invalid-arg`, `each_data` or
`listval_no_gen` where the unknown call is an argument. One evaluates
and answers an empty list, because an unknown call in a `filter`
condition is silent today
([#870](https://github.com/aontu-lang/aontu/issues/870)). Parts 2 to 7
say beside each proposed line what it does today.

## The parts

| Part | Subject | Tasks | Questions |
|---|---|---|---|
| 1 | What comprehensions give: five built-ins, the defects on their routes, the rows that pin today's routes, and a guide to the idioms. It runs from [What is missing](#what-is-missing) to [Done when](#done-when) | C0 to C8 | 1 to 13, ruled |
| 2 | [The guide for CUE users, and the comparison's examples](#part-2-the-guide-for-cue-users-and-the-comparisons-examples) | CG1 to CG5 | 14, 15, ruled |
| 3 | [The language server](#part-3-the-language-server) | LS1 to LS9 | 16, 17, ruled |
| 4 | [A short form for a key pattern](#part-4-a-short-form-for-a-key-pattern) | KP1, KP2 | 18, 19, ruled |
| 5 | [OpenAPI](#part-5-openapi) | OA1 to OA6, deferred | 20, 21, ruled |
| 6 | [Host values on the command line](#part-6-host-values-on-the-command-line) | HV1 to HV4 | 22 to 24 and 29, ruled |
| 7 | [Binary types: bytes, sized numbers and multipliers](#part-7-binary-types-bytes-sized-numbers-and-multipliers) | BT1 to BT5 | 25 to 28, ruled |
| 8 | [Root path references](#part-8-root-path-references), issue #884 | RP1 to RP5 | 34 to 36, ruled |
| 9 | [Language versions](#part-9-language-versions), issue #881 | LV1 to LV5 | 37, ruled |
| 10 | [More scalar types](#part-10-more-scalar-types), issue #886 | ST1 to ST7 | 30 to 33 and 51, ruled |
| 11 | [The open issues](#part-11-the-open-issues), all 136 of them | IS1 to IS3 | 38 to 50, ruled |

One task came before the rest of parts 2 to 7. **P0** put their
questions to the maintainer and recorded each ruling beside its
question, as C0 did for part 1. It was done on 2026-11-21, so no task
below waits on a ruling. The parts' tasks are ordered together under
[The order across parts](#the-order-across-parts).

### The rulings on parts 2 to 7

Ruled by the maintainer on 2026-11-21. Of the first fifteen, eleven
follow the recommendation. Two do not: on question 23 the
recommendation was to accept, and on 26 it was `esc` and `usc`. Two,
20 and 21, defer part 5. Question 29 was put after the ruling on 23,
which raised it, and follows the recommendation.

| | Question | Ruling |
|---|---|---|
| 14 | Whether CI runs CUE | yes: the daily workflow, with two pinned binaries |
| 15 | A CUE answer that moves | a move in the release fails the daily run, and a move in the candidate is reported |
| 16 | The language server across files | it answers from the evaluation it already runs |
| 17 | What rename refuses | the whole rename, naming the site, and it edits only files under the workspace root |
| 18 | The short form for a key pattern | a call, `keyed(p, t, e?)` |
| 19 | A seal and a patterned key | unchanged: the short form means exactly the guarded spread |
| 20 | How far OpenAPI goes | deferred: OpenAPI is to be added separately |
| 21 | The export to OpenAPI 3.0 | deferred with it |
| 22 | The options for host values | `--var` reads aontu source, `--var-text` reads text, and `--vars` reads a file |
| 23 | A `--var` that no document reads | refused, as a usage error |
| 24 | Pinning under bindings | `hash` and `breaking` take the options, and `publish` and the package verbs refuse them |
| 25 | Bytes | text in a named encoding, and no kind. Changed by ruling 30: bytes are a type |
| 26 | Where the encodings are spelled | two built-ins, `encode(s, name)` and `decode(t, name)` |
| 27 | Sized numbers | a bundled model, `@"aontu:num"` |
| 28 | Multipliers | not adopted |
| 29 | A key of a `--vars` file that no document reads | accepted |

Two rulings touch a decision that
[G1](capability-review/g1-constraint-algebra.md) records, and G1 now
points at each. Ruling 18 takes up N3, which G1 holds as deferred, and
that record changes when KP1 lands. Ruling 27 keeps G1's decision on
sized kinds, since a bundled model adds no keyword.

### The rulings on parts 8 to 11

Ruled by the maintainer in six rounds, 30 to 33 on 2026-11-21 and 34
to 51 on 2026-11-22. Seventeen follow the recommendation. Four do
not: 32, 34, 41 and 51. On 31 all three groups offered were taken,
where two were recommended.

| | Question | Ruling |
|---|---|---|
| 30 | Bytes, under issue #886 | a type made by a call, which changes ruling 25 |
| 31 | Which scalar types first | dates and times, `semver`, and five identifiers, with bytes |
| 32 | A new type's kind | the bare word, as `path` is, from a file's version on |
| 33 | A string from data | strict, as `path` is: no string becomes one |
| 34 | How `$` changes in existing files | in every file at once, with a lint |
| 35 | A captured path in an included file | it generates the global address |
| 36 | A file's names when it is included under a key | the file is whole |
| 37 | A file with no version annotation | read as the last version before annotations |
| 38 | An unknown call inside a trial | refused wherever it stands |
| 39 | A default inside a map, read by a trial | the value the member generates |
| 40 | A fallback for an absent field | `maybe(v, fallback)` |
| 41 | Markdown conventions for `esc` and `usc` | `md`, `mdcell` and `mdcode` |
| 42 | The definition's decision 74 | the whole argument admits nothing, and the definition moves |
| 43 | The definition's decision 76 | the path reads the field as the data settles it |
| 44 | A key that holds a dot, in an address | a quoted segment |
| 45 | `*(` before a literal map or list | a preference |
| 46 | A generator over the bag that holds it | it reads the bag where no cycle is read |
| 47 | A file that is not valid UTF-8 | refused |
| 48 | A relation's template in a copy | one form wherever it is copied |
| 49 | A set of names written without commas | read as the comma form |
| 50 | Eight small questions, and the site of an included value | the repository's standing rules, and `resolve` as the headline of #313 |
| 51 | A bare word that is both a name and a kind | the name is quoted in a file of the new version |

Ruling 30 changes ruling 25 of this plan. Ten of these rulings are
rules of the language, and each is a decision of the definition too,
entered there on 2026-11-22: rulings 42 and 43 are its decisions 74
and 76, and rulings 38, 39 and 44 to 49 are its decisions 77 to 84,
in that order, entered by IS2 of part 11.

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

## The rulings

Ruled by the maintainer on 2026-11-21. Twelve follow the
recommendation. Question 4 does not: the recommendation was a miss,
and the ruling counts from the end.

| | Question | Ruling |
|---|---|---|
| 1 | The name of the lookup | `at` |
| 2 | A member that isn't there | refused as `no_path`, and absent under `maybe` |
| 3 | A marked member | read, as a path reads it |
| 4 | An index from the end | it counts from the end: `at(xs, -1)` is the last member |
| 5 | G8's settled question on keying `pack` | reopened: `pack` makes each child's key |
| 6 | The spelling of the key | an optional third argument |
| 7 | What the key template may read | `_` and `key(0)` only |
| 8 | The key's kind | a string only |
| 9 | A position as a number | `index(up?)` |
| 10 | A counted loop | `range(n)`, under a new budget |
| 11 | The budget | `trust.budget.range`, 100000 unless a host raises it, and `range_budget` past it |
| 12 | G8's open question on nesting | `_` stays innermost, and `outer(up?)` is added |
| 13 | What counts as a level | every construct that binds `_` |

Three rulings change a decision on record, and each lands with the
record it changes: ruling 5 reverses the refusal that G8 settled,
rulings 10 and 11 add a budget to clause 2 of the trust contract, and
ruling 2 has `maybeOf` in the definition count `at` as a reference.

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
| C6 | Fix the five defects on these routes: [#754](https://github.com/aontu-lang/aontu/issues/754), [#850](https://github.com/aontu-lang/aontu/issues/850), [#868](https://github.com/aontu-lang/aontu/issues/868), [#870](https://github.com/aontu-lang/aontu/issues/870), [#871](https://github.com/aontu-lang/aontu/issues/871) | fix | nothing | M |
| C7 | Pin today's routes as shared rows, so each addition is held to the answer its route gives now | guard | nothing | S |
| C8 | A how-to guide that maps each comprehension idiom to aontu, every entry executed | docs | C7 | M |

C0 was done on 2026-11-21, so C1 to C5 no longer wait on it. C6 and
C7 needed no ruling. C1 comes first among the built-ins, because C2
and C5 are written with it.

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
names nothing is refused as a path's is. `maybe` forgives a reference
at the top of its argument and no call, so `maybe(upper($.gone))` is
`no_path` today. `at` counts as a reference there, and `maybe(at(…))`
is absence where a step names nothing. A negative position counts
from the end of a list, which a path step does not: `at(xs, -1)` is
the last member, and a position before the first member or past the
last names nothing.

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

1. **The name.** Ruled 2026-11-21: `at`. It is short, and no document
   uses it as a call. `member` and `get` were the others; `get` is
   already two verbs of the command line.
2. **A member that isn't there.** Ruled 2026-11-21: refused as
   `no_path`, and absence under `maybe`, as a path is. That makes `at`
   a reference under `maybe`'s rule, which `maybeOf` in the definition
   then says. The other reading was absence outright.
3. **A marked member.** Ruled 2026-11-21: `at` reads a `hide()` or
   `type()` member as a path does. The other reading skipped it, as a
   bag reader does.
4. **An index from the end.** Ruled 2026-11-21: it counts from the
   end, so `at(xs, -1)` is the last member and `at(xs, -2)` the one
   before it. The recommendation was the other reading, a miss as the
   path `$.xs.-1` is today. A position further back than the first
   member is still a miss.

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

5. **Reopen G8's settled question?** Ruled 2026-11-21: reopened, and
   `pack` makes each child's key. Six probes (k10, k11 and k14 to k17)
   reach a keyed result only by packing over picked keys and looking
   each member up again. Keeping the refusal would have left that
   route, documented in C8.
6. **The spelling.** Ruled 2026-11-21: the optional third argument, so
   there is one keyed generator. The other was a new built-in that took
   the key before the value, as CUE writes `(key): value`.
7. **What `k` may read.** Ruled 2026-11-21: `_` and `key(0)` only. The
   other reading let a relative path in `k` name the member's field,
   as it does in a spread's template.
8. **The key's kind.** Ruled 2026-11-21: a string only, as `pack_key`
   holds today. The other reading took a number by its text.

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

With C1, and positions counted from the end, it also reverses a list,
which the comparison's probe k34 does through a written list of
numbers:

```aontu
back: each($.xs, at($.xs, sub(-1, index(0))))
```

### Question for the ruling

9. **A position as a number at all.** Ruled 2026-11-21: `index(up?)`,
   the sibling of `key(up?)`. The others were a conversion from text
   to a number, which raises which numeric leaf a text names, or
   leaving positions as text.

## C4: a loop driven by a number

**Proposed:** `range(n: integer|biginteger) : list`

`range(n)` is the list of the integers from `0` up to, and not
including, `n`. `range(0)` is `[]`. A negative `n` is refused, and so
is an `n` past the budget `trust.budget.range`, as `range_budget`, of
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

With C1 it also sets each member against the one before it, which
probe k36 reaches through five helper fields. CUE writes
`[for i, x in xs if i > 0 {x - xs[i-1]}]`, and the proposed spelling
walks the positions before the last:

```aontu
steps: each(range(sub(sum(each($.xs, 1)), 1)), sub(at($.xs, add(_, 1)), at($.xs, _)))
```

Before the ruling on question 4 this note spelled it with a miss,
`sub(_, maybe(at($.xs, sub(index(0), 1))))`. A negative position now
counts from the end, so that line would set the first member against
the last.

### Questions for the ruling

10. **A counted loop at all.** Ruled 2026-11-21: `range(n)` under a new
    budget in clause 2 of the trust contract. The others were
    `range(n, max)`, where the document writes its own bound and a
    larger `n` is refused, or keeping the refusal, with the written
    list as the documented route.
11. **The budget.** Ruled 2026-11-21: a fourth number of
    `trust.budget`, `range`, that counts the members every `range` of
    one evaluation makes, as `trials` counts trials. It defaults to
    100000, as `trials` does, a host may raise it, and past it the code
    is `range_budget`, pinned from both sides in
    `test/spec/budget.tsv`. For scale, `each` over a written list of
    100000 numbers took 3.6 seconds in TypeScript and 1.7 in Go on the
    machine that ran the probes. The other readings were a smaller
    default, or a count for each call.

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

12. **G8's open question.** Ruled 2026-11-21: innermost binding stands
    for `_`, and the depth form arrives as the function `outer(up?)`.
    The other was to leave nested loops to climbs, as k7 and k8 write
    them.
13. **What counts as a level.** Ruled 2026-11-21: each construct that
    binds `_`: `each`, `pack`, an `emit` body, a `filter` condition and
    `apply`. The other reading counted only `each`, `pack` and `emit`.

## C6: the defects on these routes

Five open issues sit on the routes above. They are defects, so they
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
- [#871](https://github.com/aontu-lang/aontu/issues/871): in
  TypeScript, a `maybe` of a relative reference never resolves as a
  second or later argument of a call in a written field, where Go
  answers. `x: { b: 2, d: sub(5, maybe(.b)) }` is `mapval_no_gen`
  there, and with a climb the answer is a silent absence.

Each fix lands with the shared row that pins it. They matter more once
C1 and C5 make conditions inside generated members common. #870 bears
on every built-in here: until it is fixed, a name that becomes a
built-in changes the answer of any document that holds it in a trial
today, with no finding before or after. Ruling 38 says how it is
fixed: an unknown call is refused wherever it stands. #871 sits where C1 and C3 put
an optional lookup, a `maybe` as a later argument of a call.

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
[CONFIG-LANGUAGES-PLAN.0.md](CONFIG-LANGUAGES-PLAN.0.md) lists as L6,
which [part 2](#part-2-the-guide-for-cue-users-and-the-comparisons-examples)
takes up as CG1 to CG3.

## C8: the guide

A how-to page under `docs/how-to/` that maps each comprehension idiom
to aontu, in the order a CUE user reaches for them, with every example
executed by the documentation tests. It starts from what is direct
today, and each of C1 to C5 shortens its entries in the change that
lands it. This is the pattern catalogue that the same plan lists as M8,
and part of its H3. The rest of H3, the guide for CUE users, is CG4 of
[part 2](#part-2-the-guide-for-cue-users-and-the-comparisons-examples).

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
| takes the last member | k33 | C1 |
| reverses a list | k34 | C3, with C1 |
| slices a list, or sets a member against the one before | k35, k36 | C4, with C1 |
| loops over a number | k30 to k32 | C4 |

## Order

1. C0, the rulings, done on 2026-11-21. C6 and C7 beside it, since
   neither waited on one.
2. C1, then C2. Together they make ten of the fifteen rows above
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
| A built-in that counts | `sum(each(d, 1))` counts today. The ruling on question 4 gives the last member as `at(xs, -1)`, which was the usual reason to want a count. |
| A finding for a `filter` condition that reads nothing | it would change answers that rows pin. C7 pins the silent answer instead, and C1 removes the usual reason to write one. |

## Done when

Each row of the table under
[Which task makes which idiom direct](#which-task-makes-which-idiom-direct)
has a spelling of one call, or of calls nested without a helper field,
that answers what its route answers today.

## Part 2: the guide for CUE users, and the comparison's examples

"The comparison's examples" is read here as its 154 probes. Each was
written once in each language, and run through both engines and two
CUE releases.

### What there is today

- The probes are a table in a sketch,
  [The probes](CUE-COMPARISON.0.md#the-probes). No test reads it, so
  nothing holds an answer once the page is written. C7 pins the 38
  that are about comprehensions, and only their aontu half.
- No published page tells a CUE user what differs. The pages under
  `docs/` name CUE as the language aontu follows, and link its
  documentation for further reading.
- [CONFIG-LANGUAGES-PLAN.0.md](CONFIG-LANGUAGES-PLAN.0.md) lists the
  guide as H3, the pattern catalogue as M8 and the differential corpus
  as L6. L6 comes from
  [G1](capability-review/g1-constraint-algebra.md), which says that
  nothing in the repository runs a real `cue`.

### What the guide holds

Four sections, in the order a CUE user meets them:

1. **The same thing, written differently.** A table from each CUE form
   to its aontu spelling. The sample below is its first rows.
2. **The same text, a different answer.** The 22 rows of
   [Where the same text means different things](CUE-COMPARISON.0.md#where-the-same-text-means-different-things),
   each with both answers.
3. **What aontu has no form of.** Operators for constraints,
   interpolation, comprehension keywords, user-defined functions and
   workflows, each with the decision that rules it out and the nearest
   spelling.
4. **The commands.** `cue vet`, `export`, `eval`, `def`, `fmt`, `trim`
   and `mod`, each beside the `aontu` verb that does its work.

The comprehension idioms stay on C8's page, which the guide links.

A sample of the first section, one row to a line:

```cue
#Port:   int & >=1 & <=65535
_region: "eu"
svc: {
	name:     =~"^[a-z]+$" & "web"
	port:     #Port & 8080
	replicas: *1 | int
	note?:    string
	tags:     [...string] & ["a", _region]
	limits: [string]: int
	limits: cpu:      2
	addr: "\(name):\(port)"
}
```

```aontu
Port: type(integer & min(1) & max(65535))
region: hide("eu")
svc: {
  name: re("^[a-z]+$") & web
  port: $.Port & 8080
  replicas: *1 | integer
  note?: string
  tags: [&: string] & [a, $.region]
  limits: &: integer
  limits: cpu: 2
  addr: .name + ":" + .port
}
```

Both answer:

```json
{ "svc": { "name": "web", "port": 8080, "replicas": 1,
           "tags": ["a", "eu"], "limits": { "cpu": 2 },
           "addr": "web:8080" } }
```

One row of that table changes with the CUE release. The key as a
value is `[N=string]: name: N` in v0.17.1, and v0.18.0-rc.4 refuses the
`=` alias at its own language version. aontu writes `&: name: key(1)`,
with `key(1)` because `key(0)` inside the template reads `name`. The
guide gives a row like this both CUE spellings.

### How the examples are held

- **Two files for each probe**, its CUE source and its aontu source,
  with an index of what each answers and how the two relate: the same,
  different by design, or refused by one.
- **The aontu half runs on every push**, in both suites, each answer
  written by the parity probe. C7's rows are its first 38.
- **The CUE half runs in the daily workflow**, against two pinned `cue`
  binaries, the latest release and the newest candidate. v0.18 moved
  two probes, g12 and x8, and the run would have reported both.
- **The guide quotes the files.** Its CUE code is printed with the
  `test: quote` directive, so every CUE line a reader sees is one the
  daily run holds. Its aontu code is executed by
  `ts/test/docs.test.ts`, as on every other page.

### The tasks of part 2

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| CG1 | Commit the 154 probes as a corpus: a CUE file and an aontu file for each, and an index of what each answers | guard | nothing | M |
| CG2 | Hold the aontu half in both suites on every push, each answer written by the parity probe | guard | CG1 | S |
| CG3 | Hold the CUE half in the daily workflow against two pinned `cue` binaries. A move in the release fails the run, and a move in the candidate is reported | guard | CG1 | S |
| CG4 | The guide, `docs/how-to/aontu-for-cue-users.md`, in the four sections above | docs | CG1, CG2 | M |
| CG5 | The site's comparisons page, drawn from the guide, in `aontu-lang/web` | docs | CG4 | S |

C7 and CG2 are one mechanism: whichever starts first writes the rows
of the other. CG3 edits `.github/workflows/`, so its push needs an
account with the `workflow` scope. H3 also asks for a guide for JSON
Schema users, which this part leaves to that plan.

### Questions for the ruling on part 2

14. **Whether CI runs CUE.** Ruled 2026-11-21: yes, in the daily
    workflow only, each binary pinned by version and checksum. The
    other choice recorded CUE's answers by hand at each CUE release, as
    the comparison did, and then nothing reports a release that moves
    one.
15. **What a moved CUE answer does.** Ruled 2026-11-21: a move in the
    release fails the daily run until the row and the guide are
    revised in one change, and a move in the candidate is reported
    only. The other choices reported both and failed neither, or
    failed on both.

## Part 3: the language server

The comparison calls this the widest of the gaps, and the other plan
lists it as M5.

### What each server answers

One document, written in each language:

```cue
package p

base: {port: 8080, host: "h1"}
web: base & {name: "web"}
db: {port: base.port, name: "db"}
#Svc: {port: int, name: string, tier?: string}
api: #Svc & {port: 1, name: "api"}
```

```aontu
base: { port: 8080, host: "h1" }
web: $.base & { name: "web" }
db: { port: $.base.port, name: "db" }
Svc: type({ port: integer, name: string, tier?: string })
api: $.Svc & { port: 1, name: "api" }
```

Both evaluate to:

```json
{ "base": { "port": 8080, "host": "h1" },
  "web": { "port": 8080, "host": "h1", "name": "web" },
  "db": { "port": 8080, "name": "db" },
  "api": { "port": 1, "name": "api" } }
```

Eight requests were sent to `cue lsp` of each release and to both
aontu servers, TypeScript and Go, which answered alike:

| Request | CUE v0.17.1 | CUE v0.18.0-rc.4 | aontu, both servers |
|---|---|---|---|
| hover on the reference to `base.port` | nothing | `Unified with: 8080` | nothing |
| definition of that reference | the key `port` of `base` | the same | nothing |
| references to the key `port` of `base` | the key and the reference | the same | `-32601`, method not found |
| rename of that key to `listen` | one edit of both sites | the same | `-32601` |
| document symbols | the tree of fields | the same | `-32601` |
| completion inside `api` | the document's top-level names | `name`, `port` and `tier`, the fields of the schema | the built-ins, kinds and literals, wherever the cursor is |
| code actions | `Organize Imports` | the same | `-32601` |
| formatting | nothing | the edits `cue fmt` would make | `-32601` |

aontu's servers advertise hover, completion, definition and signature
help, and their definition answers for an alias name only
([lsp.md](../docs/lsp.md#limitations-and-extension-points)).

### What the engine already has

The answers are in the engine. The servers don't ask for them.

- **The sites of a path.** `aontu model why db.port` prints every site
  that wrote the path, across includes, and marks a reference as one.
  Both engines print the same two lines for the document above:
  `8080  doc.aontu:1:15` and `$.base.port  doc.aontu:3:13  (ref)`.
- **The agreed form.** `aontu fmt` writes it in both ports.
- **A repair.** `aontu trim --check` names each entry whose removal
  changes nothing, which is a code action with its edit already
  decided.

What is missing is the step `docs/lsp.md` names: a mapping from a
cursor to a path. Every feature below but formatting stands on it.

### The tasks of part 3

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| LS1 | Cursor to path, and path to sites, in the analysis layer of both ports: the path of the key, value or reference under a cursor, and the sites that write a path, from the provenance `model why` reads. A shared-row mode for a request at a position holds both servers to one answer | library | nothing | M |
| LS2 | Definition and hover on a key and on a path, across includes | server | LS1 | S |
| LS3 | Key completion: the keys a type or a spread's template declares and the map hasn't written, and the members of a path after `$.` and `.` | server | LS1 | M |
| LS4 | Formatting, by the text `aontu fmt` writes | server | nothing | S |
| LS5 | Document symbols: the outline of a document's keys | server | LS1 | S |
| LS6 | References and highlights: every reference that reads the path under the cursor | server | LS1 | M |
| LS7 | Rename: a key and every reference to it, as one edit, or a refusal that names the site it can't rewrite | server | LS6 | M |
| LS8 | Code actions, starting with the one whose edit is already decided: remove an entry that `trim --check` reports. Others follow as findings gain repairs | server | LS1 | M |
| LS9 | A JetBrains client through LSP4IJ, as thin as the three under `editors/` | client | nothing | S |

Each feature lands in both servers with the same answer, and in
`docs/lsp.md` and
[wire-your-editor.md](../docs/how-to/wire-your-editor.md) in the same
change. The order of the table is the recommended order: LS2 to LS4
are what a writer feels first.

### Questions for the ruling on part 3

16. **How far across files.** A definition or a reference can sit in
    an included file. Ruled 2026-11-21: the server answers from the
    evaluation it already runs for diagnostics, so it reads what the
    document's includes read under the same capability, and nothing
    more. The other choice kept every answer inside the open document,
    as the alias features are kept today.
17. **What rename refuses.** Ruled 2026-11-21: it edits only files
    under the workspace root, and refuses the whole rename, naming the
    site, where no edit of text keeps the document true: a key a
    generator makes, a key read through `key()`, a key a pattern
    matches, and a site in a package. The other choice renamed what it
    could and listed the rest.

## Part 4: a short form for a key pattern

CUE holds every key that a pattern admits to a schema, as
`[=~"^env_"]: string`. aontu says the same with a guarded spread. The
other plan lists a short form as L2, and
[G1](capability-review/g1-constraint-algebra.md) records the first
proposal for one, N3, as deferred on 2026-08-28.

### The pattern today

```cue
cfg: {
	[=~"^env_"]:  string
	[=~"_port$"]: int & >0
}
cfg: {
	env_name:  "prod"
	http_port: 8080
	other:     true
}
```

```aontu
cfg: {
  &: match(key(0), re("^env_"), string, any)
  &: match(key(0), re("_port$"), integer & above(0), any)
}
cfg: {
  env_name: prod
  http_port: 8080
  other: true
}
```

Both answer:

```json
{ "cfg": { "env_name": "prod", "http_port": 8080, "other": true } }
```

Three things hold in both languages and both engines:

- A key that two patterns admit is held to both. `env_port: "x"` is
  refused by each.
- A key that no pattern admits is left alone, as `other` is.
- The JSON Schema importer already writes `patternProperties` as this
  guarded spread, and `additionalProperties: false` beside it as a
  spread whose last argument is `nil`.

### A seal differs

In CUE a pattern in a definition admits the keys it matches. In aontu
a spread declares no key. An instance of a `type()` refuses even a key
that its own pattern admits, as `closed`. So a type that takes
patterned keys is held open, and closed again by the spread's last
argument:

```cue
#Env: {[=~"^env_"]: string}
cfg: #Env & {env_name: "prod"}
```

```aontu
Env: type(open({ &: match(key(0), re("^env_"), string, nil) }))
cfg: $.Env & { env_name: prod }
```

Both answer:

```json
{ "cfg": { "env_name": "prod" } }
```

Both refuse `other: 1` there, CUE as `field not allowed` and aontu as
`literal_nil`.

### The short form

aontu, proposed:

```aontu
short: { &: keyed(re("^env_"), string), env_name: prod }
only: { &: keyed(re("^env_"), string, nil), env_name: prod }
```

`keyed(p, t, e?)` is `match(key(0), p, t, e)`, with `any` where `e` is
left out. It is rewritten as it is read, so canon, the text of a
refusal and the JSON Schema exporter all write the guarded spread, and
the two spellings have one canonical form. That is L2's condition, and
it is how the short form avoids the cost ADR-008 names for a second
spelling. Today each line is `unknown_function` in both engines.

The other spelling proposed was N3's, a pattern in the key, which
ruling 18 did not take:

```aontu
form: { &re("^env_"): string, env_name: prod }
```

It is the shortest, and it is syntax. Today it is a parse error,
`unexpected`, in both engines, and it would change the key production
of the four published grammars and of both parsers.

### The tasks of part 4

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| KP1 | `keyed(p, t, e?)`: the guarded spread as one call, read as the `match` it means | built-in | nothing | S |
| KP2 | Its section of the reference, a how-to on holding keys to a pattern, and its row of the guide for CUE users | docs | KP1 | S |

KP1 delivers what
[a built-in task delivers](#what-a-built-in-task-delivers), and
records in G1 that N3 is taken up.

### Questions for the ruling on part 4

18. **The spelling.** Ruled 2026-11-21: a call named `keyed`. L2 asks
    for a named form, and G8 prefers a function to a token. `keys` was
    passed over because it reads as the list of a map's keys. The
    others were N3's key form, `&p: t`, and no short form, with the
    guarded spread taught as the idiom.
19. **A seal.** Ruled 2026-11-21: unchanged. The short form means
    exactly the guarded spread, so a sealed map and a type's instance
    still refuse a key that only a pattern admits, and the guide for
    CUE users says so. The other choice followed CUE: a key that a
    pattern admits would count as declared. That is a new rule of the
    seal in the definition, and the short form would stop being a
    spelling.

## Part 5: OpenAPI

The other plan lists this as L3, a layer over the JSON Schema
importer that [G12](capability-review/g12-jsonschema-fidelity.md)
built.

**Deferred.** Ruled 2026-11-21, on questions 20 and 21: OpenAPI
support is to be added separately. None of this part's tasks is taken
up under this plan, and none is in
[The order across parts](#the-order-across-parts). What the part found
stands as the record for that work.

### What CUE does with a document

`cue import openapi+yaml: api.yaml` reads this document, and
`cue def --out openapi+yaml` writes one back:

```yaml
openapi: 3.0.3
info: {title: Pets, version: 1.0.0}
paths: {}
components:
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id: {type: integer, format: int64}
        name: {type: string}
        tag: {type: string, nullable: true}
        photo: {type: string, format: byte}
        owner: {$ref: '#/components/schemas/Owner'}
    Owner:
      type: object
      required: [email]
      properties:
        email: {type: string, format: email}
```

- **The import** makes each member of `components.schemas` a
  definition, `#Pet` and `#Owner`, and `info` a pair of defaults. It
  reads no operation: a document with a path and a response imports to
  its schemas alone.
- **The export** writes OpenAPI 3.0.0: each definition as a member of
  `components.schemas`, a reference between two as a `$ref`, and
  `paths: {}`.

### What aontu does with one today

No verb reads the document. `aontu jsonschema import` reads one
component of it, through a one-line schema that refers into it. With
the document as `api.json` and `{"$ref":"api.json#/components/schemas/Pet"}`
as `pet.json`, both engines write:

```sh
$ aontu jsonschema import --doc api.json api.json pet.json
id: meta(number & mulof(1), { format:"int64" })
name: empty()
tag?: meta(empty(), { nullable:true })
photo?: meta(empty(), { format:"byte" })
owner?: email: meta(empty(), { format:"email" })
```

Keyword by keyword:

| In the document | CUE's import | aontu today |
|---|---|---|
| `nullable: true` | `null \| string` | carried as `meta()` and not applied, so `tag: null` is refused |
| `format: int64` | `int64` | carried as `meta()` |
| `format: byte` | `string` | carried as `meta()`: any string is admitted |
| a `$ref` to another component | a reference to its definition | followed, and written inline |
| the operations under `paths` | not read | not read |
| the document as YAML | read | refused, `jsonschema_schema`: the importer reads JSON |
| the whole document as the schema | n/a | `meta(any, …)`: every key is an unknown keyword, and anything is admitted |

The other way, `aontu jsonschema --at Pet` writes one 2020-12 schema
with its references inline, and leaves a `type()` entry out unless
`--at` names it. OpenAPI 3.1 takes a 2020-12 schema as it is. OpenAPI
3.0 doesn't, and G12 lists export to an older draft as a non-goal.

### The tasks of part 5

Deferred by ruling. They are listed as they were proposed.

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| OA1 | The OpenAPI 3.0 dialect in the importer, as a rewrite into 2020-12 like the earlier drafts': `nullable`, the boolean `exclusiveMinimum` and `exclusiveMaximum`, and the OpenAPI formats, `int32` and `int64` as bounds and `byte` as base64 text. 3.1's base dialect is 2020-12 with four annotation keywords | importer | P0 | M |
| OA2 | `aontu openapi import <file>`: each member of `components.schemas` as a `type()` under one key, a reference between two kept as a reference, the losses reported as the JSON Schema importer reports them. It reads JSON and YAML | verb | OA1 | M |
| OA3 | `aontu openapi <file>`: a document's `type()` entries as the `components.schemas` of an OpenAPI 3.1 document, a reference between two written as a `$ref` | verb | P0 | M |
| OA4 | The operations as a model: paths, parameters, and request and response bodies. Its shape is settled when the task starts, with `voxgig/apidef`, which L3 names, as the reference | verb | P0, OA2 | L |
| OA5 | Kubernetes custom resource definitions: the `openAPIV3Schema` of each version, with the `x-kubernetes-*` family applied | importer | OA1 | M |
| OA6 | A how-to and a use case: check data against the schema of a published API | docs | OA2 | S |

OA1's `byte` stands on BT2 of part 7. OA2's YAML stands on ruling E
of [IO-FORMATS.0.md](IO-FORMATS.0.md#the-rulings), a verb that reads
a data file by its extension. OA4 meets ADR-001 early: `voxgig/apidef`
is an npm package, so its model either gets a Go port or is written
as an aontu document that both engines read.

One defect sits on this route. A `vet` finding for a value read from
an included JSON or YAML file names a different file in each port, and
neither gives its place
([#887](https://github.com/aontu-lang/aontu/issues/887)). OA6's use
case is the first to meet it.

### Questions for the ruling on part 5

20. **How far support goes.** Ruled 2026-11-21: deferred. OpenAPI
    support is to be added separately. The recommendation was schemas
    first, in both directions, OA1 to OA3, which is all CUE has, with
    the operations, OA4, as a step of their own. The other choices
    were schemas only, and the operations from the start.
21. **The export to 3.0.** Ruled 2026-11-21: deferred with question
    20. CUE writes 3.0.0 and nothing newer. The recommendation was
    that aontu write 3.1 only, so that G12's non-goal stands. The
    other choice added a writer for the older dialect, which the
    importer's rewrite can't be run backwards to give.

## Part 6: host values on the command line

[#862](https://github.com/aontu-lang/aontu/issues/862) is the gap: a
document that reads a `$name` can be evaluated from a program and not
from a shell.

### What CUE does with a tag

With `env: string @tag(env)` and `replicas: int @tag(n, type=int)` in
`v.cue`, both releases answer:

```sh
$ cue export v.cue -t env=prod -t n=3
{
    "env": "prod",
    "replicas": 3
}
```

- A value is text unless its tag declares a type, so `n` needs
  `type=int`, and `-t n=x` is refused as an invalid number.
- A tag that no file declares is refused: `no tag for "nope"`.
- Without the tags the export is refused, `env: incomplete value
  string`.

### What aontu does with a variable today

With `env: $env` and `replicas: integer & $n` in `v.aontu`, both
engines answer:

```sh
$ aontu v.aontu
[aontu/unknown_var]: Cannot unify values at path $.env
$ aontu --var env=prod --var n=3 v.aontu
aontu: unknown option --var (try --help)
```

`vet`, `hash`, `trim --check` and `model get` refuse the document
with the same code. Both APIs bind the names, `ctx.vars` in TypeScript and
`UnifyVars` in Go, and the trust contract counts the bindings as the
third input of an evaluation
([trust.md](../docs/trust.md#clause-1-hermeticity)). A flag adds no
kind of input.

### The options

aontu, proposed:

```sh
$ aontu --var env=prod --var n=3 v.aontu
{
  "env": "prod",
  "replicas": 3
}
```

- **`--var name=value`** reads the value as aontu source, as
  `aontu model set` reads the value it is given. `n=3` is an integer,
  `env=prod` a string and `'tags=[a, b]'` a list.
- **`--var-text name=value`** reads the value as text whatever it looks
  like. A step that passes a short commit hash needs it:
  `--var sha=1234567` would bind an integer on the day the hash is all
  digits.
- **`--vars <file>`** binds every top-level key of a document, for a
  set of values that is kept under review.
- **A `--var` or `--var-text` that no document of the run reads is
  refused**, as a usage error, as CUE refuses a tag that no file
  declares. A key of a `--vars` file that nothing reads is accepted,
  so one file of values serves several documents.

There is no reading of the environment, the clock or the host's name,
which CUE gives with `-T`. The trust contract refuses each, and a
shell passes one where it is wanted, as `--var-text user="$USER"`.

### The tasks of part 6

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| HV1 | `--var` and `--var-text` on every verb that evaluates a document, in both commands, with one help text, and the refusal of one that no document reads | CLI | nothing | M |
| HV2 | `--vars <file>`: the bindings from a document whose keys are the names, a key that nothing reads being accepted | CLI | HV1 | S |
| HV3 | The same bindings in the REPL and in the tools of the MCP server | CLI | HV1 | S |
| HV4 | The command line in [inject-host-values.md](../docs/how-to/inject-host-values.md) and [validate-in-ci.md](../docs/how-to/validate-in-ci.md), and the options in the reference | docs | HV1 | S |

HV1 closes #862. Its options come under the review of every argument
that [#340](https://github.com/aontu-lang/aontu/issues/340) asks for.
By ruling 24, `hash` and `breaking` are among HV1's verbs and name the
bindings in their reports, and `publish` and the package verbs refuse
the options.

### Questions for the ruling on part 6

22. **The options.** Ruled 2026-11-21: the three above, with `--var`
    reading aontu source. The other choices followed CUE, with `--var`
    reading text and a second option reading source, or gave `--var`
    alone. Both readings are needed either way, since no built-in
    turns text into a number.
23. **A binding that no document reads.** Ruled 2026-11-21: a `--var`
    or `--var-text` that no document reads is refused as a usage
    error, as CUE refuses one. It catches a misspelt name where the
    right name has a default. The recommendation was to accept it, as
    both APIs accept one today, so that one set of options serves
    several documents.
24. **Pinning under bindings.** A hash taken under bindings is the
    hash of one deployment and not of the model. Ruled 2026-11-21:
    `hash` and `breaking` take the options and name the bindings in
    their reports, and `publish` and the package verbs refuse them,
    since a package is published with no host. The other choice kept
    the options off `hash` and `breaking` as well.

One question followed from the ruling on 23:

29. **A key of a `--vars` file that no document reads.** Ruled
    2026-11-21: accepted, so one file of values serves several
    documents, and the refusal stays with the options written on the
    command line. The other choices refused it too, or accepted it
    with a notice.

## Part 7: binary types: bytes, sized numbers and multipliers

"Binary types" is read here as one row of the comparison: bytes, the
sized numeric types such as `uint8`, and multipliers such as `1Ki`.
The rulings took each in turn.

### Bytes

```cue
import "encoding/base64"

key:  bytes & 'k\x01\xff'
text: base64.Encode(null, "hello")
back: "\(base64.Decode(null, "aGVsbG8="))"
```

```aontu
B64: hide(string & re("^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"))
key: $.B64 & "awH/"
```

Both answer, for `key`:

```json
{ "key": "awH/" }
```

CUE writes bytes to JSON as base64 text, so the two agree at the
output. aontu holds that text and can check its alphabet. It has no
spelling for `text` or `back`, which CUE answers as `"aGVsbG8="` and
`"hello"`: no built-in encodes or decodes.

Three more things hold today, in both engines:

- `'…'` is a string, and `'k\x01\xff'` is three characters: `k`,
  U+0001 and `ÿ`.
- An include of a binary file is refused, `include_extension`. Named
  by `--text-ext`, the file is read as text, with each byte that is
  not UTF-8 replaced, and the two ports count the replacements
  differently
  ([#889](https://github.com/aontu-lang/aontu/issues/889)).
- The JSON Schema importer carries `contentEncoding` as an annotation.

aontu, proposed:

```aontu
text: encode("hello", base64)
back: decode("aGVsbG8=", base64)
code: encode("k", hex)
```

They would answer `"aGVsbG8="`, `"hello"` and `"6b"`. Today each is
`unknown_function` in both engines. An encoding acts on a string's
UTF-8 bytes, as the `uri` convention of `esc` does already. `decode`
refuses text that decodes to bytes that are not UTF-8, because a
string holds characters, so binary data stays in its encoded form from
the file to the output. The proposal was first written over `esc` and
`usc`, and ruling 26 gave the encodings built-ins of their own.

Ruling 30 then changed ruling 25: bytes are a type, made by a call,
which is ST5 of [part 10](#part-10-more-scalar-types). `encode` and
`decode` stay as conversions of text. The formats of BT2 stay for
data, which spells bytes as a string, and the include of BT3 yields a
value of the type.

### Sized numbers

```cue
a: uint8 & 200
b: int64 & 9223372036854775807
```

```aontu
Num: type({
  uint8: integer & min(0) & max(255)
  int64: (integer | biginteger) & min(-0d9223372036854775808) & max(0d9223372036854775807)
})
a: $.Num.uint8 & 200
b: $.Num.int64 & 0d9223372036854775807
```

Both answer:

```json
{ "a": 200, "b": 9223372036854775807 }
```

[G1](capability-review/g1-constraint-algebra.md) records sized kinds as
not being built, because a `type()` block of named constraints says
them, and
[name-a-reusable-constraint.md](../docs/how-to/name-a-reusable-constraint.md)
shows the block. The 64-bit name shows what the block costs to get
right: two kinds, both bounds as exact literals, and the lower one
spelled `-0d…`. A 64-bit bound written as a plain literal is refused,
`invalid-arg`, and `0d-…` is a bare string.

### Multipliers

CUE reads `1Ki` as `1024` and `2M` as `2000000`. aontu reads each as a
bare string, which is what a Kubernetes quantity is: `memory: 1Gi`
reaches the manifest as text.

### The tasks of part 7

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| BT1 | `encode(s, name)` and `decode(t, name)`, for `base64`, `base64url` and `hex`, over a string's UTF-8 bytes | built-in | nothing | M |
| BT2 | The same three as names `format()` reads, each a grammar of RFC 4648 under `grammar/format/`, so `format(base64)` admits the text | constraint | nothing | S |
| BT3 | An include reads a file's bytes, for the extensions an option names, as `--text-ext` names text. It yields a `bytes` value, by ruling 30 | include | BT1, ST5 | M |
| BT4 | The sized numbers as a bundled model, `@"aontu:num"`: the integer names CUE predeclares, and `Float32`, each a `type()` | model | nothing | S |
| BT5 | A how-to on carrying binary data, and a pointer to the bundled names from `name-a-reusable-constraint.md` | docs | BT1, BT4 | S |

BT1 delivers what
[a built-in task delivers](#what-a-built-in-task-delivers) for each of
its two names, with a code for a name that is no encoding and a code
for text that doesn't decode. Two of the others change a decision on
record, and each lands with the record it changes: BT2 adds names
beside the nineteen JSON Schema formats of
[ADR-059](../ADR.md#adr-059--a-format-is-a-grammar-aontu-reads-and-runs-itself),
and BT3 adds a row to ADR-012's table of extensions.

### Questions for the ruling on part 7

25. **Bytes: a kind, or text.** Ruled 2026-11-21: text in a named
    encoding. JSON has no bytes, CUE's own output is base64 text, and
    JSON Schema says it with `contentEncoding`. A kind would have been
    a new scalar in the lattice, canon, the four grammars, the
    definition and both ports. Changed 2026-11-21 by ruling 30: the
    kind offered here had a literal form, and a type made by a call,
    as issue #886 asks, was taken in its place.
26. **Where the encodings are spelled.** Ruled 2026-11-21: a pair of
    built-ins, `encode(s, name)` and `decode(t, name)`, which reads
    better for base64 and adds two names. The recommendation was the
    other choice, three conventions of `esc` and `usc`.
27. **Sized numbers.** Ruled 2026-11-21: a bundled model, BT4. It
    keeps G1's decision: no keyword, `a: int8` still a string, and
    each name an ordinary value that a project can narrow. The others
    left each project to write its own block, as today, or predeclared
    the names as CUE's are, which would reverse G1.
28. **Multipliers.** Ruled 2026-11-21: not adopted, since a bare `1Ki`
    is a string that documents rely on. The other choices put the
    constants in a bundled model, as `mul(4, $.aontu.Num.Gi)`, or read
    `1Ki` as a number, as CUE does.

## Part 8: root path references

[#884](https://github.com/aontu-lang/aontu/issues/884) asks that `$`
mean the root of the source file it is written in, so that a file's
own references stay valid wherever it is included, and that `$$` mean
the global root.

### What `$` means today

Both engines agree on each of these. With `a: 1`, `b: $.a` and
`c: .a` in `part.aontu`:

| The including document | Answer |
|---|---|
| `@"./part.aontu"`, at the top | `b` is `1` |
| `v: @"./part.aontu"` | refused, `no_path` at `$.v.b`: the entry document has no `a` |
| `a: 9` and `v: @"./part.aontu"` | `v.b` is `9`, the entry document's `a` |

The relative path `.a` reads the file's own `a` wherever the file
lands: in the third document `v.c` is `1`. So a file that is included
under a key can reach its own members by relative paths only, and its
`$` paths reach the entry document.

Three more facts bear on the change:

- `$$.a` already evaluates today, as `$.a` does, so the new spelling
  is valid text already and keeps its meaning.
- A captured path keeps its spelling. `q: relate() & path($.a)`,
  written in a file that is included under `v`, is refused as
  `rel_unresolved`: the node is at `$.v.a`.
- The bundled models write `$.aontu.System.Port` and the like. Under
  #884 each could be included under a key.

### What changes

- **`$` is the file's root.** In an included file a `$` path is read
  at the point of insertion: at the key it lands under, and at each
  member where the include stands in a spread's template. In the entry
  document `$` and `$$` are one.
- **`$$` is the global root**, the root of the entry document.
- **A file is whole where it lands** (ruling 36). Its declarations and
  destructure heads are read in the file, so the document of
  [#842](https://github.com/aontu-lang/aontu/issues/842) evaluates.
- **An address in the output is global** (ruling 35). A captured path
  or a relation's address written in an included file generates the
  address of its node in the output.
- **Every file changes at once** (ruling 34). There is no old reading
  to select: the changelog names the change, and a lint names each `$`
  path in a file that the run includes under a key.

A `$` in an included file is then read at each use, as a relative path
in a template is. That is the reading the issue plan's workstream on
copies, bodies and templates builds, so this part stands on it:
[Part 11](#part-11-the-open-issues) lists its issues.

### The tasks of part 8

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| RP1 | `$` as the root of its source file and `$$` as the global root, in the definition, both engines and the reference | language | the copies workstream of the issue plan | L |
| RP2 | A file is whole where it lands: its declarations and destructure heads are read in the file. Closes #842 | language | RP1 | M |
| RP3 | A captured path or a relation's address from an included file generates the global address | language | RP1 | M |
| RP4 | The lint that names each `$` path in a file included under a key, the changelog entry, and the bundled models and use cases moved to the new reading | tool | RP1 | S |
| RP5 | The reference's section on paths, and the row of the guide for CUE users | docs | RP1 | S |

RP1 lands before part 9 fixes its baseline, so the baseline already
reads `$` as the file's root and ruling 34 breaks no file twice.

### Questions for the ruling on part 8

34. **How existing files keep their meaning.** Ruled 2026-11-22: they
    don't; `$` is the file's root in every file from the release that
    brings it, with a changelog entry and a lint. The recommendation
    was the other choice, to bring the new reading by the file's
    version, with an older file keeping `$` as the global root.
35. **What a captured path generates from an included file.** Ruled
    2026-11-22: the global address, so that every address in the
    output names its node there. The other choice kept the spelling in
    the file.
36. **A file's names when it is included under a key.** Ruled
    2026-11-22: the file is whole, and its declarations and destructure
    heads are read in it. The other choice refused such a file with
    one code in both ports.

## Part 9: language versions

[#881](https://github.com/aontu-lang/aontu/issues/881) asks that each
source file state the version of the language it is written in, so
that the language can change and every file keep its meaning. The
comparison lists the same thing in CUE, a language version for each
module and a command that migrates.

### What there is today

- **No file states a version.** `%aontu = { version: "0.76" }`, the
  spelling the issue suggests, parses and evaluates in both engines
  today, as a declaration that nothing uses. So today's engines read
  an annotated file.
- **A change of meaning is a changelog entry.** `refer()` became
  `relate()`, the function `form` became `each`, and `length` became
  `len`; a document that holds an old name is refused, or inside a
  trial is silent
  ([#870](https://github.com/aontu-lang/aontu/issues/870)).
- **A model can deprecate its own values**, with `deprecate()`. The
  language has nothing of the kind for its own forms.

### What changes

- **A file states its version** as `%aontu = { version: "…" }`, the
  version of the release whose language it is written in.
- **A file with none is read as the baseline** (ruling 37): the
  language as it stands in the last release before annotations. Every
  existing file keeps its meaning with no edit.
- **A change of meaning comes with its translation.** From the
  baseline on, a form that changes meaning is entered in a table, as a
  rule from the old form to the new. The engine applies the table in
  memory when it reads an older file, so the file answers as it did
  when it was written, and canon and the hash are taken after it.
- **A command rewrites a file** into the current forms and states the
  new version.
- **A file newer than the engine is refused**, with a code that names
  both versions.
- **A new built-in needs no version.** Ruling 38 refuses an unknown
  call wherever it stands, so a name that becomes a built-in can't
  change what a valid document answers.

What rides on a version first: the kinds of part 10, whose bare words
are strings in an older file (ruling 32), and the names that those
kinds take (ruling 51). The change of
[#777](https://github.com/aontu-lang/aontu/issues/777) to what
`relate(t)` means, and the rename of
[#825](https://github.com/aontu-lang/aontu/issues/825), either land
before the baseline or enter the table.

### The tasks of part 9

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| LV1 | The annotation, read in both engines: a file with none is the baseline, and a file newer than the engine is refused | language | RP1 | M |
| LV2 | The table of translations and its reading: an older file is read through it, and canon and the hash are taken after it. Its meaning in the definition | language | LV1 | L |
| LV3 | The command that rewrites a file into the current forms and states the new version, with a check for CI | CLI | LV2 | S |
| LV4 | The rule for a change: a change of meaning lands with its entry in the table, its shared rows for the old and the new reading, and its line in the changelog | process | LV2 | S |
| LV5 | The reference's section on versions, a how-to on upgrading a file, and the row of the guide for CUE users | docs | LV3 | S |

LV3's command and its options come under the review of every argument
that [#340](https://github.com/aontu-lang/aontu/issues/340) asks for.

### Question for the ruling on part 9

37. **A file with no annotation.** Ruled 2026-11-22: it is read as the
    last version before annotations, for good. The others refused it,
    as the issue first puts it, inferred its version from the oldest
    retired form it holds, as the issue suggests, or read it as the
    engine's own version, as CUE reads a file outside a module.

## Part 10: more scalar types

[#886](https://github.com/aontu-lang/aontu/issues/886) asks for more
scalar types, such as dates and bytes, with no new syntax, by the
convention of `path()`.

### The convention of `path()`

`path($.a.b)` is a value of its own kind. Both engines hold all of
this today:

- **The call is the literal.** `path($.a.b)` makes the value, and
  canon prints the call.
- **The kind has a name.** `path` and `path()` are both the kind.
- **It is no kind of string.** `path & "$.a"` is refused,
  `no_scalar_unify`, and outside the call a string never becomes a
  path.
- **It generates as a string**, its address.

`date("2026-11-21")`, `bytes("aGVsbG8=")` and `semver("1.2.3")` are
`unknown_function` in both engines today. The bare words `date`,
`bytes` and `semver` are strings, so `type: date` in a model means the
string.

A date is checked today as a string, and ordered as one:

```aontu
d: format("date") & min("2026-01-01") & "2026-11-21"
```

Both engines answer `"2026-11-21"`. The order is the order of
strings, which is right for one format of date and wrong for a
version: `"1.10.0"` sorts before `"1.9.0"`.

### What changes

Eleven types, each made by a call and each its own kind:

| Types | Read by | What the type adds to the string |
|---|---|---|
| `date`, `time`, `datetime`, `duration` | the RFC 3339 grammars under `grammar/format/` | equality and order by value, so two spellings of one instant are equal |
| `semver` | the grammar of semver.org | order by precedence |
| `uuid`, `uri`, `ipv4`, `ipv6`, `email` | the grammars of the formats of those names | a kind of its own, and one spelling for each value |
| `bytes` | RFC 4648 | length in bytes, and equality across encodings |

- **The bare word is the kind** (ruling 32): `born: date`, as `host:
  path`. A bare `date` is a string today, so the kind applies in a
  file whose version is at or past the release that brings it, and in
  an older file the word stays a string. This part waits on part 9.
- **No string becomes one** (ruling 33). `date & "2026-11-21"` is
  refused, as `path & "$.a"` is. Data spells a date as a string, and
  is checked as today with `format("date")`, which reads the same
  grammar.
- **A name is quoted** (ruling 51). `uri`, `date` and `email` are also
  written bare as names today: `esc(s, uri)`, and a format by its
  name. In a file of the new version the name is written in quotes,
  `esc(s, "uri")`, a bare word that is a kind is refused there, and
  LV3's command rewrites the bare names of an older file.
- **Bytes are a type** (ruling 30), which changes ruling 25 of
  part 7. `bytes("aGVsbG8=")` reads base64, and a second argument
  names another encoding. `encode` and `decode` stay as conversions of
  text, and the formats of BT2 stay for data, which spells bytes as a
  string.

### The tasks of part 10

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| ST1 | A scalar type by the convention of `path()`, in the definition and both engines: the call that makes the value from text a grammar reads, the bare word as the kind from its version on, no string becoming one, generation as the canonical text, and equality and order by value | language | LV1 | L |
| ST2 | `date`, `time`, `datetime` and `duration` | types | ST1 | M |
| ST3 | `semver` | type | ST1 | S |
| ST4 | `uuid`, `uri`, `ipv4`, `ipv6` and `email` | types | ST1 | M |
| ST5 | `bytes`, with `len` in bytes and equality across encodings. The include of BT3 yields one | type | ST1, BT1 | M |
| ST6 | A name written in quotes in a file of the new version, and a bare word that is a kind refused as a name | language | ST1 | S |
| ST7 | The reference's section on scalar types, a how-to on dates, and the rows of the guide for CUE users | docs | ST2 | S |

Each type delivers what
[a built-in task delivers](#what-a-built-in-task-delivers) for its
call. Two issues sit on the convention these types follow, and land
before ST1:
[#474](https://github.com/aontu-lang/aontu/issues/474), how a path
value meets a string constraint, and
[#756](https://github.com/aontu-lang/aontu/issues/756), how one meets
`join`.

### Questions for the ruling on part 10

30. **Bytes.** Ruled 2026-11-21: a type, as #886 asks, which changes
    ruling 25. The kind offered under question 25 had a literal form,
    which #886 rules out; this one is made by a call. The other choice
    let ruling 25 stand and left bytes out of #886.
31. **Which types first.** Ruled 2026-11-21: all three groups offered,
    dates and times, `semver`, and the five identifiers, with bytes
    by ruling 30. The recommendation was the first two.
32. **The kind's spelling.** Ruled 2026-11-21: the bare word, as
    `string` and `path` are, so the types wait on the versions of
    part 9. The recommendation was the empty call, `date()`, which
    `path()` already is and which takes no word from any document.
33. **A string from data.** Ruled 2026-11-21: strict, as `path` is.
    The other choice made each type a kind of string, as `integer` is
    a kind of `number`, so that JSON data met a schema's `date`.

One question followed from rulings 31 and 32:

51. **A bare word that is both a name and a kind.** Ruled 2026-11-22:
    the name is quoted in a file of the new version. The
    recommendation was the other choice, a parameter that reads the
    word as written, so that `esc(s, uri)` meant the same in every
    version.

## Part 11: the open issues

Every open issue of the repository was read on 2026-11-21, with its
comments, and set against this plan. There were 137. One,
[#898](https://github.com/aontu-lang/aontu/issues/898), closed while
they were read, so 136 are open.

Two things moved on 2026-11-22, after the reading.
[#894](https://github.com/aontu-lang/aontu/issues/894) was built and
closed, as the definition's decision 75. And
[#907](https://github.com/aontu-lang/aontu/issues/907) was filed, an
arm of a disjunction that holds a written `nil`: the issue plan places
it with the generators and trials, and nothing in this plan bears on
it. So 136 are open after both, and the tables below are the reading
of 2026-11-21, with #894 still in them.

### Where the issues are

- **108 are placed already**, each in one workstream of
  [`admin/issue-plan.md`](../admin/issue-plan.md), with its kind, its
  size and the rows of `spec/ledger.tsv` it clears. That plan stays the
  record of the workstreams. This part says where each one meets parts 1
  to 10.
- **28 were placed here first**: the issues filed since 2026-11-19, the
  three that parts 8 to 10 answer among them. Since 2026-11-22 each has
  its row in the issue plan too, by IS1, the three in a workstream of
  their own, and that plan lists the rulings below beside the
  definition's decisions.

By kind: 44 are places where both engines differ from the definition or
from a ruling, 32 are a site, a frame or a message, 18 are a difference
between the two engines, 16 are a fault both engines share, 13 are
tools, 8 ask for something new, 3 are gaps in the definition itself, and
2 are documentation.

### The workstreams of the issue plan

The table lists the 108 issues that plan held before 2026-11-22. The 28
newer ones are in the next table, each with the workstream it joined.

| Workstream of the issue plan | Open issues | Where this plan meets them |
|---|---|---|
| Preferences and disjunction arms | [#348](https://github.com/aontu-lang/aontu/issues/348), [#349](https://github.com/aontu-lang/aontu/issues/349), [#431](https://github.com/aontu-lang/aontu/issues/431), [#482](https://github.com/aontu-lang/aontu/issues/482), [#700](https://github.com/aontu-lang/aontu/issues/700), [#702](https://github.com/aontu-lang/aontu/issues/702), [#704](https://github.com/aontu-lang/aontu/issues/704), [#719](https://github.com/aontu-lang/aontu/issues/719) | Ruling 45 answers [#349](https://github.com/aontu-lang/aontu/issues/349). The definition already reads [#857](https://github.com/aontu-lang/aontu/issues/857), by its decision 43. |
| Seals, marks, moves and generation-time checks | [#343](https://github.com/aontu-lang/aontu/issues/343), [#346](https://github.com/aontu-lang/aontu/issues/346), [#486](https://github.com/aontu-lang/aontu/issues/486), [#540](https://github.com/aontu-lang/aontu/issues/540), [#633](https://github.com/aontu-lang/aontu/issues/633), [#668](https://github.com/aontu-lang/aontu/issues/668), [#726](https://github.com/aontu-lang/aontu/issues/726), [#748](https://github.com/aontu-lang/aontu/issues/748), [#749](https://github.com/aontu-lang/aontu/issues/749), [#770](https://github.com/aontu-lang/aontu/issues/770), [#817](https://github.com/aontu-lang/aontu/issues/817) | Ruling 50 answers [#540](https://github.com/aontu-lang/aontu/issues/540) by the definition's reading. [#346](https://github.com/aontu-lang/aontu/issues/346) and [#726](https://github.com/aontu-lang/aontu/issues/726) are the seal's own rules, which `keyed` leaves as they are (ruling 19). |
| Where copies, bodies and templates read paths and key() | [#330](https://github.com/aontu-lang/aontu/issues/330), [#416](https://github.com/aontu-lang/aontu/issues/416), [#463](https://github.com/aontu-lang/aontu/issues/463), [#465](https://github.com/aontu-lang/aontu/issues/465), [#500](https://github.com/aontu-lang/aontu/issues/500), [#501](https://github.com/aontu-lang/aontu/issues/501), [#504](https://github.com/aontu-lang/aontu/issues/504), [#520](https://github.com/aontu-lang/aontu/issues/520), [#528](https://github.com/aontu-lang/aontu/issues/528), [#539](https://github.com/aontu-lang/aontu/issues/539), [#691](https://github.com/aontu-lang/aontu/issues/691), [#692](https://github.com/aontu-lang/aontu/issues/692), [#696](https://github.com/aontu-lang/aontu/issues/696), [#762](https://github.com/aontu-lang/aontu/issues/762), [#765](https://github.com/aontu-lang/aontu/issues/765) | `index(up?)` answers what `key(up?)` answers, so [#463](https://github.com/aontu-lang/aontu/issues/463), [#465](https://github.com/aontu-lang/aontu/issues/465), [#520](https://github.com/aontu-lang/aontu/issues/520), [#528](https://github.com/aontu-lang/aontu/issues/528) and [#539](https://github.com/aontu-lang/aontu/issues/539) land before C3 or with its rows. [#528](https://github.com/aontu-lang/aontu/issues/528) also sits under `keyed` in a named pattern. Part 8 reads `$` at each use by the rule this workstream builds. |
| Relations | [#491](https://github.com/aontu-lang/aontu/issues/491), [#542](https://github.com/aontu-lang/aontu/issues/542), [#661](https://github.com/aontu-lang/aontu/issues/661), [#746](https://github.com/aontu-lang/aontu/issues/746), [#771](https://github.com/aontu-lang/aontu/issues/771), [#773](https://github.com/aontu-lang/aontu/issues/773), [#777](https://github.com/aontu-lang/aontu/issues/777), [#778](https://github.com/aontu-lang/aontu/issues/778), [#779](https://github.com/aontu-lang/aontu/issues/779), [#780](https://github.com/aontu-lang/aontu/issues/780), [#810](https://github.com/aontu-lang/aontu/issues/810), [#811](https://github.com/aontu-lang/aontu/issues/811), [#815](https://github.com/aontu-lang/aontu/issues/815), [#819](https://github.com/aontu-lang/aontu/issues/819), [#878](https://github.com/aontu-lang/aontu/issues/878) | Ruling 48 answers [#779](https://github.com/aontu-lang/aontu/issues/779) and ruling 44 answers [#810](https://github.com/aontu-lang/aontu/issues/810). [#777](https://github.com/aontu-lang/aontu/issues/777) changes what `relate(t)` means, so it lands before the baseline of part 9 or enters its table. |
| Path steps and path values | [#472](https://github.com/aontu-lang/aontu/issues/472), [#474](https://github.com/aontu-lang/aontu/issues/474), [#475](https://github.com/aontu-lang/aontu/issues/475), [#479](https://github.com/aontu-lang/aontu/issues/479) | Ruling 44 answers [#472](https://github.com/aontu-lang/aontu/issues/472) and [#475](https://github.com/aontu-lang/aontu/issues/475). [#479](https://github.com/aontu-lang/aontu/issues/479) gives a miss of `at` under `maybe` its rule (ruling 2), and ruling 40 adds the fallback. [#474](https://github.com/aontu-lang/aontu/issues/474) lands before ST1. |
| Generators, folds and trials | [#527](https://github.com/aontu-lang/aontu/issues/527), [#743](https://github.com/aontu-lang/aontu/issues/743), [#751](https://github.com/aontu-lang/aontu/issues/751), [#754](https://github.com/aontu-lang/aontu/issues/754), [#783](https://github.com/aontu-lang/aontu/issues/783), [#786](https://github.com/aontu-lang/aontu/issues/786), [#812](https://github.com/aontu-lang/aontu/issues/812), [#818](https://github.com/aontu-lang/aontu/issues/818), [#892](https://github.com/aontu-lang/aontu/issues/892), [#894](https://github.com/aontu-lang/aontu/issues/894), [#895](https://github.com/aontu-lang/aontu/issues/895) | C6 holds [#754](https://github.com/aontu-lang/aontu/issues/754). Rulings 42, 43 and 46 answer [#892](https://github.com/aontu-lang/aontu/issues/892), [#895](https://github.com/aontu-lang/aontu/issues/895) and [#751](https://github.com/aontu-lang/aontu/issues/751), and ruling 50 answers [#786](https://github.com/aontu-lang/aontu/issues/786) and [#894](https://github.com/aontu-lang/aontu/issues/894). [#783](https://github.com/aontu-lang/aontu/issues/783) and [#786](https://github.com/aontu-lang/aontu/issues/786) land before C3 and C5, which count levels as `key(up?)` does. |
| Declarations, loads, includes and built-in models | [#517](https://github.com/aontu-lang/aontu/issues/517), [#518](https://github.com/aontu-lang/aontu/issues/518), [#616](https://github.com/aontu-lang/aontu/issues/616), [#658](https://github.com/aontu-lang/aontu/issues/658), [#731](https://github.com/aontu-lang/aontu/issues/731), [#734](https://github.com/aontu-lang/aontu/issues/734), [#738](https://github.com/aontu-lang/aontu/issues/738), [#805](https://github.com/aontu-lang/aontu/issues/805) | Ruling 49 answers [#517](https://github.com/aontu-lang/aontu/issues/517), and ruling 50 answers [#518](https://github.com/aontu-lang/aontu/issues/518) and the sites of [#658](https://github.com/aontu-lang/aontu/issues/658) and [#734](https://github.com/aontu-lang/aontu/issues/734). [#731](https://github.com/aontu-lang/aontu/issues/731) lands before the readers of ruling D: a `.csv` or `.jsonl` file has a list at its root. [#658](https://github.com/aontu-lang/aontu/issues/658) lands before the bundled model of BT4. |
| subsume and breaking | [#321](https://github.com/aontu-lang/aontu/issues/321), [#387](https://github.com/aontu-lang/aontu/issues/387), [#424](https://github.com/aontu-lang/aontu/issues/424), [#735](https://github.com/aontu-lang/aontu/issues/735), [#774](https://github.com/aontu-lang/aontu/issues/774) | [#774](https://github.com/aontu-lang/aontu/issues/774) meets HV1: `breaking` under an unbound variable has to give a finding. |
| Scalars and generated output | [#319](https://github.com/aontu-lang/aontu/issues/319), [#395](https://github.com/aontu-lang/aontu/issues/395), [#756](https://github.com/aontu-lang/aontu/issues/756), [#825](https://github.com/aontu-lang/aontu/issues/825) | [#825](https://github.com/aontu-lang/aontu/issues/825)'s rename lands before the baseline of part 9, or as the first entry of its table. [#756](https://github.com/aontu-lang/aontu/issues/756) lands before ST1. |
| Parser limits | [#325](https://github.com/aontu-lang/aontu/issues/325), [#326](https://github.com/aontu-lang/aontu/issues/326) | The pins of ruling A fix [#325](https://github.com/aontu-lang/aontu/issues/325) and not [#326](https://github.com/aontu-lang/aontu/issues/326): see [What the pins do to the parser issues](#what-the-pins-do-to-the-parser-issues). |
| Diagnostics: sites, messages and frames | [#313](https://github.com/aontu-lang/aontu/issues/313), [#324](https://github.com/aontu-lang/aontu/issues/324), [#327](https://github.com/aontu-lang/aontu/issues/327), [#328](https://github.com/aontu-lang/aontu/issues/328), [#331](https://github.com/aontu-lang/aontu/issues/331), [#332](https://github.com/aontu-lang/aontu/issues/332), [#333](https://github.com/aontu-lang/aontu/issues/333), [#391](https://github.com/aontu-lang/aontu/issues/391), [#457](https://github.com/aontu-lang/aontu/issues/457), [#685](https://github.com/aontu-lang/aontu/issues/685), [#755](https://github.com/aontu-lang/aontu/issues/755), [#772](https://github.com/aontu-lang/aontu/issues/772), [#775](https://github.com/aontu-lang/aontu/issues/775) | Ruling 50 answers [#313](https://github.com/aontu-lang/aontu/issues/313), [#328](https://github.com/aontu-lang/aontu/issues/328), [#332](https://github.com/aontu-lang/aontu/issues/332), [#333](https://github.com/aontu-lang/aontu/issues/333) and [#331](https://github.com/aontu-lang/aontu/issues/331), and the sites of [#755](https://github.com/aontu-lang/aontu/issues/755). [#313](https://github.com/aontu-lang/aontu/issues/313) lands before C4, since `range` becomes the name of a built-in and TypeScript's headline uses the word. |
| Tooling: coverage, LSP, CLI, playground, docs | [#318](https://github.com/aontu-lang/aontu/issues/318), [#320](https://github.com/aontu-lang/aontu/issues/320), [#322](https://github.com/aontu-lang/aontu/issues/322), [#340](https://github.com/aontu-lang/aontu/issues/340), [#732](https://github.com/aontu-lang/aontu/issues/732), [#733](https://github.com/aontu-lang/aontu/issues/733), [#747](https://github.com/aontu-lang/aontu/issues/747), [#789](https://github.com/aontu-lang/aontu/issues/789), [#814](https://github.com/aontu-lang/aontu/issues/814) | Part 3 takes [#320](https://github.com/aontu-lang/aontu/issues/320) with LS1, and LS4 formats as `fmt` does, so [#747](https://github.com/aontu-lang/aontu/issues/747) lands before it. The review of [#340](https://github.com/aontu-lang/aontu/issues/340) takes in the options of HV1, of LV3 and of the output flag, so that each is named once and means one thing on every verb. |
| The definition | [#403](https://github.com/aontu-lang/aontu/issues/403), [#432](https://github.com/aontu-lang/aontu/issues/432), [#829](https://github.com/aontu-lang/aontu/issues/829) | Nothing in this plan bears on these. |

### The 28 newer issues

| Issue | What it is | Workstream | Resolved by |
|---|---|---|---|
| [#840](https://github.com/aontu-lang/aontu/issues/840) | vet names a conflict with a taken name's body in TypeScript and with the literal beside it in Go | Diagnostics | TypeScript |
| [#841](https://github.com/aontu-lang/aontu/issues/841) | an `export_arg` refusal in an included file is framed in a different file by each port | Declarations, loads, includes | the site rule of ruling 50 |
| [#842](https://github.com/aontu-lang/aontu/issues/842) | a file that holds a destructure head, included under a key, is refused, differently by each port | Declarations, loads, includes | ruling 36, as RP2 of part 8 |
| [#845](https://github.com/aontu-lang/aontu/issues/845) | a value loaded under a key is framed at the `@` in TypeScript and in its own file in Go | Declarations, loads, includes | the site rule of ruling 50 |
| [#846](https://github.com/aontu-lang/aontu/issues/846) | a parse error after a source's last newline draws its caret a line lower in Go | Diagnostics | TypeScript |
| [#847](https://github.com/aontu-lang/aontu/issues/847) | `filter` and `match` miss a default inside a map | Generators, folds and trials | ruling 39 |
| [#848](https://github.com/aontu-lang/aontu/issues/848) | `esc` and `usc` have no convention for Markdown | Scalars and generated output | ruling 41 |
| [#849](https://github.com/aontu-lang/aontu/issues/849) | no rule can fall back when a member's field is absent | Scalars and generated output | ruling 40, with [#465](https://github.com/aontu-lang/aontu/issues/465) |
| [#850](https://github.com/aontu-lang/aontu/issues/850) | a `match` whose result is a relative reference overflows the TypeScript stack | Generators, folds and trials | C6 of part 1 |
| [#852](https://github.com/aontu-lang/aontu/issues/852) | an unbound variable step in a path is refused nine times in TypeScript and once in Go | Diagnostics | TypeScript reports once, as Go does |
| [#853](https://github.com/aontu-lang/aontu/issues/853) | a chain of 5,000 paths overflows the TypeScript unifier and is reported as `internal` | Parser limits | with [#325](https://github.com/aontu-lang/aontu/issues/325) |
| [#857](https://github.com/aontu-lang/aontu/issues/857) | a flattened meet clashes two narrowed defaults before their bounds apply | Preferences and disjunction arms | the definition's reading, decision 43 |
| [#858](https://github.com/aontu-lang/aontu/issues/858) | both language servers report a conflict once for each path that copies it | Tooling | LS1 of part 3 |
| [#859](https://github.com/aontu-lang/aontu/issues/859) | hover labels a recursive position differently in each server | Tooling | LS2 of part 3 |
| [#860](https://github.com/aontu-lang/aontu/issues/860) | `trim --check` examines nothing below a key stated twice, an explicit `&` or a call | Tooling | its own fix, then LS8 of part 3 |
| [#861](https://github.com/aontu-lang/aontu/issues/861) | no direct keyed projection of one field of each member | Generators, folds and trials | C1 and C2 of part 1 |
| [#862](https://github.com/aontu-lang/aontu/issues/862) | the command line can't bind `$name` | Tooling | HV1 of part 6 |
| [#866](https://github.com/aontu-lang/aontu/issues/866) | a `deprecated` finding on a preference is sited a column apart in the two ports | Diagnostics | TypeScript |
| [#868](https://github.com/aontu-lang/aontu/issues/868) | a `match` whose pattern is a relative reference overflows the TypeScript stack | Generators, folds and trials | C6 of part 1 |
| [#869](https://github.com/aontu-lang/aontu/issues/869) | two pages count 68 built-ins where 72 are declared | Tooling | a test that holds the count to the signature table |
| [#870](https://github.com/aontu-lang/aontu/issues/870) | a call refused at parse is silent inside a trial | Generators, folds and trials | ruling 38, as C6 of part 1 |
| [#871](https://github.com/aontu-lang/aontu/issues/871) | `maybe()` as a later argument of a call never resolves in TypeScript | Generators, folds and trials | C6 of part 1 |
| [#876](https://github.com/aontu-lang/aontu/issues/876) | a syntax error inside an included data file is reported in the including file | Declarations, loads, includes | the site rule of ruling 50 |
| [#881](https://github.com/aontu-lang/aontu/issues/881) | a language version stated in each source file | this plan | part 9 |
| [#884](https://github.com/aontu-lang/aontu/issues/884) | `$` as the root of the current source file, and `$$` as the global root | this plan | part 8 |
| [#886](https://github.com/aontu-lang/aontu/issues/886) | more scalar types, by the convention of `path()` | this plan | part 10 |
| [#887](https://github.com/aontu-lang/aontu/issues/887) | a `vet` site for a value from an included data file names a different file in each port | Declarations, loads, includes | the site rule of ruling 50 |
| [#889](https://github.com/aontu-lang/aontu/issues/889) | adjacent invalid UTF-8 sequences are replaced differently by the two ports | Declarations, loads, includes | ruling 47 |

Three of these close with a task of an earlier part and need no fix of
their own: [#861](https://github.com/aontu-lang/aontu/issues/861) with
C1 and C2, [#862](https://github.com/aontu-lang/aontu/issues/862) with
HV1, and [#869](https://github.com/aontu-lang/aontu/issues/869) with the
test that holds the count, which every built-in of this plan would
otherwise make stale again.

### What the pins do to the parser issues

The issue plan asks that the two parser issues be tried against the
newer `@tabnas/expr` before its pin moves. Ruling A of
[IO-FORMATS.0.md](IO-FORMATS.0.md#the-rulings) raises every pin. Both
issues were run on a scratch copy of `main` with all sixteen pins
raised, `@tabnas/expr` from 0.5.10 to 0.6.4:

| Issue | At the pins | With the pins raised |
|---|---|---|
| [#325](https://github.com/aontu-lang/aontu/issues/325), a chain of 1,950 members | TypeScript overflows its stack | `disjunct_no_gen`, as Go answers |
| the same, 2,000 members | TypeScript overflows | `max_depth`, as Go answers |
| the same, a dotted path of 5,000 steps | TypeScript overflows | `no_path`, as Go answers |
| [#326](https://github.com/aontu-lang/aontu/issues/326), `neq(-1, -2, -3)` | TypeScript overflows, at once | TypeScript runs out of memory after about fifty seconds; Go answers as before |

So the pins close #325, and they make #326 worse: a refusal that came at
once becomes a process that takes the machine's memory. The Go engine at
the raised pins answers `neq(-3,-2,-1)`. The fault is in the TypeScript
`@tabnas/expr` at 0.6.4.

### The tasks of part 11

Most of this part is the issues themselves, each fixed in its workstream
by the ruling beside it. Three tasks belong to no issue, and two of
them are done:

| ID | Task | Kind | Waits on | Size |
|---|---|---|---|---|
| IS1 | Give each of the 28 issues above its row in a workstream of `admin/issue-plan.md`, with its kind, its size and its ledger rows, and bring that plan's counts and its statement on the parser issues up to date. Done 2026-11-22: 25 are in seven of its workstreams and three in a new one, none has a ledger row, and every open issue has one row there | docs | nothing | S |
| IS2 | Enter rulings 38, 39 and 44 to 49 in section 7 of [`sketch/DEFINITION.0.md`](DEFINITION.0.md) as decisions of the definition. Rulings 42 and 43 are there already, as its decisions 74 and 76, and the `nil` of #894 as its decision 75. Done 2026-11-22, as its decisions 77 to 84: each says what both engines answer today, which was run in both, and what moves. No generated row holds any of them yet, so the rows land with each fix | definition | nothing | M |
| IS3 | Before the pins rise: a release of `@tabnas/expr` that reads `neq(-1, -2, -3)`, or a guard in the TypeScript engine that refuses the input, with the shared row #326 asks for | fix | nothing | S |

IS3 comes before the task that raises the pins. IS2 is how a ruling made
here reaches the workstream that builds it: the rulings of this plan are
numbered here, and a decision of the definition has its own number
there. The pairs are 38 and 77, 39 and 78, 44 and 79, 45 and 80, 46 and
81, 47 and 82, 48 and 83, and 49 and 84.

### Questions for the ruling on part 11

Each was raised by an issue, and each ruling unblocks the issues named.

38. **An unknown call inside a trial**,
    [#870](https://github.com/aontu-lang/aontu/issues/870). Ruled
    2026-11-22: refused wherever it stands, since it is decided when the
    document is read, as an unbound `_` is. `maybe` forgives a missing
    referent and never an unknown function. The other choice read it as
    a call that can't be made, which admits nothing in silence. The
    definition records it as its decision 77.
39. **A default inside a map, read by a trial**,
    [#847](https://github.com/aontu-lang/aontu/issues/847). Ruled
    2026-11-22: the trial reads the value the member generates, as it
    already does for a default at the top of a scrutinee. The others
    answered `incomplete`, or kept today's reading, the member as
    written. The definition records it as its decision 78.
40. **A fallback for an absent field**,
    [#849](https://github.com/aontu-lang/aontu/issues/849). Ruled
    2026-11-22: `maybe(v, fallback)`, a second argument that `maybe`
    answers where `v` is absent. The others were a new built-in,
    `first(a, b, …)`, or both.
41. **Markdown conventions for `esc` and `usc`**,
    [#848](https://github.com/aontu-lang/aontu/issues/848). Ruled
    2026-11-22: `md`, `mdcell` and `mdcode`. The recommendation was the
    first two, and the other choice none.
42. **A conflict below the top of an argument read against a value**,
    [#892](https://github.com/aontu-lang/aontu/issues/892), the
    definition's decision 74. Ruled 2026-11-22: the whole argument
    admits nothing, as both engines answer, and the definition moves.
    The other reading left the conflict where it is written. The
    definition records this under that number.
43. **A path in `must`'s condition into the value under trial**,
    [#895](https://github.com/aontu-lang/aontu/issues/895), the
    definition's decision 76. Ruled 2026-11-22: the path reads the field
    as the data settles it, as the definition's decision 63 rules for
    `match`. The other reading made it an error in the schema. The
    definition records this under that number.
44. **A key that holds a dot, in an address**,
    [#472](https://github.com/aontu-lang/aontu/issues/472),
    [#475](https://github.com/aontu-lang/aontu/issues/475) and
    [#810](https://github.com/aontu-lang/aontu/issues/810). Ruled
    2026-11-22: a quoted segment, `$.a."x.y"`, which `path()`,
    `relate()`, `reaches` and a reference read back as one step. The
    other choice refused such a key. The definition records it as its
    decision 79.
45. **`*(` before a literal map or list**,
    [#349](https://github.com/aontu-lang/aontu/issues/349). Ruled
    2026-11-22: a preference, as `*(3)` is. The other choice refused it
    inside a disjunction too. The definition records it as its decision
    80.
46. **A generator over the bag that holds it**,
    [#751](https://github.com/aontu-lang/aontu/issues/751). Ruled
    2026-11-22: it reads the members of its own bag where what it reads
    doesn't depend on its own result, and a true cycle is refused and
    named as one. The other choice refused every such document, with a
    code that names the cycle. The definition records it as its decision
    81.
47. **A file that is not valid UTF-8**,
    [#889](https://github.com/aontu-lang/aontu/issues/889). Ruled
    2026-11-22: refused, with one code in both engines that names the
    file and the byte. The other choice replaced each invalid sequence
    by one rule in both. The definition records it as its decision 82.
48. **A relation's template in a copy**,
    [#779](https://github.com/aontu-lang/aontu/issues/779). Ruled
    2026-11-22: held in one form wherever the relation is copied, so
    canon prints one spelling. Canon text and hashes change for a
    document that holds such a relation. The other choice taught
    `subsume` to read the two forms as one. The definition records it as
    its decision 83.
49. **A set of names written without commas**,
    [#517](https://github.com/aontu-lang/aontu/issues/517). Ruled
    2026-11-22: `export` and a destructure head read it as the comma
    form, as a value does. The other choice refused it there. The
    definition records it as its decision 84.
50. **The small ones.** Ruled 2026-11-22: each takes the answer the
    repository's standing rules give it, with one exception.
    - TypeScript's reading, where the engines differ and nothing rules:
      the fold order of
      [#328](https://github.com/aontu-lang/aontu/issues/328), the paths
      of [#332](https://github.com/aontu-lang/aontu/issues/332) and
      [#333](https://github.com/aontu-lang/aontu/issues/333), the parse
      of [#518](https://github.com/aontu-lang/aontu/issues/518), and
      `key(n)` in a `replace` value,
      [#786](https://github.com/aontu-lang/aontu/issues/786).
    - The exception is the headline of
      [#313](https://github.com/aontu-lang/aontu/issues/313). Its word
      is `resolve`, which is Go's and is what every other refusal of an
      argument says, so TypeScript moves. The question listed it under
      TypeScript's reading in error: TypeScript says `range`. The word
      put to the maintainer, and accepted, was `resolve`.
    - The definition's reading, where it has one: the marked `nil` of
      [#540](https://github.com/aontu-lang/aontu/issues/540), by its
      decision 18, and the `nil` in `must` of
      [#894](https://github.com/aontu-lang/aontu/issues/894), by its
      decision 54, which its decision 75 now records for `must`.
    - A value from an included file is sited in its own file, as the API
      reference says:
      [#331](https://github.com/aontu-lang/aontu/issues/331),
      [#845](https://github.com/aontu-lang/aontu/issues/845),
      [#887](https://github.com/aontu-lang/aontu/issues/887),
      [#876](https://github.com/aontu-lang/aontu/issues/876),
      [#841](https://github.com/aontu-lang/aontu/issues/841),
      [#734](https://github.com/aontu-lang/aontu/issues/734),
      [#755](https://github.com/aontu-lang/aontu/issues/755),
      [#658](https://github.com/aontu-lang/aontu/issues/658) and
      [#320](https://github.com/aontu-lang/aontu/issues/320).

## The order across parts

1. **The questions.** P0 and the rounds of parts 8 to 11 are done.
   Nothing in any part waits on a ruling now.
2. **What stands on nothing.** C6 and C7 of part 1, CG1 and CG2, LS1,
   LS4 and LS9, and IS3. IS1 and IS2 are done. The workstreams of the
   issue plan run beside all of it.
3. **The small and visible.** HV1, then KP1, then BT1, with the
   fallback of ruling 40 and the Markdown conventions of ruling 41.
   Each is one change in both ports.
4. **Before a built-in that reads a key or counts a level.** The
   issues on `key()` that part 11 names land before C3 and C5.
5. **Roots, then versions, then types.** RP1, then LV1, then ST1: the
   baseline of part 9 is fixed after `$` changes, and the kinds of
   part 10 need a file's version.
6. **The language server on LS1**, in the order of its table.
7. **The guide, CG4**, once the corpus holds its examples. Every other
   part's documentation task then adds its row to it.
8. **The pins.** IS3 comes before the task that raises them.

Part 5 has no place in this order: OpenAPI is deferred by ruling. Part
1 keeps its own [order](#order).

## What stays outside

These findings of the comparison are not taken up by this plan:

| Finding | Where it stands |
|---|---|
| OpenAPI import and export | deferred by ruling on 2026-11-21, to be added separately. [Part 5](#part-5-openapi) holds what was found |
| YAML, TOML and the other formats, in and out | ruled on 2026-11-21, in [IO-FORMATS.0.md](IO-FORMATS.0.md#the-rulings) |
| A package repository that serves | M6 of [CONFIG-LANGUAGES-PLAN.0.md](CONFIG-LANGUAGES-PLAN.0.md) |
| Type generation for a host language | L9 of that plan |
| Bindings beyond TypeScript and Go | L7 of that plan |
| A guide for JSON Schema users | the second half of its H3 |
| A `trim` that rewrites | in no plan. [#860](https://github.com/aontu-lang/aontu/issues/860), what `trim --check` examines, is placed in part 11 |
| Protobuf | in no plan. tabnas reads `.proto`, so reading could follow the readers that ruling D adds |
| A standard library: time, network addresses, hashes, number and text conversion | in no plan |
| A package of several files as the unit | in no plan |

The decisions that rule out CUE's other features are listed in the
comparison, under
[What this suggests for aontu](CUE-COMPARISON.0.md#what-this-suggests-for-aontu).

## Done when, for parts 2 to 11

- **Part 2:** every probe is held on both sides, and the guide prints
  no line that a test doesn't hold.
- **Part 3:** each request in the table of part 3 gets an answer from
  both servers, and the same one.
- **Part 4:** the pattern example has a spelling of one call whose
  canon is today's.
- **Part 5:** deferred by ruling, so nothing here is owed.
- **Part 6:** the document of #862 evaluates, vets and hashes from the
  command line in both ports.
- **Part 7:** `text` and `back` have spellings, and a 64-bit integer
  has a name.
- **Part 8:** a file included under a key answers its own `$` paths,
  and the document of #842 evaluates in both engines.
- **Part 9:** a file written for the baseline answers the same after a
  change of meaning lands, and its rewritten copy has the same hash.
- **Part 10:** in a file of the new version `date("2026-11-21")` is a
  value of the kind `date`, and `semver("1.10.0")` sorts after
  `semver("1.9.0")`.
- **Part 11:** each open issue is closed or has its ruling built, and
  `admin/issue-plan.md` places every one.
