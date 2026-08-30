# 15 — code generation

**One model, three generated files, each over a different slice of it.**
Go structs, TypeScript interfaces and SQL DDL — every *file* computed
by the unifier from [`model.aon`](model.aon) and nothing else.

Until [G9 phase 2](../../docs/capability-review/g9-transformation.md)
landed that said *every line*, and the file was assembled by six lines
of Python, because putting a separator between N items is a fold and
the language had none. `join` is that fold. The host now writes bytes
and decides nothing.

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

**The generated Go compiles and the generated SQL parses.** `check.sh`
builds the Go with a real toolchain when one is present, and opens the
SQL in SQLite and checks the tables and columns really exist. A
generator whose output merely looks right is a generator nobody
trusts.

## The shape a transform takes today

```aon
units: [&: {
  head: `type ` + .name + ` struct {`
  rows: [&: { out: `\t` + .go + ` ` + match(.t, "string", `string`, …) }] & .fields
  body: join(pick(.rows, out), `\n`)
  tail: `}`
  text: .head + `\n` + .body + `\n` + .tail
}] & $.records

file: join(pick($.units, text), `\n\n`) + `\n`
```

Five things in that are not obvious, and each was probed:

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
- **`join` folds twice, at two scales.** Once over a record's column
  lines and once over the records themselves, with a different
  separator each time. That is the whole of file assembly, and it is
  why there is no `lines` and no `concat`: a separator argument covers
  both, and `join(coll)` with none is concatenation.
- **Names come from the model, not the emitter.** `Email` and
  `credit_cents` are written in `model.aon`. The language cannot
  compute them: `upper()` uppercases a *whole* string, so it yields
  `EMAIL`, and there is no substring, no case conversion and no
  `replace`. This is also the right answer — what a type is *called*
  in a target is a fact about the model, not a rule in a template,
  which is the "symbol provider" split every surviving code generator
  arrives at.

## The primitive that was missing, and now is not

`expected/schema.sql` used to read:

```sql
CREATE TABLE "customer" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "credit_cents" BIGINT,
);
```

That trailing comma made the file invalid, and `check.sh` proved it by
handing the golden to a real SQL parser and requiring a syntax error.
Nothing in the language could remove it: a spread puts a separator
**after** each element, and putting one **between** N elements is a
fold.

`join(coll, sep?)` landed as
[G9 phase 2](../../docs/capability-review/g9-transformation.md) — one
entry in the function registry, no grammar change — and the same check
is now inverted. The golden parses, and `check.sh` opens it in SQLite
and asserts the tables and columns the model describes really exist:

```sql
CREATE TABLE "customer" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "credit_cents" BIGINT
);
```

It folds with `+` seeded with `""`, exactly as `sum` folds with `add`
seeded with `0`, so the number-to-text rule is `+`'s own — the two
share a renderer rather than agreeing by inspection.

## What this case found

Building it turned up an unrecorded parity break, now
[BUGS 63](../BUGS.md): inside `hide()`, the Go port does not resolve a
spread template's relative reference, so the obvious spelling —
staging the rows into a *hidden* key so the scaffolding stays out of
the output — generates in TypeScript and refuses in Go with
`mapval_no_gen`. Opposite exit codes, same document.

The transforms therefore leave `rows` unhidden, and it rides in the
evaluated value that `$.file` never reads. `check.sh`'s last check
asserts both ports emit identical bytes; without it this directory
would have shipped a TypeScript-only transform that looked fine — and
now that the fold happens *inside* the language rather than in the
host, that check covers the separators and the ordering too, which is
where two ports would part company first.

§63 is still open. Landing `join` did not touch it: the same document
still generates in one port and refuses in the other. What did change
is that it is no longer alone — it turns out to be
[G9 phase 0 item 2](../../docs/capability-review/g9-transformation.md)
reached from the other side, so one fix in `go/func.go` closes both.

## What is deliberately not here

- **No `render` or `gen` verb.** Those are later G9 phases and
  unbuilt. This case uses `aontu get` and writes the answer to a file,
  so it shows the language rather than a tool that does not exist.
- **No hand-edited regions, no merge, no file writing.** That is
  Jostraca's half of G9 (`docs/design/GENERATION-FORMS.0.md`).
- **No constraint enforcement in the output.** The model here carries
  no `min`/`max`/`re`, because a constraint the target's type system
  cannot express has to become a generated *validator*. The fold that
  blocked it has landed, so this is now the natural next example
  rather than a blocked one.
