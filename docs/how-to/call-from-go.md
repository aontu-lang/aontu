---
description: Embed the engine with the Go port — the same three calls, with errors returned instead of thrown.
group: run-embed
order: 30
---

# Call Aontu from Go

The Go port is a library first: module `github.com/aontu-lang/aontu/go`,
package `aontu`, kept in parity with the canonical TypeScript engine
for the subset it implements. The same three calls, in Go's idiom:

<!-- test: skip Go API sample; the API is pinned by the go/ test suite -->
```go
import aontu "github.com/aontu-lang/aontu/go"

a := aontu.New()

out, err := a.Generate("a: 1 b: $.a")   // out = map[string]any{"a":1, "b":1}
v,   err := a.Unify("a: *1 | number")   // v.Canon() == `{"a":*1|number}`
v,   err  = a.Parse("a: number")        // AST, not yet unified
```

Nothing throws or panics for an ordinary conflict: every method
returns an `error`, and `Generate` returns `(nil, err)` on any
unresolved or conflicting value — so check it. Generated output uses
Go's natural types (`map[string]any`, `[]any`, `int64`, `float64`,
`string`, `bool`, `nil`), plus `*big.Int` and `*Decimal` for the two
exact leaves, both of which marshal their exact digits as raw JSON
numbers ([exact numbers in
Go](../reference-api.md#exact-numbers-in-go)).

When a source's relative `@"file"` loads should resolve from somewhere
other than the process working directory (typically the directory of
an entry file), construct with a base:

<!-- test: skip Go API sample; the API is pinned by the go/ test suite -->
```go
abs, _ := filepath.Abs(file)
a := aontu.NewWithBase(filepath.Dir(abs))
```

(The `aontu` CLI does exactly this for a file argument.) Absolute
paths are unaffected.

One difference from the TypeScript port to plan around: the Go port
ships no MCP binary — its role is embedding, so `Get`, `Why`, `Diff`
and `AgentsMd` are library calls instead
([give an agent an entrypoint](give-an-agent-an-entrypoint.md)).
For every problem in one pass rather than the first error, use
`Check` ([collect errors](collect-errors.md)).

The full surface is the [Go API
reference](../reference-api.md#go-api); to parameterise a model from
code, [inject host values](inject-host-values.md). The two ports
answer alike by construction — the [shared
spec](../shared-spec.md) is what pins it.
