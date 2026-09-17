/* Copyright (c) 2026 Richard Rodger, MIT License */

// The render matrix: test/render/cases.json, held to the same
// expectations by go/cmd/aontu/render_matrix_test.go. A change to one
// port's render output fails the other port too.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { runRender } from '../dist/cli'

const CASES = Path.join(__dirname, '..', '..', 'test', 'render', 'cases.json')

type Step = {
  args?: string[], code?: number, out?: string, err?: string,
  edit?: { [path: string]: string }, remove?: string[],
}

type Case = {
  name: string,
  files: { [path: string]: string },
  steps: Step[],
  after?: { [path: string]: string },
}


function norm(text: string, dir: string): string {
  const slashed = text.split('\\').join('/')
  return slashed.split(dir.split('\\').join('/')).join('{dir}')
    .replace(/"version": "[^"]*"/g, '"version": "{version}"')
}


function write(dir: string, files?: { [path: string]: string }) {
  for (const [rel, content] of Object.entries(files ?? {})) {
    const at = Path.join(dir, rel)
    Fs.mkdirSync(Path.dirname(at), { recursive: true })
    Fs.writeFileSync(at, content)
  }
}


async function capture(args: string[]) {
  const so = process.stdout.write
  const se = process.stderr.write
  let out = ''
  let err = ''
  ;(process.stdout as any).write = (s: any) => ((out += s), true)
  ;(process.stderr as any).write = (s: any) => ((err += s), true)
  try {
    const code = await runRender(args)
    return { out, err, code }
  }
  finally {
    process.stdout.write = so
    process.stderr.write = se
  }
}


describe('render-matrix', () => {

  const cases: Case[] = JSON.parse(Fs.readFileSync(CASES, 'utf8')).cases
  Assert.ok(0 < cases.length, 'the render matrix is empty')

  for (const c of cases) {
    test(c.name, async () => {
      const dir = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-matrix-')))
      write(dir, c.files)

      let n = 0
      for (const step of c.steps) {
        n++
        if (null != step.edit || null != step.remove) {
          write(dir, step.edit)
          for (const rel of step.remove ?? []) {
            Fs.rmSync(Path.join(dir, rel))
          }
          continue
        }
        const args = (step.args ?? []).map((a) => a.split('{dir}').join(dir))
        const got = await capture(args)
        const at = `${c.name} step ${n}`
        if (null != step.out) Assert.equal(norm(got.out, dir), step.out, at + ' stdout')
        if (null != step.err) Assert.equal(norm(got.err, dir), step.err, at + ' stderr')
        if (null != step.code) Assert.equal(got.code, step.code, at + ' exit code')
      }

      for (const [rel, want] of Object.entries(c.after ?? {})) {
        const at = Path.join(dir, rel)
        Assert.equal(Fs.existsSync(at) ? Fs.readFileSync(at, 'utf8') : '<absent>',
          want, `${c.name}: ${rel}`)
      }
    })
  }
})
