/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE SOURCE FORMATTER (docs/design/FMT.0.md): `aontu fmt`, in the
// tradition of gofmt. One agreed form for Aontu source, so that layout
// is never argued about and a diff shows only what changed.
//
// It reads the token stream the parser reads -- the lex subscriber the
// parser stack exposes -- so it sees what the value tree throws away:
// comments, blank lines, the quote a string used, the spelling of a
// number. From that stream it builds a layout tree, decides the shape
// of every container by the rules of the note's §3, and emits. Before
// returning it re-parses what it wrote and compares the two parse
// trees: a formatter that cannot prove its output is the same document
// refuses rather than return it.
//
// Two tiers. The syntactic (P1): whitespace, commas, quotes, bare
// keys, chains and pair elements, none of which changes the parse
// tree. The lawful (P2), over it: repeat the prefix, and merge what
// repeats -- rewrites that rest on the meet, each checked by the meet
// in isolation and kept only where the engine agrees.
//
// The Go twin is go/format.go, function for function; the shared
// behaviour is test/spec/fmt.tsv, executed by both spec runners.

import { Aontu } from './aontu'
import { failureFinding } from './vet'
import type { VetFinding } from './vet'
import type { Resolver } from './type'


// The packing budget (§3.1). It decides which of two legal spellings
// to use, one line or several, and nothing else: the formatter never
// breaks a line, so a value wider than this stays as wide as it is.
const BUDGET = 80

// THE DEPTH BUDGET. The layout is recursive, as the tree it reads is,
// and the canonical port's stack is finite: past the evaluation budget
// of 1000 levels -- the depth at which unification itself refuses --
// the formatter stops reading and refuses, so a pathological document
// is a finding rather than a crash.
const MAX_DEPTH = 1000

export type FormatOptions = {
  // The file's name, for the site of a parse failure.
  path?: string
  // Report the style findings of §4 -- key case, repeated shapes --
  // beside the text. The formatter never acts on them.
  lint?: boolean
}

// A style finding (§4): what the formatter points at and never
// touches. `line` and `col` are 1-based, of the key or the container.
export type LintFinding = {
  rule: 'style/key-case' | 'style/repeat'
  line: number
  col: number
  message: string
}

// The self-check, injectable so the refusal it guards can be exercised
// (the `hooks` precedent of `view`): a formatter that is right never
// takes that arm on its own.
export type FormatHooks = {
  same?: (root: any, after: string) => boolean
  meet?: (before: string, after: string) => boolean
}

export type FormatReport =
  | { verdict: 'formatted', text: string, changed: boolean, findings: LintFinding[] }
  | { verdict: 'error', errors: VetFinding[] }


// ---------------------------------------------------------------------
// The tokens

type Tok = { name: string, src: string, val: any, sI: number }

// EVERY INCLUDE RESOLVES TO NOTHING. The formatter reads the file it is
// given and no other (§3.13), so `@"..."` is answered from memory with
// an empty source: the directive parses, the include is a token like
// any other, and no capability is needed because no file is read.
const stubResolver: Resolver = ((spec: any) => ({
  ...spec, kind: 'aon', full: '__fmt__.aon', src: '', found: true, search: [],
})) as any

// ONE ENGINE, ONE SUBSCRIBER. The parser's subscriber list is
// append-only, so the subscription is made once and writes to
// whichever sink the current parse installed; the sink is cleared
// before the parse returns, so the check's re-parse collects nothing.
let ENGINE: Aontu | undefined
let SINK: Tok[] | undefined

function engine(): Aontu {
  if (undefined === ENGINE) {
    ENGINE = new Aontu({ resolver: stubResolver })
    ENGINE.lang.jsonic.sub({
      lex: (tkn: any) => {
        // Spaces carry nothing the layout needs, and the end token
        // arrives once per nested parse -- the stub's empty includes
        // among them -- so both are dropped here rather than skipped
        // everywhere below.
        if (undefined !== SINK && '#SP' !== tkn.name && '#ZZ' !== tkn.name) {
          SINK.push({ name: tkn.name, src: tkn.src, val: tkn.val, sI: tkn.sI })
        }
      },
    })
  }
  return ENGINE
}


type Parsed = { root?: any, errors?: VetFinding[] }

// One parse, with the token stream collected when a sink is given. The
// failure shape is the one every verb reports (`view`'s load).
function parseDoc(src: string, path: string | undefined, sink: Tok[] | undefined): Parsed {
  const aontu = engine()
  const ctx = aontu.ctx({ collect: true })
  SINK = sink
  let parsed: any
  try {
    parsed = aontu.parse(src, undefined === path ? undefined : { path }, ctx)
  }
  finally {
    SINK = undefined
  }
  if (0 < ctx.err.length) {
    return { errors: [failureFinding(ctx, path, parsed)] }
  }
  return { root: parsed }
}


// ---------------------------------------------------------------------
// The layout tree

// One node shape for the whole tree, so the Go twin is one struct:
// the kind says which fields are meaningful.
type Node = {
  t: 'pair' | 'spread' | 'include' | 'comment' | 'blank' | 'map' | 'list'
  | 'atom' | 'call' | 'paren' | 'expr' | 'op' | 'prefix' | 'note'

  // atom, include, comment, note, op, prefix: the text as written,
  // normalised where §3.9 says (quotes), and nothing else.
  text?: string

  // pair: the key as it will be written, the optional marker, and the
  // value; spread: the value.
  key?: string
  opt?: boolean
  // pair: written with `=`, the alias declaration operator, rather than
  // a colon. The spelling is the parse's -- a colon after an alias name
  // is a refused document, and the formatter keeps it one.
  alias?: boolean
  value?: Node

  // map, list: the entries, and the comment on the opener's line.
  body?: Node[]
  open?: string

  // call: the name and the arguments; paren: what it groups, which the
  // parser reads as a call's argument list does (commas and all).
  name?: string
  args?: Node[]
  inner?: Node[]

  // expr: operands, binary operators, prefix operators and notes (a
  // comment inside the expression), in source order.
  items?: Node[]

  // op: the author broke the line at this operator (§3.11).
  brk?: boolean

  // A comment on the last line of this entry.
  trail?: string

  // An argument: a comma stood before it (§3.6), rather than a space.
  sep?: boolean

  // pair: the statements this one replaces, where the lawful tier
  // merged them, or rewrote something below them.
  orig?: Node[]

  // The source index of the node's first token: the lint's positions.
  at?: number
}

const BINARY: Record<string, boolean> = { '#E&': true, '#E|': true, '#E+': true }
const PREFIX: Record<string, boolean> = { '#E*': true, '#E-': true }
const KEYISH: Record<string, boolean> = { '#TX': true, '#ST': true, '#NR': true, '#VL': true }
const CLOSER: Record<string, boolean> = { '#CB': true, '#CS': true, '#E)': true }

// The parts of one atom: a reference is `$`, dots and segments lexed
// one by one, and a bare word with a dot in it is the same run; what
// was adjacent in the source stays glued.
const GLUE: Record<string, boolean> = {
  '#TX': true, '#ST': true, '#NR': true, '#VL': true, '#E.': true, '#E$': true,
}

const BARE = /^[A-Za-z_][A-Za-z0-9_]*$/

// A single-quoted string becomes double-quoted unless it holds a double
// quote, which the swap would have to escape (§3.9). The body is copied
// as written: the escapes are the same under both quotes.
function normStr(src: string): string {
  if ("'" === src[0]) {
    const body = src.slice(1, -1)
    return body.includes('"') ? src : '"' + body + '"'
  }
  return src
}

function atomText(tok: Tok): string {
  return '#ST' === tok.name ? normStr(tok.src) : tok.src
}

// A quoted key whose text is a legal bare key is written bare; the
// keywords are legal keys too (`string: 1` is the key `string`), so no
// word is reserved. Anything else keeps its spelling.
function keyText(tok: Tok): string {
  if ('#ST' === tok.name) {
    return BARE.test(tok.val) ? tok.val : normStr(tok.src)
  }
  return tok.src
}

function newlines(src: string): number {
  return src.split('\n').length - 1
}


class Reader {
  T: Tok[]
  i = 0
  depth = 0
  // Past the depth budget: the reader answers '' for every token from
  // here on, so every loop unwinds, and the document is refused.
  deep = false

  constructor(toks: Tok[]) {
    this.T = toks
  }

  // The name of the token k ahead, or '' past the end.
  name(k: number): string {
    const t = this.T[this.i + k]
    return this.deep || undefined === t ? '' : t.name
  }

  // The offset of the next token that is not a line run or a comment.
  significant(): number {
    let k = 0
    while ('#LN' === this.name(k) || '#CM' === this.name(k)) {
      k++
    }
    return k
  }

  // A key followed by a colon, the optional marker allowed between.
  atKey(): boolean {
    return KEYISH[this.name(0)] && ('#CL' === this.name(1) ||
      ('#QM' === this.name(1) && '#CL' === this.name(2)))
  }

  // The entries of a container up to its closer, or of the document up
  // to its end. Comments attach by the rules of §3.7: on the line of
  // the entry that precedes them, or of the opener, they trail it;
  // alone on a line they stand as entries and precede what follows.
  body(close: string, opened: boolean): { body: Node[], open?: string } {
    const body: Node[] = []
    let open: string | undefined
    let last: Node | undefined
    let opener = opened
    // Nothing since the opener or the last comma: a comma here is an
    // empty element, which the parser reads as nil in a list.
    let gap = true
    for (;;) {
      const n = this.name(0)
      // The closer, or the end: the parser accepts a container the
      // source never closed (`a: {` is `{"a":{}}`).
      if ('' === n || n === close) {
        break
      }
      if ('#LN' === n) {
        if (1 < newlines(this.T[this.i].src) && 0 < body.length &&
          'blank' !== body[body.length - 1].t) {
          body.push({ t: 'blank' })
        }
        last = undefined
        opener = false
        this.i++
        continue
      }
      if ('#CA' === n) {
        if (gap && '#CS' === close) {
          const nil: Node = { t: 'atom', text: 'nil' }
          body.push(nil)
          last = nil
        }
        gap = true
        this.i++
        continue
      }
      if ('#CM' === n) {
        const text = this.T[this.i].src
        if (undefined !== last) {
          last.trail = text
        }
        else if (opener) {
          open = text
        }
        else {
          body.push({ t: 'comment', text })
        }
        this.i++
        continue
      }
      if (CLOSER[n]) {
        // A closer that is not this container's: the parser ignores a
        // stray one at the root (`a: 1 }` is `{"a":1}`), and so does
        // this.
        this.i++
        continue
      }
      const e = this.entry()
      body.push(e)
      last = e
      opener = false
      gap = false
    }
    // A blank line before the closer is no paragraph break: nothing
    // follows it, and the layout would drop it anyway.
    while (0 < body.length && 'blank' === body[body.length - 1].t) {
      body.pop()
    }
    return { body, open }
  }

  // One entry: an include, a spread, a pair, or -- as a list element or
  // at the root -- a value.
  entry(): Node {
    const n = this.name(0)
    const at = this.T[this.i].sI
    if ('#OD_multisource' === n) {
      const text = '@' + normStr(this.T[this.i + 1].src)
      this.i += 2
      return { t: 'include', text, at }
    }
    if ('#E&' === n && '#CL' === this.name(1)) {
      this.i += 2
      return { t: 'spread', value: this.value(), at }
    }
    if (this.atKey()) {
      const tok = this.T[this.i]
      const opt = '#QM' === this.name(1)
      const alias = '=' === this.T[this.i + (opt ? 2 : 1)].src
      this.i += opt ? 3 : 2
      return { t: 'pair', key: keyText(tok), opt, alias, value: this.value(), at }
    }
    return this.value()
  }

  // A value: operands and operators up to whatever ends it -- a
  // separator, a closer, the end, or a line run that no operator
  // continues past.
  value(): Node {
    if (MAX_DEPTH < ++this.depth) {
      this.deep = true
    }
    const v = this.valueAt()
    this.depth--
    return v
  }

  valueAt(): Node {
    const items: Node[] = []
    for (;;) {
      const n = this.name(0)
      if ('' === n || '#CA' === n || CLOSER[n]) {
        break
      }
      // An operand directly after an operand is the next element of a
      // list, `[1 -2]`, `[{a:1} {b:2}]`: this value is complete.
      if (!this.open(items) && !BINARY[n] && '#LN' !== n && '#CM' !== n) {
        break
      }
      const at = this.T[this.i].sI
      if ('#E&' === n && '#CL' === this.name(1)) {
        if (0 === items.length) {
          // A chain through a spread, `a: &: integer`. The braces are
          // the agreed spelling (X-7), so it is read as the map it is.
          this.i += 2
          return { t: 'map', body: [{ t: 'spread', value: this.value(), at }], at }
        }
        // A sibling spread in a list, `[1 &: 2]`: this value is complete.
        break
      }
      if ('#LN' === n) {
        // A break the author put before the value, after an operator
        // (`a: 1 &\n  2`) or before one (`a: 1\n  | 2`), or after a
        // comment inside the value; anything else ends the value.
        if (this.open(items) || BINARY[this.name(this.significant())]) {
          this.i++
          continue
        }
        break
      }
      if ('#CM' === n) {
        // A comment inside the value: after the colon, after an
        // operator, or on a line the value continues past. Otherwise
        // it trails the statement and the caller attaches it.
        if (this.open(items) || BINARY[this.name(this.significant())]) {
          items.push({ t: 'note', text: this.T[this.i].src, at })
          this.i++
          continue
        }
        break
      }
      if (BINARY[n]) {
        items.push({
          t: 'op', text: this.T[this.i].src,
          brk: '#LN' === this.name(-1) || '#LN' === this.name(1), at,
        })
        this.i++
        continue
      }
      if (PREFIX[n]) {
        items.push({ t: 'prefix', text: this.T[this.i].src, at })
        this.i++
        continue
      }
      if ('#E(' === n) {
        this.i++
        const inner = this.seq()
        this.i++
        items.push({ t: 'paren', inner, at })
        continue
      }
      if ('#TX' === n && '#E(' === this.name(1)) {
        const name = this.T[this.i].src
        this.i += 2
        const args = this.seq()
        this.i++
        items.push({ t: 'call', name, args, at })
        continue
      }
      if ('#OB' === n) {
        this.i++
        const m = this.body('#CB', true)
        this.i++
        items.push({ t: 'map', body: m.body, open: m.open, at })
        continue
      }
      if ('#OS' === n) {
        this.i++
        const l = this.body('#CS', true)
        this.i++
        items.push({ t: 'list', body: l.body, open: l.open, at })
        continue
      }
      if ('#OD_multisource' === n) {
        items.push({ t: 'include', text: '@' + normStr(this.T[this.i + 1].src), at })
        this.i += 2
        continue
      }
      if (this.atKey()) {
        // A pair in value position is a chain, `a: b: 1`, and it is
        // the whole of the value.
        items.push(this.entry())
        break
      }
      items.push(this.atom())
    }
    if (1 === items.length && 'op' !== items[0].t && 'prefix' !== items[0].t &&
      'note' !== items[0].t) {
      return items[0]
    }
    // An empty value, `a:`, is an expression with nothing in it.
    return { t: 'expr', items, at: items[0]?.at }
  }

  // Whether the expression so far wants an operand: nothing yet, or an
  // operator, a prefix or a comment last.
  open(items: Node[]): boolean {
    if (0 === items.length) {
      return true
    }
    const t = items[items.length - 1].t
    return 'op' === t || 'prefix' === t || 'note' === t
  }

  // The token under the cursor, and the parts glued to it.
  atom(): Node {
    const at = this.T[this.i].sI
    let text = atomText(this.T[this.i])
    this.i++
    while (GLUE[this.name(0)] &&
      this.T[this.i - 1].sI + this.T[this.i - 1].src.length === this.T[this.i].sI) {
      text += atomText(this.T[this.i])
      this.i++
    }
    return { t: 'atom', text, at }
  }

  // A call's arguments, or a parenthesis's contents, up to the closing
  // parenthesis: values separated by commas, with a comment among them
  // kept as a note.
  seq(): Node[] {
    const out: Node[] = []
    let gap = true
    let comma = false
    for (;;) {
      const n = this.name(0)
      if ('' === n || CLOSER[n]) {
        break
      }
      if ('#LN' === n) {
        this.i++
        continue
      }
      if ('#CA' === n) {
        if (gap) {
          out.push({ t: 'atom', text: 'nil', sep: comma })
        }
        gap = true
        comma = true
        this.i++
        continue
      }
      if ('#CM' === n) {
        out.push({ t: 'note', text: this.T[this.i].src })
        this.i++
        continue
      }
      const v = this.value()
      v.sep = comma
      out.push(v)
      gap = false
      comma = false
    }
    return out
  }
}


// THE ROOT MAP HAS NO BRACES (§3.12). A document written as one braced
// map is its entries; the comments on the braces' lines become entries
// of their own, where nothing is lost.
function unwrap(root: Node[]): Node[] {
  const entries = root.filter((n) => 'comment' !== n.t && 'blank' !== n.t)
  if (1 !== entries.length || 'map' !== entries[0].t) {
    return root
  }
  const m = entries[0]
  const out: Node[] = []
  for (const n of root) {
    if (n !== m) {
      out.push(n)
      continue
    }
    if (undefined !== m.open) {
      out.push({ t: 'comment', text: m.open })
    }
    out.push(...m.body!)
    if (undefined !== m.trail) {
      out.push({ t: 'comment', text: m.trail })
    }
  }
  return out
}


// ---------------------------------------------------------------------
// The layout

// D1: a one-pair map in value position is written as a chain, and a
// one-pair map as a list element as a pair element. A map whose only
// entry is a spread keeps its braces (X-7), and one holding a comment
// keeps them too, because the comment needs the lines. A trailing
// comment on the map's line joins the pair's own.
function chain(node: Node): Node {
  if ('map' !== node.t || undefined !== node.open || 1 !== node.body!.length ||
    'pair' !== node.body![0].t) {
    return node
  }
  const p = node.body![0]
  if (undefined === node.trail) {
    return p
  }
  return { ...p, trail: undefined === p.trail ? node.trail : p.trail + ' ' + node.trail }
}

function width(s: string): number {
  return Array.from(s).length
}

function pairHead(node: Node, tight: boolean): string {
  // An alias declaration is `%name = value` at every width: the `=` is
  // an operator, and operators are spaced (§3.2).
  if (node.alias) {
    return node.key! + ' = '
  }
  return node.key! + (node.opt ? '?' : '') + (tight ? ':' : ': ')
}

// The one-line spelling of a node, or undefined where it has none: a
// comment, a blank line, a break the author kept, a string that spans
// lines. `tight` is the inline form of a pair, `a:1`, used inside a
// container; a statement's pair is `a: 1`.
function inline(node: Node, tight: boolean): string | undefined {
  if (undefined !== node.trail) {
    return undefined
  }
  switch (node.t) {
    case 'atom':
    case 'include':
      return node.text!.includes('\n') ? undefined : node.text
    case 'pair': {
      const v = inline(chain(node.value!), tight)
      return undefined === v ? undefined : pairHead(node, tight) + v
    }
    case 'spread': {
      // `{ &: integer }`, padded inside braces too: the marker reads as
      // a marker and not as a key.
      const v = inline(node.value!, tight)
      return undefined === v ? undefined : '&: ' + v
    }
    case 'map':
    case 'list': {
      if (undefined !== node.open) {
        return undefined
      }
      const parts: string[] = []
      for (const e of node.body!) {
        const s = inline('list' === node.t ? chain(e) : e, true)
        if (undefined === s) {
          return undefined
        }
        parts.push(s)
      }
      if ('list' === node.t) {
        return '[' + parts.join(' ') + ']'
      }
      return 0 === parts.length ? '{}' : '{ ' + parts.join(' ') + ' }'
    }
    case 'call': {
      const a = inlineSeq(node.args!)
      return undefined === a ? undefined : node.name + '(' + a + ')'
    }
    case 'paren': {
      const a = inlineSeq(node.inner!)
      return undefined === a ? undefined : '(' + a + ')'
    }
    case 'expr':
      return inlineExpr(node.items!)
    default:
      // comment, blank: never on a line with anything else.
      return undefined
  }
}

// Arguments on one line, each after the separator the author wrote
// (§3.6): a comma stays a comma, and a space a space, because the
// parser reads `must((v) => 0 <= v, "…")` as a run of arguments too.
function inlineSeq(items: Node[]): string | undefined {
  let out = ''
  for (let k = 0; k < items.length; k++) {
    const s = inline(items[k], true)
    if (undefined === s) {
      return undefined
    }
    out += (0 === k ? '' : sepOf(items[k])) + s
  }
  return out
}

function sepOf(node: Node): string {
  return node.sep ? ', ' : ' '
}

// Binary operators spaced, prefixes tight (§3.11). An operand is
// never directly after an operand: the reader ends a value there.
function inlineExpr(items: Node[]): string | undefined {
  let out = ''
  for (const it of items) {
    if ('note' === it.t || ('op' === it.t && it.brk)) {
      return undefined
    }
    if ('op' === it.t) {
      out += ' ' + it.text + ' '
      continue
    }
    if ('prefix' === it.t) {
      out += it.text
      continue
    }
    const s = inline(it, true)
    if (undefined === s) {
      return undefined
    }
    out += s
  }
  return out
}


class Writer {
  lines: string[] = []
  line = ''
  started = false

  // A new line at an indentation, after a blank one when asked.
  open(indent: number, blank: boolean): void {
    if (this.started) {
      this.lines.push(rtrim(this.line))
      if (blank) {
        this.lines.push('')
      }
    }
    this.line = ' '.repeat(indent)
    this.started = true
  }

  text(s: string): void {
    this.line += s
  }

  // Nothing on the line yet but its indentation.
  fresh(): boolean {
    return '' === this.line.trim()
  }

  width(): number {
    return width(this.line)
  }

  // Where the page is, and the lines written since, the current line
  // included: the spelling of one statement, as it stands on the page.
  mark(): number {
    return this.lines.length
  }

  since(mark: number): string {
    return this.lines.slice(mark).concat([this.line]).map(rtrim).join('\n') + '\n'
  }

  // The lines since a mark replaced by a text: the spelling before,
  // where a rewrite did not pass its check.
  replace(mark: number, text: string): void {
    const lines = text.split('\n')
    lines.pop()
    this.line = lines.pop()!
    this.lines.length = mark
    this.lines.push(...lines)
  }

  finish(): string {
    if (!this.started) {
      return ''
    }
    this.lines.push(rtrim(this.line))
    return this.lines.join('\n') + '\n'
  }
}

// A line never ends in a space: an operator the author left dangling
// (`a: 1 &`, which the parser accepts) would otherwise leave one.
function rtrim(s: string): string {
  return s.replace(/ +$/, '')
}


// The entries of a body, one per line at the indentation, with the
// blank lines the author kept between them (§3.8) -- never at the
// start or the end. In STATEMENT position (`stmt`: the root, and the
// body of a plain map that is itself the value of a statement) a pair
// is laid out by §3.4, which may repeat its key; anywhere else -- a
// list, an operand, an argument -- by §3.5 alone.
function emitBody(w: Writer, body: Node[], indent: number, stmt: Stmt | undefined): void {
  let pending = false
  let count = 0
  for (const node of body) {
    if ('blank' === node.t) {
      pending = 0 < count
      continue
    }
    w.open(indent, pending)
    pending = false
    count++
    if ('comment' === node.t) {
      w.text(node.text!)
      continue
    }
    if (undefined !== stmt && 'pair' === node.t) {
      emitStatement(w, node, indent, stmt, '')
      continue
    }
    const e = chain(node)
    emitValue(w, e, indent)
    if (undefined !== e.trail) {
      w.text(' ' + e.trail)
    }
  }
}

// A value onto the current line: its one-line spelling when there is
// one and it fits the budget, and otherwise its several-line form,
// which for a scalar is the same text, too wide and unbreakable.
function emitValue(w: Writer, node: Node, indent: number): void {
  const s = inline(node, false)
  if (undefined !== s && w.width() + width(s) <= BUDGET) {
    w.text(s)
    return
  }
  switch (node.t) {
    case 'pair': {
      w.text(pairHead(node, false))
      const v = chain(node.value!)
      emitValue(w, v, indent)
      if (undefined !== v.trail) {
        w.text(' ' + v.trail)
      }
      return
    }
    case 'spread':
      w.text('&: ')
      emitValue(w, node.value!, indent)
      return
    case 'map':
      emitBlock(w, '{', '}', node, indent, undefined)
      return
    case 'list':
      emitBlock(w, '[', ']', node, indent, undefined)
      return
    case 'expr':
      emitExpr(w, node.items!, indent)
      return
    case 'call':
    case 'paren':
      emitCall(w, node, indent)
      return
    default:
      w.text(node.text!)
  }
}

// A call, or a parenthesis, that has no one-line form or is too wide
// for the budget. Three shapes. Arguments that are all FLAT -- none
// holds a container -- stay on the one line however wide it is: a
// scalar is no narrower on a line of its own, and the formatter never
// breaks a line. The last argument HUGS the parentheses, `hide({` ...
// `})`, `close($.E & {` ... `})`, when it is a container, or an
// expression the author did not break that ends in one, and the
// arguments before it fit on the opener's line: the container decides
// its own lines. Otherwise the parenthesis opens a block: one argument
// per line one level in, the closer alone at the opener's level. A
// call whose last argument hugs is hugged in turn, `type(close({` ...
// `}))`: the schema idiom.
function emitCall(w: Writer, node: Node, indent: number): void {
  const items = 'call' === node.t ? node.args! : node.inner!
  const open = ('call' === node.t ? node.name! : '') + '('
  const one = inlineSeq(items)
  if (undefined !== one && !items.some(holdsContainer)) {
    w.text(open + one + ')')
    return
  }
  const last = items[items.length - 1]
  if (0 < items.length && hugs(last)) {
    const head = inlineSeq(items.slice(0, -1))
    const lead = '' === head ? '' : head + sepOf(last)
    if (undefined !== head && ('' === head || w.width() + width(open + lead) <= BUDGET)) {
      w.text(open + lead)
      emitValue(w, last, indent)
      w.text(')')
      return
    }
  }
  w.text(open)
  let noted = false
  for (let k = 0; k < items.length; k++) {
    const it = items[k]
    if ('note' === it.t) {
      // A comment among the arguments trails the line it was on -- the
      // opener's, or an argument's -- and one that followed another
      // comment keeps its own line.
      if (noted) {
        w.open(indent + 2, false)
        w.text(it.text!)
      }
      else {
        w.text(' ' + it.text)
      }
      noted = true
      continue
    }
    w.open(indent + 2, false)
    emitValue(w, it, indent + 2)
    const next = items.slice(k + 1).find((x) => 'note' !== x.t)
    if (undefined !== next && next.sep) {
      w.text(',')
    }
    noted = false
  }
  w.open(indent, false)
  w.text(')')
}

// Whether a node holds a container anywhere: the argument has a
// several-line form of its own.
function holdsContainer(node: Node): boolean {
  switch (node.t) {
    case 'map':
    case 'list':
      return true
    case 'call':
      return node.args!.some(holdsContainer)
    case 'paren':
      return node.inner!.some(holdsContainer)
    case 'expr':
      return node.items!.some(holdsContainer)
    default:
      return false
  }
}

// Whether a last argument hugs the parentheses: a container; an
// expression with no break and no comment whose last operand is one;
// a call whose own last argument does.
function hugs(node: Node): boolean {
  if ('map' === node.t || 'list' === node.t) {
    return true
  }
  if ('call' === node.t) {
    return 0 < node.args!.length && hugs(node.args![node.args!.length - 1])
  }
  return 'expr' === node.t &&
    node.items!.every((it) => 'note' !== it.t && !('op' === it.t && it.brk)) &&
    hugs(node.items![node.items!.length - 1])
}

// A container on several lines (§3.5): the opener ends its line, the
// entries are statements one level in, the closer stands alone. An
// empty container is inline whatever the budget says.
function emitBlock(
  w: Writer, open: string, close: string, node: Node, indent: number, stmt: Stmt | undefined
): void {
  if (0 === node.body!.length && undefined === node.open) {
    w.text(open + close)
    return
  }
  w.text(open)
  if (undefined !== node.open) {
    w.text(' ' + node.open)
  }
  emitBody(w, node.body!, indent + 2, stmt)
  w.open(indent, false)
  w.text(close)
}

// An expression that has no one-line form, or one too wide for the
// budget: the author's breaks are kept, each at its operator, which
// leads its continuation line (§3.11). The continuation is one level
// in when the expression follows a key on its line, and level with
// the first operand when the expression has the line to itself -- an
// argument of a block call, say -- so a disjunction of alternatives
// reads as the list it is. A container operand that does not fit from
// where it stands is a block whose closer lines up with the line that
// opened it.
function emitExpr(w: Writer, items: Node[], indent: number): void {
  const cont = w.fresh() ? indent : indent + 2
  // Whether the last item was an operand: a comment after one is a
  // space away, and after an operator or the colon it is not. An
  // operand is never directly after an operand (the reader ends a
  // value there), so operands need no such check.
  let operand = false
  let cur = indent
  for (const it of items) {
    if ('op' === it.t) {
      if (it.brk) {
        cur = cont
        if (!w.fresh()) {
          w.open(cur, false)
        }
        w.text(it.text + ' ')
      }
      else {
        w.text(' ' + it.text + ' ')
      }
      operand = false
      continue
    }
    if ('prefix' === it.t) {
      w.text(it.text!)
      operand = false
      continue
    }
    if ('note' === it.t) {
      if (operand) {
        w.text(' ')
      }
      w.text(it.text!)
      cur = cont
      w.open(cur, false)
      operand = false
      continue
    }
    emitValue(w, it, cur)
    operand = true
  }
}


// ---------------------------------------------------------------------
// The lawful tier (§3.4): repeat the prefix, and merge what repeats.
//
// Both rewrites rest on the meet. `s: a: 1` / `s: b: 2` is one document
// with `s: { a:1 b:2 }`, because a key written twice is a meet and the
// meet of two maps with disjoint keys is their union. So they apply
// only to a PLAIN map in STATEMENT position -- an entry of the root, or
// of a map that is itself the plain value of such an entry -- and never
// to a map that is an operand, an argument or a list element, where
// splitting it would change the document (`close({a:1})` /
// `close({b:2})` does not evaluate at all). And every statement the
// tier rewrites is checked by unification, locally (§7.3): the spelling
// before and the spelling after must come to the same meet, or the
// statement keeps the spelling before. The check is the engine's
// agreement, not the formatter's self-check -- the engine's own repros
// hold maps whose two spellings it evaluates differently -- so failing
// it is no refusal.

// The check of one rewrite: the spelling before and the spelling after.
type Meet = (before: string, after: string) => boolean

// Statement position: the check, and whether the statement being laid
// out stands inside one that is checked as a whole, which covers it.
// Undefined anywhere else -- a list, an operand, an argument.
type Stmt = { meet: Meet, covered: boolean }

// The entries of a plain map value: a braced map, or a chain, which is
// a one-entry map. A map with a comment on its opener keeps its braces
// (§3.7), so it is not plain here; nor is a map holding an include,
// which the local check cannot follow.
function plainEntries(v: Node): Node[] | undefined {
  if ('pair' === v.t) {
    return [v]
  }
  if ('map' !== v.t || undefined !== v.open || v.body!.some((e) => 'include' === e.t)) {
    return undefined
  }
  return v.body
}

// The entries of a statement as they stand once it is merged into a
// wider map: its trailing comment sunk onto its last entry, so that it
// travels with the entry it stood beside. Undefined where the value is
// not a plain map, or the comment has no entry to sit on.
function members(p: Node): Node[] | undefined {
  const entries = plainEntries(p.value!)
  if (undefined === entries || undefined === p.trail) {
    return entries
  }
  const last = entries[entries.length - 1]
  if (undefined === last || ('pair' !== last.t && 'spread' !== last.t)) {
    return undefined
  }
  const trail = undefined === last.trail ? p.trail : last.trail + ' ' + p.trail
  return entries.slice(0, -1).concat([{ ...last, trail }])
}

// Adjacent statements naming one key, whose values are plain maps, are
// one map: their entries in order, with the comments and blank lines
// between the statements travelling with the statement they preceded.
// Only ADJACENT statements merge -- a `server:` line, something else,
// then another `server:` line stays as it is, because merging them
// would move a statement, and the formatter never reorders (§3.13).
// Nor do two statements merge into a map with two spreads: the engine
// keeps those as a conjunction, which is not the meet of the two maps.
// The tree is not changed: a merged statement is a new node that keeps
// the statements it replaces as its `orig`, its spelling before, and a
// statement merged somewhere below is copied the same way.
function mergeRuns(body: Node[]): Node[] {
  const out: Node[] = []
  let i = 0
  while (i < body.length) {
    const first = body[i]
    const entries = 'pair' === first.t ? members(first) : undefined
    if (undefined === entries) {
      out.push('pair' === first.t ? mergeDeep(first) : first)
      i++
      continue
    }
    const group = [first]
    let merged = entries
    let carry: Node[] = []
    let j = i + 1
    for (; j < body.length; j++) {
      const n = body[j]
      if ('comment' === n.t || 'blank' === n.t) {
        carry.push(n)
        continue
      }
      const more = 'pair' === n.t && n.key === first.key && n.opt === first.opt
        ? members(n) : undefined
      if (undefined === more || (spreads(merged) && spreads(more))) {
        break
      }
      group.push(...carry, n)
      merged = merged.concat(carry, more)
      carry = []
    }
    if (1 === group.length) {
      out.push(mergeDeep(first))
      i++
      continue
    }
    out.push({
      t: 'pair', key: first.key, opt: first.opt, alias: first.alias,
      value: { t: 'map', body: mergeRuns(merged) }, orig: group,
    })
    i = j - carry.length
  }
  return out
}

function spreads(entries: Node[]): boolean {
  return entries.some((e) => 'spread' === e.t)
}

// The merge down a statement's plain-map spine: a chain's inner pair,
// or the entries of a map value, are statements of the map they are
// in. The statement itself where nothing below it merged.
function mergeDeep(p: Node): Node {
  const v = p.value!
  const entries = plainEntries(v)
  if (undefined === entries) {
    return p
  }
  const body = mergeRuns(entries)
  if (body.length === entries.length && body.every((n, k) => n === entries[k])) {
    return p
  }
  return { ...p, value: 'pair' === v.t ? body[0] : { ...v, body }, orig: [p] }
}

// The lines of a map repeated under a prefix (§3.4, rule 2): every
// entry written with the prefix in front of it as one line, or --
// where an entry's value is a map that does not fit -- repeated further
// under the longer prefix. Comments and blank lines are kept where
// they stood. Undefined where an entry cannot be one line: a list that
// does not fit, a value that spans lines, a comment closing the map
// (which a repeat could not keep in the map) -- and where the map holds
// two spreads, which repeated would be two maps, and a different meet.
type Line = { t: 'text' | 'comment' | 'blank', text?: string }

function repeatLines(entries: Node[], prefix: string, indent: number): Line[] | undefined {
  if (0 === entries.length || 'comment' === entries[entries.length - 1].t ||
    1 < entries.filter((e) => 'spread' === e.t).length) {
    return undefined
  }
  const out: Line[] = []
  for (const e of entries) {
    if ('blank' === e.t) {
      out.push({ t: 'blank' })
      continue
    }
    if ('comment' === e.t) {
      out.push({ t: 'comment', text: e.text })
      continue
    }
    const trail = undefined === e.trail ? '' : ' ' + e.trail
    if ('spread' === e.t) {
      // The repeated spread entry is a one-entry map holding only a
      // spread, so by D1's exception it keeps its braces.
      const s = inline(e.value!, true)
      if (undefined === s || !fits(indent, prefix + '{ &: ' + s + ' }')) {
        return undefined
      }
      out.push({ t: 'text', text: prefix + '{ &: ' + s + ' }' + trail })
      continue
    }
    const head = prefix + pairHead(e, false)
    const s = inline(chain(e.value!), false)
    if (undefined !== s && fits(indent, head + s)) {
      out.push({ t: 'text', text: head + s + trail })
      continue
    }
    const sub = plainEntries(e.value!)
    if (undefined === sub) {
      return undefined
    }
    const lines = repeatLines(sub, head, indent)
    if (undefined === lines) {
      return undefined
    }
    if ('' !== trail) {
      lines[lines.length - 1].text += trail
    }
    out.push(...lines)
  }
  return out
}

function fits(indent: number, text: string): boolean {
  return indent + width(text) <= BUDGET
}

// A pair in statement position, by §3.4. `prefix` is what stands
// before it on its line: the heads of the chain it hangs from, not yet
// written. Its value is laid out by §3.5 unless it is a plain map, and
// then in this order: a chain, when the map holds exactly one pair
// (D1); one line, when that fits the budget; the key repeated over the
// entries, when every entry can be one line that way; a braced block
// otherwise, whose entries are statements in turn. Whether the
// statement was rewritten by this tier -- merged, or repeated -- is
// returned, and the outermost such statement is checked: its spelling
// on the page against what the syntactic tier writes for the
// statements it came from, at the same indentation, which is what
// stays on the page when the check fails.
function emitStatement(w: Writer, p: Node, indent: number, stmt: Stmt, prefix: string): boolean {
  const mark = w.mark()
  let rewritten = undefined !== p.orig
  const entries = plainEntries(p.value!)
  const head = prefix + pairHead(p, false)
  const s = undefined === entries ? undefined : inline(p.value!, false)
  if (undefined === entries) {
    w.text(prefix)
    emitValue(w, p, indent)
  }
  else if (1 === entries.length && 'pair' === entries[0].t) {
    rewritten = emitStatement(w, entries[0], indent, { meet: stmt.meet, covered: true }, head)
      || rewritten
  }
  else if (undefined !== s && fits(indent, head + s)) {
    w.text(head + s)
  }
  else {
    const lines = repeatLines(entries, head, indent)
    if (undefined !== lines) {
      let pending = false
      let count = 0
      for (const line of lines) {
        if ('blank' === line.t) {
          pending = 0 < count
          continue
        }
        if (0 < count) {
          w.open(indent, pending)
        }
        pending = false
        count++
        w.text(line.text!)
      }
      rewritten = true
    }
    else {
      w.text(head)
      emitBlock(w, '{', '}', p.value!, indent, { meet: stmt.meet, covered: stmt.covered || rewritten })
    }
  }
  if (undefined !== p.trail) {
    w.text(' ' + p.trail)
  }
  if (rewritten && !stmt.covered) {
    const before = emitAt(p.orig ?? [p], indent)
    if (!stmt.meet(before, w.since(mark))) {
      w.replace(mark, before)
    }
  }
  return rewritten
}

// The syntactic tier's spelling of some statements at an indentation:
// a rewrite's spelling before.
function emitAt(nodes: Node[], indent: number): string {
  const w = new Writer()
  emitBody(w, nodes, indent, undefined)
  return w.finish()
}

// The document: by the syntactic tier alone, or with the lawful tier
// over it when given its check.
function emit(root: Node[], meet: Meet | undefined): string {
  const w = new Writer()
  emitBody(w, undefined === meet ? root : mergeRuns(root), 0,
    undefined === meet ? undefined : { meet, covered: false })
  return w.finish()
}


// ---------------------------------------------------------------------
// The lint (§4): what the formatter points at and never touches. Two
// rules, both advice: the formatter never renames a key (§4.1) and
// never introduces an alias (§4.2), and a rule with a mechanical fix
// that keeps the document would belong to §3 instead (§4.3).

// The shape width at which a repeat is worth an alias (§4.2): below
// it, `{ a:1 }` twice is the shorter spelling. Measured over the use
// cases when the lint landed (§7.10).
const REPEAT_MIN_WIDTH = 40

function lintOf(root: Node[], text: string): LintFinding[] {
  const out: LintFinding[] = []
  const nodes = root.map(lintNode)
  for (const n of nodes) {
    keyCase(n, text, out)
  }
  repeats(nodes, text, out)
  out.sort((a, b) => a.line - b.line || a.col - b.col)
  return out
}

// The tree the lint walks: a chain's inner pair as the one-entry map
// it is, so that `a: {b: 1}` and `a: b: 1` -- one document to the
// formatter -- are one shape to the lint.
function lintNode(node: Node): Node {
  if ('pair' === node.t && 'pair' === node.value!.t) {
    return { ...node, value: { t: 'map', body: [node.value!], at: node.value!.at } }
  }
  return node
}

function lintChildren(node: Node): Node[] {
  switch (node.t) {
    case 'pair':
    case 'spread':
      return [lintNode(node).value!]
    case 'map':
    case 'list':
      return node.body!.map(lintNode)
    case 'call':
      return node.args!
    case 'paren':
      return node.inner!
    case 'expr':
      return node.items!
    default:
      return []
  }
}

// Line and column, 1-based, of a source index.
function lineCol(text: string, at: number): { line: number, col: number } {
  const before = text.slice(0, at)
  return { line: before.split('\n').length, col: at - before.lastIndexOf('\n') }
}

// D4 (§4.1): keys are lower-case words, or CamelCase when a key is
// several. A bare key holding `_`, or beginning with two capitals, is
// reported with the spelling that would follow the form; a quoted key
// is a deliberate spelling and a key of underscores alone names
// nothing the rule can respell.
function keyCase(node: Node, text: string, out: LintFinding[]): void {
  if ('pair' === node.t && BARE.test(node.key!) && /[A-Za-z]/.test(node.key!)) {
    const why = node.key!.includes('_') ? 'holds an underscore'
      : /^[A-Z][A-Z]/.test(node.key!) ? 'begins with capitals' : ''
    if ('' !== why) {
      out.push({
        rule: 'style/key-case', ...lineCol(text, node.at!),
        message: `key ${node.key} ${why}; ${camel(node.key!)} would follow the form`,
      })
    }
  }
  for (const child of lintChildren(node)) {
    keyCase(child, text, out)
  }
}

// The key as lower-case words or CamelCase: `credit_cents` is
// `creditCents`, `HTTP_PORT` is `httpPort`, `HTTPServer` is
// `httpServer`, `ID` is `id`.
function camel(key: string): string {
  const words = key.split('_').filter((w) => '' !== w)
    .map((w) => /^[A-Z]+$/.test(w) ? w.toLowerCase() : w)
  const head = words[0].replace(/^[A-Z]+(?=[A-Z][a-z])/, (run) => run.toLowerCase())
  return head.charAt(0).toLowerCase() + head.slice(1) +
    words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

// D3 (§4.2): a shape written twice can drift, and an alias names it
// once. Every map or list whose shape recurs in the file, and whose
// shape is REPEAT_MIN_WIDTH or wider, is reported once, at its first
// site, with the count and the other sites; the naming is the
// author's. A repeat inside a repeat is the outer one's: the walk does
// not descend into a shape it reports.
function repeats(nodes: Node[], text: string, out: LintFinding[]): void {
  const counts = new Map<string, number>()
  const tally = (node: Node): void => {
    if ('map' === node.t || 'list' === node.t) {
      const s = shape(node)
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    lintChildren(node).forEach(tally)
  }
  nodes.forEach(tally)
  const sites = new Map<string, Node[]>()
  const visit = (node: Node): void => {
    if ('map' === node.t || 'list' === node.t) {
      const s = shape(node)
      if (2 <= counts.get(s)! && REPEAT_MIN_WIDTH <= width(s)) {
        sites.set(s, (sites.get(s) ?? []).concat([node]))
        return
      }
    }
    lintChildren(node).forEach(visit)
  }
  nodes.forEach(visit)
  for (const found of sites.values()) {
    if (2 <= found.length) {
      const [first, ...rest] = found.map((n) => lineCol(text, n.at!))
      out.push({
        rule: 'style/repeat', ...first,
        message: `this ${found[0].t} is written ${found.length} times (again at ` +
          rest.map((p) => p.line + ':' + p.col).join(', ') +
          '); an alias would name it once',
      })
    }
  }
}

// A node's shape: its spelling with the layout, the comments and, for
// a map, the order of its entries taken out, so that two spellings of
// one value are one shape, as they are one canon.
function shape(node: Node): string {
  switch (node.t) {
    case 'map':
      return '{' + node.body!.filter(shaped).map((e) => shape(lintNode(e))).sort().join(' ') + '}'
    case 'list':
      return '[' + node.body!.filter(shaped).map((e) => shape(lintNode(e))).join(' ') + ']'
    case 'pair':
      return node.key! + (node.opt ? '?' : '') + ':' + shape(node.value!)
    case 'spread':
      return '&:' + shape(node.value!)
    case 'call':
      return node.name! + '(' + node.args!.filter(shaped).map(shape).join(',') + ')'
    case 'paren':
      return '(' + node.inner!.filter(shaped).map(shape).join(',') + ')'
    case 'expr':
      return node.items!.filter(shaped).map(shape).join('')
    default:
      return node.text!
  }
}

function shaped(node: Node): boolean {
  return 'comment' !== node.t && 'blank' !== node.t && 'note' !== node.t
}


// ---------------------------------------------------------------------
// The verb's library surface

function lf(text: string): string {
  return text.split('\r\n').join('\n')
}

// The check: the output parses, and to the same tree. Pre-unification
// canon is that tree, positions aside, and every rewrite of the
// syntactic tier leaves it unchanged (§7.3).
function sameDocument(root: any, after: string): boolean {
  const p = parseDoc(after, undefined, undefined)
  return undefined === p.errors && root.canon === p.root.canon
}

// The check of a lawful rewrite: the spelling before and the spelling
// after, evaluated in isolation, come to the same canon, the same
// kinds of failure, and the same outcome of generation (§7.3). Local,
// so it needs no include and no capability, and it applies whether or
// not the document as a whole evaluates. The kinds, not the count: how
// often one unresolved reference is reported depends on the order the
// meet took. Generation too, because the engine generates from more
// than the canon: a meet of maps with a nil member has refused a key
// the same map written once generates.
function sameByMeet(before: string, after: string): boolean {
  return meetOf(before) === meetOf(after)
}

function meetOf(text: string): string {
  const aontu = engine()
  const ctx = aontu.ctx({ collect: true })
  const v: any = aontu.unify(text, undefined, ctx)
  const gen = aontu.ctx({ collect: true })
  const out = aontu.generate(text, undefined, gen)
  const outcome = undefined !== out ? 'generated'
    : 0 < ctx.err.length ? kinds(ctx.err) : gen.err[0].why
  return v.canon + '\n' + kinds(ctx.err) + '\n' + outcome
}

function kinds(errs: any[]): string {
  const whys: string[] = errs.map((e) => e.why)
  return whys.filter((x, i) => i === whys.indexOf(x)).sort().join(',')
}

function depthFinding(): VetFinding {
  return {
    code: 'max_depth',
    class: 'budget',
    severity: 'error',
    path: '$',
    message: `The document nests more than ${MAX_DEPTH} levels deep, past what the formatter reads.`,
    sites: [],
  }
}

function checkFinding(path: string | undefined, expected: string, actual: string): VetFinding {
  return {
    code: 'format_check',
    class: 'internal',
    severity: 'error',
    path: '$',
    message: 'The formatted text is not the same document, so nothing was written.',
    note: 'a formatter defect: please report it with the source' +
      (undefined === path ? '' : ' (' + path + ')'),
    sites: [],
    expected,
    actual,
  }
}

// Format one document. The text is the agreed form of the source;
// `changed` says whether it differs from what was given, which is
// what `--check` and `--list` report.
export function format(src: string, opts?: FormatOptions, hooks?: FormatHooks): FormatReport {
  const text = lf(src)
  const toks: Tok[] = []
  const parsed = parseDoc(text, opts?.path, toks)
  if (undefined !== parsed.errors) {
    return { verdict: 'error', errors: parsed.errors }
  }
  const reader = new Reader(toks)
  const root = unwrap(reader.body('', false).body)
  if (reader.deep) {
    return { verdict: 'error', errors: [depthFinding()] }
  }
  // The syntactic tier first, checked against the parse tree; then the
  // lawful tier over it, each rewrite checked by the meet.
  const plain = emit(root, undefined)
  const same = hooks?.same ?? sameDocument
  if (!same(parsed.root, plain)) {
    return {
      verdict: 'error',
      errors: [checkFinding(opts?.path, parsed.root.canon, plain)],
    }
  }
  const out = emit(root, hooks?.meet ?? sameByMeet)
  return {
    verdict: 'formatted', text: out, changed: out !== src,
    findings: opts?.lint ? lintOf(root, text) : [],
  }
}


// ---------------------------------------------------------------------
// The unified diff of `--diff`

// A patience diff: lines unique to both sides, in order, are the
// anchors, and the gaps between them recurse. Not always the shortest
// edit script, but linear in space, and the same script from both
// ports, which is what a shared golden needs.

type Edit = { op: ' ' | '-' | '+', text: string }

// The lines of a text, with a marker on the last when the text does
// not end in a newline: such a line never equals its
// newline-terminated twin, which is how the diff reports the
// difference, and the marker is rendered as diff renders it. NUL,
// which no source line ends in.
const NO_NEWLINE = String.fromCharCode(0)

function textLines(text: string): string[] {
  if ('' === text) {
    return []
  }
  const lines = text.split('\n')
  if ('' === lines[lines.length - 1]) {
    lines.pop()
  }
  else {
    lines[lines.length - 1] += NO_NEWLINE
  }
  return lines
}

// The longest chain of anchors in order on both sides: patience
// sorting over the right-hand positions, with the left already
// ascending.
function longestChain(pairs: [number, number][]): [number, number][] {
  const tails: number[] = []
  const prev: number[] = []
  for (let k = 0; k < pairs.length; k++) {
    const j = pairs[k][1]
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pairs[tails[mid]][1] < j) {
        lo = mid + 1
      }
      else {
        hi = mid
      }
    }
    prev[k] = 0 < lo ? tails[lo - 1] : -1
    tails[lo] = k
  }
  const out: [number, number][] = []
  let k = 0 === tails.length ? -1 : tails[tails.length - 1]
  while (0 <= k) {
    out.push(pairs[k])
    k = prev[k]
  }
  return out.reverse()
}

function patience(
  a: string[], x0: number, x1: number, b: string[], y0: number, y1: number, out: Edit[]
): void {
  while (x0 < x1 && y0 < y1 && a[x0] === b[y0]) {
    out.push({ op: ' ', text: a[x0] })
    x0++
    y0++
  }
  let tail = 0
  while (x0 < x1 - tail && y0 < y1 - tail && a[x1 - 1 - tail] === b[y1 - 1 - tail]) {
    tail++
  }
  x1 -= tail
  y1 -= tail

  const countA = new Map<string, number>()
  const countB = new Map<string, number>()
  const posB = new Map<string, number>()
  for (let x = x0; x < x1; x++) {
    countA.set(a[x], (countA.get(a[x]) ?? 0) + 1)
  }
  for (let y = y0; y < y1; y++) {
    countB.set(b[y], (countB.get(b[y]) ?? 0) + 1)
    posB.set(b[y], y)
  }
  const pairs: [number, number][] = []
  for (let x = x0; x < x1; x++) {
    if (1 === countA.get(a[x]) && 1 === countB.get(a[x])) {
      pairs.push([x, posB.get(a[x])!])
    }
  }
  const anchors = longestChain(pairs)

  if (0 === anchors.length) {
    for (let x = x0; x < x1; x++) {
      out.push({ op: '-', text: a[x] })
    }
    for (let y = y0; y < y1; y++) {
      out.push({ op: '+', text: b[y] })
    }
  }
  else {
    let x = x0
    let y = y0
    for (const [ax, ay] of anchors) {
      patience(a, x, ax, b, y, ay, out)
      out.push({ op: ' ', text: a[ax] })
      x = ax + 1
      y = ay + 1
    }
    patience(a, x, x1, b, y, y1, out)
  }

  for (let k = 0; k < tail; k++) {
    out.push({ op: ' ', text: a[x1 + k] })
  }
}

// The diff in unified format, three lines of context, the file named
// on both sides. Empty when the texts are the same.
export function unifiedDiff(name: string, before: string, after: string): string {
  const a = textLines(before)
  const b = textLines(after)
  const edits: Edit[] = []
  patience(a, 0, a.length, b, 0, b.length, edits)

  // Hunks: changes closer than twice the context share one.
  const hunks: [number, number][] = []
  for (let k = 0; k < edits.length; k++) {
    if (' ' === edits[k].op) {
      continue
    }
    const last = hunks[hunks.length - 1]
    if (undefined !== last && k - last[1] <= 6) {
      last[1] = k
    }
    else {
      hunks.push([k, k])
    }
  }
  if (0 === hunks.length) {
    return ''
  }

  const out: string[] = ['--- a/' + name, '+++ b/' + name]
  let ai = 0
  let bi = 0
  let next = 0
  for (const [s, e] of hunks) {
    const from = Math.max(s - 3, 0)
    const to = Math.min(e + 4, edits.length)
    // Everything between two hunks is context -- a change would have
    // opened a hunk -- so both sides advance together.
    for (; next < from; next++) {
      ai++
      bi++
    }
    let alen = 0
    let blen = 0
    const lines: string[] = []
    for (let k = from; k < to; k++) {
      const ed = edits[k]
      if ('+' !== ed.op) {
        alen++
      }
      if ('-' !== ed.op) {
        blen++
      }
      if (ed.text.endsWith(NO_NEWLINE)) {
        lines.push(ed.op + ed.text.slice(0, -1))
        lines.push('\\ No newline at end of file')
      }
      else {
        lines.push(ed.op + ed.text)
      }
    }
    out.push('@@ -' + (0 === alen ? ai : ai + 1) + ',' + alen +
      ' +' + (0 === blen ? bi : bi + 1) + ',' + blen + ' @@')
    out.push(...lines)
    ai += alen
    bi += blen
    next = to
  }
  return out.join('\n') + '\n'
}
