/* Copyright (c) 2025 Richard Rodger, MIT License */

// Command-line interface for Aontu.
//
//   aontu [options] [file]
//
// With a file argument, the file is evaluated and the result printed.
// With no file on an interactive terminal, a REPL is started. With no
// file and piped input, the source is read from stdin. See HELP below.

// Named imports, not `import * as`: the namespace form makes tsc emit the
import { evalFailure } from './query'
// __importStar downlevel helper, whose branches no supported Node takes.
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'

import {
  Aontu, AontuError, setColor,
  exactJSON, vet, subsume, trimCheck, relationCheck,
  hcanon, canonHash,
  get, why, patch, agentsMd,
} from './aontu'
import { sarifReport } from './report-sarif'
import { jsonSchema } from './jsonschema'
import { modTidy, modVerify, modVendor, modManifest } from './mod-tool'
import type {
  ModTidyReport, ModVerifyReport, ModVendorReport, ModManifestReport,
} from './mod-tool'
import { modCacheDir } from './mod'
import { VET_MAX_ERRORS } from './vet'
import type { VetReport, VetFinding, VetVerdict } from './vet'
import type {
  SubsumeReport, SubsumeVerdict, SubsumeProfile,
} from './subsume'
import type { TrimReport, TrimVerdict } from './trim'
import type { RelationReport, RelationVerdict } from './relation'
import { reachCheck } from './reach'
import type { ReachReport, ReachVerdict } from './reach'
import { view, viewSet } from './view'
import type {
  ViewEdges, ViewFigure, ViewKind, ViewLoss, ViewOptions, ViewProfile,
  ViewReport, ViewSetReport, ViewVerdict,
} from './view'
import type { QueryView } from './query'
import type { WhyRecord } from './provenance'
import { agentsMdSplice } from './agentsmd'


type Mode = 'json' | 'canon'


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
       aontu hash [options] <file>
       aontu mod tidy|verify|vendor|manifest [options] [dir]
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
                  root[:dir] to confine @"..." below a directory.
                  Every verb takes it too, and a bare root means the
                  document's own directory
  --include-root <dir>  Shorthand for --trust root:<dir>

Mod options:
  --format <f>    text (default) or json
  --against <dir> manifest: a prior version's module tree, to gate on

Mod subcommands:
  tidy      Resolve the module closure by minimum version selection and
            rewrite mod-lock.aon in canonical form
  verify    Check every locked module still means what mod-lock.aon
            pins, and change nothing (the CI gate; tidy rewrites)
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

View kinds: tree, matrix, graph, layer, sets, layers, ladder, poset
(the poset takes several files). The figure goes to stdout, the loss
report to stderr. With --views it draws every figure a document
declares as data, from one evaluation: each declaration names its own
kind and out file, nothing is written unless every figure rendered,
and --check gates the committed set.

View options:
  --as <profile>    text | mermaid | dot | er | svg, per kind: tree,
                    matrix, sets and layers draw text (default) or
                    svg; graph draws mermaid (default), dot or er;
                    layer draws text (default), mermaid or svg; ladder
                    and poset draw mermaid (default) or dot
  --at <path>       Restrict the figure to nodes under this path; the
                    path the ladder draws; where the poset compares
  --views <path>    Draw every figure the document declares at this
                    path, one evaluation, all or nothing; each
                    declaration names its own kind and out file
  -o, --out <file>  Write the figure here instead of stdout
  --check           Exit 1 if --out differs from what would be drawn;
                    nothing is written
  --strict          Exit 1 when the loss report holds anything beyond
                    edges_deduped, inverse_suppressed and crossings
  --max-rows <n>    Refuse a figure above this many rows (default 60)
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
`


function version(): string {
  try {
    const txt = readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
    return JSON.parse(txt).version ?? '0.0.0'
  }
  catch {
    return '0.0.0'
  }
}


// Evaluate source, returning either the rendered output or the error
// message. Never throws.
function evalSource(
  aontu: Aontu,
  src: string,
  mode: Mode,
): { ok: boolean; text: string } {
  try {
    // exactJSON, not JSON.stringify: a document using the `0d` exact
    // leaves generates bigints and Decimals, which JSON.stringify cannot
    // write (D9). The CLI prints INDENTED JSON and the shared suite's
    // `gens` mode prints COMPACT JSON, but both go through this one
    // emitter -- an indent argument rather than a second implementation,
    // so the two cannot drift from each other or from the Go port.
    const text = 'canon' === mode
      ? aontu.unify(src).canon
      : exactJSON(aontu.generate(src), 2)
    return { ok: true, text }
  }
  catch (err: any) {
    const msg = (err instanceof AontuError || true === err?.aontu)
      ? err.message
      : String(err?.message ?? err)
    return { ok: false, text: msg }
  }
}


// The include capability the main verb runs with (G5, docs/trust.md).
// `--trust` and `--include-root` set it explicitly; the default is
// 'system' WITH the warning window: every resolution that escapes the
// entry root or goes through package resolution prints a one-line
// stderr warning naming the flag a future default will require
// (phase 6, the staged flip).
type TrustArg =
  | { kind: 'system-warn' }
  | { kind: 'system' }
  | { kind: 'none' }
  | { kind: 'root', dir?: string }


// The one-line warning of the staged default flip. Once per (kind,
// path): a fixpoint re-resolves nothing (includes load at parse), but
// several includes may escape and each deserves exactly one line.
function makeTrustWarn(): (kind: 'escape' | 'pkg', path: string) => void {
  const warned = new Set<string>()
  return (kind, path) => {
    const key = kind + ' ' + path
    if (warned.has(key)) {
      return
    }
    warned.add(key)
    const how = 'pkg' === kind
      ? 'through package resolution'
      : 'outside the entry root'
    process.stderr.write(
      `aontu: warning: include resolved ${how}: ${path}` +
      ` (a future release will deny this by default;` +
      ` pass --trust system to keep it, or --include-root to confine)\n`)
  }
}


// Build the evaluator options a TrustArg means, for an entry rooted at
// entryRoot (the entry file's directory, or the working directory for
// stdin/REPL).
function trustOpts(trust: TrustArg, entryRoot: string): any {
  switch (trust.kind) {
    case 'none':
      return { trust: { include: 'none' } }
    case 'root':
      return { trust: { include: { root: trust.dir ?? entryRoot } } }
    case 'system':
      return {}
    default:  // system-warn: today's default plus the warning window
      return { trustWarn: makeTrustWarn(), trustWarnRoot: entryRoot }
  }
}


// EVERY VERB honours the include capability, not just the bare
// command. G5 wired `--trust`/`--include-root` to `aontu <file>` alone,
// so `aontu vet schema.aon data.json` -- the surface an agent actually
// scripts -- ran the full system resolver with no flag to confine it
// and no warning (use-cases/REVIEW.md finding G). The flags are
// stripped here, before each verb parses its own tail, so a verb only
// has to pass the profile on to its engine.
//
// Returns undefined when the spelling is wrong, with the message
// already printed: the caller answers the usage class.
function takeTrust(argv: string[]):
  { argv: string[], trust: TrustArg } | undefined {
  const rest: string[] = []
  let trust: TrustArg = { kind: 'system-warn' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('--trust' === arg) {
      const parsed = null == argv[i + 1] ? undefined : parseTrustArg(argv[++i])
      if (null == parsed) {
        process.stderr.write(
          'aontu: --trust needs system, none, or root[:dir]\n')
        return undefined
      }
      trust = parsed
    }
    else if ('--include-root' === arg) {
      const dir = argv[++i]
      if (null == dir) {
        process.stderr.write('aontu: --include-root needs a directory\n')
        return undefined
      }
      trust = { kind: 'root', dir }
    }
    else {
      rest.push(arg)
    }
  }
  return { argv: rest, trust }
}


// The evaluator options a REPL session's capability means.
function replTrust(state: ReplState, entryRoot: string): any {
  const capability = verbTrust(
    state.trust ?? { kind: 'system-warn' }, entryRoot)
  return null == capability ? {} : { trust: capability }
}


// The capability a verb's engine runs under. `system` and the staged
// warning default both mean today's behaviour (no option); the warning
// window itself stays a bare-command nicety, because a verb's report
// is a machine contract and a stderr line is not part of it.
function verbTrust(trust: TrustArg, entryRoot: string): any {
  switch (trust.kind) {
    case 'none':
      return { include: 'none' }
    case 'root':
      return { include: { root: trust.dir ?? entryRoot } }
    default:
      return undefined
  }
}


// The directory a bare `--trust root` confines to for a verb: the
// primary document's own, matching the bare command's entry root.
function entryRootOf(file: string | undefined): string {
  return null == file ? process.cwd() : dirname(resolve(file))
}


function runFile(file: string, mode: Mode, trust: TrustArg): number {
  let src: string
  try {
    src = readFileSync(file, 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${file}: ${err.message}\n`)
    return 1
  }

  const path = resolve(file)
  const aontu = new Aontu({ path, ...trustOpts(trust, dirname(path)) })
  const res = evalSource(aontu, src, mode)
  ;(res.ok ? process.stdout : process.stderr).write(res.text + '\n')
  return res.ok ? 0 : 1
}


function runStdin(mode: Mode, trust: TrustArg): Promise<number> {
  return new Promise((resolve) => {
    let src = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => (src += d))
    process.stdin.on('end', () => {
      const res = evalSource(
        new Aontu(trustOpts(trust, process.cwd())), src, mode)
      ;(res.ok ? process.stdout : process.stderr).write(res.text + '\n')
      resolve(res.ok ? 0 : 1)
    })
  })
}


// THE REPL AS AN INSPECTION TOOL (G7 phase 7): `:load` holds a
// document, and `:get`, `:keys` and `:why` ask the query and
// provenance surfaces about it, so the session is a place to
// INTERROGATE a definition rather than only to evaluate snippets.
//
// The command handler is a PURE FUNCTION of (state, line): a readline
// loop is untestable, and every answer this REPL gives has to be as
// checkable as the CLI's. File reading is injected for the same
// reason.
export type ReplState = {
  // How a value renders: the `:canon` / `:json` toggle.
  mode: Mode
  // The SESSION protocol: one JSON line per answer, for a harness
  // driving the REPL. Human-readable output stays the default.
  jsonl: boolean
  name?: string
  src?: string
  // The include capability the session evaluates under. `--trust` and
  // `--include-root` were parsed and then DROPPED on the way to the
  // REPL, so `--jsonl` -- the surface built to be driven by a harness
  // -- ran unconfined however it was invoked (use-cases/REVIEW.md
  // finding G). The state carries it, so every line honours it.
  trust?: TrustArg
}

export type ReplAnswer = {
  close: boolean
  out: string
  state: ReplState
}


// The loaded document, or the answer to give when there is none.
function replLoaded(state: ReplState): string | undefined {
  return state.src
}


export function replCommand(
  state: ReplState,
  line: string,
  read: (file: string) => string,
): ReplAnswer {
  const s = line.trim()
  const answer = (out: string, next?: Partial<ReplState>): ReplAnswer => {
    const st = { ...state, ...(next ?? {}) }
    return {
      close: false,
      out: st.jsonl ? exactJSON({ ok: true, out }) : out,
      state: st,
    }
  }
  const refuse = (out: string): ReplAnswer => ({
    close: false,
    out: state.jsonl ? exactJSON({ ok: false, out }) : out,
    state,
  })

  if ('' === s) {
    return { close: false, out: '', state }
  }

  if (!s.startsWith(':')) {
    const res = evalSource(
      new Aontu(replTrust(state, process.cwd())), s, state.mode)
    return res.ok ? answer(res.text) : refuse(res.text)
  }

  const sp = s.indexOf(' ')
  const cmd = sp < 0 ? s : s.slice(0, sp)
  const arg = sp < 0 ? '' : s.slice(sp + 1).trim()

  switch (cmd) {
    case ':help':
      // Trimmed: the loop adds the newline, and the Go REPL answers
      // the same string — a help text that differed by a blank line
      // between the ports would be a parity diff in the one output
      // every user sees first.
      return answer(HELP.replace(/\n$/, ''))

    case ':canon':
      return answer('canon output', { mode: 'canon' })

    case ':json':
      return answer('json output', { mode: 'json' })

    case ':quit':
    case ':exit':
      return { close: true, out: '', state }

    case ':load': {
      if ('' === arg) {
        return refuse(':load needs a file')
      }
      let src: string
      try {
        src = read(arg)
      }
      catch (err: any) {
        return refuse(`cannot read ${arg}: ${err.message}`)
      }
      // Evaluated ONCE, and what is held is the source: parsed trees
      // are single-use, so every later question re-evaluates from the
      // text rather than reusing a tree that has already been spent.
      const res = evalSource(
        new Aontu({ path: arg, ...replTrust(state, dirname(resolve(arg))) }),
        src, state.mode)
      return res.ok
        ? answer(`loaded: ${arg}\n${res.text}`, { name: arg, src })
        : refuse(res.text)
    }

    case ':get':
    case ':keys':
    case ':why': {
      const src = replLoaded(state)
      if (null == src) {
        return refuse('nothing loaded (try :load <file>)')
      }
      const path = '' === arg ? '$' : arg
      if (':why' === cmd) {
        const report = why(src, path, {
          path: state.name,
          trust: verbTrust(state.trust ?? { kind: 'system-warn' },
            entryRootOf(state.name)),
        })
        return report.ok
          ? answer(renderWhyText(report.record as WhyRecord))
          : refuse(report.findings.map(renderFinding).join('\n'))
      }
      const view: QueryView = ':keys' === cmd
        ? 'keys' : 'canon' === state.mode ? 'canon' : 'json'
      const report = get(src, path, {
        view, path: state.name,
        trust: verbTrust(state.trust ?? { kind: 'system-warn' },
          entryRootOf(state.name)),
      })
      return report.ok
        ? answer(report.out)
        : refuse(report.findings.map(renderFinding).join('\n'))
    }

    default:
      return refuse(`unknown command: ${s} (try :help)`)
  }
}


function runRepl(initialMode: Mode, jsonl: boolean, trust: TrustArg): void {
  let state: ReplState = { mode: initialMode, jsonl, trust }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: jsonl ? '' : 'aontu> ',
  })

  if (!jsonl) {
    process.stdout.write(
      `Aontu v${version()} REPL — :help for commands, :quit to exit\n`)
  }
  rl.prompt()

  rl.on('line', (line) => {
    const res = replCommand(state, line, (f) => readFileSync(f, 'utf8'))
    state = res.state
    if (res.close) {
      rl.close()
      return
    }
    if ('' !== res.out) {
      process.stdout.write(res.out + '\n')
    }
    rl.prompt()
  })

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
      process.stdout.write('\n')
    }
    // Same reason as finish(): the REPL requires a TTY stdin, but stdout
    // can still be a pipe (`aontu | cat`), so exiting outright could
    // discard queued output here too.
    process.exitCode = 0
  })
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
const VET_EXIT: Record<VetVerdict, number> = {
  valid: 0,
  invalid: 1,
  incomplete: 3,
  error: 4,
}

const VET_HELP = 'aontu vet <schema> <data> [more-data...] (try --help)'


type VetFormat = 'text' | 'json' | 'sarif'

type VetArgs = {
  help?: boolean
  schema: string
  data: string[]
  format: VetFormat
  at?: string
  closed?: boolean
  partial?: boolean
  maxErrors?: number
  watch?: boolean
}


// Parse the verb's argv tail. Returns the error text instead of
// throwing, so the caller owns the exit code.
function parseVetArgs(argv: string[]): { args?: VetArgs; err?: string } {
  const files: string[] = []
  let format: VetFormat = 'text'
  let at: string | undefined
  let closed = false
  let partial = false
  let maxErrors: number | undefined
  let watch = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    // `-h`/`--help` before anything else, INCLUDING the file count:
    // the usage errors below all end with "(try --help)", and a verb
    // that then refused --help as an unknown option was sending the
    // reader in a circle.
    if ('-h' === arg || '--help' === arg) {
      return { args: { help: true, schema: '', data: [], format } }
    }

    if ('--at' === arg) {
      at = argv[++i]
      if (null == at) {
        return { err: 'aontu: --at needs a path' }
      }
    }
    else if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f && 'sarif' !== f) {
        return { err: `aontu: --format needs text, json or sarif` }
      }
      format = f
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
      const raw = argv[++i]
      if (!/^[0-9]{1,9}$/.test(raw ?? '') || 1 > Number(raw)) {
        return { err: 'aontu: --max-errors needs a positive whole number' }
      }
      maxErrors = Number(raw)
    }
    else if ('--closed' === arg) {
      closed = true
    }
    else if ('--partial' === arg) {
      partial = true
    }
    else if ('--watch' === arg) {
      watch = true
    }
    else if (arg.startsWith('-')) {
      return { err: `aontu: unknown vet option ${arg} (try --help)` }
    }
    else {
      files.push(arg)
    }
  }

  if (files.length < 2) {
    return { err: `aontu: vet needs a schema and at least one data file\n${VET_HELP}` }
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
  }
}


// One line per site, so a finding reads as "what is wrong, where the
// data says it, and where the truth says otherwise". The data site
// comes first because it is the one to edit.
function renderFinding(f: VetFinding): string {
  const out: string[] = [`${f.path}: ${f.code} [${f.class}]`]

  if ('' !== f.message) {
    out.push(`  ${f.message}`)
  }
  if (null != f.note) {
    out.push(`  note: ${f.note}`)
  }
  if (null != f.expected) {
    out.push(`  expected: ${f.expected}`)
  }
  if (null != f.actual) {
    out.push(`  actual:   ${f.actual}`)
  }
  for (const s of f.sites) {
    // Every site carries the canon of the value it stands for: that is
    // what makes the two sides of a conflict readable side by side. A
    // site's file is always a string -- empty when the value belongs to
    // neither document -- so there is nothing to coalesce here.
    out.push(`  ${s.role}: ${s.file}:${s.row}:${s.col} (${s.value})`)
  }

  return out.join('\n')
}


function renderVetText(report: VetReport): string {
  const head = `verdict: ${report.verdict}` +
    (report.truncated ? ' (findings truncated)' : '')

  if (0 === report.findings.length) {
    return head
  }

  return [head, ''].concat(report.findings.map(renderFinding)).join('\n')
}


// The machine-readable form. `aontu` names the producer, so a report
// read from a file or a pipe says which version and which verb made it
// without the consumer having to know.
function renderVetJson(report: VetReport): string {
  return exactJSON({
    aontu: { version: version(), verb: 'vet' },
    verdict: report.verdict,
    truncated: report.truncated,
    findings: report.findings,
  }, 2)
}


// The machine-interchange form (G2 phase 5): SARIF 2.1.0, rendered by
// the library (ts/src/report-sarif.ts) so an embedder gets the same
// bytes the CLI prints.
function renderVetSarif(report: VetReport): string {
  return sarifReport(report, version())
}


// The worst verdict wins across data files: a run that is invalid
// anywhere is invalid, and a schema that cannot stand up makes every
// file's verdict moot.
const VET_RANK: Record<VetVerdict, number> = {
  valid: 0,
  incomplete: 1,
  invalid: 2,
  error: 3,
}


// One complete vet run: read every file, vet each data document, print
// one report, return the exit class. Split from runVet so `--watch` can
// repeat it — the files are re-read on every run, which is the point of
// watching them.
function vetOnce(args: VetArgs, trust: TrustArg): number {
  let schemaSrc: string
  const sources: { file: string; src: string }[] = []
  try {
    schemaSrc = readFileSync(args.schema, 'utf8')
    for (const file of args.data) {
      sources.push({ file, src: readFileSync(file, 'utf8') })
    }
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  // Each data file is vetted on its own, because a parsed tree is
  // single-use (docs/reference-api.md) -- and because two data files
  // are two candidates for the same truth, not one merged candidate.
  let verdict: VetVerdict = 'valid'
  let truncated = false
  const findings: VetFinding[] = []

  for (const source of sources) {
    const report = vet(schemaSrc, source.src, {
      trust: verbTrust(trust, entryRootOf(args.schema)),
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
    })

    if (VET_RANK[verdict] < VET_RANK[report.verdict]) {
      verdict = report.verdict
    }
    truncated = truncated || report.truncated
    findings.push(...report.findings)

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
      break
    }
  }

  // The cap is on the REPORT, not on each file. Capping every file's
  // list and then concatenating them let `--max-errors 1` emit one
  // finding PER FILE -- and leave `truncated` false while doing it,
  // because no single file had been cut. The engine still caps each
  // run, so a pathological file cannot flood the aggregate before it
  // gets here; this is the second, honest cut.
  const cap = args.maxErrors ?? VET_MAX_ERRORS
  const kept = cap < findings.length ? findings.slice(0, cap) : findings

  const report: VetReport = {
    verdict,
    truncated: truncated || cap < findings.length,
    findings: kept,
  }
  const text = 'json' === args.format ? renderVetJson(report) :
    'sarif' === args.format ? renderVetSarif(report) :
      renderVetText(report)

  process.stdout.write(text + '\n')
  return VET_EXIT[verdict]
}


// How often `--watch` polls for a change. Polling by mtime+size rather
// than fs.watch: the design asks for "re-run on file mtime change", and
// the native watcher's semantics differ by platform (rename versus
// change events, editors that replace the inode) in exactly the ways
// that made every build tool fall back to polling.
const WATCH_POLL_MS = 100


function watchSignature(files: string[]): string {
  return files.map((f) => {
    // throwIfNoEntry, not try/catch: a file mid-save can be briefly
    // absent, and "gone" is a state to notice, not an error to die on.
    const stat = statSync(f, { throwIfNoEntry: false })
    return null == stat ? 'gone' : `${stat.mtimeMs}:${stat.size}`
  }).join('\n')
}


function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
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
async function watchChange(
  files: string[], before: string, pollMs: number): Promise<boolean> {
  for (;;) {
    await sleep(pollMs)
    if (watchSignature(files) !== before) {
      return true
    }
  }
}


type VetWaiter = (files: string[], before: string) => Promise<boolean>


// The waiter the command runs with: the real change-poller at the real
// interval. Named (rather than inlined at the runVet call) so the
// production waiter itself is directly testable.
const vetWaiter: VetWaiter = (files, before) =>
  watchChange(files, before, WATCH_POLL_MS)


// The watch loop: one report per run, one run per change, streaming to
// stdout. An unreadable file mid-watch reports (exit class 2 from
// vetOnce) and keeps watching — a file being rewritten is briefly
// unreadable, and dying on it would make the mode useless for the very
// moment it exists for.
async function watchVet(
  args: VetArgs, wait: VetWaiter, trust: TrustArg): Promise<number> {
  const files = [args.schema, ...args.data]
  let before = watchSignature(files)
  let code = vetOnce(args, trust)
  while (await wait(files, before)) {
    before = watchSignature(files)
    code = vetOnce(args, trust)
  }
  return code
}


// The vet verb. Non-watch runs are synchronous and return the exit
// class directly; `--watch` returns a promise that resolves only when
// the waiter says stop (never, for the real one).
function runVet(argv: string[], wait?: VetWaiter): number | Promise<number> {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const parsed = parseVetArgs(argv)
  if (null != parsed.err) {
    process.stderr.write(parsed.err + '\n')
    return 2
  }
  const args = parsed.args as VetArgs

  if (true === args.help) {
    process.stdout.write(HELP)
    return 0
  }

  if (true === args.watch) {
    return watchVet(args, wait ?? vetWaiter, trust)
  }

  return vetOnce(args, trust)
}


// ---------------------------------------------------------------------
// The subsumption verbs (G3 phase 3): `subsume` asks the query once,
// `breaking` asks it between a document and its own earlier versions.

const SUBSUME_HELP = 'aontu subsume <general> <specific> (try --help)'
const BREAKING_HELP =
  'aontu breaking --against <file|git#rev> <file> (try --help)'

type SubsumeFormat = 'text' | 'json'

// Exit classes mirror vet's convention: 3 is "the truth is not yet
// settled", which is exactly what undecided means here — and a gate
// that shrugs is not a gate, so undecided FAILS by default.
const SUBSUME_EXIT: Record<SubsumeVerdict, number> = {
  subsumes: 0,
  does_not_subsume: 1,
  undecided: 3,
  error: 4,
}

type SubsumeArgs = {
  help?: boolean
  general: string
  specific: string
  profile?: SubsumeProfile
  at?: string
  format: SubsumeFormat
}

function parseSubsumeArgs(argv: string[]): { args?: SubsumeArgs; err?: string } {
  const files: string[] = []
  let profile: SubsumeProfile | undefined
  let at: string | undefined
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      return { args: { help: true, general: '', specific: '', format } }
    }
    if ('--profile' === arg) {
      const p = argv[++i]
      if ('values' !== p && 'defaults' !== p && 'gen' !== p) {
        return { err: 'aontu: --profile needs values, defaults or gen' }
      }
      profile = p
    }
    else if ('--at' === arg) {
      at = argv[++i]
      if (null == at) {
        return { err: 'aontu: --at needs a path' }
      }
    }
    else if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        return { err: 'aontu: --format needs text or json' }
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      return { err: `aontu: unknown subsume option ${arg} (try --help)` }
    }
    else {
      files.push(arg)
    }
  }

  if (2 !== files.length) {
    return {
      err: 'aontu: subsume needs a general and a specific file\n' +
        SUBSUME_HELP,
    }
  }

  return {
    args: { general: files[0], specific: files[1], profile, at, format },
  }
}

function renderSubsumeText(report: SubsumeReport): string {
  const head = `verdict: ${report.verdict}`
  if (0 === report.findings.length) {
    return head
  }
  return [head, ''].concat(report.findings.map(renderFinding)).join('\n')
}

function renderSubsumeJson(report: SubsumeReport): string {
  return exactJSON({
    aontu: { version: version(), verb: 'subsume' },
    verdict: report.verdict,
    findings: report.findings,
  }, 2)
}

function runSubsume(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const parsed = parseSubsumeArgs(argv)
  if (null != parsed.err) {
    process.stderr.write(parsed.err + '\n')
    return 2
  }
  const args = parsed.args as SubsumeArgs

  if (true === args.help) {
    process.stdout.write(HELP)
    return 0
  }

  let generalSrc: string, specificSrc: string
  try {
    generalSrc = readFileSync(args.general, 'utf8')
    specificSrc = readFileSync(args.specific, 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = subsume(generalSrc, specificSrc, {
    trust: verbTrust(trust, entryRootOf(args.general)),
    profile: args.profile,
    at: args.at,
    generalUrl: args.general,
    specificUrl: args.specific,
    generalPath: args.general,
    specificPath: args.specific,
  })

  const text = 'json' === args.format
    ? renderSubsumeJson(report)
    : renderSubsumeText(report)
  process.stdout.write(text + '\n')
  return SUBSUME_EXIT[report.verdict]
}


type BreakingMode = 'backward' | 'forward' | 'full' | 'none'

type BreakingArgs = {
  help?: boolean
  file: string
  against: string[]
  mode?: BreakingMode
  // `--at`: compare a SUBTREE of both versions. The gate's own
  // sub-question, and the one a real repository needs -- a document's
  // top level carries the module's version string and its policy
  // block, which are supposed to change between releases and which
  // make the whole-document comparison answer about them rather than
  // about the contract (use-cases/REVIEW.md finding D). `subsume` has
  // taken it since G3; `breaking` did not, so the only way to gate a
  // subtree was to split the file.
  at?: string
  allowUndecided: boolean
  allowDeprecatedRemoval: boolean
  format: SubsumeFormat
}

function parseBreakingArgs(
  argv: string[]): { args?: BreakingArgs; err?: string } {
  const files: string[] = []
  const against: string[] = []
  let mode: BreakingMode | undefined
  let at: string | undefined
  let allowUndecided = false
  let allowDeprecatedRemoval = false
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      return {
        args: {
          help: true, file: '', against: [],
          allowUndecided, allowDeprecatedRemoval, format,
        },
      }
    }
    if ('--against' === arg) {
      const a = argv[++i]
      if (null == a) {
        return { err: 'aontu: --against needs a file path or git#<rev>' }
      }
      against.push(a)
    }
    else if ('--mode' === arg) {
      const m = argv[++i]
      if ('backward' !== m && 'forward' !== m && 'full' !== m) {
        return { err: 'aontu: --mode needs backward, forward or full' }
      }
      mode = m
    }
    else if ('--at' === arg) {
      const a = argv[++i]
      if (null == a) {
        return { err: 'aontu: --at needs a path' }
      }
      at = a
    }
    else if ('--allow-undecided' === arg) {
      allowUndecided = true
    }
    else if ('--allow-deprecated-removal' === arg) {
      allowDeprecatedRemoval = true
    }
    else if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        return { err: 'aontu: --format needs text or json' }
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      return { err: `aontu: unknown breaking option ${arg} (try --help)` }
    }
    else {
      files.push(arg)
    }
  }

  if (1 !== files.length || 0 === against.length) {
    return {
      err: 'aontu: breaking needs one file and at least one --against\n' +
        BREAKING_HELP,
    }
  }

  return {
    args: {
      file: files[0], against, mode, at,
      allowUndecided, allowDeprecatedRemoval, format,
    },
  }
}

// One resolved `--against` spelling: the old document's text, the path
// its own relative includes must resolve from, and (for a git spelling)
// the temporary tree to remove when the run is done.
type OldVersion = { src: string, path: string, temp?: string }

// A source file the include resolver can actually load. `git#<rev>`
// materialises these and nothing else: an include names an Aontu
// document (`.aon`/`.aontu`, the two extensions `@"foo"` tries) or a
// JSON one, so the rest of a revision's tree cannot be part of any
// include closure and copying it would be pure cost.
const INCLUDABLE = /\.(aon|aontu|jsonic|json)$/

// Resolve one --against spelling to an old version.
//
// A `git#<rev>` spelling is the old version of the WHOLE TREE, not of
// the entry file alone. It used to be `git show <rev>:./<file>`, whose
// text was then evaluated with `generalPath`/`specificPath` pointing at
// the WORKING file -- so every `@"..."` include in the old document
// resolved against the working tree, and the "old" side was old entry
// text meeting new includes. A breaking change inside an included file
// therefore compared against itself and answered `compatible`: the
// documented CI gate silently un-gated every non-entry file of the
// multi-file layout real models use (use-cases/BUGS.md §26). The old
// tree's includable sources are copied into a temporary directory and
// the old document is evaluated from THERE.
//
// Sources outside the revision -- package includes under node_modules,
// the bundled `std/system` -- still resolve as they do today: they are
// not in the tree, and their versions travel with the lockfile rather
// than with this comparison.
function oldVersion(spec: string, file: string): OldVersion | undefined {
  if (!spec.startsWith('git#')) {
    try {
      return { src: readFileSync(spec, 'utf8'), path: spec }
    }
    catch (err: any) {
      process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
      return undefined
    }
  }

  const rev = spec.slice('git#'.length)
  if ('' === rev) {
    process.stderr.write('aontu: --against git# needs a revision\n')
    return undefined
  }

  // Lazy import: the dependency exists only when a git spelling is
  // actually used, so plain runs never pay for it.
  const { execFileSync } = require('node:child_process')
  const dir = dirname(resolve(file))
  const git = (args: string[], cwd: string): string =>
    execFileSync('git', args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })

  // The temporary tree is made BEFORE the first git call, so every
  // failure below has exactly one cleanup path rather than a branch
  // that only some failures take.
  const temp = mkdtempSync(join(tmpdir(), 'aontu-against-'))
  try {
    // THE REPO-RELATIVE PATH COMES FROM GIT, not from path arithmetic.
    // Relativising `rev-parse --show-toplevel` against `resolve(file)`
    // puts two DIFFERENT COORDINATE SYSTEMS on either side of the
    // subtraction: git prints the real path, while the caller's is
    // whatever they typed. On macOS a temp file under /var is
    // /private/var to git, and on Windows a TMP short name
    // (RUNNER~1) is the long form to git -- so the subtraction gave a
    // `../..` climb, the entry was "not in that revision", and the
    // documented CI spelling failed on both platforms while passing on
    // Linux (this PR's own CI). `--show-prefix` is the same question
    // asked in git's coordinates: the repo-relative directory of the
    // cwd, already slash-separated and already normalised.
    const prefix = git(['rev-parse', '--show-prefix'], dir).trim()
    const entryRel = prefix + basename(file)
    const top = git(['rev-parse', '--show-toplevel'], dir).trim()

    // `-z` so a path with a newline or a quote cannot be mistaken for
    // two paths (git otherwise quotes such names).
    const listed = git(['ls-tree', '-r', '-z', '--name-only', rev], top)
      .split('\0').filter((p) => '' !== p)
    if (!listed.includes(entryRel)) {
      throw new Error(`${entryRel} is not in that revision`)
    }

    for (const rel of listed) {
      if (!INCLUDABLE.test(rel)) {
        continue
      }
      const dest = join(temp, ...rel.split('/'))
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, git(['show', `${rev}:${rel}`], top))
    }

    const entry = join(temp, ...entryRel.split('/'))
    return { src: readFileSync(entry, 'utf8'), path: entry, temp }
  }
  catch (err: any) {
    rmSync(temp, { recursive: true, force: true })
    const detail = String(err.stderr ?? err.message).trim().split('\n')[0]
    process.stderr.write(`aontu: cannot resolve ${spec}: ${detail}\n`)
    return undefined
  }
}

// The document's own compatibility declaration: `$.aontu_policy.compat`,
// a disjunction whose default is the declared mode. Undefined when the
// key is absent or does not spell a mode.
function policyCompat(
  newSrc: string, path: string, trust: any): BreakingMode | undefined {
  const aontu = new Aontu()
  const ctx = aontu.ctx({ collect: true })
  // The declaration is read by EVALUATING the document, so this leg
  // runs the include resolver too and has to run it under the verb's
  // capability -- a `breaking --trust none` that read its own mode
  // through an unconfined resolver would confine the comparison and
  // not the question (use-cases/REVIEW.md finding G).
  const v: any = aontu.unify(newSrc, { path, ...(null == trust ? {} : { trust }) }, ctx)
  if (0 < ctx.err.length || true === v?.isNil) {
    return undefined
  }
  let compat: any = v?.peg?.aontu_policy?.peg?.compat
  if (null == compat) {
    return undefined
  }
  if (true === compat.isDisjunct && Array.isArray(compat.peg)) {
    compat = compat.peg.find((m: any) => true === m?.isPref) ?? compat.peg[0]
  }
  if (true === compat.isPref) {
    compat = compat.peg
  }
  const m = true === compat?.isString ? compat.peg : undefined
  return 'backward' === m || 'forward' === m || 'full' === m || 'none' === m
    ? m : undefined
}

// Is the evaluated old version's value at the finding path deprecated?
// The --allow-deprecated-removal downgrade (G3 phase 4): removing (or
// otherwise changing) a value the old version already deprecated warns
// instead of breaking. The Go port exports the same reader as
// aontu.DeprecatedAt.
function deprecatedAt(oldSrc: string, path: string, filePath: string): boolean {
  const aontu = new Aontu()
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(oldSrc, { path: filePath }, ctx)
  if (0 < ctx.err.length || true === v?.isNil) {
    return false
  }
  const segs = path.replace(/^\$/, '').split('.').filter((p) => '' !== p)
  let node: any = v
  for (const seg of segs) {
    if (true === node?.isMap) {
      node = node.peg?.[seg]
    }
    else if (true === node?.isList) {
      node = node.peg?.[Number(seg)]
    }
    else {
      return false
    }
    if (null == node) {
      return false
    }
  }
  return null != node?.deprecation
}


// Verdict aggregation for breaking: an error anywhere makes the run an
// error; otherwise a witness anywhere makes it breaking; otherwise an
// open question anywhere leaves it undecided.
const BREAKING_RANK: Record<SubsumeVerdict, number> = {
  subsumes: 0,
  undecided: 1,
  does_not_subsume: 2,
  error: 3,
}

const BREAKING_EXIT: Record<SubsumeVerdict, number> = SUBSUME_EXIT

const BREAKING_VERDICT: Record<SubsumeVerdict, string> = {
  subsumes: 'compatible',
  does_not_subsume: 'breaking',
  undecided: 'undecided',
  error: 'error',
}

function runBreaking(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const parsed = parseBreakingArgs(argv)
  if (null != parsed.err) {
    process.stderr.write(parsed.err + '\n')
    return 2
  }
  const args = parsed.args as BreakingArgs

  if (true === args.help) {
    process.stdout.write(HELP)
    return 0
  }

  let newSrc: string
  try {
    newSrc = readFileSync(args.file, 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  // The declared mode: --mode overrides the document's own policy;
  // neither means backward, the index's framing (v1-valid documents
  // stay valid).
  const mode: BreakingMode =
    args.mode ??
    policyCompat(newSrc, args.file, verbTrust(trust, entryRootOf(args.file))) ??
    'backward'

  if ('none' === mode) {
    // The document declares no compatibility promise: nothing to check.
    const report: SubsumeReport = { verdict: 'subsumes', findings: [] }
    const text = 'json' === args.format
      ? renderBreakingJson(report, mode)
      : renderBreakingText(report)
    process.stdout.write(text + '\n')
    return 0
  }

  let worst: SubsumeVerdict = 'subsumes'
  const findings: VetFinding[] = []

  // Temporary trees materialised for `git#<rev>` spellings, removed
  // once every check that reads them has run.
  const temps: string[] = []
  const sweep = () => {
    for (const t of temps) {
      rmSync(t, { recursive: true, force: true })
    }
  }

  try {
  for (const spec of args.against) {
    const old = oldVersion(spec, args.file)
    if (null == old) {
      return 2
    }
    const oldSrc = old.src
    if (null != old.temp) {
      temps.push(old.temp)
    }

    // backward: the NEW document is the general side — every old
    // instance must still be admitted. forward: the old one is.
    const checks: Array<{ general: [string, string], specific: [string, string] }> = []
    if ('backward' === mode || 'full' === mode) {
      checks.push({ general: [newSrc, args.file], specific: [oldSrc, spec] })
    }
    if ('forward' === mode || 'full' === mode) {
      checks.push({ general: [oldSrc, spec], specific: [newSrc, args.file] })
    }

    const oldPath = old.path

    for (const check of checks) {
      const report = subsume(check.general[0], check.specific[0], {
        trust: verbTrust(trust, entryRootOf(args.file)),
        at: args.at,
        generalUrl: check.general[1],
        specificUrl: check.specific[1],
        // The old side's relative loads resolve from ITS own tree --
        // the materialised revision for a git spelling, the named
        // file's directory otherwise -- so an included file's change
        // is part of the comparison rather than invisible to it.
        generalPath: check.general[1] === spec ? oldPath : args.file,
        specificPath: check.specific[1] === spec ? oldPath : args.file,
      })

      // The deprecated-removal downgrade: a finding about a value the
      // OLD version already deprecated becomes a warning, and warnings
      // do not move the verdict. Deprecate-then-remove is the
      // supported rename path (the design's own sequencing).
      let verdict = report.verdict
      if (args.allowDeprecatedRemoval) {
        let liveFindings = 0
        for (const f of report.findings) {
          if ('error' === f.severity &&
            deprecatedAt(oldSrc, f.path, oldPath)) {
            f.severity = 'warning'
          }
          if ('error' === f.severity) {
            liveFindings++
          }
        }
        if ('does_not_subsume' === verdict && 0 === liveFindings) {
          verdict = 'subsumes'
        }
      }

      if (BREAKING_RANK[worst] < BREAKING_RANK[verdict]) {
        worst = verdict
      }
      findings.push(...report.findings)
    }
  }
  }
  finally {
    sweep()
  }

  const report: SubsumeReport = { verdict: worst, findings }
  const text = 'json' === args.format
    ? renderBreakingJson(report, mode)
    : renderBreakingText(report)
  process.stdout.write(text + '\n')

  if ('undecided' === worst && args.allowUndecided) {
    return 0
  }
  return BREAKING_EXIT[worst]
}

function renderBreakingText(report: SubsumeReport): string {
  const head = `verdict: ${BREAKING_VERDICT[report.verdict]}`
  if (0 === report.findings.length) {
    return head
  }
  return [head, ''].concat(report.findings.map(renderFinding)).join('\n')
}

function renderBreakingJson(report: SubsumeReport, mode: string): string {
  return exactJSON({
    aontu: { version: version(), verb: 'breaking', mode },
    verdict: BREAKING_VERDICT[report.verdict],
    findings: report.findings,
  }, 2)
}


// ---------------------------------------------------------------------
// The trim reporter (G3 phase 6): report redundant entries as paths.
// Report-only — REWRITING needs G7's format-preserving patch surface —
// which is why --check is REQUIRED rather than defaulted: `aontu trim
// f.aon` reads as "trim this file", and doing something else silently
// is worse than saying so.

const TRIM_HELP = 'aontu trim --check <file> (try --help)'

const TRIM_EXIT: Record<TrimVerdict, number> = {
  clean: 0,
  redundant: 1,
  error: 4,
}

function runTrim(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const files: string[] = []
  let check = false
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--check' === arg) {
      check = true
    }
    else if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown trim option ${arg} (try --help)\n`)
      return 2
    }
    else {
      files.push(arg)
    }
  }

  if (1 !== files.length) {
    process.stderr.write(`aontu: trim needs one file\n${TRIM_HELP}\n`)
    return 2
  }
  if (!check) {
    process.stderr.write(
      'aontu: trim only reports for now — rewriting needs a format-' +
      'preserving editor (G7); pass --check\n')
    return 2
  }

  let src: string
  try {
    src = readFileSync(files[0], 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = trimCheck(src, {
    path: files[0], trust: verbTrust(trust, entryRootOf(files[0])),
  })
  const text = 'json' === format
    ? renderTrimJson(report)
    : renderTrimText(report)
  process.stdout.write(text + '\n')
  return TRIM_EXIT[report.verdict]
}

function renderTrimText(report: TrimReport): string {
  const head = `verdict: ${report.verdict}`
  // WHY, when the document could not be evaluated at all: rendered as
  // vet renders a finding, because it IS one (the review's finding F).
  const errors = report.errors ?? []
  if (0 < errors.length) {
    return [head, ''].concat(errors.map(renderFinding)).join('\n')
  }
  if (0 === report.redundant.length) {
    return head
  }
  return [head, ''].concat(report.redundant).join('\n')
}

function renderTrimJson(report: TrimReport): string {
  return exactJSON({
    aontu: { version: version(), verb: 'trim' },
    verdict: report.verdict,
    redundant: report.redundant,
    ...(null == report.errors ? {} : { errors: report.errors }),
  }, 2)
}


// The relation reporter (G4 phase 5): acyclicity and inverse
// consistency over the edge set. A verb of its own rather than a leg of
// `vet`, for the reason `trim` is one: vet answers "does this DOCUMENT
// satisfy that SCHEMA", and these are facts about one finished model,
// with no schema on the other side of the question.

const RELATIONS_HELP = 'aontu relations <file> (try --help)'

const RELATIONS_EXIT: Record<RelationVerdict, number> = {
  pass: 0,
  fail: 1,
  error: 4,
}

const REACHES_HELP =
  'aontu reaches <from> <to> [--relation <name>] <file> (try --help)'

// Same three-way shape every check verb here uses: the check held (0),
// the check failed (1), the document could not be checked (4). An
// unreachable pair is a FAILED CHECK and not an error: the question was
// answered, and the answer was no.
const REACHES_EXIT: Record<ReachVerdict, number> = {
  reaches: 0,
  unreachable: 1,
  error: 4,
}

const VIEW_HELP =
  'aontu view <kind> [options] <file>... (try --help)'

const VIEW_KINDS: ViewKind[] =
  ['tree', 'matrix', 'graph', 'layer', 'sets', 'layers', 'ladder', 'poset']

const VIEW_PROFILES: ViewProfile[] = ['text', 'mermaid', 'dot', 'er', 'svg']

const VIEW_EDGES: ViewEdges[] = ['upward', 'all', 'none']

// The figure was drawn (0, `lossy` included: the loss report says
// what it could not draw, and --strict is the gate on that), or the
// document could not be drawn (4). An EMPTY figure is a drawing, not
// a failure: a model with no links has nothing to draw, honestly.
const VIEW_EXIT: Record<ViewVerdict, number> = {
  rendered: 0,
  lossy: 0,
  error: 4,
}

// The refusals that are USAGE, not the document's fault: exit 2, as
// every other verb's usage errors do.
const VIEW_USAGE_CODES = [
  'view_kind_unknown', 'view_profile_unknown', 'view_rows_exceeded',
  'view_at_required', 'view_sets_required', 'view_group_required',
  'view_document_shape',
]

const MOD_HELP = 'aontu mod tidy|verify|vendor|manifest [dir] (try --help)'

// The module tooling (G6 phase 3, ts/src/mod-tool.ts). All LOCAL:
// `tidy` resolves the closure from what is in the stores and rewrites
// the lockfile, `verify` asks whether the stores still mean what the
// lockfile pins and changes nothing, `vendor` materialises the locked
// closure into the project, `manifest` prints what a publish would
// push.
//
// TIDY AND VERIFY ARE DIFFERENT QUESTIONS, and that is why both exist.
// Tidy recomputes and rewrites by design -- a pin is what a module
// means NOW -- so it makes the lockfile agree with whatever the store
// holds, tampering included. Verify is the gate: a CI job runs it
// BEFORE tidy, or instead of it.
//
// `get` and `publish` are the NETWORK half of the design and are not in
// this build. They are named here rather than left to fall out as an
// unknown subcommand, because a reader of the design will type them and
// deserves to be told which half is missing rather than that the word
// is wrong.
function runMod(argv: string[]): number {
  const rest: string[] = []
  let format: SubsumeFormat = 'text'
  let against: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if ('--against' === arg) {
      const a = argv[++i]
      if (null == a) {
        process.stderr.write('aontu: --against needs a module directory\n')
        return 2
      }
      against = a
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown mod option ${arg} (try --help)\n`)
      return 2
    }
    else {
      rest.push(arg)
    }
  }

  const sub = rest[0]
  const dir = rest[1] ?? '.'

  if ('get' === sub || 'publish' === sub) {
    process.stderr.write(
      'aontu: mod ' + sub + ' needs a registry client, which this build ' +
      'does not ship; vendor the module by hand and run ' +
      "'aontu mod tidy'\n")
    return 2
  }

  if (!MOD_SUBS.includes(sub) || 2 < rest.length) {
    process.stderr.write(
      `aontu: mod needs tidy, verify, vendor or manifest\n${MOD_HELP}\n`)
    return 2
  }

  // `--against` gates a manifest and means nothing to the other two;
  // accepting it there would say it had been honoured.
  if (null != against && 'manifest' !== sub) {
    process.stderr.write('aontu: --against is a manifest option\n')
    return 2
  }

  const report =
    'tidy' === sub ? modTidy(dir, modToolOptions()) :
      'verify' === sub ? modVerify(dir, modToolOptions()) :
        'vendor' === sub ? modVendor(dir, modToolOptions()) :
          modManifest(dir, modToolOptions(), against)

  process.stdout.write(('json' === format ?
    exactJSON({ aontu: { version: version(), verb: 'mod ' + sub }, ...report },
      2) :
    modText(sub, report)) + '\n')

  return MOD_EXIT[report.verdict]
}


const MOD_SUBS = ['tidy', 'verify', 'vendor', 'manifest']

// The verdict classes: `ok` 0, a refused gate 1, an open question 3, a
// document that does not stand up 4 -- `subsume`'s classes, because a
// manifest gate IS a subsumption check and a caller reading exit codes
// should not have to learn a second table.
type ModVerdict =
  ModTidyReport['verdict'] |
  ModVerifyReport['verdict'] |
  ModVendorReport['verdict'] |
  ModManifestReport['verdict']

const MOD_EXIT: Record<ModVerdict, number> = {
  ok: 0,
  missing: 1,
  // A REFUSED GATE, with `breaking`: a store that no longer means what
  // the lockfile pins is the integrity check saying no, and a CI job
  // reading exit codes should not have to learn a third class for it.
  mismatch: 1,
  // Likewise a lockfile that does not cover the project: the gate has
  // nothing to check, which is a refusal and not a pass.
  unlocked: 1,
  breaking: 1,
  undecided: 3,
  error: 4,
}


// The tooling's evaluator: the same standalone evaluation the module
// resolver verifies with (ts/src/mod.ts), and for the same reason —
// only the engine can say what a module MEANS.
function modToolOptions() {
  return {
    cache: modCacheDir(),
    eval: (src: string, path: string) => {
      const a0 = new Aontu()
      const ctx = a0.ctx({ collect: true })
      const val: any = a0.unify(src, { path }, ctx)
      return {
        gen: val.gen(a0.ctx({ collect: true })),
        hash: canonHash(val),
        canon: val.canon,
        // The same question `aontu hash` asks before it will answer:
        // did this document stand up ON ITS OWN? See ModToolEval.
        ok: 0 === ctx.err.length && true !== val.isNil,
      }
    },
  }
}


function modText(sub: string, report: any): string {
  const lines = ['verdict: ' + report.verdict]

  if ('manifest' === sub) {
    if ('' !== report.mod) {
      lines.push(report.mod + ' ' + report.version)
      lines.push('config: ' + report.config)
    }
    for (const key of Object.keys(report.annotations).sort()) {
      lines.push(key + ': ' + report.annotations[key])
    }
    for (const file of report.files) {
      lines.push('layer: ' + file)
    }
    for (const f of report.findings) {
      lines.push(f.path + ': ' + f.message)
    }
    // What a manifest lacks is a declaration the module does not make
    // or an entry file that is not there, and neither is something a
    // fetch would supply -- so this is not the tail the other two
    // subcommands share. The name says which kind it is: `mod.version`
    // is a declaration, `service.aon` is a file.
    for (const miss of report.missing) {
      lines.push(miss + ': missing')
    }
    return lines.join('\n')
  }

  if ('verify' === sub) {
    for (const mod of report.verified) {
      lines.push(mod + ': verified')
    }
    // BOTH HASHES, because the useful question is which way it moved:
    // an empty `got` is a module that no longer stands up at all.
    for (const m of report.mismatched) {
      lines.push(m.mod + ': pinned ' + m.want + ' but the store means ' +
        ('' === m.got ? 'nothing (it does not evaluate)' : m.got))
    }
    // NOT a fetch: the module may well be sitting in the store. What
    // is absent is the PIN, and only a tidy writes one.
    for (const mod of report.unlocked) {
      lines.push(mod + ': not in the lockfile (run: aontu mod tidy)')
    }
    for (const miss of report.missing) {
      lines.push(miss + ': not fetched (run: aontu mod get)')
    }
    return lines.join('\n')
  }

  const done: any[] = 'tidy' === sub ? report.lock : report.vendored
  for (const item of done) {
    lines.push('tidy' === sub ?
      item.mod + ' ' + item.v + ' ' + item.canon : '' + item)
  }
  // A module that is PRESENT but does not stand up. Named separately
  // from a missing one because the repair is different: a fetch cannot
  // help, the module itself has to be fixed (or its own dependencies
  // vendored beside it). Before the missing tail, as the Go port's
  // shared renderer orders them.
  for (const bad of report.unevaluable ?? []) {
    lines.push(bad + ': does not evaluate on its own; nothing to pin')
  }
  for (const miss of report.missing) {
    lines.push(miss + ': not fetched (run: aontu mod get)')
  }
  return lines.join('\n')
}


function runRelations(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const files: string[] = []
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown relations option ${arg} (try --help)\n`)
      return 2
    }
    else {
      files.push(arg)
    }
  }

  if (1 !== files.length) {
    process.stderr.write(`aontu: relations needs one file\n${RELATIONS_HELP}\n`)
    return 2
  }

  let src: string
  try {
    src = readFileSync(files[0], 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = relationCheck(src, {
    path: files[0], trust: verbTrust(trust, entryRootOf(files[0])),
  })
  const text = 'json' === format
    ? renderRelationsJson(report)
    : renderRelationsText(report)
  process.stdout.write(text + '\n')
  return RELATIONS_EXIT[report.verdict]
}

function runReaches(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const rest: string[] = []
  let format: SubsumeFormat = 'text'
  let relation: string | undefined = undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if ('--relation' === arg) {
      relation = argv[++i]
      if (null == relation) {
        process.stderr.write('aontu: --relation needs a name\n')
        return 2
      }
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(
        `aontu: unknown reaches option ${arg} (try --help)\n`)
      return 2
    }
    else {
      rest.push(arg)
    }
  }

  if (3 !== rest.length) {
    process.stderr.write(
      `aontu: reaches needs two node paths and one file\n${REACHES_HELP}\n`)
    return 2
  }

  let src: string
  try {
    src = readFileSync(rest[2], 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = reachCheck(src, rest[0], rest[1], {
    path: rest[2], relation,
    trust: verbTrust(trust, entryRootOf(rest[2])),
  })
  const text = 'json' === format
    ? renderReachesJson(report)
    : renderReachesText(report, rest[0], rest[1])
  process.stdout.write(text + '\n')
  return REACHES_EXIT[report.verdict]
}

function renderReachesText(
  report: ReachReport, from: string, to: string): string {
  const head = `verdict: ${report.verdict}`
  const errors = report.errors ?? []
  if (0 < errors.length) {
    return [head, ''].concat(errors.map(renderFinding)).join('\n')
  }
  // THE PATH IS THE ANSWER, not decoration: "yes" is worth little to an
  // operator asking what a failure would take out, and the chain is
  // what they act on.
  return 'reaches' === report.verdict
    ? [head, '', (report.path as string[]).join(' -> ')].join('\n')
    : [head, '', `${from} does not reach ${to}`].join('\n')
}

function renderReachesJson(report: ReachReport): string {
  return exactJSON({
    aontu: { version: version(), verb: 'reaches' },
    verdict: report.verdict,
    ...(null == report.path ? {} : { path: report.path }),
    ...(null == report.errors ? {} : { errors: report.errors }),
  }, 2)
}

// ---------------------------------------------------------------------
// The tree view (docs/design/VIEWS.0.md, ts/src/view.ts): the drawn
// edge set, as text a golden diff can check.

function runView(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const rest: string[] = []
  let format: SubsumeFormat = 'text'
  let out: string | undefined = undefined
  let check = false
  let strict = false
  const relations: string[] = []
  const roots: string[] = []
  const opts: ViewOptions = {}

  // A flag that takes a value, read into `opts` by name.
  const valued: Record<string, keyof ViewOptions> = {
    '--as': 'as', '--at': 'at', '--order': 'order', '--group-by': 'groupBy',
    '--label': 'label', '--sets': 'sets', '--member': 'member',
    '--universe': 'universe', '--profile': 'profile', '--views': 'views',
    '--edges': 'edges',
  }
  const counted: Record<string, keyof ViewOptions> = {
    '--max-rows': 'maxRows', '--max-cols': 'maxCols',
    '--min-degree': 'minDegree', '--min-size': 'minSize',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if ('--relation' === arg) {
      const relation = argv[++i]
      if (null == relation || '' === relation) {
        process.stderr.write('aontu: --relation needs a name\n')
        return 2
      }
      relations.push(relation)
    }
    else if ('--root' === arg) {
      const root = argv[++i]
      if (null == root) {
        process.stderr.write('aontu: --root needs a node path\n')
        return 2
      }
      roots.push(root)
    }
    else if ('-o' === arg || '--out' === arg) {
      out = argv[++i]
      if (null == out) {
        process.stderr.write('aontu: --out needs a file\n')
        return 2
      }
    }
    else if ('--check' === arg) {
      check = true
    }
    else if ('--strict' === arg) {
      strict = true
    }
    else if ('--closure' === arg) {
      opts.closure = true
    }
    else if ('--layers' === arg) {
      const v = argv[++i]
      if (null == v || '' === v) {
        process.stderr.write('aontu: --layers needs a comma-separated list\n')
        return 2
      }
      opts.layers = v.split(',')
    }
    else if (undefined !== valued[arg]) {
      const v = argv[++i]
      if (null == v || '' === v) {
        process.stderr.write(`aontu: ${arg} needs a value\n`)
        return 2
      }
      (opts as any)[valued[arg]] = v
    }
    else if (undefined !== counted[arg]) {
      const v = argv[++i]
      if (null == v || !/^[0-9]+$/.test(v)) {
        process.stderr.write(`aontu: ${arg} needs a count\n`)
        return 2
      }
      (opts as any)[counted[arg]] = parseInt(v, 10)
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(
        `aontu: unknown view option ${arg} (try --help)\n`)
      return 2
    }
    else {
      rest.push(arg)
    }
  }

  // THE VIEW DOCUMENT draws every figure a document declares, so it
  // names no kind: the declarations do, one each.
  if (undefined !== opts.views) {
    return runViewSet(rest, opts, trust, { format, check, strict, out })
  }

  if (2 > rest.length) {
    process.stderr.write(
      `aontu: view needs a kind and a file\n${VIEW_HELP}\n`)
    return 2
  }
  const kind = rest[0] as ViewKind
  if (!VIEW_KINDS.includes(kind)) {
    process.stderr.write(
      `aontu: unknown view kind ${kind} (the kinds are: ${VIEW_KINDS.join(', ')})\n`)
    return 2
  }
  if (undefined !== opts.as && !VIEW_PROFILES.includes(opts.as)) {
    process.stderr.write(
      `aontu: --as needs one of ${VIEW_PROFILES.join(', ')}\n`)
    return 2
  }
  if (undefined !== opts.order && 'canon' !== opts.order && 'partition' !== opts.order) {
    process.stderr.write('aontu: --order needs canon or partition\n')
    return 2
  }
  if (undefined !== opts.edges && !VIEW_EDGES.includes(opts.edges)) {
    process.stderr.write(
      `aontu: --edges needs one of ${VIEW_EDGES.join(', ')}\n`)
    return 2
  }
  if (undefined !== opts.profile && !['values', 'defaults', 'gen'].includes(opts.profile)) {
    process.stderr.write('aontu: --profile needs values, defaults or gen\n')
    return 2
  }
  if ('poset' !== kind && 2 !== rest.length) {
    process.stderr.write(`aontu: view ${kind} takes one file\n`)
    return 2
  }
  if ('graph' === kind) {
    opts.relations = relations
  }
  else if (1 < relations.length) {
    process.stderr.write(`aontu: view ${kind} takes one --relation\n`)
    return 2
  }
  else {
    opts.relation = relations[0]
  }
  if (check && undefined === out) {
    process.stderr.write('aontu: --check needs --out\n')
    return 2
  }

  const files = rest.slice(1)
  const srcs: string[] = []
  for (const file of files) {
    try {
      srcs.push(readFileSync(file, 'utf8'))
    }
    catch (err: any) {
      process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
      return 2
    }
  }

  const report = view(srcs[0], {
    ...opts,
    kind,
    path: files[0],
    roots,
    trust: verbTrust(trust, entryRootOf(files[0])),
    docs: files.slice(1).map((path, i) => ({ src: srcs[i + 1], path })),
  })

  if ('json' === format) {
    process.stdout.write(renderViewJson(report) + '\n')
  }
  else if ('error' === report.verdict) {
    process.stderr.write(
      (report.errors as VetFinding[]).map(renderFinding).join('\n') + '\n')
  }
  else {
    // THE FIGURE AND NOTHING ELSE on stdout (or in the file): stdout is
    // what a golden diff reads, and a verdict line would be part of
    // every drawing. The loss report goes to stderr, so a figure
    // written to a file still tells the reader what it could not draw.
    const text = report.text + '\n'
    if (undefined === out) {
      process.stdout.write(text)
    }
    else if (check) {
      let have: string | undefined = undefined
      try {
        have = readFileSync(out, 'utf8')
      }
      catch (_err: any) {
        // Absent is a mismatch.
      }
      if (have !== text) {
        process.stderr.write(`aontu: ${out} differs from the ${kind} figure\n`)
        return 1
      }
    }
    else {
      writeFileSync(out, text, 'utf8')
    }
    if (0 < report.loss.length) {
      process.stderr.write(renderViewLoss(report.loss) + '\n')
    }
  }

  if ('error' === report.verdict) {
    const code = (report.errors as VetFinding[])[0]?.code
    return VIEW_USAGE_CODES.includes(code) ? 2 : VIEW_EXIT.error
  }
  return strict && 'lossy' === report.verdict ? 1 : VIEW_EXIT[report.verdict]
}

// `aontu view --views <path> <file>`: every figure the document
// declares, from one evaluation, all or nothing.
//
// A declared `out` is resolved against the DOCUMENT's own directory,
// not the caller's: a view document is committed beside the figures it
// gates, and a gate that only passes from one working directory is not
// a gate.
function runViewSet(
  rest: string[], opts: ViewOptions, trust: TrustArg,
  how: { format: SubsumeFormat, check: boolean, strict: boolean, out?: string }
): number {
  if (1 !== rest.length) {
    process.stderr.write('aontu: view --views takes one file\n')
    return 2
  }
  if (undefined !== how.out) {
    process.stderr.write(
      'aontu: --out is per figure in a view document; each declares its own\n')
    return 2
  }
  const file = rest[0]
  let src: string
  try {
    src = readFileSync(file, 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = viewSet(src, {
    ...opts, path: file, trust: verbTrust(trust, entryRootOf(file)),
  })

  if ('json' === how.format) {
    process.stdout.write(renderViewSetJson(report) + '\n')
  }
  else if (undefined !== report.errors) {
    process.stderr.write(report.errors.map(renderFinding).join('\n') + '\n')
  }
  else {
    for (const fig of report.views) {
      if (undefined !== fig.errors) {
        process.stderr.write(`${fig.name} (${fig.kind}):\n` +
          fig.errors.map(renderFinding).join('\n') + '\n')
      }
      else if (0 < fig.loss.length) {
        process.stderr.write(renderViewLoss(fig.loss)
          .split('\n').map((l) => `${fig.name}  ${l}`).join('\n') + '\n')
      }
    }
  }
  if ('error' === report.verdict) {
    return setExit(report)
  }

  // EVERY FIGURE RENDERED, so the whole set is written -- or, under
  // --check, the whole set is compared and every difference named.
  const dir = dirname(resolve(file))
  let differ = 0
  for (const fig of report.views) {
    const path = resolve(dir, fig.out)
    const text = fig.text + '\n'
    if (how.check) {
      let have: string | undefined = undefined
      try {
        have = readFileSync(path, 'utf8')
      }
      catch (_err: any) {
        // Absent is a mismatch.
      }
      if (have !== text) {
        differ++
        process.stderr.write(
          `aontu: ${fig.out} differs from the ${fig.name} figure\n`)
      }
    }
    else {
      try {
        writeFileSync(path, text, 'utf8')
      }
      catch (err: any) {
        process.stderr.write(`aontu: cannot write ${err.path}: ${err.message}\n`)
        return 2
      }
      if ('json' !== how.format) {
        process.stderr.write(`wrote ${fig.out}  ${fig.name} (${fig.kind})\n`)
      }
    }
  }
  if (0 < differ) {
    return 1
  }
  return how.strict && 'lossy' === report.verdict ? 1 : VIEW_EXIT[report.verdict]
}


// A set's exit code is the worst of its figures': a usage refusal
// anywhere is usage, and any other refusal is the document's fault.
function setExit(report: ViewSetReport): number {
  const codes = [
    ...(report.errors ?? []),
    ...report.views.flatMap((v) => v.errors ?? []),
  ].map((e) => e.code)
  return codes.some((c) => VIEW_USAGE_CODES.includes(c))
    ? 2 : VIEW_EXIT.error
}


function renderViewSetJson(report: ViewSetReport): string {
  return exactJSON({
    aontu: { version: version(), verb: 'view' },
    verdict: report.verdict,
    views: report.views.map((v: ViewFigure) => ({
      name: v.name,
      kind: v.kind,
      out: v.out,
      verdict: v.verdict,
      ...(null == v.text ? {} : { text: v.text }),
      loss: v.loss,
      ...(null == v.errors ? {} : { errors: v.errors }),
    })),
    ...(null == report.errors ? {} : { errors: report.errors }),
  }, 2)
}


// One line per code: the code, the count, and the detail if any.
function renderViewLoss(loss: ViewLoss[]): string {
  return loss.map((l) =>
    `${l.code}  ${l.count}` +
    (undefined === l.detail ? '' : '  ' + l.detail.join(' '))).join('\n')
}

function renderViewJson(report: ViewReport): string {
  return exactJSON({
    aontu: { version: version(), verb: 'view' },
    kind: report.kind,
    verdict: report.verdict,
    ...(null == report.text ? {} : { text: report.text }),
    loss: report.loss,
    ...(null == report.errors ? {} : { errors: report.errors }),
  }, 2)
}

function renderRelationsText(report: RelationReport): string {
  const head = `verdict: ${report.verdict}`
  // WHY, when the document could not be evaluated at all: rendered as
  // vet renders a finding, because it IS one (the review's finding F).
  const errors = report.errors ?? []
  if (0 < errors.length) {
    return [head, ''].concat(errors.map(renderFinding)).join('\n')
  }
  if (0 === report.findings.length) {
    return head
  }
  const lines = report.findings.map((f) =>
    'relation_cycle' === f.code
      ? `${f.at}  ${f.relation}: cycle ${f.detail.join(' -> ')}`
      : `${f.at}  ${f.relation}: ${f.detail[1]} does not list ` +
      `${f.detail[0]} under ${f.detail[2]}`)
  return [head, ''].concat(lines).join('\n')
}

function renderRelationsJson(report: RelationReport): string {
  return exactJSON({
    aontu: { version: version(), verb: 'relations' },
    verdict: report.verdict,
    findings: report.findings,
    ...(null == report.errors ? {} : { errors: report.errors }),
  }, 2)
}



// ---------------------------------------------------------------------
// JSON SCHEMA EXPORT (SUPPORT.md act 2, the review's finding I): the
// bridge to every structured-output API, which constrains generation to
// JSON Schema and nothing else. Export the model, let the provider
// generate under it, then `vet` the result against the model itself --
// the hybrid an enterprise actually deploys, and impossible without
// this verb.
//
// THE SCHEMA GOES TO STDOUT AND THE LOSSES TO STDERR, so `aontu
// jsonschema x.aon > schema.json` writes a schema and still tells the
// reader what it could not carry. `--strict` makes a loss a refusal,
// for the CI job that would rather fail than ship a schema weaker than
// its model.

const JSONSCHEMA_HELP =
  'aontu jsonschema [--at <path>] [--strict] <file> (try --help)'

function runJsonSchema(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const files: string[] = []
  let format: SubsumeFormat = 'text'
  let at: string | undefined = undefined
  let strict = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if ('--at' === arg) {
      at = argv[++i]
      if (null == at) {
        process.stderr.write('aontu: --at needs a path\n')
        return 2
      }
    }
    else if ('--strict' === arg) {
      strict = true
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(
        `aontu: unknown jsonschema option ${arg} (try --help)\n`)
      return 2
    }
    else {
      files.push(arg)
    }
  }

  if (1 !== files.length) {
    process.stderr.write(
      `aontu: jsonschema needs one file\n${JSONSCHEMA_HELP}\n`)
    return 2
  }

  let src: string
  try {
    src = readFileSync(files[0], 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = jsonSchema(src, {
    at, path: files[0], trust: verbTrust(trust, entryRootOf(files[0])),
  })

  if ('json' === format) {
    process.stdout.write(exactJSON({
      aontu: { version: version(), verb: 'jsonschema' },
      verdict: report.verdict,
      schema: report.schema,
      lossy: report.lossy,
      ...(null == report.errors ? {} : { errors: report.errors }),
    }, 2) + '\n')
  }
  else if ('error' === report.verdict) {
    // Not `?? []`: every `error` return in jsonSchema() sets `errors`,
    // so the list is the reason for the refusal rather than a maybe,
    // exactly as Go's `r.Errors` is on this arm.
    process.stderr.write(
      (report.errors as VetFinding[]).map(renderFinding).join('\n') + '\n')
  }
  else {
    process.stdout.write(exactJSON(report.schema, 2) + '\n')
    for (const l of report.lossy) {
      process.stderr.write(`lossy: ${l.path} ${l.construct}: ${l.reason}\n`)
    }
  }

  return 'error' === report.verdict ? 4 :
    strict && 'lossy' === report.verdict ? 1 : 0
}

// ---------------------------------------------------------------------
// The canon-hash (G6 phase 1): the pin an agent, a lockfile or a
// registry stores for "this module, this meaning". The hash covers the
// module evaluated STANDALONE -- its own include closure resolved and
// unified at its own root, before any consumer context -- which is what
// makes the pin transitive: an edit two includes deep changes the
// unified root, hence the hash.

const HASH_HELP = 'aontu hash <file> (try --help)'

function runHash(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const files: string[] = []
  let form = false
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--form' === arg) {
      form = true
    }
    else if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown hash option ${arg} (try --help)\n`)
      return 2
    }
    else {
      files.push(arg)
    }
  }

  if (1 !== files.length) {
    process.stderr.write(`aontu: hash needs one file\n${HASH_HELP}\n`)
    return 2
  }

  let src: string
  try {
    src = readFileSync(files[0], 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  // The file's own directory is the include base, as every verb
  // resolves a named file (vet's aontuForPath rule).
  const capability = verbTrust(trust, entryRootOf(files[0]))
  const aontu = new Aontu(
    null == capability ? undefined : { trust: capability })
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(src, { path: files[0] }, ctx)
  if (0 < ctx.err.length || true === v?.isNil) {
    // A document that does not stand up on its own has no meaning to
    // pin, and a hash of a broken evaluation would be a pin that
    // silently agrees with every other broken evaluation.
    // WHY it does not stand up, not just that it does not: the same
    // diagnosis `aontu <file>` prints (the review's finding F).
    // evalFailure unconditionally, as every other call site does: it
    // owns the "ctx.err is never empty here" contract, and a guard
    // that pretends otherwise is a dead arm asserting nothing.
    process.stderr.write(
      `aontu: ${files[0]} does not evaluate on its own; nothing to hash\n` +
      renderFinding(evalFailure(ctx)) + '\n')
    return 4
  }

  const text = 'json' === format
    ? exactJSON({
      aontu: { version: version(), verb: 'hash' },
      hash: canonHash(v),
      form: hcanon(v),
    }, 2)
    : (form ? hcanon(v) : canonHash(v))
  process.stdout.write(text + '\n')
  return 0
}


// ---------------------------------------------------------------------
// The query surface (G7 phase 1): one node of an evaluated document,
// selected by path and rendered. Evaluation is still GLOBAL -- what
// `get` buys is the size of the ANSWER, not the cost of producing it --
// and the projections are lattice abstractions, each a valid Aontu
// document that subsumes the truth it summarises.

const GET_HELP = 'aontu get <path> <file> (try --help)'

function runGet(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const rest: string[] = []
  let view: QueryView = 'json'
  let depth: number | undefined
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('-c' === arg || '--canon' === arg) {
      view = 'canon'
    }
    else if ('--keys' === arg) {
      view = 'keys'
    }
    else if ('--types' === arg) {
      view = 'types'
    }
    else if ('--depth' === arg) {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1) {
        process.stderr.write('aontu: --depth needs a positive integer\n')
        return 2
      }
      depth = n
    }
    else if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown get option ${arg} (try --help)\n`)
      return 2
    }
    else {
      rest.push(arg)
    }
  }

  if (2 !== rest.length) {
    process.stderr.write(`aontu: get needs a path and one file\n${GET_HELP}\n`)
    return 2
  }
  const [path, file] = rest

  // ELIDING BELOW A DEPTH means rendering `top`, which JSON cannot
  // say. Rather than switch the view silently -- the choice `trim
  // --check` refused to make -- the combination is a usage error.
  if (null != depth && 'canon' !== view && 'types' !== view) {
    process.stderr.write(
      'aontu: --depth needs --canon or --types (JSON cannot say top)\n')
    return 2
  }

  let src: string
  try {
    src = readFileSync(file, 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = get(src, path, {
    view, depth, path: file, trust: verbTrust(trust, entryRootOf(file)),
  })
  if ('json' === format) {
    process.stdout.write(exactJSON({
      aontu: { version: version(), verb: 'get' },
      findings: report.findings,
      ok: report.ok,
      out: report.out,
    }, 2) + '\n')
  }
  else if (report.ok) {
    process.stdout.write(report.out + '\n')
  }
  else {
    process.stderr.write(report.findings.map(renderFinding).join('\n') + '\n')
  }

  if (report.ok) {
    return 0
  }
  // A path that names nothing is the QUESTION's answer -- exit 1, the
  // "no" class -- while a document that does not stand up is exit 4,
  // as it is for every other verb.
  return 'no_path' === report.findings[0]?.code ? 1 : 4
}


// ---------------------------------------------------------------------
// Provenance (G7 phase 3): WHY the value at a path holds — the ordered
// contributions that met there, each with the site it was written at.
// The positive twin of the vet report: errors explain what failed to
// unify, this explains what did.

const WHY_HELP = 'aontu why <path> <file> (try --help)'

function runWhy(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const rest: string[] = []
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown why option ${arg} (try --help)\n`)
      return 2
    }
    else {
      rest.push(arg)
    }
  }

  if (2 !== rest.length) {
    process.stderr.write(`aontu: why needs a path and one file\n${WHY_HELP}\n`)
    return 2
  }
  const [path, file] = rest

  let src: string
  try {
    src = readFileSync(file, 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = why(src, path, {
    path: file, trust: verbTrust(trust, entryRootOf(file)),
  })
  if ('json' === format) {
    process.stdout.write(exactJSON({
      aontu: { version: version(), verb: 'why' },
      findings: report.findings,
      ok: report.ok,
      ...(null == report.record ? {} : { record: report.record }),
    }, 2) + '\n')
  }
  else if (report.ok) {
    process.stdout.write(renderWhyText(report.record as WhyRecord) + '\n')
  }
  else {
    process.stderr.write(report.findings.map(renderFinding).join('\n') + '\n')
  }

  if (report.ok) {
    return 0
  }
  return 'no_path' === report.findings[0]?.code ? 1 : 4
}


// One contribution per line, numbered in source order, each with what
// was written, where, and how it got here. A siteless contribution
// prints no location rather than a `-1:-1` that means nothing —
// exported for the direct test, because the site SHAPE allows one
// while no document has yet produced one (ADR-002).
function renderWhyText(record: WhyRecord): string {
  const head = `${record.path} = ${record.value}`
  if (0 === record.conjuncts.length) {
    // A value written once and never met is a fact, not a failure.
    return head + '\n  (no contributions: nothing met at this path)'
  }
  return [head].concat(record.conjuncts.map((c, i) => {
    const where = -1 === c.site.row
      ? ''
      : `  ${'' === c.site.file ? '' : c.site.file + ':'}` +
      `${c.site.row}:${c.site.col}`
    return `  ${i + 1}. ${c.canon}${where}` +
      ('literal' === c.role ? '' : `  (${c.role})`)
  })).join('\n')
}


// ---------------------------------------------------------------------
// The overlay patch verb (G7 phase 5): change a document by APPENDING
// to an overlay, not by rewriting it. An overlay entry is just another
// conjunct and unification is order-independent, so this needs no
// rewriter — the format-preserving in-place edit is stage 2, and needs
// a comment-preserving CST the parser stack does not have.

const SET_HELP =
  'aontu set <path>=<value> --entry <file> --overlay <file> (try --help)'

function runSet(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const assignments: string[] = []
  let entry: string | undefined
  let overlayFile: string | undefined
  let dryRun = false
  let inPlace = false
  let format: SubsumeFormat = 'text'

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--entry' === arg) {
      entry = argv[++i]
    }
    else if ('--overlay' === arg) {
      overlayFile = argv[++i]
    }
    else if ('--dry-run' === arg) {
      dryRun = true
    }
    else if ('--in-place' === arg) {
      inPlace = true
    }
    else if ('--format' === arg) {
      const f = argv[++i]
      if ('text' !== f && 'json' !== f) {
        process.stderr.write('aontu: --format needs text or json\n')
        return 2
      }
      format = f
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown set option ${arg} (try --help)\n`)
      return 2
    }
    else {
      assignments.push(arg)
    }
  }

  if (0 === assignments.length || null == entry || null == overlayFile) {
    process.stderr.write(
      `aontu: set needs assignments, --entry and --overlay\n${SET_HELP}\n`)
    return 2
  }

  let entrySrc: string
  try {
    entrySrc = readFileSync(entry, 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  // An ABSENT overlay is the empty overlay, and the file is created by
  // the write below: "append to the overlay" should not require the
  // author to have made one first.
  let overlaySrc = ''
  try {
    overlaySrc = readFileSync(overlayFile, 'utf8')
  }
  catch (err: any) {
    if ('ENOENT' !== err?.code) {
      process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
      return 2
    }
  }

  const report = patch(entrySrc, overlaySrc, assignments, {
    trust: verbTrust(trust, entryRootOf(entry)),
    entryPath: entry,
    overlayPath: overlayFile,
    inPlace,
  })

  // WRITTEN ONLY WHEN IT HOLDS. A change that contradicts a pinned
  // value is a question the author has to answer at the pinning site;
  // leaving it in the overlay would leave the configuration broken
  // while the exit code says so somewhere they may not be reading.
  const wrote = !dryRun &&
    'invalid' !== report.verdict && 'error' !== report.verdict
  if (wrote) {
    try {
      writeFileSync(overlayFile, report.overlay, 'utf8')
    }
    catch (err: any) {
      process.stderr.write(`aontu: cannot write ${overlayFile}: ${err.message}\n`)
      return 2
    }
  }

  if ('json' === format) {
    process.stdout.write(exactJSON({
      aontu: { version: version(), verb: 'set' },
      appended: report.appended,
      findings: report.findings,
      overlay: report.overlay,
      replaced: report.replaced,
      verdict: report.verdict,
      written: wrote,
    }, 2) + '\n')
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
    const verb = wrote ? 'replaced' : 'would replace'
    const edits = report.replaced.map((r) =>
      `${verb}: ${r.file}:${r.row}:${r.col} ${r.from} -> ${r.to}`)
    const head = [`verdict: ${report.verdict}`].concat(edits).join('\n') +
      (wrote ? `\nwrote: ${overlayFile}` : dryRun ? '\n(dry run)' : '')

    // A SUCCESSFUL COMMAND WRITES ITS STATUS TO STDOUT, findings or
    // not. Routing on `findings.length` was right while every finding
    // this verb could produce was an ERROR; `--in-place` made a WARNING
    // possible, and a run that held, wrote the file and exited 0 then
    // sent its whole report to stderr — leaving stdout empty, so
    // `$(aontu set ...)` captured nothing and only the JSON form
    // behaved like a success. The verdict decides the stream; warnings
    // are diagnostics and go to stderr beside it.
    const failed = 'invalid' === report.verdict || 'error' === report.verdict
    const findingText = report.findings.map(renderFinding)
    if (failed) {
      // A FAILED VERDICT ALWAYS CARRIES A FINDING — the conflict, or
      // the parse error, that made it fail — so the blank separator is
      // unconditional. Guarding it described a report vet cannot
      // produce, and the coverage gate said so.
      process.stderr.write([head, ''].concat(findingText).join('\n') + '\n')
    }
    else {
      process.stdout.write(head + '\n')
      if (0 < findingText.length) {
        process.stderr.write(findingText.join('\n') + '\n')
      }
    }
  }

  return VET_EXIT[report.verdict]
}


// ---------------------------------------------------------------------
// The generated AGENTS.md stanza (G7 phase 6): the prose entrypoint,
// derived from the definition, so it cannot drift from the formal
// source it points at.

const AGENTSMD_HELP = 'aontu agentsmd <file> (try --help)'

function runAgentsMd(argv: string[]): number {
  const trusted = takeTrust(argv)
  if (null == trusted) {
    return 2
  }
  argv = trusted.argv
  const trust = trusted.trust
  const files: string[] = []
  let write: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return 0
    }
    if ('--write' === arg) {
      write = argv[++i]
      if (null == write) {
        process.stderr.write('aontu: --write needs a file\n')
        return 2
      }
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(
        `aontu: unknown agentsmd option ${arg} (try --help)\n`)
      return 2
    }
    else {
      files.push(arg)
    }
  }

  if (1 !== files.length) {
    process.stderr.write(
      `aontu: agentsmd needs one file\n${AGENTSMD_HELP}\n`)
    return 2
  }

  let src: string
  try {
    src = readFileSync(files[0], 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
    return 2
  }

  const report = agentsMd(src, {
    name: files[0], path: files[0],
    trust: verbTrust(trust, entryRootOf(files[0])),
  })
  if (!report.ok) {
    process.stderr.write(
      report.findings.map(renderFinding).join('\n') + '\n')
    return 4
  }

  if (null == write) {
    process.stdout.write(report.stanza)
    return 0
  }

  // An ABSENT target is an empty one: `--write AGENTS.md` should not
  // require the author to have made the file first.
  let existing = ''
  try {
    existing = readFileSync(write, 'utf8')
  }
  catch (err: any) {
    if ('ENOENT' !== err?.code) {
      process.stderr.write(`aontu: cannot read ${err.path}: ${err.message}\n`)
      return 2
    }
  }

  try {
    writeFileSync(write, agentsMdSplice(existing, report.stanza), 'utf8')
  }
  catch (err: any) {
    process.stderr.write(`aontu: cannot write ${write}: ${err.message}\n`)
    return 2
  }
  process.stdout.write(`wrote: ${write}\n`)
  return 0
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
function finish(code: number): void {
  process.exitCode = code
}


// Parse a --trust argument value. Returns undefined for an unknown
// spelling, so the caller owns the usage error.
function parseTrustArg(value: string): TrustArg | undefined {
  if ('system' === value) {
    return { kind: 'system' }
  }
  if ('none' === value) {
    return { kind: 'none' }
  }
  if ('root' === value) {
    return { kind: 'root' }
  }
  if (value.startsWith('root:') && 'root:'.length < value.length) {
    return { kind: 'root', dir: value.slice('root:'.length) }
  }
  return undefined
}


function main(argv: string[]): void {
  // COLOUR OFF WHEN THE DESTINATION IS NOT A TERMINAL. Error frames
  // hardcoded their ANSI escapes, so a piped report and a `--jsonl`
  // answer carried terminal control codes into whatever read them (the
  // review's finding F). `NO_COLOR` is honoured by the library itself;
  // only the CLI can see whether its stderr is a terminal, so only the
  // CLI can make this call. `undefined` means "leave it to NO_COLOR".
  setColor(true === process.stderr.isTTY ? undefined : false)

  let mode: Mode = 'json'
  // A LIST, though the bare command evaluates exactly one document.
  // It used to be one variable and the last argument won, which made a
  // MISTYPED VERB a silent success: `aontu vet2 schema.aon good.json`
  // printed good.json and exited 0, because `vet2` matched no
  // subcommand, fell through to this loop as a file name, and was
  // overwritten twice. In a tool loop that reads as a passing
  // validation. Counting them is what lets the refusal below happen.
  const files: string[] = []
  let trust: TrustArg = { kind: 'system-warn' }
  // The REPL's SESSION protocol (G7 phase 7): one JSON line per
  // answer, so a harness can drive the session. Named --jsonl rather
  // than the design's --json, which would read as the `:json` output
  // mode the REPL already has.
  let jsonl = false

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
    return void Promise.resolve(runVet(argv.slice(3))).then(finish)
  }
  if ('subsume' === argv[2]) {
    return finish(runSubsume(argv.slice(3)))
  }
  if ('breaking' === argv[2]) {
    return finish(runBreaking(argv.slice(3)))
  }
  if ('agentsmd' === argv[2]) {
    return finish(runAgentsMd(argv.slice(3)))
  }

  if ('set' === argv[2]) {
    return finish(runSet(argv.slice(3)))
  }

  if ('why' === argv[2]) {
    return finish(runWhy(argv.slice(3)))
  }

  if ('get' === argv[2]) {
    return finish(runGet(argv.slice(3)))
  }

  if ('hash' === argv[2]) {
    return finish(runHash(argv.slice(3)))
  }

  if ('mod' === argv[2]) {
    return finish(runMod(argv.slice(3)))
  }

  if ('relations' === argv[2]) {
    return finish(runRelations(argv.slice(3)))
  }

  if ('jsonschema' === argv[2]) {
    return finish(runJsonSchema(argv.slice(3)))
  }

  if ('reaches' === argv[2]) {
    return finish(runReaches(argv.slice(3)))
  }

  if ('view' === argv[2]) {
    return finish(runView(argv.slice(3)))
  }

  if ('trim' === argv[2]) {
    return finish(runTrim(argv.slice(3)))
  }

  const args = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if ('-c' === arg || '--canon' === arg) {
      mode = 'canon'
    }
    else if ('-h' === arg || '--help' === arg) {
      process.stdout.write(HELP)
      return finish(0)
    }
    else if ('-v' === arg || '--version' === arg) {
      process.stdout.write(version() + '\n')
      return finish(0)
    }
    else if ('--trust' === arg) {
      const parsed = null == args[i + 1] ? undefined : parseTrustArg(args[++i])
      if (null == parsed) {
        process.stderr.write(
          'aontu: --trust needs system, none, or root[:dir]\n')
        return finish(2)
      }
      trust = parsed
    }
    else if ('--jsonl' === arg) {
      jsonl = true
      // A JSONL answer is machine-read by definition, even when the
      // session happens to be attached to a terminal, so this is a
      // harder gate than the stderr test above rather than a repeat of
      // it: escapes inside the answer string are noise the harness has
      // to strip before it can compare anything.
      setColor(false)
    }
    else if ('--include-root' === arg) {
      const dir = args[++i]
      if (null == dir) {
        process.stderr.write('aontu: --include-root needs a directory\n')
        return finish(2)
      }
      trust = { kind: 'root', dir }
    }
    else if (arg.startsWith('-')) {
      process.stderr.write(`aontu: unknown option ${arg} (try --help)\n`)
      return finish(2)
    }
    else {
      files.push(arg)
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
    process.stderr.write(
      `aontu: the bare command evaluates one document, and ${files.length}` +
      ' were given\naontu: a mistyped verb reads as a file name' +
      ' (try --help)\n')
    return finish(2)
  }

  const file = files[0]
  if (null != file) {
    finish(runFile(file, mode, trust))
  }
  // `--jsonl` overrides the TTY gate: the mode exists to be DRIVEN by
  // a harness over a pipe, so gating it on an interactive terminal
  // made it reachable only through a pty -- which is to say, not
  // reachable by the thing it was built for. Mirrors go/cmd/aontu.
  else if (jsonl || process.stdin.isTTY) {
    runRepl(mode, jsonl, trust)
  }
  else {
    runStdin(mode, trust).then((code) => finish(code))
  }
} /* node:coverage ignore next 16 */


// No require.main guard here: bin/aontu.js is the executable entry and
// calls main(process.argv) itself, so this module stays import-only.


export {
  evalSource, main, runVet, runSubsume, runBreaking, runTrim, runRelations,
  runReaches,
  runView,
  runJsonSchema,
  runMod,
  runHash, runGet,
  runWhy, renderWhyText, runSet, runAgentsMd,
  watchChange, watchSignature, vetWaiter, deprecatedAt,
}
