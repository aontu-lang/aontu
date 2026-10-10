/* Copyright (c) 2026 Richard Rodger, MIT License */

// The format corpora of test/vectors/README.md. Each run counts the cases
// that agree with the corpus and, for each kind of difference, the cases
// of that kind, and requires the counts: a grammar change that moves one
// fails here, and a difference of no named kind fails as a kind of its own.

import { test } from 'node:test'
import Assert from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { formatOf, recognise } from '../dist/formatgrammar'


const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors')

// Where the first of a format's grammars that refuses the text stops, or -1.
function stop(name: string, text: string): number {
  for (const g of formatOf(name)[0]?.gs ?? []) {
    const at = recognise(g, text)
    Assert.notEqual(at, undefined, name + ' reached the step bound on ' + JSON.stringify(text))
    if (-1 !== at) {
      return at as number
    }
  }
  return -1
}

function counter(): [Record<string, number>, (k: string) => void] {
  const counts: Record<string, number> = {}
  return [counts, (k) => { counts[k] = (counts[k] ?? 0) + 1 }]
}


// RFC 6570's grammar admits a reserved operator (section 2.2) and a
// prefix on a list or a map (section 2.4.1); expansion refuses both.
function expansionOnly(template: string, variables: Record<string, unknown>): string {
  if (/\{[=,!@|]/.test(template)) {
    return 'a reserved operator'
  }
  const m = /\{[+#./;?&]?([^:}]+):[0-9]+\}/.exec(template)
  const v = null == m ? undefined : variables[m[1]]
  return null != v && 'object' === typeof v ? 'a prefix on a list or a map' : 'admitted, though invalid'
}

test('uritemplate-test-against-uri-template', () => {
  const [counts, count] = counter()
  for (const file of ['spec-examples.json', 'extended-tests.json', 'negative-tests.json']) {
    const groups = JSON.parse(Fs.readFileSync(Path.join(VECTORS, 'uritemplate-test', file), 'utf8'))
    for (const g of Object.values(groups) as any[]) {
      for (const [template, expansion] of g.testcases) {
        const valid = false !== expansion
        const admitted = -1 === stop('uri-template', template)
        count(file + ': ' + (valid === admitted ? 'agrees' :
          admitted ? expansionOnly(template, g.variables) : 'refused, though valid'))
      }
    }
  }
  Assert.deepStrictEqual(counts, {
    'spec-examples.json: agrees': 64,
    'extended-tests.json: agrees': 53,
    'negative-tests.json: agrees': 31,
    'negative-tests.json: a reserved operator': 3,
    'negative-tests.json: a prefix on a list or a map': 2,
  })
})


// The file writes a control character as its control picture.
function xmlText(s: string): string {
  return s.replace(/&#x([0-9A-Fa-f]+);/g, (_m, h) => {
    const c = parseInt(h, 16)
    return String.fromCodePoint(0x2400 <= c && c < 0x2420 ? c - 0x2400 : c)
  }).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'').replace(/&amp;/g, '&')
}

// The categories whose addresses RFC 5321's Mailbox admits.
const ISEMAIL_VALID = ['ISEMAIL_VALID_CATEGORY', 'ISEMAIL_DNSWARN', 'ISEMAIL_RFC5321']

test('isemail-against-email-and-idn-email', () => {
  const xml = Fs.readFileSync(Path.join(VECTORS, 'isemail', 'tests.xml'), 'utf8')
  const [counts, count] = counter()
  for (const m of xml.matchAll(/<test id="[0-9]+">([\s\S]*?)<\/test>/g)) {
    const field = (tag: string): string => xmlText(new RegExp('<' + tag + '>([^<]*)</' + tag + '>').exec(m[1])?.[1] ?? '')
    const valid = ISEMAIL_VALID.includes(field('category'))
    for (const name of ['email', 'idn-email']) {
      const admitted = -1 === stop(name, field('address'))
      count(name + ': ' + (valid === admitted ? 'agrees' :
        admitted && field('diagnosis').endsWith('TOOLONG') ? 'a size limit' : 'unexplained'))
    }
  }
  Assert.deepStrictEqual(counts, {
    'email: agrees': 157,
    'email: a size limit': 7,
    'idn-email: agrees': 157,
    'idn-email: a size limit': 7,
  })
})


// Each kind of difference UTS 46's toASCII and idn-hostname may have.
function idnaDifference(cps: string[], at: number, status: string): string {
  const past = (c: string | undefined): boolean => undefined !== c && 0x7f < (c.codePointAt(0) as number)
  if (-1 === at) {
    return /^\[A4_[12](, A4_[12])*\]$/.test(status) && cps.some(past) ?
      'the A-label form of a U-label too long' : 'admitted, though invalid'
  }
  return past(cps[at]) ? 'a code point past IDNA2008, or mapped to several' :
    '̸' === cps[at + 1] ? 'a character normalisation composes' : 'refused, though valid'
}

test('idnatestv2-against-idn-hostname', () => {
  const text = Fs.readFileSync(Path.join(VECTORS, 'idna', 'IdnaTestV2.txt'), 'utf8')
    .replaceAll('\r\n', '\n')
  Assert.ok(text.includes('\n# Version: 18.0.0\n'), 'IdnaTestV2.txt is not Unicode 18.0.0\'s')
  const [counts, count] = counter()
  for (const line of text.split('\n')) {
    if ('' === line.trim() || line.startsWith('#')) {
      continue
    }
    const cols = line.split(';').map((c) => c.trim())
    if (/\\u[Dd][89A-Fa-f]/.test(cols[0])) {
      count('ill-formed, not read')
      continue
    }
    const source = '""' === cols[0] ? '' :
      cols[0].replace(/\\u([0-9A-Fa-f]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    if (/xn--/i.test(source)) {
      count('an A-label, not read')
      continue
    }
    const status = '' === cols[4] ? cols[2] : cols[4]
    const at = stop('idn-hostname', source)
    count(('' === status || '[]' === status) === (-1 === at) ? 'agrees' :
      idnaDifference([...source], at, status))
  }
  Assert.deepStrictEqual(counts, {
    'ill-formed, not read': 2,
    'an A-label, not read': 2384,
    agrees: 3840,
    'a code point past IDNA2008, or mapped to several': 102,
    'a character normalisation composes': 40,
    'the A-label form of a U-label too long': 28,
  })
})
