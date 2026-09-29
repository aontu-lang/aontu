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

const allowHelp = "aontu allow --role <role> <roles-file> <path> [more-paths...] (try --help)"

var allowExit = map[string]int{
	"allowed": 0,
	"refused": 1,
	"error":   4,
}

// One line per asked path: the answer, and the entry that gave it, as
// a path into the role model so `aontu why` can locate the rule.
func renderAllowDecision(d aontu.AllowDecision, role string) string {
	head := d.Path + ": refused"
	if d.Allowed {
		head = d.Path + ": allowed"
	}
	switch d.Reason {
	case "allow", "deny":
		return head + " by " + d.By + " (" + d.Pattern + ")"
	case "uncovered":
		return head + " (no allow entry of " + role + " covers it)"
	}
	return head + " (role " + role + " is not declared)"
}

func renderAllowText(report aontu.AllowReport) string {
	lines := []string{"verdict: " + report.Verdict, "role: " + report.Role}
	for _, d := range report.Paths {
		lines = append(lines, renderAllowDecision(d, report.Role))
	}
	if 0 < len(report.Findings) {
		lines = append(lines, "")
		for _, f := range report.Findings {
			lines = append(lines, renderFinding(f))
		}
	}
	return strings.Join(lines, "\n")
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type allowReportJSON struct {
	Aontu    subsumeProducerJSON   `json:"aontu"`
	Findings []aontu.VetFinding    `json:"findings"`
	Paths    []aontu.AllowDecision `json:"paths"`
	Role     string                `json:"role"`
	Verdict  string                `json:"verdict"`
}

func renderAllowJSON(report aontu.AllowReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(allowReportJSON{
		Aontu:    subsumeProducerJSON{Verb: "allow", Version: aontu.VERSION},
		Findings: report.Findings,
		Paths:    report.Paths,
		Role:     report.Role,
		Verdict:  report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}

func allowQuoted(s string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return strings.TrimSuffix(buf.String(), "\n")
}

func runAllow(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	role, roleSet := "", false
	at := ""
	format := "text"

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--role" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --role needs a role name\n")
				return 2
			}
			role, roleSet = argv[i], true
		case "--at" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --at needs a path\n")
				return 2
			}
			// An empty path names the root, as the engine's own
			// normalisation reads it; the option's empty value means
			// the default.
			at = argv[i]
			if "" == at {
				at = "$"
			}
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown allow option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if !roleSet || len(rest) < 2 {
		io.WriteString(stderr,
			"aontu: allow needs --role, a role model and at least one path\n"+
				allowHelp+"\n")
		return 2
	}
	file, asked := rest[0], rest[1:]

	// A role is ONE KEY of the roles map. A dotted name would be read as
	// a path by `why` when it follows the entry the report names, and an
	// empty one names the map itself.
	if "" == role || strings.Contains(role, ".") {
		io.WriteString(stderr, "aontu: --role needs one key, without dots\n")
		return 2
	}

	paths := []string{}
	for _, arg := range asked {
		path, value, hasValue := arg, "", false
		if eq := strings.Index(arg, "="); 0 <= eq {
			path, value, hasValue = arg[:eq], arg[eq+1:], true
		}
		if !strings.HasPrefix(path, "$") {
			io.WriteString(stderr,
				"aontu: a path starts with $ (got "+allowQuoted(arg)+")\n")
			return 2
		}
		if hasValue && !aontu.OneValue(value) {
			io.WriteString(stderr, "aontu: the value of "+path+" is not one value\n")
			return 2
		}
		paths = append(paths, path)
	}

	src, err := os.ReadFile(file)
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+file+": "+err.Error()+"\n")
		return 2
	}

	report := aontuForFileTrust(file, trust).Allow(
		string(src), role, paths, &aontu.AllowOptions{At: at})

	text := renderAllowText(report)
	if "json" == format {
		text = renderAllowJSON(report)
	}
	// The report IS the answer, refused or not, so it goes to stdout as
	// vet's does; the exit code carries the verdict for a caller that
	// reads nothing else.
	io.WriteString(stdout, text+"\n")
	return allowExit[report.Verdict]
}
