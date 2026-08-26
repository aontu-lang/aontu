/* Copyright (c) 2025 Richard Rodger, MIT License */

// PROVENANCE (G7 phase 4, the Go side of ts/src/cli.ts): WHY the value
// at a path holds — the ordered contributions that met there, each
// with the site it was written at. The positive twin of the vet
// report: errors explain what failed to unify, this explains what did.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strconv"
	"strings"

	aontu "github.com/rjrodger/aontu/go"
)

const whyHelp = "aontu why <path> <file> (try --help)"

func runWhy(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	format := "text"

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
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown why option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if 2 != len(rest) {
		io.WriteString(stderr, "aontu: why needs a path and one file\n"+whyHelp+"\n")
		return 2
	}
	path, file := rest[0], rest[1]

	src, err := os.ReadFile(file)
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+file+": "+err.Error()+"\n")
		return 2
	}

	report := aontuForFileTrust(file, trust).Why(string(src), path)

	if "json" == format {
		io.WriteString(stdout, renderWhyJSON(report)+"\n")
	} else if report.OK {
		io.WriteString(stdout, renderWhyText(*report.Record)+"\n")
	} else {
		lines := make([]string, 0, len(report.Findings))
		for _, f := range report.Findings {
			lines = append(lines, renderFinding(f))
		}
		io.WriteString(stderr, strings.Join(lines, "\n")+"\n")
	}

	if report.OK {
		return 0
	}
	if 0 < len(report.Findings) && "no_path" == report.Findings[0].Code {
		return 1
	}
	return 4
}

// renderWhyText writes one contribution per line, numbered in source
// order, each with what was written, where, and how it got here.
func renderWhyText(record aontu.WhyRecord) string {
	head := record.Path + " = " + record.Value
	if 0 == len(record.Conjuncts) {
		// A value written once and never met is a fact, not a failure.
		return head + "\n  (no contributions: nothing met at this path)"
	}
	out := []string{head}
	for i, c := range record.Conjuncts {
		where := ""
		if -1 != c.Site.Row {
			name := ""
			if "" != c.Site.File {
				name = c.Site.File + ":"
			}
			where = "  " + name +
				strconv.Itoa(c.Site.Row) + ":" + strconv.Itoa(c.Site.Col)
		}
		role := ""
		if aontu.WhyLiteral != c.Role {
			role = "  (" + c.Role + ")"
		}
		out = append(out,
			"  "+strconv.Itoa(i+1)+". "+c.Canon+where+role)
	}
	return strings.Join(out, "\n")
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type whyReportJSON struct {
	Aontu    subsumeProducerJSON `json:"aontu"`
	Findings []aontu.VetFinding  `json:"findings"`
	OK       bool                `json:"ok"`
	Record   *aontu.WhyRecord    `json:"record,omitempty"`
}

func renderWhyJSON(report aontu.WhyReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(whyReportJSON{
		Aontu:    subsumeProducerJSON{Verb: "why", Version: aontu.VERSION},
		Findings: report.Findings,
		OK:       report.OK,
		Record:   report.Record,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
