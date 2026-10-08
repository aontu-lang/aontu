# JSONTestSuite, vendored

`test_parsing/` is the `test_parsing` directory of
[JSONTestSuite](https://github.com/nst/JSONTestSuite) at commit
`1ef36fa01286573e846ac449e8683f8833c5b26a`, copied byte for byte on
2026-10-08. `LICENSE` is the suite's own (MIT).

Each file is one JSON text, named by what an RFC 8259 parser must do
with it: `y_` accept, `n_` refuse, and `i_` either, at the
implementation's choice. The runners, `ts/test/jsonschema-suite.test.ts`
and `go/jsonschema_suite_test.go`, read each file as an instance of the
schema `true` and run `vet --no-fill --exact-numbers` on it, so the
case is the instance reader that G12 phase 3 names: a `y_` file must
vet `valid` and an `n_` file must not.

`skips.tsv` is the skip ledger, in the columns of the official suite's
ledger, `file`, `group`, `test`, `construct` and `reason`, under the
same rules: a listed case that passes fails the run, and the ledger may
not grow past the bound both runners carry. Most of its rows are one
fact: aontu source is a superset of JSON, so the reader accepts an
unquoted word, a trailing comma or a list left open where JSON refuses
it, and the `construct` column names which.

`decisions.tsv` pins aontu's answer for each `i_` file, `true` where
it reads the text and `false` where it refuses it, with the reason.
Both runners require that answer, so the two ports make the same
choice.
