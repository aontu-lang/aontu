/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The trust flags (G5 phase 3) and the staged-flip warning window
// (phase 6): the Go twin of the trust-cli suite in
// ts/test/trust.test.ts.

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// srcPath spells a path for EMBEDDING IN SOURCE text: inside an @"..."
// include a backslash is an ESCAPE character, so a native Windows path
// interpolated raw is eaten by the lexer. The full note is on the twin
// helper in go/trust_test.go; the canonical port has had it since it
// was written (ts/test/trust.test.ts).
func srcPath(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}

// trustWorld: root/{in.aon, main.aon}, secret.aon OUTSIDE the root.
func trustCliWorld(t *testing.T) (dir, root, entry string) {
	t.Helper()
	dir = t.TempDir()
	root = filepath.Join(dir, "root")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	write := func(path, src string) {
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(root, "in.aon"), "f: 11")
	write(filepath.Join(dir, "secret.aon"), `secret: "outside"`)
	entry = filepath.Join(root, "main.aon")
	return dir, root, entry
}

func trustRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(args, strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

var trustSubcommandFirst = map[string][]string{"model": {"get"}}

// Measured, not listed, and remembered inside a run.
var trustRefusers []string

func trustRefusingVerbs() []string {
	if nil != trustRefusers {
		return trustRefusers
	}
	out := []string{}
	for _, verb := range knownVerbs {
		args := append([]string{verb}, trustSubcommandFirst[verb]...)
		args = append(args, "--trust", "bogus")
		_, errText, _ := trustRun(args...)
		if !strings.Contains(errText, "--trust needs") {
			out = append(out, verb)
		}
	}
	trustRefusers = out
	return out
}

// The verbs that TAKE the flags and whose answer neither flag can
// change from the command line. `why` and `remove` read the manifest
// and evaluate no document; `add`, `get` and `publish` refuse before
// any module is evaluated, so confining one needs a served registry.
// Each was measured. The twin list is in ts/test/trust.test.ts.
var trustNothingToConfine = []string{"add", "get", "publish", "remove", "why"}

// A verb in none of these fails here.
func trustPartition(t *testing.T, exercised map[string]bool) {
	t.Helper()
	got := append([]string{}, trustRefusingVerbs()...)
	got = append(got, trustNothingToConfine...)
	for verb := range exercised {
		got = append(got, verb)
	}
	want := append([]string{}, knownVerbs...)
	sort.Strings(got)
	sort.Strings(want)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("every verb is a refuser, has nothing to confine, or is "+
			"exercised: %v against %v", got, want)
	}
}

// A project whose VENDORED dependency carries the include under test.
// The package verbs evaluate a module's document, and an include in
// `pkg.aon` is not resolved at all, so the manifest gives the
// capability nothing to confine.
func trustPkgProject(t *testing.T, include string) string {
	t.Helper()
	dir := t.TempDir()
	store := filepath.Join(
		dir, "aontu_meta", "vendor", "corp.example", "schemas", "service")
	if err := os.MkdirAll(store, 0o700); nil != err {
		t.Fatal(err)
	}
	files := map[string]string{
		filepath.Join(dir, "pkg.aon"): "pkg: {path: \"corp.example/app\"}\n" +
			"dep: {\"corp.example/schemas/service\": {v: \"1.0.0\"}}\n",
		filepath.Join(store, "pkg.aon"): "pkg: {path: " +
			"\"corp.example/schemas/service\", main: \"service.aon\"}\n",
		filepath.Join(store, "doc.md"):      "# hi\n",
		filepath.Join(store, "service.aon"): include + "\nname: string\n",
	}
	for at, src := range files {
		if err := os.WriteFile(at, []byte(src), 0o600); nil != err {
			t.Fatal(err)
		}
	}
	return dir
}

func TestTrustCliNoneDenies(t *testing.T) {
	_, _, entry := trustCliWorld(t)
	if err := os.WriteFile(entry, []byte(`a:@"./in.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, errText, code := trustRun("--trust", "none", entry)
	if 1 != code || !strings.Contains(errText, "include denied") {
		t.Fatalf("code %d: %s", code, errText)
	}
}

func TestTrustCliIncludeRootConfines(t *testing.T) {
	dir, root, entry := trustCliWorld(t)
	if err := os.WriteFile(entry,
		[]byte(`a:@"`+srcPath(dir)+`/secret.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, errText, code := trustRun("--include-root", root, entry)
	if 1 != code || !strings.Contains(errText, "include denied") {
		t.Fatalf("code %d: %s", code, errText)
	}

	// The same escape under explicit system resolves, silently.
	_, errText, code = trustRun("--trust", "system", entry)
	if 0 != code || "" != errText {
		t.Fatalf("system: code %d, stderr %q", code, errText)
	}
}

func TestTrustCliRootDefaultsToTheEntryDirectory(t *testing.T) {
	dir, _, entry := trustCliWorld(t)
	if err := os.WriteFile(entry, []byte(`a:@"./in.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, code := trustRun("--trust", "root", entry); 0 != code {
		t.Fatalf("in-root: %d", code)
	}

	if err := os.WriteFile(entry,
		[]byte(`a:@"`+srcPath(dir)+`/secret.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, code := trustRun("--trust", "root", entry); 1 != code {
		t.Fatalf("escape: %d", code)
	}
	if _, _, code := trustRun("--trust", "root:"+dir, entry); 0 != code {
		t.Fatalf("wider root: %d", code)
	}
}

// The warning window of the staged default flip: the default posture
// still resolves, but every escape names the flag a future release
// will require — once per resolution, however many times it repeats.
func TestTrustCliDefaultWarnsOnEscape(t *testing.T) {
	dir, _, entry := trustCliWorld(t)
	if err := os.WriteFile(entry, []byte(
		`a:@"`+srcPath(dir)+`/secret.aon" b:@"`+srcPath(dir)+`/secret.aon" c:@"./in.aon"`,
	), 0o600); err != nil {
		t.Fatal(err)
	}
	_, errText, code := trustRun(entry)
	if 0 != code {
		t.Fatalf("code: %d (%s)", code, errText)
	}
	if 1 != strings.Count(errText,
		"warning: include resolved outside the entry root") {
		t.Fatalf("stderr: %q", errText)
	}
	if !strings.Contains(errText, "--trust system") {
		t.Fatalf("stderr names no flag: %q", errText)
	}
}

// Stdin evaluation runs under the same trust machinery, rooted at the
// working directory.
func TestTrustCliStdinNone(t *testing.T) {
	dir, _, _ := trustCliWorld(t)
	var out, errw bytes.Buffer
	code := run([]string{"--trust", "none"},
		strings.NewReader(`a:@"`+srcPath(dir)+`/secret.aon"`), &out, &errw, false)
	if 1 != code || !strings.Contains(errw.String(), "include denied") {
		t.Fatalf("code %d: %s", code, errw.String())
	}
}

func TestTrustCliEveryVerbHonoursTheCapability(t *testing.T) {
	dir, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "leak.aon")
	write := func(path, src string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(entry, `a:@"`+srcPath(dir)+`/secret.aon"`)
	data := filepath.Join(root, "data.json")
	write(data, "{}")
	overlay := filepath.Join(root, "overlay.aon")
	write(overlay, "")

	seen := map[string]bool{}
	denied := func(args ...string) {
		t.Helper()
		seen[args[0]] = true
		openOut, openErr, openCode := trustRun(args...)
		at := verbEnd(args)
		shutArgs := append(append(append([]string{}, args[:at]...), "--trust", "none"), args[at:]...)
		shutOut, shutErr, shutCode := trustRun(shutArgs...)
		if openCode == shutCode && openOut == shutOut && openErr == shutErr {
			t.Fatalf("the verb ignored --trust: %s", strings.Join(args, " "))
		}
		both := shutOut + shutErr
		if strings.Contains(both, "verdict: error") {
			return
		}
		if !strings.Contains(both, "include denied") &&
			!strings.Contains(both, "include_denied") {
			t.Fatalf("%s: no denial in %q", strings.Join(args, " "), both)
		}
	}

	denied("vet", entry, data)
	denied("model", "get", "$.a.secret", entry)
	denied("model", "why", "$.a.secret", entry)
	denied("subsume", entry, entry)
	denied("breaking", "--against", entry, entry)
	denied("relations", entry)
	denied("trim", "--check", entry)
	denied("reaches", "$.a", "$.a", entry)
	denied("jsonschema", entry)
	denied("view", "tree", entry)
	denied("view", "doc", entry)
	denied("hash", entry)
	denied("agentsmd", entry)
	denied("model", "set", "$.z=1", "--entry", entry, "--overlay", overlay)

	gen := filepath.Join(root, "gen.aon")
	write(gen, `@"`+srcPath(dir)+`/secret.aon"`+
		"\nout: file({ name: \"o.txt\" }, [\"x\"])\n")
	// A profile is the document `fmt` and `template` evaluate; neither
	// resolves an include in the file it rewrites.
	profile := filepath.Join(root, "prof.aon")
	write(profile, `@"`+srcPath(dir)+`/secret.aon"`+"\naontu: { Lang: {} }\n")
	generator := filepath.Join(root, "gen.ts")
	write(generator, "//- x: 1\nhello\n")

	denied("trace", entry)
	denied("render", gen, filepath.Join(dir, "out"))
	denied("fmt", entry, "--profile", profile)
	denied("template", generator, "--profile", profile)

	// The package verbs take a fresh project each run, because they
	// write a lockfile the next run would read.
	escape := `@"` + srcPath(dir) + `/secret.aon"`
	for _, args := range [][]string{{"sync"}, {"pkg", "tidy"}} {
		seen[args[0]] = true
		openOut, _, _ := trustRun(
			append(append([]string{}, args...), trustPkgProject(t, escape))...)
		shutOut, _, _ := trustRun(append(append(append([]string{}, args...),
			trustPkgProject(t, escape)), "--trust", "none")...)
		if !strings.Contains(openOut, "verdict: ok") {
			t.Fatalf("%s: %q", strings.Join(args, " "), openOut)
		}
		if !strings.Contains(shutOut, "does not evaluate on its own") {
			t.Fatalf("%s under --trust none: %q", strings.Join(args, " "), shutOut)
		}
	}

	trustPartition(t, seen)
}

func TestTrustCliEveryVerbHonoursTheTextExtensions(t *testing.T) {
	dir := t.TempDir()
	write := func(path, src string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(dir, "doc.md"), "# hi\n")
	entry := filepath.Join(dir, "main.aon")
	write(entry, "doc: @\"./doc.md\"\n")
	schema := filepath.Join(dir, "schema.aon")
	write(schema, "doc: string\n")
	overlay := filepath.Join(dir, "overlay.aon")

	refused := func(s string) bool {
		return strings.Contains(s, "include_extension") ||
			strings.Contains(s, "include not readable")
	}

	seen := map[string]bool{}
	both := func(args ...string) {
		t.Helper()
		seen[args[0]] = true
		bareOut, bareErr, _ := trustRun(args...)
		if !refused(bareOut + bareErr) {
			t.Fatalf("read the include with no flag: %s",
				strings.Join(args, " "))
		}
		wideOut, wideErr, _ := trustRun(append(args, "--text-ext", "md")...)
		if refused(wideOut + wideErr) {
			t.Fatalf("dropped --text-ext: %s\n%s",
				strings.Join(args, " "), wideOut+wideErr)
		}
	}

	both("vet", schema, entry)
	both("model", "get", "$.doc", entry)
	both("model", "why", "$.doc", entry)
	both("relations", entry)
	both("trim", "--check", entry)
	both("reaches", "$.doc", "$.doc", entry)
	both("jsonschema", entry)
	both("hash", entry)
	both("view", "tree", entry)
	both("view", "doc", entry)
	both("view", "layer", entry)
	both("agentsmd", entry)
	both("model", "set", "$.z=1", "--entry", entry, "--overlay", overlay)

	for _, args := range [][]string{
		{"subsume", schema, entry},
		{"breaking", "--against", entry, entry},
	} {
		seen[args[0]] = true
		bareOut, _, _ := trustRun(args...)
		if !strings.Contains(bareOut, "verdict: error") {
			t.Fatalf("read the include with no flag: %s",
				strings.Join(args, " "))
		}
		wideOut, _, _ := trustRun(append(args, "--text-ext", "md")...)
		if strings.Contains(wideOut, "verdict: error") {
			t.Fatalf("dropped --text-ext: %s\n%s",
				strings.Join(args, " "), wideOut)
		}
	}

	// THE STANZA'S SHAPE IS A SECOND EVALUATION and it takes the same
	// options: the canonical port listed the keys and then reported an
	// empty shape, because the read it came from refused the include
	// the read above it had honoured.
	stanza, _, _ := trustRun("agentsmd", entry, "--text-ext", "md")
	if !strings.Contains(stanza, "- Shape: `{\"doc\":string}`") {
		t.Fatalf("agentsmd shape: %q", stanza)
	}

	// `set` WRITES, so a dropped flag here is not a wrong answer but a
	// wrong file -- or, as it was, no file where the other port wrote
	// one.
	if b, err := os.ReadFile(overlay); nil != err || "\"z\": 1\n" != string(b) {
		t.Fatalf("set overlay: %q %v", string(b), err)
	}

	gen := filepath.Join(dir, "gen.aon")
	write(gen, "doc: @\"./doc.md\"\nout: file({ name: \"o.txt\" }, [\"x\"])\n")
	profile := filepath.Join(dir, "prof.aon")
	write(profile, "doc: @\"./doc.md\"\naontu: { Lang: {} }\n")
	generator := filepath.Join(dir, "gen.ts")
	write(generator, "//- x: 1\nhello\n")

	both("trace", entry)
	both("render", gen, filepath.Join(dir, "out"))
	both("fmt", entry, "--profile", profile)
	both("template", generator, "--profile", profile)

	// The package verbs read a MODULE's document, so the extension
	// that has to be readable is one inside the closure.
	for _, args := range [][]string{{"sync"}, {"pkg", "tidy"}} {
		seen[args[0]] = true
		bareOut, _, _ := trustRun(append(append([]string{}, args...),
			trustPkgProject(t, "doc: @\"./doc.md\""))...)
		wideOut, _, _ := trustRun(append(append(append([]string{}, args...),
			trustPkgProject(t, "doc: @\"./doc.md\"")), "--text-ext", "md")...)
		if !strings.Contains(bareOut, "does not evaluate on its own") {
			t.Fatalf("%s with no flag: %q", strings.Join(args, " "), bareOut)
		}
		if !strings.Contains(wideOut, "verdict: ok") {
			t.Fatalf("%s dropped --text-ext: %q", strings.Join(args, " "), wideOut)
		}
	}

	trustPartition(t, seen)
}

// --include-root confines a verb to a directory, the CLI's own root:
// spelling, and a bare `root` means the document's directory.
func TestTrustCliVerbsTakeIncludeRoot(t *testing.T) {
	dir, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "leak.aon")
	inside := filepath.Join(root, "fine.aon")
	write := func(path, src string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(entry, `a:@"`+srcPath(dir)+`/secret.aon"`)
	write(inside, `a:@"./in.aon"`)

	out, errText, _ := trustRun("model", "get", "$.a.secret", "--include-root", root, entry)
	if !strings.Contains(out+errText, "include denied") {
		t.Fatalf("confined: %q %q", out, errText)
	}
	if _, _, code := trustRun(
		"model", "get", "$.a.f", "--include-root", root, inside); 0 != code {
		t.Fatalf("in-root: %d", code)
	}
	// A bare `root` confines to the document's own directory.
	if _, _, code := trustRun("model", "get", "$.a.f", "--trust", "root", inside); 0 != code {
		t.Fatalf("bare root, in-root: %d", code)
	}
	out, errText, _ = trustRun("model", "get", "$.a.secret", "--trust", "root", entry)
	if !strings.Contains(out+errText, "include denied") {
		t.Fatalf("bare root, escape: %q %q", out, errText)
	}
	// A bad spelling is the usage class, from a verb as from the bare
	// command.
	if _, _, code := trustRun("model", "get", "$.a", "--trust", "bogus", inside); 2 != code {
		t.Fatalf("bogus: %d", code)
	}
	if _, _, code := trustRun("model", "get", "$.a", inside, "--include-root"); 2 != code {
		t.Fatalf("bare --include-root: %d", code)
	}
}

// The REPL took --trust and DROPPED it: the --jsonl session mode, built
// to be driven by a harness, evaluated unconfined however it was
// invoked.
func TestTrustCliReplHonoursTheCapability(t *testing.T) {
	dir, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "leak.aon")
	if err := os.WriteFile(entry,
		[]byte(`a:@"`+srcPath(dir)+`/secret.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	read := func(f string) (string, error) {
		raw, err := os.ReadFile(f)
		return string(raw), err
	}

	open := replCommand(
		replState{Mode: "json", JSONL: true}, ":load "+entry, read)
	if !strings.Contains(open.Out, "outside") {
		t.Fatalf("default: %q", open.Out)
	}

	shut := replCommand(
		replState{Mode: "json", JSONL: true, Trust: trustArg{kind: "none"}},
		":load "+entry, read)
	if !strings.Contains(shut.Out, "include denied") ||
		strings.Contains(shut.Out, "outside") {
		t.Fatalf("none: %q", shut.Out)
	}

	// A bare snippet -- no file of its own -- is confined too.
	snippet := replCommand(
		replState{Mode: "json", JSONL: true, Trust: trustArg{kind: "none"}},
		`a:@"`+srcPath(dir)+`/secret.aon"`, read)
	if !strings.Contains(snippet.Out, "include denied") {
		t.Fatalf("snippet: %q", snippet.Out)
	}
}

func TestTrustCliUsageErrorsExit2(t *testing.T) {
	for _, args := range [][]string{
		{"--trust"},
		{"--trust", "everything"},
		{"--trust", "root:"},
		{"--include-root"},
	} {
		if _, _, code := trustRun(args...); 2 != code {
			t.Fatalf("%v: code %d", args, code)
		}
	}
}

func TestTrustCliEveryVerbRefusesABadSpelling(t *testing.T) {
	_, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "main.aon")
	if err := os.WriteFile(entry, []byte(`a:@"./in.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	data := filepath.Join(root, "data.json")
	if err := os.WriteFile(data, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	overlay := filepath.Join(root, "overlay.aon")
	if err := os.WriteFile(overlay, []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}

	tails := [][]string{
		{"vet", entry, data},
		{"model", "get", "$.a.f", entry},
		{"model", "why", "$.a.f", entry},
		{"subsume", entry, entry},
		{"breaking", "--against", entry, entry},
		{"relations", entry},
		{"trim", "--check", entry},
		{"hash", entry},
		{"agentsmd", entry},
		{"model", "set", "$.z=1", "--entry", entry, "--overlay", overlay},
		{"pkg", "tidy", root},
	}
	for _, tail := range tails {
		at := verbEnd(tail)
		args := append(append(append([]string{}, tail[:at]...), "--trust", "everything"), tail[at:]...)
		_, errText, code := trustRun(args...)
		if 2 != code {
			t.Fatalf("%s: code %d (%s)", tail[0], code, errText)
		}
		if !strings.Contains(errText, "--trust needs") {
			t.Fatalf("%s: stderr %q", tail[0], errText)
		}
	}

	// EVERY verb, from this port's own list rather than named here: a
	// flag-taker answers the usage error and exits 2, and a refuser
	// does not, which is the partition the help is held to. No
	// arguments are needed, because the flags are stripped before a
	// verb parses its tail.
	refuses := map[string]bool{}
	for _, verb := range trustRefusingVerbs() {
		refuses[verb] = true
	}
	for _, verb := range knownVerbs {
		args := append([]string{verb}, trustSubcommandFirst[verb]...)
		_, errText, code := trustRun(append(args, "--trust")...)
		if refuses[verb] {
			if strings.Contains(errText, "--trust needs") {
				t.Fatalf("%s: a refuser answered about the value: %q", verb, errText)
			}
			continue
		}
		if 2 != code || !strings.Contains(errText, "--trust needs") {
			t.Fatalf("%s: code %d, stderr %q", verb, code, errText)
		}
	}
}

// verbEnd is where a flag goes: after the subverb of a two-word verb.
func verbEnd(args []string) int {
	if "model" == args[0] || "pkg" == args[0] {
		return 2
	}
	return 1
}

// The help's exception clause, held to this port's parser: a verb that
// takes the flag reports the bad VALUE, and lsp refuses without naming
// the option, which is how a name-keyed probe scored it as taking. The
// twin reads the same clause in ts/test/trust.test.ts.
func TestTrustHelpNamesEveryVerbThatRefusesTheCapability(t *testing.T) {
	at := strings.Index(helpText, "  --trust <t>     ")
	if 0 > at {
		t.Fatal("no --trust entry in helpText")
	}
	entry := helpText[at:]
	if end := strings.Index(entry, "\n  --include-root"); 0 <= end {
		entry = entry[:end]
	}
	if !strings.Contains(entry, "Every verb takes it") {
		t.Fatal("the --trust entry moved: this test reads it by that clause")
	}

	named := []string{}
	for _, verb := range knownVerbs {
		if regexp.MustCompile(`\b` + verb + `\b`).MatchString(entry) {
			named = append(named, verb)
		}
	}
	refuses := append([]string{}, trustRefusingVerbs()...)
	sort.Strings(refuses)
	sort.Strings(named)
	if strings.Join(named, ",") != strings.Join(refuses, ",") {
		t.Fatalf("the --trust entry names %v, the parser refuses %v",
			named, refuses)
	}
}

// `--trust root:` is a usage error, and its shorthand is one too: an
// empty argument names no directory to confine below.
func TestTrustIncludeRootRefusesAnEmptyDirectory(t *testing.T) {
	for _, args := range [][]string{
		{"--include-root", "", "x.aon"},
		{"vet", "--include-root", "", "a.aon", "b.aon"},
	} {
		var out, errw bytes.Buffer
		if code := run(args, strings.NewReader(""), &out, &errw, false); 2 != code {
			t.Fatalf("%v: code %d, want 2", args, code)
		}
		if !strings.Contains(errw.String(), "--include-root needs a directory") {
			t.Fatalf("%v: %q", args, errw.String())
		}
	}
}

// The flags ride anywhere in a verb's tail, model's subcommand
// included: the answer is the same on either side of it.
func TestTrustModelTakesTheCapabilityBeforeItsSubcommand(t *testing.T) {
	dir, root, entry := trustCliWorld(t)
	src := `a:@"` + srcPath(dir) + `/secret.aon"`
	if err := os.WriteFile(entry, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	_ = root

	answer := func(args ...string) (int, string) {
		var out, errw bytes.Buffer
		code := run(args, strings.NewReader(""), &out, &errw, false)
		return code, errw.String()
	}
	beforeCode, beforeErr := answer(
		"model", "--trust", "none", "get", "$.a", entry)
	afterCode, afterErr := answer(
		"model", "get", "--trust", "none", "$.a", entry)
	if beforeCode != afterCode || beforeErr != afterErr {
		t.Fatalf("flag before the subcommand: (%d,%q), after: (%d,%q)",
			beforeCode, beforeErr, afterCode, afterErr)
	}
	if !strings.Contains(beforeErr, "include_denied") {
		t.Fatalf("no denial: %q", beforeErr)
	}

	// A flag's VALUE is not the subcommand: get is the extension list.
	if code, errs := answer(
		"model", "--text-ext", "get", "$.a", entry); 2 != code ||
		!strings.Contains(errs, "model needs get, why or set") {
		t.Fatalf("--text-ext get: code %d, %q", code, errs)
	}
}
