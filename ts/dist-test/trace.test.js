"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
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
const trace_1 = require("../dist/trace");
const DOC = `%r = emit(_, { match: n: string body: ["L" + .n] })
svc: { a: { n:"a" } }
out: file("x.ts", emit($.svc, %r))
`;
(0, node_test_1.describe)('trace', () => {
    (0, node_test_1.test)('names-the-file-the-node-and-the-rule', () => {
        const report = (0, trace_1.traceRun)(DOC, {});
        Assert.strictEqual(report.verdict, 'ok');
        Assert.deepStrictEqual(report.trace, [{
                file: 'x.ts',
                at: '$.children.0',
                node: '$.svc.a',
                rule: '$.%r#0',
            }]);
    });
    (0, node_test_1.test)('reads-an-explicit-anchor', () => {
        const src = DOC.replace('out:', 'elsewhere:');
        // The default anchor is `$.out`, which this document does not have.
        Assert.strictEqual((0, trace_1.traceRun)(src, {}).verdict, 'error');
        Assert.strictEqual((0, trace_1.traceRun)(src, { at: '$.elsewhere' }).verdict, 'ok');
        Assert.strictEqual((0, trace_1.traceRun)(src, { at: '$.nowhere' }).verdict, 'error');
    });
    (0, node_test_1.test)('answers-findings-rather-than-throwing', () => {
        const bad = (0, trace_1.traceRun)('out: file(', {});
        Assert.strictEqual(bad.verdict, 'error');
        Assert.ok(0 < (bad.errors ?? []).length);
        // Parses, does not unify.
        Assert.strictEqual((0, trace_1.traceRun)('out: 1 & "x"\n', {}).verdict, 'error');
    });
    // A PIECE OUTSIDE EVERY FILE IS NOT TRACED. The tree is what the
    // entries attribute to, so a rule that wrote no file has nothing to
    // name.
    (0, node_test_1.test)('skips-a-piece-that-reached-no-file', () => {
        const report = (0, trace_1.traceRun)('svc: { a: { n:"a" } }\n' +
            'out: emit($.svc, { match: n: string body: ["loose"] })\n', {});
        Assert.strictEqual(report.verdict, 'ok');
        Assert.deepStrictEqual(report.trace, []);
    });
    (0, node_test_1.test)('options-are-optional', () => {
        Assert.strictEqual((0, trace_1.traceRun)(DOC).verdict, 'ok');
    });
});
//# sourceMappingURL=trace.test.js.map