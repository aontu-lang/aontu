# Setup Aontu

A GitHub Action that puts the `aontu` CLI and `aontu-lsp` on the
runner's `PATH` from a GitHub Release, on Linux, macOS and Windows,
with no Node or Go toolchain. It is the install channel for CI
(docs/release-and-tag.md, "The install channels").

```yaml
- uses: aontu-lang/aontu/setup-action@main
  with:
    version: 0.1.15        # or latest, the default
- run: aontu fmt --check --strict *.aon
```

`version` is a Go release version; `install-dir` is where the binaries
go and defaults to a directory under the runner's temp. The `version`
output is the version installed. The archive is checked against the
release's `SHA256SUMS` before anything is placed on the path.

The `vet-action` beside this one runs the npm package through `npx`
and needs Node; this action needs nothing.
