# Ajv's extra tests, vendored

`tests/` holds four files of `spec/extras/` from
[Ajv](https://github.com/ajv-validator/ajv) at commit
`f177fe323420ccb23e1a79445fd470cbf80aee7c`, copied byte for byte on
2026-10-08: `const.json`, `contains.json`, `exclusiveMaximum.json` and
`exclusiveMinimum.json`. They are triples in the official suite's
shape. `LICENSE` is Ajv's own (MIT).

The rest of `spec/extras/`, the `$data/` directory, is not vendored:
`$data` is Ajv's own extension, a reference from a schema keyword into
the instance, and no draft of JSON Schema defines it.

The runners, `ts/test/jsonschema-suite.test.ts` and
`go/jsonschema_suite_test.go`, read these files exactly as they read
the official suite: import each schema, run `vet --no-fill
--exact-numbers` on each instance, and require the suite's verdict.
`skips.tsv` is the ledger, under the same rules and with its own
bound.
