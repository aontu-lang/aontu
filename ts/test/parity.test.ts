/* Copyright (c) 2026 Richard Rodger, MIT License */

// The port mirrors TypeScript's STRUCTURE (ADR-001 rule 1), which no
// shared row can check: a shape difference answers the same bytes, so
// every row passes. A member with no twin is declared below and
// registered in DIVERGENCE.md; adding one to a port fails the build.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

const REPO = Path.join(__dirname, '..', '..')

type Shape = {
  what: string
  ts: { file: string, open: RegExp }
  go: { file: string, open: RegExp }
  both: string[]
  // Held by one port alone, mapped to why: a registered divergence.
  tsOnly: Record<string, string>
  goOnly: Record<string, string>
}

const WHY_POSITION =
  'a position is spelled as a row and column in TypeScript and as a ' +
  'byte offset in Go (DIVERGENCE.md, "A value\'s source position")'

const SHAPES: Shape[] = [
  {
    what: 'a value\'s source site',
    ts: { file: 'ts/src/site.ts', open: /^class Site \{$/ },
    go: { file: 'go/val.go', open: /^type site struct \{$/ },
    both: ['url', 'src', 'via'],
    tsOnly: { row: WHY_POSITION, col: WHY_POSITION, len: WHY_POSITION },
    goOnly: {
      sp: WHY_POSITION,
      spu: 'Go marks a position a clone carried; TypeScript does not',
    },
  },
  {
    what: 'the use a value arrived through (ALIASES.0.md A-1)',
    ts: { file: 'ts/src/site.ts', open: /^type ViaSite = \{$/ },
    go: { file: 'go/val.go', open: /^type viaSite struct \{$/ },
    both: ['url', 'name'],
    tsOnly: { row: WHY_POSITION, col: WHY_POSITION, src: WHY_POSITION },
    goOnly: { sp: WHY_POSITION },
  },
]

// Declared members only: a TypeScript class stops at its constructor,
// which assigns what the declarations above already named.
function members(file: string, open: RegExp): string[] {
  const abs = Path.join(REPO, file)
  const lines = Fs.readFileSync(abs, 'utf8').split('\n')
  const at = lines.findIndex((l) => open.test(l.trim()))
  Assert.notEqual(at, -1, `no declaration matching ${open} in ${file}`)

  const out: string[] = []
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if ('}' === line || '};' === line || line.startsWith('constructor')) {
      break
    }
    // `row: number`, `row?: ViaSite` and `url string` all count.
    for (const m of line.matchAll(/(?:^|,\s*)([A-Za-z_]\w*)\s*\??\s*[:\s]/g)) {
      if (!line.startsWith('//')) {
        out.push(m[1])
      }
    }
  }
  return out
}


describe('parity-structure', () => {

  for (const shape of SHAPES) {
    test(`${shape.what} is one shape in both ports`, () => {
      const ts = members(shape.ts.file, shape.ts.open)
      const go = members(shape.go.file, shape.go.open)
      Assert.ok(0 < ts.length, `read no members from ${shape.ts.file}`)
      Assert.ok(0 < go.length, `read no members from ${shape.go.file}`)

      const declared = (side: string[], both: string[], only: string[]) =>
        [...side].sort().filter((m) => !both.includes(m) && !only.includes(m))

      // Neither shared nor declared port-only is drift.
      Assert.deepEqual(
        declared(ts, shape.both, Object.keys(shape.tsOnly)), [],
        `${shape.ts.file} has members ${shape.go.file} does not, and this` +
        ' gate does not declare them. Mirror them in the port, or declare' +
        ' them here and register the divergence in DIVERGENCE.md.')

      Assert.deepEqual(
        declared(go, shape.both, Object.keys(shape.goOnly)), [],
        `${shape.go.file} has members ${shape.ts.file} does not, and this` +
        ' gate does not declare them. Mirror them in the port, or declare' +
        ' them here and register the divergence in DIVERGENCE.md.')

      // A claimed member must be there, or the gate passes vacuously.
      for (const m of shape.both) {
        Assert.ok(ts.includes(m), `${shape.ts.file} has no member ${m}`)
        Assert.ok(go.includes(m), `${shape.go.file} has no member ${m}`)
      }
      for (const m of Object.keys(shape.tsOnly)) {
        Assert.ok(ts.includes(m),
          `${shape.ts.file} has no member ${m}: drop it from tsOnly`)
      }
      for (const m of Object.keys(shape.goOnly)) {
        Assert.ok(go.includes(m),
          `${shape.go.file} has no member ${m}: drop it from goOnly`)
      }
    })
  }


  // A reader who finds a declaration must find the entry deciding it.
  test('every-declared-divergence-is-in-the-ledger', () => {
    const ledger = Fs.readFileSync(Path.join(REPO, 'DIVERGENCE.md'), 'utf8')
    const missing: string[] = []
    for (const shape of SHAPES) {
      const why = [
        ...Object.values(shape.tsOnly), ...Object.values(shape.goOnly),
      ]
      for (const reason of [...new Set(why)]) {
        const cited = /DIVERGENCE\.md, "([^"]+)"/.exec(reason)
        if (null == cited) {
          continue
        }
        if (!ledger.includes(cited[1])) {
          missing.push(cited[1])
        }
      }
    }
    Assert.deepEqual(missing, [],
      'this gate declares a divergence whose DIVERGENCE.md entry is not' +
      ' there:\n' + missing.join('\n'))
  })

})
