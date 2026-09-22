/* Copyright (c) 2025 Richard Rodger, MIT License */


package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const pkgHelp = "aontu pkg tidy|verify|vendor|manifest|refreeze|tree|outdated|serve [dir] | keygen <file> (try --help)"

var pkgSubs = []string{
	"tidy", "verify", "vendor", "manifest", "refreeze", "tree", "outdated",
	"serve", "keygen",
}

// pkgArgs is the option table every package verb parses, so `sync`,
// `get`, `publish` and the `pkg` subcommands read one table.
type pkgArgs struct {
	rest     []string
	format   string
	against  string
	frozen   bool
	yes      bool
	to       string
	key      string
	token    string
	base     []string
	write    string
	upstream []string
	listen   string
	help     bool
}

func parsePkgArgs(argv []string, verb string, stdout, stderr io.Writer) (pkgArgs, bool) {
	out := pkgArgs{format: "text", rest: []string{}, base: []string{}, upstream: []string{}}
	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			out.help = true
			return out, false
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return out, false
			}
			out.format = argv[i]
		case "--frozen" == arg:
			out.frozen = true
		case "--yes" == arg:
			out.yes = true
		case "--against" == arg, "--to" == arg, "--key" == arg, "--token" == arg,
			"--write" == arg, "--listen" == arg, "--base" == arg, "--upstream" == arg:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: "+arg+" needs a value\n")
				return out, false
			}
			switch arg {
			case "--against":
				out.against = argv[i]
			case "--to":
				out.to = argv[i]
			case "--key":
				out.key = argv[i]
			case "--token":
				out.token = argv[i]
			case "--write":
				out.write = argv[i]
			case "--listen":
				out.listen = argv[i]
			case "--base":
				out.base = append(out.base, argv[i])
			default:
				out.upstream = append(out.upstream, argv[i])
			}
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr, "aontu: unknown "+verb+" option "+arg+" (try --help)\n")
			return out, false
		default:
			out.rest = append(out.rest, arg)
		}
	}
	return out, true
}

// A verb that finds an older layout names the current one, once, and
// reads nothing from it. `pkg.aon` is the sharper case: a project
// carrying it declares nothing to any verb, so `verify` answers over an
// empty package and `sync` writes a lock with every pin dropped.
func nameOldLayout(dir string, stderr io.Writer) {
	here := func(names []string) []string {
		found := []string{}
		for _, f := range names {
			if _, err := os.Stat(filepath.Join(dir, f)); nil == err {
				found = append(found, f)
			}
		}
		return found
	}
	mod := here([]string{"aon_vendor", "mod-lock.aon", "mod.aon",
		filepath.Join("aontu_meta", "mod-lock.aon")})
	aon := here([]string{"pkg.aon", filepath.Join("aontu_meta", "pkg-lock.aon")})
	if 0 < len(mod) {
		io.WriteString(stderr,
			"aontu: "+strings.Join(mod, ", ")+" belong to an older layout: the package "+
				"file is pkg.aontu, the lockfile "+filepath.Join("aontu_meta", "pkg-lock.aontu")+
				" and the vendor tree "+filepath.Join("aontu_meta", "vendor")+"; rename "+
				"pkg.aontu's `mod` block to `pkg`, then run aontu sync\n")
	}
	if 0 < len(aon) {
		io.WriteString(stderr,
			"aontu: "+strings.Join(aon, ", ")+" carry the withdrawn .aon extension, so "+
				"nothing here declares a package: rename them to pkg.aontu and "+
				filepath.Join("aontu_meta", "pkg-lock.aontu")+", then run aontu sync\n")
	}
}

func runPkg(argv []string, srv servers, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	args, ok := parsePkgArgs(argv, "pkg", stdout, stderr)
	if !ok {
		if args.help {
			return 0
		}
		return 2
	}

	sub := ""
	if 0 < len(args.rest) {
		sub = args.rest[0]
	}
	dir := "."
	if 1 < len(args.rest) {
		dir = args.rest[1]
	}

	known := false
	for _, s := range pkgSubs {
		known = known || s == sub
	}
	if !known || 2 < len(args.rest) {
		io.WriteString(stderr,
			"aontu: pkg needs one of "+strings.Join(pkgSubs, ", ")+"\n"+pkgHelp+"\n")
		return 2
	}

	if "keygen" == sub {
		if 2 != len(args.rest) {
			io.WriteString(stderr, "aontu: pkg keygen needs the file to write\naontu pkg keygen <file>\n")
			return 2
		}
		signer, refused := aontu.Keygen(args.rest[1])
		if "" != refused {
			io.WriteString(stderr, "aontu: "+refused+"\n")
			return 2
		}
		io.WriteString(stdout, "signer: "+signer+"\n")
		return 0
	}

	nameOldLayout(dir, stderr)

	// `--against` gates a manifest and means nothing to the others;
	// accepting it there would say it had been honoured.
	if "" != args.against && "manifest" != sub {
		io.WriteString(stderr, "aontu: --against is a manifest option\n")
		return 2
	}

	opts := pkgToolOptions(trust, dir)

	if "outdated" == sub || "serve" == sub {
		return runPkgNet(sub, dir, args, opts, srv, stdout, stderr)
	}

	var report any
	verdict := ""
	switch sub {
	case "tidy":
		r := aontu.PkgTidy(dir, opts)
		report, verdict = r, r.Verdict
	case "verify":
		r := aontu.PkgVerify(dir, opts)
		report, verdict = r, r.Verdict
	case "vendor":
		r := aontu.PkgVendor(dir, opts)
		report, verdict = r, r.Verdict
	case "refreeze":
		r := aontu.PkgRefreeze(dir, opts)
		report, verdict = r, r.Verdict
	case "tree":
		r := aontu.PkgTree(dir, opts)
		report, verdict = r, r.Verdict
	default:
		r := aontu.PkgManifestOf(dir, args.against, opts)
		report, verdict = r, r.Verdict
	}

	io.WriteString(stdout, pkgRender("pkg "+sub, args.format, report,
		func() string { return pkgText(sub, report) })+"\n")
	return pkgExit(verdict)
}

// The tooling's evaluator runs under the caller's trust profile; the
// user cache lives outside any confinement root, so a confined run
// reads the vendor tree only.
func pkgToolOptions(trust trustArg, dir string) *aontu.PkgOptions {
	abs, err := filepath.Abs(dir)
	if nil != err { //coverage:ignore Abs fails only on an unreadable cwd
		abs = dir
	}
	opts := &aontu.PkgOptions{
		Trust:   verbTrust(trust, abs),
		TextExt: trust.textExt,
	}
	if nil == opts.Trust || "" == opts.Trust.IncludeRoot {
		opts.Cache = aontu.ModCacheDir()
	}
	return opts
}

// The verdict classes: `ok` 0, a refused gate 1, an open question 3, a
// document that does not stand up 4 — Subsume's classes, because a
// manifest gate IS a subsumption check and a caller reading exit codes
// should not have to learn a second table.
func pkgExit(verdict string) int {
	switch verdict {
	case "ok", "sent", "dry-run", "current":
		return 0
	case "undecided":
		return 3
	case "error":
		return 4
	}
	return 1
}

func pkgRender(verb, format string, report any, text func() string) string {
	if "json" == format {
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		enc.SetEscapeHTML(false)
		enc.SetIndent("", "  ")
		_ = enc.Encode(pkgReportJSON{
			Aontu:  subsumeProducerJSON{Verb: verb, Version: aontu.VERSION},
			Report: report,
		})
		return strings.TrimSuffix(buf.String(), "\n")
	}
	return text()
}

type pkgReportJSON struct {
	Aontu  subsumeProducerJSON `json:"aontu"`
	Report any                 `json:"-"`
}

func (m pkgReportJSON) MarshalJSON() ([]byte, error) {
	inner, err := json.Marshal(m.Report)
	if nil != err { //coverage:ignore the reports are plain structs
		return nil, err
	}
	var fields map[string]any
	if err := json.Unmarshal(inner, &fields); nil != err { //coverage:ignore see above
		return nil, err
	}
	fields["aontu"] = m.Aontu
	return json.Marshal(fields)
}

func pkgText(sub string, report any) string {
	lines := []string{}
	switch r := report.(type) {
	case aontu.PkgTidyReport:
		lines = append(lines, "verdict: "+r.Verdict)
		for _, e := range r.Lock {
			lines = append(lines, e.Key+" "+e.V+" "+e.Canon)
		}
		// A package that is PRESENT but does not stand up. Named
		// separately from a missing one because the repair is different:
		// a fetch cannot help, the package itself has to be fixed.
		for _, bad := range r.Unevaluable {
			lines = append(lines, bad+": does not evaluate on its own; nothing to pin")
		}
		for _, f := range r.Forbidden {
			lines = append(lines, f+": not admitted in a package")
		}
		lines = append(lines, pkgMissingLines(r.Missing)...)

	case aontu.PkgVerifyReport:
		lines = append(lines, "verdict: "+r.Verdict)
		for _, key := range r.Verified {
			lines = append(lines, key+": verified")
		}
		lines = append(lines, pkgMismatchLines(r.Mismatched)...)
		lines = append(lines, pkgUnlockedLines(r.Unlocked)...)
		lines = append(lines, pkgMissingLines(r.Missing)...)

	case aontu.PkgVendorReport:
		lines = append(lines, "verdict: "+r.Verdict)
		lines = append(lines, r.Vendored...)
		lines = append(lines, pkgMissingLines(r.Missing)...)

	case aontu.PkgRefreezeReport:
		lines = append(lines, "verdict: "+r.Verdict)
		for _, p := range r.Repinned {
			lines = append(lines, p.Key+": "+p.From+" -> "+p.To)
		}
		for _, key := range r.Unchanged {
			lines = append(lines, key+": unchanged")
		}
		for _, bad := range r.Unevaluable {
			lines = append(lines, bad+": does not evaluate on its own; nothing to pin")
		}
		lines = append(lines, pkgMissingLines(r.Missing)...)

	case aontu.PkgTreeReport:
		lines = append(lines, "verdict: "+r.Verdict)
		byKey := map[string]aontu.PkgTreeNode{}
		for _, n := range r.Nodes {
			byKey[n.Key] = n
		}
		seen := map[string]bool{}
		var walk func(key string, depth int)
		walk = func(key string, depth int) {
			node, ok := byKey[key]
			again := seen[key]
			seen[key] = true
			line := strings.Repeat("  ", depth) + key
			if ok && "" != node.V {
				line += " " + node.V
			}
			if again {
				line += " (above)"
			} else if !ok {
				line += " (not locked)"
			}
			lines = append(lines, line)
			if again || !ok {
				return
			}
			for _, dep := range node.Deps {
				walk(dep, depth+1)
			}
		}
		walk(r.Root, 0)
		lines = append(lines, pkgMissingLines(r.Missing)...)

	case aontu.PkgManifestReport:
		lines = append(lines, "verdict: "+r.Verdict)
		if m := r.Manifest; nil != m {
			lines = append(lines, m.Package+" "+m.Version+" "+m.Publish)
			lines = append(lines, "archive: "+m.Archive.Digest+" ("+
				itoa(len(m.Archive.Files))+" files, "+itoa(m.Archive.Size)+" bytes)")
			for _, mod := range m.Modules {
				lines = append(lines, "module: "+mod.Path+" "+mod.Main+" "+mod.Canon)
			}
			keys := make([]string, 0, len(m.Deps))
			for k := range m.Deps {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				line := "dep: " + k + " " + m.Deps[k].V
				if "" != m.Deps[k].Pkg {
					line += " (" + m.Deps[k].Pkg + ")"
				}
				lines = append(lines, line)
			}
			for _, v := range m.Retract {
				lines = append(lines, "retract: "+v)
			}
			if "" != m.Moved {
				lines = append(lines, "moved: "+m.Moved)
			}
			for _, f := range m.Archive.Files {
				lines = append(lines, "file: "+f.Path+" "+f.Digest+" "+itoa(f.Size))
			}
		}
		for _, f := range r.Findings {
			lines = append(lines, f.Path+": "+f.Message)
		}
		for _, miss := range r.Missing {
			lines = append(lines, miss+": missing")
		}
		for _, f := range r.Forbidden {
			lines = append(lines, f+": not admitted in a package")
		}
	}
	_ = sub
	return strings.Join(lines, "\n")
}

func pkgMismatchLines(mismatched []aontu.PkgMismatch) []string {
	out := []string{}
	for _, m := range mismatched {
		if "canon" == m.Pin {
			means := m.Got
			if "" == means {
				means = "nothing (it does not evaluate)"
			}
			out = append(out, m.Key+": pinned "+m.Want+" but the store means "+means)
			continue
		}
		out = append(out, m.Key+": pinned "+m.Pin+" "+m.Want+" but the store holds "+m.Got)
	}
	return out
}

// NOT a fetch: the package may well be sitting in the store. What is
// absent is the PIN, and only a tidy writes one.
func pkgUnlockedLines(unlocked []string) []string {
	out := []string{}
	for _, key := range unlocked {
		out = append(out, key+": not in the lockfile (run: aontu sync)")
	}
	return out
}

func pkgMissingLines(missing []string) []string {
	out := make([]string, 0, len(missing))
	for _, m := range missing {
		out = append(out, m+": not fetched (run: aontu sync)")
	}
	return out
}

func itoa(n int) string {
	return strconv.Itoa(n)
}

const modelHelp = "aontu model get|why|set ... (try --help)"

// modelSubAt is where the subcommand is, past any global flag that
// precedes it. takeTrust strips those anywhere in a tail, so the
// subcommand has to be found past a flag AND past its value: in
// `--text-ext get` the get is the extension list. Mirrors modelSubAt
// in ts/src/cli.ts.
func modelSubAt(argv []string) int {
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "--trust", "--include-root", "--text-ext":
			i++
			continue
		case "get", "why", "set":
			return i
		}
		return -1
	}
	return -1
}

// One document, interrogated or edited (ADR-039 part 5).
func runModel(argv []string, stdout, stderr io.Writer) int {
	sub := ""
	if 0 < len(argv) {
		sub = argv[0]
	}
	if "-h" == sub || "--help" == sub {
		io.WriteString(stdout, helpText)
		return 0
	}
	if at := modelSubAt(argv); 0 <= at {
		tail := append(append([]string{}, argv[:at]...), argv[at+1:]...)
		switch argv[at] {
		case "get":
			return runGet(tail, stdout, stderr)
		case "why":
			return runWhy(tail, stdout, stderr)
		}
		return runSet(tail, stdout, stderr)
	}
	io.WriteString(stderr, "aontu: model needs get, why or set\n"+modelHelp+"\n")
	return 2
}
