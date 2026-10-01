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
// The official JSON Schema Test Suite through the importer and `vet
// --no-fill --exact-numbers`, against the skip ledger described in
// test/vectors/jsonschema/README.md. Each schema and instance is the
// suite's own text, sliced from the file: a JSON reader that rounds
// numbers would test something else.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const jsonschema_import_1 = require("../dist/jsonschema-import");
const vet_1 = require("../dist/vet");
const admit_1 = require("../dist/admit");
const SUITE = Path.join(__dirname, '..', '..', 'test', 'vectors', 'jsonschema');
const TESTS = Path.join(SUITE, 'tests', 'draft2020-12');
// The ledger may not grow past this; the register tightens it per phase.
const SKIP_BOUND = 260;
function readSkips() {
    const out = [];
    for (const line of Fs.readFileSync(Path.join(SUITE, 'skips.tsv'), 'utf8').split('\n')) {
        if ('' === line.trim() || line.startsWith('#')) {
            continue;
        }
        const [file, group, name, construct] = line.split('\t');
        out.push({ file, group, test: name, construct, used: false });
    }
    return out;
}
function files(dir, rel, out) {
    for (const f of Fs.readdirSync(dir).sort()) {
        const p = Path.join(dir, f);
        const r = '' === rel ? f : rel + '/' + f;
        if (Fs.statSync(p).isDirectory()) {
            files(p, r, out);
        }
        else if (f.endsWith('.json')) {
            out.push(r);
        }
    }
    return out;
}
// The whole file, the whole group, or the one test, in that order.
function listed(skips, file, group, name) {
    return skips.find((s) => s.file === file && '*' === s.group) ??
        skips.find((s) => s.file === file && s.group === group && '*' === s.test) ??
        skips.find((s) => s.file === file && s.group === group && s.test === name);
}
function member(node, key) {
    const found = 'object' === node.t ? node.entries.find((e) => e.key === key) : undefined;
    Assert.ok(null != found, 'a suite object without ' + key);
    return found.val;
}
function text(node) {
    return 'string' === node.t ? node.s : '';
}
(0, node_test_1.test)('the-json-schema-test-suite-runs-under-import-and-vet', () => {
    const skips = readSkips();
    Assert.ok(skips.length <= SKIP_BOUND, `the skip ledger holds ${skips.length} rows, past its bound of ${SKIP_BOUND}`);
    const problems = [];
    let total = 0;
    let passed = 0;
    let skipped = 0;
    const aontu = new aontu_1.Aontu();
    for (const file of files(TESTS, '', [])) {
        const src = Fs.readFileSync(Path.join(TESTS, file), 'utf8');
        const groups = (0, jsonschema_import_1.parseJson)(src);
        Assert.ok('array' === groups.t, file + ' is not a suite file');
        for (const g of groups.items) {
            const description = text(member(g, 'description'));
            const schemaNode = member(g, 'schema');
            const report = (0, jsonschema_import_1.importJsonSchema)(src.slice(schemaNode.off, schemaNode.end), { path: file });
            for (const t of member(g, 'tests').items) {
                total++;
                const name = text(member(t, 'description'));
                const want = 'true' === member(t, 'valid').t;
                const dataNode = member(t, 'data');
                const data = src.slice(dataNode.off, dataNode.end);
                let got = false;
                if ('error' !== report.verdict) {
                    got = 'valid' === (0, vet_1.vet)(report.aontu, data, { noFill: true, exactNumbers: true }).verdict;
                    // The differential: the admission trial of the imported schema
                    // over the exact instance answers as vet does.
                    const sctx = aontu.ctx({ collect: true });
                    const sval = aontu.parse(report.aontu, {}, sctx);
                    const dctx = aontu.ctx({ collect: true });
                    const dval = aontu.parse(data, { exactNumbers: true }, dctx);
                    if (0 === sctx.err.length && 0 === dctx.err.length && null != sval && null != dval) {
                        const admitted = (0, admit_1.admits)(aontu, sval, dval);
                        if (admitted !== got) {
                            problems.push(`${file} | ${description} | ${name}: vet says ${got}, ` +
                                `the admission trial says ${admitted}`);
                        }
                    }
                }
                const skip = listed(skips, file, description, name);
                if (got === want) {
                    passed++;
                    if (null != skip && '*' !== skip.test) {
                        problems.push(`${file} | ${description} | ${name}: listed as a skip ` +
                            `(${skip.construct}) and passes; delete its row`);
                    }
                }
                else if (null == skip) {
                    problems.push(`${file} | ${description} | ${name}: wanted valid=${want} ` +
                        `and got valid=${got}, with no skip listed`);
                }
                else {
                    skip.used = true;
                    skipped++;
                }
            }
        }
    }
    for (const s of skips) {
        if (!s.used) {
            problems.push(`${s.file} | ${s.group} | ${s.test}: listed as a skip (${s.construct}) ` +
                'and nothing under it fails; delete its row');
        }
    }
    console.log(`jsonschema suite: ${total} tests, ${passed} pass, ${skipped} skipped, ` +
        `${skips.length} ledger rows`);
    Assert.deepStrictEqual(problems, [], problems.join('\n'));
});
//# sourceMappingURL=jsonschema-suite.test.js.map