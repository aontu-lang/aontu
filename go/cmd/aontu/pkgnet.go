/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

// servers is what a verb that runs a server, or reaches a repository,
// is handed: the transport, and what `pkg serve` waits on. Tests hand
// in their own.
type servers struct {
	http  func() aontu.PkgHTTP
	serve func(served *aontu.Served)
}

// cliServers is what run hands the verbs; a test replaces it.
var cliServers = defaultServers

// Excluded: the real pair reaches the network and waits on the
// process's SIGINT; the tests drive both through their own.
func defaultServers() servers { //coverage:ignore see above
	return servers{
		http: aontu.DefaultHTTP,
		serve: func(*aontu.Served) {
			ch := make(chan os.Signal, 1)
			signal.Notify(ch, os.Interrupt)
			<-ch
		},
	}
}

const noCache = "aontu: this verb reads and writes the user cache, which a " +
	"confined run (--trust root) does not reach and this host does not name " +
	"(set XDG_CACHE_HOME or HOME)\n"

func netBase(args pkgArgs) []string {
	if 0 == len(args.base) {
		return nil
	}
	return args.base
}

// The two `pkg` subcommands that reach a repository.
func runPkgNet(sub, dir string, args pkgArgs, opts *aontu.PkgOptions, srv servers,
	stdout, stderr io.Writer) int {
	if "serve" == sub {
		abs, _ := filepath.Abs(dir)
		listen := args.listen
		if "" == listen {
			listen = "127.0.0.1:8017"
		}
		served, err := aontu.StartServe(aontu.ServeOptions{
			Dir: abs, Upstream: args.upstream, Listen: listen, HTTP: srv.http(),
		})
		if nil != err {
			io.WriteString(stderr, "aontu: cannot listen on "+listen+": "+err.Error()+"\n")
			return 2
		}
		out := "serving " + abs + " at " + served.URL + "\n"
		for _, u := range args.upstream {
			out += "upstream: " + u + "\n"
		}
		io.WriteString(stdout, out)
		srv.serve(served)
		served.Close()
		return 0
	}
	if "" == opts.Cache {
		io.WriteString(stderr, noCache)
		return 2
	}
	report := aontu.PkgOutdated(dir, opts, srv.http(), aontu.SyncArgs{RepoOverrides: aontu.RepoOverrides{Base: netBase(args)}})
	io.WriteString(stdout, pkgRender("pkg outdated", args.format, report,
		func() string { return pkgNetText("pkg outdated", report) })+"\n")
	return pkgExit(report.Verdict)
}

var packageVerbs = []string{"sync", "add", "get", "remove", "why", "publish"}

var packageHelp = map[string]string{
	"sync":    "aontu sync [--frozen] [dir] (try --help)",
	"add":     "aontu add <pkg> [dir] (try --help)",
	"get":     "aontu get <pkg>[@<version>] [dir] (try --help)",
	"remove":  "aontu remove <pkg> [dir] (try --help)",
	"why":     "aontu why <pkg> [dir] (try --help)",
	"publish": "aontu publish [--yes] [--to <dir>] [--key <file>] [dir] (try --help)",
}

func isPackageVerb(verb string) bool {
	for _, v := range packageVerbs {
		if v == verb {
			return true
		}
	}
	return false
}

// The top-level package verbs (ADR-039 part 5). Every one but `why`
// reaches a repository, so every one runs behind the seam.
func runPackageVerb(verb string, argv []string, srv servers, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	args, ok := parsePkgArgs(argv, verb, stdout, stderr)
	if !ok {
		if args.help {
			return 0
		}
		return 2
	}
	wantsPkg := "sync" != verb && "publish" != verb
	dirAt := 0
	if wantsPkg {
		dirAt = 1
	}
	dir := "."
	if dirAt < len(args.rest) {
		dir = args.rest[dirAt]
	}
	if len(args.rest) > dirAt+1 || (wantsPkg && 0 == len(args.rest)) {
		what := " takes a directory"
		if wantsPkg {
			what = " needs a package"
		}
		io.WriteString(stderr, "aontu: "+verb+what+"\n"+packageHelp[verb]+"\n")
		return 2
	}
	nameOldLayout(dir, stderr)
	opts := pkgToolOptions(trust, dir)
	http := srv.http()

	if "why" == verb {
		report := aontu.PkgWhy(dir, opts, args.rest[0])
		io.WriteString(stdout, pkgRender("why", args.format, report,
			func() string { return pkgNetText("why", report) })+"\n")
		return pkgExit(report.Verdict)
	}

	if "publish" == verb {
		for _, f := range []string{args.key, args.token} {
			if "" != f {
				if _, err := os.Stat(f); nil != err {
					io.WriteString(stderr, "aontu: cannot read "+f+"\n")
					return 2
				}
			}
		}
		if args.yes && "" == args.key {
			io.WriteString(stderr, "aontu: publish --yes needs --key <file>, the Ed25519 key that signs\n")
			return 2
		}
		to := args.to
		if "" != to {
			to, _ = filepath.Abs(to)
		}
		report := aontu.PkgPublish(dir, opts, http, aontu.PublishArgs{
			RepoOverrides: aontu.RepoOverrides{Base: netBase(args), Write: args.write},
			Yes:           args.yes, To: to, Key: args.key, Token: args.token, Against: args.against,
		})
		io.WriteString(stdout, pkgRender("publish", args.format, report,
			func() string { return pkgNetText("publish", report) })+"\n")
		return pkgExit(report.Verdict)
	}

	if "" == opts.Cache {
		io.WriteString(stderr, noCache)
		return 2
	}
	net := aontu.SyncArgs{RepoOverrides: aontu.RepoOverrides{Base: netBase(args)}}
	var report any
	verdict := ""
	usage := ""
	switch verb {
	case "sync":
		net.Frozen = args.frozen
		r := aontu.PkgSync(dir, opts, http, net)
		report, verdict = r, r.Verdict
	case "remove":
		r, bad := aontu.PkgRemove(dir, opts, http, args.rest[0], net)
		report, verdict, usage = r, r.Verdict, bad
	default:
		r, bad := aontu.PkgGet(dir, opts, http, args.rest[0], aontu.ChangeArgs{SyncArgs: net, Mode: verb})
		report, verdict, usage = r, r.Verdict, bad
	}
	if "" != usage {
		io.WriteString(stderr, "aontu: "+usage+"\n")
		return 2
	}
	io.WriteString(stdout, pkgRender(verb, args.format, report,
		func() string { return pkgNetText(verb, report) })+"\n")
	return pkgExit(verdict)
}

func pkgNetText(verb string, report any) string {
	lines := []string{}
	tail := func(events []aontu.PkgEvent, refusal *aontu.PkgRefusalReport) {
		for _, e := range events {
			lines = append(lines, e.Code+": "+e.Message)
		}
		if nil != refusal {
			lines = append(lines, "refused: "+refusal.Code+": "+refusal.Message)
		}
	}

	switch r := report.(type) {
	case aontu.PkgWhyReport:
		lines = append(lines, "verdict: "+r.Verdict)
		for _, p := range r.Paths {
			lines = append(lines, strings.Join(p, " -> "))
		}
		if "missing" == r.Verdict {
			lines = append(lines, r.Pkg+": not in the closure")
		}

	case aontu.PkgPublishReport:
		lines = append(lines, "verdict: "+r.Verdict)
		manifest := pkgText("manifest", aontu.PkgManifestReport{
			Verdict: r.Verdict, Manifest: r.Manifest, Missing: r.Missing,
			Forbidden: r.Forbidden, Findings: r.Findings,
		})
		lines = append(lines, strings.Split(manifest, "\n")[1:]...)
		if "" != r.Digest {
			lines = append(lines, "digest: "+r.Digest)
		}
		if "" != r.Signer {
			lines = append(lines, "signer: "+r.Signer)
		}
		if "" != r.Against {
			lines = append(lines, "against: "+r.Against)
		}
		if "" != r.To {
			lines = append(lines, "to: "+r.To)
		}
		if "" != r.Write {
			lines = append(lines, "write: "+r.Write+aontu.PublishPath)
		}
		if "dry-run" == r.Verdict {
			lines = append(lines, "dry run: nothing sent (add --yes)")
		}
		if "sent" == r.Verdict {
			lines = append(lines, "sent")
		}
		tail(nil, r.Refusal)

	case aontu.PkgOutdatedReport:
		lines = append(lines, "verdict: "+r.Verdict)
		for _, e := range r.Locked {
			if 0 < aontu.VersionCompare(e.Newest, e.V) {
				lines = append(lines, e.Key+" "+e.V+" -> "+e.Newest)
				for _, m := range e.Moves {
					lines = append(lines, "  "+m)
				}
			} else {
				lines = append(lines, e.Key+" "+e.V+": current")
			}
			if "" != e.Retracted {
				lines = append(lines, e.Key+" "+e.V+": retracted by "+e.Retracted)
			}
		}
		tail(r.Events, r.Refusal)

	case aontu.PkgSyncReport:
		lines = append(lines, syncLines(r, "")...)

	case aontu.PkgChangeReport:
		lines = append(lines, syncLines(r.PkgSyncReport, r.Change)...)
	}
	return strings.Join(lines, "\n")
}

func syncLines(r aontu.PkgSyncReport, change string) []string {
	lines := []string{"verdict: " + r.Verdict}
	if "" != change {
		lines = append(lines, "change: "+change)
	}
	for _, f := range r.Fetched {
		lines = append(lines, "fetched: "+f)
	}
	for _, e := range r.Lock {
		lines = append(lines, e.Key+" "+e.V+" "+e.Canon)
	}
	for _, bad := range r.Unevaluable {
		lines = append(lines, bad+": does not evaluate on its own; nothing to pin")
	}
	for _, f := range r.Forbidden {
		lines = append(lines, f+": not admitted in a package")
	}
	lines = append(lines, pkgMismatchLines(r.Mismatched)...)
	lines = append(lines, pkgUnlockedLines(r.Unlocked)...)
	lines = append(lines, pkgMissingLines(r.Missing)...)
	for _, c := range r.Changes {
		lines = append(lines, "lockfile would change: "+c)
	}
	for _, e := range r.Events {
		lines = append(lines, e.Code+": "+e.Message)
	}
	if nil != r.Refusal {
		lines = append(lines, "refused: "+r.Refusal.Code+": "+r.Refusal.Message)
	}
	return lines
}
