/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	jsonic "github.com/tabnas/jsonic/go"
	multisource "github.com/tabnas/multisource/go"

	inip "github.com/tabnas/ini/go"
	jsonp "github.com/tabnas/json/go"
	json5p "github.com/tabnas/json5/go"
	jsoncp "github.com/tabnas/jsonc/go"
	tomlp "github.com/tabnas/toml/go"
	yamlp "github.com/tabnas/yaml/go"
)

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

	if strings.HasPrefix(spec.Path, aontuScheme) {
		if src, ok := aontuSources[spec.Path]; ok {
			res.Full = spec.Path
			res.Kind = "aon"
			res.Src = toValidSource(src)
			res.Found = true
			recordDep(sink, spec.Path, "aontu")
			recordText(sink, spec.Path, res.Src)
			return res
		}
		recordNotFoundMsg(ctx, "source not found: "+spec.Path+
			" (the language-supplied models are "+strings.Join(aontuModels, ", ")+")")
		res.Kind = notFoundKind
		res.Found = true
		return res
	}

	if nil != sink && nil != sink.mem {
		for _, key := range []string{spec.Full, spec.Path} {
			if src, ok := sink.mem[key]; ok {
				if ext := extOf(key); "" == includeFormat(ext, sink) {
					recordExtension(ctx, res.Path, ext)
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

	if ref, ok := parseModuleRef(spec.Path); ok {
		cache := ""
		depth := 0
		if nil != sink {
			depth = sink.modDepth
			if "" == sink.root {
				cache = sink.modCache
			}
		}

		out := resolveModule(ref, moduleFrom(spec), cache, depth)
		// A bare `config.json` routes here now the major has left the
		// name (ADR-022 part 4); the message says what was meant.
		if ext := localFileExt(ref.Path); "" != ext && "" != includeFormat(ext, sink) {
			out = refuseModule("module_local", localFileMsg(ref.Path))
		}

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
			if nil != sink && "" != sink.root && outsideRoot(sink.root, p) {
				recordDenied(ctx, res.Path, "root:"+sink.root)
				res.Kind = deniedKind
				res.Found = true
				return res
			}
			if nil != sink && "" == sink.root && nil != sink.warn &&
				"" != sink.warnRoot && outsideRoot(sink.warnRoot, p) {
				sink.warn("escape", p)
			}
			if ext := extOf(p); "" == includeFormat(ext, sink) {
				recordExtension(ctx, res.Path, ext)
				res.Full = p
				res.Kind = extensionKind
				res.Found = true
				return res
			}
			res.Full = p
			res.Kind = extOf(p)
			res.Src = toValidSource(string(data))
			res.Found = true
			recordDep(sink, p, "file")
			recordText(sink, p, res.Src)
			return res
		}
	}
	recordNotFound(ctx, res.Path)
	res.Kind = notFoundKind
	res.Found = true
	return res
}

func outsideRoot(root, full string) bool {
	realRoot := realOrAbs(root)
	realFull := realOrAbs(full)
	return realFull != realRoot &&
		!strings.HasPrefix(realFull, realRoot+string(filepath.Separator))
}

// realOrAbs is EvalSymlinks with a lexical-absolute fallback: a
// nonexistent confinement root still confines.
func realOrAbs(p string) string {
	real, err := filepath.EvalSymlinks(p)
	if err != nil {
		real, _ = filepath.Abs(p)
	}
	return real
}

var includeKinds = map[string]string{
	"aon":   "source",
	"aontu": "source",

	"json": "json",
	"jsonld": "json",
	"jsonc":  "jsonc",
	"json5":  "json5",
	"jsonic": "jsonic",
	"jsc":    "jsonic",
	"toml":   "toml",
	"yaml":   "yaml",
	"yml":    "yaml",
	"ini":    "ini",

	"txt": "text",
}

func includeFormat(ext string, sink *trustSink) string {
	if known := includeKinds[ext]; "" != known {
		return known
	}
	if "js" == ext || "" == ext {
		return ""
	}
	if nil != sink {
		for _, allowed := range sink.textExt {
			if allowed == ext {
				return "text"
			}
		}
	}
	return ""
}

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

func dataProcessor(format string) multisource.Processor {
	return func(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
		out, err := dataReaders[format].ParseMeta(res.Src, map[string]any{"fileName": res.Full})
		if err != nil {
			res.Val = res.Src
			res.Err = err
			return
		}
		val := dataToVal(out)
		stampResolved(val, res.Full)
		res.Val = dataNode(val)
	}
}

// dataNode hands a data include's value back as a parse NODE: a
// ROOT-level directive merges what is map-shaped, and a Val is not.
func dataNode(val Val) any {
	mv, ok := val.(*MapVal)
	if !ok {
		return map[string]any{dataValKey: val}
	}
	node := map[string]any{
		orderKey: append([]string{}, mv.keys...),
		posKey:   mv.site.sp,
		srcKey:   mv.srctext(),
	}
	for _, k := range mv.keys {
		node[k] = mv.peg[k]
	}
	return node
}

// extensionKind marks a Resolution whose extension is not on that list.
const extensionKind = "aontu-extension"

// deniedKind marks a Resolution refused by the trust profile.
const deniedKind = "aontu-denied"

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
	texts    map[string]string
	warn     func(kind, path string)
	warnRoot string
	modDepth int
	modCache string
	modCode  string
	modMsg   string
	textExt []string
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

// recordModErr keeps the FIRST refused module, as recordDenied keeps
// the first denial.
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
func extensionProcessor(res *multisource.Resolution, _ *multisource.MultiSourceOptions, ctx *jsonic.Context, _ *jsonic.Jsonic) {
	if "text" == includeFormat(extOf(res.Full), trustSinkOf(ctx)) {
		textProcessor(res, nil, ctx, nil)
		return
	}
	n := newNil("include_extension")
	n.msg = extensionMsg(res.Path, extOf(res.Full))
	res.Val = n
}

// TEXT IS NOT PARSED. The bytes the resolver read are the value, so
// this is the one processor with no reader behind it -- a text include
// cannot fail on content, only on being unreadable. The twin is
// textProcessor in ts/src/lang.ts.
func textProcessor(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
	res.Val = newString(res.Src)
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

const notFoundMetaKey = reservedKeyPrefix + "notfound"

type notFoundSink struct {
	msg  string
	code string
}

func recordNotFound(ctx *jsonic.Context, path string) {
	recordNotFoundMsg(ctx, "source not found: "+path)
}

// recordNotFoundMsg is recordNotFound with the message spelled by the
// caller: the aontu: leg names the set of language-supplied models in
// its refusal (docs/design/MODELS.0.md D1), where a file that is not
// there names only itself.
func recordNotFoundMsg(ctx *jsonic.Context, msg string) {
	if nil == ctx || nil == ctx.Meta {
		return
	}
	sink, ok := ctx.Meta[notFoundMetaKey].(*notFoundSink)
	if !ok || nil == sink {
		return
	}
	if "" == sink.msg {
		sink.msg = msg
		sink.code = "multisource_not_found"
	}
}

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

func notFoundProcessor(res *multisource.Resolution, _ *multisource.MultiSourceOptions, _ *jsonic.Context, _ *jsonic.Jsonic) {
	n := newNil("multisource_not_found")
	n.msg = "source not found: " + res.Path
	res.Val = n
}

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
	case []any:
		for _, child := range n {
			stampResolved(child, full)
		}
	}
}

func dataToVal(node any) Val { return dataToValDepth(node, 0) }

func dataToValDepth(node any, depth int) Val {
	if depth > maxNodeDepth { //coverage:ignore the readers cannot nest deeper than their own parser allows
		return newNil("max_depth")
	}
	switch n := node.(type) {
	case nil:
		return newNull()
	case *jsonic.OrderedMap:
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
		return newString(n.Src)
	case string:
		return newString(n)
	case bool:
		return newBoolean(n)
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
		"":            extensionProcessor,
		extensionKind: extensionProcessor,
		notFoundKind:  notFoundProcessor,
		deniedKind:    deniedProcessor,
	}
	for kind, format := range includeKinds {
		switch format {
		case "source":
			procs[kind] = aonProcessor
		case "text":
			procs[kind] = textProcessor
		default:
			procs[kind] = dataProcessor(format)
		}
	}
	return procs
}

func msOptions(base string, resolver multisource.Resolver) map[string]any {
	return map[string]any{
		"_opts": &multisource.MultiSourceOptions{
			Resolver:  resolver,
			Path:      base,
			Processor: includeProcessors(),
			ImplicitExt: []string{".aon", ".aontu"},
		},
	}
}
