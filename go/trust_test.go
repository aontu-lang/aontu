/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func srcPath(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}

func trustWorld(t *testing.T) (dir, root string) {
	t.Helper()
	dir = t.TempDir()
	root = filepath.Join(dir, "root")
	if err := os.MkdirAll(filepath.Join(root, "sub"), 0o700); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		filepath.Join(root, "in.aontu"):          "f: 11",
		filepath.Join(root, "nest.aontu"):        "@\"./in.aontu\"\ng: 22",
		filepath.Join(root, "sub", "deep.aontu"): "h: 33",
		filepath.Join(dir, "secret.aontu"):       `secret: "outside"`,
	}
	for path, src := range files {
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(filepath.Join(dir, "secret.aontu"),
		filepath.Join(root, "link.aontu")); err != nil {
		// Not fatal: trustSymlink skips the calling test.
		t.Logf("symlink unavailable on this platform: %v", err)
	}
	return dir, root
}

// trustSymlink skips the calling test when the world's symlink could
// not be created, which on Windows is a privilege question rather than
// a defect in anything this suite is testing.
func trustSymlink(t *testing.T, root string) {
	t.Helper()
	if _, err := os.Lstat(filepath.Join(root, "link.aontu")); err != nil {
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
		`a:@"`+srcPath(root)+`/in.aontu"`)
	if "include_denied" != code {
		t.Fatalf("code: %q", code)
	}
}

func TestTrustMemIsTheWholeWorld(t *testing.T) {
	mem := map[string]string{"/virtual/x.aontu": "m: 33"}
	a := New()
	a.Trust = &TrustOptions{IncludeMem: mem}
	out, err := a.Generate(`a:@"/virtual/x.aontu"`)
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
	if _, err := b.Generate(`a:@"/nope.aontu"`); err == nil ||
		!strings.Contains(err.Error(), "not found") {
		t.Fatalf("mem miss: %v", err)
	}
}

func TestBundledModelIsNotShadowedByMem(t *testing.T) {
	a := New()
	a.Trust = &TrustOptions{IncludeMem: map[string]string{
		"aontu:system": "system: {HIJACKED: 1}",
	}}
	out, err := a.Generate("@\"aontu:system\"\np: $.aontu.System.Port & {}")
	if err != nil {
		t.Fatal(err)
	}
	m := out.(map[string]any)
	if _, hijacked := m["HIJACKED"]; hijacked {
		t.Fatalf("bundled model was shadowed: %v", out)
	}
	p, ok := m["p"].(map[string]any)
	if !ok || "in" != p["direction"] {
		t.Fatalf("engine copy not served: %v", out)
	}
}

func TestTrustRootConfinesBelowTheRoot(t *testing.T) {
	_, root := trustWorld(t)

	a := New()
	a.Trust = &TrustOptions{IncludeRoot: root}
	out, err := a.Generate(`a:@"` + srcPath(root) + `/sub/deep.aontu"`)
	if err != nil {
		t.Fatal(err)
	}
	if m := out.(map[string]any)["a"].(map[string]any); int64(33) != m["h"] {
		t.Fatalf("in-root load: %v", out)
	}

	code := trustCode(t, &TrustOptions{IncludeRoot: root},
		`a:@"`+srcPath(root)+`/../secret.aontu"`)
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
		`a:@"`+srcPath(root)+`/link.aontu"`)
	if "include_denied" != code {
		t.Fatalf("symlink code: %q", code)
	}
}

func TestTrustRootMissIsNotFoundNotDenied(t *testing.T) {
	_, root := trustWorld(t)
	a := New()
	a.Trust = &TrustOptions{IncludeRoot: root}
	if _, err := a.Generate(`a:@"` + srcPath(root) + `/nope.aontu"`); err == nil ||
		!strings.Contains(err.Error(), "not found") {
		t.Fatalf("root miss: %v", err)
	}
}

func TestTrustVerbOptionsConfineTheEngine(t *testing.T) {
	dir, root := trustWorld(t)
	entry := filepath.Join(root, "leak.aontu")
	src := `a:@"` + srcPath(dir) + `/secret.aontu"`
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
	if m := PolicyCompatTrust(policy, entry, nil, nil); "forward" != m {
		t.Fatalf("policy, unconfined: %q", m)
	}
	if m := PolicyCompatTrust(policy, entry, none, nil); "" != m {
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
		`a:@"` + srcPath(root) + `/nest.aontu" b:@"` + srcPath(root) + `/in.aontu" c:@"` + srcPath(root) + `/in.aontu"`,
	); err != nil {
		t.Fatal(err)
	}
	want := []IncludeDep{
		{Path: filepath.Join(root, "in.aontu"), Capability: "file"},
		{Path: filepath.Join(root, "nest.aontu"), Capability: "file"},
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
	b.Trust = &TrustOptions{IncludeMem: map[string]string{"/v/x.aontu": "m: 1"}}
	if _, err := b.Parse(`a:@"/v/x.aontu"`); err != nil {
		t.Fatal(err)
	}
}

func TestTrustDepsNamesTheMemCapability(t *testing.T) {
	a := New()
	a.Trust = &TrustOptions{IncludeMem: map[string]string{"/v/x.aontu": "m: 1"}}
	if _, err := a.Parse(`a:@"/v/x.aontu"`); err != nil {
		t.Fatal(err)
	}
	want := IncludeDep{Path: "/v/x.aontu", Capability: "mem"}
	if 1 != len(a.IncludeDeps) || want != a.IncludeDeps[0] {
		t.Fatalf("deps: %v", a.IncludeDeps)
	}
}

func TestTrustPassesBudgetExhaustsLoudly(t *testing.T) {
	chain := "a1:$.a2 a2:$.a3 a3:$.a4 a4:1"
	code := trustCode(t,
		&TrustOptions{Budget: TrustBudget{Passes: 1}}, chain)
	if "budget_passes" != code {
		t.Fatalf("code: %q", code)
	}
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
		`a:@"` + srcPath(dir) + `/secret.aontu" b:@"./in.aontu"`); err != nil {
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
		`a:@"`+srcPath(root)+`/in.aontu"`)
	if "include_denied" != code {
		t.Fatalf("code: %q", code)
	}
}

func TestTrustSinkNilGuards(t *testing.T) {
	if nil != trustSinkOf(nil) {
		t.Fatal("nil ctx must yield nil sink")
	}
	recordDenied(nil, "p", "none")
	recordDep(nil, "p", "file")
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

func TestTextExtWideningAndItsLimits(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	md := write("doc.md", "# hi\n")
	js := write("exec.js", "module.exports={pwned:true}\n")
	toml := write("conf.toml", "port = 8080\n")

	// srcPath, because these paths are embedded in Aontu SOURCE and a
	// backslash there is a string escape: on Windows the raw path
	// arrived as `C:UsersRUNNER~1AppData...`, every separator eaten.
	// The helper above exists for this and this test did not use it.
	a := New()
	a.TextExt = []string{"md"}
	v, err := a.Parse(`x:@"` + srcPath(md) + `"`)
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Canon(); `{"x":"# hi\n"}` != got {
		t.Fatalf("widened md: %s", got)
	}

	b := New()
	b.TextExt = []string{"js"}
	if _, err := b.Parse(`x:@"` + srcPath(js) + `"`); nil == err ||
		!strings.Contains(err.Error(), "include not readable") ||
		!strings.Contains(err.Error(), "extension: .js") {
		t.Fatalf("js was widened: %v", err)
	}

	// A WIDENING NEVER OVERWRITES a format the table already names:
	// documents rely on what `.toml` means, so it stays parsed rather
	// than becoming its own source text.
	c := New()
	c.TextExt = []string{"toml"}
	tv, err := c.Parse(`x:@"` + srcPath(toml) + `"`)
	if err != nil {
		t.Fatal(err)
	}
	if got := tv.Canon(); `{"x":{"port":8080}}` != got {
		t.Fatalf("toml re-read as text: %s", got)
	}
}
