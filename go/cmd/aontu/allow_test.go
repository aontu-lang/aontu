/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const allowRolesCLI = "roles: {\n" +
	"  admin: { allow: [\"$\"] }\n" +
	"  dev: { allow: [\"$.services\"] deny: [\"$.services.*.tier\"] }\n" +
	"  qa: { allow: [\"$.tests\"] }\n" +
	"}\n"

func allowRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"allow"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func allowFile(t *testing.T, src string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "roles.aontu")
	if err := os.WriteFile(file, []byte(src), 0o600); nil != err {
		t.Fatal(err)
	}
	return file
}

func allowExpect(t *testing.T, wantCode int, args ...string) (string, string) {
	t.Helper()
	out, errw, code := allowRun(args...)
	if wantCode != code {
		t.Fatalf("%v: code %d, want %d\n%s%s", args, code, wantCode, out, errw)
	}
	return out, errw
}

func TestAllowAnswersEveryPathAndNamesTheRule(t *testing.T) {
	file := allowFile(t, allowRolesCLI)

	out, errw := allowExpect(t, 0, "--role", "dev", file, "$.services.auth.replicas")
	if "verdict: allowed\nrole: dev\n"+
		"$.services.auth.replicas: allowed by $.roles.dev.allow.0 ($.services)\n" != out ||
		"" != errw {
		t.Fatalf("%q %q", out, errw)
	}

	// Every reason has its line: deny names the rule, uncovered says
	// no rule reached, and the verdict is the exit code.
	out, _ = allowExpect(t, 1, "--role", "dev", file, "$.services.auth", "$.tests")
	if "verdict: refused\nrole: dev\n"+
		"$.services.auth: refused by $.roles.dev.deny.0 ($.services.*.tier)\n"+
		"$.tests: refused (no allow entry of dev covers it)\n" != out {
		t.Fatalf("%q", out)
	}
}

func TestAllowTakesTheAssignmentSpelling(t *testing.T) {
	file := allowFile(t, allowRolesCLI)
	out, _ := allowExpect(t, 0, "--role", "qa", file,
		"$.tests.smoke=\"on\"", "$.tests.x=\"a=b\"", "$.tests.y={ a: 1 }")
	for _, line := range []string{
		"$.tests.smoke: allowed", "$.tests.x: allowed", "$.tests.y: allowed"} {
		if !strings.Contains(out, "\n"+line) {
			t.Fatalf("%s missing from %q", line, out)
		}
	}

	// The value must be ONE value. `set` appends it as source after
	// the flattened path, so a second pair in it writes a sibling of
	// the overlay root, a subtree the gate was never asked about.
	for _, bad := range []string{
		"$.tests.smoke=3 secrets: key: \"x\"",
		"$.tests.smoke=3\nsecrets: 1",
		"$.tests.smoke=\"unterminated",
		"$.tests.smoke=@\"./other.aontu\"",
	} {
		out, errw := allowExpect(t, 2, "--role", "qa", file, bad)
		if "" != out || !strings.Contains(errw, "the value of $.tests.smoke is not one value") {
			t.Fatalf("%q: %q %q", bad, out, errw)
		}
	}
}

func TestAllowUndeclaredRoleIsRefusedWithAFinding(t *testing.T) {
	file := allowFile(t, allowRolesCLI)
	out, _ := allowExpect(t, 1, "--role", "ops", file, "$.a")
	if "verdict: refused\nrole: ops\n"+
		"$.a: refused (role ops is not declared)\n\n"+
		"$.roles.ops: no_path [reference]\n"+
		"  The role ops is not declared at $.roles in this document.\n" != out {
		t.Fatalf("%q", out)
	}
}

func TestAllowBrokenModelIsExit4WithTheEnginesFinding(t *testing.T) {
	file := allowFile(t, "roles: dev: { allow: \"$.a\" }\n")
	out, _ := allowExpect(t, 4, "--role", "dev", file, "$.a")
	// The engine's code brings the registry's class with it.
	if !regexp.MustCompile(
		`^verdict: error\nrole: dev\n\n\$: scalar_kind \[conflict\]`).MatchString(out) {
		t.Fatalf("%q", out)
	}

	// The same report as an object.
	out, _ = allowExpect(t, 4, "--format", "json", "--role", "dev", file, "$.a")
	var j struct {
		Verdict  string           `json:"verdict"`
		Paths    []map[string]any `json:"paths"`
		Findings []map[string]any `json:"findings"`
	}
	if err := json.Unmarshal([]byte(out), &j); nil != err {
		t.Fatal(err)
	}
	if "error" != j.Verdict || 0 != len(j.Paths) ||
		"scalar_kind" != j.Findings[0]["code"] || "conflict" != j.Findings[0]["class"] ||
		"[aontu/scalar_kind]: Cannot unify values at path $.roles.dev.allow" !=
			j.Findings[0]["message"] {
		t.Fatalf("%s", out)
	}
}

func TestAllowJSONNamesTheProducer(t *testing.T) {
	file := allowFile(t, allowRolesCLI)
	out, _ := allowExpect(t, 0, "--format", "json", "--role", "dev", file,
		"$.services.x.replicas")
	var j map[string]any
	if err := json.Unmarshal([]byte(out), &j); nil != err {
		t.Fatal(err)
	}
	if "allow" != j["aontu"].(map[string]any)["verb"] || "allowed" != j["verdict"] ||
		"dev" != j["role"] || 0 != len(j["findings"].([]any)) {
		t.Fatalf("%s", out)
	}
	want := map[string]any{
		"allowed": true, "by": "$.roles.dev.allow.0", "path": "$.services.x.replicas",
		"pattern": "$.services", "reason": "allow",
	}
	paths := j["paths"].([]any)
	if 1 != len(paths) {
		t.Fatalf("%s", out)
	}
	for k, v := range want {
		if v != paths[0].(map[string]any)[k] {
			t.Fatalf("%s: %s", k, out)
		}
	}
	// The keys are written in the canonical emitter's order.
	if !strings.Contains(out,
		"\"allowed\": true,\n      \"by\": \"$.roles.dev.allow.0\",\n      "+
			"\"path\": \"$.services.x.replicas\",\n      \"pattern\": \"$.services\",\n      "+
			"\"reason\": \"allow\"") {
		t.Fatalf("%s", out)
	}
}

func TestAllowAtMovesTheRolesMap(t *testing.T) {
	file := allowFile(t, "policy: roles: dev: { allow: [\"$.a\"] }\n")
	out, _ := allowExpect(t, 0, "--role", "dev", "--at", "$.policy.roles", file, "$.a.b")
	if !strings.Contains(out, "allowed by $.policy.roles.dev.allow.0") {
		t.Fatalf("%q", out)
	}
	// An empty anchor is the root: every top-level key is a role.
	top := allowFile(t, "dev: { allow: [\"$.a\"] }\n")
	out, _ = allowExpect(t, 0, "--role", "dev", "--at", "", top, "$.a.b")
	if !strings.Contains(out, "allowed by $.dev.allow.0") {
		t.Fatalf("%q", out)
	}
}

func TestAllowTrustReachesTheEngine(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "dev.aontu"),
		[]byte("roles: dev: { allow: [\"$\"] }"), 0o600); nil != err {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "roles.aontu")
	if err := os.WriteFile(file, []byte("@\"./dev.aontu\"\n"), 0o600); nil != err {
		t.Fatal(err)
	}
	allowExpect(t, 0, "--role", "dev", file, "$.a")
	out, _ := allowExpect(t, 4, "--trust", "none", "--role", "dev", file, "$.a")
	if !strings.Contains(out, "include_denied") {
		t.Fatalf("%q", out)
	}
}

func TestAllowUsageErrorsExit2(t *testing.T) {
	file := allowFile(t, allowRolesCLI)
	for _, args := range [][]string{
		{},
		{file, "$.a"},
		{"--role", "dev", file},
		{"--role"},
		{"--role", "dev", "--at"},
		{"--role", "dev", "--format"},
		{"--role", "dev", "--format", "yaml", file, "$.a"},
		{"--role", "dev", "--bogus", file, "$.a"},
		{"--trust", "bogus", "--role", "dev", file, "$.a"},
	} {
		allowExpect(t, 2, args...)
	}
	for _, role := range []string{"", ".", "dev.allow", "a.b"} {
		_, errw := allowExpect(t, 2, "--role", role, file, "$.a")
		if !strings.Contains(errw, "--role needs one key, without dots") {
			t.Fatalf("%q: %q", role, errw)
		}
	}
	// A path starts with $: an empty argument, an assignment that
	// lost its path, and a second file name are all refused rather
	// than read as paths and answered.
	for _, arg := range []string{"", "=", "=1", "services.auth", file} {
		_, errw := allowExpect(t, 2, "--role", "admin", file, arg)
		if !strings.Contains(errw, "a path starts with $") {
			t.Fatalf("%q: %q", arg, errw)
		}
	}
	_, errw := allowExpect(t, 2, "--role", "dev",
		filepath.Join(filepath.Dir(file), "no.aontu"), "$.a")
	if !strings.Contains(errw, "cannot read") {
		t.Fatalf("%q", errw)
	}
	out, _ := allowExpect(t, 0, "--help")
	if !strings.Contains(out, "aontu allow --role") {
		t.Fatalf("%q", out)
	}
}

func TestAllowDispatchesThroughMain(t *testing.T) {
	file := allowFile(t, allowRolesCLI)
	var out, errw bytes.Buffer
	if code := run([]string{"allow", "--role", "admin", file, "$"},
		strings.NewReader(""), &out, &errw, false); 0 != code {
		t.Fatalf("code %d: %s%s", code, out.String(), errw.String())
	}
	if !strings.Contains(out.String(), "verdict: allowed") {
		t.Fatalf("%q", out.String())
	}
	out.Reset()
	run([]string{"--help"}, strings.NewReader(""), &out, &errw, false)
	if !strings.Contains(out.String(), "aontu allow --role <role>") ||
		!strings.Contains(out.String(), "Allow exit codes") {
		t.Fatalf("%q", out.String())
	}
}
