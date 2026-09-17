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
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const query_1 = require("../dist/query");
const err_1 = require("../dist/err");
(0, node_test_1.describe)('query', () => {
    (0, node_test_1.test)('defaults-to-the-json-view', () => {
        // No options at all: the whole document, generated.
        const r = (0, aontu_1.get)('a:{b:1}', '$.a');
        Assert.equal(r.ok, true);
        Assert.equal(r.out, '{\n  "b": 1\n}');
        Assert.deepEqual(r.findings, []);
    });
    (0, node_test_1.test)('a-refusal-is-a-g2-finding', () => {
        // `get` invents no error format: the refusal is the same finding
        // object vet and subsume report, so one consumer reads all three.
        const r = (0, aontu_1.get)('a:{b:1}', '$.a.c');
        Assert.equal(r.ok, false);
        Assert.equal(r.out, '');
        Assert.equal(r.findings.length, 1);
        const f = r.findings[0];
        Assert.equal(f.code, 'no_path');
        Assert.equal(f.class, 'reference');
        Assert.equal(f.severity, 'error');
        Assert.equal(f.path, '$.a.c');
        Assert.deepEqual(f.sites, []);
        Assert.match(f.message, /names nothing/);
    });
    (0, node_test_1.test)('an-engine-code-takes-its-class-from-the-registry', () => {
        // The registry wins: the report layer mints no class of its own.
        const r = (0, aontu_1.get)('out: folder("src", [line("x")])', '$.out');
        Assert.equal(r.ok, false);
        const f = r.findings[0];
        Assert.equal(f.code, 'invalid-arg');
        Assert.equal(f.class, 'conflict');
        Assert.equal(f.path, '$');
        Assert.deepEqual(f.sites, []);
        // One line, with the repair beside it rather than inside it.
        Assert.equal(f.message, '[aontu/invalid-arg]: Cannot children values at path $.out');
        Assert.match(f.hint, /^Invalid argument provided\./);
    });
    (0, node_test_1.test)('an-engine-message-is-materialised-before-its-first-line', () => {
        // A nil minted in `gen` has no message until the engine renders it.
        const r = (0, aontu_1.get)('out: {a: string}', '$.out');
        Assert.equal(r.ok, false);
        const f = r.findings[0];
        Assert.equal(f.code, 'mapval_no_gen');
        Assert.equal(f.class, 'incomplete');
        Assert.equal(f.message, '[aontu/mapval_no_gen]: Cannot resolve value at path $.out.a');
        Assert.equal(f.path, '$.out');
    });
    (0, node_test_1.test)('a-code-with-no-hint-text-carries-no-hint', () => {
        const r = (0, aontu_1.why)('a:]', '$');
        Assert.equal(r.ok, false);
        const f = r.findings[0];
        Assert.equal(f.code, 'syntax');
        Assert.equal(f.class, 'parse');
        Assert.equal(f.hint, undefined);
    });
    (0, node_test_1.test)('an-engine-message-carries-no-terminal-escapes', () => {
        // Nothing sets colour off for a library or MCP consumer.
        (0, err_1.setColor)(true);
        try {
            const f = (0, aontu_1.get)('out: folder("src", [line("x")])', '$.out').findings[0];
            Assert.ok(!f.message.includes('\u001b'), f.message);
            Assert.ok(!f.hint.includes('\u001b'), f.hint);
        }
        finally {
            (0, err_1.setColor)(undefined);
        }
    });
    (0, node_test_1.test)('relative-loads-resolve-from-the-documents-own-directory', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-query-'));
        Fs.writeFileSync(Path.join(dir, 'part.aon'), 'k: 7');
        const doc = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(doc, 'a: @"./part.aon"');
        Assert.equal((0, aontu_1.get)('a: @"./part.aon"', '$.a.k', { path: doc, view: 'canon' }).out, '7');
    });
    (0, node_test_1.test)('nearest-key-suggests-only-when-close', () => {
        Assert.equal((0, query_1.nearestKey)('imag', ['image', 'ports']), 'image');
        Assert.equal((0, query_1.nearestKey)('image', []), undefined);
        Assert.equal((0, query_1.nearestKey)('replicas', ['image']), undefined);
        // A one-character name still gets its one-character neighbour.
        Assert.equal((0, query_1.nearestKey)('a', ['b']), 'b');
    });
    (0, node_test_1.test)('path-parts-drops-the-root-and-empty-segments', () => {
        Assert.deepEqual((0, query_1.pathParts)('$'), []);
        Assert.deepEqual((0, query_1.pathParts)(''), []);
        Assert.deepEqual((0, query_1.pathParts)('$.'), []);
        Assert.deepEqual((0, query_1.pathParts)('$.a.b'), ['a', 'b']);
        // Written without the root marker, as a reference may be.
        Assert.deepEqual((0, query_1.pathParts)('a.b'), ['a', 'b']);
    });
});
//# sourceMappingURL=query.test.js.map