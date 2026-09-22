/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// pkgProject is a project declaring dep, plus whatever else the caller
// puts in its directory.
func pkgProject(t *testing.T, dep string, extra func(dir string)) string {
	t.Helper()
	dir := t.TempDir()
	write(t, filepath.Join(dir, "pkg.aontu"),
		"pkg: {path: \"corp.example/app\"}\ndep: {"+dep+"}\n")
	if nil != extra {
		extra(dir)
	}
	return dir
}

func pkgVendor(t *testing.T, dir, path string, files map[string]string) {
	t.Helper()
	p := filepath.Join(append([]string{dir, "aontu_meta", "vendor"},
		strings.Split(path, "/")...)...)
	if err := os.MkdirAll(p, 0o755); nil != err {
		t.Fatal(err)
	}
	for name, src := range files {
		write(t, filepath.Join(p, name), src)
	}
}

var pkgService = map[string]string{
	"pkg.aontu":     "pkg: {path: \"corp.example/schemas/service\", main: \"service.aontu\"}\n",
	"service.aontu": modSource,
}

func lockLine(t *testing.T, root string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, "aontu_meta", "pkg-lock.aontu"))
	if nil != err {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")
	if 2 > len(lines) {
		t.Fatalf("no canonical line: %q", string(data))
	}
	return lines[1]
}

func TestZipCanonicalIsOneDigestPerTree(t *testing.T) {
	a := ZipCanonical([]ZipEntry{
		{Path: "b.aontu", Data: []byte("b: 2\n")}, {Path: "a.aontu", Data: []byte("a: 1\n")}})
	b := ZipCanonical([]ZipEntry{
		{Path: "a.aontu", Data: []byte("a: 1\n")}, {Path: "b.aontu", Data: []byte("b: 2\n")}})
	if Sha256Hex(a) != Sha256Hex(b) || !strings.HasPrefix(Sha256Hex(a), "sha256:") {
		t.Fatalf("digests %s %s", Sha256Hex(a), Sha256Hex(b))
	}
	back, err := UnzipCanonical(a)
	if nil != err || 2 != len(back) || "a.aontu" != back[0].Path || "b: 2\n" != string(back[1].Data) {
		t.Fatalf("round trip: %v %+v", err, back)
	}
	if empty, err := UnzipCanonical(ZipCanonical(nil)); nil != err || 0 != len(empty) {
		t.Fatalf("empty archive: %v %v", err, empty)
	}
}

// Every entry in this test's archives is named `?.aontu`. The zip
// offsets below count from the name, so they are written from its
// length rather than from the number it happens to be.
const name = len("a.aontu")

// A local header, its name and its data: where the directory starts.
const local = 30 + name + 5

func TestUnzipCanonicalRefusesWhatTheWriterWouldNotWrite(t *testing.T) {
	good := ZipCanonical([]ZipEntry{
		{Path: "a.aontu", Data: []byte("a: 1\n")}, {Path: "b.aontu", Data: []byte("b: 2\n")}})
	refuses := func(zip []byte, why string) {
		t.Helper()
		if _, err := UnzipCanonical(zip); nil == err || !strings.Contains(err.Error(), why) {
			t.Fatalf("want %q, got %v", why, err)
		}
	}
	flip := func(at int, v byte) []byte {
		c := append([]byte{}, good...)
		c[at] = v
		return c
	}
	refuses(make([]byte, 3), "no end record")
	refuses(good[:len(good)-1], "no end record")
	refuses(flip(len(good)-2, 1), "end record")
	refuses(flip(len(good)-22+4, 1), "end record")
	refuses(flip(len(good)-22+8, 9), "end record")
	cd := len(good) - 22 - 2*(46+name)
	refuses(flip(cd+10, 8), "entry 0")
	refuses(flip(cd+12, 1), "entry 0")
	refuses(flip(cd, 1), "central directory")
	// A name length past the end of the directory.
	refuses(flip(cd+46+name+28, 200), "central directory")
	swapped := append([]byte{}, good...)
	swapped[cd+46] = 'b'
	swapped[cd+46+name+46] = 'a'
	if _, err := UnzipCanonical(swapped); nil == err {
		t.Fatal("swapped names accepted")
	}
	// Renamed in the local headers too, the entries are consistent and
	// out of order.
	swapped[30] = 'b'
	swapped[30+name+5+30] = 'a'
	refuses(swapped, "entries out of order at a.aontu")
	refuses(flip(4, 20), "local header")
	refuses(flip(0, 1), "local header")
	refuses(flip(30+name, 0x7a), "checksum")
	refuses(flip(30, 'z'), "local header")
	// A data run that overruns the directory, and one that stops short.
	big := append([]byte{}, good...)
	big[cd+24] = 0xff
	big[cd+20] = 0xff
	if _, err := UnzipCanonical(big); nil == err {
		t.Fatal("oversized data accepted")
	}
	one := ZipCanonical([]ZipEntry{{Path: "a.aontu", Data: []byte("a: 1\n")}})
	// Sizes that agree everywhere and overrun the directory.
	overrun := append([]byte{}, one...)
	for _, at := range []int{18, 22, local + 20, local + 24} {
		overrun[at] = 100
	}
	refuses(overrun, "data of a.aontu")
	// Bytes between the last entry and the directory, with the end
	// record pointing past them.
	padded := append(append(append([]byte{}, one[:local]...), 0, 0, 0), one[local:]...)
	padded[len(padded)-22+16] = byte(local + 3)
	refuses(padded, "trailing bytes")
	trailing := append(append([]byte{}, one[:len(one)-22-46-5]...), 0)
	trailing = append(trailing, one[len(one)-22-46-5:]...)
	// The end record's offsets now point one byte late, so the directory
	// does not parse where it should.
	if _, err := UnzipCanonical(trailing); nil == err {
		t.Fatal("trailing byte accepted")
	}
	if !bytes.Equal(good, ZipCanonical([]ZipEntry{
		{Path: "b.aontu", Data: []byte("b: 2\n")}, {Path: "a.aontu", Data: []byte("a: 1\n")}})) {
		t.Fatal("order-independent")
	}
}

func TestArchiveAllowlistIsEnumerated(t *testing.T) {
	for _, ok := range []string{"a.aontu", "x/y/b.aontu", "c.json", "d.yaml", "e.yml",
		"f.toml", "g.ini", "h.md", "i.txt", "LICENSE", "sub/NOTICE", "J.JSON"} {
		if !ArchiveAdmits(ok) {
			t.Fatalf("%s refused", ok)
		}
	}
	for _, bad := range []string{"a.sh", "b.js", "Makefile", ".gitignore", "c",
		"d.aontu.bak", ".claude/settings.json", "e.png"} {
		if ArchiveAdmits(bad) {
			t.Fatalf("%s admitted", bad)
		}
	}
}

func TestArchiveOfSkipsMetaAndNamesTheForbidden(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "pkg.aontu"), "pkg: {path: \"corp.example/x\"}\n")
	write(t, filepath.Join(dir, "main.aontu"), "a: 1\n")
	write(t, filepath.Join(dir, "aontu_meta", "manifest.aontu"), "{}")
	write(t, filepath.Join(dir, "sub", ".hidden", "x.aontu"), "x: 1\n")
	write(t, filepath.Join(dir, "sub", "run.sh"), "echo\n")
	write(t, filepath.Join(dir, "sub", "ok.aontu"), "ok: 1\n")
	write(t, filepath.Join(dir, "exec.aontu"), "e: 1\n")
	if err := os.Chmod(filepath.Join(dir, "exec.aontu"), 0o755); nil != err {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(dir, "main.aontu"), filepath.Join(dir, "link.aontu")); nil != err {
		t.Fatal(err)
	}

	// Windows has no execute bit, so the executable is an ordinary file there.
	wantFiles, wantForbidden := "[main.aontu pkg.aontu sub/ok.aontu]", "[exec.aontu link.aontu sub/.hidden/ sub/run.sh]"
	if "windows" == runtime.GOOS {
		wantFiles, wantForbidden = "[exec.aontu main.aontu pkg.aontu sub/ok.aontu]", "[link.aontu sub/.hidden/ sub/run.sh]"
	}
	a := ArchiveOf(dir)
	paths := []string{}
	for _, f := range a.Files {
		paths = append(paths, f.Path)
	}
	if fmt.Sprint(paths) != wantFiles {
		t.Fatalf("files %v", paths)
	}
	if fmt.Sprint(a.Forbidden) != wantForbidden {
		t.Fatalf("forbidden %v", a.Forbidden)
	}
	var main ArchiveFile
	for _, f := range a.Files {
		if "main.aontu" == f.Path {
			main = f
		}
	}
	if a.Size != len(a.Zip) || 5 != main.Size || Sha256Hex([]byte("a: 1\n")) != main.Digest {
		t.Fatalf("archive %+v", a)
	}
	if got := ArchiveOf(filepath.Join(dir, "nowhere")); 0 != len(got.Files) {
		t.Fatalf("missing dir: %+v", got)
	}
}

func TestPkgVersionCompareBothDirections(t *testing.T) {
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

func TestPkgUsableKey(t *testing.T) {
	for key, want := range map[string]bool{
		"corp.example/s": true, "alias:legacy": true,
		"corp.example/s#aon1-x": false, "corp.example/../s": false, "not-a-module": false,
	} {
		if want != usableKey(key) {
			t.Fatalf("%s: want %v", key, want)
		}
	}
}

func TestPkgTidyWritesTheLockfile(t *testing.T) {
	dir := pkgProject(t, "\"corp.example/schemas/service\": {v: \"1.4.2\"}",
		func(d string) { pkgVendor(t, d, "corp.example/schemas/service", pkgService) })

	r := PkgTidy(dir, nil)
	if "ok" != r.Verdict || 1 != len(r.Lock) {
		t.Fatalf("verdict %q lock %v", r.Verdict, r.Lock)
	}

	// A HEADER the file's own reader skips, then ONE canonical line —
	// sorted keys, no spaces — which is also the JSON the resolver
	// reads a pin back from. The archive and the meaning are pinned,
	// and no manifest, because nothing served this tree.
	v, _ := New().Unify(modSource)
	tree := filepath.Join(dir, "aontu_meta", "vendor", "corp.example", "schemas", "service")
	want := "{\"lock\":{\"corp.example/schemas/service\":{\"archive\":\"" + ArchiveOf(tree).Digest +
		"\",\"canon\":\"" + CanonHash(v) + "\",\"v\":\"1.4.2\"}}}"
	if got := lockLine(t, dir); want != got {
		t.Fatalf("lock line\n got %s\nwant %s", got, want)
	}
}

func TestPkgTidyWithNoPackageFileLocksNothing(t *testing.T) {
	// A directory that declares nothing depends on nothing. The
	// lockfile is still written, and says so: an empty closure is a
	// resolved closure.
	dir := t.TempDir()
	r := PkgTidy(dir, nil)
	if "ok" != r.Verdict || 0 != len(r.Lock) {
		t.Fatalf("verdict %q lock %v", r.Verdict, r.Lock)
	}
	if got := lockLine(t, dir); "{\"lock\":{}}" != got {
		t.Fatalf("lock line %q", got)
	}
}

func TestPkgTidyMissingPackage(t *testing.T) {
	for _, dep := range []string{"corp.example/absent", "not-a-module", "alias:nowhere"} {
		dir := pkgProject(t, "\""+dep+"\": {v: \"1.0.0\"}", nil)
		r := PkgTidy(dir, nil)
		if "missing" != r.Verdict || 1 != len(r.Missing) || dep != r.Missing[0] {
			t.Fatalf("%s: verdict %q missing %v", dep, r.Verdict, r.Missing)
		}
		if _, err := os.Stat(filepath.Join(dir, "aontu_meta", "pkg-lock.aontu")); nil == err {
			t.Fatalf("%s: lockfile written", dep)
		}
	}
}

func TestPkgTidySelectsMaxOfMinima(t *testing.T) {
	dir := pkgProject(t,
		"\"corp.example/s\": {v: \"1.0.0\"}, \"corp.example/t\": {v: \"1.0.0\"}, "+
			"\"corp.example/geo\": {v: \"2.0.0\"}",
		func(d string) {
			pkgVendor(t, d, "corp.example/s", map[string]string{
				"pkg.aontu": "pkg: {path: \"corp.example/s\"}\n" +
					"dep: {\"corp.example/geo\": {v: \"1.5.0\"}}\n",
				"main.aontu": modSource,
			})
			pkgVendor(t, d, "corp.example/t", map[string]string{
				"pkg.aontu": "pkg: {path: \"corp.example/t\"}\n" +
					"dep: {\"corp.example/geo\": {v: \"1.1.0\"}}\n",
				"main.aontu": modSource,
			})
			pkgVendor(t, d, "corp.example/geo", map[string]string{
				"pkg.aontu":  "pkg: {path: \"corp.example/geo\"}\n",
				"main.aontu": "region: string\n",
			})
		})

	r := PkgTidy(dir, nil)
	if "ok" != r.Verdict {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
	found := false
	for _, e := range r.Lock {
		if "corp.example/geo" == e.Key {
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

func TestPkgTidyRecomputesEveryPin(t *testing.T) {
	dir := pkgProject(t, "\"corp.example/schemas/service\": {v: \"1.4.2\"}",
		func(d string) {
			pkgVendor(t, d, "corp.example/schemas/service", pkgService)
			write(t, filepath.Join(d, "aontu_meta", "pkg-lock.aontu"), lockHeader+
				"{\"lock\":{\"corp.example/schemas/service\":{\"archive\":\"sha256:stale\","+
				"\"canon\":\"aon1-stale\",\"manifest\":\"sha256:gone\",\"v\":\"1.0.0\"}}}\n")
		})

	r := PkgTidy(dir, nil)
	v, _ := New().Unify(modSource)
	e := r.Lock[0]
	if CanonHash(v) != e.Canon || !strings.HasPrefix(e.Archive, "sha256:") ||
		"sha256:stale" == e.Archive || "" != e.Manifest {
		t.Fatalf("entry %+v", e)
	}
}

func TestPkgTidyLocksAnAliasWithThePackageItNames(t *testing.T) {
	dir := pkgProject(t,
		"\"corp.example/schemas/service\": {v: \"1.4.2\"}, "+
			"\"alias:legacy\": {pkg: \"corp.example/schemas/service\", v: \"1.2.0\"}",
		func(d string) {
			pkgVendor(t, d, "corp.example/schemas/service", pkgService)
			pkgVendor(t, d, "alias/legacy", map[string]string{
				"pkg.aontu":     pkgService["pkg.aontu"],
				"service.aontu": "name: string\nport: *9090 | integer\n",
			})
		})
	r := PkgTidy(dir, nil)
	if "ok" != r.Verdict {
		t.Fatalf("tidy: %+v", r)
	}
	var legacy LockEntry
	for _, e := range r.Lock {
		if "alias:legacy" == e.Key {
			legacy = e
		}
	}
	if "corp.example/schemas/service" != legacy.Pkg || "1.2.0" != legacy.V {
		t.Fatalf("alias entry %+v", legacy)
	}
	if !strings.Contains(lockLine(t, dir), "\"pkg\":\"corp.example/schemas/service\",\"v\":\"1.2.0\"}") {
		t.Fatalf("lock line %s", lockLine(t, dir))
	}
	if v := PkgVerify(dir, nil); "ok" != v.Verdict {
		t.Fatalf("verify: %+v", v)
	}
	// A dependency's own alias declaration rides along when the
	// consumer's does not name a package.
	write(t, filepath.Join(dir, "pkg.aontu"),
		"pkg: {path: \"corp.example/app\"}\ndep: {\"corp.example/s\": {v: \"1.0.0\"}}\n")
	pkgVendor(t, dir, "corp.example/s", map[string]string{
		"pkg.aontu": "pkg: {path: \"corp.example/s\"}\n" +
			"dep: {\"alias:legacy\": {pkg: \"corp.example/schemas/service\", v: \"1.2.0\"}}\n",
		"main.aontu": modSource,
	})
	if r := PkgTidy(dir, nil); "ok" != r.Verdict || 2 != len(r.Lock) || "corp.example/schemas/service" != r.Lock[0].Pkg {
		t.Fatalf("transitive alias: %+v", r)
	}
}

func TestPkgTidyRefusesATreeTheAllowlistDoesNotAdmit(t *testing.T) {
	dir := pkgProject(t, "\"corp.example/schemas/service\": {v: \"1.4.2\"}",
		func(d string) {
			pkgVendor(t, d, "corp.example/schemas/service", pkgService)
			write(t, filepath.Join(d, "aontu_meta", "vendor", "corp.example", "schemas",
				"service", "hook.sh"), "echo\n")
		})
	r := PkgTidy(dir, nil)
	if "error" != r.Verdict || 1 != len(r.Forbidden) ||
		"corp.example/schemas/service: hook.sh" != r.Forbidden[0] {
		t.Fatalf("tidy: %+v", r)
	}
	if _, err := os.Stat(filepath.Join(dir, "aontu_meta", "pkg-lock.aontu")); nil == err {
		t.Fatal("a refused tidy wrote a lockfile")
	}
}

func TestPkgTidyPinsNothingWithoutAnEntryFile(t *testing.T) {
	// A package file naming an entry that is not there has no meaning to
	// hash. The empty pin is the honest answer: the package resolved,
	// and nothing about its meaning was verifiable.
	dir := pkgProject(t, "\"corp.example/s\": {v: \"1.0.0\"}", func(d string) {
		pkgVendor(t, d, "corp.example/s", map[string]string{
			"pkg.aontu": "pkg: {path: \"corp.example/s\", main: \"gone.aontu\"}\n",
		})
	})
	r := PkgTidy(dir, nil)
	if "ok" != r.Verdict || "" != r.Lock[0].Canon {
		t.Fatalf("verdict %q canon %q", r.Verdict, r.Lock[0].Canon)
	}
}

func TestPkgDeclaredDepsIgnoresWhatIsNotADepBlock(t *testing.T) {
	// Every shape a `dep` block can fail to be. A package file is
	// ordinary Aontu, so it can say anything; what it does not say is
	// not a dependency, and reading it is not an error to report.
	for _, src := range []string{
		"1\n",
		"pkg: {path: \"a.b/c\"}\n",
		"dep: 1\n",
		"dep: {\"a.b/c\": 1}\n",         // an entry that is not a map
		"dep: {\"a.b/c\": {}}\n",        // an entry declaring no version
		"dep: {\"a.b/c\": {v: \"\"}}\n", // an empty version
	} {
		dir := t.TempDir()
		file := filepath.Join(dir, "pkg.aontu")
		write(t, file, src)
		if deps := declaredDeps(file, nil); 0 != len(deps) {
			t.Fatalf("%q gave %v", src, deps)
		}
	}
	// And a file that is not there at all.
	if deps := declaredDeps(filepath.Join(t.TempDir(), "gone.aontu"), nil); 0 != len(deps) {
		t.Fatalf("missing file gave %v", deps)
	}
}

func TestPkgReadLockAnswersNothingForWhatItCannotRead(t *testing.T) {
	// A lockfile is GENERATED, so a file that is not what the generator
	// writes is not a file to guess at: it pins nothing, and a tidy will
	// replace it.
	for _, text := range []string{
		"this is not the canonical line\n",
		"{\"other\":{}}\n",
	} {
		dir := t.TempDir()
		write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"), text)
		if lock := readLock(dir); 0 != len(lock) {
			t.Fatalf("%q gave %v", text, lock)
		}
	}
	if lock := readLock(t.TempDir()); 0 != len(lock) {
		t.Fatalf("no lockfile gave %v", lock)
	}
	// An entry with fields of the wrong kind pins empty strings.
	dir := t.TempDir()
	write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"corp.example/s\":{\"canon\":1,\"archive\":2,\"v\":3}}}\n")
	if lock := readLock(dir); 1 != len(lock) || "" != lock["corp.example/s"].Canon {
		t.Fatalf("hollow entry: %v", lock)
	}
}

func TestPkgVendorMaterialisesTheWholeTree(t *testing.T) {
	dir := t.TempDir()
	cache := filepath.Join(dir, "cache")
	v, _ := New().Unify(modSource)
	hash := CanonHash(v)

	store := cacheStoreDir(cache, hash, "corp.example/schemas/service")
	write(t, filepath.Join(store, "pkg.aontu"), pkgService["pkg.aontu"])
	write(t, filepath.Join(store, "service.aontu"), modSource)
	write(t, filepath.Join(store, "part", "extra.aontu"), "extra: true\n")

	write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"), lockHeader+
		"{\"lock\":{\"corp.example/schemas/service\":{\"archive\":\"\",\"canon\":\""+hash+
		"\",\"v\":\"1.4.2\"}}}\n")

	r := PkgVendor(dir, &PkgOptions{Cache: cache})
	if "ok" != r.Verdict || 1 != len(r.Vendored) {
		t.Fatalf("verdict %q vendored %v missing %v", r.Verdict, r.Vendored, r.Missing)
	}

	to := filepath.Join(dir, "aontu_meta", "vendor", "corp.example", "schemas", "service")
	for name, want := range map[string]string{
		"service.aontu": modSource,
		"part" + string(os.PathSeparator) + "extra.aontu": "extra: true\n",
	} {
		data, err := os.ReadFile(filepath.Join(to, name))
		if nil != err || want != string(data) {
			t.Fatalf("%s: %v %q", name, err, string(data))
		}
	}

	// Vendoring again finds the package in the vendor tree, which is
	// where it already is: a store that is its own destination is left
	// alone rather than copied onto itself.
	if r2 := PkgVendor(dir, &PkgOptions{Cache: cache}); "ok" != r2.Verdict {
		t.Fatalf("second vendor: %q", r2.Verdict)
	}
}

func TestPkgVendorReportsWhatNoStoreHas(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"corp.example/absent\":{\"canon\":\"aon1-x\",\"archive\":\"\",\"v\":\"1\"},"+
			"\"not-a-module\":{\"canon\":\"y\",\"archive\":\"\",\"v\":\"1\"}}}\n")
	r := PkgVendor(dir, nil)
	if "missing" != r.Verdict || 2 != len(r.Missing) {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
	if "corp.example/absent" != r.Missing[0] || "not-a-module" != r.Missing[1] {
		t.Fatalf("missing %v", r.Missing)
	}
}

// pkgPublishable is a package in its own right: it declares its path,
// its version and its entry, which is what a publish needs and a
// dependency does not.
func pkgPublishable(t *testing.T, version, src string) string {
	t.Helper()
	dir := t.TempDir()
	decl := "pkg: {path: \"corp.example/schemas/service\""
	if "" != version {
		decl += ", version: \"" + version + "\""
	}
	decl += ", main: \"service.aontu\"}\npublish: public\n"
	write(t, filepath.Join(dir, "pkg.aontu"), decl)
	if "" != src {
		write(t, filepath.Join(dir, "service.aontu"), src)
	}
	return dir
}

func TestPkgManifestIsWhatAPublishWouldSend(t *testing.T) {
	dir := pkgPublishable(t, "1.1.0", modSource)
	write(t, filepath.Join(dir, "pkg.aontu"),
		"pkg: {path: \"corp.example/schemas/service\", version: \"1.1.0\", main: \"service.aontu\"}\n"+
			"publish: public\ndep: {\"corp.example/core\": {v: \"1.0.0\"}}\nretract: [\"1.0.9\"]\n")
	r := PkgManifestOf(dir, "", nil)
	if "ok" != r.Verdict || nil == r.Manifest {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
	m := r.Manifest
	if ManifestSchema != m.Schema || "corp.example/schemas/service" != m.Package ||
		"1.1.0" != m.Version || "public" != m.Publish || "zip" != m.Archive.Format {
		t.Fatalf("manifest %+v", m)
	}
	// The canon-hash is THE pin: the same string `sync` locks and
	// `aontu hash` prints, so "has the truth changed?" is one field
	// read and a string compare.
	v, _ := New().Unify(modSource)
	if 1 != len(m.Modules) || CanonHash(v) != m.Modules[0].Canon ||
		"service.aontu" != m.Modules[0].Main || m.Package != m.Modules[0].Path {
		t.Fatalf("modules %+v", m.Modules)
	}
	if ArchiveOf(dir).Digest != m.Archive.Digest || 2 != len(m.Archive.Files) ||
		"pkg.aontu" != m.Archive.Files[0].Path || "service.aontu" != m.Archive.Files[1].Path {
		t.Fatalf("archive %+v", m.Archive)
	}
	if "1.0.0" != m.Deps["corp.example/core"].V || 1 != len(m.Retract) || "" != m.Moved {
		t.Fatalf("deps %+v retract %v moved %q", m.Deps, m.Retract, m.Moved)
	}
	text := ManifestText(m, map[string]any{"published": "2026-09-15T00:00:00Z"}, nil)
	if !strings.HasPrefix(text, "{\"archive\":{") || !strings.Contains(text, "\"published\":\"2026-09-15T00:00:00Z\"") {
		t.Fatalf("manifest text %s", text)
	}
}

func TestPkgManifestArchiveExcludesTheVendorCopy(t *testing.T) {
	dir := pkgPublishable(t, "1.1.0", modSource)
	write(t, filepath.Join(dir, "part", "extra.aontu"), "extra: true\n")
	pkgVendor(t, dir, "corp.example/other", map[string]string{"pkg.aontu": "pkg: {path: \"x\"}\n"})

	files := PkgManifestOf(dir, "", nil).Manifest.Archive.Files
	if 3 != len(files) || "part/extra.aontu" != files[0].Path ||
		"pkg.aontu" != files[1].Path || "service.aontu" != files[2].Path {
		t.Fatalf("files %v", files)
	}

	// A tree carrying what the allowlist refuses mints nothing.
	write(t, filepath.Join(dir, "build.sh"), "echo\n")
	bad := PkgManifestOf(dir, "", nil)
	if "error" != bad.Verdict || 1 != len(bad.Forbidden) || "build.sh" != bad.Forbidden[0] {
		t.Fatalf("forbidden: %+v", bad)
	}
}

func TestPkgManifestNeedsAVersionAndAnEntry(t *testing.T) {
	noVersion := PkgManifestOf(pkgPublishable(t, "", modSource), "", nil)
	if "error" != noVersion.Verdict ||
		1 != len(noVersion.Missing) || "pkg.version" != noVersion.Missing[0] {
		t.Fatalf("verdict %q missing %v", noVersion.Verdict, noVersion.Missing)
	}

	noEntry := PkgManifestOf(pkgPublishable(t, "1.0.0", ""), "", nil)
	if "error" != noEntry.Verdict ||
		1 != len(noEntry.Missing) || "service.aontu" != noEntry.Missing[0] {
		t.Fatalf("verdict %q missing %v", noEntry.Verdict, noEntry.Missing)
	}

	// A directory with no package file at all declares neither.
	bare := PkgManifestOf(t.TempDir(), "", nil)
	if "error" != bare.Verdict || 3 != len(bare.Missing) {
		t.Fatalf("verdict %q missing %v", bare.Verdict, bare.Missing)
	}
}

func TestPkgManifestGateRefusesABreakingVersion(t *testing.T) {
	// THE PUBLISH-TIME GATE is G3's subsumption, so the verdict and
	// the findings are Subsume's, unchanged.
	prior := pkgPublishable(t, "1.0.0", modSource)
	next := pkgPublishable(t, "1.1.0", modSource+"region: *\"eu\" | string\n")

	r := PkgManifestOf(next, prior, nil)
	if "breaking" != r.Verdict || 1 > len(r.Findings) {
		t.Fatalf("verdict %q findings %v", r.Verdict, r.Findings)
	}
	if "$.region" != r.Findings[0].Path {
		t.Fatalf("finding path %q", r.Findings[0].Path)
	}

	// And a compatible change passes the same gate.
	ok := PkgManifestOf(pkgPublishable(t, "1.2.0", modSource+"owner?: string\n"), prior, nil)
	if "ok" != ok.Verdict || 0 != len(ok.Findings) {
		t.Fatalf("verdict %q findings %v", ok.Verdict, ok.Findings)
	}
}

func TestPkgManifestGateChecksOutcomeAsWellAsAcceptance(t *testing.T) {
	// ADR-022: `port: 8080` -> `port: integer` passes subsumption and
	// turns a working consumer build into an error, so the gate refuses
	// it; a value that moves while still admitting its predecessor is
	// refused too. Widening around an unchanged outcome passes.
	prior := pkgPublishable(t, "1.0.0", "name: string\nport: 8080\n")
	loosened := PkgManifestOf(pkgPublishable(t, "1.1.0", "name: string\nport: integer\n"), prior, nil)
	if "breaking" != loosened.Verdict || 1 != len(loosened.Findings) ||
		"compat_undetermined" != loosened.Findings[0].Code || "$.port" != loosened.Findings[0].Path ||
		!strings.Contains(loosened.Findings[0].Message, "resolved to 8080 in the prior version") ||
		"integer" != *loosened.Findings[0].Expected || "8080" != *loosened.Findings[0].Actual {
		t.Fatalf("verdict %q findings %+v", loosened.Verdict, loosened.Findings)
	}

	moved := PkgManifestOf(pkgPublishable(t, "1.1.0", "name: string\nport: *9090|8080\n"), prior, nil)
	found := false
	for _, f := range moved.Findings {
		if "compat_outcome_changed" == f.Code && "$.port" == f.Path &&
			strings.Contains(f.Message, "resolves to 9090 now") {
			found = true
		}
	}
	if "breaking" != moved.Verdict || !found {
		t.Fatalf("verdict %q findings %+v", moved.Verdict, moved.Findings)
	}

	widened := PkgManifestOf(pkgPublishable(t, "1.1.0", "name: string\nport: *8080|integer\n"), prior, nil)
	if "ok" != widened.Verdict || 0 != len(widened.Findings) {
		t.Fatalf("verdict %q findings %+v", widened.Verdict, widened.Findings)
	}

	// Below the top level: a map that becomes a kind, a list element,
	// and a key that vanishes; hidden values generate nothing to lose.
	nested := pkgPublishable(t, "1.0.0", "svc: { port: 8080, tags: [\"a\", \"b\"] }\nsecret: hide(1)\n")
	gone := PkgManifestOf(pkgPublishable(t, "1.1.0", "svc: top\nsecret: hide(1)\n"), nested, nil)
	if "breaking" != gone.Verdict || 1 != len(gone.Findings) ||
		"compat_undetermined" != gone.Findings[0].Code || "$.svc" != gone.Findings[0].Path {
		t.Fatalf("verdict %q findings %+v", gone.Verdict, gone.Findings)
	}
	element := PkgManifestOf(pkgPublishable(t, "1.1.0",
		"svc: { port: 8080, tags: [\"a\", string] }\nsecret: hide(1)\n"), nested, nil)
	if 1 != len(element.Findings) || "compat_undetermined" != element.Findings[0].Code ||
		"$.svc.tags.1" != element.Findings[0].Path || 2 != len(element.Findings[0].Sites) {
		t.Fatalf("findings %+v", element.Findings)
	}
	dropped := PkgManifestOf(
		pkgPublishable(t, "1.1.0", "svc: { port: 8080, tags: [\"a\", \"b\"], extra?: 1 }\nsecret: hide(1)\nother?: 2\n"),
		pkgPublishable(t, "1.0.0", "svc: { port: 8080, tags: [\"a\", \"b\"] }\nsecret: hide(1)\nother?: 2\n"), nil)
	if "ok" != dropped.Verdict {
		t.Fatalf("verdict %q findings %+v", dropped.Verdict, dropped.Findings)
	}
	lost := PkgManifestOf(pkgPublishable(t, "1.1.0", "svc: { tags: [\"a\", \"b\"] }\nsecret: hide(1)\n"), nested, nil)
	var lostKey *VetFinding
	for i := range lost.Findings {
		if "compat_undetermined" == lost.Findings[i].Code {
			lostKey = &lost.Findings[i]
		}
	}
	if nil == lostKey || "$.svc.port" != lostKey.Path || 1 != len(lostKey.Sites) || nil != lostKey.Expected {
		t.Fatalf("findings %+v", lost.Findings)
	}

	// The outcome walk on its own: a side that does not evaluate is an
	// error, not a pass.
	if r := CompatOutcome("a: 1 & 2\n", "a: 1\n", nil); "error" != r.Verdict || 0 != len(r.Findings) {
		t.Fatalf("report %+v", r)
	}
	// A prior list longer than the next: the missing element is a
	// finding, not an index out of range.
	if r := CompatOutcome("l: [1]\n", "l: [1, 2]\n", nil); "breaking" != r.Verdict || 1 != len(r.Findings) ||
		"$.l.1" != r.Findings[0].Path {
		t.Fatalf("report %+v", r)
	}
	if r := CompatOutcome("a: *1|integer\n", "a: **1|*2|integer\n", nil); "breaking" != r.Verdict {
		t.Fatalf("report %+v", r)
	}
	if r := CompatOutcome("s: hide({ a: 2 })\n", "s: hide({ a: 1 })\n", nil); "ok" != r.Verdict {
		t.Fatalf("report %+v", r)
	}
	// A bag whose children generate nothing loses nothing when it goes.
	if r := CompatOutcome("svc: top\n", "svc: { h: hide({ a: 1 }), k: integer }\n", nil); "ok" != r.Verdict {
		t.Fatalf("report %+v", r)
	}
	// A prior that does not evaluate cannot be gated against: error.
	if r := PkgManifestOf(pkgPublishable(t, "1.1.0", "a: 1\n"),
		pkgPublishable(t, "1.0.0", "a: 1 & 2\n"), nil); "error" != r.Verdict {
		t.Fatalf("verdict %q", r.Verdict)
	}
}

func TestPkgManifestHasNoMajorToBumpPastTheGate(t *testing.T) {
	// Under ADR-022 a breaking change needs a new NAME, chosen by the
	// publisher; a version number is not a promise the toolchain can
	// check, so a bigger one buys nothing at the gate.
	prior := pkgPublishable(t, "1.0.0", modSource)
	next := pkgPublishable(t, "2.0.0", modSource+"region: string\n")
	if r := PkgManifestOf(next, prior, nil); "breaking" != r.Verdict {
		t.Fatalf("verdict %q", r.Verdict)
	}
}

func TestPkgManifestPriorWithNoEntryCannotBeGatedAgainst(t *testing.T) {
	r := PkgManifestOf(pkgPublishable(t, "1.1.0", modSource),
		pkgPublishable(t, "1.0.0", ""), nil)
	if "error" != r.Verdict ||
		1 != len(r.Missing) || "service.aontu" != r.Missing[0] {
		t.Fatalf("verdict %q missing %v", r.Verdict, r.Missing)
	}
}

func TestPkgManifestGateCanBeUndecided(t *testing.T) {
	// Subsumption is THREE-valued plus error, and the gate passes all
	// four through: a question it cannot decide is not a pass. `must`
	// carries a message the checker cannot reason about, so the pair
	// below is undecided rather than compatible.
	prior := pkgPublishable(t, "1.0.0", "a: min(1)\n")
	next := pkgPublishable(t, "1.1.0", "a: must(min(1), \"m\")\n")

	r := PkgManifestOf(next, prior, nil)
	if "undecided" != r.Verdict {
		t.Fatalf("verdict %q findings %v", r.Verdict, r.Findings)
	}
}

func TestPkgSelfIgnoresWhatIsNotAPackageDeclaration(t *testing.T) {
	// A package file is ordinary Aontu, so it can say anything. What it
	// does not say about ITSELF leaves the manifest with nothing to
	// mint, which is the same answer as saying nothing at all.
	for _, src := range []string{
		"1\n",
		"dep: {}\n",
		"pkg: 1\n",
		"pkg: {moved: 1}\nretract: [1]\n",
	} {
		dir := t.TempDir()
		write(t, filepath.Join(dir, "pkg.aontu"), src)
		r := PkgManifestOf(dir, "", nil)
		if "error" != r.Verdict || 3 != len(r.Missing) {
			t.Fatalf("%q gave verdict %q missing %v", src, r.Verdict, r.Missing)
		}
	}
	dir := t.TempDir()
	write(t, filepath.Join(dir, "pkg.aontu"),
		"pkg: {path: \"a.b/c\", version: \"1.0.0\"}\nmoved: \"a.b/d\"\nretract: [\"0.9.0\", 1]\n")
	write(t, filepath.Join(dir, "main.aontu"), "a: 1\n")
	r := PkgManifestOf(dir, "", nil)
	if "ok" != r.Verdict || "a.b/d" != r.Manifest.Moved || 1 != len(r.Manifest.Retract) {
		t.Fatalf("declarations: %+v", r.Manifest)
	}
}

// The canon-hash of `nil`, which is what EVERY module that fails to
// evaluate would pin if the lockfile were written from one -- the same
// string for all of them, so a pin that carries no information while
// looking exactly like one that does (use-cases/BUGS.md §31).
const pkgNilPin = "aon1-XaOkx_EXlEJ1tMhinEkWQDYl1aSmVzoB7LA_Dp0u2-Y"

func TestPkgTransitiveVendorResolves(t *testing.T) {
	dir := pkgProject(t,
		"\"corp.example/schemas/service\": {v: \"1.4.2\"},"+
			" \"corp.example/schemas/common\": {v: \"1.0.0\"}",
		func(d string) {
			pkgVendor(t, d, "corp.example/schemas/service",
				map[string]string{
					"pkg.aontu": "pkg: {path: \"corp.example/schemas/service\"," +
						" version: \"1.4.2\", main: \"service.aontu\"}\n" +
						"dep: {\"corp.example/schemas/common\": {v: \"1.0.0\"}}\n",
					"service.aontu": "@\"corp.example/schemas/common\"\n" +
						"spec: {name: string, port: *8080 | integer}\n",
				})
			pkgVendor(t, d, "corp.example/schemas/common",
				map[string]string{
					"pkg.aontu": "pkg: {path: \"corp.example/schemas/common\"," +
						" version: \"1.0.0\", main: \"common.aontu\"}\n",
					"common.aontu": "naming: {id: string}\n",
				})
		})
	write(t, filepath.Join(dir, "main.aontu"),
		"lib: hide(@\"corp.example/schemas/service\")\n"+
			"svc: $.lib.spec & {name: \"checkout\"}\n")

	report := PkgTidy(dir, nil)
	if "ok" != report.Verdict {
		t.Fatalf("tidy verdict: %s %+v", report.Verdict, report)
	}
	for _, e := range report.Lock {
		// NOT the hash of nil, which is what a module that does not
		// evaluate pins -- and the same string for every one of them.
		if pkgNilPin == e.Canon {
			t.Fatalf("%s pinned the hash of nil", e.Key)
		}
	}

	src, err := os.ReadFile(filepath.Join(dir, "main.aontu"))
	if nil != err {
		t.Fatal(err)
	}
	a := NewWithBase(dir)
	a.File = filepath.Join(dir, "main.aontu")
	out, uerr := a.Generate(string(src))
	if nil != uerr {
		t.Fatalf("evaluate: %v", uerr)
	}
	svc, _ := out.(map[string]any)["svc"].(map[string]any)
	if nil == svc || "8080" != fmt.Sprint(svc["port"]) {
		t.Fatalf("unexpected result: %+v", out)
	}
}

// Twin of manifest-refuses-to-mint-a-pin... in ts/test/pkg.test.ts.
func TestPkgManifestRefusesAnUnevaluableModule(t *testing.T) {
	dir := pkgPublishable(t, "1.0.0", "a: 1\na: 2\n")
	r := PkgManifestOf(dir, "", nil)
	if "error" != r.Verdict || nil != r.Manifest {
		t.Fatalf("verdict %q manifest %v", r.Verdict, r.Manifest)
	}
}

// Twin of the-pkg-verbs-take-the-trust-options in ts/test/pkg.test.ts.
func TestPkgManifestUnderAConfinement(t *testing.T) {
	dir := pkgPublishable(t, "1.0.0", "x: @\"../pkgtool-outside.aontu\"\n")
	write(t, filepath.Join(filepath.Dir(dir), "pkgtool-outside.aontu"),
		"secret: \"leaked\"\n")

	open := PkgManifestOf(dir, "", nil)
	if "ok" != open.Verdict || nil == open.Manifest {
		t.Fatalf("unconfined: verdict %q", open.Verdict)
	}

	for _, opts := range []*PkgOptions{
		{Trust: &TrustOptions{IncludeNone: true}},
		{Trust: &TrustOptions{IncludeRoot: dir}},
	} {
		shut := PkgManifestOf(dir, "", opts)
		if "error" != shut.Verdict || nil != shut.Manifest {
			t.Fatalf("confined: verdict %q", shut.Verdict)
		}
	}
}

func TestPkgTidyRefusesAnUnevaluableModule(t *testing.T) {
	dir := pkgProject(t,
		"\"corp.example/schemas/service\": {v: \"1.4.2\"}", func(d string) {
			pkgVendor(t, d, "corp.example/schemas/service",
				map[string]string{
					"pkg.aontu": pkgService["pkg.aontu"],
					// Contradicts itself: no meaning, so nothing to pin.
					"service.aontu": "a: 1\na: 2\n",
				})
		})

	report := PkgTidy(dir, nil)
	if "error" != report.Verdict || 1 != len(report.Unevaluable) {
		t.Fatalf("tidy: %+v", report)
	}
	// AND THE LOCKFILE IS LEFT ALONE. A refusal that wrote a lockfile
	// would be the defect with a louder message.
	if _, err := os.Stat(filepath.Join(dir, "aontu_meta", "pkg-lock.aontu")); nil == err {
		t.Fatal("a refused tidy wrote a lockfile")
	}
}

func TestPkgVerifyBytesBeforeMeaning(t *testing.T) {
	svc := ""
	dir := pkgProject(t,
		"\"corp.example/schemas/service\": {v: \"1.4.2\"}", func(d string) {
			pkgVendor(t, d, "corp.example/schemas/service", pkgService)
			svc = filepath.Join(d, "aontu_meta", "vendor", "corp.example", "schemas",
				"service", "service.aontu")
		})

	if "ok" != PkgTidy(dir, nil).Verdict {
		t.Fatal("tidy did not hold")
	}
	lock, err := os.ReadFile(filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"))
	if nil != err {
		t.Fatal(err)
	}

	clean := PkgVerify(dir, nil)
	if "ok" != clean.Verdict || 1 != len(clean.Verified) {
		t.Fatalf("clean verify: %+v", clean)
	}

	// Tamper, and ask again: the archive digest moves before anything
	// is evaluated, and that is the pin reported.
	write(t, svc, "name: string\nport: *9090 | integer\n")
	bad := PkgVerify(dir, nil)
	if "mismatch" != bad.Verdict || 1 != len(bad.Mismatched) || "archive" != bad.Mismatched[0].Pin ||
		!strings.HasPrefix(bad.Mismatched[0].Got, "sha256:") {
		t.Fatalf("tampered verify: %+v", bad)
	}
	// THE LOCKFILE IS UNTOUCHED, which is the whole difference from
	// tidy: a gate that rewrote what it was checking would pass every
	// time.
	now, err := os.ReadFile(filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"))
	if nil != err || string(lock) != string(now) {
		t.Fatal("verify rewrote the lockfile")
	}

	// The canon pin is reached by making the lock's archive agree.
	repin := func(src string) {
		write(t, svc, src)
		arch := ArchiveOf(filepath.Dir(svc)).Digest
		i := strings.Index(string(lock), "\"archive\":\"")
		j := strings.Index(string(lock)[i+11:], "\"")
		write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"),
			string(lock)[:i+11]+arch+string(lock)[i+11+j:])
	}
	repin("a: 1\na: 2\n")
	broken := PkgVerify(dir, nil)
	if "mismatch" != broken.Verdict || "canon" != broken.Mismatched[0].Pin || "" != broken.Mismatched[0].Got {
		t.Fatalf("broken verify: %+v", broken)
	}
	repin("name: string\nport: *9090 | integer\n")
	moved := PkgVerify(dir, nil)
	if "canon" != moved.Mismatched[0].Pin || !strings.HasPrefix(moved.Mismatched[0].Got, "aon1-") {
		t.Fatalf("moved verify: %+v", moved)
	}
	// A forbidden file in the tree is a bytes mismatch too.
	repin(modSource)
	write(t, filepath.Join(filepath.Dir(svc), "hook.sh"), "echo\n")
	forb := PkgVerify(dir, nil)
	if "archive" != forb.Mismatched[0].Pin || "forbidden: hook.sh" != forb.Mismatched[0].Got {
		t.Fatalf("forbidden verify: %+v", forb)
	}
}

func TestPkgVerifyChecksAKeptManifest(t *testing.T) {
	dir := pkgProject(t, "\"corp.example/schemas/service\": {v: \"1.4.2\"}",
		func(d string) { pkgVendor(t, d, "corp.example/schemas/service", pkgService) })
	tree := filepath.Join(dir, "aontu_meta", "vendor", "corp.example", "schemas", "service")
	a := ArchiveOf(tree)
	manifest := "{\"schema\":\"aontu-package/v1\",\"archive\":{\"digest\":\"" + a.Digest +
		"\",\"files\":[{\"path\":\"pkg.aontu\",\"digest\":\"" + a.Files[0].Digest +
		"\",\"size\":" + fmt.Sprint(a.Files[0].Size) + "},{\"path\":\"service.aontu\",\"digest\":\"" +
		a.Files[1].Digest + "\",\"size\":" + fmt.Sprint(a.Files[1].Size) + "}]}}"
	write(t, filepath.Join(tree, "aontu_meta", "manifest.aontu"), manifest)

	if r := PkgTidy(dir, nil); "ok" != r.Verdict || Sha256Hex([]byte(manifest)) != r.Lock[0].Manifest {
		t.Fatalf("tidy: %+v", r)
	}
	if r := PkgVerify(dir, nil); "ok" != r.Verdict {
		t.Fatalf("verify: %+v", r)
	}
	// A manifest swapped for one with other bytes is caught by its own
	// pin; one listing another digest for a file, by the file walk.
	write(t, filepath.Join(tree, "aontu_meta", "manifest.aontu"), manifest+" ")
	if r := PkgVerify(dir, nil); "manifest" != r.Mismatched[0].Pin {
		t.Fatalf("swapped manifest: %+v", r)
	}
	other := strings.Replace(manifest, a.Files[0].Digest, "sha256:"+strings.Repeat("0", 64), 1)
	write(t, filepath.Join(tree, "aontu_meta", "manifest.aontu"), other)
	if r := PkgTidy(dir, nil); "ok" != r.Verdict {
		t.Fatalf("retidy: %+v", r)
	}
	r := PkgVerify(dir, nil)
	if "manifest" != r.Mismatched[0].Pin || !strings.HasPrefix(r.Mismatched[0].Got, "pkg.aontu sha256:") {
		t.Fatalf("listed digest: %+v", r)
	}
	// A manifest that is not even a document still has a digest to pin.
	write(t, filepath.Join(tree, "aontu_meta", "manifest.aontu"), "not json")
	if r := PkgTidy(dir, nil); "ok" != r.Verdict || !strings.HasPrefix(r.Lock[0].Manifest, "sha256:") {
		t.Fatalf("hollow manifest: %+v", r)
	}
}

func TestPkgVerifyRefusesAnUncoveredProject(t *testing.T) {
	dir := pkgProject(t,
		"\"corp.example/schemas/service\": {v: \"1.4.2\"}", func(d string) {
			pkgVendor(t, d, "corp.example/schemas/service", pkgService)
		})

	bare := PkgVerify(dir, nil)
	if "unlocked" != bare.Verdict || 1 != len(bare.Unlocked) ||
		"corp.example/schemas/service" != bare.Unlocked[0] {
		t.Fatalf("no lockfile: %+v", bare)
	}

	// Tidy writes it, and the same question now passes.
	if "ok" != PkgTidy(dir, nil).Verdict {
		t.Fatal("tidy did not hold")
	}
	if r := PkgVerify(dir, nil); "ok" != r.Verdict || 0 != len(r.Unlocked) {
		t.Fatalf("after tidy: %+v", r)
	}

	write(t, filepath.Join(dir, "pkg.aontu"),
		"pkg: {path: \"corp.example/app\"}\ndep: {"+
			"\"corp.example/schemas/service\": {v: \"1.4.2\"}, "+
			"\"corp.example/schemas/later\": {v: \"1.0.0\"}}\n")
	stale := PkgVerify(dir, nil)
	if "unlocked" != stale.Verdict || 1 != len(stale.Unlocked) ||
		"corp.example/schemas/later" != stale.Unlocked[0] {
		t.Fatalf("stale lockfile: %+v", stale)
	}
	if 1 != len(stale.Verified) {
		t.Fatalf("the pin that is there should still verify: %+v", stale)
	}
}

func TestPkgVerifyReportsWhatNoStoreHolds(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aontu"), lockHeader+
		"{\"lock\":{\"corp.example/absent\":{\"archive\":\"\",\"canon\":\"aon1-x\",\"v\":\"1\"},"+
		"\"corp.example/hollow\":{\"archive\":\"\",\"canon\":\"aon1-y\",\"v\":\"1\"},"+
		"\"not-a-module\":{\"archive\":\"\",\"canon\":\"aon1-z\",\"v\":\"1\"}}}\n")

	// hollow is vendored as a directory with a pkg.aontu naming an entry
	// file that was never written.
	pkgVendor(t, dir, "corp.example/hollow", map[string]string{
		"pkg.aontu": "pkg: {path: \"corp.example/hollow\", main: \"hollow.aontu\"}\n",
	})

	r := PkgVerify(dir, nil)
	if "missing" != r.Verdict || 3 != len(r.Missing) || 0 != len(r.Mismatched) {
		t.Fatalf("verdict %q missing %v mismatched %v",
			r.Verdict, r.Missing, r.Mismatched)
	}
	for i, want := range []string{
		"corp.example/absent", "corp.example/hollow", "not-a-module"} {
		if want != r.Missing[i] {
			t.Fatalf("missing %v", r.Missing)
		}
	}
}

func TestPkgRefreezeRecomputesCanonPinsAndNothingElse(t *testing.T) {
	dir := pkgProject(t, "\"corp.example/schemas/service\": {v: \"1.4.2\"}",
		func(d string) { pkgVendor(t, d, "corp.example/schemas/service", pkgService) })
	if "ok" != PkgTidy(dir, nil).Verdict {
		t.Fatal("tidy")
	}
	lockPath := filepath.Join(dir, "aontu_meta", "pkg-lock.aontu")
	lock, _ := os.ReadFile(lockPath)

	same := PkgRefreeze(dir, nil)
	if "ok" != same.Verdict || 1 != len(same.Unchanged) || 0 != len(same.Repinned) {
		t.Fatalf("unchanged: %+v", same)
	}

	// A stale canon is re-pinned; the archive pin is untouched even when
	// it is wrong, because that is not this verb's question.
	stale := strings.Replace(string(lock), readLock(dir)["corp.example/schemas/service"].Canon, "aon1-stale", 1)
	stale = strings.Replace(stale, readLock(dir)["corp.example/schemas/service"].Archive, "sha256:keep", 1)
	write(t, lockPath, stale)
	r := PkgRefreeze(dir, nil)
	v, _ := New().Unify(modSource)
	if "ok" != r.Verdict || 1 != len(r.Repinned) || "aon1-stale" != r.Repinned[0].From ||
		CanonHash(v) != r.Repinned[0].To {
		t.Fatalf("repin: %+v", r)
	}
	if "sha256:keep" != readLock(dir)["corp.example/schemas/service"].Archive {
		t.Fatal("refreeze touched the archive pin")
	}

	// What it cannot re-pin it names, and writes nothing.
	write(t, lockPath, strings.Replace(string(lock), "}}}",
		"},\"corp.example/gone\":{\"archive\":\"\",\"canon\":\"aon1-g\",\"v\":\"1\"},"+
			"\"not-a-module\":{\"archive\":\"\",\"canon\":\"aon1-n\",\"v\":\"1\"}}}", 1))
	miss := PkgRefreeze(dir, nil)
	if "missing" != miss.Verdict || 2 != len(miss.Missing) {
		t.Fatalf("missing: %+v", miss)
	}
	write(t, lockPath, string(lock))
	write(t, filepath.Join(dir, "aontu_meta", "vendor", "corp.example", "schemas",
		"service", "service.aontu"), "a: 1\na: 2\n")
	if bad := PkgRefreeze(dir, nil); "error" != bad.Verdict || 1 != len(bad.Unevaluable) {
		t.Fatalf("unevaluable: %+v", bad)
	}
}

func TestPkgTreeDrawsTheClosureFromTheStore(t *testing.T) {
	dir := pkgProject(t,
		"\"corp.example/s\": {v: \"1.0.0\"}, \"corp.example/geo\": {v: \"1.0.0\"}",
		func(d string) {
			pkgVendor(t, d, "corp.example/s", map[string]string{
				"pkg.aontu": "pkg: {path: \"corp.example/s\"}\n" +
					"dep: {\"corp.example/geo\": {v: \"1.0.0\"}}\n",
				"main.aontu": modSource,
			})
			pkgVendor(t, d, "corp.example/geo", map[string]string{
				"pkg.aontu":  "pkg: {path: \"corp.example/geo\"}\n",
				"main.aontu": "region: string\n",
			})
		})
	if "ok" != PkgTidy(dir, nil).Verdict {
		t.Fatal("tidy")
	}
	r := PkgTree(dir, nil)
	if "ok" != r.Verdict || "corp.example/app" != r.Root || 3 != len(r.Nodes) ||
		2 != len(r.Nodes[0].Deps) || "corp.example/geo" != r.Nodes[2].Deps[0] {
		t.Fatalf("tree: %+v", r)
	}
	lockPath := filepath.Join(dir, "aontu_meta", "pkg-lock.aontu")
	lock, _ := os.ReadFile(lockPath)
	write(t, lockPath, strings.Replace(string(lock), "}}}",
		"},\"corp.example/gone\":{\"archive\":\"\",\"canon\":\"aon1-g\",\"v\":\"1\"}}}", 1))
	write(t, filepath.Join(dir, "pkg.aontu"), "dep: {\"corp.example/s\": {v: \"1.0.0\"}}\n")
	miss := PkgTree(dir, nil)
	if "missing" != miss.Verdict || "." != miss.Root || 1 != len(miss.Missing) {
		t.Fatalf("missing: %+v", miss)
	}
}

func TestVersionsCompareByExactDigits(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want int
	}{
		{"1.9007199254740992.0", "1.9007199254740993.0", -1},
		{"1.9007199254740993.0", "1.9007199254740992.0", 1},
		{"1.01.0", "1.1.0", 0},
		{"1.0.0", "1.0.0-rc", -1},
		{"1.0.10", "1.0.9", 1},
	} {
		if got := VersionCompare(c.a, c.b); c.want != got {
			t.Fatalf("VersionCompare(%q,%q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestAKeyWithAKnownExtensionNamesAFile(t *testing.T) {
	for key, want := range map[string]bool{
		"corp.example/models/config.json": false, "corp.example/models/types.aontu": false,
		"corp.example/models/v1.2": true, "alias:legacy": true, "corp.example/models/config.json@1": false,
	} {
		if got := usableKey(key); want != got {
			t.Fatalf("usableKey(%q) = %v", key, got)
		}
	}
}

func TestEntryPathsRefuseReservedNamesAndDeepNesting(t *testing.T) {
	for p, want := range map[string]string{
		"con.aontu":                          "an entry path element is a name a platform reserves",
		"a/NUL.json":                       "an entry path element is a name a platform reserves",
		"a/lpt1":                           "an entry path element is a name a platform reserves",
		"a/con2.aontu":                       "",
		strings.Repeat("a/", 32) + "x.aontu": "an entry path has more than 32 elements",
		strings.Repeat("a/", 31) + "x.aontu": "",
	} {
		if got := RelPathError(p); want != got {
			t.Fatalf("RelPathError(%q) = %q", p, got)
		}
	}
}

func TestAPublisherRefusesWhatEveryConsumerWould(t *testing.T) {
	saved := []int{ArchiveLimitBytes, ArchiveLimitUnpacked, ArchiveLimitFiles, ArchiveLimitFileBytes}
	defer func() {
		ArchiveLimitBytes, ArchiveLimitUnpacked, ArchiveLimitFiles, ArchiveLimitFileBytes = saved[0], saved[1], saved[2], saved[3]
	}()
	archive := Archive{Size: 10, Files: []ArchiveFile{{Path: "a.aontu", Size: 6}, {Path: "b.aontu", Size: 4}}}
	if over := archiveOverCaps(archive); 0 != len(over) {
		t.Fatalf("over %v", over)
	}
	ArchiveLimitBytes, ArchiveLimitFiles, ArchiveLimitFileBytes, ArchiveLimitUnpacked = 5, 1, 5, 8
	want := "archive: 10 bytes, over the cap of 5|archive: 2 files, over the cap of 1|a.aontu: 6 bytes, over the cap of 5|archive: unpacks to 10 bytes, over the cap of 8"
	if got := strings.Join(archiveOverCaps(archive), "|"); want != got {
		t.Fatalf("over %q", got)
	}
	dir := t.TempDir()
	write(t, filepath.Join(dir, "pkg.aontu"), "pkg: {path: \"corp.example/x\", version: \"1.0.0\", main: \"main.aontu\"}\n")
	write(t, filepath.Join(dir, "main.aontu"), "name: string\nport: *8080 | integer\n")
	if r := PkgManifestOf(dir, "", nil); "error" != r.Verdict || 1 > len(r.Forbidden) || !strings.HasPrefix(r.Forbidden[0], "archive: ") {
		t.Fatalf("caps: %+v", r)
	}
	ArchiveLimitBytes, ArchiveLimitUnpacked, ArchiveLimitFiles, ArchiveLimitFileBytes = saved[0], saved[1], saved[2], saved[3]
	if r := PkgManifestOf(dir, "", nil); "ok" != r.Verdict {
		t.Fatalf("restored: %+v", r)
	}

	// Coordinates that are not a package path and a version, and an
	// entry that leaves the tree, mint nothing.
	write(t, filepath.Join(dir, "pkg.aontu"), "pkg: {path: \"../../escape\", version: \"v1\", main: \"../main.aontu\"}\n")
	odd := PkgManifestOf(dir, "", nil)
	if "error" != odd.Verdict || "../main.aontu|pkg.path (../../escape is not a package path)|pkg.version (v1 is not MAJOR.MINOR.PATCH)" != strings.Join(odd.Missing, "|") {
		t.Fatalf("odd: %+v", odd)
	}
	write(t, filepath.Join(dir, "pkg.aontu"), "pkg: {path: \"alias:x\", version: \"1.0.0\", main: \"main.aontu\"}\n")
	if r := PkgManifestOf(dir, "", nil); "pkg.path (alias:x is not a package path)" != strings.Join(r.Missing, "|") {
		t.Fatalf("alias: %+v", r)
	}
}

func TestTheStoreIsFoundUnderTheServedCanonToo(t *testing.T) {
	dir := t.TempDir()
	cache := filepath.Join(dir, "cache")
	pkg := "corp.example/x"
	served := "aon1-" + strings.Repeat("S", 43)
	if "" != downloadedCanon(cache, pkg, "1.0.0") || "" != downloadedCanon(cache, pkg, "") {
		t.Fatal("nothing downloaded")
	}
	manifest := filepath.Join(cacheDownloadDir(cache, pkg), "1.0.0.manifest")
	write(t, manifest, "{not json")
	if "" != downloadedCanon(cache, pkg, "1.0.0") {
		t.Fatal("not json")
	}
	write(t, manifest, "{\"modules\":[]}")
	if "" != downloadedCanon(cache, pkg, "1.0.0") {
		t.Fatal("no modules")
	}
	write(t, manifest, "{\"modules\":[{\"canon\":\""+served+"\"}]}")
	if served != downloadedCanon(cache, pkg, "1.0.0") {
		t.Fatal("served")
	}
	at := cacheStoreDir(cache, served, pkg)
	write(t, filepath.Join(at, "pkg.aontu"), "pkg: {path: \"corp.example/x\"}\n")
	other := "aon1-" + strings.Repeat("C", 43)
	if at != pkgStoreDir(dir, pkg, other, pkg, cache, "1.0.0") || "" != pkgStoreDir(dir, pkg, other, pkg, cache, "") ||
		at != pkgStoreDir(dir, pkg, served, pkg, cache, "1.0.0") || at != pkgStoreDir(dir, pkg, "", pkg, cache, "1.0.0") ||
		"" != pkgStoreDir(dir, pkg, "", pkg, "", "1.0.0") {
		t.Fatal("store lookup")
	}

	// A vendor copy replaces the destination rather than overlaying it.
	to := filepath.Join(dir, "vendor", "x")
	write(t, filepath.Join(to, "stale.aontu"), "stale: 1\n")
	if err := vendorCopy(at, to); nil != err {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(to, "pkg.aontu")); nil != err {
		t.Fatal("copied")
	}
	if _, err := os.Stat(filepath.Join(to, "stale.aontu")); nil == err {
		t.Fatal("stale kept")
	}
}

func TestALockThatCannotBeWrittenIsAnError(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "pkg.aontu"), "pkg: {path: \"corp.example/x\"}\n")
	write(t, filepath.Join(dir, "aontu_meta"), "a file where the directory goes\n")
	r := PkgTidy(dir, nil)
	if "error" != r.Verdict || 1 != len(r.Unevaluable) || !strings.HasPrefix(r.Unevaluable[0], "pkg-lock.aontu: ") {
		t.Fatalf("tidy: %+v", r)
	}
}
