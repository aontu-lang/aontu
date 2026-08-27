/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the repl cases in ts/test/cli.test.ts (G7 phase 7).
// The command handler is a pure function of (state, line), so every
// answer the session gives is as checkable as the CLI's — and the two
// ports were diffed line by line over the same script before these
// were written.

import (
	"bytes"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

const replDoc = "services: {\n  &: { replicas: *1 | integer }\n" +
	"  auth: { replicas: 3 }\n}"

func replRead(f string) (string, error) {
	if "missing.aon" == f {
		return "", errors.New("no such file")
	}
	return replDoc, nil
}

func TestReplLoadsADocumentAndAnswersAboutIt(t *testing.T) {
	state := replState{Mode: "json"}
	run := func(line string) replAnswer {
		res := replCommand(state, line, replRead)
		state = res.State
		return res
	}

	// Nothing loaded yet: the inspection commands say so rather than
	// guessing.
	if !strings.Contains(run(":get $.a").Out, "nothing loaded") {
		t.Fatal("expected nothing-loaded refusal")
	}
	if !strings.Contains(run(":why $.a").Out, "nothing loaded") {
		t.Fatal("expected nothing-loaded refusal")
	}

	if out := run(":load sys.aon").Out; !strings.HasPrefix(out, "loaded: sys.aon") {
		t.Fatalf("load: %q", out)
	}
	if out := run(":keys $.services").Out; "auth" != out {
		t.Fatalf("keys: %q", out)
	}
	if out := run(":get $.services.auth").Out; "{\n  \"replicas\": 3\n}" != out {
		t.Fatalf("get: %q", out)
	}
	if out := run(":why $.services.auth.replicas").Out; !strings.Contains(out, "(spread)") {
		t.Fatalf("why: %q", out)
	}

	// The `:canon` toggle reaches the query surface too.
	run(":canon")
	if out := run(":get $.services.auth").Out; `{"replicas":3}` != out {
		t.Fatalf("canon get: %q", out)
	}

	// A path that names nothing is a refusal, not an answer.
	if out := run(":get $.nope").Out; !strings.Contains(out, "no_path") {
		t.Fatalf("missing path: %q", out)
	}
	if out := run(":why $.nope").Out; !strings.Contains(out, "no_path") {
		t.Fatalf("missing path: %q", out)
	}

	// And the session's own commands still work.
	if out := run("").Out; "" != out {
		t.Fatalf("blank: %q", out)
	}
	if out := run(":help").Out; !strings.Contains(out, "Usage: aontu") {
		t.Fatalf("help: %q", out)
	}
	if out := run(":bogus").Out; !strings.Contains(out, "unknown command") {
		t.Fatalf("bogus: %q", out)
	}
	if out := run(":load").Out; !strings.Contains(out, "needs a file") {
		t.Fatalf("bare load: %q", out)
	}
	if out := run(":load missing.aon").Out; !strings.Contains(out, "cannot read") {
		t.Fatalf("missing file: %q", out)
	}
	if out := run("a:1").Out; `{"a":1}` != out {
		t.Fatalf("canon eval: %q", out)
	}
	run(":json")
	if out := run("a:1").Out; "{\n  \"a\": 1\n}" != out {
		t.Fatalf("json eval: %q", out)
	}
	if !run(":quit").Close || !run(":exit").Close {
		t.Fatal("quit did not close")
	}
}

// A document that does not stand up is refused at :load, and nothing
// is held: the session keeps whatever it had.
func TestReplLoadRefusesABrokenDocument(t *testing.T) {
	state := replState{Mode: "json"}
	res := replCommand(state, ":load broken.aon",
		func(string) (string, error) { return "a:1 a:2", nil })
	if res.State.Loaded || !strings.Contains(res.Out, "Cannot unify") {
		t.Fatalf("bad refusal: %+v", res)
	}
}

// The read loop itself: a scripted session through repl(), including
// the JSONL protocol, which has no banner and no prompt.
func TestReplLoopDrivesTheHandler(t *testing.T) {
	var out bytes.Buffer
	repl("json", false, trustArg{}, strings.NewReader("a:1\n:quit\n"), &out)
	if !strings.Contains(out.String(), "aontu>") ||
		!strings.Contains(out.String(), "REPL") {
		t.Fatalf("no banner or prompt: %q", out.String())
	}

	// A :load through the LOOP, which reads a real file: the handler's
	// reader is injected, and this is where the real one is wired.
	dir := t.TempDir()
	doc := filepath.Join(dir, "doc.aon")
	writeAt(t, doc, "a: 1")
	out.Reset()
	repl("json", false, trustArg{}, strings.NewReader(":load "+doc+"\n:get $.a\n"), &out)
	if !strings.Contains(out.String(), "loaded: "+doc) {
		t.Fatalf("loop did not load: %q", out.String())
	}

	out.Reset()
	repl("json", true, trustArg{}, strings.NewReader("a:1\n"), &out)
	got := strings.TrimSpace(out.String())
	if strings.Contains(got, "aontu>") || strings.Contains(got, "REPL") {
		t.Fatalf("jsonl session printed a banner: %q", got)
	}
	if !strings.HasPrefix(got, `{"ok":true,`) {
		t.Fatalf("not one JSON line: %q", got)
	}
}

// The SESSION protocol: one JSON line per answer, so a harness can
// drive the REPL.
func TestReplJSONLAnswersInOneLine(t *testing.T) {
	state := replState{Mode: "json", JSONL: true}
	run := func(line string) map[string]any {
		res := replCommand(state, line, func(string) (string, error) {
			return "a: 1", nil
		})
		state = res.State
		var out map[string]any
		if err := json.Unmarshal([]byte(res.Out), &out); nil != err {
			t.Fatalf("not one JSON line: %q", res.Out)
		}
		return out
	}
	first := run(":load doc.aon")
	if true != first["ok"] || "loaded: doc.aon\n{\n  \"a\": 1\n}" != first["out"] {
		t.Fatalf("load: %v", first)
	}
	if keys := run(":keys"); "a" != keys["out"] {
		t.Fatalf("keys: %v", keys)
	}
	if miss := run(":get $.zz"); false != miss["ok"] {
		t.Fatalf("missing path: %v", miss)
	}
	if bad := run("a:1 a:2"); false != bad["ok"] {
		t.Fatalf("conflict: %v", bad)
	}
}
