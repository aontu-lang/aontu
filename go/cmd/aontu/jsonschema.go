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

const jsonSchemaImportHelp = "aontu jsonschema import [--strict] [--format text|json] <schema.json> (try --help)"

// runJsonSchemaImport writes the aontu source on stdout, and on stderr
// what it could not carry and how to vet data against it.
func runJsonSchemaImport(argv []string, stdout, stderr io.Writer) int {
	var files []string
	format := "text"
	strict := false

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
		case "--strict" == arg:
			strict = true
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown jsonschema import option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr,
			"aontu: jsonschema import needs one file\n"+jsonSchemaImportHelp+"\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr,
			"aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	report := aontu.New().ImportJSONSchema(string(src))
	if "json" == format {
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		enc.SetEscapeHTML(false)
		enc.SetIndent("", "  ")
		_ = enc.Encode(jsonSchemaImportJSON{
			Aontu:   subsumeProducerJSON{Verb: "jsonschema import", Version: aontu.VERSION},
			Errors:  report.Errors,
			Lossy:   report.Lossy,
			Source:  report.Source,
			Verdict: report.Verdict,
		})
		io.WriteString(stdout, buf.String())
	} else if "error" == report.Verdict {
		out := []string{}
		for _, e := range report.Errors {
			out = append(out, e.Path+": "+e.Code+" ["+e.Class+"]\n  "+e.Message)
		}
		io.WriteString(stderr, strings.Join(out, "\n")+"\n")
	} else {
		io.WriteString(stdout, report.Source)
		for _, l := range report.Lossy {
			io.WriteString(stderr, "lossy: "+l.Path+" "+l.Construct+": "+l.Reason+"\n")
		}
		io.WriteString(stderr, "vet data against it with: aontu vet --at "+
			"'$.schema' --no-fill --exact-numbers <file.aontu> <data>\n")
	}

	if "error" == report.Verdict {
		return 4
	}
	if strict && "lossy" == report.Verdict {
		return 1
	}
	return 0
}

// The import report under the producer envelope, fields LEXICOGRAPHIC.
type jsonSchemaImportJSON struct {
	Aontu   subsumeProducerJSON       `json:"aontu"`
	Errors  []aontu.SchemaImportError `json:"errors,omitempty"`
	Lossy   []aontu.SchemaLoss        `json:"lossy"`
	Source  string                    `json:"source"`
	Verdict string                    `json:"verdict"`
}

func runJsonSchema(argv []string, stdout, stderr io.Writer) int {
	if 0 < len(argv) && "import" == argv[0] {
		return runJsonSchemaImport(argv[1:], stdout, stderr)
	}
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
