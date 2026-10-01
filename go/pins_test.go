/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// docs/contributing/parity.md: the spread and optional-key rules depend on
// @tabnas parser internals, so both manifests pin each shared package to
// one version. A package only one port uses is not compared.
func TestTabnasPinsMatchTheTypeScriptManifest(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "ts", "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pkg struct {
		Dependencies map[string]string `json:"dependencies"`
	}
	if err := json.Unmarshal(raw, &pkg); err != nil {
		t.Fatal(err)
	}

	mod, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatal(err)
	}
	gopins := map[string]string{}
	re := regexp.MustCompile(`github\.com/tabnas/([a-z0-9-]+)/go v(\S+)`)
	for _, m := range re.FindAllStringSubmatch(string(mod), -1) {
		gopins[m[1]] = m[2]
	}

	compared := 0
	for name, tsver := range pkg.Dependencies {
		short, ok := strings.CutPrefix(name, "@tabnas/")
		if !ok {
			continue
		}
		gover, ok := gopins[short]
		if !ok {
			continue
		}
		compared++
		if gover != tsver {
			t.Errorf("@tabnas/%s is %s in ts/package.json but v%s in go/go.mod",
				short, tsver, gover)
		}
	}
	if 0 == compared {
		t.Fatal("no @tabnas package is pinned in both manifests")
	}
}
