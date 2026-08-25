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
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const vet_1 = require("../dist/vet");
const subsume_1 = require("../dist/subsume");
const aontu_1 = require("../dist/aontu");
const SCHEMA = 'service: { name: string, port: integer }';
// THE REPAIR THE REPORT SAYS IS UNSAFE, made safe. A finding's site
// used to carry a point and no extent, so the only length available to
// a consumer was the CANON — and canon is not source text. Both halves
// are asserted here: the span-driven edit is exact, and the
// canon-driven one corrupts, so the test states what it prevents rather
// than only that it passes.
//
// Status report 2026-08-21 §5, "the manual fallback corrupts files".
// Twin: TestVetSiteSpanIsSafeToReplace in go/vet_test.go.
(0, node_test_1.describe)('vet-site-span', () => {
    const DATA = 'port: 0x1F\n';
    const siteOfFirstDataFinding = () => {
        const report = (0, vet_1.vet)('port: integer & min(9000)', DATA);
        Assert.equal(report.verdict, 'invalid');
        const site = report.findings[0].sites.find((s) => 'data' === s.role);
        Assert.ok(site, 'no data site');
        return site;
    };
    const replaceAt = (col, len, text) => DATA.slice(0, col - 1) + text + DATA.slice(col - 1 + len);
    (0, node_test_1.test)('the-span-covers-the-whole-literal', () => {
        const site = siteOfFirstDataFinding();
        Assert.equal(site.row, 1);
        Assert.equal(site.col, 7);
        // The canon is `31`; the source is `0x1F`. That gap IS the defect.
        Assert.equal(site.value, '31');
        Assert.equal(site.src, '0x1F');
        Assert.equal(site.len, 4);
    });
    (0, node_test_1.test)('replacing-by-the-span-is-exact', () => {
        const site = siteOfFirstDataFinding();
        Assert.equal(replaceAt(site.col, site.len, '9000'), 'port: 9000\n');
    });
    (0, node_test_1.test)('replacing-by-the-canon-length-corrupts', () => {
        // What a consumer had to do before, and what it produced: the canon
        // is two characters long, so the edit lands inside the literal and
        // leaves the rest of it behind.
        const site = siteOfFirstDataFinding();
        Assert.equal(replaceAt(site.col, String(site.value).length, '9000'), 'port: 90001F\n');
    });
    // THE INVARIANT, over the whole shared suite rather than one case:
    // a site that carries a span must describe the text at it. Reading
    // the document at (row, col, len) has to yield exactly `src`.
    //
    // This is not decoration. A site whose position and text disagree is
    // WORSE than a coarse one — a consumer following the verification
    // contract refuses every repair, and one skipping it edits the wrong
    // token. The first version of this change shipped exactly that
    // defect: `close({...})` reported the call's column beside the map's
    // `{`, so the document at the span read `c`. Found in review of the
    // pull request, and this is what stops it returning.
    (0, node_test_1.test)('every-span-in-the-suite-describes-its-own-text', () => {
        const specDir = Path.join(__dirname, '..', '..', 'test', 'spec');
        const rows = ['vet.tsv', 'subsume.tsv', 'deprecate.tsv'].flatMap((f) => Fs.readFileSync(Path.join(specDir, f), 'utf8')
            .replace(/\r\n/g, '\n').split('\n'));
        const unesc = (t) => {
            let o = '';
            for (let i = 0; i < t.length; i++) {
                const c = t[i];
                if ('\\' === c && i + 1 < t.length) {
                    const n = t[++i];
                    o += 'n' === n ? '\n' : 't' === n ? '\t' : n;
                }
                else
                    o += c;
            }
            return o;
        };
        let checked = 0;
        for (const line of rows) {
            const p = line.split('\t');
            if (!line || line.startsWith('#') || 5 > p.length)
                continue;
            if ('vet' !== p[1] && 'subsume' !== p[1])
                continue;
            const schema = unesc(p[2]), data = unesc(p[3]);
            const opts = (JSON.parse(unesc(p[4])) ?? {}).opts;
            // `subsume` roles the two documents general/specific; `vet` roles
            // them schema/data. Either way the FIRST column is the first
            // argument, which is what the role has to select between.
            const report = 'vet' === p[1]
                ? (0, vet_1.vet)(schema, data, opts)
                : (0, subsume_1.subsume)(schema, data, opts);
            for (const f of report.findings) {
                for (const site of f.sites ?? []) {
                    if (!(site.len > 0))
                        continue;
                    const text = ('data' === site.role || 'specific' === site.role) ? data : schema;
                    const line = text.split('\n')[site.row - 1];
                    Assert.ok(null != line, `${p[0]}: row ${site.row} past end of file`);
                    Assert.equal(line.substr(site.col - 1, site.len), site.src, `${p[0]}: the document at (${site.row}, ${site.col}, ${site.len}) ` +
                        `is not the site's own src`);
                    checked++;
                }
            }
        }
        // A silent zero would pass vacuously, exactly as the documentation
        // extractor could.
        Assert.ok(40 < checked, `only ${checked} spans checked`);
    });
    (0, node_test_1.test)('the-span-is-verifiable-against-the-document', () => {
        // The reason `src` is carried and not just `len`: a consumer can
        // check that the span still describes what it is about to replace.
        const site = siteOfFirstDataFinding();
        const line = DATA.split('\n')[site.row - 1];
        Assert.equal(line.substr(site.col - 1, site.len), site.src);
    });
});
(0, node_test_1.describe)('vet-verdicts', () => {
    (0, node_test_1.test)('valid-data-is-valid', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth", port: 8080 }');
        Assert.equal(r.verdict, 'valid');
        Assert.equal(r.truncated, false);
        Assert.deepEqual(r.findings, []);
    });
    (0, node_test_1.test)('contradiction-is-invalid', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth", port: "8080" }');
        Assert.equal(r.verdict, 'invalid');
        Assert.equal(r.findings.length, 1);
        Assert.equal(r.findings[0].code, 'no_scalar_unify');
        Assert.equal(r.findings[0].class, 'conflict');
        Assert.equal(r.findings[0].path, '$.service.port');
    });
    // The two negative verdicts are the mechanical answer to error.tsv's
    // conflation: a contradiction can never be satisfied, incompleteness
    // merely is not satisfied YET.
    (0, node_test_1.test)('residue-is-incomplete-not-invalid', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth" }');
        Assert.equal(r.verdict, 'incomplete');
        Assert.equal(r.findings.length, 1);
        Assert.equal(r.findings[0].class, 'incomplete');
        Assert.equal(r.findings[0].path, '$.service.port');
    });
    (0, node_test_1.test)('partial-opts-out-of-strict', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth" }', { partial: true });
        Assert.equal(r.verdict, 'valid');
        // The finding is still REPORTED — `--partial` changes the verdict,
        // not what the caller is told.
        Assert.equal(r.findings.length, 1);
    });
    (0, node_test_1.test)('contradiction-outranks-residue', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: 1 }');
        Assert.equal(r.verdict, 'invalid');
    });
    // A broken schema is never blamed on the data — verdict `error`, not
    // `invalid` — and it is not a bare verdict either: the finding says
    // what did not stand up and where, and BOTH sites name the schema.
    // The sites are the failure's OPERANDS, which the provenance walk
    // reaches only because it descends into a nil (ts/src/walk.ts);
    // without that the report named no file at all.
    (0, node_test_1.test)('broken-schema-is-never-blamed-on-data', () => {
        const r = (0, vet_1.vet)('a: 1\na: 2', 'a: 1');
        Assert.equal(r.verdict, 'error');
        Assert.equal(r.findings.length, 1);
        const f = r.findings[0];
        Assert.equal(f.code, 'scalar_value');
        Assert.equal(f.class, 'conflict');
        Assert.equal(f.path, '$.a');
        Assert.equal(f.sites.length, 2);
        for (const site of f.sites) {
            Assert.equal(site.role, 'schema');
            Assert.equal(site.file, 'schema');
        }
        // Source order, and the columns are the SCALARS'.
        Assert.equal(f.sites[0].row, 2);
        Assert.equal(f.sites[0].col, 4);
        Assert.equal(f.sites[1].row, 1);
        Assert.equal(f.sites[1].col, 4);
    });
    // A data document that will not parse is the DATA's fault: `invalid`
    // with a finding carrying the parser's own code, not `error`, which
    // is the schema's verdict. The engine already answered it this way
    // one character earlier — a refused CONSTRUCT reaches the tree as an
    // ordinary nil (see an-operandless-nil-reports-about-itself).
    (0, node_test_1.test)('unparseable-data-is-invalid-not-an-error-verdict', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'a: ]');
        Assert.equal(r.verdict, 'invalid');
        Assert.equal(r.findings.length, 1);
        const f = r.findings[0];
        Assert.equal(f.code, 'syntax');
        Assert.equal(f.class, 'parse');
        Assert.equal(f.path, '$');
        Assert.equal(f.sites.length, 1);
        Assert.equal(f.sites[0].role, 'data');
        Assert.equal(f.sites[0].value, 'nil');
        // No terminal escapes in a machine-readable report: the parser
        // colours its own marker, and this is the one finding family whose
        // text comes from there.
        Assert.ok(!f.message.includes('\u001b'));
        Assert.ok(f.message.startsWith('[aontu/'));
    });
    // A merge marker is refused before the parse, and it knows WHERE.
    (0, node_test_1.test)('a-conflict-marker-in-data-is-a-located-finding', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'a: 1\n<<<<<<< HEAD\nb: 2');
        Assert.equal(r.verdict, 'invalid');
        Assert.equal(r.findings[0].code, 'merge_conflict');
        Assert.equal(r.findings[0].sites[0].row, 2);
        Assert.equal(r.findings[0].sites[0].col, 1);
    });
    // The SCHEMA side keeps the error verdict: exit 4 means the run
    // could not be set up from the truth's side, and nothing else. It
    // reports through the same projection unparseable data does, with
    // the role and the verdict as the only difference.
    (0, node_test_1.test)('unparseable-schema-is-still-an-error-verdict', () => {
        const r = (0, vet_1.vet)('a: ]', 'a: 1');
        Assert.equal(r.verdict, 'error');
        Assert.equal(r.findings.length, 1);
        const f = r.findings[0];
        Assert.equal(f.code, 'syntax');
        Assert.equal(f.class, 'parse');
        Assert.equal(f.path, '$');
        Assert.equal(f.sites.length, 1);
        Assert.equal(f.sites[0].role, 'schema');
        Assert.equal(f.sites[0].file, 'schema');
    });
    // And a merge marker in the schema knows where it is, exactly as one
    // in the data does.
    (0, node_test_1.test)('a-conflict-marker-in-the-schema-is-a-located-finding', () => {
        const r = (0, vet_1.vet)('a: 1\n<<<<<<< HEAD\nb: 2', 'a: 1');
        Assert.equal(r.verdict, 'error');
        Assert.equal(r.findings[0].code, 'merge_conflict');
        Assert.equal(r.findings[0].sites[0].row, 2);
        Assert.equal(r.findings[0].sites[0].col, 1);
    });
});
(0, node_test_1.describe)('vet-findings', () => {
    (0, node_test_1.test)('sites-are-role-tagged-data-first', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth", port: "8080" }', { schemaUrl: 'service.aon', dataUrl: 'deploy.json' });
        const sites = r.findings[0].sites;
        Assert.equal(sites.length, 2);
        Assert.equal(sites[0].role, 'data');
        Assert.equal(sites[0].file, 'deploy.json');
        Assert.equal(sites[0].value, '"8080"');
        Assert.equal(sites[1].role, 'schema');
        Assert.equal(sites[1].file, 'service.aon');
        Assert.equal(sites[1].value, 'integer');
        Assert.ok(0 < sites[0].row);
        Assert.ok(0 < sites[0].col);
    });
    (0, node_test_1.test)('closed-key-finding-carries-one-site', () => {
        const r = (0, vet_1.vet)('service: close({ name: string })', 'service: { name: "auth", prot: 8080 }');
        Assert.equal(r.verdict, 'invalid');
        const f = r.findings.find((f) => 'closed' === f.code);
        Assert.ok(null != f);
        Assert.equal(f.path, '$.service.prot');
        Assert.equal(f.sites.length, 1);
        Assert.equal(f.sites[0].role, 'data');
    });
    // G1's atoms already attach the normalised residual and the offending
    // value; vet reads them where they are rather than re-deriving them.
    (0, node_test_1.test)('constraint-finding-carries-expected-and-actual', () => {
        const r = (0, vet_1.vet)('service: { port: integer & min(1024) }', 'service: { port: 80 }');
        const f = r.findings[0];
        Assert.equal(f.code, 'constraint');
        Assert.equal(f.expected, 'integer&min(1024)');
        Assert.equal(f.actual, '80');
        Assert.equal(f.note, undefined);
    });
    (0, node_test_1.test)('must-finding-carries-the-author-message-as-note', () => {
        const r = (0, vet_1.vet)('service: { tier: must("gold"|"silver","tier must be supported") }', 'service: { tier: "lead" }');
        const f = r.findings[0];
        Assert.equal(f.code, 'must');
        Assert.equal(f.note, 'tier must be supported');
        Assert.equal(f.expected, '"gold"|"silver"');
        Assert.equal(f.actual, '"lead"');
    });
    // A nil built during the PARSE of a document has no operands and
    // never passes through the unify error path, so both of its report
    // fields have to be filled in by vet itself: the site (about the nil
    // itself) and the message (materialised on demand).
    (0, node_test_1.test)('an-operandless-nil-reports-about-itself', () => {
        const r = (0, vet_1.vet)('a: integer', 'a: 9007199254740993');
        Assert.equal(r.verdict, 'invalid');
        const f = r.findings[0];
        Assert.equal(f.code, 'lossy_integer_literal');
        Assert.equal(f.sites.length, 1);
        Assert.equal(f.sites[0].role, 'data');
        Assert.equal(f.sites[0].value, 'nil');
        Assert.ok(f.message.startsWith('[aontu/lossy_integer_literal]'));
    });
    // The incomplete half of a report comes from the generate check,
    // which never renders its own text: without materialisation these
    // findings carried an empty message while the conflicts carried a
    // headline.
    (0, node_test_1.test)('an-incomplete-finding-carries-its-message', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth" }');
        Assert.equal(r.findings[0].message, '[aontu/mapval_no_gen]: Cannot resolve value at path $.service.port');
    });
    (0, node_test_1.test)('message-is-the-headline-only', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth", port: "8080" }');
        Assert.ok(r.findings[0].message.startsWith('[aontu/no_scalar_unify]'));
        Assert.ok(!r.findings[0].message.includes('\n'));
    });
    // A key may contain any character, so no punctuation is safe as a
    // path separator; the path is carried whole and never re-parsed.
    (0, node_test_1.test)('paths-are-not-delimiter-safe', () => {
        const r = (0, vet_1.vet)('"a b": integer', '"a b": "x"');
        Assert.equal(r.findings[0].path, '$.a b');
    });
    (0, node_test_1.test)('root-conflict-reports-the-root-path', () => {
        const r = (0, vet_1.vet)('1', '2');
        Assert.equal(r.verdict, 'invalid');
        Assert.equal(r.findings[0].path, '$');
    });
    // The spread constraint lives off-peg, so this is only reachable by
    // following it — but note WHERE the finding lands: the path is the
    // TEMPLATE's, not the instance's, because the conflict nil is created
    // against the template node. The data site still points at the
    // offending value, which is what a repair loop needs; naming the
    // instance path is a phase-3 report concern, recorded in the register.
    (0, node_test_1.test)('conflict-inside-a-spread-template-is-found', () => {
        const r = (0, vet_1.vet)('services: &: { port: integer }', 'services: { auth: { port: "80" } }');
        Assert.equal(r.verdict, 'invalid');
        Assert.equal(r.findings[0].path, '$.services.port');
        Assert.equal(r.findings[0].sites[0].role, 'data');
        Assert.equal(r.findings[0].sites[0].value, '"80"');
    });
});
(0, node_test_1.describe)('vet-ordering-and-limits', () => {
    // Two independent conflicts DO collect in one pass, so ordering is
    // observable without waiting for phase 6.
    (0, node_test_1.test)('findings-are-sorted-by-data-site-then-code', () => {
        const r = (0, vet_1.vet)('a: integer\nb: integer\nc: integer', 'c: "z"\na: "x"\nb: "y"');
        Assert.equal(r.findings.length, 3);
        const rows = r.findings.map((f) => f.sites[0].row);
        Assert.deepEqual(rows, [...rows].sort((x, y) => x - y));
    });
    (0, node_test_1.test)('findings-with-the-same-site-order-by-code', () => {
        const r = (0, vet_1.vet)('a: integer\nb: integer', 'a: "x"\nb: "y"');
        const codes = r.findings.map((f) => f.code);
        Assert.deepEqual(codes, [...codes].sort());
    });
    (0, node_test_1.test)('max-errors-caps-and-marks-truncated', () => {
        const r = (0, vet_1.vet)('a: integer\nb: integer\nc: integer', 'a: "x"\nb: "y"\nc: "z"', { maxErrors: 2 });
        Assert.equal(r.findings.length, 2);
        Assert.equal(r.truncated, true);
    });
    (0, node_test_1.test)('an-uncapped-report-is-not-truncated', () => {
        const r = (0, vet_1.vet)('a: integer\nb: integer', 'a: "x"\nb: "y"');
        Assert.equal(r.truncated, false);
    });
});
(0, node_test_1.describe)('vet-anchor', () => {
    (0, node_test_1.test)('at-selects-a-subtree', () => {
        const schema = 'services: { auth: { port: integer } }\nother: { junk: string }';
        const r = (0, vet_1.vet)(schema, 'auth: { port: 8080 }', { at: '$.services' });
        Assert.equal(r.verdict, 'valid');
    });
    (0, node_test_1.test)('at-accepts-a-bare-path', () => {
        const schema = 'services: { auth: { port: integer } }';
        const r = (0, vet_1.vet)(schema, 'auth: { port: "x" }', { at: 'services' });
        Assert.equal(r.verdict, 'invalid');
    });
    (0, node_test_1.test)('at-root-is-the-whole-schema', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'service: { name: "auth", port: 8080 }', { at: '$' });
        Assert.equal(r.verdict, 'valid');
    });
    // …AND IT SAYS WHICH SEGMENT. The verdict alone left a caller
    // holding exit 4 and an empty finding list, which is nothing to act
    // on; the refusal is the one `get` and `why` already give for a path
    // that names nothing, "did you mean" included.
    (0, node_test_1.test)('an-anchor-that-does-not-exist-is-an-error-verdict', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'a: 1', { at: '$.nope' });
        Assert.equal(r.verdict, 'error');
        Assert.equal(r.findings.length, 1);
        const f = r.findings[0];
        Assert.equal(f.code, 'no_path');
        Assert.equal(f.class, 'reference');
        Assert.equal(f.path, '$.nope');
        Assert.deepEqual(f.sites, []);
    });
    (0, node_test_1.test)('an-anchor-refusal-suggests-the-nearest-key', () => {
        const r = (0, vet_1.vet)(SCHEMA, 'a: 1', { at: '$.servce' });
        Assert.equal(r.findings[0].note, 'did you mean service?');
    });
    // An anchor is a STRUCTURAL path: map keys and list indices. Reading
    // it off whatever a value's peg held walked into a junction's
    // branches, a constraint's own arguments and an array's `length` —
    // the last handing back a JavaScript number, after which everything
    // validated.
    (0, node_test_1.test)('an-anchor-descends-only-through-bags', () => {
        Assert.equal((0, vet_1.vet)('a: 1|2', '1', { at: '$.a.0' }).verdict, 'error');
        Assert.equal((0, vet_1.vet)('a: min(2)', '3', { at: '$.a.0' }).verdict, 'error');
        Assert.equal((0, vet_1.vet)('a: [1,2]', '9', { at: '$.a.length' }).verdict, 'error');
        Assert.equal((0, vet_1.vet)('a: *1', '9', { at: '$.a.peg' }).verdict, 'error');
        // The two that DO descend still do.
        Assert.equal((0, vet_1.vet)('a: { b: integer }', '1', { at: '$.a.b' }).verdict, 'valid');
        Assert.equal((0, vet_1.vet)('a: [integer]', '1', { at: '$.a.0' }).verdict, 'valid');
    });
    (0, node_test_1.test)('an-anchor-through-a-scalar-is-an-error-verdict', () => {
        const r = (0, vet_1.vet)('a: 1', 'x: 1', { at: '$.a.b' });
        Assert.equal(r.verdict, 'error');
    });
    // `--closed` closes the ANCHOR, so a surplus key is only refused at
    // the level the run is anchored on: an unanchored run closes the
    // root, which says nothing about keys nested below it.
    (0, node_test_1.test)('closed-closes-the-anchor-for-this-run', () => {
        const open = (0, vet_1.vet)('service: { name: string }', 'service: { name: "auth" }\nextra: 1');
        Assert.equal(open.verdict, 'valid');
        const shut = (0, vet_1.vet)('service: { name: string }', 'service: { name: "auth" }\nextra: 1', { closed: true });
        Assert.equal(shut.verdict, 'invalid');
    });
    (0, node_test_1.test)('closed-applies-to-the-selected-anchor', () => {
        const open = (0, vet_1.vet)('service: { name: string }', 'name: "auth"\nextra: 1', { at: '$.service' });
        Assert.equal(open.verdict, 'valid');
        const shut = (0, vet_1.vet)('service: { name: string }', 'name: "auth"\nextra: 1', { at: '$.service', closed: true });
        Assert.equal(shut.verdict, 'invalid');
    });
    // A scalar anchor has no keys to close, so the flag is inert rather
    // than an error.
    (0, node_test_1.test)('closed-on-a-scalar-anchor-is-inert', () => {
        const r = (0, vet_1.vet)('a: integer', '1', { at: '$.a', closed: true });
        Assert.equal(r.verdict, 'valid');
    });
});
(0, node_test_1.describe)('vet-api', () => {
    // The package entry is what a consumer requires, so the re-export is
    // part of the contract rather than a convenience.
    (0, node_test_1.test)('vet-is-exported-from-the-package-entry', () => {
        Assert.equal(typeof aontu_1.vet, 'function');
        const r = (0, aontu_1.vet)('a: integer', 'a: 1');
        Assert.equal(r.verdict, 'valid');
    });
    // `schemaPath` and `dataPath` are the two documents' OWN bases: a
    // relative `@"file"` load inside either resolves from the directory
    // holding it, not from the process working directory -- which is
    // neither document's home, and may hold a same-named decoy. The two
    // paths are separate because the documents need not live together.
    (0, node_test_1.test)('each-document-resolves-its-own-includes', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-base-'));
        Fs.writeFileSync(Path.join(dir, 'part.aon'), 'port: integer');
        // The document is passed as TEXT and its path only says where it
        // came from -- but the loader resolves the base against a real
        // directory, so the file has to be there, which for every caller
        // that read the text out of it already is.
        const src = '@"part.aon"\nname: string';
        const data = 'name: "auth"\nport: 8080';
        const schemaPath = Path.join(dir, 'schema.aon');
        Fs.writeFileSync(schemaPath, src);
        Assert.equal((0, vet_1.vet)(src, data, { schemaPath }).verdict, 'valid');
        // Without the base the include is looked for beside the test
        // process instead, where there is no part.aon: a schema that will
        // not stand up is an `error` verdict, never the data's fault.
        Assert.equal((0, vet_1.vet)(src, data).verdict, 'error');
    });
});
(0, node_test_1.describe)('vet-containers', () => {
    // A list peg is an array, a map peg an object: the walk has to follow
    // both, and only a list conflict exercises the array arm.
    (0, node_test_1.test)('conflict-inside-a-list-is-found', () => {
        const r = (0, vet_1.vet)('a: [integer]', 'a: ["x"]');
        Assert.equal(r.verdict, 'invalid');
        Assert.equal(r.findings[0].path, '$.a.0');
    });
    (0, node_test_1.test)('nested-list-conflicts-are-all-reported', () => {
        const r = (0, vet_1.vet)('a: [integer, integer]', 'a: ["x", "y"]');
        Assert.equal(r.findings.length, 2);
    });
});
//# sourceMappingURL=vet.test.js.map