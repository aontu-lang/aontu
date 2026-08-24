# Design note: colon-chain nested `@"file"` import drops the import (Go port)

Status: **resolved** — fixed upstream in `@tabnas/multisource/go` v0.3.1
(pinned in `go/go.mod` at the time; today's pin is v0.5.2, which
carries the fix). Covered by the shared-spec regression
`file.tsv:load-colon-chain`. The analysis below is kept as a record of
the defect and its root cause.

This note records a parity defect found while validating `aql:model`
(and `voxgig/model`) against a canonical TypeScript-based test model. A
configuration that should load ~390 KB of imported structure collapsed
to ~705 bytes when run through the Go chain: the entire `@`-imported
tree was missing and only the inline tree survived. The trigger reduces
to a single rule.

## Summary

In the **Go** implementation, a *colon-chain* (nested-path) key whose
value is a bare `@"file"` import silently resolves to `{}` (the import is
lost) instead of loading the file. The **TypeScript** (canonical)
implementation handles the same source correctly.

This was **fixed upstream in `@tabnas/multisource/go` v0.3.1**; the table
below shows the Go behaviour **before** that bump (TypeScript was always
correct). Braced nesting worked in both at any depth throughout, and
remains the recommended form.

| Form                                       | TypeScript | Go (≤ v0.3.0) | Go (≥ v0.3.1) |
|--------------------------------------------|------------|---------------|---------------|
| `x: @"minor.aon"`                          | ✅ loads    | ✅ loads       | ✅ loads       |
| `struct: { minor: @"minor.aon" }` (braced) | ✅ loads    | ✅ loads       | ✅ loads       |
| `struct: minor: @"minor.aon"` (colon-chain)| ✅ loads    | ❌ `{}`        | ✅ loads       |

## Reproduction

`minor.aon`:

```aontu
a:1
b:2
```

```sh
# Direct — both correct
echo 'x: @"minor.aon"' | go run ./go/cmd/aontu
# => { "x": { "a": 1, "b": 2 } }

# Braced — both correct
echo 'struct: { minor: @"minor.aon" }' | go run ./go/cmd/aontu
# => { "struct": { "minor": { "a": 1, "b": 2 } } }

# Colon-chain — TypeScript correct, Go wrong
echo 'struct: minor: @"minor.aon"' | node ts/dist/cli.js
# => { "struct": { "minor": { "a": 1, "b": 2 } } }
echo 'struct: minor: @"minor.aon"' | go run ./go/cmd/aontu
# => {}
```

The defect reproduces consistently across every layer that sits on the Go
engine (`aql:model`, `voxgig/model`, and aontu directly), confirming the
fault is in the shared parser stack rather than any wrapper.

## Root cause

The `@`-import is handled by the `@tabnas/multisource` plugin, layered on
`@tabnas/jsonic`. Two facts matter:

1. **The multisource bare-`@` injection grammar only handles depth 0 and
   1.** When a *bare* `@"file"` appears as a map entry (the `{@foo}`
   case), the plugin's `custom` grammar injects the loaded keys into the
   enclosing map. Its alternates are gated on `r.d === 0` (`@d-zero`) and
   `r.d === 1 && top === 1` (`@d-one-top`). When the directive is instead
   a *value* of a pair (`x: @"file"`), the directive action takes the
   other branch and does `rule.node = res.val` — the loaded value simply
   becomes that pair's value. **This grammar is byte-for-byte the same in
   the TypeScript and Go multisource plugins**, so it is not where the two
   diverge.

2. **The divergence is in `@tabnas/jsonic` colon-chain parsing.** For
   `struct: minor: @"file"`:
   - In **TypeScript** jsonic, the colon-chain nests the `val` rule, so
     when `@` is lexed the parser is still *inside* `minor`'s value
     position. The directive opens as a value and runs the
     `rule.node = res.val` branch — the import becomes `minor`'s value and
     the implicit `struct → minor` maps are built around it. Correct.
   - In **Go** jsonic, the colon-chain is *flattened* rather than nested.
     By the time `@` is lexed the implicit `struct`/`minor` maps have
     already been closed and the parser depth is back at `0`. The
     directive therefore matches `@d-zero` and is parsed as a **fresh
     top-level bare `@` injection**. Its loaded keys are merged into the
     **root** map, and `minor` is left with a `nil` value.

Dumping the raw parse tree for the Go colon-chain case makes the
mis-placement explicit:

```
root map{
  struct -> map{ minor -> nil, order:[minor] }   # value never filled
  order:[@]                                        # bogus mark recorded as a key
  a -> 1                                           # imported keys hoisted to root
  b -> 2
}
```

Because the engine excludes the reserved order sentinel and skips the
`nil` `minor`, generation yields `{}` (in the bare top-level mark form the
root keys are present but mis-nested; in the inline-plus-import form the
inline tree survives and the import is lost — matching the 705-byte
observation).

The loss is **irrecoverable after parsing**: with more than one import the
hoisted keys collide at the root (e.g. two imports each contributing `a`
become a conjunct `a:1&1`), and the structural link back to the intended
destination (`struct.minor`) is gone. There is therefore no reliable
post-parse repair inside aontu.

## What was ruled out

- **Ender char.** `@` is registered as an ender character by the
  multisource plugin (so the lexer stops text/number tokens at `@`).
  Removing `@` from the ender set after the plugin is applied does **not**
  fix the colon-chain case — the flattening happens regardless — so the
  ender registration is not the cause.
- **aontu's own grammar customisation.** aontu's `val`/`map`/`pair`/`elem`
  rule tweaks (spreads, optional keys, leaf wrapping, order tracking) are
  not involved; the import is already mis-placed in the jsonic node tree
  before aontu's `asVal` conversion runs.

## Resolution

The fix landed **upstream in `@tabnas/multisource/go` v0.3.1**, which
makes the bare-`@` injection / colon-chain value handling work at
arbitrary depth. aontu's `go/go.mod` pinned that version (it pins
v0.5.2 today, which carries the fix), and the change was
validated against the full shared spec plus the new regression row
`test/spec/file.tsv:load-colon-chain` (`a:b:@"…/foo.aon"` →
`{"a":{"b":{"f":11}}}`), which passes in both implementations.

aontu pins these parser versions exactly (`go/go.mod`), and the
spread/optional rules depend on parser internals (see `AGENTS.md`), so any
future parser bump must still be made deliberately and validated against
the full shared spec.

## Workaround (pre-v0.3.1)

Before the upstream fix, the supported form was **braced nesting** instead
of a colon-chain for an imported value. It is equivalent, works in both
implementations at any depth, and remains a fine style:

```aontu
# Equivalent to:   struct: minor: @"minor.aon"
struct: { minor: @"minor.aon" }
```

## Secondary consideration (resolved)

The original report also noted that the reference output used
insertion-order keys while Go's JSON marshaling sorted keys
alphabetically, requiring semantic rather than byte-exact comparison.
This is **resolved**: both implementations now emit unified-model map
keys in alphabetical order in both `canon` and generated-JSON output, so
the two CLIs produce byte-identical output and can be compared directly.
Lists keep their index order. (Map key order is not meaningful in
unification — `{a,b}` unified with `{b,a}` is the same map — so a stable
alphabetical order is well-defined.)
