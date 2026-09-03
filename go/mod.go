/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// MODULE IDENTITY AND LOCAL RESOLUTION (G6 phase 2, the Go side of
// ts/src/mod.ts, docs/capability-review/g6-distribution.md).
//
// An import is still just `@"…"`; the string's SHAPE routes it, so the
// grammar is untouched and every existing include keeps its exact
// behaviour:
//
//	service: @"corp.example/schemas/service@1"
//	frozen:  @"corp.example/schemas/service@1#aon1-4vJemVYtWFR2mQeN…"
//	local:   @"./fragment.aon"        <- unchanged, not a module
//
// EVALUATION NEVER TOUCHES THE NETWORK. Resolution reads local stores
// only: `aontu_meta/vendor/` beside the project's `mod.aon`, then a
// content-addressed user cache keyed by canon-hash. Fetching is a
// separate, explicit tool step, and a module in neither store is an
// evaluation error that says so.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// ModuleRef is a module import, as the string spells it.
type ModuleRef struct {
	// Path is the module path WITHOUT the major.
	Path string
	// Major is the major version, from the `@N` suffix.
	Major int
	// Hash is the inline canon-hash pin, if the import froze one.
	Hash string
}

// A module path is DOMAIN-SHAPED — the first segment carries a dot,
// which is what tells it apart from `./local.aon`, `pkg-name` and every
// other spelling already in use — and carries the major version in the
// path, CUE/Go-style, so two majors are two modules.
//
// The pattern is deliberately narrow: anything it does not match falls
// through to the existing resolver chain unchanged, so no document that
// worked before this phase can be routed somewhere new by it. Mirrors
// MODULE_RE in ts/src/mod.ts.
var moduleRe = regexp.MustCompile(
	`^([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:/[A-Za-z0-9._-]+)*)@(\d+)(?:#(aon1-[A-Za-z0-9_-]+))?$`)

// parseModuleRef answers the module an import string names, or false.
func parseModuleRef(spec string) (ModuleRef, bool) {
	m := moduleRe.FindStringSubmatch(spec)
	if nil == m {
		return ModuleRef{}, false
	}
	major, err := strconv.Atoi(m[2])
	if nil != err { //coverage:ignore the pattern matched \d+
		return ModuleRef{}, false
	}
	return ModuleRef{Path: m[1], Major: major, Hash: m[3]}, true
}

// SHAPE IS NOT VALIDITY, and the gap between them was a hole. moduleRe
// answers "does this string route to the module resolver" -- a ROUTING
// predicate, and it must stay one, because anything it rejects falls
// through to the file leg and a stricter pattern would silently
// re-route documents that work today. But its element class
// `[A-Za-z0-9._-]` admits `..`, and moduleDir joins elements with
// filepath.Join, which CLEANS `..` rather than refusing it:
//
//	moduleDir("/store/aontu_meta/vendor", "corp.example/../../etc/passwd@1")
//	  -> /store/etc/passwd@1
//
// `mod vendor` then copied a tree THERE, outside the project entirely,
// and reported `verdict: ok`. So validity is a separate question asked
// separately, after the shape matched, and asked at every site that
// turns a module path into a directory.
//
// The rules are Go's own (golang.org/x/mod/module.CheckPath), for the
// reason Go has them: a module path becomes a real directory on every
// platform the toolchain runs on, so it must be a legal one everywhere.
// Mirrors validateModulePath in ts/src/mod.ts.
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

// validateModulePath is why a module path may not be used as a
// directory, or "" when it may. The reason is user-facing: it goes in
// the refusal, because a path refused without saying which rule it
// broke is a puzzle.
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
		// This one rule kills `.` and `..` -- the traversal -- along
		// with `.hidden` and `trailing.`. Stating it as the rule rather
		// than as "no `..`" is deliberate: a check that named the two
		// dangerous spellings would miss the next one.
		if strings.HasPrefix(elem, ".") || strings.HasSuffix(elem, ".") {
			return `an element begins or ends with "."`
		}
		if reservedElems[strings.ToLower(strings.Split(elem, ".")[0])] {
			return "an element is a reserved device name"
		}
	}

	return ""
}

// escapeElem is an element as it is spelled ON DISK. Uppercase is
// escaped to `!`+lowercase, Go's rule (go.dev/ref/mod, module proxy
// protocol) and for Go's reason: `github.com/Alice/Widgets` and
// `github.com/alice/widgets` are two module identities and, on macOS
// and Windows, ONE directory -- so without this the second module
// fetched silently clobbers the first, and an unpinned import resolves
// to whichever won.
//
// The WRITTEN path stays the identity; only the directory is escaped.
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

// moduleDir is the directory a module's files live in, under a store.
//
// Callers must have validated the path (validateModulePath); this
// function cannot refuse, because it answers a location rather than a
// question, and every caller has a refusal shape of its own.
func moduleDir(store string, ref ModuleRef) string {
	parts := []string{store}
	for _, elem := range strings.Split(ref.Path, "/") {
		parts = append(parts, escapeElem(elem))
	}
	return filepath.Join(parts...) + "@" + strconv.Itoa(ref.Major)
}

// projectRoots is EVERY project root at or above from, innermost first
// — a project root being a directory holding a `mod.aon`. This used to
// answer with the NEAREST one alone, and the plural is the fix, because
// a VENDORED MODULE IS A PROJECT INSIDE A PROJECT. A module in
// `aontu_meta/vendor/` carries its own `mod.aon`, which stopped the upward walk
// there, so a nested import resolved against the vendored module's own
// directory: a tree with no `aontu_meta/vendor/` of its own, and therefore a
// `module not fetched` for a dependency sitting flat beside it in the
// CONSUMER's vendor tree — the only layout `mod vendor` produces
// (use-cases/BUGS.md §31).
//
// The consumer's stores are searched after the module's own, so a
// module that vendors its dependencies nested still wins for its own
// tree, and one that does not falls through to the consumer that
// vendored it. The last element is `from` itself when nothing above it
// declares a module, which is the single-file inline-pin mode.
func projectRoots(from string) []string {
	roots := []string{}
	dir := from
	for {
		if _, err := os.Stat(filepath.Join(dir, "mod.aon")); nil == err {
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

// lockJSON is the lockfile's JSON: its canonical line, with the
// generated-file header stripped. The file is AONTU, so it may carry
// `#` comments — and the header `aontu mod tidy` writes says not to
// edit it, which is worth more than the two lines it costs to skip.
// Everything below the comments is the canonical map, and canonical
// Aontu whose leaves are scalars is JSON.
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

// lockHash is the lockfile's pin for one import, or "".
//
// `mod-lock.aon` is machine-written CANONICAL Aontu, and canonical
// Aontu whose leaves are scalars IS JSON — which is why reading it here
// needs no evaluator, and why a hand-edited lockfile that is no longer
// canonical simply does not parse. It is generated; the file says so.
func lockHash(root string, ref ModuleRef) string {
	data, err := os.ReadFile(filepath.Join(root, "aontu_meta", "mod-lock.aon"))
	if nil != err {
		return ""
	}

	var lock struct {
		Lock map[string]struct {
			Canon string `json:"canon"`
		} `json:"lock"`
	}
	if err := json.Unmarshal([]byte(lockJSON(string(data))), &lock); nil != err {
		return ""
	}

	return lock.Lock[ref.Path+"@"+strconv.Itoa(ref.Major)].Canon
}

// moduleMaxDepth is how deep module verification may nest before it is
// refused. A module is verified by EVALUATING it, and that evaluation
// resolves the module's own imports — so a vendor tree that leads back
// to itself (a symlink is enough) would recurse until the host's stack
// gave out, and a verdict that depends on the host's stack size is
// exactly what the determinism clause forbids (docs/trust.md, and the
// same argument unify_cycle rests on).
const moduleMaxDepth = 16

// moduleResult is a resolved module, or the refusal that stands in its
// place. Both refusals are reported as parse-stage errors, exactly as a
// denied include is: a bare-member module import must not vanish in the
// merge and leave a plausible, silently-partial document.
type moduleResult struct {
	Full string
	Src  string
	Code string
	Msg  string
}

// resolveModule resolves one module import against the local stores.
func resolveModule(ref ModuleRef, fromDir string, cache string, depth int) moduleResult {
	name := ref.Path + "@" + strconv.Itoa(ref.Major)

	// THE PATH IS CHECKED BEFORE ANYTHING IS BUILT FROM IT. This is
	// first because it is a question about the REQUEST, not about the
	// state of the machine: a path that cannot legally be a directory
	// is refused identically whether or not the module is present, and
	// whether or not the depth bound is near.
	if bad := validateModulePath(ref.Path); "" != bad {
		return moduleResult{
			Code: "module_path",
			Msg:  "module path: " + name + " (" + bad + ")",
		}
	}

	if moduleMaxDepth <= depth {
		return moduleResult{
			Code: "module_depth",
			Msg: "module depth: " + name +
				" (verification nested past " + strconv.Itoa(moduleMaxDepth) + ")",
		}
	}

	// EVERY enclosing project, innermost first (see projectRoots): a
	// vendored module is a project inside a project, and its nested
	// imports have to reach the tree the consumer vendored them into.
	roots := projectRoots(fromDir)
	expect := ref.Hash
	if "" == expect {
		// The PIN comes from the first lockfile that names this import.
		// A vendored module usually ships none, so that is the
		// consumer's -- which is right: the consumer's lock is what its
		// build is pinned to.
		for _, r := range roots {
			if h := lockHash(r, ref); "" != h {
				expect = h
				break
			}
		}
	}

	stores := []string{}
	for _, r := range roots {
		stores = append(stores, moduleDir(filepath.Join(r, "aontu_meta", "vendor"), ref))
	}
	if "" != cache && "" != expect {
		// Content-addressed: the cache is keyed by the hash, so a cache
		// hit is already the right MEANING before anything is read.
		stores = append(stores, filepath.Join(cache, expect))
	}

	dir := ""
	for _, d := range stores {
		if _, err := os.Stat(filepath.Join(d, "mod.aon")); nil == err {
			dir = d
			break
		}
	}
	if "" == dir {
		// The wording is the contract (docs/capability-review/
		// g6-distribution.md): it names the module AND the step that
		// fixes it, because an agent reading this error is the audience.
		return moduleResult{
			Code: "module_missing",
			Msg:  "module not fetched: " + name + " (run: aontu mod get)",
		}
	}

	full := filepath.Join(dir, moduleMain(filepath.Join(dir, "mod.aon"), depth))
	data, err := os.ReadFile(full)
	if nil != err {
		return moduleResult{
			Code: "module_missing",
			Msg:  "module not fetched: " + name + " (run: aontu mod get)",
		}
	}
	src := toValidSource(string(data))

	if "" != expect {
		// VERIFICATION IS ALWAYS LOCAL. The registry's annotation is
		// advisory; what decides is the hash of the module as it is on
		// this machine, recomputed now.
		got := moduleHash(src, full, depth)
		if got != expect {
			return moduleResult{
				Code: "module_integrity",
				Msg: "module integrity: " + name +
					" expected " + expect + " got " + got,
			}
		}
	}

	return moduleResult{Full: full, Src: src}
}

// moduleMain is the `mod.main` a module file declares, or the default
// entry name. The module file is ORDINARY AONTU, read by the language
// itself — the toolchain dogfooding its own evaluator rather than
// pattern-matching its own syntax with a regexp.
func moduleMain(file string, depth int) string {
	const defaultMain = "main.aon"

	data, err := os.ReadFile(file)
	if nil != err { //coverage:ignore the caller stat'd this file
		return defaultMain
	}

	a := NewWithBase(filepath.Dir(file))
	a.modDepth = depth + 1
	a.File = file
	v, _ := a.Unify(toValidSource(string(data)))
	m, ok := v.(*MapVal)
	if !ok {
		return defaultMain
	}
	mod, ok := m.peg["mod"].(*MapVal)
	if !ok {
		return defaultMain
	}
	sv, ok := mod.peg["main"].(*ScalarVal)
	if !ok || KindString != sv.kind {
		return defaultMain
	}
	main, _ := sv.peg.(string)
	if "" == main {
		return defaultMain
	}
	return main
}

// moduleHash is the canon-hash of a module evaluated STANDALONE: its
// own include closure resolved and unified at its own root, before any
// consumer context. That is what makes the pin transitive — an edit two
// includes deep changes the unified root, hence the hash — and it is
// Dhall's choice for the same reason.
//
// A module that leans on consumer context (a `$.x` its importer
// supplies) does not stand up alone, and its hash is still the hash of
// what it SAYS: the residue is part of the hashed meaning, which is why
// hcanon keeps it in textual form.
func moduleHash(src string, path string, depth int) string {
	a := NewWithBase(filepath.Dir(path))
	a.modDepth = depth + 1
	a.File = path
	v, _ := a.Unify(src)
	if nil == v { //coverage:ignore Unify always answers a Val
		return ""
	}
	return CanonHash(v)
}
