/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// THE REPAIR LOOP, END TO END. Emit -> vet -> why -> set -> re-vet,
// through the whole command, with the exit code asserted at every step.
// The Go twin of the cli-repair-loop suite in ts/test/cli.test.ts.
//
// The capability review exists for this loop and until now nothing
// executed it: the spec suite pins each verb in isolation, so the verbs
// could each be right and the loop still not close. Walking it by hand
// is what found the two defects the loop's own status report opens with
// -- `Site` has no extent, and `set` cannot narrow a pinned literal --
// and neither was visible from any single verb.
//
// The exit codes ARE the assertion. A harness driving this reads
// nothing else between steps, so a step that returns the right text
// under the wrong code is a step that misroutes the loop.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const loopSchemaSrc = "service: {\n" +
	"  name: string\n" +
	"  port: integer & above(1023)\n" +
	"}\n"

// What an agent emitted: the name is right, the port was never written.
// A HOLE, which is the shape `set` can repair.
const loopDeploySrc = "service: { name: \"auth\" }\n"

// loopRun drives any verb, returning stdout+stderr and the exit code.
func loopRun(args ...string) (string, int) {
	var out, errw bytes.Buffer
	code := run(args, strings.NewReader(""), &out, &errw, false)
	return out.String() + errw.String(), code
}

func loopFiles(t *testing.T) (string, string, string) {
	t.Helper()
	dir := t.TempDir()
	schema := filepath.Join(dir, "schema.aon")
	deploy := filepath.Join(dir, "deploy.aon")
	if err := os.WriteFile(schema, []byte(loopSchemaSrc), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(deploy, []byte(loopDeploySrc), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir, schema, deploy
}

func TestRepairLoopEmitVetWhySetRevetCloses(t *testing.T) {
	dir, schema, deploy := loopFiles(t)
	overlay := filepath.Join(dir, "overlay.aon")

	// 1. VET the emitted document. Not a contradiction -- nothing
	//    conflicts -- so exit 3, the verdict that means "not satisfied
	//    YET", which is the code that tells a harness to repair rather
	//    than to start over.
	out, code := loopRun("vet", schema, deploy)
	if 3 != code {
		t.Fatalf("vet: %d\n%s", code, out)
	}
	vetMatch(t, out, `verdict: incomplete`)
	vetMatch(t, out, `\$\.service\.port`)

	// 2. WHY, on the schema, for what the hole has to satisfy. The
	//    finding named the path; this is the step that turns it into a
	//    constraint the emitter can meet.
	out, code = loopRun("why", "$.service.port", schema)
	if 0 != code {
		t.Fatalf("why: %d\n%s", code, out)
	}
	vetMatch(t, out, `above\(1023\)`)

	// 3. SET, which writes the overlay only if the change holds.
	out, code = loopRun("set", "$.service.port=8080",
		"--entry", deploy, "--overlay", overlay)
	if 0 != code {
		t.Fatalf("set: %d\n%s", code, out)
	}
	vetMatch(t, out, `verdict: valid`)
	vetMatch(t, out, `wrote: `)
	written, err := os.ReadFile(overlay)
	if err != nil {
		t.Fatal(err)
	}
	vetMatch(t, string(written), `"service": "port": 8080`)

	// The entry is UNTOUCHED: the overlay is the change, which is what
	// makes the loop safe to run against a file a human also edits.
	entry, err := os.ReadFile(deploy)
	if err != nil {
		t.Fatal(err)
	}
	if loopDeploySrc != string(entry) {
		t.Fatalf("entry rewritten: %q", string(entry))
	}

	// 4. RE-VET the pair. The two files together are the repaired
	//    document, so the loop closes through an include of both.
	all := filepath.Join(dir, "all.aon")
	if err := os.WriteFile(all,
		[]byte("@\"./deploy.aon\"\n@\"./overlay.aon\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	out, code = loopRun("vet", schema, all)
	if 0 != code {
		t.Fatalf("re-vet: %d\n%s", code, out)
	}
	vetMatch(t, out, `verdict: valid`)
}

// The other arm, and the one the status report calls the loop's missing
// third step: unification only NARROWS, so a value the data already
// pinned cannot be set to a different one. The overlay is not written,
// the entry is not touched, and the finding names the site doing the
// pinning -- which is where a human, not `set`, has to go.
func TestRepairLoopPinnedValueRefusesAndWritesNothing(t *testing.T) {
	dir, _, deploy := loopFiles(t)
	overlay := filepath.Join(dir, "overlay.aon")

	out, code := loopRun("set", `$.service.name="other"`,
		"--entry", deploy, "--overlay", overlay)
	if 1 != code {
		t.Fatalf("set: %d\n%s", code, out)
	}
	vetMatch(t, out, `verdict: invalid`)
	vetMatch(t, out, `\$\.service\.name`)
	if _, err := os.Stat(overlay); !os.IsNotExist(err) {
		t.Fatalf("overlay written: %v", err)
	}
	entry, err := os.ReadFile(deploy)
	if err != nil {
		t.Fatal(err)
	}
	if loopDeploySrc != string(entry) {
		t.Fatalf("entry rewritten: %q", string(entry))
	}
}

// And the step before the loop can start at all: a truth that does not
// stand up. Exit 4 says "stop, the schema is the problem" -- and now
// says WHAT the problem is, so a harness can report it instead of
// retrying against a schema that will never accept anything.
func TestRepairLoopBrokenSchemaStopsTheLoopAndSaysWhy(t *testing.T) {
	dir, _, deploy := loopFiles(t)
	broken := filepath.Join(dir, "broken.aon")
	if err := os.WriteFile(broken, []byte("a: 1\na: 2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	out, code := loopRun("vet", "--format", "json", broken, deploy)
	if 4 != code {
		t.Fatalf("vet: %d\n%s", code, out)
	}
	var report struct {
		Verdict  string `json:"verdict"`
		Findings []struct {
			Code  string `json:"code"`
			Sites []struct {
				File string `json:"file"`
				Role string `json:"role"`
			} `json:"sites"`
		} `json:"findings"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if "error" != report.Verdict || 1 != len(report.Findings) ||
		"scalar_value" != report.Findings[0].Code {
		t.Fatalf("report: %+v", report)
	}
	for _, site := range report.Findings[0].Sites {
		if "schema" != site.Role || broken != site.File {
			t.Fatalf("site: %+v", site)
		}
	}
}
