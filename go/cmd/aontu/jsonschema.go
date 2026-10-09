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

const jsonSchemaHelp = "aontu jsonschema [import] [--at <path>] [--strict] <file> (try --help)"

// runJsonSchemaImport is the import mode: JSON Schema text in, an aontu
// document out, the losses on stderr, as the export reads the other way.
func runJsonSchemaImport(argv []string, stdout, stderr io.Writer) int {
	var files []string
	format := "text"
	strict := false
	defaults := false
	uri := ""
	docs := [][2]string{}
	formatAssertion := false
	grammars := [][2]string{}
	dialect := ""
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
		case "--defaults" == arg:
			defaults = true
		case "--uri" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --uri needs a URI\n")
				return 2
			}
			uri = argv[i]
		case "--doc" == arg:
			if len(argv) < i+3 {
				io.WriteString(stderr, "aontu: --doc needs a URI and a file\n")
				return 2
			}
			docs = append(docs, [2]string{argv[i+1], argv[i+2]})
			i += 2
		case "--format-assert" == arg:
			formatAssertion = true
		case "--dialect" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --dialect needs a dialect\n")
				return 2
			}
			dialect = argv[i]
		case "--format-grammar" == arg:
			if len(argv) < i+3 {
				io.WriteString(stderr, "aontu: --format-grammar needs a name and a file\n")
				return 2
			}
			name := argv[i+1]
			if aontu.IsDefinedFormat(name) {
				io.WriteString(stderr, "aontu: --format-grammar cannot name "+name+
					", one of the nineteen formats, whose grammar is fixed\n")
				return 2
			}
			for _, g := range grammars {
				if g[0] == name {
					io.WriteString(stderr, "aontu: --format-grammar names "+name+" twice\n")
					return 2
				}
			}
			grammars = append(grammars, [2]string{name, argv[i+2]})
			i += 2
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
			"aontu: jsonschema import needs one file\n"+jsonSchemaHelp+"\n")
		return 2
	}
	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr,
			"aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}
	documents := map[string]string{}
	for _, d := range docs {
		text, err := os.ReadFile(d[1])
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read "+d[1]+": "+err.Error()+"\n")
			return 2
		}
		documents[d[0]] = string(text)
	}
	formats := map[string]string{}
	for _, g := range grammars {
		text, err := os.ReadFile(g[1])
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read "+g[1]+": "+err.Error()+"\n")
			return 2
		}
		formats[g[0]] = string(text)
	}

	report := aontu.ImportJSONSchema(string(src), &aontu.ImportOptions{
		Path: files[0], Defaults: defaults, URI: uri, Documents: documents,
		FormatAssertion: formatAssertion, Formats: formats, Dialect: dialect})

	if "json" == format {
		io.WriteString(stdout, renderJsonSchemaImportJSON(report)+"\n")
	} else if "error" == report.Verdict {
		out := []string{}
		for _, f := range report.Errors {
			out = append(out, renderFinding(f))
		}
		io.WriteString(stderr, strings.Join(out, "\n")+"\n")
	} else {
		io.WriteString(stdout, report.Aontu)
		for _, l := range report.Lossy {
			io.WriteString(stderr,
				"lossy: "+l.Path+" "+l.Construct+": "+l.Reason+"\n")
		}
		io.WriteString(stderr, "vet with: aontu vet "+
			strings.Join(report.Vet, " ")+" <document> <data>\n")
	}

	if "error" == report.Verdict {
		return 4
	}
	if strict && "lossy" == report.Verdict {
		return 1
	}
	return 0
}

func runJsonSchema(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	if 0 < len(argv) && "import" == argv[0] {
		return runJsonSchemaImport(argv[1:], stdout, stderr)
	}
	var files []string
	format := "text"
	at := ""
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
		case "--at" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --at needs a path\n")
				return 2
			}
			at = argv[i]
		case "--strict" == arg:
			strict = true
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

	report := aontuForFileTrust(files[0], trust).JSONSchema(string(src), at)

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

// The import mode's machine-readable form, in the same lexicographic order.
type jsonSchemaImportJSON struct {
	Aontu   subsumeProducerJSON `json:"aontu"`
	Errors  []aontu.VetFinding  `json:"errors,omitempty"`
	Lossy   []aontu.SchemaLoss  `json:"lossy"`
	Text    string              `json:"text"`
	Verdict string              `json:"verdict"`
	Vet     []string            `json:"vet,omitempty"`
}

func renderJsonSchemaImportJSON(report aontu.ImportReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(jsonSchemaImportJSON{
		Aontu:   subsumeProducerJSON{Verb: "jsonschema", Version: aontu.VERSION},
		Errors:  report.Errors,
		Lossy:   report.Lossy,
		Text:    report.Aontu,
		Verdict: report.Verdict,
		Vet:     report.Vet,
	})
	return strings.TrimSuffix(buf.String(), "\n")
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
