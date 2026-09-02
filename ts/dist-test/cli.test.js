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
const node_child_process_1 = require("node:child_process");
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const cli_1 = require("../dist/cli");
const CLI = Path.join(__dirname, '..', 'bin', 'aontu.js');
function run(args, input) {
    // The child does NOT inherit NODE_V8_COVERAGE. These cases assert the
    // packaged binary's behaviour; its coverage is contributed in-process
    // by coverage3.test.ts, and a grandchild's coverage file is not always
    // flushed before the runner aggregates — which made the ADR-002 gate
    // flaky rather than measuring anything extra.
    const env = { ...process.env };
    delete env.NODE_V8_COVERAGE;
    try {
        const out = (0, node_child_process_1.execFileSync)('node', [CLI, ...args], {
            input: input ?? '',
            encoding: 'utf8',
            env,
        });
        return { out, code: 0 };
    }
    catch (err) {
        // execFileSync throws on non-zero exit; capture stdout/stderr + code.
        return { out: (err.stdout ?? '') + (err.stderr ?? ''), code: err.status ?? 1 };
    }
}
(0, node_test_1.describe)('cli', () => {
    // --- unit: evalSource is the pure core the CLI renders with ---
    (0, node_test_1.test)('eval-json', () => {
        const r = (0, cli_1.evalSource)(new aontu_1.Aontu(), 'a:1 b:$.a', 'json');
        Assert.equal(r.ok, true);
        Assert.deepEqual(JSON.parse(r.text), { a: 1, b: 1 });
    });
    (0, node_test_1.test)('eval-canon', () => {
        const r = (0, cli_1.evalSource)(new aontu_1.Aontu(), 'a:*1|number', 'canon');
        Assert.equal(r.ok, true);
        Assert.equal(r.text, '{"a":*1|number}');
    });
    (0, node_test_1.test)('eval-error', () => {
        const r = (0, cli_1.evalSource)(new aontu_1.Aontu(), 'a:1 a:2', 'json');
        Assert.equal(r.ok, false);
        Assert.match(r.text, /Cannot unify value: 2 with value: 1/);
    });
    (0, node_test_1.test)('eval-empty', () => {
        const r = (0, cli_1.evalSource)(new aontu_1.Aontu(), '', 'json');
        Assert.equal(r.ok, true);
        Assert.deepEqual(JSON.parse(r.text), {});
    });
    // --- integration: the built binary, driven via stdin/args ---
    (0, node_test_1.test)('cli-version', () => {
        const r = run(['--version']);
        Assert.equal(r.code, 0);
        Assert.match(r.out, /^\d+\.\d+\.\d+/);
    });
    (0, node_test_1.test)('cli-help', () => {
        const r = run(['--help']);
        Assert.equal(r.code, 0);
        Assert.match(r.out, /Usage: aontu/);
    });
    (0, node_test_1.test)('cli-stdin-json', () => {
        const r = run([], 'port: *8080 | integer\nhost: localhost');
        Assert.equal(r.code, 0);
        Assert.deepEqual(JSON.parse(r.out), { port: 8080, host: 'localhost' });
    });
    (0, node_test_1.test)('cli-stdin-canon', () => {
        const r = run(['--canon'], 'a:1|2');
        Assert.equal(r.code, 0);
        Assert.equal(r.out.trim(), '{"a":1|2}');
    });
    (0, node_test_1.test)('cli-error-exit-code', () => {
        const r = run([], 'a:1 a:2');
        Assert.equal(r.code, 1);
        Assert.match(r.out, /Cannot unify value: 2 with value: 1/);
    });
    (0, node_test_1.test)('cli-unknown-option', () => {
        const r = run(['--nope']);
        Assert.equal(r.code, 2);
        Assert.match(r.out, /unknown option/);
    });
    // A MISTYPED VERB IS NOT A SUCCESS. `vet2` matches no subcommand, so
    // it falls through to the bare form as a file name; the last name
    // used to win, and the command answered about the DATA file with
    // exit 0 -- a plausible pass, in the one place a tool loop is
    // reading the exit code to decide whether the data is good.
    (0, node_test_1.test)('cli-mistyped-verb-is-a-usage-error', () => {
        const r = run(['vet2', 'schema.aon', 'data.json']);
        Assert.equal(r.code, 2);
        Assert.match(r.out, /evaluates one document, and 3 were given/);
        Assert.match(r.out, /mistyped verb reads as a file name/);
    });
    // The same refusal, reached the other way: the bare form is
    // documented as `aontu [options] [file]`, singular, and a second
    // file is a usage error rather than a silent discard.
    (0, node_test_1.test)('cli-two-files-is-a-usage-error', () => {
        const r = run(['a.aon', 'b.aon']);
        Assert.equal(r.code, 2);
        Assert.match(r.out, /evaluates one document, and 2 were given/);
    });
});
// --- the vet verb (G2 phase 3) ---------------------------------------
function vetCapture(fn) {
    const so = process.stdout.write;
    const se = process.stderr.write;
    let out = '';
    let err = '';
    process.stdout.write = (s) => ((out += s), true);
    process.stderr.write = (s) => ((err += s), true);
    try {
        fn();
    }
    finally {
        process.stdout.write = so;
        process.stderr.write = se;
        process.exitCode = 0;
    }
    return { out, err };
}
function vetFiles(schema, data) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-'));
    const s = Path.join(dir, 'schema.aon');
    const d = Path.join(dir, 'data.json');
    Fs.writeFileSync(s, schema);
    Fs.writeFileSync(d, data);
    return { dir, schema: s, data: d };
}
const VET_SCHEMA = 'service: { name: string, port: integer }';
(0, node_test_1.describe)('cli-vet', () => {
    // The verb's whole reason for existing: an agent emits a document,
    // the gate says what does not hold and WHERE, and the exit code says
    // which kind of "no" it was.
    (0, node_test_1.test)('vet-reports-conflicts-with-both-sites', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }');
        const r = vetCapture(() => (0, cli_1.runVet)([f.schema, f.data]));
        Assert.match(r.out, /verdict: invalid/);
        Assert.match(r.out, /\$\.service\.port: no_scalar_unify \[conflict\]/);
        Assert.match(r.out, /data: .*data\.json:1:\d+ \("8080"\)/);
        Assert.match(r.out, /schema: .*schema\.aon:1:\d+ \(integer\)/);
    });
    // A parent that collapses to a nil takes its subtree with it, so the
    // sibling conflict is reported on the CONTEXT rather than standing in
    // the tree. Both belong in the report: this is the design's own
    // motivating example, and it used to show half of what it found.
    (0, node_test_1.test)('vet-reports-findings-that-never-reached-the-tree', () => {
        const f = vetFiles('service: close({ name: string, port: integer, replicas: integer })', 'service: { name: "auth", prot: 8080, replicas: "3" }');
        const r = vetCapture(() => (0, cli_1.runVet)([f.schema, f.data]));
        Assert.match(r.out, /\$\.service\.prot: closed/);
        Assert.match(r.out, /\$\.service\.replicas: no_scalar_unify/);
    });
    (0, node_test_1.test)('vet-exit-codes-are-verdict-classes', () => {
        const valid = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }');
        Assert.equal(vetCapture(() => {
            Assert.equal((0, cli_1.runVet)([valid.schema, valid.data]), 0);
        }).out.trim(), 'verdict: valid');
        const invalid = vetFiles(VET_SCHEMA, 'service: { name: 1, port: 8080 }');
        vetCapture(() => Assert.equal((0, cli_1.runVet)([invalid.schema, invalid.data]), 1));
        const incomplete = vetFiles(VET_SCHEMA, 'service: { name: "auth" }');
        vetCapture(() => Assert.equal((0, cli_1.runVet)([incomplete.schema, incomplete.data]), 3));
        // --partial keeps reporting the residue but stops it failing.
        vetCapture(() => Assert.equal((0, cli_1.runVet)(['--partial', incomplete.schema, incomplete.data]), 0));
        const broken = vetFiles('a: 1\na: 2', 'a: 1');
        vetCapture(() => Assert.equal((0, cli_1.runVet)([broken.schema, broken.data]), 4));
    });
    // A data document that will not parse is the DATA's fault: exit 1
    // with a finding naming the file, not exit 4, which says the schema
    // is unusable. And one bad file among several must not blank the
    // findings the others earned.
    (0, node_test_1.test)('vet-unparseable-data-exits-1-and-names-the-file', () => {
        const f = vetFiles(VET_SCHEMA, 'service: ]');
        const r = vetCapture(() => Assert.equal((0, cli_1.runVet)([f.schema, f.data]), 1));
        Assert.match(r.out, /verdict: invalid/);
        Assert.match(r.out, /\$: syntax \[parse\]/);
        // LOCATED. The parser knows where it stopped and the site says
        // so; it used to read -1:-1 while the human renderer drew a caret
        // under the exact character.
        Assert.match(r.out, /data: .*data\.json:1:10 \(nil\)/);
        const good = Path.join(f.dir, 'good.json');
        Fs.writeFileSync(good, 'service: { name: 1, port: 8080 }');
        const both = vetCapture(() => Assert.equal((0, cli_1.runVet)([f.schema, good, f.data]), 1));
        Assert.match(both.out, /no_scalar_unify/);
        Assert.match(both.out, /syntax/);
    });
    (0, node_test_1.test)('vet-json-format-names-its-producer', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }');
        const r = vetCapture(() => (0, cli_1.runVet)(['--format', 'json', f.schema, f.data]));
        const report = JSON.parse(r.out);
        Assert.equal(report.aontu.verb, 'vet');
        Assert.match(report.aontu.version, /^\d+\.\d+\.\d+$/);
        Assert.equal(report.verdict, 'invalid');
        Assert.equal(report.truncated, false);
        Assert.equal(report.findings[0].code, 'no_scalar_unify');
        Assert.equal(report.findings[0].sites[0].role, 'data');
    });
    // A relative `@"file"` load inside either document resolves from THAT
    // document's directory, not from wherever the command was run —
    // which is what `aontu <file>` has always done. Before this, a
    // modular schema vetted from another directory came back `error`,
    // and a same-named file in the working directory was read instead.
    (0, node_test_1.test)('vet-resolves-includes-from-each-document', () => {
        const f = vetFiles('@"part.aon"\nname: string', 'name: "auth"\nport: 8080');
        Fs.writeFileSync(Path.join(f.dir, 'part.aon'), 'port: integer');
        const cwd = process.cwd();
        const decoy = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-cwd-'));
        Fs.writeFileSync(Path.join(decoy, 'part.aon'), 'port: string');
        try {
            process.chdir(decoy);
            vetCapture(() => Assert.equal((0, cli_1.runVet)([f.schema, f.data]), 0));
        }
        finally {
            process.chdir(cwd);
        }
    });
    (0, node_test_1.test)('vet-at-and-closed-reach-the-engine', () => {
        const f = vetFiles('services: { auth: { port: integer } }', 'auth: { port: 8080 }');
        vetCapture(() => Assert.equal((0, cli_1.runVet)(['--at', '$.services', f.schema, f.data]), 0));
        const g = vetFiles('service: { name: string }', 'service: { name: "auth" }\nextra: 1');
        vetCapture(() => Assert.equal((0, cli_1.runVet)([g.schema, g.data]), 0));
        vetCapture(() => Assert.equal((0, cli_1.runVet)(['--closed', g.schema, g.data]), 1));
    });
    (0, node_test_1.test)('vet-max-errors-truncates-and-says-so', () => {
        const f = vetFiles('a: integer\nb: integer\nc: integer', 'a: "x"\nb: "y"\nc: "z"');
        const r = vetCapture(() => Assert.equal((0, cli_1.runVet)(['--max-errors', '2', f.schema, f.data]), 1));
        Assert.match(r.out, /findings truncated/);
    });
    // The cap is on the REPORT, not on each file: two data files that
    // each come in under it can still overflow it together, and only the
    // aggregate cut catches that. Per-file capping alone would emit four
    // findings here and call the report whole.
    (0, node_test_1.test)('vet-max-errors-caps-the-report-not-each-file', () => {
        const f = vetFiles('a: integer\nb: integer', 'a: "x"\nb: "y"');
        const other = Path.join(f.dir, 'other.json');
        Fs.writeFileSync(other, 'a: "p"\nb: "q"');
        const r = vetCapture(() => Assert.equal((0, cli_1.runVet)(['--max-errors', '3', f.schema, f.data, other]), 1));
        Assert.match(r.out, /findings truncated/);
        Assert.equal(r.out.match(/no_scalar_unify \[conflict\]/g)?.length, 3);
    });
    // Several data files are several candidates for one truth, so each is
    // vetted on its own and the worst verdict wins.
    (0, node_test_1.test)('vet-takes-more-than-one-data-file', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }');
        const bad = Path.join(f.dir, 'bad.json');
        Fs.writeFileSync(bad, 'service: { name: "auth", port: "nope" }');
        const r = vetCapture(() => Assert.equal((0, cli_1.runVet)([f.schema, f.data, bad]), 1));
        Assert.match(r.out, /verdict: invalid/);
        Assert.match(r.out, /bad\.json/);
    });
    // …BUT A SCHEMA-SIDE FAULT IS ONE FAULT, however many data files are
    // named. `error` means the run could not be set up from the TRUTH's
    // side, so every data file would produce the identical finding;
    // concatenating them repeated one broken schema per file and, past
    // the cap, called the report `truncated` over a single underlying
    // problem. Invisible until the `error` verdict started carrying
    // findings at all. The twin is TestVetSchemaErrorReportsOnce in
    // go/cmd/aontu/vet_test.go.
    (0, node_test_1.test)('vet-schema-error-reports-once', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth" }');
        const broken = Path.join(f.dir, 'broken.aon');
        Fs.writeFileSync(broken, 'a: 1\na: 2\n');
        const second = Path.join(f.dir, 'second.json');
        Fs.writeFileSync(second, '{"a":1}');
        const r = vetCapture(() => Assert.equal((0, cli_1.runVet)(['--format', 'json', broken,
            f.data, second, f.data, second]), 4));
        const report = JSON.parse(r.out);
        Assert.equal(report.verdict, 'error');
        Assert.equal(report.findings.length, 1, r.out);
        Assert.equal(report.truncated, false);
        // The same for an anchor that names nothing: also data-independent.
        const at = vetCapture(() => Assert.equal((0, cli_1.runVet)(['--format', 'json', '--at', '$.nope', f.schema,
            f.data, second, f.data]), 4));
        const atReport = JSON.parse(at.out);
        Assert.equal(atReport.findings.length, 1, at.out);
        Assert.equal(atReport.findings[0].code, 'no_path');
    });
    // The usage errors all end with "(try --help)", so the verb answers
    // to it: same text as `aontu --help`, exit 0.
    (0, node_test_1.test)('vet-help-is-help-not-an-unknown-option', () => {
        for (const args of [['--help'], ['-h'], ['--help', 'a.aon', 'b.json']]) {
            const r = vetCapture(() => Assert.equal((0, cli_1.runVet)(args), 0));
            Assert.match(r.out, /aontu vet \[options\]/);
            Assert.equal(r.err, '');
        }
    });
    (0, node_test_1.test)('vet-usage-errors-exit-2', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }');
        for (const args of [
            [],
            [f.schema],
            ['--at'],
            ['--format', 'yaml', f.schema, f.data],
            ['--max-errors', 'lots', f.schema, f.data],
            ['--max-errors', '0', f.schema, f.data],
            ['--nope', f.schema, f.data],
        ]) {
            const r = vetCapture(() => Assert.equal((0, cli_1.runVet)(args), 2));
            Assert.match(r.err, /^aontu: /);
        }
    });
    (0, node_test_1.test)('vet-unreadable-file-exits-2-and-names-it', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }');
        const missing = Path.join(f.dir, 'no-such.json');
        const r = vetCapture(() => Assert.equal((0, cli_1.runVet)([f.schema, missing]), 2));
        Assert.match(r.err, /cannot read .*no-such\.json/);
    });
    (0, node_test_1.test)('vet-note-and-alternatives-reach-the-text-report', () => {
        const f = vetFiles('service: { tier: must("gold"|"silver","tier must be supported"),' +
            ' port: integer & min(1024) }', 'service: { tier: "lead", port: 80 }');
        const r = vetCapture(() => (0, cli_1.runVet)([f.schema, f.data]));
        Assert.match(r.out, /note: tier must be supported/);
        Assert.match(r.out, /expected: integer&min\(1024\)/);
        Assert.match(r.out, /actual: +80/);
    });
    // An OFF-PEG value still names its document: a preference's
    // synthesised type yardstick is not a peg entry, so provenance
    // reaches it only because the stamp walk follows it deliberately.
    // Before that it belonged to neither document, and the report said
    // so by naming no file at all.
    (0, node_test_1.test)('vet-site-off-peg-still-names-its-document', () => {
        const f = vetFiles('a: *1', 'a: {}');
        const r = vetCapture(() => (0, cli_1.runVet)([f.schema, f.data]));
        // The DEFAULT the author wrote, sited at its star (ADR-011 R1). The
        // finding used to name the gate the engine computed from it --
        // `integer`, which appears nowhere in the schema text a reader
        // opens. (It read `number` before that, while the gate widened to
        // the numeric family; removed 2026-08-25, status report §6.)
        Assert.match(r.out, /schema: .*schema\.aon:1:\d+ \(\*1\)/);
    });
    // The verb dispatches only as the FIRST argument, so a file argument
    // is never shadowed by a verb name.
    (0, node_test_1.test)('vet-dispatches-through-main', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }');
        const r = vetCapture(() => (0, cli_1.main)(['node', 'cli', 'vet', f.schema, f.data]));
        Assert.match(r.out, /verdict: valid/);
    });
    (0, node_test_1.test)('vet-verb-appears-in-help', () => {
        const r = run(['--help']);
        Assert.match(r.out, /aontu vet \[options\]/);
        Assert.match(r.out, /3 {2}incomplete/);
    });
    (0, node_test_1.test)('vet-end-to-end-exit-code', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }');
        const r = run(['vet', f.schema, f.data]);
        Assert.equal(r.code, 1);
        Assert.match(r.out, /verdict: invalid/);
    });
    // --- SARIF and watch (G2 phase 5) -----------------------------------
    // The interchange form: level from severity, the data site as the
    // primary location, the schema site related, the whole native finding
    // in properties. Shape parity with the Go port is the golden in
    // test/spec/files/vet-sarif/ (sarif.test.ts); this is the CLI wiring.
    (0, node_test_1.test)('vet-sarif-format-embeds-the-finding', () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }');
        const r = vetCapture(() => (0, cli_1.runVet)(['--format', 'sarif', f.schema, f.data]));
        const log = JSON.parse(r.out);
        Assert.equal(log.version, '2.1.0');
        Assert.match(log.$schema, /sarif-2\.1\.0/);
        const result = log.runs[0].results[0];
        Assert.equal(result.ruleId, 'aontu/no_scalar_unify');
        Assert.equal(result.level, 'error');
        Assert.equal(result.properties.path, '$.service.port');
        // DECODED before comparing: the uri percent-encodes URI-significant
        // bytes, and on Windows the temp path's backslashes are exactly
        // that (%5C), so the raw string equality only held on POSIX.
        Assert.equal(decodeURIComponent(result.locations[0].physicalLocation.artifactLocation.uri), f.data);
        Assert.equal(result.relatedLocations.length, 1);
        Assert.match(log.runs[0].tool.driver.version, /^\d+\.\d+\.\d+$/);
    });
    // The watch loop: one report per run, one run per change, streaming.
    // The waiter is injected so the loop is bounded; the report changing
    // between runs proves the files are re-read each time.
    (0, node_test_1.test)('vet-watch-streams-a-report-per-change', async () => {
        const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }');
        let calls = 0;
        const wait = async (files, before) => {
            Assert.deepEqual(files, [f.schema, f.data]);
            // The baseline is recorded BEFORE the run it follows, so a save
            // landing during the run still reads as a change.
            Assert.equal(typeof before, 'string');
            if (0 === calls++) {
                Fs.writeFileSync(f.data, 'service: { name: "auth", port: "80" }');
                return true;
            }
            return false;
        };
        let code = -1;
        const so = process.stdout.write;
        let out = '';
        process.stdout.write = (s) => ((out += s), true);
        try {
            code = await (0, cli_1.runVet)(['--watch', f.schema, f.data], wait);
        }
        finally {
            process.stdout.write = so;
        }
        Assert.equal(code, 1);
        Assert.match(out, /verdict: valid[\s\S]*verdict: invalid/);
    });
    // The real waiter resolves when a watched file's mtime+size signature
    // moves — including from "gone" to existing, which is what a file
    // being replaced by an editor looks like mid-save.
    (0, node_test_1.test)('vet-watch-change-resolves-on-touch', async () => {
        const f = vetFiles(VET_SCHEMA, 'service: {}');
        const missing = Path.join(f.dir, 'not-yet.json');
        const files = [f.schema, missing];
        const change = (0, cli_1.watchChange)(files, (0, cli_1.watchSignature)(files), 20);
        setTimeout(() => Fs.writeFileSync(missing, 'service: {}'), 120);
        Assert.equal(await change, true);
    });
    // The production waiter itself — the real poll interval, driven by a
    // real touch, so the composition runVet actually uses is exercised.
    (0, node_test_1.test)('vet-watch-production-waiter', async () => {
        const f = vetFiles(VET_SCHEMA, 'service: {}');
        const files = [f.schema, f.data];
        const change = (0, cli_1.vetWaiter)(files, (0, cli_1.watchSignature)(files));
        setTimeout(() => Fs.writeFileSync(f.data, 'service: { x: 1 }'), 250);
        Assert.equal(await change, true);
    });
});
// The subsumption verbs (G3 phase 3). What the two ports must AGREE on
// (the report itself) is pinned by test/spec/subsume.tsv; what each
// port owns (argument handling, exit codes, the text rendering, git
// resolution) is here. The Go twin is go/cmd/aontu/subsume_test.go.
(0, node_test_1.describe)('cli-subsume', () => {
    function subFiles(general, specific) {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-sub-'));
        const g = Path.join(dir, 'general.aon');
        const s = Path.join(dir, 'specific.aon');
        Fs.writeFileSync(g, general);
        Fs.writeFileSync(s, specific);
        return { dir, general: g, specific: s };
    }
    (0, node_test_1.test)('subsume-exit-codes-are-verdict-classes', () => {
        const yes = subFiles('a:integer', 'a:1');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runSubsume)([yes.general, yes.specific]), 0)).out.trim(), 'verdict: subsumes');
        const no = subFiles('a:integer', 'a:hello');
        const r = vetCapture(() => Assert.equal((0, cli_1.runSubsume)([no.general, no.specific]), 1));
        Assert.match(r.out, /verdict: does_not_subsume/);
        Assert.match(r.out, /\$\.a: compat_narrowed \[compat\]/);
        Assert.match(r.out, /general: .*general\.aon:1:3 \(integer\)/);
        Assert.match(r.out, /specific: .*specific\.aon:1:3 \("hello"\)/);
        const und = subFiles('a:{x:1}|{x:2}', 'a:{x:1|2}');
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)([und.general, und.specific]), 3));
        const broken = subFiles('a:1 a:2', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)([broken.general, broken.specific]), 4));
    });
    (0, node_test_1.test)('subsume-profile-selects-the-comparison', () => {
        const f = subFiles('a:*2|number', 'a:*1|number');
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--profile', 'values', f.general, f.specific]), 0));
        const r = vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--profile', 'defaults', f.general, f.specific]), 1));
        Assert.match(r.out, /compat_default_changed/);
    });
    (0, node_test_1.test)('subsume-at-anchors-both-documents', () => {
        const f = subFiles('a:{x:integer} b:2', 'a:{x:1} b:xyz');
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--at', '$.a', f.general, f.specific]), 0));
        // A path missing from either side is an error verdict.
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--at', '$.zz', f.general, f.specific]), 4));
    });
    (0, node_test_1.test)('subsume-json-names-the-producer', () => {
        const f = subFiles('a:integer', 'a:hello');
        const r = vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--format', 'json', f.general, f.specific]), 1));
        const report = JSON.parse(r.out);
        Assert.equal(report.aontu.verb, 'subsume');
        Assert.equal(report.verdict, 'does_not_subsume');
        Assert.equal(report.findings[0].code, 'compat_narrowed');
        Assert.equal(report.aontu.mode, undefined);
    });
    (0, node_test_1.test)('subsume-usage-errors-exit-2', () => {
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--bogus']), 2)).err.includes('unknown subsume option'), true);
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['one.aon']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--profile', 'bogus', 'a.aon', 'b.aon']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--at']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--format', 'sarif', 'a.aon', 'b.aon']), 2));
        const f = subFiles('a:1', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runSubsume)([Path.join(f.dir, 'missing.aon'), f.specific]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runSubsume)(['--help']), 0)).out.includes('aontu subsume'), true);
    });
    // The design's own motivating example: the v2 that renames nothing
    // but adds a required key and moves a default is BREAKING, with both
    // witnesses located.
    (0, node_test_1.test)('breaking-detects-the-designs-v1-v2-break', () => {
        const f = subFiles('service: close({name:string,port:*9090|integer,owner:string})', 'service: close({name:string,port:*8080|integer})');
        const r = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, f.general]), 1));
        Assert.match(r.out, /verdict: breaking/);
        Assert.match(r.out, /\$\.service\.owner: compat_required_added/);
        Assert.match(r.out, /\$\.service\.port: compat_default_changed/);
    });
    (0, node_test_1.test)('breaking-modes-choose-the-directions', () => {
        // Widening (v2 admits more) is fine backward, breaking forward.
        const f = subFiles('a:number', 'a:integer');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--mode', 'backward', f.general]), 0));
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--mode', 'forward', f.general]), 1));
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--mode', 'full', f.general]), 1));
    });
    // `--at` GATES A SUBTREE. A module's top level carries the version
    // string and the policy block, which are SUPPOSED to change between
    // releases -- so the whole-document comparison answered about them
    // rather than about the contract, and a release that bumped only its
    // version self-broke the gate. `subsume` has taken `--at` since G3;
    // `breaking` did not, so the only way to gate a subtree was to split
    // the file (use-cases/REVIEW.md finding D). The first leg is the
    // control: without it, the version bump alone is breaking.
    (0, node_test_1.test)('breaking-at-gates-a-subtree', () => {
        const f = subFiles('version: "2.0.0"\nsvc: {port: integer}', 'version: "1.0.0"\nsvc: {port: integer}');
        const whole = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, f.general]), 1));
        Assert.match(whole.out, /\$\.version: compat_narrowed/);
        const at = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--at', '$.svc', '--against', f.specific, f.general]), 0));
        Assert.match(at.out, /verdict: compatible/);
        // And it still gates: a narrowing INSIDE the anchor is refused.
        // Paths are reported from the ANCHOR, which is `subsume --at`'s
        // own convention.
        const g = subFiles('version: "2.0.0"\nsvc: {port: 8080}', 'version: "1.0.0"\nsvc: {port: integer}');
        const narrowed = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--at', '$.svc', '--against', g.specific, g.general]), 1));
        Assert.match(narrowed.out, /\$\.port: compat_narrowed/);
    });
    (0, node_test_1.test)('breaking-resolves-git-revisions', () => {
        const { execFileSync } = require('node:child_process');
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-brk-'));
        const file = Path.join(dir, 'svc.aon');
        const git = (...args) => execFileSync('git', [
            '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args,
        ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
        git('init', '-q', '.');
        Fs.writeFileSync(file, 'service: close({name:string,port:*8080|integer})');
        git('add', 'svc.aon');
        git('commit', '-q', '-m', 'v1');
        Fs.writeFileSync(file, 'service: close({name:string,port:*9090|integer,owner:string})');
        const r = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#HEAD', file]), 1));
        Assert.match(r.out, /verdict: breaking/);
        Assert.match(r.out, /specific: git#HEAD:1:\d+/);
        // The forward direction puts the git source on the general side.
        const fwd = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#HEAD', '--mode', 'forward', file]), 1));
        Assert.match(fwd.out, /general: git#HEAD:1:\d+/);
        // An unknown revision is a usage failure naming the spelling.
        const bad = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#no-such-rev', file]), 2));
        Assert.match(bad.err, /cannot resolve git#no-such-rev/);
        // A file the revision does not carry is refused by name rather
        // than compared against nothing.
        const absent = Path.join(dir, 'absent.aon');
        Fs.writeFileSync(absent, 'a: 1');
        const miss = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#HEAD', absent]), 2));
        Assert.match(miss.err, /absent\.aon is not in that revision/);
    });
    // THE OLD SIDE IS THE OLD TREE, not old entry text meeting new
    // includes. The git spelling used to resolve the old document's
    // `@"..."` loads against the WORKING tree, so a breaking change made
    // inside an included file compared against itself and answered
    // compatible -- the CI gate silently un-gated every non-entry file
    // (use-cases/BUGS.md §26). Both directions are asserted: the
    // narrowing is caught, and an unchanged tree stays compatible, so a
    // fix that simply reported breaking would fail too.
    (0, node_test_1.test)('breaking-git-compares-the-old-tree', () => {
        const { execFileSync } = require('node:child_process');
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-brk-tree-'));
        const model = Path.join(dir, 'model');
        Fs.mkdirSync(model);
        const entry = Path.join(model, 'entry.aon');
        const inc = Path.join(model, 'schema.aon');
        const git = (...args) => execFileSync('git', [
            '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args,
        ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
        git('init', '-q', '.');
        Fs.writeFileSync(entry, 'svc: @"schema.aon"');
        Fs.writeFileSync(inc, 'port: *8080|integer');
        // A file no include can name: the materialiser must skip it.
        Fs.writeFileSync(Path.join(dir, 'README.md'), '# not a source');
        git('add', '-A');
        git('commit', '-q', '-m', 'v1');
        // Unchanged tree: compatible.
        const same = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#HEAD', entry]), 0));
        Assert.match(same.out, /verdict: compatible/);
        // The narrowing lives in the INCLUDED file only.
        Fs.writeFileSync(inc, 'port: 8080');
        const r = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#HEAD', entry]), 1));
        Assert.match(r.out, /verdict: breaking/);
        Assert.match(r.out, /\$\.svc\.port/);
        // THE PATH TO THE ENTRY NEED NOT BE THE PATH GIT PRINTS. Reaching
        // the same file through a SYMLINK is the shape macOS and Windows
        // hand every run of this verb: on macOS a temp file under /var is
        // /private/var to git, and on Windows a TMP short name is the long
        // form -- so relativising git's toplevel against the caller's
        // resolved path subtracted two different coordinate systems, gave
        // a `../..` climb, and the entry was "not in that revision". Exit
        // 2 on both platforms, green on Linux, for the documented CI
        // spelling. The repo-relative path now comes from git itself
        // (`rev-parse --show-prefix`), so the caller's spelling cannot
        // matter -- and this row runs that case on every platform.
        //
        // Best-effort: Windows refuses a symlink without Developer Mode,
        // which is a privilege question rather than a defect in anything
        // being tested. Twin: TestBreakingGitEntryPathNeedNotBeGits.
        const linked = Path.join(dir, 'linked');
        let symlinked = true;
        try {
            Fs.symlinkSync(model, linked, 'dir');
        }
        catch {
            symlinked = false;
        }
        if (symlinked) {
            const via = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#HEAD', Path.join(linked, 'entry.aon')]), 1));
            Assert.match(via.out, /verdict: breaking/);
        }
        // No git binary at all: still a located usage failure, using the
        // spawn error's own message since there is no stderr to quote.
        const savedPath = process.env.PATH;
        try {
            process.env.PATH = '';
            const gone = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#HEAD', entry]), 2));
            Assert.match(gone.err, /cannot resolve git#HEAD/);
        }
        finally {
            process.env.PATH = savedPath;
        }
    });
    (0, node_test_1.test)('breaking-reads-the-documents-own-policy', () => {
        // The policy declares no compatibility promise: nothing to check,
        // whatever --against says.
        const f = subFiles('aontu_policy: hide({compat: *none|backward|forward|full})\na:1', 'a:hello');
        const r = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--format', 'json', f.general]), 0));
        const report = JSON.parse(r.out);
        Assert.equal(report.aontu.mode, 'none');
        Assert.equal(report.verdict, 'compatible');
        // --mode overrides the declaration.
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--mode', 'backward', f.general]), 1));
        // The none path renders as text too.
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, f.general]), 0)).out.trim(), 'verdict: compatible');
    });
    // The declaration's other spellings: a preference-free disjunction
    // declares its first alternative; a bare scalar declares itself; a
    // value that does not spell a mode (or a document that does not stand
    // alone) falls back to backward.
    (0, node_test_1.test)('breaking-policy-spellings', () => {
        const noPref = subFiles('aontu_policy: hide({compat: none|backward})\na:1', 'a:hello');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', noPref.specific, noPref.general]), 0));
        const bare = subFiles('aontu_policy: hide({compat: none})\na:1', 'a:hello');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', bare.specific, bare.general]), 0));
        const notString = subFiles('aontu_policy: hide({compat: 1})\na:integer', 'aontu_policy: hide({compat: 1})\na:1');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', notString.specific, notString.general]), 0));
        const notMode = subFiles('aontu_policy: hide({compat: sideways})\na:integer', 'aontu_policy: hide({compat: sideways})\na:1');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', notMode.specific, notMode.general]), 0));
        // A document that does not stand alone: the policy read yields
        // nothing, and the backward check itself reports the error.
        const broken = subFiles('a:1 a:2', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', broken.specific, broken.general]), 4));
    });
    (0, node_test_1.test)('breaking-allow-undecided-downgrades-the-exit', () => {
        const f = subFiles('a:{x:1}|{x:2}', 'a:{x:1|2}');
        const r = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, f.general]), 3));
        Assert.match(r.out, /verdict: undecided/);
        Assert.match(r.out, /sub_disjunct_distribution/);
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--allow-undecided', f.general]), 0));
        const j = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--format', 'json', f.general]), 3));
        Assert.equal(JSON.parse(j.out).aontu.mode, 'backward');
        Assert.equal(JSON.parse(j.out).verdict, 'undecided');
    });
    (0, node_test_1.test)('breaking-usage-errors-exit-2', () => {
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['file.aon']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against']), 2));
        const gf = subFiles('a:1', 'a:1');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'git#', gf.general]), 2)).err.includes('git# needs a revision'), true);
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--mode', 'sideways', '--against', 'a.aon', 'b.aon']), 2));
        // LAST, so the flag really has no argument: `--at --against x`
        // would take '--against' as the path, which is a different (and
        // already-covered) failure.
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', 'a.aon', 'b.aon', '--at']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--format', 'yaml', '--against', 'a.aon', 'b.aon']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--bogus']), 2));
        const f = subFiles('a:1', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', Path.join(f.dir, 'missing.aon'), f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)([Path.join(f.dir, 'missing.aon'), '--against', f.specific]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--help']), 0)).out.includes('aontu breaking'), true);
    });
    // Deprecate-then-remove is the supported rename path: a finding
    // about a value the old version already deprecated becomes a warning
    // under --allow-deprecated-removal, and warnings do not move the
    // verdict.
    (0, node_test_1.test)('breaking-allow-deprecated-removal', () => {
        const f = subFiles('service: close({name:string, listen:integer})', 'service: close({name:string, listen:integer,' +
            ' port:deprecate(integer,{msg:"renamed",use:"$.service.listen"})})');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, f.general]), 1));
        const r = vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', f.specific, '--allow-deprecated-removal', f.general]), 0));
        Assert.match(r.out, /verdict: compatible/);
        Assert.match(r.out, /\$\.service\.port: compat_narrowed/);
        // A removal the old version did NOT deprecate stays breaking.
        const g = subFiles('service: close({name:string})', 'service: close({name:string, port:integer})');
        vetCapture(() => Assert.equal((0, cli_1.runBreaking)(['--against', g.specific, '--allow-deprecated-removal', g.general]), 1));
    });
    // The old-version reader behind the downgrade, arm by arm — the Go
    // port exports the same reader (aontu.DeprecatedAt) and pins the same
    // arms in go/check-adjacent tests.
    (0, node_test_1.test)('breaking-deprecated-at-reader', () => {
        const src = 'a:[deprecate(1,{msg:"m"})] b:{c:deprecate(2,{msg:"n"})} d:3';
        Assert.equal((0, cli_1.deprecatedAt)(src, '$.a.0', 'x.aon'), true);
        Assert.equal((0, cli_1.deprecatedAt)(src, '$.b.c', 'x.aon'), true);
        Assert.equal((0, cli_1.deprecatedAt)(src, '$.a.5', 'x.aon'), false);
        Assert.equal((0, cli_1.deprecatedAt)(src, '$.zz', 'x.aon'), false);
        Assert.equal((0, cli_1.deprecatedAt)(src, '$.d.deeper', 'x.aon'), false);
        Assert.equal((0, cli_1.deprecatedAt)(src, '$.d', 'x.aon'), false);
        // A document that does not stand alone answers false: the check
        // that produced the finding already reported why.
        Assert.equal((0, cli_1.deprecatedAt)('a:1 a:2', '$.a', 'x.aon'), false);
    });
    // The trim reporter (G3 phase 6). Go twin: TestTrimVerb in
    // go/cmd/aontu/trim_test.go.
    (0, node_test_1.test)('trim-check-reports-redundant-paths', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-trim-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'a:{&:{deep:1}, b:{deep:1}, c:{other:2}}');
        const r = vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', file]), 1));
        Assert.match(r.out, /verdict: redundant/);
        Assert.match(r.out, /\$\.a\.b\.deep/);
        Fs.writeFileSync(file, 'x:{y:1}');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', file]), 0)).out.trim(), 'verdict: clean');
        // AN `error` VERDICT SAYS WHY (the review's finding F). Exit 4 is
        // the same as it was; what changed is that the report now carries
        // the reason, in text and in JSON, instead of a bare verdict.
        Fs.writeFileSync(file, 'a:1 a:2');
        const broken = vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', file]), 4));
        Assert.match(broken.out, /verdict: error/);
        Assert.match(broken.out, /\$\.a: scalar_value \[conflict\]/);
        const bj = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', '--format', 'json', file]), 4)).out);
        Assert.equal(bj.errors[0].code, 'scalar_value');
        // The document's own name, exactly as the command line spelled it.
        Assert.equal(bj.errors[0].sites[0].file, file);
        Fs.writeFileSync(file, 'a:{&:{k:1},m:{k:1}}');
        const j = vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', '--format', 'json', file]), 1));
        const report = JSON.parse(j.out);
        Assert.equal(report.aontu.verb, 'trim');
        Assert.equal(report.verdict, 'redundant');
        Assert.deepEqual(report.redundant, ['$.a.m.k']);
        // ABSENT, not empty, on a run that stood up: a consumer's presence
        // check is the whole test.
        Assert.equal('errors' in report, false);
    });
    (0, node_test_1.test)('trim-usage-errors-exit-2', () => {
        const f = subFiles('a:1', 'a:1');
        // Report-only: rewriting needs a format-preserving editor (G7),
        // so --check is required rather than silently defaulted.
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runTrim)([f.general]), 2)).err.includes('pass --check'), true);
        vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', f.general, f.specific]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--bogus']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', '--format', 'yaml', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--check', Path.join(f.dir, 'missing.aon')]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runTrim)(['--help']), 0)).out.includes('aontu trim'), true);
    });
    // The relation reporter (G4 phase 5). Go twin: TestRelationsVerb in
    // go/cmd/aontu/relations_test.go. What the two ports must AGREE on
    // (the report itself) is test/spec/relation.tsv's; what each port
    // owns — argument handling, exit codes, the text rendering — is here.
    (0, node_test_1.test)('relations-reports-cycles-and-missing-inverses', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-rel-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'a: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.b)]}\n' +
            'b: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.a)]}\n');
        const r = vetCapture(() => Assert.equal((0, cli_1.runRelations)([file]), 1));
        Assert.match(r.out, /verdict: fail/);
        Assert.match(r.out, /cycle \$\.a -> \$\.b -> \$\.a/);
        Assert.match(r.out, /\$\.b does not list \$\.a under usedBy/);
        // (The old declared-target rendering is gone with the code:
        // rel(t) flows at the site and its refusal is the engine's own,
        // pinned in test/spec/relation.tsv.)
        // Acyclic AND mirrored: nothing to report.
        Fs.writeFileSync(file, 'a: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.b)]}\n' +
            'b: {usedBy: rel() & [path($.a)]}\n');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runRelations)([file]), 0)).out.trim(), 'verdict: pass');
        // A document that does not stand up is not a document with a bad
        // graph -- and since the review's finding F it SAYS SO: exit 4 as
        // before, with the reason under it rather than a bare verdict.
        Fs.writeFileSync(file, 'a: 1 & 2');
        const rbroken = vetCapture(() => Assert.equal((0, cli_1.runRelations)([file]), 4));
        Assert.match(rbroken.out, /verdict: error/);
        Assert.match(rbroken.out, /\$\.a: scalar_value \[conflict\]/);
        const rbj = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runRelations)(['--format', 'json', file]), 4)).out);
        Assert.deepEqual(rbj.findings, []);
        Assert.equal(rbj.errors[0].code, 'scalar_value');
        Fs.writeFileSync(file, 'a: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.b)]}\n' +
            'b: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.a)]}\n');
        const j = vetCapture(() => Assert.equal((0, cli_1.runRelations)(['--format', 'json', file]), 1));
        const report = JSON.parse(j.out);
        Assert.equal(report.aontu.verb, 'relations');
        Assert.equal(report.verdict, 'fail');
        Assert.equal(report.findings.length, 3);
        Assert.equal(report.findings[0].code, 'relation_cycle');
        Assert.deepEqual(report.findings[0].detail, ['$.a', '$.b', '$.a']);
        // ABSENT, not empty, on a run that stood up: the graph had
        // findings, and nothing stopped the graph being looked at.
        Assert.equal('errors' in report, false);
    });
    // JSON SCHEMA EXPORT (the review's finding I / SUPPORT.md act 2). Go
    // twin: TestJsonSchemaVerb and friends in
    // go/cmd/aontu/jsonschema_test.go. What the two ports must AGREE on
    // (the schema and the loss report) is test/spec/jsonschema.tsv's;
    // what each port owns -- argument handling, exit codes, which stream
    // each half goes to -- is here.
    (0, node_test_1.test)('jsonschema-exports-the-model-and-names-what-it-cannot-carry', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-js-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'spec: {\n' +
            '  name: string & re("^[a-z]+$")\n' +
            '  tier: *"internal" | "critical"\n' +
            '  port?: integer & min(1024)\n' +
            '}\n');
        // THE SCHEMA GOES TO STDOUT so `aontu jsonschema x.aon > s.json`
        // writes a usable file, and --at names the subtree as vet's does.
        const r = vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--at', 'spec', file]), 0));
        const schema = JSON.parse(r.out);
        Assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
        Assert.equal(schema.properties.name.pattern, '^[a-z]+$');
        Assert.equal(schema.properties.tier.default, 'internal');
        Assert.deepEqual(schema.properties.tier.enum, ['internal', 'critical']);
        // An OPTIONAL key is simply absent from required, which is what
        // `k?:` means and what a consumer must be told.
        Assert.equal(schema.required.includes('port'), false);
        Assert.equal(r.err, '');
        // A LOSS IS NEVER SILENT -- and lands on the OTHER stream, so a
        // redirect keeps the schema clean and the warning visible.
        Fs.writeFileSync(file, 'a: integer & must(min(2), "two")\n');
        const lossy = vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)([file]), 0));
        Assert.match(lossy.out, /"type": "integer"/);
        Assert.match(lossy.err, /^lossy: \$\.a must:/);
        // ... and --strict turns the report into a refusal.
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--strict', file]), 1));
        // A document that does not stand up has nothing to export, and
        // says why in vet's finding shape.
        Fs.writeFileSync(file, 'a: 1\na: 2\n');
        const broken = vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)([file]), 4));
        Assert.equal(broken.out, '');
        Assert.match(broken.err, /scalar_value/);
        // An anchor that names nothing is the same class of refusal.
        Fs.writeFileSync(file, 'a: 1\n');
        const noat = vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--at', 'nope', file]), 4));
        Assert.match(noat.err, /no_path/);
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--format', 'json', file]), 0)).out);
        Assert.equal(j.aontu.verb, 'jsonschema');
        Assert.equal(j.verdict, 'ok');
        Assert.deepEqual(j.lossy, []);
        Assert.equal('errors' in j, false);
        // The SAME refusal under --format json puts the findings in the
        // envelope instead of on stderr, so one redirect keeps both halves.
        Fs.writeFileSync(file, 'a: 1\na: 2\n');
        const je = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--format', 'json', file]), 4)).out);
        Assert.equal(je.verdict, 'error');
        Assert.deepEqual(je.schema, {});
        Assert.equal(je.errors[0].code, 'scalar_value');
    });
    (0, node_test_1.test)('jsonschema-usage-errors-exit-2', () => {
        const f = subFiles('a:1', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)([f.general, f.specific]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--bogus', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--format', 'yaml', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--at']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)([Path.join(f.dir, 'missing.aon')]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--trust', 'nonsense', f.general]), 2));
        // ... and one the parser ACCEPTS reaches the export.
        Assert.equal(JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--trust', 'none', f.general]), 0)).out).type, 'object');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runJsonSchema)(['--help']), 0)).out.includes('aontu jsonschema'), true);
    });
    // REACHABILITY (the review's finding J). Go twin:
    // go/cmd/aontu/reaches_test.go. What the two ports must AGREE on --
    // the verdict and the path -- is test/spec/reach.tsv; what each port
    // owns (argument handling, exit codes, rendering) is here.
    (0, node_test_1.test)('reaches-answers-with-the-path-and-its-exit-code', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-rc-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'a: {dependsOn: [&: refer(), path($.b)]}\n' +
            'b: {dependsOn: [&: refer(), path($.c)], usedBy: [&: refer(), path($.d)]}\n' +
            'c: {}\nd: {}\n');
        // THE PATH IS THE ANSWER: "yes" is worth little to an operator
        // asking what a failure would take out.
        const hit = vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.a', '$.c', file]), 0));
        Assert.match(hit.out, /verdict: reaches/);
        Assert.match(hit.out, /\$\.a -> \$\.b -> \$\.c/);
        // An unreachable pair is a FAILED CHECK, not an error: the question
        // was answered, and the answer was no.
        const miss = vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.c', '$.a', file]), 1));
        Assert.match(miss.out, /verdict: unreachable/);
        Assert.match(miss.out, /\$\.c does not reach \$\.a/);
        // --relation follows one relation, which is the difference between
        // "can this reach that at all" and "can it reach it THIS way".
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.a', '$.d', file]), 0));
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.a', '$.d', '--relation', 'dependsOn', file]), 1));
        // An endpoint that names no node is a REFUSAL, not a `no`:
        // answering no would report a typo as a fact about the model.
        const bad = vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.a', '$.nope', file]), 4));
        Assert.match(bad.out, /refer_unresolved/);
        Assert.match(bad.out, /nodes with links: \$\.a, \$\.b, \$\.c, \$\.d/);
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.a', '$.c', '--format', 'json', file]), 0)).out);
        Assert.equal(j.aontu.verb, 'reaches');
        Assert.deepEqual(j.path, ['$.a', '$.b', '$.c']);
        Assert.equal('errors' in j, false);
        // A `no` carries no path -- there is no evidence for a negative
        // answer -- and a refusal carries its findings instead.
        const jn = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.c', '$.a', '--format', 'json', file]), 1)).out);
        Assert.equal(jn.verdict, 'unreachable');
        Assert.equal('path' in jn, false);
        Assert.equal('errors' in jn, false);
        const je = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runReaches)(['$.a', '$.nope', '--format', 'json', file]), 4)).out);
        Assert.equal(je.verdict, 'error');
        Assert.equal(je.errors[0].code, 'refer_unresolved');
        Assert.equal('path' in je, false);
        // A --trust the parser ACCEPTS reaches the graph.
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['--trust', 'none', '$.a', '$.c', file]), 0));
        // A document that does not stand up has no graph to ask about.
        Fs.writeFileSync(file, 'a: 1\na: 2\n');
        const broken = vetCapture(() => Assert.equal((0, cli_1.runReaches)(['a', 'b', file]), 4));
        Assert.match(broken.out, /scalar_value/);
    });
    // THE TREE VIEW (docs/design/VIEWS.0.md). Go twin:
    // go/cmd/aontu/view_test.go. What the two ports must AGREE on -- the
    // rendered text and the refusals -- is test/spec/view.tsv and
    // use-case 16's goldens; what each port owns (argument handling, exit
    // codes, rendering) is here.
    (0, node_test_1.test)('view-draws-the-tree-and-its-exit-code', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vw-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'cli: {dependsOn: [&: refer(), path($.web), path($.db)]}\n' +
            'web: {dependsOn: [&: refer(), path($.db)], usedBy: [&: refer(), path($.cli)]}\n' +
            'db: {dependsOn: [&: refer(), path($.disk)], usedBy: [&: refer(), path($.cli), path($.web)]}\n' +
            'disk: {}\n');
        const tree = 'cli\n├── db\n│   └── disk\n└── web\n    └── db (*)\n';
        // THE FIGURE AND NOTHING ELSE on stdout: a redirect is a golden.
        const drawn = vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--relation', 'dependsOn', file]), 0));
        Assert.equal(drawn.out, tree);
        Assert.equal(drawn.err, '');
        // One subtree, from a named root.
        const sub = vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--relation', 'dependsOn', '--root', '$.web', file]), 0));
        Assert.equal(sub.out, 'web\n└── db\n    └── disk\n');
        // A root that is not a node of the drawn graph is a REFUSAL, on
        // stderr, with nothing on stdout: an empty tree and a typo are the
        // same file on disk.
        const bad = vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--relation', 'dependsOn', '--root', '$.nope', file]), 4));
        Assert.equal(bad.out, '');
        Assert.match(bad.err, /refer_unresolved/);
        Assert.match(bad.err, /\$\.nope is not a node of the dependsOn graph/);
        Assert.match(bad.err, /nodes in the graph: \$\.cli, \$\.db, \$\.disk, \$\.web/);
        // A relation with no edges is refused the same way.
        const rel = vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--relation', 'nope', file]), 4));
        Assert.match(rel.err, /view_relation_unknown/);
        Assert.match(rel.err, /relations with edges: dependsOn, usedBy/);
        // The machine-readable form carries the figure under the envelope.
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--relation', 'dependsOn', '--format', 'json', file]), 0)).out);
        Assert.equal(j.aontu.verb, 'view');
        Assert.equal(j.kind, 'tree');
        Assert.equal(j.verdict, 'rendered');
        Assert.equal(j.text, tree.trimEnd());
        Assert.equal('errors' in j, false);
        // ... and a refusal carries its findings instead of a figure.
        const je = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--root', '$.nope', '--format', 'json', file]), 4)).out);
        Assert.equal(je.verdict, 'error');
        Assert.equal(je.errors[0].code, 'refer_unresolved');
        Assert.equal('text' in je, false);
        // A --trust the parser ACCEPTS reaches the graph.
        vetCapture(() => Assert.equal((0, cli_1.runView)(['--trust', 'none', 'tree', file]), 0));
        // The packaged binary, end to end: the figure is the goldens'.
        const r = run(['view', 'tree', '--relation', 'dependsOn', file]);
        Assert.equal(r.code, 0);
        Assert.equal(r.out, tree);
        // A document that does not stand up has no graph to draw.
        Fs.writeFileSync(file, 'a: 1\na: 2\n');
        const broken = vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', file]), 4));
        Assert.match(broken.err, /scalar_value/);
        // The library form, with no options at all: a model with no links
        // renders an empty figure rather than refusing.
        Assert.deepEqual((0, aontu_1.viewTree)('a: 1'), { verdict: 'rendered', kind: 'tree', text: '', loss: [] });
    });
    // EVERY KIND THROUGH THE VERB, and the flags around the figure:
    // --out, --check, --strict, the loss report on stderr. What each
    // figure LOOKS like is test/spec/view.tsv's business; this is the
    // plumbing.
    (0, node_test_1.test)('view-kinds-and-the-flags-around-the-figure', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vk-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'cli: {layer: "app", dependsOn: [&: refer(), path($.web), path($.db)]}\n' +
            'web: {layer: "svc", dependsOn: [&: refer(), path($.db)], usedBy: [&: refer(), path($.cli)]}\n' +
            'db: {layer: "data", dependsOn: [&: refer(), path($.disk)], usedBy: [&: refer(), path($.cli), path($.web)]}\n' +
            'disk: {layer: "data", dependsOn: []}\n');
        // A figure written to a file, then --check agrees with it; a
        // different figure does not, and nothing is written.
        const out = Path.join(dir, 'm.txt');
        const wrote = vetCapture(() => Assert.equal((0, cli_1.runView)(['matrix', '--relation', 'dependsOn', '--out', out, file]), 0));
        Assert.equal(wrote.out, '');
        const matrix = Fs.readFileSync(out, 'utf8');
        Assert.match(matrix, /# above-diagonal direct cells: 3\n$/);
        vetCapture(() => Assert.equal((0, cli_1.runView)(['matrix', '--relation', 'dependsOn', '--out', out, '--check', file]), 0));
        const mis = vetCapture(() => Assert.equal((0, cli_1.runView)(['matrix', '--relation', 'dependsOn', '--order', 'partition',
            '--closure', '--out', out, '--check', file]), 1));
        Assert.match(mis.err, /differs from the matrix figure/);
        Assert.equal(Fs.readFileSync(out, 'utf8'), matrix);
        vetCapture(() => Assert.equal((0, cli_1.runView)(['matrix', '--relation', 'dependsOn', '--out',
            Path.join(dir, 'none.txt'), '--check', file]), 1));
        // The loss report on stderr, and --strict refusing it.
        const hid = Path.join(dir, 'hid.aon');
        Fs.writeFileSync(hid, 'a: hide({dependsOn: [&: refer(), path($.b)]})\n' +
            'b: {dependsOn: [&: refer(), path($.c)]}\nc: {}\n');
        const lossy = vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', hid]), 0));
        Assert.equal(lossy.out, 'b\n└── c\n');
        Assert.equal(lossy.err, 'hidden_contribution  1  $.a.dependsOn.0\n');
        vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--strict', hid]), 1));
        const lj = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runView)(['tree', '--strict', '--format', 'json', hid]), 1)).out);
        Assert.equal(lj.verdict, 'lossy');
        Assert.equal(lj.loss[0].code, 'hidden_contribution');
        // Every other kind renders through the verb.
        const g = vetCapture(() => Assert.equal((0, cli_1.runView)(['graph', '--relation', 'dependsOn', '--relation', 'usedBy',
            '--group-by', 'layer', '--label', 'layer', '--at', '$', file]), 0));
        Assert.match(g.out, /^flowchart LR\n  subgraph g0\["app"\]/);
        const er = vetCapture(() => Assert.equal((0, cli_1.runView)(['graph', '--as', 'er', file]), 0));
        Assert.match(er.out, /^erDiagram\n/);
        const layer = vetCapture(() => Assert.equal((0, cli_1.runView)(['layer', '--relation', 'dependsOn', '--group-by', 'layer',
            '--layers', 'app,svc,data', file]), 0));
        Assert.match(layer.out, /^\+-+\+\n\| app   cli/);
        const sets = vetCapture(() => Assert.equal((0, cli_1.runView)(['sets', '--sets', '$', '--member', 'dependsOn',
            '--min-degree', '1', '--max-cols', '2', file]), 0));
        Assert.match(sets.out, /^# upset  sets=\$\(4\)/);
        const layers = vetCapture(() => Assert.equal((0, cli_1.runView)(['layers', '--min-size', '1', file]), 0));
        Assert.match(layers.out, /^# layers  file=doc\.aon  documents=1/);
        const ladder = vetCapture(() => Assert.equal((0, cli_1.runView)(['ladder', '--at', '$.db.layer', '--as', 'dot', file]), 0));
        Assert.match(ladder.out, /^digraph G \{/);
        const other = Path.join(dir, 'other.aon');
        Fs.writeFileSync(other, 'cli: {layer: string}\n');
        const poset = vetCapture(() => Assert.equal((0, cli_1.runView)(['poset', '--at', '$.cli.layer', '--profile', 'values',
            file, other]), 0));
        Assert.match(poset.out, /n0\["doc"\]\n  n1\["other"\]\n  n0 --> n1\n$/);
        const unreadable = vetCapture(() => Assert.equal((0, cli_1.runView)(['poset', file, Path.join(dir, 'nope.aon')]), 2));
        Assert.match(unreadable.err, /cannot read/);
    });
    // THE VIEW DOCUMENT: N figures of one document, declared as data.
    // What the declarations MEAN, and every refusal, is
    // test/spec/views.tsv; this is the CLI around them -- where the files
    // land, the gate, and the all-or-nothing rule.
    (0, node_test_1.test)('view-document-draws-every-figure-it-declares', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vd-'));
        Fs.writeFileSync(Path.join(dir, 'model.aon'), 'app: {layer: "app", dependsOn: [&: refer(), path($.core)]}\n' +
            'core: {layer: "core"}\n');
        const file = Path.join(dir, 'views.aon');
        Fs.writeFileSync(file, '@"./model.aon"\nviews: {\n' +
            '  tree: {kind: tree, out: "out/tree.txt"}\n' +
            '  bands: {kind: layer, groupBy: layer, out: "out/bands.txt"}\n}\n');
        Fs.mkdirSync(Path.join(dir, 'out'));
        // EVERY FIGURE, AND THE FILES ARE THE DOCUMENT'S NEIGHBOURS: an
        // `out` is resolved against the view document's own directory, so
        // the gate passes from any working directory.
        const drew = vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--trust', 'root', file]), 0));
        Assert.equal(drew.out, '');
        Assert.match(drew.err, /wrote out\/bands\.txt {2}bands \(layer\)/);
        Assert.equal(Fs.readFileSync(Path.join(dir, 'out/tree.txt'), 'utf8'), 'app\n└── core\n');
        // --check gates what was committed, and names every difference.
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--check', '--trust', 'root', file]), 0)).err, '');
        Fs.writeFileSync(Path.join(dir, 'out/tree.txt'), 'drifted\n');
        Fs.writeFileSync(Path.join(dir, 'out/bands.txt'), 'drifted\n');
        const gate = vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--check', '--trust', 'root', file]), 1));
        Assert.match(gate.err, /out\/tree\.txt differs from the tree figure/);
        Assert.match(gate.err, /out\/bands\.txt differs from the bands figure/);
        // The whole report, machine-readable.
        const json = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--format', 'json', '--trust', 'root', file]), 0)).out);
        Assert.equal(json.verdict, 'rendered');
        Assert.deepEqual(json.views.map((v) => v.name), ['bands', 'tree']);
        Assert.equal(json.views[1].out, 'out/tree.txt');
        // ALL OR NOTHING: a set whose second figure refuses writes neither,
        // and the refusal names the figure it came from.
        const bad = Path.join(dir, 'bad.aon');
        Fs.writeFileSync(bad, '@"./model.aon"\nviews: {\n' +
            '  tree: {kind: tree, out: "out/nope.txt"}\n' +
            '  small: {kind: tree, maxRows: 1, out: "out/small.txt"}\n}\n');
        const refused = vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--trust', 'root', bad]), 2));
        Assert.match(refused.err, /small \(tree\):/);
        Assert.match(refused.err, /view_rows_exceeded/);
        Assert.equal(Fs.existsSync(Path.join(dir, 'out/nope.txt')), false);
        // A LOSSY set still writes -- the loss report says what it could
        // not draw, and --strict is the gate on that.
        const lossy = Path.join(dir, 'lossy.aon');
        Fs.writeFileSync(lossy, 'a: hide({dependsOn: [&: refer(), path($.b)]})\nb: {}\n' +
            'views: {t: {kind: tree, out: "out/lossy.txt"}}\n');
        const loose = vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', lossy]), 0));
        Assert.match(loose.err, /t {2}hidden_contribution {2}1/);
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--strict', lossy]), 1)).err.length > 0, true);
        // THE MACHINE-READABLE FORM OF A REFUSAL: the figures that drew
        // still carry their bytes, and the one that refused carries its
        // findings, so a reader of the JSON sees what the run did.
        const badJson = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--format', 'json', '--trust', 'root', bad]), 2)).out);
        Assert.equal(badJson.verdict, 'error');
        Assert.equal(badJson.views[1].name, 'tree');
        Assert.equal(typeof badJson.views[1].text, 'string');
        Assert.equal(badJson.views[0].errors[0].code, 'view_rows_exceeded');
        // A declaration the document cannot answer for is the SET's
        // refusal, and usage: nothing is drawn at all.
        const shape = Path.join(dir, 'shape.aon');
        Fs.writeFileSync(shape, 'views: {a: {kind: tree}}\n');
        Assert.match(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', shape]), 2)).err, /view_document_shape/);
        const shapeJson = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--format', 'json', shape]), 2)).out);
        Assert.deepEqual(shapeJson.views, []);
        Assert.equal(shapeJson.errors[0].code, 'view_document_shape');
        // A figure that refuses for the DOCUMENT's sake rather than the
        // caller's exits 4, as a single figure does.
        const unknown = Path.join(dir, 'unknown.aon');
        Fs.writeFileSync(unknown, '@"./model.aon"\n' +
            'views: {a: {kind: tree, relation: nope, out: "out/a.txt"}}\n');
        Assert.match(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', '--trust', 'root', unknown]), 4)).err, /view_relation_unknown/);
    });
    (0, node_test_1.test)('view-document-usage-errors', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vdu-'));
        const file = Path.join(dir, 'views.aon');
        Fs.writeFileSync(file, 'views: {a: {kind: tree, out: "a.txt"}}\n');
        for (const [args, want] of [
            [['--views', '$.views'], /view --views takes one file/],
            [['--views', '$.views', file, file], /view --views takes one file/],
            [['--views', '$.views', '--out', 'x.txt', file],
                /--out is per figure in a view document/],
            [['--views', '$.views', Path.join(dir, 'nope.aon')], /cannot read/],
        ]) {
            const got = vetCapture(() => Assert.equal((0, cli_1.runView)(args), 2));
            Assert.match(got.err, want, args.join(' '));
        }
        // A DIRECTORY IS NOT A FILE: the write fails and says so, rather
        // than leaving the set half-written.
        const blocked = Path.join(dir, 'blocked.aon');
        Fs.writeFileSync(blocked, 'views: {a: {kind: tree, out: "sub"}}\n');
        Fs.mkdirSync(Path.join(dir, 'sub'));
        Assert.match(vetCapture(() => Assert.equal((0, cli_1.runView)(['--views', '$.views', blocked]), 2)).err, /cannot write/);
    });
    (0, node_test_1.test)('view-usage-errors', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vu-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'a: {dependsOn: [&: refer(), path($.b)]}\nb: {}\n');
        for (const [args, want] of [
            [[], /view needs a kind and a file/],
            [['tree'], /view needs a kind and a file/],
            [['tree', file, file], /view tree takes one file/],
            [['bogus', file], /unknown view kind bogus/],
            [['tree', '--bogus', file], /unknown view option --bogus/],
            [['tree', '--as', 'png', file], /--as needs one of text, mermaid, dot, er, svg/],
            [['tree', '--as', 'dot', file], /view_profile_unknown/],
            [['matrix', '--order', 'random', file], /--order needs canon or partition/],
            [['layer', '--edges', 'sideways', file], /--edges needs one of upward, all, none/],
            [['poset', '--profile', 'loose', file], /--profile needs values, defaults or gen/],
            [['tree', '--relation', 'a', '--relation', 'b', file], /view tree takes one --relation/],
            [['tree', '--check', file], /--check needs --out/],
            [['tree', file, '--out'], /--out needs a file/],
            [['tree', file, '--at'], /--at needs a value/],
            [['tree', '--max-rows', 'many', file], /--max-rows needs a count/],
            [['tree', '--max-rows', '1', file], /view_rows_exceeded/],
            [['layer', '--layers', '', file], /--layers needs a comma-separated list/],
            [['layer', '--relation', 'dependsOn', file], /view_group_required/],
            [['ladder', file], /view_at_required/],
            [['sets', file], /view_sets_required/],
            [['tree', '--format', 'yaml', file], /--format needs text or json/],
            [['tree', file, '--format'], /--format needs text or json/],
            [['tree', file, '--relation'], /--relation needs a name/],
            [['tree', '--relation', '', file], /--relation needs a name/],
            [['tree', file, '--root'], /--root needs a node path/],
            [['tree', Path.join(dir, 'nope.aon')], /cannot read/],
            [['--trust', 'bogus', 'tree', file], /--trust needs/],
        ]) {
            const r = vetCapture(() => Assert.equal((0, cli_1.runView)(args), 2, args.join(' ')));
            Assert.equal(r.out, '', args.join(' '));
            Assert.match(r.err, want, args.join(' '));
        }
        const help = vetCapture(() => Assert.equal((0, cli_1.runView)(['--help']), 0));
        Assert.match(help.out, /aontu view <kind>/);
        // The verb dispatches through main as the FIRST argument.
        const viaMain = vetCapture(() => (0, cli_1.main)(['node', 'cli', 'view', 'tree', file]));
        Assert.equal(viaMain.out, 'a\n└── b\n');
    });
    // A NIL ROOT WITH AN EMPTY ERROR LIST (use-cases/BUGS.md §43). The
    // id-spread refusal IS the root, so `ctx.err` is empty and every verb
    // that reports "this document does not stand up" used to read
    // `ctx.err[0]` as undefined and die with a TypeError. The path the
    // two ports give this nil differs ($ here, $.& in Go) and is recorded
    // in test/spec/divergent.tsv, so this asserts the CODE and the
    // verdict -- which is what a caller acts on -- rather than the path.
    (0, node_test_1.test)('a-nil-root-with-no-collected-error-is-reported-not-thrown', () => {
        const f = subFiles('&:\n', 'a:1');
        for (const run of [
            () => (0, cli_1.runRelations)([f.general]),
            () => (0, cli_1.runReaches)(['$.b', '$.b', f.general]),
            () => (0, cli_1.runView)(['tree', f.general]),
            () => (0, cli_1.runJsonSchema)([f.general]),
            () => (0, cli_1.runTrim)(['--check', f.general]),
        ]) {
            const r = vetCapture(() => Assert.equal(run(), 4));
            // out OR err: jsonschema puts its refusal on stderr, because
            // stdout is the schema's stream.
            Assert.match(r.out + r.err, /elided_value/);
        }
    });
    (0, node_test_1.test)('reaches-usage-errors-exit-2', () => {
        const f = subFiles('a:1', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runReaches)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['a', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['--bogus', 'a', 'b', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['a', 'b', '--format', 'yaml', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['a', 'b', '--relation']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['--trust', 'nonsense', 'a', 'b', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runReaches)(['a', 'b', Path.join(f.dir, 'missing.aon')]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runReaches)(['--help']), 0)).out.includes('aontu reaches'), true);
    });
    (0, node_test_1.test)('relations-usage-errors-exit-2', () => {
        const f = subFiles('a:1', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runRelations)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runRelations)([f.general, f.specific]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runRelations)(['--bogus']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runRelations)(['--format', 'yaml', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runRelations)([Path.join(f.dir, 'missing.aon')]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runRelations)(['--help']), 0)).out.includes('aontu relations'), true);
    });
    // G7 phase 7: the REPL as an inspection tool. The command handler
    // is a pure function of (state, line), so every answer the session
    // gives is as checkable as the CLI's.
    (0, node_test_1.test)('repl-loads-a-document-and-answers-about-it', () => {
        const doc = 'services: {\n  &: { replicas: *1 | integer }\n' +
            '  auth: { replicas: 3 }\n}';
        const read = (f) => {
            if ('missing.aon' === f) {
                throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
            }
            return doc;
        };
        let st = { mode: 'json', jsonl: false };
        const run = (line) => {
            const r = (0, cli_1.replCommand)(st, line, read);
            st = r.state;
            return r;
        };
        // Nothing loaded yet: the inspection commands say so rather than
        // guessing.
        Assert.match(run(':get $.a').out, /nothing loaded/);
        Assert.match(run(':why $.a').out, /nothing loaded/);
        Assert.match(run(':load sys.aon').out, /^loaded: sys\.aon/);
        Assert.equal(run(':keys $.services').out, 'auth');
        Assert.equal(run(':get $.services.auth').out, '{\n  "replicas": 3\n}');
        Assert.match(run(':why $.services.auth.replicas').out, /\*1\|integer.*\(spread\)/);
        // The `:canon` toggle reaches the query surface too.
        run(':canon');
        Assert.equal(run(':get $.services.auth').out, '{"replicas":3}');
        // A path that names nothing is a refusal, not an answer.
        Assert.match(run(':get $.nope').out, /no_path/);
        Assert.match(run(':why $.nope').out, /no_path/);
        // And the session's own commands still work.
        Assert.equal(run('').out, '');
        Assert.match(run(':help').out, /Usage: aontu/);
        Assert.match(run(':bogus').out, /unknown command/);
        Assert.match(run(':load').out, /needs a file/);
        Assert.match(run(':load missing.aon').out, /cannot read/);
        // A document that does not stand up is refused at :load, and
        // nothing is held: the session keeps whatever it had.
        const broken = (0, cli_1.replCommand)({ mode: 'json', jsonl: false }, ':load broken.aon', () => 'a:1 a:2');
        Assert.equal(broken.state.src, undefined);
        Assert.match(broken.out, /Cannot unify/);
        Assert.equal(run('a:1').out, '{"a":1}');
        Assert.equal(run(':quit').close, true);
        Assert.equal(run(':exit').close, true);
    });
    // The SESSION protocol: one JSON line per answer, so a harness can
    // drive the REPL. Human-readable output stays the default.
    // The flag through the SPAWNED binary, over a PIPE. The in-process
    // test below drives replCommand with a hand-built state, so it passed
    // while the mode was gated on process.stdin.isTTY and a piped harness
    // got its commands parsed as Aontu SOURCE instead -- reachable only
    // through a pty, which is to say not reachable by the thing it was
    // built for (register, G7.7). Its Go twin is
    // TestReplJSONLIsReachableOverAPipe.
    (0, node_test_1.test)('repl-jsonl-is-reachable-over-a-pipe', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-jsonl-'));
        const file = Path.join(dir, 'm.aon');
        Fs.writeFileSync(file, 'a: 1\n');
        const r = run(["--jsonl"], `:load ${file}\n:get $.a\n`);
        Assert.equal(r.code, 0, r.out);
        // NO trim(). The contract is one JSON object per line, so EVERY
        // line the stream produced has to be one -- and trimming first is
        // exactly what let a bare closing newline sit at the end of the
        // stream unnoticed, where a harness parsing each line as it
        // arrived would fail after every command had succeeded. The final
        // newline terminates the last record and is not a record itself,
        // so it is stripped once, deliberately, and nothing else is.
        Assert.ok(r.out.endsWith('\n'), JSON.stringify(r.out));
        const lines = r.out.slice(0, -1).split('\n');
        Assert.equal(lines.length, 2, JSON.stringify(r.out));
        for (const line of lines) {
            const m = JSON.parse(line);
            Assert.equal(m.ok, true, line);
        }
        Assert.equal(JSON.parse(lines[1]).out, '1');
    });
    (0, node_test_1.test)('repl-jsonl-answers-in-one-line', () => {
        const read = () => 'a: 1';
        let st = { mode: 'json', jsonl: true };
        const run = (line) => {
            const r = (0, cli_1.replCommand)(st, line, read);
            st = r.state;
            return JSON.parse(r.out);
        };
        Assert.deepEqual(run(':load doc.aon'), { ok: true, out: 'loaded: doc.aon\n{\n  "a": 1\n}' });
        Assert.deepEqual(run(':keys'), { ok: true, out: 'a' });
        Assert.equal(run(':get $.zz').ok, false);
        Assert.equal(run('a:1 a:2').ok, false);
    });
    // G7 phase 6: the generated AGENTS.md stanza. The stanza itself is
    // pinned byte for byte by test/spec/agentsmd.tsv in both ports;
    // these cases hold the command line and the SPLICE.
    (0, node_test_1.test)('agentsmd-writes-between-its-markers', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-md-'));
        const entry = Path.join(dir, 'sys.aon');
        const target = Path.join(dir, 'AGENTS.md');
        Fs.writeFileSync(entry, 'services: { auth: { owner: string } }');
        const r = vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)([entry]), 0));
        Assert.match(r.out, /<!-- aontu:begin -->/);
        Assert.match(r.out, /aontu get \$\.services/);
        Assert.match(r.out, /Pin: `aon1-/);
        // An ABSENT target is an empty one, and prose already there is
        // kept: a generator that rewrote the file is one nobody dares run
        // twice.
        Fs.writeFileSync(target, 'Intro prose.\n');
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', target, entry]), 0));
        const first = Fs.readFileSync(target, 'utf8');
        Assert.match(first, /^Intro prose\./);
        Assert.match(first, /<!-- aontu:end -->/);
        // And re-running SPLICES rather than appending: the file after
        // two runs is the file after one.
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', target, entry]), 0));
        Assert.equal(Fs.readFileSync(target, 'utf8'), first);
        // A target with no trailing newline gets one, so appending never
        // joins the stanza onto someone's last line.
        const bare = Path.join(dir, 'BARE.md');
        Fs.writeFileSync(bare, 'no trailing newline');
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', bare, entry]), 0));
        Assert.match(Fs.readFileSync(bare, 'utf8'), /^no trailing newline\n\n<!-- aontu:begin -->/);
        // A CRLF TARGET keeps its own endings outside the markers, and
        // gains nothing between the end marker and the text after it. The
        // splice used to skip one byte after the marker, which on CRLF is
        // the CR -- the LF then survived as a blank line that grew on
        // every regeneration. Twin: TestAgentsMdSplice in
        // go/agentsmd_test.go, where the same one byte also ran PAST THE
        // END of the case below and panicked.
        const crlf = Path.join(dir, 'CRLF.md');
        Fs.writeFileSync(crlf, 'head\r\n\r\n<!-- aontu:begin -->\r\nOLD\r\n<!-- aontu:end -->\r\ntail\r\n');
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', crlf, entry]), 0));
        const spliced = Fs.readFileSync(crlf, 'utf8');
        Assert.match(spliced, /<!-- aontu:end -->\ntail\r\n$/);
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', crlf, entry]), 0));
        Assert.equal(Fs.readFileSync(crlf, 'utf8'), spliced);
        // The end marker as the LAST content, with no terminator after it.
        const eof = Path.join(dir, 'EOF.md');
        Fs.writeFileSync(eof, 'head\n\n<!-- aontu:begin -->\nOLD\n<!-- aontu:end -->');
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', eof, entry]), 0));
        const ended = Fs.readFileSync(eof, 'utf8');
        Assert.match(ended, /^head\n\n<!-- aontu:begin -->\n/);
        Assert.equal(ended.includes('OLD'), false);
        // A target that does not exist yet is created.
        const fresh = Path.join(dir, 'NEW.md');
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', fresh, entry]), 0));
        Assert.match(Fs.readFileSync(fresh, 'utf8'), /<!-- aontu:begin -->/);
    });
    (0, node_test_1.test)('agentsmd-usage-errors-exit-2', () => {
        const f = subFiles('a:1', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)([f.general, f.specific]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--bogus', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)([Path.join(f.dir, 'missing.aon')]), 2));
        // A target that cannot be read (a directory) is usage, not empty.
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', f.dir, f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--write', Path.join(f.dir, 'no-dir', 'A.md'), f.general]), 2));
        // A document that does not stand up has no stanza: exit 4.
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-md-err-'));
        const broken = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(broken, 'a:1 a:2');
        vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)([broken]), 4));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runAgentsMd)(['--help']), 0)).out.includes('aontu agentsmd'), true);
    });
    // G7 phase 5: the overlay patch verb. What the two ports must agree
    // on (the report) is pinned by test/spec/patch.tsv; these cases hold
    // the command line and, above all, WHEN THE FILE IS WRITTEN.
    // `--in-place` at the COMMAND LINE, closing the loop the status
    // report says `set` could not: the data pins the wrong value, and
    // appending can only contradict it. The report shape is pinned by
    // test/spec/patch.tsv; what this holds is the flag, the `replaced:`
    // line, and the bytes that end up on disk — comments included.
    (0, node_test_1.test)('set-in-place-rewrites-the-pinned-literal', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'));
        const entry = Path.join(dir, 'schema.aon');
        const overlay = Path.join(dir, 'deploy.aon');
        Fs.writeFileSync(entry, 'replicas: integer & above(0) & below(10)\n');
        Fs.writeFileSync(overlay, '# the deployment\nreplicas: 42   # too many\n');
        // WITHOUT the flag this is the defect: nothing written, exit 1.
        const before = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.replicas=5', '--entry', entry, '--overlay', overlay]), 1));
        Assert.match(before.err, /verdict: invalid/);
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), '# the deployment\nreplicas: 42   # too many\n', 'untouched');
        // WITH it, the literal is rewritten where it was written.
        const r = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.replicas=5', '--entry', entry, '--overlay', overlay,
            '--in-place']), 0));
        Assert.match(r.out, /verdict: valid/);
        Assert.match(r.out, /replaced: .*deploy\.aon:2:11 42 -> 5/);
        Assert.match(r.out, /wrote:/);
        // BOTH COMMENTS SURVIVE, the one on the edited line included.
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), '# the deployment\nreplicas: 5   # too many\n');
    });
    // Where it cannot rewrite it APPENDS, exactly as plain set would, and
    // says why. --dry-run still writes nothing.
    (0, node_test_1.test)('set-in-place-appends-and-explains-when-it-cannot-rewrite', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'));
        const entry = Path.join(dir, 'schema.aon');
        const overlay = Path.join(dir, 'ov.aon');
        Fs.writeFileSync(entry, 'a: integer\n');
        Fs.writeFileSync(overlay, 'a: 1+2\n');
        const r = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a=5', '--entry', entry, '--overlay', overlay,
            '--in-place', '--dry-run']), 1));
        Assert.match(r.err, /patch_not_editable/);
        Assert.match(r.err, /opening token/);
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'a: 1+2\n', 'dry run');
    });
    // WHAT THE TEXT RENDERER SAYS ABOUT AN EDIT THAT DID NOT HAPPEN, and
    // WHICH STREAM A SUCCESSFUL RUN WRITES TO. Both were wrong when
    // --in-place landed and both are load-bearing for an operator.
    (0, node_test_1.test)('set-in-place-reports-unapplied-edits-and-uses-the-right-stream', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'));
        const entry = Path.join(dir, 'e.aon');
        const overlay = Path.join(dir, 'ov.aon');
        // ONE ASSIGNMENT REPLACEABLE, ANOTHER REFUSED. The write is refused
        // as a whole, so the file is untouched -- and the renderer must not
        // report the replaceable one in the PAST TENSE.
        Fs.writeFileSync(entry, 'a: integer\nb: integer & below(10)\n');
        Fs.writeFileSync(overlay, 'a: 1\nb: 42\n');
        const r = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a=2', '$.b=99', '--entry', entry, '--overlay', overlay,
            '--in-place']), 1));
        Assert.match(r.err, /would replace: .*1 -> 2/);
        Assert.doesNotMatch(r.err, /^replaced:/m, 'nothing was replaced');
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'a: 1\nb: 42\n');
        // A SUCCESSFUL RUN CARRYING ONLY A WARNING puts its status on
        // STDOUT. Routing on the finding count sent this whole report to
        // stderr and left stdout empty, so `$(aontu set ...)` captured
        // nothing while the command exited 0 and wrote the file.
        Fs.writeFileSync(entry, 'a: integer\n');
        Fs.writeFileSync(overlay, 'a: integer\n');
        const ok = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a=5', '--entry', entry, '--overlay', overlay, '--in-place']), 0));
        Assert.match(ok.out, /verdict: valid/);
        Assert.match(ok.out, /wrote:/);
        Assert.match(ok.err, /patch_not_editable/, 'the warning is a diagnostic');
        Assert.doesNotMatch(ok.err, /verdict:/, 'status is not duplicated');
    });
    (0, node_test_1.test)('set-appends-to-the-overlay-when-the-change-holds', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'));
        const entry = Path.join(dir, 'sys.aon');
        const overlay = Path.join(dir, 'ov.aon');
        Fs.writeFileSync(entry, 'services: { auth: { owner: string, replicas: *1 | integer } }');
        // An ABSENT overlay is the empty overlay, and the file is created.
        const r = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.services.auth.owner="identity-2"',
            '--entry', entry, '--overlay', overlay]), 0));
        Assert.match(r.out, /verdict: valid/);
        Assert.match(r.out, /wrote:/);
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), '"services": "auth": "owner": "identity-2"\n');
        // A second assignment appends after the first.
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.services.auth.replicas=5',
            '--entry', entry, '--overlay', overlay]), 0));
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), '"services": "auth": "owner": "identity-2"\n' +
            '"services": "auth": "replicas": 5\n');
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.services.auth.owner="identity-2"', '--format', 'json',
            '--entry', entry, '--overlay', overlay]), 0)).out);
        Assert.equal(j.aontu.verb, 'set');
        Assert.equal(j.verdict, 'valid');
        Assert.equal(j.written, true);
        Assert.deepEqual(j.appended, ['"services": "auth": "owner": "identity-2"']);
    });
    // A change that contradicts a PINNED value is a question for the
    // author at the pinning site: reported, exit 1, and NOT written —
    // leaving it in the overlay would leave the configuration broken.
    (0, node_test_1.test)('set-refuses-to-write-a-change-that-does-not-hold', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-no-'));
        const entry = Path.join(dir, 'sys.aon');
        const overlay = Path.join(dir, 'ov.aon');
        Fs.writeFileSync(entry, 'port: 3');
        Fs.writeFileSync(overlay, 'x: 1\n');
        const r = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.port=5', '--entry', entry, '--overlay', overlay]), 1));
        Assert.match(r.err, /verdict: invalid/);
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'x: 1\n');
        // --dry-run prints the verdict and writes nothing, even when it
        // would have held.
        const d = vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.port=3', '--dry-run', '--entry', entry, '--overlay', overlay]), 0));
        Assert.match(d.out, /\(dry run\)/);
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'x: 1\n');
        // An entry that does not stand up is verdict error, exit 4.
        Fs.writeFileSync(entry, 'a:1 a:2');
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.b=1', '--entry', entry, '--overlay', overlay]), 4));
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'x: 1\n');
    });
    (0, node_test_1.test)('set-usage-errors-exit-2', () => {
        const f = subFiles('a:{b:integer}', 'a:1');
        const ov = Path.join(f.dir, 'ov.aon');
        vetCapture(() => Assert.equal((0, cli_1.runSet)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a.b=1']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a.b=1', '--entry', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['--entry', f.general, '--overlay', ov]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a.b=1', '--bogus', '--entry', f.general, '--overlay', ov]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a.b=1', '--format', 'yaml', '--entry', f.general, '--overlay', ov]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a.b=1', '--entry', Path.join(f.dir, 'missing.aon'),
            '--overlay', ov]), 2));
        // An overlay that cannot be READ (a directory, not a missing file)
        // is a usage error, not an empty overlay.
        vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a.b=1', '--entry', f.general, '--overlay', f.dir]), 2));
        // An overlay whose DIRECTORY does not exist reads as absent (the
        // empty overlay) and then fails to write, which is also usage.
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runSet)(['$.a.b=1', '--entry', f.general,
            '--overlay', Path.join(f.dir, 'no-such-dir', 'ov.aon')]), 2)).err.includes('cannot write'), true);
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runSet)(['--help']), 0)).out.includes('aontu set'), true);
    });
    // G7 phase 3: provenance. The record itself is pinned by
    // test/spec/why.tsv in both ports; these cases hold the command
    // line and the text rendering.
    (0, node_test_1.test)('why-names-every-contribution', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-why-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'services: {\n  &: { replicas: *1 | integer }\n' +
            '  auth: { replicas: 3 }\n  db: {}\n}\n');
        const r = vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.services.auth.replicas', file]), 0));
        Assert.match(r.out, /^\$\.services\.auth\.replicas = 3/);
        Assert.match(r.out, /1\. \*1\|integer.*doc\.aon:2:18  \(spread\)/);
        Assert.match(r.out, /2\. 3.*doc\.aon:3:21/);
        // A KEY THE AUTHOR NEVER WROTE A VALUE FOR still has a source: the
        // template did. It used to answer "no contributions" here -- true
        // of meets, and no answer to "where did this value come from" (the
        // review's finding E). The template's own site is what it names,
        // and the same one the touched sibling above names.
        const q = vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.services.db.replicas', file]), 0));
        Assert.match(q.out, /1\. \*1\|integer.*doc\.aon:2:18  \(spread\)/);
        // TOP IS THE UNIT ELEMENT, not something the author wrote, so a
        // path holding it has no contribution -- the one shape that still
        // answers "nothing met at this path" now that the value which
        // STANDS at a path counts (the review's finding E).
        const topFile = Path.join(dir, 'top.aon');
        Fs.writeFileSync(topFile, 'a: top\n');
        const t = vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.a', topFile]), 0));
        Assert.match(t.out, /no contributions/);
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.services.auth.replicas', '--format', 'json', file]), 0)).out);
        Assert.equal(j.aontu.verb, 'why');
        Assert.equal(j.ok, true);
        Assert.equal(j.record.value, '3');
        Assert.equal(j.record.conjuncts.length, 2);
        Assert.equal(j.record.conjuncts[0].role, 'spread');
    });
    (0, node_test_1.test)('why-exit-codes-and-usage', () => {
        const f = subFiles('a:{b:1}', 'a:1');
        const miss = vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.zz', f.general]), 1));
        Assert.match(miss.err, /no_path/);
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-why-err-'));
        const broken = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(broken, 'a:1 a:2');
        vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.a', broken]), 4));
        vetCapture(() => Assert.equal((0, cli_1.runWhy)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.a']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.a', f.general, f.specific]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runWhy)(['--bogus', '$.a', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.a', '--format', 'yaml', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.a', '--format']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.a', Path.join(f.dir, 'missing.aon')]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runWhy)(['--help']), 0)).out.includes('aontu why'), true);
        // The JSON form of a refusal carries the findings and no record.
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runWhy)(['$.zz', '--format', 'json', f.general]), 1)).out);
        Assert.equal(j.ok, false);
        Assert.equal(j.record, undefined);
        Assert.equal(j.findings[0].code, 'no_path');
    });
    // A SITELESS contribution prints no location rather than a `-1:-1`
    // that means nothing, and an unnamed source prints row:col alone.
    // The site shape allows both while no document has yet produced one,
    // so the renderer is exercised directly (ADR-002).
    (0, node_test_1.test)('why-renders-a-siteless-contribution', () => {
        Assert.equal((0, cli_1.renderWhyText)({
            conjuncts: [
                {
                    canon: '1', role: 'literal', src: '',
                    site: { col: -1, file: '', len: -1, row: -1 },
                },
                {
                    canon: 'integer', role: 'spread', src: 'integer',
                    site: { col: 3, file: '', len: 7, row: 2 },
                },
            ],
            path: '$.a',
            value: '1',
        }), '$.a = 1\n  1. 1\n  2. integer  2:3  (spread)');
    });
    // G7 phase 1: the query verb. The views themselves are pinned by
    // test/spec/query.tsv in both ports; these cases hold the command
    // line -- flag parsing, the exit classes, and where each answer
    // goes.
    (0, node_test_1.test)('get-renders-one-node-per-view', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-get-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'svc:{auth:{image:"a:v2",replicas:3}}\nport: *8080|integer\n');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.svc.auth.replicas', file]), 0))
            .out.trim(), '3');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.svc.auth', '--canon', file]), 0)).out.trim(), '{"image":"a:v2","replicas":3}');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.svc.auth', '--types', file]), 0)).out.trim(), '{"image":string,"replicas":integer}');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.svc', '--keys', file]), 0))
            .out.trim(), 'auth');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$', '--canon', '--depth', '1', file]), 0)).out.trim(), '{"port":top,"svc":top}');
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.svc.auth', '--format', 'json', file]), 0)).out);
        Assert.equal(j.aontu.verb, 'get');
        Assert.equal(j.ok, true);
        Assert.equal(j.findings.length, 0);
    });
    // A path that names nothing is the QUESTION's answer -- exit 1, the
    // "no" class -- while a document that does not stand up is exit 4.
    (0, node_test_1.test)('get-exit-codes-separate-no-from-broken', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-get-err-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'svc:{auth:{image:"a"}}');
        const miss = vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.svc.auht', file]), 1));
        Assert.equal(miss.out, '');
        Assert.match(miss.err, /no_path/);
        Assert.match(miss.err, /did you mean auth\?/);
        Fs.writeFileSync(file, 'a:1 a:2');
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$', file]), 4));
        // A value that is not concrete has no JSON, and says so as an
        // error rather than inventing one.
        Fs.writeFileSync(file, 'k: integer');
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.k', file]), 4));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.k', '--canon', file]), 0)).out.trim(), 'integer');
    });
    (0, node_test_1.test)('get-usage-errors-exit-2', () => {
        const f = subFiles('a:{b:1}', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runGet)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a', f.general, f.specific]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['--bogus', '$.a', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a', '--format', 'yaml', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a', '--depth', 'x', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a', '--depth', '0', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a', '--depth', f.general]), 2));
        // Eliding below a depth means rendering `top`, which JSON cannot
        // say -- refused rather than silently switching the view.
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a', '--depth', '1', f.general]), 2)).err.includes('JSON cannot say top'), true);
        vetCapture(() => Assert.equal((0, cli_1.runGet)(['$.a', Path.join(f.dir, 'missing.aon')]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runGet)(['--help']), 0)).out.includes('aontu get'), true);
    });
    // G6 phase 1: the canon-hash verb. The pin is the point, so the
    // cases assert the SHAPE and the invariances -- reformatting,
    // reordering and re-commenting a document leave the hash alone,
    // while closing a map moves it -- rather than a literal digest,
    // which test/spec/hcanon.tsv pins in both ports at once.
    (0, node_test_1.test)('hash-pins-meaning-not-text', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-hash-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'b: 2\na: 1\n');
        const first = vetCapture(() => Assert.equal((0, cli_1.runHash)([file]), 0)).out.trim();
        Assert.match(first, /^aon1-[A-Za-z0-9_-]{43}$/);
        // Same meaning, different bytes: comments, whitespace, key order.
        Fs.writeFileSync(file, '# the module\n\n   a:1\n   b:2  # trailing\n');
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runHash)([file]), 0)).out.trim(), first);
        // A semantic change moves it -- closedness is IN the hash form
        // even though canon drops it.
        Fs.writeFileSync(file, 'a: 1\nb: 3\n');
        Assert.notEqual(vetCapture(() => Assert.equal((0, cli_1.runHash)([file]), 0)).out.trim(), first);
        Fs.writeFileSync(file, 'x: {a:1}');
        const open = vetCapture(() => Assert.equal((0, cli_1.runHash)([file]), 0)).out.trim();
        Fs.writeFileSync(file, 'x: close({a:1})');
        const closed = vetCapture(() => Assert.equal((0, cli_1.runHash)([file]), 0)).out.trim();
        Assert.notEqual(closed, open);
        // --form prints the hashed TEXT, which is what to diff when a pin
        // moves, and the JSON report carries both.
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runHash)(['--form', file]), 0)).out.trim(), '{"x":close({"a":1})}');
        const j = JSON.parse(vetCapture(() => Assert.equal((0, cli_1.runHash)(['--format', 'json', file]), 0)).out);
        Assert.equal(j.aontu.verb, 'hash');
        Assert.equal(j.hash, closed);
        Assert.equal(j.form, '{"x":close({"a":1})}');
    });
    (0, node_test_1.test)('hash-usage-errors-exit-2', () => {
        const f = subFiles('a:1', 'a:1');
        vetCapture(() => Assert.equal((0, cli_1.runHash)([]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runHash)([f.general, f.specific]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runHash)(['--bogus', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runHash)(['--format', 'yaml', f.general]), 2));
        vetCapture(() => Assert.equal((0, cli_1.runHash)(['--format']), 2));
        vetCapture(() => Assert.equal((0, cli_1.runHash)([Path.join(f.dir, 'missing.aon')]), 2));
        Assert.equal(vetCapture(() => Assert.equal((0, cli_1.runHash)(['--help']), 0)).out.includes('aontu hash'), true);
    });
    // A document that does not stand up on its own has no meaning to
    // pin: exit 4, the verbs' error class, and NOT a hash of the wreck
    // (which would agree with every other wreck).
    (0, node_test_1.test)('hash-broken-document-exits-4', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-hash-err-'));
        const file = Path.join(dir, 'doc.aon');
        Fs.writeFileSync(file, 'a:1 a:2');
        const r = vetCapture(() => Assert.equal((0, cli_1.runHash)([file]), 4));
        Assert.equal(r.out, '');
        Assert.match(r.err, /does not evaluate on its own/);
    });
    // The verbs ride the same first-argument dispatch vet does.
    (0, node_test_1.test)('subsume-verbs-dispatch-from-main', () => {
        const f = subFiles('a:integer', 'a:1');
        const r = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'subsume', f.general, f.specific]));
        Assert.match(r.out, /verdict: subsumes/);
        const b = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'breaking', '--against', f.specific, f.general]));
        Assert.match(b.out, /verdict: compatible/);
        const t = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'trim', '--check', f.general]));
        Assert.match(t.out, /verdict: clean/);
        const rl = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'relations', f.general]));
        Assert.match(rl.out, /verdict: pass/);
        const h = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'hash', f.general]));
        Assert.match(h.out, /^aon1-/);
        const g = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'get', '$.a', '--canon', f.general]));
        Assert.match(g.out, /integer/);
        const w = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'why', '$.a', f.general]));
        Assert.match(w.out, /\$\.a = integer/);
        const st = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'set', '$.a=1', '--dry-run',
            '--entry', f.general, '--overlay', Path.join(f.dir, 'ov.aon')]));
        Assert.match(st.out, /verdict: valid/);
        const md = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'agentsmd', f.general]));
        Assert.match(md.out, /aontu:begin/);
        const js = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'jsonschema', f.general]));
        Assert.match(js.out, /"type": "integer"/);
        const rc = vetCapture(() => (0, cli_1.main)(['node', 'aontu', 'reaches', 'x', 'y', f.general]));
        Assert.match(rc.out, /verdict: error/);
    });
});
// --- the repair loop, end to end ---------------------------------------
//
// Emit -> vet -> why -> set -> re-vet, through the SPAWNED binary, with
// the exit code asserted at every step. The whole capability review
// exists for this loop and until now nothing executed it: the spec
// suite pins each verb in isolation, so the verbs could each be right
// and the loop still not close. Walking it by hand is what found the
// two defects the loop's own status report opens with -- `Site` has no
// extent, and `set` cannot narrow a pinned literal -- and neither was
// visible from any single verb.
//
// The exit codes ARE the assertion. A harness driving this reads
// nothing else between steps, so a step that returns the right text
// under the wrong code is a step that misroutes the loop.
(0, node_test_1.describe)('cli-repair-loop', () => {
    function loopFiles() {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-loop-'));
        const schema = Path.join(dir, 'schema.aon');
        const deploy = Path.join(dir, 'deploy.aon');
        Fs.writeFileSync(schema, 'service: {\n' +
            '  name: string\n' +
            '  port: integer & above(1023)\n' +
            '}\n');
        // What an agent emitted: the name is right, the port was never
        // written. A HOLE, which is the shape `set` can repair.
        Fs.writeFileSync(deploy, 'service: { name: "auth" }\n');
        return { dir, schema, deploy };
    }
    (0, node_test_1.test)('emit-vet-why-set-revet-closes', () => {
        const f = loopFiles();
        const overlay = Path.join(f.dir, 'overlay.aon');
        // 1. VET the emitted document. Not a contradiction — nothing
        //    conflicts — so exit 3, the verdict that means "not satisfied
        //    YET", which is the code that tells a harness to repair rather
        //    than to start over.
        const vet1 = run(['vet', f.schema, f.deploy]);
        Assert.equal(vet1.code, 3);
        Assert.match(vet1.out, /verdict: incomplete/);
        Assert.match(vet1.out, /\$\.service\.port/);
        // 2. WHY, on the schema, for what the hole has to satisfy. The
        //    finding named the path; this is the step that turns it into a
        //    constraint the emitter can meet.
        const why = run(['why', '$.service.port', f.schema]);
        Assert.equal(why.code, 0);
        Assert.match(why.out, /above\(1023\)/);
        // 3. SET, which writes the overlay only if the change holds.
        const set = run(['set', '$.service.port=8080',
            '--entry', f.deploy, '--overlay', overlay]);
        Assert.equal(set.code, 0);
        Assert.match(set.out, /verdict: valid/);
        Assert.match(set.out, /wrote: /);
        Assert.match(Fs.readFileSync(overlay, 'utf8'), /"service": "port": 8080/);
        // The entry is UNTOUCHED: the overlay is the change, which is what
        // makes the loop safe to run against a file a human also edits.
        Assert.equal(Fs.readFileSync(f.deploy, 'utf8'), 'service: { name: "auth" }\n');
        // 4. RE-VET the pair. The two files together are the repaired
        //    document, so the loop closes through an include of both.
        const all = Path.join(f.dir, 'all.aon');
        Fs.writeFileSync(all, '@"./deploy.aon"\n@"./overlay.aon"\n');
        const vet2 = run(['vet', f.schema, all]);
        Assert.equal(vet2.code, 0);
        Assert.match(vet2.out, /verdict: valid/);
    });
    // The other arm, and the one the status report calls the loop's
    // missing third step: unification only NARROWS, so a value the data
    // already pinned cannot be set to a different one. The overlay is
    // not written, the entry is not touched, and the finding names the
    // site doing the pinning — which is where a human, not `set`, has to
    // go.
    (0, node_test_1.test)('a-pinned-value-refuses-the-repair-and-writes-nothing', () => {
        const f = loopFiles();
        const overlay = Path.join(f.dir, 'overlay.aon');
        const set = run(['set', '$.service.name="other"',
            '--entry', f.deploy, '--overlay', overlay]);
        Assert.equal(set.code, 1);
        Assert.match(set.out, /verdict: invalid/);
        Assert.match(set.out, /\$\.service\.name/);
        Assert.equal(Fs.existsSync(overlay), false);
        Assert.equal(Fs.readFileSync(f.deploy, 'utf8'), 'service: { name: "auth" }\n');
    });
    // And the step before the loop can start at all: a truth that does
    // not stand up. Exit 4 says "stop, the schema is the problem" — and
    // now says WHAT the problem is, so a harness can report it instead
    // of retrying against a schema that will never accept anything.
    (0, node_test_1.test)('a-broken-schema-stops-the-loop-and-says-why', () => {
        const f = loopFiles();
        const broken = Path.join(f.dir, 'broken.aon');
        Fs.writeFileSync(broken, 'a: 1\na: 2\n');
        const r = run(['vet', '--format', 'json', broken, f.deploy]);
        Assert.equal(r.code, 4);
        const report = JSON.parse(r.out);
        Assert.equal(report.verdict, 'error');
        Assert.equal(report.findings.length, 1);
        Assert.equal(report.findings[0].code, 'scalar_value');
        for (const site of report.findings[0].sites) {
            Assert.equal(site.role, 'schema');
            Assert.equal(site.file, broken);
        }
    });
});
//# sourceMappingURL=cli.test.js.map