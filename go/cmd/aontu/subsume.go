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
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	aontu "github.com/rjrodger/aontu/go"
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
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}

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
			Trust:        verbTrust(trust, entryRootOfFile(args.general)),
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
	help    bool
	file    string
	against []string
	mode    string
	// at: compare a SUBTREE of both versions. The gate's own
	// sub-question, and the one a real repository needs -- a document's
	// top level carries the module's version string and its policy
	// block, which are supposed to change between releases and which
	// make the whole-document comparison answer about them rather than
	// about the contract (use-cases/REVIEW.md finding D). `subsume` has
	// taken it since G3; `breaking` did not, so the only way to gate a
	// subtree was to split the file.
	at               string
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
		case "--at" == arg:
			i++
			if len(argv) <= i {
				return nil, "aontu: --at needs a path"
			}
			args.at = argv[i]
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

// oldVersion is one resolved --against spelling: the old document's
// text, the path its own relative includes must resolve from, and (for
// a git spelling) the temporary tree to remove when the run is done.
type oldVersion struct {
	src  string
	path string
	temp string
}

// includable reports whether a tree path is a source the include
// resolver can load. A git#<rev> spelling materialises these and
// nothing else: an include names an Aontu document (.aon/.aontu, the
// two extensions @"foo" tries) or a JSON one, so the rest of a
// revision's tree cannot be part of any include closure and copying it
// would be pure cost.
func includable(p string) bool {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".aon", ".aontu", ".jsonic", ".json":
		return true
	}
	return false
}

// gitOut runs git in dir and returns its stdout, or the first line of
// its stderr as the error detail.
func gitOut(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	var out, errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut
	if err := cmd.Run(); nil != err {
		detail := strings.TrimSpace(errOut.String())
		if "" == detail {
			detail = err.Error()
		}
		return "", errors.New(strings.SplitN(detail, "\n", 2)[0])
	}
	return out.String(), nil
}

// resolveAgainst resolves one --against spelling to an old version.
//
// A `git#<rev>` spelling is the old version of the WHOLE TREE, not of
// the entry file alone. It used to be `git show <rev>:./<file>`, whose
// text was then evaluated with the WORKING file as its path -- so every
// @"..." include in the old document resolved against the working
// tree, and the "old" side was old entry text meeting new includes. A
// breaking change inside an included file therefore compared against
// itself and answered compatible: the documented CI gate silently
// un-gated every non-entry file of the multi-file layout real models
// use (use-cases/BUGS.md §26). The old tree's includable sources are
// copied into a temporary directory and the old document is evaluated
// from THERE.
//
// Sources outside the revision -- package includes under node_modules,
// the bundled std/system -- still resolve as they do today: they are
// not in the tree, and their versions travel with the lockfile rather
// than with this comparison.
func resolveAgainst(spec, file string, stderr io.Writer) (oldVersion, bool) {
	if !strings.HasPrefix(spec, "git#") {
		src, err := os.ReadFile(spec)
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read "+spec+": "+err.Error()+"\n")
			return oldVersion{}, false
		}
		return oldVersion{src: string(src), path: spec}, true
	}

	rev := spec[len("git#"):]
	if "" == rev {
		io.WriteString(stderr, "aontu: --against git# needs a revision\n")
		return oldVersion{}, false
	}

	abs, err := filepath.Abs(file)
	if nil != err { //coverage:ignore Abs fails only on an unreadable cwd
		io.WriteString(stderr, "aontu: cannot resolve "+spec+": "+err.Error()+"\n")
		return oldVersion{}, false
	}
	dir := filepath.Dir(abs)

	// The temporary tree is made BEFORE the first git call, so every
	// failure below has exactly one cleanup path rather than a branch
	// that only some failures take.
	temp, err := os.MkdirTemp("", "aontu-against-")
	if nil != err { //coverage:ignore MkdirTemp fails only on an unwritable tmp
		io.WriteString(stderr, "aontu: cannot resolve "+spec+": "+err.Error()+"\n")
		return oldVersion{}, false
	}
	fail := func(detail string) (oldVersion, bool) {
		os.RemoveAll(temp)
		io.WriteString(stderr, "aontu: cannot resolve "+spec+": "+detail+"\n")
		return oldVersion{}, false
	}

	// THE REPO-RELATIVE PATH COMES FROM GIT, not from path arithmetic.
	// Relativising --show-toplevel against the resolved file put two
	// DIFFERENT COORDINATE SYSTEMS on either side of the subtraction:
	// git prints the real path, while the caller's is whatever they
	// typed. On macOS a temp file under /var is /private/var to git,
	// and on Windows a TMP short name (RUNNER~1) is the long form to
	// git -- so the subtraction gave a `../..` climb, the entry was
	// "not in that revision", and the documented CI spelling failed on
	// both platforms while passing on Linux (this PR's own CI).
	// --show-prefix is the same question asked in git's coordinates:
	// the repo-relative directory of the cwd, already slash-separated
	// and already normalised.
	prefixOut, err := gitOut(dir, "rev-parse", "--show-prefix")
	if nil != err {
		return fail(err.Error())
	}
	entryRel := strings.TrimSpace(prefixOut) + filepath.Base(file)

	topOut, err := gitOut(dir, "rev-parse", "--show-toplevel")
	if nil != err { //coverage:ignore --show-prefix above fails first
		return fail(err.Error())
	}
	top := strings.TrimSpace(topOut)

	// -z so a path with a newline or a quote cannot be mistaken for two
	// paths (git otherwise quotes such names).
	listOut, err := gitOut(top, "ls-tree", "-r", "-z", "--name-only", rev)
	if nil != err {
		return fail(err.Error())
	}
	listed := []string{}
	for _, p := range strings.Split(listOut, "\x00") {
		if "" != p {
			listed = append(listed, p)
		}
	}
	found := false
	for _, p := range listed {
		if p == entryRel {
			found = true
			break
		}
	}
	if !found {
		return fail(entryRel + " is not in that revision")
	}

	for _, rel := range listed {
		if !includable(rel) {
			continue
		}
		body, err := gitOut(top, "show", rev+":"+rel)
		if nil != err { //coverage:ignore a path git just listed always shows
			return fail(err.Error())
		}
		dest := filepath.Join(temp, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); nil != err { //coverage:ignore MkdirAll under a fresh temp dir
			return fail(err.Error())
		}
		if err := os.WriteFile(dest, []byte(body), 0o644); nil != err { //coverage:ignore WriteFile under a fresh temp dir
			return fail(err.Error())
		}
	}

	entry := filepath.Join(temp, filepath.FromSlash(entryRel))
	src, err := os.ReadFile(entry)
	if nil != err { //coverage:ignore the entry was just written from the tree
		return fail(err.Error())
	}
	return oldVersion{src: string(src), path: entry, temp: temp}, true
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
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}

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
	capability := verbTrust(trust, entryRootOfFile(args.file))

	mode := args.mode
	if "" == mode {
		// The declaration is read by EVALUATING the document, so this
		// leg runs the include resolver too and has to run it under the
		// verb's capability -- a `breaking --trust none` that read its
		// own mode through an unconfined resolver would confine the
		// comparison and not the question (use-cases/REVIEW.md finding
		// G).
		mode = aontu.PolicyCompatTrust(newSrc, args.file, capability)
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

	// Temporary trees materialised for git#<rev> spellings, removed
	// once every check that reads them has run.
	temps := []string{}
	defer func() {
		for _, t := range temps {
			os.RemoveAll(t)
		}
	}()

	for _, spec := range args.against {
		old, ok := resolveAgainst(spec, args.file, stderr)
		if !ok {
			return 2
		}
		oldSrc := old.src
		if "" != old.temp {
			temps = append(temps, old.temp)
		}

		// The old side's relative loads resolve from ITS own tree --
		// the materialised revision for a git spelling, the named
		// file's directory otherwise -- so an included file's change is
		// part of the comparison rather than invisible to it.
		oldPath := old.path

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
					Trust:        capability,
					At:           args.at,
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
