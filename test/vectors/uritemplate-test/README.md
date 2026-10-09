# uritemplate-test, vendored

`spec-examples.json`, `extended-tests.json` and `negative-tests.json`
are three files of
[uritemplate-test](https://github.com/uri-templates/uritemplate-test)
at commit `4171dac22aa67fc710b3f6df308a50bd08552986`, copied byte for
byte on 2026-10-09. `LICENSE` is the corpus's own (Apache 2.0).

Each file maps a group to its variables and its cases: a template and
the expansion it gives, or `false` where expansion fails. The runners,
`ts/test/format-corpus.test.ts` and `go/format_corpus_test.go`, read
every template against `format("uri-template")`. A template of the
first two files must be admitted, and one of `negative-tests.json`
refused, except for two kinds RFC 6570's grammar admits and only
expansion refuses: an operator section 2.2 reserves, and a prefix
modifier on a variable whose value is a list or a map, which section
2.4.1 forbids. Both runners require the count of each.
