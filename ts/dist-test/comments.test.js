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
// The ADR-032 gate, in the suite so that CI runs it on every push.
// `make comments` and .githooks/pre-push call the same checker.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const REPO = Path.join(__dirname, '..', '..');
const gate = require(Path.join(REPO, 'ts', 'scripts', 'comment-gate.cjs'));
const SHOWN = 25;
function render(findings) {
    const shown = findings.slice(0, SHOWN);
    const rest = findings.length - shown.length;
    const head = shown
        .map((f) => `  ${f.file}:${f.line}: ${f.rule}: ${f.detail}`)
        .join('\n');
    return `ADR-032: ${findings.length} comment finding(s)\n${head}`
        + (0 < rest ? `\n  ... ${rest} more (run: make comments)` : '');
}
(0, node_test_1.describe)('comments', () => {
    (0, node_test_1.test)('gate', () => {
        const findings = gate.checkAll()
            .flatMap((report) => report.findings);
        Assert.equal(findings.length, 0, render(findings));
    });
    (0, node_test_1.test)('scope', () => {
        const files = gate.sourceFiles();
        for (const covered of [
            'ts/src/aontu.ts',
            'ts/test/comments.test.ts',
            'editors/vscode/src/extension.ts',
            'go/aontu.go',
            'go/cmd/aontu/main.go',
        ]) {
            Assert.ok(files.includes(covered), `not gated: ${covered}`);
        }
        for (const excluded of [
            'ts/src/sigdecl.ts',
            'ts/src/helpdoc.ts',
            'ts/scripts/comment-gate.cjs',
            'use-cases/17-lambda-handlers/handler.ts',
            'test/system/rb-solar/ref/validate.ts',
        ]) {
            Assert.ok(Fs.existsSync(Path.join(REPO, excluded)), `gone: ${excluded}`);
            Assert.ok(!files.includes(excluded), `gated: ${excluded}`);
        }
        Assert.ok(files.every((f) => /\.(ts|go|rs|aontu)$/.test(f)), 'a non-source file is gated');
        Assert.ok(!files.some((f) => f.startsWith('ts/dist')), 'build output gated');
    });
    (0, node_test_1.test)('lexer', () => {
        const source = [
            'const url = "http://x/y" // trailing',
            'const re = /a\\/\\/b/',
            '/* two',
            '   lines */',
        ].join('\n');
        const { comments, codeLines } = gate.lex(source, 'ts');
        Assert.deepEqual(comments.map((c) => [c.kind, c.start, c.end]), [['line', 1, 1], ['block', 3, 4]]);
        Assert.equal(codeLines, 2);
    });
    (0, node_test_1.test)('exempt', () => {
        const source = [
            '/* Copyright (c) 2026 Richard Rodger, MIT License */',
            '//go:build linux',
            'package aontu',
        ].join('\n');
        const findings = gate.checkText('go/probe.go', source).findings;
        Assert.deepEqual(findings, []);
    });
});
//# sourceMappingURL=comments.test.js.map