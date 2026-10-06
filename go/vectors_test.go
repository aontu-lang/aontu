/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// The vendored corpora: ts/test/vectors.test.ts is the canonical twin,
// and both read the same skip ledgers.

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

var vectorsDir = filepath.Join("..", "test", "vectors")

type vectorCase struct {
	Description string          `json:"description"`
	Data        json.RawMessage `json:"data"`
	Valid       bool            `json:"valid"`
}

type vectorGroup struct {
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
	Tests       []vectorCase    `json:"tests"`
}

type vectorLedger struct {
	bound int
	lines map[string][]string
}

var vectorBoundRe = regexp.MustCompile(`^# bound (\d+)$`)

func readVectorLedger(t *testing.T, file string, keys int) vectorLedger {
	t.Helper()
	raw, err := os.ReadFile(file)
	if nil != err {
		t.Fatalf("cannot read %s: %v", file, err)
	}
	ledger := vectorLedger{bound: -1, lines: map[string][]string{}}
	for _, line := range strings.Split(string(raw), "\n") {
		if m := vectorBoundRe.FindStringSubmatch(line); nil != m {
			ledger.bound, _ = strconv.Atoi(m[1])
		} else if "" != line && !strings.HasPrefix(line, "#") {
			cols := strings.Split(line, "\t")
			key := strings.Join(cols[:keys], "\t")
			if _, dup := ledger.lines[key]; dup {
				t.Fatalf("listed twice: %s", key)
			}
			ledger.lines[key] = cols[keys:]
		}
	}
	if 0 > ledger.bound {
		t.Fatalf("%s states no bound", file)
	}
	return ledger
}

func vectorFiles(t *testing.T, dir string) []string {
	t.Helper()
	files := []string{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if nil == err && !d.IsDir() && strings.HasSuffix(p, ".json") {
			rel, _ := filepath.Rel(dir, p)
			files = append(files, filepath.ToSlash(rel))
		}
		return err
	})
	if nil != err {
		t.Fatalf("cannot walk %s: %v", dir, err)
	}
	sort.Strings(files)
	return files
}

func vectorEvalAccepts(source, data string) bool {
	one := source + "\ninstance: $.schema\ninstance: " + data + "\n"
	alone := "instance: " + data + "\n"
	out, err := (&Aontu{ExactNumbers: true}).Generate(one)
	own, oerr := (&Aontu{ExactNumbers: true}).Generate(alone)
	if nil != err || nil != oerr {
		return false
	}
	om, _ := out.(map[string]any)
	dm, _ := own.(map[string]any)
	want, _ := json.Marshal(dm["instance"])
	if got, _ := json.Marshal(om["instance"]); string(got) == string(want) {
		return true
	}
	met, merr := (&Aontu{ExactNumbers: true}).Unify(one)
	mm, ok := met.(*MapVal)
	if nil != merr || !ok {
		return false
	}
	pruned, _ := json.Marshal(vetEvalPrune(om["instance"], mm.peg["instance"], dm["instance"]))
	return string(pruned) == string(want)
}

func vectorSuiteProblems(t *testing.T, root string, ledger vectorLedger) []string {
	t.Helper()
	problems := []string{}
	seen := map[string]bool{}
	for _, file := range vectorFiles(t, root) {
		raw, err := os.ReadFile(filepath.Join(root, file))
		if nil != err {
			t.Fatalf("cannot read %s: %v", file, err)
		}
		var groups []vectorGroup
		if err := json.Unmarshal(raw, &groups); nil != err {
			t.Fatalf("%s: %v", file, err)
		}
		for _, g := range groups {
			report := New().ImportJSONSchema(string(g.Schema))
			account := ""
			if "error" == report.Verdict {
				account = report.Errors[0].Code
			} else {
				lost := map[string]bool{}
				for _, l := range report.Lossy {
					if !strings.HasPrefix(l.Reason, "an annotation") {
						lost[l.Construct] = true
					}
				}
				names := []string{}
				for k := range lost {
					names = append(names, k)
				}
				sort.Strings(names)
				account = strings.Join(names, ",")
			}
			for _, c := range g.Tests {
				key := file + "\t" + g.Description + "\t" + c.Description
				if seen[key] {
					t.Fatalf("a test named twice: %s", key)
				}
				seen[key] = true
				honoured := false
				if "error" != report.Verdict {
					accepts := VetValid == Vet(report.Source, string(c.Data), &VetOptions{
						At: "$.schema", NoFill: true, ExactNumbers: true}).Verdict
					honoured = accepts == c.Valid
					if accepts != vectorEvalAccepts(report.Source, string(c.Data)) {
						problems = append(problems, "vet and evaluation disagree: "+key)
					}
				}
				listed, has := ledger.lines[key]
				switch {
				case !has && !honoured:
					problems = append(problems,
						"answers against the suite and is not listed: "+key+" ("+account+")")
				case has && honoured:
					problems = append(problems, "listed, but answers as the suite says: "+key)
				case has && listed[0] != account:
					problems = append(problems,
						"listed for "+listed[0]+", where the import says "+account+": "+key)
				}
			}
		}
	}
	for key := range ledger.lines {
		if !seen[key] {
			problems = append(problems, "listed, but names no test: "+key)
		}
	}
	if ledger.bound < len(ledger.lines) {
		problems = append(problems, strconv.Itoa(len(ledger.lines))+
			" lines, past the bound of "+strconv.Itoa(ledger.bound))
	}
	sort.Strings(problems)
	return problems
}

func TestVectorsJSONSchemaTestSuite(t *testing.T) {
	dir := filepath.Join(vectorsDir, "jsonschema")
	problems := vectorSuiteProblems(t, filepath.Join(dir, "tests"),
		readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 3))
	if 0 < len(problems) {
		t.Fatalf("%d problem(s):\n%s", len(problems), strings.Join(problems, "\n"))
	}
}

func TestVectorsAjvExtras(t *testing.T) {
	dir := filepath.Join(vectorsDir, "ajv-extras")
	problems := vectorSuiteProblems(t, filepath.Join(dir, "spec", "extras"),
		readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 3))
	if 0 < len(problems) {
		t.Fatalf("%d problem(s):\n%s", len(problems), strings.Join(problems, "\n"))
	}
}

func TestVectorsJSONTestSuite(t *testing.T) {
	dir := filepath.Join(vectorsDir, "jsontestsuite")
	ledger := readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 2)
	problems := []string{}
	seen := map[string]bool{}
	for _, file := range vectorFiles(t, filepath.Join(dir, "test_parsing")) {
		raw, err := os.ReadFile(filepath.Join(dir, "test_parsing", file))
		if nil != err {
			t.Fatalf("cannot read %s: %v", file, err)
		}
		instance := VetValid == Vet("any", string(raw), &VetOptions{ExactNumbers: true}).Verdict
		report := New().ImportJSONSchema(string(raw))
		read := !("error" == report.Verdict &&
			strings.HasPrefix(report.Errors[0].Message, "the schema is not JSON"))
		own := map[byte]string{'y': "accept", 'n': "refuse"}[file[0]]
		for _, r := range []struct {
			reader  string
			accepts bool
		}{{"instance", instance}, {"import", read}} {
			key := file + "\t" + r.reader
			seen[key] = true
			answer := "refuse"
			if r.accepts {
				answer = "accept"
			}
			listed, has := ledger.lines[key]
			switch {
			case !has && answer != own:
				problems = append(problems, "answers "+answer+" and is not listed: "+key)
			case has && listed[0] != answer:
				problems = append(problems,
					"listed as "+listed[0]+", but answers "+answer+": "+key)
			case has && answer == own:
				problems = append(problems, "listed, but answers as the corpus says: "+key)
			}
		}
	}
	for key := range ledger.lines {
		if !seen[key] {
			problems = append(problems, "listed, but names no case: "+key)
		}
	}
	if ledger.bound < len(ledger.lines) {
		problems = append(problems, strconv.Itoa(len(ledger.lines))+
			" lines, past the bound of "+strconv.Itoa(ledger.bound))
	}
	if 0 < len(problems) {
		sort.Strings(problems)
		t.Fatalf("%d problem(s):\n%s", len(problems), strings.Join(problems, "\n"))
	}
}
