---
description: Fill `$name` variables from the calling program or the command line to parameterise a model.
group: run-embed
order: 50
---

# Inject values from the host program

A `$name` with no dot is not a path: it names a value the calling
program supplies. This is how a model takes parameters from code (a
port from the environment, a region from a flag) without a second
source file.

In TypeScript, set variables on a context and pass it as the third
argument:

<!-- test: skip TypeScript API sample; the API is pinned by ts/test/ -->
```ts
import { Aontu } from 'aontu'
import { IntegerVal } from 'aontu/dist/val/IntegerVal'

const aontu = new Aontu()
const ctx = aontu.ctx()
ctx.vars.port = new IntegerVal({ peg: 8080 })

aontu.generate('server: { port: $port }', undefined, ctx)
// { server: { port: 8080 } }
```

In Go, build a `map[string]Val` with the exported constructors
(`NewInteger`, `NewString`, `NewNumber`, `NewBoolean`, `NewNull`,
`NewScalarKind`, `NewMap`, `NewList`, and the exact-leaf pair
`NewBigInteger` / `NewBigDecimal`) and use the `Vars` variants:

<!-- test: skip Go API sample; the API is pinned by the go/ test suite -->
```go
vars := map[string]aontu.Val{"port": aontu.NewInteger(8080)}
out, err := aontu.New().GenerateVars("server: { port: $port }", vars)
// out == map[string]any{"server": map[string]any{"port": 8080}}
```

A `$name` nobody supplied is refused, under its own error code:

<!-- test: run -->
```sh
$ echo 'server: port: $port' | aontu
[aontu/unknown_var]: Cannot unify values at path $.server.port
...
$ echo $?
1
```

The similar-looking `[aontu/no_path]: Cannot resolve value at path …`
is the path case: a `$.reference` that names nothing in the document.
Two different mistakes, two different codes
([read a conflict error](read-a-conflict-error.md) has the anatomy).

An injected variable is a value like any other, so it unifies rather
than overrides: `server: { port: $port }` beside
`server: { port: integer & max(65535) }` checks the injected value
against the constraint, and a bad injection fails with a located
conflict. That makes variables a safe seam: the document keeps its
say. The exact-leaf constructors take a `bigint`, a `Decimal`, or the
digits as text, never a host `number`, which binary64 has already
rounded before the library could look
([exact-input constructors](../reference-api.md#variables)).

The constructor tables are in the API reference, for
[TypeScript](../reference-api.md#variables) and
[Go](../reference-api.md#variables-in-go); the language rule is
[Variables `$name`](../reference-language.md#variables-name).

## From the command line

`--var name=value` binds `$name` to the value read as aontu source, and
`--var-text name=value` binds it to the value as text, whatever it
looks like. With `v.aontu`:

<!-- test: file v.aontu -->
```aontu
env: $env
replicas: integer & $n
```

<!-- test: run -->
```sh
$ aontu --var env=prod --var n=3 v.aontu
{
  "env": "prod",
  "replicas": 3
}
```

`n=3` is an integer, so `replicas` meets it. A short commit hash wants
`--var-text`, since `--var sha=1234567` binds an integer on the day the
hash is all digits.

Every verb that evaluates a document takes both, `vet` and `hash` among
them, and a binding that no document of the run reads is refused as a
usage error, so a misspelt name can't pass unseen:

<!-- test: run -->
```sh
$ aontu --var env=prod --var n=3 --var region=eu v.aontu
aontu: --var binds $region, which no document reads
$ echo $?
2
```

A binding is a value. Its source loads no file, one that still reads a
path or a variable is refused, and an error in it is sited at the
option that bound it, `--var n:1:1`. `hash` and `breaking` name the
bindings in their reports, since a hash taken under them pins one
deployment rather than the model. `fmt`, `publish` and the package
verbs refuse the options, as a package is published with no host.
Nothing reads the environment: a shell passes a value where it is
wanted, as `--var-text user="$USER"` does.

A set of values kept under review goes in a file of its own, and
`--vars` binds each of its top-level keys. A key that no document reads
is accepted, so one file serves several documents. With `values.aontu`:

<!-- test: file values.aontu -->
```aontu
env: "prod"
n: 3
region: "eu"
```

<!-- test: run -->
```sh
$ aontu --vars values.aontu v.aontu
{
  "env": "prod",
  "replicas": 3
}
```

The file is evaluated on its own and loads nothing, and a name it
binds that a `--var` binds too is refused as bound twice.

The REPL takes the same three options when it starts, and every document
of the session reads them. The MCP server's tools take them as `vars`
and `varsText`, objects of names to strings
([the MCP server](../reference-api.md#the-mcp-server)).
