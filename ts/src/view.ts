/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE VIEWS (docs/design/VIEWS.0.md and VIEWS-ORDER.0.md): figures of
// an evaluated document, drawn as deterministic text a golden diff can
// check. Seven kinds:
//
//   tree     the dependency tree of one relation
//   matrix   the dependency matrix over one relation, in canon or
//            partition order, with closure and the unmirrored mark
//   graph    the node-link drawing, as Mermaid, DOT or an ER diagram
//   layer    the architecture layers: stacked bands, one per value of
//            a field, with the relation's upward edges called out
//   sets     the set-intersection panel over a named set family
//   layers   which document contributed which path (provenance)
//   ladder   the meet ladder at one path (the `why` record, drawn)
//   poset    the subsumption order over a set of documents
//
// A view consumes a REPORT, never the Val tree: the edge set `graphOf`
// derives (ts/src/graph.ts), the relation declarations, the generated
// value, the provenance record, the subsumption verdict. That is what
// keeps the two ports at parity -- Go's exported Val interface is five
// methods, and a Val-walking view would be TypeScript-only on the day
// it landed.
//
// Everything here is deterministic: nodes and edges are sorted by code
// point before emission, nothing iterates a map in insertion order, no
// coordinate is computed and no number is formatted beyond its decimal
// digits. The Go twin is go/view.go; what the two ports must agree on
// -- the rendered text, the loss report and the refusals -- is
// test/spec/view.tsv.
//
// EVERY RUN CARRIES A LOSS REPORT: what the figure could not draw, or
// drew differently from the model, aggregated by code with a count.
// Three codes are informational -- `edges_deduped` (several written
// positions, one fact), `inverse_suppressed` (a declared mirror,
// implied by the edge drawn) and `crossings` (a property of the
// emitted order, not of the model) -- and leave the verdict `rendered`. Every
// other code makes it `lossy`, which `--strict` refuses: a figure that
// quietly omits things is the failure this capability exists to avoid.

import { basename, dirname, isAbsolute, relative, resolve } from 'path'

import { Aontu } from './aontu'
import { failureFinding, anchorAt } from './vet'
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


export type ViewVerdict = 'rendered' | 'lossy' | 'error'

export type ViewKind =
  'tree' | 'matrix' | 'graph' | 'layer' | 'sets' | 'layers' | 'ladder' | 'poset'

// The target grammars. Each kind declares the profiles it can render
// into, and the first is its default (PROFILES below).
export type ViewProfile = 'text' | 'mermaid' | 'dot' | 'er' | 'svg'

export type ViewOrder = 'canon' | 'partition'

// Which of the relation's edges the layer figure DRAWS. The bands
// already say which way every edge goes, so the default shows the ones
// that break the rule: `upward`. `all` draws the relation over the
// bands -- what a reader tracing one module's dependencies wants --
// and `none` leaves the bands alone. The default is `all` for a
// profile that lays edges out itself (mermaid) and `upward` for the
// fixed grids (text, svg), which is what each drew before the option
// existed.
export type ViewEdges = 'upward' | 'all' | 'none'

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
  // so its label (the file name without `.aon`) is known.
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

  // WHY the figure could not be drawn, in vet's finding shape. Present
  // ONLY on `error`.
  errors?: VetFinding[]
}

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
  // The figure to draw. Absent means `tree`.
  kind?: ViewKind
  // The target grammar. Absent means the kind's first profile.
  as?: ViewProfile
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory (relationCheck's precedent).
  path?: string
  // The include capability this document evaluates under
  // (docs/trust.md).
  trust?: TrustOptions
  // Restrict the figure to nodes (or paths) under this path. For the
  // ladder it is the path drawn, and required; for the poset it is
  // where the documents are compared.
  at?: string
  // Refuse a figure with more than this many rows (matrix rows, graph
  // and tree nodes, set rows, poset nodes, ladder rungs). Absent means
  // sixty. A REFUSAL, not a truncation: a view that quietly omits
  // things is the failure this capability exists to avoid.
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
  // sets: drop intersections below this degree.
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

  // The VIEW DOCUMENT (VIEWS.0.md, "6. The view document"): the path of
  // a map whose values declare figures. `viewSet` reads it; `view`
  // ignores it, because one call draws one figure.
  views?: string
}


// Each kind's profiles, the first being its default. There is no
// global default, because there is no sensible text form of a
// node-link drawing and no sensible Mermaid form of a matrix.
const PROFILES: Record<ViewKind, ViewProfile[]> = {
  tree: ['text', 'svg'],
  matrix: ['text', 'svg'],
  graph: ['mermaid', 'dot', 'er'],
  layer: ['text', 'mermaid', 'svg'],
  sets: ['text', 'svg'],
  layers: ['text', 'svg'],
  ladder: ['mermaid', 'dot'],
  poset: ['mermaid', 'dot'],
}

// Loss codes that describe the drawing rather than a gap in it.
const INFORMATIONAL = ['edges_deduped', 'inverse_suppressed', 'crossings']

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


// A relation that draws nothing is a typo, and is refused for the same
// reason a misspelled root is: an empty figure and a misspelled name
// are the same file on disk, so the one that means nothing must not be
// renderable. NOT `refer_unresolved`: a relation name is not an
// address.
function relationFinding(relation: string, have: string[]): VetFinding {
  return finding('view_relation_unknown', 'reference', '$',
    `${relation} names no relation with edges in this document.`,
    'relations with edges: ' + have.join(', '))
}


// A root is a node of the DRAWN graph, the rule the node set follows:
// a path that exists in the document but takes no part in the relation
// is not in the drawing, and a root naming it is refused rather than
// drawn as an empty tree.
function rootFinding(
  root: string, relation: string | undefined, nodes: string[]): VetFinding {
  return finding('refer_unresolved', 'reference', '$',
    `${root} is not a node of the ` +
    `${undefined === relation ? '' : relation + ' '}graph.`,
    0 === nodes.length ? undefined : 'nodes in the graph: ' + nodes.join(', '))
}


// `--max-rows` is a REFUSAL, and the message names the narrowing
// options.
function rowsFinding(rows: number, max: number, narrow: string): VetFinding {
  return finding('view_rows_exceeded', 'budget', '$',
    `The figure has ${rows} rows, above --max-rows ${max}; ` +
    `narrow it with ${narrow}, or raise the limit.`,
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


// The deduplicated edge set, with the hidden contributions and the
// out-of-scope edges removed and the loss report told.
//
// `graphOf` emits one edge per WRITTEN POSITION by design, because each
// `at` is an editable site, and an identity-merged model declares each
// entity at two positions. Deduplication is part of the extraction
// contract, not a renderer's private cleverness, and the count is
// reported so nobody has to guess which number they are looking at.
//
// A HIDDEN edge -- one written inside a `hide()`-marked subtree -- is
// not drawn. A figure is committed to a repository, so anything drawn
// is disclosed, and the subtree's whole purpose is to say "not
// output". It is reported with its path instead, and `--strict`
// refuses the figure.
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
  // A link under an UNRESOLVED DISJUNCTION is not an edge (ADR-007),
  // and the figure says so rather than dropping it in silence: the
  // document has not decided, and a drawing that quietly picked an arm
  // would be inventing the decision.
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


// THE SHORTEST SUFFIX THAT IS STILL UNIQUE, as a node's visible label.
//
// A node's name IS its path (ADR-014), and the paths in a real model
// are long: eight nodes labelled `$.catalog.domains.identity.services.auth`
// and its siblings is a correct diagram nobody can read. The label is
// therefore the fewest trailing segments that still tell this node from
// every other in the same drawing -- `auth` where that is unambiguous,
// `identity.auth` where it is not.
//
// The rule is a function of the node SET, so a drawing is deterministic
// while two drawings of different slices may label the same node
// differently -- which is correct, because uniqueness is a property of
// the set being drawn. The search is unbounded on purpose: at the full
// segment count the candidate is the whole path, which no other node
// shares, so it always ends.
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

// Injective by construction, with two disjoint prefixes and one
// predicate: `n_` + the name when its first code point is an ASCII
// letter and every code point is an ASCII letter, digit or `_`;
// otherwise `nq_` + the name with every other code point replaced by
// `_` and its lower-case hex. A code-point class test, not a regular
// expression: pattern matching is the one subsystem with a stated
// RE2-versus-RegExp divergence, and an encoder runs on every name.
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


// One pass, per code point, from a table keyed by DECIMAL CODE POINT.
// Mermaid: numeric entities only, never HTML names, so there is no
// name table to diverge; 124 is in it because `|` is the edge-label
// delimiter. DOT: the two escapes that also make it impossible for user
// text to forge DOT's own `\n` / `\l` / `\r` justification escapes.
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

// U+000A, U+000D, U+2028 and U+2029: the four code points that end a
// line somewhere.
function hasLineBreak(text: string): boolean {
  return /[\n\r\u2028\u2029]/.test(text)
}


// ---------------------------------------------------------------------
// SVG (VIEWS.0.md, "No SVG in v1" -- the phase after the text kinds)
//
// The cell-based kinds draw into SVG under the INTEGER RULE: every
// coordinate is a whole number of a fixed cell -- 8 units per
// character, 20 per line -- from the same counts that lay the text
// figure out, so no font is measured and both ports emit the same
// bytes. The reader's browser shapes the text; the geometry is ours.
// A figure is standalone (its own style block, with default colours)
// and themeable (every colour a CSS variable a host page can set).

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
function svgDoc(w: number, h: number, about: string, parts: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="av" viewBox="0 0 ${w} ${h}" ` +
    `width="${w}" height="${h}" role="img" aria-label="${svgEsc(about)}">`,
    SVG_STYLE,
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


// ---------------------------------------------------------------------
// The tree

// One edge as the tree draws it: a declared inverse pair collapsed to
// one edge, and the label the branch carries.
type Drawn = { from: string, to: string, label: string }


// THE EDGE SET WITH DECLARED INVERSE PAIRS COLLAPSED to one logical
// edge, the tree's way: a relation with a declared inverse arrives
// twice -- once per direction -- and drawing it raw doubles every such
// relation.
//
// WHAT IS NOT COLLAPSED IS A MUTUAL RELATION: `a dependsOn b` and `b
// dependsOn a` are two facts under ONE key, and folding them into a
// single undirected edge erases the shortest cycle a model can have.
// The collapse is therefore per KEY PAIR rather than per node pair --
// two keys facing each other are an inverse, one key facing itself is
// a loop -- which is what makes `acyclic()`'s refusal drawable.
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
    // ONE KEY WINS THE PAIR, and every edge written under it stands.
    // The named relation wins; otherwise the code-point-least key,
    // which is arbitrary but stable. Keeping every edge under the
    // winner is what preserves a MUTUAL relation, while the losing keys
    // are the declared inverses, implied by the winner and not drawn
    // again. With a relation named, its inverse is implied and naming
    // both would double the label; without one, every key is shown,
    // because picking silently would hide that two predicates are in
    // play.
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

type Figure = { text?: string, errors?: VetFinding[] }


// THE DEPENDENCY TREE: the drawn edges, walked from each root, indented.
//
// A dependency graph is a DAG and not a tree -- two modules may share a
// dependency, and drawing that shared node once under each parent is
// what makes `cargo tree` and `npm ls` readable rather than
// exponential. So this is a SPANNING WALK with two honest marks: `(*)`
// where a subtree is elided because the node was expanded earlier, and
// `(cycle)` where an edge closes a loop. The first is routine in a
// correct model -- a diamond is good engineering, not a fault. The
// second cannot arise from a model whose relation declares
// `acyclic()`, and is drawn rather than thrown because a renderer that
// hangs on a hostile input is a renderer that cannot be pointed at one.
//
// Which nodes are roots is DERIVED, not asked for: a root is a node
// nothing depends on. `roots` overrides that to draw named subtrees.
// The order of everything -- roots, children, the choice of which
// occurrence of a shared node is the expanded one -- follows the label
// sort, so the drawing is a function of the model alone.
// One drawn row of the tree, for the SVG: its depth, its text, the
// mark after it, and the row of its parent (-1 for a root). A blank
// separator between roots is `null`.
type TreeRow = { depth: number, text: string, mark: string, parent: number }


function drawTree(
  all: Drawn[], relation: string | undefined, roots: string[], max: number,
  as: ViewProfile
): Figure {
  // With a relation named, the tree is OVER THAT RELATION. A node-link
  // diagram can label each edge and so draw every relation at once; a
  // tree cannot without becoming unreadable, and walking two relations
  // as though they were one would draw a containment the model does
  // not state.
  const kept = undefined === relation
    ? all : all.filter((e) => e.label === relation)

  if (undefined !== relation && 0 === kept.length && 0 < all.length) {
    const have = [...new Set(all.flatMap((e) => e.label.split('/')))]
      .sort(cmpCodePoint)
    return { errors: [relationFinding(relation, have)] }
  }

  // The node set is what the drawn relation CONNECTS. A root naming
  // anything else is a typo, and it is refused rather than drawn.
  const nodes = nodesOf(kept)
  if (max < nodes.length) {
    return {
      errors: [rowsFinding(nodes.length, max, '--at, --relation or --root')],
    }
  }
  const lab = labelsOf(nodes)
  const label = (n: string): string => lab.get(n) as string

  const kids = new Map<string, Kid[]>(nodes.map((n) => [n, []]))
  for (const e of kept) {
    (kids.get(e.from) as Kid[]).push({ to: e.to, label: e.label })
  }
  for (const list of kids.values()) {
    list.sort((x, y) => cmpCodePoint(label(x.to), label(y.to)))
  }

  // The relation is named on the branch only where more than one is
  // drawn. Naming the single relation on every line of a tree that has
  // exactly one is noise; leaving it off where there are two would
  // hide which edge was walked.
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
    // A root is a node nothing depends on. A SELF-EDGE does not make a
    // node depended upon for this purpose: a module that names itself
    // would otherwise stop being a root and take its whole subtree out
    // of the drawing.
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

    // ITERATIVE, with the ancestor chain carried as a set that is added
    // to on the way down and removed from on the way up. A recursive
    // walk is O(depth) stack frames and a deep dependency chain is a
    // real shape, so the drawing of a model must not depend on how deep
    // the interpreter lets it go.
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
      out.push(frame.prefix + (last ? '└── ' : '├── ') + text + mark)
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

  // EVERY NODE IS DRAWN. A component whose nodes all depend on each
  // other has no node nothing depends on, so the derived roots miss it
  // entirely -- and a graph with roots elsewhere would drop it in
  // silence, which is the one thing a drawing must not do. The
  // least-labelled node left is taken as a root of its own, until
  // nothing is left. An explicitly named root is a request for one
  // subtree and is left alone.
  if (0 === roots.length) {
    for (const n of nodes) {
      if (!expanded.has(n)) {
        draw(n)
      }
    }
  }

  return { text: 'svg' === as ? treeSvg(rows, nodes.length) : out.join('\n') }
}


// The tree as SVG: one line per row, each node indented one unit per
// depth, joined to its parent by a path that drops from the parent's
// row and turns in to the child. The marks are muted text after the
// label.
function treeSvg(rows: (TreeRow | null)[], count: number): string {
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
  return svgDoc(width + PAD, rows.length * LH + PAD,
    `Dependency tree: ${count} nodes`, parts)
}


// ---------------------------------------------------------------------
// The matrix (Ghoniem et al. 2004; Sangal et al. 2005)

// THE PARTITION ORDER: leaves first. Repeatedly take every unplaced
// node whose every successor is placed, in label order, as the next
// layer. That is a topological sort with a canonical tiebreak, and on
// an acyclic relation it yields a perfect lower triangle -- which IS
// the acyclicity proof, in the picture's own shape. Where nothing can
// be placed the relation has a cycle: the least unplaced node is
// placed alone, the strongly connected component it sits in is
// reported as `cycle_block`, and the walk continues -- the cycle's
// above-diagonal cell is then the acyclicity violation, drawn.
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


// The relation a matrix draws: the one named, else the only one with
// edges, else a refusal -- a matrix over two predicates at once would
// draw a containment the model does not state.
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
  o: { relation?: string, order: ViewOrder, closure: boolean, as: ViewProfile },
  max: number, loss: ViewLoss[]
): Figure {
  const picked = pickRelation(o.relation, keysOf(triples))
  if (undefined !== picked.error) {
    return { errors: [picked.error] }
  }
  const relation = picked.relation as string
  const rel = triples.filter((e) => e.key === relation)
  const nodes = nodesOf(rel)
  if (max < nodes.length) {
    return { errors: [rowsFinding(nodes.length, max, '--at or --relation')] }
  }
  const lab = labelsOf(nodes)
  const label = (n: string): string => lab.get(n) as string

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
      idx.map((s) => lpad(s, iw)[d]).join(' '))
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
      pad(label(r), w) + ' ' + lpad(idx[ri], iw) + ' ' + cells.join(' '))
  })
  const footer = `# above-diagonal direct cells: ${above}`
  lines.push(footer)
  if ('svg' === o.as) {
    return {
      text: matrixSvg(order.map(label), idx, grid, footer,
        `Dependency matrix${over(relation)}: ${order.length} rows, ` +
        `${above} direct cells above the diagonal`),
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

function matrixSvg(
  labels: string[], idx: string[], grid: string[][], footer: string,
  about: string
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
  return svgDoc(width, y0 + n * S + LH + PAD, about, parts)
}


// ---------------------------------------------------------------------
// The node-link graph

type GNode = { path: string, label: string, id: string, group?: string }
type GEdge = { from: string, key: string, to: string }


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


function drawGraph(
  triples: Triple[], decls: RelDecls, root: any,
  o: { relations: string[], groupBy?: string, label?: string, as: ViewProfile },
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

  const paths = nodesOf(edges)
  if (max < paths.length) {
    return { errors: [rowsFinding(paths.length, max, '--at or --relation')] }
  }
  const lab = labelsOf(paths)

  // `--group-by` and `--label` read a field of each node; a node
  // without a value there is counted, and drawn ungrouped or under
  // its path.
  const unresolved: string[] = []
  const nodes: GNode[] = paths.map((p) => {
    const short = lab.get(p) as string
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
    return node
  })
  if (0 < unresolved.length) {
    loss.push({
      code: 'unresolved_field', count: unresolved.length,
      detail: unresolved.sort(cmpCodePoint),
    })
  }

  for (const n of nodes) {
    if (hasLineBreak(n.label) || hasLineBreak(n.group ?? '')) {
      return { errors: [lineBreakFinding(n.path)] }
    }
  }

  // Groups in label order, ids ordinal; nodes within a group, and the
  // ungrouped after them, in label order. That order is the emitted
  // order, and the crossing count is a property of it.
  const groups = [...new Set(nodes.filter((n) => undefined !== n.group)
    .map((n) => n.group as string))].sort(cmpCodePoint)
  const byLabel = (a: GNode, b: GNode): number =>
    cmpCodePoint(a.label, b.label) || cmpCodePoint(a.path, b.path)
  const emitted: GNode[] = []
  for (const g of groups) {
    emitted.push(...nodes.filter((n) => n.group === g).sort(byLabel))
  }
  const loose = nodes.filter((n) => undefined === n.group).sort(byLabel)
  emitted.push(...loose)

  const byPath = new Map<string, GNode>(nodes.map((n) => [n.path, n]))
  const node = (p: string): GNode => byPath.get(p) as GNode
  const at = new Map<string, number>(emitted.map((n, i) => [n.path, i]))
  const drawn = edges.slice().sort((a, b) =>
    cmpCodePoint(node(a.from).label, node(b.from).label)
    || cmpCodePoint(node(a.to).label, node(b.to).label)
    || cmpCodePoint(a.key, b.key))

  // Crossings in the emitted order: two edges cross when their spans
  // interleave. A count, not a layout -- the consumer lays the picture
  // out, and this says how tangled the order it is handed is.
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

  const id = (p: string): string => node(p).id
  const out: string[] = []
  if ('mermaid' === o.as) {
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('flowchart LR')
    groups.forEach((g, gi) => {
      out.push(`  subgraph g${gi}["${esc(g)}"]`)
      for (const n of emitted.filter((n) => n.group === g)) {
        out.push(`    ${n.id}["${esc(n.label)}"]`)
      }
      out.push('  end')
    })
    for (const n of loose) {
      out.push(`  ${n.id}["${esc(n.label)}"]`)
    }
    for (const e of drawn) {
      out.push(`  ${id(e.from)} -->|"${esc(e.key)}"| ${id(e.to)}`)
    }
  }
  else if ('dot' === o.as) {
    const esc = (s: string): string => escape(s, DOT_ESC)
    out.push('digraph G {', '  rankdir=LR;', '  node [shape=box];')
    groups.forEach((g, gi) => {
      out.push(`  subgraph cluster_g${gi} {`, `    label="${esc(g)}";`)
      for (const n of emitted.filter((n) => n.group === g)) {
        out.push(`    ${n.id} [label="${esc(n.label)}"];`)
      }
      out.push('  }')
    })
    for (const n of loose) {
      out.push(`  ${n.id} [label="${esc(n.label)}"];`)
    }
    for (const e of drawn) {
      out.push(`  ${id(e.from)} -> ${id(e.to)} [label="${esc(e.key)}"];`)
    }
    out.push('}')
  }
  else {
    // Entity relationships, as Mermaid's own erDiagram. Cardinality is
    // not something the model states, so every relationship is drawn
    // many-to-many and the label carries the predicate: drawing a
    // cardinality the model does not assert would be an invention. An
    // erDiagram has no separate label -- the identifier IS what the
    // reader sees -- so it is the encoded label, unique by the label
    // rule. Every node is in some relationship, since the node set is
    // what the edges connect.
    const esc = (s: string): string => escape(s, MERMAID_ESC)
    out.push('erDiagram')
    for (const e of drawn) {
      out.push(`  ${id(e.from)} }o--o{ ${id(e.to)} : "${esc(e.key)}"`)
    }
  }
  return { text: out.join('\n') }
}


// ---------------------------------------------------------------------
// The architecture layers: the classic stacked-band drawing

type Band = { name: string, nodes: GNode[] }


// THE LAYER DIAGRAM every architecture document has a hand-drawn
// version of: one band per layer, the layers stacked with the one
// nothing depends on at the top, each module in its band, and the
// rule -- dependencies point DOWN -- read off the bands. The band a
// node belongs to is the value of `--group-by`; the order of the
// bands is DERIVED from the relation, as the partition order over the
// layer-level graph (a layer depends on the layers its modules depend
// on), so it is a function of the model and not of a list somebody has
// to keep in step with it -- unless the model has an upward edge, when
// the layer graph is cyclic and no order is derivable, which is what
// `--layers` (top first) is for. A sideways edge (within one band) is
// ordinary engineering and counted; an UPWARD edge is the violation
// the drawing exists to show, and is named under the figure.
function drawLayer(
  triples: Triple[], root: any,
  o: {
    relation?: string, groupBy?: string, layers: string[],
    edges?: ViewEdges, as: ViewProfile,
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
  const paths = nodesOf(rel)
  if (max < paths.length) {
    return { errors: [rowsFinding(paths.length, max, '--at or --relation')] }
  }
  const lab = labelsOf(paths)

  // A node whose layer field is unresolved is counted and drawn in a
  // band of its own at the bottom, named `-`.
  const unresolved: string[] = []
  const nodes: GNode[] = paths.map((p) => {
    const short = lab.get(p) as string
    const g = fieldOf(root, p, o.groupBy as string)
    if (undefined === g) {
      unresolved.push(p + '.' + o.groupBy)
    }
    return { path: p, label: short, id: ident(short), group: g ?? '-' }
  })
  if (0 < unresolved.length) {
    loss.push({
      code: 'unresolved_field', count: unresolved.length,
      detail: unresolved.sort(cmpCodePoint),
    })
  }
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
  const bands: Band[] = order.map((name) => ({
    name,
    nodes: nodes.filter((n) => n.group === name).sort((a, b) =>
      cmpCodePoint(a.label, b.label)),
  }))
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
    // The description says WHAT WAS DRAWN, because two layer figures of
    // one model on one page differ by exactly that, and a reader who
    // cannot see them has only this to tell them apart.
    const drew = 'all' === edges
      ? `${shown.length} edges drawn, ${upward} of them upward`
      : 'none' === edges
        ? `${upward} upward edges, none drawn`
        : `${upward} upward edges`
    return {
      text: layerSvg(bands, shown, footer,
        `Architecture layers${over(relation)}: ${bands.length} bands, ${drew}`),
    }
  }
  if ('text' === o.as) {
    const w = widest(bands.map((b) => b.name))
    const rows = bands.map((b) =>
      pad(b.name, w) + '  ' + b.nodes.map((n) => n.label).join('  '))
    const inner = widest(rows)
    const rule = '+' + '-'.repeat(inner + 2) + '+'
    out.push(rule)
    for (const row of rows) {
      out.push('| ' + pad(row, inner) + ' |', rule)
    }
    out.push(...footer)
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


// The layers as SVG: one band per row, its modules as boxes laid left
// to right, and every SHOWN edge drawn between them -- an upward one
// dashed and alert-coloured, because it is the violation the bands
// cannot show on their own; a downward one straight down from the
// bottom of its box to the top of the one it names; a sideways one
// dipped below the boxes, since two modules of one band sit on the
// same line and a straight edge between them would cross whatever
// stands between.
function layerSvg(
  bands: Band[], shown: Drawing[], footer: string[], about: string
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
  return svgDoc(width, y1 + footer.length * LH + PAD, about, parts)
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


function renderPanel(p: Panel): string {
  const w = widest(p.names)
  const out: string[] = [p.header, '']
  const most = p.sizes.reduce((m, n) => Math.max(m, n), 0)
  p.names.forEach((n, i) => {
    out.push(pad(n, w) + '  ' +
      (p.bars ? pad('#'.repeat(p.sizes[i]), most) + '  ' : '') +
      String(p.sizes[i]))
  })
  out.push('')
  p.names.forEach((n, i) => {
    out.push(pad(n, w) + ' | ' +
      p.cols.map((c) => c.sig[i] ? '*' : '.').join(' '))
  })
  out.push(pad('', w) + ' +' + '-'.repeat(2 * p.cols.length))
  if (p.bars) {
    const tallest = p.cols.reduce((m, c) => Math.max(m, c.items.length), 0)
    // The bars, tallest column first; a line ends at its last bar.
    for (let h = tallest; 0 < h; h--) {
      out.push((pad('', w) + ' |' +
        p.cols.map((c) => h <= c.items.length ? ' #' : '  ').join(''))
        .replace(/ +$/, ''))
    }
  }
  out.push(pad('', w) + '   ' +
    p.cols.map((c) => String(c.items.length)).join(' '))
  out.push('')
  p.cols.forEach((c, i) => {
    const shown = 4 < c.items.length && !p.bars
      ? c.items.slice(0, 3).join(' ') + ' ...' : c.items.join(' ')
    out.push(`  col ${i + 1}${p.bars ? '' : ` (${c.items.length})`}: ${shown}` +
      (c.sig.some((b) => b) ? '' : p.none))
  })
  return out.join('\n')
}


// The panel as SVG: the set sizes as bars, the intersections as a dot
// matrix (a filled dot where the set lies in the column), the column
// cardinalities as bars under it, and the columns' elements as text.
function panelSvg(p: Panel, about: string): string {
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
    lines.push(`col ${i + 1}${p.bars ? '' : ` (${c.items.length})`}: ${shown}` +
      (c.sig.some((b) => b) ? '' : p.none))
  })
  lines.forEach((l, i) => {
    parts.push(svgText(4, yI + i * LH + 14, 'av-t', l))
  })
  const width = Math.max(gx + p.cols.length * 20,
    gx + (p.bars ? most * 10 + 8 : 0) + 3 * CH,
    4 + widest(lines) * CH, 4 + p.header.length * CH) + PAD
  return svgDoc(width, yI + lines.length * LH + PAD, about, parts)
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
    minDegree?: number, maxCols?: number, as: ViewProfile,
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
  return {
    text: 'svg' === o.as
      ? panelSvg(panel, `Set panel over ${o.sets}: ${names.length} sets, ` +
        `${elements.size} elements, ${cols.length} intersections`)
      : renderPanel(panel),
  }
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
  o: { at?: string, minSize?: number, maxCols?: number, as: ViewProfile },
  max: number, loss: ViewLoss[]
): Figure {
  // Every path something met at AND THE DOCUMENT HAS A VALUE AT,
  // mapped to the documents that met there. A meet can happen at a
  // position the finished document does not have -- a template's own
  // child, folded into each key it is spread over -- and the panel is
  // about the document, so only its paths are rows. A path is shown
  // as `a.b.c`; the root as `$`.
  const members = new Map<string, Set<string>>()
  const paths: string[] = []
  const atParts = undefined === o.at ? [] : pathParts(o.at)
  for (const [key, rec] of prov.paths) {
    // A record at a position the document does not have is the Go
    // recorder's template ghost (use-cases/BUGS.md 70); this port's
    // recorder does not write one, and the two ports must skip the
    // same rows.
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
  return {
    text: 'svg' === o.as
      ? panelSvg(panel, `Document layers: ${names.length} documents, ` +
        `${paths.length} paths, ${cols.length} intersections`)
      : renderPanel(panel),
  }
}


// ---------------------------------------------------------------------
// The meet ladder (VIEWS-ORDER.0.md)

// The descent from `top` through each contribution to the resolved
// value, one rung per conjunct. Where the contributions are ranked
// preferences the ladder IS the arbitration: fewer stars win, so the
// rungs read weakest-first and the winner is the last before the
// value. `why`'s record is in source order, which is not rank order,
// so the rungs are SORTED -- an emitter that trusted the record would
// draw an arbitration that did not happen.
function drawLadder(
  src: string, options: ViewOptions, as: ViewProfile, max: number
): Figure {
  if (undefined === options.at) {
    return {
      errors: [finding('view_at_required', 'reference', '$',
        'The ladder needs the path to draw; name it with --at.')],
    }
  }
  const rep = why(src, options.at, { path: options.path, trust: options.trust })
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
    out.push('graph TD', '  top(("top"))')
    rungs.forEach((c, i) => {
      out.push(`  c${i}["${esc(c.canon)}<br/>${c.role} | ${esc(where(c))}"]`)
    })
    out.push(`  val{{"${esc(rep.record.value)}"}}`)
    let prev = 'top'
    rungs.forEach((_c, i) => {
      out.push(`  ${prev} --> c${i}`)
      prev = `c${i}`
    })
    out.push(`  ${prev} --> val`)
  }
  else {
    const esc = (s: string): string => escape(s, DOT_ESC)
    out.push('digraph G {', '  rankdir=TB;', '  node [shape=box];',
      '  top [shape=circle, label="top"];')
    rungs.forEach((c, i) => {
      out.push(
        `  c${i} [label="${esc(c.canon)}\\n${c.role} | ${esc(where(c))}"];`)
    })
    out.push(`  val [shape=hexagon, label="${esc(rep.record.value)}"];`)
    let prev = 'top'
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


// The order over a document set, in the design's five steps: the
// verdict matrix; the quotient by MUTUAL subsumption (two documents
// that subsume each other are one node -- mandatory, since without it
// the relation is not antisymmetric and the cover relation is
// undefined); the closure, then the cover relation over the closure;
// and a canonical order, so the result does not depend on the order the
// files were given.
// One pairwise comparison: does the general document admit everything
// the specific one does? `subsume`, with the poset's anchor and
// profile; a parameter so a test can hand the drawing a verdict matrix
// the checker cannot be made to produce.
export type ViewCompare = (
  general: Doc, specific: Doc, options: ViewOptions
) => { verdict: string, code: string }

const compareBySubsume: ViewCompare = (general, specific, options) => {
  const r = subsume(general.src, specific.src, {
    at: options.at, profile: options.profile,
    generalPath: general.path, specificPath: specific.path,
    trust: options.trust,
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
      // A pair the closure implies but the checker measured as
      // `does_not_subsume` is reported rather than absorbed: the
      // measured relation is a conservative under-approximation, and
      // an under-approximation of a transitive relation need not be
      // transitive.
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
function docFailure(d: Doc, options: ViewOptions): VetFinding[] {
  const loaded = load(d.src, d.path, options.trust, undefined)
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
  src: string, path: string | undefined, trust: TrustOptions | undefined,
  prov: Provenance | undefined
): Loaded {
  const aontu = new Aontu(null == trust ? undefined : { trust })
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
    return { verdict: lossy ? 'lossy' : 'rendered', kind, text: fig.text, loss }
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
  // Zero means the default, in both ports.
  const max = options.maxRows || DEFAULT_MAX_ROWS

  if ('poset' === kind) {
    const docs: Doc[] = [{ src, path: options.path }, ...(options.docs ?? [])]
      .map((d: ViewDoc, i) => ({
        src: d.src, path: d.path,
        label: d.name ?? (undefined === d.path
          ? `doc${i + 1}` : basename(d.path).replace(/\.aon$/, '')),
      }))
    return done(drawPoset(docs, options, as, max, loss, compare))
  }
  if ('ladder' === kind) {
    return done(drawLadder(src, options, as, max))
  }

  const prov = 'layers' === kind
    ? (hooks?.provenance ?? (() => new Provenance()))() : undefined
  const loaded = load(src, options.path, options.trust, prov)
  if (undefined !== loaded.errors) {
    return done({ errors: loaded.errors })
  }
  return done(drawLoaded(loaded.root, loaded.ctx, undefined, prov,
    kind, as, options, max, loss))
}


// THE KINDS THAT DRAW FROM A LOADED MODEL, so a view document can load
// once and draw N figures from the one evaluation. `gen` is the
// generated value where the caller already holds it -- a view document
// reads its own declarations out of one -- and undefined where the set
// panel must generate its own. It is a BOX rather than the value, so
// that a document generating `undefined` is still a value the panel
// has rather than one it must recompute.
function drawLoaded(
  root: any, ctx: any, gen: { value: any } | undefined,
  prov: Provenance | undefined,
  kind: ViewKind, as: ViewProfile, options: ViewOptions,
  max: number, loss: ViewLoss[]
): Figure {
  if ('layers' === kind) {
    return drawLayers(prov as Provenance, root, options.path,
      { ...options, as }, max, loss)
  }
  if ('sets' === kind) {
    if (undefined === options.sets || undefined === options.member) {
      return {
        errors: [finding('view_sets_required', 'reference', '$',
          'The set panel needs --sets and --member.')],
      }
    }
    let value = gen?.value
    if (undefined === gen) {
      // GENERATION CAN FAIL WHERE UNIFICATION DID NOT: the panel reads
      // generated values, so a document that is not concrete is an
      // error here, exactly as `aontu file.aon` on it is.
      const before = ctx.err.length
      value = root.gen(ctx)
      if (before < ctx.err.length) {
        const err: any = ctx.err[before]
        return {
          errors: [finding(err?.why ?? 'unify_failed', 'reference', '$',
            err?.msg ?? 'The document does not generate.')],
        }
      }
    }
    return drawSets(value, {
      sets: options.sets, member: options.member, universe: options.universe,
      minDegree: options.minDegree, maxCols: options.maxCols, as,
    }, max, loss)
  }

  const triples = triplesOf(graphOf(root), options.at, loss)
  const decls: RelDecls = ctx._reldecls
  // An empty relation name is no relation, so both ports read it as
  // "every relation" rather than one that names nothing.
  const relation = options.relation || undefined
  if ('matrix' === kind) {
    return drawMatrix(triples, decls, {
      relation, order: options.order ?? 'canon', closure: true === options.closure,
      as,
    }, max, loss)
  }
  if ('graph' === kind) {
    return drawGraph(triples, decls, root, {
      relations: options.relations ?? [], groupBy: options.groupBy,
      label: options.label, as,
    }, max, loss)
  }
  if ('layer' === kind) {
    return drawLayer(triples, root, {
      relation, groupBy: options.groupBy, layers: options.layers ?? [],
      edges: options.edges, as,
    }, max, loss)
  }
  return drawTree(
    collapse(triples, relation), relation, options.roots ?? [], max, as)
}


// The tree view of one document: `view` with the kind fixed.
export function viewTree(src: string, opts?: ViewOptions): ViewReport {
  return view(src, { ...(opts ?? {}), kind: 'tree' })
}


// ---------------------------------------------------------------------
// The view document (VIEWS.0.md, "6. The view document")
//
// A projection that runs in CI belongs in a file. A view document is an
// ORDINARY document that includes the model and declares its figures as
// data; `views` is the AUTHOR's key and nothing here knows the name
// (ADR-010), which is why `--views` names the path.
//
// The declaration keys ARE the library's option names, which are the
// CLI's flag names without the dashes: one vocabulary, three doors. A
// declaration must name its `kind` and its `out` -- a figure in a file
// that a review reads should say what it draws and where it goes,
// rather than inheriting a default from whoever ran the verb.

const DECL_TEXT = [
  'kind', 'as', 'out', 'at', 'relation', 'order', 'groupBy', 'label',
  'sets', 'member', 'universe', 'edges',
]

// The options whose values are a closed set. A view document is the
// artifact CI reads, so a typo here is a refusal rather than a silent
// fall back to the default.
const DECL_ENUM: Record<string, string[]> = {
  order: ['canon', 'partition'],
  edges: ['upward', 'all', 'none'],
}
const DECL_COUNT = ['maxRows', 'maxCols', 'minDegree', 'minSize']
const DECL_FLAG = ['closure']
const DECL_LIST = ['roots', 'relations', 'layers']

const DECL_KEYS = [...DECL_TEXT, ...DECL_COUNT, ...DECL_FLAG, ...DECL_LIST]
  .sort(cmpCodePoint)


function documentFinding(path: string, message: string, note?: string): VetFinding {
  return finding('view_document_shape', 'reference', path, message, note)
}


// One validated declaration: everything the drawing needs, decided
// before any figure is drawn, so a document with three bad
// declarations reports three faults rather than the first.
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
    // The poset is an order over SEVERAL documents, and a view document
    // declares figures of the one it includes. `aontu view poset` draws
    // it, naming the documents on the command line.
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


// N FIGURES OF ONE DOCUMENT. The document is evaluated ONCE, with the
// provenance recorder on, and every figure but the ladder draws from
// that one root; the ladder re-runs `why` by construction.
//
// The caller writes the files, and only when the whole set rendered:
// N figures of one model are only meaningful together, so a set whose
// third figure refuses must not leave the first two on disk.
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
  // ONE EVALUATION, and it is INSTRUMENTED: the layers panel reads the
  // provenance record, which is written during unification, so a set
  // that declares one would otherwise need a second run. Recording it
  // always costs a little and makes the one-evaluation claim true for
  // every kind but the ladder, which re-runs `why` by construction.
  const prov = (hooks?.provenance ?? (() => new Provenance()))()
  const loaded = load(src, options.path, options.trust, prov)
  if (undefined !== loaded.errors) {
    return { verdict: 'error', views: [], errors: loaded.errors }
  }
  const root = loaded.root
  const ctx = loaded.ctx
  // The declarations are part of the document, so reading them
  // generates it -- and a view document that does not generate has no
  // figures, exactly as `aontu file.aon` on it has no output.
  const before = ctx.err.length
  const value = root.gen(ctx)
  if (before < ctx.err.length) {
    const err: any = ctx.err[before]
    return {
      verdict: 'error', views: [],
      errors: [finding(err?.why ?? 'unify_failed', 'reference', '$',
        err?.msg ?? 'The document does not generate.')],
    }
  }
  const declared = genAt(value, at)
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

  const gen = { value }
  const views: ViewFigure[] = plans.map((plan) => {
    const loss: ViewLoss[] = []
    const each: ViewOptions = {
      ...plan.opts, path: options.path, trust: options.trust,
    }
    const fig: Figure = 'ladder' === plan.kind
      ? drawLadder(src, each, plan.as, plan.max)
      : drawLoaded(root, ctx, gen, prov, plan.kind, plan.as, each, plan.max, loss)
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
    }
  })

  const verdict: ViewVerdict = views.some((v) => 'error' === v.verdict)
    ? 'error' : views.some((v) => 'lossy' === v.verdict) ? 'lossy' : 'rendered'
  return { verdict, views }
}
