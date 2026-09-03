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
/*
 * Shared, data-driven conformance tests.
 *
 * The test cases live in the top-level `test/spec/*.tsv` files and are
 * the single source of truth shared with the Go port (see
 * `go/spec_test.go`). Both implementations load the same TSV rows and
 * must produce identical results.
 *
 * TSV columns (tab-separated): name <TAB> mode <TAB> src <TAB> expect
 *   mode=canon : unify(src).canon must equal expect
 *   mode=gen   : generate(src) must deep-equal JSON.parse(expect)
 *   mode=gens  : generate(src), serialised to COMPACT JSON, must equal
 *                expect BYTE-FOR-BYTE
 *   mode=err   : generate(src) must throw, message must contain expect
 *   mode=errc  : generate(src) must throw, and the FIRST collected
 *                error's why-code must EQUAL expect (message text is
 *                not in parity; codes are -- see test/spec/errcodes.tsv)
 *   mode=errcode : registry row -- name is a code, src its class,
 *                expect its since-version; asserted against the
 *                engine's codeClasses table (ts/src/hints.ts)
 *   mode=vet   : FIVE columns -- name, vet, schema, data, expect. The
 *                report of vet(schema, data) must equal the expect
 *                object, MINUS each finding's message and hint (prose
 *                is not in parity; see test/spec/vet.tsv for the whole encoding,
 *                including the `opts` key)
 *   mode=subsume : FIVE columns -- name, subsume, general, specific,
 *                expect. The report of subsume(general, specific) must
 *                equal the expect object (verdict + findings), MINUS
 *                each finding's message; see test/spec/subsume.tsv
 *   mode=trim  : trimCheck(src) must equal the expect object
 *                ({redundant, verdict}); see test/spec/trim.tsv
 *   mode=jsonschema : jsonSchema(src) must equal the expect object
 *                ({lossy, schema, verdict}) -- the schema AND the loss
 *                report, because a schema that silently dropped a
 *                construct would look identical to one that carried
 *                it; see test/spec/jsonschema.tsv
 *   mode=hcanon : hcanon(unify(src)) -- the HASH FORM, canon plus the
 *                close()/type()/hide() wrappers -- must equal expect,
 *                and the hash form must round-trip (G6, hcanon.tsv)
 *   mode=hash  : canonHash(unify(src)) must equal expect, the full
 *                `aon1-...` pin, byte-identical across the ports
 *   mode=agentsmd : FIVE columns -- name, agentsmd, src,
 *                document-name, expect. The stanza of agentsMd(src,
 *                {name}) must match BYTE FOR BYTE; see
 *                test/spec/agentsmd.tsv
 *   mode=diff  : FIVE columns -- name, diff, left, input, expect. The
 *                report of diff(left, right) must match the expect
 *                object ({changes, same} plus `codes`); the input is
 *                {right, at?}. See test/spec/diff.tsv
 *   mode=patch : FIVE columns -- name, patch, entry, input, expect.
 *                The report of patch(entry, overlay, set) must match
 *                the expect object ({appended, overlay, verdict} plus
 *                `codes`); see test/spec/patch.tsv
 *   mode=why   : FIVE columns -- name, why, src, path, expect. The
 *                record of why(src, path) must match the expect object
 *                ({value, conjuncts} or {code, note}); see
 *                test/spec/why.tsv
 *   mode=query : FIVE columns -- name, query, src, path, expect. The
 *                report of get(src, path) must match the expect
 *                object ({out?, code?, note?}, options riding `opts`),
 *                and a canon-shaped VIEW must additionally SUBSUME the
 *                truth it summarises; see test/spec/query.tsv
 *   mode=view  : view(src, {relation?, roots?}) must equal the
 *                expect object ({kind, text} or {kind, errors}); the
 *                options ride `expect.ask` as reaches' do. See
 *                test/spec/view.tsv
 *   mode=views : viewSet(src, {views}) -- the figures a VIEW DOCUMENT
 *                declares -- must equal the expect object ({verdict,
 *                views} or {verdict, views, errors}); see
 *                test/spec/views.tsv
 *   mode=fmt   : format(src) must write expect BYTE FOR BYTE; expect
 *                must be a fixed point, format(expect) == expect; and
 *                where src evaluates, the canon-hash of src and of
 *                expect must agree -- the same document (FMT.0.md,
 *                docs/design). See test/spec/fmt.tsv
 * Escapes in src/expect: \n -> newline, \t -> tab, \\ -> backslash.
 *
 * gen vs gens: `gen` compares through a JSON decode, so both sides land
 * in float64 and two distinct exact integers above 2^53 compare EQUAL.
 * `gens` compares the serialised text instead, so it can pin exactness
 * (and key order, and integer-vs-float rendering) that `gen` cannot see.
 * The two runners must agree byte-for-byte on the same row: compact
 * output (no indentation, no spaces), keys in the engine's existing
 * generated order.
 */
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const jsonschema_1 = require("../dist/jsonschema");
const reach_1 = require("../dist/reach");
const aontu_2 = require("../dist/aontu");
const hints_1 = require("../dist/hints");
const IntegerVal_1 = require("../dist/val/IntegerVal");
const StringVal_1 = require("../dist/val/StringVal");
const BooleanVal_1 = require("../dist/val/BooleanVal");
const MapVal_1 = require("../dist/val/MapVal");
const NumberVal_1 = require("../dist/val/NumberVal");
const NullVal_1 = require("../dist/val/NullVal");
const BigIntegerVal_1 = require("../dist/val/BigIntegerVal");
const BigDecimalVal_1 = require("../dist/val/BigDecimalVal");
const Decimal_1 = require("../dist/val/Decimal");
// test/spec lives at the repo root, two levels up from ts/dist-test.
const SPEC_DIR = Path.join(__dirname, '..', '..', 'test', 'spec');
// Use forward slashes even on Windows: this path is spliced into Aontu
// source as a quoted @"..." load target, where backslashes would be parsed
// as string escapes (\t -> tab, \a -> a, ...) and corrupt the path.
const FIXTURES_DIR = Path.join(SPEC_DIR, 'files').replaceAll('\\', '/');
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
function loadRows() {
    const rows = [];
    const files = Fs.readdirSync(SPEC_DIR)
        .filter((f) => f.endsWith('.tsv'))
        // signature.tsv is the DECLARATION, not rows (its lines are the
        // signature syntax, docs/design/SIGNATURES.0.md); its own gate is
        // the round-trip in sig.test.ts, as go/sig_test.go is for the Go
        // port.
        .filter((f) => 'signature.tsv' !== f)
        .sort();
    for (const file of files) {
        const text = Fs.readFileSync(Path.join(SPEC_DIR, file), 'utf8');
        // Split on \n and tolerate CRLF checkouts (e.g. Windows) by dropping
        // any trailing \r so the last field never carries a stray carriage return.
        let lineno = 0;
        for (const line of text.split('\n').map((l) => l.replace(/\r$/, ''))) {
            lineno++;
            if ('' === line || line.startsWith('#')) {
                continue;
            }
            const parts = line.split('\t');
            // MALFORMED IS LOUD, not skipped. A row that is short by a column
            // -- a `vet` row whose expected report was left off, say -- would
            // otherwise be dropped in silence, and a suite that quietly runs
            // one row fewer stays green while the behaviour it claims to pin
            // goes unpinned. The Go runner refuses the same shapes.
            //
            // This, and not a row COUNT, is the guard: a count would have to
            // be edited by every change that adds a row, and a number nobody
            // trusts is a number nobody updates honestly. The only count
            // asserted is that the files were found at all
            // (spec-files-present below).
            const vetRow = 'vet' === parts[1] || 'subsume' === parts[1] ||
                'query' === parts[1] || 'why' === parts[1] || 'patch' === parts[1] ||
                'diff' === parts[1] || 'agentsmd' === parts[1];
            const want = vetRow ? 5 : 4;
            if (parts.length < want) {
                throw new Error(`malformed spec row: ${file} line ${lineno}: ${want} columns` +
                    ` required for mode "${parts[1]}", found ${parts.length}`);
            }
            rows.push({
                file,
                name: parts[0],
                mode: parts[1],
                // __FIXTURES__ -> absolute test/spec/files dir, so file-loading
                // (@"file") rows resolve to the shared fixtures from any cwd.
                src: unescape(parts[2]).replaceAll('__FIXTURES__', FIXTURES_DIR),
                data: vetRow ? unescape(parts[3]) : undefined,
                expect: unescape(parts[vetRow ? 4 : 3]),
            });
        }
    }
    return rows;
}
(0, node_test_1.describe)('spec', () => {
    const rows = loadRows();
    // Sanity: ensure the shared spec files were actually found.
    (0, node_test_1.test)('spec-files-present', () => {
        Assert.ok(0 < rows.length, 'no spec rows loaded from ' + SPEC_DIR);
    });
    for (const row of rows) {
        (0, node_test_1.test)(`${row.file}:${row.name}`, () => runRow(row));
    }
});
// Canon rows whose expected canon cannot be reparsed. Each entry needs a
// reason and an issue; entries are DELETED, not amended, when fixed
// (AGENTS.md ledger discipline). Currently EMPTY: every canon row in the
// shared suite reparses.
const CANON_NO_REPARSE = {};
// CANON CONVERGENCE -- the guard the G1/G2/G5 implementation plans call
// for. Those plans word it `parse(canon(v)) == v`, which is too strong
// and was never enforced: canon deliberately PRESERVES unevaluated ghost
// applications (`key()`, `pref(...)`, an unexpanded `&:` template), so
// reparsing a canon runs one more evaluation round and legitimately
// resolves them -- 15 of the 491 canon rows move on that first reparse.
//
// What does hold, for every row, is convergence: canon reaches a
// fixpoint immediately after that one round, so it can never oscillate
// or drift. That is the property worth pinning, and it is what makes
// canon safe as the seed of semantic hashing (G6).
function assertCanonConverges(row) {
    if (row.name in CANON_NO_REPARSE) {
        return;
    }
    const a1 = rowAontu(row);
    const c2 = a1.unify(row.expect, undefined, makeVarsCtx(a1)).canon;
    const a2 = rowAontu(row);
    const c3 = a2.unify(c2, undefined, makeVarsCtx(a2)).canon;
    Assert.strictEqual(c3, c2, `canon does not converge: ${row.name}`);
}
// The hash form's defining property (G6 phase 0): it is valid Aontu
// source, and re-evaluating it reproduces itself --
// hcanon(unify(parse(hcanon(v)))) == hcanon(v). A hash over a rendering
// that drifted on re-parse would pin nothing, so every hcanon row
// asserts it, exactly as every canon row asserts convergence.
// THE SAME DOCUMENT (FMT.0.md P2): where the source evaluates, its
// formatted form evaluates to the same canon-hash. A source that does
// not stand up on its own -- an include of a file that is not there,
// a value that never resolves -- has no hash to compare, and the
// fixed-point assertion above is what holds it.
function assertFormatSameDocument(row) {
    const a1 = rowAontu(row);
    const c1 = makeVarsCtx(a1);
    c1.collect = true;
    let v1;
    try {
        v1 = a1.unify(row.src, undefined, c1);
    }
    catch {
        // An include in value position with no file behind it THROWS out
        // of the resolver rather than collecting (a defect of the include
        // path, not of the row): no hash either way.
        return;
    }
    if (0 < c1.err.length || true === v1.isNil) {
        return;
    }
    const a2 = rowAontu(row);
    const c2 = makeVarsCtx(a2);
    c2.collect = true;
    const v2 = a2.unify(row.expect, undefined, c2);
    Assert.strictEqual((0, aontu_1.canonHash)(v2), (0, aontu_1.canonHash)(v1), `formatting moved the hash: ${row.name}`);
}
function assertHcanonRoundTrips(row) {
    const a1 = rowAontu(row);
    Assert.strictEqual((0, aontu_1.hcanon)(a1.unify(row.expect, undefined, makeVarsCtx(a1))), row.expect, `hash form does not round-trip: ${row.name}`);
}
// THE PROJECTION PROPERTY (G7 phase 1): a canon-shaped view is a valid
// Aontu document that SUBSUMES the truth it summarises -- generalisation,
// never distortion. G3 made that mechanically checkable, so every
// projection row asserts it instead of trusting the renderer.
//
// Under the `values` profile, deliberately: a shape view ERASES
// defaults (`*8080|integer` becomes `*integer|integer`), which the
// `defaults` profile correctly calls a compatibility break. The claim
// projections make is about the values admitted, not about which one
// is generated.
function assertViewSubsumes(row, report, opts) {
    const view = opts.view ?? 'json';
    if (!report.ok || ('canon' !== view && 'types' !== view)) {
        return;
    }
    const truth = (0, aontu_1.get)(row.src, row.data, { view: 'canon' });
    Assert.strictEqual((0, aontu_1.subsume)(report.out, truth.out, { profile: 'values' }).verdict, 'subsumes', `view does not subsume the truth: ${row.name}`);
}
// The report as a vet golden spells it: the message and the hint are
// EXCLUDED (prose is per-port, codes are not), and the rest goes
// through the emitter the two ports hold to byte parity -- which also
// sorts keys, so the golden cell may be written in any order.
// Each finding's message and hint, removed: prose is per-port, codes
// and shapes are not. The `trim` and `relation` modes apply it to their
// `errors` list -- WHY the document could not be evaluated, in the
// finding shape (the review's finding F).
function stripProse(findings) {
    return findings.map(({ message, hint, ...rest }) => rest);
}
function vetGolden(report) {
    return (0, aontu_1.exactJSON)({
        verdict: report.verdict,
        truncated: report.truncated,
        findings: report.findings.map(({ message, hint, ...rest }) => rest),
    });
}
// Files whose rows evaluate under a fixed trust profile (G5,
// docs/trust.md): root-confined to the fixtures directory, the
// var.tsv precedent of runner-side configuration. This is also what
// makes the shared suite itself HERMETIC: no row may read outside the
// repository or resolve through installed packages, in either runner
// (go/spec_test.go applies the same profile to the same files).
const TRUST_FILES = {
    'include-trust.tsv': true,
    'file.tsv': true,
    // Module resolution reads the filesystem (G6 phase 2), so mod.tsv's
    // rows run under the same fixture root for the same reason file.tsv's
    // do: no row may read outside the repository.
    'mod.tsv': true,
    // alias.tsv's two include rows load a fixture, for the same reason.
    'alias.tsv': true,
    // fmt.tsv's include rows name files that are not there, so that the
    // hash comparison is skipped for them rather than made through a
    // resolver that reads the working directory.
    'fmt.tsv': true,
};
function rowAontu(row) {
    return new aontu_1.Aontu(null != row.file && true === TRUST_FILES[row.file]
        ? { trust: { include: { root: FIXTURES_DIR } } }
        : {});
}
// Execute one spec row. Shared by the TSV-driven tests above and the
// gens-mode self-test below, so both go through the same comparison.
function runRow(row) {
    const a0 = rowAontu(row);
    // Fresh context per row carrying the shared $var test variables.
    const ctx = makeVarsCtx(a0);
    if ('canon' === row.mode) {
        Assert.strictEqual(a0.unify(row.src, undefined, ctx).canon, row.expect);
        assertCanonConverges(row);
    }
    else if ('gen' === row.mode) {
        Assert.deepStrictEqual(a0.generate(row.src, undefined, ctx), JSON.parse(row.expect));
    }
    else if ('gens' === row.mode) {
        Assert.strictEqual(genJSON(a0.generate(row.src, undefined, ctx)), row.expect);
        // REPEATABILITY (G5 determinism clause, docs/trust.md): the same
        // source under the same bindings must serialise to the same bytes on
        // a fresh engine. Re-running every gens row here pins that over the
        // whole byte-exact corpus rather than a handful of dedicated rows.
        const a1 = rowAontu(row);
        Assert.strictEqual(genJSON(a1.generate(row.src, undefined, makeVarsCtx(a1))), row.expect, `gens is not repeatable: ${row.name}`);
    }
    else if ('err' === row.mode) {
        Assert.throws(() => a0.generate(row.src, undefined, makeVarsCtx(a0)), (err) => {
            const msg = String(err && err.message);
            Assert.ok(msg.includes(row.expect), `expected error containing "${row.expect}", got: ${msg}`);
            return true;
        });
    }
    else if ('errc' === row.mode) {
        // Code parity: the FIRST collected error's why-code must EQUAL
        // expect. Message text is deliberately not in parity between the
        // ports; the codes in test/spec/errcodes.tsv are.
        Assert.throws(() => a0.generate(row.src, undefined, makeVarsCtx(a0)), (err) => {
            const errs = 'function' === typeof err?.errs ? err.errs() : [];
            const code = errs[0]?.why;
            Assert.strictEqual(code, row.expect, `expected error code "${row.expect}", got "${code}"` +
                ` (message: ${String(err && err.message).split('\n')[0]})`);
            return true;
        });
    }
    else if ('vet' === row.mode) {
        // The golden carries the run's options under `opts`; everything
        // else in it is the report.
        const golden = JSON.parse(row.expect);
        const opts = golden.opts;
        delete golden.opts;
        Assert.strictEqual(vetGolden((0, aontu_1.vet)(row.src, row.data, opts)), (0, aontu_1.exactJSON)(golden), `vet report mismatch: ${row.name}`);
    }
    else if ('subsume' === row.mode) {
        // Same golden discipline as vet: `opts` rides the expect object,
        // messages are per-port prose and excluded from parity.
        const golden = JSON.parse(row.expect);
        const opts = golden.opts;
        delete golden.opts;
        const report = (0, aontu_1.subsume)(row.src, row.data, opts);
        Assert.strictEqual((0, aontu_1.exactJSON)({
            verdict: report.verdict,
            findings: report.findings.map(({ message, ...rest }) => rest),
        }), (0, aontu_1.exactJSON)(golden), `subsume report mismatch: ${row.name}`);
    }
    else if ('trim' === row.mode) {
        const report = (0, aontu_1.trimCheck)(row.src);
        Assert.strictEqual((0, aontu_1.exactJSON)({
            redundant: report.redundant,
            verdict: report.verdict,
            ...(null == report.errors
                ? {} : { errors: stripProse(report.errors) }),
        }), (0, aontu_1.exactJSON)(JSON.parse(row.expect)), `trim report mismatch: ${row.name}`);
    }
    else if ('jsonschema' === row.mode) {
        // JSON SCHEMA EXPORT (the review's finding I): the schema AND the
        // loss report together, because a schema that silently dropped a
        // construct would look identical to one that carried it. The
        // envelope (version, verb) is the CLI's, not the export's, and is
        // not compared -- the same carve-out every other report mode takes.
        const report = (0, jsonschema_1.jsonSchema)(row.src);
        Assert.strictEqual((0, aontu_1.exactJSON)({
            lossy: report.lossy,
            schema: report.schema,
            verdict: report.verdict,
            ...(null == report.errors
                ? {} : { errors: stripProse(report.errors) }),
        }), (0, aontu_1.exactJSON)(JSON.parse(row.expect)), `jsonschema report mismatch: ${row.name}`);
    }
    else if ('reaches' === row.mode) {
        // REACHABILITY OVER THE ENTITY GRAPH (the review's finding J). The
        // endpoints ride the expect object under `ask`, because the row's
        // other columns are already spoken for and the question is part of
        // what the row pins: the same document answers differently for
        // different pairs, and for the same pair under a `relation` filter.
        const golden = JSON.parse(row.expect);
        const ask = golden.ask;
        delete golden.ask;
        const report = (0, reach_1.reachCheck)(row.src, ask.from, ask.to, null == ask.relation ? undefined : { relation: ask.relation });
        Assert.strictEqual((0, aontu_1.exactJSON)(null == report.errors
            ? report : { ...report, errors: stripProse(report.errors) }), (0, aontu_1.exactJSON)(golden), `reach report mismatch: ${row.name}`);
    }
    else if ('view' === row.mode) {
        // THE VIEWS (docs/design/VIEWS.0.md): the drawn text, byte for
        // byte, the loss report, or the refusal. The options ride
        // `expect.ask` -- the whole ViewOptions object, `kind` included --
        // for the reason reaches' endpoints do: the same document draws
        // differently under a relation filter or from a named root.
        const golden = JSON.parse(row.expect);
        const ask = golden.ask ?? {};
        delete golden.ask;
        const report = (0, aontu_2.view)(row.src, ask);
        Assert.strictEqual((0, aontu_1.exactJSON)(null == report.errors
            ? report : { ...report, errors: stripProse(report.errors) }), (0, aontu_1.exactJSON)(golden), `view report mismatch: ${row.name}`);
    }
    else if ('views' === row.mode) {
        // THE VIEW DOCUMENT (VIEWS.0.md, "6. The view document"): N figures
        // of one document, declared as data, compared as one report --
        // every figure's bytes and verdict, and every refusal, in the order
        // the declaration keys sort.
        const golden = JSON.parse(row.expect);
        const ask = golden.ask ?? {};
        delete golden.ask;
        const report = (0, aontu_2.viewSet)(row.src, ask);
        Assert.strictEqual((0, aontu_1.exactJSON)({
            ...report,
            ...(null == report.errors ? {} : { errors: stripProse(report.errors) }),
            views: report.views.map((v) => null == v.errors
                ? v : { ...v, errors: stripProse(v.errors) }),
        }), (0, aontu_1.exactJSON)(golden), `view set report mismatch: ${row.name}`);
    }
    else if ('relation' === row.mode) {
        // RELATION GRAPH CHECKS (G4 phase 5): acyclicity and inverse
        // consistency over the edge set, compared as the whole report.
        // Both are GLOBAL and NON-MONOTONE, which is why they are checked
        // after unification and never by it — a lattice citizen may not be
        // falsified by more information, and one more edge is more
        // information.
        const report = (0, aontu_1.relationCheck)(row.src);
        Assert.strictEqual((0, aontu_1.exactJSON)(null == report.errors
            ? report : { ...report, errors: stripProse(report.errors) }), (0, aontu_1.exactJSON)(JSON.parse(row.expect)), `relation report mismatch: ${row.name}`);
    }
    else if ('graph' === row.mode) {
        // THE DERIVED STRUCTURES (G4 phase 3): the entity index and the
        // edge set of the unified document, compared whole. Both are
        // deterministic by construction — ids and paths in code-point
        // order, edges by the position they are written at — which is what
        // makes a byte-comparable golden possible at all, Go map order
        // being random.
        const graph = (0, aontu_1.graphOf)(a0.unify(row.src, undefined, ctx));
        Assert.strictEqual((0, aontu_1.exactJSON)(graph), (0, aontu_1.exactJSON)(JSON.parse(row.expect)), `graph mismatch: ${row.name}`);
        // ... and DETERMINISTIC is a property, not a claim: a fresh engine
        // over the same source answers the same bytes.
        const a1 = rowAontu(row);
        Assert.strictEqual((0, aontu_1.exactJSON)((0, aontu_1.graphOf)(a1.unify(row.src, undefined, makeVarsCtx(a1)))), (0, aontu_1.exactJSON)(graph), `graph is not repeatable: ${row.name}`);
    }
    else if ('hcanon' === row.mode) {
        Assert.strictEqual((0, aontu_1.hcanon)(a0.unify(row.src, undefined, ctx)), row.expect);
        assertHcanonRoundTrips(row);
    }
    else if ('hash' === row.mode) {
        Assert.strictEqual((0, aontu_1.canonHash)(a0.unify(row.src, undefined, ctx)), row.expect);
    }
    else if ('fmt' === row.mode) {
        const report = (0, aontu_1.format)(row.src);
        Assert.strictEqual(report.verdict, 'formatted', `does not format: ${row.name}: ${JSON.stringify(report.errors)}`);
        Assert.strictEqual(report.text, row.expect);
        // THE AGREED FORM IS A FIXED POINT: formatting it again changes
        // nothing, or there would be two agreed forms.
        Assert.strictEqual((0, aontu_1.format)(row.expect).text, row.expect, `not a fixed point: ${row.name}`);
        assertFormatSameDocument(row);
    }
    else if ('fmt-refuse' === row.mode) {
        // A SOURCE THE FORMATTER REFUSES, pinned so the refusal is the
        // same one in both ports. The formatter's own self-check compares
        // the document it wrote against the document it read and writes
        // NOTHING when they differ, so a refusal here corrupts no file --
        // but which sources it refuses is behaviour, and behaviour is
        // shared. `expect` is the verdict and the finding codes, joined by
        // a colon and commas.
        const report = (0, aontu_1.format)(row.src);
        Assert.strictEqual(report.verdict + ':' +
            (report.errors ?? []).map((f) => f.code).join(','), row.expect, `fmt refusal: ${row.name}`);
    }
    else if ('fmt-lint' === row.mode) {
        // THE LINT (docs/design/FMT.0.md §4): the style findings of
        // --lint, each as `line:col: rule: message` -- the CLI's line
        // without the file name -- joined by newlines, and empty when
        // there is none. The formatter never acts on a finding, so the
        // text is the fmt rows' business, not this row's.
        const report = (0, aontu_1.format)(row.src, { lint: true });
        Assert.strictEqual(report.verdict, 'formatted', `does not format: ${row.name}: ${JSON.stringify(report.errors)}`);
        Assert.strictEqual(report.findings.map((f) => `${f.line}:${f.col}: ${f.rule}: ${f.message}`).join('\n'), row.expect, `fmt lint: ${row.name}`);
    }
    else if ('agentsmd' === row.mode) {
        const golden = JSON.parse(row.expect);
        const report = (0, aontu_1.agentsMd)(row.src, '' === row.data ? undefined : { name: row.data });
        Assert.strictEqual(report.ok, golden.ok, `agentsmd ok: ${row.name}`);
        Assert.strictEqual(report.stanza, golden.stanza ?? '', `agentsmd stanza: ${row.name}`);
        Assert.deepStrictEqual(0 === report.findings.length
            ? undefined : report.findings.map((f) => f.code), golden.codes, `agentsmd codes: ${row.name}`);
    }
    else if ('diff' === row.mode) {
        const input = JSON.parse(row.data);
        const golden = JSON.parse(row.expect);
        const report = (0, aontu_1.diff)(row.src, input.right, null == input.at ? undefined : { at: input.at });
        Assert.strictEqual((0, aontu_1.exactJSON)({
            changes: report.changes,
            same: report.same,
            ...(0 === report.findings.length
                ? {} : { codes: report.findings.map((f) => f.code) }),
        }), (0, aontu_1.exactJSON)(golden), `diff report mismatch: ${row.name}`);
        // A diff is SYMMETRIC in what it detects: swapping the sides
        // reports the same number of changes at the same paths, with
        // added and removed exchanged. Asserted for every row that
        // stands up, which is cheap and catches a one-sided walk.
        if (report.ok) {
            const back = (0, aontu_1.diff)(input.right, row.src, null == input.at ? undefined : { at: input.at });
            Assert.deepStrictEqual(back.changes.map((c) => c.path), report.changes.map((c) => c.path), `diff is not symmetric: ${row.name}`);
            Assert.deepStrictEqual(back.changes.map((c) => 'added' === c.kind ? 'removed' : 'removed' === c.kind ? 'added'
                : c.kind), report.changes.map((c) => c.kind), `diff kinds are not symmetric: ${row.name}`);
        }
    }
    else if ('patch' === row.mode) {
        const input = JSON.parse(row.data);
        const golden = JSON.parse(row.expect);
        // `inPlace` rides the input object, as `opts` does for the
        // five-column modes: the overlay and the assignments are the same
        // two inputs either way, and the flag is the third.
        const report = (0, aontu_1.patch)(row.src, input.overlay, input.set, true === input.inPlace ? { inPlace: true } : undefined);
        Assert.strictEqual((0, aontu_1.exactJSON)({
            appended: report.appended,
            overlay: report.overlay,
            verdict: report.verdict,
            ...(0 === report.replaced.length
                ? {} : { replaced: report.replaced }),
            ...(0 === report.findings.length
                ? {} : { codes: report.findings.map((f) => f.code) }),
        }), (0, aontu_1.exactJSON)(golden), `patch report mismatch: ${row.name}`);
        // IN-PLACE IS NEVER WORSE THAN APPEND. Every in-place row is run
        // again WITHOUT the flag and must reach a verdict at least as good
        // -- the whole safety claim of the mode is that asking for it
        // cannot turn a run that would have held into one that does not.
        if (true === input.inPlace) {
            const plain = (0, aontu_1.patch)(row.src, input.overlay, input.set);
            const rank = { valid: 0, incomplete: 1, invalid: 2, error: 3 };
            Assert.ok(rank[report.verdict] <= rank[plain.verdict], `in-place is worse than append: ${row.name} ` +
                `(${report.verdict} vs ${plain.verdict})`);
        }
        // ORDER-INDEPENDENCE, the property the whole verb rests on: an
        // overlay entry is just another conjunct, so evaluating the entry
        // against the overlay is the same as evaluating the overlay
        // against the entry.
        //
        // IT IS CONDITIONAL ON THE OVERLAY STANDING UP ON ITS OWN, and the
        // guard used to be `verdict !== error`, which is not the same test
        // and passed only because no row had reached the difference.
        // APPENDING A CONFLICTING VALUE MAKES THE OVERLAY SELF-
        // CONTRADICTORY -- `a: 1` plus an appended `"a": 5` is a document
        // that contradicts itself -- and vet reports a schema that does not
        // stand up as `error` whatever the data says. So the reverse run
        // answers `error` where the forward run answered `invalid`, and
        // that is not a disagreement about the value: it is the overlay no
        // longer being a document you could hand to vet as a truth. The
        // property is asserted where it is meaningful and skipped where the
        // input to the reverse direction is not a coherent document.
        let overlayStandsAlone = true;
        try {
            new aontu_1.Aontu().generate(report.overlay);
        }
        catch (e) {
            overlayStandsAlone = false;
        }
        if ('error' !== report.verdict && overlayStandsAlone) {
            Assert.strictEqual((0, aontu_1.vet)(report.overlay, row.src).verdict, report.verdict, `patch is not order-independent: ${row.name}`);
        }
        // AND THE STRONGER PROPERTY IN-PLACE BUYS: a replacement leaves an
        // overlay that still stands up, where appending the same value
        // leaves one that contradicts itself. This is the difference
        // between repairing a document and layering a correction over it,
        // and it is why the mode exists rather than a side effect of it.
        if (0 < report.replaced.length) {
            Assert.ok(overlayStandsAlone, `in-place left a self-contradicting overlay: ${row.name}`);
        }
    }
    else if ('why' === row.mode) {
        const golden = JSON.parse(row.expect);
        const report = (0, aontu_1.why)(row.src, row.data);
        Assert.strictEqual(report.record?.value, golden.value, `why value mismatch: ${row.name}`);
        Assert.strictEqual((0, aontu_1.exactJSON)(report.record?.conjuncts ?? null), (0, aontu_1.exactJSON)(golden.conjuncts ?? null), `why conjuncts mismatch: ${row.name}`);
        Assert.strictEqual(report.findings[0]?.code, golden.code, `why code mismatch: ${row.name}`);
        Assert.strictEqual(report.findings[0]?.note, golden.note, `why note mismatch: ${row.name}`);
    }
    else if ('query' === row.mode) {
        // The golden carries the run's options under `opts`; `out` is the
        // rendered slice, and `code`/`note` the finding when the answer is
        // a refusal. `message` is excluded, as every other verb's goldens
        // exclude it: prose is per-port, codes are not.
        const golden = JSON.parse(row.expect);
        const opts = golden.opts ?? {};
        const report = (0, aontu_1.get)(row.src, row.data, opts);
        Assert.strictEqual(report.out, golden.out ?? '', `query out mismatch: ${row.name}`);
        Assert.strictEqual(report.findings[0]?.code, golden.code, `query code mismatch: ${row.name}`);
        Assert.strictEqual(report.findings[0]?.note, golden.note, `query note mismatch: ${row.name}`);
        assertViewSubsumes(row, report, opts);
    }
    else if ('errcode' === row.mode) {
        // Registry row: name IS the code, src is its class, expect the
        // version line at which the code was first registered. The reverse
        // direction (every engine code registered in the tsv) is asserted
        // by the spec-errcodes-registry set-equality test below.
        const cls = hints_1.codeClasses[row.name];
        Assert.ok(undefined !== cls, `code "${row.name}" is not in the engine codeClasses table`);
        Assert.strictEqual(cls, row.src, `code "${row.name}": registry class "${row.src}",` +
            ` engine class "${cls}"`);
        Assert.ok(/^\d+\.\d+\.\d+$/.test(row.expect), `code "${row.name}": since-version "${row.expect}"` +
            ` is not a semver triple`);
    }
    else {
        throw new Error('unknown spec mode: ' + row.mode);
    }
}
// The `gens` mode is byte-exact machinery with no shared rows using it
// yet (it exists so Phase 2's exact leaves CAN be asserted). Prove the
// mode itself here, against the same runRow path the TSV rows take, so
// it is known-good before anything depends on it.
(0, node_test_1.describe)('spec-gens-mode', () => {
    (0, node_test_1.test)('gens-compares-bytes', () => {
        runRow({ name: 'g1', mode: 'gens', src: 'a:1', expect: '{"a":1}' });
        // Compact: no spaces, no indentation, keys in the engine's generated
        // order -- which is sorted, and matches Go's encoding/json for a map.
        runRow({
            name: 'g2', mode: 'gens',
            src: 'b:2\na:1\nc:[1,{d:x}]',
            expect: '{"a":1,"b":2,"c":[1,{"d":"x"}]}',
        });
        // Byte-exact, so integer 1 and float 1.0 both serialise as `1` --
        // gens pins the BYTES, canon pins the kind. Neither replaces the other.
        runRow({ name: 'g3', mode: 'gens', src: 'a:1.0', expect: '{"a":1}' });
        runRow({ name: 'g4', mode: 'gens', src: 'a:1.5', expect: '{"a":1.5}' });
        runRow({ name: 'g5', mode: 'gens', src: 'a:x', expect: '{"a":"x"}' });
    });
    (0, node_test_1.test)('gens-fails-on-any-byte-difference', () => {
        // A whitespace or ordering difference must fail: the point of the
        // mode is that it does not decode before comparing.
        Assert.throws(() => runRow({ name: 'g6', mode: 'gens', src: 'a:1', expect: '{"a": 1}' }));
        Assert.throws(() => runRow({ name: 'g7', mode: 'gens', src: 'b:2\na:1', expect: '{"b":2,"a":1}' }));
    });
    (0, node_test_1.test)('unknown-mode-still-fails-loudly', () => {
        Assert.throws(() => runRow({ name: 'g8', mode: 'genz', src: 'a:1', expect: '{"a":1}' }), /unknown spec mode: genz/);
    });
});
// The registry (test/spec/errcodes.tsv) and the engine's codeClasses
// table must agree as SETS. The errcode rows above assert "every
// registered code exists in the engine with the registered class"; this
// asserts the reverse -- an engine code missing from the registry (or a
// stale registry entry) fails here. The Go runner performs the same
// check against go/hints.go (TestErrCodesRegistry).
(0, node_test_1.describe)('spec-errcodes-registry', () => {
    (0, node_test_1.test)('registry-and-engine-agree', () => {
        const registered = loadRows()
            .filter((r) => 'errcode' === r.mode)
            .map((r) => r.name)
            .sort();
        const engine = Object.keys(hints_1.codeClasses).sort();
        Assert.deepStrictEqual(engine, registered, 'engine codeClasses table and test/spec/errcodes.tsv disagree');
    });
});
// Serialise a generated value for `gens` rows: compact JSON (no
// indentation, no spaces), keys in the order generate() produced them.
// Go's encoding/json Marshal is compact for the same reason, so the two
// runners produce the same bytes for the same value.
//
// The emitter is aontu's own public `exactJSON` export (D9), not
// JSON.stringify: the exact leaves generate a bigint (which
// JSON.stringify throws on) and a Decimal, and writing their digits as
// raw JSON numbers is the whole reason `gens` exists. Called with no
// indent argument, which is exactJSON's compact form -- the same bytes
// Go's compact encoder produces.
//
// The CLI calls the same export with an indent, so a `gens` row and the
// command line cannot disagree about anything but whitespace.
function genJSON(v) {
    return (0, aontu_1.exactJSON)(v);
}
// The $var test variables, shared with the Go runner (go/spec_test.go).
function makeVarsCtx(a0) {
    const ctx = a0.ctx();
    ctx.vars.foo = new IntegerVal_1.IntegerVal({ peg: 11 });
    ctx.vars.bar = new StringVal_1.StringVal({ peg: 'hello' });
    ctx.vars.flag = new BooleanVal_1.BooleanVal({ peg: true });
    ctx.vars.obj = new MapVal_1.MapVal({ peg: { x: new IntegerVal_1.IntegerVal({ peg: 1 }) } });
    // 2^60: an integer-kind value ABOVE the safe-integer range, so it renders
    // differently under `'' + peg` (the shortest round-tripping form,
    // 1152921504606847000) than under its exact digits. Every other binding
    // here renders identically either way, which is why no shared row could
    // reach the variable-as-path-segment rendering site until this existed.
    ctx.vars.big = new IntegerVal_1.IntegerVal({ peg: 1152921504606846976 });
    // One variable per remaining scalar kind, so shared rows can reach
    // every variable-as-path-segment rendering branch (coverage drive;
    // go/spec_test.go specVars mirrors these).
    ctx.vars.half = new NumberVal_1.NumberVal({ peg: 1.5 });
    ctx.vars.off = new BooleanVal_1.BooleanVal({ peg: false });
    ctx.vars.bigi = new BigIntegerVal_1.BigIntegerVal({ peg: 5n });
    ctx.vars.bigd = new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(15n, 1) });
    ctx.vars.nul = new NullVal_1.NullVal({ peg: null });
    // A FORMERLY RESERVED NAME, BOUND LIKE ANY OTHER. `$PARENT` was
    // intercepted by name in RefVal.find before the variable table was
    // ever consulted (ADR-009); removing that interception did not merely
    // stop the interception, it FREED THE NAME, and edge.tsv's
    // edge-parent-name-resolves is the row that says so. `KEY` and `SELF`
    // are deliberately left unbound so their rows can pin the other half:
    // an unbound one is `unknown_var`, exactly like any other.
    ctx.vars.PARENT = new StringVal_1.StringVal({ peg: 'q' });
    return ctx;
}
//# sourceMappingURL=spec.test.js.map