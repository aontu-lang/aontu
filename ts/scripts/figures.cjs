/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE FIGURES THE DOCUMENTATION SHOWS, drawn by the engine and by the
// published grammar rather than by hand. A hand-drawn picture of the
// value lattice is a second source of truth for the one thing the
// language is built on, and it was wrong about `path()` and the numeric
// leaves for as long as it existed. The same argument covers the
// syntax: a diagram of the grammar that is not READ FROM the grammar is
// a diagram of what somebody believed the grammar said.
//
// Run by `make build-ts` after the compile, since it needs ts/dist;
// ts/test/docs.test.ts holds the committed files to what this writes,
// so a stale figure fails the suite rather than reaching a reader.

const Fs = require('node:fs')
const Path = require('node:path')

const { view } = require('../dist/view.js')
const { AbnfReader } = require('./abnf.cjs')
const Rail = require('@tabnas/railroad')

const ROOT = Path.join(__dirname, '..', '..')
const OUT = Path.join(ROOT, 'docs', 'figures')
const ABNF = Path.join(ROOT, 'grammar', 'aontu.abnf')


// ---------------------------------------------------------------------
// The value lattice, drawn by `aontu view lattice`.

// THE LATTICE IS THE LANGUAGE'S, so its source holds no values: a
// document that placed some would draw its own counts onto a figure the
// reference shows as the shape alone.
const LATTICE_SRC =
  '# The value lattice as the reference shows it: the language\'s\n' +
  '# scaffold, with no document\'s values on it.\n'

function drawLattice() {
  const report = view(LATTICE_SRC, { kind: 'lattice', as: 'svg' })
  if ('rendered' !== report.verdict) {
    throw new Error('figures: the lattice is ' + report.verdict + ': ' +
      JSON.stringify(report.errors ?? report.loss))
  }
  return report.text
}


// ---------------------------------------------------------------------
// The grammar, drawn from grammar/aontu.abnf.

// THE RULES, SPLIT IN TWO, and between them every rule in the file --
// the split is checked below, so a rule added to the grammar and to
// neither list fails the build rather than going undrawn. One figure of
// forty rules would be four thousand units wide and legible at no size;
// these are the two questions a reader actually arrives with. How a
// value COMPOSES:
const SYNTAX = ['root', 'value', 'disjunct', 'conjunct', 'prefixed', 'sum',
  'atom', 'map', 'entry', 'spread', 'pair', 'list', 'element', 'func',
  'name', 'ref', 'segment', 'place']

// and how one is SPELLED:
const LEXICAL = ['kind', 'scalar', 'string', 'char', 'unescaped', 'escape',
  'hex', 'exact', 'number', 'exponent', 'digits', 'ws',
  'ALPHA', 'DIGIT', 'DQUOTE']

// `name` is forty-four alternatives of one shape, and drawn as a fan it
// is three and a half thousand units of the same rounded box. The
// grammar text has the list, the reference tabulates it with what each
// one MEANS, and a third copy in a picture would be the widest and the
// least useful of the three.
const COLLAPSED = {
  name: () => Rail.Comment('one of the builtin functions'),
}

// WHITESPACE IS NOT DRAWN. The grammar threads `ws` between every pair
// of elements, which is true and which turns every track into an
// alternating chain of `ws` boxes. Eliding it is the ordinary railroad
// convention, the figure's caption says so, and `ws` is still drawn as
// a rule of its own in the lexical figure.
const isWs = (e) => 'ref' === e.t && 'ws' === e.v

// A character range as a reader sees it: the characters themselves
// where they are printable, and the RFC's own `%xHH` where they are
// not, since a control character cannot be shown as itself.
function rangeLabel(lo, hi) {
  const show = (cp) => 0x20 <= cp && cp < 0x7f
    ? String.fromCodePoint(cp) : '%x' + cp.toString(16).toUpperCase()
  return lo === hi ? show(lo) : show(lo) + '-' + show(hi)
}

// The reader's expression tree as a railroad node. The two vocabularies
// line up one for one, which is why this is a fold and not a layout.
function railNode(e) {
  switch (e.t) {
    case 'lit':
      return Rail.Terminal(e.v)
    case 'class':
      return Rail.Terminal(e.set.map(([lo, hi]) => rangeLabel(lo, hi)).join(' '))
    case 'ref':
      return Rail.NonTerminal(e.v)
    case 'seq': {
      const kept = e.v.filter((k) => !isWs(k))
      return 1 === kept.length
        ? railNode(kept[0]) : Rail.Sequence(...kept.map(railNode))
    }
    case 'alt':
      return Rail.Choice(...e.v.map(railNode))
    case 'rep': {
      // The three the railroad vocabulary has. A BOUNDED repetition
      // (`2*4x`, `4x`) has no node here and would have to be drawn as a
      // sequence or an unbounded rail, either of which says something
      // the grammar does not; the reader accepts the syntax, so this
      // refuses rather than draw it wrong.
      if (0 === e.min && 1 === e.max) {
        return Rail.Optional(railNode(e.v))
      }
      if (Infinity !== e.max) {
        throw new Error(
          'figures: a bounded repetition has no railroad node -- write ' +
          'the elements out, as grammar/aontu.abnf does for `hex`')
      }
      return 0 === e.min
        ? Rail.ZeroOrMore(railNode(e.v)) : Rail.OneOrMore(railNode(e.v))
    }
  }
}

// The railroad renderer states its palette in hex, which no host page
// can follow. Every colour becomes a CSS variable with that hex as its
// default, so the figure stays standalone and a page that binds
// `--rr-ink` and its kin gets it in the theme -- the arrangement the
// engine's own SVG figures already have with `--av-ink`.
//
// EVERY REWRITE MUST MATCH. A renderer that changes its palette would
// otherwise ship an unthemed figure in silence; here it fails the
// build, which is the only moment anyone is looking.
const RAIL_PALETTE = [
  ['background:#fff', 'background:var(--rr-bg,#fff)'],
  ['stroke:#334', 'stroke:var(--rr-rule,#334)'],
  ['fill:#334', 'fill:var(--rr-rule,#334)'],
  ['fill:#e8f0ff', 'fill:var(--rr-term,#e8f0ff)'],
  ['fill:#fff7e8', 'fill:var(--rr-nonterm,#fff7e8)'],
  ['fill:#ffe6b3', 'fill:var(--rr-nonterm-hover,#ffe6b3)'],
  ['fill:#111', 'fill:var(--rr-ink,#111)'],
  ['fill:#666', 'fill:var(--rr-muted,#666)'],
  ['fill:#113', 'fill:var(--rr-title,#113)'],
  ['fill:#333', 'fill:var(--rr-legend,#333)'],
]

function themed(svg) {
  let out = svg
  for (const [from, to] of RAIL_PALETTE) {
    if (!out.includes(from)) {
      throw new Error(
        `figures: the railroad palette no longer states ${from} -- the ` +
        'rewrite in RAIL_PALETTE has stopped applying, and the figure ' +
        'would ship a colour no host page can follow')
    }
    out = out.split(from).join(to)
  }
  return out
}

function drawGrammar(names) {
  const rules = new AbnfReader(Fs.readFileSync(ABNF, 'utf8')).rules()
  const drawn = new Set([...SYNTAX, ...LEXICAL])
  for (const name of rules.keys()) {
    if (!drawn.has(name)) {
      throw new Error(
        `figures: grammar/aontu.abnf defines ${name}, which neither ` +
        'railroad figure draws -- add it to SYNTAX or LEXICAL')
    }
  }
  const model = { start: names[0], rules: {}, meta: { engine: 'tabnas' } }
  for (const name of names) {
    const rule = rules.get(name)
    if (null == rule) {
      throw new Error(`figures: no rule ${name} in grammar/aontu.abnf`)
    }
    model.rules[name] = (COLLAPSED[name] ?? (() => railNode(rule)))()
  }
  return themed(Rail.modelToSvg(model))
}


// ---------------------------------------------------------------------

// The figures, by file name. Each is a thunk, so the check in
// ts/test/docs.test.ts and the write below draw from the one table.
const FIGURES = {
  'value-lattice.svg': drawLattice,
  'aontu-syntax.svg': () => drawGrammar(SYNTAX),
  'aontu-lexical.svg': () => drawGrammar(LEXICAL),
}

const draw = (name) => FIGURES[name]() + '\n'

module.exports = { FIGURES, OUT, draw }

if (require.main === module) {
  Fs.mkdirSync(OUT, { recursive: true })
  for (const name of Object.keys(FIGURES)) {
    Fs.writeFileSync(Path.join(OUT, name), draw(name))
    console.log('figures: wrote docs/figures/' + name)
  }
}
