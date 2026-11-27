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
// The comparison's probes under test/cue/ (task CG1 of
// sketch/LANG-REFINEMENT-PLAN.0.md) are held by shared rows (CG2): each
// aontu file must be the source of its row, so a file and its row can't
// drift apart. The CUE half is held by the daily workflow (CG3).
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const REPO = Path.join(__dirname, '..', '..');
const CORPUS = Path.join(REPO, 'test', 'cue');
const GUIDE = Path.join(REPO, 'docs', 'how-to', 'aontu-for-cue-users.md');
const COMPREHENSIONS = Path.join(REPO, 'docs', 'how-to', 'map-cue-comprehensions.md');
// Every shared row, as `file/name` to its source and expectation.
function sharedRows() {
    const rows = new Map();
    const dir = Path.join(REPO, 'test', 'spec');
    for (const file of Fs.readdirSync(dir).filter((f) => f.endsWith('.tsv'))) {
        for (const line of Fs.readFileSync(Path.join(dir, file), 'utf8').split('\n')) {
            const f = line.split('\t');
            if (!line.startsWith('#') && 4 <= f.length) {
                rows.set(file.replace(/\.tsv$/, '') + '/' + f[0], { mode: f[1], src: f[2].replace(/\\n/g, '\n'), expect: f[f.length - 1] });
            }
        }
    }
    return rows;
}
function rowsOf(file) {
    const rows = new Map();
    for (const line of Fs.readFileSync(Path.join(REPO, 'test', 'spec', file), 'utf8')
        .split('\n')) {
        const f = line.split('\t');
        if (!line.startsWith('#') && 4 <= f.length) {
            rows.set(f[0], f[2].replace(/\\n/g, '\n'));
        }
    }
    return rows;
}
(0, node_test_1.describe)('cuecorpus', () => {
    const ids = Fs.readFileSync(Path.join(CORPUS, 'index.tsv'), 'utf8').split('\n')
        .filter((l) => '' !== l && !l.startsWith('#')).map((l) => l.split('\t')[0]);
    (0, node_test_1.test)('every-probe-has-both-files-and-nothing-else-is-there', () => {
        Assert.equal(ids.length, 154);
        const want = ['index.tsv', ...ids.flatMap((id) => [id + '.aontu', id + '.cue'])];
        Assert.deepEqual(Fs.readdirSync(CORPUS).sort(), want.sort());
    });
    (0, node_test_1.test)('every-aontu-file-is-the-source-of-its-shared-row', () => {
        const cue = rowsOf('cue.tsv');
        const routes = rowsOf('comprehension.tsv');
        for (const id of ids) {
            const src = Fs.readFileSync(Path.join(CORPUS, id + '.aontu'), 'utf8');
            const row = id.startsWith('k') ? routes.get('routes-' + id) : cue.get('cue-' + id);
            Assert.equal(row + '\n', src, id);
        }
        Assert.equal(cue.size, ids.filter((id) => !id.startsWith('k')).length);
    });
    // Each fence of the guide quotes the corpus or is a shared row's source.
    // A table under `<!-- cue: <id> ... -->` names, for each row, the
    // probes or `file/name` rows, joined by `+`, holding its code spans.
    (0, node_test_1.test)('the-guide-for-cue-users-prints-only-what-the-corpus-holds', () => {
        const index = new Map(Fs.readFileSync(Path.join(CORPUS, 'index.tsv'), 'utf8')
            .split('\n').filter((l) => '' !== l && !l.startsWith('#'))
            .map((l) => [l.split('\t')[0], l]));
        const shared = sharedRows();
        const held = (id) => {
            const row = shared.get(id);
            if (row) {
                return row.src + '\n' + row.expect;
            }
            Assert.ok(index.has(id), 'the guide names no probe ' + id);
            return [id + '.cue', id + '.aontu'].map((f) => Fs.readFileSync(Path.join(CORPUS, f), 'utf8')).join('\n') + index.get(id);
        };
        const sources = new Set([...shared.values()].map((r) => r.src + '\n'));
        const lines = Fs.readFileSync(GUIDE, 'utf8').split('\n');
        let fences = 0;
        let spans = 0;
        let tables = 0;
        for (let i = 0; i < lines.length; i++) {
            const fence = lines[i].match(/^```(cue|aontu)$/);
            if (fence) {
                const quote = (lines[i - 1].match(/^<!-- test: quote (test\/cue\/\S+) -->$/) ?? [])[1];
                let end = i + 1;
                while ('```' !== lines[end]) {
                    end++;
                }
                const body = lines.slice(i + 1, end).join('\n') + '\n';
                Assert.ok((quote ?? '').endsWith('.' + fence[1])
                    || ('aontu' === fence[1] && sources.has(body)), `${i + 1}: a ${fence[1]} fence that neither quotes the corpus nor is a shared row`);
                fences++;
                i = end;
                continue;
            }
            const directed = lines[i].match(/^<!-- cue: (.+) -->$/);
            if (directed) {
                const ids = directed[1].trim().split(/\s+/);
                const rows = [];
                for (let at = i + 3; at < lines.length && lines[at].startsWith('|'); at++) {
                    rows.push(lines[at]);
                }
                Assert.equal(rows.length, ids.length, `${i + 1}: one id for each row`);
                rows.forEach((row, r) => {
                    const text = ids[r].split('+').map(held).join('\n');
                    const found = [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1].replace(/\\\|/g, '|'));
                    Assert.ok(0 < found.length, `${i + 4 + r}: a row with no code`);
                    for (const span of found) {
                        Assert.ok(text.includes(span), `${i + 4 + r}: \`${span}\` is not in ${ids[r]}`);
                        spans++;
                    }
                });
                tables++;
            }
        }
        Assert.ok(10 < fences && 100 < spans && 4 < tables, `${fences} ${spans} ${tables}`);
    });
    // Each aontu fence of the comprehension guide quotes the corpus, or is
    // the agreed form of a row of comprehension.tsv or at.tsv followed by
    // that row's answer; between them the fences name every probe k1 to k38.
    (0, node_test_1.test)('the-comprehension-guide-prints-only-what-the-corpus-holds', () => {
        const formed = new Map();
        for (const [id, row] of sharedRows()) {
            if ('gen' === row.mode && /^(comprehension|at)\//.test(id)) {
                const r = (0, aontu_1.format)(row.src);
                if ('error' !== r.verdict) {
                    formed.set(r.text, { name: id.split('/')[1], expect: row.expect });
                }
            }
        }
        const named = new Set();
        const lines = Fs.readFileSync(COMPREHENSIONS, 'utf8').split('\n');
        let quotes = 0;
        let rows = 0;
        for (let i = 0; i < lines.length; i++) {
            const fence = lines[i].match(/^```(cue|aontu)$/);
            if (!fence) {
                continue;
            }
            let end = i + 1;
            while ('```' !== lines[end]) {
                end++;
            }
            const body = lines.slice(i + 1, end).join('\n') + '\n';
            const quote = (lines[i - 1].match(/^<!-- test: quote test\/cue\/(\w+)\.(cue|aontu) -->$/) ?? []);
            if (fence[1] === quote[2]) {
                named.add(quote[1]);
                quotes++;
            }
            else {
                const row = formed.get(body);
                Assert.ok('aontu' === fence[1] && row, `${i + 1}: a ${fence[1]} fence that neither quotes the corpus nor is a row in the agreed form`);
                Assert.equal(lines[end + 1], '', `${i + 1}: the answer follows its fence`);
                Assert.equal(lines[end + 2], '```json', `${i + 1}: the answer follows its fence`);
                Assert.deepEqual(JSON.parse(lines[end + 3]), JSON.parse(row.expect), `${i + 1}: ${row.name}`);
                named.add((row.name.match(/^routes-(k\d+)/) ?? [])[1] ?? row.name);
                rows++;
            }
            i = end;
        }
        const probes = Array.from({ length: 38 }, (_, k) => 'k' + (k + 1));
        Assert.deepEqual(probes.filter((id) => !named.has(id)), [], 'probes the guide does not show');
        Assert.ok(30 < quotes && 30 < rows, `${quotes} ${rows}`);
    });
});
//# sourceMappingURL=cuecorpus.test.js.map