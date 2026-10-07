/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


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
	file := filepath.Join(t.TempDir(), "doc.aontu")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const schemaContract = `spec: {
  name: string & re("^[a-z]+$")
  tier: *"internal" | "critical"
  port?: number & min(1024)
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
	file := jsonSchemaFile(t, "a: \"x\"\n")
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

func TestJsonSchemaExactNumbersJudgesAgainstTheExactReading(t *testing.T) {
	// An integer literal is lossy against plain vet, which reads 1.0 as
	// a float, and exact against vet --exact-numbers.
	file := jsonSchemaFile(t, "a: 1\n")
	_, plainErr, code := jsonSchemaRun("--strict", file)
	if 1 != code || !strings.Contains(plainErr, "integer literal") {
		t.Fatalf("plain: code %d: %s", code, plainErr)
	}
	out, errw, code := jsonSchemaRun("--strict", "--exact-numbers", file)
	if 0 != code || "" != errw || !strings.Contains(out, `"const": 1`) {
		t.Fatalf("exact: code %d: %s\n%s", code, errw, out)
	}
}

func jsonSchemaImportFile(t *testing.T, src []byte) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "schema.json")
	if err := os.WriteFile(file, src, 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestJsonSchemaImportWritesSourceAndNamesWhatItCannotCarry(t *testing.T) {
	file := jsonSchemaImportFile(t, []byte(`{"type": "object", "properties": `+
		`{"a": {"type": "string", "pattern": "(?<=a)b"}}}`))

	out, errw, code := jsonSchemaRun("import", file)
	if 0 != code || "schema: hide({ a?:empty() })\n" != out {
		t.Fatalf("code %d: %q", code, out)
	}
	if "lossy: #/properties/a/pattern pattern: the pattern uses a (?...) "+
		"group other than the non-capturing (?:, which re() does not carry, "+
		"so it is DROPPED and the import admits strings the schema refuses\n"+
		"vet data against it with: aontu vet --at '$.schema' --no-fill "+
		"--exact-numbers <file.aontu> <data>\n" != errw {
		t.Fatalf("stderr: %q", errw)
	}
	if _, _, code = jsonSchemaRun("import", "--strict", file); 1 != code {
		t.Fatalf("--strict on a lossy import = %d, want 1", code)
	}

	jout, _, code := jsonSchemaRun("import", "--format", "json", file)
	var report map[string]any
	if err := json.Unmarshal([]byte(jout), &report); err != nil || 0 != code {
		t.Fatalf("code %d, not JSON: %v\n%s", code, err, jout)
	}
	envelope, _ := report["aontu"].(map[string]any)
	if "jsonschema import" != envelope["verb"] || "lossy" != report["verdict"] ||
		out != report["source"] || nil != report["errors"] {
		t.Fatalf("report: %s", jout)
	}

	dflt := jsonSchemaImportFile(t, []byte(`{"type": "object", "properties": {"k": `+
		`{"type": "integer", "default": 1}}}`))
	if out, _, code := jsonSchemaRun("import", "--defaults", dflt); 0 != code ||
		"schema: hide({ k?: (meta(number & multiple(1), { default:1 })) & (*1|any) })\n" != out {
		t.Fatalf("--defaults = %d: %q", code, out)
	}

	// A reference into another document reads it from the set.
	other := jsonSchemaImportFile(t, []byte(`{"$defs": {"n": {"type": "integer"}}}`))
	main := jsonSchemaImportFile(t, []byte(`{"$ref": "http://e.com/other.json#/$defs/n"}`))
	if out, _, code := jsonSchemaRun("import", "--document",
		"http://e.com/other.json="+other, main); 0 != code ||
		"%_d-http_3a__2f__2f_e_2e_com_2f_other_2e_json-_24_defs-n = identity(\n"+
			"  number & multiple(1),\n  { key:\"n\" }\n)\n\n"+
			"schema: hide(%_d-http_3a__2f__2f_e_2e_com_2f_other_2e_json-_24_defs-n)\n" != out {
		t.Fatalf("--document = %d: %q", code, out)
	}

	bad := jsonSchemaImportFile(t, []byte(`{"$ref": "#/nope"}`))
	out, errw, code = jsonSchemaRun("import", bad)
	if 4 != code || "" != out || "#/$ref: jsonschema_ref [reference]\n"+
		"  the reference \"#/nope\" names no schema in this document\n" != errw {
		t.Fatalf("refusal = %d: %q %q", code, out, errw)
	}
	jout, _, code = jsonSchemaRun("import", "--format", "json", bad)
	report = map[string]any{}
	if err := json.Unmarshal([]byte(jout), &report); err != nil || 4 != code {
		t.Fatalf("code %d, not JSON: %v\n%s", code, err, jout)
	}
	errs, _ := report["errors"].([]any)
	first, _ := errs[0].(map[string]any)
	if "error" != report["verdict"] || "" != report["source"] ||
		"jsonschema_ref" != first["code"] {
		t.Fatalf("refusal report: %s", jout)
	}

	// Bytes that are not UTF-8 are the schema's fault, refused as
	// TypeScript refuses them.
	_, errw, code = jsonSchemaRun("import",
		jsonSchemaImportFile(t, []byte{0x22, 0xff, 0x22}))
	if 4 != code || "#: jsonschema_schema [parse]\n"+
		"  the schema is not JSON: the text is not well-formed Unicode\n" != errw {
		t.Fatalf("invalid UTF-8 = %d: %q", code, errw)
	}
}

func TestJsonSchemaImportArgumentErrors(t *testing.T) {
	file := jsonSchemaImportFile(t, []byte("true"))
	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{}, "jsonschema import needs one file"},
		{[]string{file, file}, "jsonschema import needs one file"},
		{[]string{"--bogus", file}, "unknown jsonschema import option"},
		{[]string{"--format", "yaml", file}, "--format needs"},
		{[]string{"--format"}, "--format needs"},
		{[]string{filepath.Join(t.TempDir(), "missing.json")}, "cannot read"},
		{[]string{"--document"}, "--document needs"},
		{[]string{"--document", "nouri", file}, "--document needs"},
		{[]string{"--document", "u=" + filepath.Join(t.TempDir(), "missing.json"), file},
			"cannot read"},
		{[]string{"--document", "u=" + file, "--document", "u=" + file, file},
			"names u twice"},
	} {
		_, errw, code := jsonSchemaRun(append([]string{"import"}, c.args...)...)
		if 2 != code || !strings.Contains(errw, c.want) {
			t.Fatalf("%v = %d: %s", c.args, code, errw)
		}
	}

	out, _, code := jsonSchemaRun("import", "--help")
	if 0 != code || !strings.Contains(out, "aontu jsonschema import") {
		t.Fatalf("--help = %d", code)
	}
}
