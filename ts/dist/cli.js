"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.vetWaiter = exports.KNOWN_VERBS = void 0;
exports.replCommand = replCommand;
exports.evalSource = evalSource;
exports.main = main;
exports.runVet = runVet;
exports.runSubsume = runSubsume;
exports.runBreaking = runBreaking;
exports.runTrim = runTrim;
exports.runRelations = runRelations;
exports.runReaches = runReaches;
exports.runView = runView;
exports.runJsonSchema = runJsonSchema;
exports.runRender = runRender;
exports.runTemplate = runTemplate;
exports.runMod = runMod;
exports.runHash = runHash;
exports.runGet = runGet;
exports.runHelp = runHelp;
exports.runExplain = runExplain;
exports.runInit = runInit;
exports.nearestVerb = nearestVerb;
exports.looksLikeVerb = looksLikeVerb;
exports.runWhy = runWhy;
exports.renderWhyText = renderWhyText;
exports.runSet = runSet;
exports.runAllow = runAllow;
exports.runAgentsMd = runAgentsMd;
exports.runFmt = runFmt;
exports.watchChange = watchChange;
exports.watchSignature = watchSignature;
exports.deprecatedAt = deprecatedAt;
// Named imports, not `import * as`: the namespace form makes tsc emit the
const query_1 = require("./query");
// __importStar downlevel helper, whose branches no supported Node takes.
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const node_readline_1 = require("node:readline");
const aontu_1 = require("./aontu");
const template_1 = require("./template");
const mcp_1 = require("./mcp");
const report_sarif_1 = require("./report-sarif");
const lsp_server_1 = require("./lsp-server");
const mcp_server_1 = require("./mcp-server");
const jsonschema_1 = require("./jsonschema");
const mod_tool_1 = require("./mod-tool");
const mod_1 = require("./mod");
const vet_1 = require("./vet");
const reach_1 = require("./reach");
const view_1 = require("./view");
const agentsmd_1 = require("./agentsmd");
const format_1 = require("./format");
const utility_1 = require("./utility");
const helpdoc_1 = require("./helpdoc");
const hints_1 = require("./hints");
const keyorder_1 = require("./keyorder");
const HELP = `Usage: aontu [options] [file]
       aontu vet [options] <schema> <data> [more-data...]
       aontu subsume [options] <general> <specific>
       aontu breaking --against <file|git#rev> [options] <file>
       aontu trim --check [options] <file>
       aontu relations [options] <file>
       aontu reaches <from> <to> [--relation <name>] [options] <file>
       aontu view <kind> [options] <file>...
       aontu view --views <path> [--check] [options] <file>
       aontu jsonschema [--at <path>] [--strict] [options] <file>
       aontu render [--at <path>] [--profile <file>]... [--unit <path>]
                    [--stdout | --out <dir> | --check <dir> | --coverage]
                    [--coverage-at <path>] [--strict] <file>
       aontu template [--resugar] [--check] [--marker <token>]
                      [--profile <file>] <file>
       aontu hash [options] <file>
       aontu mod tidy|verify|vendor|manifest [options] [dir]
       aontu get <path> [options] <file>
       aontu why <path> [options] <file>
       aontu set <path>=<value>... --entry <file> --overlay <file>
       aontu allow --role <role> [--at <path>] <roles-file> <path>...
       aontu agentsmd [--write <AGENTS.md>] [--depth <n>] <file>
       aontu fmt [-w|-l|--check|-d|--lint] [--marker <token>]
                 [--profile <file>] <file>...
       aontu help [topic] [--format text|json]
       aontu explain <code> | --list [--format text|json]
       aontu init [dir]
       aontu lsp
       aontu mcp [--root <dir>]

Evaluate an aontu source file and print the result as JSON.
With no file on an interactive terminal, start a REPL.
With no file and piped input, read the source from stdin.

NEW TO THE LANGUAGE? This page documents the TOOL. The documentation
of the LANGUAGE travels inside this binary, and this is how to reach it:

  aontu help              List the topics this binary carries
  aontu help tasks        Which verb does the job you have
  aontu help language     The whole grammar, on one page
  aontu help examples     The ladder, from plain JSON upward
  aontu help codes        What a refusal means
  aontu help grammar      The published ABNF
  aontu explain <code>    What one error code a report carries means
  aontu explain --list    Every registered code with its class

Every one of those answers with no network and no checkout. The
long-form documentation -- the tutorial, the language and API
references, the how-to guides -- is in docs/ of the repository, which
is where to go when the topics above are not enough; the contributor
and agent guide is AGENTS.md beside it.

NOTHING TO EDIT YET? aontu init [dir] writes a working model, an
instance of it, and the four checks to run -- so the first
document is an edit of something that already holds, rather than an
invention. It refuses to overwrite.

The one construct to know before writing anything: &: inside a map is
a TEMPLATE that every key of that map must satisfy. A quoted "*" is a
key named *, not a wildcard, and a schema written that way constrains
nothing while still reporting valid.

The vet verb validates data documents against a schema document and
reports what does not hold, as text or as a machine-readable object.

The subsume verb asks whether every instance the specific document
admits, the general document admits too. The breaking verb runs that
query between a document and its own earlier versions.

Options:
  -c, --canon     Print the canonical form instead of generated JSON
  --format <f>    text (default) or json. The json form wraps the
                  answer as {aontu, findings, ok, out}, so a failure
                  here reads like every other verb's
  -h, --help      Show this help and exit (the verbs and their flags);
                  aontu help is the LANGUAGE, and lists its own topics
  --jsonl         REPL: answer every command as one JSON line
  -v, --version   Print the version and exit
  --trust <t>     Include capability: system (default), none, or
                  root[:dir] to confine @"..." below a directory.
                  Every verb takes it too, and a bare root means the
                  document's own directory
  --include-root <dir>  Shorthand for --trust root:<dir>
  --text-ext <e>  Read these extensions as text too, comma-separated
                  and without dots (md,sql). .txt needs no flag; a
                  named format keeps its meaning, and .js stays
                  refused. Every verb takes it

Mod options:
  --format <f>    text (default) or json
  --against <dir> manifest: a prior version's module tree, to gate on

Mod subcommands:
  tidy      Resolve the module closure by minimum version selection and
            rewrite aontu_meta/mod-lock.aon in canonical form
  verify    Check every locked module still means what the lockfile
            pins, and change nothing (the CI gate; tidy rewrites)
  vendor    Materialise the locked closure into aontu_meta/vendor/
  manifest  Print the OCI artifact a publish would push, gated on the
            breaking check against --against

Vet options:
  --at <path>       Validate against this path of the schema ($.a.b)
  --closed          Refuse keys the anchor does not declare
  --partial         Residue is reported but does not fail the run
  --max-errors <n>  Cap the finding list (default 20)
  --coverage        Report what the check EXAMINED: how many data
                    leaves a schema declaration constrained, the
                    shallowest data paths none did, and the
                    declarations no data met
  --strict-coverage --coverage, and exit 1 when the run was VACUOUS --
                    when no data leaf was constrained at all. The
                    verdict word is unchanged, so nothing that passes
                    today starts failing without this flag
  --coverage-at <p> Measure coverage under this path of the data only
  --format <f>      text (default), json or sarif
  --watch           Re-run whenever a watched file changes

A check that examined NOTHING and a check that passed answer the same
without --coverage. The usual cause is a schema written with the
wildcard other tools use: a quoted "*" is a key NAMED *, not a
template, so it constrains nothing and the run still reports valid.
The template is &: -- see aontu help language.

Vet exit codes:
  0  valid       data unifies, and is concrete (or --partial)
  1  invalid     at least one contradiction, or a vacuous run under
                 --strict-coverage
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
  --at <path>         Compare this path of both versions ($.a.b), so a
                      module's own version string and policy block do
                      not decide the verdict
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

View kinds: doc, lattice, tree, matrix, graph, layer, sets, layers,
ladder, poset (the poset takes several files). The figure goes to stdout, the loss
report to stderr. With --views it draws every figure a document
declares as data, from one evaluation: each declaration names its own
kind and out file, nothing is written unless every figure rendered,
and --check gates the committed set.

View options:
  --as <profile>    text | mermaid | dot | er | svg, per kind: doc,
                    lattice, tree, matrix, sets and layers draw text
                    (default) or svg; graph draws mermaid (default),
                    dot or er; layer draws text (default), mermaid or
                    svg; ladder and poset draw mermaid (default) or dot
  --at <path>       Restrict the figure to nodes under this path; the
                    subtree doc draws; the subtree the lattice counts;
                    the path the ladder draws; where the poset compares
  --views <path>    Draw every figure the document declares at this
                    path, one evaluation, all or nothing; each
                    declaration names its own kind and out file
  -o, --out <file>  Write the figure here instead of stdout
  --check           Exit 1 if --out differs from what would be drawn;
                    nothing is written
  --strict          Exit 1 when the loss report holds anything beyond
                    edges_deduped, inverse_suppressed and crossings
  --depth <n>       doc: how many levels of key to draw (default 3)
  --max-rows <n>    Refuse a figure above this many rows (default 60)
  --style <s>       auto (default), none, ansi or css. A figure's
                    marks carry their meaning -- a direct cell, a
                    closure cell, an upward edge -- and each profile
                    has one way to show it: SGR escapes for text, CSS
                    classes for svg. auto picks that mechanism where
                    the destination can carry it: escapes only on a
                    terminal (NO_COLOR is honoured), and an svg keeps
                    the stylesheet that makes it standalone. none
                    drops both; on svg the classes stay and only the
                    stylesheet goes, for a host page that has already
                    bound --av-ink and its kin. Escapes are never
                    written to a file
  --format <f>      text (default) or json, the whole report
  --relation <n>    tree, matrix, layer: draw over this relation only;
                    graph: keep this predicate (repeatable)
  --root <path>     tree: draw only the subtree under this node;
                    repeatable
  --order <o>       matrix: canon (default) or partition
  --closure         matrix: mark transitively reachable cells +
  --group-by <k>    graph: one subgraph per distinct value of field k;
                    layer: one band per value (required)
  --layers <a,b>    layer: the bands in this order, top first; without
                    it the order is derived from the relation
  --edges <e>       layer: which of the relation's edges to draw over
                    the bands -- upward (the violations, the default
                    for text and svg), all (mermaid's default) or none
  --label <k>       graph: label each node with field k
  --sets <path>     sets: the map whose keys are the sets
  --member <k>      sets: the field holding each set's members
  --universe <p>    sets: the full element domain, so the empty
                    column exists
  --min-degree <n>  sets: drop intersections below this degree
  --min-size <n>    layers: drop intersections below this many paths
  --max-cols <n>    sets, layers: elide columns beyond this many
  --profile <p>     poset: values | defaults (default) | gen

View exit codes: 0 rendered, 1 --check mismatch or lossy under
--strict, 2 usage or --max-rows exceeded, 4 the document does not stand
up on its own, or a relation, root or path that names nothing.

Render options:
  --at <path>       Render the value at this path ($.a.b); the root by
                    default
  --profile <file>  A profile document, aontu: render: Lang: {lang,
                    ...}, vetted against aontu:render; repeatable,
                    one per language
  --unit <path>     Render only the unit with this path
  --stdout          One unit's bytes and nothing else (with --unit when
                    the instance has several)
  --out <dir>       Write every unit below dir, or nothing; never deletes
  --check <dir>     Compare every unit with dir/<path>; drift is listed
  --coverage        Report what the render read and what it did not:
                    model paths no output consumed, and rendered
                    declarations no rule produced. Writes nothing
  --coverage-at <p> Measure coverage under this path only, instead of
                    the document root
  --strict          Refuse the opaque escapes (a text declaration, a raw
                    block)
  --format <f>      text (default) or json, the whole report; json
                    carries the dispatch trace, one entry per emitted
                    piece

Render exit codes: 0 rendered, 1 lossy under --strict or drift under
--check, 2 usage or I/O (a refused unit path included), 4 the document
does not stand up or the instance is not aontu:code.

A render entry file whose extension is not .aon is a TEMPLATE: a
generator in the target's own syntax, whose marker lines carry aontu
and whose other lines are output. It is desugared before it is
evaluated, and a language the table does not know names its marker with
--marker, or declares it once in a profile file that --profile reads.

Template options:
  --resugar       The file is the canonical aontu; print the template
                  form instead of reading one
  --check         Desugar and resugar, and exit 1 if the file is not
                  what the round trip answers
  --marker <t>    The marker, when the extension does not name it
                  (default //-, and #- --- /*- <!--- by extension)
  --profile <f>   A profile file, whose template.ext names the
                  extensions it marks and template.marker the marker

The template verb prints the canonical aontu form of a generator
written in the target's own syntax: a marked line is aontu source, and
every other line is a line of output.

Template exit codes: 0 written, 1 --check drift, 2 usage or I/O.

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

Allow options:
  --role <role>     The role the caller is operating under (required)
  --at <path>       Where the roles map lives in the role model
                    (default $.roles)
  --format <f>      text (default) or json

The allow verb asks a role model whether a role may modify every one
of the given subtrees, and answers before the change is made. The
role model is an aontu document: one entry per role, each carrying
allow (the subtrees it may modify) and optionally deny (the ones it
may not), as path strings starting at $; * in a path matches any one
key. A path is allowed when an allow entry is at or above it, and
refused when a deny entry is at, above or below it, whatever the
order. Every path starts with $, and may be spelled as set's
assignment, <path>=<value>, whose value must be one value: a value
carrying a second pair would write a subtree the gate was not asked
about.

Allow exit codes: 0 allowed (every path), 1 refused (at least one
path, or a role the model does not declare), 2 usage, 4 the role
model does not stand up on its own.

Agentsmd options:
  --write <file>  Splice the stanza into this file between the
                  aontu:begin and aontu:end markers, appending them
                  when they are absent; the rest is left alone
  --depth <n>     How deep the shape line projects (default 2). Two
                  levels name the root keys and say top under them; a
                  caller that wants the fields asks for them

Agentsmd exit codes: 0 generated, 2 usage, 4 the document does not
stand up on its own.

Help options:
  --format <f>    text (default) or json, the topic and its text

The help verb prints the embedded teaching pack: the language, not the
tool. With no topic it lists them. Topics are tasks, language,
examples, codes and grammar; the corpus is generated from docs/skill/
and grammar/aontu.abnf, so it cannot drift from those sources.

Help exit codes: 0 printed, 2 an unknown topic (the topics are listed)
or a bad option.

Explain options:
  --list          Every registered error code with its class
  --format <f>    text (default) or json

The explain verb answers what one error code means, from the same
table the engine attaches to a finding. Every registered code has an
entry, so a code read out of a report always resolves.

Explain exit codes: 0 explained, 2 an unknown code (near matches are
named) or a bad option.

Fmt options:
  -w, --write     Rewrite each file in place, when its form would change
  -l, --list      Print the name of each file whose form would change
  --check         Like --list, and exit 1 when any would: the CI gate
  -d, --diff      Print a unified diff for each file whose form would
                  change
  --lint          Report the style findings, key case and repeated
                  shapes, on standard error, and print nothing else
  --strict        With --lint, and exit 1 when there is a finding
  --marker <t>    The file is a generator, and this is its marker
                  (default //-, and #- --- /*- <!--- by extension)
  --profile <f>   A profile file, whose template.ext names the
                  extensions it marks and template.marker the marker

The fmt verb prints one document in the agreed form; with no file it
reads standard input. Several files need one of the options above.

A file whose extension is not .aon is a GENERATOR, as it is for render:
the aontu its marker lines carry is formatted, the marker stands at the
left margin with the aontu indented after it, and every line of output
is held on a line of its own. A file with no marker line in it is
another language's, and is refused.

Fmt exit codes: 0 formatted or clean, 1 a --check file would change or
a --strict finding, 2 usage, 4 a document does not parse.

The lsp verb runs the language server over standard input and output
(LSP: JSON-RPC with Content-Length framing) until the client exits;
editors launch it with no arguments. The standalone aontu-lsp binary
runs the same server.

The mcp verb runs the Model Context Protocol server over standard
input and output (newline-delimited JSON-RPC), confined below --root
when one is given. It is part of the npm build, as the standalone
aontu-mcp binary is.

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
const EVAL_ANSI = new RegExp('\u001b\\[[0-9;]*m', 'g');
function evalFinding(code, text) {
    return {
        class: (0, hints_1.codeClass)(code),
        code,
        message: text.split('\n')[0].replace(EVAL_ANSI, ''),
        path: '$',
        severity: 'error',
        sites: [],
    };
}
// Evaluate source, returning either the rendered output or the error
// message, and the failure in the finding shape. Never throws.
function evalSource(aontu, src, mode) {
    try {
        const text = 'canon' === mode
            ? aontu.unify(src).canon
            : (0, aontu_1.exactJSON)(aontu.generate(src), 2);
        return { ok: true, text, findings: [] };
    }
    catch (err) {
        const msg = (err instanceof aontu_1.AontuError || true === err?.aontu)
            ? err.message
            : String(err?.message ?? err);
        const errs = 'function' === typeof err?.errs ? err.errs() : [];
        const first = errs[0];
        return {
            ok: false,
            text: msg,
            findings: null == first ? [] : [evalFinding(first.why, msg)],
        };
    }
}
// The bare command's answer, in the form the caller asked for. The
// text form is what it has always printed, on the stream the verdict
// chooses; `--format json` is the same answer as one object, on
// stdout, so a harness reads one stream and one shape either way.
// Mirrors emit in go/cmd/aontu/main.go.
function emitEval(res, format) {
    if ('json' === format) {
        process.stdout.write((0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'eval' },
            findings: res.findings,
            ok: res.ok,
            out: res.ok ? res.text : '',
        }, 2) + '\n');
    }
    else {
        ;
        (res.ok ? process.stdout : process.stderr).write(res.text + '\n');
    }
    return res.ok ? 0 : 1;
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
    const text = 0 === trust.textExt.length ? {} : { textExt: trust.textExt };
    switch (trust.kind) {
        case 'none':
            return { ...text, trust: { include: 'none' } };
        case 'root':
            return { ...text, trust: { include: { root: trust.dir ?? entryRoot } } };
        case 'system':
            return { ...text };
        default: // system-warn: today's default plus the warning window
            return { ...text, trustWarn: makeTrustWarn(), trustWarnRoot: entryRoot };
    }
}
function takeTrust(argv) {
    const rest = [];
    let trust = { kind: 'system-warn', textExt: [] };
    let textExt = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('--trust' === arg) {
            const parsed = null == argv[i + 1] ? undefined : parseTrustArg(argv[++i]);
            if (null == parsed) {
                process.stderr.write('aontu: --trust needs system, none, or root[:dir]\n');
                return undefined;
            }
            trust = parsed;
        }
        else if ('--include-root' === arg) {
            const dir = argv[++i];
            if (null == dir) {
                process.stderr.write('aontu: --include-root needs a directory\n');
                return undefined;
            }
            trust = { kind: 'root', dir, textExt };
        }
        else if ('--text-ext' === arg) {
            const list = null == argv[i + 1] ? undefined : parseTextExt(argv[++i]);
            if (null == list) {
                process.stderr.write('aontu: --text-ext needs extensions, without dots' +
                    ' (--text-ext md,sql)\n');
                return undefined;
            }
            textExt = [...textExt, ...list];
        }
        else {
            rest.push(arg);
        }
    }
    return { argv: rest, trust: { ...trust, textExt } };
}
// `md,sql` or `.md,.sql` -- the dot is accepted and dropped, because a
// reader who has just written `@"notes.txt"` reaches for one. An empty
// element, or anything that is not an extension, is a usage error
// rather than a silently ignored word: a flag that quietly does
// nothing is how a document ends up refused with no reason visible.
function parseTextExt(arg) {
    const out = [];
    for (const raw of arg.split(',')) {
        const ext = raw.trim().replace(/^\./, '').toLowerCase();
        if ('' === ext || !/^[a-z0-9]+$/.test(ext)) {
            return undefined;
        }
        out.push(ext);
    }
    return out;
}
// The evaluator options a REPL session's capability means.
function replTrust(state, entryRoot) {
    return verbOpts(state.trust ?? { kind: 'system-warn', textExt: [] }, entryRoot);
}
// The capability a verb's engine runs under. `system` and the staged
// warning default both mean today's behaviour (no option); the warning
// window itself stays a bare-command nicety, because a verb's report
// is a machine contract and a stderr line is not part of it.
function verbTrust(trust, entryRoot) {
    switch (trust.kind) {
        case 'none':
            return { include: 'none' };
        case 'root':
            return { include: { root: trust.dir ?? entryRoot } };
        default:
            return undefined;
    }
}
// THE INCLUDE OPTIONS A VERB RUNS UNDER, spread into its engine call:
// the capability above, and the extensions `--text-ext` widened. Both
// are absent when unset rather than present-and-undefined, so a verb's
// options bag is byte-identical to what it was before either flag
// existed and no engine sees a key it has to ignore.
function verbOpts(trust, entryRoot) {
    const include = verbTrust(trust, entryRoot);
    return {
        ...(undefined === include ? {} : { trust: include }),
        ...(0 === trust.textExt.length ? {} : { textExt: trust.textExt }),
    };
}
// The directory a bare `--trust root` confines to for a verb: the
// primary document's own, matching the bare command's entry root.
function entryRootOf(file) {
    return null == file ? process.cwd() : (0, node_path_1.dirname)((0, node_path_1.resolve)(file));
}
function runFile(file, mode, format, trust) {
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (err) {
        if (looksLikeVerb(file)) {
            process.stderr.write(`aontu: \`${file}\` is not a file, and not a verb this port knows\n`);
            const near = nearestVerb(file, KNOWN_VERBS);
            if ('' !== near) {
                process.stderr.write(`aontu: did you mean \`aontu ${near}\`?\n`);
            }
            process.stderr.write('aontu: `aontu --help` lists the verbs, `aontu help` the topics\n');
            return 2;
        }
        process.stderr.write(`aontu: cannot read ${file}: ${err.message}\n`);
        return 1;
    }
    const path = (0, node_path_1.resolve)(file);
    const aontu = new aontu_1.Aontu({
        path,
        errfs: { existsSync: node_fs_1.existsSync, readFileSync: node_fs_1.readFileSync },
        ...trustOpts(trust, (0, node_path_1.dirname)(path)),
    });
    return emitEval(evalSource(aontu, src, mode), format);
}
function runStdin(mode, format, trust) {
    return new Promise((resolve) => {
        let src = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (d) => (src += d));
        process.stdin.on('end', () => {
            const res = evalSource(new aontu_1.Aontu(trustOpts(trust, process.cwd())), src, mode);
            resolve(emitEval(res, format));
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
        const res = evalSource(new aontu_1.Aontu(replTrust(state, process.cwd())), s, state.mode);
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
            const res = evalSource(new aontu_1.Aontu({ path: arg, ...replTrust(state, (0, node_path_1.dirname)((0, node_path_1.resolve)(arg))) }), src, state.mode);
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
                const report = (0, aontu_1.why)(src, path, {
                    path: state.name,
                    ...verbOpts(state.trust ?? { kind: 'system-warn', textExt: [] }, entryRootOf(state.name)),
                });
                return report.ok
                    ? answer(renderWhyText(report.record))
                    : refuse(report.findings.map(renderFinding).join('\n'));
            }
            const view = ':keys' === cmd
                ? 'keys' : 'canon' === state.mode ? 'canon' : 'json';
            const report = (0, aontu_1.get)(src, path, {
                view, path: state.name,
                ...verbOpts(state.trust ?? { kind: 'system-warn', textExt: [] }, entryRootOf(state.name)),
            });
            return report.ok
                ? answer(report.out)
                : refuse(report.findings.map(renderFinding).join('\n'));
        }
        default:
            return refuse(`unknown command: ${s} (try :help)`);
    }
}
function runRepl(initialMode, jsonl, trust) {
    let state = { mode: initialMode, jsonl, trust };
    const rl = (0, node_readline_1.createInterface)({
        input: process.stdin,
        output: process.stdout,
        prompt: jsonl ? '' : 'aontu> ',
    });
    if (!jsonl) {
        process.stdout.write(`aontu v${version()} REPL — :help for commands, :quit to exit\n`);
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
        if (!jsonl) {
            process.stdout.write('\n');
        }
        // Same reason as finish(): the REPL requires a TTY stdin, but stdout
        // can still be a pipe (`aontu | cat`), so exiting outright could
        // discard queued output here too.
        process.exitCode = 0;
    });
}
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
    let coverage = false;
    let strictCoverage = false;
    let coverageAt;
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
        else if ('--coverage' === arg) {
            coverage = true;
        }
        else if ('--strict-coverage' === arg) {
            // IMPLIES THE ACCOUNTING, because a gate cannot fire on what was
            // never measured. Asking for the strict form and having to
            // remember `--coverage` beside it is a usage trap with one
            // correct answer, so the flag takes it.
            coverage = true;
            strictCoverage = true;
        }
        else if ('--coverage-at' === arg) {
            coverageAt = argv[++i];
            if (null == coverageAt) {
                return { err: 'aontu: --coverage-at needs a path' };
            }
            coverage = true;
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
            coverage,
            strictCoverage,
            coverageAt,
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
        out.push(`  ${s.role}: ${s.file}:${s.row}:${s.col} (${s.value})`);
    }
    return out.join('\n');
}
function renderVetText(report) {
    const head = `verdict: ${report.verdict}` +
        (report.truncated ? ' (findings truncated)' : '');
    const body = 0 === report.findings.length ? []
        : ['', ...report.findings.map(renderFinding)];
    const cover = null == report.coverage ? []
        : ['', ...renderVetCoverage(report.coverage)];
    return [head, ...body, ...cover].join('\n');
}
// The coverage block (G11 phase 5). VACUOUS FIRST and in the
// imperative, because it is the one line that changes what the reader
// should do: a `valid` verdict above it means nothing.
function renderVetCoverage(c) {
    const out = [];
    if (c.vacuous) {
        out.push('coverage: VACUOUS — no data leaf was constrained' +
            ' by the schema; this run checked nothing');
    }
    out.push(`coverage: ${c.checked}/${c.leaves} data leaves checked,` +
        ` ${c.declared} schema declarations`);
    // The lists are the SHALLOWEST paths, so each names a subtree rather
    // than every leaf under it, and both are capped: a report a reader
    // scrolls past is a report nobody reads.
    for (const [label, paths] of [
        ['unchecked', c.unchecked], ['unused', c.unused],
    ]) {
        if (0 === paths.length) {
            continue;
        }
        const shown = paths.slice(0, COVERAGE_LIST_MAX);
        for (const p of shown) {
            out.push(`  ${label}: ${p}`);
        }
        if (shown.length < paths.length) {
            out.push(`  ${label}: … and ${paths.length - shown.length} more`);
        }
    }
    return out;
}
// How many coverage paths the TEXT form prints per list. The JSON form
// carries every one: a machine reads the whole list, a person reads the
// first few and the count.
const COVERAGE_LIST_MAX = 10;
// The machine-readable form. `aontu` names the producer, so a report
// read from a file or a pipe says which version and which verb made it
// without the consumer having to know.
function renderVetJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'vet' },
        verdict: report.verdict,
        truncated: report.truncated,
        findings: report.findings,
        ...(null == report.coverage ? {} : { coverage: report.coverage }),
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
function vetOnce(args, trust) {
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
    let verdict = 'valid';
    let truncated = false;
    const findings = [];
    let cov;
    // Initialised rather than left undefined: it is filled in the same
    // block that sets `cov`, so a fallback at the read below would be an
    // arm nothing can take. The FIRST file replaces it wholesale, which
    // is what makes the fold an intersection rather than an empty set.
    let unusedEvery = new Set();
    let unusedSeen = false;
    const uncheckedAll = new Set();
    for (const source of sources) {
        const report = (0, aontu_1.vet)(schemaSrc, source.src, {
            ...verbOpts(trust, entryRootOf(args.schema)),
            at: args.at,
            closed: args.closed,
            partial: args.partial,
            maxErrors: args.maxErrors,
            schemaUrl: args.schema,
            dataUrl: source.file,
            schemaPath: args.schema,
            dataPath: source.file,
            coverage: args.coverage,
            coverageAt: args.coverageAt,
        });
        if (VET_RANK[verdict] < VET_RANK[report.verdict]) {
            verdict = report.verdict;
        }
        truncated = truncated || report.truncated;
        findings.push(...report.findings);
        if (null != report.coverage) {
            const c = report.coverage;
            cov = null == cov ? { ...c } : {
                checked: cov.checked + c.checked,
                declared: c.declared,
                leaves: cov.leaves + c.leaves,
                unchecked: [],
                unused: [],
                vacuous: false,
            };
            for (const p of c.unchecked) {
                uncheckedAll.add(p);
            }
            const mine = new Set(c.unused);
            unusedEvery = unusedSeen
                ? new Set([...unusedEvery].filter((u) => mine.has(u))) : mine;
            unusedSeen = true;
        }
        if ('error' === report.verdict) {
            break;
        }
    }
    const cap = args.maxErrors ?? vet_1.VET_MAX_ERRORS;
    const kept = cap < findings.length ? findings.slice(0, cap) : findings;
    if (null != cov) {
        cov.unchecked = [...uncheckedAll].sort(keyorder_1.cmpCodePoint);
        cov.unused = [...unusedEvery].sort(keyorder_1.cmpCodePoint);
        cov.vacuous = 0 === cov.checked && 0 < cov.leaves;
    }
    const report = {
        verdict,
        truncated: truncated || cap < findings.length,
        findings: kept,
        ...(null == cov ? {} : { coverage: cov }),
    };
    const text = 'json' === args.format ? renderVetJson(report) :
        'sarif' === args.format ? renderVetSarif(report) :
            renderVetText(report);
    process.stdout.write(text + '\n');
    if (true === args.strictCoverage && true === report.coverage?.vacuous) {
        process.stderr.write('aontu: no data leaf was constrained by the schema:' +
            ' this run checked nothing\n' +
            'aontu: `aontu help language` — a map template is `&:`,' +
            ' and a quoted "*" is a key named *\n');
        return 1;
    }
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
async function watchVet(args, wait, trust) {
    const files = [args.schema, ...args.data];
    let before = watchSignature(files);
    let code = vetOnce(args, trust);
    while (await wait(files, before)) {
        before = watchSignature(files);
        code = vetOnce(args, trust);
    }
    return code;
}
function runVet(argv, wait) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
        return watchVet(args, wait ?? vetWaiter, trust);
    }
    return vetOnce(args, trust);
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
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
        ...verbOpts(trust, entryRootOf(args.general)),
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
    let at;
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
        else if ('--at' === arg) {
            const a = argv[++i];
            if (null == a) {
                return { err: 'aontu: --at needs a path' };
            }
            at = a;
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
            file: files[0], against, mode, at,
            allowUndecided, allowDeprecatedRemoval, format,
        },
    };
}
const INCLUDABLE = /\.(aon|aontu|jsonic|json)$/;
function oldVersion(spec, file) {
    if (!spec.startsWith('git#')) {
        try {
            return { src: (0, node_fs_1.readFileSync)(spec, 'utf8'), path: spec };
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
    // Lazy import: the dependency exists only when a git spelling is
    // actually used, so plain runs never pay for it.
    const { execFileSync } = require('node:child_process');
    const dir = (0, node_path_1.dirname)((0, node_path_1.resolve)(file));
    const git = (args, cwd) => execFileSync('git', args, {
        cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    // The temporary tree is made BEFORE the first git call, so every
    // failure below has exactly one cleanup path rather than a branch
    // that only some failures take.
    const temp = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'aontu-against-'));
    try {
        const prefix = git(['rev-parse', '--show-prefix'], dir).trim();
        const entryRel = prefix + (0, node_path_1.basename)(file);
        const top = git(['rev-parse', '--show-toplevel'], dir).trim();
        const listed = git(['ls-tree', '-r', '-z', '--name-only', rev], top)
            .split('\0').filter((p) => '' !== p);
        if (!listed.includes(entryRel)) {
            throw new Error(`${entryRel} is not in that revision`);
        }
        for (const rel of listed) {
            if (!INCLUDABLE.test(rel)) {
                continue;
            }
            const dest = (0, node_path_1.join)(temp, ...rel.split('/'));
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(dest), { recursive: true });
            (0, node_fs_1.writeFileSync)(dest, git(['show', `${rev}:${rel}`], top));
        }
        const entry = (0, node_path_1.join)(temp, ...entryRel.split('/'));
        return { src: (0, node_fs_1.readFileSync)(entry, 'utf8'), path: entry, temp };
    }
    catch (err) {
        (0, node_fs_1.rmSync)(temp, { recursive: true, force: true });
        const detail = String(err.stderr ?? err.message).trim().split('\n')[0];
        process.stderr.write(`aontu: cannot resolve ${spec}: ${detail}\n`);
        return undefined;
    }
}
// The document's own compatibility declaration: `$.aontu_policy.compat`,
// a disjunction whose default is the declared mode. Undefined when the
// key is absent or does not spell a mode.
function policyCompat(newSrc, path, include) {
    const aontu = new aontu_1.Aontu();
    const ctx = aontu.ctx({ collect: true });
    const v = aontu.unify(newSrc, { path, ...(0, utility_1.includeOpts)(include) }, ctx);
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
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
    const mode = args.mode ??
        policyCompat(newSrc, args.file, verbOpts(trust, entryRootOf(args.file))) ??
        'backward';
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
    // Temporary trees materialised for `git#<rev>` spellings, removed
    // once every check that reads them has run.
    const temps = [];
    const sweep = () => {
        for (const t of temps) {
            (0, node_fs_1.rmSync)(t, { recursive: true, force: true });
        }
    };
    try {
        for (const spec of args.against) {
            const old = oldVersion(spec, args.file);
            if (null == old) {
                return 2;
            }
            const oldSrc = old.src;
            if (null != old.temp) {
                temps.push(old.temp);
            }
            const checks = [];
            if ('backward' === mode || 'full' === mode) {
                checks.push({ general: [newSrc, args.file], specific: [oldSrc, spec] });
            }
            if ('forward' === mode || 'full' === mode) {
                checks.push({ general: [oldSrc, spec], specific: [newSrc, args.file] });
            }
            const oldPath = old.path;
            for (const check of checks) {
                const report = (0, aontu_1.subsume)(check.general[0], check.specific[0], {
                    ...verbOpts(trust, entryRootOf(args.file)),
                    at: args.at,
                    generalUrl: check.general[1],
                    specificUrl: check.specific[1],
                    generalPath: check.general[1] === spec ? oldPath : args.file,
                    specificPath: check.specific[1] === spec ? oldPath : args.file,
                });
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
    }
    finally {
        sweep();
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
const TRIM_HELP = 'aontu trim --check <file> (try --help)';
const TRIM_EXIT = {
    clean: 0,
    redundant: 1,
    error: 4,
};
function runTrim(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
    const report = (0, aontu_1.trimCheck)(src, {
        path: files[0], ...verbOpts(trust, entryRootOf(files[0])),
    });
    const text = 'json' === format
        ? renderTrimJson(report)
        : renderTrimText(report);
    process.stdout.write(text + '\n');
    return TRIM_EXIT[report.verdict];
}
function renderTrimText(report) {
    const head = `verdict: ${report.verdict}`;
    const errors = report.errors ?? [];
    if (0 < errors.length) {
        return [head, ''].concat(errors.map(renderFinding)).join('\n');
    }
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
        ...(null == report.errors ? {} : { errors: report.errors }),
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
const REACHES_HELP = 'aontu reaches <from> <to> [--relation <name>] <file> (try --help)';
// Same three-way shape every check verb here uses: the check held (0),
// the check failed (1), the document could not be checked (4). An
// unreachable pair is a FAILED CHECK and not an error: the question was
// answered, and the answer was no.
const REACHES_EXIT = {
    reaches: 0,
    unreachable: 1,
    error: 4,
};
const VIEW_HELP = 'aontu view <kind> [options] <file>... (try --help)';
const VIEW_KINDS = ['doc', 'lattice', 'tree', 'matrix', 'graph', 'layer', 'sets', 'layers',
    'ladder', 'poset'];
const VIEW_PROFILES = ['text', 'mermaid', 'dot', 'er', 'svg'];
const VIEW_EDGES = ['upward', 'all', 'none'];
// The styles the CLI accepts (VIEWS.0.md, "7. Styling"). `auto` is
// here and NOT in ViewStyle: resolving it means knowing whether stdout
// is a terminal, which is the CLI's to know and the library's never --
// the same division err.ts already draws for the error frames.
const VIEW_STYLES = ['auto', 'none', 'ansi', 'css'];
function viewStyleOf(asked, as) {
    if (undefined !== asked && 'auto' !== asked) {
        return asked;
    }
    const no = process.env.NO_COLOR;
    return 'text' === as && true === process.stdout.isTTY
        && (null == no || '' === no) ? 'ansi' : undefined;
}
// The figure was drawn (0, `lossy` included: the loss report says
// what it could not draw, and --strict is the gate on that), or the
// document could not be drawn (4). An EMPTY figure is a drawing, not
// a failure: a model with no links has nothing to draw, honestly.
const VIEW_EXIT = {
    rendered: 0,
    lossy: 0,
    error: 4,
};
// The refusals that are USAGE, not the document's fault: exit 2, as
// every other verb's usage errors do.
const VIEW_USAGE_CODES = [
    'view_kind_unknown', 'view_profile_unknown', 'view_rows_exceeded',
    'view_at_required', 'view_sets_required', 'view_group_required',
    'view_document_shape', 'view_style_profile', 'view_style_unknown',
];
const MOD_HELP = 'aontu mod tidy|verify|vendor|manifest [dir] (try --help)';
function runMod(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
            'does not ship; vendor the module by hand and run ' +
            "'aontu mod tidy'\n");
        return 2;
    }
    if (!MOD_SUBS.includes(sub) || 2 < rest.length) {
        process.stderr.write(`aontu: mod needs tidy, verify, vendor or manifest\n${MOD_HELP}\n`);
        return 2;
    }
    if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'aon_vendor')) || (0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'mod-lock.aon'))) {
        process.stderr.write('aontu: aon_vendor/ and mod-lock.aon now live under aontu_meta/: ' +
            'move them, or run aontu mod tidy and aontu mod vendor\n');
    }
    // `--against` gates a manifest and means nothing to the other two;
    // accepting it there would say it had been honoured.
    if (null != against && 'manifest' !== sub) {
        process.stderr.write('aontu: --against is a manifest option\n');
        return 2;
    }
    const modopts = modToolOptions(trust, (0, node_path_1.resolve)(dir));
    const report = 'tidy' === sub ? (0, mod_tool_1.modTidy)(dir, modopts) :
        'verify' === sub ? (0, mod_tool_1.modVerify)(dir, modopts) :
            'vendor' === sub ? (0, mod_tool_1.modVendor)(dir, modopts) :
                (0, mod_tool_1.modManifest)(dir, modopts, against);
    process.stdout.write(('json' === format ?
        (0, aontu_1.exactJSON)({ aontu: { version: version(), verb: 'mod ' + sub }, ...report }, 2) :
        modText(sub, report)) + '\n');
    return MOD_EXIT[report.verdict];
}
const MOD_SUBS = ['tidy', 'verify', 'vendor', 'manifest'];
const MOD_EXIT = {
    ok: 0,
    missing: 1,
    mismatch: 1,
    // Likewise a lockfile that does not cover the project: the gate has
    // nothing to check, which is a refusal and not a pass.
    unlocked: 1,
    breaking: 1,
    undecided: 3,
    error: 4,
};
// The tooling's evaluator: the same standalone evaluation the module
// resolver verifies with (ts/src/mod.ts), and for the same reason —
// only the engine can say what a module MEANS.
function modToolOptions(trust, entryRoot) {
    const opts = verbOpts(trust, entryRoot);
    // The user cache lives outside any confinement root, so a confined
    // run reads the vendor tree only -- as the evaluator's own module
    // leg already does when a root is set.
    const rooted = null != opts.trust?.include?.root;
    return {
        ...(rooted ? {} : { cache: (0, mod_1.modCacheDir)() }),
        eval: (src, path) => {
            const a0 = new aontu_1.Aontu(opts);
            const ctx = a0.ctx({ collect: true });
            const val = a0.unify(src, { path }, ctx);
            return {
                gen: val.gen(a0.ctx({ collect: true })),
                hash: (0, aontu_1.canonHash)(val),
                canon: val.canon,
                // The same question `aontu hash` asks before it will answer:
                // did this document stand up ON ITS OWN? See ModToolEval.
                ok: 0 === ctx.err.length && true !== val.isNil,
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
        for (const miss of report.missing) {
            lines.push(miss + ': missing');
        }
        return lines.join('\n');
    }
    if ('verify' === sub) {
        for (const mod of report.verified) {
            lines.push(mod + ': verified');
        }
        for (const m of report.mismatched) {
            lines.push(m.mod + ': pinned ' + m.want + ' but the store means ' +
                ('' === m.got ? 'nothing (it does not evaluate)' : m.got));
        }
        // NOT a fetch: the module may well be sitting in the store. What
        // is absent is the PIN, and only a tidy writes one.
        for (const mod of report.unlocked) {
            lines.push(mod + ': not in the lockfile (run: aontu mod tidy)');
        }
        for (const miss of report.missing) {
            lines.push(miss + ': not fetched (run: aontu mod get)');
        }
        return lines.join('\n');
    }
    const done = 'tidy' === sub ? report.lock : report.vendored;
    for (const item of done) {
        lines.push('tidy' === sub ?
            item.mod + ' ' + item.v + ' ' + item.canon : '' + item);
    }
    // A module that is PRESENT but does not stand up. Named separately
    // from a missing one because the repair is different: a fetch cannot
    // help, the module itself has to be fixed (or its own dependencies
    // vendored beside it). Before the missing tail, as the Go port's
    // shared renderer orders them.
    for (const bad of report.unevaluable ?? []) {
        lines.push(bad + ': does not evaluate on its own; nothing to pin');
    }
    for (const miss of report.missing) {
        lines.push(miss + ': not fetched (run: aontu mod get)');
    }
    return lines.join('\n');
}
function vacuous(what, why) {
    process.stderr.write(`aontu: ${what}: ${why}\n`);
}
function runRelations(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
    const report = (0, aontu_1.relationCheck)(src, {
        path: files[0], count: true,
        ...verbOpts(trust, entryRootOf(files[0])),
    });
    const text = 'json' === format
        ? renderRelationsJson(report)
        : renderRelationsText(report);
    process.stdout.write(text + '\n');
    // `pass` over NO declarations is the vacuous case, and the engine
    // knows it exactly: `_reldecls` is empty. The count is asked for
    // here rather than derived, so the answer costs no second
    // evaluation.
    if (0 === report.declared) {
        vacuous('this document declares no relations', '`pass` means nothing was checked, not that the graph is sound');
    }
    return RELATIONS_EXIT[report.verdict];
}
function runReaches(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const rest = [];
    let format = 'text';
    let relation = undefined;
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
        else if ('--relation' === arg) {
            relation = argv[++i];
            if (null == relation) {
                process.stderr.write('aontu: --relation needs a name\n');
                return 2;
            }
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown reaches option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            rest.push(arg);
        }
    }
    if (3 !== rest.length) {
        process.stderr.write(`aontu: reaches needs two node paths and one file\n${REACHES_HELP}\n`);
        return 2;
    }
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(rest[2], 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, reach_1.reachCheck)(src, rest[0], rest[1], {
        path: rest[2], relation,
        ...verbOpts(trust, entryRootOf(rest[2])),
    });
    const text = 'json' === format
        ? renderReachesJson(report)
        : renderReachesText(report, rest[0], rest[1]);
    process.stdout.write(text + '\n');
    return REACHES_EXIT[report.verdict];
}
function renderReachesText(report, from, to) {
    const head = `verdict: ${report.verdict}`;
    const errors = report.errors ?? [];
    if (0 < errors.length) {
        return [head, ''].concat(errors.map(renderFinding)).join('\n');
    }
    // THE PATH IS THE ANSWER, not decoration: "yes" is worth little to an
    // operator asking what a failure would take out, and the chain is
    // what they act on.
    return 'reaches' === report.verdict
        ? [head, '', report.path.join(' -> ')].join('\n')
        : [head, '', `${from} does not reach ${to}`].join('\n');
}
function renderReachesJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'reaches' },
        verdict: report.verdict,
        ...(null == report.path ? {} : { path: report.path }),
        ...(null == report.errors ? {} : { errors: report.errors }),
    }, 2);
}
// ---------------------------------------------------------------------
// The tree view (docs/design/VIEWS.0.md, ts/src/view.ts): the drawn
// edge set, as text a golden diff can check.
function runView(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const rest = [];
    let format = 'text';
    let out = undefined;
    let check = false;
    let strict = false;
    const relations = [];
    const roots = [];
    const opts = {};
    // The style ASKED FOR, which may be `auto` -- a word ViewStyle does
    // not have, because resolving it is the CLI's job.
    let style = undefined;
    // A flag that takes a value, read into `opts` by name.
    const valued = {
        '--as': 'as', '--at': 'at', '--order': 'order', '--group-by': 'groupBy',
        '--label': 'label', '--sets': 'sets', '--member': 'member',
        '--universe': 'universe', '--profile': 'profile', '--views': 'views',
        '--edges': 'edges',
    };
    const counted = {
        '--max-rows': 'maxRows', '--max-cols': 'maxCols',
        '--min-degree': 'minDegree', '--min-size': 'minSize',
        '--depth': 'depth',
    };
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
        else if ('--relation' === arg) {
            const relation = argv[++i];
            if (null == relation || '' === relation) {
                process.stderr.write('aontu: --relation needs a name\n');
                return 2;
            }
            relations.push(relation);
        }
        else if ('--root' === arg) {
            const root = argv[++i];
            if (null == root) {
                process.stderr.write('aontu: --root needs a node path\n');
                return 2;
            }
            roots.push(root);
        }
        else if ('-o' === arg || '--out' === arg) {
            out = argv[++i];
            if (null == out) {
                process.stderr.write('aontu: --out needs a file\n');
                return 2;
            }
        }
        else if ('--style' === arg) {
            style = argv[++i];
            if (null == style || !VIEW_STYLES.includes(style)) {
                process.stderr.write(`aontu: --style needs one of ${VIEW_STYLES.join(', ')}\n`);
                return 2;
            }
        }
        else if ('--check' === arg) {
            check = true;
        }
        else if ('--strict' === arg) {
            strict = true;
        }
        else if ('--closure' === arg) {
            opts.closure = true;
        }
        else if ('--layers' === arg) {
            const v = argv[++i];
            if (null == v || '' === v) {
                process.stderr.write('aontu: --layers needs a comma-separated list\n');
                return 2;
            }
            opts.layers = v.split(',');
        }
        else if (undefined !== valued[arg]) {
            const v = argv[++i];
            if (null == v || '' === v) {
                process.stderr.write(`aontu: ${arg} needs a value\n`);
                return 2;
            }
            opts[valued[arg]] = v;
        }
        else if (undefined !== counted[arg]) {
            const v = argv[++i];
            if (null == v || !/^[0-9]+$/.test(v)) {
                process.stderr.write(`aontu: ${arg} needs a count\n`);
                return 2;
            }
            opts[counted[arg]] = parseInt(v, 10);
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown view option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            rest.push(arg);
        }
    }
    if ('ansi' === style && (undefined !== out || undefined !== opts.views)) {
        process.stderr.write('aontu: --style ansi writes to a terminal, not to a file\n');
        return 2;
    }
    // THE VIEW DOCUMENT draws every figure a document declares, so it
    // names no kind: the declarations do, one each.
    if (undefined !== opts.views) {
        opts.style = viewStyleOf(style, undefined);
        return runViewSet(rest, opts, trust, { format, check, strict, out });
    }
    if (2 > rest.length) {
        process.stderr.write(`aontu: view needs a kind and a file\n${VIEW_HELP}\n`);
        return 2;
    }
    const kind = rest[0];
    if (!VIEW_KINDS.includes(kind)) {
        process.stderr.write(`aontu: unknown view kind ${kind} (the kinds are: ${VIEW_KINDS.join(', ')})\n`);
        return 2;
    }
    if (undefined !== opts.as && !VIEW_PROFILES.includes(opts.as)) {
        process.stderr.write(`aontu: --as needs one of ${VIEW_PROFILES.join(', ')}\n`);
        return 2;
    }
    if (undefined !== opts.order && 'canon' !== opts.order && 'partition' !== opts.order) {
        process.stderr.write('aontu: --order needs canon or partition\n');
        return 2;
    }
    if (undefined !== opts.edges && !VIEW_EDGES.includes(opts.edges)) {
        process.stderr.write(`aontu: --edges needs one of ${VIEW_EDGES.join(', ')}\n`);
        return 2;
    }
    if (undefined !== opts.profile && !['values', 'defaults', 'gen'].includes(opts.profile)) {
        process.stderr.write('aontu: --profile needs values, defaults or gen\n');
        return 2;
    }
    if ('poset' !== kind && 2 !== rest.length) {
        process.stderr.write(`aontu: view ${kind} takes one file\n`);
        return 2;
    }
    if ('graph' === kind) {
        opts.relations = relations;
    }
    else if (1 < relations.length) {
        process.stderr.write(`aontu: view ${kind} takes one --relation\n`);
        return 2;
    }
    else {
        opts.relation = relations[0];
    }
    if (check && undefined === out) {
        process.stderr.write('aontu: --check needs --out\n');
        return 2;
    }
    const files = rest.slice(1);
    const srcs = [];
    for (const file of files) {
        try {
            srcs.push((0, node_fs_1.readFileSync)(file, 'utf8'));
        }
        catch (err) {
            process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
            return 2;
        }
    }
    const viewOpts = {
        ...opts,
        style: viewStyleOf(style, opts.as ?? (0, view_1.viewDefaultProfile)(kind)),
        kind,
        path: files[0],
        roots,
        ...verbOpts(trust, entryRootOf(files[0])),
        docs: files.slice(1).map((path, i) => ({ src: srcs[i + 1], path })),
    };
    const report = (0, view_1.view)(srcs[0], viewOpts);
    if ('error' !== report.verdict && null != report.text) {
        const bare = (0, view_1.view)('{}', viewOpts);
        if ('error' !== bare.verdict && bare.text === report.text) {
            vacuous('nothing to draw', 'this figure is what the same view draws for an empty document' +
                ' — the model declares nothing this kind can show');
        }
    }
    if ('json' === format) {
        process.stdout.write(renderViewJson(report) + '\n');
    }
    else if ('error' === report.verdict) {
        process.stderr.write(report.errors.map(renderFinding).join('\n') + '\n');
    }
    else {
        // THE FIGURE AND NOTHING ELSE on stdout (or in the file): stdout is
        // what a golden diff reads, and a verdict line would be part of
        // every drawing. The loss report goes to stderr, so a figure
        // written to a file still tells the reader what it could not draw.
        const text = report.text + '\n';
        if (undefined === out) {
            process.stdout.write(text);
        }
        else if (check) {
            let have = undefined;
            try {
                have = (0, node_fs_1.readFileSync)(out, 'utf8');
            }
            catch (_err) {
                // Absent is a mismatch.
            }
            if (have !== text) {
                process.stderr.write(`aontu: ${out} differs from the ${kind} figure\n`);
                return 1;
            }
        }
        else {
            (0, node_fs_1.writeFileSync)(out, text, 'utf8');
        }
        if (0 < report.loss.length) {
            process.stderr.write(renderViewLoss(report.loss) + '\n');
        }
    }
    if ('error' === report.verdict) {
        const code = report.errors[0]?.code;
        return VIEW_USAGE_CODES.includes(code) ? 2 : VIEW_EXIT.error;
    }
    return strict && 'lossy' === report.verdict ? 1 : VIEW_EXIT[report.verdict];
}
function runViewSet(rest, opts, trust, how) {
    if (1 !== rest.length) {
        process.stderr.write('aontu: view --views takes one file\n');
        return 2;
    }
    if (undefined !== how.out) {
        process.stderr.write('aontu: --out is per figure in a view document; each declares its own\n');
        return 2;
    }
    const file = rest[0];
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, view_1.viewSet)(src, {
        ...opts, path: file, ...verbOpts(trust, entryRootOf(file)),
    });
    if ('json' === how.format) {
        process.stdout.write(renderViewSetJson(report) + '\n');
    }
    else if (undefined !== report.errors) {
        process.stderr.write(report.errors.map(renderFinding).join('\n') + '\n');
    }
    else {
        for (const fig of report.views) {
            if (undefined !== fig.errors) {
                process.stderr.write(`${fig.name} (${fig.kind}):\n` +
                    fig.errors.map(renderFinding).join('\n') + '\n');
            }
            else if (0 < fig.loss.length) {
                process.stderr.write(renderViewLoss(fig.loss)
                    .split('\n').map((l) => `${fig.name}  ${l}`).join('\n') + '\n');
            }
        }
    }
    if ('error' === report.verdict) {
        return setExit(report);
    }
    // EVERY FIGURE RENDERED, so the whole set is written -- or, under
    // --check, the whole set is compared and every difference named.
    const dir = (0, node_path_1.dirname)((0, node_path_1.resolve)(file));
    let differ = 0;
    for (const fig of report.views) {
        const path = (0, node_path_1.resolve)(dir, fig.out);
        const text = fig.text + '\n';
        if (how.check) {
            let have = undefined;
            try {
                have = (0, node_fs_1.readFileSync)(path, 'utf8');
            }
            catch (_err) {
                // Absent is a mismatch.
            }
            if (have !== text) {
                differ++;
                process.stderr.write(`aontu: ${fig.out} differs from the ${fig.name} figure\n`);
            }
        }
        else {
            try {
                (0, node_fs_1.writeFileSync)(path, text, 'utf8');
            }
            catch (err) {
                process.stderr.write(`aontu: cannot write ${err.path}: ${err.message}\n`);
                return 2;
            }
            if ('json' !== how.format) {
                process.stderr.write(`wrote ${fig.out}  ${fig.name} (${fig.kind})\n`);
            }
        }
    }
    if (0 < differ) {
        return 1;
    }
    return how.strict && 'lossy' === report.verdict ? 1 : VIEW_EXIT[report.verdict];
}
// A set's exit code is the worst of its figures': a usage refusal
// anywhere is usage, and any other refusal is the document's fault.
function setExit(report) {
    const codes = [
        ...(report.errors ?? []),
        ...report.views.flatMap((v) => v.errors ?? []),
    ].map((e) => e.code);
    return codes.some((c) => VIEW_USAGE_CODES.includes(c))
        ? 2 : VIEW_EXIT.error;
}
function renderViewSetJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'view' },
        verdict: report.verdict,
        views: report.views.map((v) => ({
            name: v.name,
            kind: v.kind,
            out: v.out,
            verdict: v.verdict,
            ...(null == v.text ? {} : { text: v.text }),
            loss: v.loss,
            ...(null == v.errors ? {} : { errors: v.errors }),
        })),
        ...(null == report.errors ? {} : { errors: report.errors }),
    }, 2);
}
// One line per code: the code, the count, and the detail if any.
function renderViewLoss(loss) {
    return loss.map((l) => `${l.code}  ${l.count}` +
        (undefined === l.detail ? '' : '  ' + l.detail.join(' '))).join('\n');
}
function renderViewJson(report) {
    return (0, aontu_1.exactJSON)({
        aontu: { version: version(), verb: 'view' },
        kind: report.kind,
        verdict: report.verdict,
        ...(null == report.text ? {} : { text: report.text }),
        loss: report.loss,
        ...(null == report.errors ? {} : { errors: report.errors }),
    }, 2);
}
function renderRelationsText(report) {
    const head = `verdict: ${report.verdict}`;
    const errors = report.errors ?? [];
    if (0 < errors.length) {
        return [head, ''].concat(errors.map(renderFinding)).join('\n');
    }
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
        ...(null == report.errors ? {} : { errors: report.errors }),
    }, 2);
}
const JSONSCHEMA_HELP = 'aontu jsonschema [--at <path>] [--strict] <file> (try --help)';
function runJsonSchema(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const files = [];
    let format = 'text';
    let at = undefined;
    let strict = false;
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
        else if ('--at' === arg) {
            at = argv[++i];
            if (null == at) {
                process.stderr.write('aontu: --at needs a path\n');
                return 2;
            }
        }
        else if ('--strict' === arg) {
            strict = true;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown jsonschema option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length) {
        process.stderr.write(`aontu: jsonschema needs one file\n${JSONSCHEMA_HELP}\n`);
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
    const report = (0, jsonschema_1.jsonSchema)(src, {
        at, path: files[0], ...verbOpts(trust, entryRootOf(files[0])),
    });
    if ('json' === format) {
        process.stdout.write((0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'jsonschema' },
            verdict: report.verdict,
            schema: report.schema,
            lossy: report.lossy,
            ...(null == report.errors ? {} : { errors: report.errors }),
        }, 2) + '\n');
    }
    else if ('error' === report.verdict) {
        // Not `?? []`: every `error` return in jsonSchema() sets `errors`,
        // so the list is the reason for the refusal rather than a maybe,
        // exactly as Go's `r.Errors` is on this arm.
        process.stderr.write(report.errors.map(renderFinding).join('\n') + '\n');
    }
    else {
        process.stdout.write((0, aontu_1.exactJSON)(report.schema, 2) + '\n');
        for (const l of report.lossy) {
            process.stderr.write(`lossy: ${l.path} ${l.construct}: ${l.reason}\n`);
        }
    }
    return 'error' === report.verdict ? 4 :
        strict && 'lossy' === report.verdict ? 1 : 0;
}
const RENDER_HELP = 'aontu render [--at <path>] [--profile <file>]... [--unit <path>] ' +
    '[--stdout | --out <dir> | --check <dir> | --coverage] ' +
    '[--coverage-at <path>] [--strict] [--marker <token>] <file> (try --help)';
function runRender(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const files = [];
    const profileFiles = [];
    let format = 'text';
    let at = undefined;
    let unit = undefined;
    let out = undefined;
    let check = undefined;
    let toStdout = false;
    let strict = false;
    let coverage = false;
    let coverageAt = undefined;
    let marker = undefined;
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
        else if ('--at' === arg) {
            at = argv[++i];
            if (null == at) {
                process.stderr.write('aontu: --at needs a path\n');
                return 2;
            }
        }
        else if ('--unit' === arg) {
            unit = argv[++i];
            if (null == unit) {
                process.stderr.write('aontu: --unit needs a unit path\n');
                return 2;
            }
        }
        else if ('--profile' === arg) {
            const pf = argv[++i];
            if (null == pf) {
                process.stderr.write('aontu: --profile needs a file\n');
                return 2;
            }
            profileFiles.push(pf);
        }
        else if ('--out' === arg) {
            out = argv[++i];
            if (null == out) {
                process.stderr.write('aontu: --out needs a directory\n');
                return 2;
            }
        }
        else if ('--check' === arg) {
            check = argv[++i];
            if (null == check) {
                process.stderr.write('aontu: --check needs a directory\n');
                return 2;
            }
        }
        else if ('--stdout' === arg) {
            toStdout = true;
        }
        else if ('--coverage' === arg) {
            coverage = true;
        }
        else if ('--marker' === arg) {
            marker = argv[++i];
            if (null == marker) {
                process.stderr.write('aontu: --marker needs a token\n');
                return 2;
            }
        }
        else if ('--coverage-at' === arg) {
            coverageAt = argv[++i];
            if (null == coverageAt) {
                process.stderr.write('aontu: --coverage-at needs a path\n');
                return 2;
            }
        }
        else if ('--strict' === arg) {
            strict = true;
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown render option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length) {
        process.stderr.write(`aontu: render needs one file\n${RENDER_HELP}\n`);
        return 2;
    }
    const modes = [toStdout, undefined !== out, undefined !== check, coverage]
        .filter((on) => on).length;
    if (1 < modes) {
        process.stderr.write('aontu: render takes one of --stdout, --out, --check or --coverage\n');
        return 2;
    }
    // A NARROWER MEASURE NEEDS SOMETHING TO NARROW. `--coverage-at`
    // without `--coverage` asks for a report the run does not compute,
    // and answering silently would be the wrong half of the request.
    if (undefined !== coverageAt && !coverage) {
        process.stderr.write('aontu: --coverage-at needs --coverage\n');
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
    const loadedProfiles = loadProfiles(profileFiles, trust);
    if ('number' === typeof loadedProfiles) {
        return loadedProfiles;
    }
    const profiles = loadedProfiles;
    if (!files[0].endsWith('.aon')) {
        src = (0, template_1.desugarTemplate)(src, marker ??
            (0, template_1.markerFromProfiles)(profiles, files[0]) ?? (0, template_1.markerFor)(files[0]));
    }
    // A RENDER WITH NO PROFILE PRODUCES NO UNITS, and said so with zero
    // bytes and exit 0. The profile is what maps a model onto a
    // language, so without one there is nothing for the renderer to
    // write -- which is a usable answer only if the caller is told.
    const noProfiles = 0 === profiles.length;
    const report = (0, aontu_1.render)(src, {
        at, unit, strict, profiles, path: files[0],
        coverage, coverageAt,
        // THE JSON REPORT CARRIES THE TRACE (D9), which is what the shape
        // there has always said; a text run computes it only when the
        // coverage report needs it.
        trace: 'json' === format,
        ...verbOpts(trust, entryRootOf(files[0])),
    });
    // Said once, whatever the format: stdout stays the report.
    if ('error' !== report.verdict && 0 === report.units.length) {
        vacuous('nothing was rendered', noProfiles
            ? 'no profile was given, and the document declares none' +
                ' (see aontu help tasks)'
            : 'the document produced no units under this profile');
    }
    if ('json' === format) {
        process.stdout.write((0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'render' },
            verdict: report.verdict,
            units: report.units,
            lossy: report.lossy,
            ...(null == report.errors ? {} : { errors: report.errors }),
            ...(null == report.trace ? {} : { trace: report.trace }),
            ...(null == report.coverage ? {} : { coverage: report.coverage }),
        }, 2) + '\n');
        return renderExit(report, 0);
    }
    if ('error' === report.verdict) {
        process.stderr.write(report.errors.map(renderFinding).join('\n') + '\n');
        return renderExit(report, 0);
    }
    let drift = 0;
    if (toStdout) {
        // ONE UNIT'S BYTES AND NOTHING ELSE, so the output can be piped
        // into a formatter or a file.
        if (1 !== report.units.length) {
            process.stderr.write('aontu: --stdout needs exactly one unit, and the instance has ' +
                `${report.units.length}; --unit names one\n`);
            return 2;
        }
        process.stdout.write(report.units[0].text);
    }
    else if (undefined !== out) {
        // EVERY UNIT BELOW <dir>, OR NOTHING: every unit rendered first
        // (the report above), and no file touched unless all did. The
        // directory is realpath-confined; a unit path is already a relative
        // descent (render_path refuses the rest), and the check here is
        // against the symlink inside it. render never deletes.
        for (const u of report.units) {
            if ((0, mcp_1.outsideRoot)(out, (0, node_path_1.resolve)(out, u.path))) {
                process.stderr.write(`aontu: ${u.path} escapes ${out}\n`);
                return 2;
            }
        }
        for (const u of report.units) {
            const full = (0, node_path_1.resolve)(out, u.path);
            try {
                (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(full), { recursive: true });
                (0, node_fs_1.writeFileSync)(full, u.text, 'utf8');
            }
            catch (err) {
                process.stderr.write(`aontu: cannot write ${u.path}: ${err.message}\n`);
                return 2;
            }
            process.stderr.write(`wrote ${u.path}\n`);
        }
    }
    else if (undefined !== check) {
        // RENDER AND COMPARE: a unit whose bytes differ from the file at
        // <dir>/<path>, or whose file is absent, is drift, listed by path.
        // The CI form.
        for (const u of report.units) {
            let have = undefined;
            try {
                have = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(check, u.path), 'utf8');
            }
            catch {
                // Absent is drift, reported below.
            }
            if (undefined === have) {
                drift++;
                process.stderr.write(`aontu: ${u.path} is missing from ${check}\n`);
            }
            else if (have !== u.text) {
                drift++;
                process.stderr.write(`aontu: ${u.path} differs from the rendered unit\n`);
            }
        }
    }
    else if (coverage) {
        // THE COVERAGE REPORT (P7), one line per finding and a count at
        // the end: dead model first, then the declarations no rule
        // produced. A clean report is the count line alone.
        const cov = report.coverage;
        for (const d of cov.dead) {
            process.stdout.write(`dead: ${d}\n`);
        }
        for (const u of cov.unruled) {
            process.stdout.write(`unruled: ${u.unit} ${u.path}\n`);
        }
        process.stdout.write(`coverage: ${cov.read.length} path(s) read, ${cov.dead.length} ` +
            `no output consumed, ${cov.unruled.length} declaration(s) ` +
            'no rule produced\n');
    }
    else {
        // THE SUMMARY: one line per unit -- its path, its language and its
        // size -- since several units have no one text to print.
        for (const u of report.units) {
            process.stdout.write(`${u.path}\t${u.lang}\t${u.text.length} bytes\n`);
        }
    }
    for (const l of report.lossy) {
        process.stderr.write(`lossy: ${l.unit} ${l.path} tier ${l.tier} ${l.construct}: ${l.reason}\n`);
    }
    return renderExit(report, drift);
}
// D8's exit table over a report: a refused unit path is usage (2), a
// strict refusal is lossy (1), any other error is the document's (4);
// drift under --check is 1.
function renderExit(report, drift) {
    if ('error' === report.verdict) {
        const errors = report.errors;
        if (errors.every((f) => 'render_path' === f.code)) {
            return 2;
        }
        if (errors.every((f) => 'render_strict' === f.code)) {
            return 1;
        }
        return 4;
    }
    return 0 < drift ? 1 : 0;
}
const TEMPLATE_HELP = 'aontu template [--resugar] [--check] [--marker <token>] <file> (try --help)';
function runTemplate(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const files = [];
    let resugar = false;
    let check = false;
    let marker = undefined;
    const profileFiles = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        else if ('--resugar' === arg) {
            resugar = true;
        }
        else if ('--check' === arg) {
            check = true;
        }
        else if ('--marker' === arg) {
            marker = argv[++i];
            if (null == marker) {
                process.stderr.write('aontu: --marker needs a token\n');
                return 2;
            }
        }
        else if ('--profile' === arg) {
            const pf = argv[++i];
            if (null == pf) {
                process.stderr.write('aontu: --profile needs a file\n');
                return 2;
            }
            profileFiles.push(pf);
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown template option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (1 !== files.length) {
        process.stderr.write(`aontu: template needs one file\n${TEMPLATE_HELP}\n`);
        return 2;
    }
    if (resugar && check) {
        process.stderr.write('aontu: template takes one of --resugar or --check\n');
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
    const declared = loadProfiles(profileFiles, trust);
    if ('number' === typeof declared) {
        return declared;
    }
    const mark = marker ?? (0, template_1.markerFromProfiles)(declared, files[0]) ??
        (0, template_1.markerFor)(files[0]);
    if (check) {
        const back = (0, template_1.resugarTemplate)((0, template_1.desugarTemplate)(src, mark), mark);
        if (back === src) {
            return 0;
        }
        const want = back.split('\n');
        const have = src.split('\n');
        let n = 0;
        while (n < want.length && n < have.length && want[n] === have[n]) {
            n++;
        }
        process.stderr.write(`aontu: ${files[0]}:${n + 1} is not what the round trip answers\n` +
            `  have: ${JSON.stringify(have[n])}\n` +
            `  want: ${JSON.stringify(want[n])}\n`);
        return 1;
    }
    process.stdout.write(resugar ?
        (0, template_1.resugarTemplate)(src, mark) : (0, template_1.desugarTemplate)(src, mark));
    return 0;
}
// The profiles named by --profile, vetted, or the exit code that says
// why not. A profile is a language declared as data: `render` matches
// one to a unit by `lang`, and `template` and `fmt` match one to a file
// by the extensions its `template.ext` names.
function loadProfiles(profileFiles, trust) {
    const profiles = [];
    const langs = new Map();
    for (const pf of profileFiles) {
        let text;
        try {
            text = (0, node_fs_1.readFileSync)(pf, 'utf8');
        }
        catch (err) {
            process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
            return 2;
        }
        const loaded = (0, aontu_1.renderProfile)(text, { path: (0, node_path_1.resolve)(pf), ...verbOpts(trust, entryRootOf(pf)) });
        if (undefined !== loaded.errors) {
            process.stderr.write(loaded.errors.map(renderFinding).join('\n') + '\n');
            return 4;
        }
        const profile = loaded.profile;
        const prev = langs.get(profile.lang);
        if (undefined !== prev) {
            process.stderr.write(`aontu: two profiles claim ${profile.lang}: ${prev} and ${pf}\n`);
            return 2;
        }
        langs.set(profile.lang, pf);
        profiles.push(profile);
    }
    return profiles;
}
const HASH_HELP = 'aontu hash <file> (try --help)';
function runHash(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
    const aontu = new aontu_1.Aontu(verbOpts(trust, entryRootOf(files[0])));
    const ctx = aontu.ctx({ collect: true });
    const v = aontu.unify(src, { path: files[0] }, ctx);
    if (0 < ctx.err.length || true === v?.isNil) {
        process.stderr.write(`aontu: ${files[0]} does not evaluate on its own; nothing to hash\n` +
            renderFinding((0, query_1.evalFailure)(ctx)) + '\n');
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
const GET_HELP = 'aontu get <path> <file> (try --help)';
function runGet(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
    const report = (0, aontu_1.get)(src, path, {
        view, depth, path: file, ...verbOpts(trust, entryRootOf(file)),
    });
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
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
    const report = (0, aontu_1.why)(src, path, {
        path: file, ...verbOpts(trust, entryRootOf(file)),
    });
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
const SET_HELP = 'aontu set <path>=<value> --entry <file> --overlay <file> (try --help)';
function runSet(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
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
        ...verbOpts(trust, entryRootOf(entry)),
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
        const verb = wrote ? 'replaced' : 'would replace';
        const edits = report.replaced.map((r) => `${verb}: ${r.file}:${r.row}:${r.col} ${r.from} -> ${r.to}`);
        const head = [`verdict: ${report.verdict}`].concat(edits).join('\n') +
            (wrote ? `\nwrote: ${overlayFile}` : dryRun ? '\n(dry run)' : '');
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
const ALLOW_HELP = 'aontu allow --role <role> <roles-file> <path> [more-paths...] (try --help)';
const ALLOW_EXIT = {
    allowed: 0,
    refused: 1,
    error: 4,
};
// One line per asked path: the answer, and the entry that gave it, as
// a path into the role model so `aontu why` can locate the rule.
function renderAllowDecision(d, role) {
    const head = `${d.path}: ${d.allowed ? 'allowed' : 'refused'}`;
    switch (d.reason) {
        case 'allow':
        case 'deny':
            return `${head} by ${d.by} (${d.pattern})`;
        case 'uncovered':
            return `${head} (no allow entry of ${role} covers it)`;
        default:
            return `${head} (role ${role} is not declared)`;
    }
}
function renderAllowText(report) {
    const lines = [`verdict: ${report.verdict}`, `role: ${report.role}`]
        .concat(report.paths.map((d) => renderAllowDecision(d, report.role)));
    if (0 === report.findings.length) {
        return lines.join('\n');
    }
    return lines.concat('', report.findings.map(renderFinding)).join('\n');
}
// Does the text after `=` parse as exactly one value? Parsed, never
// evaluated, with loads denied: the question is the shape of the
// argument, and reading a file to answer it would be the write the
// gate exists to precede.
function oneValue(value) {
    try {
        const probe = new aontu_1.Aontu({ trust: { include: 'none' } })
            .parse('v: ' + value);
        return 1 === Object.keys(probe.peg).length;
    }
    catch {
        return false;
    }
}
function runAllow(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const rest = [];
    let role;
    let at;
    let format = 'text';
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('--role' === arg) {
            role = argv[++i];
            if (null == role) {
                process.stderr.write('aontu: --role needs a role name\n');
                return 2;
            }
        }
        else if ('--at' === arg) {
            at = argv[++i];
            if (null == at) {
                process.stderr.write('aontu: --at needs a path\n');
                return 2;
            }
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
            process.stderr.write(`aontu: unknown allow option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            rest.push(arg);
        }
    }
    if (null == role || rest.length < 2) {
        process.stderr.write(`aontu: allow needs --role, a role model and at least one path\n` +
            `${ALLOW_HELP}\n`);
        return 2;
    }
    const [file, ...asked] = rest;
    // A role is ONE KEY of the roles map. A dotted name would be read as
    // a path by `why` when it follows the entry the report names, and an
    // empty one names the map itself.
    if ('' === role || role.includes('.')) {
        process.stderr.write('aontu: --role needs one key, without dots\n');
        return 2;
    }
    const paths = [];
    for (const arg of asked) {
        const eq = arg.indexOf('=');
        const path = eq < 0 ? arg : arg.slice(0, eq);
        if (!path.startsWith('$')) {
            process.stderr.write(`aontu: a path starts with $ (got ${JSON.stringify(arg)})\n`);
            return 2;
        }
        if (0 <= eq && !oneValue(arg.slice(eq + 1))) {
            process.stderr.write(`aontu: the value of ${path} is not one value\n`);
            return 2;
        }
        paths.push(path);
    }
    let src;
    try {
        src = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (err) {
        process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
        return 2;
    }
    const report = (0, aontu_1.allow)(src, role, paths, {
        at, path: file, ...verbOpts(trust, entryRootOf(file)),
    });
    const text = 'json' === format ?
        (0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'allow' },
            findings: report.findings,
            paths: report.paths,
            role: report.role,
            verdict: report.verdict,
        }, 2) :
        renderAllowText(report);
    // The report IS the answer, refused or not, so it goes to stdout as
    // vet's does; the exit code carries the verdict for a caller that
    // reads nothing else.
    process.stdout.write(text + '\n');
    return ALLOW_EXIT[report.verdict];
}
// ---------------------------------------------------------------------
// The generated AGENTS.md stanza (G7 phase 6): the prose entrypoint,
// derived from the definition, so it cannot drift from the formal
// source it points at.
const AGENTSMD_HELP = 'aontu agentsmd <file> (try --help)';
function runAgentsMd(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const files = [];
    let write;
    // The SHAPE's depth (G11 phase 7). Default 2, unchanged: the stanza
    // is spliced into a file people read, and a deeper shape is a
    // question the caller asks rather than one it is handed.
    let depth = 2;
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
        else if ('--depth' === arg) {
            const n = Number(argv[++i]);
            if (!Number.isInteger(n) || n < 1) {
                process.stderr.write('aontu: --depth needs a positive integer\n');
                return 2;
            }
            depth = n;
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
    const report = (0, aontu_1.agentsMd)(src, {
        depth, name: files[0], path: files[0],
        ...verbOpts(trust, entryRootOf(files[0])),
    });
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
const FMT_HELP = 'aontu fmt [-w|-l|--check|-d|--lint] [--marker <token>] ' +
    '[--profile <file>] <file>... (try --help)';
function runFmt(argv) {
    const trusted = takeTrust(argv);
    if (null == trusted) {
        return 2;
    }
    argv = trusted.argv;
    const trust = trusted.trust;
    const files = [];
    const profileFiles = [];
    let marker = undefined;
    const flags = {
        write: false, list: false, check: false, diff: false, lint: false, strict: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if ('-w' === arg || '--write' === arg) {
            flags.write = true;
        }
        else if ('-l' === arg || '--list' === arg) {
            flags.list = true;
        }
        else if ('--check' === arg) {
            flags.check = true;
        }
        else if ('-d' === arg || '--diff' === arg) {
            flags.diff = true;
        }
        else if ('--lint' === arg) {
            flags.lint = true;
        }
        else if ('--strict' === arg) {
            flags.lint = true;
            flags.strict = true;
        }
        else if ('--marker' === arg) {
            // THE MARKER SAYS THE FILE IS A GENERATOR, whatever its
            // extension: `render` and `template` take the same option for
            // the same reason, a language the table has never seen.
            marker = argv[++i];
            if (null == marker) {
                process.stderr.write('aontu: --marker needs a token\n');
                return 2;
            }
        }
        else if ('--profile' === arg) {
            const pf = argv[++i];
            if (null == pf) {
                process.stderr.write('aontu: --profile needs a file\n');
                return 2;
            }
            profileFiles.push(pf);
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown fmt option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            files.push(arg);
        }
    }
    if (0 === files.length) {
        // Standard input: formatted onto standard output, or listed,
        // checked and diffed under the name <stdin>. It cannot be written
        // back.
        if (flags.write) {
            process.stderr.write(`aontu: --write needs a file\n${FMT_HELP}\n`);
            return 2;
        }
        return new Promise((resolve) => {
            let src = '';
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', (d) => (src += d));
            process.stdin.on('end', () => resolve(fmtOne('<stdin>', src, flags, marker)));
        });
    }
    const declared = loadProfiles(profileFiles, trust);
    if ('number' === typeof declared) {
        return declared;
    }
    // Several files onto standard output would be one stream nobody can
    // split again (the note's X-6): the verb refuses unless an option
    // says what to do with each.
    if (1 < files.length && !fmtQuiet(flags)) {
        process.stderr.write(`aontu: fmt prints one file; with ${files.length}, say --write, ` +
            `--list, --check, --diff or --lint\n${FMT_HELP}\n`);
        return 2;
    }
    let worst = 0;
    for (const file of files) {
        let src;
        try {
            src = (0, node_fs_1.readFileSync)(file, 'utf8');
        }
        catch (err) {
            process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`);
            return 2;
        }
        const mark = fmtMarker(file, src, marker ?? (0, template_1.markerFromProfiles)(declared, file));
        if (false === mark) {
            process.stderr.write(`aontu: ${file} is not aontu source (.aon, .aontu) and carries no ` +
                `${(0, template_1.markerFor)(file)} marker line, so there is no aontu in it to ` +
                'format; --marker names the marker for a language the table ' +
                'does not know, and --profile reads one that declares it\n');
            return 2;
        }
        worst = Math.max(worst, fmtOne(file, src, flags, mark));
    }
    return worst;
}
function fmtMarker(file, src, marker) {
    if (undefined !== marker) {
        return marker;
    }
    if (/[.](aon|aontu)$/.test(file)) {
        return undefined;
    }
    const mark = (0, template_1.markerFor)(file);
    return (0, template_1.templateOutputs)(src, mark).some((out) => !out) ? mark : false;
}
// An option that says what to do with a file, in place of printing
// it: what to do when its form would change, or the lint.
function fmtQuiet(flags) {
    return flags.write || flags.list || flags.check || flags.diff || flags.lint;
}
// One document: 0 printed, clean or done; 1 a --check that would
// change, or a --strict finding; 2 a file that cannot be written; 4 a
// document that does not format, with the finding that says why. The
// style findings go to standard error, one line each, in the shape
// every linter prints: `file:line:col: rule: message`.
function fmtOne(name, src, flags, marker) {
    const report = (0, format_1.format)(src, { path: name, lint: flags.lint, template: marker });
    if ('error' === report.verdict) {
        process.stderr.write(`aontu: ${name} was not formatted\n` +
            report.errors.map(renderFinding).join('\n') + '\n');
        return 4;
    }
    for (const f of report.findings) {
        process.stderr.write(`${name}:${f.line}:${f.col}: ${f.rule}: ${f.message}\n`);
    }
    const strict = flags.strict && 0 < report.findings.length ? 1 : 0;
    if (!fmtQuiet(flags)) {
        process.stdout.write(report.text);
        return 0;
    }
    if (!report.changed) {
        return strict;
    }
    if (flags.list || flags.check) {
        process.stdout.write(name + '\n');
    }
    if (flags.diff) {
        process.stdout.write((0, format_1.unifiedDiff)(name, src, report.text));
    }
    if (flags.write) {
        try {
            (0, node_fs_1.writeFileSync)(name, report.text);
        }
        catch (err) {
            process.stderr.write(`aontu: cannot write ${name}: ${err.message}\n`);
            return 2;
        }
    }
    return flags.check ? 1 : strict;
}
// Excluded: the real pair takes the process stdio, so ts/test/cli.test.ts
// drives each server through a child process instead.
/* node:coverage ignore next 4 */
const SERVERS = {
    lsp: () => void (0, lsp_server_1.main)(),
    mcp: (argv) => void (0, mcp_server_1.main)(undefined, undefined, undefined, undefined, argv),
};
// undefined: the server took the process; a number: an answer the CLI
// gives itself, --help or a usage error.
function runLsp(argv, servers) {
    for (const arg of argv) {
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        process.stderr.write(`aontu: lsp takes no arguments (try --help)\n`);
        return 2;
    }
    servers.lsp();
    return undefined;
}
function finish(code) {
    process.exitCode = code;
}
// Parse a --trust argument value. Returns undefined for an unknown
// spelling, so the caller owns the usage error.
function parseTrustArg(value) {
    if ('system' === value) {
        return { kind: 'system', textExt: [] };
    }
    if ('none' === value) {
        return { kind: 'none', textExt: [] };
    }
    if ('root' === value) {
        return { kind: 'root', textExt: [] };
    }
    if (value.startsWith('root:') && 'root:'.length < value.length) {
        return { kind: 'root', dir: value.slice('root:'.length), textExt: [] };
    }
    return undefined;
}
const HELP_VERB_HELP = 'aontu help [topic] (try `aontu help` for the topics)';
const EXPLAIN_HELP = 'aontu explain <code> (try `aontu explain --list`)';
function helpIndexText(index) {
    const width = index.reduce((w, t) => Math.max(w, t.topic.length), 0);
    return 'aontu help <topic> — the language, offline.\n\n' +
        index.map((t) => '  ' + t.topic.padEnd(width) + '  ' + t.summary).join('\n') +
        '\n\n' +
        '`aontu --help` documents the verbs, their flags and their exit\n' +
        'codes. `aontu explain <code>` explains one error code.\n' +
        'Start at `aontu help tasks` if you know the job but not the verb.';
}
function runHelp(argv) {
    let format = 'text';
    const topics = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
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
            process.stderr.write(`aontu: unknown help option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            topics.push(arg);
        }
    }
    if (1 < topics.length) {
        process.stderr.write(`aontu: help takes one topic\n${HELP_VERB_HELP}\n`);
        return 2;
    }
    if (0 === topics.length) {
        process.stdout.write(('json' === format
            ? (0, aontu_1.exactJSON)({
                aontu: { version: version(), verb: 'help' },
                topics: helpdoc_1.HELPDOC.map((t) => ({ topic: t.topic, summary: t.summary, source: t.source })),
            }, 2)
            : helpIndexText(helpdoc_1.HELPDOC)) + '\n');
        return 0;
    }
    const found = helpdoc_1.HELPDOC.find((t) => topics[0] === t.topic);
    if (null != found) {
        if ('json' === format) {
            process.stdout.write((0, aontu_1.exactJSON)({
                aontu: { version: version(), verb: 'help' },
                topic: found.topic,
                summary: found.summary,
                source: found.source,
                text: found.text,
            }, 2) + '\n');
            return 0;
        }
        process.stdout.write(found.text);
        return 0;
    }
    // AN UNKNOWN TOPIC IS A USAGE ERROR AND NAMES THE ALTERNATIVES,
    // because the caller who typed it has no other way to find out what
    // exists -- that is the whole condition this verb was added for.
    process.stderr.write(`aontu: no help topic \`${topics[0]}\`\n` +
        `aontu: topics are ${helpdoc_1.HELPDOC.map((t) => t.topic).join(', ')}\n`);
    return 2;
}
// The dynamic prefixes a generated code extends (`func:upper`,
// `op[+]`). Mirrors CODE_PREFIXES in ts/src/hints.ts, which is not
// exported; a code that extends one is registered through its prefix
// and carries that prefix's hint.
const EXPLAIN_PREFIXES = ['func:', 'op:', 'op[', 'var[', 'ref['];
function explainCode(code) {
    const cls = (0, hints_1.codeClass)(code);
    let hint = hints_1.hints[code] ?? '';
    let registered = null != hints_1.codeClasses[code];
    if (!registered) {
        for (const prefix of EXPLAIN_PREFIXES) {
            if (code.startsWith(prefix)) {
                // No guard on `hint` here: every hint key is also a registry
                // key (the spec suite asserts codeClasses set-equal with
                // test/spec/errcodes.tsv, and hints is a subset of it), so a
                // code that reaches this loop is unregistered and therefore
                // has no hint of its own.
                registered = true;
                hint = hints_1.hints[prefix] ?? '';
                break;
            }
        }
    }
    return { cls, hint, registered };
}
// Every code in the shared registry, sorted by code point so both
// ports list them in the same order.
function explainCodes() {
    return Object.keys(hints_1.codeClasses).sort(keyorder_1.cmpCodePoint);
}
function explainListText(format) {
    const codes = explainCodes();
    if ('json' === format) {
        return (0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'explain' },
            codes: codes.map((code) => ({
                code,
                class: (0, hints_1.codeClass)(code),
                // Whether this port carries explanation text for the code. The
                // registry is in parity; the hint tables are not, so a consumer
                // that wants only explained codes can filter rather than guess.
                explained: '' !== explainCode(code).hint,
            })),
        }, 2);
    }
    const width = codes.reduce((w, c) => Math.max(w, c.length), 0);
    return codes.map((c) => c.padEnd(width) + '  ' + (0, hints_1.codeClass)(c) +
        ('' === explainCode(c).hint ? '  (no text)' : '')).join('\n');
}
function runExplain(argv) {
    let format = 'text';
    let list = false;
    const codes = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        else if ('--list' === arg) {
            list = true;
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
            process.stderr.write(`aontu: unknown explain option ${arg} (try --help)\n`);
            return 2;
        }
        else {
            codes.push(arg);
        }
    }
    if (list) {
        if (0 < codes.length) {
            process.stderr.write(`aontu: --list takes no code\n${EXPLAIN_HELP}\n`);
            return 2;
        }
        process.stdout.write(explainListText(format) + '\n');
        return 0;
    }
    if (1 !== codes.length) {
        process.stderr.write(`aontu: explain needs one code\n${EXPLAIN_HELP}\n`);
        return 2;
    }
    const code = codes[0];
    const { cls, hint, registered } = explainCode(code);
    if (!registered) {
        // AN UNKNOWN CODE IS A USAGE ERROR AND NAMES NEAR MATCHES. A
        // caller reading a code out of a report has almost certainly typed
        // it correctly, so the likely cause is a code from another tool or
        // a truncated one, and the near matches say which.
        process.stderr.write(`aontu: no such error code \`${code}\`\n`);
        const near = nearestVerb(code, explainCodes());
        if ('' !== near) {
            process.stderr.write(`aontu: did you mean \`${near}\`?\n`);
        }
        process.stderr.write('aontu: `aontu explain --list` lists every registered code\n');
        return 2;
    }
    if ('json' === format) {
        process.stdout.write((0, aontu_1.exactJSON)({
            aontu: { version: version(), verb: 'explain' },
            code,
            class: cls,
            hint,
        }, 2) + '\n');
        return 0;
    }
    // A REGISTERED CODE WITH NO HINT SAYS SO rather than printing an
    // empty block, which would read as an explanation that happened to
    // be blank.
    const body = '' === hint
        ? '(no explanation text is registered for this code)'
        : hint;
    process.stdout.write(`code:  ${code}\nclass: ${cls}\n\n${body}\n`);
    return 0;
}
const INIT_HELP = 'aontu init [dir] (try --help)';
function runInit(argv) {
    const dirs = [];
    for (const arg of argv) {
        if ('-h' === arg || '--help' === arg) {
            process.stdout.write(HELP);
            return 0;
        }
        if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown init option ${arg} (try --help)\n`);
            return 2;
        }
        dirs.push(arg);
    }
    if (1 < dirs.length) {
        process.stderr.write(`aontu: init takes one directory\n${INIT_HELP}\n`);
        return 2;
    }
    const dir = dirs[0] ?? '.';
    const standing = helpdoc_1.INITDOC.filter((f) => (0, node_fs_1.existsSync)((0, node_path_1.join)(dir, f.name)));
    if (0 < standing.length) {
        process.stderr.write(`aontu: ${dir} already holds ${standing.map((f) => f.name).join(', ')}\n` +
            'aontu: init never overwrites; move them aside or name an' +
            ' empty directory\n');
        return 2;
    }
    try {
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        for (const f of helpdoc_1.INITDOC) {
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, f.name), f.text, { mode: f.mode });
        }
    }
    catch (err) {
        process.stderr.write(`aontu: cannot write in ${dir}: ${err.message}\n`);
        return 2;
    }
    process.stdout.write(helpdoc_1.INITDOC.map((f) => (0, node_path_1.join)(dir, f.name)).join('\n') + '\n' +
        '\nA model, an instance of it, and the four questions to ask.\n' +
        'Run the checks:  sh ' + (0, node_path_1.join)(dir, 'check.sh') + '\n' +
        'Learn the language:  aontu help language\n');
    return 0;
}
const KNOWN_VERBS = [
    'agentsmd', 'allow', 'breaking', 'explain', 'fmt', 'get', 'hash',
    'help', 'init', 'jsonschema', 'lsp', 'mcp', 'mod', 'reaches',
    'relations', 'render', 'set', 'subsume', 'template', 'trim', 'vet',
    'view', 'why',
];
exports.KNOWN_VERBS = KNOWN_VERBS;
// looksLikeVerb reports whether an unreadable argument was meant as a
// verb rather than as a path. A bare word has no separator and no
// extension; `./help`, `help.aon`, `/tmp/help` and `sub/dir` are paths
// and keep the file diagnosis. Mirrors go/cmd/aontu/main.go.
function looksLikeVerb(arg) {
    return '' !== arg &&
        !/[/\\.]/.test(arg) &&
        !arg.startsWith('-');
}
function nearestVerb(word, verbs) {
    let best = '';
    let bestDist = Infinity;
    const limit = Math.min(3, 1 + Math.floor(word.length / 4));
    for (const v of [...verbs].sort(keyorder_1.cmpCodePoint)) {
        const d = editDistance(word.toLowerCase(), v);
        if (d < bestDist) {
            best = v;
            bestDist = d;
        }
    }
    return bestDist > limit ? '' : best;
}
function editDistance(a, b) {
    const ar = [...a];
    const br = [...b];
    let prev2 = new Array(br.length + 1).fill(0);
    let prev = new Array(br.length + 1).fill(0).map((_, j) => j);
    let cur = new Array(br.length + 1).fill(0);
    for (let i = 1; i <= ar.length; i++) {
        cur[0] = i;
        for (let j = 1; j <= br.length; j++) {
            const cost = ar[i - 1] === br[j - 1] ? 0 : 1;
            let m = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (1 < i && 1 < j &&
                ar[i - 1] === br[j - 2] && ar[i - 2] === br[j - 1] &&
                prev2[j - 2] + 1 < m) {
                m = prev2[j - 2] + 1;
            }
            cur[j] = m;
        }
        prev2 = [...prev];
        prev = [...cur];
    }
    return prev[br.length];
}
function main(argv, servers = SERVERS) {
    (0, aontu_1.setColor)(true === process.stderr.isTTY ? undefined : false);
    let mode = 'json';
    // THE REPORT FORM (G11 phase 7), default text: every existing caller
    // reads exactly what it always read, and a caller that asks for json
    // gets the failure in the finding shape every other verb reports.
    let format = 'text';
    const files = [];
    let trust = { kind: 'system-warn', textExt: [] };
    let textExt = [];
    // The REPL's SESSION protocol (G7 phase 7): one JSON line per
    // answer, so a harness can drive the session. Named --jsonl rather
    // than the design's --json, which would read as the `:json` output
    // mode the REPL already has.
    let jsonl = false;
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
    if ('fmt' === argv[2]) {
        return void Promise.resolve(runFmt(argv.slice(3))).then(finish);
    }
    if ('lsp' === argv[2]) {
        const code = runLsp(argv.slice(3), servers);
        return undefined === code ? undefined : finish(code);
    }
    if ('mcp' === argv[2]) {
        return servers.mcp(argv.slice(3));
    }
    if ('set' === argv[2]) {
        return finish(runSet(argv.slice(3)));
    }
    if ('allow' === argv[2]) {
        return finish(runAllow(argv.slice(3)));
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
    // G11 phases 1 and 3. Dispatched with the rest, so `aontu ./help`
    // still reads a file named help exactly as `aontu ./vet` does.
    if ('help' === argv[2]) {
        return finish(runHelp(argv.slice(3)));
    }
    if ('explain' === argv[2]) {
        return finish(runExplain(argv.slice(3)));
    }
    if ('init' === argv[2]) {
        return finish(runInit(argv.slice(3)));
    }
    if ('mod' === argv[2]) {
        return finish(runMod(argv.slice(3)));
    }
    if ('relations' === argv[2]) {
        return finish(runRelations(argv.slice(3)));
    }
    if ('jsonschema' === argv[2]) {
        return finish(runJsonSchema(argv.slice(3)));
    }
    if ('render' === argv[2]) {
        return finish(runRender(argv.slice(3)));
    }
    if ('template' === argv[2]) {
        return finish(runTemplate(argv.slice(3)));
    }
    if ('reaches' === argv[2]) {
        return finish(runReaches(argv.slice(3)));
    }
    if ('view' === argv[2]) {
        return finish(runView(argv.slice(3)));
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
        else if ('--format' === arg) {
            const f = args[++i];
            if ('text' !== f && 'json' !== f) {
                process.stderr.write('aontu: --format needs text or json\n');
                return finish(2);
            }
            format = f;
        }
        else if ('--jsonl' === arg) {
            jsonl = true;
            // A JSONL answer is machine-read by definition, even when the
            // session happens to be attached to a terminal, so this is a
            // harder gate than the stderr test above rather than a repeat of
            // it: escapes inside the answer string are noise the harness has
            // to strip before it can compare anything.
            (0, aontu_1.setColor)(false);
        }
        else if ('--include-root' === arg) {
            const dir = args[++i];
            if (null == dir) {
                process.stderr.write('aontu: --include-root needs a directory\n');
                return finish(2);
            }
            trust = { kind: 'root', dir, textExt };
        }
        else if ('--text-ext' === arg) {
            const list = null == args[i + 1] ? undefined : parseTextExt(args[++i]);
            if (null == list) {
                process.stderr.write('aontu: --text-ext needs extensions, without dots' +
                    ' (--text-ext md,sql)\n');
                return finish(2);
            }
            textExt = [...textExt, ...list];
        }
        else if (arg.startsWith('-')) {
            process.stderr.write(`aontu: unknown option ${arg} (try --help)\n`);
            return finish(2);
        }
        else {
            files.push(arg);
        }
    }
    if (1 < files.length) {
        process.stderr.write(`aontu: the bare command evaluates one document, and ${files.length}` +
            ' were given\naontu: a mistyped verb reads as a file name' +
            ' (try --help)\n');
        return finish(2);
    }
    trust = { ...trust, textExt };
    const file = files[0];
    if (null != file) {
        finish(runFile(file, mode, format, trust));
    }
    // `--jsonl` overrides the TTY gate: the mode exists to be DRIVEN by
    // a harness over a pipe, so gating it on an interactive terminal
    // made it reachable only through a pty -- which is to say, not
    // reachable by the thing it was built for. Mirrors go/cmd/aontu.
    else if (jsonl || process.stdin.isTTY) {
        runRepl(mode, jsonl, trust);
    }
    else {
        runStdin(mode, format, trust).then((code) => finish(code));
    }
} /* node:coverage ignore next 20 */
//# sourceMappingURL=cli.js.map