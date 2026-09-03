"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPLETION_KEYWORD = exports.COMPLETION_FUNCTION = exports.SEVERITY_HINT = exports.SEVERITY_INFORMATION = exports.SEVERITY_WARNING = exports.SEVERITY_ERROR = exports.BUILTIN_FUNCS = exports.LSP_VERSION = exports.LspHandler = void 0;
exports.contributionsMarkdown = contributionsMarkdown;
exports.uriToPath = uriToPath;
exports.computeDiagnostics = computeDiagnostics;
exports.computeHover = computeHover;
exports.computeCompletions = computeCompletions;
const aontu_1 = require("./aontu");
const err_1 = require("./err");
const walk_1 = require("./walk");
const utility_1 = require("./utility");
const query_1 = require("./query");
// LSP DiagnosticSeverity subset.
const SEVERITY_ERROR = 1;
exports.SEVERITY_ERROR = SEVERITY_ERROR;
const SEVERITY_WARNING = 2;
exports.SEVERITY_WARNING = SEVERITY_WARNING;
const SEVERITY_INFORMATION = 3;
exports.SEVERITY_INFORMATION = SEVERITY_INFORMATION;
const SEVERITY_HINT = 4;
exports.SEVERITY_HINT = SEVERITY_HINT;
// Reported to the client in the initialize response. It is the
// ENGINE's version, not a number of the server's own: a separately
// maintained one drifts, and had -- the server answered 0.1.0 against
// a package at 0.52.1, so a client could not tell which engine it was
// talking to (status-2026-08-21.md section 10).
const LSP_VERSION = aontu_1.VERSION;
exports.LSP_VERSION = LSP_VERSION;
// Compute LSP diagnostics for a unit of Aontu source. A valid document —
// including a non-concrete schema such as `a:string` — returns an empty
// array; only genuine errors (conflicts, unresolved references, unknown
// functions, syntax errors) produce diagnostics.
function computeDiagnostics(src, opts) {
    // The trust profile (G5, docs/trust.md): the LSP is the
    // highest-exposure surface — merely OPENING a hostile .aon file in an
    // editor performs its reads — so the handler confines evaluation to
    // the workspace root and threads the profile through here.
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(opts ?? {}));
    let root;
    let ac;
    try {
        ac = aontu.ctx({ collect: true });
        if (opts?.vars) {
            Object.assign(ac.vars, opts.vars);
        }
        root = aontu.unify(src, { collect: true }, ac);
    }
    catch (err) {
        // Hard parse/syntax failure: report a single diagnostic. jsonic
        // errors may carry 1-based line/col; fall back to the document start.
        return [parseErrorDiagnostic(err)];
    }
    // The walk's `seen` set is reused below to dedup context errors
    // against the nils already found in the tree.
    const seen = new Set();
    const nils = (0, walk_1.collectNils)(root, seen);
    // Errors recorded on the context but not present in the tree — e.g. a
    // budget_passes exhaustion nil, which is about the whole evaluation
    // rather than any node — would otherwise be invisible here, and the
    // trust contract forbids silent truncation (docs/trust.md clause 2).
    // Tree nils are already on ctx.err too, so dedup by identity; the
    // transient disjunct-trial sentinel never surfaces.
    for (const e of ac.err) {
        if (e?.isNil && '|:trial-nil' !== e.why && !seen.has(e)) {
            seen.add(e);
            nils.push(e);
        }
    }
    const out = nils.map(nilToDiagnostic);
    // Deprecation tags (G3 phase 4): every sited value carrying the
    // deprecate() record — the declaration and, because the record rides
    // meets and reference clones, every use resolving through it — gets
    // the native Deprecated tag (2) at Hint severity, so editors strike
    // it through without shouting.
    for (const { val } of (0, utility_1.collectDeprecations)(root)) {
        const v = val;
        if (1 > (v.site?.row ?? -1) || 1 > (v.site?.col ?? -1)) {
            continue;
        }
        out.push({
            range: {
                start: { line: v.site.row - 1, character: v.site.col - 1 },
                end: {
                    line: v.site.row - 1,
                    character: v.site.col - 1 + siteExtent(v),
                },
            },
            severity: 4,
            code: 'deprecated',
            source: 'aontu',
            message: (0, utility_1.deprecationMessage)(v.deprecation),
            tags: [2],
        });
    }
    return out;
}
// Convert a NilVal (1-based site row/col) to an LSP diagnostic (0-based
// line/character).
function nilToDiagnostic(nil) {
    const row = nil.site?.row ?? -1;
    const col = nil.site?.col ?? -1;
    let start;
    let end;
    if (row >= 1 && col >= 1) {
        start = { line: row - 1, character: col - 1 };
        const len = labelLength(nil);
        end = { line: row - 1, character: col - 1 + len };
    }
    else {
        start = { line: 0, character: 0 };
        end = { line: 0, character: 1 };
    }
    return {
        range: { start, end },
        severity: SEVERITY_ERROR,
        code: nil.why,
        source: 'aontu',
        message: nilMessage(nil),
    };
}
// Length (UTF-16 units, like LSP characters) of the offending value's
// SOURCE TEXT, used to size the diagnostic range (minimum 1).
function labelLength(nil) {
    return null == nil.primary ? 1 : siteExtent(nil.primary);
}
// The extent to underline for a value: its SOURCE TEXT's length, with
// the canon as the fallback and 1 as the floor.
//
// CANON IS NOT SOURCE TEXT, which is the whole point of Site.len:
// `0x1F` has canon `31`, so sizing by canon underlines two characters
// of a four-character literal — hovering `0x1F` highlighted `0x` and
// hovering `1F` answered nothing. The Go twin is the same fallback in
// go/check.go (Problem.Len, ValueSpan.Len), in bytes there because it
// is added to a byte offset before conversion.
//
// The fallback is for a value carrying no stamped span — one propagated
// onto a result rather than written by a document — where canon is all
// there is and an approximate underline beats none. A REPORT never
// guesses this way: vet and why emit len only when it is known, because
// there a wrong length is a corrupted document rather than a wonky
// highlight.
function siteExtent(v) {
    const len = v?.site?.len;
    if ('number' === typeof len && len > 0) {
        return len;
    }
    // CANON IS READ DEFENSIVELY, as every other reader here does: it is a
    // getter that unifies, and a host-supplied value can throw from it
    // (hover-refuses-bad-input). A hover that cannot measure a value
    // still has to answer for the rest of the document.
    let c = '';
    try {
        c = v?.canon;
    }
    catch {
        c = '';
    }
    return 'string' === typeof c && c.length > 0 ? c.length : 1;
}
// Build the human-readable message. Kept identical to the Go port's
// NilVal.Message() (go/val.go) so diagnostics match across
// implementations: "Cannot <attempt> value: X with value: Y\n<hint>".
function nilMessage(nil) {
    if (nil.msg)
        return nil.msg;
    const attempt = nil.attempt ?? (null == nil.secondary ? 'resolve' : 'unify');
    let msg = 'Cannot ' + attempt + ' value';
    if (null != nil.primary) {
        msg += ': ' + nil.primary.canon;
        if (null != nil.secondary) {
            msg += ' with value: ' + nil.secondary.canon;
        }
    }
    const hint = (0, err_1.getHint)(nil.why, nil.details);
    if (hint) {
        msg += '\n' + hint;
    }
    return msg;
}
function parseErrorDiagnostic(err) {
    // jsonic/AontuError may expose 1-based line/col.
    const row = err?.lineNumber ?? err?.row ?? err?.line ?? -1;
    const col = err?.column ?? err?.col ?? -1;
    const start = row >= 1 && col >= 1
        ? { line: row - 1, character: col - 1 }
        : { line: 0, character: 0 };
    return {
        range: { start, end: { line: start.line, character: start.character + 1 } },
        severity: SEVERITY_ERROR,
        code: 'parse',
        source: 'aontu',
        message: ('string' === typeof err?.message ? err.message : String(err)),
    };
}
// initialize result: advertise full-text document sync feeding diagnostics.
function initializeResult() {
    return {
        capabilities: {
            // 1 = TextDocumentSyncKind.Full
            textDocumentSync: 1,
            hoverProvider: true,
            completionProvider: {},
            signatureHelpProvider: { triggerCharacters: ['(', ','] },
        },
        serverInfo: {
            name: 'aontu-lsp',
            version: LSP_VERSION,
        },
    };
}
// signatureHelp: the declared signature of the ENCLOSING call, served
// from the registry (docs/design/SIGNATURES.0.md). The enclosing call
// is found lexically -- scan back from the cursor for the nearest
// unclosed '(' and read the word before it; commas at that depth
// count the active parameter, capped at the last slot so a rest tail
// stays active for every excess argument. Strings are skipped so a
// paren or comma inside one does not miscount, and the scan stops at
// the line start, a call being one line in practice.
function computeSignatureHelp(text, pos) {
    // Position to offset, under the full-sync model: lines are exactly
    // the text's newlines.
    const lines = text.split('\n');
    const line = Math.max(0, Math.min(Number(pos.line) || 0, lines.length - 1));
    let offset = 0;
    for (let li = 0; li < line; li++) {
        offset += lines[li].length + 1;
    }
    offset += Math.max(0, Math.min(Number(pos.character) || 0, lines[line].length));
    let depth = 0;
    let commas = 0;
    let open = -1;
    for (let i = offset - 1; 0 <= i; i--) {
        const c = text[i];
        if ('"' === c || "'" === c) {
            for (i--; 0 <= i && text[i] !== c; i--) { }
            continue;
        }
        if (')' === c) {
            depth++;
        }
        else if ('(' === c) {
            if (0 === depth) {
                open = i;
                break;
            }
            depth--;
        }
        else if (',' === c && 0 === depth) {
            commas++;
        }
        else if ('\n' === c && 0 === depth) {
            break;
        }
    }
    if (0 > open) {
        return null;
    }
    let start = open;
    while (0 < start && /[a-zA-Z0-9_]/.test(text[start - 1])) {
        start--;
    }
    const name = text.slice(start, open);
    const sig = sig_1.funcSig[name];
    if (undefined === sig) {
        return null;
    }
    const last = sig.args.length - 1;
    return {
        signatures: [{
                label: (0, sig_1.renderSig)(sig),
                parameters: sig.args.map((a) => ({ label: (0, sig_1.renderSigArg)(a) })),
            }],
        activeSignature: 0,
        activeParameter: Math.min(commas, 0 <= last ? last : 0),
    };
}
function publishDiagnosticsMsg(uri, diagnostics) {
    return {
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: { uri, diagnostics },
    };
}
// Resolve the value under the cursor and describe it. Returns null when
// the position is not over a value with a known source location. Because
// hover reads the *unified* tree, a literal shows its resolved value and
// kind (e.g. a reference target resolves to the value it points at).
// HOVER PROVENANCE (G7 phase 7) is CONFIG-GATED and off by default:
// the contributions that met at the hovered path, appended to the
// value's own hover. Hover already re-unifies the whole document per
// request, so an editor that asks for this pays a second instrumented
// evaluation knowingly, and one that does not pays nothing.
function provenanceMarkdown(src, path, trust) {
    if (0 === path.length) {
        return '';
    }
    // A document with an error ELSEWHERE still hovers — the tree the
    // hover walked is there — while `why` refuses it, so the record may
    // be absent for a value the cursor is sitting on.
    const report = (0, query_1.why)(src, '$.' + path.join('.'), { trust });
    return contributionsMarkdown(report.record?.conjuncts ?? []);
}
// The contributions as hover markdown. Exported for the direct test
// (ADR-002): a siteless contribution and a named file are both shapes
// the record allows and no hover produces, hover evaluating one
// unnamed document.
function contributionsMarkdown(conjuncts) {
    if (0 === conjuncts.length) {
        return '';
    }
    return '\n\n---\n\nContributions:\n' + conjuncts.map((c) => '- `' + c.canon + '` — ' + c.role +
        (0 > c.site.row ? '' : ' (' +
            ('' === c.site.file ? '' : c.site.file + ':') +
            c.site.row + ':' + c.site.col + ')')).join('\n');
}
// HOVER RUNS UNDER THE SAME CAPABILITY AS DIAGNOSTICS. It used to
// evaluate through `new Aontu()` -- the full system resolver -- BESIDE
// confined diagnostics in the same server, so a workspace-confined
// session still resolved an escaping include the moment a cursor rested
// on it (use-cases/REVIEW.md finding G). One document, two postures, is
// not a confinement.
function computeHover(src, position, provenance, trust) {
    let root;
    try {
        root = new aontu_1.Aontu(null == trust ? {} : { trust }).unify(src, { collect: true });
    }
    catch {
        return null;
    }
    const cands = [];
    collectHoverCandidates(root, cands, new Set());
    let best = null;
    for (const c of cands) {
        if (c.line === position.line &&
            c.start <= position.character && position.character < c.end) {
            // Most specific (smallest) span wins.
            if (null == best || (c.end - c.start) < (best.end - best.start))
                best = c;
        }
    }
    if (null == best)
        return null;
    return {
        contents: {
            kind: 'markdown',
            value: hoverMarkdown(best.val) +
                (true === provenance
                    ? provenanceMarkdown(src, best.val.path, trust) : ''),
        },
        range: {
            start: { line: best.line, character: best.start },
            end: { line: best.line, character: best.end },
        },
    };
}
function collectHoverCandidates(v, out, seen) {
    if (null == v || 'object' !== typeof v || true !== v.isVal)
        return;
    if (seen.has(v))
        return;
    seen.add(v);
    const row = v.site.row;
    const col = v.site.col;
    let canon = '';
    try {
        canon = v.canon;
    }
    catch {
        canon = '';
    }
    // The span to highlight: the value's own source text where it has
    // one, canon otherwise. See siteExtent.
    const span = siteExtent(v);
    const spanSrc = 'string' === typeof v.site?.src ? v.site.src : '';
    // Hover targets concrete values (scalars, kinds, refs, …), not
    // containers: a map/list source span is not reliably reconstructable
    // from a single site, and the same restriction in the Go port keeps
    // hover behaviour identical across implementations. The walk still
    // recurses into containers below to reach their leaf values. Canon is
    // single-line, so its length approximates the on-line source span.
    // Single-line is decided by the SOURCE TEXT when there is one: a
    // multi-line token cannot be described by one line's start and end,
    // and canon's newlines are not the token's. Falling back to canon
    // keeps the old test for a value with no stamped span.
    const multiline = '' === spanSrc ? canon.includes('\n') : spanSrc.includes('\n');
    if (row >= 1 && col >= 1 && canon.length > 0 && !multiline &&
        !v.isMap && !v.isList) {
        out.push({ val: v, line: row - 1, start: col - 1, end: col - 1 + span });
    }
    const peg = v.peg;
    if (Array.isArray(peg)) {
        for (const c of peg)
            collectHoverCandidates(c, out, seen);
    }
    else if (null != peg && 'object' === typeof peg) {
        for (const k in peg)
            collectHoverCandidates(peg[k], out, seen);
    }
    const spreadCj = v.spread?.cj;
    if (spreadCj)
        collectHoverCandidates(spreadCj, out, seen);
}
function hoverMarkdown(val) {
    // No try needed: a Val only becomes a hover candidate after
    // collectHoverCandidates read this same getter successfully.
    const canon = val.canon;
    return '```aontu\n' + canon + '\n```\n\n' + '*' + valKind(val) + '*';
}
// A short human description of a Val's kind, shown under the hover canon.
function valKind(val) {
    if (val.isNil)
        return 'error';
    if (val.isScalarKind)
        return 'type';
    if (val.isConstraint)
        return 'constraint';
    if (val.isRef)
        return 'reference';
    if (val.isInteger)
        return 'integer';
    // NumberVal is the binary64 leaf, whose kind keyword is `float`;
    // `number` is the supertype and never labels a concrete value.
    if (val.isNumber)
        return 'float';
    if (val.isBigInteger)
        return 'biginteger';
    if (val.isBigDecimal)
        return 'bigdecimal';
    if (val.isString)
        return 'string';
    if (val.isBoolean)
        return 'boolean';
    if (val.isScalar)
        return 'scalar';
    return val.constructor.name.replace(/Val$/, '').toLowerCase();
}
const sig_1 = require("./sig");
// LSP CompletionItemKind subset.
const COMPLETION_FUNCTION = 3;
exports.COMPLETION_FUNCTION = COMPLETION_FUNCTION;
const COMPLETION_KEYWORD = 14;
exports.COMPLETION_KEYWORD = COMPLETION_KEYWORD;
// The built-in functions. Kept in sync with the engine by
// `lsp.test.ts`, which asserts each is recognised and no others are.
// The Go port derives its list from the engine's own name set
// (`BuiltinFuncNames`, go/func.go), which is why a name added there
// and forgotten here diverges silently — as `id` and `refer` did
// between G4 phases 1/2 and G8 phase 1.
const BUILTIN_FUNCS = [
    'above', 'acyclic', 'add', 'below', 'close', 'copy', 'deprecate', 'div',
    'each',
    'filter', 'greatest',
    'hide', 'inverse', 'join', 'key', 'least', 'length', 'list', 'lower',
    'map', 'match', 'max', 'min', 'mod', 'move', 'mul', 'must', 'neq', 'open',
    'pack', 'path', 'pick',
    'pref', 're', 'refer', 'rel', 'rem', 'sub', 'sum', 'super', 'type', 'unique',
    'upper',
];
exports.BUILTIN_FUNCS = BUILTIN_FUNCS;
// Scalar-kind and literal keywords.
// `number` is the numeric supertype; `integer`, `float`, `biginteger`
// and `bigdecimal` are its leaves. New leaves join this list as they land.
const KIND_KEYWORDS = [
    'string', 'number', 'integer', 'float', 'biginteger', 'bigdecimal', 'boolean',
];
// `_` joins these as of G8 phase 3: it is a literal of the language
// now, not text.
const LITERAL_KEYWORDS = ['_', 'true', 'false', 'null', 'top'];
// Context-free completion: the built-in functions, scalar-kind keywords
// and literals. Clients filter by the typed prefix.
function computeCompletions() {
    const out = [];
    for (const f of BUILTIN_FUNCS) {
        // The detail is the rendered SIGNATURE (docs/design/SIGNATURES.0.md)
        // -- the same renderer the hints and the docs table use, so the
        // completion list cannot drift from the declaration.
        out.push({ label: f, kind: COMPLETION_FUNCTION, detail: (0, sig_1.renderSig)(sig_1.funcSig[f]) });
    }
    for (const k of KIND_KEYWORDS) {
        out.push({ label: k, kind: COMPLETION_KEYWORD, detail: 'scalar kind' });
    }
    for (const k of LITERAL_KEYWORDS) {
        out.push({ label: k, kind: COMPLETION_KEYWORD, detail: 'keyword' });
    }
    return out;
}
// Transport-agnostic LSP message dispatcher. Consumes decoded JSON-RPC
// messages and returns the messages to send back, tracking open document
// text and recomputing diagnostics on open/change/close. Not safe for
// concurrent use; drive it from a single loop (as the stdio server does).
// A file:// uri's filesystem path, for the workspace-root confinement.
// Percent-decoded; a non-file uri (or none) yields undefined.
//
// EXPORTED, inline as contributionsMarkdown is: part of the reusable
// LSP library surface, and the twin of the package-visible uriToPath in
// go/lsp/handler.go. Anything driving this module with its own
// transport has to turn a client's uri into a path the same way the
// confinement does, and the rules below are not guessable from outside.
//
// THE DRIVE-LETTER SLASH. A file uri names an absolute path after the
// authority, so on Windows the standard spelling every editor sends is
// file:///C:/Users/me/project — three slashes, and the third belongs to
// the PATH. Stripping only `file://` leaves `/C:/Users/me/project`,
// which is not a Windows path at all, so the workspace-root
// confinement below compared real paths against nonsense and an editor
// on Windows got no confinement it could rely on. Both ports carried
// the defect identically (go/lsp/handler.go uriToPath), and no test
// caught it because both ports' tests built the uri as `'file://' +
// path` — two slashes, which is not what a client sends and which
// accidentally produced a usable path.
//
// The leading slash is dropped only before a DRIVE LETTER, so a POSIX
// path keeps the root it needs: file:///tmp/x stays /tmp/x.
function uriToPath(uri) {
    if ('string' !== typeof uri || !uri.startsWith('file://')) {
        return undefined;
    }
    const path = percentDecode(uri.slice('file://'.length));
    // AN EMPTY PATH IS NOT A ROOT. `file://` on its own yields '', and
    // '' is not nullish — so it won the `??` chain below and arrived as
    // `{ include: { root: '' } }`, a confinement root that then resolves
    // against the process working directory: the same client params made
    // the server allow or deny an include depending on where it was
    // started from. The Go twin never had it, because its chain tests
    // `"" != folder` explicitly (go/lsp/handler.go). Answering undefined
    // is what makes the two chains agree.
    if ('' === path) {
        return undefined;
    }
    return driveLetterPath(path) ? path.slice(1) : path;
}
// Percent-decoding that CANNOT THROW. `decodeURIComponent` raises a
// URIError on a malformed escape (`%ZZ`), and this runs on a uri a
// CLIENT sent — so a stray percent in a workspace path took the
// exception straight out of the initialize handler, where the Go twin
// swallowed the same failure and used the raw text
// (go/lsp/handler.go). Two ports, two behaviours, for an input neither
// of them controls.
//
// The agreement runs the other way for the SECOND way an escape can
// fail to decode. `%FF` is well-formed and names a raw byte — a
// perfectly good Linux filename — which Go produced and a JavaScript
// string cannot hold at all, so the ports derived different workspace
// roots for a uri a byte-oriented client really sends. Only one
// direction is reachable from both languages, so Go now declines to
// unescape a result that is not valid UTF-8 and both ports keep the
// raw text. An undecodable path is still a path, and refusing to serve
// a session over it helps nobody.
function percentDecode(text) {
    try {
        return decodeURIComponent(text);
    }
    catch {
        return text;
    }
}
// Whether p is `/X:…` for a drive letter X — the one shape whose
// leading slash is uri syntax rather than path. Mirrors the same
// predicate in go/lsp/handler.go.
function driveLetterPath(p) {
    return 3 <= p.length && '/' === p[0] && ':' === p[2] &&
        /[A-Za-z]/.test(p[1]);
}
class LspHandler {
    constructor() {
        this.docs = new Map();
        this.shutdownOK = false;
        this.exited = false;
        // The trust profile evaluation runs under (G5, docs/trust.md):
        // workspace-root confinement by default, set from the initialize
        // params. An `initializationOptions.aontu.trust.include` of 'system',
        // 'none' or { root } widens or narrows it explicitly. Undefined —
        // no workspace root and no explicit option — falls back to today's
        // unconfined behaviour, which single-file sessions rely on.
        this.trust = undefined;
        // Hover provenance (G7 phase 7): off unless an editor asks for it
        // with `initializationOptions.aontu.provenance`. It costs a second,
        // instrumented evaluation per hover, which is a cost to opt into.
        this.provenance = false;
    }
    // True once an `exit` notification has been received.
    get shouldExit() { return this.exited; }
    // Process exit code per the LSP spec: 0 if `shutdown` preceded `exit`,
    // else 1.
    get exitCode() { return this.shutdownOK ? 0 : 1; }
    // Current text of an open document, or undefined.
    doc(uri) { return this.docs.get(uri); }
    // Process one incoming message, returning zero or more to send.
    handle(msg) {
        switch (msg.method) {
            case 'initialize': {
                const params = msg.params ?? {};
                this.provenance =
                    true === params.initializationOptions?.aontu?.provenance;
                const explicit = params.initializationOptions?.aontu?.trust?.include;
                if (null != explicit) {
                    // An explicit setting wins — validated, and an unrecognised
                    // value confines to NOTHING rather than silently widening:
                    // deny is the safe reading of a setting the server does not
                    // understand. The same rule as the Go handler.
                    this.trust =
                        'system' === explicit ? undefined :
                            'none' === explicit ? { include: 'none' } :
                                ('string' === typeof explicit?.root && '' !== explicit.root)
                                    ? { include: { root: explicit.root } } :
                                    (null != explicit?.mem && 'object' === typeof explicit.mem)
                                        ? { include: { mem: explicit.mem } } :
                                        { include: 'none' };
                }
                else {
                    const root = uriToPath(params.workspaceFolders?.[0]?.uri)
                        ?? uriToPath(params.rootUri)
                        ?? (('string' === typeof params.rootPath && '' !== params.rootPath)
                            ? params.rootPath : undefined);
                    this.trust = null != root ? { include: { root } } : undefined;
                }
                return [{ jsonrpc: '2.0', id: msg.id, result: initializeResult() }];
            }
            case 'initialized':
                return [];
            case 'shutdown':
                this.shutdownOK = true;
                return [{ jsonrpc: '2.0', id: msg.id, result: null }];
            case 'exit':
                this.exited = true;
                return [];
            case 'textDocument/didOpen': {
                const td = msg.params?.textDocument;
                if (null == td?.uri)
                    return [];
                this.docs.set(td.uri, td.text ?? '');
                return [this.publish(td.uri)];
            }
            case 'textDocument/didChange': {
                const uri = msg.params?.textDocument?.uri;
                const changes = msg.params?.contentChanges;
                if (null == uri || !Array.isArray(changes) || 0 === changes.length)
                    return [];
                // Full document sync: the last change holds the entire new text.
                this.docs.set(uri, changes[changes.length - 1].text ?? '');
                return [this.publish(uri)];
            }
            case 'textDocument/didClose': {
                const uri = msg.params?.textDocument?.uri;
                if (null == uri)
                    return [];
                this.docs.delete(uri);
                // Clear diagnostics for the closed document.
                return [publishDiagnosticsMsg(uri, [])];
            }
            case 'textDocument/hover': {
                const uri = msg.params?.textDocument?.uri;
                const pos = msg.params?.position;
                const text = null != uri ? this.docs.get(uri) : undefined;
                const hover = (null != text && null != pos)
                    ? computeHover(text, pos, this.provenance, this.trust) : null;
                return [{ jsonrpc: '2.0', id: msg.id, result: hover }];
            }
            case 'textDocument/completion':
                return [{ jsonrpc: '2.0', id: msg.id, result: computeCompletions() }];
            case 'textDocument/signatureHelp': {
                const uri = msg.params?.textDocument?.uri;
                const pos = msg.params?.position;
                const text = null != uri ? this.docs.get(uri) : undefined;
                const help = (null != text && null != pos)
                    ? computeSignatureHelp(text, pos) : null;
                return [{ jsonrpc: '2.0', id: msg.id, result: help }];
            }
            default:
                // Unknown request (has an id): reply method-not-found. Unknown
                // notification: ignore.
                if (null != msg.id) {
                    return [{
                            jsonrpc: '2.0',
                            id: msg.id,
                            error: { code: -32601, message: 'method not found: ' + msg.method },
                        }];
                }
                return [];
        }
    }
    publish(uri) {
        return publishDiagnosticsMsg(uri, computeDiagnostics(this.docs.get(uri) ?? '', { trust: this.trust }));
    }
} /* node:coverage ignore next 28 */
exports.LspHandler = LspHandler;
//# sourceMappingURL=lsp.js.map