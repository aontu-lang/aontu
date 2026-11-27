// aontu text as the definition's terms: a document read by the
// TypeScript engine's parser and printed as a Lean `Val` (spec/Aontu/
// Syntax.lean), its declarations as `Decls`, and data as `Data`. A
// construct the definition has no term for throws `Unsupported`.
//
//   node ts/scripts/defterm.cjs 'a: *1 | 2'          the term
//   node ts/scripts/defterm.cjs --data '{"a": 1.5}'  the data

const Path = require('node:path')
const { Lang } = require(Path.join(__dirname, '..', 'dist', 'lang.js'))

class Unsupported extends Error {}

const lang = new Lang()

function unsupported(what) {
  throw new Unsupported(what)
}

function leanStr(s) {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if ('"' === ch) out += '\\"'
    else if ('\\' === ch) out += '\\\\'
    else if ('\n' === ch) out += '\\n'
    else if ('\t' === ch) out += '\\t'
    else if (c < 0x20 || 0x7f === c) out += '\\u{' + c.toString(16) + '}'
    else out += ch
  }
  return out + '"'
}

function list(xs) {
  return '[' + xs.join(', ') + ']'
}

function int(n) {
  return n < 0n ? `(${n})` : `${n}`
}

// The Lean helpers the terms below call; `NI` and its kin fall back to
// a value the converter never hands them, since it checks first.
const PRELUDE = `open Aontu
def NI (n : Int) : Number := match Number.ofIntegerLeaf n with | some x => x | none => .biginteger ⟨n⟩
def NF (a : Int) (d : Nat) : Number := match Float.nearest a d with | some f => .float f | none => .biginteger ⟨0⟩
def ND (c s : Int) : Number := match BigDecimal.normal c s with | some x => .bigdecimal x | none => .biginteger ⟨0⟩
def L (x : Number) : Val := .lit (.num x)
def DT (exact neg : Bool) (d p : Nat) (e : Int) : Data :=
  match NumText.read exact ⟨neg, d, p, e⟩ with | some x => .num x | none => .null
`

const LEAF = 2n ** 53n

function integerLeaf(n) {
  const a = n < 0n ? -n : n
  if (a >= 2n ** 63n) return false
  let m = a
  while (m > 0n && 0n === m % 2n) m /= 2n
  return m < LEAF
}

function integer(n) {
  n = BigInt(n)
  if (!integerLeaf(n)) unsupported('an integer outside the integer leaf')
  return `NI ${int(n)}`
}

// A decimal text as an integer over a power of ten.
function ratio(text) {
  const m = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!m) unsupported('a number text ' + text)
  let digits = BigInt((m[2] || '') + (m[3] || '') || '0')
  let places = (m[3] || '').length - Number(m[4] || 0)
  if (places < 0) {
    digits *= 10n ** BigInt(-places)
    places = 0
  }
  return [('-' === m[1] ? -digits : digits), 10n ** BigInt(places)]
}

function float(x) {
  if (!Number.isFinite(x)) unsupported('a float that is not finite')
  const [a, d] = ratio(String(x))
  return `NF ${int(a)} ${d}`
}

function number(v) {
  const n = v.constructor.name
  if ('IntegerVal' === n) return integer(v.peg)
  if ('NumberVal' === n) return float(v.peg)
  if ('BigIntegerVal' === n) return `.biginteger ⟨${int(BigInt(v.peg))}⟩`
  if ('BigDecimalVal' === n) {
    return `ND ${int(BigInt(v.peg.unscaled))} ${int(BigInt(v.peg.scale))}`
  }
  return null
}

const KINDS = {
  Integer: '.integer', Float: '.float', Number: '.number',
  BigInteger: '.biginteger', BigDecimal: '.bigdecimal',
  String: '.string', Boolean: '.boolean',
}

// The calls whose class names the function directly, by its name.
const FNS = {
  AddFuncVal: 'add', SubFuncVal: 'sub', MulFuncVal: 'mul', DivFuncVal: 'div',
  ModFuncVal: 'mod', RemFuncVal: 'rem', NegFuncVal: 'neg',
  SumFuncVal: 'sum', LeastFuncVal: 'least', GreatestFuncVal: 'greatest',
  JoinFuncVal: 'join', PickFuncVal: 'pick', SortFuncVal: 'sort',
  UpperFuncVal: 'upper', LowerFuncVal: 'lower', TranslateFuncVal: 'translate',
  EscFuncVal: 'esc', UscFuncVal: 'usc', EncodeFuncVal: 'encode',
  DecodeFuncVal: 'decode', SplitFuncVal: 'split', RepFuncVal: 'rep',
  NomFuncVal: 'nom', SuperFuncVal: 'super', PrefFuncVal: 'pref',
  MoveFuncVal: 'move', CopyFuncVal: 'copy', RelateFuncVal: 'relate',
  AbnfFuncVal: 'abnf', EachFuncVal: 'each', PackFuncVal: 'pack',
  EmitFuncVal: 'emit', ApplyFuncVal: 'apply', MaybeFuncVal: 'maybe',
  GenFuncVal: 'gen',
}

const BOUNDS = {
  MinConstraintVal: ['min', 'min'], MaxConstraintVal: ['max', 'max'],
  AboveConstraintVal: ['above', 'above'], BelowConstraintVal: ['beneath', 'below'],
}

function args(v) {
  return Array.isArray(v.peg) ? v.peg : []
}

function call(fn, xs, ctx) {
  return `.call .${fn} ${list(xs.map((x) => term(x, ctx)))}`
}

function bound(x) {
  if ('StringVal' === x.constructor.name) return `.str ${leanStr(x.peg)}`
  const n = number(x)
  return null == n ? null : `.num (${n})`
}

// A record a rider carries is data, so only data has one.
function record(v) {
  if ('MapVal' !== v.constructor.name) unsupported('a rider whose record is no map')
  return list(entries(v).map(([k, x]) => `(${leanStr(k)}, ${data(x)})`))
}

function data(v) {
  const n = v.constructor.name
  const num = number(v)
  if (null != num) return `.num (${num})`
  if ('StringVal' === n) return `.str ${leanStr(v.peg)}`
  if ('BooleanVal' === n) return `.bool ${v.peg}`
  if ('NullVal' === n) return '.null'
  if ('MapVal' === n) return `.map ${record(v)}`
  if ('ListVal' === n) return `.list ${list(v.peg.map(data))}`
  unsupported('data that is no literal: ' + n)
}

function entries(v) {
  return Object.entries(v.peg || {})
}

// A relative path's climb: `.b` is one level up, each `.` before the
// first key one more.
function path(v) {
  const steps = v.peg.slice()
  if (steps.some((s) => 'string' !== typeof s)) unsupported('a path with a computed step')
  if (v.absolute) {
    if (1 === steps.length && steps[0].startsWith('%')) {
      return `.alias ${leanStr(aliasName(steps[0]))}`
    }
    if (steps.includes('.')) unsupported('a path with a climb after a step')
    return `.path ${list(steps.map((s) => `.key ${leanStr(s)}`))}`
  }
  let up = 1
  while ('.' === steps[0]) {
    up++
    steps.shift()
  }
  if (steps.includes('.') || steps.some((s) => s.startsWith('\u0000'))) {
    unsupported('a path the definition has no steps for')
  }
  return `.path ${list([`.up ${up}`, ...steps.map((s) => `.key ${leanStr(s)}`)])}`
}

function aliasName(key) {
  const m = /^%([^@]+)@#\d+$/.exec(key)
  if (!m) unsupported('an alias key ' + key)
  return m[1]
}

// Every list literal beneath an arm of a disjunction, or a lone `*`,
// reads as its own length: a sealed list.
function armTerm(v, ctx) {
  return term(v, { ...ctx, armLists: true })
}

function seal(v, ctx) {
  const n = v.constructor.name
  if ('MapVal' === n) return mapTerm(v, ctx, true)
  if ('ListVal' === n) return listTerm(v, ctx, true)
  unsupported('close() of a term that is no literal container')
}

function mapTerm(v, ctx, closed) {
  const opt = new Set(v.optionalKeys || [])
  if ((v.exportKeys || []).length) unsupported('export')
  const fs = []
  for (const [k, x] of entries(v)) {
    if (k.startsWith('%')) unsupported('a declaration below the top')
    const t = closed ? sealed(x, ctx) : term(x, ctx)
    fs.push(`(${leanStr(k)}, ${opt.has(k)}, ${t})`)
  }
  const cj = v.spread && v.spread.cj
  const spread = cj ? `(some (${closed ? sealed(cj, ctx) : term(cj, ctx)}))` : 'none'
  return `.map ${list(fs)} ${spread} ${closed || true === v.closed}`
}

function listTerm(v, ctx, closed) {
  const items = (v.peg || []).map((x) => (closed ? sealed(x, ctx) : term(x, ctx)))
  const cj = v.spread && v.spread.cj
  const spread = cj ? `(some (${closed ? sealed(cj, ctx) : term(cj, ctx)}))` : 'none'
  return `.list ${list(items)} ${spread} ${closed || true === v.closed || true === ctx.armLists}`
}

// `close()` seals every level, down through the literal containers.
function sealed(v, ctx) {
  const n = v.constructor.name
  if ('MapVal' === n || 'ListVal' === n) return seal(v, ctx)
  return term(v, ctx)
}

function rank(v) {
  let r = 0
  while ('PrefVal' === v.constructor.name) {
    r++
    v = v.peg
  }
  return [r, v]
}

function arms(v, out = []) {
  for (const a of v.peg) {
    if ('DisjunctVal' === a.constructor.name) arms(a, out)
    else out.push(a)
  }
  return out
}

function term(v, ctx = { seen: {} }) {
  const n = v.constructor.name
  const num = number(v)
  if (null != num) return `L (${num})`
  switch (n) {
    case 'StringVal': return `.lit (.str ${leanStr(v.peg)})`
    case 'BooleanVal': return `.lit (.bool ${v.peg})`
    case 'NullVal': return '.lit .null'
    case 'TopVal': return '.any'
    case 'PlaceVal': return '.hole'
    case 'MapKindVal': return '.mapKind'
    case 'ListKindVal': return '.listKind'
    case 'PathKindVal': return '.pathKind'
    case 'ScalarKindVal': {
      const k = KINDS[v.peg && v.peg.name]
      if (null == k) unsupported('a kind ' + (v.peg && v.peg.name))
      if ('.string' === k && true === v.emptyOk) return '.anyString'
      return k
    }
    case 'NilVal':
      if ('literal_nil' === v.why) return 'Val.void'
      unsupported('a refused term (' + v.why + ')')
    case 'MapVal': return mapTerm(v, ctx, false)
    case 'ListVal': return listTerm(v, ctx, false)
    case 'ConjunctVal': {
      const ts = v.peg.map((x) => term(x, ctx))
      return ts.slice(1).reduce((a, b) => `.meet (${a}) (${b})`, ts[0])
    }
    case 'DisjunctVal':
      return `.or ${list(arms(v).map((a) => {
        const [r, x] = rank(a)
        return `(${r}, ${armTerm(x, ctx)})`
      }))}`
    case 'PrefVal': {
      const [r, x] = rank(v)
      return `.pref ${r} (${armTerm(x, ctx)})`
    }
    case 'RefVal': return path(v)
    case 'VarVal':
      if ('StringVal' !== v.peg.constructor.name) unsupported('a computed variable')
      ctx.seen.vars = true
      return `Val.var ${leanStr(v.peg.peg)}`
    case 'PlusOpVal': return call('plus', v.peg, ctx)
    case 'KeyFuncVal': {
      const a = args(v)
      if (0 === a.length) return '.keyUp 1'
      if ('IntegerVal' !== a[0].constructor.name) unsupported('key() of no integer')
      return `.keyUp ${int(BigInt(a[0].peg))}`
    }
    case 'TypeFuncVal': return `.ride .type (${term(v.peg[0], ctx)}) []`
    case 'HideFuncVal': return `.ride .hide (${term(v.peg[0], ctx)}) []`
    case 'OpenFuncVal':
      if (0 === args(v).length) return '.ride .lifts .any []'
      return `.ride .opened (${term(v.peg[0], ctx)}) []`
    case 'CloseFuncVal':
      if (0 === args(v).length) return '.ride .seals .any []'
      return seal(v.peg[0], ctx)
    case 'MetaFuncVal': return `.ride .metadata (${term(v.peg[0], ctx)}) ${record(v.peg[1])}`
    case 'DeprecateFuncVal': {
      const a = args(v)
      return `.ride .deprecate (${term(a[0], ctx)}) ${a[1] ? record(a[1]) : '[]'}`
    }
    case 'IdentFuncVal': return `.ride .ident (${term(v.peg[0], ctx)}) ${record(v.peg[1])}`
    case 'AcyclicFuncVal': return '.ride .acyclic .absent []'
    case 'InverseFuncVal':
      if ('StringVal' !== v.peg[0].constructor.name) unsupported('inverse() of no string')
      return `.ride (.inverse ${leanStr(v.peg[0].peg)}) .absent []`
    case 'PathFuncVal': {
      const a = args(v)
      if (1 === a.length && 'RefVal' === a[0].constructor.name &&
        a[0].peg.every((s) => 'string' === typeof s && '.' !== s && !s.startsWith('%'))) {
        const steps = a[0].peg
        return `.addr ⟨${a[0].absolute ? 0 : 1}, ${list(steps.map(leanStr))}⟩`
      }
      return call('path', a, ctx)
    }
    case 'ParseFuncVal': {
      const a = args(v)
      if (1 === a.length && 'StringVal' === a[0].constructor.name) {
        return `.grammar ${leanStr(a[0].peg)}`
      }
      return call('parse', a, ctx)
    }
    case 'ReConstraintVal':
      if (1 !== args(v).length || 'StringVal' !== v.peg[0].constructor.name) {
        unsupported('re() of no one string')
      }
      return `.re ${leanStr(v.peg[0].peg)}`
    case 'FormatConstraintVal':
      if (1 !== args(v).length || 'StringVal' !== v.peg[0].constructor.name) {
        unsupported('format() of no one string')
      }
      return `.format ${leanStr(v.peg[0].peg)}`
    case 'UniqueConstraintVal': {
      const a = args(v)
      if (0 === a.length) return '.unique none'
      if ('StringVal' !== a[0].constructor.name) unsupported('unique() of no string')
      return `.unique (some ${leanStr(a[0].peg)})`
    }
    case 'MulofConstraintVal': {
      const d = 1 === args(v).length ? number(v.peg[0]) : null
      if (null == d) return call('bnd .mulof', args(v), ctx)
      return `.mulof (${d})`
    }
    case 'NeqConstraintVal': {
      const xs = v.neqs || []
      const bs = xs.map(bound)
      if (bs.some((b) => null == b)) return `.call (.bnd .neq) ${list(xs.map((x) => term(x, ctx)))}`
      return `.neq ${list(bs)}`
    }
    case 'LenConstraintVal': return `.len (${term(v.peg[0], ctx)})`
    case 'NofConstraintVal': {
      const xs = v.peg[0].peg
      return `.nof (${term(xs[0], ctx)}) ${list(xs.slice(1).map((x) => term(x, ctx)))}`
    }
    case 'MustConstraintVal': {
      const xs = v.peg[0].peg
      if ('StringVal' !== xs[1].constructor.name) unsupported('must() of no message')
      return `.must (${term(xs[0], ctx)}) ${leanStr(xs[1].peg)}`
    }
    case 'WhenConstraintVal': {
      const xs = v.peg[0].peg
      const e = xs[2] ? `(some (${term(xs[2], ctx)}))` : 'none'
      return `.when (${term(xs[0], ctx)}) (${term(xs[1], ctx)}) ${e}`
    }
    case 'ContainsConstraintVal': {
      const xs = args(v)
      const c = xs[1] ? term(xs[1], ctx) : `.min (.num (NI 1))`
      return `.contains (${term(xs[0], ctx)}) (${c})`
    }
    case 'RestConstraintVal': {
      const xs = args(v)
      const covers = xs.slice(1).map((c) => {
        if ('MapVal' !== c.constructor.name) unsupported('a cover of rest() that is no map')
        const f = (k) => (c.peg[k] ? `(some (${term(c.peg[k], ctx)}))` : 'none')
        return `(${f('if')}, ${f('keys')}, ${f('members')})`
      })
      return `.rest (${term(xs[0], ctx)}) ${list(covers)}`
    }
    case 'MatchFuncVal': {
      const xs = args(v)
      const pairs = []
      let i = 1
      for (; i + 1 < xs.length; i += 2) {
        pairs.push(`(${term(xs[i], ctx)}, ${term(xs[i + 1], ctx)})`)
      }
      const d = i < xs.length ? `(some (${term(xs[i], ctx)}))` : 'none'
      return `.select (${term(xs[0], ctx)}) ${list(pairs)} ${d}`
    }
    case 'KeyedFuncVal': {
      const xs = args(v)
      return `.select (.keyUp 0) [(${term(xs[1], ctx)}, ${term(xs[2], ctx)})] ` +
        `(some (${xs[3] ? term(xs[3], ctx) : '.any'}))`
    }
    case 'FilterFuncVal': return `.filter (${term(v.peg[0], ctx)}) (${term(v.peg[1], ctx)})`
  }
  if (BOUNDS[n]) {
    const xs = args(v)
    const b = 1 === xs.length ? bound(xs[0]) : null
    if (null == b) return call(`bnd .${BOUNDS[n][1]}`, xs, ctx)
    return `.${BOUNDS[n][0]} (${b})`
  }
  if (FNS[n]) return call(FNS[n], args(v), ctx)
  if (v.isCmpFunc) return call(`cmp .${v.cmp}`, args(v), ctx)
  if (v.isArithFunc && v.op) return call(v.op, args(v), ctx)
  unsupported('no term for ' + n)
}

// A document: its top-level declarations, and the rest as one term.
function doc(src) {
  const v = lang.parse(src)
  const ctx = { seen: {} }
  if (null == v) return { decls: '[]', term: '.map [] none false', vars: false }
  const decls = []
  if ('MapVal' === v.constructor.name) {
    const rest = Object.create(v)
    const peg = {}
    for (const [k, x] of entries(v)) {
      if (k.startsWith('%')) decls.push(`(${leanStr(aliasName(k))}, ${term(x, ctx)})`)
      else peg[k] = x
    }
    rest.peg = peg
    return { decls: list(decls), term: mapTerm(rest, ctx, false), vars: !!ctx.seen.vars }
  }
  return { decls: '[]', term: term(v, ctx), vars: !!ctx.seen.vars }
}

// JSON with each number kept as its text, read as `vet` reads it.
function jsonData(text, exact = false) {
  let i = 0
  const ws = () => {
    while (/\s/.test(text[i] || '')) i++
  }
  const val = () => {
    ws()
    const c = text[i]
    if ('{' === c) {
      i++
      const fs = []
      ws()
      if ('}' === text[i]) {
        i++
        return '.map []'
      }
      for (;;) {
        ws()
        const k = str()
        ws()
        if (':' !== text[i++]) throw new Unsupported('data that is no JSON')
        fs.push(`(${leanStr(k)}, ${val()})`)
        ws()
        if (',' === text[i]) i++
        else if ('}' === text[i++]) return `.map ${list(fs)}`
        else throw new Unsupported('data that is no JSON')
      }
    }
    if ('[' === c) {
      i++
      const xs = []
      ws()
      if (']' === text[i]) {
        i++
        return '.list []'
      }
      for (;;) {
        xs.push(val())
        ws()
        if (',' === text[i]) i++
        else if (']' === text[i++]) return `.list ${list(xs)}`
        else throw new Unsupported('data that is no JSON')
      }
    }
    if ('"' === c) return `.str ${leanStr(str())}`
    for (const [w, t] of [['true', '.bool true'], ['false', '.bool false'], ['null', '.null']]) {
      if (text.startsWith(w, i)) {
        i += w.length
        return t
      }
    }
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?/.exec(text.slice(i))
    if (!m) throw new Unsupported('data that is no JSON')
    i += m[0].length
    const digits = BigInt(m[2] + (m[3] || ''))
    return `DT ${exact} ${'-' === m[1]} ${digits} ${(m[3] || '').length} ${int(BigInt(m[4] || 0))}`
  }
  const str = () => {
    const m = /^"(?:[^"\\]|\\.)*"/.exec(text.slice(i))
    if (!m) throw new Unsupported('data that is no JSON')
    i += m[0].length
    return JSON.parse(m[0])
  }
  const out = val()
  ws()
  if (i !== text.length) throw new Unsupported('data that is no JSON')
  return out
}

module.exports = { doc, term, jsonData, data, Unsupported, PRELUDE, leanStr, lang }

if (require.main === module) {
  const a = process.argv.slice(2)
  try {
    if ('--data' === a[0]) console.log(jsonData(a[1]))
    else console.log(JSON.stringify(doc(a[0]), null, 2))
  }
  catch (e) {
    if (!(e instanceof Unsupported)) throw e
    console.log('unsupported: ' + e.message)
    process.exitCode = 1
  }
}
