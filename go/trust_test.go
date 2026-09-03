/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// The trust profile (G5 phase 3, docs/trust.md): the Go twin of
// ts/test/trust.test.ts's engine half — include capabilities, the
// include manifest, and the deterministic budgets. The shared contract
// rows are test/spec/include-trust.tsv (both runners); the CLI and LSP
// halves live beside their packages (cmd/aontu, lsp).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// srcPath spells a path for EMBEDDING IN SOURCE text. Inside an @"..."
// include a backslash is an ESCAPE character, so a native Windows path
// interpolated raw is eaten by the lexer: C:\Users\RUNNER\...\root
// arrives as C:UsersRUNNER...oot, because \U, \A and \r are string
// escapes and \r is a carriage return. Go accepts forward slashes on
// every platform, so sources spell paths that way; filesystem calls
// keep native paths.
//
// The canonical port has had this since it was written
// (ts/test/trust.test.ts, `sp`) and this twin never got it, which
// nothing noticed because the Go CI matrix declared windows-latest
// while hardcoding runs-on: ubuntu-latest -- so the Windows job had
// never once run on Windows. Fixing the matrix is what surfaced it.
//
// An unconditional replace, NOT filepath.ToSlash, and deliberately:
// ToSlash is a no-op wherever the separator is already '/', so the
// behaviour this helper exists for would be exercised on Windows
// alone -- the one platform a contributor cannot run. Spelling the
// rule outright makes it the same code everywhere, testable here, and
// character-for-character the rule the canonical twin applies.
//
// NOT named `sp`, which is what the canonical twin calls it: in this
// package `sp` is a domain term -- the SOURCE POSITION carried on every
// Val (`base.sp`, and `func(sp int) Val` throughout lang.go) -- so a
// package-level `sp(string) string` would be shadowed by dozens of
// locals and read as the wrong thing at every call site.
func srcPath(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}

// trustWorld builds a little world to confine: root/{in.aon, nest.aon,
// sub/deep.aon}, with secret.aon OUTSIDE the root and a symlink inside
// pointing at it. The symlink is best-effort: Windows refuses one
// without Developer Mode or elevation, and the single test that needs
// it skips rather than failing for a reason that is not about Aontu.
func trustWorld(t *testing.T) (dir, root string) {
	t.Helper()
	dir = t.TempDir()
	root = filepath.Join(dir, "root")
	if err := os.MkdirAll(filepath.Join(root, "sub"), 0o700); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		filepath.Join(root, "in.aon"):          "f: 11",
		filepath.Join(root, "nest.aon"):        "@\"in.aon\"\ng: 22",
		filepath.Join(root, "sub", "deep.aon"): "h: 33",
		filepath.Join(dir, "secret.aon"):       `secret: "outside"`,
	}
	for path, src := range files {
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(filepath.Join(dir, "secret.aon"),
		filepath.Join(root, "link.aon")); err != nil {
		// Not fatal: see the note above. trustSymlink reports it.
		t.Logf("symlink unavailable on this platform: %v", err)
	}
	return dir, root
}

// trustSymlink skips the calling test when the world's symlink could
// not be created, which on Windows is a privilege question rather than
// a defect in anything this suite is testing.
func trustSymlink(t *testing.T, root string) {
	t.Helper()
	if _, err := os.Lstat(filepath.Join(root, "link.aon")); err != nil {
		t.Skip("symlink not available on this platform")
	}
}

func trustCode(t *testing.T, trust *TrustOptions, src string) string {
	t.Helper()
	a := New()
	a.Trust = trust
	_, err := a.Generate(src)
	if err == nil {
		return ""
	}
	ae, ok := err.(*AontuError)
	if !ok {
		t.Fatalf("expected *AontuError, got %T: %v", err, err)
	}
	return ae.Code
}

func TestTrustNoneDeniesEveryInclude(t *testing.T) {
	_, root := trustWorld(t)
	code := trustCode(t, &TrustOptions{IncludeNone: true},
		`a:@"`+srcPath(root)+`/in.aon"`)
	if "include_denied" != code {
		t.Fatalf("code: %q", code)
	}
}

func TestTrustMemIsTheWholeWorld(t *testing.T) {
	mem := map[string]string{"/virtual/x.aon": "m: 33"}
	a := New()
	a.Trust = &TrustOptions{IncludeMem: mem}
	out, err := a.Generate(`a:@"/virtual/x.aon"`)
	if err != nil {
		t.Fatal(err)
	}
	if m := out.(map[string]any)["a"].(map[string]any); int64(33) != m["m"] {
		t.Fatalf("mem load: %v", out)
	}

	// A miss in the declared set is NOT-FOUND, not denial: the allowed
	// mechanism ran and missed.
	b := New()
	b.Trust = &TrustOptions{IncludeMem: mem}
	if _, err := b.Generate(`a:@"/nope.aon"`); err == nil ||
		!strings.Contains(err.Error(), "not found") {
		t.Fatalf("mem miss: %v", err)
	}
}

func TestTrustRootConfinesBelowTheRoot(t *testing.T) {
	_, root := trustWorld(t)

	a := New()
	a.Trust = &TrustOptions{IncludeRoot: root}
	out, err := a.Generate(`a:@"` + srcPath(root) + `/sub/deep.aon"`)
	if err != nil {
		t.Fatal(err)
	}
	if m := out.(map[string]any)["a"].(map[string]any); int64(33) != m["h"] {
		t.Fatalf("in-root load: %v", out)
	}

	code := trustCode(t, &TrustOptions{IncludeRoot: root},
		`a:@"`+srcPath(root)+`/../secret.aon"`)
	if "include_denied" != code {
		t.Fatalf("escape code: %q", code)
	}
}

// Confinement is realpath-then-prefix-check: a symlink INSIDE the root
// pointing outside it is an escape, not a loophole.
func TestTrustRootDeniesASymlinkEscape(t *testing.T) {
	_, root := trustWorld(t)
	trustSymlink(t, root)
	code := trustCode(t, &TrustOptions{IncludeRoot: root},
		`a:@"`+srcPath(root)+`/link.aon"`)
	if "include_denied" != code {
		t.Fatalf("symlink code: %q", code)
	}
}

func TestTrustRootMissIsNotFoundNotDenied(t *testing.T) {
	_, root := trustWorld(t)
	a := New()
	a.Trust = &TrustOptions{IncludeRoot: root}
	if _, err := a.Generate(`a:@"` + srcPath(root) + `/nope.aon"`); err == nil ||
		!strings.Contains(err.Error(), "not found") {
		t.Fatalf("root miss: %v", err)
	}
}

// The include MANIFEST (docs/trust.md): the resolved closure as sorted,
// deduplicated { path, capability } — hermeticity clause 1's "file set"
// made observable.
// THE VERB OPTIONS CARRY THE CAPABILITY, not just the evaluator. Every
// report surface -- Vet, Subsume, Get, Why, Patch, RelationCheck,
// TrimCheck, AgentsMd -- builds its own engine from a path, and G5
// wired --trust to the bare command alone, so each of them ran the full
// system resolver with no way to confine it (use-cases/REVIEW.md
// finding G). This is the library half of that fix: an option struct's
// Trust must reach the engine underneath. The CLI half is
// TestTrustCliEveryVerbHonoursTheCapability in cmd/aontu.
func TestTrustVerbOptionsConfineTheEngine(t *testing.T) {
	dir, root := trustWorld(t)
	entry := filepath.Join(root, "leak.aon")
	src := `a:@"` + srcPath(dir) + `/secret.aon"`
	if err := os.WriteFile(entry, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	none := &TrustOptions{IncludeNone: true}

	// Vet: the schema leg. Unconfined the escape resolves and the
	// document is valid; confined it cannot be read at all.
	if v := Vet(src, "{}", &VetOptions{SchemaPath: entry}).Verdict; VetValid != v {
		t.Fatalf("vet, unconfined: %s", v)
	}
	if v := Vet(src, "{}", &VetOptions{
		SchemaPath: entry, Trust: none}).Verdict; VetValid == v {
		t.Fatalf("vet ignored Trust: %s", v)
	}

	// Subsume, both sides through the same load.
	if v := Subsume(src, src, &SubsumeOptions{
		GeneralPath: entry, SpecificPath: entry}).Verdict; SubsumeYes != v {
		t.Fatalf("subsume, unconfined: %s", v)
	}
	if v := Subsume(src, src, &SubsumeOptions{
		GeneralPath: entry, SpecificPath: entry,
		Trust: none}).Verdict; SubsumeError != v {
		t.Fatalf("subsume ignored Trust: %s", v)
	}

	// PolicyCompatTrust: `breaking` reads its own mode by EVALUATING the
	// document, so that leg runs the resolver too. It answers "" for a
	// document that does not stand up, which a denied include makes it.
	policy := "aontu_policy: { compat: \"forward\" }\n" + src
	if m := PolicyCompatTrust(policy, entry, nil); "forward" != m {
		t.Fatalf("policy, unconfined: %q", m)
	}
	if m := PolicyCompatTrust(policy, entry, none); "" != m {
		t.Fatalf("policy ignored trust: %q", m)
	}

	// Patch: the vet underneath `set`. Its Trust field was declared and
	// never passed on -- the hole this test would have caught.
	if v := Patch(src, "", []string{"$.z=1"}, &PatchOptions{
		EntryPath: entry, OverlayPath: entry}).Verdict; VetValid != v {
		t.Fatalf("patch, unconfined: %s", v)
	}
	if v := Patch(src, "", []string{"$.z=1"}, &PatchOptions{
		EntryPath: entry, OverlayPath: entry,
		Trust: none}).Verdict; VetValid == v {
		t.Fatalf("patch ignored Trust: %s", v)
	}

	// The query surfaces take the capability from the ENGINE -- Get and
	// Why are methods, so aontuForPathTrust is what the CLI hands them
	// and there is no second place for a caller to set it (the
	// canonical port's get/why are free functions and take it in
	// options; ADR-001 is a contract on behaviour, not on API shape).
	open := aontuForPathTrust(entry, nil, nil)
	if got := open.Get(src, "$.a.secret", nil); !got.OK {
		t.Fatalf("get, unconfined: %+v", got.Findings)
	}
	shut := aontuForPathTrust(entry, none, nil)
	if got := shut.Get(src, "$.a.secret", nil); got.OK {
		t.Fatal("get ignored the capability")
	}
	if got := aontuForPathTrust(entry, none, nil).Why(src, "$.a.secret"); got.OK {
		t.Fatal("why ignored the capability")
	}
}

func TestTrustDepsListsTheSortedDedupedClosure(t *testing.T) {
	_, root := trustWorld(t)
	a := New()
	a.Trust = &TrustOptions{IncludeRoot: root}
	if _, err := a.Parse(
		`a:@"` + srcPath(root) + `/nest.aon" b:@"` + srcPath(root) + `/in.aon" c:@"` + srcPath(root) + `/in.aon"`,
	); err != nil {
		t.Fatal(err)
	}
	want := []IncludeDep{
		{Path: filepath.Join(root, "in.aon"), Capability: "file"},
		{Path: filepath.Join(root, "nest.aon"), Capability: "file"},
	}
	if len(want) != len(a.IncludeDeps) {
		t.Fatalf("deps: %v", a.IncludeDeps)
	}
	for i, dep := range want {
		if dep != a.IncludeDeps[i] {
			t.Fatalf("deps[%d]: want %v got %v", i, dep, a.IncludeDeps[i])
		}
	}
}

func TestTrustDepsIsEmptyWithoutIncludes(t *testing.T) {
	a := New()
	if _, err := a.Parse("x: 1"); err != nil {
		t.Fatal(err)
	}
	if 0 != len(a.IncludeDeps) {
		t.Fatalf("deps: %v", a.IncludeDeps)
	}
}

// THE EXTENSION DECIDES INSIDE THE MEM CAPABILITY TOO (ADR-012). A
// virtual file set is still a file set: its keys carry extensions, and
// the same rule has to read them, or the capability becomes a way to
// include what the filesystem would refuse. The shared spec rows cannot
// reach this leg -- they resolve real files -- so it is pinned here.
func TestMemCapabilityGatesTheExtension(t *testing.T) {
	// `.csv` rather than `.txt`: the extension this example used is now
	// READ, as one string scalar, so it no longer demonstrates a gate.
	// `.csv` is still refused -- and for the ADR-001 reason, which is
	// the sharpest one to pin here.
	a := New()
	a.Trust = &TrustOptions{IncludeMem: map[string]string{"/v/rows.csv": "m: 1"}}
	_, err := a.Parse(`a:@"/v/rows.csv"`)
	if nil == err {
		t.Fatal("a .csv in the mem set was read")
	}
	if !strings.Contains(err.Error(), "include not readable") ||
		!strings.Contains(err.Error(), "extension: .csv") {
		t.Fatalf("err: %v", err)
	}
	// ... and a key the table DOES name is read, so the gate is the
	// extension and not the capability.
	b := New()
	b.Trust = &TrustOptions{IncludeMem: map[string]string{"/v/x.aon": "m: 1"}}
	if _, err := b.Parse(`a:@"/v/x.aon"`); err != nil {
		t.Fatal(err)
	}
}

func TestTrustDepsNamesTheMemCapability(t *testing.T) {
	a := New()
	a.Trust = &TrustOptions{IncludeMem: map[string]string{"/v/x.aon": "m: 1"}}
	if _, err := a.Parse(`a:@"/v/x.aon"`); err != nil {
		t.Fatal(err)
	}
	want := IncludeDep{Path: "/v/x.aon", Capability: "mem"}
	if 1 != len(a.IncludeDeps) || want != a.IncludeDeps[0] {
		t.Fatalf("deps: %v", a.IncludeDeps)
	}
}

// The budgets are integer counts of engine events, deterministic by
// construction; zero means the shared spec constants
// (test/spec/budget.tsv). A chain needing more passes than the budget
// exhausts LOUDLY — budget_passes, never silent truncation — including
// at Passes:1, where the still-refining snapshot must be taken at the
// final pass's entry (there is no earlier pass).
func TestTrustPassesBudgetExhaustsLoudly(t *testing.T) {
	chain := "a1:$.a2 a2:$.a3 a3:$.a4 a4:1"
	code := trustCode(t,
		&TrustOptions{Budget: TrustBudget{Passes: 1}}, chain)
	if "budget_passes" != code {
		t.Fatalf("code: %q", code)
	}
	// The same document under the default budget resolves.
	if "" != trustCode(t, nil, chain) {
		t.Fatal("default budget should resolve the chain")
	}
}

func TestTrustDepthBudgetTripsUnifyCycle(t *testing.T) {
	code := trustCode(t,
		&TrustOptions{Budget: TrustBudget{Depth: 3}}, "a:{b:{c:{d:{e:1}}}}")
	if "unify_cycle" != code {
		t.Fatalf("code: %q", code)
	}
}

// The staged-flip warning window (G5 phase 6): the 'system' posture
// still resolves, but an escape past TrustWarnRoot calls TrustWarn —
// once per resolution, however many times it repeats.
func TestTrustWarnOnEscape(t *testing.T) {
	dir, root := trustWorld(t)
	var warned []string
	a := NewWithBase(root)
	a.TrustWarn = func(kind, path string) { warned = append(warned, kind+" "+path) }
	a.TrustWarnRoot = root
	if _, err := a.Generate(
		`a:@"` + srcPath(dir) + `/secret.aon" b:@"in.aon"`); err != nil {
		t.Fatal(err)
	}
	if 1 != len(warned) || !strings.HasPrefix(warned[0], "escape ") {
		t.Fatalf("warned: %v", warned)
	}
}

// A root that does not exist still confines: realpath falls back to
// the lexical form, and everything real is outside a nonexistent
// directory.
func TestTrustNonexistentRootStillConfines(t *testing.T) {
	_, root := trustWorld(t)
	code := trustCode(t,
		&TrustOptions{IncludeRoot: filepath.Join(root, "no-such-root")},
		`a:@"`+srcPath(root)+`/in.aon"`)
	if "include_denied" != code {
		t.Fatalf("code: %q", code)
	}
}

// The sink accessors are nil-safe by contract (the resolver can run in
// a parse that carries no trust sink at all): the guards are exercised
// directly, the recordNotFound precedent (coverage3_test.go).
func TestTrustSinkNilGuards(t *testing.T) {
	if nil != trustSinkOf(nil) {
		t.Fatal("nil ctx must yield nil sink")
	}
	recordDenied(nil, "p", "none")       // must not panic
	recordDep(nil, "p", "file")          // must not panic
	recordDep(&trustSink{}, "p", "file") // nil deps slice: must not panic

	// recordText is the same contract: a sink with no text map, and a
	// resolution with no path to file its text under, are both no-ops
	// rather than a panic or an entry keyed on "".
	recordText(nil, "p", "a:1")
	recordText(&trustSink{}, "p", "a:1")
	sink := &trustSink{texts: map[string]string{}}
	recordText(sink, "", "a:1")
	if 0 != len(sink.texts) {
		t.Fatalf("a pathless source was filed anyway: %+v", sink.texts)
	}
}
