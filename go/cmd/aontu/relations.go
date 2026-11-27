/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
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
	report := operand(aontuForFileTrust(files[0], trust)).RelationCheckOpts(
		string(src), &aontu.RelationOptions{Count: true})
	text := renderRelationsText(report)
	if "json" == format {
		text = renderRelationsJSON(report)
	}
	io.WriteString(stdout, text+"\n")
	// `pass` over NO declarations is the vacuous case, and the engine
	// knows it exactly: ctx.reldecls is empty. The count is asked for
	// here rather than derived, so the answer costs no second
	// evaluation.
	if nil != report.Declared && 0 == *report.Declared {
		vacuous(stderr, "this document declares no relations",
			"`pass` means nothing was checked, not that the graph is sound")
	}
	return relationsExit[report.Verdict]
}

func renderRelationsText(report aontu.RelationReport) string {
	head := "verdict: " + report.Verdict
	if 0 < len(report.Errors) {
		out := []string{head, ""}
		for _, f := range report.Errors {
			out = append(out, renderFinding(f))
		}
		return strings.Join(out, "\n")
	}
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
	Errors   []aontu.VetFinding      `json:"errors,omitempty"`
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
		Errors:   report.Errors,
		Findings: report.Findings,
		Verdict:  report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
