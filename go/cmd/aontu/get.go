/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE QUERY SURFACE (G7 phase 2, the Go side of ts/src/cli.ts): one
// node of an evaluated document, selected by path and rendered.
// Evaluation is still GLOBAL — what `get` buys is the size of the
// ANSWER, not the cost of producing it — and the projections are
// lattice abstractions, each a valid Aontu document that subsumes the
// truth it summarises.

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

const getHelp = "aontu get <path> <file> (try --help)"

func runGet(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	view := aontu.QueryJSON
	depth := 0
	format := "text"

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "-c" == arg, "--canon" == arg:
			view = aontu.QueryCanon
		case "--keys" == arg:
			view = aontu.QueryKeys
		case "--types" == arg:
			view = aontu.QueryTypes
		case "--depth" == arg:
			i++
			n := 0
			if len(argv) > i {
				n, _ = strconv.Atoi(argv[i])
			}
			if n < 1 {
				io.WriteString(stderr, "aontu: --depth needs a positive integer\n")
				return 2
			}
			depth = n
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown get option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if 2 != len(rest) {
		io.WriteString(stderr, "aontu: get needs a path and one file\n"+getHelp+"\n")
		return 2
	}
	path, file := rest[0], rest[1]

	// ELIDING BELOW A DEPTH means rendering `top`, which JSON cannot
	// say. Rather than switch the view silently — the choice `trim
	// --check` refused to make — the combination is a usage error.
	if 0 < depth && aontu.QueryCanon != view && aontu.QueryTypes != view {
		io.WriteString(stderr,
			"aontu: --depth needs --canon or --types (JSON cannot say top)\n")
		return 2
	}

	src, err := os.ReadFile(file)
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+file+": "+err.Error()+"\n")
		return 2
	}

	// The file's own directory is the include base, as every verb
	// resolves a named file (vet's aontuForPath rule).
	report := aontuForFileTrust(file, trust).Get(
		string(src), path, &aontu.QueryOptions{View: view, Depth: depth})

	if "json" == format {
		io.WriteString(stdout, renderGetJSON(report)+"\n")
	} else if report.OK {
		io.WriteString(stdout, report.Out+"\n")
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
	// A path that names nothing is the QUESTION's answer — exit 1, the
	// "no" class — while a document that does not stand up is exit 4,
	// as it is for every other verb.
	if 0 < len(report.Findings) && "no_path" == report.Findings[0].Code {
		return 1
	}
	return 4
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type getReportJSON struct {
	Aontu    subsumeProducerJSON `json:"aontu"`
	Findings []aontu.VetFinding  `json:"findings"`
	OK       bool                `json:"ok"`
	Out      string              `json:"out"`
}

func renderGetJSON(report aontu.QueryReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(getReportJSON{
		Aontu:    subsumeProducerJSON{Verb: "get", Version: aontu.VERSION},
		Findings: report.Findings,
		OK:       report.OK,
		Out:      report.Out,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
