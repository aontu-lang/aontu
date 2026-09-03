/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE CANON-HASH (G6 phase 1, the Go side of ts/src/cli.ts): the pin an
// agent, a lockfile or a registry stores for "this module, this
// meaning". The hash covers the module evaluated STANDALONE — its own
// include closure resolved and unified at its own root, before any
// consumer context — which is what makes the pin transitive: an edit
// two includes deep changes the unified root, hence the hash.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const hashHelp = "aontu hash <file> (try --help)"

func runHash(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var files []string
	form := false
	format := "text"

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--form" == arg:
			form = true
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown hash option "+arg+" (try --help)\n")
			return 2
		default:
			files = append(files, arg)
		}
	}

	if 1 != len(files) {
		io.WriteString(stderr, "aontu: hash needs one file\n"+hashHelp+"\n")
		return 2
	}

	src, err := os.ReadFile(files[0])
	if nil != err {
		io.WriteString(stderr, "aontu: cannot read "+files[0]+": "+err.Error()+"\n")
		return 2
	}

	// The file's own directory is the include base, as every verb
	// resolves a named file (vet's aontuForPath rule).
	v, uerr := aontuForFileTrust(files[0], trust).Unify(string(src))
	if nil != uerr || nil == v || v.Nil() {
		// A document that does not stand up on its own has no meaning
		// to pin, and a hash of a broken evaluation would be a pin that
		// silently agrees with every other broken evaluation.
		// WHY it does not stand up, not just that it does not: the same
		// diagnosis `aontu <file>` prints (the review's finding F).
		io.WriteString(stderr,
			"aontu: "+files[0]+" does not evaluate on its own; nothing to hash\n"+
				renderFinding(aontu.EvalFailure(uerr))+"\n")
		return 4
	}

	text := aontu.CanonHash(v)
	if form {
		text = aontu.Hcanon(v)
	}
	if "json" == format {
		text = renderHashJSON(v)
	}
	io.WriteString(stdout, text+"\n")
	return 0
}

// The machine-readable form. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type hashReportJSON struct {
	Aontu subsumeProducerJSON `json:"aontu"`
	Form  string              `json:"form"`
	Hash  string              `json:"hash"`
}

func renderHashJSON(v aontu.Val) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(hashReportJSON{
		Aontu: subsumeProducerJSON{Verb: "hash", Version: aontu.VERSION},
		Form:  aontu.Hcanon(v),
		Hash:  aontu.CanonHash(v),
	})
	return strings.TrimSuffix(buf.String(), "\n")
}
