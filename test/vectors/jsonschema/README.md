# The JSON Schema Test Suite, vendored

`tests/draft2020-12/` and `remotes/` are the official
[JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite)
as it ships inside the `json/` directory of the `jsonschema` 4.26.0
source distribution on PyPI (`jsonschema-4.26.0.tar.gz`, SHA-256
`0c26707e2efad8aa1bfc5b7ce170f3fccc2e4918ff85989ba9ffa9facb2be326`),
copied byte for byte on 2026-10-01. That distribution pins the suite as
a submodule, so the files here are one upstream commit; the pin is the
distribution's digest because the environment the copy was made in
could reach PyPI and not GitHub. `LICENSE` is the suite's own.

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
