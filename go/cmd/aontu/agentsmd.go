/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE GENERATED AGENTS.md STANZA (G7 phase 6, the Go side of
// ts/src/cli.ts): the prose entrypoint, derived from the definition,
// so it cannot drift from the formal source it points at.

package main

import (
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const agentsMdHelp = "aontu agentsmd <file> (try --help)"

func runAgentsMd(argv []string, stdout, stderr io.Writer) int {
	var files []string
	write := ""
	sawWrite := false

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--write" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --write needs a file\n")
				return 2
			}
			write = argv[i]
			sawWrite = true
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown agentsmd option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr,
			"aontu: agentsmd needs one file\n"+agentsMdHelp+"\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	report := aontuForFile(files[0]).AgentsMd(
		string(src), &aontu.AgentsMdOptions{Name: files[0]})
	if !report.OK {
		lines := make([]string, 0, len(report.Findings))
		for _, f := range report.Findings {
			lines = append(lines, renderFinding(f))
		}
		io.WriteString(stderr, strings.Join(lines, "\n")+"\n")
		return 4
	}

	if !sawWrite {
		io.WriteString(stdout, report.Stanza)
		return 0
	}

	// An ABSENT target is an empty one: `--write AGENTS.md` should not
	// require the author to have made the file first.
	existing := ""
	if raw, rerr := os.ReadFile(write); nil == rerr {
		existing = string(raw)
	} else if !os.IsNotExist(rerr) {
		io.WriteString(stderr, "aontu: cannot read "+write+": "+rerr.Error()+"\n")
		return 2
	}

	if werr := os.WriteFile(write,
		[]byte(aontu.AgentsMdSplice(existing, report.Stanza)), 0o600); nil != werr {
		io.WriteString(stderr, "aontu: cannot write "+write+": "+werr.Error()+"\n")
		return 2
	}
	io.WriteString(stdout, "wrote: "+write+"\n")
	return 0
}
