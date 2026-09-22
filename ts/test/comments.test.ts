/* Copyright (c) 2026 Richard Rodger, MIT License */

// The ADR-032 gate, in the suite so that CI runs it on every push.
// `make comments` and .githooks/pre-push call the same checker.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

const REPO = Path.join(__dirname, '..', '..')

const gate = require(Path.join(REPO, 'ts', 'scripts', 'comment-gate.cjs'))

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
  return `ADR-032: ${findings.length} comment finding(s)\n${head}`
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
    ]) {
      Assert.ok(files.includes(covered), `not gated: ${covered}`)
    }

    for (const excluded of [
      'ts/src/sigdecl.ts',
      'ts/src/helpdoc.ts',
      'ts/scripts/comment-gate.cjs',
      'use-cases/17-lambda-handlers/handler.ts',
      'test/system/rb-solar/ref/validate.ts',
    ]) {
      Assert.ok(Fs.existsSync(Path.join(REPO, excluded)), `gone: ${excluded}`)
      Assert.ok(!files.includes(excluded), `gated: ${excluded}`)
    }

    Assert.ok(files.every((f) => /\.(ts|go|rs|aontu)$/.test(f)),
      'a non-source file is gated')
    Assert.ok(!files.some((f) => f.startsWith('ts/dist')), 'build output gated')
  })


  test('lexer', () => {
    const source = [
      'const url = "http://x/y" // trailing',
      'const re = /a\\/\\/b/',
      '/* two',
      '   lines */',
    ].join('\n')

    const { comments, codeLines } = gate.lex(source, 'ts')

    Assert.deepEqual(
      comments.map((c: { kind: string, start: number, end: number }) =>
        [c.kind, c.start, c.end]),
      [['line', 1, 1], ['block', 3, 4]])
    Assert.equal(codeLines, 2)
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
