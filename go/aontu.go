/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"maps"
	"os"
	"path/filepath"
	"runtime"
	"sort"
)

const VERSION = "0.76.0"

type TrustBudget struct {
	Passes int // fixpoint passes (default 9)
	Depth  int // structural recursion depth (default 1000)
	Alias  int // expanded alias nodes (default 1000000)
	Trials int // admission trials (default 100000)
}

type TrustOptions struct {
	IncludeNone bool              // @"..." is always denied
	IncludeMem  map[string]string // a virtual file set only
	IncludeRoot string            // real files, realpath-confined below this root
	Budget      TrustBudget
}

type IncludeDep struct {
	Path       string
	Capability string
}

type Aontu struct {
	base string

	File string

	// Trust is the trust profile (docs/trust.md); nil is the 'system' posture.
	Trust *TrustOptions

	IncludeText map[string]string

	IncludeDeps []IncludeDep

	Graph Graph

	modDepth int

	ModCache string

	TrustWarn     func(kind, path string)
	TrustWarnRoot string

	TextExt []string

	ExactNumbers bool

	// ReadByExtension reads the entry by its path's extension.
	ReadByExtension bool

	entry string

	// HostVars binds $name where an evaluation is given no vars: --var.
	HostVars map[string]HostVar
}

// HostVar is aontu source, or with Text the text as it stands.
type HostVar struct {
	Value string
	Text  bool
	From  string // the option that bound it, when not --var: --vars <file>
}

// A binding's source loads nothing, and its site is the option that
// bound it, its text added to texts for an error to quote.
func hostValues(hostVars map[string]HostVar, texts map[string]string) (
	map[string]Val, map[string]string) {
	if nil == hostVars {
		return nil, texts
	}
	vars := map[string]Val{}
	all := maps.Clone(texts)
	if nil == all {
		all = map[string]string{}
	}
	for name, b := range hostVars {
		url, src := hostSite(name, b)
		all[url] = src
		vars[name], _ = (&Aontu{Trust: &TrustOptions{IncludeNone: true}, File: url}).Unify(src)
		stampURL(vars[name], url)
	}
	return vars, all
}

// hostSite is the url a binding's value is sited at, and its source.
func hostSite(name string, b HostVar) (string, string) {
	src, at := b.Value, "--var"
	if b.Text {
		src, at = newString(b.Value).Canon(), "--var-text"
	}
	if "" != b.From {
		at = b.From
	}
	return at + " " + name, src
}

func hostVals(hostVars map[string]HostVar) map[string]Val {
	vars, _ := hostValues(hostVars, nil)
	return vars
}

// New creates a new Aontu instance. Relative @"file" loads resolve from
// the process working directory.
func New() *Aontu { return &Aontu{} }

func NewWithBase(base string) *Aontu { return &Aontu{base: base} }

func (a *Aontu) Parse(src string) (Val, error) {
	return a.parseEntry(src)
}

// parseEntry runs the entry parse under this instance's trust profile,
// and leaves the include manifest on IncludeDeps.
func (a *Aontu) parseEntry(src string) (Val, error) {
	sink := a.newTrustSink()
	depth := maxUniteDepth
	if nil != a.Trust && 0 < a.Trust.Budget.Depth {
		depth = a.Trust.Budget.Depth
	}
	format := ""
	if a.ReadByExtension {
		format = operandFormat(a.entryPath())
	}
	v, err := parseWithTrust(src, a.base, a.File, format, sink, a.ExactNumbers, depth)
	a.IncludeDeps = manifestOf(*sink.deps)
	a.IncludeText = sink.texts
	return v, err
}

func (a *Aontu) entryPath() string {
	if "" != a.File {
		return a.File
	}
	return a.entry
}

func (a *Aontu) newTrustSink() *trustSink {
	deps := []IncludeDep{}
	sink := &trustSink{
		deps: &deps, texts: map[string]string{},
		warn: a.TrustWarn, warnRoot: a.TrustWarnRoot,
		modDepth: a.modDepth, modCache: a.modCacheDir(),
		textExt: a.TextExt,
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

func (a *Aontu) unifyCtx(v Val, vars map[string]Val, src string) (Val, *Ctx, error) {
	return a.unifyCtxReads(v, vars, src, nil)
}

func (a *Aontu) unifyCtxReads(v Val, vars map[string]Val, src string,
	reads map[string]bool) (Val, *Ctx, error) {
	texts := a.IncludeText
	if nil == vars {
		vars, texts = hostValues(a.HostVars, texts)
	}
	ctx := &Ctx{root: v, vars: vars, src: src, file: a.File, reads: reads,
		texts: texts}
	if nil != a.Trust {
		ctx.budgetPasses = a.Trust.Budget.Passes
		ctx.budgetDepth = a.Trust.Budget.Depth
		ctx.budgetAlias = a.Trust.Budget.Alias
		ctx.budgetTrials = a.Trust.Budget.Trials
	}
	res := unifyRoot(v, ctx)
	ctx.root = res
	a.Graph = GraphOf(res)
	if len(ctx.err) > 0 {
		// Code carries the first collected failure's why-code, mirroring
		// errs()[0].why on the TS AontuError thrown by handleErrors.
		return res, ctx, &AontuError{Msg: ctx.errmsg(), Code: ctx.err[0].why,
			Details: ctx.err[0].details}
	}
	return res, ctx, nil
}

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
	// An unfilled ROOT (`any`, `_`) has no bag to refuse it, so the
	// document does.
	switch res.(type) {
	case *TopVal, *PlaceVal:
		return nil, residueErr(ctx, res, "no_gen")
	}
	out, gerr := res.Gen(ctx)
	if gerr = genErr(ctx, gerr); gerr != nil {
		return nil, gerr
	}
	if aerr := aliasErrors(ctx, res); nil != aerr {
		return nil, aerr
	}
	if rerr := relationErrors(ctx, res); nil != rerr {
		return nil, rerr
	}
	return out, nil
}

func ModCacheDir() string {
	return modCacheDirFor(runtime.GOOS, os.Getenv)
}

func modCacheDirFor(goos string, env func(string) string) string {
	if xdg := env("XDG_CACHE_HOME"); "" != xdg {
		return filepath.Join(xdg, "aontu", "pkg")
	}
	if home := env("HOME"); "" != home {
		return filepath.Join(home, ".cache", "aontu", "pkg")
	}
	if "windows" == goos {
		if local := env("LOCALAPPDATA"); "" != local {
			return filepath.Join(local, "aontu", "pkg")
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
