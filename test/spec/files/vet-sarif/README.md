# The SARIF golden (G2 phase 5)

`schema.aon` and `data.aon` are one vet run; `expect.sarif` is the
SARIF 2.1.0 report both ports must render for it, **byte for byte**,
after two redactions the comparing tests apply to their own output
before diffing:

- every `message.text` and `properties.message` becomes `<MESSAGE>`,
  and every `properties.hint` becomes `<HINT>` — the same carve-out
  `test/spec/vet.tsv` applies to its goldens, because prose is
  deliberately not in cross-port parity (`docs/shared-spec.md`). The
  hint is only present for codes that have one, so the redaction is
  conditional and the golden still records WHICH findings carry it;
- `tool.driver.version` becomes `<VERSION>`, because the two ports'
  version series are independent by design (the `aontu.version` field
  of the JSON report has the same exemption).

Everything else — key order, indentation, sites, levels, rule ids,
the embedded finding objects — is contractual. The golden was produced
by the parity probe (AGENTS.md): both renderers were run over these
fixtures and required to agree before the bytes were recorded; the
comparing tests are `ts/test/sarif.test.ts` and `go/report_sarif_test.go`.

The fixture deliberately produces three finding shapes in one run: a
`closed` surplus key, a constraint conflict carrying
`expected`/`actual`, and a `must` failure carrying the author's `note`
— so the golden pins the optional fields present and absent, and
`relatedLocations` both present (two-site conflicts) and absent
(one-site findings).
