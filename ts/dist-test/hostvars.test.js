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
// Host bindings on the command line, `--var` and `--var-text` (HV1 of
// sketch/LANG-REFINEMENT-PLAN.0.md), driven in-process through main.
// go/cmd/aontu/hostvars_test.go holds the same cases for the Go command.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const node_stream_1 = require("node:stream");
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const cli_1 = require("../dist/cli");
const mcp_1 = require("../dist/mcp");
function cli(...args) {
    const so = process.stdout.write;
    const se = process.stderr.write;
    let out = '';
    let err = '';
    process.stdout.write = (s) => ((out += s), true);
    process.stderr.write = (s) => ((err += s), true);
    let code = 0;
    try {
        process.exitCode = 0;
        const r = (0, cli_1.main)(['node', 'cli', ...args]);
        code = 'number' === typeof r ? r : (process.exitCode ?? 0);
    }
    finally {
        process.stdout.write = so;
        process.stderr.write = se;
        process.exitCode = 0;
    }
    return { out, err, code };
}
async function cliStdin(src, tty, ...args) {
    // The runner reports through stdout too: let what it holds go first.
    await new Promise((r) => setTimeout(r, 20));
    const fake = new node_stream_1.PassThrough();
    fake.isTTY = tty;
    const desc = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', { value: fake, configurable: true });
    const so = process.stdout.write;
    const se = process.stderr.write;
    let out = '';
    let err = '';
    process.stdout.write = (s) => ((out += s), true);
    process.stderr.write = (s) => ((err += s), true);
    let code = 0;
    try {
        process.exitCode = 0;
        (0, cli_1.main)(['node', 'cli', ...args]);
        if (undefined !== src) {
            fake.write(src);
            fake.end();
        }
        await new Promise((r) => setTimeout(r, 100));
        code = process.exitCode ?? 0;
    }
    finally {
        process.stdout.write = so;
        process.stderr.write = se;
        process.exitCode = 0;
        Object.defineProperty(process, 'stdin', desc);
    }
    return { out, err, code };
}
function files(spec) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-hostvars-'));
    for (const [name, src] of Object.entries(spec)) {
        const path = Path.join(dir, name);
        Fs.mkdirSync(Path.dirname(path), { recursive: true });
        Fs.writeFileSync(path, src);
    }
    return (name) => Path.join(dir, name);
}
const V = 'env: $env\nreplicas: integer & $n\n';
(0, node_test_1.describe)('hostvars', () => {
    (0, node_test_1.test)('var-binds-source-and-var-text-binds-text', () => {
        const f = files({ 'v.aontu': V });
        const a = cli('--var', 'env=prod', '--var', 'n=3', f('v.aontu'));
        Assert.equal(a.code, 0, a.err);
        Assert.deepEqual(JSON.parse(a.out), { env: 'prod', replicas: 3 });
        const b = cli('--var-text', 'env=3', '--var', 'n=3', f('v.aontu'));
        Assert.deepEqual(JSON.parse(b.out), { env: '3', replicas: 3 });
        const c = cli('-c', '--var', 'env={a: 1}', '--var', 'n=3', f('v.aontu'));
        Assert.equal(c.out, '{"env":{"a":1},"replicas":3}\n');
    });
    (0, node_test_1.test)('a-binding-is-refused-as-a-usage-error', () => {
        const f = files({ 'v.aontu': V });
        const cases = [
            [['--var', 'zz=1'], /--var binds \$zz, which no document reads/],
            [['--var-text', 'zz=1'], /--var-text binds \$zz, which no document reads/],
            [['--var', 'n=}'], /--var n: \[aontu\/unexpected\]/],
            [['--var', 'n=$.k'], /--var n: a binding is a value, and reads no path or variable/],
            [['--var', 'n=$m'], /--var n: \[aontu\/unknown_var\]/],
            [['--var', 'n=@"v.aontu"'], /--var n: \[aontu\/include_denied\]/],
            [['--var', 'env'], /--var needs name=value/],
            [['--var', '1n=3'], /--var needs name=value/],
            [['--var', 'n=1', '--var-text', 'n=2'], /--var-text binds \$n a second time/],
        ];
        for (const [args, want] of cases) {
            const r = cli('--var', 'env=prod', ...args, f('v.aontu'));
            Assert.equal(r.code, 2, args.join(' '));
            Assert.match(r.err, want);
            Assert.equal(r.out, '');
        }
        const last = cli(f('v.aontu'), '--var');
        Assert.match(last.err, /--var needs name=value/);
    });
    (0, node_test_1.test)('a-missing-file-is-the-file-error-not-an-unread-binding', () => {
        const r = cli('--var', 'n=3', 'nosuch.aontu');
        Assert.equal(r.code, 1);
        Assert.match(r.err, /cannot read nosuch.aontu/);
    });
    (0, node_test_1.test)('a-bound-value-is-sited-at-its-option', () => {
        const f = files({ 'v.aontu': V });
        const r = cli('--var', 'env=prod', '--var', 'n=x', f('v.aontu'));
        Assert.equal(r.code, 1);
        Assert.match(r.err, /--> --var n:1:1\n {2}1 \| x\n/);
        const t = cli('--var', 'env=prod', '--var-text', 'n=12', f('v.aontu'));
        Assert.match(t.err, /--> --var-text n:1:1\n {2}1 \| "12"\n/);
    });
    (0, node_test_1.test)('an-include-reads-the-binding-too', () => {
        const f = files({
            'main.aontu': '@"./inc.aontu"\nb: 1\n',
            'inc.aontu': 'a: $deep\n',
        });
        const r = cli('--var', 'deep=7', f('main.aontu'));
        Assert.deepEqual(JSON.parse(r.out), { a: 7, b: 1 });
        for (const trust of [['--trust', 'none'], ['--trust', 'system'], ['--trust', 'root']]) {
            const t = cli(...trust, '--var', 'deep=7', f('main.aontu'));
            Assert.equal(t.code, 'none' === trust[1] ? 1 : 0, t.err);
        }
    });
    (0, node_test_1.test)('stdin-takes-the-bindings', async () => {
        const a = await cliStdin(V, false, '--var', 'env=prod', '--var', 'n=3');
        Assert.deepEqual(JSON.parse(a.out), { env: 'prod', replicas: 3 });
        const b = await cliStdin(V, false, '--var', 'q=1');
        Assert.equal(b.code, 2);
        Assert.match(b.err, /--var binds \$q, which no document reads/);
        // A source that does not parse says nothing of what it reads.
        const c = await cliStdin('a: ]', false, '--var', 'q=1');
        Assert.equal(c.code, 1);
        Assert.doesNotMatch(c.err, /no document reads/);
    });
    (0, node_test_1.test)('the-repl-takes-the-bindings', async () => {
        const f = files({ 'vals.aontu': 'n: 3\n' });
        // A session has no document yet, so a binding nothing reads passes.
        const a = await cliStdin('k: $n\nj: $q\n:quit\n', true, '--jsonl', '--var', 'n=3', '--var-text', 'q=7');
        Assert.match(a.out, /"out":"\{\\n {2}\\"k\\": 3\\n\}"/);
        Assert.match(a.out, /"out":"\{\\n {2}\\"j\\": \\"7\\"\\n\}"/);
        const b = await cliStdin('k: $n\n:quit\n', true, '--jsonl', '--vars', f('vals.aontu'));
        Assert.match(b.out, /"out":"\{\\n {2}\\"k\\": 3\\n\}"/);
        const c = await cliStdin(undefined, true, '--var', 'n=}');
        Assert.equal(c.code, 2);
        Assert.match(c.err, /--var n: \[aontu\/unexpected\]/);
    });
    (0, node_test_1.test)('the-mcp-tools-take-the-bindings', () => {
        const show = (r) => r.content[0].text;
        const got = (0, mcp_1.callTool)('get', { src: V, path: '$', vars: { env: 'prod', n: '3' } });
        Assert.equal(got.isError, false);
        Assert.deepEqual(JSON.parse(JSON.parse(show(got)).out), { env: 'prod', replicas: 3 });
        const text = JSON.parse(show((0, mcp_1.callTool)('canon', { src: V, vars: { n: '3' }, varsText: { env: '3' } })));
        Assert.equal(text.canon, '{"env":"3","replicas":3}');
        for (const [tool, args] of [
            ['summary', { src: V }], ['hash', { source: V }], ['why', { src: V, path: '$.env' }],
            ['vet', { schema: V, data: '{}' }], ['diff', { left: V, right: V }],
            ['subsume', { general: V, specific: V }], ['breaking', { old: V, new: V }],
            ['relations', { source: V }], ['reaches', { source: V, from: '$.env', to: '$.env' }],
            ['view', { source: V }], ['trim', { source: V }], ['jsonschema', { source: V }],
            ['set', { entry: V, overlay: '', assignments: [{ path: 'x', value: '1' }] }],
        ]) {
            const r = (0, mcp_1.callTool)(tool, { ...args, vars: { env: 'prod', n: '3' } });
            Assert.doesNotMatch(show(r), /unknown_var|takes no vars|no document reads/, tool);
        }
        const refused = [
            [{ vars: { n: '3', q: '1' } }, /binds \$q, which no document reads/],
            [{ vars: { n: '}' } }, /vars\.n: \[aontu\/unexpected\]/],
            [{ vars: { n: 3 } }, /vars needs an object of names to strings/],
            [{ vars: ['x'] }, /vars needs an object of names to strings/],
            [{ varsText: { 'a-b': 'x' } }, /varsText needs an object of names to strings/],
            [{ vars: { n: '3' }, varsText: { n: '3' } }, /varsText binds \$n a second time/],
        ];
        for (const [extra, want] of refused) {
            const r = (0, mcp_1.callTool)('canon', { src: V, ...extra });
            Assert.equal(r.isError, true);
            Assert.match(show(r), want);
        }
        // A document that doesn't parse can't say what it reads.
        Assert.doesNotMatch(show((0, mcp_1.callTool)('canon', { src: 'a: ]', vars: { q: '1' } })), /no document reads/);
        Assert.match(show((0, mcp_1.callTool)('jsonschema_import', { source: '{}', vars: { n: '1' } })), /takes no vars/);
        const listed = (0, mcp_1.toolList)();
        Assert.ok('vars' in listed.find((t) => 'vet' === t.name).inputSchema.properties);
        Assert.ok(!('vars' in listed.find((t) => 'jsonschema_import' === t.name)
            .inputSchema.properties));
    });
    (0, node_test_1.test)('every-verb-that-evaluates-takes-the-bindings', () => {
        const f = files({
            's.aontu': 'replicas: integer\nenv: "prod" | "dev"\n',
            'd.aontu': 'replicas: $n\nenv: $env\n',
            'm.aontu': 'k: $n\n',
            'ov.aontu': 'x: string\n',
            'd.json': '{"replicas": 3, "env": "prod"}\n',
        });
        const vet = cli('vet', '--var', 'n=3', '--var', 'env=prod', f('s.aontu'), f('d.aontu'));
        Assert.equal(vet.code, 0, vet.out + vet.err);
        const bad = cli('vet', '--var', 'n=x', '--var', 'env=prod', f('s.aontu'), f('d.aontu'));
        Assert.match(bad.out, /^verdict: invalid\n/);
        Assert.match(bad.out, /--var n:1:1 \("x"\)/);
        Assert.match(cli('vet', '--var', 'n', f('s.aontu'), f('d.aontu')).err, /--var needs name=value/);
        const unread = cli('vet', '--var', 'q=1', f('s.aontu'), f('d.json'));
        Assert.match(unread.err, /--var binds \$q, which no document reads/);
        Assert.equal(cli('model', 'get', '$.k', '--var', 'n=3', f('m.aontu')).out, '3\n');
        Assert.equal(cli('model', '--var', 'n=3', 'get', '$.k', f('m.aontu')).out, '3\n');
        Assert.equal(cli('model', 'why', '$.k', '--var', 'n=3', f('m.aontu')).code, 0);
        Assert.equal(cli('trim', '--check', '--var', 'n=3', f('m.aontu')).code, 0);
        Assert.equal(cli('subsume', '--var', 'n=3', f('m.aontu'), f('m.aontu')).code, 0);
        Assert.equal(cli('relations', '--var', 'n=3', f('m.aontu')).code, 0);
        Assert.equal(cli('jsonschema', '--var', 'n=3', f('m.aontu')).code, 0);
        const set = cli('model', 'set', 'x=$n', '--entry', f('m.aontu'), '--overlay', f('ov.aontu'), '--var', 'n=3');
        Assert.equal(set.code, 1);
        Assert.match(set.err, /schema: --var n:1:1 \(3\)/);
    });
    (0, node_test_1.test)('hash-and-breaking-name-the-bindings', () => {
        const f = files({
            'v.aontu': V,
            'old.aontu': 'env: string\nreplicas: integer\n',
            'none.aontu': 'aontu_policy: compat: "none"\nn: $n\n',
        });
        const text = cli('hash', '--var-text', 'env=prod', '--var', 'n=3', f('v.aontu'));
        Assert.match(text.err, /^aontu: hashed under --var-text env=prod --var n=3\n$/);
        Assert.match(text.out, /^aon1-/);
        const json = JSON.parse(cli('hash', '--format', 'json', '--var', 'env=prod', '--var', 'n=3', f('v.aontu')).out);
        Assert.deepEqual(json.bindings, ['--var env=prod', '--var n=3']);
        Assert.equal(undefined, JSON.parse(cli('hash', '--format', 'json', f('old.aontu')).out).bindings);
        const brk = cli('breaking', '--against', f('old.aontu'), '--var', 'env=prod', '--var', 'n=3', f('v.aontu'));
        Assert.match(brk.out, /^verdict: breaking\nunder: --var env=prod --var n=3\n/);
        const brkJson = JSON.parse(cli('breaking', '--format', 'json', '--against', f('old.aontu'), '--var', 'env=prod', '--var', 'n=3', f('v.aontu')).out);
        Assert.deepEqual(brkJson.bindings, ['--var env=prod', '--var n=3']);
        const none = cli('breaking', '--against', f('none.aontu'), '--var', 'n=3', f('none.aontu'));
        Assert.equal(none.out, 'verdict: compatible\nunder: --var n=3\n');
        const noneJson = JSON.parse(cli('breaking', '--format', 'json', '--against', f('none.aontu'), '--var', 'n=3', f('none.aontu')).out);
        Assert.deepEqual(noneJson.bindings, ['--var n=3']);
    });
    (0, node_test_1.test)('a-document-that-cannot-say-what-it-reads-refuses-no-binding', () => {
        const f = files({
            'tpl/a.aontu': 'a: $n\n',
            'notes.md': 'text\n',
            'broken.aontu': 'a: ]\n',
            'm.aontu': 'k: 1\n',
        });
        // A folder, a template and a document that does not parse each
        // leave the run to answer; a binding they cannot vouch for passes.
        for (const args of [
            ['render', '--var', 'n=3', f('tpl'), '$.a'],
            ['--var', 'n=3', f('notes.md')],
            ['--var', 'n=3', f('broken.aontu')],
            ['vet', '--var', 'n=3', f('m.aontu'), f('missing.aontu')],
        ]) {
            Assert.doesNotMatch(cli(...args).err, /no document reads/, args.join(' '));
        }
        // An argument that names no file is no document.
        Assert.match(cli('model', 'get', '$.k', '--var', 'n=3', f('m.aontu')).err, /--var binds \$n, which no document reads/);
    });
    (0, node_test_1.test)('fmt-publish-and-the-package-verbs-refuse-the-bindings', async () => {
        const f = files({ 'm.aontu': 'k: $n\n' });
        Assert.match(cli('fmt', '--var', 'n=3', f('m.aontu')).err, /--var is refused here: fmt evaluates no document/);
        Assert.match(cli('pkg', 'tidy', '--var', 'n=3').err, /--var is refused here: a package is published with no host/);
        const sync = await cliStdin(undefined, false, 'sync', '--var-text', 'n=3');
        Assert.match(sync.err, /--var-text is refused here: a package is published/);
    });
    (0, node_test_1.test)('vars-binds-each-key-of-a-file', async () => {
        const f = files({
            'v.aontu': V,
            'vals.aontu': 'env: "prod"\nn: 3\nregion: "eu"\n',
            'bad.aontu': 'env: "prod"\nn: "three"\n',
            'list.aontu': '[1, 2]\n',
            'key.aontu': '"a-b": 1\n',
            'inc.aontu': 'x: @"./vals.aontu"\n',
        });
        // A key no document reads, region, is accepted.
        const a = cli('--vars', f('vals.aontu'), f('v.aontu'));
        Assert.deepEqual(JSON.parse(a.out), { env: 'prod', replicas: 3 });
        const b = cli('--vars', f('bad.aontu'), f('v.aontu'));
        Assert.match(b.err, /--> --vars \S+bad.aontu n:1:1\n {2}1 \| "three"\n/);
        const cases = [
            [['--vars', f('vals.aontu'), '--var', 'n=4'], /--var binds \$n a second time/],
            [['--var', 'n=4', '--vars', f('vals.aontu')], /--vars \S+vals.aontu binds \$n a second time/],
            [['--vars', f('list.aontu')], /--vars \S+list.aontu holds no map of names/],
            [['--vars', f('key.aontu')], /: "a-b" is no name \$ can read/],
            [['--vars', f('inc.aontu')], /\[aontu\/include_denied\]/],
            [['--vars', f('nosuch.aontu')], /--vars needs a file it can read: \S+nosuch.aontu/],
        ];
        for (const [args, want] of cases) {
            const r = cli(...args, f('v.aontu'));
            Assert.equal(r.code, 2, args.join(' '));
            Assert.match(r.err, want);
        }
        Assert.match(cli(f('v.aontu'), '--vars').err, /--vars needs a file it can read\n/);
        Assert.match(cli('vet', '--vars', f('list.aontu'), f('v.aontu'), f('v.aontu')).err, /holds no map of names/);
        const hash = cli('hash', '--vars', f('vals.aontu'), '--var-text', 'env2=x', f('v.aontu'));
        Assert.match(hash.err, /--var-text binds \$env2, which no document reads/);
        const named = JSON.parse(cli('hash', '--format', 'json', '--vars', f('vals.aontu'), f('v.aontu')).out);
        Assert.deepEqual(named.bindings, ['--vars ' + f('vals.aontu')]);
        Assert.match(cli('pkg', 'tidy', '--vars', f('vals.aontu')).err, /--vars is refused here: a package is published/);
        const piped = await cliStdin(V, false, '--vars', f('vals.aontu'));
        Assert.deepEqual(JSON.parse(piped.out), { env: 'prod', replicas: 3 });
    });
    (0, node_test_1.test)('a-name-the-object-prototype-holds-and-a-read-in-an-assignment-bind', () => {
        const show = (r) => r.content[0].text;
        Assert.equal(JSON.parse(show((0, mcp_1.callTool)('canon', { src: 'n: $constructor', vars: { constructor: '3' } }))).canon, '{"n":3}');
        const set = JSON.parse(show((0, mcp_1.callTool)('set', {
            entry: 'n: number', overlay: '', assignments: [{ path: 'n', value: '$n' }],
            vars: { n: '3' },
        })));
        Assert.equal(set.verdict, 'valid');
        Assert.deepEqual(JSON.parse(show((0, mcp_1.callTool)('hash', { source: 'n: $n', vars: { n: '3' } })))
            .bindings, ['--var n=3']);
        Assert.deepEqual(JSON.parse(show((0, mcp_1.callTool)('breaking', { old: 'n: $n', new: 'n: $n', varsText: { n: 'x' } }))).bindings, ['--var-text n=x']);
        Assert.equal(undefined, JSON.parse(show((0, mcp_1.callTool)('hash', { source: 'n: 1' }))).bindings);
        const none = JSON.parse(show((0, mcp_1.callTool)('breaking', {
            old: 'aontu_policy: compat: "none"\nn: $n', new: 'aontu_policy: compat: "none"\nn: $n',
            vars: { n: '1' },
        })));
        Assert.deepEqual(none.bindings, ['--var n=1']);
        const f = files({ 'e.aontu': 'n: number\n', 'o.aontu': '', 'k.aontu': 'k: $constructor\n' });
        const cli1 = cli('model', 'set', 'n=$n', '--entry', f('e.aontu'), '--overlay', f('o.aontu'), '--var', 'n=3');
        Assert.doesNotMatch(cli1.err, /no document reads/);
        Assert.deepEqual(JSON.parse(cli('--var', 'constructor=3', f('k.aontu')).out), { k: 3 });
    });
    (0, node_test_1.test)('the-engine-option-binds-for-every-context-given-no-vars', () => {
        const a = new aontu_1.Aontu({ hostVars: { n: { value: '3' }, s: { value: '3', text: true } } });
        Assert.deepEqual(a.generate('a: $n\nb: $s\n'), { a: 3, b: '3' });
        // A context given vars of its own keeps them.
        const own = a.ctx({ vars: { n: 4, s: 'x' } });
        Assert.deepEqual(a.generate('a: $n\nb: $s\n', undefined, own), { a: 4, b: 'x' });
        // A module evaluates with no host.
        Assert.throws(() => new aontu_1.Aontu().generate('a: $n\n'), /unknown_var/);
    });
});
//# sourceMappingURL=hostvars.test.js.map