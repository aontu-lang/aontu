# RE2's search tests, vendored

`re2-search.txt` is RE2's basic search test file as Go 1.24.7 ships it,
`src/regexp/testdata/re2-search.txt`, copied byte for byte on
2026-10-09. RE2 builds it with `make log`; `LICENSE` is the licence of
the Go distribution it was copied from (BSD 3-Clause).

Each block gives two strings, and for each pattern, one line per string
of four results: the whole-string match and the unanchored search, each
leftmost-first and then leftmost-longest. The runners,
`ts/test/regex-vectors.test.ts` and `go/regex_vectors_test.go`, compile
each pattern as `re()` does. They compare its verdict with the second
result, RE2's unanchored search, which asks what `re()` asks: whether
the pattern matches anywhere. RE2 reads `.`, `\A`, `\z`, `\b`, `\d` and
`\w` as aontu does (ADR-003); its `\s` lacks `\v`, which aontu's holds,
and no string of the file holds one.

A pattern `re()` refuses is RE2's syntax and not ECMA-262's: `\C`, an
octal escape, `\x{…}`, `\pN`, a script named without `sc=`, a negated
`\p{^…}` and an inline flag. Both runners require 1568 verdicts to agree
and 320 to be passed over for a refused pattern.
