/* Copyright (c) 2026 Richard Rodger, MIT License */


import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'

import { Aontu } from './aontu'
import { failureFinding, engineFinding, anchorAt, throughResidue } from './vet'
import type { VetFinding } from './vet'
import type { TrustOptions } from './type'
import { graphOf } from './graph'
import type { Graph } from './graph'
import { cmpCodePoint } from './keyorder'
import { Provenance } from './provenance'
import type { WhyConjunct } from './provenance'
import { why, pathParts } from './query'
import { subsume } from './subsume'
import type { SubsumeProfile } from './subsume'
import { includeOpts } from './utility'
import type { IncludeOptions } from './utility'


export type ViewVerdict = 'rendered' | 'lossy' | 'error'

export type ViewKind =
  'tree' | 'matrix' | 'graph' | 'layer' | 'sets' | 'layers' | 'ladder'
  | 'poset' | 'doc' | 'lattice' | 'state' | 'sequence' | 'lane' | 'treemap'

// The target grammars. Each kind declares the profiles it can render
// into, and the first is its default (PROFILES below).
export type ViewProfile = 'text' | 'mermaid' | 'dot' | 'er' | 'svg'

export type ViewOrder = 'canon' | 'partition'

export type ViewEdges = 'upward' | 'all' | 'none'

export type ViewRole =
  'label' | 'muted' | 'rule' | 'direct' | 'closure' | 'unmirrored'
  | 'upward' | 'repeat' | 'bar' | 'hole'

export type ViewStyle = 'none' | 'ansi' | 'css'

const SGR: Record<ViewRole, string> = {
  label: '', muted: '2', rule: '2', direct: '1', closure: '36',
  unmirrored: '33', upward: '31', repeat: '2', bar: '36', hole: '2',
}

// A painter wraps a run of text in its role's mechanism. It NEVER
// changes the run's length in characters, so every width the renderers
// computed from the unpainted strings still holds.
type Paint = (role: ViewRole, text: string) => string

const PLAIN: Paint = (_role, text) => text

const ANSI: Paint = (role, text) =>
  '' === SGR[role] || '' === text
    ? text : `\x1b[${SGR[role]}m${text}\x1b[0m`

const painter = (style: ViewStyle): Paint => 'ansi' === style ? ANSI : PLAIN

const styleOf = (
  style: ViewStyle | undefined, as: ViewProfile
): ViewStyle => style ?? ('svg' === as ? 'css' : 'none')

// One row of the loss report.
export type ViewLoss = {
  code: string
  count: number
  detail?: string[]
}

// A further document of a poset, beside the entry.
export type ViewDoc = {
  src: string
  // Where it came from, so a relative include inside it resolves and
  // so its label (the file name without `.aontu`) is known.
  path?: string
  // The label to draw, overriding the one derived from `path`.
  name?: string
}

export type ViewReport = {
  verdict: ViewVerdict
  kind: ViewKind

  // The figure, as text. Present ONLY on `rendered` and `lossy` -- and
  // present EMPTY for a document with nothing to draw, because an
  // empty drawing of a model with nothing in it is the honest one.
  text?: string

  // The loss report, in code order. Empty on `error`.
  loss: ViewLoss[]

  // A split figure's parts, each a whole figure of its own; `text` is
  // then all of them, each under a comment naming it.
  parts?: ViewPart[]

  // WHY the figure could not be drawn, in vet's finding shape. Present
  // ONLY on `error`.
  errors?: VetFinding[]
}

export type ViewPart = { name: string, text: string }

// One figure of a VIEW DOCUMENT: the declaration's key, what it drew,
// and the file the author says it belongs in.
export type ViewFigure = {
  name: string
  kind: ViewKind
  // Where the declaration says to write it. The library never writes:
  // the caller does, and only when every figure of the set rendered.
  out: string
  verdict: ViewVerdict
  text?: string
  loss: ViewLoss[]
  parts?: ViewPart[]
  errors?: VetFinding[]
}


// N figures of one document, one verdict. `error` if ANY figure
// refused -- a set of figures of one model is only meaningful whole.
export type ViewSetReport = {
  verdict: ViewVerdict
  views: ViewFigure[]
  // WHY the set itself could not be read: the document does not stand
  // up, or the declarations are not the shape a declaration has.
  // A figure's own refusal rides on the figure.
  errors?: VetFinding[]
}


export type ViewOptions = {
  kind?: ViewKind
  // The target grammar. Absent means the kind's first profile.
  as?: ViewProfile
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory (relationCheck's precedent).
  path?: string
  // The include capability this document evaluates under
  // (docs/trust.md).
  trust?: TrustOptions
  textExt?: string[]
  // Restrict the figure to nodes (or paths) under this path. For the
  // ladder it is the path drawn, and required; for the poset it is
  // where the documents are compared.
  at?: string
  maxRows?: number

  // tree, matrix: draw OVER THIS RELATION. The tree draws every
  // relation when absent; the matrix needs exactly one and refuses an
  // ambiguous document.
  relation?: string
  // tree: draw only these subtrees. Absent means every root the edge
  // set derives: a node nothing depends on.
  roots?: string[]

  // matrix: `canon` (label order, the default) or `partition` (leaves
  // first, so an acyclic relation is a lower triangle).
  order?: ViewOrder
  // matrix: mark transitively reachable cells `+`.
  closure?: boolean

  // graph: restrict to these predicates. Absent means every one.
  relations?: string[]
  // graph: one subgraph per distinct value of this field of each node;
  // layer: one band per distinct value, and required.
  groupBy?: string
  // layer: the bands in this order, top first. Absent means the order
  // derived from the relation, which a model with an upward edge
  // cannot settle on its own.
  layers?: string[]
  // layer: which edges to draw over the bands.
  edges?: ViewEdges
  // graph: the node label is this field's value rather than the path.
  label?: string

  // sets: the map whose keys are the sets, the field holding each
  // set's members, and optionally the full element domain.
  sets?: string
  member?: string
  universe?: string
  // doc: how many levels of key below the anchor to draw. Absent
  // means three, which is the depth at which a model's shape is
  // legible and its data is not yet enumerated.
  depth?: number
  minDegree?: number
  // sets, layers: elide columns beyond this many, counted in the loss
  // report.
  maxCols?: number

  // layers: drop intersections holding fewer than this many paths.
  minSize?: number

  // poset: the subsumption profile, and the further documents.
  profile?: SubsumeProfile
  docs?: ViewDoc[]

  // The file the figure belongs in. THE LIBRARY NEVER WRITES: this is
  // carried through to the caller, which does -- and, for a view
  // document, only once every figure of the set rendered.
  out?: string

  style?: ViewStyle

  // Draw only the members of this node: what its links point at, or
  // with `member` only the links under that key.
  of?: string
  // Keep the edges that leave the selection, drawing their far end as
  // a ghost.
  ghosts?: boolean

  // graph (er): the field of each node holding its columns.
  columns?: string

  // graph, layer, lane: each group's title carries its member count,
  // and with `countBy` its members counted by that field's value.
  counts?: boolean
  countBy?: string
  // graph: one node per group, the surface map.
  collapse?: boolean

  // Divide the figure into parts by a field's value, by root, or into
  // parts of at most `budget` nodes, rows, steps or columns, as the
  // kind counts them.
  splitBy?: string
  splitRoots?: boolean
  budget?: number

  // sequence: the list of steps and the fields naming each step's ends.
  steps?: string
  from?: string
  to?: string

  // treemap: the numeric field weighing each item.
  size?: string

  // The VIEW DOCUMENT (VIEWS.0.md, "6. The view document"): the path of
  // a map whose values declare figures. `viewSet` reads it; `view`
  // ignores it, because one call draws one figure.
  views?: string
}


// Each kind's profiles, the first being its default. There is no
// global default, because there is no sensible text form of a
// node-link drawing and no sensible Mermaid form of a matrix.
const PROFILES: Record<ViewKind, ViewProfile[]> = {
  doc: ['text', 'svg'],
  lattice: ['text', 'svg'],
  tree: ['text', 'svg'],
  matrix: ['text', 'svg'],
  graph: ['mermaid', 'dot', 'er'],
  layer: ['text', 'mermaid', 'svg'],
  sets: ['text', 'svg'],
  layers: ['text', 'svg'],
  ladder: ['mermaid', 'dot'],
  poset: ['mermaid', 'dot'],
  state: ['mermaid', 'text'],
  sequence: ['mermaid', 'text'],
  lane: ['mermaid', 'text'],
  treemap: ['mermaid', 'text'],
}

// The profile a kind draws into when none is asked for. The CLI needs
// it to resolve `--style auto` BEFORE the library runs, since the
// mechanism is the profile's.
export function viewDefaultProfile(kind: ViewKind): ViewProfile | undefined {
  return PROFILES[kind]?.[0]
}


// Loss codes that describe the drawing rather than a gap in it.
const INFORMATIONAL = [
  'edges_deduped', 'inverse_suppressed', 'crossings', 'edges_outside',
  'edges_internal', 'treemap_empty',
]

const DEFAULT_MAX_ROWS = 60

// The separator inside a composite map key: a character no path holds.
const SEP = '\u0000'


// ---------------------------------------------------------------------
// Findings

function finding(
  code: string, cls: string, path: string, message: string, note?: string
): VetFinding {
  return {
    code,
    class: cls as any,
    severity: 'error',
    path,
    message,
    sites: [],
    ...(undefined === note ? {} : { note }),
  }
}


function relationFinding(relation: string, have: string[]): VetFinding {
  return finding('view_relation_unknown', 'reference', '$',
    `${relation} names no relation with edges in this document.`,
    'relations with edges: ' + have.join(', '))
}


function rootFinding(
  root: string, relation: string | undefined, nodes: string[]): VetFinding {
  return finding('refer_unresolved', 'reference', '$',
    `${root} is not a node of the ` +
    `${undefined === relation ? '' : relation + ' '}graph.`,
    0 === nodes.length ? undefined : 'nodes in the graph: ' + nodes.join(', '))
}


// `--max-rows` is a REFUSAL, and the message names the narrowing
// options.
function rowsFinding(
  rows: number, max: number, narrow: string, divide = false
): VetFinding {
  return finding('view_rows_exceeded', 'budget', '$',
    `The figure has ${rows} rows, above --max-rows ${max}; ` +
    `narrow it with ${narrow}, ${divide ? 'divide it with --budget, ' : ''}` +
    'or raise the limit.',
    `rows: ${rows}, max: ${max}`)
}


// An inline piece may not contain a line terminator: a line is a
// line, which is what makes every renderer a total fold.
function lineBreakFinding(path: string): VetFinding {
  return finding('view_line_break', 'parse', path,
    'A label holds a line terminator, which no figure line can carry.')
}


// ---------------------------------------------------------------------
// The edge set as the figures read it

// One distinct fact of the graph: a `(from, key, to)` triple, however
// many positions wrote it.
type Triple = { from: string, key: string, to: string }

type RelDecls = Map<string, { acyclic?: boolean, inverses: Set<string> }>


// A prefix test on PATHS, not strings: `$.a` covers `$.a.b` and `$.a`
// itself, and not `$.ab`.
function under(path: string, at: string | undefined): boolean {
  return undefined === at || path === at || path.startsWith(at + '.')
}


function triplesOf(
  graph: Graph, at: string | undefined, loss: ViewLoss[]): Triple[] {
  const edges = graph.edges
  const hidden: string[] = []
  const seen = new Map<string, Triple>()
  let positions = 0
  for (const e of edges) {
    if (true === e.hidden) {
      hidden.push(e.at)
      continue
    }
    if (!under(e.from, at) || !under(e.to, at)) {
      continue
    }
    positions++
    seen.set(e.from + SEP + e.key + SEP + e.to,
      { from: e.from, key: e.key, to: e.to })
  }
  if (0 < hidden.length) {
    loss.push({
      code: 'hidden_contribution', count: hidden.length,
      detail: hidden.sort(cmpCodePoint),
    })
  }
  const undecided = (graph.disjunct ?? []).filter((p) => under(p, at))
  if (0 < undecided.length) {
    loss.push({
      code: 'edges_in_disjunct', count: undecided.length, detail: undecided,
    })
  }
  const out = [...seen.values()].sort((a, b) =>
    cmpCodePoint(a.from, b.from) || cmpCodePoint(a.key, b.key)
    || cmpCodePoint(a.to, b.to))
  if (out.length < positions) {
    loss.push({
      code: 'edges_deduped', count: positions - out.length,
      detail: [`${positions} written positions -> ` +
        `${out.length} distinct triples`],
    })
  }
  return out
}


// The relations with edges, in code-point order.
function keysOf(triples: Triple[]): string[] {
  return [...new Set(triples.map((e) => e.key))].sort(cmpCodePoint)
}


// The node set is what the drawn edges CONNECT, in code-point order.
function nodesOf(triples: { from: string, to: string }[]): string[] {
  const ns = new Set<string>()
  for (const e of triples) {
    ns.add(e.from)
    ns.add(e.to)
  }
  return [...ns].sort(cmpCodePoint)
}


function labelsOf(nodes: string[]): Map<string, string> {
  const segs = new Map<string, string[]>(
    nodes.map((n) => [n, n.replace(/^\$\.?/, '').split('.')]))
  const out = new Map<string, string>()
  for (const n of nodes) {
    const parts = segs.get(n) as string[]
    for (let take = 1; ; take++) {
      const cand = parts.slice(Math.max(0, parts.length - take)).join('.')
      const clash = nodes.some((m) => {
        const ms = segs.get(m) as string[]
        return m !== n &&
          ms.slice(Math.max(0, ms.length - take)).join('.') === cand
      })
      if (!clash) {
        out.set(n, cand)
        break
      }
    }
  }
  return out
}


// Reachability over a directed edge set: node -> the set of nodes it
// reaches in one or more steps. Iterative closure, O(n * e), which is
// nothing at the sizes a figure can hold.
function reachOf(
  nodes: string[], succ: Map<string, string[]>
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const n of nodes) {
    const seen = new Set<string>()
    const stack = [...(succ.get(n) as string[])]
    while (0 < stack.length) {
      const m = stack.pop() as string
      if (!seen.has(m)) {
        seen.add(m)
        stack.push(...(succ.get(m) as string[]))
      }
    }
    out.set(n, seen)
  }
  return out
}


// ---------------------------------------------------------------------
// Text helpers, all on code units, none formatting a number

const pad = (s: string, n: number): string =>
  s + ' '.repeat(Math.max(0, n - s.length))

const lpad = (s: string, n: number): string =>
  ' '.repeat(Math.max(0, n - s.length)) + s

const widest = (ss: string[]): number =>
  ss.reduce((w, s) => Math.max(w, s.length), 0)


// ---------------------------------------------------------------------
// Identifiers and escapes (VIEWS.0.md, "The renderers and the profiles")

function ident(name: string): string {
  const letter = (c: number): boolean =>
    (65 <= c && c <= 90) || (97 <= c && c <= 122)
  const digit = (c: number): boolean => 48 <= c && c <= 57
  const cps = [...name].map((ch) => ch.codePointAt(0) as number)
  const plain = 0 < cps.length && letter(cps[0]) &&
    cps.every((c) => letter(c) || digit(c) || 95 === c)
  if (plain) {
    return 'n_' + name
  }
  let out = 'nq_'
  for (const c of cps) {
    out += letter(c) || digit(c)
      ? String.fromCodePoint(c) : '_' + lpad(c.toString(16), 2)
  }
  return out
}


const MERMAID_ESC: Record<number, string> = {
  34: '#34;', 35: '#35;', 38: '#38;', 60: '#60;', 62: '#62;',
  123: '#123;', 124: '#124;', 125: '#125;',
}
const DOT_ESC: Record<number, string> = { 34: '\\"', 92: '\\\\' }

function escape(text: string, table: Record<number, string>): string {
  let out = ''
  for (const ch of text) {
    const rep = table[ch.codePointAt(0) as number]
    out += undefined === rep ? ch : rep
  }
  return out
}

function hasLineBreak(text: string): boolean {
  return /[\n\r\u2028\u2029]/.test(text)
}


const CH = 8
const LH = 20
const PAD = 8

const SVG_ESC: Record<number, string> = {
  34: '&quot;', 38: '&amp;', 60: '&lt;', 62: '&gt;',
}

const SVG_STYLE = '<style>' +
  '.av{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}' +
  '.av-t{fill:var(--av-ink,#1f2328)}' +
  '.av-m{fill:var(--av-muted,#6e7781)}' +
  '.av-box{fill:var(--av-bg,#f6f8fa);stroke:var(--av-rule,#8c959f);stroke-width:1}' +
  '.av-cell{fill:var(--av-bg,#f6f8fa);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}' +
  '.av-direct{fill:var(--av-ink,#1f2328);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}' +
  '.av-closure{fill:var(--av-closure,#9ec5fe);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}' +
  '.av-unmirrored{fill:var(--av-warn,#e3b341);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}' +
  '.av-line{stroke:var(--av-rule,#8c959f);stroke-width:1;fill:none}' +
  '.av-up{stroke:var(--av-alert,#d1242f);stroke-width:1.5;fill:none;stroke-dasharray:4 3}' +
  '.av-dot{fill:var(--av-ink,#1f2328)}' +
  '.av-hole{fill:var(--av-bg,#f6f8fa);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}' +
  '.av-bar{fill:var(--av-bar,#57606a)}' +
  '</style>'

const svgEsc = (s: string): string => escape(s, SVG_ESC)

// The document: a viewBox the size of the figure, the style, and the
// parts, one per line, so the bytes read as a figure and diff as one.
function svgDoc(
  w: number, h: number, about: string, parts: string[], style: ViewStyle
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="av" viewBox="0 0 ${w} ${h}" ` +
    `width="${w}" height="${h}" role="img" aria-label="${svgEsc(about)}">`,
    ...('css' === style ? [SVG_STYLE] : []),
    ...parts,
    '</svg>',
  ].join('\n')
}

// A text run at a baseline. `anchor` is SVG's own vocabulary.
function svgText(
  x: number, y: number, cls: string, text: string, anchor?: string
): string {
  return `<text x="${x}" y="${y}" class="${cls}"` +
    (undefined === anchor ? '' : ` text-anchor="${anchor}"`) +
    `>${svgEsc(text)}</text>`
}

// The relation a figure is over, for its description; a document with
// no edges has none to name.
const over = (relation: string | undefined): string =>
  undefined === relation || '' === relation ? '' : ' over ' + relation

function svgRect(x: number, y: number, w: number, h: number, cls: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"/>`
}

function svgPath(d: string, cls: string): string {
  return `<path d="${d}" class="${cls}"/>`
}


// One edge as the tree draws it: a declared inverse pair collapsed to
// one edge, and the label the branch carries.
type Drawn = { from: string, to: string, label: string }


function collapse(triples: Triple[], relation: string | undefined): Drawn[] {
  const pairs = new Map<string, Triple[]>()
  for (const e of triples) {
    const pair = [e.from, e.to].sort(cmpCodePoint).join(SEP)
    const group = pairs.get(pair)
    if (undefined === group) {
      pairs.set(pair, [e])
    }
    else {
      group.push(e)
    }
  }

  const out: Drawn[] = []
  for (const group of pairs.values()) {
    const keys = keysOf(group)
    const named = undefined !== relation && keys.includes(relation)
    const winner = named ? (relation as string) : keys[0]
    const label = named ? winner : keys.join('/')
    for (const e of group) {
      if (e.key === winner) {
        out.push({ from: e.from, to: e.to, label })
      }
    }
  }

  // One winner per pair, so (from, to) is unique and orders the set.
  return out.sort((x, y) =>
    cmpCodePoint(x.from, y.from) || cmpCodePoint(x.to, y.to))
}


type Kid = { to: string, label: string }

type Figure = { text?: string, parts?: ViewPart[], errors?: VetFinding[] }


type TreeRow = { depth: number, text: string, mark: string, parent: number }


function drawTree(
  all: Drawn[], relation: string | undefined, roots: string[], max: number,
  as: ViewProfile, style: ViewStyle,
  part: { ghosts: Ghosts, members: string[], rest: boolean }
): Figure {
  const paint = painter(style)
  const kept = undefined === relation
    ? all : all.filter((e) => e.label === relation)

  if (undefined !== relation && 0 === kept.length && 0 < all.length) {
    const have = [...new Set(all.flatMap((e) => e.label.split('/')))]
      .sort(cmpCodePoint)
    return { errors: [relationFinding(relation, have)] }
  }

  // The node set is what the drawn relation CONNECTS, and a part's own
  // nodes. A root naming anything else is a typo, and it is refused
  // rather than drawn.
  const nodes = [...new Set([...nodesOf(kept), ...part.members])]
    .sort(cmpCodePoint)
  if (max < nodes.length) {
    return {
      errors: [rowsFinding(nodes.length, max, '--at, --relation or --root', true)],
    }
  }
  const lab = labelsOf(nodes)
  const label = (n: string): string => undefined === part.ghosts.get(n)
    ? lab.get(n) as string
    : ghostLabel(lab.get(n) as string, part.ghosts.get(n) as string)

  const kids = new Map<string, Kid[]>(nodes.map((n) => [n, []]))
  for (const e of kept) {
    (kids.get(e.from) as Kid[]).push({ to: e.to, label: e.label })
  }
  for (const list of kids.values()) {
    list.sort((x, y) => cmpCodePoint(label(x.to), label(y.to)))
  }

  const many = 1 < new Set(kept.map((e) => e.label)).size
  const byLabel = (a: string, b: string): number =>
    cmpCodePoint(label(a), label(b))

  let named: string[]
  if (0 < roots.length) {
    const missing = roots.filter((r) => !kids.has(r))
    if (0 < missing.length) {
      return { errors: missing.map((r) => rootFinding(r, relation, nodes)) }
    }
    named = [...new Set(roots)].sort(byLabel)
  }
  else {
    const depended = new Set(
      kept.filter((e) => e.to !== e.from).map((e) => e.to))
    named = nodes.filter((n) => !depended.has(n)).sort(byLabel)
  }

  const out: string[] = []
  const rows: (TreeRow | null)[] = []
  const expanded = new Set<string>()

  const draw = (root: string): void => {
    if (0 < out.length) {
      out.push('')
      rows.push(null)
    }
    out.push(label(root))
    rows.push({ depth: 0, text: label(root), mark: '', parent: rows.length })
    expanded.add(root)

    const chain = new Set<string>([root])
    const stack: { node: string, prefix: string, at: number, row: number }[] =
      [{ node: root, prefix: '', at: 0, row: rows.length - 1 }]
    while (0 < stack.length) {
      const frame = stack[stack.length - 1]
      const list = kids.get(frame.node) as Kid[]
      if (frame.at >= list.length) {
        chain.delete(frame.node)
        stack.pop()
        continue
      }
      const edge = list[frame.at++]
      const last = frame.at === list.length
      const loop = chain.has(edge.to)
      const seen = expanded.has(edge.to)
      const grown = 0 < (kids.get(edge.to) as Kid[]).length
      const text = label(edge.to) + (many ? ' (' + edge.label + ')' : '')
      const mark = loop ? ' (cycle)' : (seen && grown ? ' (*)' : '')
      out.push(paint('rule', frame.prefix + (last ? '└── ' : '├── '))
        + text + paint('repeat', mark))
      rows.push({ depth: stack.length, text, mark, parent: frame.row })
      if (loop || seen) {
        continue
      }
      expanded.add(edge.to)
      chain.add(edge.to)
      stack.push({
        node: edge.to,
        prefix: frame.prefix + (last ? '    ' : '│   '),
        at: 0,
        row: rows.length - 1,
      })
    }
  }

  for (const root of named) {
    draw(root)
  }

  // A part draws every node it holds, after the roots named in it.
  if (0 === roots.length || part.rest) {
    for (const n of nodes) {
      if (!expanded.has(n)) {
        draw(n)
      }
    }
  }

  return {
    text: 'svg' === as
      ? treeSvg(rows, `Dependency tree: ${nodes.length} nodes`, style)
      : out.join('\n'),
  }
}


function treeSvg(
  rows: (TreeRow | null)[], about: string, style: ViewStyle
): string {
  const U = 24
  const parts: string[] = []
  let width = 0
  rows.forEach((r, i) => {
    if (null === r) {
      return
    }
    const y = i * LH
    const x = r.depth * U + 4
    if (0 < r.depth) {
      const px = (r.depth - 1) * U + 8
      parts.push(svgPath(`M${px} ${r.parent * LH + LH}V${y + 10}H${x - 2}`, 'av-line'))
    }
    parts.push('' === r.mark
      ? svgText(x, y + 14, 'av-t', r.text)
      : `<text x="${x}" y="${y + 14}"><tspan class="av-t">${svgEsc(r.text)}` +
        `</tspan><tspan class="av-m">${svgEsc(r.mark)}</tspan></text>`)
    width = Math.max(width, x + (r.text.length + r.mark.length) * CH)
  })
  return svgDoc(width + PAD, rows.length * LH + PAD, about, parts, style)
}


// ---------------------------------------------------------------------
// The document tree


const LATTICE_PARENT: [string, string][] = [
  ['string', 'any'],
  ['path', 'any'],
  ['number', 'any'],
  ['integer', 'number'],
  ['float', 'number'],
  ['biginteger', 'number'],
  ['bigdecimal', 'number'],
  ['boolean', 'any'],
  ['null', 'any'],
  ['map', 'any'],
  ['list', 'any'],
  ['constraint', 'any'],
]

const LATTICE_COLS =
  ['string', 'path', 'integer', 'float', 'biginteger', 'bigdecimal',
    'boolean', 'null', 'map', 'list', 'constraint']

// The rows, top to bottom. `any` and `nil` are the endpoints and are
// not kinds: no `superior()` answers either, and no entry above names
// them as a parent.
const LATTICE_ROWS: string[][] = [
  ['any'],
  ['string', 'path', 'number', 'boolean', 'null', 'map', 'list',
    'constraint'],
  ['integer', 'float', 'biginteger', 'bigdecimal'],
  ['nil'],
]

const LATTICE_NODES: string[] =
  ['any', ...LATTICE_PARENT.map(([name]) => name), 'nil']

// Every node at or above one, itself included.
function latticeAncestors(name: string): string[] {
  const out: string[] = [name]
  for (let at = name; '' !== at;) {
    const row = LATTICE_PARENT.find(([child]) => child === at)
    at = undefined === row ? '' : row[1]
    if ('' !== at) {
      out.push(at)
    }
  }
  return out
}

function latticeSpan(name: string): number[] {
  const own = LATTICE_COLS.indexOf(name)
  if (-1 !== own) {
    return [own]
  }
  const under = LATTICE_COLS
    .map((col, i) => latticeAncestors(col).includes(name) ? i : -1)
    .filter((i) => -1 !== i)
  return 0 === under.length ? LATTICE_COLS.map((_, i) => i) : under
}

function latticeCovers(parent: string, child: string): boolean {
  return 'nil' === child
    ? -1 !== LATTICE_COLS.indexOf(parent)
    : LATTICE_PARENT.some(([c, p]) => c === child && p === parent)
}


function latticePoint(v: any): string | undefined {
  const node: any = throughDoc(v)
  if (true === node?.isNil) {
    return 'nil'
  }
  if (true === node?.isTop) {
    return 'any'
  }
  // A field TYPED `constraint` holds a constraint. A residual such as
  // `integer & min(1)` is a region of its kind, not a point, and stays
  // unplaced.
  if (true === node?.isConstraintKind) {
    return 'constraint'
  }
  const name: string =
    true === node?.isScalarKind || true === node?.isContainerKind
      ? String(node.canon)
    : true === node?.isScalar ? String(node.superior?.().canon) : ''
  return LATTICE_NODES.includes(name) ? name : undefined
}


// The document's own values, gathered by lattice node. Containers are
// walked but not placed: a map is not a scalar lattice citizen, and
// counting one at `any` would put every document's root there.
function latticeCensus(root: any, at: string):
  { counts: Map<string, string[]>, unplaced: string[] } {
  const counts = new Map<string, string[]>()
  const unplaced: string[] = []
  const stack: { node: any, path: string }[] = [{ node: root, path: at }]
  while (0 < stack.length) {
    const { node, path } = stack.pop() as { node: any, path: string }
    const kids = docKids(node)
    if (0 < kids.length) {
      // A container is a shape, not a point: walk into it and place
      // what it holds.
      for (const key of kids) {
        stack.push({
          node: throughDoc(throughDoc(node).peg[key]),
          path: path + '.' + key,
        })
      }
      continue
    }
    const point = latticePoint(node)
    if (undefined === point) {
      // AN EMPTY CONTAINER IS NEITHER A POINT NOR A SHAPE with
      // anything in it, and is no more unplaced than `{}` is a value:
      // skip it rather than report a loss a reader cannot act on.
      const inner: any = throughDoc(node)
      if (true !== inner?.isMap && true !== inner?.isList) {
        unplaced.push(path)
      }
      continue
    }
    const there = counts.get(point) ?? []
    there.push(path)
    counts.set(point, there)
  }
  for (const paths of counts.values()) {
    paths.sort(cmpCodePoint)
  }
  unplaced.sort(cmpCodePoint)
  return { counts, unplaced }
}


function latticeCell(counts: Map<string, string[]>, name: string): string {
  const n = (counts.get(name) ?? []).length
  return 0 === n ? name : `${name} (${n})`
}

const LATTICE_GUTTER = 3

function latticeCols(counts: Map<string, string[]>):
  { cx: number[], width: number } {
  const w = LATTICE_COLS.map((col) => LATTICE_GUTTER + Math.max(
    ...LATTICE_ROWS.flat()
      .filter((name) => {
        const span = latticeSpan(name)
        return 1 === span.length && col === LATTICE_COLS[span[0]]
      })
      .map((name) => latticeCell(counts, name).length)))
  let x = 0
  const cx = w.map((n) => {
    const c = x + Math.floor(n / 2)
    x += n
    return c
  })
  return { cx, width: x }
}

// The centre of a node, from the columns it covers.
function latticeAt(name: string, cx: number[]): number {
  const span = latticeSpan(name)
  return Math.round((cx[span[0]] + cx[span[span.length - 1]]) / 2)
}


const LATTICE_GLYPH: Record<string, string> = {
  '....': '─', '...d': '│', '..u.': '│', '..ud': '│',
  '.r..': '─', '.r.d': '┌', '.ru.': '└', '.rud': '├',
  'l...': '─', 'l..d': '┐', 'l.u.': '┘', 'l.ud': '┤',
  'lr..': '─', 'lr.d': '┬', 'lru.': '┴', 'lrud': '┼',
}

function latticeText(counts: Map<string, string[]>, style: ViewStyle): string {
  const paint = painter(style)
  const { cx, width } = latticeCols(counts)
  const canvas: string[][] = []
  const roles: ViewRole[][] = []
  const put = (y: number, x: number, text: string, role: ViewRole) => {
    while (canvas.length <= y) {
      canvas.push(new Array(width).fill(' '))
      roles.push(new Array(width).fill('label'))
    }
    for (let i = 0; i < text.length; i++) {
      canvas[y][x + i] = text[i]
      roles[y][x + i] = role
    }
  }
  const cell = (y: number, name: string) => {
    const text = latticeCell(counts, name)
    const left = latticeAt(name, cx) - Math.floor(text.length / 2)
    put(y, left, name, 'label')
    put(y, left + name.length, text.slice(name.length), 'muted')
  }
  const stems = (y: number, at: string[]) => {
    for (const name of at) {
      put(y, latticeAt(name, cx), '│', 'rule')
    }
  }
  // The rule that joins one row to the next, plus the lines that pass
  // it by: a kind with nothing under it runs on down the OUTSIDE of the
  // fan, which the column order guarantees is clear of it.
  const rule = (y: number, up: string[], down: string[], by: string[]) => {
    const at = (names: string[]) => names.map((n) => latticeAt(n, cx))
    const [u, d] = [at(up), at(down)]
    const lo = Math.min(...u, ...d), hi = Math.max(...u, ...d)
    for (let x = lo; x <= hi; x++) {
      put(y, x, LATTICE_GLYPH[
        (x > lo ? 'l' : '.') + (x < hi ? 'r' : '.') +
        (u.includes(x) ? 'u' : '.') + (d.includes(x) ? 'd' : '.')], 'rule')
    }
    stems(y, by)
  }

  let open: string[] = []
  let y = 0
  for (let r = 0; r < LATTICE_ROWS.length; r++) {
    stems(y, open)
    for (const name of LATTICE_ROWS[r]) {
      cell(y, name)
    }
    open = [...open, ...LATTICE_ROWS[r]]
    if (LATTICE_ROWS.length - 1 === r) {
      break
    }
    const next = LATTICE_ROWS[r + 1]
    const parents =
      open.filter((n) => next.some((k) => latticeCovers(n, k)))
    const by = open.filter((n) => !parents.includes(n))
    stems(y + 1, open)
    rule(y + 2, parents, next, by)
    open = by
    y += 3
  }

  return canvas.map((line, i) => {
    const bare = line.join('').replace(/\s+$/, '')
    let out = '', at = 0
    while (at < bare.length) {
      let end = at
      while (end < bare.length && roles[i][end] === roles[i][at]) {
        end++
      }
      out += paint(roles[i][at], bare.slice(at, end))
      at = end
    }
    return out
  }).join('\n')
}


function latticeSvg(
  counts: Map<string, string[]>, at: string, style: ViewStyle
): string {
  const ROWH = 3 * LH
  const BOXH = 26
  const { cx, width } = latticeCols(counts)
  const parts: string[] = []
  const rowOf = new Map<string, number>()
  LATTICE_ROWS.forEach((row, r) => row.forEach((name) => rowOf.set(name, r)))
  const x = (name: string): number => PAD + latticeAt(name, cx) * CH
  const y = (name: string): number =>
    PAD + BOXH / 2 + (rowOf.get(name) as number) * ROWH

  const edges: [string, string][] = [...LATTICE_PARENT,
    ...LATTICE_COLS.map((col): [string, string] => ['nil', col])]
  for (const [child, parent] of edges) {
    const y2 = y(child) - BOXH / 2
    parts.push(svgPath(`M${x(parent)} ${y(parent) + BOXH / 2}` +
      `V${y2 - (ROWH - BOXH) / 2}H${x(child)}V${y2}`, 'av-line'))
  }

  for (const name of LATTICE_ROWS.flat()) {
    const text = latticeCell(counts, name)
    const w = (text.length + 2) * CH
    parts.push(svgRect(x(name) - w / 2, y(name) - BOXH / 2, w, BOXH,
      name === text ? 'av-cell' : 'av-box'))
    parts.push(`<text x="${x(name)}" y="${y(name) + 5}" text-anchor="middle">` +
      `<tspan class="av-t">${svgEsc(name)}</tspan>` +
      `<tspan class="av-m">${svgEsc(text.slice(name.length))}</tspan></text>`)
  }

  const placed = [...counts.values()].reduce((n, p) => n + p.length, 0)
  return svgDoc(width * CH + 2 * PAD,
    2 * PAD + BOXH + (LATTICE_ROWS.length - 1) * ROWH,
    `Value lattice at ${at}: ${placed} value(s) placed`, parts, style)
}


const LATTICE_LINES = 3 * LATTICE_ROWS.length - 2

function drawLattice(
  root: any,
  o: { at?: string, as: ViewProfile, style: ViewStyle },
  max: number, loss: ViewLoss[]
): Figure {
  const at = o.at ?? '$'
  const anchor = anchorAt(root, at)
  if (null == anchor) {
    // The same code and the same sentence `get` answers with, for the
    // same question.
    return {
      errors: [finding('no_path', 'reference', at,
        `The path ${at} names nothing in this document.`)],
    }
  }
  if (max < LATTICE_LINES) {
    return {
      errors: [finding('view_rows_exceeded', 'budget', '$',
        `The figure has ${LATTICE_LINES} rows, above --max-rows ${max}; ` +
        'the value lattice is fixed, so raise the limit.',
        `rows: ${LATTICE_LINES}, max: ${max}`)],
    }
  }
  const { counts, unplaced } = latticeCensus(anchor, at)

  if (0 < unplaced.length) {
    // NOT A LOSS OF DETAIL BUT A LOSS OF PLACE: these values are real,
    // and the figure cannot say where they are because they are not
    // anywhere single. Named, not merely counted -- a reader who sees
    // `2` wants to know which two.
    loss.push({
      code: 'lattice_unplaced', count: unplaced.length, detail: unplaced,
    })
  }

  return {
    text: 'svg' === o.as
      ? latticeSvg(counts, at, o.style) : latticeText(counts, o.style),
  }
}


const DEFAULT_DOC_DEPTH = 3

// A node's own children, as the anchor walk sees them: map keys sorted
// by code point, list indices in order, and nothing for a leaf.
function docKids(v: any): string[] {
  const node: any = throughDoc(v)
  if (true === node?.isMap) {
    return Object.keys(node.peg)
      .filter((k) => !k.startsWith('%')).sort(cmpCodePoint)
  }
  if (true === node?.isList) {
    return Object.keys(node.peg).filter((k) => /^[0-9]+$/.test(k))
  }
  return []
}

// A preference wraps its value without being a level of its own, and
// `anchorAt` already steps through a sizing residue; this is the same
// unwrapping, for the shape walk.
function throughDoc(v: any): any {
  // Every caller reaches this with a Val the anchor walk handed over,
  // so the node is never absent and the optional chain that would say
  // otherwise is an arm no test can take.
  const node = throughResidue(v)
  return true === node.isPref ? throughDoc(node.peg) : node
}

// What a leaf IS, in one short word: its canon, which for a constraint
// is the constraint and for a scalar its value. Long canons are cut,
// since the figure is the shape and not the data.
function docLeaf(v: any): string {
  const canon: string = throughDoc(v).canon
  return 32 < canon.length ? canon.slice(0, 29) + '...' : canon
}


// A part of a divided document is anchored below `at` by its chain of
// keys, walked as keys rather than re-read as a path, and keeps `only`
// of that anchor's children.
function drawDoc(
  root: any,
  o: {
    at?: string, depth?: number, as: ViewProfile, style: ViewStyle,
    chain?: string[], only?: string[],
  },
  max: number, loss: ViewLoss[]
): Figure {
  const paint = painter(o.style)
  const base = o.at ?? '$'
  let anchor = anchorAt(root, base)
  if (null == anchor) {
    return {
      // The same code and the same sentence `get` answers with: the
      // question is identical, so a caller that already handles one
      // handles the other.
      errors: [finding('no_path', 'reference', base,
        `The path ${base} names nothing in this document.`)],
    }
  }
  const chain = o.chain ?? []
  for (const key of chain) {
    anchor = throughDoc(throughDoc(anchor).peg[key])
  }
  const at = [base, ...chain].join('.')
  const depth = o.depth || DEFAULT_DOC_DEPTH
  const out: string[] = []
  const rows: (TreeRow | null)[] = []
  let elided = 0

  out.push(at)
  rows.push({ depth: 0, text: at, mark: '', parent: 0 })

  // ITERATIVE, like the dependency tree's walk and for the same
  // reason: a deep model is a real shape, and the drawing of one must
  // not depend on how deep the interpreter lets a recursion go.
  type Frame = { node: any, kids: string[], at: number, prefix: string, row: number }
  const top = docKids(anchor)
    .filter((k) => undefined === o.only || o.only.includes(k))
  const stack: Frame[] = [
    { node: anchor, kids: top, at: 0, prefix: '', row: 0 },
  ]
  while (0 < stack.length) {
    const frame = stack[stack.length - 1]
    if (frame.at >= frame.kids.length) {
      stack.pop()
      continue
    }
    const key = frame.kids[frame.at++]
    const last = frame.at === frame.kids.length
    const child = throughDoc(throughDoc(frame.node).peg[key])
    const kids = docKids(child)
    const under = stack.length < depth
    const mark = 0 === kids.length ? ' ' + docLeaf(child)
      : under ? '' : ` (${kids.length})`
    if (0 < kids.length && !under) {
      elided += kids.length
    }
    out.push(paint('rule', frame.prefix + (last ? '└── ' : '├── ')) + key +
      paint('muted', mark))
    rows.push({ depth: stack.length, text: key, mark, parent: frame.row })
    if (max < rows.length) {
      return {
        errors: [rowsFinding(rows.length, max, '--at or --depth', true)],
      }
    }
    if (0 < kids.length && under) {
      stack.push({
        node: child, kids, at: 0,
        prefix: frame.prefix + (last ? '    ' : '│   '),
        row: rows.length - 1,
      })
    }
  }
  if (0 < elided) {
    loss.push({ code: 'depth_elided', count: elided })
  }
  return {
    text: 'svg' === o.as
      ? treeSvg(rows,
        `Document tree at ${at}: ${rows.length - 1} keys to depth ${depth}`,
        o.style)
      : out.join('\n'),
  }
}

// ---------------------------------------------------------------------
// The matrix (Ghoniem et al. 2004; Sangal et al. 2005)

function partition(
  nodes: string[], succ: Map<string, string[]>,
  reach: Map<string, Set<string>>, label: (n: string) => string,
  loss: ViewLoss[]
): string[] {
  const order = nodes.slice().sort((a, b) => cmpCodePoint(label(a), label(b)))
  const placed = new Set<string>()
  const out: string[] = []
  const blocks: string[] = []
  while (out.length < order.length) {
    const ready = order.filter((n) => !placed.has(n) &&
      (succ.get(n) as string[]).every((s) => s === n || placed.has(s)))
    if (0 < ready.length) {
      for (const n of ready) {
        placed.add(n)
        out.push(n)
      }
      continue
    }
    const least = order.find((n) => !placed.has(n)) as string
    const scc = order.filter((n) => !placed.has(n) && (n === least ||
      ((reach.get(least) as Set<string>).has(n) &&
        (reach.get(n) as Set<string>).has(least))))
    blocks.push(scc.map(label).join(' '))
    placed.add(least)
    out.push(least)
  }
  if (0 < blocks.length) {
    loss.push({ code: 'cycle_block', count: blocks.length, detail: blocks })
  }
  return out
}


function pickRelation(
  relation: string | undefined, keys: string[]
): { relation?: string, error?: VetFinding } {
  if (undefined !== relation) {
    return keys.includes(relation) || 0 === keys.length
      ? { relation } : { error: relationFinding(relation, keys) }
  }
  if (1 < keys.length) {
    return {
      error: finding('view_relation_ambiguous', 'reference', '$',
        'The document has several relations with edges; ' +
        'name one with --relation.',
        'relations with edges: ' + keys.join(', ')),
    }
  }
  // No edges at all: no relation, and the empty name says so, as it
  // does in the Go port.
  return { relation: keys[0] ?? '' }
}


function drawMatrix(
  triples: Triple[], decls: RelDecls,
  o: {
    relation?: string, order: ViewOrder, closure: boolean, as: ViewProfile,
    style: ViewStyle, ghosts: Ghosts, members: string[], picked: boolean,
  },
  max: number, loss: ViewLoss[]
): Figure {
  const paint = painter(o.style)
  // A part is drawn over the relation its whole figure picked.
  const picked = o.picked ? { relation: o.relation }
    : pickRelation(o.relation, keysOf(triples))
  if (undefined !== picked.error) {
    return { errors: [picked.error] }
  }
  const relation = picked.relation as string
  const rel = triples.filter((e) => e.key === relation)
  const nodes = [...new Set([...nodesOf(rel), ...o.members])]
    .sort(cmpCodePoint)
  if (max < nodes.length) {
    return { errors: [rowsFinding(nodes.length, max, '--at or --relation', true)] }
  }
  const lab = labelsOf(nodes)
  const ghosts = o.ghosts
  const label = (n: string): string => undefined === ghosts.get(n)
    ? lab.get(n) as string
    : ghostLabel(lab.get(n) as string, ghosts.get(n) as string)

  const succ = new Map<string, string[]>(nodes.map((n) => [n, []]))
  const direct = new Set<string>()
  for (const e of rel) {
    (succ.get(e.from) as string[]).push(e.to)
    direct.add(e.from + SEP + e.to)
  }
  const reach = reachOf(nodes, succ)

  // The `unmirrored` mark: an edge under a predicate that declares
  // `inverse(n)` whose mirror is absent from the full edge set. The
  // matrix shows in one glyph what `aontu relations` reports as
  // `relation_inverse_missing`, and both read one edge set.
  const inverses = [...(decls.get(relation)?.inverses ?? [])]
  const mirrored = (from: string, to: string): boolean =>
    0 === inverses.length || triples.some((e) =>
      e.from === to && e.to === from && inverses.includes(e.key))

  const order = 'partition' === o.order
    ? partition(nodes, succ, reach, label, loss)
    : nodes.slice().sort((a, b) => cmpCodePoint(label(a), label(b)))

  const idx = order.map((_, i) => String(i + 1))
  const iw = widest(idx)
  const w = widest(order.map(label))
  const lines: string[] = []

  // The index header, one line per digit when the count needs more
  // than one: the digits stack, most significant line first, so every
  // column stays one character wide.
  for (let d = 0; d < iw; d++) {
    lines.push(' '.repeat(w + 1 + iw + 1) +
      paint('muted', idx.map((s) => lpad(s, iw)[d]).join(' ')))
  }

  let above = 0
  const grid: string[][] = []
  order.forEach((r, ri) => {
    const cells = order.map((c, ci) => {
      const isDirect = direct.has(r + SEP + c)
      if (isDirect && ci > ri) {
        above++
      }
      // A SELF-DEPENDENCY is drawn on the diagonal rather than hidden
      // by it: it is the shortest cycle a model can have, and exactly
      // the fact a dependency matrix is read for.
      return isDirect ? (mirrored(r, c) ? 'X' : '!')
        : ri === ci ? '\\'
          : o.closure && (reach.get(r) as Set<string>).has(c) ? '+' : '.'
    })
    grid.push(cells)
    lines.push(
      pad(label(r), w) + ' ' + paint('muted', lpad(idx[ri], iw)) + ' ' +
      cells.map((g) => paint(CELL_ROLE[g], g)).join(' '))
  })
  const footer = `# above-diagonal direct cells: ${above}`
  lines.push(paint('muted', footer))
  if ('svg' === o.as) {
    return {
      text: matrixSvg(order.map(label), idx, grid, footer,
        `Dependency matrix${over(relation)}: ${order.length} rows, ` +
        `${above} direct cells above the diagonal`, o.style),
    }
  }
  return { text: lines.join('\n') }
}


// The matrix as SVG: the same glyph grid as cells, each a square whose
// class is its state, the diagonal drawn as a line through its cell.
const CELL_CLASS: Record<string, string> = {
  X: 'av-direct', '!': 'av-unmirrored', '+': 'av-closure',
  '.': 'av-cell', '\\': 'av-cell',
}

const CELL_ROLE: Record<string, ViewRole> = {
  X: 'direct', '!': 'unmirrored', '+': 'closure',
  '.': 'muted', '\\': 'rule',
}

function matrixSvg(
  labels: string[], idx: string[], grid: string[][], footer: string,
  about: string, style: ViewStyle
): string {
  const S = 20
  const w = widest(labels)
  const iw = widest(idx)
  const gutter = w * CH + 8 + iw * CH + 8
  const y0 = LH + 4
  const parts: string[] = []
  idx.forEach((s, c) => {
    parts.push(svgText(gutter + c * S + 10, 14, 'av-m', s, 'middle'))
  })
  labels.forEach((l, r) => {
    const y = y0 + r * S
    parts.push(svgText(4, y + 14, 'av-t', l))
    parts.push(svgText(gutter - 8, y + 14, 'av-m', idx[r], 'end'))
    grid[r].forEach((g, c) => {
      const x = gutter + c * S
      parts.push(svgRect(x, y, S, S, CELL_CLASS[g]))
      if ('\\' === g) {
        parts.push(svgPath(`M${x} ${y}L${x + S} ${y + S}`, 'av-line'))
      }
    })
  })
  const n = labels.length
  parts.push(svgText(4, y0 + n * S + 16, 'av-m', footer))
  const width = Math.max(gutter + n * S, 4 + footer.length * CH) + PAD
  return svgDoc(width, y0 + n * S + LH + PAD, about, parts, style)
}


// ---------------------------------------------------------------------
// The node-link graph

type GNode = {
  path: string, label: string, id: string, group?: string, ghost?: boolean
}
type GEdge = { from: string, key: string, to: string }

// A node drawn only because an edge reaches it from the selection,
// keyed to the part it lives in; '' is outside every part.
type Ghosts = Map<string, string>

type Unresolved = string[]


// A node's field, as label text: the value of a scalar leaf at
// `path.field`, taken as its canon for anything but a string. A value
// the document leaves open is `unresolved_field` rather than an error.
function fieldOf(root: any, path: string, field: string): string | undefined {
  const v: any = anchorAt(root, path + '.' + field)
  if (null == v || true !== v.isVal) {
    return undefined
  }
  if ('string' === typeof v.peg) {
    return v.peg
  }
  return true === v.isScalar ? v.canon : undefined
}


function unresolvedLoss(unresolved: Unresolved, loss: ViewLoss[]): void {
  const detail = [...new Set(unresolved)].sort(cmpCodePoint)
  if (0 < detail.length) {
    loss.push({ code: 'unresolved_field', count: detail.length, detail })
  }
}


// Every code point outside `keep` is `_`, its hex and `_` again, so the
// spelling is injective: `_` itself is never kept.
function spell(name: string, keep: RegExp): string {
  let out = ''
  for (const ch of name) {
    out += keep.test(ch) ? ch : `_${(ch.codePointAt(0) as number).toString(16)}_`
  }
  return out
}


function ghostLabel(label: string, where: string): string {
  return '' === where ? label + ' (outside)' : `${label} (in ${where})`
}


// The drawn nodes: what the edges connect and the members asked for.
function graphPaths(edges: GEdge[], members: string[]): string[] {
  return [...new Set([...nodesOf(edges), ...members])].sort(cmpCodePoint)
}


function graphNodes(
  paths: string[], root: any, o: { groupBy?: string, label?: string },
  ghosts: Ghosts, unresolved: Unresolved
): { nodes?: GNode[], error?: VetFinding } {
  const lab = labelsOf(paths)
  const nodes: GNode[] = paths.map((p) => {
    const short = lab.get(p) as string
    const where = ghosts.get(p)
    const node: GNode = { path: p, label: short, id: ident(short) }
    if (undefined !== o.groupBy) {
      const g = fieldOf(root, p, o.groupBy)
      if (undefined === g) {
        unresolved.push(p + '.' + o.groupBy)
      }
      else {
        node.group = g
      }
    }
    if (undefined !== o.label) {
      const l = fieldOf(root, p, o.label)
      if (undefined === l) {
        unresolved.push(p + '.' + o.label)
      }
      else {
        node.label = l
      }
    }
    if (undefined !== where) {
      node.ghost = true
      node.id = 'x' + node.id
      node.label = ghostLabel(node.label, where)
    }
    return node
  })
  for (const n of nodes) {
    if (hasLineBreak(n.label) || hasLineBreak(n.group ?? '')) {
      return { error: lineBreakFinding(n.path) }
    }
  }
  return { nodes }
}


// A group's title: its name, and with `counts` its member count, and
// with `countBy` its members counted by that field's value. A ghost is
// not a member.
function groupTitle(
  name: string, members: GNode[], root: any,
  o: { counts?: boolean, countBy?: string }, unresolved: Unresolved
): string {
  const real = members.filter((n) => true !== n.ghost)
  if (undefined !== o.countBy) {
    const by = new Map<string, number>()
    for (const n of real) {
      const v = fieldOf(root, n.path, o.countBy)
      if (undefined === v) {
        unresolved.push(n.path + '.' + o.countBy)
      }
      by.set(v ?? '-', (by.get(v ?? '-') ?? 0) + 1)
    }
    const parts = [...by.keys()].sort(cmpCodePoint)
      .map((k) => `${k} ${by.get(k)}`)
    return 0 === parts.length ? `${name} (0)`
      : `${name} (${real.length}: ${parts.join(', ')})`
  }
  return true === o.counts ? `${name} (${real.length})` : name
}


type Emit = {
  groups: { id: string, title: string, nodes: GNode[] }[]
  loose: GNode[]
  edges: { from: string, to: string, label: string }[]
  columns?: Map<string, string[]>
}


function emitGraph(as: ViewProfile, e: Emit): string {
  const out: string[] = []
  if ('mermaid' === as) {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('flowchart LR')
    for (const g of e.groups) {
      out.push(`  subgraph ${g.id}["${esc(g.title)}"]`)
      for (const n of g.nodes) {
        out.push(`    ${n.id}["${esc(n.label)}"]`)
      }
      out.push('  end')
    }
    for (const n of e.loose) {
      out.push(`  ${n.id}["${esc(n.label)}"]`)
    }
    for (const d of e.edges) {
      out.push(`  ${d.from} -->|"${esc(d.label)}"| ${d.to}`)
    }
  }
  else if ('dot' === as) {
    const esc = (s: string): string => escape(s, DOT_ESC)
    out.push('digraph G {', '  rankdir=LR;', '  node [shape=box];')
    for (const g of e.groups) {
      out.push(`  subgraph cluster_${g.id} {`, `    label="${esc(g.title)}";`)
      for (const n of g.nodes) {
        out.push(`    ${n.id} [label="${esc(n.label)}"];`)
      }
      out.push('  }')
    }
    for (const n of e.loose) {
      out.push(`  ${n.id} [label="${esc(n.label)}"];`)
    }
    for (const d of e.edges) {
      out.push(`  ${d.from} -> ${d.to} [label="${esc(d.label)}"];`)
    }
    out.push('}')
  }
  else {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('erDiagram')
    if (undefined !== e.columns) {
      const cols = e.columns
      for (const n of [...e.groups.flatMap((g) => g.nodes), ...e.loose]) {
        const attrs = cols.get(n.id)
        if (undefined === attrs) {
          out.push(`  ${n.id}["${esc(n.label)}"]`)
        }
        else {
          out.push(`  ${n.id}["${esc(n.label)}"] {`,
            ...attrs.map((a) => '    ' + a), '  }')
        }
      }
    }
    for (const d of e.edges) {
      out.push(`  ${d.from} }o--o{ ${d.to} : "${esc(d.label)}"`)
    }
  }
  return out.join('\n')
}


const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/

// One ER attribute line per column, typed by the lattice: the value's
// own point, else the kind its canon starts with, else `any` and the
// column is counted as unplaced.
function erColumns(
  root: any, node: GNode, field: string, unplaced: string[]
): string[] | undefined {
  const at = node.path + '.' + field
  const holder: any = anchorAt(root, at)
  if (null == holder || true !== throughDoc(holder).isMap) {
    return undefined
  }
  const esc = (s: string): string => escape(s, MERMAID_ESC)
  return docKids(holder).map((key) => {
    const v: any = throughDoc(throughDoc(holder).peg[key])
    const canon: string = v.canon
    const head = (/^[a-z]+/.exec(canon) ?? [''])[0]
    const fk = 'string' === typeof v.link
    const type = true === v.isMap ? 'map'
      : true === v.isList ? 'list'
        : latticePoint(v) ?? (LATTICE_NODES.includes(head) ? head : 'any')
    if ('any' === type && true !== v.isTop) {
      unplaced.push(at + '.' + key)
    }
    const name = ATTR_NAME.test(key) && !key.startsWith('q_')
      ? key : 'q_' + spell(key, /[A-Za-z0-9]/)
    const note = name !== key ? key
      : fk || type === canon || true === v.isMap || true === v.isList
        ? '' : 32 < canon.length ? canon.slice(0, 29) + '...' : canon
    return `${type} ${name}` + (fk ? ' FK' : '') +
      ('' === note ? '' : ` "${esc(note)}"`)
  })
}


type GraphOpts = {
  relations: string[], groupBy?: string, label?: string, as: ViewProfile,
  members: string[], ghosts: Ghosts, columns?: string, counts?: boolean,
  countBy?: string, collapse?: boolean,
}


function drawGraph(
  triples: Triple[], decls: RelDecls, root: any, o: GraphOpts,
  max: number, loss: ViewLoss[]
): Figure {
  const keys = keysOf(triples)
  for (const r of o.relations) {
    if (!keys.includes(r)) {
      return { errors: [relationFinding(r, keys)] }
    }
  }
  const kept = 0 === o.relations.length
    ? triples : triples.filter((e) => o.relations.includes(e.key))

  // INVERSE SUPPRESSION: a hand-maintained mirror under a declared
  // `inverse(n)` is one fact drawn twice, so the mirror half is not
  // drawn and the count is reported. The declaring direction wins.
  const declared = (key: string, mirror: string): boolean =>
    true === decls.get(key)?.inverses.has(mirror)
  const edges: GEdge[] = []
  let suppressed = 0
  for (const e of kept) {
    const mirror = kept.some((m) =>
      m.from === e.to && m.to === e.from && declared(m.key, e.key))
    if (mirror) {
      suppressed++
    }
    else {
      edges.push(e)
    }
  }
  if (0 < suppressed) {
    loss.push({ code: 'inverse_suppressed', count: suppressed })
  }

  const paths = graphPaths(edges, o.members)
  if (max < paths.length) {
    return { errors: [rowsFinding(paths.length, max, '--at or --relation', true)] }
  }

  // `--group-by` and `--label` read a field of each node; a node
  // without a value there is counted, and drawn ungrouped or under
  // its path.
  const unresolved: Unresolved = []
  const built = graphNodes(paths, root, o, o.ghosts, unresolved)
  if (undefined !== built.error) {
    return { errors: [built.error] }
  }
  const nodes = built.nodes as GNode[]
  // A ghost lives in another part, so no group of this one holds it.
  for (const n of nodes.filter((n) => true === n.ghost)) {
    delete n.group
  }

  // Groups in label order, ids ordinal; nodes within a group, and the
  // ungrouped after them, in label order. That order is the emitted
  // order, and the crossing count is a property of it.
  const names = [...new Set(nodes.filter((n) => undefined !== n.group)
    .map((n) => n.group as string))].sort(cmpCodePoint)
  const byLabel = (a: GNode, b: GNode): number =>
    cmpCodePoint(a.label, b.label) || cmpCodePoint(a.path, b.path)
  const groups = names.map((g, gi) => {
    const members = nodes.filter((n) => n.group === g).sort(byLabel)
    return {
      id: `g${gi}`,
      title: groupTitle(g, members, root,
        { counts: o.counts || o.collapse, countBy: o.countBy }, unresolved),
      nodes: members,
    }
  })
  const broken = groups.find((g) => hasLineBreak(g.title))
  if (undefined !== broken) {
    return { errors: [lineBreakFinding(broken.nodes[0].path)] }
  }
  const loose = nodes.filter((n) => undefined === n.group).sort(byLabel)
  const emitted: GNode[] = [...groups.flatMap((g) => g.nodes), ...loose]

  const byPath = new Map<string, GNode>(nodes.map((n) => [n.path, n]))
  const node = (p: string): GNode => byPath.get(p) as GNode

  if (true === o.collapse) {
    unresolvedLoss(unresolved, loss)
    return collapseGraph(groups, loose, edges, node, o.as, loss)
  }

  const at = new Map<string, number>(emitted.map((n, i) => [n.path, i]))
  const drawn = edges.slice().sort((a, b) =>
    cmpCodePoint(node(a.from).label, node(b.from).label)
    || cmpCodePoint(node(a.to).label, node(b.to).label)
    || cmpCodePoint(a.key, b.key))

  let crossings = 0
  const span = (e: GEdge): [number, number] => {
    const a = at.get(e.from) as number
    const b = at.get(e.to) as number
    return a < b ? [a, b] : [b, a]
  }
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const [a1, b1] = span(drawn[i])
      const [a2, b2] = span(drawn[j])
      if ((a1 < a2 && a2 < b1 && b1 < b2) || (a2 < a1 && a1 < b2 && b2 < b1)) {
        crossings++
      }
    }
  }
  if (0 < crossings) {
    loss.push({ code: 'crossings', count: crossings })
  }

  let columns: Map<string, string[]> | undefined
  if ('er' === o.as && undefined !== o.columns) {
    columns = new Map()
    const unplaced: string[] = []
    for (const n of emitted.filter((n) => true !== n.ghost)) {
      const attrs = erColumns(root, n, o.columns, unplaced)
      if (undefined === attrs) {
        unresolved.push(n.path + '.' + o.columns)
      }
      else {
        columns.set(n.id, attrs)
      }
    }
    if (0 < unplaced.length) {
      loss.push({ code: 'column_unplaced', count: unplaced.length, detail: unplaced })
    }
  }
  unresolvedLoss(unresolved, loss)

  return {
    text: emitGraph(o.as, {
      groups, loose, columns,
      edges: drawn.map((e) => ({
        from: node(e.from).id, to: node(e.to).id, label: e.key,
      })),
    }),
  }
}


// THE SURFACE MAP: one node per group, titled with its count, and one
// edge per (group, relation, group) labelled with how many edges it
// stands for. An edge inside one group is not drawn, and is counted.
function collapseGraph(
  groups: { id: string, title: string, nodes: GNode[] }[], loose: GNode[],
  edges: GEdge[], node: (p: string) => GNode, as: ViewProfile,
  loss: ViewLoss[]
): Figure {
  const home = new Map<string, { id: string, label: string }>()
  for (const g of groups) {
    for (const n of g.nodes) {
      home.set(n.path, { id: g.id, label: g.title })
    }
  }
  const of = (p: string): { id: string, label: string } =>
    home.get(p) ?? { id: node(p).id, label: node(p).label }
  const tally = new Map<string, { from: string, to: string, key: string, n: number, order: string }>()
  let internal = 0
  for (const e of edges) {
    const a = of(e.from)
    const b = of(e.to)
    if (a.id === b.id && home.has(e.from)) {
      internal++
      continue
    }
    const k = a.id + SEP + e.key + SEP + b.id
    const t = tally.get(k)
    if (undefined === t) {
      tally.set(k, {
        from: a.id, to: b.id, key: e.key, n: 1,
        order: a.label + SEP + b.label + SEP + e.key,
      })
    }
    else {
      t.n++
    }
  }
  if (0 < internal) {
    loss.push({ code: 'edges_internal', count: internal })
  }
  const shown: GNode[] = [
    ...groups.map((g) => ({ path: g.id, id: g.id, label: g.title })),
    ...loose,
  ]
  return {
    text: emitGraph(as, {
      groups: [], loose: shown,
      columns: 'er' === as ? new Map() : undefined,
      edges: [...tally.values()]
        .sort((x, y) => cmpCodePoint(x.order, y.order))
        .map((t) => ({ from: t.from, to: t.to, label: `${t.key} (${t.n})` })),
    }),
  }
}


// ---------------------------------------------------------------------
// The architecture layers: the classic stacked-band drawing

type Band = { name: string, nodes: GNode[] }


function drawLayer(
  triples: Triple[], root: any,
  o: {
    relation?: string, groupBy?: string, layers: string[],
    edges?: ViewEdges, as: ViewProfile, style: ViewStyle,
    counts?: boolean, countBy?: string, ghosts: Ghosts, members: string[],
  },
  max: number, loss: ViewLoss[]
): Figure {
  if (undefined === o.groupBy) {
    return {
      errors: [finding('view_group_required', 'reference', '$',
        'The layer diagram needs the field that names each node\'s layer; ' +
        'name it with --group-by.')],
    }
  }
  const picked = pickRelation(o.relation, keysOf(triples))
  if (undefined !== picked.error) {
    return { errors: [picked.error] }
  }
  const relation = picked.relation as string
  const rel = triples.filter((e) => e.key === relation)
  const paths = [...new Set([...nodesOf(rel), ...o.members])]
    .sort(cmpCodePoint)
  if (max < paths.length) {
    return { errors: [rowsFinding(paths.length, max, '--at or --relation', true)] }
  }
  const lab = labelsOf(paths)
  const ghosts = o.ghosts

  // A node whose layer field is unresolved is counted and drawn in a
  // band of its own at the bottom, named `-`.
  const unresolved: string[] = []
  const nodes: GNode[] = paths.map((p) => {
    const short = lab.get(p) as string
    const g = fieldOf(root, p, o.groupBy as string)
    if (undefined === g) {
      unresolved.push(p + '.' + o.groupBy)
    }
    const where = ghosts.get(p)
    return undefined === where
      ? { path: p, label: short, id: ident(short), group: g ?? '-' }
      : {
        path: p, label: ghostLabel(short, where), id: 'x' + ident(short),
        group: g ?? '-', ghost: true,
      }
  })
  for (const n of nodes) {
    if (hasLineBreak(n.group as string)) {
      return { errors: [lineBreakFinding(n.path)] }
    }
  }
  const byPath = new Map<string, GNode>(nodes.map((n) => [n.path, n]))
  const node = (p: string): GNode => byPath.get(p) as GNode

  // The layer-level graph, and its partition order: leaves first, so
  // the band nothing depends on is placed LAST and drawn at the top.
  const names = [...new Set(nodes.map((n) => n.group as string))]
    .filter((g) => '-' !== g).sort(cmpCodePoint)
  const succ = new Map<string, string[]>(names.map((g) => [g, []]))
  for (const e of rel) {
    const from = node(e.from).group as string
    const to = node(e.to).group as string
    if (from !== to && '-' !== from && '-' !== to
      && !o.layers.includes(from) && !o.layers.includes(to)) {
      (succ.get(from) as string[]).push(to)
    }
  }
  // Named bands first, in the order given; the rest derived, and the
  // unresolved band last.
  const given = o.layers.filter((g) => names.includes(g))
  const rest = names.filter((g) => !given.includes(g))
  const same = (g: string): string => g
  const order = given.concat(
    partition(rest, succ, reachOf(rest, succ), same, loss).reverse())
  if (nodes.some((n) => '-' === n.group)) {
    order.push('-')
  }
  // Labels are unique in a drawing, so they order a band on their own.
  const bands: Band[] = order.map((name) => {
    const members = nodes.filter((n) => n.group === name).sort((a, b) =>
      cmpCodePoint(a.label, b.label))
    return { name: groupTitle(name, members, root, o, unresolved), nodes: members }
  })
  const broken = bands.find((b) => hasLineBreak(b.name))
  if (undefined !== broken) {
    return { errors: [lineBreakFinding(broken.nodes[0].path)] }
  }
  unresolvedLoss(unresolved, loss)
  const level = new Map<string, number>(order.map((g, i) => [g, i]))

  // Every edge is downward, sideways or upward by the bands it joins.
  const drawn = rel.slice().sort((a, b) =>
    cmpCodePoint(node(a.from).label, node(b.from).label)
    || cmpCodePoint(node(a.to).label, node(b.to).label))
  let down = 0
  let side = 0
  const classed: Drawing[] = drawn.map((e) => {
    const fi = level.get(node(e.from).group as string) as number
    const ti = level.get(node(e.to).group as string) as number
    if (fi < ti) {
      down++
      return { edge: e, way: 'downward' }
    }
    if (fi === ti) {
      side++
      return { edge: e, way: 'sideways' }
    }
    return { edge: e, way: 'upward' }
  })
  const upward = classed.filter((c) => 'upward' === c.way).length

  // WHICH EDGES ARE SHOWN. Mermaid lays edges out itself and drew every
  // one before this option existed; the fixed grids drew the upward
  // ones, which are the violations the bands cannot show on their own.
  const edges = o.edges ?? ('mermaid' === o.as ? 'all' : 'upward')
  const shown = 'all' === edges ? classed
    : 'none' === edges ? []
      : classed.filter((c) => 'upward' === c.way)

  // A document with no edges has no relation to count under; the
  // footer names the absence as the panels do.
  const footer = [`# ${'' === relation ? '-' : relation}: ${down} downward, ` +
    `${side} sideways, ${upward} upward`]
  for (const c of shown) {
    footer.push(`# ${c.way}: ${node(c.edge.from).label} -> ` +
      `${node(c.edge.to).label}`)
  }
  const out: string[] = []
  if ('svg' === o.as) {
    const drew = 'all' === edges
      ? `${shown.length} edges drawn, ${upward} of them upward`
      : 'none' === edges
        ? `${upward} upward edges, none drawn`
        : `${upward} upward edges`
    return {
      text: layerSvg(bands, shown, footer,
        `Architecture layers${over(relation)}: ${bands.length} bands, ${drew}`,
        o.style),
    }
  }
  if ('text' === o.as) {
    const paint = painter(o.style)
    const w = widest(bands.map((b) => b.name))
    const rows = bands.map((b) =>
      paint('muted', pad(b.name, w)) + '  ' +
      b.nodes.map((n) => n.label).join('  '))
    const inner = widest(bands.map((b) =>
      pad(b.name, w) + '  ' + b.nodes.map((n) => n.label).join('  ')))
    const rule = paint('rule', '+' + '-'.repeat(inner + 2) + '+')
    out.push(rule)
    rows.forEach((row, i) => {
      // The row was padded from its UNPAINTED width, which the band
      // name's escapes do not change; `pad` would count them, so the
      // padding is computed here and appended.
      const bare = pad(bands[i].name, w) + '  ' +
        bands[i].nodes.map((n) => n.label).join('  ')
      out.push(paint('rule', '|') + ' ' + row +
        ' '.repeat(inner - bare.length) + ' ' + paint('rule', '|'), rule)
    })
    // The first footer line counts; the rest name one edge each, and
    // an upward edge is the violation the bands cannot show.
    out.push(paint('muted', footer[0]))
    footer.slice(1).forEach((f, i) => {
      out.push(paint('upward' === shown[i].way ? 'upward' : 'muted', f))
    })
  }
  else {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('flowchart TB')
    bands.forEach((b, i) => {
      out.push(`  subgraph g${i}["${esc(b.name)}"]`, '    direction LR')
      for (const n of b.nodes) {
        out.push(`    ${n.id}["${esc(n.label)}"]`)
      }
      out.push('  end')
    })
    for (const c of shown) {
      out.push('upward' === c.way
        ? `  ${node(c.edge.from).id} -.->|"upward"| ${node(c.edge.to).id}`
        : `  ${node(c.edge.from).id} --> ${node(c.edge.to).id}`)
    }
  }
  return { text: out.join('\n') }
}

// One drawn edge of the layer figure, and which way it goes between
// the bands.
type Drawing = { edge: GEdge, way: 'downward' | 'sideways' | 'upward' }


function layerSvg(
  bands: Band[], shown: Drawing[], footer: string[], about: string,
  style: ViewStyle
): string {
  const BH = 44
  const gutter = widest(bands.map((b) => b.name)) * CH + 16
  const box = new Map<string, { x: number, y: number, w: number }>()
  let width = 0
  bands.forEach((b, i) => {
    let x = gutter
    for (const n of b.nodes) {
      const w = n.label.length * CH + 12
      box.set(n.path, { x, y: 4 + i * BH + 10, w })
      x += w + 10
    }
    width = Math.max(width, x - 10)
  })
  for (const f of footer) {
    width = Math.max(width, 4 + f.length * CH)
  }
  width += PAD
  const parts: string[] = []
  bands.forEach((b, i) => {
    const y = 4 + i * BH
    parts.push(svgRect(4, y, width - 8, BH, 'av-cell'))
    parts.push(svgText(12, y + 27, 'av-m', b.name))
    for (const n of b.nodes) {
      const at = box.get(n.path) as { x: number, y: number, w: number }
      parts.push(svgRect(at.x, at.y, at.w, 24, 'av-box'))
      parts.push(svgText(at.x + 6, at.y + 16, 'av-t', n.label))
    }
  })
  if (0 < shown.length) {
    parts.push('<defs>' +
      '<marker id="av-arrow" viewBox="0 0 8 8" refX="8" refY="4" ' +
      'markerWidth="8" markerHeight="8" orient="auto">' +
      '<path d="M0 0L8 4L0 8Z" fill="var(--av-alert,#d1242f)"/></marker>' +
      '<marker id="av-tip" viewBox="0 0 8 8" refX="8" refY="4" ' +
      'markerWidth="8" markerHeight="8" orient="auto">' +
      '<path d="M0 0L8 4L0 8Z" fill="var(--av-rule,#8c959f)"/></marker>' +
      '</defs>')
  }
  for (const c of shown) {
    const from = box.get(c.edge.from) as { x: number, y: number, w: number }
    const to = box.get(c.edge.to) as { x: number, y: number, w: number }
    const fx = from.x + Math.floor(from.w / 2)
    const tx = to.x + Math.floor(to.w / 2)
    if ('upward' === c.way) {
      parts.push(`<path d="M${fx} ${from.y}L${tx} ${to.y + 24}" ` +
        'class="av-up" marker-end="url(#av-arrow)"/>')
    }
    else if ('downward' === c.way) {
      parts.push(`<path d="M${fx} ${from.y + 24}L${tx} ${to.y}" ` +
        'class="av-line" marker-end="url(#av-tip)"/>')
    }
    else {
      // Below the boxes and back up, staying inside the band.
      const y = from.y + 24
      parts.push(`<path d="M${fx} ${y}V${y + 6}H${tx}V${y}" ` +
        'class="av-line" marker-end="url(#av-tip)"/>')
    }
  }
  const y1 = 4 + bands.length * BH + 4
  footer.forEach((f, i) => {
    parts.push(svgText(4, y1 + i * LH + 14, 'av-m', f))
  })
  return svgDoc(width, y1 + footer.length * LH + PAD, about, parts, style)
}


// ---------------------------------------------------------------------
// The set panel (Lex et al. 2014), shared by `sets` and `layers`

// One intersection column: the sets it lies in, and its elements, as
// shown.
type Column = { sig: boolean[], items: string[] }

type Panel = {
  header: string
  names: string[]
  sizes: number[]
  cols: Column[]
  // `sets` draws a bar per set and a bar per column; `layers` draws
  // the count instead.
  bars: boolean
  // The label of the degree-zero column, when there is one.
  none: string
  // How many columns come before these, on a page of a divided panel.
  first?: number
}


// Elements grouped by their exact membership signature; columns by
// degree descending, then cardinality descending, then signature (the
// names of the sets it lies in) in code-point order. Elements within a
// column in code-point order.
function columnsOf(
  names: string[], members: Map<string, Set<string>>, elements: string[],
  shown: (el: string) => string
): Column[] {
  const groups = new Map<string, Column>()
  const sorted = elements.slice().sort((a, b) => cmpCodePoint(shown(a), shown(b)))
  for (const el of sorted) {
    const sig = names.map((n) => (members.get(n) as Set<string>).has(el))
    const key = sig.map((b) => b ? '1' : '0').join('')
    const col = groups.get(key)
    if (undefined === col) {
      groups.set(key, { sig, items: [shown(el)] })
    }
    else {
      col.items.push(shown(el))
    }
  }
  const degree = (c: Column): number => c.sig.filter((b) => b).length
  const sigText = (c: Column): string =>
    names.filter((_n, i) => c.sig[i]).join(' ')
  return [...groups.values()].sort((a, b) =>
    degree(b) - degree(a) || b.items.length - a.items.length
    || cmpCodePoint(sigText(a), sigText(b)))
}


function renderPanel(p: Panel, style: ViewStyle): string {
  const paint = painter(style)
  const w = widest(p.names)
  const out: string[] = [paint('muted', p.header), '']
  const most = p.sizes.reduce((m, n) => Math.max(m, n), 0)
  p.names.forEach((n, i) => {
    // The bar is padded to `most` from its own length, so the pad is
    // written outside the painted run rather than counted inside it.
    const bar = '#'.repeat(p.sizes[i])
    out.push(pad(n, w) + '  ' +
      (p.bars ? paint('bar', bar) + ' '.repeat(most - bar.length) + '  ' : '') +
      paint('muted', String(p.sizes[i])))
  })
  out.push('')
  p.names.forEach((n, i) => {
    out.push(pad(n, w) + ' ' + paint('rule', '|') + ' ' +
      p.cols.map((c) => c.sig[i] ? paint('direct', '*') : paint('hole', '.'))
        .join(' '))
  })
  out.push(pad('', w) + ' ' + paint('rule', '+' + '-'.repeat(2 * p.cols.length)))
  if (p.bars) {
    const tallest = p.cols.reduce((m, c) => Math.max(m, c.items.length), 0)
    // The bars, tallest column first; a line ends at its last bar. The
    // trailing blanks are trimmed BEFORE painting, so an escape can
    // never be what the trim leaves behind.
    for (let h = tallest; 0 < h; h--) {
      const cells = p.cols.map((c) => h <= c.items.length ? ' #' : '  ')
        .join('').replace(/ +$/, '')
      out.push(pad('', w) + ' ' + paint('rule', '|') +
        cells.replace(/#/g, () => paint('bar', '#')))
    }
  }
  out.push(pad('', w) + '   ' +
    paint('muted', p.cols.map((c) => String(c.items.length)).join(' ')))
  out.push('')
  p.cols.forEach((c, i) => {
    const shown = 4 < c.items.length && !p.bars
      ? c.items.slice(0, 3).join(' ') + ' ...' : c.items.join(' ')
    out.push(paint('muted',
      `  col ${(p.first ?? 0) + i + 1}${p.bars ? '' : ` (${c.items.length})`}:`) +
      ` ${shown}` + (c.sig.some((b) => b) ? '' : paint('muted', p.none)))
  })
  return out.join('\n')
}


// The panel as SVG: the set sizes as bars, the intersections as a dot
// matrix (a filled dot where the set lies in the column), the column
// cardinalities as bars under it, and the columns' elements as text.
function panelSvg(p: Panel, about: string, style: ViewStyle): string {
  const w = widest(p.names)
  const most = p.sizes.reduce((m, n) => Math.max(m, n), 0)
  const parts: string[] = [svgText(4, 14, 'av-m', p.header)]
  const gx = w * CH + 8
  const yS = LH + 8
  p.names.forEach((n, i) => {
    const y = yS + i * LH
    parts.push(svgText(4, y + 14, 'av-t', n))
    if (p.bars) {
      parts.push(svgRect(gx, y + 3, p.sizes[i] * 10, 14, 'av-bar'))
    }
    parts.push(svgText(gx + (p.bars ? most * 10 + 8 : 0), y + 14, 'av-m',
      String(p.sizes[i])))
  })
  const yM = yS + p.names.length * LH + 8
  p.names.forEach((n, i) => {
    parts.push(svgText(4, yM + i * LH + 14, 'av-t', n))
    p.cols.forEach((c, ci) => {
      parts.push(`<circle cx="${gx + ci * 20 + 10}" cy="${yM + i * LH + 10}" r="5" ` +
        `class="${c.sig[i] ? 'av-dot' : 'av-hole'}"/>`)
    })
  })
  const yB = yM + p.names.length * LH + 4
  const tallest = p.cols.reduce((m, c) => Math.max(m, c.items.length), 0)
  parts.push(svgPath(`M${gx} ${yB}H${gx + p.cols.length * 20}`, 'av-line'))
  p.cols.forEach((c, ci) => {
    parts.push(svgRect(gx + ci * 20 + 4, yB, 12, c.items.length * 8, 'av-bar'))
    parts.push(svgText(gx + ci * 20 + 10, yB + tallest * 8 + 14, 'av-m',
      String(c.items.length), 'middle'))
  })
  const yI = yB + tallest * 8 + LH + 4
  const lines: string[] = []
  p.cols.forEach((c, i) => {
    const shown = 4 < c.items.length && !p.bars
      ? c.items.slice(0, 3).join(' ') + ' ...' : c.items.join(' ')
    lines.push(`col ${(p.first ?? 0) + i + 1}${p.bars ? '' : ` (${c.items.length})`}: ${shown}` +
      (c.sig.some((b) => b) ? '' : p.none))
  })
  lines.forEach((l, i) => {
    parts.push(svgText(4, yI + i * LH + 14, 'av-t', l))
  })
  const width = Math.max(gx + p.cols.length * 20,
    gx + (p.bars ? most * 10 + 8 : 0) + 3 * CH,
    4 + widest(lines) * CH, 4 + p.header.length * CH) + PAD
  return svgDoc(width, yI + lines.length * LH + PAD, about, parts, style)
}


// The panel, or with a budget its pages of at most that many columns,
// each numbering its columns as the whole panel does.
function panelFigure(
  panel: Panel, about: (cols: Column[]) => string,
  o: { as: ViewProfile, style: ViewStyle, budget?: number }
): Figure {
  const draw = (p: Panel): string => 'svg' === o.as
    ? panelSvg(p, about(p.cols), o.style) : renderPanel(p, o.style)
  const budget = o.budget ?? 0
  if (0 === budget) {
    return { text: draw(panel) }
  }
  const pages = 0 === panel.cols.length ? [{ name: '1', items: [] }]
    : budgeted([{ name: '', items: panel.cols }], budget)
  return joinParts(o.as, pages.map((page, i) => ({
    name: page.name, text: draw({ ...panel, cols: page.items, first: i * budget }),
  })))
}


// Elide the columns beyond `--max-cols`, counted. Zero means no limit,
// in both ports.
function elide(
  cols: Column[], maxCols: number | undefined, loss: ViewLoss[]
): Column[] {
  if (undefined === maxCols || 0 === maxCols || cols.length <= maxCols) {
    return cols
  }
  loss.push({ code: 'cols_elided', count: cols.length - maxCols })
  return cols.slice(0, maxCols)
}


// The generated value at a path, walked plainly: the panel reads
// `generate()`, never the Val tree.
function genAt(gen: any, path: string): any {
  let v = gen
  for (const part of pathParts(path)) {
    if (null == v || 'object' !== typeof v) {
      return undefined
    }
    v = v[part]
  }
  return v
}


function shapeFinding(path: string, message: string): VetFinding {
  return finding('view_sets_shape', 'reference', path, message)
}


const allStrings = (xs: any[]): boolean =>
  xs.every((x) => 'string' === typeof x)


function drawSets(
  gen: any,
  o: {
    sets: string, member: string, universe?: string,
    minDegree?: number, maxCols?: number, as: ViewProfile, style: ViewStyle,
    budget?: number,
  },
  max: number, loss: ViewLoss[]
): Figure {
  const family = genAt(gen, o.sets)
  if (null == family || 'object' !== typeof family || Array.isArray(family)) {
    return { errors: [shapeFinding(o.sets, 'The set family is not a map.')] }
  }
  const names = Object.keys(family).sort(cmpCodePoint)
  if (max < names.length) {
    return { errors: [rowsFinding(names.length, max, '--sets')] }
  }
  const members = new Map<string, Set<string>>()
  const elements = new Set<string>()
  for (const n of names) {
    const list = family[n]?.[o.member]
    if (!Array.isArray(list) || !allStrings(list)) {
      return {
        errors: [shapeFinding(`${o.sets}.${n}.${o.member}`,
          'A set\'s members must be a list of strings.')],
      }
    }
    members.set(n, new Set(list))
    for (const x of list) {
      elements.add(x)
    }
  }
  if (undefined !== o.universe) {
    // A universe MAP names its elements by ADDRESS -- `$.permissions`
    // holds `$.permissions.admin_all` -- which is what a member written
    // `path($.permissions.admin_all)` generates, so the two meet on the
    // path; a universe list names them as it lists them.
    const u = genAt(gen, o.universe)
    const all = Array.isArray(u) ? u
      : null != u && 'object' === typeof u
        ? Object.keys(u).map((k) => o.universe + '.' + k) : undefined
    if (undefined === all || !allStrings(all)) {
      return {
        errors: [shapeFinding(o.universe,
          'The universe must be a map or a list of strings.')],
      }
    }
    for (const x of all) {
      elements.add(x)
    }
  }
  // An element written as an address is shown by the shortest suffix
  // that tells it from every other address in the panel, as a node
  // is; one written as a plain string is shown as written.
  const addressed = [...elements].filter((x) => x.startsWith('$.')).sort(cmpCodePoint)
  const short = labelsOf(addressed)
  const shown = (x: string): string => short.get(x) ?? x
  let cols = columnsOf(names, members, [...elements], shown)
  if (undefined !== o.minDegree) {
    const least = o.minDegree
    cols = cols.filter((c) => least <= c.sig.filter((b) => b).length)
  }
  cols = elide(cols, o.maxCols, loss)
  // A set name or an element is a generated string, and a string can
  // hold a line terminator; no line of the panel can.
  const broken = [...names, ...elements].find(hasLineBreak)
  if (undefined !== broken) {
    return { errors: [lineBreakFinding(o.sets)] }
  }
  const panel: Panel = {
    header: `# upset  sets=${o.sets}(${names.length})  member=${o.member}` +
      `  elements=${elements.size}` +
      (undefined === o.universe ? '' : `  universe=${o.universe}`),
    names,
    sizes: names.map((n) => (members.get(n) as Set<string>).size),
    cols,
    bars: true,
    none: '   (in no set)',
  }
  return panelFigure(panel, (shown) => `Set panel over ${o.sets}: ` +
    `${names.length} sets, ${elements.size} elements, ` +
    `${shown.length} intersections`, o)
}


// The file a contribution names, as the panel shows it: relative to
// the entry document's directory, the entry itself by its own name.
function docName(file: string, entry: string | undefined): string {
  if ('' === file || file === entry) {
    return undefined === entry ? '-' : basename(entry)
  }
  return isAbsolute(file) && undefined !== entry
    ? relative(dirname(resolve(entry)), file) : file
}


function drawLayers(
  prov: Provenance, root: any, entry: string | undefined,
  o: {
    at?: string, minSize?: number, maxCols?: number, as: ViewProfile,
    style: ViewStyle, budget?: number,
  },
  max: number, loss: ViewLoss[]
): Figure {
  const members = new Map<string, Set<string>>()
  const paths: string[] = []
  const atParts = undefined === o.at ? [] : pathParts(o.at)
  for (const [key, rec] of prov.paths) {
    if (0 === rec.conjuncts.length || null == anchorAt(root, '$.' + key)) {
      continue
    }
    const parts = '' === key ? [] : key.split('.')
    if (atParts.some((p, i) => parts[i] !== p)) {
      continue
    }
    const shown = 0 === parts.length ? '$' : parts.join('.')
    paths.push(shown)
    for (const c of rec.conjuncts) {
      const d = docName(c.site.file, entry)
      let set = members.get(d)
      if (undefined === set) {
        set = new Set()
        members.set(d, set)
      }
      set.add(shown)
    }
  }
  const names = [...members.keys()].sort(cmpCodePoint)
  if (max < names.length) {
    return { errors: [rowsFinding(names.length, max, '--at')] }
  }
  let cols = columnsOf(names, members, paths, (p) => p)
  if (undefined !== o.minSize) {
    const least = o.minSize
    cols = cols.filter((c) => least <= c.items.length)
  }
  cols = elide(cols, o.maxCols, loss)
  const panel: Panel = {
    header: `# layers  file=${undefined === entry ? '-' : basename(entry)}` +
      `  documents=${names.length}  paths=${paths.length}`,
    names,
    sizes: names.map((n) => (members.get(n) as Set<string>).size),
    cols,
    bars: false,
    none: '',
  }
  return panelFigure(panel, (shown) => `Document layers: ` +
    `${names.length} documents, ${paths.length} paths, ` +
    `${shown.length} intersections`, o)
}


// ---------------------------------------------------------------------
// The meet ladder (VIEWS-ORDER.0.md)

function drawLadder(
  src: string, options: ViewOptions, as: ViewProfile, max: number
): Figure {
  if (undefined === options.at) {
    return {
      errors: [finding('view_at_required', 'reference', '$',
        'The ladder needs the path to draw; name it with --at.')],
    }
  }
  const rep = why(src, options.at,
    { path: options.path, trust: options.trust, textExt: options.textExt })
  if (undefined === rep.record) {
    return { errors: rep.findings }
  }
  const rungs = rep.record.conjuncts.slice().sort((a, b) =>
    (b.rank ?? 0) - (a.rank ?? 0)
    || cmpCodePoint(a.site.file, b.site.file)
    || a.site.row - b.site.row
    || a.site.col - b.site.col)
  if (max < rungs.length) {
    return { errors: [rowsFinding(rungs.length, max, 'a narrower --at')] }
  }
  const where = (c: WhyConjunct): string =>
    `${basename(c.site.file)}:${c.site.row}:${c.site.col}`

  const out: string[] = []
  if ('mermaid' === as) {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('graph TD', '  any(("any"))')
    rungs.forEach((c, i) => {
      out.push(`  c${i}["${esc(c.canon)}<br/>${c.role} | ${esc(where(c))}"]`)
    })
    out.push(`  val{{"${esc(rep.record.value)}"}}`)
    let prev = 'any'
    rungs.forEach((_c, i) => {
      out.push(`  ${prev} --> c${i}`)
      prev = `c${i}`
    })
    out.push(`  ${prev} --> val`)
  }
  else {
    const esc = (s: string): string => escape(s, DOT_ESC)
    out.push('digraph G {', '  rankdir=TB;', '  node [shape=box];',
      '  any [shape=circle, label="any"];')
    rungs.forEach((c, i) => {
      out.push(
        `  c${i} [label="${esc(c.canon)}\\n${c.role} | ${esc(where(c))}"];`)
    })
    out.push(`  val [shape=hexagon, label="${esc(rep.record.value)}"];`)
    let prev = 'any'
    rungs.forEach((_c, i) => {
      out.push(`  ${prev} -> c${i};`)
      prev = `c${i}`
    })
    out.push(`  ${prev} -> val;`, '}')
  }
  return { text: out.join('\n') }
}


// ---------------------------------------------------------------------
// The subsumption poset (VIEWS-ORDER.0.md)

export type ViewPosetDoc = { src: string, path?: string, label: string }
type Doc = ViewPosetDoc
type Cls = { members: number[], label: string }


export type ViewCompare = (
  general: Doc, specific: Doc, options: ViewOptions
) => { verdict: string, code: string }

const compareBySubsume: ViewCompare = (general, specific, options) => {
  const r = subsume(general.src, specific.src, {
    at: options.at, profile: options.profile,
    generalPath: general.path, specificPath: specific.path,
    trust: options.trust, textExt: options.textExt,
  })
  return { verdict: r.verdict, code: r.findings[0]?.code ?? 'undecided' }
}

function drawPoset(
  docs: Doc[], options: ViewOptions, as: ViewProfile, max: number,
  loss: ViewLoss[], compare: ViewCompare
): Figure {
  const n = docs.length
  const verdict: string[][] = docs.map(() => docs.map(() => 'subsumes'))
  const code: string[][] = docs.map(() => docs.map(() => ''))
  let broken = false
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) {
        continue
      }
      const r = compare(docs[a], docs[b], options)
      verdict[a][b] = r.verdict
      code[a][b] = r.code
      broken = broken || 'error' === r.verdict
    }
  }
  if (broken) {
    return { errors: docs.flatMap((d) => docFailure(d, options)) }
  }
  const ge = (a: number, b: number): boolean => 'subsumes' === verdict[a][b]

  // Quotient by mutual subsumption; class labels joined by ` = `.
  const classes: Cls[] = []
  for (let i = 0; i < n; i++) {
    const found = classes.find((c) =>
      ge(i, c.members[0]) && ge(c.members[0], i))
    if (undefined === found) {
      classes.push({ members: [i], label: '' })
    }
    else {
      found.members.push(i)
    }
  }
  for (const c of classes) {
    c.members.sort((x, y) => cmpCodePoint(docs[x].label, docs[y].label))
    c.label = c.members.map((m) => docs[m].label).join(' = ')
  }
  classes.sort((x, y) => cmpCodePoint(x.label, y.label))
  if (max < classes.length) {
    return { errors: [rowsFinding(classes.length, max, 'fewer documents')] }
  }
  for (const c of classes) {
    if (hasLineBreak(c.label)) {
      return { errors: [lineBreakFinding('$')] }
    }
  }

  // closure[lo][hi]: hi subsumes lo, directly or by transitivity.
  const k = classes.length
  const rep = (ci: number): number => classes[ci].members[0]
  const closure: boolean[][] = classes.map((_x, lo) =>
    classes.map((_y, hi) => lo !== hi && ge(rep(hi), rep(lo))))
  for (let m = 0; m < k; m++) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (closure[i][m] && closure[m][j]) {
          closure[i][j] = true
        }
      }
    }
  }

  const covers: [number, number][] = []
  const intransitive: string[] = []
  for (let lo = 0; lo < k; lo++) {
    for (let hi = 0; hi < k; hi++) {
      if (!closure[lo][hi]) {
        continue
      }
      if ('does_not_subsume' === verdict[rep(hi)][rep(lo)]) {
        intransitive.push(`${classes[lo].label} < ${classes[hi].label}`)
      }
      const viaMid = classes.some((_c, mid) =>
        mid !== lo && mid !== hi && closure[lo][mid] && closure[mid][hi])
      if (!viaMid) {
        covers.push([lo, hi])
      }
    }
  }
  if (0 < intransitive.length) {
    loss.push({
      code: 'order_intransitive', count: intransitive.length,
      detail: intransitive,
    })
  }

  // An undecided pair with no proven order either way is a DASHED edge
  // in the queried direction, labelled with the reason; one proven one
  // way and undecided the other keeps its solid edge and is reported,
  // since the two may be equal and the checker cannot tell.
  const dashed: [number, number, string][] = []
  const maybeEqual: string[] = []
  for (let g = 0; g < k; g++) {
    for (let s = 0; s < k; s++) {
      if (g === s || 'undecided' !== verdict[rep(g)][rep(s)]) {
        continue
      }
      if (closure[s][g] || closure[g][s]) {
        maybeEqual.push(`${classes[s].label} ~ ${classes[g].label}`)
      }
      else {
        dashed.push([s, g, code[rep(g)][rep(s)]])
      }
    }
  }
  if (0 < dashed.length) {
    loss.push({
      code: 'order_undecided', count: dashed.length,
      detail: dashed.map(([s, g, c]) =>
        `${classes[s].label} ~ ${classes[g].label} (${c})`),
    })
  }
  if (0 < maybeEqual.length) {
    loss.push({
      code: 'order_maybe_equal', count: maybeEqual.length, detail: maybeEqual,
    })
  }

  const head = 'aontu subsumption poset' +
    (undefined === options.at ? '' : `  at=${options.at}`) +
    `  profile=${options.profile ?? 'defaults'}` +
    `  documents=${n}  nodes=${k}`
  const out: string[] = []
  if ('mermaid' === as) {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('%% ' + head, 'graph BT')
    classes.forEach((c, i) => {
      out.push(`  n${i}["${esc(c.label)}"]`)
    })
    for (const [lo, hi] of covers) {
      out.push(`  n${lo} --> n${hi}`)
    }
    for (const [s, g, c] of dashed) {
      out.push(`  n${s} -.->|"${esc(c)}"| n${g}`)
    }
  }
  else {
    const esc = (s: string): string => escape(s, DOT_ESC)
    out.push('// ' + head, 'digraph G {', '  rankdir=BT;', '  node [shape=box];')
    classes.forEach((c, i) => {
      out.push(`  n${i} [label="${esc(c.label)}"];`)
    })
    for (const [lo, hi] of covers) {
      out.push(`  n${lo} -> n${hi};`)
    }
    for (const [s, g, c] of dashed) {
      out.push(`  n${s} -> n${g} [style=dashed, label="${esc(c)}"];`)
    }
    out.push('}')
  }
  return { text: out.join('\n') }
}


// Why a poset could not be drawn: the documents that do not stand up
// on their own, each with its own finding, or the anchor a document
// lacks.
// ---------------------------------------------------------------------
// The lifecycle: states and the events between them

function drawState(
  triples: Triple[], root: any,
  o: {
    relations: string[], label?: string, as: ViewProfile,
    members: string[], ghosts: Ghosts, roots: string[], named: boolean,
  },
  max: number, loss: ViewLoss[]
): Figure {
  const keys = keysOf(triples)
  for (const r of o.relations) {
    if (!keys.includes(r)) {
      return { errors: [relationFinding(r, keys)] }
    }
  }
  const edges = 0 === o.relations.length
    ? triples : triples.filter((e) => o.relations.includes(e.key))
  const paths = graphPaths(edges, o.members)
  if (max < paths.length) {
    return { errors: [rowsFinding(paths.length, max, '--at or --relation', true)] }
  }
  for (const r of o.roots) {
    if (!paths.includes(r) || o.ghosts.has(r)) {
      return { errors: [rootFinding(r, undefined, paths)] }
    }
  }
  const unresolved: Unresolved = []
  const built = graphNodes(paths, root, { label: o.label }, o.ghosts, unresolved)
  if (undefined !== built.error) {
    return { errors: [built.error] }
  }
  unresolvedLoss(unresolved, loss)
  const nodes = (built.nodes as GNode[]).slice().sort((a, b) =>
    cmpCodePoint(a.label, b.label) || cmpCodePoint(a.path, b.path))
  const byPath = new Map<string, GNode>(nodes.map((n) => [n.path, n]))
  const node = (p: string): GNode => byPath.get(p) as GNode

  // An initial state is one named as a root, or else one no other
  // state enters; a final state one that leaves to no other. A ghost is
  // neither: its own edges are drawn where it lives.
  const real = nodes.filter((n) => true !== n.ghost)
  const initial = real.filter((n) => o.named
    ? o.roots.includes(n.path)
    : !edges.some((e) => e.to === n.path && e.from !== n.path))
  const final = real.filter((n) =>
    !edges.some((e) => e.from === n.path && e.to !== n.path))
  const drawn = edges.slice().sort((a, b) =>
    cmpCodePoint(node(a.from).label, node(b.from).label)
    || cmpCodePoint(a.key, b.key)
    || cmpCodePoint(node(a.to).label, node(b.to).label))

  const out: string[] = []
  if ('mermaid' === o.as) {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('stateDiagram-v2')
    for (const n of nodes) {
      out.push(`  state "${esc(n.label)}" as ${n.id}`)
    }
    for (const n of initial) {
      out.push(`  [*] --> ${n.id}`)
    }
    for (const e of drawn) {
      out.push(`  ${node(e.from).id} --> ${node(e.to).id} : ${esc(e.key)}`)
    }
    for (const n of final) {
      out.push(`  ${n.id} --> [*]`)
    }
  }
  else {
    for (const n of initial) {
      out.push(`[*] --> ${n.label}`)
    }
    for (const e of drawn) {
      out.push(`${node(e.from).label} --${e.key}--> ${node(e.to).label}`)
    }
    for (const n of final) {
      out.push(`${n.label} --> [*]`)
    }
  }
  return { text: out.join('\n') }
}


// ---------------------------------------------------------------------
// The swim lanes: a flow's steps, one lane per actor

function drawLane(
  triples: Triple[], root: any,
  o: {
    relations: string[], groupBy?: string, label?: string, layers: string[],
    as: ViewProfile, members: string[], ghosts: Ghosts, counts?: boolean,
    countBy?: string,
  },
  max: number, loss: ViewLoss[]
): Figure {
  if (undefined === o.groupBy) {
    return {
      errors: [finding('view_group_required', 'reference', '$',
        'The swim lanes need the field that names each step\'s lane; ' +
        'name it with --group-by.')],
    }
  }
  const keys = keysOf(triples)
  for (const r of o.relations) {
    if (!keys.includes(r)) {
      return { errors: [relationFinding(r, keys)] }
    }
  }
  const edges = 0 === o.relations.length
    ? triples : triples.filter((e) => o.relations.includes(e.key))
  const paths = graphPaths(edges, o.members)
  if (max < paths.length) {
    return { errors: [rowsFinding(paths.length, max, '--at or --relation', true)] }
  }
  const unresolved: Unresolved = []
  const built = graphNodes(paths, root, o, o.ghosts, unresolved)
  if (undefined !== built.error) {
    return { errors: [built.error] }
  }
  const nodes = built.nodes as GNode[]
  const byPath = new Map<string, GNode>(nodes.map((n) => [n.path, n]))
  const node = (p: string): GNode => byPath.get(p) as GNode

  // The steps in flow order: a step is placed once every step leading
  // to it is, least label first; a loop is entered at its least label,
  // and the edge that closes it runs back.
  const label = (p: string): string => node(p).label
  const byLabel = (a: string, b: string): number =>
    cmpCodePoint(label(a), label(b)) || cmpCodePoint(a, b)
  const steps: string[] = []
  const placed = new Set<string>()
  const waiting = paths.slice().sort(byLabel)
  while (steps.length < paths.length) {
    const free = waiting.find((p) => !placed.has(p) && edges.every((e) =>
      e.to !== p || e.from === p || placed.has(e.from))) ??
      waiting.find((p) => !placed.has(p)) as string
    placed.add(free)
    steps.push(free)
  }

  const lane = (n: GNode): string => n.group ?? '-'
  const seen = [...new Set(steps.map((p) => lane(node(p))))]
  const named = o.layers.filter((g, i) =>
    seen.includes(g) && i === o.layers.indexOf(g))
  const order = [
    ...named,
    ...seen.filter((g) => !named.includes(g) && '-' !== g),
    ...seen.filter((g) => '-' === g && !named.includes(g)),
  ]
  const lanes = order.map((g, gi) => {
    const members = steps.map(node).filter((n) => lane(n) === g)
    return {
      id: `g${gi}`, name: g,
      title: groupTitle(g, members, root, o, unresolved), nodes: members,
    }
  })
  const broken = lanes.find((l) => hasLineBreak(l.title))
  if (undefined !== broken) {
    return { errors: [lineBreakFinding(broken.nodes[0].path)] }
  }
  unresolvedLoss(unresolved, loss)
  const across = edges.filter((e) => lane(node(e.from)) !== lane(node(e.to)))
  const at = new Map<string, number>(steps.map((p, i) => [p, i]))
  const drawn = edges.slice().sort((a, b) =>
    (at.get(a.from) as number) - (at.get(b.from) as number)
    || (at.get(a.to) as number) - (at.get(b.to) as number)
    || cmpCodePoint(a.key, b.key))

  if ('mermaid' === o.as) {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    const out = ['flowchart LR']
    for (const l of lanes) {
      out.push(`  subgraph ${l.id}["${esc(l.title)}"]`, '    direction LR')
      for (const n of l.nodes) {
        out.push(`    ${n.id}["${esc(n.label)}"]`)
      }
      out.push('  end')
    }
    for (const e of drawn) {
      out.push(`  ${node(e.from).id} -->|"${esc(e.key)}"| ${node(e.to).id}`)
    }
    return { text: out.join('\n') }
  }

  // One row per lane and one column per step, so each step is alone in
  // its column and the grid needs no placement beyond the flow order.
  const w = widest(lanes.map((l) => l.title))
  const cols = steps.map((p, i) =>
    Math.max(node(p).label.length, String(i + 1).length))
  const cell = (s: string, i: number): string => pad(s, cols[i])
  const trim = (s: string): string => s.replace(/ +$/, '')
  const out = [trim(pad('', w) + '  ' +
    steps.map((_p, i) => cell(String(i + 1), i)).join('  '))]
  for (const l of lanes) {
    out.push(trim(pad(l.title, w) + '  ' + steps.map((p, i) =>
      cell(lane(node(p)) === l.name ? node(p).label : '.', i)).join('  ')))
  }
  const back = drawn.filter((e) =>
    (at.get(e.to) as number) <= (at.get(e.from) as number))
  out.push(`# ${drawn.length} edges, ${across.length} across lanes, ` +
    `${back.length} back`)
  for (const e of drawn.filter((d) => across.includes(d) || back.includes(d))) {
    out.push(`# ${back.includes(e) ? 'back' : 'across'}: ` +
      `${node(e.from).label} -> ${node(e.to).label} (${e.key})`)
  }
  return { text: out.join('\n') }
}


// ---------------------------------------------------------------------
// The sequence: who sends what to whom, in the order the steps list it

function drawSequence(
  list: any,
  o: {
    at: string, from: string, to: string, label?: string, as: ViewProfile,
    splitBy?: string, budget?: number,
  },
  max: number, loss: ViewLoss[]
): Figure {
  if (!Array.isArray(list)) {
    return {
      errors: [finding('view_steps_shape', 'reference', o.at,
        `${o.at} is not a list of steps.`)],
    }
  }
  const splitting = undefined !== o.splitBy || 0 < (o.budget ?? 0)
  if (!splitting && max < list.length) {
    return { errors: [rowsFinding(list.length, max, '--steps', true)] }
  }
  const unresolved: Unresolved = []
  type Msg = { a: string, b: string, text: string, part?: string }
  const msgs: Msg[] = []
  for (let i = 0; i < list.length; i++) {
    const step = list[i]
    const at = `${o.at}.${i}`
    const a = step?.[o.from]
    const b = step?.[o.to]
    if ('string' !== typeof a || 'string' !== typeof b) {
      return {
        errors: [finding('view_steps_shape', 'reference', at,
          `A step needs a string at ${o.from} and at ${o.to}.`)],
      }
    }
    let text = ''
    if (undefined !== o.label) {
      const t = step[o.label]
      if ('string' === typeof t) {
        text = t
      }
      else {
        unresolved.push(at + '.' + o.label)
      }
    }
    let part: string | undefined
    if (undefined !== o.splitBy) {
      const v = step[o.splitBy]
      if ('string' === typeof v) {
        part = v
      }
      else {
        unresolved.push(at + '.' + o.splitBy)
      }
    }
    if (hasLineBreak(a) || hasLineBreak(b) || hasLineBreak(text) ||
      hasLineBreak(part ?? '')) {
      return { errors: [lineBreakFinding(at)] }
    }
    msgs.push({ a, b, text, part })
  }
  unresolvedLoss(unresolved, loss)

  // Participants in order of first appearance; an address is shown by
  // its shortest unique suffix, as every other figure shows a node. A
  // part draws the participants of its own steps, in the same order.
  const who = [...new Set(msgs.flatMap((m) => [m.a, m.b]))]
  const lab = labelsOf(who.filter((p) => p.startsWith('$')))
  const name = (p: string): string => lab.get(p) ?? p
  const ix = new Map<string, number>(who.map((p, i) => [p, i]))

  const render = (steps: Msg[]): string => {
    const mine = who.filter((p) => steps.some((m) => m.a === p || m.b === p))
    if ('mermaid' === o.as) {
      const esc = (s: string): string => escape(s, MERMAID_ESC)
      const out = ['sequenceDiagram']
      for (const p of mine) {
        out.push(`  participant p${ix.get(p)} as ${esc(name(p))}`)
      }
      for (const m of steps) {
        out.push(`  p${ix.get(m.a)}->>p${ix.get(m.b)}:` +
          ('' === m.text ? '' : ' ' + esc(m.text)))
      }
      return out.join('\n')
    }
    return sequenceText(mine.map(name), steps.map((m) => ({
      a: mine.indexOf(m.a), b: mine.indexOf(m.b), text: m.text,
    })))
  }
  if (!splitting) {
    return { text: render(msgs) }
  }
  const names = [...new Set(msgs.filter((m) => undefined !== m.part)
    .map((m) => m.part as string))].sort(cmpCodePoint)
  const base = undefined === o.splitBy ? [{ name: '', items: msgs }]
    : names.map((n) => ({ name: n, items: msgs.filter((m) => n === m.part) }))
  const parts: ViewPart[] = []
  for (const part of budgeted(base, o.budget ?? 0)) {
    if (max < part.items.length) {
      return { errors: [rowsFinding(part.items.length, max, '--steps', true)] }
    }
    parts.push({ name: part.name, text: render(part.items) })
  }
  return joinParts(o.as, parts)
}


// THE LIFELINE GRID. Lifeline i sits at column x[i]; each gap is wide
// enough for the name above it and for every message spanning it, the
// shortfall of a span going to its last gap, so the counts alone set
// the columns.
function sequenceText(
  names: string[], msgs: { a: number, b: number, text: string }[]
): string {
  const n = names.length
  if (0 === n) {
    return ''
  }
  const len = (s: string): number => [...s].length
  const gap = names.map((s) => Math.max(len(s) + 2, 3))
  const x = (): number[] => {
    const xs = [0]
    for (let i = 1; i < n; i++) {
      xs.push(xs[i - 1] + gap[i - 1])
    }
    return xs
  }
  const spans = msgs.map((m) => m.a === m.b
    ? { lo: m.a, hi: m.a + 1, need: len(m.text) + 6 }
    : {
      lo: Math.min(m.a, m.b), hi: Math.max(m.a, m.b),
      need: len(m.text) + 5,
    })
    .filter((s) => s.hi < n)
    .sort((p, q) => p.hi - q.hi || p.lo - q.lo)
  for (const s of spans) {
    const xs = x()
    const short = s.need - (xs[s.hi] - xs[s.lo])
    if (0 < short) {
      gap[s.hi - 1] += short
    }
  }
  const xs = x()
  const width = xs[n - 1] + Math.max(len(names[n - 1]),
    1 + msgs.reduce((w, m) => m.a === m.b && m.a === n - 1
      ? Math.max(w, len(m.text) + 5) : w, 0))
  const blank = (): string[] => {
    const row = Array(width).fill(' ')
    for (const c of xs) {
      row[c] = '│'
    }
    return row
  }
  const put = (row: string[], at: number, s: string): void => {
    [...s].forEach((ch, i) => { row[at + i] = ch })
  }
  const line = (row: string[]): string => row.join('').replace(/ +$/, '')
  const head = Array(width).fill(' ')
  names.forEach((s, i) => put(head, xs[i], s))
  const out = [line(head), line(blank())]
  for (const m of msgs) {
    const label = '' === m.text ? '' : ` ${m.text} `
    if (m.a === m.b) {
      const top = blank()
      const back = blank()
      put(top, xs[m.a], '├─' + label + '─┐')
      put(back, xs[m.a], '│◄' + '─'.repeat(len(label) + 1) + '┘')
      out.push(line(top), line(back))
      continue
    }
    const row = blank()
    const lo = Math.min(m.a, m.b)
    const hi = Math.max(m.a, m.b)
    const span = xs[hi] - xs[lo] - 1
    if (m.a < m.b) {
      const body = '─' + label
      put(row, xs[lo], '├' + body + '─'.repeat(span - len(body) - 1) + '►')
    }
    else {
      const body = '◄─' + label
      put(row, xs[lo] + 1, body + '─'.repeat(span - len(body)))
      row[xs[hi]] = '┤'
    }
    out.push(line(row))
  }
  out.push(line(blank()))
  return out.join('\n')
}


// ---------------------------------------------------------------------
// The treemap: the model's bulk, nested

type Tile = { name: string, weight: number, kids: Tile[] }

const TREEMAP_BAR = 40

// A container weighs the scalar leaves under it, however deep.
function leafWeight(v: any): number {
  const kids = docKids(v)
  if (0 === kids.length) {
    const node = throughDoc(v)
    return true === node.isMap || true === node.isList ? 0 : 1
  }
  return kids.reduce((w, k) =>
    w + leafWeight(throughDoc(throughDoc(v).peg[k])), 0)
}


// The tiles of a treemap, pruned of what weighs nothing. `only` keeps
// the items (the anchor's children, or the members) a part holds.
function treemapTop(
  root: any,
  o: {
    at?: string, depth?: number, groupBy?: string, size?: string,
    members: string[] | undefined, only?: string[],
  },
  loss: ViewLoss[]
): { top?: Tile, error?: VetFinding } {
  const at = o.at ?? '$'
  const anchor = anchorAt(root, at)
  if (null == anchor) {
    return {
      error: finding('no_path', 'reference', at,
        `The path ${at} names nothing in this document.`),
    }
  }
  const unresolved: Unresolved = []
  const weigh = (path: string, v: any): number => {
    if (undefined === o.size) {
      return leafWeight(v)
    }
    const field: any = anchorAt(root, path + '.' + o.size)
    const n = null == field ? undefined : throughDoc(field).peg
    if (!Number.isSafeInteger(n) || 0 > (n as number)) {
      unresolved.push(path + '.' + o.size)
      return 0
    }
    return n
  }
  // With --size, a node holding the field is a tile weighed by it.
  const holds = (path: string): boolean =>
    undefined !== o.size && null != anchorAt(root, path + '.' + o.size)
  const kept = (path: string): boolean =>
    undefined === o.only || o.only.includes(path)
  const tile = (path: string, v: any, depth: number, first: boolean): Tile => {
    const kids = docKids(v).filter((k) => !first || kept(path + '.' + k))
    const name = path.slice(path.lastIndexOf('.') + 1)
    if (0 === depth || 0 === kids.length || holds(path)) {
      return { name, weight: weigh(path, v), kids: [] }
    }
    const inner = kids.map((k) =>
      tile(path + '.' + k, throughDoc(throughDoc(v).peg[k]), depth - 1, false))
    return {
      name, kids: inner, weight: inner.reduce((w, t) => w + t.weight, 0),
    }
  }

  // The items: the members asked for, or the anchor's children.
  const items: string[] = (o.members ??
    docKids(anchor).map((k) => at + '.' + k)).filter(kept)
  let top: Tile
  if (undefined === o.groupBy && undefined === o.members) {
    top = tile(at, anchor, o.depth || DEFAULT_DOC_DEPTH, true)
    top.name = at
  }
  else {
    const lab = labelsOf(items)
    const leaves = items.map((p) => ({
      name: lab.get(p) as string, kids: [] as Tile[],
      weight: weigh(p, anchorAt(root, p)),
      group: undefined === o.groupBy ? undefined : fieldOf(root, p, o.groupBy),
      path: p,
    }))
    let kids: Tile[] = leaves
    if (undefined !== o.groupBy) {
      for (const l of leaves.filter((l) => undefined === l.group)) {
        unresolved.push(l.path + '.' + o.groupBy)
      }
      const names = [...new Set(leaves.map((l) => l.group ?? '-'))]
        .sort(cmpCodePoint)
      kids = names.map((g) => {
        const inner = leaves.filter((l) => (l.group ?? '-') === g)
        return {
          name: g, kids: inner, weight: inner.reduce((w, t) => w + t.weight, 0),
        }
      })
    }
    top = { name: at, kids, weight: kids.reduce((w, t) => w + t.weight, 0) }
  }
  unresolvedLoss(unresolved, loss)

  // A tile that weighs nothing has no area to draw, and is counted.
  let empty = 0
  const prune = (t: Tile): Tile => {
    const kids = t.kids.filter((k) => {
      if (0 === k.weight) {
        empty++
      }
      return 0 < k.weight
    }).map(prune)
    return { ...t, kids }
  }
  top = prune(top)
  if (0 < empty) {
    loss.push({ code: 'treemap_empty', count: empty })
  }
  return { top }
}


// A treemap drawn from its top tile. A part below the top is drawn as
// one section, so Mermaid shows where it sits.
function treemapFigure(
  top: Tile, at: string, o: { as: ViewProfile, style: ViewStyle },
  max: number, wrap: boolean
): Figure {
  type Row = { prefix: string, name: string, weight: number }
  const rows: Row[] = []
  const walk = (t: Tile, prefix: string, kidPrefix: string): void => {
    rows.push({ prefix, name: t.name, weight: t.weight })
    t.kids.forEach((k, i) => {
      const last = i === t.kids.length - 1
      walk(k, kidPrefix + (last ? '└── ' : '├── '),
        kidPrefix + (last ? '    ' : '│   '))
    })
  }
  walk(top, '', '')
  if (max < rows.length) {
    return { errors: [rowsFinding(rows.length, max, '--at or --depth', true)] }
  }
  for (const r of rows) {
    if (hasLineBreak(r.name)) {
      return { errors: [lineBreakFinding(at)] }
    }
  }

  if ('mermaid' === o.as) {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    const out = ['treemap-beta']
    const emit = (t: Tile, depth: number): void => {
      const ind = '    '.repeat(depth)
      out.push(0 === t.kids.length
        ? `${ind}"${esc(t.name)}": ${t.weight}`
        : `${ind}"${esc(t.name)}"`)
      for (const k of t.kids) {
        emit(k, depth + 1)
      }
    }
    for (const k of wrap || (0 === top.kids.length && 0 < top.weight)
      ? [top] : top.kids) {
      emit(k, 0)
    }
    return { text: out.join('\n') }
  }
  const paint = painter(o.style)
  const total = top.weight
  const w = widest(rows.map((r) => r.prefix + r.name))
  const nw = widest(rows.map((r) => String(r.weight)))
  return {
    text: rows.map((r) => {
      const bar = 0 === total ? 0
        : Math.max(1, Math.floor(r.weight * TREEMAP_BAR / total))
      return paint('rule', r.prefix) + r.name +
        ' '.repeat(w - (r.prefix + r.name).length) + '  ' +
        lpad(String(r.weight), nw) + '  ' + paint('bar', '█'.repeat(bar))
    }).join('\n'),
  }
}


function drawTreemap(
  root: any,
  o: {
    at?: string, depth?: number, groupBy?: string, size?: string,
    members: string[] | undefined, as: ViewProfile, style: ViewStyle,
  },
  max: number, loss: ViewLoss[]
): Figure {
  const built = treemapTop(root, o, loss)
  if (undefined !== built.error) {
    return { errors: [built.error] }
  }
  return treemapFigure(built.top as Tile, o.at ?? '$', o, max, false)
}


// ---------------------------------------------------------------------
// The split of a figure drawn as a tree of rows: the document and the
// treemap

type HNode = { name: string, kids: HNode[] }

// A part of a row tree: below the anchor its chain of names reaches,
// the anchor's children it keeps.
type HBase = { name: string, top: HNode, keys: string[] }
type HPart = HBase & { chain: string[] }

function hRows(n: HNode): number {
  return 1 + n.kids.reduce((r, k) => r + hRows(k), 0)
}


// The document's own rows as a tree: `depth` levels of key below `v`.
function docTree(v: any, name: string, depth: number): HNode {
  return {
    name,
    kids: 0 === depth ? [] : docKids(v).map((k) =>
      docTree(throughDoc(throughDoc(v).peg[k]), k, depth - 1)),
  }
}


// The bases a row tree divides into: one per value of a field of the
// top's children, one per child, or the whole.
function hBases(
  top: HNode, o: { splitBy?: string, splitRoots?: boolean },
  path: (key: string) => string, root: any, loss: ViewLoss[]
): HBase[] {
  const keys = top.kids.map((k) => k.name)
  if (undefined !== o.splitBy) {
    const field = o.splitBy
    const unresolved: Unresolved = []
    const of = new Map<string, string[]>()
    for (const k of keys) {
      const v = fieldOf(root, path(k), field)
      if (undefined === v) {
        unresolved.push(path(k) + '.' + field)
        continue
      }
      of.set(v, [...(of.get(v) ?? []), k])
    }
    addUnresolved(loss, unresolved)
    return [...of.keys()].sort(cmpCodePoint)
      .map((name) => ({ name, top, keys: of.get(name) as string[] }))
  }
  return true === o.splitRoots
    ? keys.map((k) => ({ name: k, top, keys: [k] }))
    : [{ name: '', top, keys }]
}


// Each base packed into parts of at most `budget` rows below their
// anchor: whole subtrees side by side, and a subtree too big for one
// part opened, its children packed under it in turn.
function packRows(bases: HBase[], budget: number): HPart[] {
  const out: HPart[] = []
  for (const b of bases) {
    if (0 === budget) {
      out.push({ ...b, chain: [] })
      continue
    }
    const units: { chain: string[], node: HNode }[] = []
    const add = (chain: string[], node: HNode): void => {
      if (hRows(node) <= budget) {
        units.push({ chain, node })
        return
      }
      for (const k of node.kids) {
        add([...chain, node.name], k)
      }
    }
    for (const k of b.top.kids.filter((k) => b.keys.includes(k.name))) {
      add([], k)
    }
    const packs: { chain: string[], keys: string[], used: number }[] = []
    for (const u of units) {
      const last = packs[packs.length - 1]
      const r = hRows(u.node)
      if (undefined !== last && last.used + r <= budget &&
        last.chain.join(SEP) === u.chain.join(SEP)) {
        last.keys.push(u.node.name)
        last.used += r
      }
      else {
        packs.push({ chain: u.chain, keys: [u.node.name], used: r })
      }
    }
    packs.forEach((p, i) => out.push({
      name: '' === b.name ? String(i + 1)
        : 1 === packs.length ? b.name : `${b.name}.${i + 1}`,
      top: b.top, keys: p.keys, chain: p.chain,
    }))
  }
  return out
}


function drawDocParts(
  root: any,
  o: {
    at?: string, depth?: number, as: ViewProfile, style: ViewStyle,
    splitBy?: string, splitRoots?: boolean, budget?: number,
  },
  max: number, loss: ViewLoss[]
): Figure {
  const whole = drawDoc(root, o, Infinity, loss)
  if (undefined !== whole.errors) {
    return whole
  }
  const at = o.at ?? '$'
  const depth = o.depth || DEFAULT_DOC_DEPTH
  const top = docTree(anchorAt(root, at), at, depth)
  const cut = packRows(hBases(top, o, (k) => at + '.' + k, root, loss),
    o.budget ?? 0)
  const parts: ViewPart[] = []
  for (const part of cut) {
    if (hasLineBreak(part.name)) {
      return { errors: [lineBreakFinding(at + '.' + part.keys[0])] }
    }
    const fig = drawDoc(root, {
      ...o, chain: part.chain, depth: depth - part.chain.length, only: part.keys,
    }, max, [])
    if (undefined !== fig.errors) {
      return fig
    }
    parts.push({ name: part.name, text: fig.text as string })
  }
  return joinParts(o.as, parts)
}


function drawTreemapParts(
  root: any,
  o: {
    at?: string, depth?: number, groupBy?: string, size?: string,
    members: string[] | undefined, as: ViewProfile, style: ViewStyle,
    splitBy?: string, splitRoots?: boolean, budget?: number,
  },
  max: number, loss: ViewLoss[]
): Figure {
  const whole = drawTreemap(root, o, Infinity, loss)
  if (undefined !== whole.errors) {
    return whole
  }
  const at = o.at ?? '$'
  const top = treemapTop(root, o, []).top as Tile
  let bases: HBase[]
  if (undefined === o.splitBy) {
    bases = hBases(top, o, (k) => k, root, loss)
  }
  else {
    // A part by a field is the treemap of the items holding its value,
    // grouped and weighed afresh.
    const field = o.splitBy
    const items = o.members ??
      docKids(anchorAt(root, at)).map((k) => at + '.' + k)
    const unresolved: Unresolved = []
    const of = new Map<string, string[]>()
    for (const p of items) {
      const v = fieldOf(root, p, field)
      if (undefined === v) {
        unresolved.push(p + '.' + field)
        continue
      }
      of.set(v, [...(of.get(v) ?? []), p])
    }
    addUnresolved(loss, unresolved)
    bases = [...of.keys()].sort(cmpCodePoint).map((name) => {
      const mine = treemapTop(root, { ...o, only: of.get(name) }, []).top as Tile
      return { name, top: mine, keys: mine.kids.map((k) => k.name) }
    })
  }
  const parts: ViewPart[] = []
  for (const part of packRows(bases, o.budget ?? 0)) {
    if (hasLineBreak(part.name)) {
      return { errors: [lineBreakFinding(at)] }
    }
    let node = part.top as Tile
    for (const name of part.chain) {
      node = node.kids.find((k) => k.name === name) as Tile
    }
    const kids = node.kids.filter((k) => part.keys.includes(k.name))
    const fig = treemapFigure({
      name: [part.top.name, ...part.chain].join('.'), kids,
      weight: kids.reduce((w, t) => w + t.weight, 0),
    }, at, o, max, 0 < part.chain.length)
    if (undefined !== fig.errors) {
      return fig
    }
    parts.push({ name: part.name, text: fig.text as string })
  }
  return joinParts(o.as, parts)
}


// ---------------------------------------------------------------------
// Selection by membership, and the split into parts

// Each part cut into runs of at most `budget` items: an unnamed part's
// runs are numbered, and a named one keeps its name while it fits.
function budgeted<T>(
  parts: { name: string, items: T[] }[], budget: number
): { name: string, items: T[] }[] {
  if (0 === budget) {
    return parts
  }
  const out: { name: string, items: T[] }[] = []
  for (const part of parts) {
    const n = Math.ceil(part.items.length / budget)
    for (let i = 0; i < n; i++) {
      out.push({
        name: '' === part.name ? String(i + 1)
          : 1 === n ? part.name : `${part.name}.${i + 1}`,
        items: part.items.slice(i * budget, (i + 1) * budget),
      })
    }
  }
  return out
}


// The paths a split field leaves unresolved join the row the figure
// already wrote, so one code is one row.
function addUnresolved(loss: ViewLoss[], paths: string[]): void {
  const row = loss.find((l) => 'unresolved_field' === l.code)
  if (undefined === row) {
    unresolvedLoss(paths, loss)
    return
  }
  row.detail = [...new Set([...(row.detail as string[]), ...paths])]
    .sort(cmpCodePoint)
  row.count = row.detail.length
}

type Selection = { triples: Triple[], members?: string[], ghosts: Ghosts }


function selectMembers(
  triples: Triple[], of: string, member: string | undefined,
  ghosts: boolean, loss: ViewLoss[]
): { selection?: Selection, error?: VetFinding } {
  // The members of a node are what it, or any node under it, links
  // to: a map of groups selects every group's members.
  const out = triples.filter((e) => under(e.from, of))
  const links = undefined === member ? out : out.filter((e) => e.key === member)
  if (0 === links.length) {
    const have = keysOf(out)
    return {
      error: finding('view_members_none', 'reference', of,
        undefined === member
          ? `${of} links to nothing, so it has no members to draw.`
          : `${of} has no links under ${member}.`,
        0 === have.length ? undefined : 'its links: ' + have.join(', ')),
    }
  }
  const members = [...new Set(links.map((e) => e.to))].sort(cmpCodePoint)
  const inside = new Set(members)
  const kept: Triple[] = []
  const away = new Map<string, string>()
  let outside = 0
  for (const e of triples) {
    if (under(e.from, of)) {
      continue
    }
    const a = inside.has(e.from)
    const b = inside.has(e.to)
    if (a && b) {
      kept.push(e)
    }
    else if (a || b) {
      outside++
      if (ghosts) {
        kept.push(e)
        away.set(a ? e.to : e.from, '')
      }
    }
  }
  if (0 < outside && !ghosts) {
    loss.push({ code: 'edges_outside', count: outside })
  }
  return { selection: { triples: kept, members, ghosts: away } }
}


type Part = { name: string, nodes: string[] }

type SplitMode = 'by' | 'roots' | 'budget'

// How each kind divides. A kind missing here does not divide at all.
const SPLIT_MODES: [ViewKind, SplitMode[]][] = [
  ['graph', ['by', 'roots', 'budget']],
  ['state', ['by', 'roots', 'budget']],
  ['lane', ['by', 'roots', 'budget']],
  ['tree', ['by', 'roots', 'budget']],
  ['matrix', ['by', 'roots', 'budget']],
  ['layer', ['by', 'roots', 'budget']],
  ['doc', ['by', 'roots', 'budget']],
  ['treemap', ['by', 'roots', 'budget']],
  ['sequence', ['by', 'budget']],
  ['sets', ['budget']],
  ['layers', ['budget']],
]

const SPLIT_FLAG: Record<SplitMode, string> = {
  by: '--split-by', roots: '--split-roots', budget: '--budget',
}

// The kinds whose figures are drawn from the links, and so divide by
// node, drawing a ghost for what lives elsewhere.
const EDGE_KINDS: ViewKind[] = ['graph', 'state', 'lane', 'tree', 'matrix', 'layer']


function splitRefusal(kind: ViewKind, o: ViewOptions): VetFinding | undefined {
  const modes = SPLIT_MODES.find(([k]) => k === kind)?.[1] ?? []
  const asked: [SplitMode, boolean, string][] = [
    ['by', '' !== (o.splitBy ?? ''), 'by a field'],
    ['roots', true === o.splitRoots, 'by root'],
    ['budget', 0 < (o.budget ?? 0), 'by a budget'],
  ]
  const bad = asked.find(([mode, on]) => on && !modes.includes(mode))
  if (undefined === bad) {
    return undefined
  }
  return 0 === modes.length
    ? finding('view_split_kind', 'reference', '$',
      `The ${kind} figure cannot be split into parts.`,
      'kinds that split: ' + SPLIT_MODES.map(([k]) => k).join(', '))
    : finding('view_split_kind', 'reference', '$',
      `The ${kind} figure cannot be split ${bad[2]}.`,
      `the ${kind} figure splits with: ` +
      modes.map((m) => SPLIT_FLAG[m]).join(', '))
}


function splitParts(
  sel: Selection, root: any,
  o: { splitBy?: string, splitRoots?: boolean, budget?: number },
  loss: ViewLoss[]
): Part[] {
  const all = graphPaths(sel.triples, sel.members ?? [])
    .filter((p) => !sel.ghosts.has(p))
  const inner = new Set(all)
  const lab = labelsOf(all)
  const byLabel = (a: string, b: string): number =>
    cmpCodePoint(lab.get(a) as string, lab.get(b) as string)
  const sorted = all.slice().sort(byLabel)
  let parts: Part[]

  if (undefined !== o.splitBy) {
    const field = o.splitBy
    const unresolved: Unresolved = []
    const of = new Map<string, string[]>()
    for (const p of sorted) {
      const v = fieldOf(root, p, field)
      if (undefined === v) {
        unresolved.push(p + '.' + field)
        continue
      }
      of.set(v, [...(of.get(v) ?? []), p])
    }
    addUnresolved(loss, unresolved)
    parts = [...of.keys()].sort(cmpCodePoint)
      .map((name) => ({ name, nodes: of.get(name) as string[] }))
  }
  else {
    // Each root takes what it reaches that no earlier root took, in
    // breadth-first order; what no root reaches (a cycle with no way
    // in) is taken from its least label in the same way.
    const succ = new Map<string, string[]>(sorted.map((p) => [p, []]))
    const entered = new Set<string>()
    for (const e of sel.triples) {
      if (inner.has(e.from) && inner.has(e.to) && e.from !== e.to) {
        (succ.get(e.from) as string[]).push(e.to)
        entered.add(e.to)
      }
    }
    for (const list of succ.values()) {
      list.sort(byLabel)
    }
    const taken = new Set<string>()
    parts = []
    const claim = (start: string): void => {
      const nodes: string[] = []
      const queue = [start]
      taken.add(start)
      while (0 < queue.length) {
        const p = queue.shift() as string
        nodes.push(p)
        for (const q of succ.get(p) as string[]) {
          if (!taken.has(q)) {
            taken.add(q)
            queue.push(q)
          }
        }
      }
      parts.push({ name: lab.get(start) as string, nodes })
    }
    for (const p of sorted.filter((p) => !entered.has(p))) {
      claim(p)
    }
    for (const p of sorted) {
      if (!taken.has(p)) {
        claim(p)
      }
    }
    // A budget alone cuts the walk itself, so a part holds nodes that
    // reach each other wherever the budget allows.
    if (true !== o.splitRoots) {
      parts = [{ name: '', nodes: parts.flatMap((p) => p.nodes) }]
    }
  }

  return budgeted(parts.map((p) => ({ name: p.name, items: p.nodes })),
    o.budget ?? 0).map((p) => ({ name: p.name, nodes: p.items }))
}


// One part's own selection: its nodes, every edge touching one of
// them, and the far end of an edge that leaves the part drawn as a
// ghost naming the part it lives in.
function partSelection(sel: Selection, parts: Part[], part: Part): Selection {
  const home = new Map<string, string>()
  for (const p of parts) {
    for (const n of p.nodes) {
      home.set(n, p.name)
    }
  }
  const mine = new Set(part.nodes)
  const ghosts: Ghosts = new Map()
  const triples = sel.triples.filter((e) => mine.has(e.from) || mine.has(e.to))
  for (const e of triples) {
    for (const end of [e.from, e.to]) {
      if (!mine.has(end)) {
        ghosts.set(end, home.get(end) ?? '')
      }
    }
  }
  return { triples, members: part.nodes, ghosts }
}


// The token a split figure's file name carries, replaced by each
// part's name made safe for a file system.
export const PART_TOKEN = '{part}'

export function viewSplits(o: ViewOptions): boolean {
  return '' !== (o.splitBy ?? '') || true === o.splitRoots || 0 < (o.budget ?? 0)
}

// Letters, digits, `.` and `-` stand, and a name of dots alone is
// spelled in full, so distinct part names never share a file.
export function viewPartFile(out: string, name: string): string {
  const safe = /^\.*$/.test(name)
    ? spell(name, /[^.]/) : spell(name, /[A-Za-z0-9.-]/)
  return out.split(PART_TOKEN).join(safe)
}

// The comment a part opens with when every part is printed together.
function partHead(as: ViewProfile, name: string): string {
  return 'svg' === as ? `<!-- part: ${name} -->`
    : `${'dot' === as ? '//' : 'text' === as ? '#' : '%%'} part: ${name}`
}


function joinParts(as: ViewProfile, parts: ViewPart[]): Figure {
  return {
    parts,
    text: parts.map((p) => `${partHead(as, p.name)}\n${p.text}`).join('\n\n'),
  }
}


function docFailure(d: Doc, options: ViewOptions): VetFinding[] {
  const loaded = load(d.src, d.path, options, undefined)
  if (undefined !== loaded.errors) {
    return loaded.errors
  }
  if (undefined !== options.at && null == anchorAt(loaded.root, options.at)) {
    return [finding('no_path', 'reference', options.at,
      `${d.label} has no value at ${options.at}.`)]
  }
  return []
}


// ---------------------------------------------------------------------
// The verb

type Loaded = { root?: any, ctx?: any, errors?: VetFinding[] }


// One evaluation, parsed and unified separately so the provenance
// recorder can stamp the parsed tree before the fixpoint runs (`why`'s
// precedent).
function load(
  src: string, path: string | undefined,
  include: IncludeOptions,
  prov: Provenance | undefined
): Loaded {
  const aontu = new Aontu(includeOpts(include))
  const ctx = aontu.ctx({ collect: true, prov })
  const parseOpts = null == path ? undefined : { path }
  const parsed: any = aontu.parse(src, parseOpts, ctx)
  if (0 < ctx.err.length || null == parsed) {
    return { errors: [failureFinding(ctx, path, parsed)] }
  }
  if (undefined !== prov) {
    prov.writtenFrom(parsed)
  }
  const root: any = aontu.unify(parsed, parseOpts, ctx)
  // A document that does not stand up has no figure: the errors it
  // already has are the answer.
  if (0 < ctx.err.length || true === root?.isNil) {
    return { errors: [failureFinding(ctx, path, root)] }
  }
  return { root, ctx }
}


// The seams a test can reach in: the poset's pairwise comparison
// (`subsume` otherwise), and the provenance recorder the layers panel
// reads (a fresh one otherwise).
export type ViewHooks = {
  compare?: ViewCompare
  provenance?: () => Provenance
}

// A figure of one document (or, for the poset, of a set of them).
export function view(
  src: string, opts?: ViewOptions, hooks?: ViewHooks
): ViewReport {
  const options = opts ?? {}
  const compare = hooks?.compare ?? compareBySubsume
  const kind: ViewKind = options.kind ?? 'tree'
  const loss: ViewLoss[] = []

  const done = (fig: Figure): ViewReport => {
    if (undefined !== fig.errors) {
      return { verdict: 'error', kind, loss: [], errors: fig.errors }
    }
    loss.sort((a, b) => cmpCodePoint(a.code, b.code))
    const lossy = loss.some((l) => !INFORMATIONAL.includes(l.code))
    return {
      verdict: lossy ? 'lossy' : 'rendered', kind, text: fig.text, loss,
      ...(0 === (fig.parts ?? []).length ? {} : { parts: fig.parts }),
    }
  }

  const profiles = PROFILES[kind]
  if (undefined === profiles) {
    return done({
      errors: [finding('view_kind_unknown', 'reference', '$',
        `${kind} is not a figure kind.`,
        'kinds: ' + Object.keys(PROFILES).join(', '))],
    })
  }
  const as = options.as ?? profiles[0]
  if (!profiles.includes(as)) {
    return done({
      errors: [finding('view_profile_unknown', 'reference', '$',
        `The ${kind} figure does not render as ${as}.`,
        `profiles: ${profiles.join(', ')}`)],
    })
  }
  const style: ViewStyle = styleOf(options.style, as)
  const carrier: Record<string, ViewProfile> = { ansi: 'text', css: 'svg' }
  if (undefined !== carrier[style] && carrier[style] !== as) {
    return done({
      errors: [finding('view_style_profile', 'reference', '$',
        `The ${as} profile cannot carry --style ${style}.`,
        `${style} is the ${carrier[style]} profile's mechanism`)],
    })
  }
  if (undefined === carrier[style] && 'none' !== style) {
    return done({
      errors: [finding('view_style_unknown', 'reference', '$',
        `${style} is not a style.`, 'styles: auto, none, ansi, css')],
    })
  }

  const refused = splitRefusal(kind, options)
  if (undefined !== refused) {
    return done({ errors: [refused] })
  }

  // Zero means the default, in both ports.
  const max = options.maxRows || DEFAULT_MAX_ROWS

  if ('poset' === kind) {
    const docs: Doc[] = [{ src, path: options.path }, ...(options.docs ?? [])]
      .map((d: ViewDoc, i) => ({
        src: d.src, path: d.path,
        label: d.name ?? (undefined === d.path
          ? `doc${i + 1}` : basename(d.path).replace(/\.aontu$/, '')),
      }))
    return done(drawPoset(docs, options, as, max, loss, compare))
  }
  if ('ladder' === kind) {
    return done(drawLadder(src, options, as, max))
  }

  const prov = 'layers' === kind
    ? (hooks?.provenance ?? (() => new Provenance()))() : undefined
  const loaded = load(src, options.path, options, prov)
  if (undefined !== loaded.errors) {
    return done({ errors: loaded.errors })
  }
  return done(drawLoaded(loaded.root, loaded.ctx, prov,
    kind, as, options, max, loss))
}


// The options naming a field or a path. An empty name is no name, as
// the Go port's zero value is.
const NAMES = [
  'groupBy', 'label', 'member', 'of', 'columns', 'countBy', 'splitBy',
  'steps', 'from', 'to', 'size',
]


function drawLoaded(
  root: any, ctx: any, prov: Provenance | undefined,
  kind: ViewKind, as: ViewProfile, given: ViewOptions,
  max: number, loss: ViewLoss[]
): Figure {
  const options: ViewOptions = { ...given }
  for (const k of NAMES) {
    if ('' === (options as any)[k]) {
      delete (options as any)[k]
    }
  }
  const style = styleOf(options.style, as)
  const splitting = viewSplits(options)
  if ('doc' === kind) {
    return splitting
      ? drawDocParts(root, { ...options, as, style }, max, loss)
      : drawDoc(root, { ...options, as, style }, max, loss)
  }
  if ('lattice' === kind) {
    return drawLattice(root, { ...options, as, style }, max, loss)
  }
  if ('layers' === kind) {
    return drawLayers(prov as Provenance, root, options.path,
      { ...options, as, style }, max, loss)
  }
  if ('sets' === kind || 'sequence' === kind) {
    const missing = 'sets' === kind
      ? undefined === options.sets || undefined === options.member
      : undefined === options.steps || undefined === options.from ||
        undefined === options.to
    if (missing) {
      return {
        errors: 'sets' === kind
          ? [finding('view_sets_required', 'reference', '$',
            'The set panel needs --sets and --member.')]
          : [finding('view_steps_required', 'reference', '$',
            'The sequence needs --steps, --from and --to.')],
      }
    }
    if ('sequence' === kind) {
      // The steps are generated alone: a model whose schema half is
      // not concrete can still list its sequences.
      const steps = anchorAt(root, options.steps as string)
      if (null == steps) {
        return {
          errors: [finding('no_path', 'reference', options.steps as string,
            `The path ${options.steps} names nothing in this document.`)],
        }
      }
      const before = ctx.err.length
      const listed = steps.gen(ctx)
      if (before < ctx.err.length) {
        return { errors: [engineFinding(ctx.err[before], ctx, '$')] }
      }
      return drawSequence(listed, {
        from: options.from as string, to: options.to as string,
        label: options.label, at: options.steps as string, as,
        splitBy: options.splitBy, budget: options.budget,
      }, max, loss)
    }
    // GENERATION CAN FAIL WHERE UNIFICATION DID NOT: the panel reads
    // generated values, so a document that is not concrete is an
    // error here, exactly as `aontu file.aontu` on it is.
    const before = ctx.err.length
    const value = root.gen(ctx)
    if (before < ctx.err.length) {
      return {
        errors: [engineFinding(ctx.err[before], ctx, '$')],
      }
    }
    return drawSets(value, {
      sets: options.sets as string, member: options.member as string,
      universe: options.universe, minDegree: options.minDegree,
      maxCols: options.maxCols, as, style, budget: options.budget,
    }, max, loss)
  }

  let sel: Selection = {
    triples: triplesOf(graphOf(root), options.at, loss), ghosts: new Map(),
  }
  if (undefined !== options.columns) {
    // A link written as a column is the entity's own relationship,
    // named by the column.
    const tail = '.' + options.columns
    sel.triples = sel.triples.map((e) => e.from.endsWith(tail)
      ? { ...e, from: e.from.slice(0, -tail.length) } : e)
  }
  if (undefined !== options.of) {
    const picked = selectMembers(sel.triples, options.of, options.member,
      true === options.ghosts && EDGE_KINDS.includes(kind),
      'treemap' === kind ? [] : loss)
    if (undefined !== picked.error) {
      return { errors: [picked.error] }
    }
    sel = picked.selection as Selection
  }
  if ('treemap' === kind) {
    const o = {
      at: options.at, depth: options.depth, groupBy: options.groupBy,
      size: options.size, members: sel.members, as, style,
      splitBy: options.splitBy, splitRoots: options.splitRoots,
      budget: options.budget,
    }
    return splitting
      ? drawTreemapParts(root, o, max, loss) : drawTreemap(root, o, max, loss)
  }

  const decls: RelDecls = ctx._reldecls
  // An empty relation name is no relation, so both ports read it as
  // "every relation" rather than one that names nothing.
  const relation = options.relation || undefined
  const relations = options.relations ?? []
  const roots = options.roots ?? []
  // The relation a matrix or a layer figure is drawn over, as the whole
  // figure picks it; a part is drawn over the same one.
  const picked = pickRelation(relation, keysOf(sel.triples)).relation
  const draw = (
    s: Selection, rows: number, into: ViewLoss[], inPart: boolean,
    partRoots: string[]
  ): Figure => {
    const members = s.members ?? []
    const rels = inPart ? [] : relations
    if ('graph' === kind) {
      return drawGraph(s.triples, decls, root, {
        relations: rels, groupBy: options.groupBy, label: options.label, as,
        members, ghosts: s.ghosts, columns: options.columns,
        counts: options.counts, countBy: options.countBy,
        collapse: options.collapse,
      }, rows, into)
    }
    if ('state' === kind) {
      return drawState(s.triples, root, {
        relations: rels, label: options.label, as, members, ghosts: s.ghosts,
        roots: partRoots, named: 0 < roots.length,
      }, rows, into)
    }
    if ('lane' === kind) {
      return drawLane(s.triples, root, {
        relations: rels, groupBy: options.groupBy, label: options.label,
        layers: options.layers ?? [], as, members, ghosts: s.ghosts,
        counts: options.counts, countBy: options.countBy,
      }, rows, into)
    }
    if ('matrix' === kind) {
      return drawMatrix(s.triples, decls, {
        relation: inPart ? picked : relation, order: options.order ?? 'canon',
        closure: true === options.closure, as, style, ghosts: s.ghosts,
        members, picked: inPart,
      }, rows, into)
    }
    if ('layer' === kind) {
      return drawLayer(s.triples, root, {
        relation, groupBy: options.groupBy, layers: options.layers ?? [],
        edges: options.edges, as, style, counts: options.counts,
        countBy: options.countBy, ghosts: s.ghosts, members,
      }, rows, into)
    }
    return drawTree(collapse(s.triples, relation), relation, partRoots, rows,
      as, style, { ghosts: s.ghosts, members, rest: inPart })
  }
  if (!splitting) {
    return draw(sel, max, loss, false, roots)
  }
  // THE WHOLE FIGURE IS DRAWN FIRST, for its refusals and its loss
  // report; each part is then drawn on its own, under the row cap the
  // whole figure was spared.
  const whole = draw(sel, Infinity, loss, false, roots)
  if (undefined !== whole.errors) {
    return whole
  }
  // The parts divide the edges the figure draws: its relations, and for
  // a tree with named roots only what those roots reach.
  const keys = ['graph', 'state', 'lane'].includes(kind) ? relations
    : 'tree' === kind ? (undefined === relation ? [] : [relation])
      : [picked as string]
  let scoped: Selection = 0 === keys.length ? sel : {
    ...sel, triples: sel.triples.filter((e) => keys.includes(e.key)),
  }
  if ('tree' === kind && 0 < roots.length) {
    const reached = new Set(roots)
    const drawn = collapse(scoped.triples, relation)
    for (let grew = true; grew;) {
      grew = false
      for (const e of drawn) {
        if (reached.has(e.from) && !reached.has(e.to)) {
          reached.add(e.to)
          grew = true
        }
      }
    }
    scoped = {
      ...scoped,
      triples: scoped.triples.filter((e) => reached.has(e.from) && reached.has(e.to)),
      members: (scoped.members ?? []).filter((m) => reached.has(m)),
    }
  }
  const cut = splitParts(scoped, root, options, loss)
  const broken = cut.find((p) => hasLineBreak(p.name))
  if (undefined !== broken) {
    return { errors: [lineBreakFinding(broken.nodes[0])] }
  }
  const parts: ViewPart[] = []
  for (const part of cut) {
    // A matrix part keeps every edge touching it, so a mirror under a
    // declared inverse is still seen.
    const fig = draw(partSelection('matrix' === kind ? sel : scoped, cut, part),
      max, [], true, roots.filter((r) => part.nodes.includes(r)))
    if (undefined !== fig.errors) {
      return fig
    }
    parts.push({ name: part.name, text: fig.text as string })
  }
  return joinParts(as, parts)
}


// The tree view of one document: `view` with the kind fixed.
export function viewTree(src: string, opts?: ViewOptions): ViewReport {
  return view(src, { ...(opts ?? {}), kind: 'tree' })
}


const DECL_TEXT = [
  'kind', 'as', 'out', 'at', 'relation', 'order', 'groupBy', 'label',
  'sets', 'member', 'universe', 'edges', 'of', 'columns', 'countBy',
  'splitBy', 'steps', 'from', 'to', 'size',
]

// The options whose values are a closed set. A view document is the
// artifact CI reads, so a typo here is a refusal rather than a silent
// fall back to the default.
const DECL_ENUM: Record<string, string[]> = {
  order: ['canon', 'partition'],
  edges: ['upward', 'all', 'none'],
}
const DECL_COUNT = [
  'maxRows', 'maxCols', 'minDegree', 'minSize', 'depth', 'budget',
]
const DECL_FLAG = ['closure', 'ghosts', 'counts', 'collapse', 'splitRoots']
const DECL_LIST = ['roots', 'relations', 'layers']

const DECL_KEYS = [...DECL_TEXT, ...DECL_COUNT, ...DECL_FLAG, ...DECL_LIST]
  .sort(cmpCodePoint)


function documentFinding(path: string, message: string, note?: string): VetFinding {
  return finding('view_document_shape', 'reference', path, message, note)
}


type Plan = {
  name: string
  kind: ViewKind
  as: ViewProfile
  out: string
  max: number
  opts: ViewOptions
}


function planOf(name: string, decl: any, at: string): {
  plan?: Plan, errors: VetFinding[]
} {
  const where = `${at}.${name}`
  const errors: VetFinding[] = []
  if (null == decl || 'object' !== typeof decl || Array.isArray(decl)) {
    return { errors: [documentFinding(where, 'A view declaration is not a map.')] }
  }
  const opts: ViewOptions = {}
  for (const key of Object.keys(decl).sort(cmpCodePoint)) {
    const value = decl[key]
    if (DECL_TEXT.includes(key)) {
      if ('string' !== typeof value) {
        errors.push(documentFinding(`${where}.${key}`, `${key} must be a string.`))
        continue
      }
      (opts as any)[key] = value
    }
    else if (DECL_COUNT.includes(key)) {
      if ('number' !== typeof value || !Number.isInteger(value) || 0 > value) {
        errors.push(documentFinding(`${where}.${key}`,
          `${key} must be a whole number, zero or more.`))
        continue
      }
      (opts as any)[key] = value
    }
    else if (DECL_FLAG.includes(key)) {
      if ('boolean' !== typeof value) {
        errors.push(documentFinding(`${where}.${key}`, `${key} must be true or false.`))
        continue
      }
      (opts as any)[key] = value
    }
    else if (DECL_LIST.includes(key)) {
      if (!Array.isArray(value) || !allStrings(value)) {
        errors.push(documentFinding(`${where}.${key}`,
          `${key} must be a list of strings.`))
        continue
      }
      (opts as any)[key] = value
    }
    else {
      errors.push(documentFinding(`${where}.${key}`,
        `${key} is not a view option.`, 'options: ' + DECL_KEYS.join(', ')))
    }
  }

  for (const key of Object.keys(DECL_ENUM)) {
    const value = (opts as any)[key]
    if (undefined !== value && !DECL_ENUM[key].includes(value)) {
      errors.push(documentFinding(`${where}.${key}`,
        `${value} is not a ${key}.`, `${key}: ${DECL_ENUM[key].join(', ')}`))
    }
  }

  const kind = opts.kind
  if (undefined === kind) {
    errors.push(documentFinding(where, 'A view declaration must name its kind.',
      'kinds: ' + Object.keys(PROFILES).join(', ')))
  }
  else if (undefined === PROFILES[kind]) {
    errors.push(documentFinding(`${where}.kind`, `${kind} is not a figure kind.`,
      'kinds: ' + Object.keys(PROFILES).join(', ')))
  }
  else if ('poset' === kind) {
    errors.push(documentFinding(`${where}.kind`,
      'A view document draws figures of one document; ' +
      'the poset compares several.'))
  }
  const profiles = undefined === kind ? undefined : PROFILES[kind]
  const as = opts.as ?? profiles?.[0]
  if (undefined !== profiles && undefined !== as && !profiles.includes(as)) {
    errors.push(documentFinding(`${where}.as`,
      `The ${kind} figure does not render as ${as}.`,
      `profiles: ${profiles.join(', ')}`))
  }
  const out = opts.out
  if (undefined === out || '' === out) {
    errors.push(documentFinding(where,
      'A view declaration must name the file it draws into, as out.'))
  }
  else if (hasLineBreak(out)) {
    errors.push(documentFinding(`${where}.out`,
      'A file name cannot hold a line terminator.'))
  }
  else if (viewSplits(opts) !== out.includes(PART_TOKEN)) {
    errors.push(documentFinding(`${where}.out`, viewSplits(opts)
      ? `A split figure writes one file per part, so out must hold ${PART_TOKEN}.`
      : `Only a split figure's out holds ${PART_TOKEN}.`))
  }
  if (0 < errors.length) {
    return { errors }
  }
  return {
    plan: {
      name, kind: kind as ViewKind, as: as as ViewProfile, out: out as string,
      max: opts.maxRows || DEFAULT_MAX_ROWS, opts,
    },
    errors: [],
  }
}


export function viewSet(
  src: string, opts?: ViewOptions, hooks?: ViewHooks
): ViewSetReport {
  const options = opts ?? {}
  const at = options.views
  if (undefined === at || '' === at) {
    return {
      verdict: 'error', views: [],
      errors: [documentFinding('$', 'The view document needs the path of ' +
        'the map that declares the figures; name it with --views.')],
    }
  }
  const prov = (hooks?.provenance ?? (() => new Provenance()))()
  const loaded = load(src, options.path, options, prov)
  if (undefined !== loaded.errors) {
    return { verdict: 'error', views: [], errors: loaded.errors }
  }
  const root = loaded.root
  const ctx = loaded.ctx
  // THE DECLARATIONS GENERATE ALONE: a model whose schema half is not
  // concrete still has figures, and a figure that reads generated
  // values generates what it reads.
  const node = anchorAt(root, at)
  let declared: any = undefined
  if (null != node) {
    const before = ctx.err.length
    declared = node.gen(ctx)
    if (before < ctx.err.length) {
      return {
        verdict: 'error', views: [],
        errors: [engineFinding(ctx.err[before], ctx, at)],
      }
    }
  }
  if (null == declared || 'object' !== typeof declared || Array.isArray(declared)) {
    return {
      verdict: 'error', views: [],
      errors: [documentFinding(at, 'The view declarations are not a map.')],
    }
  }

  const plans: Plan[] = []
  const errors: VetFinding[] = []
  for (const name of Object.keys(declared).sort(cmpCodePoint)) {
    const planned = planOf(name, declared[name], at)
    errors.push(...planned.errors)
    if (undefined !== planned.plan) {
      plans.push(planned.plan)
    }
  }
  if (0 < errors.length) {
    return { verdict: 'error', views: [], errors }
  }

  const views: ViewFigure[] = plans.map((plan) => {
    const loss: ViewLoss[] = []
    const each: ViewOptions = {
      ...plan.opts, path: options.path, trust: options.trust,
      textExt: options.textExt,
    }
    // A Val tree generates once: the declarations were generated from
    // this one, so a figure that generates draws from a fresh
    // evaluation of the same source, which stands up as this one did.
    const own = 'sets' === plan.kind || 'sequence' === plan.kind
      ? load(src, options.path, options, undefined) : loaded
    const refused = splitRefusal(plan.kind, each)
    const fig: Figure = undefined !== refused ? { errors: [refused] }
      : 'ladder' === plan.kind
        ? drawLadder(src, each, plan.as, plan.max)
        : drawLoaded(own.root, own.ctx, prov, plan.kind, plan.as, each, plan.max, loss)
    if (undefined !== fig.errors) {
      return {
        name: plan.name, kind: plan.kind, out: plan.out,
        verdict: 'error' as ViewVerdict, loss: [], errors: fig.errors,
      }
    }
    loss.sort((a, b) => cmpCodePoint(a.code, b.code))
    const lossy = loss.some((l) => !INFORMATIONAL.includes(l.code))
    return {
      name: plan.name, kind: plan.kind, out: plan.out,
      verdict: (lossy ? 'lossy' : 'rendered') as ViewVerdict,
      text: fig.text, loss,
      ...(0 === (fig.parts ?? []).length ? {} : { parts: fig.parts }),
    }
  })

  const verdict: ViewVerdict = views.some((v) => 'error' === v.verdict)
    ? 'error' : views.some((v) => 'lossy' === v.verdict) ? 'lossy' : 'rendered'
  return { verdict, views }
}
