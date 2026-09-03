/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE VET VERB (G2 phase 4, the Go side of ts/src/cli.ts).
//
// Exit codes are VERDICT CLASSES, not a pass/fail bit: an agent loop
// branches on "the data contradicts the truth" (1) differently from
// "the data has not supplied everything the truth requires" (3), and
// differently again from "the schema itself is broken" (4), which is
// never the data's fault. 2 stays what it already was for this CLI --
// the caller got the invocation wrong -- which is why an unreadable
// file is a 2 rather than a 4.

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	aontu "github.com/aontu-lang/aontu/go"
)

const vetHelp = "aontu vet <schema> <data> [more-data...] (try --help)"

// maxErrorsRe is the shared --max-errors grammar (see parseVetArgs).
var maxErrorsRe = regexp.MustCompile(`^[0-9]{1,9}$`)

var vetExit = map[string]int{
	aontu.VetValid:      0,
	aontu.VetInvalid:    1,
	aontu.VetIncomplete: 3,
	aontu.VetError:      4,
}

// The worst verdict wins across data files: a run that is invalid
// anywhere is invalid, and a schema that cannot stand up makes every
// file's verdict moot.
var vetRank = map[string]int{
	aontu.VetValid:      0,
	aontu.VetIncomplete: 1,
	aontu.VetInvalid:    2,
	aontu.VetError:      3,
}

type vetArgs struct {
	help      bool
	schema    string
	data      []string
	format    string
	at        string
	closed    bool
	partial   bool
	maxErrors int
	watch     bool
}

// parseVetArgs reads the verb's argument tail. It returns the error
// TEXT rather than an error, so the caller owns the exit code.
func parseVetArgs(argv []string) (*vetArgs, string) {
	args := &vetArgs{format: "text"}
	var files []string

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		// -h/--help before anything else, INCLUDING the file count: the
		// usage errors below all end with "(try --help)", and a verb
		// that then refused --help as an unknown option was sending the
		// reader in a circle.
		case "-h" == arg, "--help" == arg:
			return &vetArgs{help: true, format: args.format}, ""
		case "--at" == arg:
			i++
			if len(argv) <= i {
				return nil, "aontu: --at needs a path"
			}
			args.at = argv[i]
		case "--format" == arg:
			i++
			if len(argv) <= i ||
				("text" != argv[i] && "json" != argv[i] && "sarif" != argv[i]) {
				return nil, "aontu: --format needs text, json or sarif"
			}
			args.format = argv[i]
		case "--max-errors" == arg:
			// ONE GRAMMAR, spelled the same way in both ports: decimal
			// digits, one to nine of them, at least 1. Atoi alone
			// accepted a leading sign and SATURATED on overflow (a
			// twenty-digit argument silently became MaxInt64), while
			// the canonical port's Number() accepted `1.0`, `1e2` and
			// `0x10` -- so the same documented invocation meant
			// different things in the two shipped commands.
			i++
			raw := ""
			if len(argv) > i {
				raw = argv[i]
			}
			if !maxErrorsRe.MatchString(raw) {
				return nil, "aontu: --max-errors needs a positive whole number"
			}
			// Atoi cannot fail on one to nine digits, so its error is
			// dropped; zero is the one value the grammar still admits
			// and the check below refuses.
			n, _ := strconv.Atoi(raw)
			if n < 1 {
				return nil, "aontu: --max-errors needs a positive whole number"
			}
			args.maxErrors = n
		case "--closed" == arg:
			args.closed = true
		case "--partial" == arg:
			args.partial = true
		case "--watch" == arg:
			args.watch = true
		case strings.HasPrefix(arg, "-"):
			return nil, "aontu: unknown vet option " + arg + " (try --help)"
		default:
			files = append(files, arg)
		}
	}

	if len(files) < 2 {
		return nil, "aontu: vet needs a schema and at least one data file\n" + vetHelp
	}

	args.schema = files[0]
	args.data = files[1:]
	return args, ""
}

// renderFinding writes one line per site, so a finding reads as "what
// is wrong, where the data says it, and where the truth says
// otherwise". The data site comes first because it is the one to edit.
func renderFinding(f aontu.VetFinding) string {
	out := []string{f.Path + ": " + f.Code + " [" + f.Class + "]"}

	if "" != f.Message {
		out = append(out, "  "+f.Message)
	}
	if nil != f.Note {
		out = append(out, "  note: "+*f.Note)
	}
	if nil != f.Expected {
		out = append(out, "  expected: "+*f.Expected)
	}
	if nil != f.Actual {
		out = append(out, "  actual:   "+*f.Actual)
	}
	for _, s := range f.Sites {
		// Every site carries the canon of the value it stands for: that
		// is what makes the two sides of a conflict readable side by
		// side. A site with no file name renders as none.
		out = append(out, fmt.Sprintf("  %s: %s:%d:%d (%s)",
			s.Role, s.File, s.Row, s.Col, s.Value))
	}

	return strings.Join(out, "\n")
}

func renderVetText(report aontu.VetReport) string {
	head := "verdict: " + report.Verdict
	if report.Truncated {
		head += " (findings truncated)"
	}
	if 0 == len(report.Findings) {
		return head
	}
	out := []string{head, ""}
	for _, f := range report.Findings {
		out = append(out, renderFinding(f))
	}
	return strings.Join(out, "\n")
}

// vetReportJSON is the machine-readable form. `aontu` names the
// producer, so a report read from a file or a pipe says which version
// and which verb made it without the consumer having to know.
//
// The field order is LEXICOGRAPHIC: the canonical emitter sorts object
// keys (exactJSON) and Go's encoder writes declaration order, so the
// two agree only if the declaration is already sorted.
type vetReportJSON struct {
	Aontu     vetProducerJSON    `json:"aontu"`
	Findings  []aontu.VetFinding `json:"findings"`
	Truncated bool               `json:"truncated"`
	Verdict   string             `json:"verdict"`
}

type vetProducerJSON struct {
	Verb    string `json:"verb"`
	Version string `json:"version"`
}

func renderVetJSON(report aontu.VetReport) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	// HTML escaping OFF and two-space indent, the same settings the
	// generated-output path uses (render, main.go): the canonical
	// emitter leaves <, > and & literal, and a report quoting a
	// document's own text would otherwise differ byte for byte.
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	// Encode cannot fail here: every field is a string, a bool, an int
	// or a slice of the same.
	_ = enc.Encode(vetReportJSON{
		Aontu:     vetProducerJSON{Verb: "vet", Version: aontu.VERSION},
		Findings:  report.Findings,
		Truncated: report.Truncated,
		Verdict:   report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}

// How often --watch polls for a change. Polling by mtime+size rather
// than a native watcher: the design asks for "re-run on file mtime
// change", and native watcher semantics differ by platform (rename
// versus change events, editors that replace the inode) in exactly the
// ways that made every build tool fall back to polling. A var, not a
// const, so the waiter's own test can shorten it.
var watchPoll = 100 * time.Millisecond

func watchSignature(files []string) string {
	parts := make([]string, 0, len(files))
	for _, f := range files {
		// A file mid-save can be briefly absent, and "gone" is a state
		// to notice, not an error to die on.
		info, err := os.Stat(f)
		if err != nil {
			parts = append(parts, "gone")
			continue
		}
		parts = append(parts, fmt.Sprintf("%d:%d", info.ModTime().UnixNano(), info.Size()))
	}
	return strings.Join(parts, "\n")
}

// watchWait blocks until any watched file's signature moves off
// `before`. This is the real waiter: it never returns false, so a real
// watch runs until the process is interrupted; tests swap vetWatchWait
// to bound the loop.
//
// The BASELINE is an argument, not a snapshot taken here: the loop
// records it BEFORE each vet run, so a save landing between the run's
// reads and the wait still compares as a change. A waiter that
// snapshotted on entry would adopt that unvetted save as its baseline
// and wait indefinitely on a stale report.
func watchWait(files []string, before string) bool {
	for {
		time.Sleep(watchPoll)
		if watchSignature(files) != before {
			return true
		}
	}
}

// Swapped by tests; the command always runs the real waiter.
var vetWatchWait = watchWait

// watchVet is the watch loop: one report per run, one run per change,
// streaming to stdout. An unreadable file mid-watch reports (exit class
// 2 from vetOnce) and keeps watching — a file being rewritten is
// briefly unreadable, and dying on it would make the mode useless for
// the very moment it exists for.
func watchVet(args *vetArgs, trust trustArg, stdout, stderr io.Writer) int {
	files := append([]string{args.schema}, args.data...)
	before := watchSignature(files)
	code := vetOnce(args, trust, stdout, stderr)
	for vetWatchWait(files, before) {
		before = watchSignature(files)
		code = vetOnce(args, trust, stdout, stderr)
	}
	return code
}

func runVet(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	args, argErr := parseVetArgs(argv)
	if "" != argErr {
		fmt.Fprintln(stderr, argErr)
		return 2
	}

	if args.help {
		fmt.Fprint(stdout, helpText)
		return 0
	}

	if args.watch {
		return watchVet(args, trust, stdout, stderr)
	}

	return vetOnce(args, trust, stdout, stderr)
}

// vetOnce is one complete vet run: read every file, vet each data
// document, print one report, return the exit class. Split from runVet
// so --watch can repeat it — the files are re-read on every run, which
// is the point of watching them.
func vetOnce(args *vetArgs, trust trustArg, stdout, stderr io.Writer) int {
	schemaSrc, err := os.ReadFile(args.schema)
	if err != nil {
		fmt.Fprintf(stderr, "aontu: cannot read %s: %v\n", args.schema, err)
		return 2
	}
	type source struct{ file, src string }
	sources := make([]source, 0, len(args.data))
	for _, file := range args.data {
		src, err := os.ReadFile(file)
		if err != nil {
			fmt.Fprintf(stderr, "aontu: cannot read %s: %v\n", file, err)
			return 2
		}
		sources = append(sources, source{file: file, src: string(src)})
	}

	// Each data file is vetted on its own, because a parsed tree is
	// single-use (docs/reference-api.md) -- and because two data files
	// are two candidates for the same truth, not one merged candidate.
	verdict := aontu.VetValid
	truncated := false
	findings := []aontu.VetFinding{}

	for _, source := range sources {
		report := aontu.Vet(string(schemaSrc), source.src, &aontu.VetOptions{
			Trust:     verbTrust(trust, entryRootOfFile(args.schema)),
			TextExt:   trust.textExt,
			At:        args.at,
			Closed:    args.closed,
			Partial:   args.partial,
			MaxErrors: args.maxErrors,
			SchemaURL: args.schema,
			DataURL:   source.file,
			// The paths as well as the labels: a relative `@"file"`
			// load inside either document resolves from ITS OWN
			// directory, the way `aontu <file>` already resolves one
			// (aontuForFile in main.go). The path is passed AS TYPED,
			// not resolved: it doubles as the label above, and a
			// report that mixed the typed path with an absolute one
			// would name the same file two ways.
			SchemaPath: args.schema,
			DataPath:   source.file,
		})

		if vetRank[verdict] < vetRank[report.Verdict] {
			verdict = report.Verdict
		}
		truncated = truncated || report.Truncated
		findings = append(findings, report.Findings...)

		// A SCHEMA-SIDE FAULT IS THE SAME FAULT FOR EVERY DATA FILE, so
		// it is reported ONCE. `error` means exactly that -- the run
		// could not be set up from the truth's side, never the data's
		// (the exit table in docs/reference-api.md) -- so the report the
		// first file produced is the report every later file would
		// produce, character for character. Concatenating them repeated
		// one broken schema N times and, past the cap, marked the report
		// `truncated` over a single underlying fault. It only became
		// visible once the `error` verdict started carrying findings at
		// all: while the list was empty there was nothing to duplicate.
		// Mirrors the same break in ts/src/cli.ts.
		if aontu.VetError == report.Verdict {
			break
		}
	}

	// The cap is on the REPORT, not on each file. Capping every file's
	// list and then concatenating them let `--max-errors 1` emit one
	// finding PER FILE -- and leave `truncated` false while doing it,
	// because no single file had been cut. The engine still caps each
	// run, so a pathological file cannot flood the aggregate before it
	// gets here; this is the second, honest cut.
	cap := args.maxErrors
	if 0 == cap {
		cap = aontu.VetMaxErrors
	}
	if cap < len(findings) {
		truncated = true
		findings = findings[:cap]
	}

	report := aontu.VetReport{Verdict: verdict, Truncated: truncated, Findings: findings}
	text := renderVetText(report)
	switch args.format {
	case "json":
		text = renderVetJSON(report)
	case "sarif":
		// Rendered by the library (report_sarif.go) so an embedder gets
		// the same bytes the CLI prints.
		text = aontu.SarifReport(report, aontu.VERSION)
	}

	fmt.Fprintln(stdout, text)
	return vetExit[verdict]
}
