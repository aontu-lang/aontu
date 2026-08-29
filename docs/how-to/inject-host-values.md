---
description: Fill `$name` variables from the calling program to parameterise a model from code.
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
is the path case — a `$.reference` that names nothing in the document.
Two different mistakes, two different codes
([read a conflict error](read-a-conflict-error.md) has the anatomy).

An injected variable is a value like any other, so it unifies rather
than overrides: `server: { port: $port }` beside
`server: { port: integer & max(65535) }` checks the injected value
against the constraint, and a bad injection fails with a located
conflict. That makes variables a safe seam — the document keeps its
say. One trap: the exact-leaf constructors take a `bigint`, a
`Decimal`, or the digits as text — never a host `number`, which
binary64 has already rounded before the library could look
([exact-input constructors](../reference-api.md#variables)).

The constructor tables are in the API reference, for
[TypeScript](../reference-api.md#variables) and
[Go](../reference-api.md#variables-in-go); the language rule is
[Variables `$name`](../reference-language.md#variables-name).
