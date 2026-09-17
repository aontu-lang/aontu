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
const helpdoc_1 = require("../dist/helpdoc");
const hints_1 = require("../dist/hints");
const cli_1 = require("../dist/cli");
const cli_2 = require("../dist/cli");
const CLI = Path.join(__dirname, '..', 'bin', 'aontu.js');
const REPO = Path.join(__dirname, '..', '..');
const WINDOWS = 'win32' === process.platform;
function run(args) {
    const env = { ...process.env };
    delete env.NODE_V8_COVERAGE;
    try {
        const out = (0, node_child_process_1.execFileSync)('node', [CLI, ...args], {
            input: '', encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { out, err: '', code: 0 };
    }
    catch (err) {
        return {
            out: err.stdout ?? '', err: err.stderr ?? '', code: err.status ?? 1,
        };
    }
}
function readRepo(rel) {
    return Fs.readFileSync(Path.join(REPO, rel), 'utf8')
        .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
(0, node_test_1.describe)('helpdoc', () => {
    // THE ASSERTION THE WHOLE PHASE RESTS ON. ts/src/helpdoc.ts is a
    // generated copy (ts/scripts/helpdoc.cjs, `make helpdoc`), and a
    // generated copy that nothing compares is a second source of truth
    // waiting to drift. Regenerate rather than hand-edit.
    (0, node_test_1.test)('corpus-is-identical-with-its-sources', () => {
        Assert.ok(0 < helpdoc_1.HELPDOC.length, 'no topics: has the generator run?');
        for (const topic of helpdoc_1.HELPDOC) {
            Assert.equal(topic.text, readRepo(topic.source), `help topic ${topic.topic} is stale against ${topic.source}` +
                ' — run `make helpdoc`');
        }
    });
    (0, node_test_1.test)('both-ports-stage-the-same-topics', () => {
        const goDir = Path.join(REPO, 'go', 'cmd', 'aontu', 'helpdoc');
        const index = readRepo('go/cmd/aontu/helpdoc/index.tsv')
            .split('\n')
            .filter((line) => '' !== line && !line.startsWith('#'))
            .map((line) => line.split('\t'));
        Assert.deepEqual(index.map((col) => col[0]), helpdoc_1.HELPDOC.map((t) => t.topic), 'the two ports list different topics, or in a different order');
        for (const [topic, file, summary, source] of index) {
            const staged = Fs.readFileSync(Path.join(goDir, file), 'utf8')
                .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
            const mine = helpdoc_1.HELPDOC.find((t) => topic === t.topic);
            Assert.ok(null != mine, `${topic} is staged for Go and not here`);
            Assert.equal(staged, mine.text, `${topic} differs between the ports`);
            Assert.equal(summary, mine.summary, `${topic}: summaries differ`);
            Assert.equal(source, mine.source, `${topic}: sources differ`);
        }
    });
    // The one construct the phase exists for. An agent that cannot learn
    // `&:` offline cannot write a schema that constrains anything, and
    // gets `verdict: valid` over data that violates it.
    (0, node_test_1.test)('help-language-teaches-the-map-template', () => {
        const r = run(['help', 'language']);
        Assert.equal(r.code, 0);
        Assert.ok(r.out.includes('&:'), 'the grammar card omits `&:`');
        Assert.ok(r.out.includes('TEMPLATE'), 'the card does not name it');
    });
    (0, node_test_1.test)('help-tasks-bridges-the-callers-vocabulary', () => {
        const r = run(['help', 'tasks']);
        Assert.equal(r.code, 0);
        // The word the caller arrives with. It occurs nowhere in the tool
        // help, which is the measurement that opened G11.
        for (const want of ['ontology', 'aontu vet', '&:']) {
            Assert.ok(r.out.includes(want), `help tasks omits ${want}`);
        }
    });
    (0, node_test_1.test)('help-index-lists-every-topic', () => {
        const r = run(['help']);
        Assert.equal(r.code, 0);
        for (const topic of helpdoc_1.HELPDOC) {
            Assert.ok(r.out.includes(topic.topic), `the index omits ${topic.topic}`);
            Assert.ok(r.out.includes(topic.summary), `no summary for ${topic.topic}`);
        }
    });
    (0, node_test_1.test)('help-index-json', () => {
        const r = run(['help', '--format', 'json']);
        Assert.equal(r.code, 0);
        const report = JSON.parse(r.out);
        Assert.equal(report.aontu.verb, 'help');
        Assert.equal(report.topics.length, helpdoc_1.HELPDOC.length);
        Assert.deepEqual(Object.keys(report.topics[0]).sort(), ['source', 'summary', 'topic']);
    });
    (0, node_test_1.test)('help-topic-json-carries-the-text', () => {
        const r = run(['help', 'language', '--format', 'json']);
        Assert.equal(r.code, 0);
        const report = JSON.parse(r.out);
        Assert.equal(report.topic, 'language');
        Assert.ok(report.text.includes('&:'));
    });
    // AN UNKNOWN TOPIC NAMES THE ALTERNATIVES. The caller who typed it
    // has no other way to find out what exists.
    (0, node_test_1.test)('help-unknown-topic-lists-the-topics', () => {
        const r = run(['help', 'langauge']);
        Assert.equal(r.code, 2);
        Assert.equal(r.out, '', 'a refusal wrote to stdout');
        for (const want of ['langauge', 'language', 'examples']) {
            Assert.ok(r.err.includes(want), `the refusal omits ${want}`);
        }
    });
    (0, node_test_1.test)('help-usage-refusals', () => {
        for (const [args, want] of [
            [['help', 'a', 'b'], 'one topic'],
            [['help', '--format', 'xml'], 'text or json'],
            [['help', '--format'], 'text or json'],
            [['help', '--bogus'], 'unknown help option'],
        ]) {
            const r = run(args);
            Assert.equal(r.code, 2, args.join(' '));
            Assert.ok(r.err.includes(want), `${args.join(' ')}: ${r.err}`);
        }
    });
    (0, node_test_1.test)('help-verb-takes-the-tool-help', () => {
        const r = run(['help', '--help']);
        Assert.equal(r.code, 0);
        Assert.ok(r.out.startsWith('Usage: aontu'));
    });
    (0, node_test_1.test)('explain-answers-for-every-registered-code', () => {
        const codes = readRepo('test/spec/errcodes.tsv')
            .split('\n')
            .filter((line) => '' !== line.trim() && !line.startsWith('#'))
            .map((line) => line.split('\t')[0]);
        Assert.ok(100 < codes.length, `the registry looks unread: ${codes.length}`);
        for (const code of codes) {
            Assert.equal((0, cli_2.runExplain)([code]), 0, `explain ${code} refused`);
            Assert.ok(null != hints_1.codeClasses[code], `${code} has no class`);
        }
    });
    (0, node_test_1.test)('explain-list-is-the-registry', () => {
        const r = run(['explain', '--list']);
        Assert.equal(r.code, 0);
        const listed = r.out.trim().split('\n').map((line) => line.split(/\s+/)[0]);
        Assert.deepEqual(listed.length, Object.keys(hints_1.codeClasses).length, 'the list is not the registry');
        for (const code of Object.keys(hints_1.codeClasses)) {
            Assert.ok(listed.includes(code), `--list omits ${code}`);
        }
    });
    // EVERY REGISTERED CODE HAS EXPLANATION TEXT: the registry is
    // append-only, so without this gate a code lands with none.
    (0, node_test_1.test)('explain-text-is-complete-for-every-registered-code', () => {
        const r = run(['explain', '--list']);
        Assert.equal(r.code, 0);
        const bare = r.out.trim().split('\n')
            .filter((line) => line.includes('(no text)'))
            .map((line) => line.split(/\s+/)[0]);
        Assert.deepEqual(bare, [], `registered code(s) carry no explanation text: ${bare.join(', ')}`);
        const missing = Object.keys(hints_1.codeClasses)
            .filter((code) => null == hints_1.hints[code] || '' === hints_1.hints[code]);
        Assert.deepEqual(missing, [], `registered code(s) with no hint: ${missing.join(', ')}`);
        const one = run(['explain', 'compat_required_added']);
        Assert.equal(one.code, 0);
        Assert.ok(!one.out.includes('no explanation text is registered'), one.out);
    });
    // The arms answering a code with no text: unreachable while the gate
    // above holds, kept because the registry is append-only.
    (0, node_test_1.test)('explain-answers-a-code-with-no-text', () => {
        Assert.equal((0, cli_1.explainBody)(''), '(no explanation text is registered for this code)');
        Assert.equal((0, cli_1.explainBody)('some text'), 'some text');
        Assert.equal((0, cli_1.noTextMark)(''), '  (no text)');
        Assert.equal((0, cli_1.noTextMark)('some text'), '');
    });
    // THE BRACKETED FORM IS A CODE TOO: a report prints
    // `[aontu/constraint]` and the loop says to look up the brackets.
    (0, node_test_1.test)('explain-takes-the-namespaced-spelling', () => {
        for (const code of ['constraint', 'compat_required_added', 'syntax']) {
            const bare = run(['explain', code]);
            const spaced = run(['explain', 'aontu/' + code]);
            Assert.equal(spaced.code, 0, code);
            Assert.equal(spaced.out, bare.out, code);
        }
        for (const code of Object.keys(hints_1.codeClasses)) {
            Assert.equal((0, cli_1.canonExplainCode)('aontu/' + code), code);
            Assert.equal((0, cli_1.canonExplainCode)(code), code);
        }
        // An unknown code names the registered form, not the typed one.
        const miss = run(['explain', 'aontu/nosuchcode']);
        Assert.equal(miss.code, 2);
        Assert.ok(miss.err.includes('no such error code `nosuchcode`'), miss.err);
    });
    (0, node_test_1.test)('explain-json', () => {
        const r = run(['explain', '--format', 'json', 'no_scalar_unify']);
        Assert.equal(r.code, 0);
        const report = JSON.parse(r.out);
        Assert.equal(report.code, 'no_scalar_unify');
        Assert.equal(report.class, 'conflict');
        Assert.ok(0 < report.hint.length);
    });
    (0, node_test_1.test)('explain-list-json-flags-what-is-explained', () => {
        const r = run(['explain', '--list', '--format', 'json']);
        Assert.equal(r.code, 0);
        const rows = JSON.parse(r.out).codes;
        Assert.equal(rows.length, Object.keys(hints_1.codeClasses).length);
        for (const row of rows) {
            Assert.equal(row.explained, true, row.code);
        }
    });
    // A DYNAMIC CODE IS REGISTERED THROUGH ITS PREFIX and carries the
    // prefix's hint: the suffix names the operator, the explanation is
    // the prefix's.
    (0, node_test_1.test)('explain-resolves-a-dynamic-code', () => {
        for (const code of ['func:upper', 'op[+]', 'var[x', 'ref[y']) {
            const r = run(['explain', code]);
            Assert.equal(r.code, 0, `${code}: ${r.err}`);
            Assert.ok(r.out.includes(`code:  ${code}`));
        }
    });
    (0, node_test_1.test)('explain-unknown-code-suggests-a-near-match', () => {
        const r = run(['explain', 'no_scalar_unif']);
        Assert.equal(r.code, 2);
        Assert.equal(r.out, '', 'a refusal wrote to stdout');
        for (const want of [
            'no such error code', 'did you mean `no_scalar_unify`', '--list',
        ]) {
            Assert.ok(r.err.includes(want), `the refusal omits ${want}: ${r.err}`);
        }
    });
    // The other arm of the suggestion: a code nothing is near gets the
    // refusal with no `did you mean`, because naming an unrelated code
    // with confidence is worse than naming none.
    (0, node_test_1.test)('explain-unknown-code-with-no-near-match-suggests-nothing', () => {
        const r = run(['explain', 'zzzzzzzzzzzzzzzzzzzz']);
        Assert.equal(r.code, 2);
        Assert.ok(r.err.includes('no such error code'));
        Assert.ok(!r.err.includes('did you mean'), r.err);
    });
    (0, node_test_1.test)('explain-usage-refusals', () => {
        for (const [args, want] of [
            [['explain'], 'needs one code'],
            [['explain', 'a', 'b'], 'needs one code'],
            [['explain', '--list', 'x'], 'takes no code'],
            [['explain', '--format', 'xml'], 'text or json'],
            [['explain', '--bogus'], 'unknown explain option'],
        ]) {
            const r = run(args);
            Assert.equal(r.code, 2, args.join(' '));
            Assert.ok(r.err.includes(want), `${args.join(' ')}: ${r.err}`);
        }
    });
    (0, node_test_1.test)('explain-verb-takes-the-tool-help', () => {
        const r = run(['explain', '--help']);
        Assert.equal(r.code, 0);
        Assert.ok(r.out.startsWith('Usage: aontu'));
    });
    // The in-process entries, so the exported surface is exercised as a
    // library call and not only through the packaged binary.
    (0, node_test_1.test)('help-and-explain-are-callable-in-process', () => {
        Assert.equal((0, cli_2.runHelp)([]), 0);
        Assert.equal((0, cli_2.runHelp)(['language']), 0);
        Assert.equal((0, cli_2.runHelp)(['nope']), 2);
        Assert.equal((0, cli_2.runExplain)(['--list']), 0);
        Assert.equal((0, cli_2.runExplain)(['nope']), 2);
    });
    // --- G11 phase 2: the one-argument mistyped-verb hint ---
    (0, node_test_1.test)('bare-word-is-diagnosed-as-a-mistyped-verb', () => {
        for (const [arg, near] of [
            ['vett', 'vet'], ['gett', 'get'], ['explian', 'explain'],
            ['relation', 'relations'], ['hepl', 'help'],
        ]) {
            const r = run([arg]);
            Assert.equal(r.code, 2, arg);
            Assert.ok(r.err.includes('not a verb this port knows'), arg);
            Assert.ok(r.err.includes(`did you mean \`aontu ${near}\``), `${arg}: ${r.err}`);
        }
    });
    (0, node_test_1.test)('bare-word-with-no-near-verb-suggests-nothing', () => {
        const r = run(['ontology']);
        Assert.equal(r.code, 2);
        Assert.ok(r.err.includes('not a verb this port knows'));
        Assert.ok(!r.err.includes('did you mean'), `suggested something unrelated: ${r.err}`);
    });
    // THE ESCAPE HATCH THE SUBCOMMAND DISPATCH ALREADY DOCUMENTS. A
    // path-shaped argument was meant as a path and keeps the file
    // diagnosis and its exit 1.
    (0, node_test_1.test)('path-shaped-argument-keeps-the-file-diagnosis', () => {
        for (const arg of ['./help', 'help.aon', '/tmp/aontu-no-such', 'sub/help']) {
            const r = run([arg]);
            Assert.equal(r.code, 1, arg);
            Assert.ok(r.err.includes(`cannot read ${arg}`), `${arg}: ${r.err}`);
        }
    });
    (0, node_test_1.test)('looks-like-verb', () => {
        for (const arg of ['help', 'vet', 'a']) {
            Assert.equal((0, cli_2.looksLikeVerb)(arg), true, arg);
        }
        for (const arg of [
            '', './help', 'help.aon', '/tmp/help', 'sub/help', 'a\\b', '-x',
        ]) {
            Assert.equal((0, cli_2.looksLikeVerb)(arg), false, arg);
        }
    });
    (0, node_test_1.test)('nearest-verb-respects-the-cap', () => {
        Assert.equal((0, cli_2.nearestVerb)('vett', ['vet', 'view', 'why']), 'vet');
        Assert.equal((0, cli_2.nearestVerb)('qqqqqqqqqq', ['vet', 'view', 'why']), '');
        // A TIE RESOLVES BY CODE-POINT ORDER in both ports, not by the
        // order the verb table happens to be written in: `xet` is one edit
        // from both `get` and `vet`, and `get` sorts first.
        Assert.equal((0, cli_2.nearestVerb)('xet', ['vet', 'get']), 'get');
    });
    (0, node_test_1.test)('known-verbs-all-dispatch', () => {
        for (const verb of cli_2.KNOWN_VERBS) {
            const r = run([verb, '--help']);
            Assert.ok(!r.err.includes('not a verb this port knows'), `${verb} is in KNOWN_VERBS but main() does not dispatch it`);
            Assert.equal(r.code, 0, `${verb} --help: ${r.err}`);
        }
    });
    (0, node_test_1.test)('every-dispatched-verb-is-in-known-verbs', () => {
        const src = readRepo('ts/src/cli.ts');
        const dispatched = new Set();
        for (const m of src.matchAll(/if \('([a-z]+)' === argv\[2\]\)/g)) {
            dispatched.add(m[1]);
        }
        Assert.ok(15 < dispatched.size, `only ${dispatched.size} dispatch arms found; has main() changed shape?`);
        for (const verb of dispatched) {
            Assert.ok(cli_2.KNOWN_VERBS.includes(verb), `main() dispatches \`${verb}\` and KNOWN_VERBS omits it, so a ` +
                'caller who mistypes it gets no suggestion');
        }
    });
    const TS_ONLY_VERBS = [
        'allow',
    ];
    function helpTextOf(file, decl) {
        const src = readRepo(file);
        const at = src.indexOf(decl);
        Assert.ok(-1 !== at, `${file} no longer declares ${decl}`);
        const body = src.slice(at + decl.length);
        return body.slice(0, body.indexOf('`')).split('\n');
    }
    (0, node_test_1.test)('the-tool-help-agrees-except-for-declared-port-only-verbs', () => {
        const goLines = helpTextOf('go/cmd/aontu/main.go', 'const helpText = `');
        const tsLines = helpTextOf('ts/src/cli.ts', 'const HELP = `');
        // Walk Go's lines through TypeScript's in order. Every unmatched
        // TypeScript line joins the current extra-run; a Go line that
        // never matches is a drift TypeScript does not carry.
        let ti = 0;
        let run = [];
        const extras = [];
        for (const goLine of goLines) {
            const from = ti;
            while (ti < tsLines.length && tsLines[ti] !== goLine) {
                run.push(tsLines[ti]);
                ti++;
            }
            Assert.ok(ti < tsLines.length, 'go/cmd/aontu/main.go helpText carries a line ts/src/cli.ts HELP ' +
                `does not, at or after Go line ${from}: ${JSON.stringify(goLine)}`);
            if (0 < run.length) {
                extras.push(run);
                run = [];
            }
            ti++;
        }
        if (ti < tsLines.length) {
            extras.push(tsLines.slice(ti));
        }
        for (const block of extras) {
            const text = block.join('\n');
            Assert.ok(TS_ONLY_VERBS.some((v) => text.includes(v)), 'ts/src/cli.ts HELP carries a block go/cmd/aontu/main.go helpText ' +
                'does not, naming no declared port-only verb -- the two texts ' +
                `have drifted:\n${text}`);
        }
    });
    (0, node_test_1.test)('the-tool-help-advertises-the-language-door', () => {
        const ts = readRepo('ts/src/cli.ts');
        const help = ts.slice(ts.indexOf('const HELP = `') + 14);
        const text = help.slice(0, help.indexOf('`'));
        for (const want of [
            'aontu help [topic]', 'aontu explain <code>',
            'NEW TO THE LANGUAGE?', '&: inside a map is',
        ]) {
            Assert.ok(text.includes(want), `the tool help omits ${want}`);
        }
    });
    // --- G11 phase 6: the starting document ---
    // THE SAME ASSERTION THE TEACHING PACK RESTS ON, for the trio. The
    // bodies are generated into ts/src/helpdoc.ts from docs/skill/init/,
    // where they are ordinary files a contributor can run.
    (0, node_test_1.test)('init-trio-is-identical-with-its-sources', () => {
        Assert.deepEqual(helpdoc_1.INITDOC.map((f) => f.name), ['model.aon', 'data.aon', 'check.sh']);
        for (const f of helpdoc_1.INITDOC) {
            Assert.equal(f.text, readRepo('docs/skill/init/' + f.name), `${f.name} is stale against docs/skill/init/ — run \`make helpdoc\``);
        }
        // A SCAFFOLD WHOSE SCRIPT NEEDS A CHMOD has a step missing.
        const script = helpdoc_1.INITDOC.find((f) => 'check.sh' === f.name);
        Assert.ok(null != script, 'the trio no longer carries check.sh');
        Assert.equal(script.mode, 0o755);
    });
    (0, node_test_1.test)('both-ports-stage-the-same-init-files', () => {
        const goDir = Path.join(REPO, 'go', 'cmd', 'aontu', 'helpdoc', 'init');
        const index = readRepo('go/cmd/aontu/helpdoc/init/index.tsv')
            .split('\n')
            .filter((line) => '' !== line && !line.startsWith('#'))
            .map((line) => line.split('\t'));
        Assert.deepEqual(index.map((col) => col[0]), helpdoc_1.INITDOC.map((f) => f.name), 'the two ports write different files, or in a different order');
        for (const [name, mode, file] of index) {
            const mine = helpdoc_1.INITDOC.find((f) => name === f.name);
            Assert.ok(null != mine, `${name} is staged for Go and not here`);
            Assert.equal(parseInt(mode ?? '', 8), mine.mode, `${name}: modes differ`);
            Assert.equal(file, mine.file, `${name}: sources differ`);
            Assert.equal(Fs.readFileSync(Path.join(goDir, name ?? ''), 'utf8')
                .replaceAll('\r\n', '\n').replaceAll('\r', '\n'), mine.text, `${name} differs between the ports`);
        }
    });
    // THE MISTAKE THE WHOLE GAP EXISTS FOR. A starting document that
    // reached for the quoted wildcard would teach the failure it is
    // there to prevent, so the model must use `&:` and must not carry a
    // key named `*`.
    (0, node_test_1.test)('the-starting-model-uses-the-template-and-not-the-star', () => {
        const first = helpdoc_1.INITDOC.find((f) => 'model.aon' === f.name);
        Assert.ok(null != first, 'the trio no longer carries model.aon');
        const model = first.text;
        Assert.ok(model.includes('&:'), 'model.aon does not use the template');
        // The comment NAMES the mistake, so the document itself is what is
        // asserted on: the lines that are not comments.
        const code = model.split('\n')
            .filter((line) => !line.trimStart().startsWith('#')).join('\n');
        Assert.ok(!code.includes('"*"'), 'model.aon reaches for the quoted star');
    });
    (0, node_test_1.test)('init-writes-a-trio-that-checks-itself', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-init-'));
        const r = run(['init', dir]);
        Assert.equal(r.code, 0, r.err);
        for (const f of helpdoc_1.INITDOC) {
            const at = Path.join(dir, f.name);
            Assert.equal(Fs.readFileSync(at, 'utf8'), f.text);
            if (!WINDOWS) {
                Assert.equal(Fs.statSync(at).mode & 0o777, f.mode, f.name);
            }
        }
        Assert.ok(r.out.includes(Path.join(dir, 'check.sh')), r.out);
        Assert.ok(r.out.includes('aontu help language'), r.out);
        if (!WINDOWS) {
            const env = { ...process.env };
            delete env.NODE_V8_COVERAGE;
            env.AONTU = `node ${CLI}`;
            const out = (0, node_child_process_1.execFileSync)('sh', [Path.join(dir, 'check.sh')], {
                encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'],
            });
            Assert.ok(out.includes('verdict: valid'), out);
            Assert.ok(out.includes('data leaves checked'), out);
            Assert.ok(out.includes('ok --- model.aon and data.aon agree'), out);
        }
        Fs.rmSync(dir, { recursive: true, force: true });
    });
    // NEVER OVERWRITES, and never half-writes: the standing file is
    // untouched and the two that were not there are still not there.
    (0, node_test_1.test)('init-refuses-to-overwrite', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-init-over-'));
        Fs.writeFileSync(Path.join(dir, 'model.aon'), 'mine: true\n');
        const r = run(['init', dir]);
        Assert.equal(r.code, 2);
        Assert.ok(r.err.includes('already holds model.aon'), r.err);
        Assert.ok(r.err.includes('never overwrites'), r.err);
        Assert.equal(Fs.readFileSync(Path.join(dir, 'model.aon'), 'utf8'), 'mine: true\n');
        Assert.deepEqual(Fs.readdirSync(dir), ['model.aon']);
        Fs.rmSync(dir, { recursive: true, force: true });
    });
    // BOTH WRITE FAILURES, and neither depends on the caller's uid, which
    // a mode-based test would (root writes an unwritable directory
    // happily). A path standing as a FILE refuses the directory; a member
    // of the trio standing as a symlink to itself refuses the write.
    (0, node_test_1.test)('init-refuses-a-place-it-cannot-write', () => {
        const base = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-init-ro-'));
        const notADir = Path.join(base, 'afile');
        Fs.writeFileSync(notADir, 'x');
        const one = run(['init', notADir]);
        Assert.equal(one.code, 2);
        Assert.ok(one.err.includes(`cannot write in ${notADir}`), one.err);
        // A SELF-REFERENTIAL SYMLINK is not a standing file (the existence
        // check follows it and gets nowhere), and is not writable either.
        const loop = Path.join(base, 'loop');
        Fs.mkdirSync(loop);
        Fs.symlinkSync('model.aon', Path.join(loop, 'model.aon'));
        const two = run(['init', loop]);
        Assert.equal(two.code, 2);
        Assert.ok(two.err.includes(`cannot write in ${loop}`), two.err);
        Fs.rmSync(base, { recursive: true, force: true });
    });
    (0, node_test_1.test)('init-usage-refusals', () => {
        const two = run(['init', 'one', 'two']);
        Assert.equal(two.code, 2);
        Assert.ok(two.err.includes('init takes one directory'), two.err);
        const flag = run(['init', '--nope']);
        Assert.equal(flag.code, 2);
        Assert.ok(flag.err.includes('unknown init option --nope'), flag.err);
        const help = run(['init', '--help']);
        Assert.equal(help.code, 0);
        Assert.ok(help.out.includes('Usage: aontu'), help.out);
    });
    (0, node_test_1.test)('init-is-callable-in-process-and-defaults-to-the-cwd', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-init-cwd-'));
        const was = process.cwd();
        const so = process.stdout.write;
        const se = process.stderr.write;
        let err = '';
        try {
            ;
            process.stdout.write = () => true;
            process.stderr.write = (s) => ((err += s), true);
            process.chdir(dir);
            Assert.equal((0, cli_2.runInit)([]), 0);
            Assert.equal((0, cli_2.runInit)([]), 2);
            Assert.equal((0, cli_2.runInit)(['-h']), 0);
            Assert.equal((0, cli_2.runInit)(['--nope']), 2);
            Assert.equal((0, cli_2.runInit)(['one', 'two']), 2);
            // The write that cannot happen: a member of the trio standing as
            // a symlink to itself is not a standing file (the existence
            // check follows it and gets nowhere) and is not writable either.
            const loop = Path.join(dir, 'loop');
            Fs.mkdirSync(loop);
            Fs.symlinkSync('model.aon', Path.join(loop, 'model.aon'));
            Assert.equal((0, cli_2.runInit)([loop]), 2);
        }
        finally {
            process.chdir(was);
            process.stdout.write = so;
            process.stderr.write = se;
        }
        Assert.match(err, /unknown init option --nope/);
        Assert.match(err, /init takes one directory/);
        Assert.match(err, /cannot write in/);
        Assert.deepEqual(Fs.readdirSync(dir).sort(), [...helpdoc_1.INITDOC.map((f) => f.name), 'loop'].sort());
        Fs.rmSync(dir, { recursive: true, force: true });
    });
    (0, node_test_1.test)('the-tool-help-advertises-the-starting-document', () => {
        for (const [file, decl] of [
            ['ts/src/cli.ts', 'const HELP = `'],
            ['go/cmd/aontu/main.go', 'const helpText = `'],
        ]) {
            const text = helpTextOf(file, decl).join('\n');
            Assert.ok(text.includes('aontu init [dir]'), `${file} omits init`);
            Assert.ok(text.includes('NOTHING TO EDIT YET?'), file);
        }
    });
});
//# sourceMappingURL=helpdoc.test.js.map