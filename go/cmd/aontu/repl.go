/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE REPL AS AN INSPECTION TOOL (G7 phase 7, the Go side of
// ts/src/cli.ts): `:load` holds a document, and `:get`, `:keys` and
// `:why` ask the query and provenance surfaces about it, so the
// session is a place to INTERROGATE a definition rather than only to
// evaluate snippets.
//
// The command handler is a PURE FUNCTION of (state, line): a read
// loop is untestable, and every answer this REPL gives has to be as
// checkable as the CLI's. File reading is injected for the same
// reason.

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

type replState struct {
	// Mode is how a value renders: the `:canon` / `:json` toggle.
	Mode string
	// JSONL is the SESSION protocol: one JSON line per answer, for a
	// harness driving the session.
	JSONL bool
	Name  string
	Src   string
	// Loaded is false until a `:load` succeeds — an empty document is
	// still a document.
	Loaded bool
	// Trust is the session's include capability. The REPL used to ACCEPT
	// --trust and drop it: the --jsonl session mode, built to be driven
	// by a harness, evaluated unconfined however it was invoked
	// (use-cases/REVIEW.md finding G). The zero value is the staged
	// default, which is today's behaviour.
	Trust trustArg
}

// replSnippet is the engine a bare (unnamed) snippet evaluates in. A
// snippet has no file of its own, so a bare `root` spelling confines it
// to the working directory -- the same root the bare command uses for
// stdin.
func replSnippet(state replState) *aontu.Aontu {
	a := aontu.New()
	cwd, err := os.Getwd()
	if err != nil { //coverage:ignore Getwd fails only on a deleted cwd
		cwd = "."
	}
	a.TextExt = state.Trust.textExt
	if capability := verbTrust(state.Trust, cwd); nil != capability {
		a.Trust = capability
	}
	return a
}

type replAnswer struct {
	Close bool
	Out   string
	State replState
}

type replLineJSON struct {
	OK  bool   `json:"ok"`
	Out string `json:"out"`
}

func replEncode(ok bool, out string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(replLineJSON{OK: ok, Out: out})
	return strings.TrimSuffix(buf.String(), "\n")
}

// replCommand answers one line. Mirrors replCommand in ts/src/cli.ts.
func replCommand(
	state replState, line string, read func(string) (string, error),
) replAnswer {
	s := strings.TrimSpace(line)

	answer := func(out string, next replState) replAnswer {
		if next.JSONL {
			out = replEncode(true, out)
		}
		return replAnswer{Close: false, Out: out, State: next}
	}
	refuse := func(out string) replAnswer {
		if state.JSONL {
			out = replEncode(false, out)
		}
		return replAnswer{Close: false, Out: out, State: state}
	}

	if "" == s {
		return replAnswer{Close: false, Out: "", State: state}
	}

	if !strings.HasPrefix(s, ":") {
		text, err := render(replSnippet(state), s, state.Mode)
		if nil != err {
			return refuse(err.Error())
		}
		return answer(text, state)
	}

	cmd, arg := s, ""
	if sp := strings.Index(s, " "); 0 <= sp {
		cmd, arg = s[:sp], strings.TrimSpace(s[sp+1:])
	}

	switch cmd {
	case ":help":
		return answer(strings.TrimSuffix(helpText, "\n"), state)

	case ":canon":
		next := state
		next.Mode = "canon"
		return answer("canon output", next)

	case ":json":
		next := state
		next.Mode = "json"
		return answer("json output", next)

	case ":quit", ":exit":
		return replAnswer{Close: true, Out: "", State: state}

	case ":load":
		if "" == arg {
			return refuse(":load needs a file")
		}
		src, err := read(arg)
		if nil != err {
			return refuse("cannot read " + arg + ": " + err.Error())
		}
		// Evaluated ONCE, and what is held is the source: parsed trees
		// are single-use, so every later question re-evaluates from
		// the text.
		text, rerr := render(aontuForFileTrust(arg, state.Trust), src, state.Mode)
		if nil != rerr {
			return refuse(rerr.Error())
		}
		next := state
		next.Name, next.Src, next.Loaded = arg, src, true
		return answer("loaded: "+arg+"\n"+text, next)

	case ":get", ":keys", ":why":
		if !state.Loaded {
			return refuse("nothing loaded (try :load <file>)")
		}
		path := arg
		if "" == path {
			path = "$"
		}
		a := aontuForFileTrust(state.Name, state.Trust)
		if ":why" == cmd {
			report := a.Why(state.Src, path)
			if !report.OK {
				return refuse(replFindings(report.Findings))
			}
			return answer(renderWhyText(*report.Record), state)
		}
		view := aontu.QueryJSON
		if ":keys" == cmd {
			view = aontu.QueryKeys
		} else if "canon" == state.Mode {
			view = aontu.QueryCanon
		}
		report := a.Get(state.Src, path, &aontu.QueryOptions{View: view})
		if !report.OK {
			return refuse(replFindings(report.Findings))
		}
		return answer(report.Out, state)

	default:
		return refuse("unknown command: " + s + " (try :help)")
	}
}

func replFindings(findings []aontu.VetFinding) string {
	lines := make([]string, 0, len(findings))
	for _, f := range findings {
		lines = append(lines, renderFinding(f))
	}
	return strings.Join(lines, "\n")
}
