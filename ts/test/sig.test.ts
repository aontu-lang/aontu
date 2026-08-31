/* Copyright (c) 2021-2026 Richard Rodger, MIT License */

// The signature registry's parity gates (docs/design/SIGNATURES.0.md,
// ADR-001). Three facts hold the design together: the inlined copy IS
// the shared declaration (byte identity), every declaration line
// ROUND-TRIPS through this port's parser (render(parse(line)) is the
// line — the same gate go/sig_test.go holds for the Go parser, which
// is what pins the two parsers to each other), and the declared names
// are exactly the built-in names the engine serves.

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { test, describe } from 'node:test'

import { expect } from './expect'

import { parseSigLine, parseSigText, renderSig } from '../dist/sig'
import { SIGDECL } from '../dist/sigdecl'
import { BUILTIN_FUNCS } from '../dist/lsp'


const SHARED = Path.join(__dirname, '..', '..', 'test', 'spec', 'signature.tsv')


describe('sig', () => {

  test('sigdecl-is-the-shared-declaration', () => {
    // Line endings are the checkout's business, not the declaration's:
    // a CRLF checkout (Windows autocrlf) must compare equal, the same
    // tolerance the shared spec runner extends to every .tsv.
    const norm = (s: string) => s.replace(/\r\n/g, '\n')
    const shared = Fs.readFileSync(SHARED, 'utf8')
    expect(norm(SIGDECL)).equal(norm(shared))
  })


  test('every-declaration-line-round-trips', () => {
    for (const rawline of SIGDECL.split('\n')) {
      const line = rawline.trim()
      if ('' === line || line.startsWith('#')) {
        continue
      }
      const sig = parseSigLine(line)
      expect(renderSig(sig)).equal(line)
    }
  })


  test('declared-names-are-the-builtin-names', () => {
    const reg = parseSigText(SIGDECL)
    const declared = Object.keys(reg).sort()
    const builtin = [...BUILTIN_FUNCS].sort()
    expect(declared).equal(builtin)
  })


  test('malformed-declarations-are-errors', () => {
    const bad = [
      '',
      'upper',
      'upper(s: string)',
      'upper(bogus s: string) : string',
      'upper(s: string) : string trailing',
    ]
    for (const line of bad) {
      expect(() => parseSigLine(line)).throw()
    }
    expect(() => parseSigText(
      'upper(s: string) : string\nupper(s: string) : string\n')).throw()
  })

})
