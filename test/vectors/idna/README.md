# IdnaTestV2, vendored

`IdnaTestV2.txt` is the UTS #46 conformance file of Unicode 18.0.0,
<https://www.unicode.org/Public/18.0.0/idna/IdnaTestV2.txt>, copied byte
for byte on 2026-10-09, SHA-256
`0236b75c5b20dfd857b3b5cf75509887959d6ab00d6c7bda9b7dc3df518c1fde`.
`LICENSE` is the Unicode License v3,
<https://www.unicode.org/license.txt>.

The runners, `ts/test/format-corpus.test.ts` and
`go/format_corpus_test.go`, read each source string against
`format("idn-hostname")` and take it as valid where nontransitional
`toASCII`, with DNS length checked, reports no error. Two kinds of line
are counted and not read: a string that holds an A-label, since aontu
never decodes Punycode, and an ill-formed one, which UTS 46 lets an
implementation skip. Each other difference is one of three kinds, and
both runners require the count of each:

- a code point UTS 46 admits and aontu refuses, one IDNA2008 disallows
  (`NV8` or `XV8` in UTS 46's mapping table) or one UTS 46 maps to
  several code points, where aontu reads a mapping to one alone;
- an ASCII character before U+0338, which normalisation composes into
  one code point, `≠`, `≮` or `≯`, and aontu does not normalise;
- a name `toASCII` refuses for its length alone, the length of a
  U-label's A-label form, which aontu does not compute.
