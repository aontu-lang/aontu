# Aontu Vet — GitHub Action

Runs [`aontu vet`](../docs/reference-api.md#aontu-vet) over declared
(schema, data) pairs in CI: the job fails by verdict class, and the
report can be emitted as SARIF for GitHub code scanning.

This action lives in the `aontu` repository itself, so it versions in
lock-step with the CLI it runs.

> **Requires aontu 0.53.0 or newer.** The action executes
> `npx aontu@<version> vet`, and `vet` first ships in **0.53.0** —
> `0.52.1` and earlier have no such verb, so pinning `version` back
> to one of those fails at the invocation.

Reference it by subdirectory:

```yaml
jobs:
  vet:
    runs-on: ubuntu-latest
    permissions:
      security-events: write   # only for the SARIF upload
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24

      # Fail the job if deploy.json does not satisfy service.aon.
      - uses: aontu-lang/aontu/vet-action@main
        with:
          schema: service.aon
          data: deploy.json

      # Or: produce SARIF and upload it to code scanning. aontu vet
      # exits by verdict class, so keep the job alive for the upload
      # and re-assert the verdict afterwards.
      - uses: aontu-lang/aontu/vet-action@main
        id: vet
        continue-on-error: true
        with:
          schema: service.aon
          data: deploy.json staging.json
          format: sarif
          output-file: vet.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: vet.sarif
      - if: steps.vet.outputs.exit-code != '0'
        run: exit ${{ steps.vet.outputs.exit-code }}
```

Inputs: `schema` (required), `data` (required, whitespace-separated),
`format` (`text`/`json`/`sarif`), `output-file`, `args` (extra flags,
e.g. `--at $.services --closed --partial`), `version` (npm version of
`aontu` to run; it must carry the `vet` verb, so 0.53.0 or newer —
see the note above. The default tracks the CLI release this Action
revision ships with, so a pinned Action cannot silently acquire a
newer CLI). Output: `exit-code`, the verdict class (0 valid, 1
invalid, 2 usage, 3 incomplete, 4 schema error).
