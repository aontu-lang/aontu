# Tutorial: build a config that checks itself

A service config is three documents wearing one file format: the
values, the rules the values must obey, and the fallbacks for what
nobody said. Most stacks store the three separately and hope. In Aontu
they are one document, combined by one operation — unification — and
the result is a config that can check itself.

That is what we build here, feature by feature, and then interrogate:
run it, validate other people's data against it, ask it where a value
came from. You do not need to know *why* unification behaves the way
it does yet (the [explanation](explanation.md) argues that); watch
what each step produces. Every snippet on this page is executed by the
test suite, and every output is the engine's.

## 1. Set up

If Aontu is already installed, skip to [§2](#2-objects-are-just-keys-and-values).

### TypeScript

Install and build inside the repo's `ts/` directory:

<!-- test: skip environment setup; npm and node are outside the transcript vocabulary -->
```sh
cd ts
npm install
npm run build      # compiles src + test into dist/ and dist-test/
```

A scratch `play.js` next to `ts/` is enough to call the library:

<!-- test: skip TypeScript API sample; the API is pinned by ts/test/aontu.test.ts -->
```js
const { Aontu } = require('aontu')   // when installed from npm
// from inside this repo: require('./ts/dist/aontu')

const aontu = new Aontu()
console.log(aontu.generate('hello: world'))
// { hello: 'world' }
```

`generate` takes Aontu source text and returns a plain JavaScript
value. That is the whole API surface you need today.

### Go

The Go port lives in `go/`:

<!-- test: skip environment setup; go is outside the transcript vocabulary -->
```sh
cd go
go test ./...      # confirms the toolchain works
```

A scratch `main.go`:

<!-- test: skip Go API sample; the API is pinned by go/aontu_test.go -->
```go
package main

import (
	"fmt"
	aontu "github.com/aontu-lang/aontu/go"
)

func main() {
	out, err := aontu.New().Generate("hello: world")
	fmt.Println(out, err)        // map[hello:world] <nil>
}
```

The two implementations accept the same source and produce the same
shape; the parity is pinned by a [shared spec](shared-spec.md) both
test suites run. The rest of this page shows source and result — run
them in whichever language you keep at hand.

### The `aontu` command

Both implementations also ship an `aontu` command, and this page
writes its CLI moments as transcripts of it. From a clone the command
is `node ts/bin/aontu.js` (or `go run ./cmd/aontu` from inside `go/`);
installed from npm (`npm i -g aontu`) it is plain `aontu`, which is
how the transcripts spell it. Pipe a snippet in:

<!-- test: run -->
```sh
$ echo 'a:1 b:$.a' | aontu
{
  "a": 1,
  "b": 1
}
```

`b` followed a reference to `a` before printing — even a piped
one-liner is fully evaluated. Run `aontu` with no file and you get a
REPL; the [API reference](reference-api.md#command-line-interface)
covers both.

## 2. Objects are just keys and values

Aontu source reads as relaxed JSON (it is parsed by
[`@tabnas/jsonic`](https://github.com/tabnas/jsonic), so quotes,
commas and braces are mostly optional). Plain data is legal on its
own:

```aontu
name: Mercury
order: 1
rocky: true
```

→

```json
{ "name": "Mercury", "order": 1, "rocky": true }
```

No quotes on `Mercury`, no braces, no commas; the output is ordinary
JSON all the same.

Nesting repeats keys with a colon — `a:b:c:1` means
`a: { b: { c: 1 } }`:

```aontu
server: host: localhost
server: port: 8080
```

→

```json
{ "server": { "host": "localhost", "port": 8080 } }
```

The two `server:` lines did not collide. They merged, and that merge
is your first unification.

## 3. Unification: combining facts

Stating two things about the same place combines them. The explicit
operator is `&`; between map keys it happens on its own:

```aontu
server: { host: localhost }
server: { port: 8080 }
```

→

```json
{ "server": { "host": "localhost", "port": 8080 } }
```

Where the statements agree, or one is more specific, unification keeps
the combination. Where they disagree, we want an error, and we get
one:

```aontu
port: 8080
port: 9090
```

→ fails with:

```
[aontu/scalar_value]: Cannot unify values at path $.port

Cannot unify value: 9090 with value: 8080
```

(Trimmed; the real message also quotes both source lines, with a
caret under each.) Combining information can only narrow toward a
single answer or fail loudly. Aontu never picks one fact over the
other silently.

## 4. Types as values

A bare type name is a value too — it means "any value of this kind".
Unify it with a concrete value and the value wins, provided it fits:

```aontu
port: integer
port: 8080
```

→

```json
{ "port": 8080 }
```

And when it does not fit:

```aontu
port: integer
port: "high"
```

→ fails with:

```
[aontu/no_scalar_unify]: Cannot unify values at path $.port

Cannot unify value: "high" with value: integer
```

The built-in kinds are `string`, `boolean`, `top` (the catch-all that
admits anything), and the numeric family: `number` covers every
numeric value, over its four leaves `integer`, `float`, `biginteger`
and `bigdecimal`. Say `number` when you mean "some number", and name a
leaf when you mean that leaf — `port: integer` will not accept
`8080.5`. Your config now carries the first piece of its own schema.

## 5. Exact numbers with `0d`

An ordinary Aontu number, like an ordinary JSON number, is a binary
floating-point value. For a port or a timeout that is fine. For money
and for large identifiers it is not, because binary cannot represent
every decimal:

```aontu
total: 0.1 + 0.2
```

→

```json
{ "total": 0.30000000000000004 }
```

Prefix the literals with `0d` and the arithmetic is exact, stored as
decimal digits and computed without rounding:

<!-- test: run -->
```sh
$ echo 'total: 0d0.1 + 0d0.2' | aontu
{
  "total": 0.3
}
```

The prefix is source syntax only; the digits generate as an ordinary
JSON number. Whole digits give a `biginteger` (`0d5`); a decimal
point or an exponent gives a `bigdecimal` (`0d19.99`, `0d1e3`).
Neither has a practical size limit.

The same care shows up as a refusal. A literal that cannot be stored
without silently becoming a different number is not stored:

<!-- test: run -->
```sh
$ echo 'id: 9007199254740993' | aontu
[aontu/lossy_integer_literal]: Cannot resolve value at path $.id

This integer literal, 9007199254740993, is not exactly representable in
binary64, so storing it would silently round it to a DIFFERENT
number. Aontu refuses rather than corrupts: write it as a `0d`
literal to get the exact integer.
...
$ echo $?
1
```

That value is 2^53+1, just past where doubles start skipping whole
numbers. Take the hint:

<!-- test: run -->
```sh
$ echo 'id: 0d9007199254740993' | aontu
{
  "id": 9007199254740993
}
```

The exact ID survives to the output. One thing to remember when you
write the schema: an exact value is a `biginteger` or a `bigdecimal`,
never an `integer`, so constrain it with the exact leaf (or with
`number`, which admits any numeric leaf).

## 6. Defaults with `*`

Mark a value as a **default** with `*`. A default is used only when
nothing more specific is supplied:

```aontu
port: *8080 | integer
```

→

```json
{ "port": 8080 }
```

The `|` is **disjunction**, a choice between alternatives (`8080` or
any `integer`), and the `*` says which branch to take when nothing
forces the choice. Unify a concrete value on top and it wins:

```aontu
port: *8080 | integer
port: 9090
```

→

```json
{ "port": 9090 }
```

Now try a float:

```aontu
port: *8080 | integer
port: 1.5
```

→ fails with:

```
[aontu/empty]: Cannot unify values at path $.port

Empty disjunction. The disjunction has no valid alternatives.
```

An override must be admitted by one of the branches you wrote, and
`1.5` is a `float`, which `integer` does not admit — why the gate is
this strict is argued in the
[explanation](explanation.md#a-preference-is-gated-by-kind-not-by-family).
When any number should be able to win, say so in the branch:

```aontu
port: *8080 | number
port: 1.5
```

→

```json
{ "port": 1.5 }
```

`*value | kind` is the shape to remember: the kind you write is the
kind you get. The full rule, including enums with defaults, is in the
[language reference](reference-language.md#preference--default-).

## 7. References

Pull a value from elsewhere in the document with a path; `$.` starts
at the root:

```aontu
defaults: timeout: 30
service:  timeout: $.defaults.timeout
```

→

```json
{ "defaults": { "timeout": 30 }, "service": { "timeout": 30 } }
```

Change the default once and every reader of the path follows. A
leading `.` is relative to the current object, and `key()` names the
key a value is stored under — a compact way to give records their own
name:

```aontu
users: alice: { id: key() }
users: bob:   { id: key() }
```

→

```json
{ "users": { "alice": { "id": "alice" }, "bob": { "id": "bob" } } }
```

Each record read its own key. The [graph tutorial](tutorial-graph.md)
picks this thread up again, where names become identities.

## 8. Templates with `&:` (spread)

A `&:` entry inside a map is a **template** unified into every sibling
key. Declare a shape once and it applies everywhere:

```aontu
servers: {
  &: { region: *"us-east" | string, active: *true | boolean }
  web: { region: "eu-west" }
  db:  {}
}
```

(The region names are quoted because a bare string stops at the `-`.)

→

```json
{
  "servers": {
    "db":  { "active": true, "region": "us-east" },
    "web": { "active": true, "region": "eu-west" }
  }
}
```

`web` overrode the default region; `db` supplied nothing and took both
defaults; the template itself does not appear in the output. Spreads
work in lists too (`[&: {...}]`), and §11 leans on that form.

## 9. Functions

Aontu has a fixed set of built-in functions, and no user-defined ones.
A few of the everyday ones:

```aontu
web:   { region: "eu-west" }
name:  upper(mercury)      # -> "MERCURY"
slug:  lower(Mercury)      # -> "mercury"
label: a + b + c           # -> "abc"
copy:  copy($.web)         # deep copy of another node
```

→

```json
{
  "copy":  { "region": "eu-west" },
  "label": "abc",
  "name":  "MERCURY",
  "slug":  "mercury",
  "web":   { "region": "eu-west" }
}
```

`+` concatenates strings and adds numbers; `upper` and `lower` double
as ceiling and floor on numbers, and they keep exact numbers exact
(`upper(0d1.1)` prints `2.0`, a `bigdecimal` ceiling). There are
forty-two built-ins in all — bounds, pattern and length
constraints, generators that build children, `join` to fold a bag into
a line of text — tabulated with tested examples in the
[language reference](reference-language.md#functions).
You need none of the rest today.

## 10. Sealing a shape with `close`

A map is **open** by default: unifying in extra keys is allowed, which
is what lets separate files contribute separate keys. A schema usually
wants the opposite. `close()` seals a shape:

```aontu
point: close({ x: number, y: number })
point: { x: 1, y: 2 }
```

→

```json
{ "point": { "x": 1, "y": 2 } }
```

Add a key the shape does not declare and the document refuses:

```aontu
point: close({ x: number, y: number })
point: { x: 1, y: 2, z: 3 }
```

→ fails with:

```
[aontu/closed]: Cannot resolve value at path $.point.z

Cannot add to closed structure.
```

`open()` reverses it. How open a schema should be is a genuine design
dial; [closed values](reference-language.md#closed-values-close--open)
has the mechanics, and the
[explanation](explanation.md#closed-world-validation-is-a-dial) the
trade-off.

## 11. Putting it together

Time to spend all of it. Here is a single document that is schema,
defaults and data at once — save it as `config.aon`:

<!-- test: scenario service-config -->
<!-- test: file config.aon -->
```aontu
# --- schema + defaults (could live in its own file) ---
service: close({
  name:    string
  host:    *localhost | string
  port:    *8080      | integer
  rate:    *0d0.01    | bigdecimal
  tags:    [&: string]
})

# --- environment data merged on top ---
service: {
  name: api
  port: 9090
  rate: 0d0.025
  tags: [public, http]
}
```

Run it:

<!-- test: run -->
```sh
$ aontu config.aon
{
  "service": {
    "host": "localhost",
    "name": "api",
    "port": 9090,
    "rate": 0.025,
    "tags": [
      "public",
      "http"
    ]
  }
}
```

Every default is `*value | kind`, the §6 shape, so `port: 9090.5` is
refused rather than accepted. And `tags` says `[&: string]` where
`[string]` might look like enough — a list literal is positional, so
`[string]` constrains element 0 and waves `tags: [public, 7]` through;
the [explanation](explanation.md#a-list-literal-is-positional) argues
why it works that way.

With those two spellings in place the schema constrains every field.
Defaults filled `host`, the data supplied the rest, `rate` stayed exact from
`0d0.025` to the printed `0.025`, and `close` kept stray keys out —
one answer, assembled by unification, which would have failed loudly
had anything conflicted.

## 12. Asking the document questions

You have written something that says quite a lot. From here on, stop
reading it and start asking it. `get` prints one slice of the answer:

<!-- test: run -->
```sh
$ aontu get '$.service.tags' config.aon
[
  "public",
  "http"
]
```

The path is the same `$.`-rooted path §7 used for references — quote
it so the shell leaves the `$` alone.

`why` is the verb to reach for when a value surprises you. It names
every statement that contributed to a path, in source order:

<!-- test: run -->
```sh
$ aontu why '$.service.port' config.aon
$.service.port = 9090
  1. *8080|integer  config.aon:5:12
  2. 9090  config.aon:13:9
```

Two contributions, and you wrote both: the default with its type, and
the data that beat it, each with the line and column it came from. The
first line is the *whole* written value — a contribution is a
statement, so the `8080` and the `integer` arrive together, as the
single value they were written as. Now ask about `host`, which nothing
overrode:

<!-- test: run -->
```sh
$ aontu why '$.service.host' config.aon
$.service.host = *"localhost"|string
  1. *"localhost"|string  config.aon:4:12
```

One contribution, still wearing its `*`: the default answered only
because nothing outranked it. `get` has `--keys`, `--types` and
`--canon` views as well, and the rest of the verb surface is
tabulated in the
[API reference](reference-api.md#command-line-interface);
[query a path](how-to/query-a-path.md) and
[explain a value](how-to/explain-a-value.md) put these two to work.

## 13. Validating data with `aontu vet`

Configuration rarely stays in one file: the schema is yours, the data
arrives from somewhere else. Split `config.aon` at its comment. The
schema half becomes `service.aon`:

<!-- test: file service.aon -->
```aontu
service: close({
  name:    string
  host:    *localhost | string
  port:    *8080      | integer
  rate:    *0d0.01    | bigdecimal
  tags:    [&: string]
})
```

and the data half becomes `prod.aon`:

<!-- test: file prod.aon -->
```aontu
service: {
  name: api
  port: 9090
  rate: 0d0.025
  tags: [public, http]
}
```

`vet` asks whether a data document holds against a schema document:

<!-- test: run -->
```sh
$ aontu vet service.aon prod.aon
verdict: valid
```

Now a second environment arrives, `staging.aon`, written by someone
else:

<!-- test: file staging.aon -->
```aontu
service: {
  name: search
  port: 8100
  tags: [internal, 3]
}
```

Vet it:

<!-- test: run -->
```sh
$ aontu vet service.aon staging.aon
verdict: invalid

$.service.tags.1: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.service.tags.1
  data: staging.aon:4:20 (3)
  schema: service.aon:6:16 (string)
$ echo $?
1
```

Read the finding from the top. The path `$.service.tags.1` is exactly
where the trouble is: element 1 of the list, the `3`. Then **two
sites**, because a conflict is always between two statements and
neither one owns the blame — `data` is what arrived (`3`, line 4,
column 20 of `staging.aon`) and `schema` is what it had to meet
(`string`, line 6, column 16 of `service.aon`). Every finding is sited
on both sides, so you never guess which file to open. And the exit
code, `1`, is the verdict class: a CI job needs nothing else.

The `3` was meant to be a tier name. Write `staging.aon` again, saying
so:

<!-- test: file staging.aon -->
```aontu
service: {
  name: search
  port: 8100
  tags: [internal, tier3]
}
```

<!-- test: run -->
```sh
$ aontu vet service.aon staging.aon
verdict: valid
```

Notice `staging.aon` never mentions `host` or `rate` and passes
anyway: the schema's defaults stand in. To see what the service
actually gets, unify the two files — a document that loads both is all
it takes. Write `stack.aon`:

<!-- test: file stack.aon -->
```aontu
@"service.aon"
@"staging.aon"
```

<!-- test: run -->
```sh
$ aontu stack.aon
{
  "service": {
    "host": "localhost",
    "name": "search",
    "port": 8100,
    "rate": 0.01,
    "tags": [
      "internal",
      "tier3"
    ]
  }
}
```

`@"file"` loads a source file and unifies it in place, which is all
"multi-file" means here;
[split a model across files](how-to/split-a-model-across-files.md)
grows the idea into versioned, vendored dependencies.

`vet` has a third verdict, and it is the one that keeps the loop
honest. Delete the `name` line from `staging.aon`:

<!-- test: file staging.aon -->
```aontu
service: {
  port: 8100
  tags: [internal, tier3]
}
```

<!-- test: run -->
```sh
$ aontu vet service.aon staging.aon
verdict: incomplete

$.service.name: mapval_required [incomplete]
  [aontu/mapval_required]: Cannot resolve value at path $.service.name
  schema: service.aon:2:12 (string)
$ echo $?
3
```

Nothing contradicts anything; the document is simply not finished yet.
Aontu has kept "wrong" and "unfinished" apart all through this page,
and `vet` keeps them apart in its exit codes too — one code per
verdict class, which is what makes it usable as a gate. The codes, the
JSON and SARIF report forms and `--watch` are specified under
[`aontu vet`](reference-api.md#aontu-vet), and
[validate in CI](how-to/validate-in-ci.md) is the recipe.

That is the loop the whole verb surface exists for: **emit** a
document, **vet** it against the truth it has to satisfy, and when it
fails, let the two sites and `aontu why` say where to **repair** it.
You have now run it once by hand, which matters, because repair is the
step you will eventually hand to a command: `aontu set` rewrites
overlay files under exactly these rules, and
[change a pinned value](how-to/change-a-pinned-value.md) shows what it
will and will not touch.

## Where to go next

Your config is a tree. Real systems are graphs: services that depend
on each other, ownership that must not cycle, schemas that contain
themselves. The [graph tutorial](tutorial-graph.md) is the second half
of this one — identity, relations, reachability and recursion, on the
engine you just used.

For a task you already have, go straight to its guide:

- **Run, embed and integrate** —
  [call from TypeScript](how-to/call-from-typescript.md),
  [call from Go](how-to/call-from-go.md),
  [read a conflict error](how-to/read-a-conflict-error.md)
- **Templates, defaults and composition** —
  [provide defaults](how-to/provide-defaults.md),
  [apply a template to many keys](how-to/apply-a-template-to-many-keys.md)
- **Schemas and constraints** —
  [constrain list elements](how-to/constrain-list-elements.md),
  [make a field optional](how-to/make-a-field-optional.md)
- **Query, explain and change** —
  [query a path](how-to/query-a-path.md),
  [explain a value](how-to/explain-a-value.md)
- **Validate and evolve** —
  [validate in CI](how-to/validate-in-ci.md),
  [gate schema changes](how-to/gate-schema-changes.md)
- **Modules and multi-file** —
  [split a model across files](how-to/split-a-model-across-files.md)

Every rule and edge case is in the
[language reference](reference-language.md); the command and both APIs
are in the [API reference](reference-api.md); the reasons are in the
[explanation](explanation.md).
