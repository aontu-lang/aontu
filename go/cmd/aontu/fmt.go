/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE SOURCE FORMATTER (docs/design/FMT.0.md P1, the Go side of
// ts/src/cli.ts): one agreed form, in the tradition of gofmt. The verb
// prints, lists, checks, diffs or rewrites; the form itself is the
// library's (format.go), and the two ports agree on it row by row in
// test/spec/fmt.tsv.

package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const fmtHelp = "aontu fmt [-w|-l|--check|-d] <file>... (try --help)"

type fmtFlags struct {
	write, list, check, diff bool
}

// The write, a variable so its failure can be exercised: a permission
// that would stop it is one the user running the suite may not be
// subject to.
var fmtWriteFile = os.WriteFile

func runFmt(argv []string, stdin io.Reader, stdout, stderr io.Writer) int {
	var files []string
	flags := fmtFlags{}

	for _, arg := range argv {
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "-w" == arg, "--write" == arg:
			flags.write = true
		case "-l" == arg, "--list" == arg:
			flags.list = true
		case "--check" == arg:
			flags.check = true
		case "-d" == arg, "--diff" == arg:
			flags.diff = true
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown fmt option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 0 == len(files) {
		// Standard input: formatted onto standard output, or listed,
		// checked and diffed under the name <stdin>. It cannot be
		// written back.
		if flags.write {
			io.WriteString(stderr, "aontu: --write needs a file\n"+fmtHelp+"\n")
			return 2
		}
		src, err := io.ReadAll(stdin)
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read standard input: "+err.Error()+"\n")
			return 2
		}
		return fmtOne("<stdin>", string(src), flags, stdout, stderr)
	}

	// Several files onto standard output would be one stream nobody can
	// split again (the note's X-6): the verb refuses unless an option
	// says what to do with each.
	if 1 < len(files) && !fmtQuiet(flags) {
		io.WriteString(stderr, fmt.Sprintf(
			"aontu: fmt prints one file; with %d, say --write, --list, --check or --diff\n%s\n",
			len(files), fmtHelp))
		return 2
	}

	worst := 0
	for _, file := range files {
		src, err := os.ReadFile(file)
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read "+file+": "+err.Error()+"\n")
			return 2
		}
		if code := fmtOne(file, string(src), flags, stdout, stderr); worst < code {
			worst = code
		}
	}
	return worst
}

// An option that says what to do with a file that would change, in
// place of printing it.
func fmtQuiet(flags fmtFlags) bool {
	return flags.write || flags.list || flags.check || flags.diff
}

// One document: 0 printed, clean or done; 1 a --check that would
// change; 2 a file that cannot be written; 4 a document that does not
// format, with the finding that says why.
func fmtOne(name, src string, flags fmtFlags, stdout, stderr io.Writer) int {
	a := aontu.New()
	a.File = name
	report := a.Format(src)
	if "error" == report.Verdict {
		lines := make([]string, 0, len(report.Errors))
		for _, f := range report.Errors {
			lines = append(lines, renderFinding(f))
		}
		io.WriteString(stderr, "aontu: "+name+" was not formatted\n"+strings.Join(lines, "\n")+"\n")
		return 4
	}
	if !fmtQuiet(flags) {
		io.WriteString(stdout, report.Text)
		return 0
	}
	if !report.Changed {
		return 0
	}
	if flags.list || flags.check {
		io.WriteString(stdout, name+"\n")
	}
	if flags.diff {
		io.WriteString(stdout, aontu.UnifiedDiff(name, src, report.Text))
	}
	if flags.write {
		if err := fmtWriteFile(name, []byte(report.Text), 0o600); nil != err {
			io.WriteString(stderr, "aontu: cannot write "+name+": "+err.Error()+"\n")
			return 2
		}
	}
	if flags.check {
		return 1
	}
	return 0
}
