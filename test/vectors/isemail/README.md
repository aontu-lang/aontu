# isemail, vendored

`tests.xml` is the test file of
[is_email](https://github.com/dominicsayers/isemail) at commit
`cfeefc3f2f88cb195053f6a309fa4f640cd369b5`, copied byte for byte on
2026-10-09. `LICENSE` is the project's own `license.md` (BSD 3-Clause).

Each test is an address with is_email's category and diagnosis. The
runners, `ts/test/format-corpus.test.ts` and `go/format_corpus_test.go`,
read every address against `format("email")` and
`format("idn-email")`: an address of the categories
`ISEMAIL_VALID_CATEGORY`, `ISEMAIL_DNSWARN` and `ISEMAIL_RFC5321` is
one RFC 5321's Mailbox admits, and any other is not. The file writes a
control character as its control picture, U+2400 to U+241F, and the
runners read the character it pictures.

A difference is an address is_email refuses for a size limit of RFC
5321 section 4.5.3.1, whose diagnosis ends `TOOLONG`; the grammars do
not count octets. Both runners require the count of each.
