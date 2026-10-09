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
// The official suite's annotation tests. Each assertion names a location
// in an instance, a keyword, and the values the schema annotates that
// location with; the schema is imported, met with the instance, and the
// riders at the location are read, against the ledger
// test/vectors/jsonschema/annotations/skips.tsv.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const exactjson_1 = require("../dist/exactjson");
const jsonschema_import_1 = require("../dist/jsonschema-import");
const ConjunctVal_1 = require("../dist/val/ConjunctVal");
const DIR = Path.join(__dirname, '..', '..', 'test', 'vectors', 'jsonschema', 'annotations');
// The ledger may not grow past this; the register tightens it per phase.
const SKIP_BOUND = 41;
// The record key an annotation keyword rides under; any other keyword
// rides `x`, under its own name.
const ANNOTATION_KEY = {
    title: 'title', description: 'description', $comment: 'comment',
    default: 'default', examples: 'examples', readOnly: 'readOnly',
    writeOnly: 'writeOnly', format: 'format', contentEncoding: 'contentEncoding',
    contentMediaType: 'contentMediaType', contentSchema: 'contentSchema',
};
// A release number alone is the earliest the case holds for, `<=` the
// latest, `=` the one, and commas join them.
function for2020(spec) {
    return undefined === spec || spec.split(',').every((c) => c.startsWith('<=') ? 2020 <= Number(c.slice(2)) :
        c.startsWith('=') ? 2020 === Number(c.slice(1)) : Number(c) <= 2020);
}
function member(node, key) {
    return 'object' === node.t ? node.entries.find((e) => e.key === key)?.val : undefined;
}
function items(node) {
    return 'array' === node?.t ? node.items : [];
}
// A conjunct still pending, such as a container beside a count, holds each term.
function held(node) {
    return null == node ? [] : true === node.isConjunct ? node.peg.flatMap(held) : [node];
}
// The values a keyword annotates a location of the met value with, as a
// set of canonical JSON, since a record holds each value once; none
// where the instance has no such location.
function annotationsAt(met, instance, location, keyword) {
    let nodes = [met];
    let inst = instance;
    for (const raw of location.split('/').slice(1)) {
        const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~');
        if (null == inst || 'object' !== typeof inst ||
            !Object.prototype.hasOwnProperty.call(inst, seg)) {
            return [];
        }
        inst = inst[seg];
        nodes = nodes.flatMap(held).filter((n) => true === n.isMap || true === n.isList)
            .map((n) => n.peg[seg]).filter((n) => null != n);
    }
    nodes = nodes.flatMap(held);
    if ('deprecated' === keyword) {
        return nodes.some((n) => null != n.deprecation) ? ['true'] : [];
    }
    const key = ANNOTATION_KEY[keyword];
    const vals = nodes.flatMap((n) => undefined === key ?
        (n.meta?.x ?? []).map((v) => v.peg?.[keyword]).filter((v) => null != v) :
        n.meta?.[key] ?? []);
    const ctx = new aontu_1.Aontu().ctx({ collect: true });
    return [...new Set(vals.map((v) => (0, exactjson_1.exactJSON)(v.gen(ctx))))].sort();
}
(0, node_test_1.test)('the-suites-annotation-tests-read-the-riders', () => {
    const skips = Fs.readFileSync(Path.join(DIR, 'skips.tsv'), 'utf8').split('\n')
        .filter((l) => '' !== l.trim() && !l.startsWith('#'))
        .map((l) => l.split('\t')).map(([file, group, name, construct]) => ({ file, group, test: name, construct, used: false }));
    Assert.ok(skips.length <= SKIP_BOUND, `the annotation ledger holds ${skips.length} rows, past its bound of ${SKIP_BOUND}`);
    const problems = [];
    let total = 0;
    let passed = 0;
    for (const file of Fs.readdirSync(Path.join(DIR, 'tests')).sort()) {
        const src = Fs.readFileSync(Path.join(DIR, 'tests', file), 'utf8');
        for (const c of items(member((0, jsonschema_import_1.parseJson)(src), 'suite'))) {
            const compat = member(c, 'compatibility');
            if (!for2020('string' === compat?.t ? compat.s : undefined)) {
                continue;
            }
            const group = member(c, 'description').s;
            const schemaNode = member(c, 'schema');
            const report = (0, jsonschema_import_1.importJsonSchema)(src.slice(schemaNode.off, schemaNode.end), { path: file });
            items(member(c, 'tests')).forEach((t, i) => {
                const instNode = member(t, 'instance');
                const instText = src.slice(instNode.off, instNode.end);
                const aontu = new aontu_1.Aontu();
                const ctx = aontu.ctx({ collect: true });
                const pair = new ConjunctVal_1.ConjunctVal({ peg: [
                        aontu.parse(report.aontu, {}, ctx), aontu.parse(instText, { exactNumbers: true }, ctx),
                    ] }, ctx);
                const met = aontu.unify(pair, undefined, ctx);
                const held = 0 === ctx.err.length && true !== met?.isNil;
                for (const a of items(member(t, 'assertions'))) {
                    total++;
                    const location = member(a, 'location').s;
                    const keyword = member(a, 'keyword').s;
                    const name = `test ${i}: ${'' === location ? '#' : location} ${keyword}`;
                    const expected = member(a, 'expected');
                    const want = [...new Set(expected.entries.map((e) => (0, exactjson_1.exactJSON)(JSON.parse(src.slice(e.val.off, e.val.end)))))].sort();
                    const got = held ? annotationsAt(met, JSON.parse(instText), location, keyword) : [];
                    const skip = skips.find((s) => s.file === file && s.group === group && s.test === name);
                    if (JSON.stringify(got) === JSON.stringify(want)) {
                        passed++;
                        if (null != skip) {
                            problems.push(`${file} | ${group} | ${name}: listed as a skip ` +
                                `(${skip.construct}) and passes; delete its row`);
                        }
                    }
                    else if (null == skip) {
                        problems.push(`${file} | ${group} | ${name}: wanted ${JSON.stringify(want)} ` +
                            `and got ${JSON.stringify(got)}, with no skip listed`);
                    }
                    else {
                        skip.used = true;
                    }
                }
            });
        }
    }
    for (const s of skips) {
        if (!s.used) {
            problems.push(`${s.file} | ${s.group} | ${s.test}: listed as a skip (${s.construct}) ` +
                'and nothing under it fails; delete its row');
        }
    }
    console.log(`annotations: ${total} assertions, ${passed} pass, ${skips.length} ledger rows`);
    Assert.deepStrictEqual(problems, [], problems.join('\n'));
});
//# sourceMappingURL=jsonschema-annotations.test.js.map