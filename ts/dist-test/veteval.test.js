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
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const vet_1 = require("../dist/vet");
const SPEC_DIR = Path.join(__dirname, '..', '..', 'test', 'spec');
function unescape(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if ('\\' === c && i + 1 < s.length) {
            const n = s[++i];
            out += 'n' === n ? '\n' : 't' === n ? '\t' : n;
        }
        else {
            out += c;
        }
    }
    return out;
}
function loadVetRows() {
    const rows = [];
    for (const file of Fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.tsv')).sort()) {
        const text = Fs.readFileSync(Path.join(SPEC_DIR, file), 'utf8');
        for (const line of text.split('\n').map((l) => l.replace(/\r$/, ''))) {
            if ('' === line || line.startsWith('#')) {
                continue;
            }
            const parts = line.split('\t');
            if ('vet' !== parts[1] || parts.length < 5) {
                continue;
            }
            const expect = JSON.parse(unescape(parts[4]));
            const opts = expect.opts ?? {};
            if (null != opts.at || true === opts.closed ||
                true === opts.partial || null != opts.maxErrors) {
                continue;
            }
            // A row whose source names the shared fixtures loads files; the
            // one-document form would have to resolve them from a different
            // base, which is a difference in the TEST rather than in the
            // engines.
            const schema = unescape(parts[2]);
            const data = unescape(parts[3]);
            if (schema.includes('__FIXTURES__') || data.includes('__FIXTURES__')) {
                continue;
            }
            rows.push({ file, name: parts[0], schema, data, opts });
        }
    }
    return rows;
}
// What the one document generates, or undefined where it does not
// stand up. `collect` so a failure is recorded rather than thrown, which
// is the same mode vet's own passes use.
function evalValue(src, opts) {
    const aontu = new aontu_1.Aontu(opts);
    const ctx = aontu.ctx({ collect: true });
    let out;
    try {
        out = aontu.generate(src, undefined, ctx);
    }
    catch {
        return undefined;
    }
    return 0 === ctx.err.length && undefined !== out ?
        (0, aontu_1.exactJSON)(sortKeys(out)) : undefined;
}
// What the one document generates less each optional member the data's
// own value lacks, which the admission trial removes before comparing.
function unfilled(src, opts, alone) {
    const ctx = new aontu_1.Aontu(opts).ctx({ collect: true });
    let met;
    let out;
    try {
        met = new aontu_1.Aontu(opts).unify(src, undefined, ctx);
        out = new aontu_1.Aontu(opts).generate(src);
    }
    catch {
        return undefined;
    }
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
    return (0, aontu_1.exactJSON)(sortKeys(prune(out, met, JSON.parse(alone))));
}
function sortKeys(v) {
    return Array.isArray(v) ? v.map(sortKeys) :
        null != v && Object === v.constructor ?
            Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) :
            v;
}
// A document that USES a name it does not DECLARE has no single-document
// spelling: concatenation would hand it the other document's declaration,
// and a name does not cross between documents. Checking the union would
// then be checking a different question from the one the row asks.
const ALIAS_USE_RE = /(?<!["\w])%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*/g;
function declaredNames(src) {
    const declared = new Set();
    for (const line of src.split('\n')) {
        const m = /^\s*(%[A-Za-z_][A-Za-z0-9_-]*)\s*=/.exec(line);
        if (null != m) {
            declared.add(m[1]);
        }
    }
    return declared;
}
function borrowsAName(src) {
    const declared = declaredNames(src);
    for (const use of src.match(ALIAS_USE_RE) ?? []) {
        if (!declared.has(use)) {
            return true;
        }
    }
    return false;
}
// A NAME DECLARED IN BOTH has no single-document spelling either:
// concatenation REdeclares it, which asks a different question.
function sharesADeclaration(schema, data) {
    const both = declaredNames(schema);
    for (const name of declaredNames(data)) {
        if (both.has(name)) {
            return true;
        }
    }
    return false;
}
// Under exactNumbers evaluation reads the schema by value too, so a
// schema whose literals read differently has no one-document spelling.
function readsAlike(schema) {
    const canon = (exactNumbers) => {
        try {
            return new aontu_1.Aontu({ exactNumbers }).parse(schema)?.canon;
        }
        catch {
            return undefined;
        }
    };
    return canon(false) === canon(true);
}
function union(schema, data, exactNumbers) {
    if (borrowsAName(schema) || borrowsAName(data) ||
        sharesADeclaration(schema, data) ||
        (exactNumbers && !readsAlike(schema))) {
        return undefined;
    }
    if (statementForm(schema) && statementForm(data)) {
        return { one: schema + '\n' + data + '\n', alone: data };
    }
    if (schema.includes('$.') || data.includes('$.')) {
        return undefined;
    }
    return { one: wrap(schema) + '\n' + wrap(data) + '\n', alone: wrap(data) };
}
// Written as key statements at the root, rather than as one literal.
function statementForm(src) {
    const t = src.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
        return false;
    }
    const aontu = new aontu_1.Aontu();
    const ctx = aontu.ctx({ collect: true });
    try {
        return true === aontu.unify(src, undefined, ctx)?.isMap;
    }
    catch {
        return false;
    }
}
function wrap(src) {
    const t = src.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
        return 'veteval: ' + t;
    }
    return statementForm(src)
        ? 'veteval: {\n' + src + '\n}'
        : 'veteval: (' + t + ')';
}
(0, node_test_1.describe)('vet-equals-eval', () => {
    const rows = loadVetRows();
    (0, node_test_1.test)('the-corpus-is-not-empty', () => {
        // A filter that quietly matched nothing would make every assertion
        // below vacuous, and a vacuous differential check is worse than
        // none: it reads as coverage.
        Assert.ok(20 < rows.length, 'vet rows found: ' + rows.length);
    });
    (0, node_test_1.test)('vet-and-eval-agree-on-accept-reject', () => {
        const disagree = [];
        let skipped = 0;
        for (const row of rows) {
            const report = (0, vet_1.vet)(row.schema, row.data, { ...row.opts, schemaUrl: 'schema', dataUrl: 'data' });
            const vetAccepts = 'valid' === report.verdict;
            const exact = true === row.opts.exactNumbers;
            const both = union(row.schema, row.data, exact);
            if (null == both) {
                skipped++;
                continue;
            }
            // Under --no-fill the one document generates the data's own value,
            // less the optional members the data does not carry.
            const opts = { exactNumbers: exact, trust: row.opts.trust };
            const got = evalValue(both.one, opts);
            const alone = evalValue(both.alone, opts);
            const evalOk = undefined !== got && (true !== row.opts.noFill ||
                (undefined !== alone && unfilled(both.one, opts, alone) === alone));
            if (vetAccepts !== evalOk) {
                disagree.push(`${row.file}:${row.name}` +
                    ` vet=${report.verdict}` +
                    ` eval=${evalOk ? 'generates' : 'refuses'}` +
                    ` | schema: ${JSON.stringify(row.schema)}` +
                    ` | data: ${JSON.stringify(row.data)}`);
            }
        }
        Assert.deepEqual(disagree, [], 'vet and eval disagree on ' + disagree.length + ' row(s):\n' +
            disagree.join('\n'));
        // A skip list that quietly grew to swallow the corpus would leave
        // this green over nothing, so the proportion is bounded too.
        Assert.ok(skipped * 4 < rows.length, 'too many rows have no single-document spelling: ' +
            skipped + ' of ' + rows.length);
    });
});
//# sourceMappingURL=veteval.test.js.map