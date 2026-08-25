# Tutorial: your first unifications

This is a hands-on introduction. By the end you will have installed
Aontu, run it from both TypeScript and Go, used every core feature to
build up a small service configuration that is part schema, part
default, and part data — all in one document — and then turned the
`aontu` command on what you built: validating data against it,
querying it, and asking it where a value came from.

You do not need to understand *why* unification works yet (that is the
[Explanation](explanation.md)); just follow along and watch what each
step produces. Every snippet here is real, tested behaviour.

## 1. Set up

### TypeScript

```sh
cd ts
npm install
npm run build      # compiles src + test into dist/ and dist-test/
```

Create a scratch file `play.js` next to `ts/`:

```js
const { Aontu } = require('aontu')   // when installed from npm
// from inside this repo, use: require('./ts/dist/aontu')

const aontu = new Aontu()
console.log(aontu.generate('hello: world'))
```

```sh
node play.js
# { hello: 'world' }
```

`generate` takes Aontu source text and returns a plain JavaScript value.

### Go

```sh
cd go
go test ./...      # confirms the toolchain works
```

A scratch `main.go`:

```go
package main

import (
	"fmt"
	aontu "github.com/rjrodger/aontu/go"
)

func main() {
	out, err := aontu.New().Generate("hello: world")
	fmt.Println(out, err)        // map[hello:world] <nil>
}
```

The two implementations accept the same source and produce the same
shape. The rest of this tutorial shows source text and the result; run
it in whichever language you prefer.

> **Tip — try snippets instantly.** Both implementations also ship an
> `aontu` command. From a clone you can pipe any example straight in:
> `echo 'a:1 b:$.a' | node ts/bin/aontu.js` (or `go run ./cmd/aontu`
> inside `go/`). Installed from npm (`npm i -g aontu`) the command is
> just `aontu`, which is how the last two sections write it. Running
> `aontu` with no file starts a REPL. See the
> [API reference](reference-api.md#command-line-interface).

## 2. Objects are just keys and values

Aontu source looks like relaxed JSON (it is parsed by
[`@tabnas/jsonic`](https://github.com/tabnas/jsonic), so quotes, commas,
and braces are mostly optional):

```aontu
name: Mercury
order: 1
rocky: true
```

→

```json
{ "name": "Mercury", "order": 1, "rocky": true }
```

Nesting works by repeating keys with a colon — `a:b:c:1` is the same as
`a: { b: { c: 1 } }`:

```aontu
server: host: localhost
server: port: 8080
```

→

```json
{ "server": { "host": "localhost", "port": 8080 } }
```

Notice the two `server:` lines did not collide — they **merged**. That
merge is your first unification.

## 3. Unification: combining facts

Stating two things about the same place combines them. If they agree (or
one is more specific), you get the combination. The explicit operator is
`&`, but for map keys it happens automatically:

```aontu
server: { host: localhost }
server: { port: 8080 }
```

→ `{ "server": { "host": "localhost", "port": 8080 } }`

If they *disagree*, you get an error instead of a wrong answer:

```aontu
port: 8080
port: 9090
```

→ fails with:

```
Cannot unify value: 9090 with value: 8080
```

This is the whole point of Aontu: combining information can only ever
**narrow** toward a single answer or **fail loudly**. It never picks one
fact over another silently.

## 4. Types as values

A bare type name is a value too — it means "any value of this kind":

```aontu
port: integer
```

Unify a type with a concrete value and the value wins, *provided it
fits*:

```aontu
port: integer
port: 8080
```

→ `{ "port": 8080 }`

But:

```aontu
port: integer
port: "high"
```

→ `Cannot unify value: "high" with value: integer`

The built-in kinds are `string`, `boolean`, `top` (the catch-all that
fits anything), and the numeric family: `number`, which covers every
numeric value, over its four leaves `integer`, `float`, `biginteger`
and `bigdecimal`. Say `number` when you mean "some number", and name a
leaf when you mean that leaf — `port: integer` will not accept `8080.5`.
Now your config is starting to carry its own schema.

## 5. Exact numbers with `0d`

An ordinary number in Aontu — like an ordinary number in JSON — is a
binary floating-point value. That is the right choice for a port or a
timeout, and the wrong one for money and for large identifiers,
because binary cannot represent every decimal:

```aontu
total: 0.1 + 0.2
```

→ `{ "total": 0.30000000000000004 }`

Prefix a number with `0d` and you get an **exact** value instead,
stored as decimal digits and computed without rounding:

```aontu
total: 0d0.1 + 0d0.2
```

→ `{ "total": 0.3 }`

The prefix is only source syntax; the digits generate as an ordinary
JSON number. Whole digits give a `biginteger` (`0d5`), and a decimal
point or an exponent gives a `bigdecimal` (`0d19.99`, `0d1e3`).
Neither has a size limit worth worrying about.

The same care shows up as a refusal. If a number cannot be stored
without silently changing it, Aontu will not store it:

```aontu
id: 9007199254740993
```

→ fails with:

```
This integer literal, 9007199254740993, is not exactly representable in
binary64, so storing it would silently round it to a DIFFERENT
number. Aontu refuses rather than corrupts: write it as a `0d`
literal to get the exact integer.
```

That value is 2^53+1, just past the point where doubles start skipping
whole numbers. Take the hint and the document works again, with the
exact ID intact:

```aontu
id: 0d9007199254740993
```

→ `{ "id": 9007199254740993 }`

One thing to remember when you write the schema: an exact value is
*not* an `integer`, so constrain it with `biginteger` (or with
`number`, which accepts any numeric leaf).

## 6. Defaults with `*`

Mark a value as a **default** with `*`. A default is used only if nothing
more specific is supplied:

```aontu
port: *8080 | integer
```

The `|` here is **disjunction** — a choice between alternatives
(`8080` *or* any `integer`). The `*` picks which branch is preferred when
the choice is otherwise unforced. On its own:

→ `{ "port": 8080 }`

Override it by unifying a concrete value:

```aontu
port: *8080 | integer
port: 9090
```

→ `{ "port": 9090 }`

### The default carries its own kind

It is tempting to read `*8080 | integer` as "an integer, defaulting to
8080". That is exactly what it is — the branch admits what its type
says, and nothing wider:

```aontu
port: *8080 | integer
port: 1.5
```

→ refused:

```
[aontu/|:empty]: Cannot unify values at path $.port

Empty disjunction. The disjunction has no valid alternatives.
```

A concrete value overrides a default only where it is the *same kind* of
thing. `integer` and `float` are separate leaves under `number`, so
`1.5` is not an override of `8080` — it is a different kind of number,
and the disjunction has no branch left.

When you want a default that anything numeric may override, say so in
the branch:

```aontu
port: *8080 | number
port: 1.5
```

→ `{ "port": 1.5 }`

`*value | kind` is the shape to remember: the kind you write is the kind
you get. What does *not* work is `port: *8080 & integer` — a conjunction
is not a choice, so that pins the value at `8080` and refuses `9090` as
well as `1.5`. The rule is spelled out in the
[language reference](reference-language.md#preference--default-).

## 7. References

Pull a value from elsewhere in the document with a path. `$.` starts at
the root:

```aontu
defaults: timeout: 30
service:  timeout: $.defaults.timeout
```

→

```json
{ "defaults": { "timeout": 30 }, "service": { "timeout": 30 } }
```

A leading `.` is relative to the current object, and `.$KEY` resolves to
the key the value is stored under — handy for giving records their own
name:

```aontu
users: alice: { id: .$KEY }
users: bob:   { id: .$KEY }
```

→ `{ "users": { "alice": { "id": "alice" }, "bob": { "id": "bob" } } }`

## 8. Templates with `&:` (spread)

A `&:` entry inside a map is a **template** unified into every sibling
key. Define a shape once and apply it everywhere:

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

`web` overrode the default region; `db` took both defaults. The template
itself does not appear in the output. Spreads work in lists too
(`[&:{...}, ...]`).

## 9. Functions

Aontu has a fixed set of built-in functions. A few useful ones:

```aontu
web:   { region: "eu-west" }
name:  upper(mercury)      # -> "MERCURY"  (ceiling for numbers)
slug:  lower(Mercury)      # -> "mercury"  (floor for numbers)
label: a + b + c           # -> "abc"      (+ concatenates / adds)
round: upper(0d1.1)        # -> 2.0        (exact ceiling, kind kept)
copy:  copy($.web)         # deep copy of another node
```

There are twenty-eight built-ins in all — bounds like `min` and `max`,
pattern and length constraints, generators that build children, and the
marks you meet in the next section. You need none of them today. When
you do, they are tabulated with examples in the
[language reference](reference-language.md#functions).

## 10. Sealing a shape with `close`

By default a map is **open**: unifying in extra keys is allowed.
`close()` forbids that, turning a shape into a strict schema:

```aontu
point: close({ x: number, y: number })
point: { x: 1, y: 2 }
```

→ `{ "point": { "x": 1, "y": 2 } }`, but adding `z: 3` would fail with a
`closed` error. `open()` reverses it.

## 11. Putting it together

Here is a single document that is schema, defaults, and data at once.
Save it as `config.aon`; the last two sections use it:

```aontu
# --- schema + defaults (could live in its own file) ---
service: close({
  name:    string
  host:    string     & (*localhost | string)
  port:    integer    & (*8080 | integer)
  rate:    bigdecimal & (*0d0.01 | bigdecimal)
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

```sh
aontu config.aon
```

→

```json
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

Two things in that schema are worth a second look, because the obvious
spelling of each is weaker than it looks.

Every default is written as `kind & (*value | kind)`, the shape from
§6 — so `port: 9090.5` is refused rather than quietly accepted.

`tags` uses the spread from §8. `[&: string]` says *every* element is a
string. The shorter `[string]` would not: a list literal is
**positional** with an open tail, so it constrains element 0 and lets
anything follow — `tags: [public, 7]` sails straight through it. Reach
for the spread whenever you mean "a list of these".

With those two in place the schema really does constrain every field.
Defaults filled `host`, the data supplied `name`/`port`/`rate`/`tags`,
`rate` stayed exact all the way to the output, `close` guaranteed no
stray keys slipped in, and unification combined it all into one answer
— failing loudly if anything had conflicted.

## 12. Asking the document questions

You have written something that says quite a lot. From here on, stop
reading it and start asking it. The `aontu` command has a verb for each
question; from a clone, prefix them with `node ts/bin/aontu.js` or
`go run ./cmd/aontu` as in §1.

`get` prints one slice of the answer:

```sh
aontu get '$.service.tags' config.aon
```

```json
[
  "public",
  "http"
]
```

The path is the same `$.`-rooted path you wrote in §7 — quote it so the
shell leaves the `$` alone.

`why` is the one to reach for when a value surprises you. It names
every statement that contributed to a path, in source order:

```sh
aontu why '$.service.port' config.aon
```

```
$.service.port = 9090
  1. integer  config.aon:5:12
  2. *8080|integer  config.aon:5:25
  3. 9090  config.aon:13:9
```

Three contributions, and you wrote all three: the constraint, the
default, and the data that beat it — each with the line and column it
came from. Ask the same of `$.service.host`, which nothing overrode,
and only two come back: the constraint and the default.

`get` has `--keys`, `--types` and `--canon` views as well, and there
are eleven verbs in all. The
[API reference](reference-api.md#command-line-interface) lists them;
the [how-to guides](how-to.md) show the tasks they are for.

## 13. Validating data with `aontu vet`

Configuration rarely stays in one file: the schema is yours, the data
arrives from somewhere else. Split `config.aon` at its comment. The
schema half becomes `service.aon`:

```aontu
service: close({
  name:    string
  host:    string     & (*localhost | string)
  port:    integer    & (*8080 | integer)
  rate:    bigdecimal & (*0d0.01 | bigdecimal)
  tags:    [&: string]
})
```

and the data half becomes `prod.aon`:

```aontu
service: {
  name: api
  port: 9090
  rate: 0d0.025
  tags: [public, http]
}
```

`vet` asks whether a data document holds against a schema document:

```sh
aontu vet service.aon prod.aon
```

```
verdict: valid
```

Now a second environment arrives, `staging.aon`, written by someone
else:

```aontu
service: {
  name: search
  port: 8100
  tags: [internal, 3]
}
```

```sh
aontu vet service.aon staging.aon
```

```
verdict: invalid

$.service.tags.1: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.service.tags.1
  data: staging.aon:4:20 (3)
  schema: service.aon:6:16 (string)
```

Read that from the top. The path `$.service.tags.1` is exactly where
the trouble is — element 1 of the list, the `3`. Then **two sites**,
because a conflict is always between two statements and neither one is
"the error": `data` is what arrived, `3` at line 4 column 20 of
`staging.aon`; `schema` is what it had to meet, `string` at line 6
column 16 of `service.aon`. Every finding is sited on both sides like
this, so you never have to guess which file to open.

The `3` was meant to be a tier name; write it as one, and vet agrees:

```aontu
  tags: [internal, tier3]
```

```sh
aontu vet service.aon staging.aon
```

```
verdict: valid
```

Notice that `staging.aon` never mentions `host` or `rate` and passes
anyway: the schema's defaults supply them. Unify the two files to see
what the service actually gets —

```sh
cat service.aon staging.aon | aontu
```

```json
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

— and one more verdict is worth meeting. Delete `name: search` from
`staging.aon` and run vet again:

```
verdict: incomplete

$.service.name: mapval_required [incomplete]
  [aontu/mapval_required]: Cannot resolve value at path $.service.name
  schema: service.aon:2:12 (string)
```

Nothing contradicts anything; the document is simply not finished yet.
Aontu has kept those two apart all through this tutorial, and `vet`
keeps them apart in its exit code too: `0` valid, `1` invalid, `3`
incomplete, `4` the schema itself does not stand up. That is what makes
it usable as a gate — see [`aontu vet`](reference-api.md#aontu-vet) for
the JSON and SARIF report forms, `--watch`, and the rest.

And that is the loop the whole command surface exists for: **emit** a
document, **vet** it against the truth it has to satisfy, and when it
fails let the two sites and `aontu why` tell you where to **repair**
it. You have now done it once by hand.

## Where to go next

- Have a concrete task? → [How-to guides](how-to.md)
- Want every rule and edge case? → [Language reference](reference-language.md)
- Calling Aontu from code, or after the other eight verbs and the MCP
  server? → [API reference](reference-api.md)
- Wiring the editor integration? → [Language Server](lsp.md)
- Curious *how* it works? → [Explanation](explanation.md)
