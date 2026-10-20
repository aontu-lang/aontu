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
const Path = __importStar(require("node:path"));
const REPO = Path.join(__dirname, '..', '..');
const REVIEW = Path.join(REPO, 'sketch', 'capability-review');
function read(...parts) {
    return Fs.readFileSync(Path.join(...parts), 'utf8')
        .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
// A markdown table row, split on the pipes that are not escaped: a cell
// may hold `--format text\|json`, and several already do.
function cells(row) {
    return row.split(/(?<!\\)\|/);
}
function bucketOf(status) {
    const s = status.toUpperCase();
    if (s.includes('NOT STARTED')) {
        return 'notStarted';
    }
    if (s.includes('RETIRED') || s.includes('SUPERSEDED') ||
        s.includes('REMOVED')) {
        return 'retired';
    }
    if (s.includes('PARTIAL')) {
        return 'partial';
    }
    if (s.includes('LANDED')) {
        return 'landed';
    }
    return null;
}
// Every phase row in the register, tagged with the `## G<n>` section it
// sits under.
function phaseRows(md) {
    const out = [];
    let gap = '';
    for (const line of md.split('\n')) {
        const head = /^## (G\d+)\b/.exec(line);
        if (null != head) {
            gap = head[1];
        }
        if (line.startsWith('| **') && '' !== gap) {
            const col = cells(line);
            if (5 <= col.length) {
                out.push({ gap, phase: col[1].trim(), status: col[3].trim(), pin: col[4] });
            }
        }
    }
    return out;
}
function summaryTable(md) {
    const out = new Map();
    for (const line of md.split('\n')) {
        const m = /^\| \[(G\d+)\]\([^)]*\) \|[^|]*\|[^|]*\| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/
            .exec(line);
        if (null != m) {
            out.set(m[1], [+m[2], +m[3], +m[4], +m[5]]);
        }
    }
    return out;
}
function totalRow(md) {
    const m = /^\| \| \| \*\*total\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|$/m
        .exec(md);
    return null == m ? null : [+m[1], +m[2], +m[3], +m[4]];
}
// Every gap document on disk, by its number.
function gapDocs() {
    const out = new Map();
    for (const file of Fs.readdirSync(REVIEW).sort()) {
        const m = /^g(\d+)-[a-z0-9-]+\.md$/.exec(file);
        if (null != m) {
            out.set('G' + m[1], file);
        }
    }
    return out;
}
const PROGRESS = read(REVIEW, 'progress.md');
const INDEX = read(REVIEW, 'index.md');
(0, node_test_1.describe)('capability-review', () => {
    (0, node_test_1.test)('there-are-gap-documents-to-check', () => {
        Assert.ok(9 < gapDocs().size, `only ${gapDocs().size} gap documents found; has the layout moved?`);
    });
    // EVERY ROW CLASSIFIES. A status word the register does not use is
    // either a typo or a new vocabulary item, and either way the counts
    // below would silently stop meaning anything.
    (0, node_test_1.test)('every-phase-row-carries-a-known-status', () => {
        for (const row of phaseRows(PROGRESS)) {
            Assert.ok(null != bucketOf(row.status), `${row.gap} phase ${row.phase}: unrecognised status ` +
                `"${row.status.slice(0, 60)}"`);
        }
    });
    (0, node_test_1.test)('the-summary-table-matches-the-rows-it-summarises', () => {
        const table = summaryTable(PROGRESS);
        const derived = new Map();
        for (const row of phaseRows(PROGRESS)) {
            const at = derived.get(row.gap) ?? [0, 0, 0, 0];
            const bucket = bucketOf(row.status);
            at[['landed', 'partial', 'notStarted', 'retired']
                .indexOf(bucket)]++;
            derived.set(row.gap, at);
        }
        Assert.deepEqual([...table.keys()].sort(), [...derived.keys()].sort(), 'the summary table and the sections below list different gaps');
        for (const [gap, counts] of table) {
            Assert.deepEqual(counts, derived.get(gap), `${gap}: the summary table says ` +
                `landed/partial/not-started/retired ${counts.join('/')}, ` +
                `the rows below say ${derived.get(gap)?.join('/')}`);
        }
    });
    (0, node_test_1.test)('the-total-row-is-the-column-sums', () => {
        const table = summaryTable(PROGRESS);
        const want = [0, 0, 0, 0];
        for (const counts of table.values()) {
            counts.forEach((n, i) => { want[i] += n; });
        }
        Assert.deepEqual(totalRow(PROGRESS), want, 'the **total** row is not the sum of the gap rows');
    });
    (0, node_test_1.test)('every-gap-document-is-registered-and-indexed', () => {
        const docs = gapDocs();
        const table = summaryTable(PROGRESS);
        for (const [gap, file] of docs) {
            Assert.ok(table.has(gap), `${file} exists and ${gap} has no row in the summary table`);
            Assert.ok(new RegExp(`^## ${gap}\\b`, 'm').test(PROGRESS), `${file} exists and progress.md has no "## ${gap}" section`);
            Assert.ok(INDEX.includes(`(${file})`), `${file} exists and index.md does not link it`);
            Assert.ok(new RegExp(`^\\| ${gap} \\|`, 'm').test(INDEX), `${file} exists and index.md has no ${gap} row`);
        }
        for (const gap of table.keys()) {
            Assert.ok(docs.has(gap), `the summary table has a ${gap} row and no g${gap.slice(1)}-*.md`);
        }
    });
    (0, node_test_1.test)('every-landed-row-pins-something', () => {
        for (const row of phaseRows(PROGRESS)) {
            if ('landed' !== bucketOf(row.status)) {
                continue;
            }
            Assert.ok(row.pin.includes('`') || row.pin.includes(']('), `${row.gap} phase ${row.phase} is LANDED and its pin cites no ` +
                `path, symbol or link: "${row.pin.trim().slice(0, 80)}"`);
        }
    });
    (0, node_test_1.test)('the-gap-range-is-current-everywhere-it-is-quoted', () => {
        const highest = Math.max(...[...gapDocs().keys()].map((g) => +g.slice(1)));
        const want = `G1–G${highest}`;
        for (const file of [
            'AGENTS.md', 'CLAUDE.md',
            'sketch/capability-review/index.md',
            'sketch/capability-review/progress.md',
        ]) {
            const md = read(REPO, file);
            const quoted = md.match(/G1[–-]G\d+/g) ?? [];
            Assert.ok(quoted.includes(want), `${file} never quotes the current range ${want}; ` +
                `it quotes ${0 === quoted.length ? 'none' : quoted.join(', ')}`);
            for (const q of quoted) {
                const named = +/\d+$/.exec(q)[0];
                Assert.ok(named <= highest, `${file} says ${q}; there are only ${highest} gap documents`);
            }
        }
    });
    // A POINTER THAT DOES NOT RESOLVE IS WORSE THAN NO POINTER -- the
    // rule ts/test/skill.test.ts already applies to docs/skill/, applied
    // to the working documents the prose gates leave out.
    (0, node_test_1.test)('every-link-in-the-review-resolves', () => {
        let checked = 0;
        for (const file of Fs.readdirSync(REVIEW)) {
            if (!file.endsWith('.md')) {
                continue;
            }
            const md = read(REVIEW, file);
            for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
                const href = m[1];
                if (href.startsWith('http') || href.startsWith('#')) {
                    continue;
                }
                // A link may carry an anchor; the file half is what exists.
                const target = Path.resolve(REVIEW, href.split('#')[0]);
                Assert.ok(Fs.existsSync(target), `sketch/capability-review/${file}: broken link ${href}`);
                checked++;
            }
        }
        Assert.ok(100 < checked, `only ${checked} links checked; has the shape moved?`);
    });
});
//# sourceMappingURL=capability-review.test.js.map