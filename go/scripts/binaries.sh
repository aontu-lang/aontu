#!/usr/bin/env bash
# THE RELEASE BINARIES (docs/release-and-tag.md, "The Go binaries"): the
# CLI and the LSP server cross-compiled for six targets, packaged one
# archive per target with the licence and summed; then the Linux
# packages (deb, rpm, apk) from those binaries, and the package-manager
# manifests and the installer from the sums (manifests.sh). The publish
# workflow runs this after the Go tag is written and puts what it makes
# on a GitHub Release at that tag; run by hand it builds the same set
# into a directory for inspection.
#
#   go/scripts/binaries.sh <version> [out-dir]
#
# <version> must be the VERSION in go/aontu.go: the binaries print it,
# and the archives and the formula carry it in their names and urls.
# Needs GNU tar, zip, sha256sum and a Go toolchain (for nfpm), which
# the ubuntu runner has.
set -euo pipefail

VERSION="${1:?usage: binaries.sh <version> [out-dir]}"
OUT="${2:-dist}"

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
ROOT="$(cd .. && pwd)"

DECLARED="$(sed -n 's/^const VERSION = "\(.*\)"$/\1/p' aontu.go)"
if [ "$DECLARED" != "$VERSION" ]; then
  echo "binaries: go/aontu.go declares VERSION $DECLARED, not $VERSION" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

# One archive per target, the binaries and the licence in a directory
# named like the archive, so that unpacking beside another release is
# tidy and Homebrew, which steps into a single top-level directory,
# finds them. Archives are reproducible: fixed ordering, mtime and
# ownership, and gzip without its timestamp.
TARGETS="linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64"
STAMP="2000-01-01T00:00:00Z"
for target in $TARGETS; do
  os="${target%/*}"
  arch="${target#*/}"
  name="aontu_${VERSION}_${os}_${arch}"
  stage="$OUT/$name"
  ext=""
  if [ "$os" = windows ]; then
    ext=".exe"
  fi
  mkdir -p "$stage"
  for cmd in aontu aontu-lsp; do
    CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" GOFLAGS=-mod=readonly \
      go build -trimpath -ldflags='-s -w' -o "$stage/$cmd$ext" "./cmd/$cmd"
  done
  cp "$ROOT/LICENSE" "$stage/LICENSE"
  touch -d "$STAMP" "$stage" "$stage"/*
  if [ "$os" = windows ]; then
    (cd "$OUT" && zip -X -r -q "$name.zip" "$name")
  else
    tar -C "$OUT" --sort=name --mtime="$STAMP" --owner=0 --group=0 --numeric-owner \
      -cf - "$name" | gzip -n > "$OUT/$name.tar.gz"
  fi
  rm -rf "$stage"
  echo "built $name"
done

(cd "$OUT" && sha256sum aontu_*.tar.gz aontu_*.zip > SHA256SUMS)

# THE LINUX PACKAGES: deb, rpm and apk for amd64 and arm64, by nfpm,
# from the archives' binaries. The config is written here with the
# paths filled in, since nfpm expands no variable in them.
NFPM="github.com/goreleaser/nfpm/v2/cmd/nfpm@v2.47.0"
for arch in amd64 arm64; do
  name="aontu_${VERSION}_linux_${arch}"
  tar -C "$OUT" -xzf "$OUT/$name.tar.gz"
  cat > "$OUT/nfpm-$arch.yaml" <<NFPM
name: aontu
arch: $arch
platform: linux
version: $VERSION
section: utils
priority: optional
maintainer: Richard Rodger
description: |
  Aontu, the unifying configuration language: the aontu CLI and the
  aontu-lsp language server.
vendor: aontu-lang
homepage: https://aontu.dev
license: MIT
contents:
  - src: $OUT/$name/aontu
    dst: /usr/bin/aontu
  - src: $OUT/$name/aontu-lsp
    dst: /usr/bin/aontu-lsp
  - src: $OUT/$name/LICENSE
    dst: /usr/share/doc/aontu/LICENSE
NFPM
  for p in deb rpm apk; do
    GOFLAGS= go run "$NFPM" package -p "$p" -f "$OUT/nfpm-$arch.yaml" -t "$OUT/" >/dev/null
  done
  rm -rf "$OUT/$name" "$OUT/nfpm-$arch.yaml"
  echo "packaged $name"
done

# The manifests for the package managers, and the installer, from the
# sums (manifests.sh).
"$HERE/manifests.sh" "$VERSION" "$OUT"

echo "wrote $OUT:"
ls -l "$OUT"
