# The JSON Schema Test Suite, vendored

`tests/draft2020-12/`, `remotes/` and `annotations/` are the official
[JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite)
at commit `5b0ee1613e45fcc2bddac00e07c19cd49b00d8a8`, copied byte for
byte on 2026-10-08. `tests/draft2019-09/`, `tests/draft7/`,
`tests/draft6/` and `tests/draft4/` are the same commit's directories
for the earlier dialects, copied byte for byte on 2026-10-09. `LICENSE`
is the suite's own. The copy before it came from the `json/` directory
of the `jsonschema` 4.26.0 source distribution on PyPI, which pins an
older commit of the same suite.

The runners are `ts/test/jsonschema-suite.test.ts` and
`go/jsonschema_suite_test.go`. Each imports every schema with the
JSON Schema importer, runs `vet --no-fill --exact-numbers` on every
instance, and requires the verdict to be `valid` exactly when the suite
says the instance is valid. Each also requires the admission trial to
agree with `vet` on every instance: the vet-equals-eval differential of
G12.

`skips.tsv` is the skip ledger: one row per upstream test the importer
cannot yet honour, naming the construct it waits on and the reason, in
the columns `file`, `group`, `test`, `construct`, `reason`. A `*` in
`group` and `test` lists a whole file, one in `test` a whole group. A
listed test that passes fails the run, so a fix deletes its own rows,
and the ledger may not grow past the bound both runners carry, which
the capability-review register tightens phase by phase.

Each earlier dialect's directory runs with that dialect as the import's
default, `draft-04` for `tests/draft4/` and so on, since most of its
schemas name none, and has a ledger of its own under the same three
rules and its own bound: `skips-draft2019-09.tsv`, `skips-draft7.tsv`,
`skips-draft6.tsv` and `skips-draft4.tsv`.

`annotations/` holds the suite's annotation tests: each assertion names
a location in an instance, a keyword, and the values the schema
annotates that location with. `ts/test/jsonschema-annotations.test.ts`
and `go/jsonschema_annotations_test.go` import each schema, meet it with
the instance, and read the `meta` and `deprecate` riders at the
location, as a set of values, since a record holds each value once and
does not say which schema location wrote it. `annotations/skips.tsv` is
their ledger, in the same columns, under the same three rules and its
own bound.
