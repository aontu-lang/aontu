# Ajv's extra tests

The tests Ajv adds to the official suite in the suite's own shape,
vendored as a second corpus for `aontu jsonschema import`
([G12, section 16](../../../docs/capability-review/g12-jsonschema-fidelity.md#16-conformance)).

| | |
|---|---|
| Upstream | <https://github.com/ajv-validator/ajv> |
| Commit | `f177fe323420ccb23e1a79445fd470cbf80aee7c`, read 2026-10-06 |
| Licence | MIT, in [`LICENSE`](LICENSE), unchanged |

Vendored unchanged: `spec/extras/const.json`, `contains.json`,
`exclusiveMaximum.json` and `exclusiveMinimum.json`. Ajv's `$data`
tests are not vendored: `$data` is an Ajv extension, not JSON Schema.

Both runners read this corpus as they read the official suite
([`../jsonschema/README.md`](../jsonschema/README.md)), against its own
[`skips.tsv`](skips.tsv) under the same rules.
