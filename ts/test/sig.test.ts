/* Copyright (c) 2021-2026 Richard Rodger, MIT License */


import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { test, describe } from 'node:test'

import { expect } from './expect'

import { parseSigLine, parseSigText, renderSig } from '../dist/sig'
import { SIGDECL } from '../dist/sigdecl'
import { BUILTIN_FUNCS } from '../dist/lsp'
import { Aontu } from '../dist/aontu'


const SHARED = Path.join(__dirname, '..', '..', 'test', 'spec', 'signature.tsv')


describe('sig', () => {

  test('sigdecl-is-the-shared-declaration', () => {
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


  // A declared interval with no wording of its own fails here.
  test('every-declared-interval-is-worded', () => {
    const wording: Record<string, string> = {
      '0,0': 'no arguments',
      '0,1': 'no arguments or one',
      '0,2': 'at most two arguments',
      '1,1': 'exactly one argument',
      '1,2': 'one argument or two',
      '1,3': 'one to three arguments',
      '1,-1': 'one or more arguments',
      '2,2': 'exactly two arguments',
      '2,3': 'two or three arguments',
      '2,-1': 'two or more arguments',
      '3,3': 'exactly three arguments',
      '3,-1': 'three or more arguments',
    }
    const reg = parseSigText(SIGDECL)
    for (const name of Object.keys(reg)) {
      let lo = 0
      let hi = 0
      for (const a of reg[name].args) {
        lo += true === a.opt ? 0 : true === a.rest && undefined !== a.group ? a.group.length : 1
        hi = true === a.rest || -1 === hi ? -1 : hi + 1
      }
      const want = wording[lo + ',' + hi]
      if (undefined === want) {
        throw new Error(name + ' has an interval with no wording: ' + lo + ',' + hi)
      }
      const given = 0 < lo ? lo - 1 : hi + 1
      const src = 'x:' + name + '(' + Array(given).fill('1').join(',') + ')'
      let msg = ''
      try {
        new Aontu().generate(src)
      }
      catch (err: any) {
        msg = String(err.message)
      }
      expect(msg).include(name + ' takes ' + want + ', but was given ' + given)
    }
  })


  test('declared-names-are-the-builtin-names', () => {
    const reg = parseSigText(SIGDECL)
    const declared = Object.keys(reg).sort()
    const builtin = [...BUILTIN_FUNCS].sort()
    expect(declared).equal(builtin)
  })


  test('canon-calls-are-declared-builtins', () => {
    const declared = parseSigText(SIGDECL)
    const dir = Path.dirname(SHARED)
    const undeclared: string[] = []
    let rows = 0
    for (const file of Fs.readdirSync(dir).filter((f) => f.endsWith('.tsv')).sort()) {
      for (const line of Fs.readFileSync(Path.join(dir, file), 'utf8').split('\n')) {
        const cols = line.split('\t')
        if (line.startsWith('#') || ('canon' !== cols[1] && 'hcanon' !== cols[1])) {
          continue
        }
        rows++
        const text = cols[3].replace(/"(?:[^"\\]|\\.)*"/g, '""')
        for (const m of text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g)) {
          if (!(m[1] in declared)) {
            undeclared.push(file + ':' + cols[0] + ' writes ' + m[1] + '(')
          }
        }
      }
    }
    expect(0 < rows).equal(true)
    expect(undeclared).equal([])
  })


  // Canon writes a call the document wrote, never another in
  // its place. What it may write beside one is listed: the range a count
  // is read as, the value super() answers, and move()'s default.
  test('canon-writes-no-call-the-source-lacks', () => {
    const declared = parseSigText(SIGDECL)
    const beside: Record<string, string[]> = {
      min: ['len', 'contains'], max: ['len', 'contains'], empty: ['super'], pref: ['move'],
    }
    const calls = (text: string) => new Set(Array.from(
      text.replace(/"(?:[^"\\]|\\.)*"/g, '""').matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g),
      (m) => m[1]))
    const dir = Path.dirname(SHARED)
    const strays: string[] = []
    let rows = 0
    for (const file of Fs.readdirSync(dir).filter((f) => f.endsWith('.tsv')).sort()) {
      for (const line of Fs.readFileSync(Path.join(dir, file), 'utf8').split('\n')) {
        const cols = line.split('\t')
        // An included model's text is not in the row.
        if (line.startsWith('#') || ('canon' !== cols[1] && 'hcanon' !== cols[1]) ||
          cols[2].includes('@"')) {
          continue
        }
        rows++
        const written = calls(cols[2])
        for (const name of calls(cols[3])) {
          if (name in declared && !written.has(name) &&
            !(beside[name] ?? []).some((b) => written.has(b))) {
            strays.push(file + ':' + cols[0] + ' writes ' + name + '(')
          }
        }
      }
    }
    expect(0 < rows).equal(true)
    expect(strays).equal([])
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
