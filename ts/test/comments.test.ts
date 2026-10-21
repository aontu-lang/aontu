/* Copyright (c) 2026 Richard Rodger, MIT License */

// The comment gate of DEV-PROCESS.md, in the suite so that CI runs it
// on every push. `make comments` and .githooks/pre-push call the same
// checker, admin/scripts/comment-gate.cjs.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

const REPO = Path.join(__dirname, '..', '..')

const GATE = Path.join(REPO, 'admin', 'scripts')

const gate = require(Path.join(GATE, 'comment-gate.cjs'))

type Finding = {
  file: string, line: number, rule: string, detail: string, excerpt: string
}

const SHOWN = 25


function render(findings: Finding[]) {
  const shown = findings.slice(0, SHOWN)
  const rest = findings.length - shown.length
  const head = shown
    .map((f) => `  ${f.file}:${f.line}: ${f.rule}: ${f.detail}`)
    .join('\n')
  return `comment gate: ${findings.length} finding(s)\n${head}`
    + (0 < rest ? `\n  ... ${rest} more (run: make comments)` : '')
}


describe('comments', () => {

  test('gate', () => {
    const findings: Finding[] = gate.checkAll()
      .flatMap((report: { findings: Finding[] }) => report.findings)
    Assert.equal(findings.length, 0, render(findings))
  })


  test('scope', () => {
    const files: string[] = gate.sourceFiles()

    for (const covered of [
      'ts/src/aontu.ts',
      'ts/test/comments.test.ts',
      'editors/vscode/src/extension.ts',
      'go/aontu.go',
      'go/cmd/aontu/main.go',
      'aontu/view/view.aontu',
    ]) {
      Assert.ok(files.includes(covered), `not gated: ${covered}`)
    }

    for (const excluded of [
      'ts/src/sigdecl.ts',
      'ts/src/helpdoc.ts',
      'admin/scripts/comment-gate.cjs',
      'go/aontumodel/view/view.aontu',
      'use-cases/17-lambda-handlers/handler.ts',
      'test/system/rb-solar/ref/validate.ts',
    ]) {
      Assert.ok(Fs.existsSync(Path.join(REPO, excluded)), `gone: ${excluded}`)
      Assert.ok(!files.includes(excluded), `gated: ${excluded}`)
    }

    Assert.ok(files.every((f) => /\.(ts|go|rs|aontu)$/.test(f)),
      'a non-source file is gated')
    Assert.ok(!files.some((f) => f.startsWith('ts/dist')), 'build output gated')

    const config = JSON.parse(
      Fs.readFileSync(Path.join(GATE, 'comment-gate.json'), 'utf8'))
    for (const listed of [...config.generated, ...config.fixtures, config.decisions]) {
      Assert.ok(Fs.existsSync(Path.join(REPO, listed)), `listed and gone: ${listed}`)
    }
  })


  test('lexer', () => {
    const source = [
      'const url = "http://x/y" // trailing',
      'const re = /a\\/\\/b/',
      '/* two',
      '   lines */',
    ].join('\n')

    const { comments, codeLines } = gate.lex(source, 'js')

    Assert.deepEqual(
      comments.map((c: { kind: string, start: number, end: number }) =>
        [c.kind, c.start, c.end]),
      [['line', 1, 1], ['block', 3, 4]])
    Assert.equal(codeLines, 2)
  })


  test('lexer-syntaxes', () => {
    const starts = (scan: { comments: { start: number }[] }) =>
      scan.comments.map((c) => c.start)

    const hash = gate.lex([
      'a: "x # y" # trailing',
      'b: `raw # not',
      '# still raw`',
      '# own line',
    ].join('\n'), 'hash')
    Assert.deepEqual(starts(hash), [1, 4])
    Assert.equal(hash.codeLines, 2)

    // A quote left open ends with its line, so the comment below it is
    // counted on its own line.
    Assert.deepEqual(starts(gate.lex("let a = 'x\n// two\nlet b = 1", 'c')), [2])

    const model = gate.checkText('aontu/view/view.aontu', '# a note\na: 1\n')
    Assert.deepEqual(model.findings, [])
    Assert.equal(model.words, 2)

    Assert.throws(() => gate.checkText('ts/scripts/test.cjs', '// x\n'),
      /not source in comment-gate.json/)
  })


  test('exempt', () => {
    const source = [
      '/* Copyright (c) 2026 Richard Rodger, MIT License */',
      '//go:build linux',
      'package aontu',
    ].join('\n')

    const findings = gate.checkText('go/probe.go', source).findings
    Assert.deepEqual(findings, [])
  })
})
