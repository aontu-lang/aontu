/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"runtime"
	"sort"
)

// Version is the Aontu Go module version.
// VERSION is the Aontu Go module version, rewritten by `make publish-go`.
// Spelled in caps to match ts/src/aontu.ts's exported VERSION, so the two
// ports name the same thing the same way. Note the two version SERIES are
// independent: the Go module is 0.1.x, the npm package 0.49.x.
const VERSION = "0.1.10"

// TrustBudget bounds evaluation work (G5 trust profile, docs/trust.md):
// integer counts of engine events, never wall-clock. Zero means the
// default — the shared spec-visible constants test/spec/budget.tsv pins
// in both ports.
type TrustBudget struct {
	Passes int // fixpoint passes (default 9)
	Depth  int // structural recursion depth (default 1000)
}

// TrustOptions is the trust profile (G5, docs/trust.md): what an
// evaluation may read, and how much work it may do. The zero value is
// the 'system' posture — today's unconfined default. At most one of the
// Include fields should be set; the mirror of the canonical port's
// `trust.include` union ('none' | { mem } | { root } | 'system').
type TrustOptions struct {
	IncludeNone bool              // @"..." is always denied
	IncludeMem  map[string]string // a virtual file set only
	IncludeRoot string            // real files, realpath-confined below this root
	Budget      TrustBudget
}

// IncludeDep is one entry of the include manifest: a resolved include's
// absolute path and the capability that resolved it ("mem" or "file").
// The manifest is hermeticity clause 1's "file set" made observable
// (docs/trust.md); content hashing and pinning stay with G6.
type IncludeDep struct {
	Path       string
	Capability string
}

// Aontu is the top-level entry point, mirroring the TypeScript Aontu
// class (ts/src/aontu.ts).
type Aontu struct {
	// base is the directory used to resolve relative @"file" source
	// loads. Empty means the process working directory.
	base string

	// File is an optional display name for the entry source, rendered
	// in error frames the way the TS CLI renders its entry path
	// (`--> model.aon:3:5`). Empty renders `<no-file>`, as TS does for
	// string sources. Set it when evaluating a real file, e.g. from
	// cmd/aontu.
	File string

	// Trust is the evaluation's trust profile (G5, docs/trust.md).
	// Nil means the 'system' posture, today's default.
	Trust *TrustOptions

	// IncludeText is the TEXT of every source the most recent parse
	// READ, by full path. A value's position is a byte offset into the
	// source it was parsed from, so a report that names an included
	// file honestly (finding F, use-cases/BUGS.md §25) needs that
	// file's text to turn the offset into a row and column. The
	// canonical port has no equivalent because its values carry row and
	// column directly; this port computes them on demand.
	IncludeText map[string]string

	// IncludeDeps is the include MANIFEST of the most recent parse:
	// the resolved include closure, sorted by path then capability and
	// deduplicated, so it is deterministic. Reset per parse; empty for
	// a document with no includes.
	IncludeDeps []IncludeDep

	// Graph is the DERIVED GRAPH of the most recent unification (G4
	// phase 3): the entity index and the edge set, both deterministic.
	// Reset per unification; empty for a document with no identity.
	// Mirrors `result.graph` in ts/src/aontu.ts, which stamps it on the
	// returned Val the way that port stamps `deps`.
	Graph Graph

	// modDepth is how many module VERIFICATIONS deep this evaluation
	// already is (G6 phase 2, mod.go). A pinned module is checked by
	// evaluating it, and that evaluation resolves the module's own
	// imports, so the count has to travel with the evaluation that
	// carries it. Not a stable embedding API.
	modDepth int

	// ModCache is the content-addressed user module cache. Empty means
	// the platform default (`$XDG_CACHE_HOME/aontu/mod`, else
	// `$HOME/.cache/aontu/mod`); a host that names one uses it, which is
	// what makes a hermetic test possible. Not a stable embedding API.
	ModCache string

	// TrustWarn and TrustWarnRoot are the staged-flip warning window
	// (G5 phase 6, cmd/aontu only): under the 'system' posture every
	// resolution escaping TrustWarnRoot calls TrustWarn. Not a stable
	// embedding API.
	TrustWarn     func(kind, path string)
	TrustWarnRoot string
}

// New creates a new Aontu instance. Relative @"file" loads resolve from
// the process working directory.
func New() *Aontu { return &Aontu{} }

// NewWithBase creates an Aontu that resolves relative @"file" source
// loads against base, a directory. Use it when evaluating a source whose
// relative loads should be resolved from somewhere other than the
// process working directory, e.g. the directory of an entry file:
//
//	abs, _ := filepath.Abs(file)
//	a := aontu.NewWithBase(filepath.Dir(abs))
//
// Absolute @"file" paths are unaffected by base.
func NewWithBase(base string) *Aontu { return &Aontu{base: base} }

// Parse parses source into a Val AST, not yet unified.
//
// NOTE: the returned Val is SINGLE-USE. Unify/Generate refine the tree
// in place (see unifyRoot), so do not Unify/Generate the same Val more
// than once and do not use it from multiple goroutines. The Unify/
// Generate entry points re-parse per call, so this only matters if you
// hold a Parse result yourself; call Parse again for a fresh tree.
func (a *Aontu) Parse(src string) (Val, error) {
	return a.parseEntry(src)
}

// parseEntry runs the entry parse under this instance's trust profile,
// and leaves the include manifest on IncludeDeps.
func (a *Aontu) parseEntry(src string) (Val, error) {
	sink := a.newTrustSink()
	v, err := parseWithTrust(src, a.base, a.File, sink)
	a.IncludeDeps = manifestOf(*sink.deps)
	a.IncludeText = sink.texts
	return v, err
}

// newTrustSink builds the per-parse trust sink the resolver reads
// (source.go): the capability, the warning window, and the manifest
// accumulator.
func (a *Aontu) newTrustSink() *trustSink {
	deps := []IncludeDep{}
	sink := &trustSink{
		deps: &deps, texts: map[string]string{},
		warn: a.TrustWarn, warnRoot: a.TrustWarnRoot,
		modDepth: a.modDepth, modCache: a.modCacheDir(),
	}
	if nil != a.Trust {
		sink.none = a.Trust.IncludeNone
		sink.mem = a.Trust.IncludeMem
		if "" != a.Trust.IncludeRoot {
			root, err := filepath.Abs(a.Trust.IncludeRoot)
			if err != nil { //coverage:ignore Abs fails only on an unreadable cwd
				root = a.Trust.IncludeRoot
			}
			sink.root = root
		}
	}
	return sink
}

// manifestOf sorts and deduplicates the raw manifest sink into the
// deterministic include closure: by path then capability, byte order,
// one entry per (path, capability) pair. The identical rule to the
// canonical port (ts/src/aontu.ts manifestOf).
func manifestOf(deps []IncludeDep) []IncludeDep {
	seen := map[string]bool{}
	out := make([]IncludeDep, 0, len(deps))
	for _, dep := range deps {
		key := dep.Path + " " + dep.Capability
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, dep)
	}
	sort.Slice(out, func(i, j int) bool {
		ki := out[i].Path + " " + out[i].Capability
		kj := out[j].Path + " " + out[j].Capability
		return ki < kj
	})
	return out
}

// Unify parses and fully unifies source, returning the unified Val.
// A non-nil error is returned if parsing fails or unification produces
// any conflict.
func (a *Aontu) Unify(src string) (Val, error) {
	return a.UnifyVars(src, nil)
}

// UnifyVars is Unify with $name variables resolved from vars.
func (a *Aontu) UnifyVars(src string, vars map[string]Val) (Val, error) {
	v, err := a.parseEntry(src)
	if err != nil {
		return v, err
	}
	res, _, err := a.unifyCtx(v, vars, src)
	return res, err
}

// unifyCtx runs the fixpoint loop and returns the result with its
// context (which carries move()-hidden paths and variables used by
// generation). src is the entry source text, threaded for error
// frame rendering (NilVal.FullMessage).
func (a *Aontu) unifyCtx(v Val, vars map[string]Val, src string) (Val, *Ctx, error) {
	ctx := &Ctx{root: v, vars: vars, src: src, file: a.File}
	if nil != a.Trust {
		ctx.budgetPasses = a.Trust.Budget.Passes
		ctx.budgetDepth = a.Trust.Budget.Depth
	}
	res := unifyRoot(v, ctx)
	ctx.root = res
	// THE DERIVED STRUCTURES (G4 phase 3): the entity index and the
	// edge set, computed once from the unified tree and left on the
	// instance exactly as the include manifest is. Cheap on a document
	// with no identity — one guarded walk.
	a.Graph = GraphOf(res)
	if len(ctx.err) > 0 {
		// Code carries the first collected failure's why-code, mirroring
		// errs()[0].why on the TS AontuError thrown by handleErrors.
		return res, ctx, &AontuError{Msg: ctx.errmsg(), Code: ctx.err[0].why}
	}
	return res, ctx, nil
}

// Generate parses, unifies and generates the native output value,
// which must fully resolve to concrete values.
//
// The native types are:
//
//	map        map[string]any
//	list       []any
//	string     string
//	integer    int64
//	float      float64
//	biginteger *math/big.Int
//	bigdecimal *Decimal
//	boolean    bool
//	null       nil
//
// The last two numeric rows are the number tower's exact leaves, reached
// only by a `0d` literal or the NewBigInteger/NewBigDecimal
// constructors: a document that writes no `0d` generates exactly what it
// always did. Both are pointers, and both marshal as EXACT DIGITS in a
// raw JSON number, so encoding/json (json.Marshal, json.MarshalIndent)
// round-trips an exact value without loss — no conversion step and no
// custom encoder needed on the Go side.
func (a *Aontu) Generate(src string) (any, error) {
	return a.GenerateVars(src, nil)
}

// GenerateVars is Generate with $name variables resolved from vars.
func (a *Aontu) GenerateVars(src string, vars map[string]Val) (any, error) {
	v, perr := a.parseEntry(src)
	if perr != nil {
		return nil, perr
	}
	res, ctx, err := a.unifyCtx(v, vars, src)
	if err != nil {
		return nil, err
	}
	out, gerr := res.Gen(ctx)
	if gerr != nil {
		return nil, gerr
	}
	return out, nil
}

// ModCacheDir is the content-addressed user module cache (G6 phase 2):
// `$XDG_CACHE_HOME/aontu/mod`, else the platform's own cache location.
// A host with nowhere to put one has no cache, which is a miss rather
// than a failure. One rule, in one place: the resolver reads this cache
// during evaluation and `aontu mod` writes into it, and two spellings
// of "where the cache is" is one bug. Mirrors modCacheDir in
// ts/src/mod.ts.
func ModCacheDir() string {
	return modCacheDirFor(runtime.GOOS, os.Getenv)
}

// modCacheDirFor is that rule with the platform and the environment
// PASSED IN, so the Windows arm can be exercised off Windows -- the
// only way a rule about a platform nobody here runs gets tested at all.
// The canonical port splits the same way (modCacheDirFor, ts/src/mod.ts).
//
// THE ORDER IS EXPLICIT BEFORE IMPLICIT, and LOCALAPPDATA is LAST.
// XDG_CACHE_HOME is the override and wins everywhere, Windows included:
// a caller who names a cache directory means it. HOME comes next and is
// also honoured on Windows, where it is not standard but IS set by Git
// Bash and by most development shells -- a user who has one expects
// their tools to agree about where home is.
//
// LOCALAPPDATA is the PLATFORM DEFAULT beneath both, which is the whole
// addition: Windows sets neither XDG_CACHE_HOME nor HOME by default --
// it supplies USERPROFILE and LOCALAPPDATA, and LOCALAPPDATA is what a
// cache directory means there -- so a rule that knew only the first two
// left every Windows user with NO cache: `aontu mod get` had nowhere to
// write, and a module fetched a moment earlier came back "not fetched",
// resolvable only from a project-local aon_vendor/.
//
// Putting it ABOVE HOME was the first attempt and was wrong: it made an
// explicitly set HOME unreachable on Windows, which broke the existing
// fallback test the moment CI ran it. A platform default that overrides
// what the environment was told is not a default.
//
// os.UserCacheDir is deliberately NOT used, though it encodes a
// per-platform rule of its own: on macOS it answers
// $HOME/Library/Caches, and taking it would move every existing macOS
// cache and put this port out of step with the canonical one, which has
// no such function to reach for.
func modCacheDirFor(goos string, env func(string) string) string {
	if xdg := env("XDG_CACHE_HOME"); "" != xdg {
		return filepath.Join(xdg, "aontu", "mod")
	}
	if home := env("HOME"); "" != home {
		return filepath.Join(home, ".cache", "aontu", "mod")
	}
	if "windows" == goos {
		if local := env("LOCALAPPDATA"); "" != local {
			return filepath.Join(local, "aontu", "mod")
		}
	}
	return ""
}

// modCacheDir is the cache this evaluation reads: whatever the host
// named, else the platform rule.
func (a *Aontu) modCacheDir() string {
	if "" != a.ModCache {
		return a.ModCache
	}
	return ModCacheDir()
}
