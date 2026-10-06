# JSON-Schema-Test-Suite

The official JSON Schema test suite, vendored as the conformance corpus
of `aontu jsonschema import`
([G12, section 16](../../../docs/capability-review/g12-jsonschema-fidelity.md#16-conformance)).

| | |
|---|---|
| Upstream | <https://github.com/json-schema-org/JSON-Schema-Test-Suite> |
| Commit | `5b0ee1613e45fcc2bddac00e07c19cd49b00d8a8`, read 2026-10-06 |
| Licence | MIT, in [`LICENSE`](LICENSE), unchanged |

Vendored unchanged: `tests/draft2020-12/` with its `optional/`
directory, and `remotes/`. The suite's `optional/format/` arrives with
format assertion, and its other drafts with the legacy dialects.

## How it is run

[`ts/test/vectors.test.ts`](../../../ts/test/vectors.test.ts) and
[`go/vectors_test.go`](../../../go/vectors_test.go) read the same files.
Each imports a group's schema once, from the schema's own text, and
vets each instance, from its own text, as
`vet --at '$.schema' --no-fill --exact-numbers` does. A test is
honoured when the import stands up and the verdict is `valid` exactly
where the suite says `valid: true`. Evaluating the import and the
instance as one document must agree with `vet` on every test the
import answers, honoured or not.

`remotes/` is not read yet: the import reads one document, so a test
whose schema names another is refused, and listed.

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
