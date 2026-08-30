# 15 — code generation

**One model, three generated files, each over a different slice of it.**
Go structs, TypeScript interfaces and SQL DDL, every line computed by
the unifier from [`model.aon`](model.aon) and nothing else.

This is the corpus [G9](../../docs/capability-review/g9-transformation.md)
asks for before its later phases are committed to: a real transform,
written in today's language, showing what works and exactly where the
boundary is.

```sh
./check.sh          # eight checks, including both ports byte for byte
```

## What is generated

| transform | reads | writes | golden |
|---|---|---|---|
| [`gen-go.aon`](gen-go.aon) | `name`, `fields.n`, `fields.t`, `fields.go` | Go structs with JSON tags | [`expected/types.go`](expected/types.go) |
| [`gen-ts.aon`](gen-ts.aon) | `name`, `fields.n`, `fields.t`, `fields.req` | TypeScript interfaces | [`expected/types.ts`](expected/types.ts) |
| [`gen-sql.aon`](gen-sql.aon) | `sql`, `fields.sql`, `fields.t`, `fields.req` | `CREATE TABLE` statements | [`expected/schema.sql`](expected/schema.sql) |

The Go emitter never reads `sql`; the SQL emitter never reads `go`;
the TypeScript emitter reads neither. `check.sh` proves the slices are
real rather than asserting them — it renames a `go` field in a copy of
the model and requires the Go output to move and the TypeScript output
to stay byte-identical.

**The generated Go compiles.** `check.sh` builds it with a real Go
toolchain when one is present. A generator whose output merely looks
right is a generator nobody trusts.

## The shape a transform takes today

```aon
units: [&: {
  head: `type ` + .name + ` struct {`
  rows: [&: { out: `\t` + .go + ` ` + match(.t, "string", `string`, …) }] & .fields
  body: pick(.rows, out)
  tail: `}`
}] & $.records
```

Four things in that are not obvious, and each was probed:

- **A list spread, not `pack`.** List order is *source* order. `pack`
  keys by data and map keys sort by code point, so `pack`-then-`pick`
  emits the records alphabetically — silently wrong output for a file.
- **Backtick strings carry the target text.** They are multi-line and
  they process escapes, so `\t` and an escaped backtick both work, and
  both ports agree byte for byte. This is undocumented in
  `docs/reference-language.md` and pinned by a single spec row
  (`edge.tsv:71`).
- **The rows are staged into a key of their own.** `pick` over an
  inline spread expression does not settle; staging it into a named
  sibling makes it. It cannot be `hide()`d — see below.
- **Names come from the model, not the emitter.** `Email` and
  `credit_cents` are written in `model.aon`. The language cannot
  compute them: `upper()` uppercases a *whole* string, so it yields
  `EMAIL`, and there is no substring, no case conversion and no
  `replace`. This is also the right answer — what a type is *called*
  in a target is a fact about the model, not a rule in a template,
  which is the "symbol provider" split every surviving code generator
  arrives at.

## The one missing primitive

Look at `expected/schema.sql`:

```sql
CREATE TABLE "customer" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "credit_cents" BIGINT,
);
```

That trailing comma makes the file invalid, and `check.sh` proves it —
it hands the golden to a real SQL parser and requires a syntax error.
Nothing in the language can remove it. A spread puts a separator
**after** each element; putting one **between** N elements is a fold,
and Aontu has no fold over strings: `sum` is numeric, `+` does not
reduce a list, and indexed concatenation needs the arity known in
advance.

The same gap is why `check.sh` folds the unit list into a file with
six lines of Python. Every *line* is computed by the unifier; only the
assembly is not.

`join(bag, sep)` is [G9 phase 2](../../docs/capability-review/g9-transformation.md),
one entry in the function registry and no grammar change. It is the
whole difference between this directory and a code generator.

## What this case found

Building it turned up an unrecorded parity break, now
[BUGS 63](../BUGS.md): inside `hide()`, the Go port does not resolve a
spread template's relative reference, so the obvious spelling —
staging the rows into a *hidden* key so the scaffolding stays out of
the output — generates in TypeScript and refuses in Go with
`mapval_no_gen`. Opposite exit codes, same document.

The transforms therefore leave `rows` unhidden, and it rides in the
evaluated value where the fold ignores it. `check.sh`'s last check
asserts both ports emit identical bytes; without it this directory
would have shipped a TypeScript-only transform that looked fine.

## What is deliberately not here

- **No `render` or `gen` verb.** Those are G9 and unbuilt. This case
  uses `aontu get` and a shell fold, so it shows the language rather
  than a tool that does not exist.
- **No hand-edited regions, no merge, no file writing.** That is
  Jostraca's half of G9 (`docs/design/GENERATION-FORMS.0.md`).
- **No constraint enforcement in the output.** The model here carries
  no `min`/`max`/`re`, because a constraint the target's type system
  cannot express has to become a generated *validator*, and that needs
  the fold too. It is the natural next example once `join` lands.
