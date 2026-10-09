/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVocabularyTableIsTheCommittedTable(t *testing.T) {
	want, err := os.ReadFile(filepath.Join("..", "grammar", "jsonschema", "vocabularies.tsv"))
	if nil != err {
		t.Fatal(err)
	}
	if strings.ReplaceAll(string(want), "\r\n", "\n") != vocabularyTable {
		t.Fatal("go/vocabularies.tsv is not grammar/jsonschema/vocabularies.tsv: run make vocabularies")
	}
}
