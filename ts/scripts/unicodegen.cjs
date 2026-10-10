/* Copyright (c) 2026 Richard Rodger, MIT License */

// Regenerate the Unicode property tables a pattern's \p{...} reads in
// ECMA-262's u mode (ADR-060), from the Unicode Character Database at
// the version ts/scripts/ucd.cjs pins: General_Category, Script,
// Script_Extensions and the binary properties ECMA-262 lists, with
// every alias. Written once, to ts/src/unicodeprops.ts and
// go/unicodeprops.txt, which both suites hold identical. Run via `make
// unicodegen`; never edit the output.
//
// One line per table: a kind, its names (the short one first) and its
// code points as base-64 VLQ deltas, each range the gap from the last
// one's end and its length. `gcg` lines name the General_Category
// values a group joins; `scx` lines are ScriptExtensions.txt's sets,
// which a reader combines with each script's own code points. ASCII,
// Any, Assigned, the Unknown script and Script_Extensions are derived
// where they are read.
//
// With --delta it writes test/vectors/test262/unicode-17-to-18.tsv
// instead: for each property a vendored test262 file tests, the code
// points this release adds to its set and removes from it against the
// release before, read from both releases' pinned files by the
// committed reader, which is what a runner needs to hold the files,
// generated from the release before, to this one.

'use strict'

const fs = require('fs')
const path = require('path')
const { VERSION, PRIOR, fetchUcd, lines, span } = require('./ucd.cjs')

const ROOT = path.join(__dirname, '..', '..')
const TS_OUT = path.join(ROOT, 'ts', 'src', 'unicodeprops.ts')
const GO_OUT = path.join(ROOT, 'go', 'unicodeprops.txt')
const T262 = path.join(ROOT, 'test', 'vectors', 'test262')
const DIST = path.join(ROOT, 'ts', 'dist')

// ECMA-262's binary properties read from a file; ASCII, Any and
// Assigned are its own.
const BINARY = ['ASCII_Hex_Digit', 'Alphabetic', 'Bidi_Control', 'Bidi_Mirrored', 'Case_Ignorable', 'Cased',
  'Changes_When_Casefolded', 'Changes_When_Casemapped', 'Changes_When_Lowercased',
  'Changes_When_NFKC_Casefolded', 'Changes_When_Titlecased', 'Changes_When_Uppercased', 'Dash',
  'Default_Ignorable_Code_Point', 'Deprecated', 'Diacritic', 'Emoji', 'Emoji_Component', 'Emoji_Modifier',
  'Emoji_Modifier_Base', 'Emoji_Presentation', 'Extended_Pictographic', 'Extender', 'Grapheme_Base',
  'Grapheme_Extend', 'Hex_Digit', 'IDS_Binary_Operator', 'IDS_Trinary_Operator', 'ID_Continue', 'ID_Start',
  'Ideographic', 'Join_Control', 'Logical_Order_Exception', 'Lowercase', 'Math', 'Noncharacter_Code_Point',
  'Pattern_Syntax', 'Pattern_White_Space', 'Quotation_Mark', 'Radical', 'Regional_Indicator',
  'Sentence_Terminal', 'Soft_Dotted', 'Terminal_Punctuation', 'Unified_Ideograph', 'Uppercase',
  'Variation_Selector', 'White_Space', 'XID_Continue', 'XID_Start']
const BINARY_FILES = ['PropList.txt', 'DerivedCoreProperties.txt', 'emoji-data.txt',
  'DerivedBinaryProperties.txt', 'DerivedNormalizationProps.txt']

// UAX #44's General_Category groups.
const GROUPS = {
  C: ['Cc', 'Cf', 'Cn', 'Co', 'Cs'], L: ['Ll', 'Lm', 'Lo', 'Lt', 'Lu'], LC: ['Ll', 'Lt', 'Lu'],
  M: ['Mc', 'Me', 'Mn'], N: ['Nd', 'Nl', 'No'], P: ['Pc', 'Pd', 'Pe', 'Pf', 'Pi', 'Po', 'Ps'],
  S: ['Sc', 'Sk', 'Sm', 'So'], Z: ['Zl', 'Zp', 'Zs'],
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function norm(rs) {
  const out = []
  for (const [lo, hi] of [...rs].sort((a, b) => a[0] - b[0])) {
    const top = out[out.length - 1]
    if (top && lo <= top[1] + 1) top[1] = Math.max(top[1], hi)
    else out.push([lo, hi])
  }
  return out
}

// Each value's code points, in a file of `range ; value` lines.
function ranges(dir, f) {
  const out = new Map()
  for (const l of lines(dir, f)) {
    const [r, v] = l.split(';').map((x) => x.trim())
    if (!out.has(v)) out.set(v, [])
    out.get(v).push(span(r))
  }
  for (const [v, rs] of out) out.set(v, norm(rs))
  return out
}

const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function vlq(n) {
  let s = ''
  do {
    let d = n & 31
    n = Math.floor(n / 32)
    if (0 < n) d |= 32
    s += A64[d]
  } while (0 < n)
  return s
}

function encode(rs) {
  let at = 0
  return rs.map(([lo, hi]) => {
    const s = vlq(lo - at) + vlq(hi - lo)
    at = hi + 1
    return s
  }).join('')
}

function tables(dir) {
  const out = []
  const values = (prop) => lines(dir, 'PropertyValueAliases.txt')
    .map((l) => l.split(';').map((x) => x.trim())).filter((f) => prop === f[0]).map((f) => f.slice(1))

  const gc = ranges(dir, 'DerivedGeneralCategory.txt')
  for (const names of values('gc').sort((a, b) => cmp(a[0], b[0]))) {
    out.push(undefined === GROUPS[names[0]] ?
      ['gc', names, encode(gc.get(names[0]) ?? [])] : ['gcg', names, GROUPS[names[0]].join(' ')])
  }

  // Scripts.txt leaves Unknown out: it is what no other script holds.
  const sc = ranges(dir, 'Scripts.txt')
  for (const names of values('sc').sort((a, b) => cmp(a[0], b[0]))) {
    out.push(['sc', names, 'Zzzz' === names[0] ? '' : encode(sc.get(names[1]) ?? [])])
  }
  const scx = ranges(dir, 'ScriptExtensions.txt')
  for (const set of [...scx.keys()].sort(cmp)) {
    out.push(['scx', set.split(/\s+/), encode(scx.get(set))])
  }

  const aliases = new Map(lines(dir, 'PropertyAliases.txt').map((l) => l.split(';').map((x) => x.trim()))
    .map((f) => [f[1], f]))
  const sources = BINARY_FILES.map((f) => ranges(dir, f))
  for (const name of [...BINARY].sort(cmp)) {
    const from = sources.find((m) => m.has(name))
    if (undefined === from) throw new Error('no file holds ' + name)
    const [short, long, ...more] = aliases.get(name)
    out.push(['bin', [long, ...(short === long ? [] : [short]), ...more], encode(from.get(name))])
  }
  return out
}

function tableText(dir, version) {
  return '# GENERATED by ts/scripts/unicodegen.cjs (`make unicodegen`) from the Unicode ' +
    'Character Database ' + version + '; do not edit.\n' +
    tables(dir).map(([kind, names, data]) => kind + '\t' + names.join(' ') + '\t' + data).join('\n') + '\n'
}

// The committed reader's lookup over another release's table: a second
// instance of the compiled module, handed that text for its table.
function propertiesOf(text) {
  const table = require.resolve(path.join(DIST, 'unicodeprops'))
  const reader = require.resolve(path.join(DIST, 'uniprop'))
  const kept = require.cache[table]
  delete require.cache[reader]
  require.cache[table] = { id: table, filename: table, loaded: true, exports: { UNICODE_PROPS: text } }
  const { unicodeProperty } = require(reader)
  delete require.cache[reader]
  require.cache[table] = kept
  return unicodeProperty
}

async function delta() {
  const { unicodeProperty, union, complement } = require(path.join(DIST, 'uniprop'))
  const before = propertiesOf(tableText(await fetchUcd(PRIOR), PRIOR))
  const minus = (a, b) => complement(union([complement(a), b]))
  const hex = (c) => c.toString(16).toUpperCase().padStart(4, '0')
  const spans = (rs) => rs.map(([lo, hi]) => lo === hi ? hex(lo) : hex(lo) + '..' + hex(hi)).join(' ')
  const rows = []
  const files = fs.readdirSync(path.join(T262, 'property-escapes')).filter((f) => f.endsWith('.js')).sort(cmp)
  for (const file of files) {
    const stem = file.slice(0, -3)
    const [name, value] = stem.split('_-_')
    const was = before(name, value)
    const is = unicodeProperty(name, value)
    if (undefined === was || undefined === is) throw new Error('no table holds ' + stem)
    for (const [sign, rs] of [['+', minus(is, was)], ['-', minus(was, is)]]) {
      if (0 < rs.length) rows.push(stem + '\t' + sign + '\t' + spans(rs))
    }
  }
  const out = path.join(T262, 'unicode-' + PRIOR.split('.')[0] + '-to-' + VERSION.split('.')[0] + '.tsv')
  fs.writeFileSync(out, [
    '# GENERATED by ts/scripts/unicodegen.cjs --delta (`make unicodegen`); do not edit.',
    '# For each property a vendored test262 file tests, the code points',
    '# Unicode ' + VERSION + ' adds to its set (+) and removes from it (-)',
    '# against ' + PRIOR + ', the release the files were generated from.',
    '# Columns: file <TAB> + or - <TAB> code points, as UCD writes ranges.',
    ...rows].join('\n') + '\n')
  console.log('unicodegen: ' + files.length + ' test262 properties, ' + rows.length + ' changed sets')
}

async function main() {
  const text = tableText(await fetchUcd(), VERSION)
  fs.writeFileSync(GO_OUT, text)
  fs.writeFileSync(TS_OUT,
    '/* Copyright (c) 2026 Richard Rodger, MIT License */\n\n' +
    '// GENERATED by ts/scripts/unicodegen.cjs (`make unicodegen`) -- DO NOT EDIT.\n' +
    '// ts/test/regex.test.ts asserts it is identical with go/unicodeprops.txt.\n\n' +
    'const UNICODE_PROPS: string = ' + JSON.stringify(text) + '\n\n' +
    'export { UNICODE_PROPS }\n')
  console.log('unicodegen: ' + text.split('\n').length + ' lines, ' + text.length + ' bytes, Unicode ' + VERSION)
}

if (require.main === module) {
  (process.argv.includes('--delta') ? delta() : main()).catch((e) => {
    console.error('unicodegen: ' + e.message)
    process.exit(1)
  })
}
