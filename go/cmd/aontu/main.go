/* Copyright (c) 2025 Richard Rodger, MIT License */

// Command aontu is the command-line interface for the Aontu unifier.
//
//	aontu [options] [file]
//
// With a file argument, the file is evaluated and the result printed.
// With no file on an interactive terminal, a REPL is started. With no
// file and piped input, the source is read from stdin.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
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
       aontu jsonschema [--at <path>] [--strict] [options] <file>
       aontu hash [options] <file>
       aontu mod tidy|verify|vendor|manifest [options] [dir]
       aontu get <path> [options] <file>
       aontu why <path> [options] <file>
       aontu set <path>=<value>... --entry <file> --overlay <file>
       aontu agentsmd [--write <AGENTS.md>] <file>

Evaluate an Aontu source file and print the result as JSON.
With no file on an interactive terminal, start a REPL.
With no file and piped input, read the source from stdin.

The vet verb validates data documents against a schema document and
reports what does not hold, as text or as a machine-readable object.

The subsume verb asks whether every instance the specific document
admits, the general document admits too. The breaking verb runs that
query between a document and its own earlier versions.

Options:
  -c, --canon     Print the canonical form instead of generated JSON
  -h, --help      Show this help and exit
  --jsonl         REPL: answer every command as one JSON line
  -v, --version   Print the version and exit
  --trust <t>     Include capability: system (default), none, or
                  root[:dir] to confine @"..." below a directory.
                  Every verb takes it too, and a bare root means the
                  document's own directory
  --include-root <dir>  Shorthand for --trust root:<dir>

Mod options:
  --format <f>    text (default) or json
  --against <dir> manifest: a prior version's module tree, to gate on

Mod subcommands:
  tidy      Resolve the module closure by minimum version selection and
            rewrite mod-lock.aon in canonical form
  verify    Check every locked module still means what mod-lock.aon
            pins, and change nothing (the CI gate; tidy rewrites)
  vendor    Materialise the locked closure into aon_vendor/
  manifest  Print the OCI artifact a publish would push, gated on the
            breaking check against --against

Vet options:
  --at <path>       Validate against this path of the schema ($.a.b)
  --closed          Refuse keys the anchor does not declare
  --partial         Residue is reported but does not fail the run
  --max-errors <n>  Cap the finding list (default 20)
  --format <f>      text (default), json or sarif
  --watch           Re-run whenever a watched file changes

Vet exit codes:
  0  valid       data unifies, and is concrete (or --partial)
  1  invalid     at least one contradiction
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

Get options:
  -c, --canon     Canonical-form fragment (default: generated JSON)
  --keys          Keys at the node, one per line
  --types         Shape view: concrete leaves lifted to their kinds
  --depth <n>     Structure to depth n; deeper nodes render as top
  --format <f>    text (default) or json

Get exit codes: 0 rendered, 1 the path names nothing, 2 usage, 4 the
document does not stand up on its own.

Why options:
  --format <f>    text (default) or json

Why exit codes mirror get's: 0 explained, 1 the path names nothing,
2 usage, 4 the document does not stand up on its own.

View kinds: tree, matrix, graph, layer, sets, layers, ladder, poset
(the poset takes several files). The figure goes to stdout, the loss
report to stderr.

View options:
  --as <profile>    text | mermaid | dot | er, per kind: tree, matrix,
                    sets and layers draw text; graph draws mermaid
                    (default), dot or er; layer draws text (default)
                    or mermaid; ladder and poset draw mermaid
                    (default) or dot
  --at <path>       Restrict the figure to nodes under this path; the
                    path the ladder draws; where the poset compares
  -o, --out <file>  Write the figure here instead of stdout
  --check           Exit 1 if --out differs from what would be drawn;
                    nothing is written
  --strict          Exit 1 when the loss report holds anything beyond
                    edges_deduped, inverse_suppressed and crossings
  --max-rows <n>    Refuse a figure above this many rows (default 60)
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

Set options:
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
change contradicts a pinned value -- aontu why locates it, and
--in-place rewrites it), 2 usage, 3 incomplete, 4 the entry does not
stand up on its own.

Agentsmd options:
  --write <file>  Splice the stanza into this file between the
                  aontu:begin and aontu:end markers, appending them
                  when they are absent; the rest is left alone

Agentsmd exit codes: 0 generated, 2 usage, 4 the document does not
stand up on its own.

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
	// An Encoder with HTML escaping OFF, not json.MarshalIndent: Marshal
	// rewrites <, > and & as their \u00xx escapes, which the
	// canonical TypeScript CLI (exactJSON, and JSON.stringify before it)
	// does not — so `x:"<b>&</b>"` printed different bytes in the two
	// CLIs. The shared suite's gens mode already turned this escaping off
	// for exactly this reason (specGens in spec_test.go); the CLI must
	// make the same choice or the parity probe in AGENTS.md, which
	// compares the two command lines, reads a divergence on any document
	// containing those three characters.
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil { //coverage:ignore no generated value is unencodable
		// UNREACHABLE, and kept anyway. The only values the encoder ever
		// refused were the non-finite floats `+` could produce, and the
		// engine now refuses those itself with float_overflow
		// (go/arith.go, use-cases/BUGS.md 39) -- so nothing that
		// generates reaches here unencodable. Dropping the check would
		// buy nothing and would silently print a partial buffer if a
		// future leaf ever escaped the same way.
		return "", err
	}
	// Encode always appends a newline; emit adds its own.
	return strings.TrimSuffix(buf.String(), "\n"), nil
}

// emit renders src to out (or the error to errw) and returns the
// process exit code.
func emit(a *aontu.Aontu, src, mode string, out, errw io.Writer) int {
	text, err := render(a, src, mode)
	if err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	fmt.Fprintln(out, text)
	return 0
}

// trustArg is the include capability the main verb runs with (G5,
// docs/trust.md). `--trust` and `--include-root` set it explicitly; the
// default is 'system' WITH the warning window: every resolution that
// escapes the entry root prints a one-line stderr warning naming the
// flag a future default will require (phase 6, the staged flip).
type trustArg struct {
	kind string // "system-warn", "system", "none", "root"
	dir  string // root's directory ("" = the entry root)
}

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

// aontuForFile builds an Aontu whose relative @"file" loads resolve
// against the directory containing file, so `aontu /path/to/main.aontu`
// works regardless of the current working directory (matching the
// TypeScript CLI, which passes the resolved entry path).
// EVERY VERB honours the include capability, not just the bare
// command. G5 wired --trust/--include-root to `aontu <file>` alone, so
// `aontu vet schema.aon data.json` -- the surface an agent scripts --
// ran the full system resolver with no way to confine it (the review's
// finding G). takeTrust strips the flags before each verb parses its
// tail; verbTrust turns the parsed argument into the capability, and
// aontuForFileTrust applies it to the engine every verb builds.
func takeTrust(argv []string, stderr io.Writer) ([]string, trustArg, bool) {
	rest := []string{}
	trust := trustArg{kind: "system-warn"}
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
		default:
			rest = append(rest, argv[i])
		}
	}
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

// stdinIsPipe reports whether stdin is piped/redirected (not a terminal).
func stdinIsPipe() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) == 0
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
			"Aontu v%s REPL — :help for commands, :quit to exit\n", aontu.VERSION)
	}
	// The closing newline is for a HUMAN, so it is written only for
	// one: it moves the terminal off the prompt line the loop left
	// hanging. In --jsonl there is no prompt, every answer already ends
	// in its own newline, and this one appended a bare empty line to
	// the stream -- a record that is not JSON, at the end of a protocol
	// whose whole contract is one JSON object per line. A harness
	// parsing every line it receives failed on it, after the commands
	// had all succeeded. Mirrors runRepl in ts/src/cli.ts.
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

// colorFor decides the colour override for a destination: nil ("leave
// it to NO_COLOR") when the writer is a character device, and a forced
// off for everything else -- a pipe, a file, a test buffer. The
// TypeScript twin is `true === process.stderr.isTTY ? undefined :
// false`, and the *os.File test is how Go asks the same question.
func colorFor(w io.Writer) *bool {
	if f, isFile := w.(*os.File); isFile {
		if info, err := f.Stat(); nil == err &&
			0 != (info.Mode()&os.ModeCharDevice) {
			return nil
		}
	}
	off := false
	return &off
}

// run is main with its arguments, streams and terminal-ness injected,
// returning the process exit code. Separated from main so tests can
// drive the whole command with in-memory pipes.
func run(args []string, stdin io.Reader, stdout, stderr io.Writer, tty bool) int {
	// COLOUR OFF WHEN THE DESTINATION IS NOT A TERMINAL. Error frames
	// hardcoded their ANSI escapes, so a piped report carried terminal
	// control codes into whatever read them (the review's finding F).
	// NO_COLOR is honoured by the library itself; only the command can
	// see whether its stderr is a terminal, so only the command can
	// make this call. Mirrors ts/src/cli.ts main().
	aontu.SetColor(colorFor(stderr))

	// Subcommand dispatch, and deliberately only for a FIRST argument:
	// `aontu vet` is the verb, while `aontu somefile vet` keeps meaning
	// what it always did. A file named `vet` is still reachable as
	// `aontu ./vet`.
	if 0 < len(args) && "vet" == args[0] {
		return runVet(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "subsume" == args[0] {
		return runSubsume(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "breaking" == args[0] {
		return runBreaking(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "mod" == args[0] {
		return runMod(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "relations" == args[0] {
		return runRelations(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "jsonschema" == args[0] {
		return runJsonSchema(args[1:], stdout, stderr)
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
	if 0 < len(args) && "set" == args[0] {
		return runSet(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "why" == args[0] {
		return runWhy(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "get" == args[0] {
		return runGet(args[1:], stdout, stderr)
	}
	if 0 < len(args) && "hash" == args[0] {
		return runHash(args[1:], stdout, stderr)
	}

	mode := "json"
	jsonl := false
	// A LIST, though the bare command evaluates exactly one document.
	// It used to be one variable and the last argument won, which made
	// a MISTYPED VERB a silent success: `aontu vet2 schema.aon
	// good.json` printed good.json and exited 0, because `vet2` matched
	// no subcommand, fell through to this loop as a file name, and was
	// overwritten twice. In a tool loop that reads as a passing
	// validation. Counting them is what lets the refusal below happen.
	var files []string
	trust := trustArg{kind: "system-warn"}

	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch arg {
		case "-c", "--canon":
			mode = "canon"
		case "--jsonl":
			// The REPL's machine-drivable mode. helpText has advertised
			// this since G7 phase 7, and repl.go carried the whole
			// machinery behind it, but the switch had no case: `aontu
			// --jsonl` answered "unknown option" and exited 2, so the
			// flag was unreachable and the suite stayed green over it
			// because repl_test.go built replState{JSONL: true} by hand
			// (register, G7.7).
			jsonl = true
			// A JSONL answer is machine-read by definition, even when
			// the session happens to be attached to a terminal, so this
			// is a harder gate than the stderr test in run() rather
			// than a repeat of it: escapes inside the answer string are
			// noise the harness has to strip before it can compare
			// anything.
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
		default:
			if strings.HasPrefix(arg, "-") {
				fmt.Fprintf(stderr, "aontu: unknown option %s (try --help)\n", arg)
				return 2
			}
			files = append(files, arg)
		}
	}

	// ONE DOCUMENT. The bare form has always been `aontu [options]
	// [file]`, singular, and anything past the first was silently
	// discarded rather than refused -- so every way of getting the verb
	// wrong (a typo, a verb this port does not have, a verb spelled for
	// another tool) ended in a plausible answer about the wrong file.
	// Exit 2, the usage class, and the message names the cause rather
	// than the symptom: nothing here can tell a mistyped verb from a
	// second file, but the reader can.
	if 1 < len(files) {
		fmt.Fprintf(stderr,
			"aontu: the bare command evaluates one document, and %d were given\n"+
				"aontu: a mistyped verb reads as a file name (try --help)\n",
			len(files))
		return 2
	}

	file := ""
	if 0 < len(files) {
		file = files[0]
	}

	if file != "" {
		src, err := os.ReadFile(file)
		if err != nil {
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
		return emit(a, string(src), mode, stdout, stderr)
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
		return emit(a, string(src), mode, stdout, stderr)
	}

	repl(mode, jsonl, trust, stdin, stdout)
	return 0
}
