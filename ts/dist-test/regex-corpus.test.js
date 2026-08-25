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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The differential regex corpus (ADR-003).
//
// `re()` enforces its subset by NORMALISATION: every construct whose
// expansion is engine-defined is rewritten into an explicit form before
// either host engine compiles it. That only works if the two ports
// rewrite identically, and "identically" is not something a comment can
// promise — so `test/spec/files/regex-corpus.tsv` records the verdict
// for several hundred generated patterns, and both ports assert against
// it. The Go twin is `go/regex_corpus_test.go`.
//
// Three properties, in order of what they catch:
//
//  1. VERDICT PARITY — the corpus file is the pinned output of both
//     normalisers. A drift in either port fails on the exact line.
//  2. COMPILATION — an accepted pattern's normalised form must compile
//     in THIS host. A normalisation that emits something the host
//     refuses would otherwise surface only as a runtime error later.
//  3. IDEMPOTENCE — normalising twice equals normalising once. An
//     expansion that re-expands its own output (or that emits a
//     construct it would itself refuse) is caught here.
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const ConstraintVal_1 = require("../dist/val/ConstraintVal");
const CORPUS = Path.join(__dirname, '..', '..', 'test', 'spec', 'files', 'regex-corpus.tsv');
function loadCorpus() {
    const rows = [];
    // Line endings normalised on read, as ts/test/docs.test.ts and
    // ts/test/grammar.test.ts do: .gitattributes pins .tsv to LF twice
    // over, and a reader that only works under one git configuration is
    // still a reader that only works under one git configuration. Here it
    // would be silent rather than loud -- the verdict is sliced with
    // `raw.slice(tab + 1)`, so a trailing \r rides into every expected
    // pattern.
    const text = Fs.readFileSync(CORPUS, 'utf8')
        .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    let line = 0;
    for (const raw of text.split('\n')) {
        line++;
        if ('' === raw || raw.startsWith('#')) {
            continue;
        }
        const tab = raw.indexOf('\t');
        // The pattern itself may contain anything except a tab; the FIRST
        // tab separates it from the verdict. No unescaping happens here —
        // unlike the spec runner, this file is read verbatim, because the
        // subject under test is backslash handling.
        rows.push({ pattern: raw.slice(0, tab), verdict: raw.slice(tab + 1), line });
    }
    return rows;
}
(0, node_test_1.describe)('regex-corpus', () => {
    const rows = loadCorpus();
    (0, node_test_1.test)('corpus-is-loaded', () => {
        // A guard on the guard: an empty or truncated corpus would make
        // every assertion below vacuous while still reporting green.
        node_assert_1.default.ok(300 < rows.length, 'corpus too small: ' + rows.length);
        node_assert_1.default.ok(rows.some((r) => r.verdict.startsWith('!')), 'corpus has no refusals — it would not exercise the subset bounds');
        node_assert_1.default.ok(rows.some((r) => !r.verdict.startsWith('!')), 'corpus has no acceptances');
    });
    (0, node_test_1.test)('verdict-parity', () => {
        for (const row of rows) {
            const [norm, why] = (0, ConstraintVal_1.normaliseRe)(row.pattern);
            const got = '' === why ? norm : '!' + why;
            node_assert_1.default.equal(got, row.verdict, 'regex-corpus.tsv line ' + row.line + ': ' + JSON.stringify(row.pattern));
        }
    });
    (0, node_test_1.test)('accepted-patterns-compile', () => {
        for (const row of rows) {
            if (row.verdict.startsWith('!')) {
                continue;
            }
            // The `u` flag is part of the contract, not the test: it is what
            // makes JavaScript match code points as RE2 does.
            node_assert_1.default.doesNotThrow(() => new RegExp(row.verdict, 'u'), 'normalised form does not compile, line ' + row.line + ': ' +
                JSON.stringify(row.verdict));
        }
    });
    (0, node_test_1.test)('normalisation-is-idempotent', () => {
        for (const row of rows) {
            if (row.verdict.startsWith('!')) {
                continue;
            }
            const [again, why] = (0, ConstraintVal_1.normaliseRe)(row.verdict);
            node_assert_1.default.equal(why, '', 'normalised form is refused on re-normalisation, line ' + row.line +
                ': ' + JSON.stringify(row.verdict) + ' -> ' + why);
            node_assert_1.default.equal(again, row.verdict, 'normalisation is not idempotent, line ' + row.line);
        }
    });
    // A LONG REPEAT BOUND IS REFUSED, and the same three inputs the Go
    // twin uses (go/regex_corpus_test.go). The COST is what differs
    // between the ports and it is why the two scans are written
    // differently: `digits += c` is a cons-string append in V8 and cost
    // nothing here, while the Go twin rebuilt an immutable string per
    // digit and took eight seconds on the first of these. The VERDICTS
    // are what must not differ, so they are asserted in both.
    (0, node_test_1.test)('a-long-repeat-bound-is-refused', () => {
        for (const n of [1000, 100000]) {
            const [, why] = (0, ConstraintVal_1.normaliseRe)('x{' + '1'.repeat(n) + '}');
            node_assert_1.default.match(why, /repeat count above/, n + ' digits: ' + why);
        }
        const [, comma] = (0, ConstraintVal_1.normaliseRe)('x{2,' + '9'.repeat(100000) + '}');
        node_assert_1.default.match(comma, /repeat count above/);
        // A long run of LEADING ZEROS is a small number, not an over-cap
        // one.
        const zeros = 'x{' + '0'.repeat(100000) + '5}';
        const [out, why] = (0, ConstraintVal_1.normaliseRe)(zeros);
        node_assert_1.default.equal(why, '');
        node_assert_1.default.equal(out, zeros);
    });
});
//# sourceMappingURL=regex-corpus.test.js.map