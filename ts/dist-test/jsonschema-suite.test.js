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
// The vendored JSON Schema corpora through the importer and `vet
// --no-fill --exact-numbers`, each against its own skip ledger, as
// test/vectors/README.md describes. Each schema and instance is the
// corpus's own text: a JSON reader that rounds numbers would test
// something else.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const jsonschema_import_1 = require("../dist/jsonschema-import");
const vet_1 = require("../dist/vet");
const admit_1 = require("../dist/admit");
const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors');
function rows(file) {
    return Fs.readFileSync(file, 'utf8').split('\n')
        .filter((line) => '' !== line.trim() && !line.startsWith('#'))
        .map((line) => line.split('\t'));
}
function readSkips(dir) {
    return rows(Path.join(dir, 'skips.tsv')).map(([file, group, name, construct]) => ({ file, group, test: name, construct, used: false }));
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
// The suite's remotes, served at http://localhost:1234/, and each under
// its own `$id` where it names another URI.
function remotes() {
    const out = {};
    const dir = Path.join(VECTORS, 'jsonschema', 'remotes');
    const all = files(dir, '', []).map((f) => [f, Fs.readFileSync(Path.join(dir, f), 'utf8')]);
    for (const [f, text] of all) {
        out['http://localhost:1234/' + f] = text;
    }
    for (const [, text] of all) {
        const id = JSON.parse(text)?.$id;
        if ('string' === typeof id && undefined === out[id]) {
            out[id] = text;
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
// The official suite's shape: files of groups, each a schema and its tests.
function suiteGroups(dir) {
    const out = [];
    for (const file of files(dir, '', [])) {
        const src = Fs.readFileSync(Path.join(dir, file), 'utf8');
        const groups = (0, jsonschema_import_1.parseJson)(src);
        Assert.ok('array' === groups.t, file + ' is not a suite file');
        for (const g of groups.items) {
            const schemaNode = member(g, 'schema');
            out.push({
                file, group: text(member(g, 'description')),
                schema: src.slice(schemaNode.off, schemaNode.end),
                cases: member(g, 'tests').items.map((t) => {
                    const dataNode = member(t, 'data');
                    return {
                        test: text(member(t, 'description')),
                        data: src.slice(dataNode.off, dataNode.end),
                        want: 'true' === member(t, 'valid').t,
                    };
                }),
            });
        }
    }
    return out;
}
// JSONTestSuite's shape: one JSON text per file, read as an instance of
// `true`; an implementation-defined file takes the answer pinned for it.
function parsingGroups(dir) {
    const decided = new Map(rows(Path.join(dir, 'decisions.tsv'))
        .map(([file, valid]) => [file, 'true' === valid]));
    const cases = Path.join(dir, 'test_parsing');
    return Fs.readdirSync(cases).sort().map((file) => {
        const want = 'y' === file[0] || ('n' !== file[0] && true === decided.get(file));
        Assert.ok('i' !== file[0] || decided.has(file), file + ' has no answer in decisions.tsv');
        return {
            file, group: file[0], schema: 'true',
            cases: [{ test: 'parse', data: Fs.readFileSync(Path.join(cases, file), 'utf8'), want }],
        };
    });
}
function runCorpus(name, bound, groups, documents) {
    const skips = readSkips(Path.join(VECTORS, name));
    Assert.ok(skips.length <= bound, `the ${name} skip ledger holds ${skips.length} rows, past its bound of ${bound}`);
    const problems = [];
    let total = 0;
    let passed = 0;
    let skipped = 0;
    const aontu = new aontu_1.Aontu();
    for (const g of groups) {
        const report = (0, jsonschema_import_1.importJsonSchema)(g.schema, { path: g.file, documents });
        for (const c of g.cases) {
            total++;
            let got = false;
            if ('error' !== report.verdict) {
                got = 'valid' === (0, vet_1.vet)(report.aontu, c.data, { noFill: true, exactNumbers: true }).verdict;
                // The differential: the admission trial of the imported schema
                // over the exact instance answers as vet does.
                const sctx = aontu.ctx({ collect: true });
                const sval = aontu.parse(report.aontu, {}, sctx);
                const dctx = aontu.ctx({ collect: true });
                const dval = aontu.parse(c.data, { exactNumbers: true }, dctx);
                if (0 === sctx.err.length && 0 === dctx.err.length && null != sval && null != dval) {
                    const admitted = (0, admit_1.admits)(aontu, sval, dval);
                    if (admitted !== got) {
                        problems.push(`${g.file} | ${g.group} | ${c.test}: vet says ${got}, ` +
                            `the admission trial says ${admitted}`);
                    }
                }
            }
            const skip = listed(skips, g.file, g.group, c.test);
            if (got === c.want) {
                passed++;
                if (null != skip && '*' !== skip.test) {
                    problems.push(`${g.file} | ${g.group} | ${c.test}: listed as a skip ` +
                        `(${skip.construct}) and passes; delete its row`);
                }
            }
            else if (null == skip) {
                problems.push(`${g.file} | ${g.group} | ${c.test}: wanted valid=${c.want} ` +
                    `and got valid=${got}, with no skip listed`);
            }
            else {
                skip.used = true;
                skipped++;
            }
        }
    }
    for (const s of skips) {
        if (!s.used) {
            problems.push(`${s.file} | ${s.group} | ${s.test}: listed as a skip (${s.construct}) ` +
                'and nothing under it fails; delete its row');
        }
    }
    console.log(`${name}: ${total} tests, ${passed} pass, ${skipped} skipped, ` +
        `${skips.length} ledger rows`);
    Assert.deepStrictEqual(problems, [], problems.join('\n'));
}
// Each ledger may not grow past its bound; the register tightens them.
(0, node_test_1.test)('the-json-schema-test-suite-runs-under-import-and-vet', () => runCorpus('jsonschema', 50, suiteGroups(Path.join(VECTORS, 'jsonschema', 'tests', 'draft2020-12')), remotes()));
(0, node_test_1.test)('ajvs-extra-tests-run-under-import-and-vet', () => runCorpus('ajv-extras', 0, suiteGroups(Path.join(VECTORS, 'ajv-extras', 'tests'))));
(0, node_test_1.test)('jsontestsuite-runs-as-instances-under-vet', () => runCorpus('jsontestsuite', 87, parsingGroups(Path.join(VECTORS, 'jsontestsuite'))));
//# sourceMappingURL=jsonschema-suite.test.js.map