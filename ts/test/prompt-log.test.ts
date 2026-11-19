/* Copyright (c) 2026 Richard Rodger, MIT License */

// The log merges with git's union driver, which writes a line once when
// both branches add it at the same place. Entries that end alike can
// lose a closing fence, and entries that begin alike can be woven into
// one, a heading left with no prompt under it. Each entry is checked
// here so that a broken merge fails on its branch.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

const LOG = Path.join(__dirname, '..', '..', 'sketch', 'PROMPT-LOG.md')

const HEADING = /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC · /
const OPENING = /^(`{3,})/

type Entry = { heading: string, line: number, blocks: number, unclosed: boolean }

function entries(md: string): Entry[] {
  const found: Entry[] = []
  const lines = md.split('\n')
  let entry: Entry | null = null
  let fence: string | null = null
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index]
    if (HEADING.test(text)) {
      if (null != entry && null != fence) {
        entry.unclosed = true
      }
      fence = null
      entry = { heading: text.slice(3), line: index + 1, blocks: 0, unclosed: false }
      found.push(entry)
    }
    else if (null == fence) {
      const opening = OPENING.exec(text)
      if (null != opening && null != entry) {
        fence = opening[1]
        entry.blocks++
      }
    }
    else if (text.trimEnd() === fence) {
      fence = null
    }
  }
  if (null != entry && null != fence) {
    entry.unclosed = true
  }
  return found
}


describe('prompt-log', () => {

  test('every-entry-holds-one-closed-fence', () => {
    const all = entries(Fs.readFileSync(LOG, 'utf8'))
    Assert.ok(all.length > 0, 'no entries read from sketch/PROMPT-LOG.md')
    const broken = all
      .filter((e) => e.unclosed || 1 !== e.blocks)
      .map((e) => `line ${e.line}: ${e.heading} (`
        + (e.unclosed ? 'fence left open' : `${e.blocks} fenced blocks`) + ')')
    Assert.deepEqual(broken, [],
      'Each entry is a heading and one fenced prompt, closed before the '
      + 'next heading. Restore a damaged entry from the last commit that '
      + 'held it whole (DEV-PROCESS.md, "The prompt log").')
  })

  test('the-check-finds-each-damage', () => {
    const head = (t: string) => `## 2026-11-19 10:00:0${t} UTC · Claude Code · s`
    const closed = [head('1'), '', '```text', 'a', '```', ''].join('\n')
    Assert.deepEqual(entries(closed).map((e) => [e.blocks, e.unclosed]), [[1, false]])

    const open = [head('1'), '', '```text', 'a', '', head('2'), '', '```text', 'b', '```'].join('\n')
    Assert.deepEqual(entries(open).map((e) => [e.blocks, e.unclosed]),
      [[1, true], [1, false]])

    const woven = [head('1'), head('2'), '', '```text', 'a', '```'].join('\n')
    Assert.deepEqual(entries(woven).map((e) => e.blocks), [0, 1])

    const longer = [head('1'), '', '````text', '```', 'a', '```', '````'].join('\n')
    Assert.deepEqual(entries(longer).map((e) => [e.blocks, e.unclosed]), [[1, false]])

    const last = [head('1'), '', '```text', 'a'].join('\n')
    Assert.deepEqual(entries(last).map((e) => e.unclosed), [true])
  })
})
