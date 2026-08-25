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
// The patch API around the shared rows (G7 phase 5, and `--in-place`).
// The report itself is pinned by test/spec/patch.tsv; what is left here
// is what a spec row cannot reach — the options, which carry FILE PATHS,
// and the guards that only fire when the engine's idea of a file and the
// file itself disagree. The Go twin is go/patch_test.go.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const patch_1 = require("../dist/patch");
(0, node_test_1.describe)('patch', () => {
    // With entryPath and overlayPath given, a finding names those files
    // rather than vet's generic schema/data labels: with two documents
    // that both belong to the caller, "which file" is the whole question.
    (0, node_test_1.test)('labels-findings-with-their-files', () => {
        const r = (0, patch_1.patch)('port: 3', '', ['$.port=5'], { entryPath: 'sys.aon', overlayPath: 'ov.aon' });
        Assert.strictEqual(r.verdict, 'invalid');
        Assert.ok(0 < r.findings.length);
        const files = r.findings[0].sites.map((s) => s.file).join(',');
        Assert.ok(files.includes('sys.aon'), files);
        Assert.ok(files.includes('ov.aon'), files);
    });
    // OFFSET ARITHMETIC, at its edges. Every one of these is a position
    // that does not exist, and the answer to a position that does not
    // exist is -1 — never an offset that happens to be in range.
    (0, node_test_1.test)('offsetat-refuses-positions-that-do-not-exist', () => {
        const src = 'ab\ncd\n';
        Assert.strictEqual((0, patch_1.offsetAt)(src, 1, 1), 0);
        Assert.strictEqual((0, patch_1.offsetAt)(src, 2, 1), 3);
        Assert.strictEqual((0, patch_1.offsetAt)(src, 2, 2), 4);
        // One PAST the last character is a position (a splice may end
        // there); two past it is not.
        Assert.strictEqual((0, patch_1.offsetAt)(src, 3, 1), 6);
        Assert.strictEqual((0, patch_1.offsetAt)(src, 0, 1), -1, 'row 0');
        Assert.strictEqual((0, patch_1.offsetAt)(src, 1, 0), -1, 'col 0');
        Assert.strictEqual((0, patch_1.offsetAt)(src, -1, -1), -1, 'the unsited site');
        Assert.strictEqual((0, patch_1.offsetAt)(src, 9, 1), -1, 'row past the end');
        Assert.strictEqual((0, patch_1.offsetAt)('ab', 1, 99), -1, 'col past the end');
    });
    // AN OVERLAY THAT LOADS ANOTHER DOCUMENT CANNOT BE EDITED IN PLACE,
    // and this is the case that makes it necessary rather than tidy.
    //
    // The include holds `a: 42` at row 1 column 4; the overlay holds
    // `x: 42` at row 1 column 4. The site is a real site, the text at the
    // span really is `42`, and the span verification therefore PASSES —
    // so a splice that trusted it would rewrite `x` while reporting a
    // replacement of `$.a`, with a valid verdict and no findings. The
    // site's `file` cannot save it: a library caller need not pass
    // `overlayPath`, and the Go port names the entry document for an
    // included value anyway (issue #66).
    //
    // Denying includes removes the ambiguity at its source: what resolves
    // is what this text says by itself.
    (0, node_test_1.test)('refuses-an-overlay-that-loads-another-document', () => {
        const Fs = require('node:fs');
        const Os = require('node:os');
        const Path = require('node:path');
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-patch-'));
        Fs.mkdirSync(Path.join(dir, 'sub'));
        const incFile = Path.join(dir, 'sub', 'inc.aon');
        Fs.writeFileSync(incFile, 'a: 42\n');
        const ovFile = Path.join(dir, 'ov.aon');
        // The coincidence: same row, same column, same text. The include is
        // written ABSOLUTE so it resolves with or without a base directory
        // — a RELATIVE one is refused earlier, by the loader, when no
        // overlayPath is given, which would test the loader rather than
        // this guard.
        const overlay = 'x: 42\n@"' +
            incFile.replace(/\\/g, '/') + '"\n';
        Fs.writeFileSync(ovFile, overlay);
        for (const opts of [
            { inPlace: true, overlayPath: ovFile },
            { inPlace: true }, // the library caller who names no path
        ]) {
            const r = (0, patch_1.patch)('x: integer\na: integer', overlay, ['$.a=99'], opts);
            Assert.deepStrictEqual(r.replaced, [], 'nothing rewritten');
            Assert.ok(r.findings.map((f) => f.code).includes('patch_not_editable'), r.findings.map((f) => f.code).join(','));
            Assert.ok(r.findings[0].message.includes('loads another document'), r.findings[0].message);
            // AND `x: 42` IS UNTOUCHED, which is the whole point.
            Assert.ok(r.overlay.startsWith('x: 42\n'), r.overlay);
            Assert.strictEqual(Fs.readFileSync(incFile, 'utf8'), 'a: 42\n');
        }
    });
    // TWO ASSIGNMENTS AT ONE PATH. The second is the one the author wrote
    // last, so it wins — and the first is DROPPED rather than layered,
    // because splicing the same span twice would write one value inside
    // the other.
    (0, node_test_1.test)('last-assignment-at-a-path-wins', () => {
        const r = (0, patch_1.patch)('a: integer', 'a: 1\n', ['$.a=2', '$.a=3'], { inPlace: true });
        Assert.strictEqual(r.replaced.length, 1);
        Assert.strictEqual(r.replaced[0].to, '3');
        Assert.strictEqual(r.overlay, 'a: 3\n');
        Assert.strictEqual(r.verdict, 'valid');
    });
    // A malformed assignment is refused before anything is written, and
    // the report says which one. `replaced` is empty rather than absent:
    // an emitter that dropped the field would make the two ports differ.
    (0, node_test_1.test)('malformed-assignment-refuses-the-whole-run', () => {
        const r = (0, patch_1.patch)('a: integer', 'a: 1\n', ['$.a=2', 'nonsense'], { inPlace: true });
        Assert.strictEqual(r.verdict, 'error');
        Assert.deepStrictEqual(r.replaced, []);
        Assert.deepStrictEqual(r.appended, []);
        Assert.strictEqual(r.overlay, 'a: 1\n', 'the overlay is untouched');
        Assert.strictEqual(r.findings[0].code, 'patch_assignment');
    });
    // THE LAST CHECK BEFORE A SPLICE, exercised with sites the engine
    // would never produce — which is the only way to test a guard whose
    // whole purpose is to catch a state the rest of the code says cannot
    // happen. The Go twin is TestSpanHoldsRefusesWhatItCannotAccountFor.
    (0, node_test_1.test)('spanholds-refuses-what-it-cannot-account-for', () => {
        const src = 'a: 42\nb: 7\n';
        // The site that describes the text: this is the only case a splice
        // is allowed to proceed from.
        Assert.strictEqual((0, patch_1.spanAt)(src, { row: 1, col: 4, len: 2 }), '42');
        Assert.strictEqual((0, patch_1.spanHolds)(src, { row: 1, col: 4, len: 2 }, '42'), true);
        // THE TEXT IS DIFFERENT. An included literal's coordinates applied
        // to this file used to reach here; nothing does now, and it still
        // must refuse.
        Assert.strictEqual((0, patch_1.spanHolds)(src, { row: 2, col: 4, len: 2 }, '42'), false);
        // THE POSITION IS NOT IN THIS TEXT AT ALL.
        Assert.strictEqual((0, patch_1.spanAt)(src, { row: 9, col: 1, len: 2 }), undefined);
        Assert.strictEqual((0, patch_1.spanHolds)(src, { row: 9, col: 1, len: 2 }, '42'), false);
        Assert.strictEqual((0, patch_1.spanHolds)(src, { row: -1, col: -1, len: 2 }, ''), false, 'the unsited site never holds, even against empty text');
        // A ZERO-LENGTH SPAN never holds against real text: an empty slice
        // would compare equal to an empty `src` and then splice nothing,
        // INSERTING the new value instead of replacing anything.
        Assert.strictEqual((0, patch_1.spanHolds)(src, { row: 1, col: 4, len: 0 }, '42'), false);
    });
    // WHAT DOES THIS TEXT MEAN ON ITS OWN? The check that makes a splice
    // safe, and the one `role === 'literal'` looks like it makes: a
    // COMPOUND value's site names only its opening token, so `min` must
    // not read as `min(1)`. The Go twin is
    // TestSpanValueSeparatesValuesFromConstraints.
    (0, node_test_1.test)('spanvalue-separates-values-from-constraints', () => {
        // A value, and its spelling need not be its canon.
        Assert.deepStrictEqual((0, patch_1.spanValue)('1'), { canon: '1', concrete: true });
        Assert.deepStrictEqual((0, patch_1.spanValue)('0x1F'), { canon: '31', concrete: true });
        Assert.deepStrictEqual((0, patch_1.spanValue)('"s"'), { canon: '"s"', concrete: true });
        // A CONSTRAINT stands alone but is not a pin: appending narrows it,
        // and replacing it would discard what it says.
        Assert.deepStrictEqual((0, patch_1.spanValue)('integer'), { canon: 'integer', concrete: false });
        Assert.deepStrictEqual((0, patch_1.spanValue)('above(0)'), { canon: 'above(0)', concrete: false });
        Assert.deepStrictEqual((0, patch_1.spanValue)('1|2'), { canon: '1|2', concrete: false });
        // `min` alone is a bare WORD, which is a string — not the call its
        // site was pointing into. The caller compares this canon against
        // the contribution's, so `"min"` against `min(1)` refuses.
        Assert.deepStrictEqual((0, patch_1.spanValue)('min'), { canon: '"min"', concrete: true });
        // AND THE TEXT THAT DOES NOT STAND ALONE AT ALL: the `$` a
        // reference's site names, and fragments the parser refuses.
        Assert.strictEqual((0, patch_1.spanValue)('$'), undefined, 'a lone $');
        Assert.strictEqual((0, patch_1.spanValue)(')'), undefined, 'a lone close');
        Assert.strictEqual((0, patch_1.spanValue)('"unclosed'), undefined, 'an open string');
        Assert.strictEqual((0, patch_1.spanValue)('&'), undefined, 'a lone meet');
        Assert.strictEqual((0, patch_1.spanValue)('@'), undefined, 'a lone include');
    });
    (0, node_test_1.test)('assignment-and-line-shapes', () => {
        Assert.strictEqual((0, patch_1.parseAssignment)('nope'), undefined);
        Assert.strictEqual((0, patch_1.parseAssignment)('=5'), undefined);
        Assert.strictEqual((0, patch_1.parseAssignment)('$.a='), undefined);
        Assert.deepStrictEqual((0, patch_1.parseAssignment)('$.a=5'), { path: '$.a', value: '5' });
        // The value may itself hold `=`: the split is at the FIRST one.
        Assert.deepStrictEqual((0, patch_1.parseAssignment)('$.a="x=y"'), { path: '$.a', value: '"x=y"' });
        Assert.strictEqual((0, patch_1.overlayLine)('$.a.b', '1'), '"a": "b": 1');
    });
});
//# sourceMappingURL=patch.test.js.map