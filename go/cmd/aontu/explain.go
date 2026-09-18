/* Copyright (c) 2025 Richard Rodger, MIT License */


package main

import (
	"io"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const explainHelp = "aontu explain <code> (try `aontu explain --list`)"

// A report prints the namespaced spelling in its brackets, which is the
// span a reader copies. The answer names the registered one.
const explainNamespace = "aontu/"

func runExplain(argv []string, stdout, stderr io.Writer) int {
	format := "text"
	list := false
	var codes []string

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--list" == arg:
			list = true
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown explain option "+arg+" (try --help)\n")
			return 2
		default:
			codes = append(codes, arg)
		}
	}

	if list {
		if 0 < len(codes) {
			io.WriteString(stderr,
				"aontu: --list takes no code\n"+explainHelp+"\n")
			return 2
		}
		io.WriteString(stdout, renderExplainList(format)+"\n")
		return 0
	}

	if 1 != len(codes) {
		io.WriteString(stderr,
			"aontu: explain needs one code\n"+explainHelp+"\n")
		return 2
	}

	code := strings.TrimPrefix(codes[0], explainNamespace)
	class, hint, registered := aontu.ExplainCode(code)
	if !registered {
		// AN UNKNOWN CODE IS A USAGE ERROR AND NAMES NEAR MATCHES.
		// A caller reading a code out of a report has almost certainly
		// typed it correctly, so the likely cause is a code from another
		// tool or a truncated one, and the near matches say which.
		io.WriteString(stderr, "aontu: no such error code `"+code+"`\n")
		if near := nearestVerb(code, aontu.Codes()); "" != near {
			io.WriteString(stderr, "aontu: did you mean `"+near+"`?\n")
		}
		io.WriteString(stderr,
			"aontu: `aontu explain --list` lists every registered code\n")
		return 2
	}

	if "json" == format {
		io.WriteString(stdout, renderExplainJSON(code, class, hint)+"\n")
		return 0
	}
	io.WriteString(stdout,
		"code:  "+code+"\nclass: "+class+"\n\n"+explainBody(hint)+"\n")
	return 0
}

// The registry is append-only, so a code can be registered before its
// text is written; saying so beats printing an empty block.
func explainBody(hint string) string {
	if "" == hint {
		return "(no explanation text is registered for this code)"
	}
	return hint
}

func noTextMark(hint string) string {
	if "" == hint {
		return "  (no text)"
	}
	return ""
}

// The class of every code, so a caller can read the report vocabulary
// without triggering it. `--format json` answers the same as an array.
func renderExplainList(format string) string {
	codes := aontu.Codes()
	if "json" == format {
		rows := make([]explainRowJSON, 0, len(codes))
		for _, c := range codes {
			class, hint, _ := aontu.ExplainCode(c)
			rows = append(rows, explainRowJSON{
				Class: class, Code: c, Explained: "" != hint})
		}
		return helpJSON(explainListJSON{
			Aontu: subsumeProducerJSON{Verb: "explain", Version: aontu.VERSION},
			Codes: rows,
		})
	}
	width := 0
	for _, c := range codes {
		if width < len(c) {
			width = len(c)
		}
	}
	var b strings.Builder
	for _, c := range codes {
		class, hint, _ := aontu.ExplainCode(c)
		b.WriteString(c + strings.Repeat(" ", width-len(c)) + "  " + class +
			noTextMark(hint) + "\n")
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// The machine-readable forms. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type explainJSON struct {
	Aontu subsumeProducerJSON `json:"aontu"`
	Class string              `json:"class"`
	Code  string              `json:"code"`
	Hint  string              `json:"hint"`
}

type explainRowJSON struct {
	Class string `json:"class"`
	Code  string `json:"code"`
	// A gate holds every registered code explained, so this reads true
	// throughout; it stays because the registry is append-only.
	Explained bool `json:"explained"`
}

type explainListJSON struct {
	Aontu subsumeProducerJSON `json:"aontu"`
	Codes []explainRowJSON    `json:"codes"`
}

func renderExplainJSON(code, class, hint string) string {
	return helpJSON(explainJSON{
		Aontu: subsumeProducerJSON{Verb: "explain", Version: aontu.VERSION},
		Class: class,
		Code:  code,
		Hint:  hint,
	})
}
