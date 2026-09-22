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
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const view_1 = require("../dist/view");
const provenance_1 = require("../dist/provenance");
const write = (dir, name, src) => {
    const file = Path.join(dir, name);
    Fs.mkdirSync(Path.dirname(file), { recursive: true });
    Fs.writeFileSync(file, src);
    return file;
};
class Ghostly extends provenance_1.Provenance {
    record(path, a, b, out) {
        super.record(path, a, b, out);
        const rec = this.paths.get(path.join('.'));
        if (0 < rec.conjuncts.length && !this.paths.has('a.ghost')) {
            this.paths.set('a.ghost', {
                conjuncts: [rec.conjuncts[0]], made: new Set(), seen: new Set(),
            });
            this.paths.set('a.empty', {
                conjuncts: [], made: new Set(), seen: new Set(),
            });
        }
    }
}
(0, node_test_1.describe)('view', () => {
    (0, node_test_1.test)('view-over-included-files', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-view-'));
        write(dir, 'lib/base.aontu', 'a: {x: **1 & integer, y: 2}\n');
        const entry = write(dir, 'entry.aontu', '@"./lib/base.aontu"\na: {x: *2 & integer, z: 3}\n');
        const src = Fs.readFileSync(entry, 'utf8');
        const trust = { include: 'root', root: dir };
        const layers = (0, view_1.view)(src, { kind: 'layers', path: entry, trust });
        Assert.equal(layers.verdict, 'rendered');
        Assert.match(layers.text, /^# layers {2}file=entry\.aontu {2}documents=2/);
        // The included file is named relative to the entry, in the host's
        // own separator.
        Assert.ok(layers.text.includes(Path.join('lib', 'base.aontu')), layers.text);
        Assert.equal((0, view_1.view)(src, { kind: 'layers', path: entry, trust, maxRows: 1 })
            .errors?.[0].code, 'view_rows_exceeded');
        const ladder = (0, view_1.view)(src, { kind: 'ladder', at: '$.a.x', path: entry, trust });
        Assert.equal(ladder.verdict, 'rendered');
        Assert.ok(ladder.text.includes('c0["**1<br/>pref | base.aontu:1:8"]\n' +
            '  c1["*2<br/>pref | entry.aontu:2:8"]\n' +
            '  c2["integer<br/>literal | entry.aontu:2:13"]\n' +
            '  c3["integer<br/>literal | base.aontu:1:14"]'), ladder.text);
        // The poset labels a document by its file, and a further document
        // by its own path.
        const other = write(dir, 'wide.aontu', 'a: {x: integer, y: integer, z: integer}\n');
        const poset = (0, view_1.view)(src, {
            kind: 'poset', path: entry, trust, profile: 'values',
            docs: [{ src: Fs.readFileSync(other, 'utf8'), path: other }],
        });
        Assert.equal(poset.verdict, 'rendered', poset.text);
        Assert.match(poset.text, /n0\["entry"\]\n {2}n1\["wide"\]\n {2}n0 --> n1$/);
    });
    // No options at all draws the tree; and a document read from nowhere
    // that includes a file by its absolute path names that file as it is.
    (0, node_test_1.test)('view-with-no-options-and-an-absolute-include', () => {
        Assert.deepEqual((0, view_1.view)('a: 1'), { verdict: 'rendered', kind: 'tree', text: '', loss: [] });
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-view-abs-'));
        const lib = write(dir, 'lib.aontu', 'b: 2\n');
        // Spelled with forward slashes: a backslash in a string literal is
        // an escape, and a Windows path is full of them.
        const spelled = lib.split(Path.sep).join('/');
        const r = (0, view_1.view)(`@"${spelled}"\na: 1\n`, {
            kind: 'layers', trust: { include: 'root', root: dir },
        });
        Assert.equal(r.verdict, 'rendered', JSON.stringify(r.errors));
        Assert.match(r.text, /^# layers {2}file=- {2}documents=2/);
        Assert.ok(r.text.includes('lib.aontu'), r.text);
    });
    (0, node_test_1.test)('view-layers-skips-paths-the-document-lacks', () => {
        const r = (0, view_1.view)('a: {b: 1}', { kind: 'layers' }, { provenance: () => new Ghostly() });
        Assert.equal(r.verdict, 'rendered', JSON.stringify(r.errors));
        Assert.doesNotMatch(r.text, /ghost|empty/);
        // The same seam through a VIEW DOCUMENT: its one evaluation is the
        // instrumented one, so a layers figure it declares reads this
        // recorder rather than a second run's.
        const set = (0, view_1.viewSet)('a: {b: 1}\nviews: {l: {kind: layers, out: "l.txt"}}', { views: '$.views' }, { provenance: () => new Ghostly() });
        Assert.equal(set.verdict, 'rendered', JSON.stringify(set.errors));
        Assert.doesNotMatch(set.views[0].text, /ghost|empty/);
    });
    // A document that does not PARSE has no figure either: the parse
    // failure lands on the collecting context, and is the answer.
    (0, node_test_1.test)('view-refuses-a-document-that-does-not-parse', () => {
        const r = (0, view_1.view)('a: ]', { kind: 'matrix' });
        Assert.equal(r.verdict, 'error');
        Assert.equal(r.errors?.[0].code, 'syntax');
        Assert.deepEqual(r.loss, []);
    });
    (0, node_test_1.test)('view-set-needs-the-path-of-its-declarations', () => {
        for (const opts of [undefined, { views: '' }]) {
            const r = (0, view_1.viewSet)('a: 1', opts);
            Assert.equal(r.verdict, 'error');
            Assert.deepEqual(r.views, []);
            Assert.equal(r.errors?.[0].code, 'view_document_shape');
        }
    });
    (0, node_test_1.test)('view-poset-injected-verdicts', () => {
        const compare = (g, s) => {
            const pair = g.label + s.label;
            return 'ab' === pair || 'bc' === pair
                ? { verdict: 'subsumes', code: '' }
                : { verdict: 'does_not_subsume', code: 'compat_narrowed' };
        };
        const docs = [{ src: 'b', name: 'b' }, { src: 'c', name: 'c' }];
        const r = (0, view_1.view)('a', { kind: 'poset', docs, path: 'a.aontu' }, { compare });
        Assert.equal(r.verdict, 'lossy');
        Assert.match(r.text, /n1 --> n0\n {2}n2 --> n1$/);
        Assert.deepEqual(r.loss, [{ code: 'order_intransitive', count: 1, detail: ['c < a'] }]);
        const bad = (0, view_1.view)('a', {
            kind: 'poset', docs: [{ src: 'b', name: 'b\nc' }], path: 'a.aontu',
        }, { compare });
        Assert.equal(bad.verdict, 'error');
        Assert.equal(bad.errors?.[0].code, 'view_line_break');
    });
});
//# sourceMappingURL=view.test.js.map