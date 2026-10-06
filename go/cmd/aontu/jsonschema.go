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

const jsonSchemaHelp = "aontu jsonschema [--at <path>] [--strict] [--exact-numbers] <file> (try --help)"

func runJsonSchema(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var files []string
	format := "text"
	at := ""
	strict := false
	exactNumbers := false

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
		case "--strict" == arg:
			strict = true
		case "--exact-numbers" == arg:
			exactNumbers = true
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown jsonschema option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr,
			"aontu: jsonschema needs one file\n"+jsonSchemaHelp+"\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr,
			"aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	report := aontuForFileTrust(files[0], trust).JSONSchemaWith(string(src),
		aontu.JSONSchemaOptions{At: at, ExactNumbers: exactNumbers})

	if "json" == format {
		io.WriteString(stdout, renderJsonSchemaJSON(report)+"\n")
	} else if "error" == report.Verdict {
		out := []string{}
		for _, f := range report.Errors {
			out = append(out, renderFinding(f))
		}
		io.WriteString(stderr, strings.Join(out, "\n")+"\n")
	} else {
		io.WriteString(stdout, encodeSchema(report.Schema)+"\n")
		for _, l := range report.Lossy {
			io.WriteString(stderr,
				"lossy: "+l.Path+" "+l.Construct+": "+l.Reason+"\n")
		}
	}

	if "error" == report.Verdict {
		return 4
	}
	if strict && "lossy" == report.Verdict {
		return 1
	}
	return 0
}

func encodeSchema(schema map[string]any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(schema)
	return strings.TrimSuffix(buf.String(), "\n")
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type jsonSchemaReportJSON struct {
	Aontu   subsumeProducerJSON `json:"aontu"`
	Errors  []aontu.VetFinding  `json:"errors,omitempty"`
	Lossy   []aontu.SchemaLoss  `json:"lossy"`
	Schema  map[string]any      `json:"schema"`
	Verdict string              `json:"verdict"`
}

func renderJsonSchemaJSON(report aontu.SchemaReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(jsonSchemaReportJSON{
		Aontu:   subsumeProducerJSON{Verb: "jsonschema", Version: aontu.VERSION},
		Errors:  report.Errors,
		Lossy:   report.Lossy,
		Schema:  report.Schema,
		Verdict: report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
