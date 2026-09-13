/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"hash"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"testing"
)

// buildGoModule hashes the NAR serialisation of `go mod vendor` output,
// so flake.nix's vendorHash is recomputable from the Go toolchain alone.
// A nix build stays the ground truth: this tracks what nixpkgs hashes
// today.
func TestFlakeVendorHashMatchesTheModuleTree(t *testing.T) {
	// The tree carries no platform, and one runner avoids per-platform
	// file-mode and line-ending noise.
	if "linux" != runtime.GOOS {
		t.Skip("vendorHash is platform-independent; asserted on linux")
	}

	src, err := os.ReadFile(filepath.Join("..", "flake.nix"))
	if err != nil {
		t.Fatalf("read flake.nix: %v", err)
	}
	m := regexp.MustCompile(`vendorHash = "(sha256-[^"]+)"`).FindSubmatch(src)
	if nil == m {
		t.Fatal("flake.nix declares no vendorHash")
	}
	want := string(m[1])

	dir := filepath.Join(t.TempDir(), "vendor")
	out, err := exec.Command("go", "mod", "vendor", "-o", dir).CombinedOutput()
	if err != nil {
		t.Fatalf("go mod vendor: %v\n%s", err, out)
	}

	got, err := narHashSRI(dir)
	if err != nil {
		t.Fatalf("hash vendor tree: %v", err)
	}
	if want != got {
		t.Fatalf("flake.nix vendorHash is stale after a go.mod or go.sum "+
			"change.\n  flake.nix: %s\n  module tree: %s\n"+
			"Set vendorHash to the second value.", want, got)
	}
}

// Nix archive serialisation, hashed as nix hashes a recursive output:
// sha256 of the archive, SRI encoded.
func narHashSRI(root string) (string, error) {
	h := sha256.New()
	narStr(h, "nix-archive-1")
	if err := narNode(h, root); err != nil {
		return "", err
	}
	return "sha256-" + base64.StdEncoding.EncodeToString(h.Sum(nil)), nil
}

// Every token is a length-prefixed byte string, padded to a word.
func narStr(h hash.Hash, s string) {
	var n [8]byte
	binary.LittleEndian.PutUint64(n[:], uint64(len(s)))
	h.Write(n[:])
	h.Write([]byte(s))
	if pad := (8 - len(s)%8) % 8; 0 < pad {
		h.Write(make([]byte, pad))
	}
}

func narNode(h hash.Hash, path string) error {
	fi, err := os.Lstat(path)
	if err != nil {
		return err
	}
	narStr(h, "(")
	narStr(h, "type")

	switch {
	case 0 != fi.Mode()&os.ModeSymlink:
		target, err := os.Readlink(path)
		if err != nil {
			return err
		}
		narStr(h, "symlink")
		narStr(h, "target")
		narStr(h, target)

	case fi.IsDir():
		narStr(h, "directory")
		ents, err := os.ReadDir(path)
		if err != nil {
			return err
		}
		names := make([]string, 0, len(ents))
		for _, e := range ents {
			names = append(names, e.Name())
		}
		// Canonical only in byte order.
		sort.Strings(names)
		for _, name := range names {
			narStr(h, "entry")
			narStr(h, "(")
			narStr(h, "name")
			narStr(h, name)
			narStr(h, "node")
			if err := narNode(h, filepath.Join(path, name)); err != nil {
				return err
			}
			narStr(h, ")")
		}

	default:
		narStr(h, "regular")
		// Only the executable bit of the mode survives.
		if 0 != fi.Mode()&0o100 {
			narStr(h, "executable")
			narStr(h, "")
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		narStr(h, "contents")
		narStr(h, string(data))
	}

	narStr(h, ")")
	return nil
}
