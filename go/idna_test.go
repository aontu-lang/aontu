/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIdnaTableIsTheSharedTable(t *testing.T) {
	shared, err := os.ReadFile(filepath.Join("..", "test", "spec", "files", "idna.txt"))
	if nil != err {
		t.Fatal(err)
	}
	if string(shared) != idnaTableText {
		t.Fatal("go/idnatable.txt does not match test/spec/files/idna.txt: run `make idna`")
	}
}
