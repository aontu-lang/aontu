---
description: Gather every problem in one pass with `collect: true` (TypeScript) or `Check` (Go) instead of stopping at the first.
group: run-embed
order: 70
---

# Collect errors instead of throwing

`generate` throws on the first surfaced error, which suits a build
step and fails a linter — an editor wants every problem in one pass,
each with its location. Pass `collect: true` and read the result's
`err` array:

<!-- test: skip TypeScript API sample; the API is pinned by ts/test/ -->
```ts
const aontu = new Aontu()
const res = aontu.unify('a: 1 a: 2', { collect: true })

res.err            // one NilVal per failure — nothing thrown
res.err[0].why     // 'scalar_value', the error code
res.canon          // '{"a":nil}' — the failure sits where it happened
```

Each collected error is a `NilVal`: the value a failed unification
leaves behind, carrying its error code (`why`), its full message, and
the path it failed at. The rest of the document still unifies around
it, which is what makes the mode useful — one pass, every error,
each located. The [canonical form](see-canonical-form.md) then shows
`nil` at each failed path, a map of the damage.

The Go port never throws for a conflict (`Unify` and `Generate`
return an `error`), but that error is still the first one. The
every-problem call is `Check`:

<!-- test: skip Go API sample; the API is pinned by the go/ test suite -->
```go
problems := aontu.New().Check("a:1\na:2")
// every problem: source position, error code, full message
```

Both language servers are this mode with a protocol around it — the
diagnostics your editor shows are a walk over the collected `NilVal`s
([how diagnostics are
computed](../lsp.md#how-diagnostics-are-computed)). A valid but
non-concrete document (a schema, a partial fragment) collects
nothing: a value still waiting for information is a residual, not an
error.

The `collect` and `err` options are in
[`AontuOptions`](../reference-api.md#aontuoptions). To make sense of
one collected conflict, [read a conflict
error](read-a-conflict-error.md); to get the collecting behaviour in
your editor rather than your code, [wire your
editor](wire-your-editor.md).
