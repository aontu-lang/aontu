# Implementation parity and the number model

What the Go port covers, why the `@tabnas` pins are exact, and the
numeric tower every change in that area has to respect. Summary in
[AGENTS.md](../../AGENTS.md).

## Implementation parity & Go coverage


TypeScript is canonical; the Go port is kept in parity for the subset it
implements. The Go **parser** is built on the Go ports of the `@tabnas`
parser stack and its `expr`/`path` plugins (`github.com/tabnas/...`) —
the same stack as `ts/src/lang.ts` — so the surface syntax parses in
parity.

The Go port has **full parity** with the canonical TypeScript language:
scalars, scalar kinds (type constraints — `string`, `boolean`, `top`,
and the numeric tower `number` over its four leaves `integer`, `float`,
`biginteger`, `bigdecimal`; see [The number model](#the-number-model)),
`0d` exact literals and exact arithmetic, maps (implicit nesting,
duplicate-key merge, spreads `&:`, optional keys `a?:`, `close`/`open`),
lists (incl. `&:` spreads), conjunction (`&`), disjunction (`|`),
preference/defaults (`*`), references (`$.a.b`, relative `.x.a`,
cross/chained refs), `$name` variables, the `+` operator (and
parenthesised grouping), every built-in function declared in
`test/spec/signature.tsv` (48 at 2026-09-05, `upper` to `split`), type/hide marks, and `@"file"` source loading
via the multisource plugin — plus `parse`, `unify`, `generate` and
`canon`.

Both use the **same `@tabnas` parser stack**: TS `@tabnas/jsonic` +
`@tabnas/{expr,path,multisource,directive,debug}`; Go
`github.com/tabnas/{jsonic,expr,path,multisource,directive}/go` — the Go
ports. `$var` variables are supplied via the runner context
(`ctx.vars` in TS, `Aontu.GenerateVars(src, vars)` in Go); the shared
`test/spec/var.tsv` rows are checked with the same variable set in both.

Both implementations use the same `@tabnas` Go/TS stack (jsonic + expr +
path + multisource), so the parser and semantics stay in lock-step. The
shared spec is the contract; grow it whenever either side changes.

**Pin the `@tabnas` versions exactly** (`ts/package.json`, `go/go.mod`).
The spread (`&:`) and optional-key (`a?:`) rules depend on `@tabnas`
parser *internals*, not just its public API: the parent-seeded node that
descended rules share (hence the explicit `r.node = {}` resets in both
`lang.ts` and `lang.go`), the `B:`/`b:` backtrack accounting, and the
order plugins are applied. A minor `@tabnas` bump can change these
silently with no compile error — only the shared spec catches it — so
upgrade deliberately and run `make test` before loosening any pin.

> **Previously divergent, now fixed:** consecutive spreads at one map
> level — bare (`&:k:a &:p:2`) and space-separated braced
> (`x:{&:{k:a} &:{p:2}}`) — used to parse differently (Go nested the
> second bare spread inside the first's template; TS mis-attached a
> nested braced sibling spread to the root). Both grammars now gate the
> sibling-spread pair-close alt on the `pk`/`dmap` counters (see the
> pair close alts in `ts/src/lang.ts` and `go/lang.go`), so consecutive
> spreads are siblings on the enclosing map at any depth; covered by the
> `spread.tsv:sibling-*` shared-spec rows.

### Where the ports do not mirror each other structurally

ADR-001 asks the port to mirror TypeScript's *structure*, not only its
results, so a reviewer can hold the two files open and match them arm
for arm. One place fails that test, and it is worth naming so the next
reader does not take it for an accident.

**A value's source position.** Both ports now group it: TypeScript in a
`Site` (`ts/src/site.ts`) holding `row`, `col`, `url`, `len`, `src` and
the A-1 `via`, Go in a `site` (`go/val.go`) holding `url`, `src`, `sp`,
`spu` and `via`. A value's position is `v.site.url` in either, and the
A-1 use site is `site.via` in either.

What remains is how the position itself is spelled: TypeScript stores a
row and a column, Go a byte offset it turns into a row and column at
render time with `rowCol(src, sp)`. **This is a choice, and an earlier
draft of this page gave the wrong reason for it.** A `@tabnas` parser
token has carried `RI` and `CI` beside `SI` since well before the
version pinned here, so Go was never short of a row and a column.

Two things decide it instead. The token's column is a RUNE count
(`utf8.RuneCountInString`, in the parser's lexer) and aontu reports
UTF-16 columns, which is what TypeScript's string indices give and what
the LSP position encoding asks for; the two agree for BMP text and
differ by one per astral character, so `a:"😀" b:1 b:2` is column 14 in
both ports today and would be 13 in Go if the token's column were taken
at face value. And a position travels through the parser as a bare
offset — of the 92 places that set one, 19 hold a token — so storing a
row and a column would mean threading two more numbers through the
other 73, or deriving them from the offset after all.

Go's LSP also wants the offset: `Problem.Pos` is one, and `lineIndex`
converts it. So the offset stays, and `rowCol` stays with it.

## The number model

The numeric lattice is a **tower**. `number` is a pure supertype that
never tags a concrete value; every numeric value carries one of four
leaves, fixed when the value is built:

| kind | holds | written |
|------|-------|---------|
| `integer`    | a double, whole, inside the int64 window | `1`, `1e3` |
| `float`      | any other double (IEEE-754 binary64)     | `1.5`, `1e21` |
| `biginteger` | exact, whole, unbounded                  | `0d5`, `0d1_000` |
| `bigdecimal` | exact base-10, with a point or exponent  | `0d0.1`, `0d1e3` |

Three properties govern every change in this area:

- **The leaves are disjoint.** `1 & 1.0`, `5 & 0d5` and `0d5 & 0d5.0`
  are all conflicts, and scalar identity compares kind as well as value
  (so `1|1.0` keeps both alternatives). Which leaf a value takes is
  therefore language surface, and a change to it must be pinned by
  `canon` or `err` — never by `gen`, which cannot see a kind.
- **Leaf by source, not by magnitude.** A literal without `0d` is
  `integer` only if its text has no `.`, its value is integral, and it
  is inside the int64 range; anything else is `float`. A literal with
  `0d` is `bigdecimal` if its source carries a `.` or an exponent, and
  `biginteger` otherwise. Both ports share one predicate for the first
  rule — `isIntegerKind` (`ts/src/val/numkind.ts`, `go/lang.go`) —
  applied at **every** construction site, including the raw/implicit-list
  path where there is no source text.
- **The exact leaves are opt-in.** They are reached only by a `0d`
  literal or by the exact-input constructors, never by promotion,
  coercion or inference, so a `0d`-free document means exactly what it
  always meant. Arithmetic is exact-always with a loud limit rather
  than a silent rounding: a bigdecimal beyond the budget (4096
  coefficient digits, absolute scale 4096) is refused, in a literal and
  in a computed result alike.

Representation differs by port and must not drift: TypeScript holds a
biginteger as a native `bigint` and a bigdecimal as a `Decimal`
(`ts/src/val/Decimal.ts`); Go uses `*big.Int` and `*Decimal`
(`go/decimal.go`). Both are **pointer/immutable** pegs — clones share
them, nothing mutates them in place — which is why identity must compare
the *number* and never the peg address in Go, nor object identity in TS.
`generate()` hands these native types out, so TypeScript ships its own
JSON emitter (`exactJSON`, `ts/src/exactjson.ts`); `JSON.stringify`
throws on a `bigint`. Its bytes must stay identical to Go's
`encoding/json` with `SetEscapeHTML(false)` — the `gens` rows are what
hold the two together. See
[`docs/reference-api.md`](../../docs/reference-api.md#exact-numbers-and-exactjson)
for the consumer-facing contract.

Where the rules are pinned: `test/spec/number-model.tsv` (the kind
rules), `test/spec/number-tower.tsv` (the exact leaves), and
`test/spec/number-cross-product.tsv` (the closed ordered-pair table for
`+`). The reasoning is in
[`docs/design/number-model.md`](../../docs/design/number-model.md) and
[`docs/design/number-tower.md`](../../docs/design/number-tower.md); the
user-facing rules are in
[`docs/reference-language.md`](../../docs/reference-language.md#the-four-numeric-leaves).
