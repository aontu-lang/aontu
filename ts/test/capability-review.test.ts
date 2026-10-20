/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'


const REPO = Path.join(__dirname, '..', '..')
const REVIEW = Path.join(REPO, 'sketch', 'capability-review')


function read(...parts: string[]): string {
  return Fs.readFileSync(Path.join(...parts), 'utf8')
    .replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}


// A markdown table row, split on the pipes that are not escaped: a cell
// may hold `--format text\|json`, and several already do.
function cells(row: string): string[] {
  return row.split(/(?<!\\)\|/)
}


// The status vocabulary the register uses, in the order a row must be
// read: a row that says "LANDED, RESHAPED by ADR-014" is landed, one
// that says "RETIRED as designed" is retired, and "NOT STARTED" must be
// tested before "STARTED" could ever match anything.
type Bucket = 'landed' | 'partial' | 'notStarted' | 'retired'

function bucketOf(status: string): Bucket | null {
  const s = status.toUpperCase()
  if (s.includes('NOT STARTED')) {
    return 'notStarted'
  }
  if (s.includes('RETIRED') || s.includes('SUPERSEDED') ||
    s.includes('REMOVED')) {
    return 'retired'
  }
  if (s.includes('PARTIAL')) {
    return 'partial'
  }
  if (s.includes('LANDED')) {
    return 'landed'
  }
  return null
}


type Row = { gap: string; phase: string; status: string; pin: string }

// Every phase row in the register, tagged with the `## G<n>` section it
// sits under.
function phaseRows(md: string): Row[] {
  const out: Row[] = []
  let gap = ''
  for (const line of md.split('\n')) {
    const head = /^## (G\d+)\b/.exec(line)
    if (null != head) {
      gap = head[1]
    }
    if (line.startsWith('| **') && '' !== gap) {
      const col = cells(line)
      if (5 <= col.length) {
        out.push({ gap, phase: col[1].trim(), status: col[3].trim(), pin: col[4] })
      }
    }
  }
  return out
}


function summaryTable(md: string): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const line of md.split('\n')) {
    const m =
      /^\| \[(G\d+)\]\([^)]*\) \|[^|]*\|[^|]*\| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/
        .exec(line)
    if (null != m) {
      out.set(m[1], [+m[2], +m[3], +m[4], +m[5]])
    }
  }
  return out
}


function totalRow(md: string): number[] | null {
  const m = /^\| \| \| \*\*total\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|$/m
    .exec(md)
  return null == m ? null : [+m[1], +m[2], +m[3], +m[4]]
}


// Every gap document on disk, by its number.
function gapDocs(): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of Fs.readdirSync(REVIEW).sort()) {
    const m = /^g(\d+)-[a-z0-9-]+\.md$/.exec(file)
    if (null != m) {
      out.set('G' + m[1], file)
    }
  }
  return out
}


const PROGRESS = read(REVIEW, 'progress.md')
const INDEX = read(REVIEW, 'index.md')


describe('capability-review', () => {

  test('there-are-gap-documents-to-check', () => {
    Assert.ok(9 < gapDocs().size,
      `only ${gapDocs().size} gap documents found; has the layout moved?`)
  })

  // EVERY ROW CLASSIFIES. A status word the register does not use is
  // either a typo or a new vocabulary item, and either way the counts
  // below would silently stop meaning anything.
  test('every-phase-row-carries-a-known-status', () => {
    for (const row of phaseRows(PROGRESS)) {
      Assert.ok(null != bucketOf(row.status),
        `${row.gap} phase ${row.phase}: unrecognised status ` +
        `"${row.status.slice(0, 60)}"`)
    }
  })

  test('the-summary-table-matches-the-rows-it-summarises', () => {
    const table = summaryTable(PROGRESS)
    const derived = new Map<string, number[]>()
    for (const row of phaseRows(PROGRESS)) {
      const at = derived.get(row.gap) ?? [0, 0, 0, 0]
      const bucket = bucketOf(row.status)
      at[['landed', 'partial', 'notStarted', 'retired']
        .indexOf(bucket as string)]++
      derived.set(row.gap, at)
    }

    Assert.deepEqual([...table.keys()].sort(), [...derived.keys()].sort(),
      'the summary table and the sections below list different gaps')

    for (const [gap, counts] of table) {
      Assert.deepEqual(counts, derived.get(gap),
        `${gap}: the summary table says ` +
        `landed/partial/not-started/retired ${counts.join('/')}, ` +
        `the rows below say ${derived.get(gap)?.join('/')}`)
    }
  })

  test('the-total-row-is-the-column-sums', () => {
    const table = summaryTable(PROGRESS)
    const want = [0, 0, 0, 0]
    for (const counts of table.values()) {
      counts.forEach((n, i) => { want[i] += n })
    }
    Assert.deepEqual(totalRow(PROGRESS), want,
      'the **total** row is not the sum of the gap rows')
  })

  test('every-gap-document-is-registered-and-indexed', () => {
    const docs = gapDocs()
    const table = summaryTable(PROGRESS)

    for (const [gap, file] of docs) {
      Assert.ok(table.has(gap),
        `${file} exists and ${gap} has no row in the summary table`)
      Assert.ok(new RegExp(`^## ${gap}\\b`, 'm').test(PROGRESS),
        `${file} exists and progress.md has no "## ${gap}" section`)
      Assert.ok(INDEX.includes(`(${file})`),
        `${file} exists and index.md does not link it`)
      Assert.ok(new RegExp(`^\\| ${gap} \\|`, 'm').test(INDEX),
        `${file} exists and index.md has no ${gap} row`)
    }

    for (const gap of table.keys()) {
      Assert.ok(docs.has(gap),
        `the summary table has a ${gap} row and no g${gap.slice(1)}-*.md`)
    }
  })

  test('every-landed-row-pins-something', () => {
    for (const row of phaseRows(PROGRESS)) {
      if ('landed' !== bucketOf(row.status)) {
        continue
      }
      Assert.ok(row.pin.includes('`') || row.pin.includes(']('),
        `${row.gap} phase ${row.phase} is LANDED and its pin cites no ` +
        `path, symbol or link: "${row.pin.trim().slice(0, 80)}"`)
    }
  })

  test('the-gap-range-is-current-everywhere-it-is-quoted', () => {
    const highest = Math.max(
      ...[...gapDocs().keys()].map((g) => +g.slice(1)))
    const want = `G1–G${highest}`
    for (const file of [
      'AGENTS.md', 'CLAUDE.md',
      'sketch/capability-review/index.md',
      'sketch/capability-review/progress.md',
    ]) {
      const md = read(REPO, file)
      const quoted: string[] = md.match(/G1[–-]G\d+/g) ?? []
      Assert.ok(quoted.includes(want),
        `${file} never quotes the current range ${want}; ` +
        `it quotes ${0 === quoted.length ? 'none' : quoted.join(', ')}`)
      for (const q of quoted) {
        const named = +(/\d+$/.exec(q) as RegExpExecArray)[0]
        Assert.ok(named <= highest,
          `${file} says ${q}; there are only ${highest} gap documents`)
      }
    }
  })

  // A POINTER THAT DOES NOT RESOLVE IS WORSE THAN NO POINTER -- the
  // rule ts/test/skill.test.ts already applies to docs/skill/, applied
  // to the working documents the prose gates leave out.
  test('every-link-in-the-review-resolves', () => {
    let checked = 0
    for (const file of Fs.readdirSync(REVIEW)) {
      if (!file.endsWith('.md')) {
        continue
      }
      const md = read(REVIEW, file)
      for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
        const href = m[1]
        if (href.startsWith('http') || href.startsWith('#')) {
          continue
        }
        // A link may carry an anchor; the file half is what exists.
        const target = Path.resolve(REVIEW, href.split('#')[0])
        Assert.ok(Fs.existsSync(target),
          `sketch/capability-review/${file}: broken link ${href}`)
        checked++
      }
    }
    Assert.ok(100 < checked, `only ${checked} links checked; has the shape moved?`)
  })

})
