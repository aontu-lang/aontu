# How-to guides

Focused recipes for specific tasks. Each assumes you already know the
basics from the [Tutorial](tutorial.md); for exhaustive rules see the
[Language reference](reference-language.md) and
[API reference](reference-api.md).

- [Run a file or start a REPL from the command line](#run-a-file-or-start-a-repl-from-the-command-line)
- [Call Aontu from TypeScript](#call-aontu-from-typescript)
- [Call Aontu from Go](#call-aontu-from-go)
- [See the canonical form instead of JSON](#see-the-canonical-form-instead-of-json)
- [Validate data against a schema](#validate-data-against-a-schema)
- [Check that a schema change breaks nobody](#check-that-a-schema-change-breaks-nobody)
- [Ask what a document says at one path](#ask-what-a-document-says-at-one-path)
- [Find out why a value came out the way it did](#find-out-why-a-value-came-out-the-way-it-did)
- [Change a value without editing the file](#change-a-value-without-editing-the-file)
- [Find entries that are doing nothing](#find-entries-that-are-doing-nothing)
- [Check that components agree about their relations](#check-that-components-agree-about-their-relations)
- [Provide defaults that callers can override](#provide-defaults-that-callers-can-override)
- [Apply one template to many keys](#apply-one-template-to-many-keys)
- [Constrain every element of a list](#constrain-every-element-of-a-list)
- [Forbid unexpected keys](#forbid-unexpected-keys)
- [Make a field optional](#make-a-field-optional)
- [Reference and reshape other parts of the document](#reference-and-reshape-other-parts-of-the-document)
- [Split a model across files](#split-a-model-across-files)
- [Vendor a dependency closure for an offline build](#vendor-a-dependency-closure-for-an-offline-build)
- [Pin what a document means](#pin-what-a-document-means)
- [Inject values from the host program](#inject-values-from-the-host-program)
- [Keep schema/helper fields out of the output](#keep-schemahelper-fields-out-of-the-output)
- [Give an agent an entrypoint to a definition](#give-an-agent-an-entrypoint-to-a-definition)
- [Collect errors instead of throwing](#collect-errors-instead-of-throwing)
- [Read a conflict error](#read-a-conflict-error)

---

## Run a file or start a REPL from the command line

Both implementations ship an `aontu` command (full options in the
[API reference](reference-api.md#command-line-interface)).

```sh
aontu config.aontu              # evaluate a file → pretty JSON
aontu --canon config.aontu      # → canonical form instead
echo 'a:1 b:$.a' | aontu        # read source from stdin
aontu                           # no file on a terminal → REPL
```

In the REPL each line is evaluated and printed; `:canon`/`:json` switch
output mode and `:quit` (or Ctrl-D) exits:

```
$ aontu
Aontu v0.53.0 REPL — :help for commands, :quit to exit
aontu> a:*1|number
{
  "a": 1
}
aontu> :quit
```

`:load <file>` holds a document so `:get`, `:keys` and `:why` can
question it, and `--jsonl` drops the banner and the prompt and answers
one JSON line per command, so a harness can drive the session the way
it drives the CLI (full table in the
[API reference](reference-api.md#command-line-interface)).

Get the command with `npm i -g aontu` (or `npx aontu`) for Node, or
`go install github.com/rjrodger/aontu/go/cmd/aontu@latest` for Go. From a
clone, use `node ts/bin/aontu.js …` or `go run ./cmd/aontu …`.

## Call Aontu from TypeScript

```ts
import { Aontu } from 'aontu'

const aontu = new Aontu()

aontu.generate('a: 1 b: $.a')   // → { a: 1, b: 1 }   (plain JS value)
aontu.unify('a: *1 | number')   // → Val; .canon is '{"a":*1|number}'
aontu.parse('a: number')        // → Val AST, not yet unified
```

`generate` throws an `AontuError` on conflict or if the result is not
fully concrete. Use `unify(...).canon` when you want to *see* an
unresolved or schema-bearing result rather than a final value.

## Call Aontu from Go

```go
import aontu "github.com/rjrodger/aontu/go"

a := aontu.New()

out, err := a.Generate("a: 1 b: $.a")   // out = map[a:1 b:1], err = nil
v,   err := a.Unify("a: *1 | number")   // v.Canon() == `{"a":*1|number}`
v,   err  = a.Parse("a: number")        // AST, not yet unified
```

`Generate`/`Unify` return an `error` instead of throwing; check it.

## See the canonical form instead of JSON

Reach for [`canon`](reference-language.md#canonical-form) when you want
to see what a model *means* rather than what it resolves to:

```ts
aontu.unify('a: *1 | number').canon   // '{"a":*1|number}'
aontu.unify('a: 1 a: number').canon   // '{"a":1}'
```

```go
a.Unify("a: *1 | number")   // .Canon() == `{"a":*1|number}`
```

`generate` on `a: *1 | number` returns `{a:1}`; `canon` keeps the whole
default/disjunction so you can see the shape.

A conflict throws before there is anything to read, so ask for it with
`collect: true`, and the failed path reads `nil`:

```ts
aontu.unify('a: number a: string', { collect: true }).canon  // '{"a":nil}'
```

From the command line the same view is `aontu --canon file.aon`.

## Validate data against a schema

Write the schema as types, then unify the data on top. A fit narrows to
the data; a misfit errors.

```aontu
# schema
user: { id: integer, name: string, admin: boolean }
# data
user: { id: 7, name: ada, admin: true }
```

→ `{ "user": { "admin": true, "id": 7, "name": "ada" } }`  (keys sort)

Supplying `id: "seven"` instead fails with
`Cannot unify value: "seven" with value: integer`. To reject *extra*
fields too, wrap the schema in [`close`](#forbid-unexpected-keys).

**When the data lives in its own file**, use the `vet` verb rather than
concatenating the two — it keeps the files apart, so every finding says
which side it came from, and it answers with a verdict rather than a
bare failure:

```sh
$ aontu vet schema.aon user.json
verdict: invalid

$.user.id: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.user.id
  data: user.json:1:15 ("seven")
  schema: schema.aon:1:13 (integer)
$ echo $?
1
```

Drop `id` from the data instead and the verdict is different, because
nothing contradicts — the truth is simply not met yet:

```sh
$ aontu vet schema.aon user2.json
verdict: incomplete

$.user.id: mapval_no_gen [incomplete]
  [aontu/mapval_no_gen]: Cannot resolve value at path $.user.id
  schema: schema.aon:1:13 (integer)
$ echo $?
3
```

The exit code distinguishes *the data does not hold* (1) — a
contradiction, or a document that would not parse — from *not yet
complete* (3) from *the truth you were given is unusable* (4), and
`--format json` emits the same report for a program to read. See
[`aontu vet`](reference-api.md#aontu-vet).

**In CI**, the repository ships a GitHub Action wrapping the verb —
[`rjrodger/aontu/vet-action`](../vet-action/README.md) — which fails
the job by verdict class and can emit SARIF
(`--format sarif`) for GitHub code scanning. As a **pre-commit hook**,
the verb is one line, and the verdict classes mean a half-finished
document blocks the commit too:

```sh
#!/bin/sh
# .git/hooks/pre-commit
exec aontu vet service.aon deploy.json
```

**While editing**, `--watch` re-runs the vet whenever the schema or a
data file changes, streaming one report per run:

```sh
$ aontu vet --watch service.aon deploy.json
```

## Check that a schema change breaks nobody

`vet` answers "does this data hold?"; `breaking` answers "do documents
that were valid against the old version still hold?". Point it at an
earlier version of the same file — a path, or `git#<rev>` (see
[`aontu breaking`](reference-api.md#aontu-breaking)):

```sh
$ aontu breaking --against git#main service.aon
verdict: breaking

$.service.owner: compat_required_added [compat]
  the general value requires this key; the specific value admits instances without it
  expected: string
  actual:   {"name":string,"replicas":*1|integer}
  general: service.aon:3:10 (string)
  specific: git#main:1:10 ({"name":string,"replicas":*1|integer})
$ echo $?
1
```

Exit `1` means a v1-valid document is now rejected; `3` means the
query could not decide (a `sub_*` reason says why), and fails the gate
unless you pass `--allow-undecided`. In CI, one line gates every pull
request against the branch it merges into:

```yaml
- run: aontu breaking --against git#origin/main service.aon
```

The underlying query is also a verb of its own — `aontu subsume
general.aon specific.aon` — and a library export (`subsume` /
`aontu.Subsume`) for programmatic gates.

## Ask what a document says at one path

Print one node instead of the whole file. The path is what a reference
means by `$.a.b` (see [`aontu get`](reference-api.md#aontu-get)). Given
`system.aon`:

```aontu
services: {
  &: { replicas: *1 | integer, tier: *standard | string }
  auth:    { replicas: 3 }
  billing: { tier: premium }
}
```

```sh
$ aontu get '$.services.auth' system.aon
{
  "replicas": 3,
  "tier": "standard"
}
```

Three flags give a *smaller* answer rather than a smaller slice — the
keys, the shape with concrete leaves lifted to their kinds, and the
structure cut off at a depth:

```sh
$ aontu get '$.services' --keys system.aon
auth
billing

$ aontu get '$.services.auth' --types system.aon
{"replicas":integer,"tier":*string|string}

$ aontu get '$' --depth 1 --canon system.aon
{"services":top}
```

`--depth` needs `--canon` or `--types`, because JSON has no way to
write `top`. A path that names nothing exits `1` and guesses:

```sh
$ aontu get '$.services.authz' system.aon
$.services.authz: no_path [reference]
  The path $.services.authz names nothing in this document.
  note: did you mean auth?
$ echo $?
1
```

## Find out why a value came out the way it did

`aontu why` lists every value the author *wrote* that met at a path, in
source order, with the site each was written at:

```sh
$ aontu why '$.services.auth.replicas' system.aon
$.services.auth.replicas = 3
  1. *1|integer  system.aon:2:18  (spread)
  2. 3  system.aon:3:24
```

A role in brackets marks a contribution that arrived indirectly — here
`(spread)`, the `&:` template at line 2. A plain literal, like line 3,
carries none. A path nobody wrote to says so, rather than failing:

```sh
$ aontu why '$.services.billing.replicas' system.aon
$.services.billing.replicas = *1|integer
  (no contributions: nothing met at this path)
```

Use `--format json` for the record a program can branch on
([`aontu why`](reference-api.md#aontu-why)).

## Change a value without editing the file

`aontu set` appends the change to an *overlay* file and unifies it with
the entry document, so nothing is rewritten and no formatting is lost:

```sh
$ aontu set '$.services.billing.replicas=2' \
    --entry system.aon --overlay overlay.aon
verdict: valid
wrote: overlay.aon
```

`overlay.aon` now holds one path-flattened conjunct, and the two files
together are the changed document:

```sh
$ cat overlay.aon
"services": "billing": "replicas": 2
```

```aontu
# all.aon
@"./system.aon"
@"./overlay.aon"
```

→ `{ "services": { "auth": { "replicas": 3, "tier": "standard" },
"billing": { "replicas": 2, "tier": "premium" } } }`

**A pinned value cannot be set.** The overlay is written only when the
change holds, so a refused change leaves the file untouched, and the
finding names the site doing the pinning:

```sh
$ aontu set '$.services.auth.replicas=5' \
    --entry system.aon --overlay overlay.aon
verdict: invalid

$.services.auth.replicas: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.services.auth.replicas
  data: overlay.aon:2:33 (5)
  schema: system.aon:3:24 (3)
$ echo $?
1
```

That `system.aon:3:24` is contribution 2 from the `why` recipe above.
Exit codes are [`vet`](reference-api.md#aontu-vet)'s verdict classes,
and `--dry-run` writes nothing (with `--format json`, printing the
overlay it would have written).

## Change a value that is already pinned

`--in-place` rewrites the literal **where the author wrote it**, instead
of appending a line that contradicts it. That closes the repair loop:
what used to be *set → conflict → why → edit it yourself* is now one
command.

```sh
$ cat deploy.aon
# the deployment
replicas: 42   # too many

$ aontu set '$.replicas=5' --entry schema.aon --overlay deploy.aon --in-place
verdict: valid
replaced: deploy.aon:2:11 42 -> 5
wrote: deploy.aon

$ cat deploy.aon
# the deployment
replicas: 5   # too many
```

**Comments and layout survive**, including the one on the edited line,
because nothing is re-serialised: the span at `(row, col, len)` is
replaced and every other byte is left exactly as it was.

**The edit is verified before it is written.** A site carries `src`, the
source text it claims to cover, so the text at the span is checked
against it first — which is what makes `port: 0x1F` safe to rewrite even
though its *value* is `31`:

```sh
$ aontu set '$.port=80' --entry schema.aon --overlay ports.aon --in-place
verdict: valid
replaced: ports.aon:1:7 0x1F -> 80
```

**Where it cannot rewrite, it appends as usual and says why.** It is
never worse than plain `set`; a refusal costs you a warning, not a
verdict:

| the overlay says | why not | what happens |
|---|---|---|
| `a: min(1)`, `a: 1+2`, `a: {b:1}` | the site names the opening token of a compound, not the whole value | appended, `patch_not_editable` |
| `a: 1` twice | two statements pin it; there is no single place to edit | appended, `patch_ambiguous` |
| a `&:` template, a `$ref` | the value comes from elsewhere; edit it there | appended, `patch_not_editable` |
| `a: integer`, `a: above(0)` | a constraint, not a pin — appending narrows it without discarding it | appended, `patch_not_editable` |
| anything, when the overlay itself `@"includes"` another document | a loaded literal's position cannot be told from the overlay's own | appended, `patch_not_editable` |

A default (`a: *1`) is not in the table: appending already overrides it
correctly, so `--in-place` leaves it alone and says nothing.

**An overlay that loads another document cannot be edited in place at
all.** That looks strict until you see what it prevents: an include
holding `a: 42` at row 1 column 4, and the overlay holding `x: 42` at
row 1 column 4. The site is real and the text at the span really is
`42`, so the verification passes — and a splice that trusted it would
rewrite `x` while reporting a replacement of `$.a`. Denying loads
removes the ambiguity at its source rather than trying to detect it:
what resolves is what the overlay says by itself.

Rewriting a file is not reversible the way appending to one is, which
is why it is opt-in. Pair it with `--dry-run` to see the rewritten
overlay without writing it — and note that when a run is refused as a
whole, any edit it *could* have made is reported as `would replace:`
rather than `replaced:`, because the file was not touched.

## Find entries that are doing nothing

`aontu trim --check` deletes each map entry in turn, re-evaluates, and
reports the ones that made no difference:

```aontu
services: {
  &: { tier: standard }
  auth:    { tier: standard, replicas: 3 }
  billing: { replicas: 1 }
}
```

```sh
$ aontu trim --check services.aon
verdict: redundant

$.services.auth.tier
$ echo $?
1
```

`auth.tier` is already implied by the `&:` template. Exit `0` is
`verdict: clean`, so the verb gates a lint job as it stands;
`--format json` gives the paths as an array. List elements are never
candidates — removing one renumbers the rest. `--check` is required:
see [`aontu trim`](reference-api.md#aontu-trim).

## Check that components agree about their relations

Acyclicity and inverse consistency are facts about a *finished* model,
not constraints unification can carry, so they are a separate pass over
the `relations` key of the root (see
[declared relations](reference-language.md#declared-relations)):

```aontu
@"std/system"

relations: {
  dependsOn: $.std.Relation & { inverse: usedBy, acyclic: true }
}

services: {
  auth:    id(svc/auth)    & { dependsOn: [&: refer(), svc/billing] }
  billing: id(svc/billing) & {}
}
```

Evaluating that document succeeds — nothing contradicts. The verb is
what notices `billing` never named `auth` back:

```sh
$ aontu relations topology.aon
verdict: fail

$.services.auth.dependsOn.0  dependsOn: svc/billing does not list svc/auth under usedBy
$ echo $?
1
```

Give `billing` a `usedBy: [&: refer(), svc/auth]` and it passes:

```sh
$ aontu relations topology.aon
verdict: pass
$ echo $?
0
```

A cycle is reported the same way, naming the entities it runs through
(`dependsOn: cycle svc/auth -> svc/billing -> svc/auth`). Exit `4` means
the document did not evaluate at all.

## Provide defaults that callers can override

Write the default in a disjunction with the type it must stay inside:

```aontu
timeout: *30 | integer      # 30 unless overridden
```

```sh
$ aontu timeout.aon
{
  "timeout": 30
}
```

A later `timeout: 60` (or a merge from another file) overrides it, and
a `timeout: 1.5` is refused:

```sh
$ aontu timeout.aon        # with `timeout: 1.5` appended
[aontu/|:empty]: Cannot unify values at path $.timeout

Empty disjunction. The disjunction has no valid alternatives.

 Cannot unify value: *30|integer with value: 1.5
(the two annotated source sites follow)
$ echo $?
1
```

The branch admits exactly what its type says, so `*30 | number` is how
you ask for a default that any number may override:

```sh
$ aontu loose.aon          # `timeout: *30 | number` and `timeout: 1.5`
{
  "timeout": 1.5
}
$ echo $?
0
```

Repeating the type outside the disjunction — `timeout: integer & (*30 |
integer)` — is still valid and still means the same thing, but it is no
longer needed to keep the leaf: before 0.53.0 the preference widened its
own branch to `number`, and the outer `integer` was the only way to say
what the inner one already said. Existing documents that spell it out
keep working unchanged.

What does *not* work is `timeout: *30 & integer`: a conjunction is not a
choice, so that pins the value at `30` and refuses `60` along with
`1.5`.

A lone `*5` (no `|`) is just a default `5`, and needs none of this.

## Apply one template to many keys

Use a `&:` spread entry. It is unified into every other key of the map:

```aontu
endpoints: {
  &: { method: *GET | string, auth: *true | boolean }
  list:   {}
  create: { method: POST }
}
```

→

```json
{ "endpoints": {
  "create": { "auth": true, "method": "POST" },
  "list":   { "auth": true, "method": "GET" }
} }
```

(Keys come out sorted, whatever order they were written in.) The same
works in lists: `a: [&:{x:1}, {y:1}, {y:2}]` →
`{"a":[{"x":1,"y":1},{"x":1,"y":2}]}`. A top-level `&:{...}` applies to
every key of the root map.

## Constrain every element of a list

Use a `&:` spread here too. A bare `[string]` is **positional**, not
list-of-string: it constrains element 0 and leaves the tail open, so
this passes —

```aontu
tags: [string]
tags: [core, 7]
```

```sh
$ aontu tags.aon
{
  "tags": [
    "core",
    7
  ]
}
```

— while the spread form refuses, naming the element:

```aontu
tags: [&: string]
tags: [core, 7]
```

```sh
$ aontu tags.aon
[aontu/no_scalar_unify]: Cannot unify values at path $.tags.1
(the hint and both annotated source sites follow)
$ echo $?
1
```

Reach for the positional form when the positions genuinely differ (a
pair, a fixed header) and for `[&: T]` whenever the list is a
collection. `close` on the enclosing map does not close a list tail;
the spread is what constrains it.

## Forbid unexpected keys

Maps are open by default. Seal one with `close`:

```aontu
config: close({ host: string, port: integer })
config: { host: h, port: 1, debug: true }
```

→ fails: the extra `debug` key is rejected with a `closed` error. Use
`open(x)` to lift a `close` again (e.g. `open(close({x:1})) & {y:2}`
succeeds).

## Make a field optional

Suffix the key with `?`. An optional field that never receives a concrete
value is **dropped** from the output instead of erroring:

```aontu
record: { id: integer, note?: string }
record: { id: 1 }
```

→ `{ "record": { "id": 1 } }`  (no `note`)

Supplying `note: hi` keeps it. Optional defaults still apply if given
(`z: *3` survives even when untouched).

## Reference and reshape other parts of the document

A reference pulls another node in and **unifies** with it — it adds, it
never overrides. Note the quotes: a bare word stops at the `-`.

```aontu
base: { region: "us-east", tier: free }
prod: $.base & { replicas: 3 }
```

```json
{ "base": { "region": "us-east", "tier": "free" },
  "prod": { "region": "us-east", "replicas": 3, "tier": "free" } }
```

Writing `prod: $.base & { tier: paid }` against that base is a conflict
(`Cannot unify value: "paid" with value: "free"` at `$.prod.tier`), not
an override. **To let a referrer change a field, the base has to offer
it** as a [default](#provide-defaults-that-callers-can-override):

```aontu
base: { region: "us-east", tier: *free | string }
prod: $.base & { tier: paid }
```

```json
{ "base": { "region": "us-east", "tier": "free" },
  "prod": { "region": "us-east", "tier": "paid" } }
```

- `$.a.b` — absolute path from the root.
- `.a.b` — relative to the current object.
- `.$KEY` — the key the current value is stored under.
- `copy($.x)` — a deep copy with type/hide marks cleared.
- `move($.x)` — like a reference but drops unresolved optional keys.

## Split a model across files

Load another source file with `@"path"`. The loaded value unifies in
place, so a base file and an override file merge naturally:

```aontu
car: @"./car.aon"               # { color: silver, doors: 4 }
car: { doors: number, wheels: 4 }
```

→ `{ "car": { "color": "silver", "doors": 4, "wheels": 4 } }`

Paths resolve via memory, file, then package resolvers (see the
[API reference](reference-api.md#aontuoptions)). In Node you can supply a
virtual filesystem through options for tests.

## Vendor a dependency closure for an offline build

An `@"..."` whose first segment carries a dot and which ends in `@N` is
a *module* import rather than a path, and modules resolve from local
stores only — evaluation never reaches the network. Declare the
dependency in the project's `mod.aon`:

```aontu
# mod.aon
mod: { path: "corp.example/app", main: "main.aon" }
dep: { "corp.example/schemas/service@1": { v: "1.4.2" } }
```

```aontu
# main.aon
svc: @"corp.example/schemas/service@1"
svc: name: "auth"
```

The module itself is an ordinary source tree with its own `mod.aon`;
here its entry file says `name: string` and `port: *8080 | integer`.
The two stores it can come from are `aon_vendor/` beside your `mod.aon`
and the canon-hash-keyed user cache — fetching one over the network is
`aontu mod get`, which this build names and does not ship.

`tidy` resolves the closure and writes the lockfile; `vendor` then
copies every locked module into `aon_vendor/`, which is the tree to
commit or ship in an image:

```sh
$ aontu mod tidy
verdict: ok
corp.example/schemas/service@1 1.4.2 aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E

$ aontu mod vendor
verdict: ok
corp.example/schemas/service@1

$ aontu main.aon
{
  "svc": {
    "name": "auth",
    "port": 8080
  }
}
```

Order matters: the user cache is keyed by canon-hash, so `vendor` can
only find what the lockfile already pins. Exit `1` means something was
missing, and `tidy` then writes no lockfile at all rather than a
partial one.

**When you publish a module**, `aontu mod manifest` prints the OCI
artifact the push would carry, and `--against <dir>` gates it on the
[breaking](#check-that-a-schema-change-breaks-nobody) check against the
previous version's tree:

```sh
$ aontu mod manifest --against ../service-1.4.1
verdict: breaking
corp.example/schemas/service@1 1.4.2
config: application/vnd.aontu.module.v1+json
com.github.rjrodger.aontu.canon: aon1-V867pjcWxocX0Df4ZhdtdfVVq1ErYkGCgO4UK0iG0Hc
com.github.rjrodger.aontu.major: 1
org.opencontainers.image.title: corp.example/schemas/service
org.opencontainers.image.version: 1.4.2
layer: mod.aon
layer: service.aon
$.owner: the general value requires this key; the specific value admits instances without it
$ echo $?
1
```

A major bump lifts the gate — that is what the major in the module path
is for. Full contract: [`aontu mod`](reference-api.md#aontu-mod).

## Pin what a document means

`aontu hash` prints one string that identifies a document's *meaning*,
so a lockfile, a registry entry or an agent can say "this definition,
this version" and check the claim later:

```sh
$ aontu hash system.aon
aon1-kmZi3pPU2hnWQfwLnaFoC5iUtlrt6vbUzU7og-KxWJE
```

Reformat the file, reorder its keys, add comments or split half of it
into an `@"..."` include, and the pin is unchanged:

```sh
$ aontu hash system-reformatted.aon
aon1-kmZi3pPU2hnWQfwLnaFoC5iUtlrt6vbUzU7og-KxWJE
```

Change what it *means* — flip a default, add a field, close a map — and
it moves. So a stored pin is a one-string staleness check: re-run the
verb, compare, and only re-read the document when the strings differ.

When one has moved and you want to see what moved, `--form` prints the
text that was hashed, which is what to diff:

```sh
$ aontu hash --form system.aon
{"services":{&:{"replicas":*1|integer,"tier":*"standard"|string},"auth":{"replicas":3,"tier":*"standard"|string},"billing":{"replicas":*1|integer,"tier":"premium"}}}
```

The document is evaluated standalone, so its own includes are part of
the pin. Exit `4` means it does not evaluate — a broken document has no
meaning to pin. See [`aontu hash`](reference-api.md#aontu-hash).

## Inject values from the host program

`$name` (no dot) is a variable supplied by the calling program, not the
document. This is how you parameterise a model from code.

TypeScript — set them on a context:

```ts
import { Aontu } from 'aontu'
import { IntegerVal } from 'aontu/dist/val/IntegerVal'

const aontu = new Aontu()
const ctx = aontu.ctx()
ctx.vars.port = new IntegerVal({ peg: 8080 })

aontu.generate('server: { port: $port }', undefined, ctx) // { server: { port: 8080 } }
```

Go — build a `map[string]Val` with the exported constructors
(`NewInteger`, `NewString`, `NewNumber`, `NewBoolean`, `NewNull`,
`NewScalarKind`, `NewMap`, `NewList`):

```go
vars := map[string]aontu.Val{"port": aontu.NewInteger(8080)}
out, err := aontu.New().GenerateVars("server: { port: $port }", vars)
// out == map[string]any{"server": map[string]any{"port": 8080}}
```

An undefined `$name` is an
`[aontu/unknown_var]: Cannot unify values at path …` error. (The
similar-looking `Cannot resolve value: $.nope` is the *path* case — a
reference that names nothing.)

## Keep schema/helper fields out of the output

Values marked with `type(...)` or `hide(...)` are treated as
schema/metadata and are **omitted when generating an enclosing map**,
while still participating in unification. Park the schema at its own
key and *reference* it where it should apply:

```aontu
_schema: type({ id: integer, name: string })

users: {
  &: $._schema
  ada: { id: 1, name: ada }
  bob: { id: 2, name: bob }
}
```

```json
{ "users": { "ada": { "id": 1, "name": "ada" },
             "bob": { "id": 2, "name": "bob" } } }
```

`_schema` itself never appears, and it still constrains: change `bob`'s
`id` to `"two"` and the run fails with `[aontu/no_scalar_unify]: Cannot
unify values at path $.users.bob.id`.

**The mark travels with the value, not with the key name.** Marking
`_schema` does nothing to a sibling `id:` at the root — those are two
different paths. Marking the same path the data arrives at silences the
whole thing: `user: type({id:integer})` with `user: {id: 7}` unifies,
constrains, and then generates `{}`.

`hide(x)` is the same idea for values you want to compute with but not
emit — `secret: hide("s3cret")` / `token: $.secret` generates
`{"token":"s3cret"}`. `copy(...)` clears both marks, so
`copy($._schema)` produces an emittable value again.

## Give an agent an entrypoint to a definition

Two halves: a stanza the agent reads before it starts, and a server it
can question while it works.

**The stanza.** `aontu agentsmd` derives it from the source, so it
cannot drift from what the document actually says:

```sh
$ aontu agentsmd system.aon
<!-- aontu:begin -->
## Ground truth: `system.aon`
...
- Pin: `aon1-kmZi3pPU2hnWQfwLnaFoC5iUtlrt6vbUzU7og-KxWJE`
  (the canon-hash: it survives reformatting and moves on any
  change of meaning — `aontu hash system.aon` re-derives it)
- Top-level keys: `services`
- Shape: `{"services":{&:top,"auth":top,"billing":top}}`
...
<!-- aontu:end -->
```

`--write AGENTS.md` splices it between those two markers, appending
them if they are absent, and leaves everything outside untouched — so
re-run it in the same commit that changes the definition:

```sh
$ aontu agentsmd --write AGENTS.md system.aon
wrote: AGENTS.md
```

**The server.** `aontu-mcp` is a second binary of the npm package,
speaking Model Context Protocol over stdio. Point a harness at it the
way you point it at any stdio MCP server:

```json
{ "mcpServers": { "aontu": { "command": "aontu-mcp" } } }
```

It offers `vet`, `get`, `why`, `diff`, `canon` and `summary`, each
returning the same JSON contract the matching verb prints. A call that
*refuses* — a bad path, a document that does not hold — answers with
its report and `isError: false`, because the report is the answer.

**It evaluates confined**: the source arrives from the caller, so
`@"..."` is denied rather than followed. Asking it to canonicalise
`a: @"./system.aon"` comes back as a finding, not a file read:

```json
{
  "ok": false,
  "canon": "",
  "findings": [
    {
      "code": "include_denied",
      "class": "reference",
      "severity": "error",
      "path": "$",
      "message": "include denied: ./system.aon (capability: none)",
      "sites": []
    }
  ]
}
```

Details of both: [`aontu agentsmd`](reference-api.md#aontu-agentsmd)
and [the MCP server](reference-api.md#the-mcp-server). The Go port
ships no MCP binary — `Get`, `Why`, `Diff` and `AgentsMd` are library
calls for embedding instead.

## Collect errors instead of throwing

By default `generate` throws/returns on the first surfaced error. To
gather them instead, pass `collect: true` (TypeScript) and read the
result's `err` array:

```ts
const aontu = new Aontu()
const res = aontu.unify('a: 1 a: 2', { collect: true })
res.err            // array of NilVal errors, instead of a throw
```

This is useful for editors/linters that want every problem at once.

## Read a conflict error

Conflict messages name both operands. For two plain facts meeting at a
path, the later-in-source one is named first:

```
Cannot unify value: 2 with value: 1
```

means two facts reached the same path — `1` (earlier) and `2` (later) —
and they cannot both hold. Nested conflicts report the leaf values that
clashed, so `a:b:1` vs `a:b:2` is that same line at `$.a.b`.

Where the conflict is reached through a disjunction, a list spread or a
reference, both operands are still named but the ordering heuristic no
longer applies — read the two annotated source sites printed underneath,
which give the file, line and column of each.

An unresolved *path* is a different error:
`[aontu/no_path]: Cannot resolve value at path $.x` /
`Cannot resolve value: $.nope`.
