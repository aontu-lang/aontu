# THE FLAKE (docs/release-and-tag.md, "The install channels"): the
# aontu CLI and the LSP server from source, for `nix run
# github:aontu-lang/aontu` and for the flake as an input. The version
# is the one go/aontu.go declares; the vendorHash of the vendored Go
# modules is go/vendorhash.txt, which `nix build` names anew whenever
# go.mod or go.sum change and go/flake_test.go recomputes. It sits
# beside the module it describes so the Go test cache tracks it. No
# lock file is committed: run `nix flake lock` where nix is, and commit
# it, to pin nixpkgs.
{
  description = "Aontu, the unifying configuration language: the aontu CLI and the aontu-lsp language server";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: lib.genAttrs systems (system: f system nixpkgs.legacyPackages.${system});
      versionLine = lib.findFirst (line: lib.hasPrefix "const VERSION = " line) null
        (lib.splitString "\n" (builtins.readFile ./go/aontu.go));
      version = builtins.head (builtins.match "const VERSION = \"([^\"]+)\".*" versionLine);
      vendorHash = builtins.replaceStrings [ "\n" ] [ "" ]
        (builtins.readFile ./go/vendorhash.txt);
    in {
      packages = forAll (system: pkgs: rec {
        aontu = pkgs.buildGoModule {
          pname = "aontu";
          inherit version;
          src = ./.;
          modRoot = "go";
          subPackages = [ "cmd/aontu" "cmd/aontu-lsp" ];
          inherit vendorHash;
          CGO_ENABLED = 0;
          ldflags = [ "-s" "-w" ];
          # The suite runs in CI (make test) and takes a minute; the
          # build here is the release's, not the gate's.
          doCheck = false;
          meta = {
            description = "Aontu, the unifying configuration language: the aontu CLI and the aontu-lsp language server";
            homepage = "https://aontu.dev";
            license = lib.licenses.mit;
            mainProgram = "aontu";
          };
        };
        default = aontu;
      });

      apps = forAll (system: pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${system}.aontu}/bin/aontu";
        };
      });
    };
}
