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
const uniprop_1 = require("../dist/uniprop");
const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors');
const ESCAPES = Path.join(VECTORS, 'test262', 'property-escapes');
const DELTA = Path.join(VECTORS, 'test262', 'unicode-17-to-18.tsv');
const RE2 = Path.join(VECTORS, 're2', 're2-search.txt');
const minus = (a, b) => (0, uniprop_1.complement)((0, uniprop_1.union)([(0, uniprop_1.complement)(a), b]));
const show = (rs) => JSON.stringify(rs.slice(0, 4)) + (4 < rs.length ? '...' : '');
// The set a test262 file builds: buildString's loneCodePoints and ranges.
function builtSet(text) {
    const at = text.indexOf('loneCodePoints: [');
    const lone = text.slice(at, text.indexOf(']', at));
    const ranges = text.slice(text.indexOf('ranges: [', at), text.indexOf('\n});', at));
    return (0, uniprop_1.union)([
        [...lone.matchAll(/0x([0-9A-F]+)/g)].map((m) => [parseInt(m[1], 16), parseInt(m[1], 16)]),
        [...ranges.matchAll(/\[0x([0-9A-F]+), 0x([0-9A-F]+)\]/g)].map((m) => [parseInt(m[1], 16), parseInt(m[2], 16)]),
    ]);
}
// What the delta file says each file's set gains and loses.
function loadDelta() {
    const out = new Map();
    for (const line of Fs.readFileSync(DELTA, 'utf8').split('\n')) {
        if ('' === line || line.startsWith('#')) {
            continue;
        }
        const [stem, sign, spans] = line.split('\t');
        const d = out.get(stem) ?? { '+': [], '-': [] };
        d[sign] = spans.split(' ').map((s) => {
            const [lo, hi] = s.split('..');
            return [parseInt(lo, 16), parseInt(hi ?? lo, 16)];
        });
        out.set(stem, d);
    }
    return out;
}
// The set the owned parser reads for a \p{..} or \P{..} escape.
function escapeSet(escape) {
    const [prog, why] = (0, regex_1.compilePattern)(escape, 'ecma');
    node_assert_1.default.ok(undefined !== prog, escape + ' is refused: ' + why);
    const set = prog[0];
    node_assert_1.default.equal(set.op, 'set', escape + ' does not compile to a set');
    return set.set;
}
// A Go string literal as the bytes it holds, decoded as UTF-8, which
// every string of the file is.
function goUnquote(lit) {
    const bytes = [];
    const SIMPLE = {
        a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34, '\'': 39,
    };
    const body = lit.slice(1, -1);
    for (let i = 0; i < body.length;) {
        const c = body[i];
        if ('\\' !== c) {
            const cp = body.codePointAt(i);
            bytes.push(...Buffer.from(String.fromCodePoint(cp), 'utf8'));
            i += cp > 0xFFFF ? 2 : 1;
            continue;
        }
        const e = body[i + 1];
        if (undefined !== SIMPLE[e]) {
            bytes.push(SIMPLE[e]);
            i += 2;
        }
        else if ('x' === e) {
            bytes.push(parseInt(body.slice(i + 2, i + 4), 16));
            i += 4;
        }
        else if ('u' === e || 'U' === e) {
            const n = 'u' === e ? 4 : 8;
            bytes.push(...Buffer.from(String.fromCodePoint(parseInt(body.slice(i + 2, i + 2 + n), 16)), 'utf8'));
            i += 2 + n;
        }
        else {
            bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
            i += 4;
        }
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
}
(0, node_test_1.describe)('regex-vectors', () => {
    // The files were generated for Unicode 17.0.0, the tables for 18.0.0:
    // the delta, read from both releases' files, says what moved.
    (0, node_test_1.test)('test262-property-escapes', () => {
        const delta = loadDelta();
        const files = Fs.readdirSync(ESCAPES).filter((f) => f.endsWith('.js')).sort();
        let escapes = 0;
        for (const file of files) {
            const stem = file.slice(0, -3);
            const text = Fs.readFileSync(Path.join(ESCAPES, file), 'utf8');
            const split = text.indexOf('const nonMatchSymbols');
            const matched = builtSet(-1 === split ? text : text.slice(0, split));
            if (-1 !== split) {
                node_assert_1.default.deepEqual(builtSet(text.slice(split)), (0, uniprop_1.complement)(matched), file + ': its two sets are not complements');
            }
            const d = delta.get(stem) ?? { '+': [], '-': [] };
            delta.delete(stem);
            const want = (0, uniprop_1.union)([minus(matched, d['-']), d['+']]);
            for (const m of text.matchAll(/\/\^?(\\[pP]\{[^}]+\})(?:\+\$)?\/u/g)) {
                const got = escapeSet(m[1]);
                const expect = 'p' === m[1][1] ? want : (0, uniprop_1.complement)(want);
                node_assert_1.default.deepEqual(got, expect, file + ': ' + m[1] + ' reads ' + show(minus(got, expect)) +
                    ' more and ' + show(minus(expect, got)) + ' fewer');
                escapes++;
            }
        }
        node_assert_1.default.equal(files.length, 441);
        node_assert_1.default.equal(escapes, 3492);
        node_assert_1.default.deepEqual([...delta.keys()], [], 'the delta names files that are not vendored');
    });
    // RE2's search tests, read as re() reads a pattern: the second column
    // is RE2's unanchored search, which is the question re() asks. A
    // pattern re() refuses is RE2's syntax and not u mode's: \C, an octal
    // escape, \x{..}, \pN, a script by its bare name, an inline flag. It
    // is counted and passed over.
    (0, node_test_1.test)('re2-search', () => {
        const lines = Fs.readFileSync(RE2, 'utf8').split('\n');
        let strings = [];
        let agree = 0;
        let refused = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if ('strings' === line) {
                strings = [];
                for (i++; 'regexps' !== lines[i]; i++) {
                    strings.push(goUnquote(lines[i]));
                }
                continue;
            }
            if (!line.startsWith('"')) {
                continue;
            }
            const pattern = goUnquote(line);
            const [prog] = (0, regex_1.compilePattern)(pattern, 'aontu');
            for (const s of strings) {
                const found = '-' !== lines[++i].split(';')[1];
                if (undefined === prog) {
                    refused++;
                }
                else {
                    node_assert_1.default.equal((0, regex_1.patternMatches)(prog, s), found, 're2-search.txt line ' + (i + 1) + ': ' + JSON.stringify(pattern) + ' on ' + JSON.stringify(s));
                    agree++;
                }
            }
        }
        node_assert_1.default.deepEqual({ agree, refused }, { agree: 1568, refused: 320 });
    });
});
//# sourceMappingURL=regex-vectors.test.js.map