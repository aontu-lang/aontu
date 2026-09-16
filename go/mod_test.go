/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const modSource = "name: string\nport: *8080 | integer\n"

// modWorld is a consumer with one dependency, held in the vendor tree
// or in the content-addressed cache under (canon-hash, package path).
func modWorld(t *testing.T, store string) (dir, main, hash, cache string) {
	t.Helper()
	dir = t.TempDir()
	cache = filepath.Join(dir, "cache")

	v, _ := New().Unify(modSource)
	hash = CanonHash(v)

	moddir := filepath.Join(dir, "aontu_meta", "vendor", "corp.example", "schemas", "service")
	if "cache" == store {
		moddir = cacheStoreDir(cache, hash, "corp.example/schemas/service")
	}
	if err := os.MkdirAll(moddir, 0o755); nil != err {
		t.Fatal(err)
	}
	write(t, filepath.Join(moddir, "pkg.aon"),
		"pkg: {path: \"corp.example/schemas/service\", main: \"service.aon\"}\n")
	write(t, filepath.Join(moddir, "service.aon"), modSource)

	write(t, filepath.Join(dir, "pkg.aon"), "pkg: {path: \"corp.example/app\"}\n")
	main = filepath.Join(dir, "main.aon")
	write(t, main,
		"svc: @\"corp.example/schemas/service#"+hash+"\"\nsvc: name: \"auth\"\n")

	return dir, main, hash, cache
}

func write(t *testing.T, file, src string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(file), 0o755); nil != err {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(src), 0o600); nil != err {
		t.Fatal(err)
	}
}

func modGen(t *testing.T, a *Aontu, main string) (any, error) {
	t.Helper()
	return a.Generate("x: @\"" + srcPath(main) + "\"\n")
}

func TestModCacheIsContentAddressed(t *testing.T) {
	_, main, _, cache := modWorld(t, "cache")
	a := New()
	a.ModCache = cache
	if _, err := modGen(t, a, main); nil != err {
		t.Fatalf("cache resolution: %v", err)
	}
}

func TestModCacheNotConsultedUnderRoot(t *testing.T) {
	// A confined evaluation sees the project's own aontu_meta/vendor/ and
	// nothing else: the cache lives outside any root (docs/trust.md).
	dir, main, _, cache := modWorld(t, "cache")
	a := New()
	a.ModCache = cache
	a.Trust = &TrustOptions{IncludeRoot: dir}
	if _, err := modGen(t, a, main); nil == err ||
		!strings.Contains(err.Error(), "module not fetched:") {
		t.Fatalf("want module not fetched, got %v", err)
	}
}

func TestModCacheDefaults(t *testing.T) {
	// With no host-named cache the platform's own is used: XDG first,
	// then the home directory, then none at all — a host with no home
	// has no cache, which is a MISS rather than a failure.
	dir, main, _, cache := modWorld(t, "cache")

	xdg := filepath.Join(dir, "xdg")
	if err := os.MkdirAll(filepath.Join(xdg, "aontu"), 0o755); nil != err {
		t.Fatal(err)
	}
	if err := os.Rename(cache, filepath.Join(xdg, "aontu", "pkg")); nil != err {
		t.Fatal(err)
	}
	t.Setenv("XDG_CACHE_HOME", xdg)
	if _, err := modGen(t, New(), main); nil != err {
		t.Fatalf("xdg cache: %v", err)
	}

	home := filepath.Join(dir, "home")
	if err := os.MkdirAll(filepath.Join(home, ".cache", "aontu"), 0o755); nil != err {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(xdg, "aontu", "pkg"),
		filepath.Join(home, ".cache", "aontu", "pkg")); nil != err {
		t.Fatal(err)
	}
	t.Setenv("XDG_CACHE_HOME", "")
	t.Setenv("HOME", home)
	if _, err := modGen(t, New(), main); nil != err {
		t.Fatalf("home cache: %v", err)
	}

	t.Setenv("HOME", "")
	if _, err := modGen(t, New(), main); nil == err ||
		!strings.Contains(err.Error(), "module not fetched:") {
		t.Fatalf("want module not fetched, got %v", err)
	}
}

func TestModCacheDirRule(t *testing.T) {
	env := func(vars map[string]string) func(string) string {
		return func(key string) string { return vars[key] }
	}
	for _, c := range []struct {
		name, goos string
		vars       map[string]string
		want       string
	}{
		// The explicit override wins on every platform.
		{"xdg on posix", "linux",
			map[string]string{"XDG_CACHE_HOME": "/x", "HOME": "/h"},
			filepath.Join("/x", "aontu", "pkg")},
		{"xdg on windows", "windows",
			map[string]string{"XDG_CACHE_HOME": "/x", "LOCALAPPDATA": "C:/L"},
			filepath.Join("/x", "aontu", "pkg")},

		{"windows honours HOME over LOCALAPPDATA", "windows",
			map[string]string{"LOCALAPPDATA": "C:/L", "HOME": "/h"},
			filepath.Join("/h", ".cache", "aontu", "pkg")},
		{"posix ignores LOCALAPPDATA", "linux",
			map[string]string{"LOCALAPPDATA": "C:/L", "HOME": "/h"},
			filepath.Join("/h", ".cache", "aontu", "pkg")},

		// And LOCALAPPDATA is the platform default BENEATH both, which
		// is the whole addition: Windows sets neither of the two above
		// by default.
		{"windows falls back to LOCALAPPDATA", "windows",
			map[string]string{"LOCALAPPDATA": "C:/L"},
			filepath.Join("C:/L", "aontu", "pkg")},
		{"posix has no such fallback", "linux",
			map[string]string{"LOCALAPPDATA": "C:/L"},
			""},

		// Nowhere to put one is a MISS, not a failure.
		{"nowhere", "windows", map[string]string{}, ""},
	} {
		if got := modCacheDirFor(c.goos, env(c.vars)); c.want != got {
			t.Fatalf("%s: want %q, got %q", c.name, c.want, got)
		}
	}

	// And the exported entry point is that rule on THIS host, not a
	// second spelling of it.
	t.Setenv("XDG_CACHE_HOME", "/x")
	if want := filepath.Join("/x", "aontu", "pkg"); want != ModCacheDir() {
		t.Fatalf("ModCacheDir: %q", ModCacheDir())
	}
}

func TestModVendorOutsideRootIsDenied(t *testing.T) {
	// Confinement is about what may be READ (docs/trust.md), and a
	// project root found by walking UP can sit above the confinement
	// root — so the vendor store it names is outside, and reading it
	// would be the escape the root exists to refuse.
	dir, main, _, _ := modWorld(t, "vendor")
	sub := filepath.Join(dir, "sub")
	if err := os.MkdirAll(sub, 0o755); nil != err {
		t.Fatal(err)
	}
	data, err := os.ReadFile(main)
	if nil != err {
		t.Fatal(err)
	}
	inner := filepath.Join(sub, "main.aon")
	write(t, inner, string(data))

	a := New()
	a.Trust = &TrustOptions{IncludeRoot: sub}
	if _, err := modGen(t, a, inner); nil == err ||
		!strings.Contains(err.Error(), "include denied:") {
		t.Fatalf("want include denied, got %v", err)
	}
}

func TestModDepthIsBounded(t *testing.T) {
	_, main, _, _ := modWorld(t, "vendor")
	a := New()
	a.modDepth = moduleMaxDepth
	if _, err := modGen(t, a, main); nil == err ||
		!strings.Contains(err.Error(), "module depth:") {
		t.Fatalf("want module depth, got %v", err)
	}
}

func TestPackageSelfShapes(t *testing.T) {
	dir := t.TempDir()
	for _, src := range []string{
		"1\n",
		"other: 1\n",
		"pkg: 1\n",
		"pkg: {main: 1}\n",
		"pkg: {main: string}\n", // ... nor is a kind
		"pkg: {main: \"\"}\n",   // ... and an empty name is no name
		"moved: 1\n",
	} {
		file := filepath.Join(dir, "pkg.aon")
		write(t, file, src)
		if got := packageSelfOf(file, 0, ""); "main.aon" != got.main || "" != got.moved {
			t.Fatalf("want the default entry for %q, got %+v", src, got)
		}
	}

	write(t, filepath.Join(dir, "pkg.aon"),
		"pkg: {main: \"other.aon\"}\nmoved: \"corp.example/new\"\n")
	got := packageSelfOf(filepath.Join(dir, "pkg.aon"), 0, "")
	if "other.aon" != got.main || "corp.example/new" != got.moved {
		t.Fatalf("want the declared entry and destination, got %+v", got)
	}
	if got := packageSelfOf(filepath.Join(dir, "gone.aon"), 0, ""); "main.aon" != got.main {
		t.Fatalf("missing file: %+v", got)
	}
}

func TestParseModuleRefSelfDescribes(t *testing.T) {
	for spec, want := range map[string]ModuleRef{
		"corp.example/schemas/service":          {Path: "corp.example/schemas/service"},
		"corp.example/schemas/service#aon1-abc": {Path: "corp.example/schemas/service", Hash: "aon1-abc"},
		"alias:legacy":                          {Path: "alias:legacy"},
		"alias:legacy#aon1-abc":                 {Path: "alias:legacy", Hash: "aon1-abc"},
	} {
		got, ok := parseModuleRef(spec)
		if !ok || want != got {
			t.Fatalf("%s: %v %+v", spec, ok, got)
		}
	}
	for _, local := range []string{"./f.aon", "../g.json", "/abs/h.aon", "local",
		"corp.example/x@1", "Corp.Example/x", "alias:", "alias:a b"} {
		if _, ok := parseModuleRef(local); ok {
			t.Fatalf("%s routed", local)
		}
	}
}

func TestModuleDirEscapesAndFilesAnAlias(t *testing.T) {
	if got := moduleDir("/s", "corp.example/Widgets"); filepath.Join("/s", "corp.example", "!widgets") != got {
		t.Fatalf("escape: %q", got)
	}
	if got := moduleDir("/s", "alias:legacy"); filepath.Join("/s", "alias", "legacy") != got {
		t.Fatalf("alias: %q", got)
	}
	if got := cacheStoreDir("/c", "aon1-x", "corp.example/w"); filepath.Join("/c", "store", "aon1-x", "corp.example", "w") != got {
		t.Fatalf("store: %q", got)
	}
	if got := cacheDownloadDir("/c", "corp.example/w"); filepath.Join("/c", "download", "corp.example", "w", "@v") != got {
		t.Fatalf("download: %q", got)
	}
	if got := cacheSeenDir("/c", "corp.example/w"); filepath.Join("/c", "seen", "corp.example", "w") != got {
		t.Fatalf("seen: %q", got)
	}
	if "" != localFileExt("corp.example/x") || "json" != localFileExt("my.dir/data.JSON") ||
		"" != localFileExt("corp.example/trailing.") {
		t.Fatal("localFileExt")
	}
}

func TestModAliasResolvesFromTheCacheByThePackageItNames(t *testing.T) {
	// The lock entry carries the alias's package, so the store lookup
	// has both halves of its key; without the lock, the package file's
	// own declaration supplies it.
	dir, main, hash, cache := modWorld(t, "cache")
	write(t, filepath.Join(dir, "pkg.aon"),
		"pkg: {path: \"corp.example/app\"}\n"+
			"dep: {\"alias:legacy\": {pkg: \"corp.example/schemas/service\", v: \"1.0.0\"}}\n")
	write(t, main, "svc: @\"alias:legacy#"+hash+"\"\nsvc: name: \"auth\"\n")
	a := New()
	a.ModCache = cache
	if _, err := modGen(t, a, main); nil != err {
		t.Fatalf("alias from the declaration: %v", err)
	}

	write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aon"),
		"{\"lock\":{\"alias:legacy\":{\"archive\":\"\",\"canon\":\""+hash+
			"\",\"pkg\":\"corp.example/schemas/service\",\"v\":\"1.0.0\"}}}\n")
	write(t, main, "svc: @\"alias:legacy\"\nsvc: name: \"auth\"\n")
	if _, err := modGen(t, a, main); nil != err {
		t.Fatalf("alias from the lockfile: %v", err)
	}

	// A lock entry that is not an object pins nothing.
	write(t, filepath.Join(dir, "aontu_meta", "pkg-lock.aon"),
		"{\"lock\":{\"alias:legacy\":1}}\n")
	if _, err := modGen(t, a, main); nil == err ||
		!strings.Contains(err.Error(), "module not fetched") {
		t.Fatalf("alias with a hollow lock entry: %v", err)
	}
	// And a declaration whose entry is not a map, or whose package is
	// not a string, declares nothing.
	write(t, filepath.Join(dir, "pkg.aon"), "dep: {\"alias:legacy\": 1}\n")
	if _, err := modGen(t, a, main); nil == err ||
		!strings.Contains(err.Error(), "alias not declared") {
		t.Fatalf("hollow declaration: %v", err)
	}
	write(t, filepath.Join(dir, "pkg.aon"), "dep: 1\n")
	if _, err := modGen(t, a, main); nil == err ||
		!strings.Contains(err.Error(), "alias not declared") {
		t.Fatalf("no dep block: %v", err)
	}
}

func TestValidateModulePathEmptyElement(t *testing.T) {
	if got := validateModulePath("corp.example//x"); "an element is empty" != got {
		t.Fatalf("empty element: %q", got)
	}
	if got := validateModulePath(""); "an element is empty" != got {
		t.Fatalf("empty path: %q", got)
	}
}
