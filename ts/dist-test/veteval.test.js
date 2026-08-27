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
// THE vet ≡ eval INVARIANT (ADR-007, use-cases/REVIEW.md finding C).
//
// For every schema S and data D, `vet(S, D)` and `eval(S ∪ D)` must
// AGREE ON ACCEPT/REJECT. Their reports legitimately differ — vet
// names roles and sites across two documents, eval raises the first
// failure — but a document the gate accepts must evaluate, and one it
// refuses must not. The review found five ways they disagreed, each of
// which passed a green suite, because nothing anywhere asserted the
// pair.
//
// The corpus is the SHARED SPEC's own vet rows, so this grows with
// every row anyone adds rather than with a fixture list someone has to
// remember to extend. That is the point of putting it here: the
// differential check is standing infrastructure beside the parity
// probe, not a one-off audit.
//
// The Go twin is TestVetEqualsEval in go/veteval_test.go, reading the
// same rows.
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
// Only `vet` rows, and only the ones with a single-document analogue.
// `--at` anchors a SUBTREE and `--closed` seals the anchor, and
// neither is anything one document spells -- they are options that
// change the TRUTH, so a union of the two texts is a different
// question. `partial` deliberately calls residue acceptable, which
// eval never does, and `maxErrors` changes the report rather than the
// verdict's meaning.
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
// S ∪ D as ONE document, and undefined when the pair has no
// single-document spelling.
//
// The usual case is two documents written as KEY STATEMENTS, and there
// concatenating the texts IS the union: a key stated twice is the
// meet, which is exactly what vet computes across the pair. It also
// keeps absolute references (`$.a`) pointing where they point, which
// matters -- those are the rows that catch a schema settling before
// the data arrives.
//
// A rootless value -- a braced/bracketed literal, a bare scalar -- has
// no keys to merge, and pasting `{"a":1}` after a statement is a
// syntax error rather than a meet. Those are met under a shared key
// instead. That reparents everything, so a source carrying an absolute
// reference has no honest wrapped form and the row is skipped.
function union(schema, data) {
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