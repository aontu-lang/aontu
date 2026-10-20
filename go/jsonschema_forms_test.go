/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// P6 of sketch/DEFINITION.0.md: every call and word the importer
// writes over the vendored corpora, strings removed, is a row of
// spec/forms.tsv, which the oracle writes from the definition's syntax,
// or of spec/forms-outside.tsv, the forms that wait on a decision, every
// row of which must still be written; mirrors ts/test/jsonschema-forms.test.ts.

var formsSpecDir = filepath.Join("..", "spec")

var formsQuoted = regexp.MustCompile(`"(?:[^"\\]|\\.)*"`)

type formUses struct {
	calls, words map[string]string
}

type outsideForm struct {
	text, kind, decision, what string
	used                       bool
}

func isFormDigit(c byte) bool {
	return '0' <= c && c <= '9'
}

func isFormWordByte(c byte) bool {
	return 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || isFormDigit(c) || '_' == c
}

// scanForms reads one text: a name before `(` is a call, and a name that
// is no key, no alias and no path segment is a word. A number is skipped
// whole, so the `e` of `1e5` and the `d` of `0d5` are no words.
func scanForms(text, site string, uses *formUses) {
	bare := formsQuoted.ReplaceAllString(text, `" "`)
	for i := 0; i < len(bare); {
		c := bare[i]
		switch {
		case isFormWordByte(c) && !isFormDigit(c):
			j := i
			for j < len(bare) && isFormWordByte(bare[j]) {
				j++
			}
			k := j
			for k < len(bare) && strings.ContainsRune(" \t\r\n", rune(bare[k])) {
				k++
			}
			prev, next := byte(' '), byte(0)
			if 0 < i {
				prev = bare[i-1]
			}
			if k < len(bare) {
				next = bare[k]
			}
			if '%' != prev && '$' != prev && '.' != prev {
				name := bare[i:j]
				if '(' == next {
					if _, had := uses.calls[name]; !had {
						uses.calls[name] = site
					}
				} else if ':' != next && '?' != next {
					if _, had := uses.words[name]; !had {
						uses.words[name] = site
					}
				}
			}
			i = j
		case isFormDigit(c):
			for i < len(bare) && (isFormWordByte(bare[i]) || '.' == bare[i]) {
				i++
			}
		default:
			i++
		}
	}
}

func readOutsideForms(t *testing.T, forms map[string]bool) []*outsideForm {
	outside := []*outsideForm{}
	for _, cols := range tsvRows(t, filepath.Join(formsSpecDir, "forms-outside.tsv")) {
		if 4 != len(cols) || ("call" != cols[1] && "word" != cols[1]) || "" == cols[3] {
			t.Fatalf("a row of spec/forms-outside.tsv names a call or word, a decision and a reason: %q", cols)
		}
		if _, err := strconv.Atoi(cols[2]); nil != err {
			t.Fatalf("%s waits on no numbered decision: %q", cols[0], cols[2])
		}
		if forms[cols[1]+" "+cols[0]] {
			t.Fatalf("%s is a form of the definition; delete its row", cols[0])
		}
		outside = append(outside, &outsideForm{text: cols[0], kind: cols[1], decision: cols[2], what: cols[3]})
	}
	if 4 < len(outside) {
		t.Fatalf("spec/forms-outside.tsv holds %d rows, past its bound of 4", len(outside))
	}
	return outside
}

type formsCorpus struct {
	groups    []suiteGroup
	documents map[string]string
}

// formsCorpora is the suite in every dialect and Ajv's extras under the
// suite's remotes, and the SchemaStore subset under its own documents.
func formsCorpora(t *testing.T) []formsCorpus {
	suite := []suiteGroup{}
	for _, d := range []struct{ dir, dialect string }{{"draft2020-12", ""}, {"draft2019-09", "2019-09"},
		{"draft7", "draft-07"}, {"draft6", "draft-06"}, {"draft4", "draft-04"}} {
		suite = append(suite,
			suiteGroups(t, filepath.Join(vectorsDir, "jsonschema", "tests", d.dir), d.dialect)...)
	}
	suite = append(suite, suiteGroups(t, filepath.Join(vectorsDir, "ajv-extras", "tests"), "")...)
	entries, err := os.ReadDir(filepath.Join(storeDir, "schemas"))
	if nil != err {
		t.Fatal(err)
	}
	names := []string{}
	store := []suiteGroup{}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			raw, err := os.ReadFile(filepath.Join(storeDir, "schemas", e.Name()))
			if nil != err {
				t.Fatal(err)
			}
			names = append(names, e.Name())
			store = append(store, suiteGroup{file: "schemastore/" + e.Name(), schema: string(raw)})
		}
	}
	return []formsCorpus{{suite, suiteRemotes(t)}, {store, storeDocuments(t, names)}}
}

func TestEveryFormTheImporterWritesIsAFormOfTheDefinition(t *testing.T) {
	forms := map[string]bool{}
	for _, cols := range tsvRows(t, filepath.Join(formsSpecDir, "forms.tsv")) {
		if 3 <= len(cols) && ("call" == cols[1] || "word" == cols[1]) {
			forms[cols[1]+" "+cols[2]] = true
		}
	}
	if len(forms) <= 20 {
		t.Fatal("spec/forms.tsv holds the definition's forms")
	}
	outside := readOutsideForms(t, forms)

	uses := &formUses{calls: map[string]string{}, words: map[string]string{}}
	imported := 0
	for _, corpus := range formsCorpora(t) {
		for _, g := range corpus.groups {
			for _, defaults := range []bool{false, true} {
				// ADR-065: the meta-schema check refuses no schema the import
				// would otherwise take here, and costs most of the run.
				report := ImportJSONSchema(g.schema, &ImportOptions{Path: g.file, Documents: corpus.documents,
					Dialect: g.dialect, Defaults: defaults, NoMetaCheck: true,
					FormatAssertion: strings.HasPrefix(g.file, "optional/format/")})
				if "error" != report.Verdict {
					imported++
					scanForms(report.Aontu, g.file+" | "+g.group, uses)
				}
			}
		}
	}

	problems := []string{}
	for _, kind := range []string{"call", "word"} {
		used := uses.calls
		if "word" == kind {
			used = uses.words
		}
		names := make([]string, 0, len(used))
		for name := range used {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			var row *outsideForm
			for _, o := range outside {
				if o.kind == kind && o.text == name {
					row = o
				}
			}
			if nil != row {
				row.used = true
			} else if !forms[kind+" "+name] {
				problems = append(problems, fmt.Sprintf(
					"the %s %s at %s: no form of the definition and no decision", kind, name, used[name]))
			}
		}
	}
	for _, o := range outside {
		if !o.used {
			problems = append(problems, fmt.Sprintf(
				"%s: listed outside the definition and never written; delete its row", o.text))
		}
	}
	t.Logf("forms: %d imports, %d calls, %d words, %d outside the definition",
		imported, len(uses.calls), len(uses.words), len(outside))
	if 0 < len(problems) {
		t.Fatal(strings.Join(problems, "\n"))
	}
}
