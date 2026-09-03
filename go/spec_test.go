/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"bytes"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// semverRe matches the since-version column of test/spec/errcodes.tsv.
var semverRe = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// TestSpec runs the shared, data-driven conformance suite. The test
// cases live in the top-level test/spec/*.tsv files and are the single
// source of truth shared with the TypeScript implementation (see
// ts/test/spec.test.ts). Both implementations must produce identical
// results.
//
// TSV columns (tab-separated): name <TAB> mode <TAB> src <TAB> expect
//
//	mode=canon : Unify(src).Canon() must equal expect
//	mode=gen   : Generate(src) must deep-equal JSON(expect)
//	mode=gens  : Generate(src) serialised as compact JSON must equal
//	             expect BYTE FOR BYTE
//	mode=err   : Generate(src) must error, message must contain expect
//	mode=errc  : Generate(src) must error, and the FIRST failure's
//	             why-code (AontuError.Code) must EQUAL expect (message
//	             text is not in parity; codes are -- see
//	             test/spec/errcodes.tsv)
//	mode=errcode : registry row -- name is a code, src its class,
//	             expect its since-version; asserted against the engine's
//	             codeClasses table (go/hints.go)
//	mode=vet   : FIVE columns -- name, vet, schema, data, expect. The
//	             report of Vet(schema, data) must equal the expect
//	             object, MINUS each finding's message and hint (prose
//	             is not in parity; see test/spec/vet.tsv for the whole encoding,
//	             including the `opts` key)
//	mode=subsume : FIVE columns -- name, subsume, general, specific,
//	             expect. The report of Subsume(general, specific) must
//	             equal the expect object (verdict + findings), MINUS
//	             each finding's message; see test/spec/subsume.tsv
//	mode=trim  : TrimCheck(src) must equal the expect object
//	             ({redundant, verdict}); see test/spec/trim.tsv
//	mode=jsonschema : JSONSchema(src, "") must equal the expect object
//	             ({lossy, schema, verdict}) -- the schema AND the loss
//	             report, because a schema that silently dropped a
//	             construct would look identical to one that carried it;
//	             see test/spec/jsonschema.tsv
//	mode=hcanon : Hcanon(Unify(src)) -- the HASH FORM, canon plus the
//	             close()/type()/hide() wrappers -- must equal expect,
//	             and the hash form must round-trip (G6, hcanon.tsv)
//	mode=hash  : CanonHash(Unify(src)) must equal expect, the full
//	             `aon1-...` pin, byte-identical across the ports
//	mode=agentsmd : FIVE columns -- name, agentsmd, src,
//	             document-name, expect. The stanza of AgentsMd(src,
//	             {Name}) must match BYTE FOR BYTE; see
//	             test/spec/agentsmd.tsv
//	mode=diff  : FIVE columns -- name, diff, left, input, expect. The
//	             report of Diff(left, right) must match the expect
//	             object ({changes, same} plus `codes`); the input is
//	             {right, at?}. See test/spec/diff.tsv
//	mode=patch : FIVE columns -- name, patch, entry, input, expect.
//	             The report of Patch(entry, overlay, set) must match
//	             the expect object ({appended, overlay, verdict} plus
//	             `codes`); see test/spec/patch.tsv
//	mode=why   : FIVE columns -- name, why, src, path, expect. The
//	             record of Why(src, path) must match the expect object
//	             ({value, conjuncts} or {code, note}); see
//	             test/spec/why.tsv
//	mode=query : FIVE columns -- name, query, src, path, expect. The
//	             report of Get(src, path) must match the expect object
//	             ({out?, code?, note?}, options riding `opts`), and a
//	             canon-shaped VIEW must additionally SUBSUME the truth
//	             it summarises; see test/spec/query.tsv
//
// gen vs gens: gen normalises both sides through a JSON decode, which
// collapses every number to a float64 — so two distinct exact integers
// above 2^53 compare EQUAL and exactness is unassertable. gens compares
// the serialised text instead, and is the mode the number tower's exact
// leaves need (docs/design/number-tower.md, D10). See specGens for the
// serialisation contract the two runners share.
//
// Escapes in src/expect: \n -> newline, \t -> tab, \\ -> backslash.
func TestSpec(t *testing.T) {
	specDir := filepath.Join("..", "test", "spec")
	entries, err := os.ReadDir(specDir)
	if err != nil {
		t.Fatalf("cannot read spec dir %s: %v", specDir, err)
	}

	// Absolute fixtures dir, so file-loading (@"file") rows resolve the
	// same shared fixtures from any cwd.
	fixturesDir, err := filepath.Abs(filepath.Join(specDir, "files"))
	if err != nil {
		t.Fatalf("fixtures dir: %v", err)
	}
	// Use forward slashes even on Windows: this path is spliced into Aontu
	// source as a quoted @"..." load target, where backslashes would be parsed
	// as string escapes (\t -> tab, \a -> a, ...) and corrupt the path.
	// srcPath rather than filepath.ToSlash, so the package has one
	// spelling of the rule and one that is exercised off Windows too
	// (trust_test.go, where the full note lives).
	fixturesDir = srcPath(fixturesDir)

	var files []string
	for _, e := range entries {
		// signature.tsv is the DECLARATION, not rows (its lines are the
		// signature syntax, docs/design/SIGNATURES.0.md); its own gate
		// is the round-trip in sig_test.go, as ts/test/sig.test.ts is
		// for the TS port.
		if strings.HasSuffix(e.Name(), ".tsv") && "signature.tsv" != e.Name() {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	if len(files) == 0 {
		t.Fatalf("no .tsv spec files found in %s", specDir)
	}

	total := 0
	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(specDir, file))
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		for lineno, line := range strings.Split(string(data), "\n") {
			// Tolerate CRLF checkouts (e.g. Windows) by dropping any trailing
			// \r so the last field never carries a stray carriage return.
			line = strings.TrimSuffix(line, "\r")
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.Split(line, "\t")
			// The mode decides how many columns the row needs, so it is
			// read before the count is checked -- defensively, since a
			// row short enough to lack one is exactly what is refused
			// below.
			mode := ""
			if 1 < len(parts) {
				mode = parts[1]
			}
			// A vet or subsume row carries TWO documents, so its expect
			// is the fifth column; every other mode reads four and
			// ignores any extra (see test/spec/vet.tsv and
			// test/spec/subsume.tsv for the encodings).
			vetRow := "vet" == mode || "subsume" == mode || "query" == mode ||
				"why" == mode || "patch" == mode || "diff" == mode ||
				"agentsmd" == mode
			// MALFORMED IS LOUD, not skipped. A row short by a column --
			// a vet row whose expected report was left off, say -- would
			// otherwise be dropped in silence, and a suite that quietly
			// runs one row fewer stays green while the behaviour it
			// claims to pin goes unpinned. The TS runner refuses the
			// same shapes.
			//
			// This, and not a row COUNT, is the guard: a count would
			// have to be edited by every change that adds a row, and a
			// number nobody trusts is a number nobody updates honestly.
			// The only count asserted is that the files were found at
			// all (the total check after the loop).
			want := 4
			if vetRow {
				want = 5
			}
			if len(parts) < want {
				t.Fatalf("malformed spec row: %s line %d: %d columns required for mode %q, found %d",
					file, lineno+1, want, mode, len(parts))
			}
			name := parts[0]
			src := strings.ReplaceAll(unescapeSpec(parts[2]), "__FIXTURES__", fixturesDir)
			data := ""
			expect := unescapeSpec(parts[3])
			if vetRow {
				data = unescapeSpec(parts[3])
				expect = unescapeSpec(parts[4])
			}
			total++

			t.Run(file+":"+name, func(t *testing.T) {
				a := New()
				// Files whose rows evaluate under a fixed trust profile
				// (G5, docs/trust.md): root-confined to the fixtures
				// directory, the var.tsv precedent of runner-side
				// configuration. This is also what makes the shared
				// suite itself HERMETIC: no row may read outside the
				// repository, in either runner (ts/test/spec.test.ts
				// applies the same profile to the same files).
				// Module resolution reads the filesystem (G6 phase 2),
				// so mod.tsv's rows run under the same fixture root for
				// the same reason file.tsv's do, and alias.tsv's two
				// include rows for the same reason again.
				if "include-trust.tsv" == file || "file.tsv" == file ||
					"mod.tsv" == file || "alias.tsv" == file || "fmt.tsv" == file {
					a.Trust = &TrustOptions{IncludeRoot: fixturesDir}
				}
				vars := specVars()
				switch mode {
				case "canon":
					v, err := a.UnifyVars(src, vars)
					if err != nil {
						t.Fatalf("unify error: %v\n src: %q", err, src)
					}
					if got := v.Canon(); got != expect {
						t.Fatalf("canon mismatch\n src:  %q\n want: %s\n got:  %s", src, expect, got)
					}
					assertCanonConverges(t, name, expect, vars)
				case "gen":
					got, err := a.GenerateVars(src, vars)
					if err != nil {
						t.Fatalf("generate error: %v\n src: %q", err, src)
					}
					if !jsonEqual(got, expect) {
						gj, _ := json.Marshal(got)
						t.Fatalf("gen mismatch\n src:  %q\n want: %s\n got:  %s", src, expect, string(gj))
					}
				case "gens":
					got, err := a.GenerateVars(src, vars)
					if err != nil {
						t.Fatalf("generate error: %v\n src: %q", err, src)
					}
					text, merr := specGens(got)
					if merr != nil {
						t.Fatalf("serialise error: %v\n src: %q", merr, src)
					}
					if text != expect {
						t.Fatalf("gens mismatch\n src:  %q\n want: %s\n got:  %s", src, expect, text)
					}
					// REPEATABILITY (G5 determinism clause, docs/trust.md):
					// the same source under the same bindings must
					// serialise to the same bytes on a fresh engine. Run
					// over every gens row rather than a few dedicated ones.
					if again, aerr := New().GenerateVars(src, vars); aerr != nil {
						t.Fatalf("gens not repeatable (second run errored): %v\n src: %q", aerr, src)
					} else if atext, aterr := specGens(again); aterr != nil {
						t.Fatalf("gens not repeatable (second serialise): %v\n src: %q", aterr, src)
					} else if atext != expect {
						t.Fatalf("gens not repeatable\n src:  %q\n want: %s\n got:  %s", src, expect, atext)
					}
				case "err":
					_, err := a.GenerateVars(src, vars)
					if err == nil {
						t.Fatalf("expected error containing %q, got none\n src: %q", expect, src)
					}
					if !strings.Contains(err.Error(), expect) {
						t.Fatalf("error mismatch\n src:  %q\n want contains: %s\n got:          %s", src, expect, err.Error())
					}
				case "errc":
					// Code parity: the FIRST failure's why-code must EQUAL
					// expect. Message text is deliberately not in parity
					// between the ports; the codes in test/spec/errcodes.tsv
					// are.
					_, err := a.GenerateVars(src, vars)
					if err == nil {
						t.Fatalf("expected error with code %q, got none\n src: %q", expect, src)
					}
					ae, ok := err.(*AontuError)
					if !ok {
						t.Fatalf("expected *AontuError, got %T\n src: %q\n err: %v", err, src, err)
					}
					if ae.Code != expect {
						t.Fatalf("error code mismatch\n src:  %q\n want: %s\n got:  %s\n msg:  %s", src, expect, ae.Code, ae.Msg)
					}
				case "errcode":
					// Registry row: name IS the code, src is its class,
					// expect the version line at which the code was first
					// registered. The reverse direction (every engine code
					// registered in the tsv) is TestErrCodesRegistry.
					cls, ok := codeClasses[name]
					if !ok {
						t.Fatalf("code %q is not in the engine codeClasses table", name)
					}
					if cls != src {
						t.Fatalf("code %q: registry class %q, engine class %q", name, src, cls)
					}
					if !semverRe.MatchString(expect) {
						t.Fatalf("code %q: since-version %q is not a semver triple", name, expect)
					}
				case "vet":
					// The golden carries the run's options under `opts`;
					// everything else in it is the report.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					opts := specVetOpts(t, golden["opts"])
					delete(golden, "opts")

					got := specVetGolden(t, Vet(src, data, opts))
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("vet report mismatch\n schema: %q\n data:   %q\n want: %s\n got:  %s",
							src, data, want, got)
					}
				case "hcanon":
					v, err := a.UnifyVars(src, vars)
					if err != nil {
						t.Fatalf("unify error: %v\n src: %q", err, src)
					}
					if got := Hcanon(v); got != expect {
						t.Fatalf("hcanon mismatch\n src:  %q\n want: %s\n got:  %s", src, expect, got)
					}
					assertHcanonRoundTrips(t, name, expect, vars)

				case "hash":
					v, err := a.UnifyVars(src, vars)
					if err != nil {
						t.Fatalf("unify error: %v\n src: %q", err, src)
					}
					if got := CanonHash(v); got != expect {
						t.Fatalf("hash mismatch\n src:  %q\n want: %s\n got:  %s", src, expect, got)
					}

				case "fmt":
					// The formatter (docs/design/FMT.0.md): the text is
					// what fmt writes; the agreed form is a fixed point;
					// and where the source evaluates, its formatted form
					// is the same document, by canon-hash. Mirrors the
					// fmt mode of ts/test/spec.test.ts.
					report := a.Format(src)
					if "formatted" != report.Verdict {
						t.Fatalf("does not format: %v\n src: %q", report.Errors, src)
					}
					if report.Text != expect {
						t.Fatalf("fmt mismatch\n src:  %q\n want: %q\n got:  %q", src, expect, report.Text)
					}
					if again := a.Format(expect); "formatted" != again.Verdict || again.Text != expect {
						t.Fatalf("not a fixed point\n want: %q\n got:  %q", expect, again.Text)
					}
					v1, err := a.UnifyVars(src, vars)
					if err == nil && nil != v1 && !v1.Nil() {
						v2, err2 := a.UnifyVars(expect, vars)
						if err2 != nil || nil == v2 || v2.Nil() {
							t.Fatalf("the formatted form does not evaluate: %v\n text: %q", err2, expect)
						}
						if CanonHash(v1) != CanonHash(v2) {
							t.Fatalf("formatting moved the hash\n src:  %q\n text: %q", src, expect)
						}
					}

				case "fmt-refuse":
					// A SOURCE THE FORMATTER REFUSES, pinned so the
					// refusal is the same one in both ports. The
					// self-check compares the document written against
					// the document read and writes NOTHING when they
					// differ, so a refusal corrupts no file -- but
					// which sources it refuses is behaviour, and
					// behaviour is shared. Mirrors the fmt-refuse mode
					// of ts/test/spec.test.ts.
					report := a.Format(src)
					codes := make([]string, 0, len(report.Errors))
					for _, f := range report.Errors {
						codes = append(codes, f.Code)
					}
					got := report.Verdict + ":" + strings.Join(codes, ",")
					if got != expect {
						t.Fatalf("fmt refusal\n src:  %q\n want: %q\n got:  %q",
							src, expect, got)
					}

				case "agentsmd":
					var agolden struct {
						Codes  []string `json:"codes"`
						OK     bool     `json:"ok"`
						Stanza string   `json:"stanza"`
					}
					if jerr := json.Unmarshal([]byte(expect), &agolden); jerr != nil {
						t.Fatalf("bad agentsmd golden: %v\n %s", jerr, expect)
					}
					ar := a.AgentsMd(src, &AgentsMdOptions{Name: data})
					if ar.OK != agolden.OK || ar.Stanza != agolden.Stanza {
						t.Fatalf("agentsmd mismatch\n src: %q\n want: %q\n got:  %q",
							src, agolden.Stanza, ar.Stanza)
					}
					acodes := []string{}
					for _, f := range ar.Findings {
						acodes = append(acodes, f.Code)
					}
					if 0 == len(acodes) {
						acodes = nil
					}
					if specJSON(t, acodes) != specJSON(t, agolden.Codes) {
						t.Fatalf("agentsmd codes mismatch\n want: %v\n got:  %v",
							agolden.Codes, acodes)
					}

				case "diff":
					var dinput struct {
						At    string `json:"at"`
						Right string `json:"right"`
					}
					if jerr := json.Unmarshal([]byte(data), &dinput); jerr != nil {
						t.Fatalf("bad diff input: %v\n %s", jerr, data)
					}
					dr := Diff(src, dinput.Right, &DiffOptions{At: dinput.At})
					dgot := map[string]any{
						"changes": dr.Changes,
						"same":    dr.Same,
					}
					if 0 < len(dr.Findings) {
						codes := []string{}
						for _, f := range dr.Findings {
							codes = append(codes, f.Code)
						}
						dgot["codes"] = codes
					}
					var dgolden map[string]any
					if jerr := json.Unmarshal([]byte(expect), &dgolden); jerr != nil {
						t.Fatalf("bad diff golden: %v\n %s", jerr, expect)
					}
					if specJSON(t, dgot) != specJSON(t, dgolden) {
						t.Fatalf("diff report mismatch\n want: %s\n got:  %s",
							specJSON(t, dgolden), specJSON(t, dgot))
					}

					// A diff is SYMMETRIC in what it detects: swapping
					// the sides reports the same paths with added and
					// removed exchanged.
					if dr.OK {
						back := Diff(dinput.Right, src, &DiffOptions{At: dinput.At})
						if len(back.Changes) != len(dr.Changes) {
							t.Fatalf("diff is not symmetric: %s", name)
						}
						for i, c := range dr.Changes {
							b := back.Changes[i]
							want := c.Kind
							if DiffAdded == want {
								want = DiffRemoved
							} else if DiffRemoved == want {
								want = DiffAdded
							}
							if b.Path != c.Path || b.Kind != want {
								t.Fatalf("diff is not symmetric: %s\n %v vs %v",
									name, c, b)
							}
						}
					}

				case "patch":
					var input struct {
						InPlace bool     `json:"inPlace"`
						Overlay string   `json:"overlay"`
						Set     []string `json:"set"`
					}
					if jerr := json.Unmarshal([]byte(data), &input); jerr != nil {
						t.Fatalf("bad patch input: %v\n %s", jerr, data)
					}
					// inPlace rides the input object, as opts does for
					// the five-column modes: the overlay and the
					// assignments are the same two inputs either way,
					// and the flag is the third.
					var popts *PatchOptions
					if input.InPlace {
						popts = &PatchOptions{InPlace: true}
					}
					pr := Patch(src, input.Overlay, input.Set, popts)
					got := map[string]any{
						"appended": pr.Appended,
						"overlay":  pr.Overlay,
						"verdict":  pr.Verdict,
					}
					if 0 < len(pr.Replaced) {
						got["replaced"] = pr.Replaced
					}
					if 0 < len(pr.Findings) {
						codes := []string{}
						for _, f := range pr.Findings {
							codes = append(codes, f.Code)
						}
						got["codes"] = codes
					}
					var golden map[string]any
					if jerr := json.Unmarshal([]byte(expect), &golden); jerr != nil {
						t.Fatalf("bad patch golden: %v\n %s", jerr, expect)
					}
					if specJSON(t, got) != specJSON(t, golden) {
						t.Fatalf("patch report mismatch\n want: %s\n got:  %s",
							specJSON(t, golden), specJSON(t, got))
					}

					// ORDER-INDEPENDENCE, the property the whole verb
					// rests on: an overlay entry is just another
					// conjunct, so entry-against-overlay is the same as
					// overlay-against-entry.
					//
					// IT IS CONDITIONAL ON THE OVERLAY STANDING UP ON
					// ITS OWN, and the guard used to be `verdict !=
					// error`, which is not the same test and passed only
					// because no row had reached the difference.
					// APPENDING A CONFLICTING VALUE MAKES THE OVERLAY
					// SELF-CONTRADICTORY -- `a: 1` plus an appended
					// `"a": 5` is a document that contradicts itself --
					// and Vet reports a schema that does not stand up as
					// `error` whatever the data says. That is not a
					// disagreement about the value: it is the overlay no
					// longer being a document you could hand to Vet as a
					// truth. (ts/test/spec.test.ts asserts the same.)
					_, gerr := New().Generate(pr.Overlay)
					overlayStandsAlone := nil == gerr
					if VetError != pr.Verdict && overlayStandsAlone {
						if back := Vet(pr.Overlay, src, nil); back.Verdict != pr.Verdict {
							t.Fatalf("patch is not order-independent: %s\n %s vs %s",
								name, pr.Verdict, back.Verdict)
						}
					}

					// AND THE STRONGER PROPERTY IN-PLACE BUYS: a
					// replacement leaves an overlay that still stands
					// up, where appending the same value leaves one that
					// contradicts itself. That is the difference between
					// repairing a document and layering a correction
					// over it, and it is why the mode exists.
					if 0 < len(pr.Replaced) && !overlayStandsAlone {
						t.Fatalf("in-place left a self-contradicting overlay: %s", name)
					}

					// IN-PLACE IS NEVER WORSE THAN APPEND. Every
					// in-place row is run again WITHOUT the flag and
					// must reach a verdict at least as good -- the whole
					// safety claim of the mode is that asking for it
					// cannot turn a run that would have held into one
					// that does not.
					if input.InPlace {
						rank := map[string]int{
							VetValid: 0, VetIncomplete: 1, VetInvalid: 2, VetError: 3,
						}
						plain := Patch(src, input.Overlay, input.Set, nil)
						if rank[pr.Verdict] > rank[plain.Verdict] {
							t.Fatalf("in-place is worse than append: %s (%s vs %s)",
								name, pr.Verdict, plain.Verdict)
						}
					}

				case "why":
					var golden struct {
						Code      string        `json:"code"`
						Conjuncts []WhyConjunct `json:"conjuncts"`
						Note      string        `json:"note"`
						Value     string        `json:"value"`
					}
					if jerr := json.Unmarshal([]byte(expect), &golden); jerr != nil {
						t.Fatalf("bad why golden: %v\n %s", jerr, expect)
					}
					wr := a.Why(src, data)
					value := ""
					var conjuncts []WhyConjunct
					if nil != wr.Record {
						value = wr.Record.Value
						conjuncts = wr.Record.Conjuncts
					}
					if value != golden.Value {
						t.Fatalf("why value mismatch\n src:  %q\n path: %q\n want: %q\n got:  %q",
							src, data, golden.Value, value)
					}
					if specJSON(t, conjuncts) != specJSON(t, golden.Conjuncts) {
						t.Fatalf("why conjuncts mismatch\n src:  %q\n path: %q\n want: %s\n got:  %s",
							src, data, specJSON(t, golden.Conjuncts), specJSON(t, conjuncts))
					}
					code, note := "", ""
					if 0 < len(wr.Findings) {
						code = wr.Findings[0].Code
						if nil != wr.Findings[0].Note {
							note = *wr.Findings[0].Note
						}
					}
					if code != golden.Code || note != golden.Note {
						t.Fatalf("why finding mismatch\n want: %q/%q\n got:  %q/%q",
							golden.Code, golden.Note, code, note)
					}

				case "query":
					// The golden carries the run's options under
					// `opts`; `out` is the rendered slice, and
					// `code`/`note` the finding when the answer is a
					// refusal. `message` is excluded, as every other
					// verb's goldens exclude it.
					var golden struct {
						Code string `json:"code"`
						Note string `json:"note"`
						Out  string `json:"out"`
						Opts struct {
							Depth int    `json:"depth"`
							View  string `json:"view"`
						} `json:"opts"`
					}
					if jerr := json.Unmarshal([]byte(expect), &golden); jerr != nil {
						t.Fatalf("bad query golden: %v\n %s", jerr, expect)
					}
					qopts := &QueryOptions{
						View:  golden.Opts.View,
						Depth: golden.Opts.Depth,
					}
					report := a.Get(src, data, qopts)
					if report.Out != golden.Out {
						t.Fatalf("query out mismatch\n src:  %q\n path: %q\n want: %q\n got:  %q",
							src, data, golden.Out, report.Out)
					}
					code, note := "", ""
					if 0 < len(report.Findings) {
						code = report.Findings[0].Code
						if nil != report.Findings[0].Note {
							note = *report.Findings[0].Note
						}
					}
					if code != golden.Code || note != golden.Note {
						t.Fatalf("query finding mismatch\n want: %q/%q\n got:  %q/%q",
							golden.Code, golden.Note, code, note)
					}
					assertViewSubsumes(t, name, src, data, report, qopts.View)

				case "trim":
					// trimCheck(src) must equal the expect object
					// ({redundant, verdict}); see test/spec/trim.tsv.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					r := New().TrimCheck(src)
					trimmed := map[string]any{
						"redundant": r.Redundant, "verdict": r.Verdict}
					if 0 < len(r.Errors) {
						trimmed["errors"] = specAsMap(t,
							map[string]any{"e": r.Errors})["e"]
						specStripProse(trimmed, "errors")
					}
					got := specJSON(t, trimmed)
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("trim report mismatch\n src: %q\n want: %s\n got:  %s",
							src, want, got)
					}
				case "jsonschema":
					// JSON SCHEMA EXPORT (the review's finding I): the
					// schema AND the loss report together, because a
					// schema that silently dropped a construct would look
					// identical to one that carried it. The envelope
					// (version, verb) is the CLI's, not the export's, and
					// is not compared -- the same carve-out every other
					// report mode takes.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					r := New().JSONSchema(src, "")
					out := map[string]any{
						"lossy":   specAsMap(t, map[string]any{"l": r.Lossy})["l"],
						"schema":  r.Schema,
						"verdict": r.Verdict}
					if 0 < len(r.Errors) {
						out["errors"] = specAsMap(t,
							map[string]any{"e": r.Errors})["e"]
						specStripProse(out, "errors")
					}
					got := specJSON(t, out)
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("jsonschema report mismatch\n src: %q\n want: %s\n got:  %s",
							src, want, got)
					}
				case "reaches":
					// REACHABILITY OVER THE ENTITY GRAPH (the review's
					// finding J). The endpoints ride the expect object
					// under `ask`, because the row's other columns are
					// already spoken for and the question is part of what
					// the row pins: the same document answers differently
					// for different pairs, and for the same pair under a
					// `relation` filter.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					ask, _ := golden["ask"].(map[string]any)
					delete(golden, "ask")
					from, _ := ask["from"].(string)
					to, _ := ask["to"].(string)
					rel, _ := ask["relation"].(string)
					got := specJSON(t, specStripProse(specAsMap(t,
						New().Reach(src, from, to,
							&ReachOptions{Relation: rel})), "errors"))
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("reach report mismatch\n src: %q\n want: %s\n got:  %s",
							src, want, got)
					}
				case "view":
					// THE VIEWS (docs/design/VIEWS.0.md): the drawn text,
					// byte for byte, the loss report, or the refusal. The
					// options ride `expect.ask` -- the whole ViewOptions
					// object, `kind` included -- for the reason reaches'
					// endpoints do: the same document draws differently
					// under a relation filter or from a named root.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					ask, _ := golden["ask"].(map[string]any)
					delete(golden, "ask")
					got := specJSON(t, specStripProse(specAsMap(t,
						New().View(src, specViewOptions(ask))),
						"errors"))
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("view report mismatch\n src: %q\n want: %s\n got:  %s",
							src, want, got)
					}
				case "views":
					// THE VIEW DOCUMENT (VIEWS.0.md, "6. The view
					// document"): N figures of one document, declared as
					// data, compared as one report -- every figure's bytes
					// and verdict, and every refusal, in the order the
					// declaration keys sort.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					ask, _ := golden["ask"].(map[string]any)
					delete(golden, "ask")
					got := specJSON(t, specStripViewsProse(specAsMap(t,
						New().ViewSet(src, specViewOptions(ask)))))
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("view set report mismatch\n src: %q\n want: %s\n got:  %s",
							src, want, got)
					}
				case "relation":
					// RELATION GRAPH CHECKS (G4 phase 5): acyclicity and
					// inverse consistency over the edge set, compared as
					// the whole report. Both are GLOBAL and NON-MONOTONE,
					// which is why they are checked after unification and
					// never by it — a lattice citizen may not be falsified
					// by more information, and one more edge is more
					// information.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					got := specJSON(t, specStripProse(
						specAsMap(t, New().RelationCheck(src)), "errors"))
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("relation report mismatch\n src: %q\n want: %s\n got:  %s",
							src, want, got)
					}
				case "graph":
					// THE DERIVED STRUCTURES (G4 phase 3): the entity index
					// and the edge set of the unified document, compared
					// whole. Both are deterministic by construction — ids
					// and paths in code-point order, edges by the position
					// they are written at — which is what makes a
					// byte-comparable golden possible at all, Go map order
					// being random.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					ga := New()
					ga.UnifyVars(src, vars)
					// Through a MAP on both sides: specJSON encodes a
					// struct in field order and a map in key order, so
					// comparing one against the other would fail on the
					// ordering rather than on the graph.
					got := specJSON(t, specAsMap(t, ga.Graph))
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("graph mismatch\n src: %q\n want: %s\n got:  %s",
							src, want, got)
					}
					// ... and DETERMINISTIC is a property, not a claim: a
					// fresh engine over the same source answers the same
					// bytes.
					gb := New()
					gb.UnifyVars(src, vars)
					if again := specJSON(t, specAsMap(t, gb.Graph)); again != got {
						t.Fatalf("graph is not repeatable\n src: %q\n first: %s\n again: %s",
							src, got, again)
					}
				case "subsume":
					// Same golden discipline as vet: `opts` rides the
					// expect object, messages are per-port prose and
					// excluded from parity.
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					opts := specSubsumeOpts(t, golden["opts"])
					delete(golden, "opts")

					got := specSubsumeGolden(t, Subsume(src, data, opts))
					want := specJSON(t, golden)
					if got != want {
						t.Fatalf("subsume report mismatch\n general:  %q\n specific: %q\n want: %s\n got:  %s",
							src, data, want, got)
					}
				default:
					t.Fatalf("unknown spec mode %q", mode)
				}
			})
		}
	}

	if total == 0 {
		t.Fatalf("no spec rows loaded from %s", specDir)
	}
}

// specJSON serialises a value the way the vet goldens are compared:
// COMPACT, HTML escaping off (as specGens turned it off, so `<`, `>`
// and `&` stay literal in both ports), keys sorted -- which Go's
// encoder does for a map and the canonical emitter does for every
// object, so a golden cell may be written in any key order.
// specAsMap round-trips a value through JSON into a plain map, so a
// struct golden and a literal golden are compared by the same encoding.
// specStripProse removes each finding's message and hint from a report
// map, in place, the same carve-out the vet and subsume goldens apply:
// prose is per-port, codes and shapes are not. Used by the `trim` and
// `relation` modes for their `errors` list -- WHY the document could
// not be evaluated, in the finding shape (the review's finding F).
func specStripProse(out map[string]any, key string) map[string]any {
	findings, _ := out[key].([]any)
	for _, f := range findings {
		if m, ok := f.(map[string]any); ok {
			delete(m, "message")
			delete(m, "hint")
		}
	}
	return out
}

// specStripViewsProse strips the prose from a view document's report:
// the set's own findings, and each figure's.
func specStripViewsProse(out map[string]any) map[string]any {
	specStripProse(out, "errors")
	views, _ := out["views"].([]any)
	for _, v := range views {
		if m, ok := v.(map[string]any); ok {
			specStripProse(m, "errors")
		}
	}
	return out
}

func specAsMap(t *testing.T, v any) map[string]any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil { //coverage:ignore a report struct is always encodable
		t.Fatalf("marshal: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil { //coverage:ignore ... and always decodable
		t.Fatalf("unmarshal: %v", err)
	}
	return out
}

func specJSON(t *testing.T, v any) string {
	t.Helper()
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return strings.TrimSuffix(buf.String(), "\n")
}

// specVetGolden is the report as a vet golden spells it: the MESSAGE is
// excluded (prose is per-port, codes are not -- the same split the errc
// mode makes), and the rest is round-tripped through the map form so
// the two sides of the comparison are serialised by the same code.
func specVetGolden(t *testing.T, report VetReport) string {
	t.Helper()
	raw, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("marshal report: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal report: %v", err)
	}
	findings, _ := out["findings"].([]any)
	for _, f := range findings {
		if m, ok := f.(map[string]any); ok {
			delete(m, "message")
			delete(m, "hint")
		}
	}
	return specJSON(t, out)
}

// specVetOpts reads the run's options out of the golden's `opts` key.
func specVetOpts(t *testing.T, raw any) *VetOptions {
	t.Helper()
	if nil == raw {
		return nil
	}
	m, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("opts is not an object: %v", raw)
	}
	opts := &VetOptions{}
	for k, v := range m {
		switch k {
		case "at":
			opts.At, _ = v.(string)
		case "closed":
			opts.Closed, _ = v.(bool)
		case "partial":
			opts.Partial, _ = v.(bool)
		case "maxErrors":
			n, _ := v.(float64)
			opts.MaxErrors = int(n)
		default:
			t.Fatalf("unknown vet opt %q", k)
		}
	}
	return opts
}

// specSubsumeGolden mirrors specVetGolden for the subsume mode: the
// MESSAGE is excluded from each finding, and the rest is round-tripped
// through the map form so both sides of the comparison serialise
// through specJSON.
func specSubsumeGolden(t *testing.T, report SubsumeReport) string {
	t.Helper()
	raw, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("marshal report: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal report: %v", err)
	}
	findings, _ := out["findings"].([]any)
	for _, f := range findings {
		if m, ok := f.(map[string]any); ok {
			delete(m, "message")
			delete(m, "hint")
		}
	}
	return specJSON(t, out)
}

// specSubsumeOpts reads the run's options out of the golden's `opts` key.
func specSubsumeOpts(t *testing.T, raw any) *SubsumeOptions {
	t.Helper()
	if nil == raw {
		return nil
	}
	m, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("opts is not an object: %v", raw)
	}
	opts := &SubsumeOptions{}
	for k, v := range m {
		switch k {
		case "profile":
			opts.Profile, _ = v.(string)
		case "at":
			opts.At, _ = v.(string)
		default:
			t.Fatalf("unknown subsume opt %q", k)
		}
	}
	return opts
}

// canonNoReparse lists canon rows whose expected canon cannot be
// reparsed. Each entry needs a reason and an issue; entries are DELETED,
// not amended, when fixed (AGENTS.md ledger discipline). Currently
// EMPTY: every canon row in the shared suite reparses. The TypeScript
// runner carries the same list (ts/test/spec.test.ts CANON_NO_REPARSE).
var canonNoReparse = map[string]string{}

// assertCanonConverges is the guard the G1/G2/G5 implementation plans
// call for. Those plans word it `parse(canon(v)) == v`, which is too
// strong and was never enforced: canon deliberately PRESERVES
// unevaluated ghost applications (`key()`, `pref(...)`, an unexpanded
// `&:` template), so reparsing a canon runs one more evaluation round
// and legitimately resolves them.
//
// What does hold, for every row, is convergence: canon reaches a
// fixpoint immediately after that one round, so it can never oscillate
// or drift. That is what makes canon safe as the seed of semantic
// hashing (G6). The TypeScript runner asserts the same property.
func assertCanonConverges(t *testing.T, name, expect string, vars map[string]Val) {
	t.Helper()
	if _, skip := canonNoReparse[name]; skip {
		return
	}
	v2, err := New().UnifyVars(expect, vars)
	if err != nil {
		t.Fatalf("canon does not reparse: %s\n canon: %s\n err:   %v", name, expect, err)
	}
	c2 := v2.Canon()
	v3, err := New().UnifyVars(c2, vars)
	if err != nil {
		t.Fatalf("re-canon does not reparse: %s\n canon: %s\n err:   %v", name, c2, err)
	}
	if c3 := v3.Canon(); c3 != c2 {
		t.Fatalf("canon does not converge: %s\n c2: %s\n c3: %s", name, c2, c3)
	}
}

// assertViewSubsumes pins THE PROJECTION PROPERTY (G7 phase 1): a
// canon-shaped view is a valid Aontu document that SUBSUMES the truth
// it summarises -- generalisation, never distortion. G3 made that
// mechanically checkable, so every projection row asserts it instead of
// trusting the renderer.
//
// Under the `values` profile, deliberately: a shape view ERASES
// defaults (`*8080|integer` becomes `*integer|integer`), which the
// `defaults` profile correctly calls a compatibility break. The claim
// projections make is about the values admitted, not about which one is
// generated.
func assertViewSubsumes(
	t *testing.T, name, src, path string, report QueryReport, view string) {
	t.Helper()
	if !report.OK || ("canon" != view && "types" != view) {
		return
	}
	truth := New().Get(src, path, &QueryOptions{View: "canon"})
	got := Subsume(report.Out, truth.Out, &SubsumeOptions{Profile: "values"})
	if SubsumeYes != got.Verdict {
		t.Fatalf("view does not subsume the truth: %s\n view:  %s\n truth: %s\n verdict: %s",
			name, report.Out, truth.Out, got.Verdict)
	}
}

// assertHcanonRoundTrips pins the hash form's defining property (G6
// phase 0): it is valid Aontu source, and re-evaluating it reproduces
// itself -- Hcanon(Unify(Parse(Hcanon(v)))) == Hcanon(v). A hash over a
// rendering that drifted on re-parse would pin nothing, so every hcanon
// row asserts it, exactly as every canon row asserts convergence.
func assertHcanonRoundTrips(t *testing.T, name, expect string, vars map[string]Val) {
	t.Helper()
	v2, err := New().UnifyVars(expect, vars)
	if err != nil {
		t.Fatalf("hash form does not reparse: %s\n hcanon: %s\n err: %v", name, expect, err)
	}
	if h2 := Hcanon(v2); h2 != expect {
		t.Fatalf("hash form does not round-trip: %s\n want: %s\n got:  %s", name, expect, h2)
	}
}

// TestErrCodesRegistry asserts the registry (test/spec/errcodes.tsv)
// and the engine's codeClasses table agree as SETS. The errcode rows in
// TestSpec assert "every registered code exists in the engine with the
// registered class"; this asserts the reverse -- an engine code missing
// from the registry (or a stale registry entry) fails here. The
// TypeScript runner performs the same check against ts/src/hints.ts
// (spec-errcodes-registry).
func TestErrCodesRegistry(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "test", "spec", "errcodes.tsv"))
	if err != nil {
		t.Fatalf("read errcodes.tsv: %v", err)
	}

	var registered []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSuffix(line, "\r")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, "\t")
		// Short rows are LOUD here too: this loader is the one place
		// that reads errcodes.tsv without going through TestSpec's, and
		// a registry row quietly dropped would take a code out of the
		// set-equality check below without failing anything. The TS
		// twin reuses the loud loader for the same reason.
		if len(parts) < 4 {
			t.Fatalf("malformed registry row: errcodes.tsv line %q: 4 columns required, found %d",
				line, len(parts))
		}
		if parts[1] != "errcode" {
			continue
		}
		registered = append(registered, parts[0])
	}
	sort.Strings(registered)

	engine := make([]string, 0, len(codeClasses))
	for code := range codeClasses {
		engine = append(engine, code)
	}
	sort.Strings(engine)

	if !reflect.DeepEqual(engine, registered) {
		t.Fatalf("engine codeClasses table and test/spec/errcodes.tsv disagree\n engine:     %q\n registered: %q", engine, registered)
	}
}

// specVars are the $var test variables, shared with the TypeScript
// runner (ts/test/spec.test.ts).
func specVars() map[string]Val {
	obj := newMap()
	obj.set("x", newInteger(1))
	return map[string]Val{
		"foo":  newInteger(11),
		"bar":  newString("hello"),
		"flag": newBoolean(true),
		"obj":  obj,
		// 2^60: an integer-kind value above TypeScript's safe-integer
		// range, where its exact digits and JavaScript's shortest
		// round-tripping form differ. Every other binding renders
		// identically in both ports, so no shared row could reach the
		// variable-as-path-segment rendering site until this existed.
		"big": newInteger(1152921504606846976),
		// One variable per remaining scalar kind, so shared rows can
		// reach every variable-as-path-segment rendering branch
		// (coverage drive; ts/test/spec.test.ts mirrors these).
		"half": numberVal(1.5, "1.5", -1),
		"off":  newBoolean(false),
		"bigi": newBigInteger(big.NewInt(5)),
		"bigd": newBigDecimal(newDecimal(big.NewInt(15), 1)),
		"nul":  newNull(),
		// A FORMERLY RESERVED NAME, BOUND LIKE ANY OTHER. `$PARENT` was
		// intercepted by name in find() before the variable table was
		// ever consulted (ADR-009); removing that interception did not
		// merely stop the interception, it FREED THE NAME, and
		// edge.tsv's edge-parent-name-resolves is the row that says so.
		// `KEY` and `SELF` are deliberately left unbound so their rows
		// can pin the other half: an unbound one is `unknown_var`,
		// exactly like any other.
		"PARENT": newString("q"),
	}
}

func unescapeSpec(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\\' && i+1 < len(s) {
			i++
			switch s[i] {
			case 'n':
				b.WriteByte('\n')
			case 't':
				b.WriteByte('\t')
			default:
				b.WriteByte(s[i])
			}
		} else {
			b.WriteByte(c)
		}
	}
	return b.String()
}

// specGens serialises a generated value the way the `gens` spec mode
// defines it: COMPACT JSON (no indentation, no spaces), keys in the
// order the engine generates them, compared byte for byte.
//
// Two deliberate choices make the Go and TypeScript runners agree on the
// same bytes:
//
//   - HTML escaping is OFF. Go's encoder rewrites <, > and & as their
//     \u00xx escapes by default; JavaScript's JSON.stringify — which the
//     TypeScript runner uses — leaves them as-is. Byte-exactness is the
//     whole point of this mode, so Go must not add escapes of its own.
//   - Key order needs no work here: MapVal.Gen already emits keys
//     alphabetically in BOTH ports (see the entries sort in TS
//     BagVal.gen), and Go's encoder sorts map keys, so the two agree.
//
// Number rendering also agrees: encoding/json switches to exponent form
// outside [1e-6, 1e21) and writes an unpadded, always-signed exponent
// ("1e+21", "1e-7"), which is exactly what JS Number.toString does — the
// same rule formatNumber implements for canon.
func specGens(v any) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	// Encode always appends a newline; the compared text must not have one.
	return strings.TrimSuffix(buf.String(), "\n"), nil
}

// TestSpecGensMode proves the gens mode itself, ahead of the exact
// number leaves that will rely on it. Each row is run through exactly
// the code path TestSpec's "gens" case uses, and each expectation is the
// byte-for-byte output of JSON.stringify on the same document, so the
// two runners are pinned to the same text.
func TestSpecGensMode(t *testing.T) {
	rows := []struct{ name, src, expect string }{
		{"scalar-int", "a:1", `{"a":1}`},
		{"scalar-float", "a:1.5", `{"a":1.5}`},
		// The integral float generates as the number 1: gens sees the
		// JSON text, not the kind (canon is the kind-faithful surface).
		{"integral-float", "a:1.0", `{"a":1}`},
		{"no-indent", "a:1\nb:2", `{"a":1,"b":2}`},
		// Keys come out alphabetically in both ports, not in source order.
		{"key-order", "b:1\na:2", `{"a":2,"b":1}`},
		{"nested", "a:{b:{c:true}}", `{"a":{"b":{"c":true}}}`},
		{"list", "a:[1,2,3]", `{"a":[1,2,3]}`},
		{"string", `a:"x y"`, `{"a":"x y"}`},
		{"null", "a:null", `{"a":null}`},
		// JSON.stringify leaves <, > and & alone; so must Go.
		{"no-html-escape", `a:"<b>&</b>"`, `{"a":"<b>&</b>"}`},
		// JS-style exponent form at both ends of the fixed-notation window.
		{"big-exponent", "a:1e21", `{"a":1e+21}`},
		{"small-exponent", "a:1e-7", `{"a":1e-7}`},
		{"fixed-edge", "a:1e20", `{"a":100000000000000000000}`},
		// R2: negative zero never reaches output.
		{"neg-zero", "a:-0.0", `{"a":0}`},
		// gens distinguishes what gen cannot: these two documents decode
		// to the same float64, so `gen` would call them equal.
		{"exact-below-pow53", "a:9007199254740992", `{"a":9007199254740992}`},
		{"plus", "a:1+2", `{"a":3}`},
	}

	a := New()
	for _, r := range rows {
		t.Run(r.name, func(t *testing.T) {
			got, err := a.GenerateVars(r.src, specVars())
			if err != nil {
				t.Fatalf("generate error: %v\n src: %q", err, r.src)
			}
			text, merr := specGens(got)
			if merr != nil {
				t.Fatalf("serialise error: %v\n src: %q", merr, r.src)
			}
			if text != r.expect {
				t.Fatalf("gens mismatch\n src:  %q\n want: %s\n got:  %s", r.src, r.expect, text)
			}
		})
	}
}

// jsonEqual compares a generated value with an expected JSON document
// by normalising both through JSON (so numeric types and key order do
// not matter).
func jsonEqual(got any, expectJSON string) bool {
	gj, err := json.Marshal(got)
	if err != nil {
		return false
	}
	var ga any
	if err := json.Unmarshal(gj, &ga); err != nil {
		return false
	}
	var ea any
	if err := json.Unmarshal([]byte(expectJSON), &ea); err != nil {
		return false
	}
	return reflect.DeepEqual(ga, ea)
}

// specViewOptions reads a view row's `ask` into ViewOptions: the same
// keys ts/src/view.ts's ViewOptions has, so a row asks both ports the
// same question.
func specViewOptions(ask map[string]any) *ViewOptions {
	str := func(k string) string { s, _ := ask[k].(string); return s }
	num := func(k string) int { n, _ := ask[k].(float64); return int(n) }
	list := func(k string) []string {
		var out []string
		if xs, ok := ask[k].([]any); ok {
			for _, x := range xs {
				out = append(out, x.(string))
			}
		}
		return out
	}
	closure, _ := ask["closure"].(bool)
	var docs []ViewDoc
	if ds, ok := ask["docs"].([]any); ok {
		for _, d := range ds {
			m := d.(map[string]any)
			src, _ := m["src"].(string)
			path, _ := m["path"].(string)
			name, _ := m["name"].(string)
			docs = append(docs, ViewDoc{Src: src, Path: path, Name: name})
		}
	}
	return &ViewOptions{
		Kind: str("kind"), As: str("as"), At: str("at"), MaxRows: num("maxRows"),
		Relation: str("relation"), Roots: list("roots"),
		Order: str("order"), Closure: closure,
		Relations: list("relations"), GroupBy: str("groupBy"), Label: str("label"),
		Layers: list("layers"), Edges: str("edges"),
		Sets: str("sets"), Member: str("member"), Universe: str("universe"),
		MinDegree: num("minDegree"), MaxCols: num("maxCols"), MinSize: num("minSize"),
		Profile: str("profile"), Docs: docs,
		Out: str("out"), Views: str("views"), Style: str("style"),
		Depth: num("depth"),
	}
}
