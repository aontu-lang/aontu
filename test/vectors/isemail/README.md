# isemail

The tests of Dominic Sayers's `is_email`, vendored to hold `email` to
an answer per address
([G12, section 5](../../../docs/capability-review/g12-jsonschema-fidelity.md#5-strings-patterns-and-formats)).

| | |
|---|---|
| Upstream | <https://github.com/dominicsayers/isemail> |
| Commit | `cfeefc3f2f88cb195053f6a309fa4f640cd369b5`, read 2026-10-07 |
| Licence | BSD 3-Clause, in [`LICENSE`](LICENSE), unchanged |

Vendored unchanged: `test/tests.xml`, 164 addresses, each with the
category of its diagnosis.

## How it is run

[`ts/test/vectors.test.ts`](../../../ts/test/vectors.test.ts) and
[`go/vectors_test.go`](../../../go/vectors_test.go) put each address
through `email`, which is RFC 5321's Mailbox grammar. A category of
valid, of a DNS warning or of RFC 5321 names an address that grammar
admits; any other category, comments and folding white space, RFC
5322's deprecated forms and errors among them, names one it refuses.
The file writes a control character as its symbol, U+2400 on, and the
runners read it back.

[`skips.tsv`](skips.tsv) lists each address `email` answers otherwise,
with the reason.
