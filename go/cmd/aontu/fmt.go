/* Copyright (c) 2026 Richard Rodger, MIT License */


package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const fmtHelp = "aontu fmt [-w|-l|--check|-d|--lint] [--marker <token>] [--profile <file>] <file>... (try --help)"

type fmtFlags struct {
	write, list, check, diff, lint, strict bool
}

// The write, a variable so its failure can be exercised: a permission
// that would stop it is one the user running the suite may not be
// subject to.
var fmtWriteFile = os.WriteFile

func runFmt(argv []string, stdin io.Reader, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var files, profileFiles []string
	marker := ""
	marked := false
	flags := fmtFlags{}

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
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
		case "--lint" == arg:
			flags.lint = true
		case "--strict" == arg:
			flags.lint = true
			flags.strict = true
		case "--marker" == arg:
			// THE MARKER SAYS THE FILE IS A GENERATOR, whatever its
			// extension: render and template take the same option for
			// the same reason, a language the table has never seen.
			i++
			if i >= len(argv) {
				io.WriteString(stderr, "aontu: --marker needs a token\n")
				return 2
			}
			marker = argv[i]
			marked = true
		case "--profile" == arg:
			i++
			if i >= len(argv) {
				io.WriteString(stderr, "aontu: --profile needs a file\n")
				return 2
			}
			profileFiles = append(profileFiles, argv[i])
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
		return fmtOne("<stdin>", string(src), flags, marker, stdout, stderr)
	}

	// Several files onto standard output would be one stream nobody can
	// split again (the note's X-6): the verb refuses unless an option
	// says what to do with each.
	if 1 < len(files) && !fmtQuiet(flags) {
		io.WriteString(stderr, fmt.Sprintf(
			"aontu: fmt prints one file; with %d, say --write, --list, --check, --diff or --lint\n%s\n",
			len(files), fmtHelp))
		return 2
	}

	profiles, code := loadProfiles(profileFiles, trust, stderr)
	if 0 != code {
		return code
	}

	worst := 0
	for _, file := range files {
		src, err := os.ReadFile(file)
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read "+file+": "+err.Error()+"\n")
			return 2
		}
		declared, said := marker, marked
		if "" == declared {
			if m := aontu.MarkerFromProfiles(profiles, file); "" != m {
				declared, said = m, true
			}
		}
		mark, ok := fmtMarker(file, string(src), declared, said)
		if !ok {
			io.WriteString(stderr, "aontu: "+file+
				" is not aontu source (.aon, .aontu) and carries no "+
				aontu.MarkerFor(file)+" marker line, so there is no aontu in"+
				" it to format; --marker names the marker for a language"+
				" the table does not know, and --profile reads one that"+
				" declares it\n")
			return 2
		}
		if code := fmtOne(file, string(src), flags, mark, stdout, stderr); worst < code {
			worst = code
		}
	}
	return worst
}

func fmtMarker(file, src, marker string, marked bool) (string, bool) {
	if marked {
		return marker, true
	}
	if strings.HasSuffix(file, ".aon") || strings.HasSuffix(file, ".aontu") {
		return "", true
	}
	mark := aontu.MarkerFor(file)
	for _, out := range aontu.TemplateOutputs(src, mark) {
		if !out {
			return mark, true
		}
	}
	return "", false
}

// An option that says what to do with a file, in place of printing
// it: what to do when its form would change, or the lint.
func fmtQuiet(flags fmtFlags) bool {
	return flags.write || flags.list || flags.check || flags.diff || flags.lint
}

func fmtOne(name, src string, flags fmtFlags, marker string, stdout, stderr io.Writer) int {
	a := aontu.New()
	a.File = name
	report := a.FormatWith(src, aontu.FormatOptions{Lint: flags.lint, Template: marker})
	if "error" == report.Verdict {
		lines := make([]string, 0, len(report.Errors))
		for _, f := range report.Errors {
			lines = append(lines, renderFinding(f))
		}
		io.WriteString(stderr, "aontu: "+name+" was not formatted\n"+strings.Join(lines, "\n")+"\n")
		return 4
	}
	for _, f := range report.Findings {
		io.WriteString(stderr, fmt.Sprintf("%s:%d:%d: %s: %s\n", name, f.Line, f.Col, f.Rule, f.Message))
	}
	strict := 0
	if flags.strict && 0 < len(report.Findings) {
		strict = 1
	}
	if !fmtQuiet(flags) {
		io.WriteString(stdout, report.Text)
		return 0
	}
	if !report.Changed {
		return strict
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
	return strict
}
