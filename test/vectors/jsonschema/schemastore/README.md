# A SchemaStore subset, vendored

`schemas/` holds thirty schemas from
[SchemaStore](https://github.com/SchemaStore/schemastore), each copied
byte for byte from `src/schemas/json/` at commit
`3ccab69312e72f3c33f7f967a002ec126c9267b6` on 2026-10-11. `LICENSE` and
`NOTICE` are that repository's own: Apache License 2.0.

They are real configuration schemas, chosen to cover what the official
suite does not: definitions that name one another, rules met through an
`allOf` with a shared definition, kind splits, deep `oneOf` and `anyOf`,
annotations on almost every member, and sizes from a few hundred bytes
(`mocharc.json`) to almost half a megabyte (`tsconfig.json`). Every one
declares draft-07, and none refers to a document outside itself.

The runners are `ts/test/jsonschema-schemastore.test.ts` and
`go/jsonschema_schemastore_test.go`. Each imports every schema in its
declared dialect, exports the import, imports the export, and requires
the two imports to be one value: canon for canon, and subsuming each
other both ways where their hashes differ. This is the round trip the
official suite's groups pass in `ts/test/jsonschema-roundtrip.test.ts`
and `go/jsonschema_roundtrip_test.go` (ADR-068).

`roundtrip.tsv` is the ledger: one row per schema that does not come
back, naming the construct it waits on and the reason, in the columns
`file`, `construct`, `reason`. A listed schema that round-trips fails
the run, so a fix deletes its own row, and the ledger may not grow past
the bound both runners carry.
