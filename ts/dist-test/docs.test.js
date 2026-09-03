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
// THE DOCUMENTATION, HELD TO THE ENGINE. Every fenced snippet in the
// Diátaxis pages is either executed here or carries a visible,
// reasoned skip — the rule docs/STYLE-GUIDE.md states and this file
// enforces. The failure mode this exists for is silent and slow: an
// example that was right when it was written stays in the page after
// the surface moves under it, and the reader who trusts it is the one
// who finds out.
//
// Four layers of checking, from oldest to newest:
//
//   1. EVERY self-contained example PARSES. A block that does not
//      parse is always a bug, in a way that a block which does not
//      unify is not — the teaching documents deliberately show
//      conflicts (`port: 8080` meeting `port: 9090`), and refusing
//      those would be refusing the lesson.
//   2. EVERY example that STATES its result is checked against it:
//      an `aontu` fence immediately followed by a `json` fence is a
//      generate claim, compared structurally — the page's whitespace
//      and key order are the page's business.
//   3. MULTI-FILE examples and CLI TRANSCRIPTS are executed through
//      the directive vocabulary (scenario / file / run / skip — see
//      docs/STYLE-GUIDE.md, "Code snippets"). A directive is an HTML
//      comment on its own line immediately before a fence; the sync
//      to aontu.dev passes comments through and the site renders
//      them as nothing. What the reader sees is exactly what ran.
//   4. EVERY tagged fence is ACCOUNTED FOR: covered by one of the
//      mechanisms above, or skipped with a non-empty reason. What
//      used to be a silent exclusion (an `@"` include) is now a
//      failure unless the page scaffolds it or owns the skip.
//
// Plus the style gate: the enforceable subset of the banned-phrase
// list in docs/STYLE-GUIDE.md, applied to prose (never to fences).
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const aontu_1 = require("../dist/aontu");
const DOCS_DIR = Path.join(__dirname, '..', '..', 'docs');
const CLI = Path.join(__dirname, '..', 'bin', 'aontu.js');
// The executed page set: the Diátaxis documents whose fences face the
// four layers above. `explanation.md` writes its blocks
// unfenced-by-language (diagrams and quoted transcripts), so it
// contributes nothing here — but it does face the style gate below.
// `docs/how-to/` is a directory of per-guide pages; the glob keeps
// the list current as guides are added or renamed.
// DOCS_PAGES=<comma-list> narrows a run to named pages — the tight
// loop for writing one page — and suspends the corpus-wide floors,
// which only mean anything over the whole set.
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
        'tutorial-graph.md',
        'unification.md',
        'reference-language.md',
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
// The PUBLISHED page set: what a reader who has the tool and not the
// repository sees. It is stylePages() minus the three contributor
// documents, and it is the set the internal-reference gate applies to
// — `shared-spec.md`, `test-coverage.md` and `release-and-tag.md` are
// written FOR contributors and may cite the records freely.
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
// LINE ENDINGS ARE THE CHECKOUT'S BUSINESS, not this file's. git on
// Windows checks out with CRLF by default, and every pattern below
// anchors on "\n" — so on a Windows runner the extractor matched ZERO
// blocks and the suite reported a documentation file with no examples
// in it rather than a failure. (.gitattributes pins these files to LF
// as well; this is the half that still holds when the file arrives
// from a tarball, an editor that rewrote it, or a copy-paste.)
function lf(text) {
    return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
// One pass, in document order, collecting scenario-opens and fences,
// binding each file/run/skip directive to the fence that follows it.
// A directive with no following fence, or an unknown verb, is a page
// defect and fails loudly rather than being ignored. A `scenario`
// directive is a standalone statement — it opens a scenario at its
// position and may sit directly above the fence directives that
// populate it.
function extract(file, md) {
    const lines = md.split('\n');
    const out = [];
    let pending;
    for (let i = 0; i < lines.length; i++) {
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
            out.push({ kind: 'block', block: b });
            continue;
        }
    }
    Assert.ok(undefined === pending, `${file}:${pending?.line} directive is not followed by a fence`);
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
function runStep(file, dir, step) {
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
            env: { ...process.env, NO_COLOR: '1' },
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
            let scenarioId = '';
            const open = (id) => {
                dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-docs-'));
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
                        const r = runStep(page.file, dir, step);
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
            // Scenario dirs from fully green pages are transient; a failed
            // assertion above threw before this cleanup, keeping the dir.
            if (null != dir) {
                Fs.rmSync(dir, { recursive: true, force: true });
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
        // Re-derive coverage exactly as the layers above assign it, then
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
    // THE FORMATTER OVER THE FENCES (docs/design/FMT.0.md §7.5): every
    // Aontu fence that parses formats to a fixed point -- formatted twice,
    // the second run changes nothing. Whether the fences ARE in the form
    // is that note's P3, and a separate gate.
    (0, node_test_1.test)('every-source-fence-formats-to-a-fixed-point', () => {
        const failures = [];
        let checked = 0;
        for (const page of pages()) {
            for (const b of page.blocks) {
                if (!SOURCE_TAGS.has(b.lang)) {
                    continue;
                }
                const r = (0, aontu_1.format)(b.body);
                if ('error' === r.verdict) {
                    continue; // does not parse: the parse gate's business
                }
                checked++;
                const again = (0, aontu_1.format)(r.text);
                if ('error' === again.verdict || again.text !== r.text) {
                    failures.push(`${page.file}:${b.line}`);
                }
            }
        }
        Assert.deepEqual(failures, [], `fences the formatter does not fix: ${failures.join(', ')}`);
        if (undefined === narrowed()) {
            Assert.ok(200 <= checked, `too few fences formatted: ${checked}`);
        }
    });
    // The prose channel names scenario files too: a file directive's
    // name must appear in a code span in the three lines above it, so
    // the human channel and the machine channel cannot drift.
    (0, node_test_1.test)('functions-table-signatures-match-the-registry', () => {
        // THE DRIFT GATE (docs/design/SIGNATURES.0.md): the reference's
        // functions table renders its signature column from the same
        // registry the engine parses -- a row whose first cell names a
        // builtin must BE that builtin's rendered signature (pipes
        // markdown-escaped). Nobody writes a signature by hand.
        const { funcSig, renderSig } = require('../dist/sig');
        const text = Fs.readFileSync(Path.join(DOCS_DIR, 'reference-language.md'), 'utf8');
        let rows = 0;
        for (const line of text.split('\n')) {
            const m = line.match(/^\| `([a-z]+)\(([^`]*)\)([^`]*)` \|/);
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
            Assert.equal(cell, renderSig(funcSig[m[1]]), 'functions-table row for ' + m[1]);
            rows++;
        }
        // The main functions table holds these rows today; a table edit
        // that drops below this floor is a removal, not drift.
        Assert.ok(20 <= rows, 'functions-table rows found: ' + rows);
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
// ---------------------------------------------------------------------
// THE STYLE GATE: docs/STYLE-GUIDE.md, in the half a linter cannot
// carry. Vale runs the other half in .github/workflows/docs.yml, and
// the two divide the work deliberately:
//
//   Vale         spelling, Google's conventions, the banned list
//   this file    the banned list again, plus every rule that needs to
//                know WHICH PAGE it is looking at (first person is
//                allowed in tutorials only), or that needs a fence
//                stripper Vale does not have.
//
// The banned list is checked TWICE on purpose. Vale matches within a
// line; this file joins each paragraph first, and these pages wrap near
// 72 columns, so `worth\nnoting` passes Vale and fails here. Deferring
// to Vale would make where a line happens to break a way through the
// gate.
//
// That second clause is not a preference. Vale stops skipping fenced
// blocks part-way through several of these pages -- a list item with an
// indented continuation reproduces it -- so a rule that must never fire
// inside a code fence cannot be left to Vale. `Google.EmDash` was
// measured at 11 findings, all 11 false, and is a warning there and an
// error here for exactly that reason.
//
// Prose only, in both gates: fences are code, and quoted engine output
// inside them is the engine's business.
const node_module_1 = require("node:module");
const REPO = Path.join(__dirname, '..', '..');
// The banned list, read from the file VALE READS. Keeping one copy is
// what stops the fast local gate and the CI gate disagreeing about what
// is banned; a phrase added there is picked up by both.
const REJECT_FILE = Path.join(REPO, '.vale', 'styles', 'config', 'vocabularies', 'Aontu', 'reject.txt');
// Vale matches reject.txt entries case-insensitively on word
// boundaries; mirror exactly that, so a phrase cannot pass one gate and
// fail the other. Global, because the scan uses matchAll: a paragraph
// can carry two banned phrases and both should be reported.
function loadBanned() {
    return Fs.readFileSync(REJECT_FILE, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => '' !== line && !line.startsWith('#'))
        .map((pat) => [new RegExp(`\\b(?:${pat})\\b`, 'gi'), pat]);
}
const BANNED = loadBanned();
// CommonMark fence opener: up to three spaces of indent, then three or
// more backticks or tildes, then an optional info string. A block opened
// with ~~~ or with four backticks is an ordinary fence, and a stripper
// that cannot see one reports a banned phrase inside a code block --
// failing a page the fence exemption says is fine.
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
// Strip frontmatter, fenced blocks, HTML comments and inline code
// spans; what remains is prose.
//
// The comments matter: every `<!-- test: run -->` directive carries an
// exclamation mark inside `<!`, which is how the first draft of
// `exclamation-marks-are-rationed` reported 77 of them on one reference
// page. A directive is machinery, and the site renders it as nothing.
function prose(md) {
    return fenceless(md)
        .replace(/^---\n[\s\S]*?\n---\n/, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/`[^`\n]*`/g, '');
}
// Markdown treats a newline inside a paragraph as whitespace, and these
// pages are hard-wrapped near 72 columns -- so "the right\nanswer" is
// the ORDINARY shape of a multiword phrase here, not an exotic one. A
// gate matching physical lines misses most of them, which makes where a
// line happens to wrap a way through it.
//
// Lines are trimmed, whitespace-collapsed and joined per paragraph;
// `starts` maps a match offset back to the physical line, so a hit
// still names a line the reader can open.
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
    lf(text).split('\n').forEach((line, i) => {
        if ('' === line.trim()) {
            flush();
            return;
        }
        const piece = line.trim().replace(/\s+/g, ' ');
        starts.push(at);
        lines.push(i + 1);
        pieces.push(piece);
        at += piece.length + 1;
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
// THE GATED SET, from the module the Vale invocation reads. Two gates
// covering different files is two gates that disagree in silence: a
// page in one and not the other is a page half-checked, and nothing
// announces it. `ts/scripts/gated-docs.cjs` is the single answer.
//
// A narrowed run (DOCS_PAGES=<comma-list>) reports on those pages only,
// the tight loop for writing one page.
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
    // The gated set is not empty and did not quietly shrink to the docs
    // directory: the READMEs and the sixteen published use cases carry
    // the same rules, and a refactor that dropped them would otherwise
    // leave every check below passing over less.
    (0, node_test_1.test)('the-gated-set-covers-more-than-docs', () => {
        if (narrowed()) {
            return;
        }
        const files = stylePaths().map((p) => p.file);
        Assert.ok(60 < files.length, `gated set is ${files.length} files`);
        Assert.ok(files.includes('README.md'), 'README.md is gated');
        Assert.ok(files.includes('ts/README.md'), 'ts/README.md is gated');
        Assert.equal(files.filter((f) => f.startsWith('use-cases/')).length, 16, 'the sixteen published use cases are gated');
    });
    // Logical lines, for the reason in logical(): the list is mostly
    // MULTIWORD and the pages wrap near 72 columns, so a physical-line
    // scan misses any phrase a wrap happens to split.
    //
    // The tests below stay on physical lines on purpose: `we` and `I` are
    // single tokens no wrap can split, and the em-dash rules are defined
    // per line rather than per paragraph.
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
    // Google's dash ruling: no space on either side. Vale's own
    // `Google.EmDash` is a warning because it cannot reliably tell a
    // fence from prose on these pages, and because it reads a dash
    // written tight against an inline code span as spaced. This one runs
    // over the same stripper the rest of the gate uses.
    (0, node_test_1.test)('em-dashes-are-spaced', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            fenceless(Fs.readFileSync(abs, 'utf8'))
                .split('\n')
                .forEach((line, i) => {
                if (/\s—|—\s|—$|^—/.test(line)) {
                    hits.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], 'an em dash takes no space on either side, and none at a line ' +
            `break (docs/STYLE-GUIDE.md):\n${hits.join('\n')}`);
    });
    // One em-dash ASIDE per line: a single trailing dash, or one matched
    // pair around a parenthetical. The guide allows the dash and rations
    // it, which is the half a reviewer forgets; three on a line is the
    // stacking the ration exists to stop.
    (0, node_test_1.test)('em-dashes-are-rationed', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            prose(Fs.readFileSync(abs, 'utf8'))
                .split('\n')
                .forEach((line, i) => {
                const n = (line.match(/—/g) || []).length;
                if (2 < n) {
                    hits.push(`${file}:${i + 1} ${n} em dashes: ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], 'more than one em-dash aside on a line (docs/STYLE-GUIDE.md):\n' +
            hits.join('\n'));
    });
    // First person, the house rule that .vale.ini switches Google.We and
    // Google.FirstPerson OFF in favour of. Vale cannot express "only in
    // tutorials", which is why the rule lives here: switching a Google
    // rule off in favour of a house rule means the house rule has to be
    // real, and this test is the receipt.
    //
    // STYLE-GUIDE.md voice rule 7: talk to the reader as "you". "We"
    // appears only in tutorials, walking through code together. "I"
    // appears nowhere.
    const TUTORIAL_PAGES = ['docs/tutorial.md', 'docs/tutorial-graph.md'];
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
                const m = line.match(/\bI(?!\/O)\b|\bI'(?:m|ve|ll|d)\b|\b(?:my|mine|myself)\b/);
                if (m) {
                    hits.push(`${file}:${i + 1} "${m[0]}": ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], 'first-person singular in documentation ' +
            `(docs/STYLE-GUIDE.md, voice rule 7):\n${hits.join('\n')}`);
    });
    // At most one per page, tutorials only, on a genuine payoff. Google
    // bans them outright, which is why `Google.Exclamation` is a warning
    // in .vale.ini: it cannot know which page is a tutorial.
    (0, node_test_1.test)('exclamation-marks-are-rationed', () => {
        const hits = [];
        for (const { file, abs } of stylePaths()) {
            // A sentence-ending mark, not every `!` byte: `!=` is an
            // operator and `![alt](src)` is an image.
            const n = (prose(Fs.readFileSync(abs, 'utf8'))
                .match(/\w!(?=\s|$)/g) || []).length;
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
                if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) {
                    hits.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        Assert.deepEqual(hits, [], `emoji are not used in documentation:\n${hits.join('\n')}`);
    });
    // INTERNAL RECORDS ARE NOT A READER'S BUSINESS (docs/STYLE-GUIDE.md,
    // "The published set cites nothing internal"). A decision record
    // argues a choice already made; the rule it decided is what the page
    // states. A design note and a gap document are proposals, and half of
    // what they propose does not exist. A reader who has the tool and not
    // the repository cannot open any of them.
    //
    // Applied to the whole file rather than to prose alone -- code fences
    // AND inline code spans included. A CLI transcript naming an internal
    // path is the same defect one paragraph up, and it means the ENGINE
    // prints one; a path in a code span is the same defect wearing
    // monospace, which is how `use-cases/BUGS.md` sat in the API
    // reference through a gate that stripped spans first.
    const INTERNAL_REFS = [
        [/\bADR-\d+\b/g, 'a decision record'],
        // The bare prose form. `ADR` names a record the reader cannot
        // open, whether or not a number follows it.
        [/\b(?:the|an|this|that) ADR\b/gi, 'a decision record'],
        [/\bADR\.md\b/g, 'ADR.md'],
        [/capability-review/g, 'the capability review'],
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
    // Written FOR contributors, and free to cite the records: they are
    // in the style set (the voice is the voice) and out of the citation
    // set. Everything else stylePaths() returns is published prose --
    // the site renders each use-case README at /use-cases/<dir>, which is
    // how three of them once carried a decision-record number.
    //
    // The ROOT README is one of them, and `ts/README.md` is not. The root
    // README is the repository's front page: its reader is looking at the
    // source, and pointing them at AGENTS.md and the contributor
    // references is the job. `ts/README.md` is what npm renders to
    // somebody who has the package and not the repository, so it is held
    // to the published rule.
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
            // Paragraph-joined, like the banned list and for the same reason:
            // "the\nADR" is the ordinary shape of a two-word phrase on pages
            // wrapped at 72 columns.
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
    // A FIGURE IS DRAWN BY THE ENGINE, NEVER BY HAND. A picture of the
    // value lattice written in box characters is a second source of
    // truth for the one thing the language is built on, and the one that
    // used to be here was wrong about `path()` and the numeric leaves.
    // `ts/scripts/figures.cjs` draws the committed files, `make build-ts`
    // runs it, and this is the gate that catches a stale commit.
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
//# sourceMappingURL=docs.test.js.map