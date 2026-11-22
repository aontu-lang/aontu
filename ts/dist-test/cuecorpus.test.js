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
const REPO = Path.join(__dirname, '..', '..');
const CORPUS = Path.join(REPO, 'test', 'cue');
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
});
//# sourceMappingURL=cuecorpus.test.js.map