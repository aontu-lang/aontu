/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// ModuleRef is one module import: a package path, or the alias key
// `alias:<name>` when the import spells one; an alias is resolved by
// lookup, never by shape.
type ModuleRef struct {
	Path string
	// Hash is the inline canon-hash pin, if the import froze one.
	Hash string
}

// A package path is `<domain>/<path>` and carries no major (ADR-022).
var moduleRe = regexp.MustCompile(
	`^([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:/[A-Za-z0-9._-]+)*)(?:#(aon1-[A-Za-z0-9_-]+))?$`)

var moduleAliasRe = regexp.MustCompile(`^(alias:[A-Za-z0-9._-]+)(?:#(aon1-[A-Za-z0-9_-]+))?$`)

const aliasPrefix = "alias:"

// parseModuleRef answers the module an import string names, or false.
func parseModuleRef(spec string) (ModuleRef, bool) {
	m := moduleRe.FindStringSubmatch(spec)
	if nil == m {
		m = moduleAliasRe.FindStringSubmatch(spec)
	}
	if nil == m {
		return ModuleRef{}, false
	}
	return ModuleRef{Path: m[1], Hash: m[2]}, true
}

func isAlias(path string) bool {
	return strings.HasPrefix(path, aliasPrefix)
}

const (
	moduleMaxPath  = 512
	moduleMaxElems = 32
)

// Windows refuses these as file names whatever the extension, so a
// module path containing one cannot be materialised there at all. The
// check is on the element up to its first dot, which is where Windows
// stops looking too.
var reservedElems = map[string]bool{
	"con": true, "prn": true, "aux": true, "nul": true,
	"com1": true, "com2": true, "com3": true, "com4": true, "com5": true,
	"com6": true, "com7": true, "com8": true, "com9": true,
	"lpt1": true, "lpt2": true, "lpt3": true, "lpt4": true, "lpt5": true,
	"lpt6": true, "lpt7": true, "lpt8": true, "lpt9": true,
}

func validateModulePath(path string) string {
	if moduleMaxPath < len(path) {
		return "longer than " + strconv.Itoa(moduleMaxPath) + " characters"
	}

	elems := strings.Split(path, "/")
	if moduleMaxElems < len(elems) {
		return "more than " + strconv.Itoa(moduleMaxElems) + " elements"
	}

	for _, elem := range elems {
		if "" == elem {
			return "an element is empty"
		}
		if strings.HasPrefix(elem, ".") || strings.HasSuffix(elem, ".") {
			return `an element begins or ends with "."`
		}
		if reservedElems[strings.ToLower(strings.Split(elem, ".")[0])] {
			return "an element is a reserved device name"
		}
	}

	return ""
}

// localFileExt is the extension of a routed path's final element, when
// it carries one: the sign the import was meant as a file (ADR-022
// part 4).
func localFileExt(path string) string {
	elems := strings.Split(path, "/")
	last := elems[len(elems)-1]
	dot := strings.LastIndex(last, ".")
	if dot < 0 || dot == len(last)-1 {
		return ""
	}
	return strings.ToLower(last[dot+1:])
}

func localFileMsg(path string) string {
	return "local files need a ./ prefix: " + path + " (write @\"./" + path + "\")"
}

func escapeElem(elem string) string {
	var b strings.Builder
	for _, r := range elem {
		if 'A' <= r && r <= 'Z' {
			b.WriteByte('!')
			b.WriteRune(r + ('a' - 'A'))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// moduleDir is the directory a key lives at under a store: one
// directory per element, uppercase escaped; an alias under
// `alias/<name>`, which no package path can spell because a domain
// carries a dot.
func moduleDir(store string, path string) string {
	elems := strings.Split(path, "/")
	if isAlias(path) {
		elems = []string{"alias", strings.TrimPrefix(path, aliasPrefix)}
	}
	parts := []string{store}
	for _, elem := range elems {
		parts = append(parts, escapeElem(elem))
	}
	return filepath.Join(parts...)
}

const (
	pkgFile   = "pkg.aontu"
	lockFile  = "pkg-lock.aontu"
	metaDir   = "aontu_meta"
	vendorDir = "vendor"
)

func projectRoots(from string) []string {
	roots := []string{}
	dir := from
	for {
		if _, err := os.Stat(filepath.Join(dir, pkgFile)); nil == err {
			roots = append(roots, dir)
		}
		up := filepath.Dir(dir)
		if up == dir {
			if 0 == len(roots) {
				return []string{from}
			}
			return roots
		}
		dir = up
	}
}

func lockJSON(text string) string {
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimLeft(line, " \t"), "#") {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

// The user cache's trees (ADR-039 part 2).
func cacheStoreDir(cache, hash, pkg string) string {
	return moduleDir(filepath.Join(cache, "store", hash), pkg)
}

func cacheDownloadDir(cache, pkg string) string {
	return filepath.Join(moduleDir(filepath.Join(cache, "download"), pkg), "@v")
}

func cacheSeenDir(cache, pkg string) string {
	return moduleDir(filepath.Join(cache, "seen"), pkg)
}

type lockPins struct {
	Canon string `json:"canon"`
	Pkg   string `json:"pkg"`
}

// lockEntry is what the lockfile at root pins for a key, or nil.
func lockEntry(root, key string) *lockPins {
	data, err := os.ReadFile(filepath.Join(root, metaDir, lockFile))
	if nil != err {
		return nil
	}

	var lock struct {
		Lock map[string]json.RawMessage `json:"lock"`
	}
	if err := json.Unmarshal([]byte(lockJSON(string(data))), &lock); nil != err {
		return nil
	}
	raw, ok := lock.Lock[key]
	if !ok {
		return nil
	}
	var pins lockPins
	if err := json.Unmarshal(raw, &pins); nil != err {
		return nil
	}
	return &pins
}

const moduleMaxDepth = 16

// moduleResult is a resolved module, or the refusal that stands in its
// place. Every refusal is reported as a parse-stage error, exactly as a
// denied include is: a bare-member module import must not vanish in the
// merge and leave a plausible, silently-partial document.
type moduleResult struct {
	Full string
	Src  string
	Code string
	Msg  string
}

func refuseModule(code, msg string) moduleResult {
	return moduleResult{Code: code, Msg: msg}
}

// resolveModule resolves one module import against the local stores.
func resolveModule(ref ModuleRef, fromDir string, cache string, depth int) moduleResult {
	alias := isAlias(ref.Path)
	if !alias {
		if bad := validateModulePath(ref.Path); "" != bad {
			return refuseModule("module_path", "module path: "+ref.Path+" ("+bad+")")
		}
	}

	if moduleMaxDepth <= depth {
		return refuseModule("module_depth",
			"module depth: "+ref.Path+
				" (verification nested past "+strconv.Itoa(moduleMaxDepth)+")")
	}

	// EVERY enclosing project, innermost first (see projectRoots): a
	// vendored package is a project inside a project, and its nested
	// imports have to reach the tree the consumer vendored them into.
	roots := projectRoots(fromDir)
	var locked *lockPins
	for _, r := range roots {
		if locked = lockEntry(r, ref.Path); nil != locked {
			break
		}
	}
	expect := ref.Hash
	if "" == expect && nil != locked {
		expect = locked.Canon
	}
	// The store is keyed by hash AND package path; an alias names its
	// package in the lockfile, else in the package file that declares it.
	pkg := ref.Path
	if alias {
		pkg = ""
		if nil != locked {
			pkg = locked.Pkg
		}
		for _, r := range roots {
			if "" != pkg {
				break
			}
			pkg = aliasTarget(filepath.Join(r, pkgFile), ref.Path, depth, cache)
		}
		if "" == pkg {
			return refuseModule("module_missing",
				"alias not declared: "+ref.Path+" (declare it under dep in "+pkgFile+")")
		}
	}

	stores := []string{}
	for _, r := range roots {
		stores = append(stores, moduleDir(filepath.Join(r, metaDir, vendorDir), ref.Path))
	}
	if "" != cache && "" != expect {
		stores = append(stores, cacheStoreDir(cache, expect, pkg))
	}

	dir := ""
	for _, d := range stores {
		if _, err := os.Stat(filepath.Join(d, pkgFile)); nil == err {
			dir = d
			break
		}
	}
	if "" == dir {
		return refuseModule("module_missing",
			"module not fetched: "+ref.Path+" (run: aontu sync)")
	}

	self := packageSelfOf(filepath.Join(dir, pkgFile), depth, cache)
	if "" != self.moved {
		return refuseModule("module_moved",
			"module moved: "+ref.Path+" (now "+self.moved+
				"; import that instead, nothing follows a move)")
	}

	full := filepath.Join(dir, self.main)
	data, err := os.ReadFile(full)
	if nil != err {
		return refuseModule("module_missing",
			"module not fetched: "+ref.Path+" (run: aontu sync)")
	}
	src := toValidSource(string(data))

	if "" != expect {
		// VERIFICATION IS ALWAYS LOCAL. The repository's manifest is a
		// claim; what decides is the hash of the module as it is on
		// this machine, recomputed now.
		got := moduleHash(src, full, depth, cache)
		if got != expect {
			return refuseModule("module_integrity",
				"module integrity: "+ref.Path+
					" expected "+expect+" got "+got)
		}
	}

	return moduleResult{Full: full, Src: src}
}

type packageSelfPins struct {
	main  string
	moved string
}

// packageSelfOf reads the entry and the moved declaration of a package
// file. The file is ORDINARY AONTU, read by the language itself.
func packageSelfOf(file string, depth int, cache string) packageSelfPins {
	self := packageSelfPins{main: "main.aontu"}
	m := evalPackageFile(file, depth, cache)
	if nil == m {
		return self
	}
	if pkg, ok := m.peg["pkg"].(*MapVal); ok {
		if main := scalarString(pkg.peg["main"]); "" != main {
			self.main = main
		}
	}
	self.moved = scalarString(m.peg["moved"])
	return self
}

func aliasTarget(file, key string, depth int, cache string) string {
	m := evalPackageFile(file, depth, cache)
	if nil == m {
		return ""
	}
	dep, ok := m.peg["dep"].(*MapVal)
	if !ok {
		return ""
	}
	entry, ok := dep.peg[key].(*MapVal)
	if !ok {
		return ""
	}
	return scalarString(entry.peg["pkg"])
}

func evalPackageFile(file string, depth int, cache string) *MapVal {
	data, err := os.ReadFile(file)
	if nil != err {
		return nil
	}
	a := NewWithBase(filepath.Dir(file))
	a.modDepth = depth + 1
	a.File = file
	a.ModCache = cache
	v, _ := a.Unify(toValidSource(string(data)))
	m, ok := v.(*MapVal)
	if !ok {
		return nil
	}
	return m
}

func scalarString(v Val) string {
	sv, ok := v.(*ScalarVal)
	if !ok || KindString != sv.kind {
		return ""
	}
	s, _ := sv.peg.(string)
	return s
}

func moduleHash(src string, path string, depth int, cache string) string {
	a := NewWithBase(filepath.Dir(path))
	a.modDepth = depth + 1
	a.File = path
	a.ModCache = cache
	v, _ := a.Unify(src)
	if nil == v { //coverage:ignore Unify always answers a Val
		return ""
	}
	return CanonHash(v)
}
