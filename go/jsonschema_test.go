/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// The package-API side of the JSON Schema export. What the two ports
// must AGREE on is pinned by test/spec/jsonschema.tsv; the arms only
// the LIBRARY entry can reach -- the anchor walk, and a source that
// does not parse at all -- are here. The TypeScript twin is the
// jsonschema block in ts/test/cli.test.ts.

import (
	"strings"
	"testing"
)

func TestJSONSchemaAnchorSelectsTheSubtree(t *testing.T) {
	src := "spec: {name: string}\nother: {x: 1}\n"

	// WITHOUT an anchor the whole document is the schema.
	whole := New().JSONSchema(src, "")
	if "ok" != whole.Verdict {
		t.Fatalf("verdict %q", whole.Verdict)
	}
	props, _ := whole.Schema["properties"].(map[string]any)
	if _, has := props["other"]; !has {
		t.Fatalf("the whole document was not exported: %v", props)
	}

	// WITH one, only the named subtree -- the same anchor vet --at
	// takes, so `--at spec` means the same thing in both verbs. The
	// `$`-prefixed spelling is the same path.
	for _, at := range []string{"spec", "$.spec"} {
		part := New().JSONSchema(src, at)
		if "ok" != part.Verdict {
			t.Fatalf("%s: verdict %q", at, part.Verdict)
		}
		props, _ = part.Schema["properties"].(map[string]any)
		if _, has := props["other"]; has {
			t.Fatalf("%s: the anchor did not narrow: %v", at, props)
		}
		if _, has := props["name"]; !has {
			t.Fatalf("%s: the anchor lost its own keys: %v", at, props)
		}
	}

	// An anchor that names nothing is a refusal in vet's finding shape,
	// not an empty schema: a caller redirecting stdout would otherwise
	// write a schema that admits everything.
	none := New().JSONSchema(src, "nope")
	if "error" != none.Verdict || 1 != len(none.Errors) {
		t.Fatalf("bad anchor: %+v", none)
	}
	if "no_path" != none.Errors[0].Code {
		t.Fatalf("code %q", none.Errors[0].Code)
	}
	if 0 != len(none.Schema) {
		t.Fatalf("a refusal carried a schema: %v", none.Schema)
	}
}

func TestJSONSchemaUnparseableSource(t *testing.T) {
	// A source that does not PARSE never reaches the fixpoint, so the
	// finding is the parser's rather than the engine's -- and the verb
	// still answers in the one shape its callers read.
	r := New().JSONSchema("a: \"unterminated", "")
	if "error" != r.Verdict {
		t.Fatalf("verdict %q", r.Verdict)
	}
	if 1 != len(r.Errors) {
		t.Fatalf("errors %+v", r.Errors)
	}
	if 0 != len(r.Lossy) || 0 != len(r.Schema) {
		t.Fatalf("a refusal carried a schema or losses: %+v", r)
	}
}

func TestJSONSchemaRootPathInALoss(t *testing.T) {
	// A loss at the document ROOT prints `$`, not `$.` -- the path
	// spelling every other report uses.
	r := New().JSONSchema("0d1.5", "")
	if 1 != len(r.Lossy) {
		t.Fatalf("lossy %+v", r.Lossy)
	}
	if "$" != r.Lossy[0].Path {
		t.Fatalf("root path rendered as %q", r.Lossy[0].Path)
	}
	if !strings.Contains(r.Lossy[0].Reason, "binary64") {
		t.Fatalf("reason %q", r.Lossy[0].Reason)
	}
}
