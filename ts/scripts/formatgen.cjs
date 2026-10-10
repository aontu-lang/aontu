/* Copyright (c) 2026 Richard Rodger, MIT License */

// Regenerate the committed format grammars that are too large or too
// regular to write by hand (ADR-059), into grammar/format/. A grammar
// transcribed from its RFC is compiled to an automaton, made
// deterministic and minimal, and written back as ABNF one character of
// lookahead decides; a rule an RFC leaves in prose is built as an
// automaton directly. A condition with independent parts, IDNA2008's
// code points, contexts and Bidi rule, is written as several grammars
// the string must meet together. Run via `make formatgen`, then `make
// formats`; never edit the output. The IDNA2008 tables come from the
// Unicode Character Database at the pinned version, fetched once into a
// cache by ts/scripts/ucd.cjs and held to their recorded hashes.

'use strict'

const fs = require('fs')
const path = require('path')
const { VERSION, fetchUcd, lines, span } = require('./ucd.cjs')

const ROOT = path.join(__dirname, '..', '..')
const OUT = path.join(ROOT, 'grammar', 'format')
const MAX = 0x10ffff


// ---- sets of code points: sorted, disjoint, non-adjacent [lo, hi] pairs

function norm(rs) {
  const out = []
  for (const [lo, hi] of [...rs].sort((a, b) => a[0] - b[0])) {
    const top = out[out.length - 1]
    if (top && lo <= top[1] + 1) top[1] = Math.max(top[1], hi)
    else out.push([lo, hi])
  }
  return out
}

const hex = (n) => n.toString(16).toUpperCase()


// ---- the reader: RFC 5234 with RFC 7405, for a grammar with no recursion

const CORE = {
  alpha: [[0x41, 0x5a], [0x61, 0x7a]], bit: [[0x30, 0x31]], char: [[0x01, 0x7f]],
  cr: [[0x0d, 0x0d]], ctl: [[0x00, 0x1f], [0x7f, 0x7f]], digit: [[0x30, 0x39]],
  dquote: [[0x22, 0x22]], hexdig: [[0x30, 0x39], [0x41, 0x46], [0x61, 0x66]],
  htab: [[0x09, 0x09]], lf: [[0x0a, 0x0a]], octet: [[0x00, 0xff]], sp: [[0x20, 0x20]],
  vchar: [[0x21, 0x7e]], wsp: [[0x09, 0x09], [0x20, 0x20]],
}

function read(src) {
  const defs = []
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    let q = ''
    for (const c of raw) {
      if ('' !== q) {
        q = c === q ? '' : q
      }
      else if ('"' === c || '<' === c) {
        q = '"' === c ? '"' : '>'
      }
      else if (';' === c) {
        break
      }
      line += c
    }
    if (/^\s*$/.test(line)) {
      continue
    }
    if (/^\s/.test(line)) {
      defs[defs.length - 1] += ' ' + line.trim()
    }
    else {
      defs.push(line.trim())
    }
  }
  const rules = new Map()
  let start
  for (const d of defs) {
    const m = /^([A-Za-z][A-Za-z0-9-]*)\s*(=\/|=)\s*(.*)$/s.exec(d)
    if (!m) {
      throw new Error('not a rule: ' + d)
    }
    const name = m[1].toLowerCase()
    const node = elements(m[3])
    if ('=/' === m[2]) {
      rules.set(name, { k: 'alt', xs: [rules.get(name), node] })
    }
    else {
      rules.set(name, node)
      start = start ?? name
    }
  }
  return { rules, start }
}

function elements(text) {
  let i = 0
  const ws = () => {
    while (' ' === text[i] || '\t' === text[i]) {
      i++
    }
  }
  const alternation = () => {
    const xs = [concatenation()]
    ws()
    while ('/' === text[i]) {
      i++
      xs.push(concatenation())
      ws()
    }
    return 1 === xs.length ? xs[0] : { k: 'alt', xs }
  }
  const concatenation = () => {
    const xs = []
    ws()
    while (i < text.length && !'/)]'.includes(text[i])) {
      xs.push(repetition())
      ws()
    }
    return 1 === xs.length ? xs[0] : { k: 'cat', xs }
  }
  const repetition = () => {
    const m = /^(\d*)(\*?)(\d*)/.exec(text.slice(i))
    i += m[0].length
    let min = 1
    let max = 1
    if ('' !== m[2]) {
      min = '' === m[1] ? 0 : +m[1]
      max = '' === m[3] ? Infinity : +m[3]
    }
    else if ('' !== m[1]) {
      min = max = +m[1]
    }
    const x = element()
    return 1 === min && 1 === max ? x : { k: 'rep', min, max, x }
  }
  const element = () => {
    const c = text[i]
    if ('(' === c || '[' === c) {
      i++
      const x = alternation()
      i++
      return '(' === c ? x : { k: 'rep', min: 0, max: 1, x }
    }
    if ('"' === c || ('%' === c && /[sSiI]/.test(text[i + 1]))) {
      let ci = true
      if ('%' === c) {
        ci = /[iI]/.test(text[i + 1])
        i += 2
      }
      const end = text.indexOf('"', i + 1)
      const s = text.slice(i + 1, end)
      i = end + 1
      return { k: 'cat', xs: [...s].map((ch) => ({ k: 'set', r: letterCase(ch.codePointAt(0), ci) })) }
    }
    if ('%' === c) {
      const m = /^%([xdb])([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+)|((?:\.[0-9A-Fa-f]+)+))?/i.exec(text.slice(i))
      i += m[0].length
      const n = (s) => parseInt(s, { x: 16, d: 10, b: 2 }[m[1].toLowerCase()])
      if (m[3]) {
        return { k: 'set', r: [[n(m[2]), n(m[3])]] }
      }
      const cps = [m[2], ...(m[4] ? m[4].slice(1).split('.') : [])].map(n)
      return { k: 'cat', xs: cps.map((cp) => ({ k: 'set', r: [[cp, cp]] })) }
    }
    const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(text.slice(i))
    i += m[0].length
    return { k: 'ref', name: m[0].toLowerCase() }
  }
  return alternation()
}

function letterCase(cp, ci) {
  const lower = 0x41 <= cp && cp <= 0x5a ? cp + 0x20 : cp
  const upper = 0x61 <= cp && cp <= 0x7a ? cp - 0x20 : cp
  return ci ? norm([[lower, lower], [upper, upper]]) : [[cp, cp]]
}


// ---- Thompson's construction, every rule inlined, then the subset
// construction over intervals

function nfa(g) {
  const eps = []
  const edges = []
  const state = () => {
    eps.push([])
    edges.push([])
    return eps.length - 1
  }
  const rule = (name) => g.rules.get(name) ?? { k: 'set', r: CORE[name] }
  const build = (x, from, stack) => {
    if ('set' === x.k) {
      const to = state()
      x.r.forEach(([lo, hi]) => edges[from].push([lo, hi, to]))
      return to
    }
    if ('cat' === x.k) {
      return x.xs.reduce((at, y) => build(y, at, stack), from)
    }
    if ('alt' === x.k) {
      const end = state()
      for (const y of x.xs) {
        const s = state()
        eps[from].push(s)
        eps[build(y, s, stack)].push(end)
      }
      return end
    }
    if ('rep' === x.k) {
      let at = from
      for (let i = 0; i < x.min; i++) {
        at = build(x.x, at, stack)
      }
      if (Infinity === x.max) {
        const loop = state()
        const s = state()
        eps[at].push(loop)
        eps[loop].push(s)
        eps[build(x.x, s, stack)].push(loop)
        return loop
      }
      const end = state()
      for (let i = x.min; i < x.max; i++) {
        eps[at].push(end)
        at = build(x.x, at, stack)
      }
      eps[at].push(end)
      return end
    }
    if (stack.includes(x.name)) {
      throw new Error('rule ' + x.name + ' is recursive')
    }
    return build(rule(x.name), from, [...stack, x.name])
  }
  const start = state()
  const accept = build(rule(g.start), start, [g.start])
  return { eps, edges, start, accept }
}

function determinise(n) {
  const closure = (set) => {
    const seen = new Set(set)
    const stack = [...set]
    while (stack.length) {
      for (const t of n.eps[stack.pop()]) {
        if (!seen.has(t)) {
          seen.add(t)
          stack.push(t)
        }
      }
    }
    return [...seen].sort((a, b) => a - b)
  }
  const states = []
  const index = new Map()
  const queue = []
  const add = (set) => {
    const k = set.join(',')
    if (!index.has(k)) {
      index.set(k, states.length)
      states.push({ set, edges: [], accept: set.includes(n.accept) })
      queue.push(states.length - 1)
    }
    return index.get(k)
  }
  add(closure([n.start]))
  while (queue.length) {
    const d = states[queue.shift()]
    const es = d.set.flatMap((s) => n.edges[s])
    const cuts = [...new Set(es.flatMap(([lo, hi]) => [lo, hi + 1]))].sort((a, b) => a - b)
    for (let k = 0; k + 1 < cuts.length; k++) {
      const lo = cuts[k]
      const hi = cuts[k + 1] - 1
      const to = es.filter(([a, b]) => a <= lo && hi <= b).map((e) => e[2])
      if (to.length) {
        d.edges.push([lo, hi, add(closure(to))])
      }
    }
  }
  return states.map((d) => ({ edges: d.edges, accept: d.accept }))
}


// ---- a classed automaton: an alphabet of disjoint code point classes,
// and per state a target for each class it reads

// The coarsest classes on which every state of an interval automaton
// reads alike.
function classed(dfa) {
  const cuts = [...new Set(dfa.flatMap((s) => s.edges.flatMap(([lo, hi]) => [lo, hi + 1])))]
    .sort((a, b) => a - b)
  const by = new Map()
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k]
    const hi = cuts[k + 1] - 1
    const sig = dfa.map((s) => {
      const e = s.edges.find(([a, b]) => a <= lo && hi <= b)
      return undefined === e ? -1 : e[2]
    })
    if (sig.every((t) => -1 === t)) {
      continue
    }
    const key = sig.join(',')
    by.set(key, [...(by.get(key) ?? []), [lo, hi]])
  }
  const classes = [...by.values()].map(norm)
  const states = dfa.map((s) => ({
    accept: s.accept,
    next: classes.map((r) => {
      const e = s.edges.find(([a, b]) => a <= r[0][0] && r[0][0] <= b)
      return undefined === e ? -1 : e[2]
    }),
  }))
  return { classes, states }
}

// A classed automaton from a step function: step(state, key) is the next
// state or undefined, and keys index the alphabet.
function stepped(alphabet, start, step, accept) {
  const keys = [...alphabet.keys()]
  const index = new Map()
  const raw = []
  const queue = []
  const add = (s) => {
    const k = JSON.stringify(s)
    if (!index.has(k)) {
      index.set(k, raw.length)
      raw.push({ s, accept: accept(s), next: [] })
      queue.push(raw.length - 1)
    }
    return index.get(k)
  }
  add(start)
  while (queue.length) {
    const d = raw[queue.shift()]
    d.next = keys.map((key) => {
      const t = step(d.s, key)
      return undefined === t ? -1 : add(t)
    })
  }
  return { classes: keys.map((k) => alphabet.get(k)), states: raw.map(({ accept, next }) => ({ accept, next })) }
}

// Moore's refinement, the states that reach no accepting state dropped,
// classes read alike everywhere merged, and the states numbered breadth
// first from the start.
function minimise(a) {
  let cls = a.states.map((s) => s.accept ? 1 : 0)
  let count = new Set(cls).size
  for (;;) {
    const names = new Map()
    const next = a.states.map((s, i) => {
      const k = cls[i] + '|' + s.next.map((t) => -1 === t ? '-' : cls[t]).join(',')
      if (!names.has(k)) {
        names.set(k, names.size)
      }
      return names.get(k)
    })
    cls = next
    if (names.size === count) {
      break
    }
    count = names.size
  }
  const live = new Set()
  a.states.forEach((s, i) => s.accept && live.add(cls[i]))
  for (let grew = true; grew;) {
    grew = false
    a.states.forEach((s, i) => {
      if (!live.has(cls[i]) && s.next.some((t) => -1 !== t && live.has(cls[t]))) {
        live.add(cls[i])
        grew = true
      }
    })
  }
  const rep = new Map()
  a.states.forEach((s, i) => rep.has(cls[i]) || rep.set(cls[i], i))
  const order = new Map([[cls[0], 0]])
  const queue = [0]
  const states = []
  while (queue.length) {
    const i = queue.shift()
    const next = a.states[i].next.map((t) => {
      if (-1 === t || !live.has(cls[t])) {
        return -1
      }
      if (!order.has(cls[t])) {
        order.set(cls[t], order.size)
        queue.push(rep.get(cls[t]))
      }
      return order.get(cls[t])
    })
    states[order.get(cls[i])] = { accept: a.states[i].accept, next }
  }
  // merge the classes every state reads alike
  const by = new Map()
  a.classes.forEach((r, c) => {
    const k = states.map((s) => s.next[c]).join(',')
    if (states.every((s) => -1 === s.next[c])) {
      return
    }
    by.set(k, [...(by.get(k) ?? []), c])
  })
  const groups = [...by.values()]
  return {
    classes: groups.map((cs) => norm(cs.flatMap((c) => a.classes[c]))),
    states: states.map((s) => ({ accept: s.accept, next: groups.map((cs) => s.next[cs[0]]) })),
  }
}

// ---- a classed automaton back to ABNF: a rule a state, an alternative a
// target. A large class is named once, or is a union of the library's
// classes, which hold the code points past ASCII; a long union is named
// once too.

function emit(a, name, opts = {}) {
  const prefix = opts.prefix ?? name
  const small = 3
  const ruleName = (i) => 0 === i ? name : prefix + '-' + i
  const terminal = (i) => a.states[i].accept && a.states[i].next.every((t) => -1 === t)
  const core = new Map(Object.entries(CORE).map(([k, r]) => [JSON.stringify(r), k.toUpperCase()]))
  const named = new Map()
  const unions = new Map()
  const className = (c) => {
    if (a.classes[c].length <= small) {
      return undefined
    }
    if (!named.has(c)) {
      named.set(c, prefix + '-c' + (named.size + 1))
    }
    return named.get(c)
  }
  const partsOf = (cs, union) => {
    const high = union.filter(([, hi]) => 0x80 <= hi).map(([lo, hi]) => [Math.max(lo, 0x80), hi])
    if (undefined !== opts.lib && high.length <= small) {
      return union.map(rangeText)
    }
    if (undefined !== opts.lib) {
      const libs = opts.lib.filter((l) => high.some(([x, y]) => x <= l.r[0][0] && l.r[0][0] <= y))
      if (JSON.stringify(norm(libs.flatMap((l) => l.r))) !== JSON.stringify(norm(high))) {
        throw new Error('a class past ASCII is not a union of the library\'s')
      }
      const low = union.filter(([lo]) => lo < 0x80).map(([lo, hi]) => [lo, Math.min(hi, 0x7f)])
      return [...low.map(rangeText), ...libs.map((l) => l.name)]
    }
    if (union.length <= small) {
      return union.map(rangeText)
    }
    const loose = norm(cs.filter((c) => undefined === className(c)).flatMap((c) => a.classes[c]))
    return [...cs.map(className).filter((n) => undefined !== n).sort(byNumber), ...loose.map(rangeText)]
  }
  const setText = (cs) => {
    const union = norm(cs.flatMap((c) => a.classes[c]))
    const known = core.get(JSON.stringify(union))
    if (undefined !== known) {
      return known
    }
    const parts = partsOf(cs, union)
    if (1 === parts.length) {
      return parts[0]
    }
    if (small < parts.length) {
      const text = parts.join(' / ')
      if (!unions.has(text)) {
        unions.set(text, prefix + '-u' + (unions.size + 1))
      }
      return unions.get(text)
    }
    return '(' + parts.join(' / ') + ')'
  }
  // A state that reads what another reads, and more, is its extra
  // alternatives and then the other: no extra class is one the other
  // reads, so one character still decides.
  const reads = a.states.map((s) => s.next.filter((t) => -1 !== t).length)
  const base = a.states.map((s, i) => {
    let best = -1
    a.states.forEach((q, j) => {
      const fits = j !== i && !terminal(j) && reads[j] <= reads[i] && (s.accept || !q.accept) &&
        (reads[j] < reads[i] || (s.accept && !q.accept)) &&
        q.next.every((t, c) => -1 === t || t === s.next[c])
      if (fits && (-1 === best || reads[best] < reads[j])) {
        best = j
      }
    })
    return best
  })
  const lines = []
  a.states.forEach((s, i) => {
    if (terminal(i)) {
      return
    }
    const q = base[i]
    const by = new Map()
    s.next.forEach((t, c) => -1 === t || (-1 !== q && t === a.states[q].next[c]) ||
      by.set(t, [...(by.get(t) ?? []), c]))
    const alts = [...by]
      .map(([t, cs]) => [Math.min(...cs.map((c) => a.classes[c][0][0])), setText(cs) +
        (terminal(t) ? '' : ' ' + ruleName(t))])
      .sort((x, y) => x[0] - y[0]).map((x) => x[1])
    if (-1 !== q) {
      alts.push(ruleName(q))
    }
    const body = alts.join(' / ')
    const open = s.accept && (-1 === q || !a.states[q].accept)
    lines.push(wrap(ruleName(i) + ' = ' + (open ? '[' + body + ']' : body)))
  })
  for (const [text, n] of unions) {
    lines.push(wrap(n + ' = ' + text))
  }
  for (const [c, n] of [...named].sort((x, y) => byNumber(x[1], y[1]))) {
    lines.push(wrap(n + ' = ' + a.classes[c].map(rangeText).join(' / ')))
  }
  return lines.join('\n') + '\n'
}

const byNumber = (x, y) => +/\d+$/.exec(x)[0] - +/\d+$/.exec(y)[0]

function rangeText([lo, hi]) {
  return lo === hi ? '%x' + hex(lo) : '%x' + hex(lo) + '-' + hex(hi)
}

function wrap(line) {
  if (line.length <= 78) {
    return line
  }
  const out = []
  let cur = ''
  for (const w of line.split(' ')) {
    if ('' !== cur && 78 < cur.length + 1 + w.length) {
      out.push(cur)
      cur = '    ' + w
    }
    else {
      cur = '' === cur ? w : cur + ' ' + w
    }
  }
  out.push(cur)
  return out.join('\n')
}

// A grammar from its RFC transcription.
function fromRfc(src) {
  const d = determinise(nfa(read(src)))
  return minimise(classed(d))
}

// ---- RFC 1123 section 2.1 host names, with RFC 5890 section 2.3.1's
// reserved labels: 1 to 63 letters, digits and hyphens, beginning and
// ending with a letter or digit, and with "--" in the third and fourth
// places only as an A-label's "xn--", which is never decoded.

const LDH = new Map([
  ['x', [[0x58, 0x58], [0x78, 0x78]]],
  ['n', [[0x4e, 0x4e], [0x6e, 0x6e]]],
  ['a', [[0x41, 0x4d], [0x4f, 0x57], [0x59, 0x5a], [0x61, 0x6d], [0x6f, 0x77], [0x79, 0x7a]]],
  ['digit', [[0x30, 0x39]]],
  ['hyphen', [[0x2d, 0x2d]]],
  ['dot', [[0x2e, 0x2e]]],
])

function hostname() {
  const part = syntax({ max: 63, reserved: true })
  return minimise(stepped(LDH, part.start, part.step, part.end))
}

function prop(dir, f, only) {
  const out = new Map()
  for (const l of lines(dir, f)) {
    const [r, v] = l.split(';').map((x) => x.trim())
    if (undefined === only || only.includes(v)) {
      const [lo, hi] = span(r)
      for (let c = lo; c <= hi; c++) {
        out.set(c, v)
      }
    }
  }
  return out
}

function load(dir) {
  const gc = new Array(MAX + 1).fill('Cn')
  const bidi = new Array(MAX + 1).fill('')
  const ccc = new Uint8Array(MAX + 1)
  let first = null
  for (const l of fs.readFileSync(path.join(dir, 'UnicodeData.txt'), 'utf8').split('\n')) {
    if ('' === l) {
      continue
    }
    const f = l.split(';')
    if (f[1].endsWith(', First>')) {
      first = f
      continue
    }
    const hi = parseInt(f[0], 16)
    for (let c = null === first ? hi : parseInt(first[0], 16); c <= hi; c++) {
      gc[c] = f[2]
      ccc[c] = +f[3]
      bidi[c] = f[4]
    }
    first = null
  }
  const uts = new Map()
  for (const l of lines(dir, 'IdnaMappingTable.txt')) {
    const p = l.split(';').map((x) => x.trim())
    const [lo, hi] = span(p[0])
    const map = p[2] ? p[2].split(/\s+/).map((h) => parseInt(h, 16)) : undefined
    for (let c = lo; c <= hi; c++) {
      uts.set(c, [p[1], map])
    }
  }
  return {
    gc, bidi, ccc, uts,
    script: prop(dir, 'Scripts.txt'),
    join: prop(dir, 'DerivedJoiningType.txt'),
    pl: prop(dir, 'PropList.txt', ['White_Space', 'Noncharacter_Code_Point']),
    di: prop(dir, 'DerivedCoreProperties.txt', ['Default_Ignorable_Code_Point']),
    hst: prop(dir, 'HangulSyllableType.txt'),
    cwkcf: prop(dir, 'DerivedNormalizationProps.txt', ['Changes_When_NFKC_Casefolded']),
  }
}

// RFC 5892 section 2.6, the exceptions.
const EXCEPTIONS = new Map([
  ...[0xdf, 0x3c2, 0x6fd, 0x6fe, 0xf0b, 0x3007].map((c) => [c, 'PVALID']),
  ...[0xb7, 0x375, 0x5f3, 0x5f4, 0x30fb].map((c) => [c, 'CONTEXTO']),
  ...Array.from({ length: 10 }, (_, i) => [0x660 + i, 'CONTEXTO']),
  ...Array.from({ length: 10 }, (_, i) => [0x6f0 + i, 'CONTEXTO']),
  ...[0x640, 0x7fa, 0x302e, 0x302f, 0x3031, 0x3032, 0x3033, 0x3034, 0x3035, 0x303b].map((c) => [c, 'DISALLOWED']),
])

// RFC 5892 section 3, in its order.
function derive(u, cp) {
  if (EXCEPTIONS.has(cp)) {
    return EXCEPTIONS.get(cp)
  }
  const nonchar = 'Noncharacter_Code_Point' === u.pl.get(cp)
  if ('Cn' === u.gc[cp] && !nonchar) {
    return 'UNASSIGNED'
  }
  if (0x2d === cp || (0x30 <= cp && cp <= 0x39) || (0x61 <= cp && cp <= 0x7a)) {
    return 'PVALID'
  }
  if (0x200c === cp || 0x200d === cp) {
    return 'CONTEXTJ'
  }
  if (u.cwkcf.has(cp) || u.di.has(cp) || 'White_Space' === u.pl.get(cp) || nonchar ||
    (0x20d0 <= cp && cp <= 0x20ff) || (0x1d100 <= cp && cp <= 0x1d24f) ||
    ['L', 'V', 'T'].includes(u.hst.get(cp))) {
    return 'DISALLOWED'
  }
  return ['Ll', 'Lu', 'Lo', 'Nd', 'Lm', 'Mn', 'Mc'].includes(u.gc[cp]) ? 'PVALID' : 'DISALLOWED'
}

// A code point's UTS 46 image: itself, the one code point it maps to,
// 'ignore', or undefined where it has none a label can hold.
function image(u, cp) {
  const [status, map] = u.uts.get(cp) ?? ['disallowed']
  if ('ignored' === status) {
    return 'ignore'
  }
  if ('valid' === status || 'deviation' === status) {
    return cp
  }
  if ('mapped' === status && 1 === map.length && ['valid', 'deviation'].includes(u.uts.get(map[0])?.[0])) {
    return map[0]
  }
  return undefined
}

const BIDI = { L: 'L', R: 'R', AL: 'R', AN: 'AN', EN: 'EN', ES: 'N', CS: 'N', ET: 'N', ON: 'N', BN: 'N', NSM: 'NSM' }
const SPECIAL = new Map([
  [0x2d, 'hyphen'], [0x78, 'x'], [0x6e, 'n'], [0x6c, 'l'], [0xb7, 'mdot'], [0x375, 'keraia'],
  [0x5f3, 'geresh'], [0x5f4, 'geresh'], [0x30fb, 'kdot'], [0x200c, 'zwnj'], [0x200d, 'zwj'],
])

// What the label rules ask of a code point, as a class key.
function feature(u, prop, cp) {
  const m = image(u, cp)
  if ('ignore' === m) {
    return 'ignore'
  }
  if (undefined === m) {
    return 'bad'
  }
  if (0x2e === m) {
    return 'dot'
  }
  if (!['PVALID', 'CONTEXTJ', 'CONTEXTO'].includes(prop[m])) {
    return 'bad'
  }
  if (SPECIAL.has(m)) {
    return SPECIAL.get(m)
  }
  if (0x61 <= m && m <= 0x7a) {
    return 'a'
  }
  if (0x30 <= m && m <= 0x39) {
    return 'digit'
  }
  if (0x660 <= m && m <= 0x669) {
    return 'ai'
  }
  if (0x6f0 <= m && m <= 0x6f9) {
    return 'eai'
  }
  const sc = u.script.get(m)
  const script = 'Greek' === sc ? 'G' : 'Hebrew' === sc ? 'H' :
    ['Hiragana', 'Katakana', 'Han'].includes(sc) ? 'K' : '-'
  const j = u.join.get(m) ?? 'U'
  return ['u', BIDI[u.bidi[m]] ?? 'X', ['D', 'L', 'R', 'T'].includes(j) ? j : 'U', script,
    9 === u.ccc[m] ? 'V' : '-', /^M/.test(u.gc[m]) ? 'M' : '-'].join(':')
}

function alphabet(u) {
  const prop = new Array(MAX + 1)
  for (let c = 0; c <= MAX; c++) {
    prop[c] = derive(u, c)
  }
  const out = new Map()
  for (let c = 0; c <= MAX; c++) {
    if (0xd800 <= c && c <= 0xdfff) {
      continue
    }
    const f = feature(u, prop, c)
    const r = out.get(f) ?? []
    out.set(f, r)
    const top = r[r.length - 1]
    if (top && top[1] + 1 === c) {
      top[1] = c
    }
    else {
      r.push([c, c])
    }
  }
  return out
}

// A class key's traits for the label rules.
function traits(k) {
  const ascii = ['a', 'x', 'n', 'l', 'digit', 'hyphen'].includes(k)
  const fixed = {
    a: 'L', x: 'L', n: 'L', l: 'L', digit: 'EN', hyphen: 'N', mdot: 'N', keraia: 'N',
    geresh: 'R', kdot: 'N', ai: 'AN', eai: 'EN', zwnj: 'N', zwj: 'N',
  }[k]
  if (undefined !== fixed) {
    return {
      ascii, bidi: fixed, join: 'U', virama: false, mark: false,
      script: 'keraia' === k ? 'G' : 'geresh' === k ? 'H' : '-',
    }
  }
  const [, bidi, join, script, virama, mark] = k.split(':')
  return { ascii: false, bidi, join, script, virama: 'V' === virama, mark: 'M' === mark }
}


// The library: each class's code points past ASCII, as a named rule.
function library(al) {
  const names = {
    a: 'letter', x: 'letter-x', n: 'letter-n', l: 'letter-l', digit: 'digit', hyphen: 'hyphen', dot: 'dot',
    ignore: 'ignored', mdot: 'middle-dot', keraia: 'keraia', geresh: 'geresh', kdot: 'katakana-middle-dot',
    ai: 'arabic-indic-digit', eai: 'extended-arabic-indic-digit', zwnj: 'zwnj', zwj: 'zwj',
  }
  const script = { G: 'greek', H: 'hebrew', K: 'han-kana' }
  const out = []
  for (const [k, r] of al) {
    if ('bad' === k) continue
    const high = r.filter(([, hi]) => 0x80 <= hi).map(([lo, hi]) => [Math.max(lo, 0x80), hi])
    if (0 === high.length) continue
    let name = names[k]
    if (undefined === name) {
      const [, bidi, join, sc, virama, mark] = k.split(':')
      name = [bidi.toLowerCase(), join.toLowerCase(), script[sc], 'V' === virama ? 'virama' : undefined,
        'M' === mark ? 'mark' : undefined].filter((x) => undefined !== x).join('-')
    }
    out.push({ name: 'idna-' + name, r: high })
  }
  return out
}

// Label syntax. An all-ASCII label is LDH; one with any other code point
// is a U-label, whose A-label is never computed, so it is not measured.
// opts.max bounds an ASCII label; opts.reserved holds an ASCII label to
// RFC 5890's reservation of "--" in the third and fourth places, which
// "xn--" alone may use, and then only for letters, digits and hyphens.
const SYN = { n: 0, ascii: true, xn: 0, h3: false, hyphen: false, dd: false }
function syntax(opts) {
  const end = (L) => 0 < L.n && !L.hyphen && !(4 === L.xn && 4 === L.n)
  const step = (L, k) => {
    if ('ignore' === k) {
      return L
    }
    if ('bad' === k) {
      return undefined
    }
    if ('dot' === k) {
      return end(L) ? SYN : undefined
    }
    const t = traits(k)
    const n = L.n + 1
    const ascii = L.ascii && t.ascii
    if (ascii && opts.max < n) {
      return undefined
    }
    let xn = L.xn
    if (opts.reserved) {
      if (1 === n) {
        xn = 'x' === k ? 1 : 9
      }
      else if (xn < 4) {
        xn = (1 === xn && 'n' === k) || (1 < xn && 'hyphen' === k) ? xn + 1 : 9
      }
      if (4 === xn && !t.ascii) {
        return undefined
      }
    }
    if ('hyphen' === k && 1 === n) {
      return undefined
    }
    const dd = L.dd || (4 === n && L.h3 && 'hyphen' === k && 4 !== xn)
    // "--" in the third and fourth places: an ASCII label's only when
    // reserved, and always a U-label's, however late it turns one
    if (dd && (!ascii || opts.reserved)) {
      return undefined
    }
    if (1 === n && t.mark) {
      return undefined
    }
    // past the fourth place only an ASCII label's length still matters
    return {
      n: ascii && Infinity !== opts.max ? n : Math.min(n, 5), ascii, xn: 4 < n && 4 !== xn ? 9 : xn,
      h3: 3 === n && 'hyphen' === k, hyphen: 'hyphen' === k, dd: ascii && dd,
    }
  }
  return { start: SYN, step, end }
}

// The contextual rules of RFC 5892 appendix A, each its own condition,
// label by label: one that waits on the next character refuses a label
// that ends first.
function rule(start, step, end) {
  return {
    start, end,
    step: (s, k) => 'ignore' === k ? s : 'bad' === k ? undefined :
      'dot' === k ? (end(s) ? start : undefined) : step(s, k, traits(k)),
  }
}
const CONTEXT = {
  // ZERO WIDTH JOINER after a virama; ZERO WIDTH NON-JOINER after one,
  // or between joining letters: (L|D) T* ZWNJ T* (R|D)
  joiner: () => rule({ v: false, jl: false, z: false }, (s, k, t) => {
    const z = s.z && 'T' === t.join
    if ((s.z && !z && 'R' !== t.join && 'D' !== t.join) || ('zwj' === k && !s.v) ||
      ('zwnj' === k && !s.v && !s.jl)) {
      return undefined
    }
    return {
      v: t.virama, jl: 'D' === t.join || 'L' === t.join || ('T' === t.join && s.jl),
      z: z || ('zwnj' === k && !s.v),
    }
  }, (s) => !s.z),
  // MIDDLE DOT between two l's
  'middle-dot': () => rule({ l: false, wait: false }, (s, k) =>
    (s.wait && 'l' !== k) || ('mdot' === k && !s.l) ? undefined : { l: 'l' === k, wait: 'mdot' === k },
  (s) => !s.wait),
  // GREEK LOWER NUMERAL SIGN before a Greek letter
  keraia: () => rule({ wait: false }, (s, k, t) =>
    s.wait && 'G' !== t.script ? undefined : { wait: 'keraia' === k }, (s) => !s.wait),
  // HEBREW PUNCTUATION GERESH and GERSHAYIM after a Hebrew letter
  geresh: () => rule({ h: false }, (s, k, t) =>
    'geresh' === k && !s.h ? undefined : { h: 'H' === t.script }, () => true),
  // KATAKANA MIDDLE DOT in a label with a Hiragana, Katakana or Han letter
  katakana: () => rule({ wait: false, seen: false }, (s, k, t) => {
    const seen = s.seen || 'K' === t.script
    return { seen, wait: (s.wait || 'kdot' === k) && !seen }
  }, (s) => !s.wait),
  // ARABIC-INDIC DIGITs and EXTENDED ARABIC-INDIC DIGITs not in one label
  digits: () => rule({ d: '' }, (s, k) =>
    ('ai' === k && 'e' === s.d) || ('eai' === k && 'a' === s.d) ? undefined :
      { d: 'ai' === k ? 'a' : 'eai' === k ? 'e' : s.d }, () => true),
}

// The Bidi rule: a label that satisfies it, and whether it holds a
// right-to-left code point; a name holding one is a Bidi domain name,
// every label of which must satisfy the rule.
const BL = { bf: '', ok: true, end: false, en: false, an: false, rtl: false }
const B0 = { bd: false, bad: false, L: BL }
function bidi() {
  const sat = (L) => ('L' === L.bf || 'R' === L.bf) && L.ok && L.end && !(L.en && L.an)
  const close = (s) => {
    const bd = s.bd || s.L.rtl
    const bad = s.bad || !sat(s.L)
    return bd && bad ? undefined : { bd, bad, L: BL }
  }
  const step = (s, k) => {
    if ('ignore' === k) {
      return s
    }
    if ('bad' === k) {
      return undefined
    }
    if ('dot' === k) {
      return close(s)
    }
    const b = traits(k).bidi
    const L = { ...s.L }
    L.bf = '' === L.bf ? ('L' === b || 'R' === b ? b : 'X') : L.bf
    L.rtl = L.rtl || 'R' === b || 'AN' === b
    if ('R' === L.bf) {
      L.ok = L.ok && 'L' !== b && 'X' !== b
      L.end = 'NSM' === b ? L.end : 'R' === b || 'EN' === b || 'AN' === b
      L.en = L.en || 'EN' === b
      L.an = L.an || 'AN' === b
    }
    else if ('L' === L.bf) {
      L.ok = L.ok && 'R' !== b && 'AN' !== b && 'X' !== b
      L.end = 'NSM' === b ? L.end : 'L' === b || 'EN' === b
    }
    // a label that cannot satisfy the rule is held only to the name's
    if ('X' === L.bf || !L.ok) {
      Object.assign(L, { bf: 'X', ok: false, end: false })
    }
    if ('R' !== L.bf) {
      Object.assign(L, { en: false, an: false })
    }
    if ((s.bd && 'X' === L.bf) || (s.bad && L.rtl)) {
      return undefined
    }
    return { bd: s.bd, bad: s.bad, L }
  }
  return { start: B0, step, end: (s) => undefined !== close(s) }
}

// IPv6-comp and IPv6v4-comp: "::" stands for two groups at least, so no
// more than six, or four beside an IPv4 tail, may be written.
const hexes = (n) => 0 === n ? '' : 1 === n ? 'IPv6-hex' : 'IPv6-hex ' + (n - 1) + '(":" IPv6-hex)'
const upTo = (n) => 0 === n ? '' : ' [IPv6-hex *' + (n - 1) + '(":" IPv6-hex)]'
const comp = (most, tail) => Array.from({ length: most + 1 }, (_, l) =>
  (hexes(l) + ' "::"' + (tail ? upToColon(most - l) + ' IPv4-address-literal' : upTo(most - l))).trim()).join('\n    / ')
const upToColon = (n) => 0 === n ? '' : ' [IPv6-hex *' + (n - 1) + '(":" IPv6-hex) ":"]'
const rfc = (local, sub, qtext, extra) => `
Mailbox        = Local-part "@" ( Domain / address-literal )
Local-part     = Dot-string / Quoted-string
Dot-string     = Atom *("."  Atom)
Atom           = 1*atext
atext          = ALPHA / DIGIT / "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+"
               / "-" / "/" / "=" / "?" / "^" / "_" / "\`" / "{" / "|" / "}" / "~"${local}
Quoted-string  = DQUOTE *QcontentSMTP DQUOTE
QcontentSMTP   = qtextSMTP / quoted-pairSMTP
quoted-pairSMTP = %d92 %d32-126
qtextSMTP      = %d32-33 / %d35-91 / %d93-126${qtext}
Domain         = sub-domain *("." sub-domain)
sub-domain     = Let-dig [Ldh-str]${sub}
Let-dig        = ALPHA / DIGIT
Ldh-str        = *( ALPHA / DIGIT / "-" ) Let-dig
address-literal = "[" ( IPv4-address-literal / IPv6-address-literal ) "]"
IPv4-address-literal = Snum 3("." Snum)
IPv6-address-literal = "IPv6:" IPv6-addr
Snum           = 1*2DIGIT / ("0" / "1") 2DIGIT / "2" %x30-34 DIGIT / "25" %x30-35
IPv6-addr      = IPv6-full / IPv6-comp / IPv6v4-full / IPv6v4-comp
IPv6-hex       = 1*4HEXDIG
IPv6-full      = IPv6-hex 7(":" IPv6-hex)
IPv6-comp      = ${comp(6, false)}
IPv6v4-full    = IPv6-hex 5(":" IPv6-hex) ":" IPv4-address-literal
IPv6v4-comp    = ${comp(4, true)}
${extra}`
const EMAIL = rfc('', '', '', '')

const ATEXT = new Set([...'!#$%&\'*+-/=?^_`{|}~'].map((c) => c.charCodeAt(0)))
function localKey(cp) {
  if (0x80 <= cp) return 'utf8'
  if ((0x30 <= cp && cp <= 0x39) || (0x41 <= cp && cp <= 0x5a) || (0x61 <= cp && cp <= 0x7a) || ATEXT.has(cp)) return 'atext'
  if (0x2e === cp) return 'dot'
  if (0x22 === cp) return 'dquote'
  if (0x5c === cp) return 'backslash'
  if (0x40 === cp) return 'at'
  if (0x5b === cp) return 'open'
  if (0x20 <= cp && cp <= 0x7e) return 'qtext'
  return 'ctl'
}
// The local part, ending at its "@": a dot-string, or a quoted string
// whose quoted pairs stay ASCII.
function localStep(s, k) {
  const ascii = 'utf8' !== k
  switch (s) {
    case 'start': return 'atext' === k || 'utf8' === k ? 'atom' : 'dquote' === k ? 'quoted' : undefined
    case 'atom': return 'atext' === k || 'utf8' === k ? 'atom' : 'dot' === k ? 'dot' : 'at' === k ? 'done' : undefined
    case 'dot': return 'atext' === k || 'utf8' === k ? 'atom' : undefined
    case 'quoted': return 'dquote' === k ? 'closed' : 'backslash' === k ? 'pair' : 'ctl' === k ? undefined : 'quoted'
    case 'pair': return ascii && 'ctl' !== k ? 'quoted' : undefined
    case 'closed': return 'at' === k ? 'done' : undefined
  }
}
// The address literal of RFC 5321 section 4.1.3, from its transcription.
function literal() {
  const lit = EMAIL.replace(/^Mailbox[\s\S]*?(?=address-literal =)/m, '')
  return fromRfc('literal = address-literal\n' + lit)
}
// A whole address over one alphabet: the code points told apart by the
// IDNA classes, the local part and the literal at once.
function mailbox(idna, part, withLiteral) {
  const lit = literal()
  const idnaOf = new Int32Array(MAX + 1).fill(-1)
  const keys = [...idna.keys()]
  keys.forEach((k, i) => idna.get(k).forEach(([lo, hi]) => idnaOf.fill(i, lo, hi + 1)))
  const litOf = new Int32Array(MAX + 1).fill(-1)
  lit.classes.forEach((r, i) => r.forEach(([lo, hi]) => litOf.fill(i, lo, hi + 1)))
  const by = new Map()
  for (let cp = 0; cp <= MAX; cp++) {
    if (0xd800 <= cp && cp <= 0xdfff) continue
    const k = idnaOf[cp] + ',' + localKey(cp) + ',' + litOf[cp]
    const r = by.get(k) ?? []
    by.set(k, r)
    const top = r[r.length - 1]
    if (top && top[1] + 1 === cp) top[1] = cp
    else r.push([cp, cp])
  }
  const alphabet = new Map([...by].map(([k, r]) => [k, r]))
  const start = { ph: 'local', at: 'start' }
  const step = (s, key) => {
    const [ii, lk, li] = key.split(',')
    const ik = keys[+ii]
    if ('local' === s.ph) {
      const at = localStep(s.at, lk)
      return undefined === at ? undefined : 'done' === at ? { ph: 'domain', d: part.start, fresh: true } : { ph: 'local', at }
    }
    if ('domain' === s.ph) {
      if (s.fresh && 'open' === lk) {
        return withLiteral ? { ph: 'lit', q: lit.states[0].next[+li] } : { ph: 'any' }
      }
      const d = part.step(s.d, ik)
      return undefined === d ? undefined : { ph: 'domain', d, fresh: false }
    }
    if ('lit' === s.ph) {
      const q = -1 === +li ? -1 : lit.states[s.q].next[+li]
      return -1 === q ? undefined : { ph: 'lit', q }
    }
    return s
  }
  const accept = (s) => ('domain' === s.ph && !s.fresh && part.end(s.d)) ||
    ('lit' === s.ph && lit.states[s.q].accept) || 'any' === s.ph
  return minimise(stepped(alphabet, start, step, accept))
}

const two = (n) => String(n).padStart(2, '0')
const digit = (d) => '%x3' + d
const lit = (s) => [...s].map((c) => digit(c)).join(' ')
const ANY = '*%x0-10FFFF'
const leap = (offsets) => `":" (%x30-35 ${ANY} / %x36 %x30 ["." 1*DIGIT] (${offsets}))`

function minutes(name, prefix) {
  const out = [`${name} = ${prefix}2DIGIT ":" (${[0, 1, 2, 3, 4, 5].map((t) => `${digit(t)} m${t}`).join(' / ')})`]
  for (let t = 0; t < 6; t++) {
    out.push(`m${t} = ${Array.from({ length: 10 }, (_, u) => `${digit(u)} s${t}${u}`).join(' / ')}`)
  }
  for (let m = 0; m < 60; m++) {
    const z = 59 === m ? ' / "Z"' : ''
    out.push(`s${two(m)} = ${leap(`"+" 2DIGIT ":" ${lit(two((m + 1) % 60))} / "-" 2DIGIT ":" ${lit(two(59 - m))}${z}`)}`)
  }
  return out.join('\n') + '\n'
}

function hours(name, prefix) {
  const tens = [[0, 9], [1, 9], [2, 3]]
  const out = [`${name} = ${prefix}(${tens.map(([t]) => `${digit(t)} h${t}`).join(' / ')})`]
  for (const [t, last] of tens) {
    out.push(`h${t} = ${Array.from({ length: last + 1 }, (_, u) => `${digit(u)} m${t}${u}`).join(' / ')}`)
  }
  for (let h = 0; h < 24; h++) {
    out.push(`m${two(h)} = ":" (%x35 (%x39 o${two(h)}-0 / %x30-38 o${two(h)}-1) / %x30-34 DIGIT o${two(h)}-1)`)
    for (const b of [0, 1]) {
      const z = 23 === h && 0 === b ? ' / "Z"' : ''
      out.push(`o${two(h)}-${b} = ${leap(`"+" ${lit(two((h - b + 25) % 24))} ":" 2DIGIT / "-" ${lit(two(23 - h))} ":" 2DIGIT${z}`)}`)
    }
  }
  return out.join('\n') + '\n'
}

// ---- the grammars, each from its RFC

const IPV6 = `
IPv6address =                            6( h16 ":" ) ls32
            /                       "::" 5( h16 ":" ) ls32
            / [               h16 ] "::" 4( h16 ":" ) ls32
            / [ *1( h16 ":" ) h16 ] "::" 3( h16 ":" ) ls32
            / [ *2( h16 ":" ) h16 ] "::" 2( h16 ":" ) ls32
            / [ *3( h16 ":" ) h16 ] "::"    h16 ":"   ls32
            / [ *4( h16 ":" ) h16 ] "::"              ls32
            / [ *5( h16 ":" ) h16 ] "::"              h16
            / [ *6( h16 ":" ) h16 ] "::"
h16         = 1*4HEXDIG
ls32        = ( h16 ":" h16 ) / IPv4address
IPv4address = dec-octet "." dec-octet "." dec-octet "." dec-octet
dec-octet   = DIGIT / %x31-39 DIGIT / "1" 2DIGIT / "2" %x30-34 DIGIT / "25" %x30-35
`

// RFC 3986 section 3 and appendix A; path-empty is "0<pchar>" there.
const URI = `
hier-part     = "//" authority path-abempty
              / path-absolute
              / path-rootless
              / path-empty
relative-ref  = relative-part [ "?" query ] [ "#" fragment ]
relative-part = "//" authority path-abempty
              / path-absolute
              / path-noscheme
              / path-empty
scheme        = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
authority     = [ userinfo "@" ] host [ ":" port ]
userinfo      = *( unreserved / pct-encoded / sub-delims / ":" )
host          = IP-literal / IPv4address / reg-name
port          = *DIGIT
IP-literal    = "[" ( IPv6address / IPvFuture  ) "]"
IPvFuture     = "v" 1*HEXDIG "." 1*( unreserved / sub-delims / ":" )
reg-name      = *( unreserved / pct-encoded / sub-delims )
path-abempty  = *( "/" segment )
path-absolute = "/" [ segment-nz *( "/" segment ) ]
path-noscheme = segment-nz-nc *( "/" segment )
path-rootless = segment-nz *( "/" segment )
path-empty    = ""
segment       = *pchar
segment-nz    = 1*pchar
segment-nz-nc = 1*( unreserved / pct-encoded / sub-delims / "@" )
pchar         = unreserved / pct-encoded / sub-delims / ":" / "@"
query         = *( pchar / "/" / "?" )
fragment      = *( pchar / "/" / "?" )
pct-encoded   = "%" HEXDIG HEXDIG
unreserved    = ALPHA / DIGIT / "-" / "." / "_" / "~"
sub-delims    = "!" / "$" / "&" / "'" / "(" / ")" / "*" / "+" / "," / ";" / "="
` + IPV6

// RFC 3987 section 2.2; ipath-empty is "0<ipchar>" there.
const IRI = `
ihier-part     = "//" iauthority ipath-abempty
               / ipath-absolute
               / ipath-rootless
               / ipath-empty
irelative-ref  = irelative-part [ "?" iquery ] [ "#" ifragment ]
irelative-part = "//" iauthority ipath-abempty
               / ipath-absolute
               / ipath-noscheme
               / ipath-empty
iauthority     = [ iuserinfo "@" ] ihost [ ":" port ]
iuserinfo      = *( iunreserved / pct-encoded / sub-delims / ":" )
ihost          = IP-literal / IPv4address / ireg-name
ireg-name      = *( iunreserved / pct-encoded / sub-delims )
ipath-abempty  = *( "/" isegment )
ipath-absolute = "/" [ isegment-nz *( "/" isegment ) ]
ipath-noscheme = isegment-nz-nc *( "/" isegment )
ipath-rootless = isegment-nz *( "/" isegment )
ipath-empty    = ""
isegment       = *ipchar
isegment-nz    = 1*ipchar
isegment-nz-nc = 1*( iunreserved / pct-encoded / sub-delims / "@" )
ipchar         = iunreserved / pct-encoded / sub-delims / ":" / "@"
iquery         = *( ipchar / iprivate / "/" / "?" )
ifragment      = *( ipchar / "/" / "?" )
iunreserved    = ALPHA / DIGIT / "-" / "." / "_" / "~" / ucschar
ucschar        = %xA0-D7FF / %xF900-FDCF / %xFDF0-FFEF
               / %x10000-1FFFD / %x20000-2FFFD / %x30000-3FFFD
               / %x40000-4FFFD / %x50000-5FFFD / %x60000-6FFFD
               / %x70000-7FFFD / %x80000-8FFFD / %x90000-9FFFD
               / %xA0000-AFFFD / %xB0000-BFFFD / %xC0000-CFFFD
               / %xD0000-DFFFD / %xE1000-EFFFD
iprivate       = %xE000-F8FF / %xF0000-FFFFD / %x100000-10FFFD
scheme         = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
port           = *DIGIT
IP-literal     = "[" ( IPv6address / IPvFuture  ) "]"
IPvFuture      = "v" 1*HEXDIG "." 1*( unreserved / sub-delims / ":" )
pct-encoded    = "%" HEXDIG HEXDIG
unreserved     = ALPHA / DIGIT / "-" / "." / "_" / "~"
sub-delims     = "!" / "$" / "&" / "'" / "(" / ")" / "*" / "+" / "," / ";" / "="
` + IPV6

const GENERATED = '; GENERATED by ts/scripts/formatgen.cjs (`make formatgen`); do not edit.\n'

function header(lines) {
  return GENERATED + lines.map((l) => '; ' + l + '\n').join('')
}

function write(rel, text) {
  const at = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(at), { recursive: true })
  fs.writeFileSync(at, text)
  console.log('formatgen: ' + rel + ', ' + text.length + ' bytes')
}

// A rule's text, each rule's lines wrapped for reading.
function wrapped(text) {
  const out = []
  for (const line of text.split('\n')) {
    out.push(/^[A-Za-z]/.test(line) ? wrap(line) : line)
  }
  return out.join('\n')
}

// The rules of a hand-written grammar, its comments left behind.
function rulesOf(rel) {
  return fs.readFileSync(path.join(OUT, rel), 'utf8').split('\n').filter((l) => !l.startsWith(';')).join('\n')
}

async function main() {
  const rfc = (name, start, src, lines) =>
    write(name + '.abnf', header(lines) + emit(fromRfc(start + '\n' + src), name))
  rfc('ipv6', 'ipv6 = IPv6address', IPV6,
    ['RFC 4291 section 2.2, as RFC 3986 section 3.2.2 writes it.'])
  rfc('uri', 'uri = scheme ":" hier-part [ "?" query ] [ "#" fragment ]', URI,
    ['RFC 3986 section 3, URI.'])
  rfc('uri-reference', 'uri-reference = uri / relative-ref\nuri = scheme ":" hier-part [ "?" query ] [ "#" fragment ]', URI,
    ['RFC 3986 section 4.1, URI-reference.'])
  rfc('iri', 'iri = scheme ":" ihier-part [ "?" iquery ] [ "#" ifragment ]', IRI,
    ['RFC 3987 section 2.2, IRI.'])
  rfc('iri-reference', 'iri-reference = iri / irelative-ref\niri = scheme ":" ihier-part [ "?" iquery ] [ "#" ifragment ]', IRI,
    ['RFC 3987 section 2.2, IRI-reference.'])
  write('email.abnf', header([
    'RFC 5321 section 4.1.2, Mailbox, with the address literals of section',
    '4.1.3: an IPv4 literal\'s numbers 0 to 255, and no more groups beside',
    '"::" than it leaves room for. IPv6 is the one registered tag.',
  ]) + emit(fromRfc(EMAIL), 'email'))
  write('hostname/hostname.abnf', header([
    'RFC 1123 section 2.1 host names, with the reserved labels of RFC 5890',
    'section 2.3.1: a label 1 to 63 long, and "--" in its third and fourth',
    'places only after "xn". An A-label is held to its ASCII syntax.',
    'A name meets every grammar of hostname/.',
  ]) + emit(hostname(), 'hostname'))
  write('hostname/length.abnf', header([
    'RFC 1035 section 2.3.4: a name of 255 octets at most, which is 253',
    'characters written without the root\'s trailing dot.',
    'A name meets every grammar of hostname/.',
  ]) + 'hostname-length = *253%x0-10FFFF\n')

  for (const [name, prefix, start] of [['time', '', 'full-time'], ['date-time', '10%x0-10FFFF "T" ', 'date-time']]) {
    const lines = (part) => [
      'RFC 3339 section 5.7: a second of 60 only in the minute that is 23:59',
      'in UTC once the offset is applied. This grammar holds the offset\'s ' + part + ';',
      'the ' + name + ' grammar beside it reads the ' + start + ' itself.',
    ]
    write(name + '/leap-minute.abnf', header(lines('minutes')) + wrapped(minutes(name + '-leap-minute', prefix)))
    write(name + '/leap-hour.abnf', header(lines('hours')) + wrapped(hours(name + '-leap-hour', prefix)))
  }
  write('date-time/date-time.abnf', header([
    'RFC 3339 section 5.6, date-time: full-date "T" full-time, the rules of',
    'date.abnf and time/time.abnf. A second of 60 is read at any minute',
    'here; the grammars beside this one hold it to section 5.7\'s.',
  ]) + 'date-time = full-date "T" full-time\n' + rulesOf('date.abnf').trimStart() +
    rulesOf('time/time.abnf').trimStart())

  const u = load(await fetchUcd())
  const al = alphabet(u)
  const lib = library(al)
  write('lib/idna.abnf', header([
    'The IDNA2008 classes of RFC 5892, derived from the Unicode Character',
    'Database ' + VERSION + ', after the mapping of UTS #46: each rule holds the',
    'code points past ASCII whose image the label rules of RFCs 5891, 5892',
    'and 5893 read alike. The format grammars that name them share them.',
  ]) + lib.map((l) => wrap(l.name + ' = ' + l.r.map(rangeText).join(' / '))).join('\n') + '\n')
  const conditions = [
    ['bidi', bidi(), 'RFC 5893 section 2, the Bidi rule, which a Bidi domain name holds each label to.'],
    ...Object.entries(CONTEXT).map(([n, f]) => [n, f(), 'RFC 5892 appendix A, the contextual rule for ' + n + '.']),
  ]
  const idnHost = [
    ['idn-hostname', syntax({ max: 63, reserved: true }), 'RFC 5890 section 2.3.2 and RFC 5891 section 4.2.3: label syntax; an ASCII label as hostname\'s.'],
    ...conditions,
  ]
  for (const [part, m, what] of idnHost) {
    const name = 'idn-hostname' === part ? part : 'idn-hostname-' + part
    write('idn-hostname/' + part + '.abnf', header([what, 'A name meets every grammar of idn-hostname/.']) +
      emit(minimise(stepped(al, m.start, m.step, m.end)), name, { lib, prefix: 'h' + part.slice(0, 2) }))
  }
  let next = 0
  const kept = []
  for (const [lo, hi] of lib.find((l) => 'idna-ignored' === l.name).r) {
    if (next < lo) kept.push([next, lo - 1])
    next = hi + 1
  }
  kept.push([next, 0x10FFFF])
  write('idn-hostname/length.abnf', header([
    'RFC 1035 section 2.3.4: a name of 253 characters at most, as hostname\'s,',
    'counted after the mapping of UTS #46, which an A-label only lengthens.',
    'A name meets every grammar of idn-hostname/.',
  ]) + wrapped('idn-hostname-length = *idna-ignored *253(hle-kept *idna-ignored)\n' +
    'hle-kept = ' + kept.map(rangeText).join(' / ') + '\n'))
  const idnEmail = [
    ['idn-email', syntax({ max: Infinity, reserved: false }), 'RFC 6531 section 3.3: the Mailbox of email.abnf, with UTF8-non-ascii in atext and qtextSMTP, and a sub-domain that may be a U-label.'],
    ...conditions,
  ]
  for (const [part, m, what] of idnEmail) {
    const name = 'idn-email' === part ? part : 'idn-email-' + part
    write('idn-email/' + part + '.abnf', header([what, 'An address meets every grammar of idn-email/.']) +
      emit(mailbox(al, m, 'idn-email' === part), name, { lib, prefix: 'e' + part.slice(0, 2) }))
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('formatgen: ' + e.message)
    process.exit(1)
  })
}
