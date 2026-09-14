/* Copyright (c) 2025 Richard Rodger, MIT License */


package main

import (
	"encoding/json"
	"io"
	"os"
	"strconv"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const templateHelp = "aontu template [--resugar] [--check] [--marker <token>] [--profile <file>] <file> (try --help)"

func runTemplate(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var files, profileFiles []string
	resugar, check := false, false
	marker := ""

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--resugar" == arg:
			resugar = true
		case "--check" == arg:
			check = true
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
				"aontu: unknown template option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr, "aontu: template needs one file\n"+templateHelp+"\n")
		return 2
	}
	if resugar && check {
		io.WriteString(stderr,
			"aontu: template takes one of --resugar or --check\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr,
			"aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	profiles, code := loadProfiles(profileFiles, trust, stderr)
	if 0 != code {
		return code
	}

	mark := marker
	if "" == mark {
		mark = templateMarker(profiles, files[0])
	}
	text := string(src)

	if check {
		back := aontu.ResugarTemplate(aontu.DesugarTemplate(text, mark), mark)
		if back == text {
			return 0
		}
		want := strings.Split(back, "\n")
		have := strings.Split(text, "\n")
		n := 0
		for n < len(want) && n < len(have) && want[n] == have[n] {
			n++
		}
		io.WriteString(stderr,
			"aontu: "+files[0]+":"+strconv.Itoa(n+1)+
				" is not what the round trip answers\n"+
				"  have: "+templateJSON(have[n])+"\n"+
				"  want: "+templateJSON(want[n])+"\n")
		return 1
	}

	if resugar {
		io.WriteString(stdout, aontu.ResugarTemplate(text, mark))
	} else {
		io.WriteString(stdout, aontu.DesugarTemplate(text, mark))
	}
	return 0
}

// templateJSON quotes one line of a report.
func templateJSON(line string) string {
	out, _ := json.Marshal(line)
	return string(out)
}
