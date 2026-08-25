"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const lsp_1 = require("../dist/lsp");
const lsp_server_1 = require("../dist/lsp-server");
(0, node_test_1.describe)('lsp-diagnostics', () => {
    (0, node_test_1.test)('valid-documents-have-no-diagnostics', () => {
        for (const src of [
            'a:1 b:2',
            'a:string', // non-concrete schema is valid
            'a:{b:string, c:1}', // nested schema
            'a:1\nb:$.a', // resolving reference
            'x:{a:1} & {b:2}', // map merge
        ]) {
            Assert.equal((0, lsp_1.computeDiagnostics)(src).length, 0, src);
        }
    });
    (0, node_test_1.test)('conflict-position', () => {
        const d = (0, lsp_1.computeDiagnostics)('a:1\na:2');
        Assert.equal(d.length, 1);
        Assert.equal(d[0].severity, lsp_1.SEVERITY_ERROR);
        Assert.equal(d[0].code, 'scalar_value');
        Assert.equal(d[0].source, 'aontu');
        Assert.deepEqual(d[0].range.start, { line: 1, character: 2 });
        Assert.match(d[0].message, /Cannot unify value/);
    });
    (0, node_test_1.test)('unknown-function-position', () => {
        const d = (0, lsp_1.computeDiagnostics)('x:foo(1)');
        Assert.equal(d.length, 1);
        Assert.equal(d[0].code, 'unknown_function');
        Assert.deepEqual(d[0].range.start, { line: 0, character: 2 });
    });
    (0, node_test_1.test)('no-path-position', () => {
        const d = (0, lsp_1.computeDiagnostics)('a:$.missing');
        Assert.equal(d.length, 1);
        Assert.equal(d[0].code, 'no_path');
        Assert.deepEqual(d[0].range.start, { line: 0, character: 2 });
    });
    (0, node_test_1.test)('multibyte-column-utf16', () => {
        // A multi-byte rune before the error must not shift the column:
        // LSP characters are UTF-16 units, so "é" counts as 1.
        const d = (0, lsp_1.computeDiagnostics)('a:"é"\nb:1 b:2');
        Assert.equal(d.length, 1);
        Assert.deepEqual(d[0].range.start, { line: 1, character: 6 });
    });
});
(0, node_test_1.describe)('lsp-hover', () => {
    (0, node_test_1.test)('hover-scalar-shows-value-and-kind', () => {
        const h = (0, lsp_1.computeHover)('port: 8080', { line: 0, character: 7 });
        Assert.ok(h);
        Assert.match(h.contents.value, /8080/);
        Assert.match(h.contents.value, /integer/);
        Assert.deepEqual(h.range.start, { line: 0, character: 6 });
        Assert.deepEqual(h.range.end, { line: 0, character: 10 });
    });
    // A LITERAL WHOSE CANON IS NOT ITS SOURCE TEXT. `0x1F` renders as
    // canon `31`, and sizing the hover by canon underlined two characters
    // of a four-character literal: hovering the `0x` answered 6..8 and
    // hovering the `1F` answered NOTHING, because the span stopped before
    // the cursor. Measured on the code this replaces, at every column.
    //
    // Twin: TestHoverSpansTheWholeLiteral in go/lsp/hover_test.go. The
    // defect is status report §5's "Site is a point with no extent".
    (0, node_test_1.test)('hover-over-a-literal-whose-canon-is-shorter', () => {
        const src = 'port: 0x1F';
        for (const character of [6, 7, 8, 9]) {
            const h = (0, lsp_1.computeHover)(src, { line: 0, character });
            Assert.ok(h, `no hover at column ${character}`);
            Assert.deepEqual([h.range.start.character, h.range.end.character], [6, 10], `column ${character}`);
        }
    });
    (0, node_test_1.test)('hover-exact-leaves-show-their-own-kind', () => {
        // The `0d` leaves are their own kinds, not `integer`/`float`, and
        // the hover canon is the normalised one-rendering-per-value form.
        const bi = (0, lsp_1.computeHover)('n: 0d5', { line: 0, character: 4 });
        Assert.ok(bi);
        Assert.match(bi.contents.value, /0d5/);
        Assert.match(bi.contents.value, /biginteger/);
        const bd = (0, lsp_1.computeHover)('n: 0d1e3', { line: 0, character: 4 });
        Assert.ok(bd);
        Assert.match(bd.contents.value, /0d1000\.0/);
        Assert.match(bd.contents.value, /bigdecimal/);
    });
    (0, node_test_1.test)('hover-type', () => {
        const h = (0, lsp_1.computeHover)('a:{x:string}', { line: 0, character: 5 });
        Assert.ok(h);
        Assert.match(h.contents.value, /string/);
        Assert.match(h.contents.value, /type/);
    });
    (0, node_test_1.test)('hover-resolved-reference', () => {
        // b resolves to 1; hovering the definition shows the resolved value.
        const h = (0, lsp_1.computeHover)('a:1\nb:$.a', { line: 0, character: 2 });
        Assert.ok(h);
        Assert.match(h.contents.value, /1/);
    });
    (0, node_test_1.test)('hover-constraint', () => {
        // A constraint residual hovers as its canon with the shared kind
        // label "constraint" — never a constructor-name fallback (the Go
        // twin is TestHoverConstraint; identical hover-text contract).
        const h = (0, lsp_1.computeHover)('a:min(0)&max(10)', { line: 0, character: 3 });
        Assert.ok(h);
        Assert.match(h.contents.value, /min\(0\)&max\(10\)/);
        Assert.match(h.contents.value, /\*constraint\*/);
    });
    (0, node_test_1.test)('hover-miss-returns-null', () => {
        Assert.equal((0, lsp_1.computeHover)('port: 8080', { line: 5, character: 0 }), null);
    });
});
(0, node_test_1.describe)('lsp-completion', () => {
    (0, node_test_1.test)('completion-list', () => {
        const c = (0, lsp_1.computeCompletions)();
        Assert.equal(c.length, 40); // 28 funcs + 7 kinds + 5 literals
        const byLabel = new Map(c.map(i => [i.label, i]));
        Assert.equal(byLabel.get('upper')?.kind, lsp_1.COMPLETION_FUNCTION);
        Assert.equal(byLabel.get('string')?.kind, lsp_1.COMPLETION_KEYWORD);
        Assert.equal(byLabel.get('biginteger')?.kind, lsp_1.COMPLETION_KEYWORD);
        for (const want of ['close', 'upper', 'path', 'string', 'integer', 'float',
            'biginteger', 'bigdecimal', 'true', 'null', 'top']) {
            Assert.ok(byLabel.has(want), 'missing ' + want);
        }
    });
    (0, node_test_1.test)('builtin-funcs-match-engine', () => {
        // Drift guard: every BUILTIN_FUNCS name must be recognised by the
        // parser, and a bogus name must not be.
        Assert.equal(lsp_1.BUILTIN_FUNCS.length, 28);
        for (const name of lsp_1.BUILTIN_FUNCS) {
            const errs = (0, lsp_1.computeDiagnostics)('x:' + name + '(1)')
                .filter(d => d.code === 'unknown_function');
            Assert.equal(errs.length, 0, name + ' should be a known function');
        }
        const bogus = (0, lsp_1.computeDiagnostics)('x:notafunc(1)')
            .filter(d => d.code === 'unknown_function');
        Assert.equal(bogus.length, 1, 'bogus function should be unknown');
    });
});
// A REAL CLIENT'S URI, on both platforms. The three-slash form is what
// every editor sends: `file://` then the absolute path, whose own
// leading slash makes the third. On Windows that slash sits before the
// drive letter and is uri syntax, not path — and stripping only
// `file://` left `/C:/Users/…` for the workspace-root confinement to
// compare real paths against, so the confinement an editor on Windows
// relied on was never applied. Both ports carried it identically; both
// ports' tests hid it by building `'file://' + path`, two slashes,
// which no client sends and which happened to work. That two-slash
// form is kept below so the accident stays covered.
// The twin is TestUriToPathHandlesDriveLetters in go/lsp/lsp_test.go.
(0, node_test_1.describe)('lsp-uri-to-path', () => {
    (0, node_test_1.test)('lsp-uri-to-path-handles-drive-letters', () => {
        const cases = [
            ['file:///tmp/proj', '/tmp/proj'],
            ['file:///C:/Users/me/proj', 'C:/Users/me/proj'],
            ['file:///c%3A/Users/me/proj', 'c:/Users/me/proj'],
            ['file://C:/Users/me/proj', 'C:/Users/me/proj'],
            ['file:///', '/'],
            // NOT a drive letter: the slash stays, because a single-letter
            // directory is an ordinary POSIX path.
            ['file:///C/Users', '/C/Users'],
            ['file:///1:/x', '/1:/x'],
            ['http://example.com/x', undefined],
            ['', undefined],
            // `file://` alone is no path at all, and must not become a
            // confinement root of '' — see uriToPath's own note. The Go twin
            // answers "" and its caller tests for it; here the caller chains
            // with `??`, which '' would survive.
            ['file://', undefined],
            // AN ESCAPE THAT DOES NOT DECODE TO TEXT IS LEFT ALONE, and
            // there are two ways to fail. `%ZZ` is malformed, and
            // decodeURIComponent THREW a URIError on it — out of the
            // initialize handler, on a uri the CLIENT chose — where the Go
            // twin swallowed the failure and used the raw text. `%FF` is
            // well-formed and decodes to a raw byte: a perfectly good Linux
            // filename that a JavaScript string cannot hold, so this port
            // refuses it while Go used to accept it, and the two derived
            // DIFFERENT workspace roots for a uri a byte-oriented client
            // really sends (neovim percent-encodes path bytes). They agree
            // on both classes now, and both are pinned so neither drifts.
            ['file:///%ZZ/x', '/%ZZ/x'],
            ['file:///C:/%ZZ', 'C:/%ZZ'],
            ['file:///tmp/%FF', '/tmp/%FF'],
            ['file:///tmp/%e9', '/tmp/%e9'],
            // A well-formed escape that IS text still decodes.
            ['file:///tmp/%C3%A9', '/tmp/\u00e9'],
            ['file:///C%3A/x', 'C:/x'],
        ];
        for (const [uri, want] of cases) {
            Assert.equal((0, lsp_1.uriToPath)(uri), want, uri);
        }
        // Not a string at all: the handler passes whatever the client sent.
        Assert.equal((0, lsp_1.uriToPath)(undefined), undefined);
        Assert.equal((0, lsp_1.uriToPath)(42), undefined);
    });
});
(0, node_test_1.describe)('lsp-handler', () => {
    (0, node_test_1.test)('initialize-advertises-hover-and-completion', () => {
        const h = new lsp_1.LspHandler();
        const outs = h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        Assert.equal(outs[0].result.capabilities.hoverProvider, true);
        Assert.ok(outs[0].result.capabilities.completionProvider);
    });
    (0, node_test_1.test)('handler-hover-and-completion', () => {
        const h = new lsp_1.LspHandler();
        h.handle({
            method: 'textDocument/didOpen',
            params: { textDocument: { uri: 'file:///t.aontu', text: 'port: 8080' } },
        });
        const hov = h.handle({
            id: 5, method: 'textDocument/hover',
            params: { textDocument: { uri: 'file:///t.aontu' }, position: { line: 0, character: 7 } },
        });
        Assert.match(hov[0].result.contents.value, /8080/);
        const comp = h.handle({ id: 6, method: 'textDocument/completion', params: {} });
        Assert.equal(comp[0].result.length, 40);
    });
    (0, node_test_1.test)('initialize-advertises-capabilities', () => {
        const h = new lsp_1.LspHandler();
        const outs = h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        Assert.equal(outs.length, 1);
        Assert.equal(outs[0].id, 1);
        Assert.equal(outs[0].result.capabilities.textDocumentSync, 1);
        Assert.equal(outs[0].result.serverInfo.name, 'aontu-lsp');
    });
    (0, node_test_1.test)('didOpen-publishes-diagnostics', () => {
        const h = new lsp_1.LspHandler();
        const outs = h.handle({
            jsonrpc: '2.0',
            method: 'textDocument/didOpen',
            params: { textDocument: { uri: 'file:///t.aontu', text: 'a:1 a:2' } },
        });
        Assert.equal(outs.length, 1);
        Assert.equal(outs[0].method, 'textDocument/publishDiagnostics');
        Assert.equal(outs[0].params.uri, 'file:///t.aontu');
        Assert.equal(outs[0].params.diagnostics.length, 1);
        Assert.equal(h.doc('file:///t.aontu'), 'a:1 a:2');
    });
    (0, node_test_1.test)('didChange-then-didClose', () => {
        const h = new lsp_1.LspHandler();
        h.handle({
            method: 'textDocument/didOpen',
            params: { textDocument: { uri: 'file:///t.aontu', text: 'a:1 a:2' } },
        });
        // Fix the conflict -> diagnostics clear.
        const changed = h.handle({
            method: 'textDocument/didChange',
            params: {
                textDocument: { uri: 'file:///t.aontu' },
                contentChanges: [{ text: 'a:1 b:2' }],
            },
        });
        Assert.equal(changed[0].params.diagnostics.length, 0);
        // Close -> empty diagnostics and untracked.
        const closed = h.handle({
            method: 'textDocument/didClose',
            params: { textDocument: { uri: 'file:///t.aontu' } },
        });
        Assert.equal(closed[0].method, 'textDocument/publishDiagnostics');
        Assert.equal(closed[0].params.diagnostics.length, 0);
        Assert.equal(h.doc('file:///t.aontu'), undefined);
    });
    (0, node_test_1.test)('shutdown-then-exit-code-0', () => {
        const h = new lsp_1.LspHandler();
        Assert.equal(h.shouldExit, false);
        h.handle({ id: 9, method: 'shutdown' });
        const outs = h.handle({ method: 'exit' });
        Assert.equal(outs.length, 0);
        Assert.equal(h.shouldExit, true);
        Assert.equal(h.exitCode, 0);
    });
    (0, node_test_1.test)('exit-without-shutdown-code-1', () => {
        const h = new lsp_1.LspHandler();
        h.handle({ method: 'exit' });
        Assert.equal(h.exitCode, 1);
    });
    (0, node_test_1.test)('unknown-request-is-method-not-found', () => {
        const h = new lsp_1.LspHandler();
        const outs = h.handle({ id: 3, method: 'textDocument/definition' });
        Assert.equal(outs.length, 1);
        Assert.equal(outs[0].error?.code, -32601);
        // Unknown notification (no id) is ignored.
        Assert.equal(h.handle({ method: '$/setTrace' }).length, 0);
    });
});
(0, node_test_1.describe)('lsp-server-framing', () => {
    function frame(payload) {
        const body = Buffer.from(payload, 'utf8');
        return Buffer.concat([
            Buffer.from('Content-Length: ' + body.length + '\r\n\r\n', 'ascii'),
            body,
        ]);
    }
    function parseFrames(buf) {
        const out = [];
        let rest = buf;
        for (;;) {
            const headerEnd = rest.indexOf('\r\n\r\n');
            if (headerEnd < 0)
                break;
            const header = rest.subarray(0, headerEnd).toString('ascii');
            const m = /Content-Length:\s*(\d+)/i.exec(header);
            if (null == m)
                break;
            const len = parseInt(m[1], 10);
            const start = headerEnd + 4;
            const body = rest.subarray(start, start + len).toString('utf8');
            out.push(JSON.parse(body));
            rest = rest.subarray(start + len);
        }
        return out;
    }
    (0, node_test_1.test)('round-trip-over-frame-codec', () => {
        const h = new lsp_1.LspHandler();
        const written = [];
        let exitCode = -1;
        const codec = new lsp_server_1.FrameCodec(h, (c) => written.push(c), (code) => { exitCode = code; });
        codec.push(frame('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'));
        codec.push(frame('{"jsonrpc":"2.0","method":"initialized","params":{}}'));
        codec.push(frame('{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///x.aontu","text":"a:1 a:2"}}}'));
        codec.push(frame('{"jsonrpc":"2.0","id":2,"method":"shutdown"}'));
        codec.push(frame('{"jsonrpc":"2.0","method":"exit"}'));
        const msgs = parseFrames(Buffer.concat(written));
        Assert.equal(msgs.length, 3);
        Assert.equal(msgs[0].id, 1);
        Assert.equal(msgs[0].result.serverInfo.name, 'aontu-lsp');
        Assert.equal(msgs[1].method, 'textDocument/publishDiagnostics');
        Assert.equal(msgs[1].params.diagnostics.length, 1);
        Assert.equal(msgs[2].id, 2);
        Assert.equal(msgs[2].result, null);
        Assert.equal(exitCode, 0);
    });
    (0, node_test_1.test)('split-frame-across-chunks', () => {
        const h = new lsp_1.LspHandler();
        const written = [];
        const codec = new lsp_server_1.FrameCodec(h, (c) => written.push(c), () => { });
        const f = frame('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
        // Deliver the frame one byte at a time.
        for (const byte of f) {
            codec.push(Buffer.from([byte]));
        }
        const msgs = parseFrames(Buffer.concat(written));
        Assert.equal(msgs.length, 1);
        Assert.equal(msgs[0].id, 1);
    });
});
// Context-recorded errors that never land in the tree — a
// budget_passes exhaustion nil is about the whole evaluation, not any
// node — must still surface as diagnostics (docs/trust.md clause 2:
// exhaustion is never silent). The Go twin is TestCheckSurfacesCtxErrors
// in go/hints_test.go.
(0, node_test_1.describe)('lsp-diagnostics-ctx-errors', () => {
    (0, node_test_1.test)('budget-passes-surfaces', () => {
        const chain = 'a:$.b b:$.c c:$.d d:$.e e:$.f f:$.g g:$.h h:$.i i:$.j j:$.k k:1';
        const ds = (0, lsp_1.computeDiagnostics)(chain);
        Assert.ok(ds.some((d) => 'budget_passes' === d.code), 'expected a budget_passes diagnostic, got: ' +
            JSON.stringify(ds.map((d) => d.code)));
    });
    (0, node_test_1.test)('stable-residue-stays-quiet', () => {
        // A stuck operator is incompleteness, not exhaustion: no
        // budget_passes diagnostic (generation-time residue reporting is
        // unchanged).
        const ds = (0, lsp_1.computeDiagnostics)('x:1+true');
        Assert.ok(!ds.some((d) => 'budget_passes' === d.code), 'stable residue must not report budget_passes');
    });
});
// G3 phase 4: the deprecation mark's LSP surface — the native
// Deprecated tag (2) at Hint severity, on the declaration and on every
// use resolving through the value. The Go twin is in
// go/lsp/lsp_test.go (TestDiagnosticsDeprecated).
(0, node_test_1.describe)('lsp-deprecated', () => {
    (0, node_test_1.test)('deprecated-values-carry-the-tag', () => {
        const d = (0, lsp_1.computeDiagnostics)('p:deprecate(8080,{msg:"renamed",use:"$.listen",since:"2.0.0"})\nq:$.p');
        const tagged = d.filter((x) => 'deprecated' === x.code);
        Assert.equal(tagged.length, 2);
        for (const t of tagged) {
            Assert.equal(t.severity, 4);
            Assert.deepEqual(t.tags, [2]);
            Assert.match(t.message, /renamed/);
            Assert.match(t.message, /use \$\.listen/);
            Assert.match(t.message, /since 2\.0\.0/);
        }
    });
    (0, node_test_1.test)('undeprecated-documents-carry-no-tag', () => {
        const d = (0, lsp_1.computeDiagnostics)('a:1');
        Assert.equal(d.filter((x) => 'deprecated' === x.code).length, 0);
    });
});
(0, node_test_1.describe)('lsp-hover-provenance', () => {
    // HOVER PROVENANCE (G7 phase 7) is config-gated and off by default:
    // the contributions that met at the hovered path, appended to the
    // value's own hover. The markdown is byte-identical to the Go
    // port's, which was diffed before this was written.
    (0, node_test_1.test)('hover-provenance-is-off-until-asked-for', () => {
        const src = 'services: {\n  &: { replicas: *1 | integer }\n' +
            '  auth: { replicas: 3 }\n}';
        const pos = { line: 2, character: 20 };
        const off = (0, lsp_1.computeHover)(src, pos);
        Assert.doesNotMatch(off.contents.value, /Contributions/);
        const on = (0, lsp_1.computeHover)(src, pos, true);
        Assert.match(on.contents.value, /Contributions:/);
        Assert.match(on.contents.value, /`\*1\|integer` — spread \(2:18\)/);
        Assert.match(on.contents.value, /`3` — literal \(3:21\)/);
        // A value with NO path — the whole document — has no
        // contributions to name, and the hover is unchanged rather than
        // decorated with an empty section.
        const bare = (0, lsp_1.computeHover)('42', { line: 0, character: 1 }, true);
        Assert.doesNotMatch(bare.contents.value, /Contributions/);
        // A document with an error ELSEWHERE still hovers, while `why`
        // refuses it: the hover keeps its value and gains no section.
        const broken = (0, lsp_1.computeHover)('a: 1\nb: 2 & "x"', { line: 0, character: 3 }, true);
        Assert.match(broken.contents.value, /1/);
        Assert.doesNotMatch(broken.contents.value, /Contributions/);
    });
    // The two shapes the record allows and no hover produces: a
    // contribution with no site, and one whose site names a file.
    (0, node_test_1.test)('contributions-markdown-renders-every-site-shape', () => {
        Assert.equal((0, lsp_1.contributionsMarkdown)([]), '');
        Assert.equal((0, lsp_1.contributionsMarkdown)([
            { canon: '1', role: 'literal', site: { col: -1, file: '', row: -1 } },
            { canon: 'integer', role: 'spread', site: { col: 3, file: 'x.aon', row: 2 } },
        ]), '\n\n---\n\nContributions:\n' +
            '- `1` — literal\n- `integer` — spread (x.aon:2:3)');
    });
    // The opt-in reaches the handler through initialize.
    (0, node_test_1.test)('the-handler-reads-the-opt-in', () => {
        const on = new lsp_1.LspHandler();
        on.handle({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { initializationOptions: { aontu: { provenance: true } } },
        });
        on.handle({
            jsonrpc: '2.0', method: 'textDocument/didOpen',
            params: {
                textDocument: {
                    uri: 'file:///p.aon', text: 'a: 1\na: integer', version: 1,
                },
            },
        });
        const hover = on.handle({
            jsonrpc: '2.0', id: 2, method: 'textDocument/hover',
            params: {
                textDocument: { uri: 'file:///p.aon' },
                position: { line: 0, character: 3 },
            },
        })[0];
        Assert.match(hover.result.contents.value, /Contributions:/);
        const off = new lsp_1.LspHandler();
        off.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        off.handle({
            jsonrpc: '2.0', method: 'textDocument/didOpen',
            params: {
                textDocument: {
                    uri: 'file:///p.aon', text: 'a: 1\na: integer', version: 1,
                },
            },
        });
        const plain = off.handle({
            jsonrpc: '2.0', id: 2, method: 'textDocument/hover',
            params: {
                textDocument: { uri: 'file:///p.aon' },
                position: { line: 0, character: 3 },
            },
        })[0];
        Assert.doesNotMatch(plain.result.contents.value, /Contributions/);
    });
});
//# sourceMappingURL=lsp.test.js.map