/* Copyright (c) 2025 Richard Rodger, MIT License */

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

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'
import { execFileSync } from 'node:child_process'

import { Aontu } from '../dist/aontu'


const DOCS_DIR = Path.join(__dirname, '..', '..', 'docs')
const CLI = Path.join(__dirname, '..', 'bin', 'aontu.js')

// The executed page set: the Diátaxis documents whose fences face the
// four layers above. `explanation.md` writes its blocks
// unfenced-by-language (diagrams and quoted transcripts), so it
// contributes nothing here — but it does face the style gate below.
// `docs/how-to/` is a directory of per-guide pages; the glob keeps
// the list honest as guides are added or renamed.
// DOCS_PAGES=<comma-list> narrows a run to named pages — the tight
// loop for writing one page — and suspends the corpus-wide floors,
// which only mean anything over the whole set.
function narrowed(): string[] | undefined {
  const v = process.env.DOCS_PAGES
  return null == v || '' === v ? undefined : v.split(',')
}

function execPages(): string[] {
  const only = narrowed()
  if (only) {
    return only.filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)))
  }
  const fixed = [
    'index.md',
    'tutorial.md',
    'tutorial-graph.md',
    'unification.md',
    'reference-language.md',
    'reference-api.md',
    'use-cases.md',
  ].filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)))
  const howtoDir = Path.join(DOCS_DIR, 'how-to')
  const howto = Fs.existsSync(howtoDir)
    ? Fs.readdirSync(howtoDir).filter((f) => f.endsWith('.md'))
      .sort().map((f) => Path.join('how-to', f))
    : []
  // The monolithic how-to.md remains in the list only while it still
  // exists; the split guides replace it.
  const mono = Fs.existsSync(Path.join(DOCS_DIR, 'how-to.md'))
    ? ['how-to.md'] : []
  return [...fixed, ...mono, ...howto]
}

// The style-gated page set: every Diátaxis page plus the reference
// and contributor documents. STYLE-GUIDE.md itself is exempt — it
// quotes the banned phrases in order to ban them.
function stylePages(): string[] {
  const only = narrowed()
  if (only) {
    return only.filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)))
  }
  return [...execPages(),
    'explanation.md', 'trust.md', 'lsp.md',
    'shared-spec.md', 'test-coverage.md', 'release-and-tag.md',
  ].filter((f, i, a) => a.indexOf(f) === i)
    .filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)))
}

// The PUBLISHED page set: what a reader who has the tool and not the
// repository sees. It is stylePages() minus the three contributor
// documents, and it is the set the internal-reference gate applies to
// — `shared-spec.md`, `test-coverage.md` and `release-and-tag.md` are
// written FOR contributors and may cite the records freely.
function publishedPages(): string[] {
  const only = narrowed()
  if (only) {
    return only.filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)))
  }
  return [...execPages(), 'explanation.md', 'trust.md', 'lsp.md']
    .filter((f, i, a) => a.indexOf(f) === i)
    .filter((f) => Fs.existsSync(Path.join(DOCS_DIR, f)))
}


// `aon` and `aontu` are both used as the fence tag for an Aontu
// document; the reference-language file uses the first and the
// teaching documents the second.
const SOURCE_TAGS = new Set(['aon', 'aontu'])


type Block = {
  lang: string
  body: string
  line: number              // 1-based line of the opening fence
  directive?: Directive     // the test: comment immediately above, if any
  covered?: string          // how a layer accounted for this block
}

type Directive = {
  verb: 'file' | 'run' | 'skip'
  arg: string
  line: number
}

// A page is an ordered stream of scenario-opens and fenced blocks;
// only the scenario runner cares about the opens.
type Item =
  | { kind: 'scenario'; name: string; line: number }
  | { kind: 'block'; block: Block }


// LINE ENDINGS ARE THE CHECKOUT'S BUSINESS, not this file's. git on
// Windows checks out with CRLF by default, and every pattern below
// anchors on "\n" — so on a Windows runner the extractor matched ZERO
// blocks and the suite reported a documentation file with no examples
// in it rather than a failure. (.gitattributes pins these files to LF
// as well; this is the half that still holds when the file arrives
// from a tarball, an editor that rewrote it, or a copy-paste.)
function lf(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}


// One pass, in document order, collecting scenario-opens and fences,
// binding each file/run/skip directive to the fence that follows it.
// A directive with no following fence, or an unknown verb, is a page
// defect and fails loudly rather than being ignored. A `scenario`
// directive is a standalone statement — it opens a scenario at its
// position and may sit directly above the fence directives that
// populate it.
function extract(file: string, md: string): Item[] {
  const lines = md.split('\n')
  const out: Item[] = []
  let pending: Directive | undefined

  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(/^<!--\s*test:\s*([a-z]+)\s*(.*?)\s*-->\s*$/)
    if (dm) {
      const verb = dm[1]
      Assert.ok(['scenario', 'file', 'run', 'skip'].includes(verb),
        `${file}:${i + 1} unknown test directive verb: ${verb}`)
      if ('scenario' === verb) {
        Assert.ok('' !== dm[2],
          `${file}:${i + 1} scenario needs a name`)
        out.push({ kind: 'scenario', name: dm[2], line: i + 1 })
        continue
      }
      Assert.ok(undefined === pending,
        `${file}:${i + 1} directive while another (line ${pending?.line}) ` +
        `still awaits its fence`)
      pending = { verb: verb as Directive['verb'], arg: dm[2], line: i + 1 }
      continue
    }
    const fm = lines[i].match(/^```([a-z]*)[ \t]*$/)
    if (fm) {
      const start = i + 1
      const body: string[] = []
      i++
      while (i < lines.length && !/^```[ \t]*$/.test(lines[i])) {
        body.push(lines[i]); i++
      }
      Assert.ok(i < lines.length, `${file}:${start} unclosed fence`)
      const b: Block = {
        lang: fm[1],
        body: body.join('\n') + (body.length ? '\n' : ''),
        line: start,
      }
      if (pending) {
        b.directive = pending
        pending = undefined
      }
      out.push({ kind: 'block', block: b })
      continue
    }
  }
  Assert.ok(undefined === pending,
    `${file}:${pending?.line} directive is not followed by a fence`)
  return out
}


function pages(): { file: string; items: Item[]; blocks: Block[] }[] {
  return execPages().map((file) => {
    const items = extract(file,
      lf(Fs.readFileSync(Path.join(DOCS_DIR, file), 'utf8')))
    return {
      file, items,
      blocks: items.filter((x) => 'block' === x.kind)
        .map((x: any) => x.block as Block),
    }
  })
}


// A block the page ships whole: a source fence with no `@"` include
// and no file directive (a scenario member is proven by its runs).
function selfContained(b: Block): boolean {
  return SOURCE_TAGS.has(b.lang) && !b.body.includes('@"')
    && 'file' !== b.directive?.verb
}


// ---------------------------------------------------------------------
// The transcript runner.
//
// Grammar (docs/STYLE-GUIDE.md): lines starting `$ ` are commands;
// the non-command lines after each are its expected stdout+stderr;
// `$ echo $?` pins the PREVIOUS command's exit code (nothing is
// echoed); a line holding only `...` matches any run of lines.
// Commands are spawned directly — no shell — so the vocabulary is
// `aontu …` (rewritten to this repo's CLI, or $AONTU) and the one
// stdin form `echo '<text>' | aontu …`.

type Step = { cmd: string; expect: string[]; line: number; exitOf?: Step }

function parseTranscript(file: string, b: Block): Step[] {
  const steps: Step[] = []
  const lines = b.body.replace(/\n$/, '').split('\n')
  let cur: Step | undefined
  lines.forEach((ln, i) => {
    if (ln.startsWith('$ ')) {
      const cmd = ln.slice(2).trim()
      if (/^echo \$\?$/.test(cmd)) {
        Assert.ok(cur, `${file}:${b.line + i + 1} echo $? with no command`)
        cur = { cmd, expect: [], line: b.line + i + 1, exitOf: cur }
      }
      else {
        cur = { cmd, expect: [], line: b.line + i + 1 }
      }
      steps.push(cur)
    }
    else {
      Assert.ok(cur,
        `${file}:${b.line + i + 1} transcript output before any command`)
      cur!.expect.push(ln)
    }
  })
  return steps
}

// Minimal quote-aware splitter: double and single quotes group words;
// no escapes, no expansion. Anything needing more is real shell and
// belongs in a use-case check.sh, not a doc transcript.
function splitArgs(file: string, line: number, s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while (null != (m = re.exec(s))) {
    out.push(m[1] ?? m[2] ?? m[3])
  }
  // Shell features are not modelled — with one exception, the single
  // pipe of the `echo '<text>' | aontu …` stdin form, which runStep
  // handles itself before any spawn.
  const unquoted = s.replace(/'[^']*'|"[^"]*"/g, '')
  const bare = s.startsWith('echo ')
    ? unquoted.replace('|', '') : unquoted
  Assert.ok(!/[|&;<>`]/.test(bare),
    `${file}:${line} transcript uses shell features the harness does ` +
    `not model: simplify, or mark <!-- test: skip … -->\n  ${s}`)
  return out
}

function norm(s: string): string {
  return lf(s).split('\n').map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n').trim()
}

// Expected output with `...` wildcard lines: build a regex where a
// lone `...` matches any (possibly empty) run of lines.
function matches(expect: string[], got: string): boolean {
  const want = norm(expect.join('\n'))
  const parts = want.split(/^\.\.\.$/m).map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim())
  const re = new RegExp('^' + parts.join('(?:[\\s\\S]*?)') + '$')
  return re.test(norm(got))
}

function runStep(file: string, dir: string, step: Step):
  { out: string; code: number } {
  let argv = splitArgs(file, step.line, step.cmd)
  let input: string | undefined

  // The one stdin form: echo '<text>' | aontu …
  if ('echo' === argv[0]) {
    const pipe = argv.indexOf('|')
    Assert.ok(1 < pipe && 'aontu' === argv[pipe + 1],
      `${file}:${step.line} only \`echo '<text>' | aontu …\` is modelled`)
    input = argv.slice(1, pipe).join(' ')
    argv = argv.slice(pipe + 1)
  }

  Assert.equal(argv[0], 'aontu',
    `${file}:${step.line} transcript commands start with aontu (or ` +
    `the echo-pipe form); got: ${step.cmd}`)

  const aontu = process.env.AONTU?.split(' ')
  const [bin, ...pre] = aontu ?? [process.execPath, CLI]
  try {
    const out = execFileSync(bin, [...pre, ...argv.slice(1)], {
      cwd: dir, input,
      env: { ...process.env, NO_COLOR: '1' },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { out, code: 0 }
  }
  catch (e: any) {
    const out = String(e.stdout ?? '') + String(e.stderr ?? '')
    return { out, code: e.status ?? 1 }
  }
}


// ---------------------------------------------------------------------

describe('docs', () => {

  // A parse failure in a documented example is never the lesson.
  test('every-documented-example-parses', () => {
    let checked = 0
    for (const page of pages()) {
      page.blocks.forEach((b) => {
        if (!selfContained(b)) {
          return
        }
        checked++
        const aontu = new Aontu()
        const ctx: any = aontu.ctx({ collect: true })
        aontu.parse(b.body, undefined, ctx)
        Assert.deepEqual(ctx.err.map((e: any) => e.why), [],
          `${page.file}:${b.line} does not parse:\n${b.body}`)
      })
    }
    // The extractor silently matching nothing would make every
    // assertion above vacuous, so the count is asserted too. Floors
    // are corpus-wide claims; a DOCS_PAGES run suspends them.
    if (undefined === narrowed()) {
      Assert.ok(30 < checked, `too few examples extracted: ${checked}`)
    }
  })


  // The claim each page makes about what its example EVALUATES TO,
  // re-derived from the engine. Structural comparison: the page owns
  // its own whitespace and key order.
  test('every-stated-result-is-the-engine-s', () => {
    let checked = 0
    for (const page of pages()) {
      page.blocks.forEach((b, i) => {
        const next = page.blocks[i + 1]
        if (!selfContained(b) || null == next || 'json' !== next.lang
          || null != next.directive) {
          return
        }
        checked++
        b.covered = next.covered = 'pair'
        const got = new Aontu().generate(b.body)
        Assert.deepEqual(got, JSON.parse(next.body),
          `${page.file}:${b.line} does not generate what it states:\n` +
          `${b.body}\n--- stated ---\n${next.body}`)
      })
    }
    if (undefined === narrowed()) {
      Assert.ok(5 < checked, `too few stated results extracted: ${checked}`)
    }
  })


  // Scenarios and transcripts: the directive vocabulary, executed in
  // document order per page. A `file` fence is written into the
  // page's current scenario directory; a `run` fence is a transcript
  // executed there. On failure the scenario directory is kept and
  // named, so the failure is reproducible by hand.
  test('every-scenario-and-transcript-runs', () => {
    let scenarios = 0
    let commands = 0
    for (const page of pages()) {
      let dir: string | undefined
      let scenarioId = ''
      const open = (id: string) => {
        dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-docs-'))
        scenarioId = id
        scenarios++
      }
      for (const item of page.items) {
        if ('scenario' === item.kind) {
          open(item.name)
          continue
        }
        const b = item.block
        const d = b.directive
        if (null == d) {
          continue
        }
        if ('file' === d.verb) {
          Assert.ok('' !== d.arg,
            `${page.file}:${d.line} file directive needs a name`)
          if (null == dir) {
            open('(anonymous)')
          }
          Assert.ok(!d.arg.includes('..') && !Path.isAbsolute(d.arg),
            `${page.file}:${d.line} file name escapes the scenario: ${d.arg}`)
          const p = Path.join(dir!, d.arg)
          Fs.mkdirSync(Path.dirname(p), { recursive: true })
          Fs.writeFileSync(p, b.body)
          b.covered = 'file'
        }
        if ('run' === d.verb) {
          Assert.equal(b.lang, 'sh',
            `${page.file}:${d.line} run directives annotate sh fences`)
          if (null == dir) {
            open('(anonymous)')
          }
          const steps = parseTranscript(page.file, b)
          let prevCode = 0
          for (const step of steps) {
            if (step.exitOf) {
              const want = step.expect.join('\n').trim()
              Assert.equal(String(prevCode), want,
                `${page.file}:${step.line} [${scenarioId}] exit code: ` +
                `command exited ${prevCode}, page states ${want}\n` +
                `  scenario dir kept: ${dir}`)
              commands++
              continue
            }
            const r = runStep(page.file, dir!, step)
            prevCode = r.code
            commands++
            // A command with no echo $? after it must succeed; one
            // with an exit pin may exit however the pin states.
            const idx = steps.indexOf(step)
            const pinned = steps[idx + 1]?.exitOf === step
            if (!pinned) {
              Assert.equal(r.code, 0,
                `${page.file}:${step.line} [${scenarioId}] ` +
                `\`${step.cmd}\` exited ${r.code} with no stated exit\n` +
                `${r.out}\n  scenario dir kept: ${dir}`)
            }
            Assert.ok(matches(step.expect, r.out),
              `${page.file}:${step.line} [${scenarioId}] output mismatch ` +
              `for \`${step.cmd}\`\n--- stated ---\n` +
              `${JSON.stringify(step.expect.join('\n'))}\n--- got ---\n` +
              `${JSON.stringify(norm(r.out))}\n  scenario dir kept: ${dir}`)
          }
          b.covered = 'run'
        }
        if ('skip' === d.verb) {
          Assert.ok('' !== d.arg.trim(),
            `${page.file}:${d.line} a skip needs its reason`)
          b.covered = 'skip'
        }
      }
      // Scenario dirs from fully green pages are transient; a failed
      // assertion above threw before this cleanup, keeping the dir.
      if (null != dir) {
        Fs.rmSync(dir, { recursive: true, force: true })
      }
    }
    // Floors, per the vacuity-guard precedent above. Tuned to the
    // rewritten set; raise them as the corpus grows.
    if (undefined === narrowed()) {
      Assert.ok(4 <= scenarios, `too few scenarios extracted: ${scenarios}`)
      Assert.ok(10 <= commands, `too few transcript commands: ${commands}`)
    }
  })


  // The accounting layer: every tagged fence is covered or skipped.
  // Untagged fences make no language claim and are exempt.
  test('every-snippet-is-tested-or-owns-its-skip', () => {
    // Re-derive coverage exactly as the layers above assign it, then
    // demand a disposition for what remains — reported as one census,
    // so a page's whole debt is visible in one failure.
    const untested: string[] = []
    for (const page of pages()) {
      page.blocks.forEach((b, i) => {
        if ('' === b.lang) {
          return          // no language claim
        }
        const d = b.directive
        if (d && ('file' === d.verb || 'run' === d.verb
          || 'skip' === d.verb)) {
          return          // scenario member, transcript, or owned skip
        }
        if (selfContained(b)) {
          return          // parse-checked; possibly also a pair
        }
        const prev = page.blocks[i - 1]
        if ('json' === b.lang && null != prev && selfContained(prev)) {
          return          // the stated half of a pair
        }
        untested.push(`${page.file}:${b.line} (${b.lang})`)
      })
    }
    Assert.deepEqual(untested, [],
      `snippets with no test and no owned skip — give each a ` +
      `directive: file/run for execution, or skip with a reason ` +
      `(docs/STYLE-GUIDE.md, "Code snippets"):\n${untested.join('\n')}`)
  })


  // The prose channel names scenario files too: a file directive's
  // name must appear in a code span in the three lines above it, so
  // the human channel and the machine channel cannot drift.
  test('functions-table-signatures-match-the-registry', () => {
    // THE DRIFT GATE (docs/design/SIGNATURES.0.md): the reference's
    // functions table renders its signature column from the same
    // registry the engine parses -- a row whose first cell names a
    // builtin must BE that builtin's rendered signature (pipes
    // markdown-escaped). Nobody writes a signature by hand.
    const { funcSig, renderSig } = require('../dist/sig')
    const text = Fs.readFileSync(
      Path.join(DOCS_DIR, 'reference-language.md'), 'utf8')
    let rows = 0
    for (const line of text.split('\n')) {
      const m = line.match(/^\| `([a-z]+)\(([^`]*)\)([^`]*)` \|/)
      if (null == m || undefined === funcSig[m[1]]) {
        continue
      }
      // Schematic rows (the subsumption table's `neq(S)` and kin) use
      // meta-variables, not signatures; a signature always carries a
      // colon.
      if (!m[2].includes(':') && !m[3].includes(':')) {
        continue
      }
      const cell = (m[1] + '(' + m[2] + ')' + m[3]).replace(/\\[|]/g, '|')
      Assert.equal(cell, renderSig(funcSig[m[1]]),
        'functions-table row for ' + m[1])
      rows++
    }
    // The main functions table holds these rows today; a table edit
    // that drops below this floor is a removal, not drift.
    Assert.ok(20 <= rows, 'functions-table rows found: ' + rows)
  })


  test('scenario-files-are-named-in-prose', () => {
    for (const page of pages()) {
      const text = lf(Fs.readFileSync(
        Path.join(DOCS_DIR, page.file), 'utf8'))
      const lines = text.split('\n')
      for (const b of page.blocks) {
        if ('file' !== b.directive?.verb) {
          continue
        }
        const at = b.directive.line - 1
        const above = lines.slice(Math.max(0, at - 3), at).join('\n')
        Assert.ok(above.includes('`' + b.directive.arg + '`'),
          `${page.file}:${b.directive.line} the prose above should name ` +
          `\`${b.directive.arg}\` in a code span (STYLE-GUIDE.md)`)
      }
    }
  })

})


// ---------------------------------------------------------------------
// The style gate: the enforceable subset of docs/STYLE-GUIDE.md's
// banned list, applied to prose only — fences are code, and quoted
// error text inside them is the engine's business. Phrases whose
// legitimate technical uses are common (surface as a noun, navigate a
// tree structure) are left to review; what is listed here is banned
// in any context these pages produce.

const BANNED: [RegExp, string][] = [
  [/\bworth noting\b/i, 'worth noting'],
  [/\bimportant to note\b/i, 'important to note'],
  [/\bat its core\b/i, 'at its core'],
  [/\bwhen it comes to\b/i, 'when it comes to'],
  [/\bdelve\b/i, 'delve'],
  [/\bdive into\b/i, 'dive into'],
  [/\brobust\b/i, 'robust'],
  [/\bseamless(?:ly)?\b/i, 'seamless'],
  [/\bcomprehensive(?:ly)?\b/i, 'comprehensive'],
  [/\bholistic\b/i, 'holistic'],
  [/\bleverag(?:e|es|ed|ing)\b/i, 'leverage'],
  [/\bfoster(?:s|ed|ing)?\b/i, 'foster'],
  [/\bshed(?:s|ding)? light on\b/i, 'shed light on'],
  [/\bpav(?:e|es|ed|ing) the way\b/i, 'pave the way'],
  [/\bpivotal\b/i, 'pivotal'],
  [/\btransformative\b/i, 'transformative'],
  [/\bgame.chang(?:er|ing)\b/i, 'game-changing'],
  [/\bcutting.edge\b/i, 'cutting-edge'],
  [/\bgroundbreaking\b/i, 'groundbreaking'],
  [/\btestament to\b/i, 'testament to'],
  [/\bparadigm shift\b/i, 'paradigm shift'],
  [/\bnorth star\b/i, 'north star'],
  [/\bkey takeaways\b/i, 'key takeaways'],
  [/\bat the end of the day\b/i, 'at the end of the day'],
  [/\bload.bearing\b/i, 'load-bearing'],
  [/\bheavy lifting\b/i, 'heavy lifting'],
  [/\bnot just\b/i, 'the "not just X" contrast frame'],
  [/\bhere'?s where it gets interesting\b/i, 'here is where it gets interesting'],
  [/\bthe right (?:way|answer|tool|question)\b/i, 'the right way/answer/tool/question'],
]

// Strip fenced blocks and inline code spans; what remains is prose.
function prose(md: string): string {
  return lf(md)
    .replace(/^```[a-z]*[ \t]*$[\s\S]*?^```[ \t]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
}

describe('docs-style', () => {

  test('no-banned-phrases-in-prose', () => {
    const hits: string[] = []
    for (const file of stylePages()) {
      const text = prose(
        Fs.readFileSync(Path.join(DOCS_DIR, file), 'utf8'))
      text.split('\n').forEach((line, i) => {
        for (const [re, name] of BANNED) {
          if (re.test(line)) {
            hits.push(`${file}:${i + 1} "${name}": ${line.trim()}`)
          }
        }
      })
    }
    Assert.deepEqual(hits, [],
      `banned phrases (docs/STYLE-GUIDE.md):\n${hits.join('\n')}`)
  })

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
  const INTERNAL_REFS: [RegExp, string][] = [
    [/\bADR-\d+\b/, 'a decision record'],
    // The bare prose form. `ADR` names a record the reader cannot
    // open, whether or not a number follows it.
    [/\b(?:the|an|this|that) ADR\b/i, 'a decision record'],
    [/\bADR\.md\b/, 'ADR.md'],
    [/capability-review/, 'the capability review'],
    // Both spellings: the pages linked design notes as `docs/design/…`
    // and as a bare `design/…` relative href, and only the first was
    // listed.
    [/\bdesign\/[A-Za-z0-9._-]+\.md/, 'a design note'],
    [/\bDIVERGENCE\.md\b/, 'DIVERGENCE.md'],
    [/use-cases\/(?:BUGS|REVIEW)\.md/, 'a defect ledger'],
    [/\bprogress\.md\b/, 'the progress register'],
    [/\bshared-spec\.md\b/, 'shared-spec.md'],
    [/\btest-coverage\.md\b/, 'test-coverage.md'],
    [/\brelease-and-tag\.md\b/, 'release-and-tag.md'],
    // A LINK to AGENTS.md only. The bare name is what `aontu agentsmd`
    // writes, so it is the product's surface and stays legal.
    [/\]\([^)]*AGENTS\.md[^)]*\)/, 'a link to AGENTS.md'],
  ]

  // THE USE-CASE READMEs ARE PUBLISHED TOO. The site renders each at
  // /use-cases/<dir>, so a citation there reaches a reader exactly as
  // one in docs/ does — and three of them carried an ADR number. The
  // `repros/` directory is deliberately absent: it is a review
  // artifact, not a case, and the site does not render it.
  function useCaseReadmes(): string[] {
    const dir = Path.join(DOCS_DIR, '..', 'use-cases')
    if (!Fs.existsSync(dir)) return []
    return Fs.readdirSync(dir)
      .filter((d) => /^\d\d-/.test(d))
      .map((d) => Path.join(dir, d, 'README.md'))
      .filter((f) => Fs.existsSync(f))
      .sort()
  }

  test('no-internal-design-references', () => {
    const hits: string[] = []
    const files = [
      ...publishedPages().map((f) => Path.join(DOCS_DIR, f)),
      ...(narrowed() ? [] : useCaseReadmes()),
    ]
    for (const path of files) {
      const file = Path.relative(Path.join(DOCS_DIR, '..'), path)
      const text = lf(Fs.readFileSync(path, 'utf8'))
      text.split('\n').forEach((line, i) => {
        for (const [re, name] of INTERNAL_REFS) {
          if (re.test(line)) {
            hits.push(`${file}:${i + 1} cites ${name}: ${line.trim()}`)
          }
        }
      })
    }
    Assert.deepEqual(hits, [],
      'published pages cite internal records (docs/STYLE-GUIDE.md,\n' +
      '"The published set cites nothing internal"):\n' + hits.join('\n'))
  })

  // The guide and this gate must agree; the guide names this block,
  // so a reader of either finds the other.
  test('the-style-guide-names-this-gate', () => {
    const guide = Fs.readFileSync(
      Path.join(DOCS_DIR, 'STYLE-GUIDE.md'), 'utf8')
    Assert.ok(guide.includes('docs.test.ts'),
      'STYLE-GUIDE.md should point at this test file')
  })

})
