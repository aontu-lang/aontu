#!/usr/bin/env node
/* Copyright (c) 2026 Richard Rodger, MIT License */

// diagram.js --- draw an Aontu model, using only what SHIPS today.
//
// The diagram capability designed in docs/design/VIEWS.0.md and
// VIEWS-ORDER.0.md is not built: there is no `aontu view` and no
// `aontu order`. This script stands in for them so the use cases can
// carry real diagrams now, and so the design is validated against real
// models before any of it is committed to code.
//
// It uses the PUBLIC library surface and nothing else -- `graphOf`,
// `subsume`, `why` -- exactly as the designs say a view must (a view
// consumes a REPORT, never the Val tree, because Go's exported Val
// interface is five methods and a Val-walking view would be
// TypeScript-only on the day it landed).
//
// Every kind here is deterministic: nodes and edges are sorted by code
// point before emission, nothing iterates a map in insertion order, and
// no coordinate is computed. The output is text, so a use case pins it
// with a golden diff like any other artifact.
//
//   node diagram.js graph  [--primary KEY]... <entry.aon>
//   node diagram.js matrix [--primary KEY]... <entry.aon>
//   node diagram.js er     [--primary KEY]... <entry.aon>
//   node diagram.js tree   [--primary KEY]... [--root <$.a.b>]... <entry.aon>
//   node diagram.js ladder --path <$.a.b> <entry.aon>
//   node diagram.js poset  [--at <path>] [--profile P] <file.aon>...
//
// `--primary KEY` names the predicate to draw when two entities are
// joined by a declared inverse pair (`feeds` / `fedBy`). Without it the
// code-point-least key wins, which is deterministic but usually reads
// backwards. The proper rule -- draw the edge in the DECLARING
// direction -- needs the relation declarations, and `relation.ts`
// exports findings rather than declarations. That is a finding for the
// design, recorded in the use-case READMEs.

'use strict'

const Path = require('path')
const A = require(Path.join(__dirname, '..', '..', 'ts', 'dist', 'aontu.js'))
const Fs = require('fs')

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)


function load(file) {
  const dir = Path.dirname(Path.resolve(file))
  const aontu = new A.Aontu({ trust: { include: 'root', root: dir } })
  const src = Fs.readFileSync(file, 'utf8')
  return aontu.unify(src, { path: file }, aontu.ctx({}))
}


// The edge set, with declared inverse pairs collapsed to one logical
// edge. `graphOf` reports every written position, so a relation with a
// declared inverse arrives twice -- once per direction -- and drawing
// it raw doubles every such relation.
//
// WHAT IS NOT COLLAPSED IS A MUTUAL RELATION: `a dependsOn b` and `b
// dependsOn a` are two facts under ONE key, and folding them into a
// single undirected edge erases the shortest cycle a model can have.
// The collapse is therefore per KEY PAIR rather than per node pair --
// two keys facing each other are an inverse, one key facing itself is
// a loop -- which is what makes `acyclic()`'s refusal drawable.
function edges(val, primary) {
  const g = A.graphOf(val)

  // One directed edge per (from, to, key): the same link written at
  // several positions is one fact about the graph.
  const directed = new Map()
  for (const e of g.edges) {
    directed.set(e.from + '\u0000' + e.to + '\u0000' + e.key, e)
  }

  const pairs = new Map()
  for (const e of directed.values()) {
    const pair = [e.from, e.to].sort(cmp).join('\u0000')
    const group = pairs.get(pair)
    if (null == group) pairs.set(pair, [e])
    else group.push(e)
  }

  const out = []
  for (const group of pairs.values()) {
    const keysFrom = new Map()
    for (const e of group) {
      const seen = keysFrom.get(e.key)
      if (null == seen) keysFrom.set(e.key, new Set([e.from]))
      else seen.add(e.from)
    }

    // A key written in both directions stands on its own, in both.
    const mutual = [...keysFrom.keys()].filter((k) => 1 < keysFrom.get(k).size)
    for (const k of mutual.sort(cmp)) {
      for (const e of group.filter((x) => x.key === k)) {
        out.push({ from: e.from, to: e.to, label: k })
      }
    }

    // Everything else is the inverse case: one logical edge, drawn in
    // the direction the named primary predicate is written in;
    // otherwise the code-point-least key's direction, which is
    // arbitrary but stable.
    const rest = group.filter((e) => !mutual.includes(e.key))
    if (0 === rest.length) continue
    const keys = [...new Set(rest.map((e) => e.key))].sort(cmp)
    const chosen = keys.filter((k) => primary.includes(k))
    const winner = 0 < chosen.length ? chosen[0] : keys[0]
    const lead = rest.filter((e) => e.key === winner)[0]
    out.push({
      // With a primary named, the inverse is implied and naming both
      // just doubles the label. Without one, both are shown, because
      // picking silently would hide that two predicates are in play.
      from: lead.from, to: lead.to,
      label: 0 < chosen.length ? chosen.join('/') : keys.join('/'),
    })
  }

  return out.sort((x, y) =>
    cmp(x.from, y.from) || cmp(x.to, y.to) || cmp(x.label, y.label))
}


// THE NODE SET IS DERIVED FROM THE EDGES, since ADR-014.
//
// This used to read `graphOf(val).entities`, the entity index. There is
// no index any more: a node's address IS its path, so there is nothing
// left to index and the removal took the field with it. The node set is
// therefore every path an edge names at either end, deduplicated.
//
// That is a real narrowing and it is the right one. The index listed
// every DECLARED entity, including one nothing links to; this lists the
// nodes the relation graph actually connects. A diagram of a relation
// is a diagram of what participates in it, and an isolated vertex was
// never carrying information the edges did not.
function nodes(val) {
  const seen = new Set()
  for (const e of A.graphOf(val).edges) {
    seen.add(e.from)
    seen.add(e.to)
  }
  return [...seen].sort(cmp)
}


// A Mermaid identifier: letters, digits and underscore only, so an
// address that is legal in Aontu cannot break the diagram.
const mid = (s) => 'n_' + String(s).replace(/[^A-Za-z0-9_]/g, '_')


// THE SHORTEST SUFFIX THAT IS STILL UNIQUE, as a node's visible label.
//
// Since ADR-014 a node's name IS its path, and the paths in a real
// model are long: eight nodes labelled
// `$.catalog.domains.identity.services.auth` and its siblings is a
// correct diagram nobody can read. The label is therefore the fewest
// trailing segments that still tell this node from every other in the
// same diagram -- `auth` where that is unambiguous, `identity.auth`
// where it is not.
//
// The IDENTIFIER stays the full path (`mid` above), so shortening can
// never merge two nodes; only what a reader sees is shortened. And the
// rule is a function of the node SET, so a diagram is deterministic
// while two diagrams of different slices may label the same node
// differently -- which is correct, because uniqueness is a property of
// the set being drawn.
function labels(ns) {
  const segs = new Map(ns.map((n) => [n, n.replace(/^\$\.?/, '').split('.')]))
  const out = new Map()
  for (const n of ns) {
    const parts = segs.get(n)
    let label = n
    for (let take = 1; take <= parts.length; take++) {
      const cand = parts.slice(parts.length - take).join('.')
      const clash = ns.some((m) =>
        m !== n &&
        segs.get(m).slice(Math.max(0, segs.get(m).length - take)).join('.') === cand)
      if (!clash) {
        label = cand
        break
      }
    }
    out.set(n, label)
  }
  return out
}


function graph(val, primary) {
  const out = ['graph LR']
  const ns = nodes(val)
  const lab = labels(ns)
  for (const n of ns) {
    out.push('  ' + mid(n) + '["' + lab.get(n) + '"]')
  }
  for (const e of edges(val, primary)) {
    out.push('  ' + mid(e.from) + ' -->|"' + e.label + '"| ' + mid(e.to))
  }
  return out.join('\n')
}


// The dependency-structure matrix: a mark at (row, column) means the
// row entity depends on the column entity. Ghoniem, Fekete and
// Castagliola (InfoVis 2004) is the empirical result behind preferring
// this over node-link past about twenty vertices; Sangal et al. (OOPSLA
// 2005) is the software-dependency application.
function matrix(val, primary) {
  const ns = nodes(val)
  const es = edges(val, primary)
  const has = new Set(es.map((e) => e.from + '\u0000' + e.to))

  const lab = labels(ns)
  const label = (n) => lab.get(n)
  const w = Math.max(0, ...ns.map((n) => label(n).length))
  const idx = ns.map((_, i) => String(i + 1))
  const iw = Math.max(1, ...idx.map((s) => s.length))

  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))
  const lpad = (s, n) => ' '.repeat(Math.max(0, n - s.length)) + s

  const out = []
  out.push(pad('', w + 2 + iw + 1) + idx.map((s) => lpad(s, iw)).join(' '))
  ns.forEach((n, r) => {
    const cells = ns.map((m, c) =>
      lpad(r === c ? '\\' : (has.has(n + '\u0000' + m) ? 'X' : '.'), iw))
    out.push(pad(label(n), w) + '  ' + lpad(idx[r], iw) + ' ' + cells.join(' '))
  })
  return out.join('\n')
}


// Entity relationships, as Mermaid's own erDiagram. Cardinality is not
// something the model states, so every relationship is drawn
// many-to-many and the label carries the predicate. Drawing a
// cardinality the model does not assert would be an invention.
function er(val, primary) {
  const out = ['erDiagram']
  const ns = nodes(val)
  const es = edges(val, primary)
  const lab = labels(ns)
  // An erDiagram has no separate label: the identifier IS what the
  // reader sees. So this uses the short form, sanitised -- safe because
  // `labels` guarantees the short forms are distinct within the set,
  // which is exactly the uniqueness an identifier needs.
  const eid = (n) => mid(lab.get(n))
  const joined = new Set()
  for (const e of es) {
    joined.add(e.from)
    joined.add(e.to)
    out.push('  ' + eid(e.from) + ' }o--o{ ' + eid(e.to) + ' : "' + e.label + '"')
  }
  // A node in no relationship still belongs in the diagram.
  for (const n of ns) {
    if (!joined.has(n)) {
      out.push('  ' + eid(n) + ' {')
      out.push('  }')
    }
  }
  return out.join('\n')
}


// THE DEPENDENCY TREE: the same edges, walked from a root, indented.
//
// A dependency graph is a DAG and not a tree -- two modules may share
// a dependency, and drawing that shared node once under each parent is
// what makes `cargo tree` and `npm ls` readable rather than
// exponential. So this is a SPANNING WALK with two honest marks:
// `(*)` where a subtree is elided because the node was expanded
// earlier, and `(cycle)` where an edge closes a loop. The first is
// routine in a correct model -- a diamond is good engineering, not a
// fault. The second cannot arise from a model whose relation declares
// `acyclic()`, and is drawn rather than thrown because a renderer that
// hangs on a hostile input is a renderer that cannot be pointed at
// one.
//
// Which nodes are roots is DERIVED, not asked for: a root is a node
// nothing depends on. `--root` overrides that to draw one subtree.
// The order of everything -- roots, children, the choice of which
// occurrence of a shared node is the expanded one -- follows the label
// sort, so the drawing is a function of the model alone.
function tree(val, primary, roots) {
  // With a primary named, the tree is OVER THAT RELATION. The other
  // kinds draw every relation at once because a node-link diagram can
  // label each edge; a tree cannot without becoming unreadable, and
  // walking two relations as though they were one would draw a
  // containment that the model does not state.
  const kept = edges(val, primary).filter((e) =>
    0 === primary.length
    || e.label.split('/').some((k) => primary.includes(k)))

  // The node set is what the drawn relation CONNECTS, the rule the
  // node-link kinds follow above. A `--root` naming anything else is a
  // typo, and it is refused rather than drawn: an empty tree and a
  // misspelled address look identical in a golden file, so the one
  // that means nothing must not be renderable.
  const ns = new Set()
  for (const e of kept) {
    ns.add(e.from)
    ns.add(e.to)
  }
  const all = [...ns].sort(cmp)
  const lab = labels(all)

  const kids = new Map(all.map((n) => [n, []]))
  for (const e of kept) {
    kids.get(e.from).push({ to: e.to, label: e.label })
  }
  for (const list of kids.values()) {
    list.sort((x, y) => cmp(lab.get(x.to), lab.get(y.to)) || cmp(x.label, y.label))
  }

  // The relation is named on the branch only where more than one is
  // drawn. Naming the single relation on every line of a tree that has
  // exactly one is noise; leaving it off where there are two would
  // hide which edge was walked.
  const many = 1 < new Set(kept.map((e) => e.label)).size

  let start
  if (0 < roots.length) {
    for (const r of roots) {
      if (!ns.has(r)) {
        throw new Error('no such node: ' + r
          + ' (the ' + (0 < primary.length ? primary.join('/') + ' ' : '')
          + 'graph has ' + all.length + ')')
      }
    }
    start = roots.slice().sort((a, b) => cmp(lab.get(a), lab.get(b)))
  }
  else {
    const depended = new Set(kept.map((e) => e.to))
    start = all.filter((n) => !depended.has(n))
      .sort((a, b) => cmp(lab.get(a), lab.get(b)))
    // Every node depended upon by another: the graph is one or more
    // cycles and has no top. Drawing from every node is the honest
    // answer -- the `(cycle)` marks then say where the loops close.
    if (0 === start.length) {
      start = all.slice().sort((a, b) => cmp(lab.get(a), lab.get(b)))
    }
  }

  const out = []
  const expanded = new Set()

  const walk = (node, prefix, chain) => {
    const list = kids.get(node) || []
    list.forEach((edge, i) => {
      const last = i === list.length - 1
      const loop = chain.includes(edge.to)
      const seen = expanded.has(edge.to)
      const grown = 0 < (kids.get(edge.to) || []).length
      const mark = loop ? ' (cycle)' : (seen && grown ? ' (*)' : '')
      out.push(prefix + (last ? '└── ' : '├── ')
        + lab.get(edge.to)
        + (many ? ' (' + edge.label + ')' : '')
        + mark)
      if (loop || seen) return
      expanded.add(edge.to)
      walk(edge.to, prefix + (last ? '    ' : '│   '), [...chain, edge.to])
    })
  }

  start.forEach((root, i) => {
    if (0 < i) out.push('')
    out.push(lab.get(root))
    expanded.add(root)
    walk(root, '', [root])
  })

  return out.join('\n')
}


// The meet ladder: the descent from `top` through each contribution to
// the resolved value. `why`'s conjunct list is in the order the
// recorder saw the meets, which is NOT rank order, so it is sorted --
// an emitter that trusted the record's order would draw an arbitration
// that did not happen.
function ladder(file, path) {
  const dir = Path.dirname(Path.resolve(file))
  const rep = A.why(Fs.readFileSync(file, 'utf8'), path,
    { path: file, trust: { include: 'root', root: dir } })
  if (null == rep.record) {
    throw new Error('no provenance at ' + path
      + (rep.findings && rep.findings.length
        ? ': ' + rep.findings[0].code : ''))
  }
  const rec = rep.record

  // Rank is not a field of WhyConjunct (the design asks for one), so it
  // is recovered from the canon's leading stars -- the re-derivation
  // this repository refuses on principle, and the reason the design
  // names `WhyConjunct.rank` as a required addition.
  const rank = (c) => {
    const m = /^\**/.exec(c.canon)
    return m ? m[0].length : 0
  }

  const cs = rec.conjuncts.slice().sort((a, b) =>
    (rank(b) - rank(a))
    || cmp(a.site.file, b.site.file)
    || (a.site.row - b.site.row)
    || (a.site.col - b.site.col))

  const out = ['graph TD', '  top(("top"))']
  const esc = (s) => String(s).replace(/"/g, '#quot;')
  cs.forEach((c, i) => {
    const where = Path.basename(c.site.file || '') + ':' + c.site.row + ':' + c.site.col
    out.push('  c' + i + '["' + esc(c.canon) + '<br/>'
      + (c.role ? c.role + ' | ' : '') + esc(where) + '"]')
  })
  out.push('  val{{"' + esc(rec.value) + '"}}')
  out.push('  top --> c0')
  for (let i = 1; i < cs.length; i++) {
    out.push('  c' + (i - 1) + ' --> c' + i)
  }
  out.push('  c' + (cs.length - 1) + ' --> val')
  return out.join('\n')
}


// The subsumption poset over a set of documents. Steps, per
// VIEWS-ORDER.0.md: fill the verdict matrix, quotient by MUTUAL
// subsumption (two documents that subsume each other are one node --
// the hash is a sufficient identity and never a necessary one), take
// the cover relation over the CLOSURE, and emit in a canonical order.
function poset(files, opts) {
  const srcs = new Map()
  for (const f of files) {
    srcs.set(f, Fs.readFileSync(f, 'utf8'))
  }
  const label = (f) => Path.basename(f).replace(/\.aon$/, '')

  const verdict = new Map()
  for (const a of files) {
    for (const b of files) {
      if (a === b) continue
      const r = A.subsume(srcs.get(a), srcs.get(b), {
        at: opts.at, profile: opts.profile,
        generalPath: a, specificPath: b,
        trust: { include: 'root', root: Path.dirname(Path.resolve(a)) },
      })
      verdict.set(a + '\u0000' + b, r.verdict)
    }
  }
  const ge = (a, b) => 'subsumes' === verdict.get(a + '\u0000' + b)

  // Quotient by mutual subsumption.
  const classOf = new Map()
  const classes = []
  for (const f of files) {
    let found = null
    for (const cls of classes) {
      if (ge(f, cls.members[0]) && ge(cls.members[0], f)) { found = cls; break }
    }
    if (found) { found.members.push(f) }
    else { classes.push({ members: [f] }) }
  }
  classes.forEach((c) => {
    c.members.sort((x, y) => cmp(label(x), label(y)))
    c.label = c.members.map(label).join(' = ')
    c.members.forEach((m) => classOf.set(m, c))
  })
  classes.sort((x, y) => cmp(x.label, y.label))

  // The order between classes, then the cover relation over its closure.
  const above = (x, y) => ge(x.members[0], y.members[0])
  const rel = []
  for (const x of classes) {
    for (const y of classes) {
      if (x !== y && above(x, y)) rel.push([y, x]) // y <= x
    }
  }
  const covers = rel.filter(([lo, hi]) =>
    !rel.some(([a, mid2]) => a === lo && mid2 !== hi
      && rel.some(([b, c]) => b === mid2 && c === hi)))

  const id = new Map()
  classes.forEach((c, i) => id.set(c, 'n' + i))

  const out = []
  out.push('%% aontu subsumption poset'
    + (opts.at ? '  at=' + opts.at : '')
    + '  profile=' + (opts.profile || 'defaults')
    + '  documents=' + files.length + '  nodes=' + classes.length)
  out.push('graph BT')
  for (const c of classes) {
    out.push('  ' + id.get(c) + '["' + c.label + '"]')
  }
  const lines = covers
    .map(([lo, hi]) => '  ' + id.get(lo) + ' --> ' + id.get(hi))
    .sort(cmp)
  out.push(...lines)
  return out.join('\n')
}


function main(argv) {
  const kind = argv[0]
  const rest = argv.slice(1)
  const primary = []
  const roots = []
  let at, profile, path
  const files = []
  for (let i = 0; i < rest.length; i++) {
    if ('--primary' === rest[i]) { primary.push(rest[++i]) }
    else if ('--root' === rest[i]) { roots.push(rest[++i]) }
    else if ('--at' === rest[i]) { at = rest[++i] }
    else if ('--profile' === rest[i]) { profile = rest[++i] }
    else if ('--path' === rest[i]) { path = rest[++i] }
    else { files.push(rest[i]) }
  }

  if ('poset' === kind) {
    return poset(files, { at, profile })
  }
  if ('ladder' === kind) {
    return ladder(files[0], path)
  }
  const val = load(files[0])
  if ('graph' === kind) return graph(val, primary)
  if ('matrix' === kind) return matrix(val, primary)
  if ('er' === kind) return er(val, primary)
  if ('tree' === kind) return tree(val, primary, roots)
  throw new Error('unknown kind: ' + kind
    + ' (graph | matrix | er | tree | ladder | poset)')
}


try {
  process.stdout.write(main(process.argv.slice(2)) + '\n')
}
catch (e) {
  process.stderr.write('diagram: ' + e.message + '\n')
  process.exit(1)
}
