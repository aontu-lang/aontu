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
	"strconv"
	"strings"
	"testing"
)

// semverRe matches the since-version column of test/spec/errcodes.tsv.
var semverRe = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

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
			vetRow := "vet" == mode || "subsume" == mode || "query" == mode ||
				"why" == mode || "patch" == mode || "diff" == mode ||
				"agentsmd" == mode || "fmt-template" == mode ||
				"fmt-template-lint" == mode
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

				case "fmt-template":
					report := a.FormatWith(src, FormatOptions{Template: data})
					if "formatted" != report.Verdict {
						t.Fatalf("does not format: %v\n src: %q", report.Errors, src)
					}
					if report.Text != expect {
						t.Fatalf("fmt-template mismatch\n src:  %q\n want: %q\n got:  %q",
							src, expect, report.Text)
					}
					again := a.FormatWith(expect, FormatOptions{Template: data})
					if "formatted" != again.Verdict || again.Text != expect {
						t.Fatalf("not a fixed point\n want: %q\n got:  %q", expect, again.Text)
					}

				case "fmt-template-lint":
					report := a.FormatWith(src, FormatOptions{Template: data, Lint: true})
					if "formatted" != report.Verdict {
						t.Fatalf("does not format: %v\n src: %q", report.Errors, src)
					}
					lines := make([]string, 0, len(report.Findings))
					for _, f := range report.Findings {
						lines = append(lines, strconv.Itoa(f.Line)+":"+strconv.Itoa(f.Col)+
							": "+f.Rule+": "+f.Message)
					}
					if got := strings.Join(lines, "\n"); got != expect {
						t.Fatalf("fmt-template lint\n src:  %q\n want: %q\n got:  %q",
							src, expect, got)
					}

				case "fmt-refuse":
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

				case "fmt-lint":
					report := a.FormatWith(src, FormatOptions{Lint: true})
					if "formatted" != report.Verdict {
						t.Fatalf("does not format: %v\n src: %q", report.Errors, src)
					}
					lines := make([]string, 0, len(report.Findings))
					for _, f := range report.Findings {
						lines = append(lines, strconv.Itoa(f.Line)+":"+strconv.Itoa(f.Col)+
							": "+f.Rule+": "+f.Message)
					}
					if got := strings.Join(lines, "\n"); got != expect {
						t.Fatalf("fmt lint\n src:  %q\n want: %q\n got:  %q", src, expect, got)
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

					_, gerr := New().Generate(pr.Overlay)
					overlayStandsAlone := nil == gerr
					if VetError != pr.Verdict && overlayStandsAlone {
						if back := Vet(pr.Overlay, src, nil); back.Verdict != pr.Verdict {
							t.Fatalf("patch is not order-independent: %s\n %s vs %s",
								name, pr.Verdict, back.Verdict)
						}
					}

					if 0 < len(pr.Replaced) && !overlayStandsAlone {
						t.Fatalf("in-place left a self-contradicting overlay: %s", name)
					}

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
						Class     string        `json:"class"`
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
					code, class, note := "", "", ""
					if 0 < len(wr.Findings) {
						code = wr.Findings[0].Code
						class = wr.Findings[0].Class
						if nil != wr.Findings[0].Note {
							note = *wr.Findings[0].Note
						}
					}
					if code != golden.Code || class != golden.Class ||
						note != golden.Note {
						t.Fatalf("why finding mismatch\n want: %q/%q/%q\n got:  %q/%q/%q",
							golden.Code, golden.Class, golden.Note, code, class, note)
					}

				case "query":
					// The golden carries the run's options under
					// `opts`; `out` is the rendered slice, and
					// `class`/`code`/`note` the finding when the answer
					// is a refusal. `message` is excluded, as every
					// other verb's goldens exclude it.
					var golden struct {
						Class string `json:"class"`
						Code  string `json:"code"`
						Note  string `json:"note"`
						Out   string `json:"out"`
						Opts  struct {
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
					code, class, note := "", "", ""
					if 0 < len(report.Findings) {
						code = report.Findings[0].Code
						class = report.Findings[0].Class
						if nil != report.Findings[0].Note {
							note = *report.Findings[0].Note
						}
					}
					if code != golden.Code || class != golden.Class ||
						note != golden.Note {
						t.Fatalf("query finding mismatch\n want: %q/%q/%q\n got:  %q/%q/%q",
							golden.Code, golden.Class, golden.Note, code, class, note)
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
				case "template":
					var golden map[string]any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					marker := ""
					if ask, ok := golden["ask"].(map[string]any); ok {
						marker, _ = ask["marker"].(string)
					}
					want, _ := golden["out"].(string)
					back, _ := golden["back"].(string)
					got := DesugarTemplate(src, marker)
					if got != want {
						t.Fatalf("desugar mismatch\n src: %q\n want: %q\n got:  %q",
							src, want, got)
					}
					if again := ResugarTemplate(got, marker); again != back {
						t.Fatalf("resugar mismatch\n src: %q\n want: %q\n got:  %q",
							src, back, again)
					}
				case "trace":
					// WHAT WROTE THIS LINE (UNITS-AND-TREES.1.md P6): the
					// file, the rule set and the model node behind every
					// piece a dispatch stamped under the component tree.
					report := New().Trace(src, nil)
					got := specJSON(t, specAsAny(t, report.Trace))
					var golden any
					if err := json.Unmarshal([]byte(expect), &golden); err != nil {
						t.Fatalf("expect is not JSON: %v\n expect: %s", err, expect)
					}
					if want := specJSON(t, golden); got != want {
						t.Fatalf("trace mismatch\n src:  %s\n want: %s\n got:  %s",
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

// specAsAny is specAsMap for a value that is a list rather than a map.
func specAsAny(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil { //coverage:ignore a report struct is always encodable
		t.Fatalf("marshal: %v", err)
	}
	var out any
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
		case "coverage":
			opts.Coverage, _ = v.(bool)
		case "coverageAt":
			opts.CoverageAt, _ = v.(string)
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

var canonNoReparse = map[string]string{}

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
		"half":   numberVal(1.5, "1.5", -1),
		"off":    newBoolean(false),
		"bigi":   newBigInteger(big.NewInt(5)),
		"bigd":   newBigDecimal(newDecimal(big.NewInt(15), 1)),
		"nul":    newNull(),
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
