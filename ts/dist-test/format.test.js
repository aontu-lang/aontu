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
// THE FORMATTER'S OWN CASES (docs/design/FMT.0.md). What the two ports
// must AGREE on -- the form itself -- is pinned row by row in
// test/spec/fmt.tsv and executed by both spec runners. What is here is
// the rest: the self-check's refusal (reached through the hook, since a
// formatter that is right never takes that arm on its own), the unified
// diff, and the corpus gate -- every document under use-cases/ and
// test/spec/files/ formats to a fixed point.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
// The repository root, found from wherever the compiled test runs.
function repoRoot() {
    let dir = __dirname;
    while (!Fs.existsSync(Path.join(dir, 'test', 'spec'))) {
        dir = Path.dirname(dir);
    }
    return dir;
}
function aonFiles(dir, out = []) {
    for (const name of Fs.readdirSync(dir).sort()) {
        const path = Path.join(dir, name);
        if (Fs.statSync(path).isDirectory()) {
            aonFiles(path, out);
        }
        else if (name.endsWith('.aon')) {
            out.push(path);
        }
    }
    return out;
}
(0, node_test_1.describe)('format', () => {
    (0, node_test_1.test)('format-reports-what-changed', () => {
        const same = (0, aontu_1.format)('a: 1\n');
        Assert.equal(same.verdict, 'formatted');
        Assert.equal(same.text, 'a: 1\n');
        Assert.equal(same.changed, false);
        // Line endings are the checkout's business, not the document's:
        // CRLF formats to LF, and that IS a change.
        const crlf = (0, aontu_1.format)('a: 1\r\n');
        Assert.equal(crlf.text, 'a: 1\n');
        Assert.equal(crlf.changed, true);
    });
    // A document that does not parse is not formatted, and the report
    // says why in the finding shape every verb uses, the file named.
    (0, node_test_1.test)('format-refuses-a-syntax-error', () => {
        const r = (0, aontu_1.format)('a: {b\n', { path: 'broken.aon' });
        Assert.equal(r.verdict, 'error');
        Assert.equal(r.errors.length, 1);
        Assert.equal(r.errors[0].code, 'syntax');
        Assert.equal(r.errors[0].class, 'parse');
        Assert.equal(r.errors[0].sites[0].file, 'broken.aon');
        // A merge-conflict marker is refused before the parse, as
        // everywhere else.
        const m = (0, aontu_1.format)('<<<<<<< HEAD\na: 1\n=======\na: 2\n>>>>>>> other\n');
        Assert.equal(m.verdict, 'error');
        Assert.equal(m.errors[0].code, 'merge_conflict');
    });
    // THE DEPTH BUDGET: a document nested past the evaluation budget is
    // refused as a finding, in both ports at the same depth, rather than
    // left to whichever port's stack gives out first.
    (0, node_test_1.test)('format-refuses-past-the-depth-budget', () => {
        const nest = (n) => 'a:' + '{b:'.repeat(n) + '1' + '}'.repeat(n) + '\n';
        const ok = (0, aontu_1.format)(nest(999));
        Assert.equal(ok.verdict, 'formatted');
        Assert.equal(ok.text, 'a: ' + 'b: '.repeat(999) + '1\n');
        const deep = (0, aontu_1.format)(nest(1000));
        Assert.equal(deep.verdict, 'error');
        Assert.equal(deep.errors[0].code, 'max_depth');
        Assert.equal(deep.errors[0].class, 'budget');
    });
    // THE SELF-CHECK. The formatter re-parses what it wrote and compares
    // the two trees; a disagreement is its own defect, so it writes
    // nothing and says so, with both spellings in the finding. The check
    // is injectable because a correct formatter never fails it.
    (0, node_test_1.test)('format-refuses-its-own-defect', () => {
        const r = (0, aontu_1.format)('a: {b: 1}\n', undefined, { same: () => false });
        Assert.equal(r.verdict, 'error');
        Assert.equal(r.errors[0].code, 'format_check');
        Assert.equal(r.errors[0].class, 'internal');
        Assert.equal(r.errors[0].expected, '{"a":{"b":1}}');
        Assert.equal(r.errors[0].actual, 'a: b: 1\n');
        Assert.equal(r.errors[0].note, 'a formatter defect: please report it with the source');
        const named = (0, aontu_1.format)('a: 1\n', { path: 'doc.aon' }, { same: () => false });
        Assert.equal(named.errors[0].note, 'a formatter defect: please report it with the source (doc.aon)');
        // The hook sees the parsed root and the text about to be written.
        let seen;
        const ok = (0, aontu_1.format)('a: 1\n', undefined, {
            same: (root, after) => ((seen = [root.canon, after]), true),
        });
        Assert.equal(ok.verdict, 'formatted');
        Assert.deepEqual(seen, ['{"a":1}', 'a: 1\n']);
    });
    // THE LAWFUL TIER'S CHECK (FMT.0.md §7.3). A merge or a repeat stays
    // only where the engine agrees the two spellings meet the same; the
    // hook stands in for the engine, and sees both spellings.
    (0, node_test_1.test)('format-keeps-the-spelling-the-engine-refuses', () => {
        const seen = [];
        const keep = (0, aontu_1.format)('s: a: 1\ns: b: 2\n', undefined, {
            meet: (before, after) => (seen.push([before, after]), false),
        });
        Assert.equal(keep.verdict, 'formatted');
        Assert.equal(keep.text, 's: a: 1\ns: b: 2\n');
        Assert.equal(keep.changed, false);
        Assert.deepEqual(seen, [['s: a: 1\ns: b: 2\n', 's: { a:1 b:2 }\n']]);
        const take = (0, aontu_1.format)('s: a: 1\ns: b: 2\n', undefined, { meet: () => true });
        Assert.equal(take.text, 's: { a:1 b:2 }\n');
        // A statement inside a block is checked at its indentation, and
        // only it keeps its spelling before.
        const W = 'x'.repeat(60);
        const block = 's: {\n  a: 1\n  b: [\n    ' + W + '\n    ' + W + '\n  ]\n';
        seen.length = 0;
        const V = 'y'.repeat(70);
        const inner = (0, aontu_1.format)(block + '  c: { ' + V + ': 1 d: 2 }\n}\n', undefined, {
            meet: (before, after) => (seen.push([before, after]), false),
        });
        Assert.equal(inner.text, block + '  c: {\n    ' + V + ': 1\n    d: 2\n  }\n}\n');
        Assert.deepEqual(seen, [[
                '  c: {\n    ' + V + ': 1\n    d: 2\n  }\n',
                '  c: ' + V + ': 1\n  c: d: 2\n',
            ]]);
        // The engine's own repros: §75 of use-cases/BUGS.md is a map this
        // port evaluates differently as one map and as three statements,
        // so the merge is refused here and taken by Go. Goes with §75.
        const repro = Fs.readFileSync(Path.join(repoRoot(), 'use-cases', 'repros', 'key-func', 'spread-key-through-deep-ref.aon'), 'utf8');
        const kept = (0, aontu_1.format)(repro);
        Assert.ok(kept.text.includes('a: b: c: d: e: $.a.b.f\na: b: f: { &: { n:key() } }\na: b: f: x: {}\n'), kept.text);
    });
    (0, node_test_1.test)('unified-diff', () => {
        Assert.equal((0, aontu_1.unifiedDiff)('x', 'a\n', 'a\n'), '');
        Assert.equal((0, aontu_1.unifiedDiff)('x', '', ''), '');
        Assert.equal((0, aontu_1.unifiedDiff)('x', 'a\n', 'b\n'), '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n');
        // Into an empty file, and out of one.
        Assert.equal((0, aontu_1.unifiedDiff)('x', '', 'a\nb\n'), '--- a/x\n+++ b/x\n@@ -0,0 +1,2 @@\n+a\n+b\n');
        Assert.equal((0, aontu_1.unifiedDiff)('x', 'a\n', ''), '--- a/x\n+++ b/x\n@@ -1,1 +0,0 @@\n-a\n');
        // A missing final newline is a difference, and is said as diff
        // says it.
        Assert.equal((0, aontu_1.unifiedDiff)('x', 'a', 'a\n'), '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+a\n');
        // Two changes far apart are two hunks, three lines of context
        // each; the unique lines between them are the anchors.
        const lines = (n) => Array.from({ length: n }, (_, i) => 'line ' + i);
        const before = lines(20).join('\n') + '\n';
        const edited = lines(20);
        edited[2] = 'changed 2';
        edited.splice(17, 0, 'inserted');
        Assert.equal((0, aontu_1.unifiedDiff)('f.aon', before, edited.join('\n') + '\n'), '--- a/f.aon\n+++ b/f.aon\n' +
            '@@ -1,6 +1,6 @@\n line 0\n line 1\n-line 2\n+changed 2\n line 3\n line 4\n line 5\n' +
            '@@ -15,6 +15,7 @@\n line 14\n line 15\n line 16\n+inserted\n line 17\n line 18\n line 19\n');
        // Lines that repeat on both sides -- closers, blanks -- are no
        // anchors, and the gap between anchors recurses to the plain
        // delete-and-insert.
        const a = 'x: {\n  a: 1\n}\ny: {\n  b: 2\n}\n';
        const b = 'x: {\n  a: 1\n  c: 3\n}\ny: {\n  b: 2\n}\n';
        Assert.equal((0, aontu_1.unifiedDiff)('x', a, b), '--- a/x\n+++ b/x\n@@ -1,5 +1,6 @@\n x: {\n   a: 1\n+  c: 3\n }\n y: {\n   b: 2\n');
        // Nothing in common at all: everything out, everything in.
        Assert.equal((0, aontu_1.unifiedDiff)('x', 'a\nb\n', 'c\nd\n'), '--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n-b\n+c\n+d\n');
        // A line that MOVED: the unique lines are out of order across the
        // sides, so the chain keeps one of them and the other is a deletion
        // and an insertion.
        Assert.equal((0, aontu_1.unifiedDiff)('x', 'a\nb\nc\nd\n', 'a\nc\nb\nd\n'), '--- a/x\n+++ b/x\n@@ -1,4 +1,4 @@\n a\n-b\n c\n+b\n d\n');
    });
    // THE CORPUS GATE (FMT.0.md §7.5): every document in the repository
    // that parses formats to a fixed point, and every one that does not
    // is refused for its syntax, or its depth, and nothing else.
    (0, node_test_1.test)('every-corpus-document-formats-to-a-fixed-point', () => {
        const root = repoRoot();
        const files = [
            ...aonFiles(Path.join(root, 'use-cases')),
            ...aonFiles(Path.join(root, 'test', 'spec', 'files')),
        ];
        Assert.ok(300 < files.length, `too few documents: ${files.length}`);
        const failures = [];
        let formatted = 0;
        for (const file of files) {
            const src = Fs.readFileSync(file, 'utf8');
            const r = (0, aontu_1.format)(src, { path: file });
            const name = Path.relative(root, file);
            if ('error' === r.verdict) {
                if ('syntax' !== r.errors[0].code && 'max_depth' !== r.errors[0].code) {
                    failures.push(`${name}: refused with ${r.errors[0].code}`);
                }
                continue;
            }
            formatted++;
            const again = (0, aontu_1.format)(r.text, { path: file });
            if ('error' === again.verdict) {
                failures.push(`${name}: the formatted text does not format: ${again.errors[0].code}`);
            }
            else if (again.text !== r.text) {
                failures.push(`${name}: not a fixed point`);
            }
            else if (again.changed) {
                failures.push(`${name}: a fixed point that reports a change`);
            }
        }
        Assert.deepEqual(failures, [], failures.join('\n'));
        Assert.ok(300 < formatted, `too few documents formatted: ${formatted}`);
    });
});
//# sourceMappingURL=format.test.js.map