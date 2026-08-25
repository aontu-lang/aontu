/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE DOCUMENTATION, HELD TO THE ENGINE. The skill sources have been
// executed since G7 phase 6 (skill.test.ts); the four teaching
// documents were not, and the 2026-08-21 status report's item 6 asks
// for exactly this — "run every fenced block in tutorial.md and
// how-to.md against its stated result".
//
// It is worth having because the failure mode is silent and slow: an
// example that was right when it was written stays in the page after
// the surface moves under it, and the reader who trusts it is the one
// who finds out. Every claim these documents make about what a
// document EVALUATES TO is a claim this file re-derives from the
// engine rather than from the page.
//
// Two rules, chosen so neither is brittle:
//
//   1. EVERY example PARSES. A block that does not parse is always a
//      bug, in a way that a block which does not unify is not — the
//      teaching documents deliberately show conflicts (`port: 8080`
//      meeting `port: 9090`), and refusing those would be refusing the
//      lesson.
//   2. EVERY example that STATES its result is checked against it. The
//      convention is an `aontu` fence immediately followed by a `json`
//      fence, which is how all four documents write it, and the
//      comparison is structural — the page's whitespace and key order
//      are the page's business.
//
// Multi-file examples are excluded: an `@"..."` include resolves
// against a sibling file the page describes but does not ship.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'


const DOCS_DIR = Path.join(__dirname, '..', '..', 'docs')

// The four Diátaxis documents plus the map. `explanation.md` writes its
// blocks unfenced-by-language (they are diagrams and transcripts, not
// documents), so it contributes nothing and is not listed.
const PAGES = [
  'index.md',
  'tutorial.md',
  'how-to.md',
  'reference-language.md',
]

// `aon` and `aontu` are both used as the fence tag for an Aontu
// document; the reference language file uses the first and the
// teaching documents the second.
const SOURCE_TAGS = new Set(['aon', 'aontu'])


type Block = { lang: string; body: string }

function blocks(md: string): Block[] {
  const out: Block[] = []
  const re = /^```([a-z]*)\n([\s\S]*?)^```[ \t]*$/gm
  let m: RegExpExecArray | null
  while (null != (m = re.exec(md))) {
    out.push({ lang: m[1], body: m[2] })
  }
  return out
}


function pages(): { file: string; blocks: Block[] }[] {
  return PAGES.map((file) => ({
    file,
    blocks: blocks(Fs.readFileSync(Path.join(DOCS_DIR, file), 'utf8')),
  }))
}


// A block the page ships whole. An `@"..."` include names a sibling the
// prose describes rather than a file this suite can resolve.
function selfContained(b: Block): boolean {
  return SOURCE_TAGS.has(b.lang) && !b.body.includes('@"')
}


describe('docs', () => {

  // A parse failure in a documented example is never the lesson.
  test('every-documented-example-parses', () => {
    let checked = 0
    for (const page of pages()) {
      page.blocks.forEach((b, i) => {
        if (!selfContained(b)) {
          return
        }
        checked++
        const aontu = new Aontu()
        const ctx: any = aontu.ctx({ collect: true })
        aontu.parse(b.body, undefined, ctx)
        Assert.deepEqual(ctx.err.map((e: any) => e.why), [],
          `${page.file} block ${i} does not parse:\n${b.body}`)
      })
    }
    // The extractor silently matching nothing would make every
    // assertion above vacuous, so the count is asserted too.
    Assert.ok(30 < checked, `too few examples extracted: ${checked}`)
  })


  // The claim each page makes about what its example EVALUATES TO,
  // re-derived from the engine. Structural comparison: the page owns
  // its own whitespace and key order.
  test('every-stated-result-is-the-engine-s', () => {
    let checked = 0
    for (const page of pages()) {
      page.blocks.forEach((b, i) => {
        const next = page.blocks[i + 1]
        if (!selfContained(b) || null == next || 'json' !== next.lang) {
          return
        }
        checked++
        const got = new Aontu().generate(b.body)
        Assert.deepEqual(got, JSON.parse(next.body),
          `${page.file} block ${i} does not generate what it states:\n` +
          `${b.body}\n--- stated ---\n${next.body}`)
      })
    }
    Assert.ok(5 < checked, `too few stated results extracted: ${checked}`)
  })

})
