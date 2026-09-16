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
// The diff API around the shared rows (G7 phase 6). Every change kind
// and every path shape is pinned by test/spec/diff.tsv in both ports;
// what is left here is the options, which no row exercises.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
(0, node_test_1.describe)('diff', () => {
    (0, node_test_1.test)('root-change-is-reported-at-the-root', () => {
        const r = (0, aontu_1.diff)('a: 1', '[1]');
        Assert.equal(r.ok, true);
        Assert.deepEqual(r.changes.map((c) => c.path), ['$']);
        Assert.equal(r.changes[0].kind, 'changed');
    });
    (0, node_test_1.test)('each-side-resolves-includes-from-its-own-directory', () => {
        const left = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-diff-l-'));
        const right = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-diff-r-'));
        Fs.writeFileSync(Path.join(left, 'part.aon'), 'k: 1');
        Fs.writeFileSync(Path.join(right, 'part.aon'), 'k: 2');
        // The entry file has to EXIST: the resolver stats it to root the
        // relative load, exactly as it does for `aontu <file>`.
        Fs.writeFileSync(Path.join(left, 'doc.aon'), 'a: @"./part.aon"');
        Fs.writeFileSync(Path.join(right, 'doc.aon'), 'a: @"./part.aon"');
        const r = (0, aontu_1.diff)('a: @"./part.aon"', 'a: @"./part.aon"', {
            leftPath: Path.join(left, 'doc.aon'),
            rightPath: Path.join(right, 'doc.aon'),
        });
        Assert.equal(r.ok, true);
        Assert.deepEqual(r.changes, [{ kind: 'changed', left: '1', path: '$.a.k', right: '2' }]);
    });
});
//# sourceMappingURL=diff.test.js.map