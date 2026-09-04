#!/bin/sh
# THE INSTALLER (docs/release-and-tag.md, "The install channels"): the
# aontu CLI and the LSP server from the GitHub Release, for a shell
# with curl or wget and no toolchain:
#
#   curl -fsSL https://aontu.dev/install.sh | sh
#
# It reads the platform, fetches the archive for it and SHA256SUMS,
# checks the sum, and puts `aontu` and `aontu-lsp` in AONTU_INSTALL_DIR,
# ~/.local/bin unless set. AONTU_VERSION pins a release ("latest" unless
# set); AONTU_BASE_URL and AONTU_API_URL point at another copy of the
# assets and of the latest-release answer, which is how the script is
# tested. POSIX sh: it runs under dash, bash and zsh alike.
set -eu

REPO="aontu-lang/aontu"
VERSION="${AONTU_VERSION:-latest}"
DIR="${AONTU_INSTALL_DIR:-$HOME/.local/bin}"
BASE="${AONTU_BASE_URL:-https://github.com/$REPO/releases/download}"
API="${AONTU_API_URL:-https://api.github.com/repos/$REPO/releases/latest}"

say() { printf '%s\n' "$*" >&2; }
die() { say "install: $*"; exit 1; }

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$1"
  else
    die "needs curl or wget"
  fi
}

case "$(uname -s)" in
  Linux) OS=linux ;;
  Darwin) OS=darwin ;;
  MINGW*|MSYS*|CYGWIN*)
    die "on Windows, use Scoop, winget, or the zip on https://github.com/$REPO/releases" ;;
  *) die "unsupported system: $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac

# The latest release is GitHub's answer, not the newest tag: a
# prerelease is never "latest", as it is never npm's `latest` either.
if [ "$VERSION" = latest ]; then
  VERSION="$(fetch "$API" | sed -n 's/.*"tag_name": *"go\/v\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$VERSION" ] || die "could not read the latest release from $API"
fi

NAME="aontu_${VERSION}_${OS}_${ARCH}"
URL="$BASE/go%2Fv$VERSION"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "fetching $NAME.tar.gz"
fetch "$URL/$NAME.tar.gz" > "$TMP/$NAME.tar.gz"
fetch "$URL/SHA256SUMS" > "$TMP/SHA256SUMS"

WANT="$(grep " $NAME.tar.gz\$" "$TMP/SHA256SUMS" | cut -d' ' -f1)"
[ -n "$WANT" ] || die "SHA256SUMS has no entry for $NAME.tar.gz"
if command -v sha256sum >/dev/null 2>&1; then
  GOT="$(sha256sum "$TMP/$NAME.tar.gz" | cut -d' ' -f1)"
elif command -v shasum >/dev/null 2>&1; then
  GOT="$(shasum -a 256 "$TMP/$NAME.tar.gz" | cut -d' ' -f1)"
else
  die "needs sha256sum or shasum"
fi
[ "$GOT" = "$WANT" ] || die "checksum mismatch for $NAME.tar.gz: want $WANT, got $GOT"

tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP"
mkdir -p "$DIR"
install -m 0755 "$TMP/$NAME/aontu" "$TMP/$NAME/aontu-lsp" "$DIR/"
say "installed aontu $VERSION and aontu-lsp in $DIR"
case ":$PATH:" in
  *":$DIR:"*) ;;
  *) say "add $DIR to your PATH" ;;
esac
