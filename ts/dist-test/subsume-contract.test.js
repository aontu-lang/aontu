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
// Each golden of subsume.tsv is an answer def-subsume-rows.tsv allows.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const hcanon_1 = require("../dist/hcanon");
const subsume_1 = require("../dist/subsume");
const SPEC = Path.join(__dirname, '..', '..', 'test', 'spec');
const unesc = (t) => t.replace(/\\(.)/g, (_, c) => 'n' === c ? '\n' : 't' === c ? '\t' : c);
function rows(file) {
    return Fs.readFileSync(Path.join(SPEC, file), 'utf8').split('\n')
        .filter((l) => '' !== l && !l.startsWith('#'))
        .map((l) => l.split('\t'));
}
function canon(src) {
    return (0, hcanon_1.hcanon)(new aontu_1.Aontu().unify(src));
}
function same(a, b) {
    return canon(a) === canon(b) || ('subsumes' === (0, subsume_1.subsume)(a, b, { profile: 'values' }).verdict &&
        'subsumes' === (0, subsume_1.subsume)(b, a, { profile: 'values' }).verdict);
}
// Rows both ports' subsume read otherwise than their vet.
const AWAITS = { 'list-witness': 1071 };
(0, node_test_1.describe)('subsume-contract', () => {
    const golden = new Map(rows('subsume.tsv')
        .filter((r) => 'subsume' === r[1])
        .map((r) => [r[0], r]));
    const contract = rows('def-subsume-rows.tsv');
    (0, node_test_1.test)('every-contract-row-names-a-golden-row', () => {
        Assert.ok(50 < contract.length, `only ${contract.length} rows`);
        for (const c of contract) {
            Assert.ok(golden.has(c[0].replace(/^def-/, '')), c[0]);
        }
    });
    (0, node_test_1.test)('every-golden-verdict-is-one-the-contract-allows', () => {
        for (const c of contract) {
            const g = golden.get(c[0].replace(/^def-/, ''));
            const want = JSON.parse(unesc(c[4])).verdict;
            const got = JSON.parse(unesc(g[4])).verdict;
            Assert.ok(want.includes(got), `${g[0]}: ${got}, where the contract allows ${want}`);
        }
    });
    (0, node_test_1.test)('every-document-reads-as-the-definition-read-it', () => {
        for (const c of contract) {
            const g = golden.get(c[0].replace(/^def-/, ''));
            const both = same(unesc(c[2]), unesc(g[2])) && same(unesc(c[3]), unesc(g[3]));
            Assert.strictEqual(both, undefined === AWAITS[g[0]], undefined === AWAITS[g[0]] ? `${g[0]} reads otherwise` :
                `${g[0]} reads alike now: drop it from AWAITS (#${AWAITS[g[0]]})`);
        }
    });
});
//# sourceMappingURL=subsume-contract.test.js.map