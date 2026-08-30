/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	jsonic "github.com/tabnas/jsonic/go"
	multisource "github.com/tabnas/multisource/go"

	// THE CONFIG-FORMAT READERS (ADR-012). One parser per format, the
	// same ones the TypeScript port uses, so an included `.toml` or
	// `.yaml` is read by a real parser for that format rather than
	// guessed at by this one.
	inip "github.com/tabnas/ini/go"
	jsonp "github.com/tabnas/json/go"
	json5p "github.com/tabnas/json5/go"
	jsoncp "github.com/tabnas/jsonc/go"
	tomlp "github.com/tabnas/toml/go"
	yamlp "github.com/tabnas/yaml/go"
)

// fileResolver resolves an @"path" reference by reading from disk,
// mirroring makeFileResolver in @tabnas/multisource (resolver/file.ts):
// resolve the full path, try it, then the implicit-extension potentials.
//
// SECURITY: @"path" reads any file the process can read — relative paths
// (`@"../../etc/passwd.aon"`) and symlinks are followed with no
// containment check. This is intentional for the CLI, but it means a
// `.aon` source can exfiltrate referenced files; the LSP backs onto this
// same resolver, so treat opening an untrusted source as reading your
// disk. (It cannot RUN one: includeKinds refuses every extension but the
// four read as Aontu source, `.js` among them -- ADR-012.) If you
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
				// THE EXTENSION DECIDES HERE TOO. A virtual file set is
				// still a file set: its keys carry extensions, and the
				// same rule has to read them, or the mem capability
				// becomes a way to include what the filesystem would
				// refuse.
				if ext := extOf(key); "" == includeKinds[ext] {
					recordExtension(ctx, res.Path, ext)
					// Named, but not READ: the resolution carries the
					// key so extensionProcessor's nil names the same
					// extension the sink recorded, and Src stays empty
					// because nothing of the file is used.
					res.Full = key
					res.Kind = extensionKind
					res.Found = true
					return res
				}
				res.Full = key
				res.Kind = extOf(key)
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
			// THE EXTENSION DECIDES WHAT THE BYTES ARE (includeKinds).
			// After the trust checks, not before: a file outside the
			// confinement root is denied whatever it is called, and
			// answering "extension" there would say the file exists.
			// Before recordDep, because a refused include is not a
			// dependency -- nothing of it reaches the document.
			if ext := extOf(p); "" == includeKinds[ext] {
				recordExtension(ctx, res.Path, ext)
				res.Full = p
				res.Kind = extensionKind
				res.Found = true
				return res
			}
			res.Full = p
			res.Kind = extOf(p)
			// Replace invalid UTF-8 as it is READ, exactly as parseBase
			// does for the entry source -- a loaded file reaches the parser
			// through the plugin, not through parseBase, so it needs its
			// own call or an include stays on the old per-byte behaviour
			// while the entry source no longer does (issue #32).
			res.Src = toValidSource(string(data))
			res.Found = true
			recordDep(sink, p, "file")
			recordText(sink, p, res.Src)
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

// includeKinds IS THE RULE FOR WHAT AN INCLUDE MEANS (ADR-012,
// use-cases/BUGS.md §49). An extension is on this list or it is not
// read at all, and its entry says WHICH OF TWO THINGS the file is.
//
// `source` -- Aontu, with everything the language has: types, defaults,
// references, constraints, its own includes. Two extensions, and they
// are the ones this project owns.
//
// A FORMAT NAME -- configuration DATA, parsed by that format's own
// parser into the JSON value it denotes, which then becomes Aontu
// values like any other data. Every one of these formats maps onto
// JSON, which is why one word covers them: a `.toml` file is a map of
// scalars, lists and maps, and so is the `.aon` file that unifies with
// it. What the format does NOT get is the language -- a `&` in a YAML
// file is a YAML anchor, not a spread key, because the YAML parser
// reads it, not this one.
//
// The parsers are @tabnas's, one per format, and the TypeScript port
// uses the same ones (ADR-001): the two implementations agree because
// they are running the same grammar, not because two hand-written
// readers were kept in step.
//
// The keys are the multisource kind: the last path segment's extension
// without its dot, lowercased. This table and ts/src/lang.ts's
// INCLUDE_KINDS are the same table.
var includeKinds = map[string]string{
	"aon":   "source",
	"aontu": "source",

	"json": "json",
	// JSON-LD is JSON: a `@context` is a key like any other here, and
	// what it MEANS is the vocabulary's business, not the reader's.
	"jsonld": "json",
	"jsonc":  "jsonc",
	"json5":  "json5",
	"jsonic": "jsonic",
	"jsc":    "jsonic",
	"toml":   "toml",
	"yaml":   "yaml",
	"yml":    "yaml",
	"ini":    "ini",
}

// ONE READER PER FORMAT, BUILT ONCE. These are stateless parsers and
// building a jsonic instance is not free, so they are made at package
// load rather than per include -- and a dependency that cannot build
// its own grammar should fail loudly at startup, not on the first
// document that happens to include a `.toml`.
var dataReaders = map[string]*jsonic.Jsonic{
	// The strict RFC 8259 reader.
	"json":   jsonp.Make(),
	"jsonc":  usePlugin(jsoncp.Jsonc),
	"json5":  usePlugin(json5p.Json5),
	"jsonic": jsonic.Make(),
	"toml":   tomlp.MakeJsonic(),
	"yaml":   yamlp.MakeJsonic(),
	"ini":    inip.MakeJsonic(),
}

// usePlugin builds a parser for a format published as a jsonic plugin
// rather than as its own constructor.
func usePlugin(plugin func(*jsonic.Jsonic, map[string]any) error) *jsonic.Jsonic {
	j := jsonic.Make()
	if err := plugin(j, nil); err != nil { //coverage:ignore a plugin that cannot install is a broken dependency, not an input
		panic("aontu: include format parser: " + err.Error())
	}
	return j
}

// dataProcessor reads one included file as DATA in the named format.
//
// The parser hands back the JSON value the file denotes -- plain maps,
// lists and scalars -- and asVal turns that into Vals. THE CONVERSION
// HAPPENS HERE, not at the top level, because an include is usually
// not at the top level: `a: @"conf.toml"` puts the value under a key,
// where a raw value is something the tree cannot unify with.
//
// The file is NAMED to the reader (ParseMeta) so a syntax error inside
// an included `.toml` points at the `.toml`, and named again on the
// way out (stampResolved) so every value carries the file it came
// from -- the same invariant aonProcessor keeps for Aontu source.
func dataProcessor(format string) multisource.Processor {
	return func(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
		out, err := dataReaders[format].ParseMeta(res.Src, map[string]any{"fileName": res.Full})
		if err != nil {
			// THE PARSE FAILS. res.Err is what the plugin reads to fail
			// the whole document -- the same channel a syntax error in
			// an included `.aon` travels -- so a broken `.toml` refuses
			// rather than becoming an anonymous nil under the key that
			// included it.
			//
			// WHERE THIS PORT IS LESS SPECIFIC THAN THE OTHER, recorded
			// rather than hidden (DIVERGENCE.md #67): TypeScript's
			// reader THROWS, so the frame that reader drew -- the
			// `.toml`, its line, its caret -- is what reaches the user.
			// Here the outer parse fails afterwards and names its own
			// `@`. Same verdict, same class, same exit code; different
			// prose. Routing the inner message through notFoundSink was
			// tried and does not work: that sink is reachable only from
			// the RESOLVER (see recordNotFound), and a config format is
			// parsed here.
			res.Val = res.Src
			res.Err = err
			return
		}
		val := dataToVal(out)
		stampResolved(val, res.Full)
		res.Val = val
	}
}

// extensionKind marks a Resolution whose extension is not on that list.
const extensionKind = "aontu-extension"

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
	none   bool
	mem    map[string]string
	root   string
	denied string // first denial's message ("" = none)
	deps   *[]IncludeDep
	// texts is the TEXT of every source the resolver read, by full
	// path. A value's position is a byte offset into the source it was
	// parsed from, so a report that names an included file honestly
	// (finding F, use-cases/BUGS.md §25) needs that file's text to turn
	// the offset into a row and column. Shared through the meta bag
	// exactly as deps is, so an include at any depth lands in the entry
	// parse's map.
	texts    map[string]string
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

// recordText keeps a resolved source's text by full path, so a report
// can turn a value's byte offset into a row and column in the file the
// value actually came from (see trustSink.texts).
func recordText(sink *trustSink, path, src string) {
	if nil == sink || nil == sink.texts || "" == path {
		return
	}
	sink.texts[path] = src
}

// deniedProcessor injects the include_denied nil (the twin of
// notFoundProcessor): the failure is DETECTED via the sink, this gives
// the tree an error value where the include was a value position.
func deniedProcessor(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
	n := newNil("include_denied")
	n.msg = "include denied: " + res.Path
	res.Val = n
}

// extensionProcessor injects the include_extension nil (the twin of
// deniedProcessor): the failure is DETECTED in the resolver, this gives
// the tree an error value where the include was a value position.
func extensionProcessor(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
	n := newNil("include_extension")
	n.msg = extensionMsg(res.Path, extOf(res.Full))
	res.Val = n
}

// extOf is the multisource kind of a resolved path: the extension
// without its dot, lowercased, or "" for a name that has none.
func extOf(full string) string {
	return strings.ToLower(strings.TrimPrefix(filepath.Ext(full), "."))
}

// extensionMsg names the extension, because the extension is the whole
// reason: a reader who is told only "not readable" has to guess which
// of the path's parts the engine objected to.
func extensionMsg(path, ext string) string {
	which := "no extension"
	if "" != ext {
		which = "extension: ." + ext
	}
	return "include not readable: " + path + " (" + which + ")"
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
// It carries the CODE as well as the message: a load can fail for two
// reasons that need different names -- the source was not there
// (multisource_not_found) or its extension is not read as Aontu source
// (include_extension, see includeKinds) -- and both have to reach
// parseBase through this one channel, for the same bare-member reason.
type notFoundSink struct {
	msg  string
	code string
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
		sink.code = "multisource_not_found"
	}
}

// recordExtension notes a refused extension in the same shared sink, and
// for the same reason recordNotFound uses it: a bare-member include
// (`@"notes.txt"` at the top of a file) MERGES into the enclosing map,
// and a nil contributes no keys, so the injected nil alone would vanish
// and leave a plausible, silently-partial document.
//
// LIKEWISE FROM THE RESOLVER, NOT THE PROCESSOR -- see recordNotFound.
// First failure wins, across both kinds: one refusal is the diagnosis,
// and a document with two bad includes has one thing wrong with it.
func recordExtension(ctx *jsonic.Context, path, ext string) {
	if nil == ctx || nil == ctx.Meta {
		return
	}
	sink, ok := ctx.Meta[notFoundMetaKey].(*notFoundSink)
	if !ok || nil == sink { //coverage:ignore parseBase always seats the sink
		return
	}
	if "" == sink.msg {
		sink.msg = extensionMsg(path, ext)
		sink.code = "include_extension"
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

// aonProcessor parses an included source and then NAMES IT: every value
// the nested parse produced is stamped with the path it was read from,
// unless it already carries one from an include of its own.
//
// EVERY SITE NAMES THE FILE WHOSE TEXT IT EXCERPTS (the review's
// finding F, use-cases/BUGS.md §25). Without this the Go port had no
// per-source name at all -- a value's url was whatever the validation
// verb stamped over the whole tree afterwards, always the ENTRY -- so a
// finding cited `entry.aon:3:7` for text that lives three files away,
// at a line the entry may not even have. A repair agent that follows
// the site edits the wrong file. The canonical port names the source at
// parse time through its own resolver; this is the same act, at the one
// point in this port that knows both the value and its path.
func aonProcessor(
	res *multisource.Resolution, opts *multisource.MultiSourceOptions,
	ctx *jsonic.Context, j *jsonic.Jsonic,
) {
	multisource.JsonicProcessor(res, opts, ctx, j)
	if "" == res.Full { //coverage:ignore a resolution always carries its full path
		return
	}
	stampResolved(res.Val, res.Full)
}

// stampResolved names every Val in a resolved include's result. The
// nested parse hands back the raw container jsonic built -- a
// map[string]any (or a []any) whose entries are Vals -- rather than a
// Val itself, so the walk starts on the container. The FULL path is
// the name, not the spelling the include used: two files including the
// same library by different relative paths must report one file, and a
// site is only useful if it can be opened.
func stampResolved(node any, full string) {
	switch n := node.(type) {
	case Val:
		if nil != n {
			stampURL(n, full)
		}
	case map[string]any:
		for _, child := range n {
			stampResolved(child, full)
		}
	//coverage:ignore-block jsonic hands back a Val or a map, never a raw
	// slice: probed over map-, list- and scalar-valued includes, where a
	// list arrives as a *ListVal. Kept because the container shape is
	// the loader's contract rather than this port's, and losing the
	// stamp silently would put an included file's coordinates under the
	// entry's name again -- the exact defect this walk exists to close.
	case []any:
		for _, child := range n {
			stampResolved(child, full)
		}
	}
}

// dataToVal turns a config parser's output into Vals.
//
// IT IS NOT asVal, and that is the whole point. asVal reads the AONTU
// parser's own node shape -- the reserved order, optional, spread and
// position entries a map node carries -- so a map from another parser,
// which has none of them, reads as EMPTY. This walk takes a foreign
// value at face value.
//
// The twin of ts/src/lang.ts's rawToVal, which needs no such split
// because JavaScript's object is the same shape either way.
func dataToVal(node any) Val { return dataToValDepth(node, 0) }

func dataToValDepth(node any, depth int) Val {
	if depth > maxNodeDepth { //coverage:ignore the readers cannot nest deeper than their own parser allows
		return newNil("max_depth")
	}
	switch n := node.(type) {
	case nil:
		return newNull()
	case Val:
		return n //coverage:ignore a config parser never hands back a Val
	case *jsonic.OrderedMap:
		// IN THE ORDER THE FILE WROTE IT. Most of these parsers answer
		// with an OrderedMap for exactly that reason, and discarding it
		// would make the key order of a `.toml` include depend on Go's
		// map iteration, which is deliberately random.
		mv := newMap()
		for _, k := range n.Keys {
			mv.set(k, dataToValDepth(n.Vals[k], depth+1))
		}
		return mv
	case map[string]any:
		// A parser that answers with a plain map has already lost the
		// order, so SORT: an arbitrary order that is the same every run
		// beats Go's, which is not.
		mv := newMap()
		keys := make([]string, 0, len(n))
		for k := range n {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			mv.set(k, dataToValDepth(n[k], depth+1))
		}
		return mv
	case []any:
		vals := make([]Val, 0, len(n))
		for _, e := range n {
			vals = append(vals, dataToValDepth(e, depth+1))
		}
		return newList(vals)
	case *tomlp.TomlTime:
		// TOML HAS DATES AND JSON DOES NOT, so the reader cannot hand
		// one over as itself: it answers with this, holding the kind and
		// the source text. The value that reaches a document is that
		// TEXT, which is what a JSON document carries for a date anyway
		// -- and what the TypeScript port produces too, from the
		// `{__toml__:{kind,src}}` marker its reader answers with
		// (tomlDates, ts/src/lang.ts). Without this the same file is a
		// nested map in one port and a string in the other, which is the
		// class of divergence ADR-012 exists to stop.
		return newString(n.Src)
	case string:
		return newString(n)
	case bool:
		return newBoolean(n)
	case int:
		// The Go readers answer with `int` where the TypeScript ones
		// answer with a JavaScript number; both are integers, and
		// numberVal is what decides that on the parsed-literal path too,
		// so the two ports cannot drift on where the integer/float line
		// falls.
		return numberVal(float64(n), "", -1)
	case int64:
		return numberVal(float64(n), "", -1) //coverage:ignore no reader answers int64 today
	case float64:
		return numberVal(n, "", -1)
	}
	return newNil("parse_unknown") //coverage:ignore a JSON-shaped value has no other kind
}

// includeProcessors is the multisource processor map, built FROM the
// include table so the two cannot drift: every extension the table
// names gets the reader the table names for it, and the kinds that are
// not in the table refuse.
func includeProcessors() map[string]multisource.Processor {
	procs := map[string]multisource.Processor{
		// The empty kind is multisource's FALLBACK for an extension no
		// entry names, so it is the one that must refuse: the resolver
		// already gates every leg, and this is what keeps a kind that
		// reached the plugin by some other road from being read by
		// default.
		"":            extensionProcessor,
		extensionKind: extensionProcessor,
		notFoundKind:  notFoundProcessor,
		deniedKind:    deniedProcessor,
	}
	for kind, format := range includeKinds {
		if "source" == format {
			procs[kind] = aonProcessor
			continue
		}
		procs[kind] = dataProcessor(format)
	}
	return procs
}

// msOptions builds the multisource plugin options for the aontu
// grammar. As of multisource/go v0.1.6 the plugin resolves relative
// @"file" loads inside a loaded file against that file's own directory
// (via the jsonic context meta), matching the canonical TypeScript
// @tabnas/multisource, so aonProcessor delegates the parse to the stock
// JsonicProcessor and only adds the naming above.
func msOptions(base string) map[string]any {
	return map[string]any{
		"_opts": &multisource.MultiSourceOptions{
			Resolver:  fileResolver,
			Path:      base,
			Processor: includeProcessors(),
			// `.aon` is the preferred Aontu source extension; `.aontu`
			// also works. `.jsonic` is retired (no longer auto-resolved).
			// Only these two are SEARCHED for a bare `@"name"`; `.json`
			// and `.jsonld` are read when named, which is how a
			// vendored vocabulary is always written.
			ImplicitExt: []string{".aon", ".aontu"},
		},
	}
}
