# Shared test specification (`test/spec/*.tsv`)

The `test/spec/` directory holds the **language-agnostic** unit tests
that both the TypeScript (`ts/`) and Go (`go/`) implementations of Aontu
must satisfy. They are plain tab-separated-value (TSV) files so they can
be parsed trivially and identically from any language.

Both runners load the same files:

- TypeScript: `ts/test/spec.test.ts`
- Go: `go/spec_test.go`

## File format

Each `.tsv` file is a list of test rows. Lines that are empty or begin
with `#` are ignored (used for headers and comments).

A row has four tab-separated columns:

```
name <TAB> mode <TAB> src <TAB> expect
```

| column   | meaning                                                        |
|----------|----------------------------------------------------------------|
| `name`   | short identifier for the case (unique within its file)         |
| `mode`   | `canon`, `gen`, `gens`, `err`, `errc`, `errcode`, `vet`, `subsume`, `query`, `why`, `patch`, `diff`, `agentsmd`, `trim`, `hcanon`, `hash`, `fmt`, `graph`, `relation`, `reaches`, `view` or `views` (see below) |
| `src`    | Aontu source text to evaluate                                  |
| `expect` | the expected result, interpreted according to `mode`          |

Seven modes take a FIFTH column. `vet` validates a data document
against a schema document, `subsume` compares two documents, `query`
and `why` each select a path within one, and `patch` carries the
overlay and the assignments as a JSON object, `diff` carries the
second document, and `agentsmd` carries the name to call the
document, so each has a second input: `src` is the schema (or the general document, or the
document), the fourth column is the data (or the specific document, or
the path), and `expect` moves to the fifth. Every other mode reads the first four columns and ignores
anything after them, which is what makes the extra column additive
rather than a format change:

```
name <TAB> vet <TAB> schema <TAB> data <TAB> expect
name <TAB> subsume <TAB> general <TAB> specific <TAB> expect
name <TAB> query <TAB> src <TAB> path <TAB> expect
name <TAB> why <TAB> src <TAB> path <TAB> expect
name <TAB> patch <TAB> entry <TAB> {overlay,set} <TAB> expect
name <TAB> diff <TAB> left <TAB> {right,at} <TAB> expect
name <TAB> agentsmd <TAB> src <TAB> document-name <TAB> expect
```

### Modes

| mode    | assertion                                                       |
|---------|-----------------------------------------------------------------|
| `canon` | `unify(src)` then its canonical form must equal `expect`        |
| `gen`   | `generate(src)` must deep-equal `JSON.parse(expect)`            |
| `gens`  | `generate(src)` serialised as compact JSON must equal `expect` **byte for byte** |
| `err`   | `generate(src)` must raise an error whose message contains `expect` |
| `errc`  | `generate(src)` must raise an error whose FIRST failure's why-code **equals** `expect` |
| `errcode` | registry row: `name` is an error code, `src` its class, `expect` its since-version—asserted against the engine's code→class table |
| `vet`   | five columns: `vet(schema, data)` must produce the report `expect` describes, MINUS each finding's message |
| `subsume` | five columns: `subsume(general, specific)` must produce the report `expect` describes (verdict + findings), MINUS each finding's message |
| `query` | five columns: `get(src, path)` must produce the report `expect` describes (`out`, or `code`/`note`; options ride `opts`), and a canon-shaped VIEW must additionally SUBSUME the truth it summarises |
| `why`   | five columns: `why(src, path)` must produce the record `expect` describes (`value` and the ordered `conjuncts`, or `code`/`note`) |
| `patch` | five columns: `patch(entry, overlay, set)` must produce the report `expect` describes (`appended`, `overlay`, `verdict`, and `codes` when there are findings), and the result must be ORDER-INDEPENDENT—entry-against-overlay and overlay-against-entry must reach the same verdict |
| `diff`  | five columns: `diff(left, right)` must produce the report `expect` describes (`changes`, `same`, and `codes` when a document does not stand up), and must be SYMMETRIC—swapping the sides reports the same paths with added and removed exchanged |
| `agentsmd` | five columns: the stanza of `agentsMd(src, {name})` must match `expect` BYTE FOR BYTE |
| `trim`  | `trimCheck(src)` must produce the report `expect` describes (`{redundant, verdict}`) |
| `relation` | `relationCheck(src)`—acyclicity and inverse consistency over the edge set—must produce the report `expect` describes (`verdict` and the ordered `findings`) |
| `reaches` | `reachCheck(src, from, to, {relation?})`—transitive reachability over the entity graph—must produce the report `expect` describes (`verdict` and, when it reaches, the shortest `path`). The endpoints ride `expect.ask` as `{from, to, relation?}`, since the same document answers differently for different pairs |
| `view` | `view(src, ask)`—a figure of the document (tree, matrix, graph, layer, sets, layers, ladder or poset) as text, with the loss report—must produce the report `expect` describes (`kind`, `verdict`, the rendered `text` byte for byte and `loss`, or `errors`). The options ride `expect.ask`, the whole ViewOptions object with `kind`, since the same document draws differently under a relation filter, from a named root, in another order or profile; a poset's further documents ride `ask.docs` as `{src, name}` |
| `views` | `viewSet(src, ask)`—the figures a VIEW DOCUMENT declares (VIEWS.0.md, "6. The view document"), read out of the evaluated document at `ask.views`—must produce the report `expect` describes: the set's `verdict`, and one entry per figure in declaration-key order carrying its `name`, `kind`, `out`, `verdict`, rendered `text` and `loss`, or its `errors`. A fault in the declarations themselves is the set's own `errors` and no figures at all |
| `graph` | the DERIVED GRAPH of `unify(src)`—the entity index and the edge set—must equal `expect` as JSON, and must be the same bytes again on a fresh engine |
| `hcanon` | `unify(src)` then its HASH FORM—canon plus the `close()`/`type()`/`hide()` wrappers—must equal `expect`, and that text must round-trip through the engine unchanged |
| `hash`  | `canonHash(unify(src))` must equal `expect`, the full `aon1-…` pin |
| `fmt`   | `format(src)`, the source in its agreed form, must equal `expect` **byte for byte**; `expect` must be a fixed point, `format(expect) == expect`; and where `src` evaluates, the canon-hash of `src` and of `expect` must agree, because formatting never changes the document |

Every mode above is dispatched by name in `ts/test/spec.test.ts` and
mirrored by `go/spec_test.go`—the newer `vet`, `graph`, `relation`
and `reaches` modes included. Recursive schemas need no mode of their
own: their rows live in
[`test/spec/recursion.tsv`](../test/spec/recursion.tsv) and pin the
fixpoint through the ordinary modes (mostly `gens` and `errc`).

For `gen`, the generated value and the expected JSON are compared
structurally (numeric type and object key order do not matter). That
comparison is weaker than it looks, and choosing the wrong mode because
of it is the commonest way to write a row that cannot fail—see
[Choosing a mode](#choosing-a-mode).

`gens` is the byte-exact counterpart: no decode happens on either side,
so the row pins the serialised text—digits, exponent form, key order,
string escaping and all. Because `gen` normalises both sides through
JSON, every number lands in a `float64` and two distinct exact integers
above 2^53 compare *equal*; `gens` is the mode that can tell them apart,
and the one the number tower's exact leaves are pinned with
([`docs/design/number-tower.md`](design/number-tower.md), D10). The
serialisation contract both runners implement is: compact (no
indentation, no spaces), object keys in lexicographic order, and no HTML
escaping of `<`, `>` or `&`. The key order is the EMITTER's doing, not
`generate`'s: a JavaScript object cannot hold `"10"` before `"9"`
(ECMAScript hoists canonical array-index keys, ascending), so TypeScript
sorts in `exactJSON` and Go gets the same order from `encoding/json`,
which sorts map keys.
Each runner uses its port's real emitter—aontu's own `exactJSON`
export in TypeScript (`JSON.stringify` throws on the `bigint` a
biginteger generates as), `encoding/json` with `SetEscapeHTML(false)`
in Go—so a `gens` row pins the bytes a *caller* gets, not bytes
invented for the test.

**`canon` pins kind, `gens` pins bytes, `gen` is blind to both.** An
integral float serialises as `1` under `gens` and canons as `1.0`; two
exact integers above 2^53 differ under `gens` and are indistinguishable
under `gen`. No one mode replaces another.

One thing even `gens` cannot see: the *runtime type* `generate` returns.
A biginteger and an ordinary integer of the same value serialise to the
same text, so `gens` stays green if a port hands back a `number` where a
`bigint` was due. That half of the contract is pinned by per-port API
tests (`ts/test/exactjson.test.ts`, `go/generate_test.go`) instead.

`errc` is `err`'s code-exact counterpart. Thrown-error message text
is in cross-port parity (marker, headline, verbatim hints,
source frames—byte-guarded by the full-message twin tests), but an
`err` row still asserts only a probed shared substring—rows outlive
renderer changes; the twins pin the renderer. The error *codes* (the `NilVal` `why`, for example
`scalar_value`, `no_path`, `mapval_no_gen`) ARE in parity, and an
`errc` row pins which code a given source raises—TypeScript asserts
`errs()[0].why` on the thrown `AontuError`, Go asserts
`AontuError.Code`. Use `errc` when the point is *which* failure this
is: notably, the conflict/incomplete distinction ("this data can never
satisfy the truth" versus "this data has not yet supplied everything
the truth requires") that a message substring cannot express.

`errcode` rows are not evaluations at all: they are the error-code
REGISTRY. [`test/spec/errcodes.tsv`](../test/spec/errcodes.tsv)
registers every code either engine can raise, with a CLASS (`conflict`,
`incomplete`, `reference`, `parse`, `budget`, `internal`) and the
version line at which the code was registered. Each row asserts the
code exists in the engine's code→class table (`codeClasses` in
`ts/src/hints.ts` and `go/hints.go`) with the registered class, and a
separate per-runner test asserts SET EQUALITY between the file and the
table, so neither side can grow or drop a code silently. Codes are
append-only and never renamed; class changes are breaking. The class
rulings are documented in the file's header.

`vet` rows carry TWO documents and a JSON report.
[`test/spec/vet.tsv`](../test/spec/vet.tsv) pins the validation verb
(`aontu vet`): `src` is the schema, the fourth column is the data,
and the fifth is the report `vet(schema, data)` must produce. Both sides
of that comparison are re-emitted through the same serialiser before
comparing, so the golden may be written in any key order, and the run's
options ride in the golden under a reserved `opts` key (`at`, `closed`,
`partial`, `maxErrors`) rather than in a sixth column that most rows
would leave empty.

Each finding's `message` is EXCLUDED from the golden. It is the one part
of a report that is prose, and prose is not in cross-port parity—the
same split the `errc` mode makes, and the reason `errc` exists at all.
Everything else in the report *is* contractual: the verdict, the
truncation flag, and each finding's code, class, severity, path, sites
(file, row, column, role, value) and the `expected`/`actual`/`note` the
constraint algebra attaches. The two documents are named `schema` and
`data` by the runner rather than by a path, so the goldens do not depend
on where the suite is checked out.

### Escapes

Because the delimiter is a tab and rows are single lines, the following
escapes are recognised in both `src` and `expect` and expanded before
use:

| escape | becomes      |
|--------|--------------|
| `\n`   | newline      |
| `\t`   | tab          |
| `\\`   | backslash    |

A `vet` golden is JSON, and JSON strings escape their own quotes, so a
golden carrying a quoted canon (`"value":"\"8080\""`) writes those
backslashes DOUBLED in the cell—the escape pass above runs first, and
un-doubling them is what leaves the JSON intact.

This lets a single row carry multi-line source, for example:

```
override	gen	a:*1|number\na:2	{"a":2}
```

which evaluates the two-line source

```
a:*1|number
a:2
```

and expects `{ "a": 2 }`.

## Choosing a mode

**`canon` pins kind, `gens` pins bytes, and `gen` is blind to both.**
This is the single most useful thing to know about the suite.

Aontu has four numeric leaf kinds—`integer`, `float`, `biginteger`,
`bigdecimal`—and JSON has one number type. A `gen` row round-trips the
result through JSON, so the kind is gone before the comparison happens,
and so is any precision beyond a `float64`. Canon, by contrast, must
reparse to a value of the *same* kind, so a float-kind scalar always
renders with a fraction or an exponent:

| Source  | `gen`     | `gens`    | `canon`     |
|---------|-----------|-----------|-------------|
| `x:1`   | `{"x":1}` | `{"x":1}` | `{"x":1}`   |
| `x:1.0` | `{"x":1}` | `{"x":1}` | `{"x":1.0}` |

The two sources are indistinguishable in the two middle columns—`gens`
pins bytes, and the bytes of an integral float are those of an
integer—and distinct only in the right-hand one. So:

> **A behaviour that distinguishes numeric kinds MUST be pinned by a
> `canon` row or an `err` row—never by `gen` alone. A behaviour that
> turns on exact digits MUST be pinned by a `gens` row.**

A `gen` row accepts whichever kind the implementation happens to
produce. It stays green while the kind is wrong, which is exactly how a
kind defect survives a passing suite—and how one port can drift from
the other without any row noticing.

For a value on one of the **exact leaves**, `gen` is worse than weak—it
is unusable, and the two runners do not even fail the same way. Go
marshals and re-decodes both sides into `float64`, so a `gen` row on
`x:0d9007199254740993` passes against `{"x":9007199254740992}` *and*
against `{"x":9007199254740993}`; TypeScript compares the generated
`bigint` with `deepStrictEqual`, which is type-strict, so the same row
fails against either. Write `gens` (or `canon`) and the question does
not arise. Every `gen` row that mentions `0d` in the suite today is one
where no exact value reaches the output at all—the marker is text, a map
key, or `hide`-marked away.

- Use `canon` when the point is which kind is *produced*: `x:1.5+1.5`
  canons to `{"x":3.0}`, whereas its `gen` value is `{"x":3}`—which
  would pass just as happily if the sum had wrongly come out an
  integer.
- Use `err` when the point is that a kind is *rejected*:
  `x:(1.5+1.5) & integer` must fail.
- `gen` remains the right mode for a *value's structure*, and reads
  most clearly when the shape is the point.
- Use `gens` when the point is the exact *bytes*: which digits are
  emitted, which exponent form, which key order, how a string is
  escaped. It is the only mode that can distinguish two exact integers
  above 2^53, since `gen` collapses both to the same `float64`, and the
  only one that checks the JSON text a caller actually receives.

The same blindness applies to everything else JSON flattens—`gen`
ignores object key order too—but numeric kind is the case that bites,
because it is invisible rather than merely unordered.

The kind rules themselves are pinned by
[`test/spec/number-model.tsv`](../test/spec/number-model.tsv) and the
exact leaves by
[`test/spec/number-tower.tsv`](../test/spec/number-tower.tsv); the
reasoning behind them is in
[`docs/design/number-model.md`](design/number-model.md) and
[`docs/design/number-tower.md`](design/number-tower.md).

## Adding cases

1. Pick (or add) a thematic file. `scalar.tsv`, `map.tsv`, `list.tsv`,
   `conjunct.tsv`, `disjunct.tsv`, `pref.tsv` and `error.tsv` cover the
   core language; `number-model.tsv` covers the numeric kind rules,
   `number-tower.tsv` the exact leaves the tower adds to them, and
   `number-cross-product.tsv` the closed ordered-pair table for `+`; and
   `spread.tsv` plus the `spread-*.tsv` family take one spread topic per
   file.
2. Pick the mode that can actually fail for the behaviour you are
   pinning—see [Choosing a mode](#choosing-a-mode).
3. **Obtain the expected value by running both implementations and
   requiring them to agree.** Never copy it out of one engine: that
   baselines a divergence as the contract. From the repository root:

   ```sh
   echo 'x:1.0' | node ts/dist/cli.js -c
   (cd go && echo 'x:1.0' | go run ./cmd/aontu -c)
   ```

   Drop `-c` from both for a `gen` row. The TypeScript CLI runs the
   committed build, so run `make build-ts` first if `ts/src` has
   changed.

   Neither CLI prints compact JSON, so a `gens` expectation cannot be
   read off these two commands. Probe it through each engine's library
   instead—`exactJSON(new Aontu().generate(src))` in TypeScript,
   `Generate(src)` through an `encoding/json` encoder with
   `SetEscapeHTML(false)` in Go—and require the two texts to be
   byte-identical before writing the row. Use `exactJSON` (exported from
   `aontu`), **not** `JSON.stringify`: the latter throws on the `bigint`
   a biginteger generates as, and it is `exactJSON` that the `gens`
   runner and the CLI both call.
4. Append the row, then run `make test-ts` and `make test-go`.
5. Only commit rows that pass in **both** implementations—the spec
   defines shared, agreed behaviour.

## The divergence ledger

[`test/spec/divergent.tsv`](../test/spec/divergent.tsv) is the opposite
register: behaviours where the two ports are known to **disagree** and
which cannot be fixed from this repository right now—because the cause
is in a pinned dependency, or because which side is correct is still an
open question.

It lives beside the suite so it is read whenever the spec is read, but
it carries no data rows. A row there would be executed by both runners
and, by definition, could not pass in both, so the file is entirely
commentary and contributes zero cases. Recording a divergence there is a
deliberate, reviewed act rather than a way to quieten a failing row; the
rules for an entry are in [`AGENTS.md`](../AGENTS.md).
