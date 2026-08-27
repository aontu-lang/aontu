/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// MODULE TOOLING (G6 phase 3, modtool.go). The two local commands are
// FILE OPERATIONS, which the shared suite has no mode for, so their
// behaviour is proved per port: this file against the package API, and
// go/cmd/aontu/mod_test.go against the command. The twin is
// ts/test/mod.test.ts's `mod-tool` block, and the two commands were
// diffed byte-for-byte over the same worlds.

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// modtoolProject is a project declaring dep, plus whatever else the
// caller puts in its directory.
func modtoolProject(t *testing.T, dep string, extra func(dir string)) string {
	t.Helper()
	dir := t.TempDir()
	write(t, filepath.Join(dir, "mod.aon"),
		"mod: {path: \"corp.example/app\"}\ndep: {"+dep+"}\n")
	if nil != extra {
		extra(dir)
	}
	return dir
}

func modtoolVendor(t *testing.T, dir, path string, files map[string]string) {
	t.Helper()
	p := filepath.Join(append([]string{dir, "aon_vendor"},
		strings.Split(path, "/")...)...)
	if err := os.MkdirAll(p, 0o755); nil != err {
		t.Fatal(err)
	}
	for name, src := range files {
		write(t, filepath.Join(p, name), src)
	}
}

func lockLine(t *testing.T, root string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, "mod-lock.aon"))
	if nil != err {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")
	if 2 > len(lines) {
		t.Fatalf("no canonical line: %q", string(data))
	}
	return lines[1]
}

func TestModVersionCompareBothDirections(t *testing.T) {
	// Numeric order, not string order: `1.10.0` is above `1.9.0`. Both
	// directions of every rule, because MVS reads the comparison from
	// whichever side the frontier happens to hold, and a comparison
	// that answered only one way round would still pass a one-sided
	// test.
	cases := []struct {
		a, b string
		want int
	}{
		{"1.10.0", "1.9.0", 1},
		{"1.9.0", "1.10.0", -1},
		{"1.2.0", "1.2.0", 0},
		// A part the shorter version does not have is ZERO.
		{"1.2", "1.2.0", 0},
		{"1.2.0", "1.2", 0},
		// A part that is not a number sorts as text, AFTER every
		// number: a pre-release tag is below no version and above none.
		{"1.2.0", "1.2.rc", -1},
		{"1.2.rc", "1.2.0", 1},
		{"1.2.rc", "1.2.beta", 1},
		{"1.2.beta", "1.2.rc", -1},
	}
	for _, c := range cases {
		if got := VersionCompare(c.a, c.b); c.want != got {
			t.Fatalf("VersionCompare(%q,%q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestModTidyWritesTheLockfile(t *testing.T) {
	dir := modtoolProject(t, "\"corp.example/schemas/service@1\": {v: \"1.4.2\"}",
		func(d string) {
			modtoolVendor(t, d, "corp.example/schemas/service@1", map[string]string{
				"mod.aon": "mod: {path: \"corp.example/schemas/service\", " +
					"main: \"service.aon\"}\n",
				"service.aon": modSource,
			})
		})

	r := ModTidy(dir, "")
	if "ok" != r.Verdict || 1 != len(r.Lock) {
		t.Fatalf("verdict %q lock %v", r.Verdict, r.Lock)
	}

	// A HEADER the file's own reader skips, then ONE canonical line —
	// sorted keys, no spaces — which is also the JSON the resolver
	// reads a pin back from.
	v, _ := New().Unify(modSource)
	want := "{\"lock\":{\"corp.example/schemas/service@1\":{\"canon\":\"" +
		CanonHash(v) + "\",\"oci\":\"\",\"v\":\"1.4.2\"}}}"
	if got := lockLine(t, dir); want != got {
		t.Fatalf("lock line\n got %s\nwant %s", got, want)
	}
}

func TestModTidyWithNoModuleFileLocksNothing(t *testing.T) {
	// A directory that declares nothing depends on nothing. The
	// lockfile is still written, and says so: an empty closure is a
	// resolved closure.
	dir := t.TempDir()
	r := ModTidy(dir, "")
	if "ok" != r.Verdict || 0 != len(r.Lock) {
		t.Fatalf("verdict %q lock %v", r.Verdict, r.Lock)
	}
	if got := lockLine(t, dir); "{\"lock\":{}}" != got {
		t.Fatalf("lock line %q", got)
	}
}

func TestModTidyMissingModule(t *testing.T) {
	// Two ways a declaration names nothing a store can hold: a module
	// path with nothing behind it, and a key the router would not call
	// a module at all. Both are reported the same way — there is no
	// third answer to give — and NO lockfile is written, because a
	// partial lock claims a closure that was never resolved.
	for _, dep := range []string{"corp.example/absent@1", "not-a-module"} {
		dir := modtoolProject(t, "\""+dep+"\": {v: \"1.0.0\"}", nil)
		r := ModTidy(dir, "")
		if "missing" != r.Verdict || 1 != len(r.Missing) || dep != r.Missing[0] {
			t.Fatalf("%s: verdict %q missing %v", dep, r.Verdict, r.Missing)
		}
		if _, err := os.Stat(filepath.Join(dir, "mod-lock.aon")); nil == err {
			t.Fatalf("%s: lockfile written", dep)
		}
	}
}

func TestModTidySelectsMaxOfMinima(t *testing.T) {
	// The two ways MVS discards a bid. WITHIN a round: `s` and `t` both
	// ask for geo, and the higher ask wins. ACROSS rounds: the project
	// itself asks for geo at 2.0.0, so the 1.x asks arriving in the next
	// round are already below what is selected and change nothing.
	// Selected versions only rise, which is why this terminates without
	// a cycle check.
	dir := modtoolProject(t,
		"\"corp.example/s@1\": {v: \"1.0.0\"}, \"corp.example/t@1\": {v: \"1.0.0\"}, "+
			"\"corp.example/geo@1\": {v: \"2.0.0\"}",
		func(d string) {
			modtoolVendor(t, d, "corp.example/s@1", map[string]string{
				"mod.aon": "mod: {path: \"corp.example/s\"}\n" +
					"dep: {\"corp.example/geo@1\": {v: \"1.5.0\"}}\n",
				"main.aon": modSource,
			})
			modtoolVendor(t, d, "corp.example/t@1", map[string]string{
				"mod.aon": "mod: {path: \"corp.example/t\"}\n" +
					"dep: {\"corp.example/geo@1\": {v: \"1.1.0\"}}\n",
				"main.aon": modSource,
			})
			modtoolVendor(t, d, "corp.example/geo@1", map[string]string{
				"mod.aon":  "mod: {path: \"corp.example/geo\"}\n",
				"main.aon": "region: string\n",
			})
		})

	r := ModTidy(dir, "")
	if "ok" != r.Verdict {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
	found := false
	for _, e := range r.Lock {
		if "corp.example/geo@1" == e.Mod {
			found = true
			if "2.0.0" != e.V {
				t.Fatalf("geo at %q, want 2.0.0", e.V)
			}
		}
	}
	if !found {
		t.Fatalf("geo not locked: %v", r.Lock)
	}
}

func TestModTidyRecomputesCanonAndCarriesOci(t *testing.T) {
	// The two pins have different owners. `canon` is what the module in
	// the store MEANS, so it is recomputed — a tidy that carried the old
	// one forward would pin what the module used to mean. `oci` is the
	// registry's word about the bytes it served, which nothing local can
	// hear, so it survives untouched.
	dir := modtoolProject(t, "\"corp.example/schemas/service@1\": {v: \"1.4.2\"}",
		func(d string) {
			modtoolVendor(t, d, "corp.example/schemas/service@1", map[string]string{
				"mod.aon": "mod: {path: \"corp.example/schemas/service\", " +
					"main: \"service.aon\"}\n",
				"service.aon": modSource,
			})
			write(t, filepath.Join(d, "mod-lock.aon"), lockHeader+
				"{\"lock\":{\"corp.example/schemas/service@1\":{\"canon\":\"aon1-stale\","+
				"\"oci\":\"sha256:6b86\",\"v\":\"1.0.0\"}}}\n")
		})

	r := ModTidy(dir, "")
	v, _ := New().Unify(modSource)
	if CanonHash(v) != r.Lock[0].Canon {
		t.Fatalf("canon %q", r.Lock[0].Canon)
	}
	if "sha256:6b86" != r.Lock[0].Oci {
		t.Fatalf("oci %q", r.Lock[0].Oci)
	}
}

func TestModTidyPinsNothingWithoutAnEntryFile(t *testing.T) {
	// A module file naming an entry that is not there has no meaning to
	// hash. The empty pin is the honest answer: the module resolved, and
	// nothing about it was verifiable.
	dir := modtoolProject(t, "\"corp.example/s@1\": {v: \"1.0.0\"}", func(d string) {
		modtoolVendor(t, d, "corp.example/s@1", map[string]string{
			"mod.aon": "mod: {path: \"corp.example/s\", main: \"gone.aon\"}\n",
		})
	})
	r := ModTidy(dir, "")
	if "ok" != r.Verdict || "" != r.Lock[0].Canon {
		t.Fatalf("verdict %q canon %q", r.Verdict, r.Lock[0].Canon)
	}
}

func TestModDeclaredDepsIgnoresWhatIsNotADepBlock(t *testing.T) {
	// Every shape a `dep` block can fail to be. A module file is
	// ordinary Aontu, so it can say anything; what it does not say is
	// not a dependency, and reading it is not an error to report.
	for _, src := range []string{
		"1\n",                             // not a map at all
		"mod: {path: \"a.b/c\"}\n",        // no dep block
		"dep: 1\n",                        // dep is not a map
		"dep: {\"a.b/c@1\": 1}\n",         // an entry that is not a map
		"dep: {\"a.b/c@1\": {}}\n",        // an entry declaring no version
		"dep: {\"a.b/c@1\": {v: \"\"}}\n", // an empty version
	} {
		dir := t.TempDir()
		file := filepath.Join(dir, "mod.aon")
		write(t, file, src)
		if deps := declaredDeps(file); 0 != len(deps) {
			t.Fatalf("%q gave %v", src, deps)
		}
	}
	// And a file that is not there at all.
	if deps := declaredDeps(filepath.Join(t.TempDir(), "gone.aon")); 0 != len(deps) {
		t.Fatalf("missing file gave %v", deps)
	}
}

func TestModReadLockAnswersNothingForWhatItCannotRead(t *testing.T) {
	// A lockfile is GENERATED, so a file that is not what the generator
	// writes is not a file to guess at: it pins nothing, and a tidy will
	// replace it.
	for _, text := range []string{
		"this is not the canonical line\n",
		"{\"other\":{}}\n",
	} {
		dir := t.TempDir()
		write(t, filepath.Join(dir, "mod-lock.aon"), text)
		if lock := readLock(dir); 0 != len(lock) {
			t.Fatalf("%q gave %v", text, lock)
		}
	}
	if lock := readLock(t.TempDir()); 0 != len(lock) {
		t.Fatalf("no lockfile gave %v", lock)
	}
}

func TestModVendorMaterialisesTheWholeTree(t *testing.T) {
	// From the CACHE, keyed by the hash the lockfile pins: that is what
	// content-addressed means, and it is why `vendor` needs a lockfile
	// while `tidy` needs a store. A module is a TREE, not an entry file
	// — that is what an OCI layer holds — so nested directories come
	// across too.
	dir := t.TempDir()
	cache := filepath.Join(dir, "cache")
	v, _ := New().Unify(modSource)
	hash := CanonHash(v)

	store := filepath.Join(cache, hash)
	if err := os.MkdirAll(filepath.Join(store, "part"), 0o755); nil != err {
		t.Fatal(err)
	}
	write(t, filepath.Join(store, "mod.aon"),
		"mod: {path: \"corp.example/schemas/service\", main: \"service.aon\"}\n")
	write(t, filepath.Join(store, "service.aon"), modSource)
	write(t, filepath.Join(store, "part", "extra.aon"), "extra: true\n")

	write(t, filepath.Join(dir, "mod-lock.aon"), lockHeader+
		"{\"lock\":{\"corp.example/schemas/service@1\":{\"canon\":\""+hash+
		"\",\"oci\":\"\",\"v\":\"1.4.2\"}}}\n")

	r := ModVendor(dir, cache)
	if "ok" != r.Verdict || 1 != len(r.Vendored) {
		t.Fatalf("verdict %q vendored %v missing %v", r.Verdict, r.Vendored, r.Missing)
	}

	to := filepath.Join(dir, "aon_vendor", "corp.example", "schemas", "service@1")
	for name, want := range map[string]string{
		"service.aon": modSource,
		"part" + string(os.PathSeparator) + "extra.aon": "extra: true\n",
	} {
		data, err := os.ReadFile(filepath.Join(to, name))
		if nil != err || want != string(data) {
			t.Fatalf("%s: %v %q", name, err, string(data))
		}
	}

	// Vendoring again finds the module in the vendor tree, which is
	// where it already is: a store that is its own destination is left
	// alone rather than copied onto itself.
	if r2 := ModVendor(dir, cache); "ok" != r2.Verdict {
		t.Fatalf("second vendor: %q", r2.Verdict)
	}
}

func TestModVendorReportsWhatNoStoreHas(t *testing.T) {
	// Two failures with the same answer: a key that does not route as a
	// module path, and one that routes to nothing any store holds.
	dir := t.TempDir()
	write(t, filepath.Join(dir, "mod-lock.aon"),
		"{\"lock\":{\"corp.example/absent@1\":{\"canon\":\"aon1-x\",\"oci\":\"\",\"v\":\"1\"},"+
			"\"not-a-module\":{\"canon\":\"y\",\"oci\":\"\",\"v\":\"1\"}}}\n")
	r := ModVendor(dir, "")
	if "missing" != r.Verdict || 2 != len(r.Missing) {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
	if "corp.example/absent@1" != r.Missing[0] || "not-a-module" != r.Missing[1] {
		t.Fatalf("missing %v", r.Missing)
	}
}

// THE PUBLISH BOUNDARY (G6 phase 4). What a publish would push is a
// manifest, and everything it ASSERTS is local: the annotations, the
// layer's contents, and the gate that decides whether the version may
// be minted at all. The push itself needs a registry this build does
// not have; the assertions do not.

// modtoolPublishable is a module in its own right: it declares its
// path, its version and its entry, which is what a publish needs and a
// dependency does not.
func modtoolPublishable(t *testing.T, version, src string) string {
	t.Helper()
	dir := t.TempDir()
	decl := "mod: {path: \"corp.example/schemas/service\""
	if "" != version {
		decl += ", version: \"" + version + "\""
	}
	decl += ", main: \"service.aon\"}\n"
	write(t, filepath.Join(dir, "mod.aon"), decl)
	if "" != src {
		write(t, filepath.Join(dir, "service.aon"), src)
	}
	return dir
}

func TestModManifestIsWhatAPublishWouldPush(t *testing.T) {
	dir := modtoolPublishable(t, "1.1.0", modSource)
	r := ModManifest(dir, "")

	if "ok" != r.Verdict {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
	if "corp.example/schemas/service@1" != r.Mod || "1.1.0" != r.Version {
		t.Fatalf("mod %q version %q", r.Mod, r.Version)
	}
	if ModuleConfigMediaType != r.Config {
		t.Fatalf("config %q", r.Config)
	}
	// The canon-hash is THE pin: the same string `mod tidy` locks and
	// `aontu hash` prints, so "has the truth changed?" is one annotation
	// read and a string compare.
	v, _ := New().Unify(modSource)
	if CanonHash(v) != r.Canon {
		t.Fatalf("canon %q", r.Canon)
	}
	want := map[string]string{
		ModuleAnnotationCanon:              r.Canon,
		ModuleAnnotationMajor:              "1",
		"org.opencontainers.image.title":   "corp.example/schemas/service",
		"org.opencontainers.image.version": "1.1.0",
	}
	if len(want) != len(r.Annotations) {
		t.Fatalf("annotations %v", r.Annotations)
	}
	for k, w := range want {
		if w != r.Annotations[k] {
			t.Fatalf("annotation %s = %q, want %q", k, r.Annotations[k], w)
		}
	}
	if 2 != len(r.Files) || "mod.aon" != r.Files[0] || "service.aon" != r.Files[1] {
		t.Fatalf("files %v", r.Files)
	}
}

func TestModManifestLayerExcludesTheVendorCopy(t *testing.T) {
	// A module is a TREE, so nested directories are in the layer. A
	// published module carries its own sources and not a copy of
	// everyone else's, so `aon_vendor/` is not: a consumer resolves the
	// closure itself, and vendoring it here would publish the world.
	dir := modtoolPublishable(t, "1.1.0", modSource)
	if err := os.MkdirAll(filepath.Join(dir, "part"), 0o755); nil != err {
		t.Fatal(err)
	}
	write(t, filepath.Join(dir, "part", "extra.aon"), "extra: true\n")
	modtoolVendor(t, dir, "corp.example/other@1",
		map[string]string{"mod.aon": "mod: {path: \"x\"}\n"})

	files := ModManifest(dir, "").Files
	if 3 != len(files) || "mod.aon" != files[0] ||
		"part/extra.aon" != files[1] || "service.aon" != files[2] {
		t.Fatalf("files %v", files)
	}
}

func TestModManifestNeedsAVersionAndAnEntry(t *testing.T) {
	// A version is what a publish assigns, and the major an import
	// spells lives inside it — a module that declares none has nothing
	// to publish under. An entry file that is not there has no meaning
	// to pin.
	noVersion := ModManifest(modtoolPublishable(t, "", modSource), "")
	if "error" != noVersion.Verdict ||
		1 != len(noVersion.Missing) || "mod.version" != noVersion.Missing[0] {
		t.Fatalf("verdict %q missing %v", noVersion.Verdict, noVersion.Missing)
	}

	noEntry := ModManifest(modtoolPublishable(t, "1.0.0", ""), "")
	if "error" != noEntry.Verdict ||
		1 != len(noEntry.Missing) || "service.aon" != noEntry.Missing[0] {
		t.Fatalf("verdict %q missing %v", noEntry.Verdict, noEntry.Missing)
	}

	// A directory with no module file at all declares neither.
	bare := ModManifest(t.TempDir(), "")
	if "error" != bare.Verdict || 3 != len(bare.Missing) {
		t.Fatalf("verdict %q missing %v", bare.Verdict, bare.Missing)
	}
}

func TestModManifestGateRefusesABreakingVersion(t *testing.T) {
	// THE PUBLISH-TIME BREAKING GATE. The semantics belong wholly to G3
	// — this is the wiring, at the one place versions are minted — so
	// the verdict and the findings are Subsume's, unchanged.
	prior := modtoolPublishable(t, "1.0.0", modSource)
	next := modtoolPublishable(t, "1.1.0", modSource+"region: *\"eu\" | string\n")

	r := ModManifest(next, prior)
	if "breaking" != r.Verdict || 1 > len(r.Findings) {
		t.Fatalf("verdict %q findings %v", r.Verdict, r.Findings)
	}
	if "$.region" != r.Findings[0].Path {
		t.Fatalf("finding path %q", r.Findings[0].Path)
	}

	// And a compatible change passes the same gate.
	ok := ModManifest(modtoolPublishable(t, "1.2.0", "name: string\n"), prior)
	if "ok" != ok.Verdict || 0 != len(ok.Findings) {
		t.Fatalf("verdict %q findings %v", ok.Verdict, ok.Findings)
	}
}

func TestModManifestMajorBumpIsWhereBreakingIsAllowed(t *testing.T) {
	// The major lives in the module path, so a consumer of `@1` never
	// sees `@2` unless it asks. Checking compatibility across majors
	// would forbid the one change the version scheme exists to express.
	prior := modtoolPublishable(t, "1.0.0", modSource)
	next := modtoolPublishable(t, "2.0.0", modSource+"region: string\n")

	r := ModManifest(next, prior)
	if "ok" != r.Verdict || "corp.example/schemas/service@2" != r.Mod {
		t.Fatalf("verdict %q mod %q", r.Verdict, r.Mod)
	}
}

func TestModManifestPriorWithNoEntryCannotBeGatedAgainst(t *testing.T) {
	r := ModManifest(modtoolPublishable(t, "1.1.0", modSource),
		modtoolPublishable(t, "1.0.0", ""))
	if "error" != r.Verdict ||
		1 != len(r.Missing) || "service.aon" != r.Missing[0] {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
}

func TestModManifestGateCanBeUndecided(t *testing.T) {
	// Subsumption is THREE-valued plus error, and the gate passes all
	// four through: a question it cannot decide is not a pass. `must`
	// carries a message the checker cannot reason about, so the pair
	// below is undecided rather than compatible.
	prior := modtoolPublishable(t, "1.0.0", "a: min(1)\n")
	next := modtoolPublishable(t, "1.1.0", "a: must(min(1), \"m\")\n")

	r := ModManifest(next, prior)
	if "undecided" != r.Verdict {
		t.Fatalf("verdict %q findings %v", r.Verdict, r.Findings)
	}
}

func TestModSelfIgnoresWhatIsNotAModuleDeclaration(t *testing.T) {
	// A module file is ordinary Aontu, so it can say anything. What it
	// does not say about ITSELF leaves the manifest with nothing to
	// mint, which is the same answer as saying nothing at all.
	for _, src := range []string{
		"1\n",       // not a map at all
		"dep: {}\n", // no mod block
		"mod: 1\n",  // a mod that is not a map
	} {
		dir := t.TempDir()
		write(t, filepath.Join(dir, "mod.aon"), src)
		r := ModManifest(dir, "")
		if "error" != r.Verdict || 3 != len(r.Missing) {
			t.Fatalf("%q gave verdict %q missing %v", src, r.Verdict, r.Missing)
		}
	}
}

// The canon-hash of `nil`, which is what EVERY module that fails to
// evaluate would pin if the lockfile were written from one -- the same
// string for all of them, so a pin that carries no information while
// looking exactly like one that does (use-cases/BUGS.md §31).
const modNilPin = "aon1-XaOkx_EXlEJ1tMhinEkWQDYl1aSmVzoB7LA_Dp0u2-Y"

// A VENDORED MODULE IS A PROJECT INSIDE A PROJECT (the review's finding
// H, use-cases/BUGS.md §31). `mod vendor` produces a FLAT tree, so a
// module's own dependency sits beside it in the consumer's
// `aon_vendor/` -- but the module carries its own `mod.aon`, which used
// to stop the upward walk there, and the nested import answered
// `module not fetched` for a module sitting one directory away. The
// TypeScript twin is
// `a-nested-import-reaches-the-consumers-vendor-tree`.
func TestModTransitiveVendorResolves(t *testing.T) {
	dir := modtoolProject(t,
		"\"corp.example/schemas/service@1\": {v: \"1.4.2\"},"+
			" \"corp.example/schemas/common@1\": {v: \"1.0.0\"}",
		func(d string) {
			modtoolVendor(t, d, "corp.example/schemas/service@1",
				map[string]string{
					"mod.aon": "mod: {path: \"corp.example/schemas/service\"," +
						" version: \"1.4.2\", main: \"service.aon\"}\n" +
						"dep: {\"corp.example/schemas/common@1\": {v: \"1.0.0\"}}\n",
					"service.aon": "@\"corp.example/schemas/common@1\"\n" +
						"spec: {name: string, port: *8080 | integer}\n",
				})
			modtoolVendor(t, d, "corp.example/schemas/common@1",
				map[string]string{
					"mod.aon": "mod: {path: \"corp.example/schemas/common\"," +
						" version: \"1.0.0\", main: \"common.aon\"}\n",
					"common.aon": "naming: {id: string}\n",
				})
		})
	write(t, filepath.Join(dir, "main.aon"),
		"lib: hide(@\"corp.example/schemas/service@1\")\n"+
			"svc: $.lib.spec & {name: \"checkout\"}\n")

	report := ModTidy(dir, "")
	if "ok" != report.Verdict {
		t.Fatalf("tidy verdict: %s %+v", report.Verdict, report)
	}
	for _, e := range report.Lock {
		// NOT the hash of nil, which is what a module that does not
		// evaluate pins -- and the same string for every one of them.
		if modNilPin == e.Canon {
			t.Fatalf("%s pinned the hash of nil", e.Mod)
		}
	}

	src, err := os.ReadFile(filepath.Join(dir, "main.aon"))
	if nil != err {
		t.Fatal(err)
	}
	a := NewWithBase(dir)
	a.File = filepath.Join(dir, "main.aon")
	out, uerr := a.Generate(string(src))
	if nil != uerr {
		t.Fatalf("evaluate: %v", uerr)
	}
	svc, _ := out.(map[string]any)["svc"].(map[string]any)
	if nil == svc || "8080" != fmt.Sprint(svc["port"]) {
		t.Fatalf("unexpected result: %+v", out)
	}
}

// A NIL PIN IS WORSE THAN NO PIN: every module that fails to evaluate
// hashes to the same string, so a lockfile written from one looks
// exactly like a real pin and carries nothing (§31). `aontu hash`
// already refuses such a file; tidy refuses it too. The TypeScript twin
// is `tidy-refuses-to-pin-a-module-that-does-not-evaluate`.
func TestModTidyRefusesAnUnevaluableModule(t *testing.T) {
	dir := modtoolProject(t,
		"\"corp.example/schemas/service@1\": {v: \"1.4.2\"}", func(d string) {
			modtoolVendor(t, d, "corp.example/schemas/service@1",
				map[string]string{
					"mod.aon": "mod: {path: \"corp.example/schemas/service\"," +
						" main: \"service.aon\"}\n",
					// Contradicts itself: no meaning, so nothing to pin.
					"service.aon": "a: 1\na: 2\n",
				})
		})

	report := ModTidy(dir, "")
	if "error" != report.Verdict || 1 != len(report.Unevaluable) {
		t.Fatalf("tidy: %+v", report)
	}
	// AND THE LOCKFILE IS LEFT ALONE. A refusal that wrote a lockfile
	// would be the defect with a louder message.
	if _, err := os.Stat(filepath.Join(dir, "mod-lock.aon")); nil == err {
		t.Fatal("a refused tidy wrote a lockfile")
	}
}

// VERIFICATION IS A QUESTION; ANSWERING IT MUST NOT BE AN EDIT (§32).
// Tidy recomputes and rewrites by design, so a CI job that tidies
// before evaluating has no integrity protection at all: the lockfile
// simply agrees with whatever the store now holds. The TypeScript twin
// is `verify-catches-a-tampered-store-and-changes-nothing`.
func TestModVerify(t *testing.T) {
	svcDir := ""
	dir := modtoolProject(t,
		"\"corp.example/schemas/service@1\": {v: \"1.4.2\"}", func(d string) {
			modtoolVendor(t, d, "corp.example/schemas/service@1",
				map[string]string{
					"mod.aon": "mod: {path: \"corp.example/schemas/service\"," +
						" main: \"service.aon\"}\n",
					"service.aon": "name: string\nport: *8080 | integer\n",
				})
			svcDir = filepath.Join(d, "aon_vendor", "corp.example", "schemas",
				"service@1", "service.aon")
		})

	if "ok" != ModTidy(dir, "").Verdict {
		t.Fatal("tidy did not hold")
	}
	lock, err := os.ReadFile(filepath.Join(dir, "mod-lock.aon"))
	if nil != err {
		t.Fatal(err)
	}

	clean := ModVerify(dir, "")
	if "ok" != clean.Verdict || 1 != len(clean.Verified) {
		t.Fatalf("clean verify: %+v", clean)
	}

	// Tamper, and ask again.
	write(t, svcDir, "name: string\nport: *9090 | integer\n")
	bad := ModVerify(dir, "")
	if "mismatch" != bad.Verdict || 1 != len(bad.Mismatched) {
		t.Fatalf("tampered verify: %+v", bad)
	}
	if "" == bad.Mismatched[0].Got || bad.Mismatched[0].Want == bad.Mismatched[0].Got {
		t.Fatalf("mismatch does not name both hashes: %+v", bad.Mismatched[0])
	}
	// THE LOCKFILE IS UNTOUCHED, which is the whole difference from
	// tidy: a gate that rewrote what it was checking would pass every
	// time.
	now, err := os.ReadFile(filepath.Join(dir, "mod-lock.aon"))
	if nil != err || string(lock) != string(now) {
		t.Fatal("verify rewrote the lockfile")
	}

	// A module that no longer stands up at all says so, rather than
	// reporting the hash of nil as though it were a meaning.
	write(t, svcDir, "a: 1\na: 2\n")
	broken := ModVerify(dir, "")
	if "mismatch" != broken.Verdict || "" != broken.Mismatched[0].Got {
		t.Fatalf("broken verify: %+v", broken)
	}
}

func TestModVerifyRefusesAnUncoveredProject(t *testing.T) {
	// NOTHING TO CHECK IS NOT A PASS. The gate walks what is LOCKED, so
	// a project whose lockfile was never committed -- or whose lockfile
	// predates a dependency someone added -- would verify clean over an
	// empty set: absence reading as agreement, which is the shape of the
	// defect this verb exists to close. The repair is a tidy, not a
	// fetch, and the verdict says which.
	dir := modtoolProject(t,
		"\"corp.example/schemas/service@1\": {v: \"1.4.2\"}", func(d string) {
			modtoolVendor(t, d, "corp.example/schemas/service@1",
				map[string]string{
					"mod.aon": "mod: {path: \"corp.example/schemas/service\"," +
						" main: \"service.aon\"}\n",
					"service.aon": "name: string\nport: *8080 | integer\n",
				})
		})

	bare := ModVerify(dir, "")
	if "unlocked" != bare.Verdict || 1 != len(bare.Unlocked) ||
		"corp.example/schemas/service@1" != bare.Unlocked[0] {
		t.Fatalf("no lockfile: %+v", bare)
	}

	// Tidy writes it, and the same question now passes.
	if "ok" != ModTidy(dir, "").Verdict {
		t.Fatal("tidy did not hold")
	}
	if r := ModVerify(dir, ""); "ok" != r.Verdict || 0 != len(r.Unlocked) {
		t.Fatalf("after tidy: %+v", r)
	}

	// A dependency added to mod.aon after the lockfile was written is
	// the same hole one edit later: the pins that ARE there still verify,
	// and the lockfile no longer covers the project.
	write(t, filepath.Join(dir, "mod.aon"),
		"mod: {path: \"corp.example/app\"}\ndep: {"+
			"\"corp.example/schemas/service@1\": {v: \"1.4.2\"}, "+
			"\"corp.example/schemas/later@1\": {v: \"1.0.0\"}}\n")
	stale := ModVerify(dir, "")
	if "unlocked" != stale.Verdict || 1 != len(stale.Unlocked) ||
		"corp.example/schemas/later@1" != stale.Unlocked[0] {
		t.Fatalf("stale lockfile: %+v", stale)
	}
	if 1 != len(stale.Verified) {
		t.Fatalf("the pin that is there should still verify: %+v", stale)
	}
}

func TestModVerifyReportsWhatNoStoreHolds(t *testing.T) {
	// A pin cannot be compared against a store that has nothing to
	// compare, and there are three ways to have nothing: a key that
	// does not route as a module path, one that routes to a module no
	// store holds, and one whose store directory exists but whose entry
	// file does not. All three are `missing` — the repair is a fetch,
	// not an edit to the lockfile — and none of them is a mismatch,
	// which would claim the store means something else.
	dir := t.TempDir()
	write(t, filepath.Join(dir, "mod-lock.aon"), lockHeader+
		"{\"lock\":{\"corp.example/absent@1\":{\"canon\":\"aon1-x\",\"oci\":\"\",\"v\":\"1\"},"+
			"\"corp.example/hollow@1\":{\"canon\":\"aon1-y\",\"oci\":\"\",\"v\":\"1\"},"+
			"\"not-a-module\":{\"canon\":\"aon1-z\",\"oci\":\"\",\"v\":\"1\"}}}\n")

	// hollow@1 is vendored as a directory with a mod.aon naming an
	// entry file that was never written.
	modtoolVendor(t, dir, "corp.example/hollow@1", map[string]string{
		"mod.aon": "mod: {path: \"corp.example/hollow\", main: \"hollow.aon\"}\n",
	})

	r := ModVerify(dir, "")
	if "missing" != r.Verdict || 3 != len(r.Missing) || 0 != len(r.Mismatched) {
		t.Fatalf("verdict %q missing %v mismatched %v",
			r.Verdict, r.Missing, r.Mismatched)
	}
	for i, want := range []string{
		"corp.example/absent@1", "corp.example/hollow@1", "not-a-module"} {
		if want != r.Missing[i] {
			t.Fatalf("missing %v", r.Missing)
		}
	}
}
