/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the explain cases in ts/test/helpdoc.test.ts (G11
// phase 3). The CONTRACT under test is that the verb projects the
// shared registry: every code test/spec/errcodes.tsv registers
// resolves, and nothing outside it does.

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func explainRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"explain"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

// registryCodes reads test/spec/errcodes.tsv -- the shared contract
// this verb projects -- rather than the engine table, so the test can
// fail when the two disagree instead of agreeing with itself.
func registryCodes(t *testing.T) []string {
	t.Helper()
	f, err := os.Open(filepath.Join(
		"..", "..", "..", "test", "spec", "errcodes.tsv"))
	if nil != err {
		t.Fatalf("cannot read the code registry: %v", err)
	}
	defer f.Close()
	var out []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if "" == strings.TrimSpace(line) || strings.HasPrefix(line, "#") {
			continue
		}
		out = append(out, strings.Split(line, "\t")[0])
	}
	return out
}

// EVERY REGISTERED CODE RESOLVES. This is the property that makes the
// verb usable from a report: a caller reading `[aontu/x]` out of a
// finding can always ask what it means.
func TestExplainAnswersForEveryRegisteredCode(t *testing.T) {
	codes := registryCodes(t)
	if 100 > len(codes) {
		t.Fatalf("the registry looks unread: %d codes", len(codes))
	}
	for _, code := range codes {
		out, errw, exit := explainRun(code)
		if 0 != exit {
			t.Errorf("%s: want 0, got %d: %s", code, exit, errw)
			continue
		}
		if !strings.Contains(out, "code:  "+code) {
			t.Errorf("%s: the report does not name the code: %s", code, out)
		}
		if !strings.Contains(out, "class: ") {
			t.Errorf("%s: the report carries no class: %s", code, out)
		}
	}
}

func TestExplainListIsTheRegistry(t *testing.T) {
	out, _, code := explainRun("--list")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	listed := map[string]bool{}
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		listed[strings.Fields(line)[0]] = true
	}
	registered := registryCodes(t)
	for _, code := range registered {
		if !listed[code] {
			t.Errorf("--list omits the registered code %s", code)
		}
	}
	if len(registered) != len(listed) {
		t.Errorf("--list has %d codes, the registry %d",
			len(listed), len(registered))
	}
}

// EVERY REGISTERED CODE HAS EXPLANATION TEXT. The registry is
// append-only, so without this gate a code lands with none and the
// repair loop answers a reader with nothing.
func TestExplainTextIsCompleteForEveryRegisteredCode(t *testing.T) {
	out, _, code := explainRun("--list")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var bare []string
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if strings.Contains(line, "(no text)") {
			bare = append(bare, strings.Fields(line)[0])
		}
	}
	if 0 != len(bare) {
		t.Errorf("%d registered code(s) carry no explanation text: %s",
			len(bare), strings.Join(bare, ", "))
	}
	// And the single-code form agrees: none answers with the placeholder.
	for _, name := range registryCodes(t) {
		body, _, exit := explainRun(name)
		if 0 != exit {
			t.Fatalf("%s: want 0, got %d", name, exit)
		}
		if strings.Contains(body, "no explanation text is registered") {
			t.Errorf("%s explains as the placeholder", name)
		}
	}
}

// The arms answering a code with no text: unreachable while the gate
// above holds, and kept because the registry is append-only.
func TestExplainAnswersACodeWithNoText(t *testing.T) {
	if "(no explanation text is registered for this code)" !=
		explainBody("") {
		t.Errorf("body: %q", explainBody(""))
	}
	if "some text" != explainBody("some text") {
		t.Errorf("body: %q", explainBody("some text"))
	}
	if "  (no text)" != noTextMark("") {
		t.Errorf("mark: %q", noTextMark(""))
	}
	if "" != noTextMark("some text") {
		t.Errorf("mark: %q", noTextMark("some text"))
	}
}

// THE BRACKETED FORM IS A CODE TOO: a report prints `[aontu/constraint]`
// and the repair loop says to look up what is in the brackets.
func TestExplainTakesTheNamespacedSpelling(t *testing.T) {
	for _, code := range registryCodes(t) {
		bare, _, exit := explainRun(code)
		if 0 != exit {
			t.Fatalf("%s: want 0, got %d", code, exit)
		}
		spaced, _, nsExit := explainRun("aontu/" + code)
		if 0 != nsExit {
			t.Fatalf("aontu/%s: want 0, got %d", code, nsExit)
		}
		if bare != spaced {
			t.Errorf("aontu/%s answers differently from %s", code, code)
		}
	}
	// An unknown code is still a usage error under either spelling, and
	// names the registered form rather than echoing the prefix.
	_, errw, exit := explainRun("aontu/nosuchcode")
	if 2 != exit {
		t.Fatalf("want 2, got %d", exit)
	}
	if !strings.Contains(errw, "no such error code `nosuchcode`") {
		t.Errorf("stderr: %q", errw)
	}
}

func TestExplainJSON(t *testing.T) {
	out, _, code := explainRun("--format", "json", "no_scalar_unify")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Class string `json:"class"`
		Code  string `json:"code"`
		Hint  string `json:"hint"`
	}
	if err := json.Unmarshal([]byte(out), &report); nil != err {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	if "no_scalar_unify" != report.Code || "conflict" != report.Class ||
		"" == report.Hint {
		t.Errorf("bad report: %+v", report)
	}
}

func TestExplainListJSONFlagsWhatIsExplained(t *testing.T) {
	out, _, code := explainRun("--list", "--format", "json")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Codes []struct {
			Class     string `json:"class"`
			Code      string `json:"code"`
			Explained bool   `json:"explained"`
		} `json:"codes"`
	}
	if err := json.Unmarshal([]byte(out), &report); nil != err {
		t.Fatalf("not JSON: %v", err)
	}
	if len(registryCodes(t)) != len(report.Codes) {
		t.Errorf("want the registry, got %d rows", len(report.Codes))
	}
	for _, row := range report.Codes {
		if !row.Explained {
			t.Errorf("%s is flagged unexplained", row.Code)
		}
	}
}

// A DYNAMIC CODE IS REGISTERED THROUGH ITS PREFIX and carries the
// prefix's hint: the suffix names the operator, the explanation is
// the prefix's.
func TestExplainResolvesADynamicCode(t *testing.T) {
	for _, code := range []string{"func:upper", "op[+]", "var[x", "ref[y"} {
		out, errw, exit := explainRun(code)
		if 0 != exit {
			t.Errorf("%s: want 0, got %d: %s", code, exit, errw)
		}
		if !strings.Contains(out, "code:  "+code) {
			t.Errorf("%s: not named in the report", code)
		}
	}
}

func TestExplainUnknownCodeSuggestsANearMatch(t *testing.T) {
	out, errw, code := explainRun("no_scalar_unif")
	if 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if "" != out {
		t.Errorf("a refusal wrote to stdout: %q", out)
	}
	for _, want := range []string{
		"no such error code", "did you mean `no_scalar_unify`", "--list",
	} {
		if !strings.Contains(errw, want) {
			t.Errorf("the refusal omits %q: %s", want, errw)
		}
	}
}

// The other arm of the suggestion: a code nothing is near gets the
// refusal with no "did you mean", because naming an unrelated code
// with confidence is worse than naming none.
func TestExplainUnknownCodeWithNoNearMatchSuggestsNothing(t *testing.T) {
	out, errw, code := explainRun("zzzzzzzzzzzzzzzzzzzz")
	if 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if "" != out {
		t.Errorf("a refusal wrote to stdout: %q", out)
	}
	if !strings.Contains(errw, "no such error code") {
		t.Errorf("no refusal: %s", errw)
	}
	if strings.Contains(errw, "did you mean") {
		t.Errorf("suggested something unrelated: %s", errw)
	}
}

func TestExplainUsageRefusals(t *testing.T) {
	for _, tc := range []struct {
		name, want string
		args       []string
	}{
		{"no code", "needs one code", nil},
		{"two codes", "needs one code", []string{"a", "b"}},
		{"list with code", "takes no code", []string{"--list", "x"}},
		{"bad format", "text or json", []string{"--format", "xml"}},
		{"unknown option", "unknown explain option", []string{"--bogus"}},
	} {
		_, errw, code := explainRun(tc.args...)
		if 2 != code {
			t.Errorf("%s: want 2, got %d", tc.name, code)
		}
		if !strings.Contains(errw, tc.want) {
			t.Errorf("%s: want %q in %q", tc.name, tc.want, errw)
		}
	}
}

func TestExplainVerbTakesTheToolHelp(t *testing.T) {
	out, _, code := explainRun("--help")
	if 0 != code || !strings.Contains(out, "Usage: aontu") {
		t.Errorf("want the tool help, got %d", code)
	}
}
