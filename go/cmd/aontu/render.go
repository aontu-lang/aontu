/* Copyright (c) 2025 Richard Rodger, MIT License */


package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const renderHelp = "aontu render [--at <path>] [--profile <file>]... [--unit <path>] [--stdout | --out <dir> | --check <dir> | --coverage] [--coverage-at <path>] [--strict] [--marker <token>] <file> (try --help)"

func renderProfile(a *aontu.Aontu, src string) (map[string]any, []aontu.VetFinding) {
	return a.RenderProfile(src)
}

func runRender(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var files, profileFiles []string
	format := "text"
	at, unit, out, check := "", "", "", ""
	toStdout, strict := false, false
	coverage := false
	coverageAt := ""
	marker := ""

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case "--at" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --at needs a path\n")
				return 2
			}
			at = argv[i]
		case "--unit" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --unit needs a unit path\n")
				return 2
			}
			unit = argv[i]
		case "--profile" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --profile needs a file\n")
				return 2
			}
			profileFiles = append(profileFiles, argv[i])
		case "--out" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --out needs a directory\n")
				return 2
			}
			out = argv[i]
		case "--check" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --check needs a directory\n")
				return 2
			}
			check = argv[i]
		case "--stdout" == arg:
			toStdout = true
		case "--coverage" == arg:
			coverage = true
		case "--marker" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --marker needs a token\n")
				return 2
			}
			marker = argv[i]
		case "--coverage-at" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --coverage-at needs a path\n")
				return 2
			}
			coverageAt = argv[i]
		case "--strict" == arg:
			strict = true
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown render option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr, "aontu: render needs one file\n"+renderHelp+"\n")
		return 2
	}
	modes := 0
	for _, on := range []bool{toStdout, "" != out, "" != check, coverage} {
		if on {
			modes++
		}
	}
	if 1 < modes {
		io.WriteString(stderr,
			"aontu: render takes one of --stdout, --out, --check or --coverage\n")
		return 2
	}
	// A NARROWER MEASURE NEEDS SOMETHING TO NARROW. --coverage-at
	// without --coverage asks for a report the run does not compute,
	// and answering silently would be the wrong half of the request.
	if "" != coverageAt && !coverage {
		io.WriteString(stderr, "aontu: --coverage-at needs --coverage\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr,
			"aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	profiles, code := loadProfiles(profileFiles, trust, stderr, renderProfile)
	if 0 != code {
		return code
	}

	if !strings.HasSuffix(files[0], ".aon") {
		mark := marker
		if "" == mark {
			mark = templateMarker(profiles, files[0])
		}
		src = []byte(aontu.DesugarTemplate(string(src), mark))
	}

	// A RENDER WITH NO PROFILE PRODUCES NO UNITS, and said so with zero
	// bytes and exit 0. The profile is what maps a model onto a
	// language, so without one there is nothing for the renderer to
	// write -- which is a usable answer only if the caller is told.
	noProfiles := 0 == len(profiles)
	report := aontuForFileTrust(files[0], trust).Render(string(src),
		&aontu.RenderOptions{At: at, Unit: unit, Strict: strict,
			Profiles: profiles, Coverage: coverage, CoverageAt: coverageAt,
			// THE JSON REPORT CARRIES THE TRACE (D9), which is what the
			// shape there has always said; a text run computes it only
			// when the coverage report needs it.
			Trace: "json" == format})

	// Said once, whatever the format: stdout stays the report.
	if "error" != report.Verdict && 0 == len(report.Units) {
		why := "the document produced no units under this profile"
		if noProfiles {
			why = "no profile was given, and the document declares none" +
				" (see aontu help tasks)"
		}
		vacuous(stderr, "nothing was rendered", why)
	}

	if "json" == format {
		io.WriteString(stdout, renderReportJSON(report)+"\n")
		return renderExit(report, 0)
	}
	if "error" == report.Verdict {
		lines := []string{}
		for _, f := range report.Errors {
			lines = append(lines, renderFinding(f))
		}
		io.WriteString(stderr, strings.Join(lines, "\n")+"\n")
		return renderExit(report, 0)
	}

	drift := 0
	switch {
	case toStdout:
		// ONE UNIT'S BYTES AND NOTHING ELSE, so the output can be piped
		// into a formatter or a file.
		if 1 != len(report.Units) {
			io.WriteString(stderr, "aontu: --stdout needs exactly one unit, and the instance has "+
				strconv.Itoa(len(report.Units))+"; --unit names one\n")
			return 2
		}
		io.WriteString(stdout, report.Units[0].Text)
	case "" != out:
		for _, u := range report.Units {
			full := filepath.Join(out, filepath.FromSlash(u.Path))
			if outsideDir(out, full) {
				io.WriteString(stderr, "aontu: "+u.Path+" escapes "+out+"\n")
				return 2
			}
		}
		for _, u := range report.Units {
			full := filepath.Join(out, filepath.FromSlash(u.Path))
			if merr := os.MkdirAll(filepath.Dir(full), 0o755); nil != merr {
				io.WriteString(stderr, "aontu: cannot write "+u.Path+": "+merr.Error()+"\n")
				return 2
			}
			if werr := os.WriteFile(full, []byte(u.Text), 0o644); nil != werr {
				io.WriteString(stderr, "aontu: cannot write "+u.Path+": "+werr.Error()+"\n")
				return 2
			}
			io.WriteString(stderr, "wrote "+u.Path+"\n")
		}
	case "" != check:
		// RENDER AND COMPARE: a unit whose bytes differ from the file at
		// <dir>/<path>, or whose file is absent, is drift, listed by
		// path. The CI form.
		for _, u := range report.Units {
			have, rerr := os.ReadFile(filepath.Join(check, filepath.FromSlash(u.Path)))
			if nil != rerr {
				drift++
				io.WriteString(stderr, "aontu: "+u.Path+" is missing from "+check+"\n")
			} else if string(have) != u.Text {
				drift++
				io.WriteString(stderr, "aontu: "+u.Path+" differs from the rendered unit\n")
			}
		}
	case coverage:
		// THE COVERAGE REPORT (P7), one line per finding and a count at
		// the end: dead model first, then the declarations no rule
		// produced. A clean report is the count line alone.
		cov := report.Coverage
		for _, d := range cov.Dead {
			io.WriteString(stdout, "dead: "+d+"\n")
		}
		for _, u := range cov.Unruled {
			io.WriteString(stdout, "unruled: "+u.Unit+" "+u.Path+"\n")
		}
		io.WriteString(stdout, "coverage: "+strconv.Itoa(len(cov.Read))+
			" path(s) read, "+strconv.Itoa(len(cov.Dead))+
			" no output consumed, "+strconv.Itoa(len(cov.Unruled))+
			" declaration(s) no rule produced\n")
	default:
		// THE SUMMARY: one line per unit -- its path, its language and
		// its size -- since several units have no one text to print.
		for _, u := range report.Units {
			io.WriteString(stdout, u.Path+"\t"+u.Lang+"\t"+
				strconv.Itoa(len(u.Text))+" bytes\n")
		}
	}
	for _, l := range report.Lossy {
		io.WriteString(stderr, "lossy: "+l.Unit+" "+l.Path+" tier "+
			strconv.Itoa(l.Tier)+" "+l.Construct+": "+l.Reason+"\n")
	}
	return renderExit(report, drift)
}

// renderExit is D8's exit table over a report: a refused unit path is
// usage (2), a strict refusal is lossy (1), any other error is the
// document's (4); drift under --check is 1.
func renderExit(report aontu.RenderReport, drift int) int {
	if "error" == report.Verdict {
		paths, stricts := 0, 0
		for _, f := range report.Errors {
			switch f.Code {
			case "render_path":
				paths++
			case "render_strict":
				stricts++
			}
		}
		switch {
		case paths == len(report.Errors):
			return 2
		case stricts == len(report.Errors):
			return 1
		}
		return 4
	}
	if 0 < drift {
		return 1
	}
	return 0
}

// outsideDir is the write-side confinement: the file's real path must
// sit below the directory's real path, so a symlink inside the
// directory pointing outside it is an escape (the include resolver's
// own rule, docs/trust.md). Missing tails are attached lexically to
// the deepest existing ancestor's real path.
func outsideDir(dir, full string) bool {
	d := realDeep(dir)
	f := realDeep(full)
	return f != d && !strings.HasPrefix(f, d+string(filepath.Separator))
}

func realDeep(p string) string {
	abs, err := filepath.Abs(p)
	if nil != err { //coverage:ignore Abs fails only on an unreadable cwd
		abs = p
	}
	if real, rerr := filepath.EvalSymlinks(abs); nil == rerr {
		return real
	}
	parent := filepath.Dir(abs)
	if parent == abs { //coverage:ignore the root always resolves
		return abs
	}
	return filepath.Join(realDeep(parent), filepath.Base(abs))
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order.
type renderReportJSONForm struct {
	Aontu    subsumeProducerJSON   `json:"aontu"`
	Coverage *aontu.RenderCoverage `json:"coverage,omitempty"`
	Errors   []aontu.VetFinding    `json:"errors,omitempty"`
	Lossy    []aontu.RenderLoss    `json:"lossy"`
	Trace    []aontu.RenderTrace   `json:"trace,omitempty"`
	Units    []aontu.RenderUnit    `json:"units"`
	Verdict  string                `json:"verdict"`
}

func renderReportJSON(report aontu.RenderReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(renderReportJSONForm{
		Aontu:    subsumeProducerJSON{Verb: "render", Version: aontu.VERSION},
		Coverage: report.Coverage,
		Errors:   report.Errors,
		Lossy:    report.Lossy,
		Trace:    report.Trace,
		Units:    report.Units,
		Verdict:  report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
