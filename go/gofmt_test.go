/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"bytes"
	"go/format"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGoSourcesAreGofmtClean(t *testing.T) {
	var unformatted []string
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		out, err := format.Source(src)
		if err != nil {
			return err
		}
		if !bytes.Equal(src, out) {
			unformatted = append(unformatted, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(unformatted) > 0 {
		t.Errorf("not gofmt-clean; run gofmt -w on: %s", strings.Join(unformatted, " "))
	}
}
