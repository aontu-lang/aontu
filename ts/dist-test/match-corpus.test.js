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
const regex_1 = require("../dist/regex");
const CORPUS = Path.join(__dirname, '..', '..', 'test', 'spec', 'files', 'match-corpus.tsv');
function loadCorpus() {
    const rows = [];
    const text = Fs.readFileSync(CORPUS, 'utf8').replaceAll('\r\n', '\n');
    let line = 0;
    for (const raw of text.split('\n')) {
        line++;
        if ('' === raw || raw.startsWith('#')) {
            continue;
        }
        const [pattern, texts, match, exported, imported, regex] = raw.split('\t');
        rows.push({
            pattern: JSON.parse(pattern), texts: JSON.parse(texts), match,
            exported: JSON.parse(exported), imported: JSON.parse(imported), regex, line,
        });
    }
    return rows;
}
const form = ([out, why]) => '' === why ? out : '!' + why;
(0, node_test_1.describe)('match-corpus', () => {
    const rows = loadCorpus();
    (0, node_test_1.test)('corpus-is-loaded', () => {
        // A guard on the guard: a truncated corpus, or one that never
        // matches or never refuses, would leave the checks below vacuous.
        node_assert_1.default.ok(500 < rows.length, 'corpus too small: ' + rows.length);
        node_assert_1.default.ok(rows.some((r) => r.match.startsWith('!')), 'corpus has no refusals');
        node_assert_1.default.ok(rows.some((r) => r.match.includes('1')), 'corpus has no match');
        node_assert_1.default.ok(rows.some((r) => /^[01]*0[01]*$/.test(r.match)), 'corpus has no mismatch');
    });
    (0, node_test_1.test)('verdict-parity', () => {
        for (const r of rows) {
            const [prog, why] = (0, regex_1.compilePattern)(r.pattern, 'aontu');
            const got = undefined === prog ? '!' + why :
                r.texts.map((s) => (0, regex_1.patternMatches)(prog, s) ? '1' : '0').join('');
            node_assert_1.default.equal(got, r.match, 'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern));
        }
    });
    (0, node_test_1.test)('export-parity', () => {
        for (const r of rows) {
            node_assert_1.default.equal(form((0, regex_1.exportForm)(r.pattern)), r.exported, 'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern));
        }
    });
    (0, node_test_1.test)('import-parity', () => {
        for (const r of rows) {
            node_assert_1.default.equal(form((0, regex_1.importForm)(r.pattern)), r.imported, 'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern));
        }
    });
    (0, node_test_1.test)('regex-parity', () => {
        for (const r of rows) {
            const why = (0, regex_1.ecmaWhy)(r.pattern);
            node_assert_1.default.equal('' === why ? 'ok' : '!' + why, r.regex, 'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern));
        }
    });
    // What the exporter writes means what re() means: read back as re()
    // source, the export agrees with the pattern on every text.
    (0, node_test_1.test)('export-round-trips', () => {
        for (const r of rows) {
            if (r.exported.startsWith('!')) {
                continue;
            }
            const back = (0, regex_1.importForm)(r.exported);
            node_assert_1.default.equal(back[1], '', 'line ' + r.line + ': the export does not import: ' + back[1]);
            const [prog] = (0, regex_1.compilePattern)(back[0], 'aontu');
            node_assert_1.default.equal(r.texts.map((s) => (0, regex_1.patternMatches)(prog, s) ? '1' : '0').join(''), r.match, 'match-corpus.tsv line ' + r.line + ': the export means otherwise');
        }
    });
});
//# sourceMappingURL=match-corpus.test.js.map