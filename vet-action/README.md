# Aontu Vet — GitHub Action

Runs [`aontu vet`](../docs/reference-api.md#aontu-vet) over declared
(schema, data) pairs in CI: the job fails by verdict class, and the
report can be emitted as SARIF for GitHub code scanning.

This action lives in the `aontu` repository itself (G2 phase 5 landed
it here rather than in the separate `aontu-vet-action` repository the
design sketched, so the action versions in lock-step with the CLI it
runs).

> **Not yet runnable from npm.** The action executes
> `npx aontu@<version> vet`, and no published npm release carries the
> `vet` verb yet — the newest, `0.52.1` (the default `version`),
> predates it. The examples below are the intended usage and will
> work as written once the first post-verb release ships; until then
> every run, default or pinned, fails at the `vet` invocation.

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
      - uses: rjrodger/aontu/vet-action@main
        with:
          schema: service.aon
          data: deploy.json

      # Or: produce SARIF and upload it to code scanning. aontu vet
      # exits by verdict class, so keep the job alive for the upload
      # and re-assert the verdict afterwards.
      - uses: rjrodger/aontu/vet-action@main
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
`aontu` to run; it must carry the `vet` verb, which no published
release does yet — see the note above. The pinning intent: the
default tracks the CLI release this Action revision ships with, so a
pinned Action cannot silently acquire a
newer CLI). Output: `exit-code`, the verdict class (0 valid, 1
invalid, 2 usage, 3 incomplete, 4 schema error).
