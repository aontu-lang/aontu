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
const node_child_process_1 = require("node:child_process");
const aontu_1 = require("../dist/aontu");
const DOCS_DIR = Path.join(__dirname, '..', '..', 'docs');
const CLI = Path.join(__dirname, '..', 'bin', 'aontu.js');
function narrowed() {
    const v = process.env.DOCS_PAGES;
    return null == v || '' === v ? undefined : v.split(',');
}
function execPages() {
    const only = narrowed();
    if (only) {
        return only.filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)));
    }
    const fixed = [
        'index.md',
        'tutorial.md',
        'tutorial-config.md',
        'tutorial-graph.md',
        'tutorial-package.md',
        'tutorial-generate.md',
        'unification.md',
        'reference-language.md',
        'reference-generation.md',
        'reference-functions.md',
        'reference-errors.md',
        'reference-api.md',
        'use-cases.md',
    ].filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)));
    const howtoDir = Path.join(DOCS_DIR, 'how-to');
    const howto = Fs.existsSync(howtoDir)
        ? Fs.readdirSync(howtoDir).filter((f) => f.endsWith('.md'))
            .sort().map((f) => Path.join('how-to', f))
        : [];
    // The monolithic how-to.md remains in the list only while it still
    // exists; the split guides replace it.
    const mono = Fs.existsSync(Path.join(DOCS_DIR, 'how-to.md'))
        ? ['how-to.md'] : [];
    return [...fixed, ...mono, ...howto];
}
// The style-gated page set: every Diátaxis page plus the reference
// and contributor documents. STYLE-GUIDE.md itself is exempt — it
// quotes the banned phrases in order to ban them.
function stylePages() {
    const only = narrowed();
    if (only) {
        return only.filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)));
    }
    return [...execPages(),
        'explanation.md', 'trust.md', 'lsp.md',
        'shared-spec.md', 'test-coverage.md', 'release-and-tag.md',
    ].filter((f, i, a) => a.indexOf(f) === i)
        .filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)));
}
function publishedPages() {
    const only = narrowed();
    if (only) {
        return only.filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)));
    }
    return [...execPages(), 'explanation.md', 'trust.md', 'lsp.md']
        .filter((f, i, a) => a.indexOf(f) === i)
        .filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)));
}
// `aon` and `aontu` are both used as the fence tag for an Aontu
// document; the reference-language file uses the first and the
// teaching documents the second.
const SOURCE_TAGS = new Set(['aon', 'aontu']);
function lf(text) {
    return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
function extract(file, md) {
    const lines = md.split('\n');
    const out = [];
    let pending;
    let keep;
    for (let i = 0; i < lines.length; i++) {
        // `<!-- fmt: keep <reason> -->`: the next Aontu fence keeps its
        // spelling rather than the agreed form, for the reason given (the
        // formatter gate below). It rides beside a test directive.
        const km = lines[i].match(/^<!--\s*fmt:\s*([a-z]+)\s*(.*?)\s*-->\s*$/);
        if (km) {
            Assert.equal(km[1], 'keep', `${file}:${i + 1} unknown fmt directive verb: ${km[1]}`);
            Assert.ok('' !== km[2], `${file}:${i + 1} fmt: keep needs a reason`);
            Assert.ok(undefined === keep, `${file}:${i + 1} fmt: keep while another still awaits its fence`);
            keep = km[2];
            continue;
        }
        const dm = lines[i].match(/^<!--\s*test:\s*([a-z]+)\s*(.*?)\s*-->\s*$/);
        if (dm) {
            const verb = dm[1];
            Assert.ok(['scenario', 'file', 'run', 'skip'].includes(verb), `${file}:${i + 1} unknown test directive verb: ${verb}`);
            if ('scenario' === verb) {
                Assert.ok('' !== dm[2], `${file}:${i + 1} scenario needs a name`);
                out.push({ kind: 'scenario', name: dm[2], line: i + 1 });
                continue;
            }
            Assert.ok(undefined === pending, `${file}:${i + 1} directive while another (line ${pending?.line}) ` +
                `still awaits its fence`);
            pending = { verb: verb, arg: dm[2], line: i + 1 };
            continue;
        }
        const fm = lines[i].match(/^```([a-z]*)[ \t]*$/);
        if (fm) {
            const start = i + 1;
            const body = [];
            i++;
            while (i < lines.length && !/^```[ \t]*$/.test(lines[i])) {
                body.push(lines[i]);
                i++;
            }
            Assert.ok(i < lines.length, `${file}:${start} unclosed fence`);
            const b = {
                lang: fm[1],
                body: body.join('\n') + (body.length ? '\n' : ''),
                line: start,
            };
            if (pending) {
                b.directive = pending;
                pending = undefined;
            }
            if (undefined !== keep) {
                Assert.ok(SOURCE_TAGS.has(b.lang), `${file}:${start} fmt: keep above a fence that is not Aontu source`);
                b.keep = keep;
                keep = undefined;
            }
            out.push({ kind: 'block', block: b });
            continue;
        }
    }
    Assert.ok(undefined === pending, `${file}:${pending?.line} directive is not followed by a fence`);
    Assert.ok(undefined === keep, `${file}: fmt: keep is not followed by a fence`);
    return out;
}
function pages() {
    return execPages().map((file) => {
        const items = extract(file, lf(Fs.readFileSync(Path.join(DOCS_DIR, file), 'utf8')));
        return {
            file, items,
            blocks: items.filter((x) => 'block' === x.kind)
                .map((x) => x.block),
        };
    });
}
// A block the page ships whole: a source fence with no `@"` include
// and no file directive (a scenario member is proven by its runs).
function selfContained(b) {
    return SOURCE_TAGS.has(b.lang) && !b.body.includes('@"')
        && 'file' !== b.directive?.verb;
}
function parseTranscript(file, b) {
    const steps = [];
    const lines = b.body.replace(/\n$/, '').split('\n');
    let cur;
    lines.forEach((ln, i) => {
        if (ln.startsWith('$ ')) {
            const cmd = ln.slice(2).trim();
            if (/^echo \$\?$/.test(cmd)) {
                Assert.ok(cur, `${file}:${b.line + i + 1} echo $? with no command`);
                cur = { cmd, expect: [], line: b.line + i + 1, exitOf: cur };
            }
            else {
                cur = { cmd, expect: [], line: b.line + i + 1 };
            }
            steps.push(cur);
        }
        else {
            Assert.ok(cur, `${file}:${b.line + i + 1} transcript output before any command`);
            cur.expect.push(ln);
        }
    });
    return steps;
}
// Minimal quote-aware splitter: double and single quotes group words;
// no escapes, no expansion. Anything needing more is real shell and
// belongs in a use-case check.sh, not a doc transcript.
function splitArgs(file, line, s) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while (null != (m = re.exec(s))) {
        out.push(m[1] ?? m[2] ?? m[3]);
    }
    // Shell features are not modelled — with one exception, the single
    // pipe of the `echo '<text>' | aontu …` stdin form, which runStep
    // handles itself before any spawn.
    const unquoted = s.replace(/'[^']*'|"[^"]*"/g, '');
    const bare = s.startsWith('echo ')
        ? unquoted.replace('|', '') : unquoted;
    Assert.ok(!/[|&;<>`]/.test(bare), `${file}:${line} transcript uses shell features the harness does ` +
        `not model: simplify, or mark <!-- test: skip … -->\n  ${s}`);
    return out;
}
function norm(s) {
    return lf(s).split('\n').map((l) => l.replace(/[ \t]+$/, ''))
        .join('\n').trim();
}
// Expected output with `...` wildcard lines: build a regex where a
// lone `...` matches any (possibly empty) run of lines.
function matches(expect, got) {
    const want = norm(expect.join('\n'));
    const parts = want.split(/^\.\.\.$/m).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim());
    const re = new RegExp('^' + parts.join('(?:[\\s\\S]*?)') + '$');
    return re.test(norm(got));
}
// XDG_CACHE_HOME is the scenario's own: the package verbs resolve a
// dependency from a machine-wide store that other runs write to.
function runStep(file, dir, cache, step) {
    let argv = splitArgs(file, step.line, step.cmd);
    let input;
    // The one stdin form: echo '<text>' | aontu …
    if ('echo' === argv[0]) {
        const pipe = argv.indexOf('|');
        Assert.ok(1 < pipe && 'aontu' === argv[pipe + 1], `${file}:${step.line} only \`echo '<text>' | aontu …\` is modelled`);
        input = argv.slice(1, pipe).join(' ');
        argv = argv.slice(pipe + 1);
    }
    Assert.equal(argv[0], 'aontu', `${file}:${step.line} transcript commands start with aontu (or ` +
        `the echo-pipe form); got: ${step.cmd}`);
    const aontu = process.env.AONTU?.split(' ');
    const [bin, ...pre] = aontu ?? [process.execPath, CLI];
    try {
        const out = (0, node_child_process_1.execFileSync)(bin, [...pre, ...argv.slice(1)], {
            cwd: dir, input,
            env: { ...process.env, NO_COLOR: '1', XDG_CACHE_HOME: cache },
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { out, code: 0 };
    }
    catch (e) {
        const out = String(e.stdout ?? '') + String(e.stderr ?? '');
        return { out, code: e.status ?? 1 };
    }
}
// ---------------------------------------------------------------------
(0, node_test_1.describe)('docs', () => {
    // A parse failure in a documented example is never the lesson.
    (0, node_test_1.test)('every-documented-example-parses', () => {
        let checked = 0;
        for (const page of pages()) {
            page.blocks.forEach((b) => {
                if (!selfContained(b)) {
                    return;
                }
                checked++;
                const aontu = new aontu_1.Aontu();
                const ctx = aontu.ctx({ collect: true });
                aontu.parse(b.body, undefined, ctx);
                Assert.deepEqual(ctx.err.map((e) => e.why), [], `${page.file}:${b.line} does not parse:\n${b.body}`);
            });
        }
        // The extractor silently matching nothing would make every
        // assertion above vacuous, so the count is asserted too. Floors
        // are corpus-wide claims; a DOCS_PAGES run suspends them.
        if (undefined === narrowed()) {
            Assert.ok(30 < checked, `too few examples extracted: ${checked}`);
        }
    });
    // The claim each page makes about what its example EVALUATES TO,
    // re-derived from the engine. Structural comparison: the page owns
    // its own whitespace and key order.
    (0, node_test_1.test)('every-stated-result-is-the-engine-s', () => {
        let checked = 0;
        for (const page of pages()) {
            page.blocks.forEach((b, i) => {
                const next = page.blocks[i + 1];
                if (!selfContained(b) || null == next || 'json' !== next.lang
                    || null != next.directive) {
                    return;
                }
                checked++;
                b.covered = next.covered = 'pair';
                const got = new aontu_1.Aontu().generate(b.body);
                Assert.deepEqual(got, JSON.parse(next.body), `${page.file}:${b.line} does not generate what it states:\n` +
                    `${b.body}\n--- stated ---\n${next.body}`);
            });
        }
        if (undefined === narrowed()) {
            Assert.ok(5 < checked, `too few stated results extracted: ${checked}`);
        }
    });
    // Scenarios and transcripts: the directive vocabulary, executed in
    // document order per page. A `file` fence is written into the
    // page's current scenario directory; a `run` fence is a transcript
    // executed there. On failure the scenario directory is kept and
    // named, so the failure is reproducible by hand.
    (0, node_test_1.test)('every-scenario-and-transcript-runs', () => {
        let scenarios = 0;
        let commands = 0;
        for (const page of pages()) {
            let dir;
            let cache;
            let scenarioId = '';
            // Both bindings are reassigned per scenario; earlier pairs leak.
            const opened = [];
            const open = (id) => {
                dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-docs-'));
                cache = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-docs-cache-'));
                opened.push(dir, cache);
                scenarioId = id;
                scenarios++;
            };
            for (const item of page.items) {
                if ('scenario' === item.kind) {
                    open(item.name);
                    continue;
                }
                const b = item.block;
                const d = b.directive;
                if (null == d) {
                    continue;
                }
                if ('file' === d.verb) {
                    Assert.ok('' !== d.arg, `${page.file}:${d.line} file directive needs a name`);
                    if (null == dir) {
                        open('(anonymous)');
                    }
                    Assert.ok(!d.arg.includes('..') && !Path.isAbsolute(d.arg), `${page.file}:${d.line} file name escapes the scenario: ${d.arg}`);
                    const p = Path.join(dir, d.arg);
                    Fs.mkdirSync(Path.dirname(p), { recursive: true });
                    Fs.writeFileSync(p, b.body);
                    b.covered = 'file';
                }
                if ('run' === d.verb) {
                    Assert.equal(b.lang, 'sh', `${page.file}:${d.line} run directives annotate sh fences`);
                    if (null == dir) {
                        open('(anonymous)');
                    }
                    const steps = parseTranscript(page.file, b);
                    let prevCode = 0;
                    for (const step of steps) {
                        if (step.exitOf) {
                            const want = step.expect.join('\n').trim();
                            Assert.equal(String(prevCode), want, `${page.file}:${step.line} [${scenarioId}] exit code: ` +
                                `command exited ${prevCode}, page states ${want}\n` +
                                `  scenario dir kept: ${dir}`);
                            commands++;
                            continue;
                        }
                        const r = runStep(page.file, dir, cache, step);
                        prevCode = r.code;
                        commands++;
                        // A command with no echo $? after it must succeed; one
                        // with an exit pin may exit however the pin states.
                        const idx = steps.indexOf(step);
                        const pinned = steps[idx + 1]?.exitOf === step;
                        if (!pinned) {
                            Assert.equal(r.code, 0, `${page.file}:${step.line} [${scenarioId}] ` +
                                `\`${step.cmd}\` exited ${r.code} with no stated exit\n` +
                                `${r.out}\n  scenario dir kept: ${dir}`);
                        }
                        Assert.ok(matches(step.expect, r.out), `${page.file}:${step.line} [${scenarioId}] output mismatch ` +
                            `for \`${step.cmd}\`\n--- stated ---\n` +
                            `${JSON.stringify(step.expect.join('\n'))}\n--- got ---\n` +
                            `${JSON.stringify(norm(r.out))}\n  scenario dir kept: ${dir}`);
                    }
                    b.covered = 'run';
                }
                if ('skip' === d.verb) {
                    Assert.ok('' !== d.arg.trim(), `${page.file}:${d.line} a skip needs its reason`);
                    b.covered = 'skip';
                }
            }
            // A failure threw before this, keeping the dirs it named.
            for (const at of opened) {
                Fs.rmSync(at, { recursive: true, force: true });
            }
        }
        // Floors, per the vacuity-guard precedent above. Tuned to the
        // rewritten set; raise them as the corpus grows.
        if (undefined === narrowed()) {
            Assert.ok(4 <= scenarios, `too few scenarios extracted: ${scenarios}`);
            Assert.ok(10 <= commands, `too few transcript commands: ${commands}`);
        }
    });
    // The accounting layer: every tagged fence is covered or skipped.
    // Untagged fences make no language claim and are exempt.
    (0, node_test_1.test)('every-snippet-is-tested-or-owns-its-skip', () => {
        // Re-derive coverage exactly as the checks above assign it, then
        // demand a disposition for what remains — reported as one census,
        // so a page's whole debt is visible in one failure.
        const untested = [];
        for (const page of pages()) {
            page.blocks.forEach((b, i) => {
                if ('' === b.lang) {
                    return; // no language claim
                }
                const d = b.directive;
                if (d && ('file' === d.verb || 'run' === d.verb
                    || 'skip' === d.verb)) {
                    return; // scenario member, transcript, or owned skip
                }
                if (selfContained(b)) {
                    return; // parse-checked; possibly also a pair
                }
                const prev = page.blocks[i - 1];
                if ('json' === b.lang && null != prev && selfContained(prev)) {
                    return; // the stated half of a pair
                }
                untested.push(`${page.file}:${b.line} (${b.lang})`);
            });
        }
        Assert.deepEqual(untested, [], `snippets with no test and no owned skip — give each a ` +
            `directive: file/run for execution, or skip with a reason ` +
            `(docs/STYLE-GUIDE.md, "Code snippets"):\n${untested.join('\n')}`);
    });
    (0, node_test_1.test)('every-source-fence-is-in-the-agreed-form-or-keeps-its-spelling', () => {
        const failures = [];
        let checked = 0;
        let kept = 0;
        for (const page of pages()) {
            for (const b of page.blocks) {
                if (!SOURCE_TAGS.has(b.lang)) {
                    continue;
                }
                const r = (0, aontu_1.format)(b.body);
                if ('error' === r.verdict) {
                    continue;
                }
                checked++;
                if (undefined !== b.keep) {
                    kept++;
                    const again = (0, aontu_1.format)(r.text);
                    if ('error' === again.verdict || again.text !== r.text) {
                        failures.push(`${page.file}:${b.line} (kept, not a fixed point)`);
                    }
                    else if (r.text === b.body) {
                        failures.push(`${page.file}:${b.line} (kept, but already in the agreed form)`);
                    }
                }
                else if (r.text !== b.body) {
                    failures.push(`${page.file}:${b.line}`);
                }
            }
        }
        Assert.deepEqual(failures, [], `fences not in the agreed form (run aontu fmt over the body, or ` +
            `mark <!-- fmt: keep <reason> -->): ${failures.join(', ')}`);
        if (undefined === narrowed()) {
            Assert.ok(200 <= checked, `too few fences checked: ${checked}`);
            Assert.ok(kept <= 20, `too many fences keep their spelling: ${kept}`);
        }
    });
    (0, node_test_1.test)('function-signatures-match-the-registry', () => {
        // THE DRIFT GATE (docs/design/SIGNATURES.0.md): a signature printed
        // on any gated page is the one the engine parses, pipes escaped in
        // a table cell. Aimed at the set rather than one filename, which
        // stops checking the rest the day a page moves.
        const { funcSig, renderSig } = require('../dist/sig');
        const seen = new Set();
        let rows = 0;
        for (const { file, abs } of stylePaths()) {
            for (const line of Fs.readFileSync(abs, 'utf8').split('\n')) {
                const m = line.match(/^(?:\| |### )`([a-z]+)\(([^`]*)\)([^`]*)`(?: \||$)/);
                if (null == m || undefined === funcSig[m[1]]) {
                    continue;
                }
                // Schematic rows (the subsumption table's `neq(S)` and kin) use
                // meta-variables, not signatures; a signature always carries a
                // colon.
                if (!m[2].includes(':') && !m[3].includes(':')) {
                    continue;
                }
                const cell = (m[1] + '(' + m[2] + ')' + m[3]).replace(/\\[|]/g, '|');
                Assert.equal(cell, renderSig(funcSig[m[1]]), file + ': reference signature for ' + m[1]);
                seen.add(m[1]);
                rows++;
            }
        }
        if (undefined === narrowed()) {
            // The index check requires every function on its own page; this
            // one requires its signature to be printed somewhere at all.
            Assert.deepEqual(Object.keys(funcSig).filter((name) => !seen.has(name)), [], 'declared built-ins whose signature no gated page prints');
            Assert.ok(Object.keys(funcSig).length <= rows, 'reference signatures found: ' + rows);
        }
    });
    (0, node_test_1.test)('scenario-files-are-named-in-prose', () => {
        for (const page of pages()) {
            const text = lf(Fs.readFileSync(Path.join(DOCS_DIR, page.file), 'utf8'));
            const lines = text.split('\n');
            for (const b of page.blocks) {
                if ('file' !== b.directive?.verb) {
                    continue;
                }
                const at = b.directive.line - 1;
                const above = lines.slice(Math.max(0, at - 3), at).join('\n');
                Assert.ok(above.includes('`' + b.directive.arg + '`'), `${page.file}:${b.directive.line} the prose above should name ` +
                    `\`${b.directive.arg}\` in a code span (STYLE-GUIDE.md)`);
            }
        }
    });
});
const node_module_1 = require("node:module");
const REPO = Path.join(__dirname, '..', '..');
// The banned list, read from the file VALE READS. Keeping one copy is
// what stops the fast local gate and the CI gate disagreeing about what
// is banned; a phrase added there is picked up by both.
const REJECT_FILE = Path.join(REPO, '.vale', 'styles', 'config', 'vocabularies', 'Aontu', 'reject.txt');
// Vale reads every non-blank line as a pattern: a vocabulary file has
// no comment syntax. A heading is inert; a line that is only `#` bans
// the character, and is refused.
function loadBanned() {
    const lines = Fs.readFileSync(REJECT_FILE, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => '' !== line);
    const bare = lines.filter((line) => '#' === line);
    if (0 < bare.length) {
        throw new Error(`${REJECT_FILE} has ${bare.length} line(s) that are only "#". ` +
            'Vale reads that as a pattern banning the character.');
    }
    return lines.map((pat) => [new RegExp(`\\b(?:${pat})\\b`, 'gi'), pat]);
}
const BANNED = loadBanned();
if (0 === BANNED.length) {
    throw new Error(`${REJECT_FILE} loaded no patterns; the phrase gate is off`);
}
const FENCE_OPEN = /^(\s{0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
function fenceCloser(fence) {
    return new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`);
}
// Blank out every fenced block, keeping the line count so a reported
// line number still opens on the offending line.
function fenceless(md) {
    const lines = lf(md).split('\n');
    const out = [...lines];
    for (let i = 0; i < lines.length; i++) {
        const fm = lines[i].match(FENCE_OPEN);
        if (!fm) {
            continue;
        }
        const closer = fenceCloser(fm[2]);
        out[i] = '';
        let j = i + 1;
        for (; j < lines.length && !closer.test(lines[j]); j++) {
            out[j] = '';
        }
        if (j < lines.length) {
            out[j] = '';
        }
        i = j;
    }
    return out.join('\n');
}
// The delimiter is a RUN of backticks, maximal at both ends, and stops
// at a newline. Without either guard the match shrinks or runs on, and
// the prose it removes was never a code span.
const CODE_SPAN = /(?<!`)(`+)(?!`)(?:[^`\n]|(?!\1)`)*(?<!`)\1(?!`)/g;
// A warning sign or arrow is text presentation; a keycap or a flag
// sits in no symbol block.
const EMOJI = /\p{Emoji_Presentation}|\uFE0F|\u20E3|[\u{1F1E6}-\u{1F1FF}]/u;
// `I` is a pronoun only capitalised, since a lone `i` is the one in
// `i.e.`; `my` is one however it falls. `I/O` is neither.
const FIRST_I = /\bI(?!\/O)\b|\bI'(?:m|ve|ll|d)\b/;
const FIRST_MY = /\b(?:my|mine|myself)\b/i;
function firstSingular(line) {
    const found = line.match(FIRST_I) || line.match(FIRST_MY);
    return found ? found[0] : null;
}
// Every mark except `!=` and the `!` opening an image.
const EXCLAMATION = /!(?![=[])/g;
// A span that wraps once, which CODE_SPAN's newline bound leaves whole.
// The newline is kept, so a reported line still points at the author's.
const CODE_WRAP = /(?<!`)(`+)(?!`)(?:[^`\n]|(?!\1)`)*\n(?:[^`\n]|(?!\1)`)*(?<!`)\1(?!`)/g;
// A destination is not prose: the `!` in `](/a!b)` spent a page's
// exclamation ration on a URL character.
const DESTINATION = /(\]\()[^)\n]*\)/g;
const AUTOLINK = /<https?:\/\/[^\s<>]*>/g;
const URL = /\bhttps?:\/\/[^\s<>)\]]*[^\s<>)\]!.,;:?*_"']/g;
function prose(md) {
    return fenceless(md)
        .replace(/^---\n[\s\S]*?\n---\n/, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(CODE_SPAN, '')
        .replace(CODE_WRAP, (m) => m.replace(/[^\n]/g, ''))
        .replace(DESTINATION, '$1)')
        .replace(AUTOLINK, '')
        .replace(URL, '');
}
// Markdown needs no blank line before a block, so `## Something worth`
// above `noting this` joined and reported `worth noting`. A heading,
// table row and rule close as well as open.
const OPENS = /^\s*(?:[-*+] |\d+[.)] |#{1,6} |>|`{3,}|~{3,})/;
const CLOSES = /^\s*(?:#{1,6} |(?:[-*_] *){3,}$)/;
// A single-column table writes `| cell`, one pipe, the shape of a
// sentence opening with one; the delimiter row tells them apart.
const PIPED = /^\s*\|/;
const DELIMITER = /^\s*\|[-:| ]*-[-:| ]*$/;
function tableRows(lines) {
    const rows = new Set();
    for (let i = 0; i < lines.length; i++) {
        if (!PIPED.test(lines[i])) {
            continue;
        }
        let end = i;
        while (end < lines.length && PIPED.test(lines[end])) {
            end++;
        }
        const table = lines.slice(i, end).some((l) => DELIMITER.test(l));
        for (let n = i; n < end; n++) {
            if (table || 1 < (lines[n].match(/\|/g) || []).length) {
                rows.add(n);
            }
        }
        i = end - 1;
    }
    return rows;
}
function logical(text) {
    const out = [];
    let pieces = [];
    let starts = [];
    let lines = [];
    let at = 0;
    const flush = () => {
        if (0 < pieces.length) {
            out.push({ text: pieces.join(' '), starts, lines, pieces });
            pieces = [];
            starts = [];
            lines = [];
            at = 0;
        }
    };
    const split = lf(text).split('\n');
    const rows = tableRows(split);
    split.forEach((line, i) => {
        if ('' === line.trim()) {
            flush();
            return;
        }
        if (OPENS.test(line) || rows.has(i)) {
            flush();
        }
        const piece = line.trim().replace(/\s+/g, ' ');
        starts.push(at);
        lines.push(i + 1);
        pieces.push(piece);
        at += piece.length + 1;
        if (CLOSES.test(line) || rows.has(i)) {
            flush();
        }
    });
    flush();
    return out;
}
// Which physical line a match offset fell on.
function lineAt(para, index) {
    let k = 0;
    for (let n = 0; n < para.starts.length; n++) {
        if (para.starts[n] <= index) {
            k = n;
        }
    }
    return { line: para.lines[k], text: para.pieces[k] };
}
function stylePaths() {
    const only = narrowed();
    if (only) {
        return only
            .map((f) => ({ file: `docs/${f}`, abs: Path.join(DOCS_DIR, f) }))
            .filter(({ abs }) => Fs.existsSync(abs));
    }
    const require = (0, node_module_1.createRequire)(__filename);
    const { gatedDocs } = require(Path.join(REPO, 'ts', 'scripts', 'gated-docs.cjs'));
    return gatedDocs()
        .map((f) => ({ file: f, abs: Path.join(REPO, f) }));
}
(0, node_test_1.describe)('docs-style', () => {
    (0, node_test_1.test)('the-gated-set-covers-more-than-docs', () => {
        if (narrowed()) {
            return;
        }
        const files = stylePaths().map((p) => p.file);
        Assert.ok(60 < files.length, `gated set is ${files.length} files`);
        Assert.ok(files.includes('README.md'), 'README.md is gated');
        Assert.ok(files.includes('ts/README.md'), 'ts/README.md is gated');
        Assert.equal(files.filter((f) => f.startsWith('use-cases/')).length, 18, 'the eighteen published use cases are gated');
        // aontu-lang/web publishes these as /examples.
        Assert.ok(files.includes('test/system/README.md'), 'the systems index is gated');
        Assert.ok(files.includes('test/system/rb-solar/README.md'), 'each system README is gated');
        Assert.ok(files.includes('test/system/rb-solar/doc/erd.md'), 'each system guide is gated');
    });
    (0, node_test_1.test)('no-banned-phrases-in-prose', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            for (const para of logical(prose(Fs.readFileSync(abs, 'utf8')))) {
                for (const [re, name] of BANNED) {
                    for (const m of para.text.matchAll(re)) {
                        if (null == m.index) {
                            continue;
                        }
                        const { line, text } = lineAt(para, m.index);
                        const hit = `${file}:${line} "${name}": ${text}`;
                        if (!hits.includes(hit)) {
                            hits.push(hit);
                        }
                    }
                }
            }
        }
        Assert.deepEqual(hits, [], `banned phrases (docs/STYLE-GUIDE.md):\n${hits.join('\n')}`);
    });
    // Literal code and quoted output keep their punctuation. The rule applies
    // to prose, using the same stripper as the phrase and first-person gates.
    (0, node_test_1.test)('no-em-dashes-in-prose', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            prose(Fs.readFileSync(abs, 'utf8'))
                .split('\n')
                .forEach((line, i) => {
                if (line.includes('—')) {
                    hits.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], `em dashes in prose (docs/STYLE-GUIDE.md):\n${hits.join('\n')}`);
    });
    // `tutorial.md` is the INDEX of these and teaches nothing itself, so
    // it is held to the ordinary rules rather than the tutorial ones.
    const TUTORIAL_PAGES = [
        'docs/tutorial-config.md', 'docs/tutorial-graph.md',
        'docs/tutorial-package.md', 'docs/tutorial-generate.md',
    ];
    (0, node_test_1.test)('we-appears-only-in-tutorials', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            if (TUTORIAL_PAGES.includes(file)) {
                continue;
            }
            prose(Fs.readFileSync(abs, 'utf8'))
                .split('\n')
                .forEach((line, i) => {
                const m = line.match(/\b(we|we'(?:ll|ve|re|d)|us|our|ours|let's)\b/i);
                if (m) {
                    hits.push(`${file}:${i + 1} "${m[1]}": ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], 'first-person plural outside a tutorial ' +
            `(docs/STYLE-GUIDE.md, voice rule 7):\n${hits.join('\n')}`);
    });
    // "I" is stricter than Google's rule and applies to every page.
    // I/O is a word, not a pronoun; the negative lookahead keeps it.
    (0, node_test_1.test)('first-person-singular-appears-nowhere', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            prose(Fs.readFileSync(abs, 'utf8'))
                .split('\n')
                .forEach((line, i) => {
                const m = firstSingular(line);
                if (m) {
                    hits.push(`${file}:${i + 1} "${m}": ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], 'first-person singular in documentation ' +
            `(docs/STYLE-GUIDE.md, voice rule 7):\n${hits.join('\n')}`);
    });
    (0, node_test_1.test)('the-name-is-spelled-aontu', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            prose(Fs.readFileSync(abs, 'utf8'))
                .split('\n')
                .forEach((line, i) => {
                const m = line.match(/Aont[uú]/);
                if (m) {
                    hits.push(`${file}:${i + 1} "${m[0]}": ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], 'the name is "aontu", lowercase and with no fada ' +
            `(docs/STYLE-GUIDE.md, Terminology):\n${hits.join('\n')}`);
    });
    (0, node_test_1.test)('exclamation-marks-are-rationed', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            // A sentence-ending mark, not every `!` byte: `!=` is an
            // operator and `![alt](src)` is an image.
            const n = (prose(Fs.readFileSync(abs, 'utf8'))
                .match(EXCLAMATION) || []).length;
            if (0 === n) {
                continue;
            }
            if (!TUTORIAL_PAGES.includes(file)) {
                hits.push(`${file}: ${n} outside a tutorial`);
            }
            else if (1 < n) {
                hits.push(`${file}: ${n}, and a tutorial gets one`);
            }
        }
        Assert.deepEqual(hits, [], 'exclamation marks: at most one per page, tutorials only ' +
            `(docs/STYLE-GUIDE.md):\n${hits.join('\n')}`);
    });
    (0, node_test_1.test)('no-emoji', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            lf(Fs.readFileSync(abs, 'utf8'))
                .split('\n')
                .forEach((line, i) => {
                if (EMOJI.test(line)) {
                    hits.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], `emoji are not used in documentation:\n${hits.join('\n')}`);
    });
    const INTERNAL_REFS = [
        [/\bADR-\d+\b/g, 'a decision record'],
        // The bare prose form. `ADR` names a record the reader cannot
        // open, whether or not a number follows it.
        [/\b(?:the|an|this|that) ADR\b/gi, 'a decision record'],
        [/\bADR\.md\b/g, 'ADR.md'],
        [/capability-review/g, 'the capability review'],
        [/\bG\d+ phase \d+\b/g, 'a capability-review phase'],
        // Both spellings: the pages linked design notes as `docs/design/…`
        // and as a bare `design/…` relative href, and only the first was
        // listed.
        [/\bdesign\/[A-Za-z0-9._-]+\.md/g, 'a design note'],
        [/\bDIVERGENCE\.md\b/g, 'DIVERGENCE.md'],
        [/use-cases\/(?:BUGS|REVIEW)\.md/g, 'a defect ledger'],
        [/\bprogress\.md\b/g, 'the progress register'],
        [/\bshared-spec\.md\b/g, 'shared-spec.md'],
        [/\btest-coverage\.md\b/g, 'test-coverage.md'],
        [/\brelease-and-tag\.md\b/g, 'release-and-tag.md'],
        // A LINK to AGENTS.md only. The bare name is what `aontu agentsmd`
        // writes, so it is the product's surface and stays legal.
        [/\]\([^)]*AGENTS\.md[^)]*\)/g, 'a link to AGENTS.md'],
    ];
    const CONTRIB = [
        'docs/shared-spec.md',
        'docs/test-coverage.md',
        'docs/release-and-tag.md',
        'README.md',
    ];
    (0, node_test_1.test)('no-internal-design-references', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            if (CONTRIB.includes(file)) {
                continue;
            }
            for (const para of logical(Fs.readFileSync(abs, 'utf8'))) {
                for (const [re, name] of INTERNAL_REFS) {
                    for (const m of para.text.matchAll(re)) {
                        if (null == m.index) {
                            continue;
                        }
                        const { line, text } = lineAt(para, m.index);
                        const hit = `${file}:${line} cites ${name}: ${text}`;
                        if (!hits.includes(hit)) {
                            hits.push(hit);
                        }
                    }
                }
            }
        }
        Assert.deepEqual(hits, [], 'published pages cite internal records (docs/STYLE-GUIDE.md,\n' +
            '"The published set cites nothing internal"):\n' + hits.join('\n'));
    });
    // The register's status column, held to it below, plus the markers it
    // and ADR.md write in prose. A published page states what holds now,
    // so one of these on it is a status its reader cannot act on.
    const PHASE_WORDS = /\b(LANDED|PARTIAL|NOT STARTED|RETIRED|SUPERSEDED|AMENDED)\b/g;
    const REGISTER = Path.join(REPO, 'docs', 'capability-review', 'progress.md');
    // A status is a whole cell. One in prose is the register arguing, not
    // the column, and the bare markers above cover those.
    function registerStatuses() {
        const found = new Set();
        for (const line of Fs.readFileSync(REGISTER, 'utf8').split('\n')) {
            if (!line.startsWith('|')) {
                continue;
            }
            for (const cell of line.split('|').map((s) => s.trim())) {
                const m = /^\*{0,2}([A-Z][A-Z ]*[A-Z])\*{0,2}$/.exec(cell);
                if (null != m) {
                    found.add(m[1]);
                }
            }
        }
        return [...found].sort();
    }
    (0, node_test_1.test)('the-phase-vocabulary-is-the-registers', () => {
        const statuses = registerStatuses();
        Assert.ok(2 < statuses.length, 'no statuses read from the register');
        const missing = statuses.filter((status) => {
            PHASE_WORDS.lastIndex = 0;
            return !PHASE_WORDS.test(status);
        });
        Assert.deepEqual(missing, [], 'the register uses statuses this gate would let through:\n' +
            missing.join('\n'));
    });
    (0, node_test_1.test)('no-project-history-in-published-prose', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            if (CONTRIB.includes(file)) {
                continue;
            }
            for (const para of logical(prose(Fs.readFileSync(abs, 'utf8')))) {
                for (const m of para.text.matchAll(PHASE_WORDS)) {
                    if (null == m.index) {
                        continue;
                    }
                    const { line, text } = lineAt(para, m.index);
                    hits.push(`${file}:${line} "${m[0]}": ${text}`);
                }
            }
        }
        Assert.deepEqual(hits, [], 'published pages track this project\'s phases (docs/STYLE-GUIDE.md,\n' +
            '"The published set cites nothing internal"):\n' + hits.join('\n'));
    });
    // aontu.dev serves grammar/ and the tarball ships it, so its comments
    // are published text. The prose rules do not fit a file of rules, so
    // only the two that are about the reader's access apply.
    (0, node_test_1.test)('the-published-grammars-cite-nothing-internal', () => {
        const dir = Path.join(REPO, 'grammar');
        const files = Fs.readdirSync(dir).sort();
        Assert.ok(0 < files.length, 'no published grammar to check');
        const rules = [...INTERNAL_REFS, [PHASE_WORDS, 'a phase marker']];
        const hits = [];
        for (const name of files) {
            const lines = Fs.readFileSync(Path.join(dir, name), 'utf8').split('\n');
            lines.forEach((text, i) => {
                for (const [re, what] of rules) {
                    re.lastIndex = 0;
                    if (re.test(text)) {
                        hits.push(`grammar/${name}:${i + 1} cites ${what}: ${text.trim()}`);
                    }
                }
            });
        }
        Assert.deepEqual(hits, [], 'published grammars cite internal records (docs/STYLE-GUIDE.md,\n' +
            '"The published set cites nothing internal"):\n' + hits.join('\n'));
    });
    // A clean run cannot tell a working rule from a broken one. Each case
    // is a defect these rules carried.
    (0, node_test_1.test)('the-checks-catch-what-they-claim', () => {
        const faults = [];
        const claim = (ok, what) => {
            if (!ok) {
                faults.push(what);
            }
        };
        claim('' === '``a `b` c``'.replace(CODE_SPAN, ''), 'multi-backtick span');
        claim('x  y' === 'x `my` y'.replace(CODE_SPAN, ''), 'single-backtick span');
        claim('````not just```' === '````not just```'.replace(CODE_SPAN, ''), 'a shorter closing run is not a code span');
        claim('a \n b' === 'a `x !(y ==\nz)` b'.replace(CODE_SPAN, '')
            .replace(CODE_WRAP, (m) => m.replace(/[^\n]/g, '')).replace(/ +/g, ' '), 'a span that wraps once is still a span');
        claim('an odd ` mark\nand my line' ===
            'an odd ` mark\nand my line'.replace(CODE_SPAN, ''), 'an unpaired backtick does not swallow the next line');
        for (const text of ['\u26A0', '\u2713', '\u2194', '\u2020']) {
            claim(!EMOJI.test(text), `text-presentation symbol ${text} is not emoji`);
        }
        for (const text of ['\u{1F680}', '1\uFE0F\u20E3', '\u{1F1EC}\u{1F1E7}',
            '\u00A9\uFE0F', '\u2197\uFE0F']) {
            claim(EMOJI.test(text), `${text} is emoji`);
        }
        claim(null != firstSingular('My grammar is strict.'), 'My opens a sentence');
        claim(null != firstSingular('Mine is stricter.'), 'Mine opens a sentence');
        claim(null == firstSingular('The disk I/O is buffered.'), 'I/O is not a pronoun');
        claim(null == firstSingular('A unify step, i.e. a merge.'), 'the i of i.e.');
        claim(null != firstSingular('Then I ran it.'), 'a capital I is a pronoun');
        const bang = (text) => (text.match(EXCLAMATION) || []).length;
        claim(1 === bang('It works **now!** Next'), 'mark before bold close');
        claim(1 === bang('He said "Done!" then'), 'mark before a quote');
        claim(1 === bang('Really?!'), 'mark after another mark');
        claim(2 === bang('Great!!'), 'two marks are two marks');
        claim(0 === bang('if (a != b)'), '!= is an operator');
        claim(0 === bang('![alt](src)'), 'an image is not a mark');
        claim(0 === bang(prose('See [docs](https://host/a!b) now.')), 'a link destination is not prose');
        claim(0 === bang(prose('Read <https://host/a!b>.')), 'nor an autolink');
        claim(0 === bang(prose('Read https://host/a!b today.')), 'nor a bare one');
        claim(1 === bang(prose('Read https://host/a!')), 'the mark ending the sentence after one still counts');
        claim(1 === bang(prose('See [docs](https://host/a) now!')), 'the mark outside one still counts');
        claim('' === prose('Text ``a ` !\nb`` more.').replace(/[^!]/g, ''), 'a wrapped span holding a shorter run is still a span');
        const joins = (md, phrase) => logical(md).some((para) => para.text.includes(phrase));
        claim(!joins('## Something worth\nnoting this', 'worth noting'), 'a heading is not the paragraph under it');
        claim(!joins('| a | worth |\n| noting | b |', 'worth | | noting'), 'a table row is not the row above it');
        claim(joins('| This explanation is worth\nnoting here', 'worth noting'), 'one pipe is a sentence, not a table row');
        claim(!joins('| Not only one\n| ---\n| but two', 'one | --- | but'), 'a delimiter row makes one pipe a table row after all');
        claim(joins('a sentence worth\nnoting here', 'worth noting'), 'a wrapped paragraph still joins');
        claim(joins('- an item worth\n  noting here', 'worth noting'), 'a wrapped list item still joins');
        const banned = (text) => BANNED.some(([re]) => {
            re.lastIndex = 0;
            return re.test(text);
        });
        claim(banned('so let\u2019s break it down'), 'a curly apostrophe');
        claim(banned("so let's break it down"), 'a straight apostrophe');
        const cites = (text) => INTERNAL_REFS.some(([re]) => {
            re.lastIndex = 0;
            return re.test(text);
        });
        const phase = (text) => {
            PHASE_WORDS.lastIndex = 0;
            return PHASE_WORDS.test(text);
        };
        claim(phase('NOT STARTED'), 'a two-word status');
        claim(phase('PARTIAL'), 'a status the register uses and nothing else did');
        claim(!phase('Nothing landed yet'), 'the lower-case word is ordinary prose');
        claim(cites('sugar removed in G8 phase 4'), 'a capability-review phase');
        claim(cites('ADR-018 removed the pipe'), 'a numbered decision record');
        claim(!cites('a G8 grammar'), 'a phase needs its number');
        Assert.deepEqual(faults, [], `these rules no longer catch what they claim:\n${faults.join('\n')}`);
    });
    (0, node_test_1.test)('the-committed-figures-are-what-the-engine-draws', () => {
        const { FIGURES, OUT, draw } = require('../scripts/figures.cjs');
        for (const name of Object.keys(FIGURES)) {
            const file = Path.join(OUT, name);
            Assert.ok(Fs.existsSync(file), `docs/figures/${name} is missing`);
            Assert.strictEqual(lf(Fs.readFileSync(file, 'utf8')), lf(draw(name)), `docs/figures/${name} is stale: run \`make build-ts\``);
        }
    });
    // Every figure the published pages show must be one of those, and
    // carry alt text: a reader who cannot see it still has to be told
    // what it says.
    (0, node_test_1.test)('every-figure-is-generated-and-described', () => {
        const { FIGURES } = require('../scripts/figures.cjs');
        const hits = [];
        for (const page of publishedPages()) {
            const text = lf(Fs.readFileSync(Path.join(DOCS_DIR, page), 'utf8'));
            for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)) {
                const [, alt, src] = m;
                if (!src.startsWith('figures/') ||
                    undefined === FIGURES[src.slice('figures/'.length)]) {
                    hits.push(`${page}: ${src} is not a generated figure`);
                }
                if (40 > alt.length) {
                    hits.push(`${page}: ${src} needs alt text that says what it shows`);
                }
            }
        }
        Assert.deepEqual(hits, [], 'figures must be generated and described (docs/STYLE-GUIDE.md,\n' +
            '"Figures are drawn by the engine"):\n' + hits.join('\n'));
    });
    // The guide, this gate and Vale's configuration must agree, and each
    // names the others, so a reader of any one finds the rest.
    (0, node_test_1.test)('the-style-guide-names-both-gates', () => {
        const guide = Fs.readFileSync(Path.join(DOCS_DIR, 'STYLE-GUIDE.md'), 'utf8');
        Assert.ok(guide.includes('docs.test.ts'), 'STYLE-GUIDE.md should point at this test file');
        Assert.ok(guide.includes('.vale.ini'), 'STYLE-GUIDE.md should point at the Vale configuration');
        Assert.ok(guide.includes('reject.txt'), 'STYLE-GUIDE.md should point at the banned list it summarises');
    });
    // The summary in the guide and the list Vale reads are one list; the
    // guide says so, and this is what makes the claim checkable. Every
    // section heading in reject.txt has to appear in the guide's summary,
    // so a whole category cannot be added to one and missed by the other.
    (0, node_test_1.test)('the-guide-summarises-every-banned-category', () => {
        const guide = Fs.readFileSync(Path.join(DOCS_DIR, 'STYLE-GUIDE.md'), 'utf8').toLowerCase();
        const missing = Fs.readFileSync(REJECT_FILE, 'utf8')
            .split('\n')
            .map((l) => l.match(/^# --- (.+?) -+$/))
            .filter((m) => null != m)
            .map((m) => m[1].trim().toLowerCase())
            .filter((h) => !guide.includes(h));
        Assert.deepEqual(missing, [], 'reject.txt categories with no summary in docs/STYLE-GUIDE.md:\n' +
            missing.join('\n'));
    });
});
// A function added to the language must remain discoverable in its reference.
(0, node_test_1.test)('the-functions-index-lists-every-declared-builtin-once', () => {
    const source = Fs.readFileSync(Path.join(DOCS_DIR, 'reference-language.md'), 'utf8');
    const section = source.split('## Functions\n')[1].split('\n## ')[0];
    const declared = Fs.readFileSync(Path.join(DOCS_DIR, '..', 'test', 'spec', 'signature.tsv'), 'utf8');
    const names = Array.from(declared.matchAll(/^([a-z]+)\(/gm), (m) => m[1]).sort();
    const listed = Array.from(section.matchAll(/^### `([a-z]+)\(/gm), (m) => m[1]);
    Assert.deepStrictEqual(listed, names, 'the alphabetical Functions index must list each declared built-in exactly once');
});
// THE REGISTRY GATES. A supplemental section that tabulates a registry
// is checked against the file, or the engine, that IS that registry.
function docsText(file) {
    return Fs.readFileSync(Path.join(DOCS_DIR, file), 'utf8');
}
// Asserts rather than returns empty: a heading that moves would make
// every check reading it vacuous.
function section(text, heading) {
    const parts = text.split('\n' + heading + '\n');
    Assert.equal(parts.length, 2, 'exactly one ' + heading + ' heading');
    return parts[1].split('\n## ')[0];
}
(0, node_test_1.test)('the-call-surface-lists-every-declared-builtin-once', () => {
    const rows = Array.from(section(docsText('reference-functions.md'), '## The call surface')
        .matchAll(/^\| `([a-z]+)\(/gm), (m) => m[1]);
    const names = Array.from(Fs.readFileSync(Path.join(REPO, 'test', 'spec', 'signature.tsv'), 'utf8')
        .matchAll(/^([a-z]+)\(/gm), (m) => m[1]).sort();
    Assert.deepStrictEqual(rows, names, 'the call surface must list each declared built-in once, in order');
});
(0, node_test_1.test)('the-error-catalogue-is-the-registry', () => {
    const registered = new Map();
    for (const line of Fs.readFileSync(Path.join(REPO, 'test', 'spec', 'errcodes.tsv'), 'utf8').split('\n')) {
        const cell = line.split('\t');
        if (line.startsWith('#') || 'errcode' !== cell[1]) {
            continue;
        }
        registered.set(cell[0], cell[2] + ' ' + cell[3]);
    }
    Assert.ok(100 < registered.size, 'no codes read from the registry');
    const listed = new Map();
    let cls = '';
    for (const line of section(docsText('reference-errors.md'), '## The codes').split('\n')) {
        const head = line.match(/^### Class `([a-z]+)`$/);
        if (head) {
            cls = head[1];
            continue;
        }
        const row = line.match(/^\| `([^`]+)` \| ([^|]*?) \|/);
        if (null == row) {
            continue;
        }
        Assert.ok(!listed.has(row[1]), 'the catalogue lists ' + row[1] + ' twice');
        listed.set(row[1], cls + ' ' + row[2].trim());
    }
    Assert.deepStrictEqual([...listed.keys()].sort(), [...registered.keys()].sort(), 'the catalogue must list every registered code, and only those');
    const wrong = [...listed].filter(([code, row]) => registered.get(code) !== row)
        .map(([code, row]) => code + ': ' + row + ', registry ' + registered.get(code));
    Assert.deepEqual(wrong, [], 'catalogue rows disagreeing with the registry');
});
// One minimal call per component: `project`'s spec is the only optional
// one, and `listitems` is the only component with no text prop.
const CMP_CALL = {
    project: 'project()', folder: 'folder("d")', file: 'file("f")',
    content: 'content("c")', line: 'line("l")', fragment: 'fragment("g.txt")',
    slot: 'slot("s")', inject: 'inject("i")', copyfiles: 'copyfiles("a")',
    listitems: 'listitems({item:[1]})',
};
(0, node_test_1.test)('the-component-table-is-the-engines', () => {
    const gen = (src) => {
        try {
            return new aontu_1.Aontu().generate('x: ' + src);
        }
        catch (e) {
            return null;
        }
    };
    const rows = Array.from(section(docsText('reference-generation.md'), '## The components')
        .matchAll(/^\| `([a-z]+)\(.*?\| `([A-Za-z]+)` \| .*? \| (.*?) \| .*? \|$/gm));
    Assert.equal(rows.length, Object.keys(CMP_CALL).length, 'component rows read from the table');
    const wrong = [];
    for (const [, name, node, children] of rows) {
        const got = gen(CMP_CALL[name]);
        if (null == got) {
            wrong.push(name + ': its minimal call is refused');
            continue;
        }
        if (node !== got.x.cmp) {
            wrong.push(name + ': table says ' + node + ', engine answers ' + got.x.cmp);
        }
        const admits = 'none' === children.trim() ? []
            : Array.from(children.matchAll(/`([a-z]+)`/g), (m) => m[1]);
        for (const child of Object.keys(CMP_CALL)) {
            const base = CMP_CALL[name].replace(/\(\)$/, '("p")');
            const took = null != gen(base.replace(/\)$/, ', [' + CMP_CALL[child] + '])'));
            if (took !== admits.includes(child)) {
                wrong.push(name + ' + ' + child + ': table says '
                    + (admits.includes(child) ? 'admitted' : 'refused')
                    + ', engine ' + (took ? 'takes it' : 'refuses it'));
            }
        }
    }
    Assert.deepEqual(wrong, [], 'the component table and the engine disagree');
});
// GitHub's heading slug: lower-cased, punctuation dropped except `-`
// and `_`, spaces to hyphens, a repeat suffixed by its occurrence
// count. Runs of spaces make runs of hyphens.
function slug(heading) {
    return heading.toLowerCase()
        .replace(/`/g, '')
        .replace(/[^a-z0-9 _-]/g, '')
        .replace(/ /g, '-');
}
function headingAnchors(md) {
    const seen = new Map();
    const out = new Set();
    for (const line of fenceless(md).split('\n')) {
        const m = line.match(/^#{1,6}\s+(.*?)\s*$/);
        if (null == m) {
            continue;
        }
        const base = slug(m[1]);
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        out.add(0 === n ? base : base + '-' + n);
    }
    return out;
}
// Wider than the style-gated set: working documents carry links too.
function markdownFiles() {
    return (0, node_child_process_1.execFileSync)('git', ['ls-files', '*.md'], { cwd: REPO, encoding: 'utf8' })
        .split('\n')
        .filter((f) => '' !== f);
}
(0, node_test_1.test)('every-internal-link-resolves', () => {
    const cache = new Map();
    const anchorsOf = (abs) => {
        if (!cache.has(abs)) {
            cache.set(abs, Fs.existsSync(abs) ?
                headingAnchors(Fs.readFileSync(abs, 'utf8')) : null);
        }
        return cache.get(abs);
    };
    const dead = [];
    for (const file of markdownFiles()) {
        const abs = Path.join(REPO, file);
        // Code spans go too: a link shown as an example is not a link.
        const md = fenceless(Fs.readFileSync(abs, 'utf8'))
            .replace(/`[^`\n]*`/g, '');
        for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) {
            const href = m[1];
            if (/^[a-z][a-z0-9+.-]*:/.test(href) || href.startsWith('//')) {
                continue;
            }
            const hash = href.indexOf('#');
            if (-1 === hash) {
                continue;
            }
            const frag = decodeURIComponent(href.slice(hash + 1));
            if ('' === frag) {
                continue;
            }
            const rel = href.slice(0, hash);
            const target = '' === rel ? abs : Path.resolve(Path.dirname(abs), rel);
            const found = anchorsOf(target);
            if (null === found) {
                dead.push(file + ' -> ' + href + ' (no such file)');
            }
            else if (!found.has(frag)) {
                dead.push(file + ' -> ' + href);
            }
        }
    }
    Assert.deepEqual(dead, [], 'links whose target heading does not exist:\n' + dead.join('\n'));
});
// `progress.md` records the retirements, so it names both spellings.
const RETIRED_BUILTINS = ['form'];
const FROZEN_NOTE = '**Names here are the names of the day.**';
const FROZEN_DIRS = ['docs/design/', 'docs/capability-review/'];
const FROZEN_EXEMPT = ['docs/capability-review/progress.md'];
(0, node_test_1.test)('a-working-document-naming-a-retired-builtin-says-so', () => {
    const bare = [];
    for (const file of markdownFiles()) {
        if (!FROZEN_DIRS.some((d) => file.startsWith(d)) ||
            FROZEN_EXEMPT.includes(file)) {
            continue;
        }
        const md = Fs.readFileSync(Path.join(REPO, file), 'utf8');
        if (md.includes(FROZEN_NOTE)) {
            continue;
        }
        const named = RETIRED_BUILTINS
            .filter((n) => new RegExp('\\b' + n + '\\(').test(md));
        if (0 < named.length) {
            bare.push(file + ' names ' + named.join(', '));
        }
    }
    Assert.deepEqual(bare, [], 'working documents naming a retired built-in without the note:\n' +
        bare.join('\n'));
});
//# sourceMappingURL=docs.test.js.map