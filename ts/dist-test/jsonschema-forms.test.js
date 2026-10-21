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
// P6 of sketch/DEFINITION.0.md: every call and word the importer
// writes over the vendored corpora, strings removed, is a row of
// spec/forms.tsv, which the oracle writes from the definition's syntax,
// or of spec/forms-outside.tsv, the forms that wait on a decision, every
// row of which must still be written.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const jsonschema_import_1 = require("../dist/jsonschema-import");
const suite_1 = require("./suite");
const SPEC = Path.join(__dirname, '..', '..', 'spec');
function isWordChar(c) {
    return /[A-Za-z0-9_]/.test(c);
}
// A name before `(` is a call, and a name that is no key, no alias and no
// path segment is a word. A number is skipped whole, so the `e` of `1e5`
// and the `d` of `0d5` are no words.
function scan(text, site, uses) {
    const bare = text.replace(/"(?:[^"\\]|\\.)*"/g, '" "');
    let i = 0;
    while (i < bare.length) {
        const c = bare[i];
        if (/[A-Za-z_]/.test(c)) {
            let j = i;
            while (j < bare.length && isWordChar(bare[j])) {
                j++;
            }
            let k = j;
            while (k < bare.length && /\s/.test(bare[k])) {
                k++;
            }
            const prev = 0 < i ? bare[i - 1] : ' ';
            const next = bare[k] ?? '';
            if (!'%$.'.includes(prev)) {
                const name = bare.slice(i, j);
                if ('(' === next) {
                    uses.calls.has(name) || uses.calls.set(name, site);
                }
                else if (':' !== next && '?' !== next) {
                    uses.words.has(name) || uses.words.set(name, site);
                }
            }
            i = j;
        }
        else if (/[0-9]/.test(c)) {
            while (i < bare.length && (isWordChar(bare[i]) || '.' === bare[i])) {
                i++;
            }
        }
        else {
            i++;
        }
    }
}
// The suite in every dialect and Ajv's extras under the suite's remotes,
// and the SchemaStore subset under its own documents.
function corpora() {
    const suite = [];
    for (const [dir, dialect] of [['draft2020-12', undefined], ['draft2019-09', '2019-09'],
        ['draft7', 'draft-07'], ['draft6', 'draft-06'], ['draft4', 'draft-04']]) {
        suite.push(...(0, suite_1.suiteGroups)(Path.join(suite_1.VECTORS, 'jsonschema', 'tests', dir), dialect));
    }
    suite.push(...(0, suite_1.suiteGroups)(Path.join(suite_1.VECTORS, 'ajv-extras', 'tests')));
    const names = Fs.readdirSync(Path.join(suite_1.STORE, 'schemas')).filter((f) => f.endsWith('.json')).sort();
    const store = names.map((name) => ({
        file: 'schemastore/' + name, group: '', cases: [],
        schema: Fs.readFileSync(Path.join(suite_1.STORE, 'schemas', name), 'utf8'),
    }));
    return [{ groups: suite, documents: (0, suite_1.remotes)() }, { groups: store, documents: (0, suite_1.storeDocuments)(names) }];
}
function readOutside(forms) {
    const outside = (0, suite_1.rows)(Path.join(SPEC, 'forms-outside.tsv'))
        .map(([text, kind, decision, what]) => ({ text, kind, decision, what, used: false }));
    Assert.ok(outside.length <= 0, `spec/forms-outside.tsv holds ${outside.length} rows, past its bound of 0`);
    for (const o of outside) {
        Assert.ok(('call' === o.kind || 'word' === o.kind) && /^[0-9]+$/.test(o.decision) && '' !== o.what, `a row of spec/forms-outside.tsv names a call or word, a decision and a reason: ${o.text}`);
        Assert.ok(!forms.has(o.kind + ' ' + o.text), `${o.text} is a form of the definition; delete its row`);
    }
    return outside;
}
(0, node_test_1.test)('every-form-the-importer-writes-is-a-form-of-the-definition', () => {
    const forms = new Set((0, suite_1.rows)(Path.join(SPEC, 'forms.tsv'))
        .filter(([, kind]) => 'call' === kind || 'word' === kind)
        .map(([, kind, text]) => kind + ' ' + text));
    Assert.ok(20 < forms.size, 'spec/forms.tsv holds the definition\'s forms');
    const outside = readOutside(forms);
    const uses = { calls: new Map(), words: new Map() };
    let imported = 0;
    for (const { groups, documents } of corpora()) {
        for (const g of groups) {
            for (const defaults of [false, true]) {
                // ADR-065: the meta-schema check refuses no schema the import
                // would otherwise take here, and costs most of the run.
                const report = (0, jsonschema_import_1.importJsonSchema)(g.schema, {
                    path: g.file, documents, dialect: g.dialect, defaults, noMetaCheck: true,
                    formatAssertion: g.file.startsWith('optional/format/'),
                });
                if ('error' !== report.verdict) {
                    imported++;
                    scan(report.aontu, `${g.file} | ${g.group}`, uses);
                }
            }
        }
    }
    const problems = [];
    for (const [kind, used] of [['call', uses.calls], ['word', uses.words]]) {
        for (const [name, site] of [...used].sort()) {
            const row = outside.find((o) => o.kind === kind && o.text === name);
            if (null != row) {
                row.used = true;
            }
            else if (!forms.has(kind + ' ' + name)) {
                problems.push(`the ${kind} ${name} at ${site}: no form of the definition and no decision`);
            }
        }
    }
    for (const o of outside) {
        if (!o.used) {
            problems.push(`${o.text}: listed outside the definition and never written; delete its row`);
        }
    }
    console.log(`forms: ${imported} imports, ${uses.calls.size} calls, ${uses.words.size} words, ` +
        `${outside.length} outside the definition`);
    Assert.deepStrictEqual(problems, [], problems.join('\n'));
});
//# sourceMappingURL=jsonschema-forms.test.js.map