/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMetaSchemasAreTheVendoredDocuments(t *testing.T) {
	dir := filepath.Join("..", "test", "vectors", "json-schema-spec")
	read := func(at string) string {
		text, err := os.ReadFile(at)
		if nil != err {
			t.Fatal(err)
		}
		return strings.ReplaceAll(string(text), "\r\n", "\n")
	}
	want := map[string]string{}
	err := filepath.WalkDir(dir, func(at string, d fs.DirEntry, err error) error {
		if nil != err || d.IsDir() || !strings.HasSuffix(at, ".json") {
			return err
		}
		text := read(at)
		var doc map[string]any
		if err := json.Unmarshal([]byte(text), &doc); nil != err {
			return err
		}
		id, _ := doc["$id"].(string)
		if "" == id {
			id, _ = doc["id"].(string)
		}
		want[strings.TrimSuffix(id, "#")] = text
		return nil
	})
	if nil != err {
		t.Fatal(err)
	}
	if len(want) != len(importMetaSchemas) {
		t.Fatalf("go/metaschemas/ holds %d documents, the corpus %d: run make metaschemas",
			len(importMetaSchemas), len(want))
	}
	for uri, text := range want {
		if importMetaSchemas[uri] != text {
			t.Fatalf("go/metaschemas/ is stale at %s: run make metaschemas", uri)
		}
	}
	license, err := metaSchemaFS.ReadFile("metaschemas/LICENSE")
	if nil != err || read(filepath.Join(dir, "LICENSE")) != string(license) {
		t.Fatal("go/metaschemas/LICENSE is not the corpus's: run make metaschemas")
	}
}
