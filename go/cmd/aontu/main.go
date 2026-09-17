/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

const helpText = `Usage: aontu [options] [file]
       aontu vet [options] <schema> <data> [more-data...]
       aontu subsume [options] <general> <specific>
       aontu breaking --against <file|git#rev> [options] <file>
       aontu trim --check [options] <file>
       aontu relations [options] <file>
       aontu reaches <from> <to> [--relation <name>] [options] <file>
       aontu view <kind> [options] <file>...
       aontu view --views <path> [--check] [options] <file>
       aontu jsonschema [--at <path>] [--strict] [options] <file>
       aontu template [--resugar] [--check] [--marker <token>]
                      [--profile <file>] <file>
       aontu trace [--at <path>] [--format json] [--marker <token>]
                   [--profile <file>] <file>
       aontu render [--check] [--at <path>] [--format json]
                    [--marker <token>] [--profile <file>]
                    <file|folder> <path>
       aontu hash [options] <file>
       aontu sync [--frozen] [options] [dir]
       aontu add <pkg>[@<version>] [options] [dir]
       aontu get <pkg>[@<version>] [options] [dir]
       aontu remove <pkg> [options] [dir]
       aontu why <pkg> [options] [dir]
       aontu publish [--yes] [--to <dir>] [options] [dir]
       aontu pkg tidy|verify|vendor|manifest|refreeze|tree|outdated|serve
                 [options] [dir]
       aontu pkg keygen <file>
       aontu model get <path> [options] <file>
       aontu model why <path> [options] <file>
       aontu model set <path>=<value>... --entry <file> --overlay <file>
       aontu agentsmd [--write <AGENTS.md>] [--depth <n>] <file>
       aontu fmt [-w|-l|--check|-d|--lint] [--marker <token>]
                 [--profile <file>] <file>...
       aontu help [topic] [--format text|json]
       aontu explain <code> | --list [--format text|json]
       aontu init [dir]
       aontu lsp
       aontu mcp [--root <dir>]

Evaluate an aontu source file and print the result as JSON.
With no file on an interactive terminal, start a REPL.
With no file and piped input, read the source from stdin.

NEW TO THE LANGUAGE? This page documents the TOOL. The documentation
of the LANGUAGE travels inside this binary, and this is how to reach it:

  aontu help              List the topics this binary carries
  aontu help tasks        Which verb does the job you have
  aontu help language     The whole grammar, on one page
  aontu help examples     The ladder, from plain JSON upward
  aontu help codes        What a refusal means
  aontu help grammar      The published ABNF
  aontu explain <code>    What one error code a report carries means
  aontu explain --list    Every registered code with its class

Every one of those answers with no network and no checkout. The
long-form documentation -- the tutorial, the language and API
references, the how-to guides -- is in docs/ of the repository, which
is where to go when the topics above are not enough; the contributor
and agent guide is AGENTS.md beside it.

NOTHING TO EDIT YET? aontu init [dir] writes a working model, an
instance of it, and the four checks to run -- so the first
document is an edit of something that already holds, rather than an
invention. It refuses to overwrite.

The one construct to know before writing anything: &: inside a map is
a TEMPLATE that every key of that map must satisfy. A quoted "*" is a
key named *, not a wildcard, and a schema written that way constrains
nothing while still reporting valid.

The vet verb validates data documents against a schema document and
reports what does not hold, as text or as a machine-readable object.

The subsume verb asks whether every instance the specific document
admits, the general document admits too. The breaking verb runs that
query between a document and its own earlier versions.

Options:
  -c, --canon     Print the canonical form instead of generated JSON
                  (the bare command's, as --jsonl is; model get has
                  its own)
  --format <f>    text (default) or json, on every verb that answers a
                  report. The json form is one object opening with an
                  aontu block; the bare command's carries findings, ok
                  and out
  -h, --help      Show this help and exit (the verbs and their flags);
                  aontu help is the LANGUAGE, and lists its own topics
  --jsonl         REPL: answer every command as one JSON line
  -v, --version   Print the version and exit
  --trust <t>     Include capability: system, none, or root[:dir] to
                  confine @"..." below a directory. A bare root means
                  the entry root: the document's own directory, or the
                  project's for the package verbs. Every verb takes it
                  but help, explain, init and lsp, which read no
                  document, and mcp, which is the npm build's server
                  and confines with --root. Unset, a run behaves as
                  system, and the bare command warns once for an
                  include that leaves the entry root
  --include-root <dir>  Shorthand for --trust root:<dir>
  --text-ext <e>  Read these extensions as text too, comma-separated,
                  with or without dots (md,sql). .txt needs no flag; a
                  named format keeps its meaning, and .js stays
                  refused. The verbs that take --trust take it too

Package verbs (a module is imported; a package is published):
  sync      Make the project correct: resolve by minimum version
            selection, fetch what is missing, write aontu_meta/pkg-lock.aon,
            vendor, verify. --frozen refuses to change the lockfile
  add       Take on a dependency the project does not have, then sync;
            refuses one it has and names get
  get       Add a dependency or raise its minimum, then sync. Without a
            version, the newest version outside the cooldown
  remove    Drop a dependency, then sync
  why       Why is this package in the closure: every path of
            requirements that reaches it
  publish   Publish this package. A dry run without --yes; --to <dir>
            writes the repository layout into a directory instead

Package options:
  --format <f>    text (default) or json
  --frozen        sync: fail if the lockfile would change (the CI mode)
  --yes           publish: send it (the default is a dry run)
  --to <dir>      publish: write the read-path layout into a directory
  --key <file>    publish: the Ed25519 private key (PKCS#8 PEM) that
                  signs the manifest, for the key provider
  --token <file>  publish: the forge's OIDC token, read from a file
  --base <url>    the repository to read from (repeatable; overrides
                  pkg.aon repo.base)
  --write <url>   publish: the write path (overrides pkg.aon repo.write)
  --against <dir> manifest: a prior version's tree, to gate on
  --upstream <u>  serve: fetch on miss from this repository (repeatable)
  --listen <a>    serve: the address to listen on (default 127.0.0.1:8017)

pkg subcommands (the rest of the package operations):
  tidy      Resolve the closure by minimum version selection and
            rewrite aontu_meta/pkg-lock.aon in canonical form
  verify    Check every locked package still is and still means what
            the lockfile pins, bytes before meaning, and change nothing
            (the CI gate; tidy rewrites)
  vendor    Materialise the locked closure into aontu_meta/vendor/
  manifest  Print the manifest a publish would send, gated on the
            compatibility check against --against
  refreeze  Recompute every canon pin and nothing else, after a
            canonical-form change in the engine
  tree      The locked closure as a graph
  outdated  What could move, and what would move with it
  serve     Serve a repository directory; with --upstream, a caching
            proxy in front of another repository
  keygen    Write a new Ed25519 signing key (PKCS#8 PEM) to a file,
            once, and print the signer id a consumer names

model subcommands (one document, interrogated or edited):
  get       What the document says at a path
  why       Every contribution to the value at a path
  set       Append a path-flattened conjunct to an overlay

Vet options:
  --at <path>       Validate against this path of the schema ($.a.b)
  --closed          Refuse keys the anchor does not declare
  --partial         Residue is reported but does not fail the run
  --max-errors <n>  Cap the finding list (default 20)
  --coverage        Report what the check EXAMINED: how many data
                    leaves a schema declaration constrained, the
                    shallowest data paths none did, and the
                    declarations no data met
  --strict-coverage --coverage, and exit 1 when the run was VACUOUS --
                    when no data leaf was constrained at all. The
                    verdict word is unchanged, so nothing that passes
                    today starts failing without this flag
  --coverage-at <p> Measure coverage under this path of the data only
  --format <f>      text (default), json or sarif
  --watch           Re-run whenever a watched file changes

A check that examined NOTHING and a check that passed answer the same
without --coverage. The usual cause is a schema written with the
wildcard other tools use: a quoted "*" is a key NAMED *, not a
template, so it constrains nothing and the run still reports valid.
The template is &: -- see aontu help language.

Vet exit codes:
  0  valid       data unifies, and is concrete (or --partial)
  1  invalid     at least one contradiction, or a vacuous run under
                 --strict-coverage
  2  usage       bad option, or a file that cannot be read
  3  incomplete  no contradiction, but the truth is not yet satisfied
  4  error       the schema is unusable on its own

Subsume options:
  --profile <p>   values, defaults (default) or gen
  --at <path>     Compare at this path of both documents ($.a.b)
  --format <f>    text (default) or json

Subsume exit codes:
  0  subsumes          every specific instance is admitted
  1  does_not_subsume  a witness exists (see the findings)
  2  usage             bad option, or a file that cannot be read
  3  undecided         no rule decides (a sub_* reason is reported)
  4  error             a document does not stand up on its own

Breaking options:
  --against <v>       An earlier version: a file path, or git#<rev>
                      (resolved by 'git show'); repeatable
  --at <path>         Compare this path of both versions ($.a.b), so a
                      module's own version string and policy block do
                      not decide the verdict
  --mode <m>          backward (new admits old, the default), forward
                      (old admits new), or full (both); overrides the
                      document's own $.aontu_policy.compat declaration
  --allow-undecided   Exit 0 on undecided (the report still says so)
  --allow-deprecated-removal
                      A finding about a value the old version already
                      deprecated warns instead of breaking
  --format <f>        text (default) or json

Breaking exit codes mirror subsume's: 0 compatible, 1 breaking,
2 usage, 3 undecided, 4 error.

Trim options:
  --check         Report redundant entries as paths (required: trim
                  only reports for now; rewriting is a future editor)
  --format <f>    text (default) or json

Trim exit codes: 0 nothing redundant, 1 redundancies reported,
2 usage, 4 the document does not stand up on its own.

Hash options:
  --form          Print the hash FORM (the hashed text) instead of the
                  hash, which is what to diff when a pin moves
  --format <f>    text (default) or json

Hash exit codes: 0 hashed, 2 usage, 4 the document does not stand up
on its own.

Model get options:
  -c, --canon     Canonical-form fragment (default: generated JSON)
  --keys          Keys at the node, one per line
  --types         Shape view: concrete leaves lifted to their kinds
  --depth <n>     Structure to depth n; deeper nodes render as top
  --format <f>    text (default) or json

Model get exit codes: 0 rendered, 1 the path names nothing, 2 usage, 4
the document does not stand up on its own.

Model why options:
  --format <f>    text (default) or json

Model why exit codes mirror get's: 0 explained, 1 the path names
nothing, 2 usage, 4 the document does not stand up on its own.

View kinds: doc, lattice, tree, matrix, graph, layer, sets, layers,
ladder, poset (the poset takes several files). The figure goes to stdout, the loss
report to stderr. With --views it draws every figure a document
declares as data, from one evaluation: each declaration names its own
kind and out file, nothing is written unless every figure rendered,
and --check gates the committed set.

View options:
  --as <profile>    text | mermaid | dot | er | svg, per kind: doc,
                    lattice, tree, matrix, sets and layers draw text
                    (default) or svg; graph draws mermaid (default),
                    dot or er; layer draws text (default), mermaid or
                    svg; ladder and poset draw mermaid (default) or dot
  --at <path>       Restrict the figure to nodes under this path; the
                    subtree doc draws; the subtree the lattice counts;
                    the path the ladder draws; where the poset compares
  --views <path>    Draw every figure the document declares at this
                    path, one evaluation, all or nothing; each
                    declaration names its own kind and out file
  -o, --out <file>  Write the figure here instead of stdout
  --check           Exit 1 if --out differs from what would be drawn;
                    nothing is written
  --strict          Exit 1 when the loss report holds anything beyond
                    edges_deduped, inverse_suppressed and crossings
  --depth <n>       doc: how many levels of key to draw (default 3)
  --max-rows <n>    Refuse a figure above this many rows (default 60)
  --style <s>       auto (default), none, ansi or css. A figure's
                    marks carry their meaning -- a direct cell, a
                    closure cell, an upward edge -- and each profile
                    has one way to show it: SGR escapes for text, CSS
                    classes for svg. auto picks that mechanism where
                    the destination can carry it: escapes only on a
                    terminal (NO_COLOR is honoured), and an svg keeps
                    the stylesheet that makes it standalone. none
                    drops both; on svg the classes stay and only the
                    stylesheet goes, for a host page that has already
                    bound --av-ink and its kin. Escapes are never
                    written to a file
  --format <f>      text (default) or json, the whole report
  --relation <n>    tree, matrix, layer: draw over this relation only;
                    graph: keep this predicate (repeatable)
  --root <path>     tree: draw only the subtree under this node;
                    repeatable
  --order <o>       matrix: canon (default) or partition
  --closure         matrix: mark transitively reachable cells +
  --group-by <k>    graph: one subgraph per distinct value of field k;
                    layer: one band per value (required)
  --layers <a,b>    layer: the bands in this order, top first; without
                    it the order is derived from the relation
  --edges <e>       layer: which of the relation's edges to draw over
                    the bands -- upward (the violations, the default
                    for text and svg), all (mermaid's default) or none
  --label <k>       graph: label each node with field k
  --sets <path>     sets: the map whose keys are the sets
  --member <k>      sets: the field holding each set's members
  --universe <p>    sets: the full element domain, so the empty
                    column exists
  --min-degree <n>  sets: drop intersections below this degree
  --min-size <n>    layers: drop intersections below this many paths
  --max-cols <n>    sets, layers: elide columns beyond this many
  --profile <p>     poset: values | defaults (default) | gen

View exit codes: 0 rendered, 1 --check mismatch or lossy under
--strict, 2 usage or --max-rows exceeded, 4 the document does not stand
up on its own, or a relation, root or path that names nothing.

A template entry file whose extension is not .aon is a GENERATOR: a
document in the target's own syntax, whose marker lines carry aontu and
whose other lines are output. It is desugared before it is evaluated,
and a language the table does not know names its marker with --marker,
or declares it once in a profile file that --profile reads.

Template options:
  --resugar       The file is the canonical aontu; print the template
                  form instead of reading one
  --check         Desugar and resugar, and exit 1 if the file is not
                  what the round trip answers
  --marker <t>    The marker, when the extension does not name it
                  (default //-, and #- --- /*- <!--- by extension)
  --profile <f>   A profile file, whose template.ext names the
                  extensions it marks and template.marker the marker

The template verb prints the canonical aontu form of a generator
written in the target's own syntax: a marked line is aontu source, and
every other line is a line of output.

Template exit codes: 0 written, 1 --check drift, 2 usage or I/O.

Render options:
  --check         Compare what the generator writes with what <path>
                  holds, write nothing, and exit 1 on drift
  --at <path>     Where the component tree lives in the document
                  (default $.out)
  --format json   Print the files written, or the drift, as JSON
  --marker <t>    The file is a generator, and this is its marker
                  (default //-, and #- --- /*- <!--- by extension)
  --profile <f>   A profile file, whose template.ext names the
                  extensions it marks and template.marker the marker

The render verb writes the component tree a generator answers. The
tree is handed to jostraca, the generator runtime, which writes the
files: a tree that is one file is written to <path> itself, unless
<path> is a directory, and any other tree is written below <path>.
With --check nothing is written and <path> is compared with what the
generator writes, one "kind: file" line per difference.
A folder as the generator is a set: every regular file directly in
it, dotfiles aside, in name order, and their trees are written below
<path> as one run, so a path two of them claim is refused. A file with
no marker line in it is refused by name.

Render exit codes: 0 written or clean, 1 --check drift, 2 usage or
I/O, 4 the document does not stand up, or --at names nothing.

Model set options:
  --entry <file>    The document the change is checked against
  --overlay <file>  The file the change is appended to (created if
                    absent; not written when the change does not hold)
  --in-place        Rewrite a pinned literal where it was written,
                    instead of appending a line that contradicts it.
                    The span is verified against the source text
                    before writing, and where the value is not a
                    single editable literal in this overlay the
                    assignment is appended as usual with a warning
                    saying why
  --dry-run         Print the overlay that would be written, write
                    nothing
  --format <f>      text (default) or json

Set exit codes are vet's verdict classes: 0 valid, 1 invalid (the
change contradicts a pinned value -- aontu model why locates it, and
--in-place rewrites it), 2 usage, 3 incomplete, 4 the entry does not
stand up on its own.

Agentsmd options:
  --write <file>  Splice the stanza into this file between the
                  aontu:begin and aontu:end markers, appending them
                  when they are absent; the rest is left alone
  --depth <n>     How deep the shape line projects (default 2). Two
                  levels name the root keys and say top under them; a
                  caller that wants the fields asks for them

Agentsmd exit codes: 0 generated, 2 usage, 4 the document does not
stand up on its own.

Help options:
  --format <f>    text (default) or json, the topic and its text

The help verb prints the embedded teaching pack: the language, not the
tool. With no topic it lists them. Topics are tasks, language,
examples, codes and grammar; the corpus is generated from docs/skill/
and grammar/aontu.abnf, so it cannot drift from those sources.

Help exit codes: 0 printed, 2 an unknown topic (the topics are listed)
or a bad option.

Explain options:
  --list          Every registered error code with its class
  --format <f>    text (default) or json

The explain verb answers what one error code means, from the same
table the engine attaches to a finding. Every registered code has an
entry, so a code read out of a report always resolves.

Explain exit codes: 0 explained, 2 an unknown code (near matches are
named) or a bad option.

Fmt options:
  -w, --write     Rewrite each file in place, when its form would change
  -l, --list      Print the name of each file whose form would change
  --check         Like --list, and exit 1 when any would: the CI gate
  -d, --diff      Print a unified diff for each file whose form would
                  change
  --lint          Report the style findings, key case and repeated
                  shapes, on standard error, and print nothing else
  --strict        With --lint, and exit 1 when there is a finding
  --marker <t>    The file is a generator, and this is its marker
                  (default //-, and #- --- /*- <!--- by extension)
  --profile <f>   A profile file, whose template.ext names the
                  extensions it marks and template.marker the marker

The fmt verb prints one document in the agreed form; with no file it
reads standard input. Several files need one of the options above.

A file whose extension is not .aon is a GENERATOR, as it is for
template: the aontu its marker lines carry is formatted, the marker
stands at the left margin with the aontu indented after it, and every
line of output is held on a line of its own. A file with no marker line
in it is another language's, and is refused.

Fmt exit codes: 0 formatted or clean, 1 a --check file would change or
a --strict finding, 2 usage, 4 a document does not parse.

The lsp verb runs the language server over standard input and output
(LSP: JSON-RPC with Content-Length framing) until the client exits;
editors launch it with no arguments. The standalone aontu-lsp binary
runs the same server.

The mcp verb runs the Model Context Protocol server over standard
input and output (newline-delimited JSON-RPC), confined below --root
when one is given. It is part of the npm build, as the standalone
aontu-mcp binary is.

REPL commands:
  :help           Show REPL help
  :load <file>    Evaluate a document and hold it for the commands below
  :get [path]     What the held document says at a path
  :keys [path]    The keys at a path of the held document
  :why <path>     Every contribution to the value at a path
  :canon          Switch to canonical-form output
  :json           Switch to JSON output
  :quit, :exit    Exit the REPL (or press Ctrl-D)
`

// render evaluates src and returns the rendered output for the given
// mode ("json" or "canon"). A non-nil error is a unification/parse
// failure.
func render(a *aontu.Aontu, src, mode string) (string, error) {
	if mode == "canon" {
		v, err := a.Unify(src)
		if err != nil {
			return "", err
		}
		return v.Canon(), nil
	}
	out, err := a.Generate(src)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil { //coverage:ignore no generated value is unencodable
		return "", err
	}
	// Encode always appends a newline; emit adds its own.
	return strings.TrimSuffix(buf.String(), "\n"), nil
}

var evalANSI = regexp.MustCompile("\u001b\\[[0-9;]*m")

func evalFinding(err error) []aontu.VetFinding {
	ae, ok := err.(*aontu.AontuError)
	if !ok { //coverage:ignore Unify and Generate return an *AontuError on every failure path
		return []aontu.VetFinding{}
	}
	message := evalANSI.ReplaceAllString(ae.Msg, "")
	if i := strings.IndexByte(message, '\n'); 0 <= i {
		message = message[:i]
	}
	class, _, _ := aontu.ExplainCode(ae.Code)
	return []aontu.VetFinding{{
		Class:    class,
		Code:     ae.Code,
		Message:  message,
		Path:     "$",
		Severity: "error",
		Sites:    []aontu.VetSite{},
	}}
}

// The machine-readable form of the bare command's answer. Field order
// is LEXICOGRAPHIC, the canonical emitter's order (see
// getReportJSON, which is the same shape for the same reason).
type evalReportJSON struct {
	Aontu    subsumeProducerJSON `json:"aontu"`
	Findings []aontu.VetFinding  `json:"findings"`
	OK       bool                `json:"ok"`
	Out      string              `json:"out"`
}

func emit(a *aontu.Aontu, src, mode, format string, out, errw io.Writer) int {
	text, err := render(a, src, mode)

	if "json" == format {
		report := evalReportJSON{
			Aontu:    subsumeProducerJSON{Verb: "eval", Version: aontu.VERSION},
			Findings: []aontu.VetFinding{},
			OK:       nil == err,
			Out:      text,
		}
		if nil != err {
			report.Findings = evalFinding(err)
			report.Out = ""
		}
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		enc.SetEscapeHTML(false)
		enc.SetIndent("", "  ")
		_ = enc.Encode(report)
		fmt.Fprint(out, buf.String())
		if nil != err {
			return 1
		}
		return 0
	}

	if err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	fmt.Fprintln(out, text)
	return 0
}

var knownVerbs = []string{
	"add", "agentsmd", "breaking", "explain", "fmt", "get", "hash", "help",
	"init", "jsonschema", "lsp", "mcp", "model", "pkg", "publish", "reaches",
	"relations", "remove", "render", "subsume", "sync", "template", "trace",
	"trim", "vet", "view", "why",
}

// looksLikeVerb reports whether an unreadable argument was meant as a
// verb rather than as a path. A bare word has no separator and no
// extension; `./help`, `help.aon`, `/tmp/help` and `sub/dir` are paths
// and keep the file diagnosis.
func looksLikeVerb(arg string) bool {
	return "" != arg &&
		!strings.ContainsAny(arg, "/\\.") &&
		!strings.HasPrefix(arg, "-")
}

func vacuous(stderr io.Writer, what, why string) {
	fmt.Fprintf(stderr, "aontu: %s: %s\n", what, why)
}

type trustArg struct {
	kind    string // "system-warn", "system", "none", "root"
	dir     string // root's directory ("" = the entry root)
	textExt []string
}

func parseTextExt(arg string) ([]string, bool) {
	out := []string{}
	for _, raw := range strings.Split(arg, ",") {
		ext := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(raw), "."))
		if "" == ext || !textExtRe.MatchString(ext) {
			return nil, false
		}
		out = append(out, ext)
	}
	return out, true
}

var textExtRe = regexp.MustCompile(`^[a-z0-9]+$`)

// parseTrustArg reads a --trust value; ok is false for an unknown
// spelling, so the caller owns the usage error.
func parseTrustArg(value string) (trustArg, bool) {
	switch {
	case "system" == value:
		return trustArg{kind: "system"}, true
	case "none" == value:
		return trustArg{kind: "none"}, true
	case "root" == value:
		return trustArg{kind: "root"}, true
	case strings.HasPrefix(value, "root:") && len("root:") < len(value):
		return trustArg{kind: "root", dir: value[len("root:"):]}, true
	}
	return trustArg{}, false
}

// makeTrustWarn is the one-line warning of the staged default flip,
// once per (kind, path). The identical text to the canonical CLI.
func makeTrustWarn(stderr io.Writer) func(kind, path string) {
	warned := map[string]bool{}
	return func(kind, path string) {
		key := kind + " " + path
		if warned[key] {
			return
		}
		warned[key] = true
		how := "outside the entry root"
		if "pkg" == kind { //coverage:ignore Go has no package leg to warn about
			how = "through package resolution"
		}
		fmt.Fprintf(stderr,
			"aontu: warning: include resolved %s: %s"+
				" (a future release will deny this by default;"+
				" pass --trust system to keep it, or --include-root to confine)\n",
			how, path)
	}
}

// applyTrust configures a for the parsed trust argument, with entryRoot
// the entry file's directory (or the working directory for stdin/REPL).
func applyTrust(a *aontu.Aontu, trust trustArg, entryRoot string, stderr io.Writer) {
	// The extensions come first because they are unconditional: every
	// capability below reads text the same way, and only WHICH files
	// are reachable differs.
	a.TextExt = trust.textExt
	switch trust.kind {
	case "none":
		a.Trust = &aontu.TrustOptions{IncludeNone: true}
	case "root":
		dir := trust.dir
		if "" == dir {
			dir = entryRoot
		}
		a.Trust = &aontu.TrustOptions{IncludeRoot: dir}
	case "system":
		// explicit system: unconfined, no warnings
	default: // system-warn: today's default plus the warning window
		a.TrustWarn = makeTrustWarn(stderr)
		a.TrustWarnRoot = entryRoot
	}
}

func takeTrust(argv []string, stderr io.Writer) ([]string, trustArg, bool) {
	rest := []string{}
	trust := trustArg{kind: "system-warn"}
	textExt := []string{}
	for i := 0; i < len(argv); i++ {
		switch {
		case "--trust" == argv[i]:
			i++
			parsed, ok := trustArg{}, false
			if i < len(argv) {
				parsed, ok = parseTrustArg(argv[i])
			}
			if !ok {
				io.WriteString(stderr,
					"aontu: --trust needs system, none, or root[:dir]\n")
				return nil, trustArg{}, false
			}
			trust = parsed
		case "--include-root" == argv[i]:
			i++
			if len(argv) <= i {
				io.WriteString(stderr, "aontu: --include-root needs a directory\n")
				return nil, trustArg{}, false
			}
			trust = trustArg{kind: "root", dir: argv[i]}
		case "--text-ext" == argv[i]:
			i++
			parsed, ok := []string(nil), false
			if i < len(argv) {
				parsed, ok = parseTextExt(argv[i])
			}
			if !ok {
				io.WriteString(stderr,
					"aontu: --text-ext needs extensions, without dots"+
						" (--text-ext md,sql)\n")
				return nil, trustArg{}, false
			}
			textExt = append(textExt, parsed...)
		default:
			rest = append(rest, argv[i])
		}
	}
	trust.textExt = textExt
	return rest, trust, true
}

// verbTrust is the capability a verb's engine runs under. "system" and
// the staged warning default both mean today's behaviour (no
// capability); the warning window stays a bare-command nicety, because
// a verb's report is a machine contract and a stderr line is not part
// of it.
func verbTrust(trust trustArg, entryRoot string) *aontu.TrustOptions {
	switch trust.kind {
	case "none":
		return &aontu.TrustOptions{IncludeNone: true}
	case "root":
		dir := trust.dir
		if "" == dir {
			dir = entryRoot
		}
		return &aontu.TrustOptions{IncludeRoot: dir}
	}
	return nil
}

// entryRootOfFile is the directory a bare `--trust root` confines a
// verb to: the primary document's own, matching the bare command's
// entry root.
func entryRootOfFile(file string) string {
	abs, err := filepath.Abs(file)
	if err != nil { //coverage:ignore Abs fails only on an unreadable cwd
		abs = file
	}
	return filepath.Dir(abs)
}

// aontuForFileTrust is aontuForFile under an explicit capability.
func aontuForFileTrust(file string, trust trustArg) *aontu.Aontu {
	a := aontuForFile(file)
	abs, err := filepath.Abs(file)
	if err != nil { //coverage:ignore Abs fails only on an unreadable cwd
		abs = file
	}
	a.TextExt = trust.textExt
	if capability := verbTrust(trust, filepath.Dir(abs)); nil != capability {
		a.Trust = capability
	}
	return a
}

func aontuForFile(file string) *aontu.Aontu {
	abs, err := filepath.Abs(file)
	if err != nil {
		abs = file
	}
	a := aontu.NewWithBase(filepath.Dir(abs))
	// Error frames name the entry file as typed, the way the TS CLI's
	// resolved entry path renders relative to the working directory.
	a.File = file
	return a
}

// stdinIsPipe reports whether stdin is piped/redirected (not a
// terminal). An unanswerable stdin counts as piped, which is what Node
// does: `process.stdin.isTTY` is undefined for a descriptor it cannot
// classify, so TypeScript reads the source rather than opening a REPL.
func stdinIsPipe() bool {
	return !isTerminal(os.Stdin)
}

// repl reads source lines from in, evaluating each and writing results
// to out, until EOF or a :quit/:exit command.
func repl(
	mode string, jsonl bool, trust trustArg, in io.Reader, out io.Writer,
) {
	prompt := "aontu> "
	if jsonl {
		prompt = ""
	} else {
		fmt.Fprintf(out,
			"aontu v%s REPL — :help for commands, :quit to exit\n", aontu.VERSION)
	}
	closing := func() {
		if !jsonl {
			fmt.Fprintln(out)
		}
	}
	state := replState{Mode: mode, JSONL: jsonl, Trust: trust}
	sc := bufio.NewScanner(in)
	// Raise the line cap well above bufio's 64KB default so a long
	// pasted source line is not silently truncated.
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	fmt.Fprint(out, prompt)
	for sc.Scan() {
		res := replCommand(state, sc.Text(), func(f string) (string, error) {
			raw, err := os.ReadFile(f)
			return string(raw), err
		})
		state = res.State
		if res.Close {
			closing()
			return
		}
		if "" != res.Out {
			fmt.Fprintln(out, res.Out)
		}
		fmt.Fprint(out, prompt)
	}
	if err := sc.Err(); err != nil {
		fmt.Fprintln(out, "aontu: input error:", err)
	}
	closing()
}

func main() { //coverage:ignore run under GOCOVERDIR by `make cov-go`
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, !stdinIsPipe()))
}

func colorFor(w io.Writer) *bool {
	if f, isFile := w.(*os.File); isFile && isTerminal(f) {
		return nil
	}
	off := false
	return &off
}

// run is main with its arguments, streams and terminal-ness injected,
// returning the process exit code. Separated from main so tests can
// drive the whole command with in-memory pipes.
func run(args []string, stdin io.Reader, stdout, stderr io.Writer, tty bool) int {
	aontu.SetColor(colorFor(stderr))

	if 0 < len(args) && "vet" == args[0] {
		return runVet(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "subsume" == args[0] {
		return runSubsume(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "breaking" == args[0] {
		return runBreaking(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "pkg" == args[0] {
		return runPkg(args[1:], cliServers(), stdout, stderr)
	}
	if 0 < len(args) && isPackageVerb(args[0]) {
		return runPackageVerb(args[0], args[1:], cliServers(), stdout, stderr)
	}
	if 0 < len(args) && "model" == args[0] {
		return runModel(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "relations" == args[0] {
		return runRelations(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "jsonschema" == args[0] {
		return runJsonSchema(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "template" == args[0] {
		return runTemplate(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "trace" == args[0] {
		return runTrace(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "render" == args[0] {
		return runRender(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "reaches" == args[0] {
		return runReaches(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "view" == args[0] {
		return runView(args[1:], stdout, stderr)
	}

	if 0 < len(args) && "trim" == args[0] {
		return runTrim(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "agentsmd" == args[0] {
		return runAgentsMd(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "fmt" == args[0] {
		return runFmt(args[1:], stdin, stdout, stderr)
	}
	if 0 < len(args) && "lsp" == args[0] {
		return runLsp(args[1:], stdin, stdout, stderr)
	}
	if 0 < len(args) && "mcp" == args[0] {
		return runMcp(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "hash" == args[0] {
		return runHash(args[1:], stdout, stderr)
	}
	// G11 phases 1, 3 and 6. `help`, `explain` and `init` are dispatched
	// with the rest, so `aontu ./help` still reads a file named help
	// exactly as `aontu ./vet` does.
	if 0 < len(args) && "help" == args[0] {
		return runHelp(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "explain" == args[0] {
		return runExplain(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "init" == args[0] {
		return runInit(args[1:], stdout, stderr)
	}

	mode := "json"
	// THE REPORT FORM (G11 phase 7), default text: every existing
	// caller reads exactly what it always read, and a caller that asks
	// for json gets the failure in the finding shape every other verb
	// reports.
	format := "text"
	jsonl := false
	var files []string
	trust := trustArg{kind: "system-warn"}
	textExt := []string{}

	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch arg {
		case "-c", "--canon":
			mode = "canon"
		case "--format":
			i++
			if len(args) <= i || ("text" != args[i] && "json" != args[i]) {
				fmt.Fprintln(stderr, "aontu: --format needs text or json")
				return 2
			}
			format = args[i]
		case "--jsonl":
			jsonl = true
			off := false
			aontu.SetColor(&off)
		case "-h", "--help":
			fmt.Fprint(stdout, helpText)
			return 0
		case "-v", "--version":
			fmt.Fprintln(stdout, aontu.VERSION)
			return 0
		case "--trust":
			i++
			parsed, ok := trustArg{}, false
			if i < len(args) {
				parsed, ok = parseTrustArg(args[i])
			}
			if !ok {
				fmt.Fprintln(stderr, "aontu: --trust needs system, none, or root[:dir]")
				return 2
			}
			trust = parsed
		case "--include-root":
			i++
			if len(args) <= i {
				fmt.Fprintln(stderr, "aontu: --include-root needs a directory")
				return 2
			}
			trust = trustArg{kind: "root", dir: args[i]}
		case "--text-ext":
			i++
			parsed, ok := []string(nil), false
			if i < len(args) {
				parsed, ok = parseTextExt(args[i])
			}
			if !ok {
				fmt.Fprintln(stderr,
					"aontu: --text-ext needs extensions, without dots"+
						" (--text-ext md,sql)")
				return 2
			}
			textExt = append(textExt, parsed...)
		default:
			if strings.HasPrefix(arg, "-") {
				fmt.Fprintf(stderr, "aontu: unknown option %s (try --help)\n", arg)
				return 2
			}
			files = append(files, arg)
		}
	}

	if 1 < len(files) {
		fmt.Fprintf(stderr,
			"aontu: the bare command evaluates one document, and %d were given\n"+
				"aontu: a mistyped verb reads as a file name (try --help)\n",
			len(files))
		return 2
	}

	trust.textExt = textExt

	file := ""
	if 0 < len(files) {
		file = files[0]
	}

	if file != "" {
		src, err := os.ReadFile(file)
		if err != nil {
			if looksLikeVerb(file) {
				fmt.Fprintf(stderr,
					"aontu: `%s` is not a file, and not a verb this port knows\n",
					file)
				if near := nearestVerb(file, knownVerbs); "" != near {
					fmt.Fprintf(stderr, "aontu: did you mean `aontu %s`?\n", near)
				}
				fmt.Fprintln(stderr,
					"aontu: `aontu --help` lists the verbs, `aontu help` the topics")
				return 2
			}
			fmt.Fprintf(stderr, "aontu: cannot read %s: %v\n", file, err)
			return 1
		}
		// Resolve relative @"file" loads against the entry file's dir.
		a := aontuForFile(file)
		abs, aerr := filepath.Abs(file)
		if aerr != nil { //coverage:ignore Abs fails only on a deleted cwd
			abs = file
		}
		applyTrust(a, trust, filepath.Dir(abs), stderr)
		return emit(a, string(src), mode, format, stdout, stderr)
	}

	a := aontu.New()
	cwd, cwdErr := os.Getwd()
	if cwdErr != nil { //coverage:ignore Getwd fails only on a deleted cwd
		cwd = "."
	}
	applyTrust(a, trust, cwd, stderr)

	// `--jsonl` overrides the TTY gate. The mode exists to be DRIVEN by
	// a harness over a pipe, so gating it on an interactive terminal
	// made it reachable only through a pty -- which is to say, not
	// reachable by the thing it was built for.
	if !tty && !jsonl {
		src, err := io.ReadAll(stdin)
		if err != nil {
			fmt.Fprintf(stderr, "aontu: cannot read stdin: %v\n", err)
			return 1
		}
		return emit(a, string(src), mode, format, stdout, stderr)
	}

	repl(mode, jsonl, trust, stdin, stdout)
	return 0
}
