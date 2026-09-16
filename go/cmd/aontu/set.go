/* Copyright (c) 2025 Richard Rodger, MIT License */


package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strconv"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const setHelp = "aontu model set <path>=<value> --entry <file> --overlay <file> (try --help)"

func runSet(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var assignments []string
	entry := ""
	overlayFile := ""
	dryRun := false
	inPlace := false
	format := "text"

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--entry" == arg:
			i++
			if len(argv) > i {
				entry = argv[i]
			}
		case "--overlay" == arg:
			i++
			if len(argv) > i {
				overlayFile = argv[i]
			}
		case "--dry-run" == arg:
			dryRun = true
		case "--in-place" == arg:
			inPlace = true
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown model set option "+arg+" (try --help)\n")
			return 2
		default:
			assignments = append(assignments, arg)
		}
	}

	if 0 == len(assignments) || "" == entry || "" == overlayFile {
		io.WriteString(stderr,
			"aontu: model set needs assignments, --entry and --overlay\n"+setHelp+"\n")
		return 2
	}

	entrySrc, err := os.ReadFile(entry)
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+entry+": "+err.Error()+"\n")
		return 2
	}

	// An ABSENT overlay is the empty overlay, and the file is created
	// by the write below: "append to the overlay" should not require
	// the author to have made one first.
	overlaySrc := []byte{}
	if raw, rerr := os.ReadFile(overlayFile); nil == rerr {
		overlaySrc = raw
	} else if !os.IsNotExist(rerr) {
		io.WriteString(stderr,
			"aontu: cannot read "+overlayFile+": "+rerr.Error()+"\n")
		return 2
	}

	report := aontu.Patch(
		string(entrySrc), string(overlaySrc), assignments,
		&aontu.PatchOptions{
			Trust:     verbTrust(trust, entryRootOfFile(entry)),
			TextExt:   trust.textExt,
			EntryPath: entry, InPlace: inPlace, OverlayPath: overlayFile})

	// WRITTEN ONLY WHEN IT HOLDS. A change that contradicts a pinned
	// value is a question the author has to answer at the pinning
	// site; leaving it in the overlay would leave the configuration
	// broken while the exit code says so somewhere they may not be
	// reading.
	wrote := !dryRun &&
		aontu.VetInvalid != report.Verdict && aontu.VetError != report.Verdict
	if wrote {
		if werr := os.WriteFile(
			overlayFile, []byte(report.Overlay), 0o600); nil != werr {
			io.WriteString(stderr,
				"aontu: cannot write "+overlayFile+": "+werr.Error()+"\n")
			return 2
		}
	}

	if "json" == format {
		io.WriteString(stdout, renderSetJSON(report, wrote)+"\n")
	} else {
		head := "verdict: " + report.Verdict
		verb := "would replace: "
		if wrote {
			verb = "replaced: "
		}
		for _, r := range report.Replaced {
			head += "\n" + verb + r.File + ":" +
				strconv.Itoa(r.Row) + ":" + strconv.Itoa(r.Col) +
				" " + r.From + " -> " + r.To
		}
		if wrote {
			head += "\nwrote: " + overlayFile
		} else if dryRun {
			head += "\n(dry run)"
		}

		failed := aontu.VetInvalid == report.Verdict ||
			aontu.VetError == report.Verdict
		findingText := []string{}
		for _, f := range report.Findings {
			findingText = append(findingText, renderFinding(f))
		}
		if failed {
			out := []string{head}
			if 0 < len(findingText) {
				out = append(out, "")
				out = append(out, findingText...)
			}
			io.WriteString(stderr, strings.Join(out, "\n")+"\n")
		} else {
			io.WriteString(stdout, head+"\n")
			if 0 < len(findingText) {
				io.WriteString(stderr, strings.Join(findingText, "\n")+"\n")
			}
		}
	}

	return vetExit[report.Verdict]
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type setReportJSON struct {
	Aontu    subsumeProducerJSON      `json:"aontu"`
	Appended []string                 `json:"appended"`
	Findings []aontu.VetFinding       `json:"findings"`
	Overlay  string                   `json:"overlay"`
	Replaced []aontu.PatchReplacement `json:"replaced"`
	Verdict  string                   `json:"verdict"`
	Written  bool                     `json:"written"`
}

func renderSetJSON(report aontu.PatchReport, wrote bool) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(setReportJSON{
		Aontu:    subsumeProducerJSON{Verb: "model set", Version: aontu.VERSION},
		Appended: report.Appended,
		Findings: report.Findings,
		Overlay:  report.Overlay,
		Replaced: report.Replaced,
		Verdict:  report.Verdict,
		Written:  wrote,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
