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
// only: `aon_vendor/` beside the project's `mod.aon`, then a
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

// moduleDir is the directory a module's files live in, under a store.
func moduleDir(store string, ref ModuleRef) string {
	parts := append([]string{store}, strings.Split(ref.Path, "/")...)
	return filepath.Join(parts...) + "@" + strconv.Itoa(ref.Major)
}

// projectRoots is EVERY project root at or above from, innermost first
// — a project root being a directory holding a `mod.aon`. This used to
// answer with the NEAREST one alone, and the plural is the fix, because
// a VENDORED MODULE IS A PROJECT INSIDE A PROJECT. A module in
// `aon_vendor/` carries its own `mod.aon`, which stopped the upward walk
// there, so a nested import resolved against the vendored module's own
// directory: a tree with no `aon_vendor/` of its own, and therefore a
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
	data, err := os.ReadFile(filepath.Join(root, "mod-lock.aon"))
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
		stores = append(stores, moduleDir(filepath.Join(r, "aon_vendor"), ref))
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
