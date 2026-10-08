/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


import (
	"bytes"
	"encoding/json"
	"fmt"
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
	file := filepath.Join(t.TempDir(), "doc.aontu")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const schemaContract = `spec: {
  name: string & re("^[a-z]+$")
  tier: *"internal" | "critical"
  port?: number & multiple(1) & min(1024)
}
`

func TestJsonSchemaVerb(t *testing.T) {
	// THE SCHEMA GOES TO STDOUT so `aontu jsonschema x.aontu > s.json`
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
		{[]string{"a.aontu", "b.aontu"}, "needs one file"},
		{[]string{"--format", "yaml", "a.aontu"}, "--format needs"},
		{[]string{"--at"}, "--at needs a path"},
		{[]string{"--nope", "a.aontu"}, "unknown jsonschema option"},
		{[]string{"/no/such/file.aontu"}, "cannot read"},
		// A --trust the profile parser refuses stops the verb before it
		// reads anything, which is the point: the capability decides
		// what may be read.
		{[]string{"--trust", "nonsense", "a.aontu"}, "--trust"},
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

func TestJsonSchemaImportWritesAontuAndNamesWhatItCannotCarry(t *testing.T) {
	file := filepath.Join(t.TempDir(), "schema.json")
	write := func(src string) {
		if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	// THE TEXT GOES TO STDOUT and the losses to stderr, as the export's
	// do, followed by the vet invocation that checks data against it.
	const vetWith = "vet with: aontu vet --no-fill --exact-numbers <document> <data>\n"
	write(`{"type": "object", "properties": {"n": {"type": "integer"}}}`)
	out, errw, code := jsonSchemaRun("import", file)
	if 0 != code || "n?: number & multiple(1)\n" != out || vetWith != errw {
		t.Fatalf("clean import: %d %q %q", code, out, errw)
	}

	write(`{"type": "string", "$vocabulary": {}}`)
	out, errw, code = jsonSchemaRun("import", file)
	if 0 != code || "empty()\n" != out || !strings.HasPrefix(errw, "lossy: #/$vocabulary $vocabulary:") ||
		!strings.HasSuffix(errw, "\n"+vetWith) {
		t.Fatalf("lossy import: %d %q %q", code, out, errw)
	}
	if _, _, code = jsonSchemaRun("import", "--strict", file); 1 != code {
		t.Fatalf("--strict: %d", code)
	}

	// --defaults makes an optional property's default a preference.
	write(`{"type": "object", "properties": {"p": {"type": "integer", "default": 8080}}}`)
	if out, _, code := jsonSchemaRun("import", "--defaults", file); 0 != code ||
		!strings.HasPrefix(out, "p?: *8080|") {
		t.Fatalf("--defaults: %d %q", code, out)
	}

	// --uri is the base a relative reference resolves against, and --doc
	// adds a document it may reach; a usage fault exits 2.
	doc := filepath.Join(filepath.Dir(file), "n.json")
	if err := os.WriteFile(doc, []byte(`{"type": "integer"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	write(`{"type": "object", "properties": {"a": {"$ref": "n.json"}}}`)
	if out, _, code := jsonSchemaRun("import", "--uri", "https://example.com/s.json",
		"--doc", "https://example.com/n.json", doc, file); 0 != code ||
		!strings.Contains(out, `id: "https://example.com/n.json"`) {
		t.Fatalf("--uri --doc: %d %q", code, out)
	}
	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{"import", "--uri"}, "--uri needs a URI"},
		{[]string{"import", "--doc", "https://example.com/n.json"}, "--doc needs a URI and a file"},
		{[]string{"import", "--doc", "https://example.com/n.json", doc + ".gone", file}, "cannot read"},
	} {
		if _, errw, code := jsonSchemaRun(c.args...); 2 != code || !strings.Contains(errw, c.want) {
			t.Fatalf("%v = %d: %s", c.args, code, errw)
		}
	}
	write(`{"type": "string", "$vocabulary": {}}`)

	out, _, code = jsonSchemaRun("import", "--format", "json", file)
	var j map[string]any
	if err := json.Unmarshal([]byte(out), &j); nil != err || 0 != code {
		t.Fatalf("json: %d %v\n%s", code, err, out)
	}
	producer, _ := j["aontu"].(map[string]any)
	if "jsonschema" != producer["verb"] || "empty()\n" != j["text"] || "lossy" != j["verdict"] ||
		"[--no-fill --exact-numbers]" != fmt.Sprint(j["vet"]) {
		t.Fatalf("json envelope: %v", j)
	}
	if _, has := j["errors"]; has {
		t.Fatalf("errors on a run that stood up: %v", j)
	}

	// Text that is not a schema refuses, in vet's finding shape.
	write(`{"type": 5`)
	out, errw, code = jsonSchemaRun("import", file)
	if 4 != code || "" != out || !strings.Contains(errw, "jsonschema_schema") ||
		strings.Contains(errw, "vet with") {
		t.Fatalf("refusal: %d %q %q", code, out, errw)
	}
	out, _, code = jsonSchemaRun("import", "--format", "json", file)
	var je struct {
		Verdict string `json:"verdict"`
		Errors  []struct {
			Code string `json:"code"`
		} `json:"errors"`
		Vet []string `json:"vet"`
	}
	if err := json.Unmarshal([]byte(out), &je); nil != err || 4 != code ||
		"error" != je.Verdict || "jsonschema_schema" != je.Errors[0].Code || nil != je.Vet {
		t.Fatalf("json refusal: %d %v\n%s", code, err, out)
	}
}

func TestJsonSchemaImportUsageErrorsExit2(t *testing.T) {
	file := filepath.Join(t.TempDir(), "schema.json")
	if err := os.WriteFile(file, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{
		{"import"},
		{"import", file, file},
		{"import", "--bogus", file},
		{"import", "--format", "yaml", file},
		{"import", filepath.Join(filepath.Dir(file), "missing.json")},
	} {
		if _, _, code := jsonSchemaRun(args...); 2 != code {
			t.Fatalf("%v: exit %d", args, code)
		}
	}
	if out, _, code := jsonSchemaRun("import", "--help"); 0 != code ||
		!strings.Contains(out, "aontu jsonschema import") {
		t.Fatalf("--help: %d", code)
	}
}
