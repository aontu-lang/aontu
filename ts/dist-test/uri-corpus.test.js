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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const uri_1 = require("../dist/uri");
const CORPUS = Path.join(__dirname, '..', '..', 'test', 'spec', 'files', 'uri-corpus.tsv');
function loadCorpus() {
    const rows = [];
    let line = 0;
    for (const raw of Fs.readFileSync(CORPUS, 'utf8').split('\n')) {
        line++;
        if ('' === raw || raw.startsWith('#')) {
            continue;
        }
        const [base, ref, target, canonical] = raw.split('\t');
        rows.push({ base, ref, target, canonical, line });
    }
    return rows;
}
(0, node_test_1.describe)('uri-corpus', () => {
    const rows = loadCorpus();
    (0, node_test_1.test)('corpus-is-loaded', () => {
        // An empty or truncated corpus would make the parity check vacuous.
        node_assert_1.default.ok(400 < rows.length, 'corpus too small: ' + rows.length);
    });
    (0, node_test_1.test)('resolution-parity', () => {
        for (const row of rows) {
            const target = (0, uri_1.resolveUri)(row.base, row.ref);
            node_assert_1.default.equal(target, row.target, 'uri-corpus.tsv line ' + row.line);
            node_assert_1.default.equal((0, uri_1.normalizeUri)(target), row.canonical, 'uri-corpus.tsv line ' + row.line);
        }
    });
    (0, node_test_1.test)('a-reference-without-a-scheme-normalises', () => {
        // Go's TestURIReferenceNormalises asks the same.
        node_assert_1.default.equal((0, uri_1.normalizeUri)('../A/%7ex?%7e#F%2f'), '../A/~x?~#F%2F');
    });
});
//# sourceMappingURL=uri-corpus.test.js.map