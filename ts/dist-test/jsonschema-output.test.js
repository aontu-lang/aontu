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
// The official suite's output tests (ADR-066). Each schema is imported
// with its source map, each instance vetted as JSON Schema asks, and the
// report's basic output units checked against the schema the test gives
// for them, by the importer and vet themselves, against the ledger
// test/vectors/jsonschema/output-tests/skips.tsv.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const exactjson_1 = require("../dist/exactjson");
const jsonschema_import_1 = require("../dist/jsonschema-import");
const vet_1 = require("../dist/vet");
const sourcemap_1 = require("../dist/sourcemap");
const DIR = Path.join(__dirname, '..', '..', 'test', 'vectors', 'jsonschema', 'output-tests');
// The ledger may not grow past this; the register tightens it per phase.
const SKIP_BOUND = 4;
// Each release's directory, and the dialect its schemas are read in.
const RELEASES = [['draft2019-09', '2019-09'], ['draft2020-12', '2020-12']];
const VET = { noFill: true, exactNumbers: true };
(0, node_test_1.test)('the-suites-output-tests-check-the-basic-units', () => {
    const skips = Fs.readFileSync(Path.join(DIR, 'skips.tsv'), 'utf8').split('\n')
        .filter((l) => '' !== l.trim() && !l.startsWith('#'))
        .map((l) => l.split('\t')).map(([file, group, name, construct]) => ({ file, group, test: name, construct, used: false }));
    Assert.ok(skips.length <= SKIP_BOUND, `the output ledger holds ${skips.length} rows, past its bound of ${SKIP_BOUND}`);
    const problems = [];
    let total = 0;
    let passed = 0;
    for (const [release, dialect] of RELEASES) {
        const outputSchema = Fs.readFileSync(Path.join(DIR, release, 'output-schema.json'), 'utf8');
        const documents = { [JSON.parse(outputSchema).$id]: outputSchema };
        for (const name of Fs.readdirSync(Path.join(DIR, release, 'content')).sort()) {
            const file = release + '/content/' + name;
            for (const g of JSON.parse(Fs.readFileSync(Path.join(DIR, file), 'utf8'))) {
                const imported = (0, jsonschema_import_1.importJsonSchema)(JSON.stringify(g.schema), { dialect, sourceMap: true });
                for (const t of g.tests) {
                    total++;
                    const report = (0, vet_1.vet)(imported.aontu, JSON.stringify(t.data), VET);
                    const output = (0, sourcemap_1.vetOutput)(report, 'basic', { text: imported.aontu, map: imported.map });
                    const check = (0, jsonschema_import_1.importJsonSchema)(JSON.stringify(t.output.basic), { dialect, documents });
                    const verdict = (0, vet_1.vet)(check.aontu, (0, exactjson_1.exactJSON)(output), VET).verdict;
                    const skip = skips.find((s) => s.file === file && s.group === g.description &&
                        s.test === t.description);
                    if ('valid' === verdict) {
                        passed++;
                        if (null != skip) {
                            problems.push(`${file} | ${g.description} | ${t.description}: listed as a ` +
                                `skip (${skip.construct}) and passes; delete its row`);
                        }
                    }
                    else if (null == skip) {
                        problems.push(`${file} | ${g.description} | ${t.description}: the output ` +
                            `${(0, exactjson_1.exactJSON)(output)} is ${verdict} against the test's schema, with no skip listed`);
                    }
                    else {
                        skip.used = true;
                    }
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
    console.log(`output: ${total} tests, ${passed} pass, ${skips.length} ledger rows`);
    Assert.deepStrictEqual(problems, [], problems.join('\n'));
});
//# sourceMappingURL=jsonschema-output.test.js.map