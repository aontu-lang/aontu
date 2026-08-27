/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli jsonschema cases in ts/test/cli.test.ts. What
// the two ports must AGREE on (the schema and the loss report) is
// pinned by test/spec/jsonschema.tsv; what each port owns (argument
// handling, exit codes, which stream each half goes to) is here.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func jsonSchemaRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"jsonschema"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func jsonSchemaFile(t *testing.T, src string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "doc.aon")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const schemaContract = `spec: {
  name: string & re("^[a-z]+$")
  tier: *"internal" | "critical"
  port?: integer & min(1024)
}
`

func TestJsonSchemaVerb(t *testing.T) {
	// THE SCHEMA GOES TO STDOUT so `aontu jsonschema x.aon > s.json`
	// writes a usable file, and --at names the subtree, as vet's does.
	file := jsonSchemaFile(t, schemaContract)
	out, errw, code := jsonSchemaRun("--at", "spec", file)
	if 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}

	var schema map[string]any
	if err := json.Unmarshal([]byte(out), &schema); err != nil {
		t.Fatalf("stdout is not JSON: %v\n%s", err, out)
	}
	if "https://json-schema.org/draft/2020-12/schema" != schema["$schema"] {
		t.Fatalf("draft: %v", schema["$schema"])
	}
	props, _ := schema["properties"].(map[string]any)
	name, _ := props["name"].(map[string]any)
	if "^[a-z]+$" != name["pattern"] {
		t.Fatalf("re did not become a pattern: %v", name)
	}
	tier, _ := props["tier"].(map[string]any)
	if "internal" != tier["default"] {
		t.Fatalf("the preference did not become a default: %v", tier)
	}
	// The OPTIONAL key is simply absent from required, which is what
	// `k?:` means and what a consumer must be told.
	req, _ := schema["required"].([]any)
	for _, r := range req {
		if "port" == r {
			t.Fatalf("an optional key was required: %v", req)
		}
	}
	if "" != errw {
		t.Fatalf("a clean export wrote to stderr: %s", errw)
	}
}

func TestJsonSchemaLossGoesToStderrAndStrictRefuses(t *testing.T) {
	// A LOSS IS NEVER SILENT. The schema still goes to stdout, because
	// a weaker schema is still a usable one -- but the reader is told
	// what it cannot say, on the other stream, so a redirect keeps the
	// schema clean and the warning visible.
	file := jsonSchemaFile(t, "a: integer & must(min(2), \"two\")\n")

	out, errw, code := jsonSchemaRun(file)
	if 0 != code {
		t.Fatalf("a lossy export is still an export: %d", code)
	}
	if !strings.Contains(out, "\"type\": \"integer\"") {
		t.Fatalf("schema missing from stdout: %s", out)
	}
	if !strings.Contains(errw, "lossy: $.a must:") {
		t.Fatalf("loss missing from stderr: %s", errw)
	}

	// ... and --strict turns the report into a refusal, for the CI job
	// that would rather fail than ship a schema weaker than its model.
	_, _, code = jsonSchemaRun("--strict", file)
	if 1 != code {
		t.Fatalf("--strict on a lossy export = %d, want 1", code)
	}
}

func TestJsonSchemaJSONFormatAndRefusals(t *testing.T) {
	file := jsonSchemaFile(t, "a: 1\n")
	out, _, code := jsonSchemaRun("--format", "json", file)
	if 0 != code {
		t.Fatalf("code %d", code)
	}
	var report map[string]any
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("not JSON: %v", err)
	}
	if "ok" != report["verdict"] {
		t.Fatalf("verdict %v", report["verdict"])
	}
	if nil == report["aontu"] || nil == report["schema"] {
		t.Fatalf("envelope or schema missing: %s", out)
	}

	// A document that does not stand up has nothing to export, and says
	// why in vet's finding shape -- on stderr, since stdout is the
	// schema's stream.
	bad := jsonSchemaFile(t, "a: 1\na: 2\n")
	out, errw, code := jsonSchemaRun(bad)
	if 4 != code {
		t.Fatalf("a broken document = %d, want 4", code)
	}
	if "" != out {
		t.Fatalf("a refusal wrote a schema: %s", out)
	}
	if !strings.Contains(errw, "scalar_value") {
		t.Fatalf("refusal does not name the conflict: %s", errw)
	}

	// An anchor that names nothing is the same class of refusal.
	_, errw, code = jsonSchemaRun("--at", "nope", file)
	if 4 != code || !strings.Contains(errw, "no_path") {
		t.Fatalf("bad anchor = %d: %s", code, errw)
	}
}

func TestJsonSchemaArgumentErrors(t *testing.T) {
	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{}, "needs one file"},
		{[]string{"a.aon", "b.aon"}, "needs one file"},
		{[]string{"--format", "yaml", "a.aon"}, "--format needs"},
		{[]string{"--at"}, "--at needs a path"},
		{[]string{"--nope", "a.aon"}, "unknown jsonschema option"},
		{[]string{"/no/such/file.aon"}, "cannot read"},
		// A --trust the profile parser refuses stops the verb before it
		// reads anything, which is the point: the capability decides
		// what may be read.
		{[]string{"--trust", "nonsense", "a.aon"}, "--trust"},
	} {
		_, errw, code := jsonSchemaRun(c.args...)
		if 2 != code || !strings.Contains(errw, c.want) {
			t.Fatalf("%v = %d: %s", c.args, code, errw)
		}
	}

	out, _, code := jsonSchemaRun("--help")
	if 0 != code || !strings.Contains(out, "aontu jsonschema") {
		t.Fatalf("--help = %d", code)
	}
}
