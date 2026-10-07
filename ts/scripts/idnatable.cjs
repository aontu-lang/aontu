/* Copyright (c) 2026 Richard Rodger, MIT License */

// The IDNA table both ports read: test/spec/files/idna.txt, and its
// build-time copies ts/src/idnatable.ts and go/idnatable.txt. Run with
// no argument (`make idna`) it only copies the shared file; the suites
// assert each copy is identical with it. Run with the directory that
// holds the Unicode 16.0.0 files named below, each checked against its
// SHA-256, it first rewrites the shared file from them.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const root = path.join(__dirname, '..', '..')
const shared = path.join(root, 'test', 'spec', 'files', 'idna.txt')

const UNICODE = '16.0.0'
const INPUTS = {
  'IdnaMappingTable.txt': '6db2ef4ed35f3b3de74ebc2e00404a9607f76d499f576b8d4043cf14f1ed175c',
  'Idna2008-16.0.0.txt': 'b83a25cd1511077910ddb431d0744ea4fa7cee01e103b3e62f1a19df2866bfa3',
  'UnicodeData.txt': 'ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f',
  'DerivedNormalizationProps.txt': '4d4c03892dea9146d674b686e495df2d55a28d071ac474041d73518f887abddc',
  'Scripts.txt': '9e88f0a677df47311106340be8ede2ecdacd9c1c931831218d2be6d5508e0039',
  'DerivedJoiningType.txt': '6bd08b97da66b70ccfdab105a352de2984e02625239ec5695422c99b33d854f0',
  'DerivedBidiClass.txt': '71ed943a49c58568d8d92e80ecc2ba2f06e62aee9c8ebb0e6e8bd2c3ed8b180e',
  'DerivedGeneralCategory.txt': '7676ab755a41ef82108460238569e60ad65c191ddafe61b36c6765ec1353f293',
  'DerivedCombiningClass.txt': '52064d588c98c623b2373905e6a449eb520f900113954bcd212e94ef0810b471',
}

const MAX = 0x10ffff


function read(dir, name) {
  const bytes = fs.readFileSync(path.join(dir, name))
  const sum = crypto.createHash('sha256').update(bytes).digest('hex')
  if (sum !== INPUTS[name]) {
    throw new Error(name + ' is not the pinned file: sha256 ' + sum)
  }
  return bytes.toString('utf8')
}


// Each data line of a UCD file as its code point range and its fields.
function rows(text) {
  const out = []
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim()
    if ('' === line) {
      continue
    }
    const cells = line.split(';').map((c) => c.trim())
    const [a, b] = cells[0].split('..').map((h) => parseInt(h, 16))
    out.push({ lo: a, hi: undefined === b ? a : b, cells })
  }
  return out
}


// One value per code point, from the file's ranges.
function fill(list, value) {
  const at = new Array(MAX + 1).fill(undefined)
  for (const r of list) {
    const v = value(r)
    if (undefined !== v) {
      for (let c = r.lo; c <= r.hi; c++) {
        at[c] = v
      }
    }
  }
  return at
}


const hex = (c) => c.toString(16).toUpperCase().padStart(4, '0')


// Runs of one value as `lo[-hi] value`, the code points where `keep`
// holds and the value is defined.
function ranges(at, keep) {
  const out = []
  let lo = -1
  for (let c = 0; c <= MAX + 1; c++) {
    const v = c <= MAX && keep(c) ? at[c] : undefined
    if (0 <= lo && (v !== at[lo] || c > MAX)) {
      out.push((lo === c - 1 ? hex(lo) : hex(lo) + '-' + hex(c - 1)) + ' ' + at[lo])
      lo = -1
    }
    if (0 > lo && undefined !== v) {
      lo = c
    }
  }
  return out
}


function generate(dir) {
  const uts = rows(read(dir, 'IdnaMappingTable.txt'))
  const status = fill(uts, (r) => ({
    valid: 'V', deviation: 'V', ignored: 'I', mapped: 'M', disallowed: undefined,
  })[r.cells[1]])
  const mapping = fill(uts, (r) => 'mapped' === r.cells[1] ?
    r.cells[2].split(' ').map((h) => hex(parseInt(h, 16))).join(' ') : undefined)

  const cat = fill(rows(read(dir, 'Idna2008-16.0.0.txt')), (r) =>
    ({ PVALID: 'P', CONTEXTJ: 'J', CONTEXTO: 'O' })[r.cells[1]])
  const usable = (c) => undefined !== cat[c]

  const mark = fill(rows(read(dir, 'DerivedGeneralCategory.txt')), (r) =>
    ['Mn', 'Mc', 'Me'].includes(r.cells[1]) ? 'M' : undefined)
  const BIDI = ['L', 'R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'BN', 'NSM']
  const bidi = fill(rows(read(dir, 'DerivedBidiClass.txt')), (r) =>
    BIDI.includes(r.cells[1]) ? r.cells[1] : 'X')
  const joining = fill(rows(read(dir, 'DerivedJoiningType.txt')), (r) =>
    ['L', 'D', 'R', 'T'].includes(r.cells[1]) ? r.cells[1] : undefined)
  const script = fill(rows(read(dir, 'Scripts.txt')), (r) => ({
    Greek: 'G', Hebrew: 'H', Hiragana: 'K', Katakana: 'K', Han: 'K',
  })[r.cells[1]])

  const ccc = fill(rows(read(dir, 'DerivedCombiningClass.txt')), (r) =>
    '0' === r.cells[1] ? undefined : r.cells[1])
  const decomp = new Array(MAX + 1).fill(undefined)
  for (const line of read(dir, 'UnicodeData.txt').split('\n')) {
    const f = line.split(';')
    if (6 <= f.length && '' !== f[5] && !f[5].startsWith('<')) {
      decomp[parseInt(f[0], 16)] = f[5].split(' ').map((h) => hex(parseInt(h, 16))).join(' ')
    }
  }
  const exclusion = fill(rows(read(dir, 'DerivedNormalizationProps.txt')), (r) =>
    'Full_Composition_Exclusion' === r.cells[1] ? 'X' : undefined)

  const all = () => true
  const each = (at) => at.flatMap((v, c) => undefined === v ? [] : [hex(c) + ' ' + v])
  const sections = [
    ['status', 'the UTS #46 status, V valid or deviation, I ignored, M mapped; disallowed elsewhere', ranges(status, all)],
    ['mapping', 'what a mapped code point is replaced by', each(mapping)],
    ['category', 'the IDNA2008 derived property, P PVALID, J CONTEXTJ, O CONTEXTO; DISALLOWED or UNASSIGNED elsewhere', ranges(cat, all)],
    ['mark', 'General_Category Mark, of the code points a label may hold', ranges(mark, usable)],
    ['bidi', 'Bidi_Class, X for a class RFC 5893 does not name, of the code points a label may hold', ranges(bidi, usable)],
    ['joining', 'Joining_Type L, D, R or T, of the code points a label may hold', ranges(joining, usable)],
    ['script', 'Greek G, Hebrew H, and Hiragana, Katakana or Han K, of the code points a label may hold', ranges(script, usable)],
    ['ccc', 'Canonical_Combining_Class, where not 0', ranges(ccc, all)],
    ['decomposition', 'the canonical decomposition mapping', each(decomp)],
    ['exclusion', 'Full_Composition_Exclusion', ranges(exclusion, all)],
  ]
  const out = ['# The IDNA table: Unicode ' + UNICODE + ', from UTS #46\'s IdnaMappingTable.txt,',
    '# Idna2008-' + UNICODE + '.txt and the Unicode Character Database, written by',
    '# ts/scripts/idnatable.cjs. DO NOT EDIT. Code points are hexadecimal, a',
    '# range is lo-hi, and each section opens with @ and its name.']
  for (const [name, what, lines] of sections) {
    out.push('@' + name + ' ' + what, ...lines)
  }
  fs.writeFileSync(shared, out.join('\n') + '\n')
}


if (process.argv[2]) {
  generate(process.argv[2])
}
const text = fs.readFileSync(shared, 'utf8')
const ts = '/* Copyright (c) 2026 Richard Rodger, MIT License */\n\n' +
  '// GENERATED by ts/scripts/idnatable.cjs (`make idna`) from\n' +
  '// test/spec/files/idna.txt. DO NOT EDIT. ts/test/idna.test.ts asserts\n' +
  '// this copy is identical with the shared file.\n\n' +
  'const IDNATABLE: string =\n' +
  JSON.stringify(text) + '\n\n' +
  'export { IDNATABLE }\n'
fs.writeFileSync(path.join(root, 'ts', 'src', 'idnatable.ts'), ts)
fs.writeFileSync(path.join(root, 'go', 'idnatable.txt'), text)
console.log('idna: wrote ts/src/idnatable.ts and go/idnatable.txt (' +
  text.length + ' bytes)')
