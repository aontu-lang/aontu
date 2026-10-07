# JSON-Schema-Test-Suite

The official JSON Schema test suite, vendored as the conformance corpus
of `aontu jsonschema import`
([G12, section 16](../../../docs/capability-review/g12-jsonschema-fidelity.md#16-conformance)).

| | |
|---|---|
| Upstream | <https://github.com/json-schema-org/JSON-Schema-Test-Suite> |
| Commit | `5b0ee1613e45fcc2bddac00e07c19cd49b00d8a8`, read 2026-10-06 |
| Licence | MIT, in [`LICENSE`](LICENSE), unchanged |

Vendored unchanged: `tests/draft2020-12/` with its `optional/` and
`optional/format/` directories, `remotes/`, and `annotations/`. The
suite's other drafts arrive with the legacy dialects.

## How it is run

[`ts/test/vectors.test.ts`](../../../ts/test/vectors.test.ts) and
[`go/vectors_test.go`](../../../go/vectors_test.go) read the same files.
Each imports a group's schema once, from the schema's own text, and
vets each instance, from its own text, as
`vet --at '$.schema' --no-fill --exact-numbers` does. A file under
`optional/format/` is imported with format assertion on, the
`formatAssertion` option, since those files ask what a validator that
asserts formats answers. A test is honoured when the import stands up
and the verdict is `valid` exactly where the suite says `valid: true`. Evaluating the import and the
instance as one document must agree with `vet` on every test the
import answers, honoured or not.

The import of each schema is handed `remotes/` as its document set,
each file under the URI the suite serves it from,
`http://localhost:1234/` and its path: the files of `draft2020-12/`,
and of `draft2019-09/`, which one 2020-12 test refers to. The other
releases' directories are not handed over: no 2020-12 test names
them, and draft 6 and draft 7 write an anchor as an `$id` with a
fragment, which a 2020-12 import refuses. A document is
read when a reference first reaches it, by that URI or by an `$id`
inside it.

## The skip ledger

[`skips.tsv`](skips.tsv) lists, one line each, the tests the import does
not honour yet: the file under `tests/`, the group and the test as the
suite describes them, what the import says it lost or the code it
refused the schema with, and the phase that carries it. Both runners
read it, and a run fails on any of these:

- a test that is not honoured and not listed;
- a listed test that is honoured, whose line the fix deletes;
- a line whose construct is not what the import says;
- a line naming no test in the suite;
- more lines than the bound on the ledger's first line, which each
  phase lowers as it lands.

## The annotations

`annotations/` asks which annotations an instance collects where. Each
assertion names an instance location, a keyword, and the values the
schema gives it there. Both runners import a case's schema, meet each
instance with it, and read the `meta()` and `deprecate()` riders at the
location; an assertion is honoured when they hold exactly the values
it names. The values are compared as a set: which schema location gave
each is not compared. A case the suite marks only for releases other
than 2020-12, by its `compatibility`, is not read.

[`annotation-skips.tsv`](annotation-skips.tsv) is its ledger, read
under the same rules as `skips.tsv`, one line per assertion: the file
under `annotations/tests/`, the case, the test's place in it from 1,
the location and keyword, what the import says it lost, `-` when it
lost nothing, and the phase that carries it.
