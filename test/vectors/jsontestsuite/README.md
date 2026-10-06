# JSONTestSuite

The RFC 8259 parser cases of JSONTestSuite, vendored to hold the two
readers a JSON text meets in aontu to an answer per file
([G12, section 16](../../../docs/capability-review/g12-jsonschema-fidelity.md#16-conformance)).

| | |
|---|---|
| Upstream | <https://github.com/nst/JSONTestSuite> |
| Commit | `1ef36fa01286573e846ac449e8683f8833c5b26a`, read 2026-10-06 |
| Licence | MIT, in [`LICENSE`](LICENSE), unchanged |

Vendored unchanged: `test_parsing/`. A `y_` file is JSON a parser must
accept, an `n_` file text it must refuse, and an `i_` file a case
RFC 8259 leaves to the parser.

## How it is run

[`ts/test/vectors.test.ts`](../../../ts/test/vectors.test.ts) and
[`go/vectors_test.go`](../../../go/vectors_test.go) put every file
through two readers:

- **instance**: the file as the data of `vet --exact-numbers` against
  `any`, read as `vet` reads a data file. It accepts when the verdict
  is `valid`. aontu's own syntax is a superset of JSON, so this reader
  accepts many `n_` files, and the ledger says why for each.
- **import**: the file as the schema text of `aontu jsonschema import`,
  which reads JSON alone. It accepts unless the import refuses the
  text as not JSON; a JSON text that is not a schema is still read.

[`skips.tsv`](skips.tsv) lists each answer that is not the file's own,
and every `i_` file for both readers, with the reason. A run fails on
an answer the ledger does not list or lists differently, and on a line
that answers as the corpus says.
