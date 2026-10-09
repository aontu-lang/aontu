/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// The vendored JSON Schema corpora through the importer and `vet
// --no-fill --exact-numbers`, each against its own skip ledger, as
// test/vectors/README.md describes, mirroring
// ts/test/jsonschema-suite.test.ts. Each schema and instance is the
// corpus's own text, so no JSON reader rounds its numbers.

var vectorsDir = filepath.Join("..", "test", "vectors")

type suiteSkip struct {
	file, group, test, construct string
	used                         bool
}

type suiteCase struct {
	test, data string
	want       bool
}

type suiteGroup struct {
	file, group, schema, dialect string
	cases                        []suiteCase
}

func tsvRows(t *testing.T, file string) [][]string {
	raw, err := os.ReadFile(file)
	if nil != err {
		t.Fatal(err)
	}
	out := [][]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		if "" != strings.TrimSpace(line) && !strings.HasPrefix(line, "#") {
			out = append(out, strings.Split(line, "\t"))
		}
	}
	return out
}

func readSuiteSkips(t *testing.T, ledger string) []*suiteSkip {
	out := []*suiteSkip{}
	for _, cols := range tsvRows(t, ledger) {
		if len(cols) < 4 {
			t.Fatalf("a skip row needs five columns: %q", cols)
		}
		out = append(out, &suiteSkip{file: cols[0], group: cols[1], test: cols[2], construct: cols[3]})
	}
	return out
}

// listedSkip finds the whole file, the whole group, or the one test.
func listedSkip(skips []*suiteSkip, file, group, name string) *suiteSkip {
	for _, s := range skips {
		if s.file == file && "*" == s.group {
			return s
		}
	}
	for _, s := range skips {
		if s.file == file && s.group == group && "*" == s.test {
			return s
		}
	}
	for _, s := range skips {
		if s.file == file && s.group == group && s.test == name {
			return s
		}
	}
	return nil
}

func suiteFiles(t *testing.T, root string) []string {
	out := []string{}
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if nil == err && !d.IsDir() && strings.HasSuffix(p, ".json") {
			rel, _ := filepath.Rel(root, p)
			out = append(out, filepath.ToSlash(rel))
		}
		return err
	})
	if nil != err {
		t.Fatal(err)
	}
	sort.Strings(out)
	return out
}

// suiteGroups reads the official suite's shape: files of groups, each a
// schema and its tests, read in the dialect the directory is written in
// (ADR-061).
func suiteGroups(t *testing.T, dir, dialect string) []suiteGroup {
	out := []suiteGroup{}
	for _, file := range suiteFiles(t, dir) {
		raw, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(file)))
		if nil != err {
			t.Fatal(err)
		}
		src := string(raw)
		groups, p := parseSchemaJSON(src)
		if nil == groups || "array" != groups.t {
			t.Fatalf("%s is not a suite file: %s", file, p.why)
		}
		for _, g := range groups.items {
			schemaNode := suiteMember(t, g, "schema")
			sg := suiteGroup{file: file, group: suiteMember(t, g, "description").s,
				schema: src[schemaNode.off:schemaNode.end], dialect: dialect}
			for _, c := range suiteMember(t, g, "tests").items {
				dataNode := suiteMember(t, c, "data")
				sg.cases = append(sg.cases, suiteCase{test: suiteMember(t, c, "description").s,
					data: src[dataNode.off:dataNode.end], want: "true" == suiteMember(t, c, "valid").t})
			}
			out = append(out, sg)
		}
	}
	return out
}

// parsingGroups reads JSONTestSuite's shape: one JSON text per file, an
// instance of `true`; an implementation-defined file takes its pinned answer.
func parsingGroups(t *testing.T, dir string) []suiteGroup {
	decided := map[string]bool{}
	for _, cols := range tsvRows(t, filepath.Join(dir, "decisions.tsv")) {
		decided[cols[0]] = "true" == cols[1]
	}
	cases := filepath.Join(dir, "test_parsing")
	entries, err := os.ReadDir(cases)
	if nil != err {
		t.Fatal(err)
	}
	out := []suiteGroup{}
	for _, e := range entries {
		file := e.Name()
		answer, pinned := decided[file]
		if 'i' == file[0] && !pinned {
			t.Fatalf("%s has no answer in decisions.tsv", file)
		}
		raw, err := os.ReadFile(filepath.Join(cases, file))
		if nil != err {
			t.Fatal(err)
		}
		want := 'y' == file[0] || ('n' != file[0] && answer)
		out = append(out, suiteGroup{file: file, group: file[:1], schema: "true",
			cases: []suiteCase{{test: "parse", data: string(raw), want: want}}})
	}
	return out
}

// suiteRemotes is the suite's remotes, served at http://localhost:1234/,
// and each under its own `$id` where it names another URI.
func suiteRemotes(t *testing.T) map[string]string {
	dir := filepath.Join(vectorsDir, "jsonschema", "remotes")
	out := map[string]string{}
	names := suiteFiles(t, dir)
	texts := make([]string, len(names))
	for i, f := range names {
		raw, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(f)))
		if nil != err {
			t.Fatal(err)
		}
		texts[i] = string(raw)
		out["http://localhost:1234/"+f] = texts[i]
	}
	for _, text := range texts {
		var doc map[string]any
		if nil == json.Unmarshal([]byte(text), &doc) {
			if id, ok := doc["$id"].(string); ok {
				if _, had := out[id]; !had {
					out[id] = text
				}
			}
		}
	}
	return out
}

func runCorpus(t *testing.T, name string, bound int, groups []suiteGroup,
	documents map[string]string) {
	skips := readSuiteSkips(t, filepath.Join(vectorsDir, filepath.FromSlash(name)))
	if bound < len(skips) {
		t.Fatalf("the %s ledger holds %d rows, past its bound of %d", name, len(skips), bound)
	}

	problems := []string{}
	total, passed, skipped := 0, 0, 0
	for _, g := range groups {
		// The suite's optional/format/ asks for format assertion (ADR-059).
		report := ImportJSONSchema(g.schema, &ImportOptions{Path: g.file, Documents: documents,
			FormatAssertion: strings.HasPrefix(g.file, "optional/format/"), Dialect: g.dialect})
		for _, c := range g.cases {
			total++
			got := false
			if "error" != report.Verdict {
				got = VetValid == Vet(report.Aontu, c.data,
					&VetOptions{NoFill: true, ExactNumbers: true}).Verdict

				// The differential: the admission trial of the imported
				// schema over the exact instance answers as vet does.
				sval, serr := New().Parse(report.Aontu)
				da := New()
				da.ExactNumbers = true
				dval, derr := da.Parse(c.data)
				if nil == serr && nil == derr {
					if admitted := Admits(sval, dval); admitted != got {
						problems = append(problems, fmt.Sprintf(
							"%s | %s | %s: vet says %v, the admission trial says %v",
							g.file, g.group, c.test, got, admitted))
					}
				}
			}
			skip := listedSkip(skips, g.file, g.group, c.test)
			if got == c.want {
				passed++
				if nil != skip && "*" != skip.test {
					problems = append(problems, fmt.Sprintf(
						"%s | %s | %s: listed as a skip (%s) and passes; delete its row",
						g.file, g.group, c.test, skip.construct))
				}
			} else if nil == skip {
				problems = append(problems, fmt.Sprintf(
					"%s | %s | %s: wanted valid=%v and got valid=%v, with no skip listed",
					g.file, g.group, c.test, c.want, got))
			} else {
				skip.used = true
				skipped++
			}
		}
	}
	for _, s := range skips {
		if !s.used {
			problems = append(problems, fmt.Sprintf(
				"%s | %s | %s: listed as a skip (%s) and nothing under it fails; delete its row",
				s.file, s.group, s.test, s.construct))
		}
	}
	t.Logf("%s: %d tests, %d pass, %d skipped, %d ledger rows",
		name, total, passed, skipped, len(skips))
	if 0 < len(problems) {
		t.Fatal(strings.Join(problems, "\n"))
	}
}

// Each ledger may not grow past its bound; the register tightens them.
func TestJSONSchemaSuite(t *testing.T) {
	runCorpus(t, "jsonschema/skips.tsv", 13,
		suiteGroups(t, filepath.Join(vectorsDir, "jsonschema", "tests", "draft2020-12"), ""),
		suiteRemotes(t))
}

// TestJSONSchemaSuiteEarlierDialects runs the earlier dialects'
// directories, each the default dialect of its own run and each with its
// own ledger.
func TestJSONSchemaSuiteEarlierDialects(t *testing.T) {
	for _, d := range []struct {
		dir, dialect string
		bound        int
	}{{"draft2019-09", "2019-09", 21}, {"draft7", "draft-07", 14}, {"draft6", "draft-06", 4},
		{"draft4", "draft-04", 4}} {
		t.Run(d.dir, func(t *testing.T) {
			runCorpus(t, "jsonschema/skips-"+d.dir+".tsv", d.bound,
				suiteGroups(t, filepath.Join(vectorsDir, "jsonschema", "tests", d.dir), d.dialect),
				suiteRemotes(t))
		})
	}
}

func TestAjvExtraTests(t *testing.T) {
	runCorpus(t, "ajv-extras/skips.tsv", 0,
		suiteGroups(t, filepath.Join(vectorsDir, "ajv-extras", "tests"), ""), nil)
}

func TestJSONTestSuiteAsInstances(t *testing.T) {
	runCorpus(t, "jsontestsuite/skips.tsv", 87,
		parsingGroups(t, filepath.Join(vectorsDir, "jsontestsuite")), nil)
}

// suiteMember is a suite object's member, read with the importer's own
// JSON reader so that each schema and instance is the suite's own text.
func suiteMember(t *testing.T, node *jnode, key string) *jnode {
	v := jentryOf(node, key)
	if nil == v {
		t.Fatalf("a suite object without %s", key)
	}
	return v
}
