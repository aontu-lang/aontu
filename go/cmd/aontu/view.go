/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE TREE VIEW (docs/design/VIEWS.0.md, the Go side of ts/src/cli.ts):
// the drawn edge set, as text a golden diff can check.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const viewHelp = "aontu view tree [--relation <name>] [--root <path>]... <file> (try --help)"

// Two-way: the figure was drawn (0), or the document could not be
// drawn (4) -- a document that does not stand up, a relation with no
// edges, a root that names no node. An EMPTY figure is a drawing, not
// a failure: a model with no links has nothing to draw, honestly.
var viewExit = map[string]int{
	"rendered": 0,
	"error":    4,
}

func runView(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	format := "text"
	relation := ""
	roots := []string{}

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
			if len(argv) <= i || "" == argv[i] {
				io.WriteString(stderr, "aontu: --relation needs a name\n")
				return 2
			}
			relation = argv[i]
		case "--root" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --root needs a node path\n")
				return 2
			}
			roots = append(roots, argv[i])
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown view option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if 2 != len(rest) {
		io.WriteString(stderr,
			"aontu: view needs a kind and one file\n"+viewHelp+"\n")
		return 2
	}
	if "tree" != rest[0] {
		io.WriteString(stderr,
			"aontu: unknown view kind "+rest[0]+" (the kinds are: tree)\n")
		return 2
	}

	src, err := os.ReadFile(rest[1])
	if nil != err {
		io.WriteString(stderr,
			"aontu: cannot read "+rest[1]+": "+err.Error()+"\n")
		return 2
	}

	report := aontuForFileTrust(rest[1], trust).ViewTree(
		string(src), &aontu.ViewOptions{Relation: relation, Roots: roots})
	if "json" == format {
		io.WriteString(stdout, renderViewJSON(report)+"\n")
	} else if "rendered" == report.Verdict {
		// THE FIGURE AND NOTHING ELSE: stdout is what a golden diff
		// reads, and a verdict line would be part of every drawing.
		io.WriteString(stdout, *report.Text+"\n")
	} else {
		lines := []string{}
		for _, f := range report.Errors {
			lines = append(lines, renderFinding(f))
		}
		io.WriteString(stderr, strings.Join(lines, "\n")+"\n")
	}
	return viewExit[report.Verdict]
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type viewReportJSON struct {
	Aontu   subsumeProducerJSON `json:"aontu"`
	Errors  []aontu.VetFinding  `json:"errors,omitempty"`
	Kind    string              `json:"kind"`
	Text    *string             `json:"text,omitempty"`
	Verdict string              `json:"verdict"`
}

func renderViewJSON(report aontu.ViewReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(viewReportJSON{
		Aontu:   subsumeProducerJSON{Verb: "view", Version: aontu.VERSION},
		Errors:  report.Errors,
		Kind:    report.Kind,
		Text:    report.Text,
		Verdict: report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
