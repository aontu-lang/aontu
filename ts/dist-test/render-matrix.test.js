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
// The render matrix: test/render/cases.json, held to the same
// expectations by go/cmd/aontu/render_matrix_test.go. A change to one
// port's render output fails the other port too.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const cli_1 = require("../dist/cli");
const CASES = Path.join(__dirname, '..', '..', 'test', 'render', 'cases.json');
function norm(text, dir) {
    const slashed = text.split('\\').join('/');
    return slashed.split(dir.split('\\').join('/')).join('{dir}')
        .replace(/"version": "[^"]*"/g, '"version": "{version}"');
}
function write(dir, files) {
    for (const [rel, content] of Object.entries(files ?? {})) {
        const at = Path.join(dir, rel);
        Fs.mkdirSync(Path.dirname(at), { recursive: true });
        Fs.writeFileSync(at, content);
    }
}
async function capture(args) {
    const so = process.stdout.write;
    const se = process.stderr.write;
    let out = '';
    let err = '';
    process.stdout.write = (s) => ((out += s), true);
    process.stderr.write = (s) => ((err += s), true);
    try {
        const code = await (0, cli_1.runRender)(args);
        return { out, err, code };
    }
    finally {
        process.stdout.write = so;
        process.stderr.write = se;
    }
}
(0, node_test_1.describe)('render-matrix', () => {
    const cases = JSON.parse(Fs.readFileSync(CASES, 'utf8')).cases;
    Assert.ok(0 < cases.length, 'the render matrix is empty');
    for (const c of cases) {
        (0, node_test_1.test)(c.name, async () => {
            const dir = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-matrix-')));
            write(dir, c.files);
            let n = 0;
            for (const step of c.steps) {
                n++;
                if (null != step.edit || null != step.remove) {
                    write(dir, step.edit);
                    for (const rel of step.remove ?? []) {
                        Fs.rmSync(Path.join(dir, rel));
                    }
                    continue;
                }
                const args = (step.args ?? []).map((a) => a.split('{dir}').join(dir));
                const got = await capture(args);
                const at = `${c.name} step ${n}`;
                if (null != step.out)
                    Assert.equal(norm(got.out, dir), step.out, at + ' stdout');
                if (null != step.err)
                    Assert.equal(norm(got.err, dir), step.err, at + ' stderr');
                if (null != step.code)
                    Assert.equal(got.code, step.code, at + ' exit code');
            }
            for (const [rel, want] of Object.entries(c.after ?? {})) {
                const at = Path.join(dir, rel);
                Assert.equal(Fs.existsSync(at) ? Fs.readFileSync(at, 'utf8') : '<absent>', want, `${c.name}: ${rel}`);
            }
        });
    }
});
//# sourceMappingURL=render-matrix.test.js.map