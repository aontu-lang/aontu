/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE TRIM REPORTER (G3 phase 6, the Go side of ts/src/cli.ts):
// report redundant entries as paths. Report-only — REWRITING needs
// G7's format-preserving patch surface — which is why --check is
// REQUIRED rather than defaulted: `aontu trim f.aon` reads as "trim
// this file", and doing something else silently is worse than saying
// so.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"

	aontu "github.com/rjrodger/aontu/go"
)

const trimHelp = "aontu trim --check <file> (try --help)"

var trimExit = map[string]int{
	aontu.TrimClean:     0,
	aontu.TrimRedundant: 1,
	aontu.TrimError:     4,
}

func runTrim(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var files []string
	check := false
	format := "text"

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--check" == arg:
			check = true
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown trim option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr, "aontu: trim needs one file\n"+trimHelp+"\n")
		return 2
	}
	if !check {
		io.WriteString(stderr,
			"aontu: trim only reports for now — rewriting needs a format-"+
				"preserving editor (G7); pass --check\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	// The file's own directory is the include base, as every verb
	// resolves a named file (vet's aontuForPath rule).
	report := aontuForFileTrust(files[0], trust).TrimCheck(string(src))
	text := renderTrimText(report)
	if "json" == format {
		text = renderTrimJSON(report)
	}
	io.WriteString(stdout, text+"\n")
	return trimExit[report.Verdict]
}

func renderTrimText(report aontu.TrimReport) string {
	head := "verdict: " + report.Verdict
	if 0 == len(report.Redundant) {
		return head
	}
	out := append([]string{head, ""}, report.Redundant...)
	return strings.Join(out, "\n")
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type trimReportJSON struct {
	Aontu     subsumeProducerJSON `json:"aontu"`
	Redundant []string            `json:"redundant"`
	Verdict   string              `json:"verdict"`
}

func renderTrimJSON(report aontu.TrimReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(trimReportJSON{
		Aontu:     subsumeProducerJSON{Verb: "trim", Version: aontu.VERSION},
		Redundant: report.Redundant,
		Verdict:   report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
