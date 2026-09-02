/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE VIEWS (docs/design/VIEWS.0.md, the Go side of ts/src/cli.ts):
// the figure on stdout, the loss report on stderr, and --out / --check
// / --strict around them.

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

const viewHelp = "aontu view <kind> [options] <file>... (try --help)"

var viewKinds = []string{"tree", "matrix", "graph", "layer", "sets", "layers", "ladder", "poset"}

var viewProfiles = []string{"text", "mermaid", "dot", "er", "svg"}

// The figure was drawn (0, `lossy` included: the loss report says what
// it could not draw, and --strict is the gate on that), or the document
// could not be drawn (4). An EMPTY figure is a drawing, not a failure:
// a model with no links has nothing to draw, honestly.
var viewExit = map[string]int{
	"rendered": 0,
	"lossy":    0,
	"error":    4,
}

// The refusals that are USAGE, not the document's fault: exit 2.
var viewUsageCodes = map[string]bool{
	"view_kind_unknown": true, "view_profile_unknown": true,
	"view_rows_exceeded": true, "view_at_required": true,
	"view_sets_required": true, "view_group_required": true,
}

func hasString(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func runView(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	format := "text"
	out := ""
	check := false
	strict := false
	relations := []string{}
	roots := []string{}
	opts := aontu.ViewOptions{}

	valued := map[string]*string{
		"--as": &opts.As, "--at": &opts.At, "--order": &opts.Order,
		"--group-by": &opts.GroupBy, "--label": &opts.Label,
		"--sets": &opts.Sets, "--member": &opts.Member,
		"--universe": &opts.Universe, "--profile": &opts.Profile,
	}
	counted := map[string]*int{
		"--max-rows": &opts.MaxRows, "--max-cols": &opts.MaxCols,
		"--min-degree": &opts.MinDegree, "--min-size": &opts.MinSize,
	}

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
		case "--relation" == arg:
			i++
			if len(argv) <= i || "" == argv[i] {
				io.WriteString(stderr, "aontu: --relation needs a name\n")
				return 2
			}
			relations = append(relations, argv[i])
		case "--root" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --root needs a node path\n")
				return 2
			}
			roots = append(roots, argv[i])
		case "-o" == arg, "--out" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --out needs a file\n")
				return 2
			}
			out = argv[i]
		case "--check" == arg:
			check = true
		case "--strict" == arg:
			strict = true
		case "--closure" == arg:
			opts.Closure = true
		case "--layers" == arg:
			i++
			if len(argv) <= i || "" == argv[i] {
				io.WriteString(stderr, "aontu: --layers needs a comma-separated list\n")
				return 2
			}
			opts.Layers = strings.Split(argv[i], ",")
		case nil != valued[arg]:
			i++
			if len(argv) <= i || "" == argv[i] {
				io.WriteString(stderr, "aontu: "+arg+" needs a value\n")
				return 2
			}
			*valued[arg] = argv[i]
		case nil != counted[arg]:
			i++
			n, err := -1, error(nil)
			if len(argv) > i {
				n, err = strconv.Atoi(argv[i])
			}
			if len(argv) <= i || nil != err || 0 > n {
				io.WriteString(stderr, "aontu: "+arg+" needs a count\n")
				return 2
			}
			*counted[arg] = n
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown view option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if 2 > len(rest) {
		io.WriteString(stderr,
			"aontu: view needs a kind and a file\n"+viewHelp+"\n")
		return 2
	}
	kind := rest[0]
	if !hasString(viewKinds, kind) {
		io.WriteString(stderr,
			"aontu: unknown view kind "+kind+" (the kinds are: "+strings.Join(viewKinds, ", ")+")\n")
		return 2
	}
	if "" != opts.As && !hasString(viewProfiles, opts.As) {
		io.WriteString(stderr, "aontu: --as needs one of "+strings.Join(viewProfiles, ", ")+"\n")
		return 2
	}
	if "" != opts.Order && "canon" != opts.Order && "partition" != opts.Order {
		io.WriteString(stderr, "aontu: --order needs canon or partition\n")
		return 2
	}
	if "" != opts.Profile && !hasString([]string{"values", "defaults", "gen"}, opts.Profile) {
		io.WriteString(stderr, "aontu: --profile needs values, defaults or gen\n")
		return 2
	}
	if "poset" != kind && 2 != len(rest) {
		io.WriteString(stderr, "aontu: view "+kind+" takes one file\n")
		return 2
	}
	if "graph" == kind {
		opts.Relations = relations
	} else if 1 < len(relations) {
		io.WriteString(stderr, "aontu: view "+kind+" takes one --relation\n")
		return 2
	} else if 1 == len(relations) {
		opts.Relation = relations[0]
	}
	if check && "" == out {
		io.WriteString(stderr, "aontu: --check needs --out\n")
		return 2
	}
	opts.Kind = kind
	opts.Roots = roots

	files := rest[1:]
	srcs := []string{}
	for _, file := range files {
		src, err := os.ReadFile(file)
		if nil != err {
			io.WriteString(stderr,
				"aontu: cannot read "+file+": "+err.Error()+"\n")
			return 2
		}
		srcs = append(srcs, string(src))
	}
	for i, file := range files[1:] {
		opts.Docs = append(opts.Docs, aontu.ViewDoc{Src: srcs[i+1], Path: file})
	}

	report := aontuForFileTrust(files[0], trust).View(srcs[0], &opts)

	if "json" == format {
		io.WriteString(stdout, renderViewJSON(report)+"\n")
	} else if "error" == report.Verdict {
		lines := []string{}
		for _, f := range report.Errors {
			lines = append(lines, renderFinding(f))
		}
		io.WriteString(stderr, strings.Join(lines, "\n")+"\n")
	} else {
		// THE FIGURE AND NOTHING ELSE on stdout (or in the file): stdout
		// is what a golden diff reads, and a verdict line would be part
		// of every drawing. The loss report goes to stderr.
		text := *report.Text + "\n"
		if "" == out {
			io.WriteString(stdout, text)
		} else if check {
			have, err := os.ReadFile(out)
			if nil != err || string(have) != text {
				io.WriteString(stderr, "aontu: "+out+" differs from the "+kind+" figure\n")
				return 1
			}
		} else if err := os.WriteFile(out, []byte(text), 0o644); nil != err {
			io.WriteString(stderr, "aontu: cannot write "+out+": "+err.Error()+"\n")
			return 2
		}
		if 0 < len(report.Loss) {
			io.WriteString(stderr, renderViewLoss(report.Loss)+"\n")
		}
	}

	if "error" == report.Verdict {
		if 0 < len(report.Errors) && viewUsageCodes[report.Errors[0].Code] {
			return 2
		}
		return viewExit["error"]
	}
	if strict && "lossy" == report.Verdict {
		return 1
	}
	return viewExit[report.Verdict]
}

// One line per code: the code, the count, and the detail if any.
func renderViewLoss(loss []aontu.ViewLoss) string {
	lines := []string{}
	for _, l := range loss {
		line := l.Code + "  " + strconv.Itoa(l.Count)
		if 0 < len(l.Detail) {
			line += "  " + strings.Join(l.Detail, " ")
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type viewReportJSON struct {
	Aontu   subsumeProducerJSON `json:"aontu"`
	Errors  []aontu.VetFinding  `json:"errors,omitempty"`
	Kind    string              `json:"kind"`
	Loss    []aontu.ViewLoss    `json:"loss"`
	Text    *string             `json:"text,omitempty"`
	Verdict string              `json:"verdict"`
}

func renderViewJSON(report aontu.ViewReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(viewReportJSON{
		Aontu:   subsumeProducerJSON{Verb: "view", Version: aontu.VERSION},
		Errors:  report.Errors,
		Kind:    report.Kind,
		Loss:    report.Loss,
		Text:    report.Text,
		Verdict: report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
