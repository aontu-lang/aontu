/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
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

	write(`{"type": "string", "$dynamicAnchor": "a"}`)
	out, errw, code = jsonSchemaRun("import", file)
	if 0 != code || "empty()\n" != out || !strings.HasPrefix(errw, "lossy: #/$dynamicAnchor $dynamicAnchor:") ||
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
		{[]string{"import", "--dialect"}, "--dialect needs a dialect"},
		{[]string{"import", "--doc", "https://example.com/n.json"}, "--doc needs a URI and a file"},
		{[]string{"import", "--doc", "https://example.com/n.json", doc + ".gone", file}, "cannot read"},
		{[]string{"import", "--format-grammar", "zip"}, "--format-grammar needs a name and a file"},
		{[]string{"import", "--format-grammar", "date", doc, file}, "cannot name date"},
		{[]string{"import", "--format-grammar", "zip", doc, "--format-grammar", "zip", doc, file},
			"names zip twice"},
		{[]string{"import", "--format-grammar", "zip", doc + ".gone", file}, "cannot read"},
	} {
		if _, errw, code := jsonSchemaRun(c.args...); 2 != code || !strings.Contains(errw, c.want) {
			t.Fatalf("%v = %d: %s", c.args, code, errw)
		}
	}

	// --format-assert makes a format format(g), and --format-grammar
	// gives a name outside the defined ones its grammar.
	zip := filepath.Join(filepath.Dir(file), "zip.abnf")
	if err := os.WriteFile(zip, []byte("zip = 5DIGIT\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	write(`{"type": "object", "properties": {"d": {"type": "string", ` +
		`"format": "date"}, "z": {"type": "string", "format": "zip"}}}`)
	if out, _, code := jsonSchemaRun("import", file); 0 != code || strings.Contains(out, `format("date")`) {
		t.Fatalf("annotation: %d %q", code, out)
	}
	if out, _, code := jsonSchemaRun("import", "--format-assert", "--format-grammar", "zip", zip, file); 0 != code ||
		!strings.Contains(out, `format("date")`) || !strings.Contains(out, `format("zip = 5DIGIT\n")`) {
		t.Fatalf("assertion: %d %q", code, out)
	}

	// --dialect reads a schema that names none in a legacy dialect.
	write(`{"type": "number", "maximum": 5, "exclusiveMaximum": true}`)
	if out, _, code := jsonSchemaRun("import", "--dialect", "draft-04", file); 0 != code ||
		!strings.Contains(out, "below(5)") {
		t.Fatalf("--dialect: %d %q", code, out)
	}

	// A schema its meta-schema refuses imports under --no-meta-check.
	write(`{"type": "object", "required": ["a", "a"]}`)
	if _, errw, code := jsonSchemaRun("import", file); 4 != code || !strings.Contains(errw, "jsonschema_schema") {
		t.Fatalf("meta-schema: %d %q", code, errw)
	}
	if out, _, code := jsonSchemaRun("import", "--no-meta-check", file); 0 != code || !strings.Contains(out, "a: any") {
		t.Fatalf("--no-meta-check: %d %q", code, out)
	}
	write(`{"type": "string", "$dynamicAnchor": "a"}`)

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

// ADR-066: the map is written beside the text, and the JSON form carries
// it too; vet reads it back for output units, and refuses one whose text
// has changed. Mirrors the TypeScript CLI test.
func TestJsonSchemaImportSourceMapAndVetOutputUnits(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "schema.json")
	sourceMap := filepath.Join(dir, "schema.map.json")
	doc := filepath.Join(dir, "schema.aontu")
	data := filepath.Join(dir, "data.json")
	write := func(path, text string) {
		if err := os.WriteFile(path, []byte(text), 0o600); nil != err {
			t.Fatal(err)
		}
	}
	write(file, `{"$id": "https://x.test/s", "type": "object", "properties": {"a": {"type": "number", "minimum": 1}}}`)
	write(data, `{"a": 0}`)

	out, _, code := jsonSchemaRun("import", "--source-map", sourceMap, file)
	if 0 != code {
		t.Fatalf("import: %d", code)
	}
	write(doc, out)
	written, err := os.ReadFile(sourceMap)
	if nil != err {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(written, &m); nil != err || m["sha256"] != importShaOf(out) {
		t.Fatalf("map: %v %v", err, m["sha256"])
	}
	jout, _, _ := jsonSchemaRun("import", "--format", "json", file)
	var j map[string]any
	if err := json.Unmarshal([]byte(jout), &j); nil != err || fmt.Sprint(j["map"]) != fmt.Sprint(m) {
		t.Fatalf("json map: %v\n%v", j["map"], m)
	}
	if _, _, code := jsonSchemaRun("import", "--source-map"); 2 != code {
		t.Fatalf("--source-map alone: %d", code)
	}
	if _, _, code := jsonSchemaRun("import", "--source-map", filepath.Join(dir, "no", "such.json"), file); 2 != code {
		t.Fatalf("unwritable map: %d", code)
	}
	// A schema that does not import writes no map.
	bad := filepath.Join(dir, "bad.json")
	write(bad, `{"type": 5`)
	if _, _, code := jsonSchemaRun("import", "--source-map", filepath.Join(dir, "bad.map.json"), bad); 4 != code {
		t.Fatalf("bad: %d", code)
	}
	if _, err := os.Stat(filepath.Join(dir, "bad.map.json")); nil == err {
		t.Fatal("a refused import wrote a map")
	}

	basic, _, code := vetRun("--output", "basic", "--source-map", sourceMap, doc, data)
	var b struct {
		Errors []map[string]any `json:"errors"`
	}
	if err := json.Unmarshal([]byte(basic), &b); nil != err || 1 != code || 1 != len(b.Errors) ||
		"/properties/a/minimum" != b.Errors[0]["keywordLocation"] ||
		"https://x.test/s#/properties/a/minimum" != b.Errors[0]["absoluteKeywordLocation"] ||
		"/a" != b.Errors[0]["instanceLocation"] {
		t.Fatalf("basic: %d %s", code, basic)
	}
	if flag, _, code := vetRun("--output", "flag", doc, data); 1 != code || "{\n  \"valid\": false\n}\n" != flag {
		t.Fatalf("flag: %d %q", code, flag)
	}
	// A map given without --output is checked all the same.
	if _, _, code := vetRun("--source-map", sourceMap, doc, data); 1 != code {
		t.Fatalf("map alone: %d", code)
	}
	for _, args := range [][]string{{"--output", "basic", doc, data}, {"--output", "xml", doc, data},
		{"--output", "flag", "--format", "json", doc, data}, {"--output", "flag", doc, data, data},
		{"--source-map"}, {"--source-map", filepath.Join(dir, "missing.json"), doc, data},
		{"--source-map", data, doc, data}} {
		if _, _, code := vetRun(args...); 2 != code {
			t.Fatalf("%v: %d", args, code)
		}
	}
	write(doc, out+"\n")
	if _, errw, code := vetRun("--output", "basic", "--source-map", sourceMap, doc, data); 2 != code ||
		!strings.Contains(errw, "its text has changed since the import") {
		t.Fatalf("changed: %d %q", code, errw)
	}
}

func importShaOf(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}
