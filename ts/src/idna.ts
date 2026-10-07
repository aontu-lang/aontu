/* Copyright (c) 2026 Richard Rodger, MIT License */

// IDNA2008 over the committed table (test/spec/files/idna.txt): UTS 46
// mapping and NFC, Punycode, and the label rules of RFC 5891, RFC 5892
// and RFC 5893. Twin of go/idna.go.

import { IDNATABLE } from './idnatable'


type Ranges = { lo: number[], hi: number[], v: string[] }

type Table = {
  status: Ranges
  category: Ranges
  mark: Ranges
  bidi: Ranges
  joining: Ranges
  script: Ranges
  ccc: Ranges
  exclusion: Ranges
  mapping: Map<number, number[]>
  decomposition: Map<number, number[]>
  composition: Map<string, number>
}


let table: Table | undefined = undefined


function load(): Table {
  const sections: Record<string, string[][]> = {}
  let at: string[][] = []
  for (const line of IDNATABLE.split('\n')) {
    if (line.startsWith('@')) {
      at = sections[line.substring(1, line.indexOf(' '))] = []
    }
    else if ('' !== line && !line.startsWith('#')) {
      at.push(line.split(' '))
    }
  }
  const ranges = (name: string): Ranges => {
    const r: Ranges = { lo: [], hi: [], v: [] }
    for (const [span, v] of sections[name]) {
      const [lo, hi] = span.split('-')
      r.lo.push(parseInt(lo, 16))
      r.hi.push(parseInt(hi ?? lo, 16))
      r.v.push(v)
    }
    return r
  }
  const maps = (name: string) => new Map(sections[name].map(([c, ...to]) =>
    [parseInt(c, 16), to.map((h) => parseInt(h, 16))]))
  const t: Table = {
    status: ranges('status'), category: ranges('category'),
    mark: ranges('mark'), bidi: ranges('bidi'), joining: ranges('joining'),
    script: ranges('script'), ccc: ranges('ccc'),
    exclusion: ranges('exclusion'),
    mapping: maps('mapping'), decomposition: maps('decomposition'),
    composition: new Map(),
  }
  for (const [c, to] of t.decomposition) {
    if (2 === to.length && undefined === find(t.exclusion, c)) {
      t.composition.set(to[0] + ',' + to[1], c)
    }
  }
  return t
}


function find(r: Ranges, c: number): string | undefined {
  let a = 0
  let b = r.lo.length - 1
  while (a <= b) {
    const m = (a + b) >> 1
    if (c < r.lo[m]) {
      b = m - 1
    }
    else if (r.hi[m] < c) {
      a = m + 1
    }
    else {
      return r.v[m]
    }
  }
  return undefined
}


function tab(): Table {
  return table ??= load()
}


const ccc = (c: number) => Number(find(tab().ccc, c) ?? 0)


// Hangul syllables decompose and compose by arithmetic, not by table.
const SBASE = 0xac00
const LBASE = 0x1100
const VBASE = 0x1161
const TBASE = 0x11a7
const TCOUNT = 28
const NCOUNT = 588
const SCOUNT = 11172


function decompose(c: number, out: number[]): void {
  const s = c - SBASE
  if (0 <= s && s < SCOUNT) {
    out.push(LBASE + Math.floor(s / NCOUNT), VBASE + Math.floor((s % NCOUNT) / TCOUNT))
    if (0 !== s % TCOUNT) {
      out.push(TBASE + s % TCOUNT)
    }
    return
  }
  const to = tab().decomposition.get(c)
  if (undefined === to) {
    out.push(c)
  }
  else {
    to.forEach((d) => decompose(d, out))
  }
}


function compose(a: number, b: number): number | undefined {
  const l = a - LBASE
  const v = b - VBASE
  if (0 <= l && l < 19 && 0 <= v && v < 21) {
    return SBASE + (l * 21 + v) * TCOUNT
  }
  const s = a - SBASE
  const t = b - TBASE
  if (0 <= s && s < SCOUNT && 0 === s % TCOUNT && 0 < t && t < TCOUNT) {
    return a + t
  }
  return tab().composition.get(a + ',' + b)
}


// UAX 15: the canonical decomposition, its marks in canonical order,
// and every pair not blocked composed again.
function nfc(cps: number[]): number[] {
  const d: number[] = []
  cps.forEach((c) => decompose(c, d))
  for (let i = 1; i < d.length; i++) {
    const cc = ccc(d[i])
    let j = i
    while (0 < cc && 0 < j && cc < ccc(d[j - 1])) {
      [d[j - 1], d[j]] = [d[j], d[j - 1]]
      j--
    }
  }
  const out: number[] = []
  let starter = -1
  let last = 0
  for (const c of d) {
    const cc = ccc(c)
    const open = 0 <= starter &&
      (out.length - 1 === starter || (0 !== last && last < cc))
    const both = open ? compose(out[starter], c) : undefined
    if (undefined !== both) {
      out[starter] = both
      continue
    }
    if (0 === cc) {
      starter = out.length
    }
    out.push(c)
    last = cc
  }
  return out
}


// RFC 3492, section 6.
const BASE = 36
const TMIN = 1
const TMAX = 26
const MAXINT = 0x7fffffff


function adapt(delta: number, n: number, first: boolean): number {
  let d = Math.floor(delta / (first ? 700 : 2))
  d += Math.floor(d / n)
  let k = 0
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN))
    k += BASE
  }
  return k + Math.floor((BASE - TMIN + 1) * d / (d + 38))
}


function digit(c: number): number {
  return 0x30 <= c && c <= 0x39 ? c - 22 :
    0x41 <= c && c <= 0x5a ? c - 0x41 :
      0x61 <= c && c <= 0x7a ? c - 0x61 : BASE
}


// Undefined where the ASCII text is not Punycode or decodes past a
// scalar value; a delimiter at the very start is a digit, and refuses.
// The bound on i bounds w too.
function punyDecode(s: string): number[] | undefined {
  const end = s.lastIndexOf('-')
  const out: number[] = []
  for (let k = 0; k < end; k++) {
    out.push(s.charCodeAt(k))
  }
  let n = 0x80
  let i = 0
  let bias = 72
  for (let p = 0 < end ? end + 1 : 0; p < s.length;) {
    const old = i
    let w = 1
    for (let k = BASE; ; k += BASE) {
      const dg = p < s.length ? digit(s.charCodeAt(p++)) : BASE
      if (BASE <= dg || MAXINT < i + dg * w) {
        return undefined
      }
      i += dg * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (dg < t) {
        break
      }
      w *= BASE - t
    }
    bias = adapt(i - old, out.length + 1, 0 === old)
    n += Math.floor(i / (out.length + 1))
    i %= out.length + 1
    if (0x10ffff < n || (0xd800 <= n && n <= 0xdfff)) {
      return undefined
    }
    out.splice(i++, 0, n)
  }
  return out
}


function punyEncode(cps: number[]): string {
  let out = cps.filter((c) => c < 0x80).map((c) => String.fromCharCode(c)).join('')
  const basic = out.length
  if (0 < basic) {
    out += '-'
  }
  let n = 0x80
  let delta = 0
  let bias = 72
  for (let h = basic; h < cps.length;) {
    const m = Math.min(...cps.filter((c) => c >= n))
    delta += (m - n) * (h + 1)
    n = m
    for (const c of cps) {
      if (c < n) {
        delta++
      }
      else if (c === n) {
        let q = delta
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
          if (q < t) {
            break
          }
          const dg = t + (q - t) % (BASE - t)
          out += digitChar(dg)
          q = Math.floor((q - t) / (BASE - t))
        }
        out += digitChar(q)
        bias = adapt(delta, h + 1, h === basic)
        delta = 0
        h++
      }
    }
    delta++
    n++
  }
  return out
}


function digitChar(d: number): string {
  return String.fromCharCode(d < 26 ? d + 0x61 : d + 22)
}


const isAscii = (cps: number[]) => cps.every((c) => c < 0x80)

const lower = (c: number) => 0x41 <= c && c <= 0x5a ? c + 0x20 : c

const ACE = [0x78, 0x6e, 0x2d, 0x2d]

const hasAce = (cps: number[]) =>
  4 <= cps.length && ACE.every((a, i) => a === lower(cps[i]))


// RFC 5892 appendix A: the rule for each CONTEXTJ and CONTEXTO code
// point at position i of its label.
function context(label: number[], i: number): boolean {
  const t = tab()
  const c = label[i]
  const before = label[i - 1]
  const after = label[i + 1]
  if (0x200c === c || 0x200d === c) {
    if (undefined !== before && 9 === ccc(before)) {
      return true
    }
    if (0x200d === c) {
      return false
    }
    const jt = (k: number) => find(t.joining, label[k])
    let a = i - 1
    while (0 <= a && 'T' === jt(a)) {
      a--
    }
    let b = i + 1
    while (b < label.length && 'T' === jt(b)) {
      b++
    }
    return 0 <= a && ['L', 'D'].includes(jt(a) as string) &&
      b < label.length && ['R', 'D'].includes(jt(b) as string)
  }
  if (0xb7 === c) {
    return 0x6c === before && 0x6c === after
  }
  if (0x375 === c) {
    return undefined !== after && 'G' === find(t.script, after)
  }
  if (0x5f3 === c || 0x5f4 === c) {
    return undefined !== before && 'H' === find(t.script, before)
  }
  if (0x30fb === c) {
    return label.some((x) => 'K' === find(t.script, x))
  }
  const other = 0x6f0 <= c ? [0x660, 0x669] : [0x6f0, 0x6f9]
  return !label.some((x) => other[0] <= x && x <= other[1])
}


// UTS 46's validity criteria, nontransitional, with CheckHyphens,
// CheckJoiners and UseSTD3ASCIIRules, and the IDNA2008 property of each
// code point beside its status.
function validLabel(label: number[]): boolean {
  const t = tab()
  const n = nfc(label)
  if (n.length !== label.length || n.some((c, i) => c !== label[i]) ||
    (0x2d === label[2] && 0x2d === label[3]) ||
    0x2d === label[0] || 0x2d === label[label.length - 1] ||
    'M' === find(t.mark, label[0])) {
    return false
  }
  return label.every((c, i) => {
    const cat = find(t.category, c)
    return 'V' === find(t.status, c) && undefined !== cat &&
      (c >= 0x80 || (0x61 <= c && c <= 0x7a) || (0x30 <= c && c <= 0x39) ||
        0x2d === c) && ('P' === cat || context(label, i))
  })
}


const RTL = ['R', 'AL', 'AN']


// RFC 5893 section 2, for each label of a name any label of which holds
// a right-to-left character.
function bidiLabel(label: number[]): boolean {
  const t = tab()
  const cls = label.map((c) => find(t.bidi, c) as string)
  let end = cls.length - 1
  while (0 < end && 'NSM' === cls[end]) {
    end--
  }
  if ('L' === cls[0]) {
    return cls.every((b) => ['L', 'EN', 'ES', 'CS', 'ET', 'ON', 'BN', 'NSM'].includes(b)) &&
      ['L', 'EN'].includes(cls[end])
  }
  return ('R' === cls[0] || 'AL' === cls[0]) &&
    cls.every((b) => [...RTL, 'EN', 'ES', 'CS', 'ET', 'ON', 'BN', 'NSM'].includes(b)) &&
    [...RTL, 'EN'].includes(cls[end]) &&
    !(cls.includes('EN') && cls.includes('AN'))
}


// Each label's code points, an A-label decoded and checked to encode
// back to itself; undefined where one fails. Unless `every`, a label
// that is not an A-label is the caller's to check.
function uLabels(labels: number[][], every: boolean): number[][] | undefined {
  const out: number[][] = []
  for (const label of labels) {
    let u = label
    if (hasAce(label)) {
      const body = String.fromCharCode(...label.slice(4))
      const d = isAscii(label) ? punyDecode(body) : undefined
      if (undefined === d || isAscii(d) || punyEncode(d) !== body.toLowerCase()) {
        return undefined
      }
      u = d
    }
    if (0 === u.length || ((every || u !== label) && !validLabel(u))) {
      return undefined
    }
    out.push(u)
  }
  const t = tab()
  const rtl = out.some((u) => u.some((c) => RTL.includes(find(t.bidi, c) as string)))
  return rtl && !out.every(bidiLabel) ? undefined : out
}


function split(cps: number[]): number[][] {
  const out: number[][] = [[]]
  for (const c of cps) {
    if (0x2e === c) {
      out.push([])
    }
    else {
      out[out.length - 1].push(c)
    }
  }
  return out
}


// The name's labels as DNS carries them: none past 63, and the name not
// past 253.
function dnsLength(us: number[][]): boolean {
  const ace = us.map((u) => isAscii(u) ? u.length : 4 + punyEncode(u).length)
  return ace.every((n) => 0 < n && n <= 63) &&
    ace.reduce((a, n) => a + n, ace.length - 1) <= 253
}


// RFC 5891 section 5.4 for each A-label of a host name already made of
// letters, digits and hyphens.
function aLabelsValid(s: string): boolean {
  const labels = split([...s].map((ch) => ch.codePointAt(0) as number))
  return !labels.some(hasAce) || undefined !== uLabels(labels, false)
}


// UTS 46 processing: map, normalise, break at the full stop, then
// validate each label and the name's length.
function isIdnHostname(s: string): boolean {
  const t = tab()
  const mapped: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    const st = find(t.status, c)
    if ('M' === st) {
      mapped.push(...(t.mapping.get(c) as number[]))
    }
    else if ('I' !== st) {
      mapped.push(c)
    }
  }
  const us = uLabels(split(nfc(mapped)), true)
  return undefined !== us && dnsLength(us)
} /* node:coverage ignore next 7 */


export {
  aLabelsValid,
  isIdnHostname,
  nfc,
}
