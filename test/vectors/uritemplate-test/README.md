# uritemplate-test

The URI Template tests, vendored to hold `uri-template` to an answer
per template
([G12, section 5](../../../docs/capability-review/g12-jsonschema-fidelity.md#5-strings-patterns-and-formats)).

| | |
|---|---|
| Upstream | <https://github.com/uri-templates/uritemplate-test> |
| Commit | `4171dac22aa67fc710b3f6df308a50bd08552986`, read 2026-10-07 |
| Licence | Apache 2.0, in [`LICENSE`](LICENSE), unchanged |

Vendored unchanged: `spec-examples.json`,
`spec-examples-by-section.json`, `extended-tests.json` and
`negative-tests.json`.

## How it is run

[`ts/test/vectors.test.ts`](../../../ts/test/vectors.test.ts) and
[`go/vectors_test.go`](../../../go/vectors_test.go) put each template
through `uri-template`. A template the files expand is valid, and one
whose expansion they give as `false` is not.

[`skips.tsv`](skips.tsv) lists each template `uri-template` answers
otherwise, with the reason: a template can be well formed and still
fail to expand, which RFC 6570's grammar does not decide.
