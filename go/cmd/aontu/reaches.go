/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE REACHABILITY CHECK (the review's finding J, the Go side of
// ts/src/cli.ts): does anything `from` links to, at any remove, end up
// at `to`? A verb of its own for the same reason `relations` is one:
// reachability is a fact about one finished model, and it is global and
// non-monotone, so no lattice citizen may assert it.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const reachesHelp = "aontu reaches <from> <to> [--relation <name>] <file> (try --help)"

// Same three-way shape every check verb here uses: the check held (0),
// the check failed (1), the document could not be checked (4). An
// unreachable pair is a FAILED CHECK and not an error: the question was
// answered, and the answer was no.
var reachesExit = map[string]int{
	"reaches":     0,
	"unreachable": 1,
	"error":       4,
}

func runReaches(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	format := "text"
	relation := ""

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
		case "--relation" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --relation needs a name\n")
				return 2
			}
			relation = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown reaches option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if 3 != len(rest) {
		io.WriteString(stderr,
			"aontu: reaches needs two entities and one file\n"+reachesHelp+"\n")
		return 2
	}

	src, err := os.ReadFile(rest[2])
	if nil != err {
		io.WriteString(stderr,
			"aontu: cannot read "+rest[2]+": "+err.Error()+"\n")
		return 2
	}

	report := aontuForFileTrust(rest[2], trust).Reach(
		string(src), rest[0], rest[1], &aontu.ReachOptions{Relation: relation})
	text := renderReachesText(report, rest[0], rest[1])
	if "json" == format {
		text = renderReachesJSON(report)
	}
	io.WriteString(stdout, text+"\n")
	return reachesExit[report.Verdict]
}

func renderReachesText(
	report aontu.ReachReport, from, to string) string {
	head := "verdict: " + report.Verdict
	if 0 < len(report.Errors) {
		out := []string{head, ""}
		for _, f := range report.Errors {
			out = append(out, renderFinding(f))
		}
		return strings.Join(out, "\n")
	}
	// THE PATH IS THE ANSWER, not decoration: "yes" is worth little to
	// an operator asking what a failure would take out, and the chain is
	// what they act on.
	if "reaches" == report.Verdict {
		return strings.Join(
			[]string{head, "", strings.Join(report.Path, " -> ")}, "\n")
	}
	return strings.Join(
		[]string{head, "", from + " does not reach " + to}, "\n")
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type reachesReportJSON struct {
	Aontu   subsumeProducerJSON `json:"aontu"`
	Errors  []aontu.VetFinding  `json:"errors,omitempty"`
	Path    []string            `json:"path,omitempty"`
	Verdict string              `json:"verdict"`
}

func renderReachesJSON(report aontu.ReachReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(reachesReportJSON{
		Aontu:   subsumeProducerJSON{Verb: "reaches", Version: aontu.VERSION},
		Errors:  report.Errors,
		Path:    report.Path,
		Verdict: report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
