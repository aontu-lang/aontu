/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE SUBSUMPTION VERBS (G3 phase 3, the Go side of ts/src/cli.ts):
// `subsume` asks the query once, `breaking` asks it between a document
// and its own earlier versions. Exit codes are verdict classes,
// mirroring vet's convention — 3 is "the truth is not yet settled",
// which is exactly what undecided means here, and a gate that shrugs
// is not a gate, so undecided FAILS by default.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const subsumeHelp = "aontu subsume <general> <specific> (try --help)"
const breakingHelp = "aontu breaking --against <file|git#rev> <file> (try --help)"

var subsumeExit = map[string]int{
	aontu.SubsumeYes:       0,
	aontu.SubsumeNo:        1,
	aontu.SubsumeUndecided: 3,
	aontu.SubsumeError:     4,
}

type subsumeArgs struct {
	help     bool
	general  string
	specific string
	profile  string
	at       string
	format   string
}

// parseSubsumeArgs reads the verb's argument tail. It returns the
// error TEXT rather than an error, so the caller owns the exit code.
func parseSubsumeArgs(argv []string) (*subsumeArgs, string) {
	args := &subsumeArgs{format: "text"}
	var files []string

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			return &subsumeArgs{help: true, format: args.format}, ""
		case "--profile" == arg:
			i++
			if len(argv) <= i ||
				("values" != argv[i] && "defaults" != argv[i] && "gen" != argv[i]) {
				return nil, "aontu: --profile needs values, defaults or gen"
			}
			args.profile = argv[i]
		case "--at" == arg:
			i++
			if len(argv) <= i {
				return nil, "aontu: --at needs a path"
			}
			args.at = argv[i]
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				return nil, "aontu: --format needs text or json"
			}
			args.format = argv[i]
		case strings.HasPrefix(arg, "-"):
			return nil, "aontu: unknown subsume option " + arg + " (try --help)"
		default:
			files = append(files, arg)
		}
	}

	if 2 != len(files) {
		return nil, "aontu: subsume needs a general and a specific file\n" + subsumeHelp
	}

	args.general = files[0]
	args.specific = files[1]
	return args, ""
}

func renderSubsumeText(report aontu.SubsumeReport) string {
	head := "verdict: " + report.Verdict
	if 0 == len(report.Findings) {
		return head
	}
	out := []string{head, ""}
	for _, f := range report.Findings {
		out = append(out, renderFinding(f))
	}
	return strings.Join(out, "\n")
}

// The machine-readable forms. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type subsumeReportJSON struct {
	Aontu    subsumeProducerJSON `json:"aontu"`
	Findings []aontu.VetFinding  `json:"findings"`
	Verdict  string              `json:"verdict"`
}

type subsumeProducerJSON struct {
	Mode    string `json:"mode,omitempty"`
	Verb    string `json:"verb"`
	Version string `json:"version"`
}

func renderSubsumeJSON(report aontu.SubsumeReport, verb, mode string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(subsumeReportJSON{
		Aontu:    subsumeProducerJSON{Mode: mode, Verb: verb, Version: aontu.VERSION},
		Findings: report.Findings,
		Verdict:  report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}

func runSubsume(argv []string, stdout, stderr io.Writer) int {
	args, errText := parseSubsumeArgs(argv)
	if "" != errText {
		io.WriteString(stderr, errText+"\n")
		return 2
	}

	if args.help {
		io.WriteString(stdout, helpText)
		return 0
	}

	generalSrc, err := os.ReadFile(args.general)
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+args.general+": "+err.Error()+"\n")
		return 2
	}
	specificSrc, err := os.ReadFile(args.specific)
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+args.specific+": "+err.Error()+"\n")
		return 2
	}

	report := aontu.Subsume(string(generalSrc), string(specificSrc),
		&aontu.SubsumeOptions{
			Profile:      args.profile,
			At:           args.at,
			GeneralURL:   args.general,
			SpecificURL:  args.specific,
			GeneralPath:  args.general,
			SpecificPath: args.specific,
		})

	text := renderSubsumeText(report)
	if "json" == args.format {
		text = renderSubsumeJSON(report, "subsume", "")
	}
	io.WriteString(stdout, text+"\n")
	return subsumeExit[report.Verdict]
}

type breakingArgs struct {
	help             bool
	file             string
	against          []string
	mode             string
	allowUndecided   bool
	allowDeprRemoval bool
	format           string
}

func parseBreakingArgs(argv []string) (*breakingArgs, string) {
	args := &breakingArgs{format: "text"}
	var files []string

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			return &breakingArgs{help: true, format: args.format}, ""
		case "--against" == arg:
			i++
			if len(argv) <= i {
				return nil, "aontu: --against needs a file path or git#<rev>"
			}
			args.against = append(args.against, argv[i])
		case "--mode" == arg:
			i++
			if len(argv) <= i ||
				("backward" != argv[i] && "forward" != argv[i] && "full" != argv[i]) {
				return nil, "aontu: --mode needs backward, forward or full"
			}
			args.mode = argv[i]
		case "--allow-undecided" == arg:
			args.allowUndecided = true
		case "--allow-deprecated-removal" == arg:
			args.allowDeprRemoval = true
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				return nil, "aontu: --format needs text or json"
			}
			args.format = argv[i]
		case strings.HasPrefix(arg, "-"):
			return nil, "aontu: unknown breaking option " + arg + " (try --help)"
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) || 0 == len(args.against) {
		return nil, "aontu: breaking needs one file and at least one --against\n" + breakingHelp
	}

	args.file = files[0]
	return args, ""
}

// againstSource resolves one --against spelling to source text.
// `git#<rev>` shells out to `git show <rev>:./<basename>` from the
// file's own directory — no embedded git, and the `./` prefix makes
// git resolve the path relative to that directory rather than the
// repository root. Returns ok=false with the message already printed.
func againstSource(spec, file string, stderr io.Writer) (string, bool) {
	if !strings.HasPrefix(spec, "git#") {
		src, err := os.ReadFile(spec)
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read "+spec+": "+err.Error()+"\n")
			return "", false
		}
		return string(src), true
	}

	rev := spec[len("git#"):]
	if "" == rev {
		io.WriteString(stderr, "aontu: --against git# needs a revision\n")
		return "", false
	}

	abs, err := filepath.Abs(file)
	if nil != err { //coverage:ignore Abs fails only on an unreadable cwd
		io.WriteString(stderr, "aontu: cannot resolve "+spec+": "+err.Error()+"\n")
		return "", false
	}
	dir := filepath.Dir(abs)
	rel := "./" + filepath.Base(abs)

	cmd := exec.Command("git", "show", rev+":"+rel)
	cmd.Dir = dir
	var out, errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut
	if err := cmd.Run(); nil != err {
		detail := strings.TrimSpace(errOut.String())
		if "" == detail {
			detail = err.Error()
		}
		detail = strings.SplitN(detail, "\n", 2)[0]
		io.WriteString(stderr, "aontu: cannot resolve "+spec+": "+detail+"\n")
		return "", false
	}
	return out.String(), true
}

// Verdict aggregation for breaking: an error anywhere makes the run an
// error; otherwise a witness anywhere makes it breaking; otherwise an
// open question anywhere leaves it undecided.
var breakingRank = map[string]int{
	aontu.SubsumeYes:       0,
	aontu.SubsumeUndecided: 1,
	aontu.SubsumeNo:        2,
	aontu.SubsumeError:     3,
}

var breakingVerdict = map[string]string{
	aontu.SubsumeYes:       "compatible",
	aontu.SubsumeNo:        "breaking",
	aontu.SubsumeUndecided: "undecided",
	aontu.SubsumeError:     "error",
}

func renderBreakingText(report aontu.SubsumeReport) string {
	head := "verdict: " + breakingVerdict[report.Verdict]
	if 0 == len(report.Findings) {
		return head
	}
	out := []string{head, ""}
	for _, f := range report.Findings {
		out = append(out, renderFinding(f))
	}
	return strings.Join(out, "\n")
}

func renderBreakingJSON(report aontu.SubsumeReport, mode string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(subsumeReportJSON{
		Aontu:    subsumeProducerJSON{Mode: mode, Verb: "breaking", Version: aontu.VERSION},
		Findings: report.Findings,
		Verdict:  breakingVerdict[report.Verdict],
	})
	return strings.TrimSuffix(buf.String(), "\n")
}

// One direction of one against-comparison: which source is the general
// side, and the label its sites carry.
type breakingCheck struct {
	generalSrc, generalURL, generalPath    string
	specificSrc, specificURL, specificPath string
}

func runBreaking(argv []string, stdout, stderr io.Writer) int {
	args, errText := parseBreakingArgs(argv)
	if "" != errText {
		io.WriteString(stderr, errText+"\n")
		return 2
	}

	if args.help {
		io.WriteString(stdout, helpText)
		return 0
	}

	newSrcRaw, err := os.ReadFile(args.file)
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+args.file+": "+err.Error()+"\n")
		return 2
	}
	newSrc := string(newSrcRaw)

	// The declared mode: --mode overrides the document's own policy;
	// neither means backward, the index's framing (v1-valid documents
	// stay valid).
	mode := args.mode
	if "" == mode {
		mode = aontu.PolicyCompat(newSrc, args.file)
	}
	if "" == mode {
		mode = "backward"
	}

	if "none" == mode {
		// The document declares no compatibility promise: nothing to
		// check.
		report := aontu.SubsumeReport{
			Verdict: aontu.SubsumeYes, Findings: []aontu.VetFinding{}}
		text := renderBreakingText(report)
		if "json" == args.format {
			text = renderBreakingJSON(report, mode)
		}
		io.WriteString(stdout, text+"\n")
		return 0
	}

	worst := aontu.SubsumeYes
	findings := []aontu.VetFinding{}

	for _, spec := range args.against {
		oldSrc, ok := againstSource(spec, args.file, stderr)
		if !ok {
			return 2
		}

		// A git#rev source has no directory of its own; its relative
		// loads resolve as the working file's do.
		oldPath := spec
		if strings.HasPrefix(spec, "git#") {
			oldPath = args.file
		}

		// backward: the NEW document is the general side — every old
		// instance must still be admitted. forward: the old one is.
		var checks []breakingCheck
		if "backward" == mode || "full" == mode {
			checks = append(checks, breakingCheck{
				generalSrc: newSrc, generalURL: args.file, generalPath: args.file,
				specificSrc: oldSrc, specificURL: spec, specificPath: oldPath,
			})
		}
		if "forward" == mode || "full" == mode {
			checks = append(checks, breakingCheck{
				generalSrc: oldSrc, generalURL: spec, generalPath: oldPath,
				specificSrc: newSrc, specificURL: args.file, specificPath: args.file,
			})
		}

		for _, check := range checks {
			report := aontu.Subsume(check.generalSrc, check.specificSrc,
				&aontu.SubsumeOptions{
					GeneralURL:   check.generalURL,
					SpecificURL:  check.specificURL,
					GeneralPath:  check.generalPath,
					SpecificPath: check.specificPath,
				})

			// The deprecated-removal downgrade: a finding about a value
			// the OLD version already deprecated becomes a warning, and
			// warnings do not move the verdict. Deprecate-then-remove is
			// the supported rename path (the design's own sequencing).
			verdict := report.Verdict
			if args.allowDeprRemoval {
				live := 0
				a := aontu.New()
				for i := range report.Findings {
					f := &report.Findings[i]
					if "error" == f.Severity &&
						a.DeprecatedAt(oldSrc, f.Path) {
						f.Severity = "warning"
					}
					if "error" == f.Severity {
						live++
					}
				}
				if aontu.SubsumeNo == verdict && 0 == live {
					verdict = aontu.SubsumeYes
				}
			}

			if breakingRank[worst] < breakingRank[verdict] {
				worst = verdict
			}
			findings = append(findings, report.Findings...)
		}
	}

	report := aontu.SubsumeReport{Verdict: worst, Findings: findings}
	text := renderBreakingText(report)
	if "json" == args.format {
		text = renderBreakingJSON(report, mode)
	}
	io.WriteString(stdout, text+"\n")

	if aontu.SubsumeUndecided == worst && args.allowUndecided {
		return 0
	}
	return subsumeExit[worst]
}
