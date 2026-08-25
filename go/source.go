/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"strings"

	jsonic "github.com/tabnas/jsonic/go"
	multisource "github.com/tabnas/multisource/go"
)

// fileResolver resolves an @"path" reference by reading from disk,
// mirroring makeFileResolver in @tabnas/multisource (resolver/file.ts):
// resolve the full path, try it, then the implicit-extension potentials.
//
// SECURITY: @"path" reads any file the process can read — relative paths
// (`@"../../etc/passwd"`) and symlinks are followed with no containment
// check. This is intentional for the CLI, but it means a `.aon` source
// can exfiltrate referenced files; the LSP backs onto this same resolver,
// so treat opening an untrusted source as you would running it. If you
// embed aontu in a less-trusted context, supply a custom resolver via
// MultiSourceOptions that confines reads to an allowed root.
func fileResolver(spec multisource.PathSpec, opts *multisource.MultiSourceOptions, ctx *jsonic.Context) multisource.Resolution {
	res := multisource.Resolution{PathSpec: spec}
	sink := trustSinkOf(ctx)

	// The include capability (G5 trust profile, docs/trust.md), from the
	// per-parse trust sink. 'none' denies every @"..." outright.
	if nil != sink && sink.none {
		recordDenied(ctx, res.Path, "none")
		res.Kind = deniedKind
		res.Found = true
		return res
	}

	// THE BUNDLED VOCABULARY (G4 phase 4, std.go): served from the
	// engine itself, so it needs neither the filesystem nor package
	// resolution and is available under every capability but `none` —
	// which is checked above, because `none` means no includes at all.
	// A document's OWN `std/system` file, reached through a capability
	// that allows it, is not shadowed: the bundled name is matched
	// against what the author WROTE, so a relative path resolving to a
	// real file never reaches here.
	if src, ok := stdSources[spec.Path]; ok {
		res.Full = spec.Path
		res.Kind = "aon"
		res.Src = toValidSource(src)
		res.Found = true
		recordDep(sink, spec.Path, "std")
		return res
	}

	// The mem capability: the declared virtual file set is the whole
	// world — a hit resolves from it, a miss is NOT-FOUND (the allowed
	// mechanism ran and missed; denial is reserved for a capability
	// refusing a mechanism outright), and the filesystem never runs.
	if nil != sink && nil != sink.mem {
		for _, key := range []string{spec.Full, spec.Path} {
			if src, ok := sink.mem[key]; ok {
				res.Full = key
				res.Kind = strings.TrimPrefix(filepath.Ext(key), ".")
				res.Src = toValidSource(src)
				res.Found = true
				recordDep(sink, key, "mem")
				return res
			}
		}
		recordNotFound(ctx, res.Path)
		res.Kind = notFoundKind
		res.Found = true
		return res
	}

	// THE MODULE LEG (G6 phase 2, mod.go): memory -> MODULE ->
	// filesystem -> package. Memory stays FIRST so a sandbox and the
	// spec suite can stub a module path without touching disk; a path
	// that is not module-shaped falls straight through, so no existing
	// include can be routed somewhere new by this. Mirrors the same leg
	// in ts/src/lang.ts.
	if ref, ok := parseModuleRef(spec.Path); ok {
		cache := ""
		depth := 0
		if nil != sink {
			depth = sink.modDepth
			// The user cache lives outside any confinement root, so it
			// is consulted only when nothing confines this evaluation. A
			// rooted profile sees the project's own `aon_vendor/` and
			// nothing else, which is what `root` means.
			if "" == sink.root {
				cache = sink.modCache
			}
		}

		out := resolveModule(ref, moduleFrom(spec), cache, depth)

		if "" != out.Code {
			recordModErr(sink, out.Code, out.Msg)
			res.Kind = deniedKind
			res.Found = true
			return res
		}

		if nil != sink && "" != sink.root && outsideRoot(sink.root, out.Full) {
			recordDenied(ctx, res.Path, "root:"+sink.root)
			res.Kind = deniedKind
			res.Found = true
			return res
		}

		res.Full = out.Full
		res.Kind = "aon"
		res.Src = out.Src
		res.Found = true
		recordDep(sink, out.Full, "mod")
		return res
	}

	// AN ABSOLUTE INCLUDE IGNORES THE BASE, and on Windows that has to
	// be said here. Upstream ResolvePathSpec calls a path absolute only
	// when it starts with a slash or a backslash, so a drive-lettered
	// `@"C:/x.aon"` is not recognised: it is joined to the base
	// (`D:\proj` + `/` + `C:/x.aon`) and never found.
	//
	// The canonical port has the SAME library defect and survives it by
	// ACCIDENT, which is worth recording so this is not mistaken for a
	// Go-only invention. multisource's TypeScript file resolver appends
	// `resolve(base, 'node_modules', path)` as a fallback potential, and
	// win32 `path.resolve` discards everything left of an absolute final
	// argument -- so the package leg, meant for `node_modules`, hands
	// back the drive-lettered path unchanged and the include resolves.
	// Go's leg has no such fallback. Equal behaviour, reached
	// deliberately on this side (ADR-001).
	//
	// filepath.IsAbs IS THE PLATFORM'S OWN RULE, and it must be: a plain
	// string test for `X:` would be a Linux REGRESSION, because there
	// `C:` is a legal directory name and `@"C:/x.aon"` resolves against
	// the base today. On POSIX this branch still runs -- for a leading
	// slash, where spec.Full already equals spec.Path -- so it decides
	// the same thing it decided before, and the suite that runs there
	// covers it.
	from := spec.Full
	if filepath.IsAbs(spec.Path) {
		from = spec.Path
	}

	var potentials []string
	if from != "" {
		full, _ := filepath.Abs(from)
		potentials = append(potentials, full)
		if filepath.Ext(full) == "" {
			for _, ext := range opts.ImplicitExt {
				potentials = append(potentials, full+ext)
			}
			for _, ext := range opts.ImplicitExt {
				potentials = append(potentials, filepath.Join(full, "index"+ext))
			}
		}
	}
	res.Search = potentials

	for _, p := range potentials {
		if data, err := os.ReadFile(p); err == nil {
			// The root capability: confinement is realpath-then-prefix-
			// check on the RESOLVED file (docs/trust.md), so a symlink
			// inside the root pointing outside it is an escape, not a
			// loophole. Content read before the check is discarded with
			// the denial; nothing of it reaches the document.
			if nil != sink && "" != sink.root && outsideRoot(sink.root, p) {
				recordDenied(ctx, res.Path, "root:"+sink.root)
				res.Kind = deniedKind
				res.Found = true
				return res
			}
			// The warning window for the staged default flip (G5 phase
			// 6): under 'system', the CLI supplies warn and the entry
			// root, and every resolution escaping that root names the
			// flag a future default will require.
			if nil != sink && "" == sink.root && nil != sink.warn &&
				"" != sink.warnRoot && outsideRoot(sink.warnRoot, p) {
				sink.warn("escape", p)
			}
			res.Full = p
			res.Kind = strings.TrimPrefix(filepath.Ext(p), ".")
			// Replace invalid UTF-8 as it is READ, exactly as parseBase
			// does for the entry source -- a loaded file reaches the parser
			// through the plugin, not through parseBase, so it needs its
			// own call or an include stays on the old per-byte behaviour
			// while the entry source no longer does (issue #32).
			res.Src = toValidSource(string(data))
			res.Found = true
			recordDep(sink, p, "file")
			return res
		}
	}
	// A missing source must be an error, not a silently dropped load
	// (the multisource plugin injects nil for Found=false). Record it in
	// the parse meta bag -- which parseBase checks -- and mark the
	// resolution so notFoundProcessor can give the tree an error value.
	recordNotFound(ctx, res.Path)
	res.Kind = notFoundKind
	res.Found = true
	return res
}

// outsideRoot reports whether full's real path escapes root's real path.
// A path EvalSymlinks cannot resolve falls back to its absolute lexical
// form — the comparison is then against what the resolver actually read.
// The identical rule to the canonical port (ts/src/lang.ts outsideRoot).
func outsideRoot(root, full string) bool {
	realRoot := realOrAbs(root)
	realFull := realOrAbs(full)
	return realFull != realRoot &&
		!strings.HasPrefix(realFull, realRoot+string(filepath.Separator))
}

// realOrAbs is EvalSymlinks with the lexical-absolute fallback for a
// path that does not (yet) exist — a nonexistent confinement root still
// confines, because everything real is outside it.
func realOrAbs(p string) string {
	real, err := filepath.EvalSymlinks(p)
	if err != nil {
		real, _ = filepath.Abs(p)
	}
	return real
}

// deniedKind marks a Resolution refused by the trust profile.
const deniedKind = "aontu-denied"

// trustMetaKey is where the per-parse trust sink rides the jsonic parse
// meta bag — the same channel notFoundMetaKey uses, and for the same
// reason: langForBase caches the parser per base, so nothing
// parse-specific may be stored on it or its options, while the plugin's
// child-meta copy carries the bag (and this pointer) to every nested
// include.
const trustMetaKey = reservedKeyPrefix + "trust"

// trustSink carries one parse's include capability, its first denial,
// and the include manifest. A POINTER, like notFoundSink, so a nested
// include's writes reach the entry parse.
type trustSink struct {
	none     bool
	mem      map[string]string
	root     string
	denied   string // first denial's message ("" = none)
	deps     *[]IncludeDep
	warn     func(kind, path string)
	warnRoot string
	// The module resolver's state and its first refusal (G6 phase 2,
	// mod.go): how deep module verification already is, where the user
	// cache lives, and the code and message of the first module that
	// was absent, failed its pin, or nested too far.
	modDepth int
	modCache string
	modCode  string
	modMsg   string
}

func trustSinkOf(ctx *jsonic.Context) *trustSink {
	if nil == ctx || nil == ctx.Meta {
		return nil
	}
	sink, _ := ctx.Meta[trustMetaKey].(*trustSink)
	return sink
}

// recordDenied notes a refused include in the parse's shared sink.
// Only the FIRST denial is kept, exactly as recordNotFound keeps the
// first miss: the canonical port raises on the first and stops.
func recordDenied(ctx *jsonic.Context, path, capability string) {
	sink := trustSinkOf(ctx)
	if nil == sink {
		return
	}
	if "" == sink.denied {
		sink.denied = "include denied: " + path + " (capability: " + capability + ")"
	}
}

// moduleFrom is the directory a module import is being resolved FROM:
// the source that holds it. multisource builds Full as base + "/" +
// Path, so trimming the path back off is the base — and a module path
// never looks like a file path, so nothing else can have shortened it.
func moduleFrom(spec multisource.PathSpec) string {
	base := strings.TrimSuffix(spec.Full, spec.Path)
	base = strings.TrimSuffix(base, "/")
	if "" == base {
		base = "."
	}
	abs, err := filepath.Abs(base)
	if nil != err { //coverage:ignore Abs fails only on an unreadable cwd
		return base
	}
	return abs
}

// recordModErr notes a refused module in the parse's shared sink. Only
// the FIRST refusal is kept, exactly as recordDenied keeps the first
// denial: the canonical port raises on the first and stops.
func recordModErr(sink *trustSink, code, msg string) {
	if nil == sink || "" != sink.modCode {
		return
	}
	sink.modCode = code
	sink.modMsg = msg
}

// recordDep appends a resolved include to the manifest sink (G5: the
// include closure made observable; sorted and deduplicated at the API
// boundary, aontu.go manifestOf).
func recordDep(sink *trustSink, path, capability string) {
	if nil == sink || nil == sink.deps {
		return
	}
	*sink.deps = append(*sink.deps, IncludeDep{Path: path, Capability: capability})
}

// deniedProcessor injects the include_denied nil (the twin of
// notFoundProcessor): the failure is DETECTED via the sink, this gives
// the tree an error value where the include was a value position.
func deniedProcessor(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
	n := newNil("include_denied")
	n.msg = "include denied: " + res.Path
	res.Val = n
}

// notFoundKind marks a Resolution for a source that could not be found.
const notFoundKind = "aontu-notfound"

// notFoundMetaKey is where a failed load is recorded for parseBase, in the
// jsonic parse meta bag.
//
// WHY THE META BAG AND NOT THE PARSED TREE. The obvious design -- inject an
// error nil and have parseBase find it by walking the result -- loses the
// error whenever `@"file"` is a bare MAP MEMBER rather than a value:
//
//	a: @"nofile"     the nil becomes the value of `a`, and survives
//	a:1 @"nofile"    the include MERGES into the enclosing map, and a nil
//	                 contributes no keys, so it vanishes without trace
//
// The second is the shape a real config uses most (`@"base.aon"` at the top
// of a file), and it produced a clean, plausible, INCOMPLETE document with
// exit 0 and no diagnostic -- a deleted or mistyped include silently
// yielding wrong config. The canonical TypeScript port raises during the
// parse and never had this hole.
//
// Wrapping the nil in a map to survive the merge does NOT work either, and
// the reason is worth recording so it is not attempted again: the plugin's
// mergeIntoParent copies the loaded value's keys into the parent one by one,
// so a wrapper carrying its own order list OVERWRITES the parent's and
// destroys the sibling keys -- while a wrapper without one is skipped by
// asValDepth, which converts only the keys the order list names.
//
// Recording at the point of DETECTION cannot be undone by anything
// downstream: no merge, no unification and no disjunction pruning can drop a
// fact that was never in the tree.
//
// The bag holds a POINTER (notFoundSink), not the message, so that a failure
// found inside a NESTED include propagates back to the entry parse -- see
// notFoundSink for why a plain value silently does not.
//
// The key carries the reserved sentinel prefix (see reservedKeyPrefix in
// lang.go) for the reason that prefix exists -- it shares a namespace with
// keys a source could otherwise write, and sources using the prefix are
// already refused.
const notFoundMetaKey = reservedKeyPrefix + "notfound"

// notFoundSink is the shared accumulator a parse hands to the resolver
// through the meta bag. It is a POINTER for the reason the whole mechanism
// works: the multisource plugin builds a nested parse's meta with a SHALLOW
// COPY of its parent's (childMeta), so every source in an include chain --
// at any depth -- ends up holding this same pointer, and a write from the
// deepest one is visible to the entry parse that allocated it.
//
// A plain string value in the bag is NOT enough, and that was the first
// version of this fix: it caught a bad include in the ENTRY source only.
// When the entry loaded a file that itself contained a bad bare-member
// include, the write landed in the child's copy of the map, the entry never
// saw it, and Go generated an incomplete document while TypeScript
// correctly refused. Found in review; the fixtures under
// test/spec/files/nest_missing*.aon pin it.
//
// Not synchronised, and does not need to be: the sink is allocated per
// parseBase call and a single parse runs on one goroutine. It never
// escapes to the cached, shared *jsonic.Jsonic.
type notFoundSink struct {
	msg string
}

// recordNotFound notes a failed load in the parse's shared sink.
//
// IT MUST BE CALLED FROM THE RESOLVER, NOT THE PROCESSOR. The resolver runs
// with the context of the parse that CONTAINS the include, so its meta bag
// still holds the sink pointer; the processor runs inside the include's own
// sub-parse. Verified by probing both, after the processor version silently
// did nothing.
//
// Only the FIRST failure is kept: TypeScript raises on the first missing
// source and stops, so reporting the first is what keeps the two ports'
// messages in step when a document has several bad includes.
func recordNotFound(ctx *jsonic.Context, path string) {
	if nil == ctx || nil == ctx.Meta {
		return
	}
	sink, ok := ctx.Meta[notFoundMetaKey].(*notFoundSink)
	if !ok || nil == sink {
		return
	}
	if "" == sink.msg {
		sink.msg = "source not found: " + path
	}
}

// notFoundProcessor injects the not-found error nil (see fileResolver).
//
// The failure is DETECTED via the meta bag, not here; this gives the tree an
// error value where the include was a value position, so nothing reads a
// hole before parseBase returns.
func notFoundProcessor(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
	n := newNil("multisource_not_found")
	n.msg = "source not found: " + res.Path
	res.Val = n
}

// msOptions builds the multisource plugin options for the aontu grammar.
// As of multisource/go v0.1.6 the plugin resolves relative @"file" loads
// inside a loaded file against that file's own directory (via the jsonic
// context meta), matching the canonical TypeScript @tabnas/multisource,
// so the stock JsonicProcessor is used directly.
func msOptions(base string) map[string]any {
	return map[string]any{
		"_opts": &multisource.MultiSourceOptions{
			Resolver: fileResolver,
			Path:     base,
			Processor: map[string]multisource.Processor{
				"":           multisource.JsonicProcessor,
				"aon":        multisource.JsonicProcessor,
				"aontu":      multisource.JsonicProcessor,
				notFoundKind: notFoundProcessor,
				deniedKind:   deniedProcessor,
			},
			// `.aon` is the preferred Aontu source extension; `.aontu`
			// also works. `.jsonic` is retired (no longer auto-resolved).
			ImplicitExt: []string{".aon", ".aontu"},
		},
	}
}
