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
// The ADR-002 gate's own union rule: a gate that clears a gap fails
// silently. `test/covrun.js` calls the same checker.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const TS = Path.join(__dirname, '..');
// Every line ran, so only the function check can fail these reports.
function report(fns) {
    return ['SF:src/x.ts']
        .concat(fns.map((f) => `FN:${f.line},${f.name}`))
        .concat(fns.map((f) => `FNDA:${f.hits},${f.name}`))
        .concat(fns.map((f) => `DA:${f.line},1`))
        .concat(['end_of_record', ''])
        .join('\n');
}
function check(...reports) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'covcheck-'));
    const files = reports.map((text, i) => {
        const file = Path.join(dir, `lcov-${i}.info`);
        Fs.writeFileSync(file, text);
        return file;
    });
    const res = (0, node_child_process_1.spawnSync)(process.execPath, [Path.join(TS, 'test', 'covcheck.js'), ...files], { encoding: 'utf8' });
    return { code: res.status, out: res.stdout + res.stderr };
}
(0, node_test_1.describe)('covcheck', () => {
    // A run numbers the anonymous functions of its own list, so the same
    // number names a different function in the next run.
    (0, node_test_1.test)('a-run-s-own-numbering-never-clears-another-line', () => {
        const one = report([
            { line: 10, name: 'anonymous_1', hits: 5 },
            { line: 20, name: 'anonymous_2', hits: 0 },
        ]);
        const two = report([
            { line: 20, name: 'anonymous_1', hits: 0 },
            { line: 30, name: 'anonymous_2', hits: 7 },
        ]);
        const r = check(one, two);
        Assert.equal(r.code, 1, r.out);
        Assert.match(r.out, /src\/x\.ts:20 function anonymous_\d+ never called/);
        Assert.equal(r.out.match(/never called/g)?.length, 1, r.out);
    });
    (0, node_test_1.test)('an-observation-one-run-dropped-is-recovered-by-another', () => {
        const lost = report([
            { line: 10, name: 'anonymous_1', hits: 0 },
            { line: 20, name: 'anonymous_2', hits: 3 },
        ]);
        const kept = report([
            { line: 10, name: 'anonymous_1', hits: 4 },
            { line: 20, name: 'anonymous_2', hits: 3 },
        ]);
        const r = check(lost, kept);
        Assert.equal(r.code, 0, r.out);
        Assert.match(r.out, /functions 100\.00%/);
    });
    (0, node_test_1.test)('a-gap-every-run-reports-stays-a-gap', () => {
        const fns = [{ line: 10, name: 'anonymous_1', hits: 0 }];
        const r = check(report(fns), report(fns), report(fns));
        Assert.equal(r.code, 1, r.out);
        Assert.match(r.out, /src\/x\.ts:10 function anonymous_1 never called/);
    });
});
//# sourceMappingURL=covcheck.test.js.map