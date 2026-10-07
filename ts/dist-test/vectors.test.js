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
// The vendored corpora under test/vectors/, each with a skip ledger both
// ports read: an answer that is not the corpus's own must be listed, a
// listed line that answers as the corpus says fails the run, so a fix
// deletes its own line, and a ledger may not outgrow its stated bound.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const vet_1 = require("../dist/vet");
const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors');
const VET = { at: '$.schema', noFill: true, exactNumbers: true };
// Where each value sits in its file, so that a schema and an instance
// reach the readers as the corpus wrote them: the host's JSON.parse
// would round `1e400` and lose the difference between `1.0` and `1`.
function spans(t) {
    let i = 0;
    const ws = () => {
        while (i < t.length && ' \t\n\r'.includes(t[i]))
            i++;
    };
    const str = () => {
        for (i++; '"' !== t[i]; i++) {
            if ('\\' === t[i])
                i++;
        }
        i++;
    };
    const val = () => {
        ws();
        const s = i;
        if ('{' === t[i] || '[' === t[i]) {
            const map = '{' === t[i++];
            const kv = new Map();
            const items = [];
            for (ws(); '}' !== t[i] && ']' !== t[i]; ws()) {
                if (map) {
                    ws();
                    const k = i;
                    str();
                    const key = JSON.parse(t.slice(k, i));
                    ws();
                    i++;
                    kv.set(key, val());
                }
                else {
                    items.push(val());
                }
                ws();
                if (',' === t[i])
                    i++;
            }
            i++;
            return map ? { s, e: i, kv } : { s, e: i, items };
        }
        if ('"' === t[i]) {
            str();
        }
        else {
            while (i < t.length && !',]} \t\n\r'.includes(t[i]))
                i++;
        }
        return { s, e: i };
    };
    return val();
}
function readLedger(file, keys) {
    const lines = new Map();
    let bound = -1;
    for (const line of Fs.readFileSync(file, 'utf8').split('\n')) {
        const stated = /^# bound (\d+)$/.exec(line);
        if (null != stated) {
            bound = Number(stated[1]);
        }
        else if ('' !== line && !line.startsWith('#')) {
            const cols = line.split('\t');
            const key = cols.slice(0, keys).join('\t');
            Assert.ok(!lines.has(key), 'listed twice: ' + key);
            lines.set(key, cols.slice(keys));
        }
    }
    Assert.ok(0 <= bound, file + ' states no bound');
    return { bound, lines };
}
function jsonFiles(dir, rel = '') {
    const out = [];
    for (const f of Fs.readdirSync(Path.join(dir, rel)).sort()) {
        const r = '' === rel ? f : rel + '/' + f;
        if (Fs.statSync(Path.join(dir, r)).isDirectory()) {
            out.push(...jsonFiles(dir, r));
        }
        else if (f.endsWith('.json')) {
            out.push(r);
        }
    }
    return out;
}
function sortKeys(v) {
    return Array.isArray(v) ? v.map(sortKeys) :
        null != v && 'object' === typeof v && !v.isVal &&
            (Object === v.constructor || null === Object.getPrototypeOf(v)) ?
            Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) :
            v;
}
// The import and the instance as one document, generated: it must stand
// up exactly where vet admits, and under --no-fill generate the
// instance's own value less each optional member it lacks.
function evalAccepts(source, data) {
    const one = source + '\ninstance: $.schema\ninstance: ' + data + '\n';
    const alone = 'instance: ' + data + '\n';
    let out;
    let own;
    try {
        const aontu = new aontu_1.Aontu({ exactNumbers: true });
        const ctx = aontu.ctx({ collect: true });
        out = aontu.generate(one, undefined, ctx);
        if (0 < ctx.err.length) {
            return false;
        }
        own = new aontu_1.Aontu({ exactNumbers: true }).generate(alone);
    }
    catch {
        return false;
    }
    const want = (0, aontu_1.exactJSON)(sortKeys(own.instance));
    if ((0, aontu_1.exactJSON)(sortKeys(out.instance)) === want) {
        return true;
    }
    const met = new aontu_1.Aontu({ exactNumbers: true }).unify(one);
    const prune = (g, u, d) => {
        if (true === u?.isMap && null != d && 'object' === typeof d &&
            !Array.isArray(d)) {
            for (const k of Object.keys(g)) {
                if (Object.prototype.hasOwnProperty.call(d, k)) {
                    g[k] = prune(g[k], u.peg[k], d[k]);
                }
                else if (u.optionalKeys.includes(k)) {
                    delete g[k];
                }
            }
        }
        else if (true === u?.isList && Array.isArray(d)) {
            g = g.map((x, i) => i < d.length ? prune(x, u.peg[i], d[i]) : x);
        }
        return g;
    };
    return (0, aontu_1.exactJSON)(sortKeys(prune(out.instance, met.peg.instance, own.instance))) === want;
}
// A corpus in the suite's own shape: groups of a schema and its tests.
// A listed test names, beside its key, what the import says it lost or
// why it refused, and the line must say exactly that.
function suiteProblems(root, ledger) {
    const problems = [];
    const seen = new Set();
    for (const file of jsonFiles(root)) {
        const text = Fs.readFileSync(Path.join(root, file), 'utf8');
        const at = (s, k) => text.slice(s.kv.get(k).s, s.kv.get(k).e);
        for (const group of spans(text).items) {
            const report = (0, aontu_1.importJsonSchema)(at(group, 'schema'));
            const account = 'error' === report.verdict ? report.errors[0].code :
                [...new Set(report.lossy.map((l) => l.construct))].sort().join(',') ||
                    '-';
            for (const t of group.kv.get('tests').items) {
                const key = [file, JSON.parse(at(group, 'description')),
                    JSON.parse(at(t, 'description'))].join('\t');
                Assert.ok(!seen.has(key), 'a test named twice: ' + key);
                seen.add(key);
                let honoured = false;
                if ('error' !== report.verdict) {
                    const data = at(t, 'data');
                    const accepts = 'valid' === (0, vet_1.vet)(report.source, data, VET).verdict;
                    honoured = accepts === ('true' === at(t, 'valid'));
                    if (accepts !== evalAccepts(report.source, data)) {
                        problems.push('vet and evaluation disagree: ' + key);
                    }
                }
                const listed = ledger.lines.get(key);
                if (null == listed && !honoured) {
                    problems.push('answers against the suite and is not listed: ' +
                        key + ' (' + account + ')');
                }
                else if (null != listed && honoured) {
                    problems.push('listed, but answers as the suite says: ' + key);
                }
                else if (null != listed && listed[0] !== account) {
                    problems.push('listed for ' + listed[0] + ', where the import says ' +
                        account + ': ' + key);
                }
            }
        }
    }
    for (const key of ledger.lines.keys()) {
        if (!seen.has(key)) {
            problems.push('listed, but names no test: ' + key);
        }
    }
    if (ledger.bound < ledger.lines.size) {
        problems.push(ledger.lines.size + ' lines, past the bound of ' + ledger.bound);
    }
    return problems;
}
// A case the suite marks for other releases only is not this dialect's
// to answer (the suite's README, "compatibility").
function for2020(compat) {
    return undefined === compat || compat.split(',').every((c) => {
        const n = Number(c.replace(/^<?=/, ''));
        return c.startsWith('<=') ? 2020 <= n : c.startsWith('=') ? 2020 === n :
            n <= 2020;
    });
}
const META = ['title', 'description', 'default', 'examples', 'readOnly',
    'writeOnly', 'format', 'contentEncoding', 'contentMediaType',
    'contentSchema'];
// The values a location collects for a keyword, read off the riders the
// meet leaves there, as JSON; an unknown keyword's values ride `x`.
function collected(node, keyword) {
    const json = (m) => (0, aontu_1.exactJSON)(sortKeys(m.gen(new aontu_1.Aontu({
        exactNumbers: true,
    }).ctx({ collect: true }))));
    const meta = node?.meta ?? {};
    const vals = 'deprecated' === keyword ?
        (null == node?.deprecation ? [] : ['true']) :
        META.includes(keyword) ? (meta[keyword] ?? []).map(json) :
            (meta.x ?? []).filter((m) => Object.prototype.hasOwnProperty.call(m.peg, keyword))
                .map((m) => json(m.peg[keyword]));
    return [...new Set(vals)].sort();
}
// A key still optional after the meet is one the instance does not have,
// and a container held beside a check is reached through it.
function pointerAt(node, pointer) {
    for (const seg of '' === pointer ? [] : pointer.slice(1).split('/')) {
        const k = seg.replace(/~1/g, '/').replace(/~0/g, '~');
        if (true === node?.isConjunct) {
            node = node.peg.find((t) => true === t.isMap || true === t.isList);
        }
        node = true === node?.isList ||
            (true === node?.isMap && !node.optionalKeys.includes(k)) ?
            node.peg[k] : undefined;
    }
    return node;
}
// The suite's annotations/ (its README): the values each assertion lists
// for a keyword at an instance location must be what the riders there
// hold once the instance meets the schema, compared as a set and not by
// the schema location that gave each (G12 design, section 16).
function annotationProblems(root, ledger) {
    const problems = [];
    const seen = new Set();
    for (const file of jsonFiles(root)) {
        const text = Fs.readFileSync(Path.join(root, file), 'utf8');
        const at = (s, k) => text.slice(s.kv.get(k).s, s.kv.get(k).e);
        for (const kase of spans(text).kv.get('suite').items) {
            if (!for2020(kase.kv.has('compatibility') ?
                JSON.parse(at(kase, 'compatibility')) : undefined)) {
                continue;
            }
            const report = (0, aontu_1.importJsonSchema)(at(kase, 'schema'));
            const account = 'error' === report.verdict ? report.errors[0].code :
                [...new Set(report.lossy.map((l) => l.construct))].sort().join(',') ||
                    '-';
            kase.kv.get('tests').items.forEach((t, n) => {
                let node = undefined;
                try {
                    node = 'error' === report.verdict ? undefined :
                        new aontu_1.Aontu({ exactNumbers: true }).unify(report.source +
                            '\ninstance: $.schema\ninstance: ' + at(t, 'instance') + '\n', { collect: true }).peg.instance;
                }
                catch { }
                for (const a of t.kv.get('assertions').items) {
                    const location = JSON.parse(at(a, 'location'));
                    const keyword = JSON.parse(at(a, 'keyword'));
                    const key = [file, JSON.parse(at(kase, 'description')), n + 1,
                        location, keyword].join('\t');
                    Assert.ok(!seen.has(key), 'an assertion named twice: ' + key);
                    seen.add(key);
                    const want = [...new Set([...a.kv.get('expected').kv.values()]
                            .map((e) => (0, aontu_1.exactJSON)(sortKeys(JSON.parse(text.slice(e.s, e.e))))))]
                        .sort();
                    const honoured = JSON.stringify(want) ===
                        JSON.stringify(collected(pointerAt(node, location), keyword));
                    const listed = ledger.lines.get(key);
                    if (null == listed && !honoured) {
                        problems.push('answers against the suite and is not listed: ' +
                            key + ' (' + account + ')');
                    }
                    else if (null != listed && honoured) {
                        problems.push('listed, but answers as the suite says: ' + key);
                    }
                    else if (null != listed && listed[0] !== account) {
                        problems.push('listed for ' + listed[0] + ', where the import ' +
                            'says ' + account + ': ' + key);
                    }
                }
            });
        }
    }
    for (const key of ledger.lines.keys()) {
        if (!seen.has(key)) {
            problems.push('listed, but names no assertion: ' + key);
        }
    }
    if (ledger.bound < ledger.lines.size) {
        problems.push(ledger.lines.size + ' lines, past the bound of ' + ledger.bound);
    }
    return problems;
}
(0, node_test_1.describe)('vectors', () => {
    (0, node_test_1.test)('json-schema-test-suite', () => {
        const dir = Path.join(VECTORS, 'jsonschema');
        const problems = suiteProblems(Path.join(dir, 'tests'), readLedger(Path.join(dir, 'skips.tsv'), 3));
        Assert.deepStrictEqual(problems, []);
    });
    (0, node_test_1.test)('json-schema-test-suite-annotations', () => {
        const dir = Path.join(VECTORS, 'jsonschema');
        const problems = annotationProblems(Path.join(dir, 'annotations', 'tests'), readLedger(Path.join(dir, 'annotation-skips.tsv'), 5));
        Assert.deepStrictEqual(problems, []);
    });
    (0, node_test_1.test)('ajv-extras', () => {
        const dir = Path.join(VECTORS, 'ajv-extras');
        const problems = suiteProblems(Path.join(dir, 'spec', 'extras'), readLedger(Path.join(dir, 'skips.tsv'), 3));
        Assert.deepStrictEqual(problems, []);
    });
    // Each parser case through the instance reader, as `vet` reads data,
    // and through the import's reader, as the import reads a schema.
    (0, node_test_1.test)('jsontestsuite', () => {
        const dir = Path.join(VECTORS, 'jsontestsuite');
        const ledger = readLedger(Path.join(dir, 'skips.tsv'), 2);
        const problems = [];
        const seen = new Set();
        for (const file of jsonFiles(Path.join(dir, 'test_parsing'))) {
            const bytes = Fs.readFileSync(Path.join(dir, 'test_parsing', file));
            const instance = 'valid' === (0, vet_1.vet)('any', bytes.toString('utf8'), { exactNumbers: true }).verdict;
            let text = '\uD800';
            try {
                text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
                    .decode(bytes);
            }
            catch { }
            const report = (0, aontu_1.importJsonSchema)(text);
            const read = !('error' === report.verdict &&
                report.errors[0].message.startsWith('the schema is not JSON'));
            const own = { y: 'accept', n: 'refuse' }[file[0]];
            for (const [reader, accepts] of [['instance', instance], ['import', read]]) {
                const key = file + '\t' + reader;
                seen.add(key);
                const answer = accepts ? 'accept' : 'refuse';
                const listed = ledger.lines.get(key);
                if (null == listed) {
                    if (answer !== own) {
                        problems.push('answers ' + answer + ' and is not listed: ' + key);
                    }
                }
                else if (listed[0] !== answer) {
                    problems.push('listed as ' + listed[0] + ', but answers ' + answer +
                        ': ' + key);
                }
                else if (answer === own) {
                    problems.push('listed, but answers as the corpus says: ' + key);
                }
            }
        }
        for (const key of ledger.lines.keys()) {
            if (!seen.has(key)) {
                problems.push('listed, but names no case: ' + key);
            }
        }
        if (ledger.bound < ledger.lines.size) {
            problems.push(ledger.lines.size + ' lines, past the bound of ' +
                ledger.bound);
        }
        Assert.deepStrictEqual(problems, []);
    });
});
//# sourceMappingURL=vectors.test.js.map