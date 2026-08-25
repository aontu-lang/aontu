"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.vetWaiter = void 0;
exports.replCommand = replCommand;
exports.evalSource = evalSource;
exports.main = main;
exports.runVet = runVet;
exports.runSubsume = runSubsume;
exports.runBreaking = runBreaking;
exports.runTrim = runTrim;
exports.runRelations = runRelations;
exports.runMod = runMod;
exports.runHash = runHash;
exports.runGet = runGet;
exports.runWhy = runWhy;
exports.renderWhyText = renderWhyText;
exports.runSet = runSet;
exports.runAgentsMd = runAgentsMd;
exports.watchChange = watchChange;
exports.watchSignature = watchSignature;
exports.deprecatedAt = deprecatedAt;
// Command-line interface for Aontu.
//
//   aontu [options] [file]
//
// With a file argument, the file is evaluated and the result printed.
// With no file on an interactive terminal, a REPL is started. With no
// file and piped input, the source is read from stdin. See HELP below.
// Named imports, not `import * as`: the namespace form makes tsc emit the
// __importStar downlevel helper, whose branches no supported Node takes.
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_readline_1 = require("node:readline");
const aontu_1 = require("./aontu");
const report_sarif_1 = require("./report-sarif");
const mod_tool_1 = require("./mod-tool");
const mod_1 = require("./mod");
const vet_1 = require("./vet");
const agentsmd_1 = require("./agentsmd");
const HELP = `Usage: aontu [options] [file]
       aontu vet [options] <schema> <data> [more-data...]
       aontu subsume [options] <general> <specific>
       aontu breaking --against <file|git#rev> [options] <file>
       aontu trim --check [options] <file>
       aontu relations [options] <file>
       aontu hash [options] <file>
       aontu mod tidy|vendor|manifest [options] [dir]
       aontu get <path> [options] <file>
       aontu why <path> [options] <file>
       aontu set <path>=<value>... --entry <file> --overlay <file>
       aontu agentsmd [--write <AGENTS.md>] <file>

Evaluate an Aontu source file and print the result as JSON.
With no file on an interactive terminal, start a REPL.
With no file and piped input, read the source from stdin.

The vet verb validates data documents against a schema document and
reports what does not hold, as text or as a machine-readable object.

The subsume verb asks whether every instance the specific document
admits, the general document admits too. The breaking verb runs that
query between a document and its own earlier versions.

Options:
  -c, --canon     Print the canonical form instead of generated JSON
  -h, --help      Show this help and exit
  --jsonl         REPL: answer every command as one JSON line
  -v, --version   Print the version and exit
  --trust <t>     Include capability: system (default), none, or
                  root[:dir] to confine @"..." below a directory
  --include-root <dir>  Shorthand for --trust root:<dir>

Mod options:
  --format <f>    text (default) or json
  --against <dir> manifest: a prior version's module tree, to gate on

Mod subcommands:
  tidy      Resolve the module closure by minimum version selection and
            rewrite mod-lock.aon in canonical form
  vendor    Materialise the locked closure into aon_vendor/
  manifest  Print the OCI artifact a publish would push, gated on the
            breaking check against --against

Vet options:
  --at <path>       Validate against this path of the schema ($.a.b)
  --closed          Refuse keys the anchor does not declare
  --partial         Residue is reported but does not fail the run
  --max-errors <n>  Cap the finding list (default 20)
  --format <f>      text (default), json or sarif
  --watch           Re-run whenever a watched file changes

Vet exit codes:
  0  valid       data unifies, and is concrete (or --partial)
  1  invalid     at least one contradiction
  2  usage       bad option, or a file that cannot be read
  3  incomplete  no contradiction, but the truth is not yet satisfied
  4  error       the schema is unusable on its own

Subsume options:
  --profile <p>   values, defaults (default) or gen
  --at <path>     Compare at this path of both documents ($.a.b)
  --format <f>    text (default) or json

Subsume exit codes:
  0  subsumes          every specific instance is admitted
  1  does_not_subsume  a witness exists (see the findings)
  2  usage             bad option, or a file that cannot be read
  3  undecided         no rule decides (a sub_* reason is reported)
  4  error             a document does not stand up on its own

Breaking options:
  --against <v>       An earlier version: a file path, or git#<rev>
                      (resolved by 'git show'); repeatable
  --mode <m>          backward (new admits old, the default), forward
                      (old admits new), or full (both); overrides the
                      document's own $.aontu_policy.compat declaration
  --allow-undecided   Exit 0 on undecided (the report still says so)
  --allow-deprecated-removal
                      A finding about a value the old version already
                      deprecated warns instead of breaking
  --format <f>        text (default) or json

Breaking exit codes mirror subsume's: 0 compatible, 1 breaking,
2 usage, 3 undecided, 4 error.

Trim options:
  --check         Report redundant entries as paths (required: trim
                  only reports for now; rewriting is a future editor)
  --format <f>    text (default) or json

Trim exit codes: 0 nothing redundant, 1 redundancies reported,
2 usage, 4 the document does not stand up on its own.

Hash options:
  --form          Print the hash FORM (the hashed text) instead of the
                  hash, which is what to diff when a pin moves
  --format <f>    text (default) or json

Hash exit codes: 0 hashed, 2 usage, 4 the document does not stand up
on its own.

Get options:
  -c, --canon     Canonical-form fragment (default: generated JSON)
  --keys          Keys at the node, one per line
  --types         Shape view: concrete leaves lifted to their kinds
  --depth <n>     Structure to depth n; deeper nodes render as top
  --format <f>    text (default) or json

Get exit codes: 0 rendered, 1 the path names nothing, 2 usage, 4 the
document does not stand up on its own.

Why options:
  --format <f>    text (default) or json

Why exit codes mirror get's: 0 explained, 1 the path names nothing,
2 usage, 4 the document does not stand up on its own.

Set options:
  --entry <file>    The document the change is checked against
  --overlay <file>  The file the change is appended to (created if
                    absent; not written when the change does not hold)
  --in-place        Rewrite a pinned literal where it was written,
                    instead of appending a line that contradicts it.
                    The span is verified against the source text
                    before writing, and where the value is not a
                    single editable literal in this overlay the
                    assignment is appended as usual with a warning
                    saying why
  --dry-run         Print the overlay that would be written, write
                    nothing
  --format <f>      text (default) or json

Set exit codes are vet's verdict classes: 0 valid, 1 invalid (the
change contradicts a pinned value -- aontu why locates it, and
--in-place rewrites it), 2 usage, 3 incomplete, 4 the entry does not
stand up on its own.

Agentsmd options:
  --write <file>  Splice the stanza into this file between the
                  aontu:begin and aontu:end markers, appending them
                  when they are absent; the rest is left alone

Agentsmd exit codes: 0 generated, 2 usage, 4 the document does not
stand up on its own.

REPL commands:
  :help           Show REPL help
  :load <file>    Evaluate a document and hold it for the commands below
  :get [path]     What the held document says at a path
  :keys [path]    The keys at a path of the held document
  :why <path>     Every contribution to the value at a path
  :canon          Switch to canonical-form output
  :json           Switch to JSON output
  :quit, :exit    Exit the REPL (or press Ctrl-D)
`;
function version() {
    try {
        const txt = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', 'package.json'), 'utf8');
        return JSON.parse(txt).version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
// Evaluate source, returning either the rendered output or the error
// message. Never throws.
function evalSource(aontu, src, mode) {
    try {
        // exactJSON, not JSON.stringify: a document using the `0d` exact
        // leaves generates bigints and Decimals, which JSON.stringify cannot
        // write (D9). The CLI prints INDENTED JSON and the shared suite's
        // `gens` mode prints COMPACT JSON, but both go through this one
        // emitter -- an indent argument rather than a second implementation,
        // so the two cannot drift from each other or from the Go port.
        const text = 'canon' === mode
            ? aontu.unify(src).canon
            : (0, aontu_1.exactJSON)(aontu.generate(src), 2);
        return { ok: true, text };
    }
    catch (err) {
        const msg = (err instanceof aontu_1.AontuError || true === err?.aontu)
            ? err.message
            : String(err?.message ?? err);
        return { ok: false, text: msg };
    }
}
// The one-line warning of the staged default flip. Once per (kind,
// path): a fixpoint re-resolves nothing (includes load at parse), but
// several includes may escape and each deserves exactly one line.
function makeTrustWarn() {
    const warned = new Set();
    return (kind, path) => {
        const key = kind + ' ' + path;
        if (warned.has(key)) {
            return;
        }
        warned.add(key);
        const how = 'pkg' === kind
            ? 'through package resolution'
            : 'outside the entry root';
        process.stderr.write(`aontu: warning: include resolved ${how}: ${path}` +
            ` (a future release will deny this by default;` +
            ` pass --trust system to keep it, or --include-root to confine)\n`);
    };
}
// Build the evaluator options a TrustArg means, for an entry rooted at
// entryRoot (the entry file's directory, or the working directory for
// stdin/REPL).
function trustOpts(trust, entryRoot) {
    switch (trust.kind) {
        case 'none':
            return { trust: { include: 'none' } };
        case 'root':
            return { trust: { include: { root: trust.dir ?? entryRoot } } };
        case 'system':
            return {};
        default: // system-warn: today's default plus the warning window
            return { trustWarn: makeTrustWarn(), trustWarnRoot: entryRoot };
    }
}
function runFile(file, mode, trust) {
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${file}: ${err.message}\n`);
        return 1;
    }
    const path = (0, node_path_1.resolve)(file);
    const aontu = new aontu_1.Aontu({ path, ...trustOpts(trust, (0, node_path_1.dirname)(path)) });
    const res = evalSource(aontu, src, mode);
    (res.ok ? process.stdout : process.stderr).write(res.text + '\n');
    return res.ok ? 0 : 1;
}
function runStdin(mode, trust) {
    return new Promise((resolve) => {
        let src = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (d) => (src += d));
        process.stdin.on('end', () => {
            const res = evalSource(new aontu_1.Aontu(trustOpts(trust, process.cwd())), src, mode);
            (res.ok ? process.stdout : process.stderr).write(res.text + '\n');
            resolve(res.ok ? 0 : 1);
        });
    });
}
// The loaded document, or the answer to give when there is none.
function replLoaded(state) {
    return state.src;
}
function replCommand(state, line, read) {
    const s = line.trim();
    const answer = (out, next) => {
        const st = { ...state, ...(next ?? {}) };
        return {
            close: false,
            out: st.jsonl ? (0, aontu_1.exactJSON)({ ok: true, out }) : out,
            state: st,
        };
    };
    const refuse = (out) => ({
        close: false,
        out: state.jsonl ? (0, aontu_1.exactJSON)({ ok: false, out }) : out,
        state,
    });
    if ('' === s) {
        return { close: false, out: '', state };
    }
    if (!s.startsWith(':')) {
        const res = evalSource(new aontu_1.Aontu(), s, state.mode);
        return res.ok ? answer(res.text) : refuse(res.text);
    }
    const sp = s.indexOf(' ');
    const cmd = sp < 0 ? s : s.slice(0, sp);
    const arg = sp < 0 ? '' : s.slice(sp + 1).trim();
    switch (cmd) {
        case ':help':
            // Trimmed: the loop adds the newline, and the Go REPL answers
            // the same string — a help text that differed by a blank line
            // between the ports would be a parity diff in the one output
            // every user sees first.
            return answer(HELP.replace(/\n$/, ''));
        case ':canon':
            return answer('canon output', { mode: 'canon' });
        case ':json':
            return answer('json output', { mode: 'json' });
        case ':quit':
        case ':exit':
            return { close: true, out: '', state };
        case ':load': {
            if ('' === arg) {
                return refuse(':load needs a file');
            }
            let src;
            try {
                src = read(arg);
            }
            catch (err) {
                return refuse(`cannot read ${arg}: ${err.message}`);
            }
            // Evaluated ONCE, and what is held is the source: parsed trees
            // are single-use, so every later question re-evaluates from the
            // text rather than reusing a tree that has already been spent.
            const res = evalSource(new aontu_1.Aontu({ path: arg }), src, state.mode);
            return res.ok
                ? answer(`loaded: ${arg}\n${res.text}`, { name: arg, src })
                : refuse(res.text);
        }
        case ':get':
        case ':keys':
        case ':why': {
            const src = replLoaded(state);
            if (null == src) {
                return refuse('nothing loaded (try :load <file>)');
            }
            const path = '' === arg ? '$' : arg;
            if (':why' === cmd) {
                const report = (0, aontu_1.why)(src, path, { path: state.name });
                return report.ok
                    ? answer(renderWhyText(report.record))
                    : refuse(report.findings.map(renderFinding).join('\n'));
            }
            const view = ':keys' === cmd
                ? 'keys' : 'canon' === state.mode ? 'canon' : 'json';
            const report = (0, aontu_1.get)(src, path, { view, path: state.name });
            return report.ok
                ? answer(report.out)
                : refuse(report.findings.map(renderFinding).join('\n'));
        }
        default:
            return refuse(`unknown command: ${s} (try :help)`);
    }
}
function runRepl(initialMode, jsonl) {
    let state = { mode: initialMode, jsonl };
    const rl = (0, node_readline_1.createInterface)({
        input: process.stdin,
        output: process.stdout,
        prompt: jsonl ? '' : 'aontu> ',
    });
    if (!jsonl) {
        process.stdout.write(`Aontu v${version()} REPL — :help for commands, :quit to exit\n`);
    }
    rl.prompt();
    rl.on('line', (line) => {
        const res = replCommand(state, line, (f) => (0, node_fs_1.readFileSync)(f, 'utf8'));
        state = res.state;
        if (res.close) {
            rl.close();
            return;
        }
        if ('' !== res.out) {
            process.stdout.write(res.out + '\n');
        }
        rl.prompt();
    });
    rl.on('close', () => {
        // The closing newline is for a HUMAN, so it is written only for
        // one: it moves the terminal off the prompt line that `rl` left
        // hanging. In `--jsonl` there is no prompt, every answer already
        // ends in its own newline, and this one appended a bare empty line
        // to the stream -- a record that is not JSON, at the end of a
        // protocol whose whole contract is one JSON object per line. A
        // harness parsing every line it receives failed on it, after the
        // commands had all succeeded. Mirrors go/cmd/aontu/repl.go.
        if (!jsonl) {
            process.stdout.write('\n');
        }
        // Same reason as finish(): the REPL requires a TTY stdin, but stdout
        // can still be a pipe (`aontu | cat`), so exiting outright could
        // discard queued output here too.
        process.exitCode = 0;
    });
}
// THE VET VERB (G2 phase 3).
//
// Exit codes are VERDICT CLASSES, not a pass/fail bit: an agent loop
// branches on "the data contradicts the truth" (1) differently from
// "the data has not supplied everything the truth requires" (3), and
// differently again from "the schema itself is broken" (4), which is
// never the data's fault. 2 stays what it already was for this CLI --
// the caller got the invocation wrong -- which is why an unreadable
// file is a 2 rather than a 4.
const VET_EXIT = {
    valid: 0,
    invalid: 1,
    incomplete: 3,
    error: 4,
};
const VET_HELP = 'aontu vet <schema> <data> [more-data...] (try --help)';
// Parse the verb's argv tail. Returns the error text instead of
// throwing, so the caller owns the exit code.
function parseVetArgs(argv) {
    const files = [];
    let format = 'text';
    let at;
    let closed = false;
    let partial = false;
    let maxErrors;
    let watch = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        // `-h`/`--help` before anything else, INCLUDING the file count:
        // the usage errors below all end with "(try --help)", and a verb
        // that then refused --help as an unknown option was sending the
        // reader in a circle.
        if ('-h' === arg || '--help' === arg) {
            return { args: { help: true, schema: '', data: [], format } };
        }
        if ('--at' === arg) {
            at = argv[++i];
            if (null == at) {
                return { err: 'aontu: --at needs a path' };
            }
        }
        else if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f && 'sarif' !== f) {
                return { err: `aontu: --format needs text, json or sarif` };
            }
            format = f;
        }
        else if ('--max-errors' === arg) {
            // ONE GRAMMAR, spelled the same way in both ports: decimal
            // digits, one to nine of them, at least 1. `Number()` alone
            // accepted `1.0`, `1e2`, `0x10` and ` 3`, which Go's parser
            // refuses -- so the same documented invocation meant different
            // things in the two shipped commands. The nine-digit ceiling is
            // where the ports would part company again: beyond it Go's
            // integer conversion saturates, and a cap nobody can reach is
            // not worth a divergence.
            const raw = argv[++i];
            if (!/^[0-9]{1,9}$/.test(raw ?? '') || 1 > Number(raw)) {
                return { err: 'aontu: --max-errors needs a positive whole number' };
            }
            maxErrors = Number(raw);
        }
        else if ('--closed' === arg) {
            closed = true;
        }
        else if ('--partial' === arg) {
            partial = true;
        }
        else if ('--watch' === arg) {
            watch = true;
        }
        else if (arg.startsWith('-')) {
            return { err: `aontu: unknown vet option ${arg} (try --help)` };
        }
        else {
            files.push(arg);
        }
    }
    if (files.length < 2) {
        return { err: `aontu: vet needs a schema and at least one data file\n${VET_HELP}` };
    }
    return {
        args: {
            schema: files[0],
            data: files.slice(1),
            format,
            at,
            closed,
            partial,
            maxErrors,
            watch,
        },
    };
}
// One line per site, so a finding reads as "what is wrong, where the
// data says it, and where the truth says otherwise". The data site
// comes first because it is the one to edit.
function renderFinding(f) {
    const out = [`${f.path}: ${f.code} [${f.class}]`];
    if ('' !== f.message) {
        out.push(`  ${f.message}`);
    }
    if (null != f.note) {
        out.push(`  note: ${f.note}`);
    }
    if (null != f.expected) {
        out.push(`  expected: ${f.expected}`);
    }
    if (null != f.actual) {
        out.push(`  actual:   ${f.actual}`);
    }
    for (const s of f.sites) {
        // Every site carries the canon of the value it stands for: that is
        // what makes the two sides of a conflict readable side by side. A
        // site's file is always a string -- empty when the value belongs to
        // neither document -- so there is nothing to coalesce here.
        out.push(`  ${s.role}: ${s.file}:${s.row}:${s.col} (${s.value})`);
    }
    return out.join('\n');
}
function renderVetText(report) {
    const head = `verdict: ${report.verdict}` +
        (report.truncated ? ' (findings truncated)' : '');
    if (0 === report.findings.length) {
        return head;
    }
    return [head, ''].concat(report.findings.map(renderFinding)).join('\n');
}
// The machine-readable form. `aontu` names the producer, so a report
// read from a file or a pipe says which version and which verb made it
// without the consumer having to know.
function renderVetJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'vet' },
        verdict: report.verdict,
        truncated: report.truncated,
        findings: report.findings,
    }, 2);
}
// The machine-interchange form (G2 phase 5): SARIF 2.1.0, rendered by
// the library (ts/src/report-sarif.ts) so an embedder gets the same
// bytes the CLI prints.
function renderVetSarif(report) {
    return (0, report_sarif_1.sarifReport)(report, version());
}
// The worst verdict wins across data files: a run that is invalid
// anywhere is invalid, and a schema that cannot stand up makes every
// file's verdict moot.
const VET_RANK = {
    valid: 0,
    incomplete: 1,
    invalid: 2,
    error: 3,
};
// One complete vet run: read every file, vet each data document, print
// one report, return the exit class. Split from runVet so `--watch` can
// repeat it — the files are re-read on every run, which is the point of
// watching them.
function vetOnce(args) {
    let schemaSrc;
    const sources = [];
    try {
        schemaSrc = (0, node_fs_1.readFileSync)(args.schema, 'utf8');
        for (const file of args.data) {
            sources.push({ file, src: (0, node_fs_1.readFileSync)(file, 'utf8') });
        }
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    // Each data file is vetted on its own, because a parsed tree is
    // single-use (docs/reference-api.md) -- and because two data files
    // are two candidates for the same truth, not one merged candidate.
    let verdict = 'valid';
    let truncated = false;
    const findings = [];
    for (const source of sources) {
        const report = (0, aontu_1.vet)(schemaSrc, source.src, {
            at: args.at,
            closed: args.closed,
            partial: args.partial,
            maxErrors: args.maxErrors,
            schemaUrl: args.schema,
            dataUrl: source.file,
            // The paths as well as the labels: a relative `@"file"` load
            // inside either document resolves from ITS OWN directory, the
            // way `aontu <file>` already resolves one (runFile above). The
            // path is passed AS TYPED, not resolved: it doubles as the
            // label above, and a report that mixed the typed path with an
            // absolute one would name the same file two ways.
            schemaPath: args.schema,
            dataPath: source.file,
        });
        if (VET_RANK[verdict] < VET_RANK[report.verdict]) {
            verdict = report.verdict;
        }
        truncated = truncated || report.truncated;
        findings.push(...report.findings);
        // A SCHEMA-SIDE FAULT IS THE SAME FAULT FOR EVERY DATA FILE, so it
        // is reported ONCE. `error` means exactly that -- the run could not
        // be set up from the truth's side, never the data's (the exit table
        // in docs/reference-api.md) -- so the report the first file
        // produced is the report every later file would produce, character
        // for character. Concatenating them repeated one broken schema N
        // times and, past the cap, marked the report `truncated` over a
        // single underlying fault. It only became visible once the `error`
        // verdict started carrying findings at all: while the list was
        // empty there was nothing to duplicate.
        if ('error' === report.verdict) {
            break;
        }
    }
    // The cap is on the REPORT, not on each file. Capping every file's
    // list and then concatenating them let `--max-errors 1` emit one
    // finding PER FILE -- and leave `truncated` false while doing it,
    // because no single file had been cut. The engine still caps each
    // run, so a pathological file cannot flood the aggregate before it
    // gets here; this is the second, honest cut.
    const cap = args.maxErrors ?? vet_1.VET_MAX_ERRORS;
    const kept = cap < findings.length ? findings.slice(0, cap) : findings;
    const report = {
        verdict,
        truncated: truncated || cap < findings.length,
        findings: kept,
    };
    const text = 'json' === args.format ? renderVetJson(report) :
        'sarif' === args.format ? renderVetSarif(report) :
            renderVetText(report);
    process.stdout.write(text + '\n');
    return VET_EXIT[verdict];
}
// How often `--watch` polls for a change. Polling by mtime+size rather
// than fs.watch: the design asks for "re-run on file mtime change", and
// the native watcher's semantics differ by platform (rename versus
// change events, editors that replace the inode) in exactly the ways
// that made every build tool fall back to polling.
const WATCH_POLL_MS = 100;
function watchSignature(files) {
    return files.map((f) => {
        // throwIfNoEntry, not try/catch: a file mid-save can be briefly
        // absent, and "gone" is a state to notice, not an error to die on.
        const stat = (0, node_fs_1.statSync)(f, { throwIfNoEntry: false });
        return null == stat ? 'gone' : `${stat.mtimeMs}:${stat.size}`;
    }).join('\n');
}
function sleep(ms) {
    return new Promise((done) => setTimeout(done, ms));
}
// Resolve true when any watched file's signature moves off `before`.
// This is the real waiter: it never resolves false, so a real watch
// runs until the process is interrupted; tests inject their own waiter
// to bound the loop, and pass a short pollMs when they drive this one
// directly. The interval is a required argument (the command passes
// WATCH_POLL_MS) so there is no defaulting branch a test could never
// take.
//
// The BASELINE is an argument, not a snapshot taken here: the loop
// records it BEFORE each vet run, so a save landing between the run's
// reads and the wait still compares as a change. A waiter that
// snapshotted on entry would adopt that unvetted save as its baseline
// and wait indefinitely on a stale report.
async function watchChange(files, before, pollMs) {
    for (;;) {
        await sleep(pollMs);
        if (watchSignature(files) !== before) {
            return true;
        }
    }
}
// The waiter the command runs with: the real change-poller at the real
// interval. Named (rather than inlined at the runVet call) so the
// production waiter itself is directly testable.
const vetWaiter = (files, before) => watchChange(files, before, WATCH_POLL_MS);
exports.vetWaiter = vetWaiter;
// The watch loop: one report per run, one run per change, streaming to
// stdout. An unreadable file mid-watch reports (exit class 2 from
// vetOnce) and keeps watching — a file being rewritten is briefly
// unreadable, and dying on it would make the mode useless for the very
// moment it exists for.
async function watchVet(args, wait) {
    const files = [args.schema, ...args.data];
    let before = watchSignature(files);
    let code = vetOnce(args);
    while (await wait(files, before)) {
        before = watchSignature(files);
        code = vetOnce(args);
    }
    return code;
}
// The vet verb. Non-watch runs are synchronous and return the exit
// class directly; `--watch` returns a promise that resolves only when
// the waiter says stop (never, for the real one).
function runVet(argv, wait) {
    const parsed = parseVetArgs(argv);
    if (null != parsed.err) {
        process.stderr.write(parsed.err + '\n');
        return 2;
    }
    const args = parsed.args;
    if (true === args.help) {
        process.stdout.write(HELP);
        return 0;
    }
    if (true === args.watch) {
        return watchVet(args, wait ?? vetWaiter);
    }
    return vetOnce(args);
}
// ---------------------------------------------------------------------
// The subsumption verbs (G3 phase 3): `subsume` asks the query once,
// `breaking` asks it between a document and its own earlier versions.
const SUBSUME_HELP = 'aontu subsume <general> <specific> (try --help)';
const BREAKING_HELP = 'aontu breaking --against <file|git#rev> <file> (try --help)';
// Exit classes mirror vet's convention: 3 is "the truth is not yet
// settled", which is exactly what undecided means here — and a gate
// that shrugs is not a gate, so undecided FAILS by default.
const SUBSUME_EXIT = {
    subsumes: 0,
    does_not_subsume: 1,
    undecided: 3,
    error: 4,
};
function parseSubsumeArgs(argv) {
    const files = [];
    let profile;
    let at;
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            return { args: { help: true, general: '', specific: '', format } };
        }
        if ('--profile' === arg) {
            const p = argv[++i];
            if ('values' !== p && 'defaults' !== p && 'gen' !== p) {
                return { err: 'aontu: --profile needs values, defaults or gen' };
            }
            profile = p;
        }
        else if ('--at' === arg) {
            at = argv[++i];
            if (null == at) {
                return { err: 'aontu: --at needs a path' };
            }
        }
        else if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                return { err: 'aontu: --format needs text or json' };
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            return { err: `aontu: unknown subsume option ${arg} (try --help)` };
        }
        else {
            files.push(arg);
        }
    }
    if (2 !== files.length) {
        return {
            err: 'aontu: subsume needs a general and a specific file\n' +
                SUBSUME_HELP,
        };
    }
    return {
        args: { general: files[0], specific: files[1], profile, at, format },
    };
}
function renderSubsumeText(report) {
    const head = `verdict: ${report.verdict}`;
    if (0 === report.findings.length) {
        return head;
    }
    return [head, ''].concat(report.findings.map(renderFinding)).join('\n');
}
function renderSubsumeJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'subsume' },
        verdict: report.verdict,
        findings: report.findings,
    }, 2);
}
function runSubsume(argv) {
    const parsed = parseSubsumeArgs(argv);
    if (null != parsed.err) {
        process.stderr.write(parsed.err + '\n');
        return 2;
    }
    const args = parsed.args;
    if (true === args.help) {
        process.stdout.write(HELP);
        return 0;
    }
    let generalSrc, specificSrc;
    try {
        generalSrc = (0, node_fs_1.readFileSync)(args.general, 'utf8');
        specificSrc = (0, node_fs_1.readFileSync)(args.specific, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, aontu_1.subsume)(generalSrc, specificSrc, {
        profile: args.profile,
        at: args.at,
        generalUrl: args.general,
        specificUrl: args.specific,
        generalPath: args.general,
        specificPath: args.specific,
    });
    const text = 'json' === args.format
        ? renderSubsumeJson(report)
        : renderSubsumeText(report);
    process.stdout.write(text + '\n');
    return SUBSUME_EXIT[report.verdict];
}
function parseBreakingArgs(argv) {
    const files = [];
    const against = [];
    let mode;
    let allowUndecided = false;
    let allowDeprecatedRemoval = false;
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            return {
                args: {
                    help: true, file: '', against: [],
                    allowUndecided, allowDeprecatedRemoval, format,
                },
            };
        }
        if ('--against' === arg) {
            const a = argv[++i];
            if (null == a) {
                return { err: 'aontu: --against needs a file path or git#<rev>' };
            }
            against.push(a);
        }
        else if ('--mode' === arg) {
            const m = argv[++i];
            if ('backward' !== m && 'forward' !== m && 'full' !== m) {
                return { err: 'aontu: --mode needs backward, forward or full' };
            }
            mode = m;
        }
        else if ('--allow-undecided' === arg) {
            allowUndecided = true;
        }
        else if ('--allow-deprecated-removal' === arg) {
            allowDeprecatedRemoval = true;
        }
        else if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                return { err: 'aontu: --format needs text or json' };
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            return { err: `aontu: unknown breaking option ${arg} (try --help)` };
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length || 0 === against.length) {
        return {
            err: 'aontu: breaking needs one file and at least one --against\n' +
                BREAKING_HELP,
        };
    }
    return {
        args: {
            file: files[0], against, mode,
            allowUndecided, allowDeprecatedRemoval, format,
        },
    };
}
// Resolve one --against spelling to source text. `git#<rev>` shells out
// to `git show <rev>:./<basename>` from the file's own directory — no
// embedded git, and the `./` prefix makes git resolve the path relative
// to that directory rather than the repository root. Returns undefined
// (with the message already printed) on failure.
function againstSource(spec, file) {
    if (!spec.startsWith('git#')) {
        try {
            return (0, node_fs_1.readFileSync)(spec, 'utf8');
        }
        catch (err) {
            process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
            return undefined;
        }
    }
    const rev = spec.slice('git#'.length);
    if ('' === rev) {
        process.stderr.write('aontu: --against git# needs a revision\n');
        return undefined;
    }
    try {
        // Lazy import: the dependency exists only when a git spelling is
        // actually used, so plain runs never pay for it.
        const { execFileSync } = require('node:child_process');
        const dir = (0, node_path_1.dirname)((0, node_path_1.resolve)(file));
        const rel = './' + (0, node_path_1.resolve)(file).slice(dir.length + 1);
        return execFileSync('git', ['show', `${rev}:${rel}`], {
            cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    catch (err) {
        const detail = String(err.stderr ?? err.message).trim().split('\n')[0];
        process.stderr.write(`aontu: cannot resolve ${spec}: ${detail}\n`);
        return undefined;
    }
}
// The document's own compatibility declaration: `$.aontu_policy.compat`,
// a disjunction whose default is the declared mode. Undefined when the
// key is absent or does not spell a mode.
function policyCompat(newSrc, path) {
    const aontu = new aontu_1.Aontu();
    const ctx = aontu.ctx({ collect: true });
    const v = aontu.unify(newSrc, { path }, ctx);
    if (0 < ctx.err.length || true === v?.isNil) {
        return undefined;
    }
    let compat = v?.peg?.aontu_policy?.peg?.compat;
    if (null == compat) {
        return undefined;
    }
    if (true === compat.isDisjunct && Array.isArray(compat.peg)) {
        compat = compat.peg.find((m) => true === m?.isPref) ?? compat.peg[0];
    }
    if (true === compat.isPref) {
        compat = compat.peg;
    }
    const m = true === compat?.isString ? compat.peg : undefined;
    return 'backward' === m || 'forward' === m || 'full' === m || 'none' === m
        ? m : undefined;
}
// Is the evaluated old version's value at the finding path deprecated?
// The --allow-deprecated-removal downgrade (G3 phase 4): removing (or
// otherwise changing) a value the old version already deprecated warns
// instead of breaking. The Go port exports the same reader as
// aontu.DeprecatedAt.
function deprecatedAt(oldSrc, path, filePath) {
    const aontu = new aontu_1.Aontu();
    const ctx = aontu.ctx({ collect: true });
    const v = aontu.unify(oldSrc, { path: filePath }, ctx);
    if (0 < ctx.err.length || true === v?.isNil) {
        return false;
    }
    const segs = path.replace(/^\$/, '').split('.').filter((p) => '' !== p);
    let node = v;
    for (const seg of segs) {
        if (true === node?.isMap) {
            node = node.peg?.[seg];
        }
        else if (true === node?.isList) {
            node = node.peg?.[Number(seg)];
        }
        else {
            return false;
        }
        if (null == node) {
            return false;
        }
    }
    return null != node?.deprecation;
}
// Verdict aggregation for breaking: an error anywhere makes the run an
// error; otherwise a witness anywhere makes it breaking; otherwise an
// open question anywhere leaves it undecided.
const BREAKING_RANK = {
    subsumes: 0,
    undecided: 1,
    does_not_subsume: 2,
    error: 3,
};
const BREAKING_EXIT = SUBSUME_EXIT;
const BREAKING_VERDICT = {
    subsumes: 'compatible',
    does_not_subsume: 'breaking',
    undecided: 'undecided',
    error: 'error',
};
function runBreaking(argv) {
    const parsed = parseBreakingArgs(argv);
    if (null != parsed.err) {
        process.stderr.write(parsed.err + '\n');
        return 2;
    }
    const args = parsed.args;
    if (true === args.help) {
        process.stdout.write(HELP);
        return 0;
    }
    let newSrc;
    try {
        newSrc = (0, node_fs_1.readFileSync)(args.file, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    // The declared mode: --mode overrides the document's own policy;
    // neither means backward, the index's framing (v1-valid documents
    // stay valid).
    const mode = args.mode ?? policyCompat(newSrc, args.file) ?? 'backward';
    if ('none' === mode) {
        // The document declares no compatibility promise: nothing to check.
        const report = { verdict: 'subsumes', findings: [] };
        const text = 'json' === args.format
            ? renderBreakingJson(report, mode)
            : renderBreakingText(report);
        process.stdout.write(text + '\n');
        return 0;
    }
    let worst = 'subsumes';
    const findings = [];
    for (const spec of args.against) {
        const oldSrc = againstSource(spec, args.file);
        if (null == oldSrc) {
            return 2;
        }
        // backward: the NEW document is the general side — every old
        // instance must still be admitted. forward: the old one is.
        const checks = [];
        if ('backward' === mode || 'full' === mode) {
            checks.push({ general: [newSrc, args.file], specific: [oldSrc, spec] });
        }
        if ('forward' === mode || 'full' === mode) {
            checks.push({ general: [oldSrc, spec], specific: [newSrc, args.file] });
        }
        const oldPath = spec.startsWith('git#') ? args.file : spec;
        for (const check of checks) {
            const report = (0, aontu_1.subsume)(check.general[0], check.specific[0], {
                generalUrl: check.general[1],
                specificUrl: check.specific[1],
                // A git#rev source has no directory of its own; its relative
                // loads resolve as the working file's do.
                generalPath: check.general[1].startsWith('git#')
                    ? args.file : check.general[1],
                specificPath: check.specific[1].startsWith('git#')
                    ? args.file : check.specific[1],
            });
            // The deprecated-removal downgrade: a finding about a value the
            // OLD version already deprecated becomes a warning, and warnings
            // do not move the verdict. Deprecate-then-remove is the
            // supported rename path (the design's own sequencing).
            let verdict = report.verdict;
            if (args.allowDeprecatedRemoval) {
                let liveFindings = 0;
                for (const f of report.findings) {
                    if ('error' === f.severity &&
                        deprecatedAt(oldSrc, f.path, oldPath)) {
                        f.severity = 'warning';
                    }
                    if ('error' === f.severity) {
                        liveFindings++;
                    }
                }
                if ('does_not_subsume' === verdict && 0 === liveFindings) {
                    verdict = 'subsumes';
                }
            }
            if (BREAKING_RANK[worst] < BREAKING_RANK[verdict]) {
                worst = verdict;
            }
            findings.push(...report.findings);
        }
    }
    const report = { verdict: worst, findings };
    const text = 'json' === args.format
        ? renderBreakingJson(report, mode)
        : renderBreakingText(report);
    process.stdout.write(text + '\n');
    if ('undecided' === worst && args.allowUndecided) {
        return 0;
    }
    return BREAKING_EXIT[worst];
}
function renderBreakingText(report) {
    const head = `verdict: ${BREAKING_VERDICT[report.verdict]}`;
    if (0 === report.findings.length) {
        return head;
    }
    return [head, ''].concat(report.findings.map(renderFinding)).join('\n');
}
function renderBreakingJson(report, mode) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'breaking', mode },
        verdict: BREAKING_VERDICT[report.verdict],
        findings: report.findings,
    }, 2);
}
// ---------------------------------------------------------------------
// The trim reporter (G3 phase 6): report redundant entries as paths.
// Report-only — REWRITING needs G7's format-preserving patch surface —
// which is why --check is REQUIRED rather than defaulted: `aontu trim
// f.aon` reads as "trim this file", and doing something else silently
// is worse than saying so.
const TRIM_HELP = 'aontu trim --check <file> (try --help)';
const TRIM_EXIT = {
    clean: 0,
    redundant: 1,
    error: 4,
};
function runTrim(argv) {
    const files = [];
    let check = false;
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--check' === arg) {
            check = true;
        }
        else if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return 2;
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown trim option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length) {
        process.stderr.write(`aontu: trim needs one file\n${TRIM_HELP}\n`);
        return 2;
    }
    if (!check) {
        process.stderr.write('aontu: trim only reports for now — rewriting needs a format-' +
            'preserving editor (G7); pass --check\n');
        return 2;
    }
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(files[0], 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, aontu_1.trimCheck)(src, { path: files[0] });
    const text = 'json' === format
        ? renderTrimJson(report)
        : renderTrimText(report);
    process.stdout.write(text + '\n');
    return TRIM_EXIT[report.verdict];
}
function renderTrimText(report) {
    const head = `verdict: ${report.verdict}`;
    if (0 === report.redundant.length) {
        return head;
    }
    return [head, ''].concat(report.redundant).join('\n');
}
function renderTrimJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'trim' },
        verdict: report.verdict,
        redundant: report.redundant,
    }, 2);
}
// The relation reporter (G4 phase 5): acyclicity and inverse
// consistency over the edge set. A verb of its own rather than a leg of
// `vet`, for the reason `trim` is one: vet answers "does this DOCUMENT
// satisfy that SCHEMA", and these are facts about one finished model,
// with no schema on the other side of the question.
const RELATIONS_HELP = 'aontu relations <file> (try --help)';
const RELATIONS_EXIT = {
    pass: 0,
    fail: 1,
    error: 4,
};
const MOD_HELP = 'aontu mod tidy|vendor|manifest [dir] (try --help)';
// The module tooling (G6 phase 3, ts/src/mod-tool.ts). Two
// subcommands, both LOCAL: `tidy` resolves the closure from what is in
// the stores and rewrites the lockfile, `vendor` materialises the
// locked closure into the project.
//
// `get` and `publish` are the NETWORK half of the design and are not in
// this build. They are named here rather than left to fall out as an
// unknown subcommand, because a reader of the design will type them and
// deserves to be told which half is missing rather than that the word
// is wrong.
function runMod(argv) {
    const rest = [];
    let format = 'text';
    let against;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return 2;
            }
            format = f;
        }
        else if ('--against' === arg) {
            const a = argv[++i];
            if (null == a) {
                process.stderr.write('aontu: --against needs a module directory\n');
                return 2;
            }
            against = a;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown mod option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            rest.push(arg);
        }
    }
    const sub = rest[0];
    const dir = rest[1] ?? '.';
    if ('get' === sub || 'publish' === sub) {
        process.stderr.write('aontu: mod ' + sub + ' needs a registry client, which this build ' +
            'does not ship (docs/capability-review/g6-distribution.md)\n');
        return 2;
    }
    if (!MOD_SUBS.includes(sub) || 2 < rest.length) {
        process.stderr.write(`aontu: mod needs tidy, vendor or manifest\n${MOD_HELP}\n`);
        return 2;
    }
    // `--against` gates a manifest and means nothing to the other two;
    // accepting it there would say it had been honoured.
    if (null != against && 'manifest' !== sub) {
        process.stderr.write('aontu: --against is a manifest option\n');
        return 2;
    }
    const report = 'tidy' === sub ? (0, mod_tool_1.modTidy)(dir, modToolOptions()) :
        'vendor' === sub ? (0, mod_tool_1.modVendor)(dir, modToolOptions()) :
            (0, mod_tool_1.modManifest)(dir, modToolOptions(), against);
    process.stdout.write(('json' === format ?
        (0, aontu_1.exactJSON)({ aontu: { version: version(), verb: 'mod ' + sub }, ...report }, 2) :
        modText(sub, report)) + '\n');
    return MOD_EXIT[report.verdict];
}
const MOD_SUBS = ['tidy', 'vendor', 'manifest'];
const MOD_EXIT = {
    ok: 0,
    missing: 1,
    breaking: 1,
    undecided: 3,
    error: 4,
};
// The tooling's evaluator: the same standalone evaluation the module
// resolver verifies with (ts/src/mod.ts), and for the same reason —
// only the engine can say what a module MEANS.
function modToolOptions() {
    return {
        cache: (0, mod_1.modCacheDir)(),
        eval: (src, path) => {
            const a0 = new aontu_1.Aontu();
            const ctx = a0.ctx({ collect: true });
            const val = a0.unify(src, { path }, ctx);
            return {
                gen: val.gen(a0.ctx({ collect: true })),
                hash: (0, aontu_1.canonHash)(val),
                canon: val.canon,
            };
        },
    };
}
function modText(sub, report) {
    const lines = ['verdict: ' + report.verdict];
    if ('manifest' === sub) {
        if ('' !== report.mod) {
            lines.push(report.mod + ' ' + report.version);
            lines.push('config: ' + report.config);
        }
        for (const key of Object.keys(report.annotations).sort()) {
            lines.push(key + ': ' + report.annotations[key]);
        }
        for (const file of report.files) {
            lines.push('layer: ' + file);
        }
        for (const f of report.findings) {
            lines.push(f.path + ': ' + f.message);
        }
        // What a manifest lacks is a declaration the module does not make
        // or an entry file that is not there, and neither is something a
        // fetch would supply -- so this is not the tail the other two
        // subcommands share. The name says which kind it is: `mod.version`
        // is a declaration, `service.aon` is a file.
        for (const miss of report.missing) {
            lines.push(miss + ': missing');
        }
        return lines.join('\n');
    }
    const done = 'tidy' === sub ? report.lock : report.vendored;
    for (const item of done) {
        lines.push('tidy' === sub ?
            item.mod + ' ' + item.v + ' ' + item.canon : '' + item);
    }
    for (const miss of report.missing) {
        lines.push(miss + ': not fetched (run: aontu mod get)');
    }
    return lines.join('\n');
}
function runRelations(argv) {
    const files = [];
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return 2;
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown relations option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length) {
        process.stderr.write(`aontu: relations needs one file\n${RELATIONS_HELP}\n`);
        return 2;
    }
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(files[0], 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, aontu_1.relationCheck)(src, { path: files[0] });
    const text = 'json' === format
        ? renderRelationsJson(report)
        : renderRelationsText(report);
    process.stdout.write(text + '\n');
    return RELATIONS_EXIT[report.verdict];
}
function renderRelationsText(report) {
    const head = `verdict: ${report.verdict}`;
    if (0 === report.findings.length) {
        return head;
    }
    const lines = report.findings.map((f) => 'relation_cycle' === f.code
        ? `${f.at}  ${f.relation}: cycle ${f.detail.join(' -> ')}`
        : `${f.at}  ${f.relation}: ${f.detail[1]} does not list ` +
            `${f.detail[0]} under ${f.detail[2]}`);
    return [head, ''].concat(lines).join('\n');
}
function renderRelationsJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'relations' },
        verdict: report.verdict,
        findings: report.findings,
    }, 2);
}
// ---------------------------------------------------------------------
// The canon-hash (G6 phase 1): the pin an agent, a lockfile or a
// registry stores for "this module, this meaning". The hash covers the
// module evaluated STANDALONE -- its own include closure resolved and
// unified at its own root, before any consumer context -- which is what
// makes the pin transitive: an edit two includes deep changes the
// unified root, hence the hash.
const HASH_HELP = 'aontu hash <file> (try --help)';
function runHash(argv) {
    const files = [];
    let form = false;
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--form' === arg) {
            form = true;
        }
        else if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return 2;
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown hash option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length) {
        process.stderr.write(`aontu: hash needs one file\n${HASH_HELP}\n`);
        return 2;
    }
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(files[0], 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    // The file's own directory is the include base, as every verb
    // resolves a named file (vet's aontuForPath rule).
    const aontu = new aontu_1.Aontu();
    const ctx = aontu.ctx({ collect: true });
    const v = aontu.unify(src, { path: files[0] }, ctx);
    if (0 < ctx.err.length || true === v?.isNil) {
        // A document that does not stand up on its own has no meaning to
        // pin, and a hash of a broken evaluation would be a pin that
        // silently agrees with every other broken evaluation.
        process.stderr.write(`aontu: ${files[0]} does not evaluate on its own; nothing to hash\n`);
        return 4;
    }
    const text = 'json' === format
        ? (0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'hash' },
            hash: (0, aontu_1.canonHash)(v),
            form: (0, aontu_1.hcanon)(v),
        }, 2)
        : (form ? (0, aontu_1.hcanon)(v) : (0, aontu_1.canonHash)(v));
    process.stdout.write(text + '\n');
    return 0;
}
// ---------------------------------------------------------------------
// The query surface (G7 phase 1): one node of an evaluated document,
// selected by path and rendered. Evaluation is still GLOBAL -- what
// `get` buys is the size of the ANSWER, not the cost of producing it --
// and the projections are lattice abstractions, each a valid Aontu
// document that subsumes the truth it summarises.
const GET_HELP = 'aontu get <path> <file> (try --help)';
function runGet(argv) {
    const rest = [];
    let view = 'json';
    let depth;
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('-c' === arg || '--canon' === arg) {
            view = 'canon';
        }
        else if ('--keys' === arg) {
            view = 'keys';
        }
        else if ('--types' === arg) {
            view = 'types';
        }
        else if ('--depth' === arg) {
            const n = Number(argv[++i]);
            if (!Number.isInteger(n) || n < 1) {
                process.stderr.write('aontu: --depth needs a positive integer\n');
                return 2;
            }
            depth = n;
        }
        else if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return 2;
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown get option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            rest.push(arg);
        }
    }
    if (2 !== rest.length) {
        process.stderr.write(`aontu: get needs a path and one file\n${GET_HELP}\n`);
        return 2;
    }
    const [path, file] = rest;
    // ELIDING BELOW A DEPTH means rendering `top`, which JSON cannot
    // say. Rather than switch the view silently -- the choice `trim
    // --check` refused to make -- the combination is a usage error.
    if (null != depth && 'canon' !== view && 'types' !== view) {
        process.stderr.write('aontu: --depth needs --canon or --types (JSON cannot say top)\n');
        return 2;
    }
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, aontu_1.get)(src, path, { view, depth, path: file });
    if ('json' === format) {
        process.stdout.write((0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'get' },
            findings: report.findings,
            ok: report.ok,
            out: report.out,
        }, 2) + '\n');
    }
    else if (report.ok) {
        process.stdout.write(report.out + '\n');
    }
    else {
        process.stderr.write(report.findings.map(renderFinding).join('\n') + '\n');
    }
    if (report.ok) {
        return 0;
    }
    // A path that names nothing is the QUESTION's answer -- exit 1, the
    // "no" class -- while a document that does not stand up is exit 4,
    // as it is for every other verb.
    return 'no_path' === report.findings[0]?.code ? 1 : 4;
}
// ---------------------------------------------------------------------
// Provenance (G7 phase 3): WHY the value at a path holds — the ordered
// contributions that met there, each with the site it was written at.
// The positive twin of the vet report: errors explain what failed to
// unify, this explains what did.
const WHY_HELP = 'aontu why <path> <file> (try --help)';
function runWhy(argv) {
    const rest = [];
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return 2;
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown why option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            rest.push(arg);
        }
    }
    if (2 !== rest.length) {
        process.stderr.write(`aontu: why needs a path and one file\n${WHY_HELP}\n`);
        return 2;
    }
    const [path, file] = rest;
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, aontu_1.why)(src, path, { path: file });
    if ('json' === format) {
        process.stdout.write((0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'why' },
            findings: report.findings,
            ok: report.ok,
            ...(null == report.record ? {} : { record: report.record }),
        }, 2) + '\n');
    }
    else if (report.ok) {
        process.stdout.write(renderWhyText(report.record) + '\n');
    }
    else {
        process.stderr.write(report.findings.map(renderFinding).join('\n') + '\n');
    }
    if (report.ok) {
        return 0;
    }
    return 'no_path' === report.findings[0]?.code ? 1 : 4;
}
// One contribution per line, numbered in source order, each with what
// was written, where, and how it got here. A siteless contribution
// prints no location rather than a `-1:-1` that means nothing —
// exported for the direct test, because the site SHAPE allows one
// while no document has yet produced one (ADR-002).
function renderWhyText(record) {
    const head = `${record.path} = ${record.value}`;
    if (0 === record.conjuncts.length) {
        // A value written once and never met is a fact, not a failure.
        return head + '\n  (no contributions: nothing met at this path)';
    }
    return [head].concat(record.conjuncts.map((c, i) => {
        const where = -1 === c.site.row
            ? ''
            : `  ${'' === c.site.file ? '' : c.site.file + ':'}` +
                `${c.site.row}:${c.site.col}`;
        return `  ${i + 1}. ${c.canon}${where}` +
            ('literal' === c.role ? '' : `  (${c.role})`);
    })).join('\n');
}
// ---------------------------------------------------------------------
// The overlay patch verb (G7 phase 5): change a document by APPENDING
// to an overlay, not by rewriting it. An overlay entry is just another
// conjunct and unification is order-independent, so this needs no
// rewriter — the format-preserving in-place edit is stage 2, and needs
// a comment-preserving CST the parser stack does not have.
const SET_HELP = 'aontu set <path>=<value> --entry <file> --overlay <file> (try --help)';
function runSet(argv) {
    const assignments = [];
    let entry;
    let overlayFile;
    let dryRun = false;
    let inPlace = false;
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--entry' === arg) {
            entry = argv[++i];
        }
        else if ('--overlay' === arg) {
            overlayFile = argv[++i];
        }
        else if ('--dry-run' === arg) {
            dryRun = true;
        }
        else if ('--in-place' === arg) {
            inPlace = true;
        }
        else if ('--format' === arg) {
            const f = argv[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return 2;
            }
            format = f;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown set option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            assignments.push(arg);
        }
    }
    if (0 === assignments.length || null == entry || null == overlayFile) {
        process.stderr.write(`aontu: set needs assignments, --entry and --overlay\n${SET_HELP}\n`);
        return 2;
    }
    let entrySrc;
    try {
        entrySrc = (0, node_fs_1.readFileSync)(entry, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    // An ABSENT overlay is the empty overlay, and the file is created by
    // the write below: "append to the overlay" should not require the
    // author to have made one first.
    let overlaySrc = '';
    try {
        overlaySrc = (0, node_fs_1.readFileSync)(overlayFile, 'utf8');
    }
    catch (err) {
        if ('ENOENT' !== err?.code) {
            process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
            return 2;
        }
    }
    const report = (0, aontu_1.patch)(entrySrc, overlaySrc, assignments, {
        entryPath: entry,
        overlayPath: overlayFile,
        inPlace,
    });
    // WRITTEN ONLY WHEN IT HOLDS. A change that contradicts a pinned
    // value is a question the author has to answer at the pinning site;
    // leaving it in the overlay would leave the configuration broken
    // while the exit code says so somewhere they may not be reading.
    const wrote = !dryRun &&
        'invalid' !== report.verdict && 'error' !== report.verdict;
    if (wrote) {
        try {
            (0, node_fs_1.writeFileSync)(overlayFile, report.overlay, 'utf8');
        }
        catch (err) {
            process.stderr.write(`aontu: cannot write ${overlayFile}: ${err.message}\n`);
            return 2;
        }
    }
    if ('json' === format) {
        process.stdout.write((0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'set' },
            appended: report.appended,
            findings: report.findings,
            overlay: report.overlay,
            replaced: report.replaced,
            verdict: report.verdict,
            written: wrote,
        }, 2) + '\n');
    }
    else {
        // A replacement is REPORTED as the edit it is, not left for the
        // reader to infer from a changed file: `where: what -> what`, in
        // source spelling, because the spelling is what changed.
        //
        // PAST TENSE ONLY WHERE IT HAPPENED. A refused write leaves the
        // file exactly as it was, and one assignment can be replaceable
        // while another makes the whole run invalid — so `replaced:` there
        // tells an operator the pin was changed when it was not, and unlike
        // `--dry-run` there is nothing else on the line to say otherwise.
        const verb = wrote ? 'replaced' : 'would replace';
        const edits = report.replaced.map((r) => `${verb}: ${r.file}:${r.row}:${r.col} ${r.from} -> ${r.to}`);
        const head = [`verdict: ${report.verdict}`].concat(edits).join('\n') +
            (wrote ? `\nwrote: ${overlayFile}` : dryRun ? '\n(dry run)' : '');
        // A SUCCESSFUL COMMAND WRITES ITS STATUS TO STDOUT, findings or
        // not. Routing on `findings.length` was right while every finding
        // this verb could produce was an ERROR; `--in-place` made a WARNING
        // possible, and a run that held, wrote the file and exited 0 then
        // sent its whole report to stderr — leaving stdout empty, so
        // `$(aontu set ...)` captured nothing and only the JSON form
        // behaved like a success. The verdict decides the stream; warnings
        // are diagnostics and go to stderr beside it.
        const failed = 'invalid' === report.verdict || 'error' === report.verdict;
        const findingText = report.findings.map(renderFinding);
        if (failed) {
            // A FAILED VERDICT ALWAYS CARRIES A FINDING — the conflict, or
            // the parse error, that made it fail — so the blank separator is
            // unconditional. Guarding it described a report vet cannot
            // produce, and the coverage gate said so.
            process.stderr.write([head, ''].concat(findingText).join('\n') + '\n');
        }
        else {
            process.stdout.write(head + '\n');
            if (0 < findingText.length) {
                process.stderr.write(findingText.join('\n') + '\n');
            }
        }
    }
    return VET_EXIT[report.verdict];
}
// ---------------------------------------------------------------------
// The generated AGENTS.md stanza (G7 phase 6): the prose entrypoint,
// derived from the definition, so it cannot drift from the formal
// source it points at.
const AGENTSMD_HELP = 'aontu agentsmd <file> (try --help)';
function runAgentsMd(argv) {
    const files = [];
    let write;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--write' === arg) {
            write = argv[++i];
            if (null == write) {
                process.stderr.write('aontu: --write needs a file\n');
                return 2;
            }
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown agentsmd option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length) {
        process.stderr.write(`aontu: agentsmd needs one file\n${AGENTSMD_HELP}\n`);
        return 2;
    }
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(files[0], 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, aontu_1.agentsMd)(src, { name: files[0], path: files[0] });
    if (!report.ok) {
        process.stderr.write(report.findings.map(renderFinding).join('\n') + '\n');
        return 4;
    }
    if (null == write) {
        process.stdout.write(report.stanza);
        return 0;
    }
    // An ABSENT target is an empty one: `--write AGENTS.md` should not
    // require the author to have made the file first.
    let existing = '';
    try {
        existing = (0, node_fs_1.readFileSync)(write, 'utf8');
    }
    catch (err) {
        if ('ENOENT' !== err?.code) {
            process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
            return 2;
        }
    }
    try {
        (0, node_fs_1.writeFileSync)(write, (0, agentsmd_1.agentsMdSplice)(existing, report.stanza), 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot write ${write}: ${err.message}\n`);
        return 2;
    }
    process.stdout.write(`wrote: ${write}\n`);
    return 0;
}
// Exit without truncating output.
//
// process.exit() terminates immediately, discarding anything still
// queued on stdout. A write to a PIPE is asynchronous once it exceeds
// the pipe buffer, so `write(big); exit(0)` silently truncated output at
// 65536 bytes — while a write to a TTY or a file, being synchronous,
// looked fine. Setting exitCode instead lets the process end naturally,
// after the queue drains.
//
// This predates the exact leaves but they make it trivially reachable
// (one long biginteger canon exceeds the buffer), and it lands squarely
// on the parity-probe discipline in AGENTS.md, which derives expected
// spec values by piping BOTH CLIs and comparing. A truncated pipe there
// reads as a port divergence.
function finish(code) {
    process.exitCode = code;
}
// Parse a --trust argument value. Returns undefined for an unknown
// spelling, so the caller owns the usage error.
function parseTrustArg(value) {
    if ('system' === value) {
        return { kind: 'system' };
    }
    if ('none' === value) {
        return { kind: 'none' };
    }
    if ('root' === value) {
        return { kind: 'root' };
    }
    if (value.startsWith('root:') && 'root:'.length < value.length) {
        return { kind: 'root', dir: value.slice('root:'.length) };
    }
    return undefined;
}
function main(argv) {
    let mode = 'json';
    // A LIST, though the bare command evaluates exactly one document.
    // It used to be one variable and the last argument won, which made a
    // MISTYPED VERB a silent success: `aontu vet2 schema.aon good.json`
    // printed good.json and exited 0, because `vet2` matched no
    // subcommand, fell through to this loop as a file name, and was
    // overwritten twice. In a tool loop that reads as a passing
    // validation. Counting them is what lets the refusal below happen.
    const files = [];
    let trust = { kind: 'system-warn' };
    // The REPL's SESSION protocol (G7 phase 7): one JSON line per
    // answer, so a harness can drive the session. Named --jsonl rather
    // than the design's --json, which would read as the `:json` output
    // mode the REPL already has.
    let jsonl = false;
    // Subcommand dispatch, and deliberately only for a FIRST argument:
    // `aontu vet` is the verb, while `aontu somefile vet` keeps meaning
    // what it always did. A file named `vet` is still reachable as
    // `aontu ./vet`.
    //
    // Promise.resolve either way: a non-watch run returns its exit class
    // synchronously (and has already written its report), while `--watch`
    // resolves only when the watch ends — so one await-shaped line serves
    // both without a branch to keep covered.
    if ('vet' === argv[2]) {
        return void Promise.resolve(runVet(argv.slice(3))).then(finish);
    }
    if ('subsume' === argv[2]) {
        return finish(runSubsume(argv.slice(3)));
    }
    if ('breaking' === argv[2]) {
        return finish(runBreaking(argv.slice(3)));
    }
    if ('agentsmd' === argv[2]) {
        return finish(runAgentsMd(argv.slice(3)));
    }
    if ('set' === argv[2]) {
        return finish(runSet(argv.slice(3)));
    }
    if ('why' === argv[2]) {
        return finish(runWhy(argv.slice(3)));
    }
    if ('get' === argv[2]) {
        return finish(runGet(argv.slice(3)));
    }
    if ('hash' === argv[2]) {
        return finish(runHash(argv.slice(3)));
    }
    if ('mod' === argv[2]) {
        return finish(runMod(argv.slice(3)));
    }
    if ('relations' === argv[2]) {
        return finish(runRelations(argv.slice(3)));
    }
    if ('trim' === argv[2]) {
        return finish(runTrim(argv.slice(3)));
    }
    const args = argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if ('-c' === arg || '--canon' === arg) {
            mode = 'canon';
        }
        else if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return finish(0);
        }
        else if ('-v' === arg || '--version' === arg) {
            process.stdout.write(version() + '\n');
            return finish(0);
        }
        else if ('--trust' === arg) {
            const parsed = null == args[i + 1] ? undefined : parseTrustArg(args[++i]);
            if (null == parsed) {
                process.stderr.write('aontu: --trust needs system, none, or root[:dir]\n');
                return finish(2);
            }
            trust = parsed;
        }
        else if ('--jsonl' === arg) {
            jsonl = true;
        }
        else if ('--include-root' === arg) {
            const dir = args[++i];
            if (null == dir) {
                process.stderr.write('aontu: --include-root needs a directory\n');
                return finish(2);
            }
            trust = { kind: 'root', dir };
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown option ${arg} (try --help)\n`);
            return finish(2);
        }
        else {
            files.push(arg);
        }
    }
    // ONE DOCUMENT. The bare form has always been `aontu [options]
    // [file]`, singular, and anything past the first was silently
    // discarded rather than refused -- so every way of getting the verb
    // wrong (a typo, a verb this port does not have, a verb spelled for
    // another tool) ended in a plausible answer about the wrong file.
    // Exit 2, the usage class, and the message names the cause rather
    // than the symptom: nothing here can tell a mistyped verb from a
    // second file, but the reader can.
    if (1 < files.length) {
        process.stderr.write(`aontu: the bare command evaluates one document, and ${files.length}` +
            ' were given\naontu: a mistyped verb reads as a file name' +
            ' (try --help)\n');
        return finish(2);
    }
    const file = files[0];
    if (null != file) {
        finish(runFile(file, mode, trust));
    }
    // `--jsonl` overrides the TTY gate: the mode exists to be DRIVEN by
    // a harness over a pipe, so gating it on an interactive terminal
    // made it reachable only through a pty -- which is to say, not
    // reachable by the thing it was built for. Mirrors go/cmd/aontu.
    else if (jsonl || process.stdin.isTTY) {
        runRepl(mode, jsonl);
    }
    else {
        runStdin(mode, trust).then((code) => finish(code));
    }
} /* node:coverage ignore next 13 */
//# sourceMappingURL=cli.js.map