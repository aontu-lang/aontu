/* Copyright (c) 2025 Richard Rodger, MIT License */


package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
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
	// G11 phase 5. strictCoverage implies coverage; coverageAt narrows
	// the data side and implies it too.
	coverage       bool
	strictCoverage bool
	coverageAt     string
	exactNumbers   bool
}

// parseVetArgs reads the verb's argument tail. It returns the error
// TEXT rather than an error, so the caller owns the exit code.
func parseVetArgs(argv []string) (*vetArgs, string) {
	args := &vetArgs{format: "text"}
	var files []string

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
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
			i++
			raw := ""
			if len(argv) > i {
				raw = argv[i]
			}
			if !maxErrorsRe.MatchString(raw) {
				return nil, "aontu: --max-errors needs a positive whole number"
			}
			n, _ := strconv.Atoi(raw)
			if n < 1 {
				return nil, "aontu: --max-errors needs a positive whole number"
			}
			args.maxErrors = n
		case "--closed" == arg:
			args.closed = true
		case "--partial" == arg:
			args.partial = true
		case "--exact-numbers" == arg:
			args.exactNumbers = true
		case "--coverage" == arg:
			args.coverage = true
		case "--strict-coverage" == arg:
			// IMPLIES THE ACCOUNTING, because a gate cannot fire on what
			// was never measured. Asking for the strict form and having
			// to remember --coverage beside it is a usage trap with one
			// correct answer, so the flag takes it.
			args.coverage = true
			args.strictCoverage = true
		case "--coverage-at" == arg:
			i++
			if len(argv) <= i {
				return nil, "aontu: --coverage-at needs a path"
			}
			args.coverageAt = argv[i]
			args.coverage = true
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
	out := []string{head}
	if 0 < len(report.Findings) {
		out = append(out, "")
		for _, f := range report.Findings {
			out = append(out, renderFinding(f))
		}
	}
	if nil != report.Coverage {
		out = append(out, "")
		out = append(out, renderVetCoverage(*report.Coverage)...)
	}
	return strings.Join(out, "\n")
}

// coverageListMax is how many coverage paths the TEXT form prints per
// list. The JSON form carries every one: a machine reads the whole
// list, a person reads the first few and the count.
const coverageListMax = 10

// renderVetCoverage is the coverage block (G11 phase 5). VACUOUS FIRST
// and in the imperative, because it is the one line that changes what
// the reader should do: a `valid` verdict above it means nothing.
func renderVetCoverage(c aontu.VetCoverage) []string {
	out := []string{}
	if c.Vacuous {
		out = append(out, "coverage: VACUOUS — no data leaf was constrained"+
			" by the schema; this run checked nothing")
	}
	out = append(out, "coverage: "+strconv.Itoa(c.Checked)+"/"+
		strconv.Itoa(c.Leaves)+" data leaves checked, "+
		strconv.Itoa(c.Declared)+" schema declarations")
	// The lists are the SHALLOWEST paths, so each names a subtree
	// rather than every leaf under it, and both are capped: a report a
	// reader scrolls past is a report nobody reads.
	for _, list := range []struct {
		label string
		paths []string
	}{{"unchecked", c.Unchecked}, {"unused", c.Unused}} {
		if 0 == len(list.paths) {
			continue
		}
		shown := list.paths
		if coverageListMax < len(shown) {
			shown = shown[:coverageListMax]
		}
		for _, p := range shown {
			out = append(out, "  "+list.label+": "+p)
		}
		if len(shown) < len(list.paths) {
			out = append(out, "  "+list.label+": … and "+
				strconv.Itoa(len(list.paths)-len(shown))+" more")
		}
	}
	return out
}

type vetReportJSON struct {
	Aontu vetProducerJSON `json:"aontu"`
	// Absent unless the run asked for it (G11 phase 5), so no existing
	// consumer's report changes shape.
	Coverage  *aontu.VetCoverage `json:"coverage,omitempty"`
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
		Coverage:  report.Coverage,
		Findings:  report.Findings,
		Truncated: report.Truncated,
		Verdict:   report.Verdict,
	})
	return strings.TrimSuffix(buf.String(), "\n")
}

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

	verdict := aontu.VetValid
	truncated := false
	findings := []aontu.VetFinding{}
	var cov *aontu.VetCoverage
	var unusedEvery map[string]bool
	uncheckedAll := map[string]bool{}

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
			SchemaPath: args.schema,
			DataPath:   source.file,
			Coverage:   args.coverage,
			CoverageAt: args.coverageAt,
			ExactNumbers: args.exactNumbers,
		})

		if vetRank[verdict] < vetRank[report.Verdict] {
			verdict = report.Verdict
		}
		truncated = truncated || report.Truncated
		findings = append(findings, report.Findings...)

		if nil != report.Coverage {
			c := *report.Coverage
			if nil == cov {
				got := c
				cov = &got
			} else {
				cov.Checked += c.Checked
				cov.Declared = c.Declared
				cov.Leaves += c.Leaves
			}
			for _, p := range c.Unchecked {
				uncheckedAll[p] = true
			}
			mine := map[string]bool{}
			for _, u := range c.Unused {
				mine[u] = true
			}
			if nil == unusedEvery {
				unusedEvery = mine
			} else {
				for u := range unusedEvery {
					if !mine[u] {
						delete(unusedEvery, u)
					}
				}
			}
		}

		if aontu.VetError == report.Verdict {
			break
		}
	}

	cap := args.maxErrors
	if 0 == cap {
		cap = aontu.VetMaxErrors
	}
	if cap < len(findings) {
		truncated = true
		findings = findings[:cap]
	}

	if nil != cov {
		cov.Unchecked = sortedKeys(uncheckedAll)
		cov.Unused = sortedKeys(unusedEvery)
		cov.Vacuous = 0 == cov.Checked && 0 < cov.Leaves
	}

	report := aontu.VetReport{
		Coverage: cov, Verdict: verdict,
		Truncated: truncated, Findings: findings,
	}
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

	if args.strictCoverage && nil != report.Coverage && report.Coverage.Vacuous {
		fmt.Fprintln(stderr,
			"aontu: no data leaf was constrained by the schema:"+
				" this run checked nothing")
		fmt.Fprintln(stderr,
			"aontu: `aontu help language` — a map template is `&:`,"+
				" and a quoted \"*\" is a key named *")
		return 1
	}
	return vetExit[verdict]
}

// sortedKeys is the set as a sorted slice, so both ports order the
// aggregate coverage lists the same way.
func sortedKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
