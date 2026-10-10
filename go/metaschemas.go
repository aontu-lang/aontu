/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"embed"
	"strings"
)

// metaSchemaFS is test/vectors/json-schema-spec/ as `make metaschemas`
// stages it (ADR-064), index.tsv naming each document's URI.
//
//go:embed metaschemas
var metaSchemaFS embed.FS

var importMetaSchemas = func() map[string]string {
	out := map[string]string{}
	index, _ := metaSchemaFS.ReadFile("metaschemas/index.tsv")
	for _, line := range strings.Split(string(index), "\n") {
		if uri, file, ok := strings.Cut(line, "\t"); ok {
			text, _ := metaSchemaFS.ReadFile("metaschemas/" + file)
			out[uri] = string(text)
		}
	}
	return out
}()
