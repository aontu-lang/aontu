/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE RELATION REPORTER (G4 phase 5, the Go side of ts/src/cli.ts):
// acyclicity and inverse consistency over the edge set. A verb of its
// own rather than a leg of `vet`, for the reason `trim` is one: vet
// answers "does this DOCUMENT satisfy that SCHEMA", and these are facts
// about one finished model, with no schema on the other side of the
// question.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"

	aontu "github.com/rjrodger/aontu/go"
)

const relationsHelp = "aontu relations <file> (try --help)"

var relationsExit = map[string]int{
	"pass":  0,
	"fail":  1,
	"error": 4,
}

func runRelations(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var files []string
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
			io.WriteString(stderr, "aontu: unknown relations option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr, "aontu: relations needs one file\n"+relationsHelp+"\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	// The file's own directory is the include base, as every verb
	// resolves a named file (vet's aontuForPath rule).
	report := aontuForFileTrust(files[0], trust).RelationCheck(string(src))
	text := renderRelationsText(report)
	if "json" == format {
		text = renderRelationsJSON(report)
	}
	io.WriteString(stdout, text+"\n")
	return relationsExit[report.Verdict]
}

func renderRelationsText(report aontu.RelationReport) string {
	head := "verdict: " + report.Verdict
	if 0 == len(report.Findings) {
		return head
	}
	out := []string{head, ""}
	for _, f := range report.Findings {
		if "relation_cycle" == f.Code {
			out = append(out, f.At+"  "+f.Relation+": cycle "+
				strings.Join(f.Detail, " -> "))
		} else {
			out = append(out, f.At+"  "+f.Relation+": "+f.Detail[1]+
				" does not list "+f.Detail[0]+" under "+f.Detail[2])
		}
	}
	return strings.Join(out, "\n")
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type relationsReportJSON struct {
	Aontu    subsumeProducerJSON     `json:"aontu"`
	Findings []aontu.RelationFinding `json:"findings"`
	Verdict  string                  `json:"verdict"`
}

func renderRelationsJSON(report aontu.RelationReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(relationsReportJSON{
		Aontu:    subsumeProducerJSON{Verb: "relations", Version: aontu.VERSION},
		Findings: report.Findings,
		Verdict:  report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
