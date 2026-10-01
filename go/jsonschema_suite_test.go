/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// The official JSON Schema Test Suite through the importer and `vet
// --no-fill --exact-numbers`, against the skip ledger, mirroring
// ts/test/jsonschema-suite.test.ts; the ledger is described in
// test/vectors/jsonschema/README.md. Each schema and instance is the
// suite's own text, so no JSON reader rounds its numbers.

const suiteSkipBound = 180

type suiteSkip struct {
	file, group, test, construct string
	used                         bool
}

func readSuiteSkips(t *testing.T, dir string) []*suiteSkip {
	raw, err := os.ReadFile(filepath.Join(dir, "skips.tsv"))
	if nil != err {
		t.Fatal(err)
	}
	out := []*suiteSkip{}
	for _, line := range strings.Split(string(raw), "\n") {
		if "" == strings.TrimSpace(line) || strings.HasPrefix(line, "#") {
			continue
		}
		cols := strings.Split(line, "\t")
		if len(cols) < 4 {
			t.Fatalf("a skip row needs five columns: %q", line)
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

func TestJSONSchemaSuite(t *testing.T) {
	suite := filepath.Join("..", "test", "vectors", "jsonschema")
	tests := filepath.Join(suite, "tests", "draft2020-12")
	skips := readSuiteSkips(t, suite)
	if suiteSkipBound < len(skips) {
		t.Fatalf("the skip ledger holds %d rows, past its bound of %d", len(skips), suiteSkipBound)
	}

	problems := []string{}
	total, passed, skipped := 0, 0, 0
	for _, file := range suiteFiles(t, tests) {
		raw, err := os.ReadFile(filepath.Join(tests, filepath.FromSlash(file)))
		if nil != err {
			t.Fatal(err)
		}
		src := string(raw)
		groups, p := parseSchemaJSON(src)
		if nil == groups || "array" != groups.t {
			t.Fatalf("%s is not a suite file: %s", file, p.why)
		}
		for _, g := range groups.items {
			description := suiteMember(t, g, "description").s
			schemaNode := suiteMember(t, g, "schema")
			report := ImportJSONSchema(src[schemaNode.off:schemaNode.end], &ImportOptions{Path: file})
			for _, c := range suiteMember(t, g, "tests").items {
				total++
				name := suiteMember(t, c, "description").s
				want := "true" == suiteMember(t, c, "valid").t
				dataNode := suiteMember(t, c, "data")
				data := src[dataNode.off:dataNode.end]
				got := false
				if "error" != report.Verdict {
					got = VetValid == Vet(report.Aontu, data,
						&VetOptions{NoFill: true, ExactNumbers: true}).Verdict

					// The differential: the admission trial of the imported
					// schema over the exact instance answers as vet does.
					sval, serr := New().Parse(report.Aontu)
					da := New()
					da.ExactNumbers = true
					dval, derr := da.Parse(data)
					if nil == serr && nil == derr {
						if admitted := Admits(sval, dval); admitted != got {
							problems = append(problems, fmt.Sprintf(
								"%s | %s | %s: vet says %v, the admission trial says %v",
								file, description, name, got, admitted))
						}
					}
				}
				skip := listedSkip(skips, file, description, name)
				if got == want {
					passed++
					if nil != skip && "*" != skip.test {
						problems = append(problems, fmt.Sprintf(
							"%s | %s | %s: listed as a skip (%s) and passes; delete its row",
							file, description, name, skip.construct))
					}
				} else if nil == skip {
					problems = append(problems, fmt.Sprintf(
						"%s | %s | %s: wanted valid=%v and got valid=%v, with no skip listed",
						file, description, name, want, got))
				} else {
					skip.used = true
					skipped++
				}
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
	t.Logf("jsonschema suite: %d tests, %d pass, %d skipped, %d ledger rows",
		total, passed, skipped, len(skips))
	if 0 < len(problems) {
		t.Fatal(strings.Join(problems, "\n"))
	}
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
