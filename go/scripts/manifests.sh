#!/usr/bin/env bash
# THE PACKAGE-MANAGER MANIFESTS (docs/release-and-tag.md, "The install
# channels"): from a release's SHA256SUMS, the Homebrew formula, the
# Scoop manifest, the winget manifests and the AUR PKGBUILD with its
# .SRCINFO, each carrying the archives' sums, and a copy of the
# installer. binaries.sh runs this last; the publish workflow releases
# what it writes beside the archives. Each is a file for its channel's
# repository, not the channel itself: docs/release-and-tag.md says what
# each channel needs.
#
#   go/scripts/manifests.sh <version> <dist>
set -euo pipefail

VERSION="${1:?usage: manifests.sh <version> <dist>}"
OUT="$(cd "${2:?usage: manifests.sh <version> <dist>}" && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -f "$OUT/SHA256SUMS" ] || { echo "manifests: $OUT/SHA256SUMS is missing" >&2; exit 1; }

sum() {
  local s
  s="$(grep " $1\$" "$OUT/SHA256SUMS" | cut -d' ' -f1)"
  [ -n "$s" ] || { echo "manifests: SHA256SUMS has no entry for $1" >&2; exit 1; }
  printf '%s' "$s"
}
upper() { printf '%s' "$1" | tr 'a-f' 'A-F'; }

# The tag has a slash, which the download url carries encoded.
BASE="https://github.com/aontu-lang/aontu/releases/download/go%2Fv$VERSION"
DESC="Aontu, the unifying configuration language: the aontu CLI and the aontu-lsp language server"

# ---- Homebrew: Formula/aontu.rb in the tap repository.
cat > "$OUT/aontu.rb" <<FORMULA
# Homebrew formula for the aontu CLI, written by go/scripts/manifests.sh
# for the release go/v$VERSION. It belongs in the tap repository as
# Formula/aontu.rb; the sums are those of the archives released with it.
class Aontu < Formula
  desc "$DESC"
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

# ---- Scoop: bucket/aontu.json in the bucket repository. checkver reads
# the version out of the go/v tag; autoupdate takes the sums from the
# release's SHA256SUMS.
cat > "$OUT/aontu.json" <<SCOOP
{
  "version": "$VERSION",
  "description": "$DESC",
  "homepage": "https://aontu.dev",
  "license": "MIT",
  "architecture": {
    "64bit": {
      "url": "$BASE/aontu_${VERSION}_windows_amd64.zip",
      "hash": "$(sum "aontu_${VERSION}_windows_amd64.zip")",
      "extract_dir": "aontu_${VERSION}_windows_amd64"
    },
    "arm64": {
      "url": "$BASE/aontu_${VERSION}_windows_arm64.zip",
      "hash": "$(sum "aontu_${VERSION}_windows_arm64.zip")",
      "extract_dir": "aontu_${VERSION}_windows_arm64"
    }
  },
  "bin": ["aontu.exe", "aontu-lsp.exe"],
  "checkver": {
    "url": "https://api.github.com/repos/aontu-lang/aontu/releases/latest",
    "jsonpath": "$.tag_name",
    "regex": "go/v([\\\\d.]+)"
  },
  "autoupdate": {
    "architecture": {
      "64bit": {
        "url": "https://github.com/aontu-lang/aontu/releases/download/go%2Fv\$version/aontu_\$version_windows_amd64.zip",
        "extract_dir": "aontu_\$version_windows_amd64"
      },
      "arm64": {
        "url": "https://github.com/aontu-lang/aontu/releases/download/go%2Fv\$version/aontu_\$version_windows_arm64.zip",
        "extract_dir": "aontu_\$version_windows_arm64"
      }
    },
    "hash": {
      "url": "https://github.com/aontu-lang/aontu/releases/download/go%2Fv\$version/SHA256SUMS"
    }
  }
}
SCOOP

# ---- winget: the three manifests in the layout microsoft/winget-pkgs
# takes, as one archive.
WG="$OUT/winget/manifests/a/AontuLang/Aontu/$VERSION"
mkdir -p "$WG"
cat > "$WG/AontuLang.Aontu.yaml" <<WINGET
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.version.1.6.0.schema.json
PackageIdentifier: AontuLang.Aontu
PackageVersion: $VERSION
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
WINGET
cat > "$WG/AontuLang.Aontu.installer.yaml" <<WINGET
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.installer.1.6.0.schema.json
PackageIdentifier: AontuLang.Aontu
PackageVersion: $VERSION
InstallerType: zip
NestedInstallerType: portable
Installers:
  - Architecture: x64
    InstallerUrl: $BASE/aontu_${VERSION}_windows_amd64.zip
    InstallerSha256: $(upper "$(sum "aontu_${VERSION}_windows_amd64.zip")")
    NestedInstallerFiles:
      - RelativeFilePath: aontu_${VERSION}_windows_amd64\\aontu.exe
        PortableCommandAlias: aontu
      - RelativeFilePath: aontu_${VERSION}_windows_amd64\\aontu-lsp.exe
        PortableCommandAlias: aontu-lsp
  - Architecture: arm64
    InstallerUrl: $BASE/aontu_${VERSION}_windows_arm64.zip
    InstallerSha256: $(upper "$(sum "aontu_${VERSION}_windows_arm64.zip")")
    NestedInstallerFiles:
      - RelativeFilePath: aontu_${VERSION}_windows_arm64\\aontu.exe
        PortableCommandAlias: aontu
      - RelativeFilePath: aontu_${VERSION}_windows_arm64\\aontu-lsp.exe
        PortableCommandAlias: aontu-lsp
ManifestType: installer
ManifestVersion: 1.6.0
WINGET
cat > "$WG/AontuLang.Aontu.locale.en-US.yaml" <<WINGET
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.defaultLocale.1.6.0.schema.json
PackageIdentifier: AontuLang.Aontu
PackageVersion: $VERSION
PackageLocale: en-US
Publisher: aontu-lang
PublisherUrl: https://github.com/aontu-lang
PackageName: Aontu
PackageUrl: https://aontu.dev
License: MIT
LicenseUrl: https://github.com/aontu-lang/aontu/blob/main/LICENSE
ShortDescription: "$DESC."
Tags:
  - cli
  - configuration
ReleaseNotesUrl: https://github.com/aontu-lang/aontu/blob/main/CHANGELOG.md
ManifestType: defaultLocale
ManifestVersion: 1.6.0
WINGET
tar -C "$OUT/winget" --sort=name --mtime="2000-01-01T00:00:00Z" --owner=0 --group=0 --numeric-owner \
  -cf - manifests | gzip -n > "$OUT/aontu_${VERSION}_winget.tar.gz"
rm -rf "$OUT/winget"

# ---- AUR: the aontu-bin package, PKGBUILD and .SRCINFO, as one archive.
AUR="$OUT/aur"
mkdir -p "$AUR"
cat > "$AUR/PKGBUILD" <<PKGBUILD
# Maintainer: aontu-lang <https://github.com/aontu-lang>
# Written by go/scripts/manifests.sh for the release go/v$VERSION.
pkgname=aontu-bin
pkgver=$VERSION
pkgrel=1
pkgdesc="$DESC"
arch=('x86_64' 'aarch64')
url="https://aontu.dev"
license=('MIT')
provides=('aontu')
conflicts=('aontu')
source_x86_64=("$BASE/aontu_${VERSION}_linux_amd64.tar.gz")
source_aarch64=("$BASE/aontu_${VERSION}_linux_arm64.tar.gz")
sha256sums_x86_64=('$(sum "aontu_${VERSION}_linux_amd64.tar.gz")')
sha256sums_aarch64=('$(sum "aontu_${VERSION}_linux_arm64.tar.gz")')

package() {
  local dir="aontu_\${pkgver}_linux_amd64"
  [ "\$CARCH" = aarch64 ] && dir="aontu_\${pkgver}_linux_arm64"
  install -Dm755 "\$srcdir/\$dir/aontu" "\$pkgdir/usr/bin/aontu"
  install -Dm755 "\$srcdir/\$dir/aontu-lsp" "\$pkgdir/usr/bin/aontu-lsp"
  install -Dm644 "\$srcdir/\$dir/LICENSE" "\$pkgdir/usr/share/licenses/\$pkgname/LICENSE"
}
PKGBUILD
cat > "$AUR/.SRCINFO" <<SRCINFO
pkgbase = aontu-bin
	pkgdesc = $DESC
	pkgver = $VERSION
	pkgrel = 1
	url = https://aontu.dev
	arch = x86_64
	arch = aarch64
	license = MIT
	provides = aontu
	conflicts = aontu
	source_x86_64 = $BASE/aontu_${VERSION}_linux_amd64.tar.gz
	sha256sums_x86_64 = $(sum "aontu_${VERSION}_linux_amd64.tar.gz")
	source_aarch64 = $BASE/aontu_${VERSION}_linux_arm64.tar.gz
	sha256sums_aarch64 = $(sum "aontu_${VERSION}_linux_arm64.tar.gz")

pkgname = aontu-bin
SRCINFO
tar -C "$AUR" --sort=name --mtime="2000-01-01T00:00:00Z" --owner=0 --group=0 --numeric-owner \
  -cf - PKGBUILD .SRCINFO | gzip -n > "$OUT/aontu_${VERSION}_aur.tar.gz"
rm -rf "$AUR"

# ---- The installer, so that a release carries the script that installs it.
cp "$HERE/install.sh" "$OUT/install.sh"

echo "wrote aontu.rb aontu.json aontu_${VERSION}_winget.tar.gz aontu_${VERSION}_aur.tar.gz install.sh"
