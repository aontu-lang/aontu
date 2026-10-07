# IDNA

UTS #46's conformance file and the two Unicode 16.0.0 data files the
IDNA table is checked against, vendored to hold `hostname`,
`idn-hostname` and `idn-email` to an answer per line
([G12, section 5](../../../docs/capability-review/g12-jsonschema-fidelity.md#5-strings-patterns-and-formats)).

| | |
|---|---|
| Upstream | <https://www.unicode.org/Public/idna/16.0.0/> and <https://www.unicode.org/Public/idna/idna2008derived/> |
| Version | Unicode 16.0.0, read 2026-10-07 |
| Licence | Unicode License V3, in [`LICENSE`](LICENSE), unchanged |

Vendored unchanged: `IdnaTestV2.txt` and `IdnaMappingTable.txt` from
the first, and `Idna2008-16.0.0.txt`, the IDNA2008 derived property of
RFC 5892, from the second.

## How it is run

[`ts/test/vectors.test.ts`](../../../ts/test/vectors.test.ts) and
[`go/vectors_test.go`](../../../go/vectors_test.go) put each line's
source through `idn-hostname`. A line answers valid when its toAsciiN
status holds no error. The file's notes say an implementation of
IDNA2008 is stricter than UTS #46 on a character the mapping table
marks NV8 or XV8, so a line whose toUnicode holds one answers invalid.
The two lines whose source escapes a lone surrogate are not read: no
Go string can hold one, as the notes allow.

Both runners also check the committed table,
[`test/spec/files/idna.txt`](../../spec/files/idna.txt), against the
two data files: each code point's UTS #46 status and mapping, and its
IDNA2008 property, must be what the files say.

[`skips.tsv`](skips.tsv) lists each line `idn-hostname` answers
otherwise, with the reason; it holds none.
