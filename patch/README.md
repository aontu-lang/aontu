# Patches awaiting a push with the `workflow` scope

A change under `.github/workflows/` can only be pushed by a credential
that holds GitHub's `workflow` scope, which the agent session that wrote
the change did not have. The change travels here instead, as a patch
against `main`, for a maintainer to apply and push:

```
git apply patch/publish-yml-go-binaries.patch
git add .github/workflows/publish.yml
git commit -m "publish.yml: build and release the Go binaries after the tag"
git push
git rm patch/publish-yml-go-binaries.patch
```

Remove the patch in the same change that applies it, so this folder
holds only what is still pending.

## publish-yml-go-binaries.patch

The three jobs that carry the Go CLI as a download on every Go release
(docs/release-and-tag.md, "The Go binaries" and "The install
channels"): `binaries` runs `go/scripts/binaries.sh` after the tag job
with `contents: read` and hands the archives, packages and manifests on
as an artifact; `release` runs `gh` and nothing else, with
`contents: write`, and puts them on a GitHub Release at `go/v<VERSION>`;
`image` pushes the Linux binaries to GHCR with `packages: write`. The
scripts, the docs and the changelog entry are already on the branch;
this patch is the part of the same change that the push could not
carry.
