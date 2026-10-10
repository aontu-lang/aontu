# test262 property escapes, vendored

`property-escapes/` holds the 441 files of
[test262](https://github.com/tc39/test262)'s
`test/built-ins/RegExp/property-escapes/generated/` at commit
`2e0a56762801e275a9fdf96dc49d90ba0cddcf63`, copied byte for byte on
2026-10-09. It leaves out the `strings/` directory, whose tests need the
`v` flag. `LICENSE` is test262's own (BSD).

Each file names one property by every alias ECMA-262 lists, with the
code points `\p{…}` matches and the code points `\P{…}` matches. The
files were generated for Unicode 17.0.0, the release before the one
aontu's tables read (`ts/scripts/ucd.cjs`). For each property whose set
moved, `unicode-17-to-18.tsv` names the code points Unicode 18.0.0 adds
to it and the ones it removes. `ts/scripts/unicodegen.cjs --delta`
writes that file from both releases' pinned files, read by the committed
reader.

The runners, `ts/test/regex-vectors.test.ts` and
`go/regex_vectors_test.go`, apply the delta to each file's sets. For
every escape a file writes, they require the set aontu's parser reads to
equal the file's, code point for code point: 3492 escapes in all.
