/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// The Go twin of ts/test/vet.test.ts: the same cases, in the same
// order, asserting the same things. Cross-port BEHAVIOUR is pinned by
// the shared rows in test/spec/vet.tsv; these pin the per-port API
// around it (the options struct, the site projection, the walk arms).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const vetSchema = "service: { name: string, port: integer }"

func vetRun(schema, data string, opts *VetOptions) VetReport {
	return Vet(schema, data, opts)
}

// THE REPAIR THE REPORT SAYS IS UNSAFE, made safe. A finding's site
// used to carry a point and no extent, so the only length available to
// a consumer was the CANON -- and canon is not source text. Both halves
// are asserted here: the span-driven edit is exact, and the
// canon-driven one corrupts, so the test states what it prevents rather
// than only that it passes.
//
// Status report 2026-08-21 §5, "the manual fallback corrupts files".
// Twin: describe('vet-site-span') in ts/test/vet.test.ts.
func TestVetSiteSpanIsSafeToReplace(t *testing.T) {
	const data = "port: 0x1F\n"

	report := Vet("port: integer & min(9000)", data, nil)
	if VetInvalid != report.Verdict {
		t.Fatalf("verdict: %s", report.Verdict)
	}
	var site *VetSite
	for i := range report.Findings[0].Sites {
		if VetRoleData == report.Findings[0].Sites[i].Role {
			site = &report.Findings[0].Sites[i]
		}
	}
	if nil == site {
		t.Fatal("no data site")
	}

	// The canon is `31`; the source is `0x1F`. That gap IS the defect.
	if 1 != site.Row || 7 != site.Col || 4 != site.Len ||
		"31" != site.Value || "0x1F" != site.Src {
		t.Fatalf("site: %+v", *site)
	}

	replaceAt := func(col, length int, text string) string {
		return data[:col-1] + text + data[col-1+length:]
	}

	if got := replaceAt(site.Col, site.Len, "9000"); "port: 9000\n" != got {
		t.Errorf("span replacement: %q", got)
	}

	// What a consumer had to do before, and what it produced.
	if got := replaceAt(site.Col, len(site.Value), "9000"); "port: 90001F\n" != got {
		t.Errorf("canon replacement: %q", got)
	}

	// The reason Src is carried and not just Len: a consumer can check
	// that the span still describes what it is about to replace.
	line := strings.Split(data, "\n")[site.Row-1]
	if got := line[site.Col-1 : site.Col-1+site.Len]; site.Src != got {
		t.Errorf("span text %q != site.Src %q", got, site.Src)
	}
}

func TestVetValidDataIsValid(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: "auth", port: 8080 }`, nil)
	if VetValid != r.Verdict || r.Truncated || 0 != len(r.Findings) {
		t.Fatalf("want a clean valid report, got %+v", r)
	}
}

func TestVetContradictionIsInvalid(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: "auth", port: "8080" }`, nil)
	if VetInvalid != r.Verdict || 1 != len(r.Findings) {
		t.Fatalf("want one invalid finding, got %+v", r)
	}
	f := r.Findings[0]
	if "no_scalar_unify" != f.Code || "conflict" != f.Class ||
		"$.service.port" != f.Path {
		t.Fatalf("finding: %+v", f)
	}
}

// The two negative verdicts are the mechanical answer to error.tsv's
// conflation: a contradiction can never be satisfied, incompleteness
// merely is not satisfied YET.
func TestVetResidueIsIncompleteNotInvalid(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: "auth" }`, nil)
	if VetIncomplete != r.Verdict || 1 != len(r.Findings) {
		t.Fatalf("want one incomplete finding, got %+v", r)
	}
	if "incomplete" != r.Findings[0].Class || "$.service.port" != r.Findings[0].Path {
		t.Fatalf("finding: %+v", r.Findings[0])
	}
}

func TestVetPartialOptsOutOfStrict(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: "auth" }`, &VetOptions{Partial: true})
	if VetValid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
	// The finding is still REPORTED — partial changes the verdict, not
	// what the caller is told.
	if 1 != len(r.Findings) {
		t.Fatalf("findings: %+v", r.Findings)
	}
}

func TestVetContradictionOutranksResidue(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: 1 }`, nil)
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
}

// A broken schema is never blamed on the data -- verdict `error`, not
// `invalid` -- and it is not a bare verdict either: the finding says
// what did not stand up and where, and BOTH sites name the schema.
// The sites are the failure's operands, which the provenance walk
// reaches only because it descends into a nil (walk.go); without that
// the report named no file at all.
func TestVetBrokenSchemaIsNeverBlamedOnData(t *testing.T) {
	r := vetRun("a: 1\na: 2", "a: 1", nil)
	if VetError != r.Verdict || 1 != len(r.Findings) {
		t.Fatalf("want an error verdict with one finding, got %+v", r)
	}
	f := r.Findings[0]
	if "scalar_value" != f.Code || "conflict" != f.Class || "$.a" != f.Path {
		t.Fatalf("finding: %+v", f)
	}
	if 2 != len(f.Sites) {
		t.Fatalf("sites: %+v", f.Sites)
	}
	for _, s := range f.Sites {
		if VetRoleSchema != s.Role || vetSchemaURL != s.File {
			t.Fatalf("site: %+v", s)
		}
	}
	// Source order, and the columns are the SCALARS' -- an operand that
	// went unstamped fell back to the entry's own position.
	if 2 != f.Sites[0].Row || 4 != f.Sites[0].Col ||
		1 != f.Sites[1].Row || 4 != f.Sites[1].Col {
		t.Fatalf("positions: %+v", f.Sites)
	}
}

// A SCHEMA that will not parse is the schema's fault -- verdict
// `error` -- and reports through the same projection unparseable data
// does, with the role and the verdict as the only difference.
func TestVetUnparseableSchemaReports(t *testing.T) {
	r := vetRun("a: ]", "a: 1", nil)
	if VetError != r.Verdict || 1 != len(r.Findings) {
		t.Fatalf("report: %+v", r)
	}
	f := r.Findings[0]
	if "syntax" != f.Code || "parse" != f.Class || "$" != f.Path {
		t.Fatalf("finding: %+v", f)
	}
	if 1 != len(f.Sites) || VetRoleSchema != f.Sites[0].Role ||
		vetSchemaURL != f.Sites[0].File {
		t.Fatalf("site: %+v", f.Sites)
	}
}

// And a merge marker in the schema knows where it is, exactly as one
// in the data does.
func TestVetConflictMarkerInSchemaIsLocated(t *testing.T) {
	r := vetRun("a: 1\n<<<<<<< HEAD\nb: 2", "a: 1", nil)
	if VetError != r.Verdict || "merge_conflict" != r.Findings[0].Code {
		t.Fatalf("report: %+v", r)
	}
	if 2 != r.Findings[0].Sites[0].Row || 1 != r.Findings[0].Sites[0].Col {
		t.Fatalf("site: %+v", r.Findings[0].Sites[0])
	}
}

// A data document that will not parse is the DATA's fault: invalid
// with a finding carrying the parser's own code, not error, which is
// the schema's verdict.
func TestVetUnparseableDataIsInvalid(t *testing.T) {
	r := vetRun(vetSchema, "a: ]", nil)
	if VetInvalid != r.Verdict || 1 != len(r.Findings) {
		t.Fatalf("report: %+v", r)
	}
	f := r.Findings[0]
	if "syntax" != f.Code || "parse" != f.Class || "$" != f.Path {
		t.Fatalf("finding: %+v", f)
	}
	// LOCATED. The parser knows where it stopped and the site says so;
	// it used to read -1:-1 while the human renderer drew a caret under
	// the exact character.
	if 1 != len(f.Sites) || VetRoleData != f.Sites[0].Role ||
		"nil" != f.Sites[0].Value ||
		1 != f.Sites[0].Row || 4 != f.Sites[0].Col {
		t.Fatalf("site: %+v", f.Sites)
	}
	// No terminal escapes in a machine-readable report: the parser
	// colours its own marker, and this is the one finding family whose
	// text comes from there.
	if strings.ContainsRune(f.Message, 0x1b) || !strings.HasPrefix(f.Message, "[aontu/") {
		t.Fatalf("message: %q", f.Message)
	}
}

// A merge marker is refused before the parse, and it knows WHERE.
func TestVetConflictMarkerInDataIsLocated(t *testing.T) {
	r := vetRun(vetSchema, "a: 1\n<<<<<<< HEAD\nb: 2", nil)
	if VetInvalid != r.Verdict || "merge_conflict" != r.Findings[0].Code {
		t.Fatalf("report: %+v", r)
	}
	if 2 != r.Findings[0].Sites[0].Row || 1 != r.Findings[0].Sites[0].Col {
		t.Fatalf("site: %+v", r.Findings[0].Sites[0])
	}
}

func TestVetUnparseableSchemaIsAnErrorVerdict(t *testing.T) {
	if r := vetRun("a: ]", "a: 1", nil); VetError != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
}

func TestVetSitesAreRoleTaggedDataFirst(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: "auth", port: "8080" }`,
		&VetOptions{SchemaURL: "service.aon", DataURL: "deploy.json"})
	sites := r.Findings[0].Sites
	if 2 != len(sites) {
		t.Fatalf("sites: %+v", sites)
	}
	if VetRoleData != sites[0].Role || "deploy.json" != sites[0].File ||
		`"8080"` != sites[0].Value {
		t.Fatalf("data site: %+v", sites[0])
	}
	if VetRoleSchema != sites[1].Role || "service.aon" != sites[1].File ||
		"integer" != sites[1].Value {
		t.Fatalf("schema site: %+v", sites[1])
	}
	if sites[0].Row <= 0 || sites[0].Col <= 0 {
		t.Fatalf("data site is unlocated: %+v", sites[0])
	}
}

func TestVetClosedKeyFindingCarriesOneSite(t *testing.T) {
	r := vetRun("service: close({ name: string })",
		`service: { name: "auth", prot: 8080 }`, nil)
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
	var f *VetFinding
	for i := range r.Findings {
		if "closed" == r.Findings[i].Code {
			f = &r.Findings[i]
		}
	}
	if nil == f {
		t.Fatalf("no closed finding: %+v", r.Findings)
	}
	if "$.service.prot" != f.Path || 1 != len(f.Sites) ||
		VetRoleData != f.Sites[0].Role {
		t.Fatalf("finding: %+v", f)
	}
}

// G1's atoms already attach the normalised residual and the offending
// value; vet reads them where they are rather than re-deriving them.
func TestVetConstraintFindingCarriesExpectedAndActual(t *testing.T) {
	r := vetRun("service: { port: integer & min(1024) }", "service: { port: 80 }", nil)
	f := r.Findings[0]
	if "constraint" != f.Code || nil == f.Expected || nil == f.Actual {
		t.Fatalf("finding: %+v", f)
	}
	if "integer&min(1024)" != *f.Expected || "80" != *f.Actual || nil != f.Note {
		t.Fatalf("expected/actual/note: %+v", f)
	}
}

func TestVetMustFindingCarriesTheAuthorMessageAsNote(t *testing.T) {
	r := vetRun(`service: { tier: must("gold"|"silver","tier must be supported") }`,
		`service: { tier: "lead" }`, nil)
	f := r.Findings[0]
	if "must" != f.Code || nil == f.Note || nil == f.Expected || nil == f.Actual {
		t.Fatalf("finding: %+v", f)
	}
	if "tier must be supported" != *f.Note ||
		`"gold"|"silver"` != *f.Expected || `"lead"` != *f.Actual {
		t.Fatalf("note/expected/actual: %+v", f)
	}
}

// The message is the nil's headline, which the two ports hold to byte
// parity — one line, no frames.
func TestVetMessageIsTheHeadlineOnly(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: "auth", port: "8080" }`, nil)
	msg := r.Findings[0].Message
	want := "[aontu/no_scalar_unify]: Cannot unify values at path $.service.port"
	if want != msg {
		t.Fatalf("message: %q", msg)
	}
}

// A key may contain any character, so no punctuation is safe as a path
// separator; the path is carried whole and never re-parsed.
func TestVetPathsAreNotDelimiterSafe(t *testing.T) {
	r := vetRun(`"a b": integer`, `"a b": "x"`, nil)
	if "$.a b" != r.Findings[0].Path {
		t.Fatalf("path: %q", r.Findings[0].Path)
	}
}

func TestVetRootConflictReportsTheRootPath(t *testing.T) {
	r := vetRun("1", "2", nil)
	if VetInvalid != r.Verdict || "$" != r.Findings[0].Path {
		t.Fatalf("report: %+v", r)
	}
}

// The spread constraint lives off-peg, so this is only reachable by
// following it — and the path is the TEMPLATE's, because the conflict
// nil is created against the template node. The data site still points
// at the offending value, which is what a repair loop needs.
func TestVetConflictInsideASpreadTemplateIsFound(t *testing.T) {
	r := vetRun("services: &: { port: integer }",
		`services: { auth: { port: "80" } }`, nil)
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
	f := r.Findings[0]
	if "$.services.port" != f.Path || VetRoleData != f.Sites[0].Role ||
		`"80"` != f.Sites[0].Value {
		t.Fatalf("finding: %+v", f)
	}
}

func TestVetFindingsAreSortedByDataSite(t *testing.T) {
	r := vetRun("a: integer\nb: integer\nc: integer", "c: \"z\"\na: \"x\"\nb: \"y\"", nil)
	if 3 != len(r.Findings) {
		t.Fatalf("findings: %+v", r.Findings)
	}
	for i := 1; i < len(r.Findings); i++ {
		if r.Findings[i].Sites[0].Row < r.Findings[i-1].Sites[0].Row {
			t.Fatalf("out of order: %+v", r.Findings)
		}
	}
}

func TestVetMaxErrorsCapsAndMarksTruncated(t *testing.T) {
	r := vetRun("a: integer\nb: integer\nc: integer",
		"a: \"x\"\nb: \"y\"\nc: \"z\"", &VetOptions{MaxErrors: 2})
	if 2 != len(r.Findings) || !r.Truncated {
		t.Fatalf("report: %+v", r)
	}
}

func TestVetAnUncappedReportIsNotTruncated(t *testing.T) {
	r := vetRun("a: integer\nb: integer", "a: \"x\"\nb: \"y\"", nil)
	if r.Truncated {
		t.Fatalf("report: %+v", r)
	}
}

func TestVetAtSelectsASubtree(t *testing.T) {
	schema := "services: { auth: { port: integer } }\nother: { junk: string }"
	r := vetRun(schema, "auth: { port: 8080 }", &VetOptions{At: "$.services"})
	if VetValid != r.Verdict {
		t.Fatalf("report: %+v", r)
	}
}

func TestVetAtAcceptsABarePath(t *testing.T) {
	r := vetRun("services: { auth: { port: integer } }",
		`auth: { port: "x" }`, &VetOptions{At: "services"})
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
}

func TestVetAtRootIsTheWholeSchema(t *testing.T) {
	r := vetRun(vetSchema, `service: { name: "auth", port: 8080 }`,
		&VetOptions{At: "$"})
	if VetValid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
}

// ...AND IT SAYS WHICH SEGMENT. The verdict alone left a caller holding
// exit 4 and an empty finding list, which is nothing to act on; the
// refusal is the one Get and Why already give for a path that names
// nothing, "did you mean" included.
func TestVetAnAnchorThatDoesNotExistIsAnErrorVerdict(t *testing.T) {
	r := vetRun(vetSchema, "a: 1", &VetOptions{At: "$.nope"})
	if VetError != r.Verdict || 1 != len(r.Findings) {
		t.Fatalf("report: %+v", r)
	}
	f := r.Findings[0]
	if "no_path" != f.Code || "reference" != f.Class || "$.nope" != f.Path ||
		0 != len(f.Sites) {
		t.Fatalf("finding: %+v", f)
	}
}

func TestVetAnAnchorRefusalSuggestsTheNearestKey(t *testing.T) {
	r := vetRun(vetSchema, "a: 1", &VetOptions{At: "$.servce"})
	if nil == r.Findings[0].Note || "did you mean service?" != *r.Findings[0].Note {
		t.Fatalf("note: %+v", r.Findings[0])
	}
}

func TestVetAnAnchorThroughAScalarIsAnErrorVerdict(t *testing.T) {
	if r := vetRun("a: 1", "x: 1", &VetOptions{At: "$.a.b"}); VetError != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
}

// A list anchor indexes by position, and an index off the end is an
// error verdict like any other anchor that is not there.
func TestVetAtIndexesAList(t *testing.T) {
	if r := vetRun("a: [{ p: integer }]", `p: "x"`,
		&VetOptions{At: "$.a.0"}); VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
	// `length` is the sharp one: a generic peg lookup answered it with a
	// JavaScript number, and every document then validated.
	for _, at := range []string{"$.a.1", "$.a.-1", "$.a.x", "$.a.length"} {
		if r := vetRun("a: [{ p: integer }]", "p: 1",
			&VetOptions{At: at}); VetError != r.Verdict {
			t.Fatalf("%s: verdict %s", at, r.Verdict)
		}
	}
}

// `--closed` closes the ANCHOR, so a surplus key is only refused at the
// level the run is anchored on: an unanchored run closes the root,
// which says nothing about keys nested below it.
func TestVetClosedClosesTheAnchorForThisRun(t *testing.T) {
	schema := "service: { name: string }"
	data := "service: { name: \"auth\" }\nextra: 1"
	if r := vetRun(schema, data, nil); VetValid != r.Verdict {
		t.Fatalf("open: %s", r.Verdict)
	}
	if r := vetRun(schema, data, &VetOptions{Closed: true}); VetInvalid != r.Verdict {
		t.Fatalf("closed: %s", r.Verdict)
	}
}

func TestVetClosedAppliesToTheSelectedAnchor(t *testing.T) {
	schema := "service: { name: string }"
	data := "name: \"auth\"\nextra: 1"
	if r := vetRun(schema, data, &VetOptions{At: "$.service"}); VetValid != r.Verdict {
		t.Fatalf("open: %s", r.Verdict)
	}
	if r := vetRun(schema, data,
		&VetOptions{At: "$.service", Closed: true}); VetInvalid != r.Verdict {
		t.Fatalf("closed: %s", r.Verdict)
	}
}

// A scalar anchor has no keys to close, so the flag is inert rather
// than an error.
func TestVetClosedOnAScalarAnchorIsInert(t *testing.T) {
	r := vetRun("a: integer", "1", &VetOptions{At: "$.a", Closed: true})
	if VetValid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
}

// A list anchor closes too: the flag is about bags, not about maps.
func TestVetClosedOnAListAnchor(t *testing.T) {
	r := vetRun("a: [integer]", "[1, 2]", &VetOptions{At: "$.a", Closed: true})
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s (%+v)", r.Verdict, r.Findings)
	}
}

// A list peg is a slice, a map peg a map: the walk has to follow both,
// and only a list conflict exercises the slice arm.
func TestVetConflictInsideAListIsFound(t *testing.T) {
	r := vetRun("a: [integer]", `a: ["x"]`, nil)
	if VetInvalid != r.Verdict || "$.a.0" != r.Findings[0].Path {
		t.Fatalf("report: %+v", r)
	}
}

func TestVetNestedListConflictsAreAllReported(t *testing.T) {
	r := vetRun("a: [integer, integer]", `a: ["x", "y"]`, nil)
	if 2 != len(r.Findings) {
		t.Fatalf("findings: %+v", r.Findings)
	}
}

// A JUNCTION REPORTS ITS OWN POSITION. The meet mints a fresh
// disjunction, which used to arrive unsited -- so a finding naming a
// disjunction that had met anything pointed at -1:-1 with no file, and
// an agent reading the report had nowhere to go (the review's finding
// F). The narrowed disjunction now carries the site of the one it came
// from, which the parser puts at the start of the first alternative.
// Twin: vet.tsv:vet-junction-site, and the hover-kind-labels case in
// ts/test/coverage3.test.ts.
func TestVetJunctionReportsItsOwnSite(t *testing.T) {
	r := vetRun("a: 1|2", "a: 3", nil)
	sites := r.Findings[0].Sites
	if 2 != len(sites) {
		t.Fatalf("sites: %+v", sites)
	}
	// `a: 1|2` -- the first alternative starts at column 4.
	if 1 != sites[1].Row || 4 != sites[1].Col || "1|2" != sites[1].Value {
		t.Fatalf("schema site: %+v", sites[1])
	}
}

// Columns count UTF-16 code units, as the canonical port's sites do.
func TestVetColumnsCountUTF16Units(t *testing.T) {
	r := vetRun(`k: { "é": integer }`, `k: { "é": "x" }`, nil)
	if 1 != len(r.Findings) {
		t.Fatalf("findings: %+v", r.Findings)
	}
	if 11 != r.Findings[0].Sites[0].Col {
		t.Fatalf("col: %d", r.Findings[0].Sites[0].Col)
	}
}

// `SchemaPath` and `DataPath` are the two documents' OWN bases: a
// relative `@"file"` load inside either resolves from the directory
// holding it, not from the process working directory -- which is
// neither document's home, and may hold a same-named decoy. The two
// paths are separate because the documents need not live together.
func TestVetEachDocumentResolvesItsOwnIncludes(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "part.aon"),
		[]byte("port: integer"), 0o600); err != nil {
		t.Fatal(err)
	}

	// The document is passed as TEXT and its path only says where it
	// came from -- but the loader resolves the base against a real
	// directory, so the file has to be there, which for every caller
	// that read the text out of it already is.
	src := "@\"part.aon\"\nname: string"
	data := "name: \"auth\"\nport: 8080"
	schemaPath := filepath.Join(dir, "schema.aon")
	if err := os.WriteFile(schemaPath, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}

	r := vetRun(src, data, &VetOptions{SchemaPath: schemaPath})
	if VetValid != r.Verdict {
		t.Fatalf("based: %s", r.Verdict)
	}

	// Without the base the include is looked for beside the test
	// process instead, where there is no part.aon: a schema that will
	// not stand up is an `error` verdict, never the data's fault.
	if r := vetRun(src, data, nil); VetError != r.Verdict {
		t.Fatalf("unbased: %s", r.Verdict)
	}
}

// EVERY SITE NAMES THE FILE WHOSE TEXT IT EXCERPTS (the review's
// finding F, use-cases/BUGS.md §25). Vet stamped the ENTRY document's
// name over every value of both trees, so a constraint written in an
// included library was reported at the entry file, with the LIBRARY's
// row and column -- a line the entry may not even have. A repair agent
// that follows the site edits the wrong file. Twin:
// a-site-names-the-file-its-text-lives-in in ts/test/vet.test.ts.
func TestVetSiteNamesTheIncludedFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "lib"), 0o755); err != nil {
		t.Fatal(err)
	}
	lib := filepath.Join(dir, "lib", "types.aon")
	if err := os.WriteFile(lib,
		[]byte("Port: integer & min(1024)\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	schemaPath := filepath.Join(dir, "schema.aon")
	src := "@\"lib/types.aon\"\nsvc: { port: $.Port }\n"
	if err := os.WriteFile(schemaPath, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	dataPath := filepath.Join(dir, "data.json")
	data := "{\"svc\":{\"port\":80}}\n"
	if err := os.WriteFile(dataPath, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}

	r := vetRun(src, data, &VetOptions{
		SchemaPath: schemaPath, DataPath: dataPath,
		SchemaURL: schemaPath, DataURL: dataPath,
	})
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
	var schemaSite, dataSite *VetSite
	for i := range r.Findings[0].Sites {
		s := &r.Findings[0].Sites[i]
		if VetRoleSchema == s.Role {
			schemaSite = s
		} else {
			dataSite = s
		}
	}
	if nil == schemaSite || lib != schemaSite.File {
		t.Fatalf("schema site: %+v", schemaSite)
	}
	// A row THAT FILE has, not one the entry happens to share.
	if 1 != schemaSite.Row {
		t.Fatalf("schema row: %+v", schemaSite)
	}
	// The role is decided by which document a url belongs to, not by a
	// name comparison against one entry.
	if nil == dataSite || dataPath != dataSite.File {
		t.Fatalf("data site: %+v", dataSite)
	}
}

// An INCLUDED DATA file is still data. The role used to be a string
// comparison against the data entry's name, so a value read through an
// include of the DATA document would have read `schema` the moment its
// site named the file it really came from.
func TestVetIncludedDataIsStillData(t *testing.T) {
	dir := t.TempDir()
	part := filepath.Join(dir, "part.aon")
	if err := os.WriteFile(part, []byte("port: \"80\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	dataPath := filepath.Join(dir, "data.aon")
	data := "@\"part.aon\"\n"
	if err := os.WriteFile(dataPath, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}

	r := vetRun("port: integer", data, &VetOptions{
		DataPath: dataPath, DataURL: dataPath, SchemaURL: "schema",
	})
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
	found := false
	for _, s := range r.Findings[0].Sites {
		if part == s.File {
			found = true
			if VetRoleData != s.Role {
				t.Fatalf("included data site reads %q: %+v", s.Role, s)
			}
		}
	}
	if !found {
		t.Fatalf("no site names %s: %+v", part, r.Findings[0].Sites)
	}
}

// THE REPAIR, NOT JUST THE DIAGNOSIS (the review's finding F). The
// message is the headline and nothing else -- that is what makes it one
// line and comparable -- so everything the engine knows about how to FIX
// the failure reached a terminal reader in the frames and a machine
// reader not at all. The TypeScript twin is
// `a-finding-carries-the-repair-hint` in ts/test/vet.test.ts.
func TestVetFindingCarriesTheHint(t *testing.T) {
	// The clearest case in the language: the literal is refused BECAUSE
	// binary64 would round it, and the fix is a one-character prefix the
	// reader has no way to guess from the headline.
	r := vetRun("port: integer", "port: 9007199254740993", nil)
	if VetInvalid != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}

	f := r.Findings[0]
	if "lossy_integer_literal" != f.Code {
		t.Fatalf("code: %s", f.Code)
	}
	if strings.Contains(f.Message, "\n") {
		t.Fatalf("headline is not one line: %q", f.Message)
	}
	if nil == f.Hint {
		t.Fatalf("no hint on %+v", f)
	}

	hint := *f.Hint
	if !strings.Contains(hint, "0d") {
		t.Fatalf("hint does not name the escape:\n%s", hint)
	}
	if !strings.Contains(hint, "\n") {
		t.Fatalf("hint was truncated to one line:\n%s", hint)
	}
	// Trailing whitespace was spacing for the frame that used to follow
	// the hint; the deliberate blank lines inside it are "\n \n" and
	// must survive.
	if hint != strings.TrimRight(hint, " \t\r\n") {
		t.Fatalf("hint keeps trailing whitespace: %q", hint)
	}
	if !strings.Contains(hint, "\n \n") {
		t.Fatal("hint lost its internal spacing")
	}
}

// Not every code has one, and an absent hint is ABSENT rather than
// empty: a consumer testing for a hint must not have to also test for
// the empty string. The TypeScript twin is
// `a-code-with-no-hint-text-carries-no-hint`.
func TestVetFindingWithoutHintText(t *testing.T) {
	r := vetRun("a: *5 | string\nb: string", "b: \"x\"", nil)
	for _, f := range r.Findings {
		if "pref_not_instance" == f.Code {
			if nil != f.Hint {
				t.Fatalf("unexpected hint: %+v", f)
			}
			return
		}
	}
	t.Fatalf("no pref_not_instance finding: %+v", r.Findings)
}

// A FILE THE READER CAN OPEN (the review's finding F). The parser
// resolves an include to an absolute path -- the right identity, the
// wrong name -- so a site prints it as the entry's own spelling reaches
// it. The TypeScript twin is `an-included-file-is-named-as-the-entry-
// reaches-it` in ts/test/vet.test.ts.
func TestDisplayFileNamesTheIncludeAsTheEntryReachesIt(t *testing.T) {
	// A REAL absolute path, from the OS rather than assembled: on
	// Windows a rooted path is not an absolute one without its drive
	// letter, so `\w\proj\lib.aon` is relative there and the rule
	// under test would decline to rewrite it -- passing for the wrong
	// reason on Linux and failing outright on Windows.
	dir := t.TempDir()
	abs := filepath.Join(dir, "lib.aon")
	absEntry := filepath.Join(dir, "entry.aon")

	// A BARE entry name: the include is named beside it, with no
	// directory the caller never typed.
	if got := displayFile(abs, "entry.aon", absEntry); "lib.aon" != got {
		t.Fatalf("bare entry: %q", got)
	}

	// An entry reached through a directory: the include is named through
	// the same one, so both are openable from the caller's cwd.
	deep := filepath.Join("a", "b", "entry.aon")
	want := filepath.Join("a", "b", "lib.aon")
	if got := displayFile(abs, deep, absEntry); want != got {
		t.Fatalf("nested entry: %q, want %q", got, want)
	}

	// An ABSOLUTE entry keeps absolute includes: the caller asked for
	// absolute names by giving one.
	if got := displayFile(abs, absEntry, absEntry); abs != got {
		t.Fatalf("absolute entry: %q", got)
	}

	// The document's OWN url is never rewritten -- it is already the
	// name the caller used.
	if got := displayFile("entry.aon", "entry.aon", "x/entry.aon"); "entry.aon" != got {
		t.Fatalf("self: %q", got)
	}
	// Neither is a url that is not a path, or one with no base to
	// relativise against: the default labels `schema` and `data`, and a
	// caller who passed no path at all.
	if got := displayFile("data", "data", ""); "data" != got {
		t.Fatalf("label: %q", got)
	}
	if got := displayFile(abs, "entry.aon", ""); abs != got {
		t.Fatalf("no base: %q", got)
	}
	if got := displayFile("", "entry.aon", "x/entry.aon"); "" != got {
		t.Fatalf("empty url: %q", got)
	}
	if got := displayFile("rel.aon", "entry.aon", "x/entry.aon"); "rel.aon" != got {
		t.Fatalf("relative url: %q", got)
	}
}
