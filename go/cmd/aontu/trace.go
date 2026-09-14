/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"encoding/json"
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const traceHelp = "aontu trace [--at <path>] [--format json] " +
	"[--marker <token>] [--profile <file>] <file>"

// runTrace answers what wrote each line: every piece a rule stamped,
// under the component tree, with the file it reached, the rule set that
// wrote it and the model node the dispatch matched. Mirrors runTrace in
// ts/src/cli.ts.
func runTrace(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	var profileFiles []string
	format := "text"
	at := ""
	marker := ""

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
		case "--marker" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --marker needs a token\n")
				return 2
			}
			marker = argv[i]
		case "--profile" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --profile needs a file\n")
				return 2
			}
			profileFiles = append(profileFiles, argv[i])
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown trace option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if 1 != len(rest) {
		io.WriteString(stderr, "aontu: trace needs one file\n"+traceHelp+"\n")
		return 2
	}

	src, err := os.ReadFile(rest[0])
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+rest[0]+": "+
			err.Error()+"\n")
		return 2
	}

	profiles, code := loadProfiles(profileFiles, trust, stderr)
	if 0 != code {
		return code
	}

	// A GENERATOR IS AN ENTRY, not a preprocessing step: the file whose
	// provenance is asked for is the one the author edits.
	text := string(src)
	if !strings.HasSuffix(rest[0], ".aon") {
		mark := marker
		if "" == mark {
			mark = templateMarker(profiles, rest[0])
		}
		text = aontu.DesugarTemplate(text, mark)
	}

	report := aontuForFileTrust(rest[0], trust).Trace(
		text, &aontu.TraceOptions{At: at})
	if "error" == report.Verdict {
		for _, f := range report.Errors {
			io.WriteString(stderr, renderFinding(f)+"\n")
		}
		return 4
	}
	if "json" == format {
		b, _ := json.Marshal(map[string]any{"trace": report.Trace})
		io.WriteString(stdout, string(b)+"\n")
		return 0
	}
	for _, e := range report.Trace {
		io.WriteString(stdout,
			strings.Join([]string{e.File, e.At, e.Node, e.Rule}, "\t")+"\n")
	}
	return 0
}
