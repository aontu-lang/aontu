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

// vectorRemotes: the documents the suite's tests name, the remotes of
// the releases they refer to, each under the URI the suite serves it
// from.
func vectorRemotes(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, release := range []string{"draft2019-09", "draft2020-12"} {
		for _, f := range vectorFiles(t, filepath.Join(dir, release)) {
			raw, err := os.ReadFile(filepath.Join(dir, release, f))
			if nil != err {
				t.Fatalf("cannot read %s: %v", f, err)
			}
			out["http://localhost:1234/"+release+"/"+f] = string(raw)
		}
	}
	return out
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

func vectorSuiteProblems(t *testing.T, root string, ledger vectorLedger,
	documents map[string]string) []string {
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
			report := New().ImportJSONSchemaWith(string(g.Schema),
				JSONSchemaImportOptions{Documents: documents})
			account := vectorLost(report)
			if "error" == report.Verdict {
				account = report.Errors[0].Code
			} else if "" == account {
				account = "-"
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

// vectorLost: what an import says it lost, each construct once, sorted.
func vectorLost(report SchemaImportReport) string {
	lost := map[string]bool{}
	for _, l := range report.Lossy {
		lost[l.Construct] = true
	}
	names := []string{}
	for k := range lost {
		names = append(names, k)
	}
	sort.Strings(names)
	return strings.Join(names, ",")
}

type annotationAssertion struct {
	Location string                     `json:"location"`
	Keyword  string                     `json:"keyword"`
	Expected map[string]json.RawMessage `json:"expected"`
}

type annotationTest struct {
	Instance   json.RawMessage       `json:"instance"`
	Assertions []annotationAssertion `json:"assertions"`
}

type annotationCase struct {
	Description   string           `json:"description"`
	Compatibility *string          `json:"compatibility"`
	Schema        json.RawMessage  `json:"schema"`
	Tests         []annotationTest `json:"tests"`
}

// vectorFor2020: a case the suite marks for other releases only is not
// this dialect's to answer (the suite's README, "compatibility").
func vectorFor2020(compat *string) bool {
	if nil == compat {
		return true
	}
	for _, c := range strings.Split(*compat, ",") {
		n, _ := strconv.Atoi(strings.TrimLeft(c, "<="))
		if strings.HasPrefix(c, "<=") && 2020 > n ||
			!strings.HasPrefix(c, "<=") && strings.HasPrefix(c, "=") && 2020 != n ||
			!strings.HasPrefix(c, "<=") && !strings.HasPrefix(c, "=") && n > 2020 {
			return false
		}
	}
	return true
}

var vectorMetaKeys = map[string]bool{"title": true, "description": true,
	"default": true, "examples": true, "readOnly": true, "writeOnly": true,
	"format": true, "contentEncoding": true, "contentMediaType": true,
	"contentSchema": true}

func vectorJSON(v any) string {
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return strings.TrimSpace(buf.String())
}

// vectorCollected: the values a location collects for a keyword, read
// off the riders the meet leaves there, as JSON; an unknown keyword's
// values ride `x`.
func vectorCollected(node Val, keyword string) []string {
	vals := []string{}
	gen := func(v Val) string {
		out, _ := schemaGenerated(v)
		return vectorJSON(out)
	}
	switch {
	case nil == node:
	case "deprecated" == keyword:
		if nil != node.deprecRec() {
			vals = append(vals, "true")
		}
	case vectorMetaKeys[keyword]:
		for _, m := range node.metaRec()[keyword] {
			vals = append(vals, gen(m))
		}
	default:
		for _, m := range node.metaRec()["x"] {
			if v, ok := m.(*MapVal).peg[keyword]; ok {
				vals = append(vals, gen(v))
			}
		}
	}
	return vectorSet(vals)
}

func vectorSet(vals []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range vals {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	sort.Strings(out)
	return out
}

// vectorPointerAt: a key still optional after the meet is one the
// instance does not have, and a container held beside a check is
// reached through it.
func vectorPointerAt(node Val, pointer string) Val {
	if "" == pointer {
		return node
	}
	for _, seg := range strings.Split(pointer[1:], "/") {
		k := strings.ReplaceAll(strings.ReplaceAll(seg, "~1", "/"), "~0", "~")
		if cj, ok := node.(*ConjunctVal); ok {
			node = nil
			for _, t := range cj.peg {
				switch t.(type) {
				case *MapVal, *ListVal:
					if nil == node {
						node = t
					}
				}
			}
		}
		switch n := node.(type) {
		case *MapVal:
			if n.isOptional(k) {
				return nil
			}
			node = n.peg[k]
		case *ListVal:
			i, err := strconv.Atoi(k)
			if nil != err || i < 0 || len(n.peg) <= i {
				return nil
			}
			node = n.peg[i]
		default:
			return nil
		}
	}
	return node
}

// vectorAnnotationProblems reads the suite's annotations/ (its README):
// the values each assertion lists for a keyword at an instance location
// must be what the riders there hold once the instance meets the schema
// with annotations collected, compared as a set and not by the schema
// location that gave each.
func vectorAnnotationProblems(t *testing.T, root string, ledger vectorLedger) []string {
	t.Helper()
	problems := []string{}
	seen := map[string]bool{}
	for _, file := range vectorFiles(t, root) {
		raw, err := os.ReadFile(filepath.Join(root, file))
		if nil != err {
			t.Fatalf("cannot read %s: %v", file, err)
		}
		var suite struct {
			Suite []annotationCase `json:"suite"`
		}
		if err := json.Unmarshal(raw, &suite); nil != err {
			t.Fatalf("%s: %v", file, err)
		}
		for _, c := range suite.Suite {
			if !vectorFor2020(c.Compatibility) {
				continue
			}
			report := New().ImportJSONSchema(string(c.Schema))
			account := vectorLost(report)
			if "error" == report.Verdict {
				account = report.Errors[0].Code
			} else if "" == account {
				account = "-"
			}
			for n, tc := range c.Tests {
				var node Val
				if "error" != report.Verdict {
					met, merr := (&Aontu{ExactNumbers: true, Annotate: true}).Unify(report.Source +
						"\ninstance: $.schema\ninstance: " + string(tc.Instance) + "\n")
					if mm, ok := met.(*MapVal); ok && nil == merr {
						node = mm.peg["instance"]
					}
				}
				for _, a := range tc.Assertions {
					key := strings.Join([]string{file, c.Description, strconv.Itoa(n + 1),
						a.Location, a.Keyword}, "\t")
					if seen[key] {
						t.Fatalf("an assertion named twice: %s", key)
					}
					seen[key] = true
					want := []string{}
					for _, e := range a.Expected {
						var v any
						_ = json.Unmarshal(e, &v)
						want = append(want, vectorJSON(v))
					}
					honoured := strings.Join(vectorSet(want), "\n") ==
						strings.Join(vectorCollected(vectorPointerAt(node, a.Location), a.Keyword), "\n")
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
	}
	for key := range ledger.lines {
		if !seen[key] {
			problems = append(problems, "listed, but names no assertion: "+key)
		}
	}
	if ledger.bound < len(ledger.lines) {
		problems = append(problems, strconv.Itoa(len(ledger.lines))+
			" lines, past the bound of "+strconv.Itoa(ledger.bound))
	}
	sort.Strings(problems)
	return problems
}

func TestVectorsJSONSchemaTestSuiteAnnotations(t *testing.T) {
	dir := filepath.Join(vectorsDir, "jsonschema")
	problems := vectorAnnotationProblems(t, filepath.Join(dir, "annotations", "tests"),
		readVectorLedger(t, filepath.Join(dir, "annotation-skips.tsv"), 5))
	if 0 < len(problems) {
		t.Fatalf("%d problem(s):\n%s", len(problems), strings.Join(problems, "\n"))
	}
}

func TestVectorsJSONSchemaTestSuite(t *testing.T) {
	dir := filepath.Join(vectorsDir, "jsonschema")
	problems := vectorSuiteProblems(t, filepath.Join(dir, "tests"),
		readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 3),
		vectorRemotes(t, filepath.Join(dir, "remotes")))
	if 0 < len(problems) {
		t.Fatalf("%d problem(s):\n%s", len(problems), strings.Join(problems, "\n"))
	}
}

func TestVectorsAjvExtras(t *testing.T) {
	dir := filepath.Join(vectorsDir, "ajv-extras")
	problems := vectorSuiteProblems(t, filepath.Join(dir, "spec", "extras"),
		readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 3), nil)
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
