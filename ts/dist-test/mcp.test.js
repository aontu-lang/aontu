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
// The MCP tool library and its stdio wiring (G7 phase 6, completed to
// the full CLI verb surface by the use-case review's MCP
// recommendation). The tools return the SAME contracts the CLI prints
// — vet's report, get's slice, why's record, diff's changes, the
// subsume/breaking verdicts, patch's overlay — so what is asserted
// here is the protocol around them, not the verbs, which the shared
// suite already pins in both ports. The exceptions are the served
// confinement (every tool, both trust postures) and the --root path
// capability, which exist only here.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const node_stream_1 = require("node:stream");
const node_child_process_1 = require("node:child_process");
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const mcp_1 = require("../dist/mcp");
const mcp_server_1 = require("../dist/mcp-server");
const srcpath_1 = require("./srcpath");
const ALL_TOOLS = [
    'breaking', 'canon', 'diff', 'get', 'hash', 'jsonschema',
    'reaches', 'relations',
    'set', 'subsume', 'summary', 'trim', 'vet', 'view', 'why',
];
// The text payload of a tool result, decoded.
function payload(result) {
    return JSON.parse(result.content[0].text);
}
// A scratch directory holding the named files.
function scratchDir(prefix, files) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), prefix));
    for (const [name, text] of Object.entries(files ?? {})) {
        Fs.writeFileSync(Path.join(dir, name), text);
    }
    return dir;
}
// A canary module: evaluating an include of it writes the canary
// file, which is exactly what a confined evaluation must never do.
function hostileModule(dir) {
    const canary = Path.join(dir, 'canary.txt');
    const mod = Path.join(dir, 'mod.js');
    Fs.writeFileSync(mod, `require('fs').writeFileSync(${JSON.stringify(canary)},'x')\n` +
        'module.exports = {a:1}\n');
    return { canary, hostile: `a: @"${mod.replace(/\\/g, '/')}"` };
}
(0, node_test_1.describe)('mcp', () => {
    (0, node_test_1.test)('initialize-and-list', () => {
        const init = (0, mcp_1.handle)({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, '9.9.9');
        Assert.equal(init.result.protocolVersion, mcp_1.MCP_PROTOCOL);
        Assert.equal(init.result.serverInfo.name, 'aontu');
        Assert.equal(init.result.serverInfo.version, '9.9.9');
        Assert.deepEqual(init.result.capabilities, { tools: {} });
        // The handshake says which confinement mode the server is in:
        // without a root, path arguments are refused and the client is
        // told how to enable them.
        Assert.match(init.result.instructions, /--root <dir>/);
        Assert.equal(init.result.instructions, (0, mcp_1.serverInstructions)());
        const list = (0, mcp_1.handle)({ id: 2, method: 'tools/list' }, '9.9.9');
        Assert.deepEqual(list.result.tools.map((t) => t.name).sort(), ALL_TOOLS);
        // Every tool declares its arguments, and every required argument
        // is one of them: a schema that asks for what it does not describe
        // is a schema no client can satisfy. Both postures.
        for (const tools of [(0, mcp_1.toolList)(), (0, mcp_1.toolList)('/tmp')]) {
            for (const t of tools) {
                Assert.equal(t.inputSchema.type, 'object');
                for (const req of t.inputSchema.required) {
                    Assert.ok(null != t.inputSchema.properties[req], `${t.name}: ${req}`);
                }
            }
        }
        // WITHOUT a root the file alternatives are not advertised — a
        // client cannot use them. WITH one, every document property gains
        // its `<name>Path` twin and comes off `required` (JSON Schema
        // cannot say "one of the two"; the tool's own check still refuses
        // a call with neither).
        const bare = (0, mcp_1.toolList)().find((t) => 'vet' === t.name);
        Assert.equal(bare.inputSchema.properties.schemaPath, undefined);
        Assert.deepEqual(bare.inputSchema.required, ['schema', 'data']);
        const rooted = (0, mcp_1.toolList)('/tmp').find((t) => 'vet' === t.name);
        Assert.equal(rooted.inputSchema.properties.schemaPath.type, 'string');
        Assert.equal(rooted.inputSchema.properties.dataPath.type, 'string');
        Assert.deepEqual(rooted.inputSchema.required, []);
        // A non-document argument stays required either way.
        const g = (0, mcp_1.toolList)('/tmp').find((t) => 'get' === t.name);
        Assert.deepEqual(g.inputSchema.required, ['path']);
        Assert.deepEqual((0, mcp_1.handle)({ id: 3, method: 'ping' }, '9.9.9')?.result, {});
    });
    // A NOTIFICATION has no id, and answering one is a protocol error in
    // the other direction.
    (0, node_test_1.test)('notifications-get-no-answer', () => {
        Assert.equal((0, mcp_1.handle)({ jsonrpc: '2.0', method: 'notifications/initialized' }, '1'), undefined);
    });
    (0, node_test_1.test)('every-tool-answers-its-own-report', () => {
        const v = payload((0, mcp_1.callTool)('vet', { schema: 'a: integer', data: 'a: "x"' }));
        Assert.equal(v.verdict, 'invalid');
        Assert.equal(v.findings[0].code, 'no_scalar_unify');
        Assert.equal(payload((0, mcp_1.callTool)('get', { src: 'a: {b: 1}', path: '$.a', view: 'canon' })).out, '{"b":1}');
        Assert.equal(payload((0, mcp_1.callTool)('get', { src: 'a: {b: 1}', path: '$', view: 'types', depth: 2 })).out, '{"a":{"b":top}}');
        const w = payload((0, mcp_1.callTool)('why', { src: 'a: 1\na: integer', path: '$.a' }));
        Assert.equal(w.record.value, '1');
        Assert.equal(w.record.conjuncts.length, 2);
        const d = payload((0, mcp_1.callTool)('diff', { left: 'a: 1', right: 'a: 2' }));
        Assert.equal(d.same, false);
        Assert.equal(d.changes[0].path, '$.a');
        // The optional arguments: `at` on vet and on diff.
        Assert.equal(payload((0, mcp_1.callTool)('vet', { schema: 'a: {b: integer}', data: 'b: 1', at: '$.a' })).verdict, 'valid');
        Assert.equal(payload((0, mcp_1.callTool)('diff', { left: 'a: {b: 1}', right: 'a: {b: 2}', at: '$.a' })).changes[0].path, '$.b');
        // An argument of the wrong TYPE is read as absent rather than
        // coerced: a client that sends a number for a path gets the empty
        // path, which is the root — the same answer as sending nothing.
        Assert.equal(payload((0, mcp_1.callTool)('diff', { left: 'a: 1', right: 'a: 1', at: 7 })).same, true);
        Assert.equal(payload((0, mcp_1.callTool)('canon', { src: 'a: 1.0' })).canon, '{"a":1.0}');
        const s = payload((0, mcp_1.callTool)('summary', { src: 'b: 2\na: 1' }));
        Assert.match(s.hash, /^aon1-/);
        Assert.deepEqual(s.keys, ['a', 'b']);
        Assert.equal(s.shape, '{"a":integer,"b":integer}');
        // A document whose root is NOT a map has no root keys, which is a
        // true summary rather than an error.
        const list = payload((0, mcp_1.callTool)('summary', { src: '[1,2]' }));
        Assert.equal(list.ok, true);
        Assert.deepEqual(list.keys, []);
    });
    // A tool that REFUSES is not a protocol error: the report IS the
    // answer. `isError` is for a call that could not be made at all.
    (0, node_test_1.test)('a-refusal-is-an-answer-not-a-protocol-error', () => {
        const r = (0, mcp_1.callTool)('get', { src: 'a: 1', path: '$.zz' });
        Assert.equal(r.isError, false);
        Assert.equal(payload(r).ok, false);
        Assert.equal(payload(r).findings[0].code, 'no_path');
        const broken = (0, mcp_1.callTool)('canon', { src: 'a:]' });
        Assert.equal(broken.isError, false);
        Assert.equal(payload(broken).ok, false);
        const bsum = (0, mcp_1.callTool)('summary', { src: 'a:1 a:2' });
        Assert.equal(payload(bsum).ok, false);
        // A missing tool, or a missing required argument, IS one — and a
        // call with no argument object at all is the same call as one
        // with an empty one.
        Assert.equal((0, mcp_1.callTool)('nope', {}).isError, true);
        Assert.equal((0, mcp_1.callTool)('get', { src: 'a:1' }).isError, true);
        Assert.equal((0, mcp_1.callTool)('vet', {}).isError, true);
        Assert.equal((0, mcp_1.callTool)('canon', undefined).isError, true);
    });
    (0, node_test_1.test)('served-evaluation-is-confined', () => {
        // A served document may not reach the filesystem: text arrives
        // from a caller, and an include is exactly what a server must not
        // run unconfined (G5).
        const r = payload((0, mcp_1.callTool)('canon', { src: 'a: @"/etc/passwd"' }));
        Assert.equal(r.ok, false);
        Assert.equal(r.findings[0].code, 'include_denied');
    });
    // EVERY tool, not one of them. This test exists because the version
    // above it -- which asserted `canon` alone -- passed for weeks while
    // four of the six original tools evaluated caller source with NO
    // trust profile, so `@"x.js"` was require()d in the server process.
    // One tool proving itself confined says nothing about its siblings.
    //
    // The table is derived from the LIVE tool list rather than written
    // out, so a tool added later is covered the day it is added, and the
    // assertion is on the security property itself (the module was not
    // executed) rather than on any one report's wording, which differs
    // per tool: vet answers a broken schema with verdict `error`, where
    // canon names `include_denied`.
    //
    // BOTH POSTURES: without a root every include is denied outright;
    // with one, the hostile module sits OUTSIDE the root, so the root
    // capability must deny it too.
    (0, node_test_1.test)('every-tool-is-confined', () => {
        const dir = scratchDir('aontu-mcp-trust-');
        const { canary, hostile } = hostileModule(dir);
        const root = scratchDir('aontu-mcp-trust-root-');
        for (const opts of [undefined, { root }]) {
            for (const t of (0, mcp_1.toolList)()) {
                const args = {};
                for (const req of t.inputSchema.required) {
                    // A path argument must stay a path, and a structured
                    // argument keeps its shape — with the hostile document as
                    // the assignment VALUE, which is appended into the overlay
                    // and must be confined there too. Every other required
                    // string is a document, and gets the hostile one.
                    args[req] = 'path' === req ? '$'
                        : 'array' === t.inputSchema.properties[req].type
                            ? [{ path: '$.a', value: hostile }]
                            : hostile;
                }
                if (Fs.existsSync(canary))
                    Fs.unlinkSync(canary);
                const r = (0, mcp_1.callTool)(t.name, args, opts);
                Assert.equal(Fs.existsSync(canary), false, `tool ${t.name} EXECUTED a caller-supplied module` +
                    (null == opts ? '' : ' (root posture)'));
                // And it answered rather than throwing the call away.
                Assert.equal(r.isError, false, `tool ${t.name} failed to answer`);
            }
        }
    });
    // The SHIPPED binary, spawned as a client would run it. The
    // in-process tests above prove the library confines; this proves the
    // thing in `bin/` does, which is what an operator actually runs and
    // what the npm package installs.
    (0, node_test_1.test)('spawned-server-is-confined', () => {
        const dir = scratchDir('aontu-mcp-spawn-');
        const { canary, hostile } = hostileModule(dir);
        const bin = Path.join(__dirname, '..', 'bin', 'aontu-mcp.js');
        const lines = [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            {
                jsonrpc: '2.0', id: 2, method: 'tools/call',
                params: { name: 'canon', arguments: { src: hostile } },
            },
        ].map((m) => JSON.stringify(m)).join('\n') + '\n';
        const out = (0, node_child_process_1.execFileSync)('node', [bin], {
            input: lines, encoding: 'utf8',
        });
        Assert.equal(Fs.existsSync(canary), false, 'the spawned server EXECUTED a caller-supplied module');
        // It still answered both messages.
        const answers = out.trim().split('\n').map((l) => JSON.parse(l));
        Assert.equal(answers.length, 2);
        Assert.equal(answers[1].id, 2);
        Assert.ok(JSON.stringify(answers[1]).includes('include_denied'));
    });
    // ------------------------------------------------------------------
    // The evolution and change verbs (the use-case review's "MCP is a
    // read-only subset" recommendation).
    (0, node_test_1.test)('subsume-answers-the-cli-report', () => {
        Assert.deepEqual(payload((0, mcp_1.callTool)('subsume', { general: 'a: integer', specific: 'a: 1' })), { verdict: 'subsumes', findings: [] });
        // A narrowing has a witness, sited with the default provenance
        // labels when the documents arrived as inline text.
        const no = payload((0, mcp_1.callTool)('subsume', { general: 'a: 1', specific: 'a: 2' }));
        Assert.equal(no.verdict, 'does_not_subsume');
        Assert.equal(no.findings[0].class, 'compat');
        Assert.equal(no.findings[0].path, '$.a');
        Assert.ok(no.findings[0].sites.some((s) => 'general' === s.file));
        // The optional arguments: at anchors both sides, profile selects
        // the comparison.
        Assert.equal(payload((0, mcp_1.callTool)('subsume', {
            general: 'q: {a: integer}', specific: 'q: {a: 1}', at: '$.q',
        })).verdict, 'subsumes');
        Assert.equal(payload((0, mcp_1.callTool)('subsume', {
            general: 'a: *1 | integer', specific: 'a: *2 | integer',
            profile: 'values',
        })).verdict, 'subsumes');
        // A bad profile is a call that could not be made.
        Assert.equal((0, mcp_1.callTool)('subsume', { general: 'a:1', specific: 'a:1', profile: 'zag' }).isError, true);
        // A document the served profile cannot read is REFUSED with the
        // engine's own error verdict — and the pre-parse finding, which
        // the engine's bare `{verdict:'error'}` answer lacks.
        const denied = payload((0, mcp_1.callTool)('subsume', { general: 'a: @"/etc/passwd"', specific: 'a: 1' }));
        Assert.equal(denied.verdict, 'error');
        Assert.equal(denied.findings[0].code, 'include_denied');
        // A document that parses but does not stand up reaches the engine
        // and gets ITS answer (no findings: subsume's own load failure).
        Assert.deepEqual(payload((0, mcp_1.callTool)('subsume', { general: 'a: 1 & 2', specific: 'a: 1' })), { verdict: 'error', findings: [] });
    });
    (0, node_test_1.test)('breaking-wraps-subsume-with-the-cli-policy', () => {
        // The default mode is backward: every old instance must still be
        // admitted by the new document (cli.ts runBreaking's rule).
        Assert.deepEqual(payload((0, mcp_1.callTool)('breaking', { old: 'a: 1', new: 'a: 1' })), { verdict: 'compatible', mode: 'backward', findings: [] });
        const b = payload((0, mcp_1.callTool)('breaking', { old: 'a: 5', new: 'a: integer & min(10)' }));
        Assert.equal(b.verdict, 'breaking');
        Assert.equal(b.mode, 'backward');
        Assert.equal(b.findings[0].class, 'compat');
        // full checks both directions; a: 1 -> a: 1|2 widens (backward
        // holds) but the old document does not admit the new one.
        const full = payload((0, mcp_1.callTool)('breaking', { old: 'a: 1', new: 'a: 1|2', mode: 'full' }));
        Assert.equal(full.verdict, 'breaking');
        Assert.equal(full.mode, 'full');
        // THE DOCUMENT'S OWN POLICY: $.aontu_policy.compat — a plain
        // string, a preferred disjunct, or a disjunction whose first
        // member decides. The mode argument overrides it; nothing means
        // backward.
        Assert.deepEqual(payload((0, mcp_1.callTool)('breaking', {
            old: 'a: 5', new: 'aontu_policy: compat: "none"\na: min(10)',
        })), { verdict: 'compatible', mode: 'none', findings: [] });
        Assert.equal(payload((0, mcp_1.callTool)('breaking', {
            old: 'a: {b: 1}',
            new: 'aontu_policy: compat: *"forward" | "backward"\na: {b: 1, c: 2}',
        })).mode, 'forward');
        Assert.equal(payload((0, mcp_1.callTool)('breaking', {
            old: 'a: 1', new: 'aontu_policy: compat: "backward"|"full"\na: 1',
        })).mode, 'backward');
        // A policy that does not spell a mode declares nothing — a wrong
        // word and a wrong kind both.
        Assert.equal(payload((0, mcp_1.callTool)('breaking', {
            old: 'a: 1', new: 'aontu_policy: compat: "sideways"\na: 1',
        })).mode, 'backward');
        Assert.equal(payload((0, mcp_1.callTool)('breaking', {
            old: 'a: 1', new: 'aontu_policy: compat: 42\na: 1',
        })).mode, 'backward');
        // The mode ARGUMENT wins over the policy.
        Assert.equal(payload((0, mcp_1.callTool)('breaking', {
            old: 'a: 5', new: 'aontu_policy: compat: "none"\na: min(10)',
            mode: 'backward',
        })).verdict, 'breaking');
        // A new version that parses but does not stand up: the policy
        // read fails quietly (mode backward), and subsume answers error.
        Assert.deepEqual(payload((0, mcp_1.callTool)('breaking', { old: 'a: 1', new: 'a: 1 & 2' })), { verdict: 'error', mode: 'backward', findings: [] });
        // A bad mode is a call that could not be made.
        Assert.equal((0, mcp_1.callTool)('breaking', { old: 'a:1', new: 'a:1', mode: 'zig' }).isError, true);
        // A document the served profile cannot read is refused, with the
        // mode the policy logic could still establish.
        const denied = payload((0, mcp_1.callTool)('breaking', { old: 'a: @"/etc/passwd"', new: 'a: 1' }));
        Assert.equal(denied.verdict, 'error');
        Assert.equal(denied.mode, 'backward');
        Assert.equal(denied.findings[0].code, 'include_denied');
    });
    (0, node_test_1.test)('set-returns-the-new-overlay-and-never-writes', () => {
        // Append: the report carries the NEW OVERLAY TEXT — the server
        // owns no files, so the caller owns the write.
        const r = payload((0, mcp_1.callTool)('set', {
            entry: 'a: integer', overlay: '',
            assignments: [{ path: '$.a', value: '1' }],
        }));
        Assert.equal(r.verdict, 'valid');
        Assert.equal(r.overlay, '"a": 1\n');
        Assert.deepEqual(r.appended, ['"a": 1']);
        Assert.deepEqual(r.replaced, []);
        // A pinned value refuses, and the refusal is the vet report.
        const pinned = payload((0, mcp_1.callTool)('set', {
            entry: 'a: 1', overlay: '',
            assignments: [{ path: '$.a', value: '2' }],
        }));
        Assert.equal(pinned.verdict, 'invalid');
        Assert.ok(0 < pinned.findings.length);
        // In place: the pinning literal is rewritten where it was written.
        const rip = payload((0, mcp_1.callTool)('set', {
            entry: 'a: integer', overlay: 'a: 2\n',
            assignments: [{ path: '$.a', value: '3' }],
            inPlace: true,
        }));
        Assert.equal(rip.verdict, 'valid');
        Assert.equal(rip.overlay, 'a: 3\n');
        Assert.equal(rip.replaced[0].from, '2');
        Assert.equal(rip.replaced[0].to, '3');
        // The assignment list is structured, and a malformed one is a
        // call that could not be made: empty, a missing half, a path that
        // would move the `<path>=<value>` split, or not a list at all.
        Assert.equal((0, mcp_1.callTool)('set', { entry: 'a:1', overlay: '', assignments: [] }).isError, true);
        Assert.equal((0, mcp_1.callTool)('set', { entry: 'a:1', overlay: '', assignments: [{ path: '$.a' }] }).isError, true);
        Assert.equal((0, mcp_1.callTool)('set', {
            entry: 'a:1', overlay: '',
            assignments: [{ path: 'a=b', value: '1' }],
        }).isError, true);
        Assert.equal((0, mcp_1.callTool)('set', { entry: 'a:1', overlay: '', assignments: 'x' }).isError, true);
        // AN ASSIGNMENT VALUE IS A DOCUMENT TOO: it is appended into the
        // overlay and evaluated there, so a value that smuggles an
        // include is refused by the same confined pre-parse — including
        // the newline-injection spelling.
        for (const value of ['@"/etc/passwd"', '1\nz: @"/etc/passwd"']) {
            const rv = (0, mcp_1.callTool)('set', {
                entry: 'a: integer', overlay: '',
                assignments: [{ path: '$.a', value }],
            });
            Assert.equal(rv.isError, false);
            Assert.equal(payload(rv).verdict, 'error');
            Assert.equal(payload(rv).findings[0].code, 'include_denied');
        }
    });
    (0, node_test_1.test)('view-tool-draws-the-tree', () => {
        const doc = 'cli: {dependsOn: [&: refer(), path($.web), path($.db)]}\n' +
            'web: {dependsOn: [&: refer(), path($.db)], usedBy: [&: refer(), path($.cli)]}\n' +
            'db: {dependsOn: [&: refer(), path($.disk)], usedBy: [&: refer(), path($.cli), path($.web)]}\n' +
            'disk: {}\n';
        const tree = 'cli\n├── db\n│   └── disk\n└── web\n    └── db (*)';
        // THE SAME CONTRACT THE CLI PRINTS: kind, verdict, and the figure.
        const drawn = payload((0, mcp_1.callTool)('view', { source: doc, kind: 'tree', relation: 'dependsOn' }));
        Assert.equal(drawn.verdict, 'rendered');
        Assert.equal(drawn.kind, 'tree');
        Assert.equal(drawn.text, tree);
        // `kind` defaults to the one kind there is.
        Assert.equal(payload((0, mcp_1.callTool)('view', { source: doc, relation: 'dependsOn' })).text, tree);
        // Every relation is drawn when none is named, each branch naming
        // its own: the inverse pair collapses to one edge under both names.
        Assert.match(payload((0, mcp_1.callTool)('view', { source: doc })).text, /├── db \(dependsOn\/usedBy\)/);
        // A named root draws its subtree alone.
        Assert.equal(payload((0, mcp_1.callTool)('view', { source: doc, relation: 'dependsOn', root: ['$.web'] })).text, 'web\n└── db\n    └── disk');
        // A kind the verb does not draw, or a profile it does not render
        // into, is a call that could not be made.
        Assert.equal((0, mcp_1.callTool)('view', { source: doc, kind: 'poset' }).isError, true);
        Assert.equal((0, mcp_1.callTool)('view', { source: doc, as: 'png' }).isError, true);
        const dot = payload((0, mcp_1.callTool)('view', { source: doc, as: 'dot' }));
        Assert.equal(dot.verdict, 'error');
        Assert.equal((dot.errors ?? dot.findings)[0].code, 'view_profile_unknown');
        // The tree as SVG, through the tool: the figure is the bytes the
        // CLI writes, and the shared rows pin them.
        Assert.match(payload((0, mcp_1.callTool)('view', { source: doc, relation: 'dependsOn', as: 'svg' })).text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="av" /);
        // EVERY OTHER KIND, through the tool, with every option named: the
        // figures themselves are test/spec/view.tsv's business.
        const matrix = payload((0, mcp_1.callTool)('view', {
            source: doc, kind: 'matrix', relation: 'dependsOn', order: 'partition',
            closure: true, at: '$', maxRows: 10,
        }));
        Assert.equal(matrix.verdict, 'rendered');
        Assert.match(matrix.text, /# above-diagonal direct cells: 0$/);
        Assert.deepEqual(matrix.loss, []);
        const graph = payload((0, mcp_1.callTool)('view', {
            source: 'a: {t: "x", dependsOn: [&: refer(), path($.b)]}\nb: {t: "y"}\n',
            kind: 'graph', as: 'dot', groupBy: 't', label: 't', relation: 'dependsOn',
        }));
        Assert.match(graph.text, /^digraph G \{\n/);
        const layer = payload((0, mcp_1.callTool)('view', {
            source: 'a: {t: "x", dependsOn: [&: refer(), path($.b)]}\nb: {t: "y"}\n',
            kind: 'layer', groupBy: 't', layers: ['x', 'y'],
        }));
        Assert.match(layer.text, /^\+-+\+\n\| x  a \|/);
        const sets = payload((0, mcp_1.callTool)('view', {
            source: 'r: {a: {m: ["p", "q"]}, b: {m: ["q"]}}\nu: ["p", "q", "z"]\n',
            kind: 'sets', sets: '$.r', member: 'm', universe: '$.u',
        }));
        Assert.match(sets.text, /^# upset  sets=\$\.r\(2\)/);
        const layers = payload((0, mcp_1.callTool)('view', { source: doc, kind: 'layers' }));
        Assert.match(layers.text, /^# layers  file=/);
        const ladder = payload((0, mcp_1.callTool)('view', {
            source: 'a: *1\na: **2\n', kind: 'ladder', at: '$.a',
        }));
        Assert.match(ladder.text, /^graph TD\n/);
        Assert.equal(payload((0, mcp_1.callTool)('view', {
            source: doc, kind: 'tree', maxRows: 1,
        })).errors[0].code, 'view_rows_exceeded');
        // A root that is not a node of the drawn graph, and a document that
        // does not stand up, are both refusals in vet's finding shape --
        // with the kind still named, because the report is the answer.
        const bad = payload((0, mcp_1.callTool)('view', { source: doc, root: ['$.nope'] }));
        Assert.equal(bad.verdict, 'error');
        Assert.equal(bad.kind, 'tree');
        Assert.equal(bad.errors[0].code, 'refer_unresolved');
        Assert.equal('text' in bad, false);
        const broken = payload((0, mcp_1.callTool)('view', { source: 'a: 1\na: 2\n' }));
        Assert.equal(broken.verdict, 'error');
        Assert.equal(broken.errors[0].code, 'scalar_value');
        // A document the served profile cannot read is refused before the
        // engine sees it, in the same shape.
        const denied = payload((0, mcp_1.callTool)('view', { source: '@"./x.aon"\n' }));
        Assert.equal(denied.verdict, 'error');
        Assert.equal(denied.kind, 'tree');
        Assert.equal(denied.errors[0].code, 'include_denied');
    });
    (0, node_test_1.test)('reaches-tool-answers-the-closure-question', () => {
        const doc = 'a: {dependsOn: [&: refer(), path($.b)]}\n' +
            'b: {dependsOn: [&: refer(), path($.c)], usedBy: [&: refer(), path($.d)]}\n' +
            'c: {}\nd: {}\n';
        const hit = payload((0, mcp_1.callTool)('reaches', { source: doc, from: '$.a', to: '$.c' }));
        Assert.equal(hit.verdict, 'reaches');
        Assert.deepEqual(hit.path, ['$.a', '$.b', '$.c']);
        // A `no` is an ANSWER and carries no path: there is no evidence for
        // a negative one.
        const miss = payload((0, mcp_1.callTool)('reaches', { source: doc, from: '$.c', to: '$.a' }));
        Assert.equal(miss.verdict, 'unreachable');
        Assert.equal('path' in miss, false);
        // The relation filter is the difference between "at all" and "this
        // way".
        Assert.equal(payload((0, mcp_1.callTool)('reaches', { source: doc, from: '$.a', to: '$.d', relation: 'dependsOn' })).verdict, 'unreachable');
        // TRANSITIVE, NOT REFLEXIVE: a node reaches itself only through
        // a cycle.
        Assert.equal(payload((0, mcp_1.callTool)('reaches', { source: doc, from: '$.a', to: '$.a' })).verdict, 'unreachable');
        // An endpoint that names nothing, and a document that does not
        // stand up, are both refusals in vet's finding shape.
        const bad = payload((0, mcp_1.callTool)('reaches', { source: doc, from: '$.a', to: '$.nope' }));
        Assert.equal(bad.verdict, 'error');
        Assert.equal(bad.errors[0].code, 'refer_unresolved');
        const broken = payload((0, mcp_1.callTool)('reaches', { source: 'a: 1 & 2', from: '$.a', to: '$.b' }));
        Assert.equal(broken.verdict, 'error');
        Assert.equal(broken.errors[0].code, 'scalar_value');
        const denied = payload((0, mcp_1.callTool)('reaches', { source: 'a: @"/etc/passwd"', from: '$.a', to: '$.b' }));
        Assert.equal(denied.verdict, 'error');
        Assert.equal(denied.errors[0].code, 'include_denied');
    });
    (0, node_test_1.test)('jsonschema-tool-exports-and-refuses', () => {
        // The MCP surface of the export (the review's finding I): the
        // schema, the loss report beside it rather than instead of it, the
        // anchor, and the two refusals every tool here shares.
        const ok = payload((0, mcp_1.callTool)('jsonschema', {
            source: 'a: string & re("^x$")\nb?: integer\n',
        }));
        Assert.equal(ok.verdict, 'ok');
        Assert.equal(ok.schema.properties.a.pattern, '^x$');
        Assert.deepEqual(ok.schema.required, ['a']);
        Assert.deepEqual(ok.lossy, []);
        // A loss is reported WITH the schema: a weaker schema is still a
        // usable one, and the caller is told what it cannot say.
        const lossy = payload((0, mcp_1.callTool)('jsonschema', {
            source: 'a: integer & must(min(2), "two")\n',
        }));
        Assert.equal(lossy.verdict, 'lossy');
        Assert.equal(lossy.schema.properties.a.type, 'integer');
        Assert.equal(lossy.lossy[0].path, '$.a');
        Assert.equal(lossy.lossy[0].construct, 'must');
        // `at` names the subtree, as it does for every other tool here.
        const at = payload((0, mcp_1.callTool)('jsonschema', {
            source: 'spec: {p: integer & min(1024)}\n', at: 'spec',
        }));
        Assert.equal(at.schema.properties.p.minimum, 1024);
        // A document that does not stand up has nothing to export, and an
        // unreadable include names the capability rather than the file.
        const broken = payload((0, mcp_1.callTool)('jsonschema', { source: 'a: 1 & 2' }));
        Assert.equal(broken.verdict, 'error');
        Assert.deepEqual(broken.schema, {});
        Assert.equal(broken.errors[0].code, 'scalar_value');
        const denied = payload((0, mcp_1.callTool)('jsonschema', { source: 'a: @"/etc/passwd"' }));
        Assert.equal(denied.verdict, 'error');
        Assert.equal(denied.errors[0].code, 'include_denied');
    });
    (0, node_test_1.test)('relations-trim-and-hash-answer-their-reports', () => {
        // relations: the pass, the located cycle, and the engine's own
        // error answer for a document that does not stand up.
        Assert.deepEqual(payload((0, mcp_1.callTool)('relations', { source: 'a: 1' })), { verdict: 'pass', findings: [] });
        const cyc = payload((0, mcp_1.callTool)('relations', {
            source: 'a: {dependsOn: rel() & acyclic() & [path($.b)]}\n' +
                'b: {dependsOn: rel() & acyclic() & [path($.a)]}',
        }));
        Assert.equal(cyc.verdict, 'fail');
        Assert.equal(cyc.findings[0].code, 'relation_cycle');
        Assert.deepEqual(cyc.findings[0].detail, ['$.a', '$.b', '$.a']);
        // An `error` verdict now SAYS WHY (the review's finding F). The
        // graph list stays the graph's own vocabulary -- a document with no
        // graph has no graph findings -- and the reason rides `errors`, in
        // vet's finding shape.
        const broken = payload((0, mcp_1.callTool)('relations', { source: 'a: 1 & 2' }));
        Assert.equal(broken.verdict, 'error');
        Assert.deepEqual(broken.findings, []);
        Assert.equal(broken.errors[0].code, 'scalar_value');
        Assert.equal(broken.errors[0].path, '$.a');
        // The refusal (a document the served profile cannot read) names
        // the capability rather than leaving the caller to guess.
        const denied = payload((0, mcp_1.callTool)('relations', { source: 'a: @"/etc/passwd"' }));
        Assert.equal(denied.verdict, 'error');
        Assert.deepEqual(denied.findings, []);
        Assert.equal(denied.errors[0].code, 'include_denied');
        // trim: clean, the redundant spread-implied entry, the engine's
        // error for a unify failure, and the refusal — same shape.
        Assert.deepEqual(payload((0, mcp_1.callTool)('trim', { source: 'a: 1' })), { verdict: 'clean', redundant: [] });
        Assert.deepEqual(payload((0, mcp_1.callTool)('trim', { source: 'q: { &: {x: 1}, a: {x: 1} }' })), { verdict: 'redundant', redundant: ['$.q.a.x'] });
        const tbroken = payload((0, mcp_1.callTool)('trim', { source: 'a: 1 & 2' }));
        Assert.equal(tbroken.verdict, 'error');
        Assert.deepEqual(tbroken.redundant, []);
        Assert.equal(tbroken.errors[0].code, 'scalar_value');
        const tdenied = payload((0, mcp_1.callTool)('trim', { source: 'a: @"/x.aon"' }));
        Assert.equal(tdenied.verdict, 'error');
        Assert.deepEqual(tdenied.redundant, []);
        Assert.equal(tdenied.errors[0].code, 'include_denied');
        // hash: the pin survives reformatting (it equals summary's), and
        // `form` adds the digested text.
        const h = payload((0, mcp_1.callTool)('hash', { source: 'b: 2\na: 1' }));
        Assert.equal(h.ok, true);
        Assert.equal(h.form, undefined);
        Assert.equal(h.hash, payload((0, mcp_1.callTool)('hash', { source: 'a: 1\nb: 2' })).hash);
        Assert.equal(h.hash, payload((0, mcp_1.callTool)('summary', { src: 'b: 2\na: 1' })).hash);
        const hf = payload((0, mcp_1.callTool)('hash', { source: 'a: 1', form: true }));
        Assert.equal(hf.form, '{"a":1}');
        Assert.match(hf.hash, /^aon1-/);
        // A document that does not stand up has no meaning to pin.
        const hb = payload((0, mcp_1.callTool)('hash', { source: 'a:]' }));
        Assert.equal(hb.ok, false);
        Assert.equal(hb.hash, '');
        Assert.ok(0 < hb.findings.length);
    });
    // ------------------------------------------------------------------
    // The path capability (--root).
    (0, node_test_1.test)('path-arguments-need-a-root', () => {
        // Without a root, a path argument is refused with the remedy.
        const r = (0, mcp_1.callTool)('vet', { schemaPath: 'schema.aon', data: 'a: 1' });
        Assert.equal(r.isError, true);
        Assert.match(r.content[0].text, /--root <dir>/);
        Assert.match(r.content[0].text, /schemaPath/);
    });
    (0, node_test_1.test)('root-serves-paths-and-confines-them', () => {
        const outside = scratchDir('aontu-mcp-outside-', { 'evil.aon': 'a: 1\n' });
        const root = scratchDir('aontu-mcp-root-', {
            'schema.aon': 'a: integer\n',
            'data.aon': 'a: 1\n',
            'inc.aon': 'b: 2\n',
            'main.aon': 'x: @"./inc.aon"\n',
            'gen.aon': 'a: integer\nx: @"./inc.aon"\n',
            'spec.aon': 'a: 1\nx: @"./inc.aon"\n',
            'entry.aon': 'a: integer\n',
            'over.aon': 'a: 2\n',
        });
        Fs.symlinkSync(Path.join(outside, 'evil.aon'), Path.join(root, 'link.aon'));
        // Reads below the root are served.
        Assert.equal(payload((0, mcp_1.callTool)('vet', { schemaPath: 'schema.aon', dataPath: 'data.aon' }, { root })).verdict, 'valid');
        // An escape is denied — the dotted spelling and the symlink both,
        // because confinement is realpath-then-prefix (the include
        // resolver's own rule).
        const dots = (0, mcp_1.callTool)('vet', {
            schemaPath: `../${Path.basename(outside)}/evil.aon`, data: 'a: 1',
        }, { root });
        Assert.equal(dots.isError, true);
        Assert.match(dots.content[0].text, /escapes the server root/);
        const link = (0, mcp_1.callTool)('vet', { schemaPath: 'link.aon', data: 'a: 1' }, { root });
        Assert.equal(link.isError, true);
        Assert.match(link.content[0].text, /escapes the server root/);
        // A file that is not there could not be read, which is isError.
        const gone = (0, mcp_1.callTool)('vet', { schemaPath: 'nope.aon', data: 'a: 1' }, { root });
        Assert.equal(gone.isError, true);
        Assert.match(gone.content[0].text, /cannot read schemaPath/);
        // Neither text nor path names the alternative in the refusal.
        const neither = (0, mcp_1.callTool)('vet', { data: 'a: 1' }, { root });
        Assert.equal(neither.isError, true);
        Assert.match(neither.content[0].text, /schema \(or schemaPath\)/);
        // WITH a root, includes resolve — confined below it: the served
        // file's own relative include loads, an inline document may load
        // a root file, and a file outside the root stays denied.
        Assert.deepEqual(payload((0, mcp_1.callTool)('canon', { srcPath: 'main.aon' }, { root })), { ok: true, canon: '{"x":{"b":2}}', findings: [] });
        // srcPath, not the native join: inside an @"..." include a
        // BACKSLASH IS AN ESCAPE, so a Windows path interpolated raw is
        // eaten by the lexer and the include resolves to nothing. The
        // helper is shared with the trust suite for exactly this.
        Assert.equal(payload((0, mcp_1.callTool)('canon', { src: `x: @"${(0, srcpath_1.srcPath)(Path.join(root, 'inc.aon'))}"` }, { root })).canon, '{"x":{"b":2}}');
        const esc = payload((0, mcp_1.callTool)('canon', { src: `x: @"${(0, srcpath_1.srcPath)(Path.join(outside, 'evil.aon'))}"` }, { root }));
        Assert.equal(esc.ok, false);
        Assert.equal(esc.findings[0].code, 'include_denied');
        // The pre-parsed engines take file pairs too, include closures
        // included — the confined pre-parse proves the closure in bounds
        // and the engine then reads the same files.
        Assert.equal(payload((0, mcp_1.callTool)('subsume', { generalPath: 'gen.aon', specificPath: 'spec.aon' }, { root })).verdict, 'subsumes');
        Assert.equal(payload((0, mcp_1.callTool)('trim', { sourcePath: 'main.aon' }, { root })).verdict, 'clean');
        Assert.deepEqual(payload((0, mcp_1.callTool)('breaking', { oldPath: 'spec.aon', newPath: 'spec.aon' }, { root })), { verdict: 'compatible', mode: 'backward', findings: [] });
        // The served-evaluation verbs resolve a file's own includes from
        // its directory (the CLI's rule for a named file).
        const sum = payload((0, mcp_1.callTool)('summary', { srcPath: 'main.aon' }, { root }));
        Assert.equal(sum.ok, true);
        Assert.deepEqual(sum.keys, ['x']);
        Assert.equal(payload((0, mcp_1.callTool)('hash', { sourcePath: 'main.aon' }, { root })).hash, sum.hash);
        // set via paths: the replacement is sited in the REAL overlay
        // file, and the new text is returned, not written.
        const rip = payload((0, mcp_1.callTool)('set', {
            entryPath: 'entry.aon', overlayPath: 'over.aon',
            assignments: [{ path: '$.a', value: '3' }], inPlace: true,
        }, { root }));
        Assert.equal(rip.verdict, 'valid');
        Assert.equal(rip.overlay, 'a: 3\n');
        Assert.equal(rip.replaced[0].file, Path.join(root, 'over.aon'));
        Assert.equal(Fs.readFileSync(Path.join(root, 'over.aon'), 'utf8'), 'a: 2\n');
        // Inline text wins when a caller sends both spellings.
        Assert.equal(payload((0, mcp_1.callTool)('canon', { src: 'a: 9', srcPath: 'data.aon' }, { root })).canon, '{"a":9}');
        // The rooted handshake names the root.
        const init = (0, mcp_1.handle)({ id: 1, method: 'initialize' }, '9.9.9', root);
        Assert.ok(init.result.instructions.includes(`--root ${root}`));
    });
    (0, node_test_1.test)('a-throwing-tool-does-not-take-the-server-down', () => {
        // A stdio server serves one client for a whole session, so an
        // unhandled throw inside a tool loses every later call as well.
        // isError is the contract for "this call could not be made".
        //
        // No document reaches this path -- every verb answers with a
        // report rather than throwing -- so the tool table is injected,
        // the way the watch loop injects its waiter.
        const boom = [{
                name: 'boom',
                description: 'throws',
                properties: { src: { type: 'string', description: 'x' } },
                required: ['src'],
                run: () => { throw new Error('bang'); },
            }];
        const r = (0, mcp_1.callTool)('boom', { src: 'a:1' }, { tools: boom });
        Assert.equal(r.isError, true);
        Assert.match(r.content[0].text, /tool boom failed: bang/);
        // A thrown non-Error still answers, rather than printing
        // "undefined" from a missing .message.
        const odd = [{ ...boom[0], run: () => { throw 'plain'; } }];
        const r2 = (0, mcp_1.callTool)('boom', { src: 'a:1' }, { tools: odd });
        Assert.equal(r2.isError, true);
        Assert.match(r2.content[0].text, /tool boom failed: plain/);
    });
    // main() with no stream arguments uses the real stdout/exit
    // defaults, which no injected test reaches.
    (0, node_test_1.test)('stdio-server-default-streams', () => {
        const stdin = { on: () => stdin };
        const written = [];
        let exited;
        const so = process.stdout.write;
        const pe = process.exit;
        try {
            ;
            process.stdout.write = (c) => (written.push(String(c)), true);
            process.exit = (code) => { exited = code; };
            const codec = (0, mcp_server_1.main)(stdin);
            codec.push('{"id":1,"method":"ping"}\n');
            codec.end();
        }
        finally {
            process.stdout.write = so;
            process.exit = pe;
        }
        Assert.match(written.join(''), /"result":\{\}/);
        Assert.equal(exited, 0);
    });
    (0, node_test_1.test)('server-startup-arguments', () => {
        // The parser: nothing, a root, and the three refusals.
        Assert.deepEqual((0, mcp_server_1.parseArgs)([]), { root: undefined });
        Assert.deepEqual((0, mcp_server_1.parseArgs)(['--root', '/tmp']), { root: '/tmp' });
        Assert.match((0, mcp_server_1.parseArgs)(['--root']).err, /needs a directory/);
        Assert.match((0, mcp_server_1.parseArgs)(['--zig']).err, /unknown option/);
        Assert.deepEqual((0, mcp_server_1.parseArgs)(['--help']), { help: true });
        Assert.deepEqual((0, mcp_server_1.parseArgs)(['-h']), { help: true });
        const stdin = { on: () => stdin };
        const lines = [];
        const errs = [];
        let code;
        const write = (l) => void lines.push(l);
        const exit = (c) => { code = c; };
        // --help answers usage and exits 0, with no codec to serve.
        Assert.equal((0, mcp_server_1.main)(stdin, write, exit, '9', ['--help'], (l) => void errs.push(l)), undefined);
        Assert.equal(code, 0);
        Assert.match(lines[0], /aontu-mcp \[--root <dir>\]/);
        // A bad option refuses at startup: a server whose operator typo'd
        // --root must not come up quietly unconfined.
        Assert.equal((0, mcp_server_1.main)(stdin, write, exit, '9', ['--zig'], (l) => void errs.push(l)), undefined);
        Assert.equal(code, 2);
        Assert.match(errs[0], /unknown option --zig/);
        // So does a root that is not a directory — checked at startup,
        // not per call. The default errwrite (real stderr) is exercised
        // here by omission.
        const se = process.stderr.write;
        const caught = [];
        try {
            ;
            process.stderr.write =
                (c) => (caught.push(String(c)), true);
            Assert.equal((0, mcp_server_1.main)(stdin, write, exit, '9', ['--root', '/no/such/dir']), undefined);
        }
        finally {
            process.stderr.write = se;
        }
        Assert.equal(code, 2);
        Assert.match(caught[0], /is not a directory/);
        // A root that EXISTS but is a plain file refuses the same way.
        const filedir = scratchDir('aontu-mcp-fileroot-', { 'f.txt': 'x' });
        Assert.equal((0, mcp_server_1.main)(stdin, write, exit, '9', ['--root', Path.join(filedir, 'f.txt')], (l) => void errs.push(l)), undefined);
        Assert.equal(code, 2);
        Assert.match(errs[errs.length - 1], /is not a directory/);
        // A real root reaches the codec, realpath'd, and rides into the
        // handshake. Read it back OUT of the JSON rather than substring-
        // matching the line: a Windows path is backslash-escaped on the
        // way in, so the raw path is not a substring of its own encoding.
        const root = scratchDir('aontu-mcp-args-');
        const codec = (0, mcp_server_1.main)(stdin, write, exit, '9', ['--root', root]);
        Assert.ok(codec instanceof mcp_server_1.LineCodec);
        codec.push('{"id":1,"method":"initialize"}\n');
        Assert.equal(JSON.stringify(JSON.parse(lines[lines.length - 1]))
            .includes(JSON.stringify(Fs.realpathSync(root)).slice(1, -1)), true, lines[lines.length - 1]);
    });
    (0, node_test_1.test)('protocol-errors', () => {
        Assert.equal((0, mcp_1.handle)({ id: 9, method: 'no/such' }, '1')?.error?.code, -32601);
        Assert.equal((0, mcp_1.handle)({ id: 9, method: 'tools/call', params: {} }, '1')?.error?.code, -32602);
        Assert.equal((0, mcp_1.parseError)().error?.code, -32700);
        Assert.equal((0, mcp_1.parseError)().id, null);
        // A call with a name and NO arguments block: the tool's own
        // required-argument check answers, not the protocol.
        const bare = (0, mcp_1.handle)({ id: 10, method: 'tools/call', params: { name: 'canon' } }, '1');
        Assert.equal(bare.result.isError, true);
    });
    // The stdio wiring: NDJSON in, NDJSON out, one line per message.
    (0, node_test_1.test)('stdio-server-speaks-ndjson', async () => {
        const lines = [];
        let exited = -1;
        const stdin = new node_stream_1.PassThrough();
        // The stream ends on a later tick, so the exit code is awaited
        // rather than read: this is the wiring test, and the wiring is
        // event-driven.
        const done = new Promise((resolve) => {
            const codec = (0, mcp_server_1.main)(stdin, (line) => lines.push(line), (code) => (exited = code, resolve()), '9.9.9', []);
            Assert.ok(codec instanceof mcp_server_1.LineCodec);
        });
        // Two messages in one chunk, and one split across chunks.
        stdin.write('{"id":1,"method":"ping"}\n{"id":2,"method":"tools/list"}\n');
        stdin.write('{"id":3,"method":"ini');
        stdin.write('tialize"}\n');
        // A blank line is not a message; unparseable text is.
        stdin.write('\nnot json\n');
        stdin.end();
        await done;
        Assert.equal(lines.length, 4);
        Assert.deepEqual(JSON.parse(lines[0]).result, {});
        Assert.equal(JSON.parse(lines[1]).result.tools.length, ALL_TOOLS.length);
        Assert.equal(JSON.parse(lines[2]).result.serverInfo.version, '9.9.9');
        Assert.equal(JSON.parse(lines[3]).error.code, -32700);
        Assert.equal(exited, 0);
    });
    // The SHIPPED binary with the path capability granted: the rooted
    // handshake, the widened tool list, a served file read, and a
    // denied escape — over stdio JSON-RPC, exactly as a client runs it.
    (0, node_test_1.test)('spawned-server-serves-root-paths', () => {
        const root = scratchDir('aontu-mcp-spawn-root-', { 'd.aon': 'a: 1\n' });
        const bin = Path.join(__dirname, '..', 'bin', 'aontu-mcp.js');
        const lines = [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            { jsonrpc: '2.0', id: 2, method: 'tools/list' },
            {
                jsonrpc: '2.0', id: 3, method: 'tools/call',
                params: { name: 'canon', arguments: { srcPath: 'd.aon' } },
            },
            {
                jsonrpc: '2.0', id: 4, method: 'tools/call',
                params: {
                    name: 'canon', arguments: { srcPath: '../../../etc/passwd' },
                },
            },
        ].map((m) => JSON.stringify(m)).join('\n') + '\n';
        const out = (0, node_child_process_1.execFileSync)('node', [bin, '--root', root], {
            input: lines, encoding: 'utf8',
        });
        const answers = out.trim().split('\n').map((l) => JSON.parse(l));
        Assert.equal(answers.length, 4);
        Assert.match(answers[0].result.instructions, /--root /);
        const canon = answers[1].result.tools.find((t) => 'canon' === t.name);
        Assert.equal(canon.inputSchema.properties.srcPath.type, 'string');
        Assert.equal(answers[2].result.isError, false);
        Assert.equal(JSON.parse(answers[2].result.content[0].text).canon, '{"a":1}');
        Assert.equal(answers[3].result.isError, true);
        Assert.match(answers[3].result.content[0].text, /escapes the server root/);
    });
});
//# sourceMappingURL=mcp.test.js.map