#!/usr/bin/env bash
# THE RELEASE BINARIES (docs/release-and-tag.md, "The Go binaries"): the
# CLI and the LSP server cross-compiled for six targets, packaged one
# archive per target with the licence, summed, and a Homebrew formula
# written with those sums. The publish workflow runs this after the Go
# tag is written and puts what it makes on a GitHub Release at that tag;
# run by hand it builds the same set into a directory for inspection.
#
#   go/scripts/binaries.sh <version> [out-dir]
#
# <version> must be the VERSION in go/aontu.go: the binaries print it,
# and the archives and the formula carry it in their names and urls.
# Needs GNU tar, zip and sha256sum, which the ubuntu runner has.
set -euo pipefail

VERSION="${1:?usage: binaries.sh <version> [out-dir]}"
OUT="${2:-dist}"

cd "$(dirname "$0")/.."
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

# The formula, for the tap (docs/release-and-tag.md, "The Homebrew
# tap"). The tag has a slash, which the download url carries encoded.
sum() {
  grep " $1\$" "$OUT/SHA256SUMS" | cut -d' ' -f1
}
BASE="https://github.com/aontu-lang/aontu/releases/download/go%2Fv$VERSION"
cat > "$OUT/aontu.rb" <<FORMULA
# Homebrew formula for the aontu CLI, written by go/scripts/binaries.sh
# for the release go/v$VERSION. It belongs in the tap repository as
# Formula/aontu.rb; the sums are those of the archives released with it.
class Aontu < Formula
  desc "Aontu, the unifying configuration language: its CLI and LSP server"
  homepage "https://aontu.dev"
  version "$VERSION"
  license "MIT"

  on_macos do
    on_arm do
      url "$BASE/aontu_${VERSION}_darwin_arm64.tar.gz"
      sha256 "$(sum "aontu_${VERSION}_darwin_arm64.tar.gz")"
    end
    on_intel do
      url "$BASE/aontu_${VERSION}_darwin_amd64.tar.gz"
      sha256 "$(sum "aontu_${VERSION}_darwin_amd64.tar.gz")"
    end
  end

  on_linux do
    on_arm do
      url "$BASE/aontu_${VERSION}_linux_arm64.tar.gz"
      sha256 "$(sum "aontu_${VERSION}_linux_arm64.tar.gz")"
    end
    on_intel do
      url "$BASE/aontu_${VERSION}_linux_amd64.tar.gz"
      sha256 "$(sum "aontu_${VERSION}_linux_amd64.tar.gz")"
    end
  end

  def install
    bin.install "aontu"
    bin.install "aontu-lsp"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/aontu --version")
  end
end
FORMULA

echo "wrote $OUT:"
ls -l "$OUT"
