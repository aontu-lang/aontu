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
// Does the one document stand up: does it evaluate to a concrete
// value? `collect` so a failure is recorded rather than thrown, which
// is the same mode vet's own passes use.
function evalAccepts(src) {
    const aontu = new aontu_1.Aontu();
    const ctx = aontu.ctx({ collect: true });
    let out;
    try {
        out = aontu.generate(src, undefined, ctx);
    }
    catch {
        return false;
    }
    return 0 === ctx.err.length && undefined !== out;
}
// A document that USES a name it does not DECLARE has no single-document
// spelling: concatenation would hand it the other document's declaration,
// and a name does not cross between documents. Checking the union would
// then be checking a different question from the one the row asks.
const ALIAS_USE_RE = /%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*/g;
function borrowsAName(src) {
    const declared = new Set();
    for (const line of src.split('\n')) {
        const m = /^\s*(%[A-Za-z_][A-Za-z0-9_-]*)\s*=/.exec(line);
        if (null != m) {
            declared.add(m[1]);
        }
    }
    for (const use of src.match(ALIAS_USE_RE) ?? []) {
        if (!declared.has(use)) {
            return true;
        }
    }
    return false;
}
function union(schema, data) {
    if (borrowsAName(schema) || borrowsAName(data)) {
        return undefined;
    }
    if (statementForm(schema) && statementForm(data)) {
        return schema + '\n' + data + '\n';
    }
    if (schema.includes('$.') || data.includes('$.')) {
        return undefined;
    }
    return wrap(schema) + '\n' + wrap(data) + '\n';
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
            const one = union(row.schema, row.data);
            if (null == one) {
                skipped++;
                continue;
            }
            const evalOk = evalAccepts(one);
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