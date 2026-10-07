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
		// The suite's optional/format/ asks for format as an assertion.
		asserts := strings.Contains(file, "optional/format/")
		for _, g := range groups {
			report := New().ImportJSONSchemaWith(string(g.Schema),
				JSONSchemaImportOptions{Documents: documents, FormatAssertion: asserts})
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

type vectorAnswer struct{ key, own, answer string }

// vectorAnswerProblems: each case's answer against a ledger of the
// answers that are not the corpus's own.
func vectorAnswerProblems(t *testing.T, ledger vectorLedger, cases []vectorAnswer) []string {
	t.Helper()
	problems := []string{}
	seen := map[string]bool{}
	for _, c := range cases {
		if seen[c.key] {
			t.Fatalf("a case named twice: %s", c.key)
		}
		seen[c.key] = true
		listed, has := ledger.lines[c.key]
		switch {
		case !has && c.answer != c.own:
			problems = append(problems, "answers "+c.answer+" and is not listed: "+c.key)
		case has && listed[0] != c.answer:
			problems = append(problems, "listed as "+listed[0]+", but answers "+c.answer+": "+c.key)
		case has && c.answer == c.own:
			problems = append(problems, "listed, but answers as the corpus says: "+c.key)
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
	sort.Strings(problems)
	return problems
}

type vectorUCDRow struct {
	lo, hi rune
	cells  []string
}

// vectorUCDRows: the ranges of a Unicode data file, each with its fields.
func vectorUCDRows(t *testing.T, file string) []vectorUCDRow {
	t.Helper()
	raw, err := os.ReadFile(file)
	if nil != err {
		t.Fatalf("cannot read %s: %v", file, err)
	}
	out := []vectorUCDRow{}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
		if "" == line {
			continue
		}
		cells := strings.Split(line, ";")
		for i := range cells {
			cells[i] = strings.TrimSpace(cells[i])
		}
		lo, hi, isRange := strings.Cut(cells[0], "..")
		if !isRange {
			hi = lo
		}
		out = append(out, vectorUCDRow{idnaHex(lo), idnaHex(hi), cells})
	}
	return out
}

func vectorValid(ok bool) string {
	if ok {
		return "valid"
	}
	return "invalid"
}

var vectorIdnaEscape = regexp.MustCompile(`\\u([0-9A-Fa-f]{4})`)

// vectorIdnaCell: a cell of IdnaTestV2.txt as text, false where it
// escapes a lone surrogate, which no Go string can hold.
func vectorIdnaCell(cell, blank string) (string, bool) {
	if "" == cell {
		return blank, true
	}
	if `""` == cell {
		return "", true
	}
	lone := false
	text := vectorIdnaEscape.ReplaceAllStringFunc(cell, func(m string) string {
		c := idnaHex(m[2:])
		lone = lone || (0xd800 <= c && c <= 0xdfff)
		return string(c)
	})
	return text, !lone
}

func TestVectorsIdnaTestV2(t *testing.T) {
	dir := filepath.Join(vectorsDir, "idna")
	strict := map[rune]bool{}
	for _, r := range vectorUCDRows(t, filepath.Join(dir, "IdnaMappingTable.txt")) {
		if 3 < len(r.cells) && ("NV8" == r.cells[3] || "XV8" == r.cells[3]) {
			for c := r.lo; c <= r.hi; c++ {
				strict[c] = true
			}
		}
	}
	check := formatCheck("idn-hostname")
	raw, _ := os.ReadFile(filepath.Join(dir, "IdnaTestV2.txt"))
	cases := []vectorAnswer{}
	for _, line := range strings.Split(string(raw), "\n") {
		cell := strings.Split(strings.SplitN(line, "#", 2)[0], ";")
		for i := range cell {
			cell[i] = strings.TrimSpace(cell[i])
		}
		src, ok := vectorIdnaCell(cell[0], "")
		if len(cell) < 5 || !ok {
			continue
		}
		uni, _ := vectorIdnaCell(cell[1], src)
		status := cell[4]
		if "" == status {
			status = cell[2]
		}
		own := "" == status || "[]" == status
		for _, c := range uni {
			own = own && !strict[c]
		}
		cases = append(cases, vectorAnswer{cell[0], vectorValid(own), vectorValid(check(src))})
	}
	if 6387 != len(cases) {
		t.Fatalf("%d lines read", len(cases))
	}
	if p := vectorAnswerProblems(t, readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 1), cases); 0 < len(p) {
		t.Fatalf("%d problem(s):\n%s", len(p), strings.Join(p, "\n"))
	}
}

func TestVectorsIdnaTable(t *testing.T) {
	dir := filepath.Join(vectorsDir, "idna")
	hexes := func(s string) string {
		out := []string{}
		for _, h := range strings.Fields(s) {
			out = append(out, strconv.Itoa(int(idnaHex(h))))
		}
		return strings.Join(out, " ")
	}
	want := make([]string, 0x110000)
	for _, r := range vectorUCDRows(t, filepath.Join(dir, "IdnaMappingTable.txt")) {
		st := map[string]string{"valid": "V", "deviation": "V", "ignored": "I", "mapped": "M"}[r.cells[1]]
		for c := r.lo; c <= r.hi && "" != st; c++ {
			want[c] = st
			if "M" == st {
				want[c] = "M " + hexes(r.cells[2])
			}
		}
	}
	for _, r := range vectorUCDRows(t, filepath.Join(dir, "Idna2008-16.0.0.txt")) {
		cat := map[string]string{"PVALID": "P", "CONTEXTJ": "J", "CONTEXTO": "O"}[r.cells[1]]
		for c := r.lo; c <= r.hi && "" != cat; c++ {
			want[c] += "|" + cat
		}
	}
	got := make([]string, 0x110000)
	raw, _ := os.ReadFile(filepath.Join(vectorsDir, "..", "spec", "files", "idna.txt"))
	section := ""
	for _, line := range strings.Split(string(raw), "\n") {
		if strings.HasPrefix(line, "@") {
			section = line[1:strings.Index(line, " ")]
			continue
		}
		f := strings.Fields(line)
		if 2 > len(f) || strings.HasPrefix(line, "#") {
			continue
		}
		lo, hi, isRange := strings.Cut(f[0], "-")
		if !isRange {
			hi = lo
		}
		for c := idnaHex(lo); c <= idnaHex(hi); c++ {
			switch section {
			case "status":
				got[c] = f[1]
			case "mapping":
				got[c] = "M " + hexes(strings.Join(f[1:], " "))
			case "category":
				got[c] += "|" + f[1]
			}
		}
	}
	differ := []string{}
	for c := range want {
		if want[c] != got[c] && len(differ) < 5 {
			differ = append(differ, strconv.FormatInt(int64(c), 16))
		}
	}
	if 0 < len(differ) {
		t.Fatalf("the table and the vendored files differ at %v", differ)
	}
}

var (
	vectorIsemailTest   = regexp.MustCompile(`(?s)<test id="(\d+)">(.*?)</test>`)
	vectorIsemailAddr   = regexp.MustCompile(`(?s)<address>(.*?)</address>`)
	vectorIsemailCat    = regexp.MustCompile(`<category>([^<]*)</category>`)
	vectorIsemailEntity = regexp.MustCompile(`&#x([0-9A-Fa-f]+);|&(lt|gt|amp|quot|apos);`)
)

func TestVectorsIsemail(t *testing.T) {
	dir := filepath.Join(vectorsDir, "isemail")
	raw, _ := os.ReadFile(filepath.Join(dir, "tests.xml"))
	email := formatCheck("email")
	cases := []vectorAnswer{}
	for _, m := range vectorIsemailTest.FindAllStringSubmatch(string(raw), -1) {
		address := ""
		if at := vectorIsemailAddr.FindStringSubmatch(m[2]); nil != at {
			address = vectorIsemailEntity.ReplaceAllStringFunc(at[1], func(e string) string {
				if strings.HasPrefix(e, "&#x") {
					return string(idnaHex(e[3 : len(e)-1]))
				}
				return map[string]string{"&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": `"`, "&apos;": "'"}[e]
			})
		}
		var b strings.Builder
		for _, c := range address {
			if 0x2400 <= c && c <= 0x241f {
				c -= 0x2400
			}
			b.WriteRune(c)
		}
		category := vectorIsemailCat.FindStringSubmatch(m[2])[1]
		own := "ISEMAIL_VALID_CATEGORY" == category || "ISEMAIL_DNSWARN" == category ||
			"ISEMAIL_RFC5321" == category
		cases = append(cases, vectorAnswer{m[1], vectorValid(own), vectorValid(email(b.String()))})
	}
	if 164 != len(cases) {
		t.Fatalf("%d tests read", len(cases))
	}
	if p := vectorAnswerProblems(t, readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 1), cases); 0 < len(p) {
		t.Fatalf("%d problem(s):\n%s", len(p), strings.Join(p, "\n"))
	}
}

func TestVectorsURITemplateTest(t *testing.T) {
	dir := filepath.Join(vectorsDir, "uritemplate-test")
	check := formatCheck("uri-template")
	cases := []vectorAnswer{}
	for _, file := range []string{"spec-examples.json", "spec-examples-by-section.json",
		"extended-tests.json", "negative-tests.json"} {
		raw, _ := os.ReadFile(filepath.Join(dir, file))
		var groups map[string]struct {
			Testcases [][]json.RawMessage `json:"testcases"`
		}
		if err := json.Unmarshal(raw, &groups); nil != err {
			t.Fatalf("%s: %v", file, err)
		}
		for group, g := range groups {
			for _, tc := range g.Testcases {
				var template string
				_ = json.Unmarshal(tc[0], &template)
				cases = append(cases, vectorAnswer{file + "\t" + group + "\t" + template,
					vectorValid("false" != string(tc[1])), vectorValid(check(template))})
			}
		}
	}
	if 270 != len(cases) {
		t.Fatalf("%d templates read", len(cases))
	}
	if p := vectorAnswerProblems(t, readVectorLedger(t, filepath.Join(dir, "skips.tsv"), 3), cases); 0 < len(p) {
		t.Fatalf("%d problem(s):\n%s", len(p), strings.Join(p, "\n"))
	}
}
