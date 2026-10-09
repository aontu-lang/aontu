"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PART_TOKEN = void 0;
exports.viewDefaultProfile = viewDefaultProfile;
exports.viewSplits = viewSplits;
exports.viewPartFile = viewPartFile;
exports.view = view;
exports.viewTree = viewTree;
exports.viewSet = viewSet;
const node_path_1 = require("node:path");
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
const graph_1 = require("./graph");
const keyorder_1 = require("./keyorder");
const provenance_1 = require("./provenance");
const query_1 = require("./query");
const subsume_1 = require("./subsume");
const utility_1 = require("./utility");
const SGR = {
    label: '', muted: '2', rule: '2', direct: '1', closure: '36',
    unmirrored: '33', upward: '31', repeat: '2', bar: '36', hole: '2',
};
const PLAIN = (_role, text) => text;
const ANSI = (role, text) => '' === SGR[role] || '' === text
    ? text : `\x1b[${SGR[role]}m${text}\x1b[0m`;
const painter = (style) => 'ansi' === style ? ANSI : PLAIN;
const styleOf = (style, as) => style ?? ('svg' === as ? 'css' : 'none');
// Each kind's profiles, the first being its default. There is no
// global default, because there is no sensible text form of a
// node-link drawing and no sensible Mermaid form of a matrix.
const PROFILES = {
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
};
// The profile a kind draws into when none is asked for. The CLI needs
// it to resolve `--style auto` BEFORE the library runs, since the
// mechanism is the profile's.
function viewDefaultProfile(kind) {
    return PROFILES[kind]?.[0];
}
// Loss codes that describe the drawing rather than a gap in it.
const INFORMATIONAL = [
    'edges_deduped', 'inverse_suppressed', 'crossings', 'edges_outside',
    'edges_internal', 'treemap_empty',
];
const DEFAULT_MAX_ROWS = 60;
// The separator inside a composite map key: a character no path holds.
const SEP = '\u0000';
// ---------------------------------------------------------------------
// Findings
function finding(code, cls, path, message, note) {
    return {
        code,
        class: cls,
        severity: 'error',
        path,
        message,
        sites: [],
        ...(undefined === note ? {} : { note }),
    };
}
function relationFinding(relation, have) {
    return finding('view_relation_unknown', 'reference', '$', `${relation} names no relation with edges in this document.`, 'relations with edges: ' + have.join(', '));
}
function rootFinding(root, relation, nodes) {
    return finding('refer_unresolved', 'reference', '$', `${root} is not a node of the ` +
        `${undefined === relation ? '' : relation + ' '}graph.`, 0 === nodes.length ? undefined : 'nodes in the graph: ' + nodes.join(', '));
}
// `--max-rows` is a REFUSAL, and the message names the narrowing
// options.
function rowsFinding(rows, max, narrow) {
    return finding('view_rows_exceeded', 'budget', '$', `The figure has ${rows} rows, above --max-rows ${max}; ` +
        `narrow it with ${narrow}, or raise the limit.`, `rows: ${rows}, max: ${max}`);
}
// An inline piece may not contain a line terminator: a line is a
// line, which is what makes every renderer a total fold.
function lineBreakFinding(path) {
    return finding('view_line_break', 'parse', path, 'A label holds a line terminator, which no figure line can carry.');
}
// A prefix test on PATHS, not strings: `$.a` covers `$.a.b` and `$.a`
// itself, and not `$.ab`.
function under(path, at) {
    return undefined === at || path === at || path.startsWith(at + '.');
}
function triplesOf(graph, at, loss) {
    const edges = graph.edges;
    const hidden = [];
    const seen = new Map();
    let positions = 0;
    for (const e of edges) {
        if (true === e.hidden) {
            hidden.push(e.at);
            continue;
        }
        if (!under(e.from, at) || !under(e.to, at)) {
            continue;
        }
        positions++;
        seen.set(e.from + SEP + e.key + SEP + e.to, { from: e.from, key: e.key, to: e.to });
    }
    if (0 < hidden.length) {
        loss.push({
            code: 'hidden_contribution', count: hidden.length,
            detail: hidden.sort(keyorder_1.cmpCodePoint),
        });
    }
    const undecided = (graph.disjunct ?? []).filter((p) => under(p, at));
    if (0 < undecided.length) {
        loss.push({
            code: 'edges_in_disjunct', count: undecided.length, detail: undecided,
        });
    }
    const out = [...seen.values()].sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.from, b.from) || (0, keyorder_1.cmpCodePoint)(a.key, b.key)
        || (0, keyorder_1.cmpCodePoint)(a.to, b.to));
    if (out.length < positions) {
        loss.push({
            code: 'edges_deduped', count: positions - out.length,
            detail: [`${positions} written positions -> ` +
                    `${out.length} distinct triples`],
        });
    }
    return out;
}
// The relations with edges, in code-point order.
function keysOf(triples) {
    return [...new Set(triples.map((e) => e.key))].sort(keyorder_1.cmpCodePoint);
}
// The node set is what the drawn edges CONNECT, in code-point order.
function nodesOf(triples) {
    const ns = new Set();
    for (const e of triples) {
        ns.add(e.from);
        ns.add(e.to);
    }
    return [...ns].sort(keyorder_1.cmpCodePoint);
}
function labelsOf(nodes) {
    const segs = new Map(nodes.map((n) => [n, n.replace(/^\$\.?/, '').split('.')]));
    const out = new Map();
    for (const n of nodes) {
        const parts = segs.get(n);
        for (let take = 1;; take++) {
            const cand = parts.slice(Math.max(0, parts.length - take)).join('.');
            const clash = nodes.some((m) => {
                const ms = segs.get(m);
                return m !== n &&
                    ms.slice(Math.max(0, ms.length - take)).join('.') === cand;
            });
            if (!clash) {
                out.set(n, cand);
                break;
            }
        }
    }
    return out;
}
// Reachability over a directed edge set: node -> the set of nodes it
// reaches in one or more steps. Iterative closure, O(n * e), which is
// nothing at the sizes a figure can hold.
function reachOf(nodes, succ) {
    const out = new Map();
    for (const n of nodes) {
        const seen = new Set();
        const stack = [...succ.get(n)];
        while (0 < stack.length) {
            const m = stack.pop();
            if (!seen.has(m)) {
                seen.add(m);
                stack.push(...succ.get(m));
            }
        }
        out.set(n, seen);
    }
    return out;
}
// ---------------------------------------------------------------------
// Text helpers, all on code units, none formatting a number
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
const lpad = (s, n) => ' '.repeat(Math.max(0, n - s.length)) + s;
const widest = (ss) => ss.reduce((w, s) => Math.max(w, s.length), 0);
// ---------------------------------------------------------------------
// Identifiers and escapes (VIEWS.0.md, "The renderers and the profiles")
function ident(name) {
    const letter = (c) => (65 <= c && c <= 90) || (97 <= c && c <= 122);
    const digit = (c) => 48 <= c && c <= 57;
    const cps = [...name].map((ch) => ch.codePointAt(0));
    const plain = 0 < cps.length && letter(cps[0]) &&
        cps.every((c) => letter(c) || digit(c) || 95 === c);
    if (plain) {
        return 'n_' + name;
    }
    let out = 'nq_';
    for (const c of cps) {
        out += letter(c) || digit(c)
            ? String.fromCodePoint(c) : '_' + lpad(c.toString(16), 2);
    }
    return out;
}
const MERMAID_ESC = {
    34: '#34;', 35: '#35;', 38: '#38;', 60: '#60;', 62: '#62;',
    123: '#123;', 124: '#124;', 125: '#125;',
};
const DOT_ESC = { 34: '\\"', 92: '\\\\' };
function escape(text, table) {
    let out = '';
    for (const ch of text) {
        const rep = table[ch.codePointAt(0)];
        out += undefined === rep ? ch : rep;
    }
    return out;
}
function hasLineBreak(text) {
    return /[\n\r\u2028\u2029]/.test(text);
}
const CH = 8;
const LH = 20;
const PAD = 8;
const SVG_ESC = {
    34: '&quot;', 38: '&amp;', 60: '&lt;', 62: '&gt;',
};
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
    '</style>';
const svgEsc = (s) => escape(s, SVG_ESC);
// The document: a viewBox the size of the figure, the style, and the
// parts, one per line, so the bytes read as a figure and diff as one.
function svgDoc(w, h, about, parts, style) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" class="av" viewBox="0 0 ${w} ${h}" ` +
            `width="${w}" height="${h}" role="img" aria-label="${svgEsc(about)}">`,
        ...('css' === style ? [SVG_STYLE] : []),
        ...parts,
        '</svg>',
    ].join('\n');
}
// A text run at a baseline. `anchor` is SVG's own vocabulary.
function svgText(x, y, cls, text, anchor) {
    return `<text x="${x}" y="${y}" class="${cls}"` +
        (undefined === anchor ? '' : ` text-anchor="${anchor}"`) +
        `>${svgEsc(text)}</text>`;
}
// The relation a figure is over, for its description; a document with
// no edges has none to name.
const over = (relation) => undefined === relation || '' === relation ? '' : ' over ' + relation;
function svgRect(x, y, w, h, cls) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"/>`;
}
function svgPath(d, cls) {
    return `<path d="${d}" class="${cls}"/>`;
}
function collapse(triples, relation) {
    const pairs = new Map();
    for (const e of triples) {
        const pair = [e.from, e.to].sort(keyorder_1.cmpCodePoint).join(SEP);
        const group = pairs.get(pair);
        if (undefined === group) {
            pairs.set(pair, [e]);
        }
        else {
            group.push(e);
        }
    }
    const out = [];
    for (const group of pairs.values()) {
        const keys = keysOf(group);
        const named = undefined !== relation && keys.includes(relation);
        const winner = named ? relation : keys[0];
        const label = named ? winner : keys.join('/');
        for (const e of group) {
            if (e.key === winner) {
                out.push({ from: e.from, to: e.to, label });
            }
        }
    }
    // One winner per pair, so (from, to) is unique and orders the set.
    return out.sort((x, y) => (0, keyorder_1.cmpCodePoint)(x.from, y.from) || (0, keyorder_1.cmpCodePoint)(x.to, y.to));
}
function drawTree(all, relation, roots, max, as, style) {
    const paint = painter(style);
    const kept = undefined === relation
        ? all : all.filter((e) => e.label === relation);
    if (undefined !== relation && 0 === kept.length && 0 < all.length) {
        const have = [...new Set(all.flatMap((e) => e.label.split('/')))]
            .sort(keyorder_1.cmpCodePoint);
        return { errors: [relationFinding(relation, have)] };
    }
    // The node set is what the drawn relation CONNECTS. A root naming
    // anything else is a typo, and it is refused rather than drawn.
    const nodes = nodesOf(kept);
    if (max < nodes.length) {
        return {
            errors: [rowsFinding(nodes.length, max, '--at, --relation or --root')],
        };
    }
    const lab = labelsOf(nodes);
    const label = (n) => lab.get(n);
    const kids = new Map(nodes.map((n) => [n, []]));
    for (const e of kept) {
        kids.get(e.from).push({ to: e.to, label: e.label });
    }
    for (const list of kids.values()) {
        list.sort((x, y) => (0, keyorder_1.cmpCodePoint)(label(x.to), label(y.to)));
    }
    const many = 1 < new Set(kept.map((e) => e.label)).size;
    const byLabel = (a, b) => (0, keyorder_1.cmpCodePoint)(label(a), label(b));
    let named;
    if (0 < roots.length) {
        const missing = roots.filter((r) => !kids.has(r));
        if (0 < missing.length) {
            return { errors: missing.map((r) => rootFinding(r, relation, nodes)) };
        }
        named = [...new Set(roots)].sort(byLabel);
    }
    else {
        const depended = new Set(kept.filter((e) => e.to !== e.from).map((e) => e.to));
        named = nodes.filter((n) => !depended.has(n)).sort(byLabel);
    }
    const out = [];
    const rows = [];
    const expanded = new Set();
    const draw = (root) => {
        if (0 < out.length) {
            out.push('');
            rows.push(null);
        }
        out.push(label(root));
        rows.push({ depth: 0, text: label(root), mark: '', parent: rows.length });
        expanded.add(root);
        const chain = new Set([root]);
        const stack = [{ node: root, prefix: '', at: 0, row: rows.length - 1 }];
        while (0 < stack.length) {
            const frame = stack[stack.length - 1];
            const list = kids.get(frame.node);
            if (frame.at >= list.length) {
                chain.delete(frame.node);
                stack.pop();
                continue;
            }
            const edge = list[frame.at++];
            const last = frame.at === list.length;
            const loop = chain.has(edge.to);
            const seen = expanded.has(edge.to);
            const grown = 0 < kids.get(edge.to).length;
            const text = label(edge.to) + (many ? ' (' + edge.label + ')' : '');
            const mark = loop ? ' (cycle)' : (seen && grown ? ' (*)' : '');
            out.push(paint('rule', frame.prefix + (last ? '└── ' : '├── '))
                + text + paint('repeat', mark));
            rows.push({ depth: stack.length, text, mark, parent: frame.row });
            if (loop || seen) {
                continue;
            }
            expanded.add(edge.to);
            chain.add(edge.to);
            stack.push({
                node: edge.to,
                prefix: frame.prefix + (last ? '    ' : '│   '),
                at: 0,
                row: rows.length - 1,
            });
        }
    };
    for (const root of named) {
        draw(root);
    }
    if (0 === roots.length) {
        for (const n of nodes) {
            if (!expanded.has(n)) {
                draw(n);
            }
        }
    }
    return {
        text: 'svg' === as
            ? treeSvg(rows, `Dependency tree: ${nodes.length} nodes`, style)
            : out.join('\n'),
    };
}
function treeSvg(rows, about, style) {
    const U = 24;
    const parts = [];
    let width = 0;
    rows.forEach((r, i) => {
        if (null === r) {
            return;
        }
        const y = i * LH;
        const x = r.depth * U + 4;
        if (0 < r.depth) {
            const px = (r.depth - 1) * U + 8;
            parts.push(svgPath(`M${px} ${r.parent * LH + LH}V${y + 10}H${x - 2}`, 'av-line'));
        }
        parts.push('' === r.mark
            ? svgText(x, y + 14, 'av-t', r.text)
            : `<text x="${x}" y="${y + 14}"><tspan class="av-t">${svgEsc(r.text)}` +
                `</tspan><tspan class="av-m">${svgEsc(r.mark)}</tspan></text>`);
        width = Math.max(width, x + (r.text.length + r.mark.length) * CH);
    });
    return svgDoc(width + PAD, rows.length * LH + PAD, about, parts, style);
}
// ---------------------------------------------------------------------
// The document tree
const LATTICE_PARENT = [
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
];
const LATTICE_COLS = ['string', 'path', 'integer', 'float', 'biginteger', 'bigdecimal',
    'boolean', 'null', 'map', 'list', 'constraint'];
// The rows, top to bottom. `any` and `nil` are the endpoints and are
// not kinds: no `superior()` answers either, and no entry above names
// them as a parent.
const LATTICE_ROWS = [
    ['any'],
    ['string', 'path', 'number', 'boolean', 'null', 'map', 'list',
        'constraint'],
    ['integer', 'float', 'biginteger', 'bigdecimal'],
    ['nil'],
];
const LATTICE_NODES = ['any', ...LATTICE_PARENT.map(([name]) => name), 'nil'];
// Every node at or above one, itself included.
function latticeAncestors(name) {
    const out = [name];
    for (let at = name; '' !== at;) {
        const row = LATTICE_PARENT.find(([child]) => child === at);
        at = undefined === row ? '' : row[1];
        if ('' !== at) {
            out.push(at);
        }
    }
    return out;
}
function latticeSpan(name) {
    const own = LATTICE_COLS.indexOf(name);
    if (-1 !== own) {
        return [own];
    }
    const under = LATTICE_COLS
        .map((col, i) => latticeAncestors(col).includes(name) ? i : -1)
        .filter((i) => -1 !== i);
    return 0 === under.length ? LATTICE_COLS.map((_, i) => i) : under;
}
function latticeCovers(parent, child) {
    return 'nil' === child
        ? -1 !== LATTICE_COLS.indexOf(parent)
        : LATTICE_PARENT.some(([c, p]) => c === child && p === parent);
}
function latticePoint(v) {
    const node = throughDoc(v);
    if (true === node?.isNil) {
        return 'nil';
    }
    if (true === node?.isTop) {
        return 'any';
    }
    // A field TYPED `constraint` holds a constraint. A residual such as
    // `integer & min(1)` is a region of its kind, not a point, and stays
    // unplaced.
    if (true === node?.isConstraintKind) {
        return 'constraint';
    }
    const name = true === node?.isScalarKind || true === node?.isContainerKind
        ? String(node.canon)
        : true === node?.isScalar ? String(node.superior?.().canon) : '';
    return LATTICE_NODES.includes(name) ? name : undefined;
}
// The document's own values, gathered by lattice node. Containers are
// walked but not placed: a map is not a scalar lattice citizen, and
// counting one at `any` would put every document's root there.
function latticeCensus(root, at) {
    const counts = new Map();
    const unplaced = [];
    const stack = [{ node: root, path: at }];
    while (0 < stack.length) {
        const { node, path } = stack.pop();
        const kids = docKids(node);
        if (0 < kids.length) {
            // A container is a shape, not a point: walk into it and place
            // what it holds.
            for (const key of kids) {
                stack.push({
                    node: throughDoc(throughDoc(node).peg[key]),
                    path: path + '.' + key,
                });
            }
            continue;
        }
        const point = latticePoint(node);
        if (undefined === point) {
            // AN EMPTY CONTAINER IS NEITHER A POINT NOR A SHAPE with
            // anything in it, and is no more unplaced than `{}` is a value:
            // skip it rather than report a loss a reader cannot act on.
            const inner = throughDoc(node);
            if (true !== inner?.isMap && true !== inner?.isList) {
                unplaced.push(path);
            }
            continue;
        }
        const there = counts.get(point) ?? [];
        there.push(path);
        counts.set(point, there);
    }
    for (const paths of counts.values()) {
        paths.sort(keyorder_1.cmpCodePoint);
    }
    unplaced.sort(keyorder_1.cmpCodePoint);
    return { counts, unplaced };
}
function latticeCell(counts, name) {
    const n = (counts.get(name) ?? []).length;
    return 0 === n ? name : `${name} (${n})`;
}
const LATTICE_GUTTER = 3;
function latticeCols(counts) {
    const w = LATTICE_COLS.map((col) => LATTICE_GUTTER + Math.max(...LATTICE_ROWS.flat()
        .filter((name) => {
        const span = latticeSpan(name);
        return 1 === span.length && col === LATTICE_COLS[span[0]];
    })
        .map((name) => latticeCell(counts, name).length)));
    let x = 0;
    const cx = w.map((n) => {
        const c = x + Math.floor(n / 2);
        x += n;
        return c;
    });
    return { cx, width: x };
}
// The centre of a node, from the columns it covers.
function latticeAt(name, cx) {
    const span = latticeSpan(name);
    return Math.round((cx[span[0]] + cx[span[span.length - 1]]) / 2);
}
const LATTICE_GLYPH = {
    '....': '─', '...d': '│', '..u.': '│', '..ud': '│',
    '.r..': '─', '.r.d': '┌', '.ru.': '└', '.rud': '├',
    'l...': '─', 'l..d': '┐', 'l.u.': '┘', 'l.ud': '┤',
    'lr..': '─', 'lr.d': '┬', 'lru.': '┴', 'lrud': '┼',
};
function latticeText(counts, style) {
    const paint = painter(style);
    const { cx, width } = latticeCols(counts);
    const canvas = [];
    const roles = [];
    const put = (y, x, text, role) => {
        while (canvas.length <= y) {
            canvas.push(new Array(width).fill(' '));
            roles.push(new Array(width).fill('label'));
        }
        for (let i = 0; i < text.length; i++) {
            canvas[y][x + i] = text[i];
            roles[y][x + i] = role;
        }
    };
    const cell = (y, name) => {
        const text = latticeCell(counts, name);
        const left = latticeAt(name, cx) - Math.floor(text.length / 2);
        put(y, left, name, 'label');
        put(y, left + name.length, text.slice(name.length), 'muted');
    };
    const stems = (y, at) => {
        for (const name of at) {
            put(y, latticeAt(name, cx), '│', 'rule');
        }
    };
    // The rule that joins one row to the next, plus the lines that pass
    // it by: a kind with nothing under it runs on down the OUTSIDE of the
    // fan, which the column order guarantees is clear of it.
    const rule = (y, up, down, by) => {
        const at = (names) => names.map((n) => latticeAt(n, cx));
        const [u, d] = [at(up), at(down)];
        const lo = Math.min(...u, ...d), hi = Math.max(...u, ...d);
        for (let x = lo; x <= hi; x++) {
            put(y, x, LATTICE_GLYPH[(x > lo ? 'l' : '.') + (x < hi ? 'r' : '.') +
                (u.includes(x) ? 'u' : '.') + (d.includes(x) ? 'd' : '.')], 'rule');
        }
        stems(y, by);
    };
    let open = [];
    let y = 0;
    for (let r = 0; r < LATTICE_ROWS.length; r++) {
        stems(y, open);
        for (const name of LATTICE_ROWS[r]) {
            cell(y, name);
        }
        open = [...open, ...LATTICE_ROWS[r]];
        if (LATTICE_ROWS.length - 1 === r) {
            break;
        }
        const next = LATTICE_ROWS[r + 1];
        const parents = open.filter((n) => next.some((k) => latticeCovers(n, k)));
        const by = open.filter((n) => !parents.includes(n));
        stems(y + 1, open);
        rule(y + 2, parents, next, by);
        open = by;
        y += 3;
    }
    return canvas.map((line, i) => {
        const bare = line.join('').replace(/\s+$/, '');
        let out = '', at = 0;
        while (at < bare.length) {
            let end = at;
            while (end < bare.length && roles[i][end] === roles[i][at]) {
                end++;
            }
            out += paint(roles[i][at], bare.slice(at, end));
            at = end;
        }
        return out;
    }).join('\n');
}
function latticeSvg(counts, at, style) {
    const ROWH = 3 * LH;
    const BOXH = 26;
    const { cx, width } = latticeCols(counts);
    const parts = [];
    const rowOf = new Map();
    LATTICE_ROWS.forEach((row, r) => row.forEach((name) => rowOf.set(name, r)));
    const x = (name) => PAD + latticeAt(name, cx) * CH;
    const y = (name) => PAD + BOXH / 2 + rowOf.get(name) * ROWH;
    const edges = [...LATTICE_PARENT,
        ...LATTICE_COLS.map((col) => ['nil', col])];
    for (const [child, parent] of edges) {
        const y2 = y(child) - BOXH / 2;
        parts.push(svgPath(`M${x(parent)} ${y(parent) + BOXH / 2}` +
            `V${y2 - (ROWH - BOXH) / 2}H${x(child)}V${y2}`, 'av-line'));
    }
    for (const name of LATTICE_ROWS.flat()) {
        const text = latticeCell(counts, name);
        const w = (text.length + 2) * CH;
        parts.push(svgRect(x(name) - w / 2, y(name) - BOXH / 2, w, BOXH, name === text ? 'av-cell' : 'av-box'));
        parts.push(`<text x="${x(name)}" y="${y(name) + 5}" text-anchor="middle">` +
            `<tspan class="av-t">${svgEsc(name)}</tspan>` +
            `<tspan class="av-m">${svgEsc(text.slice(name.length))}</tspan></text>`);
    }
    const placed = [...counts.values()].reduce((n, p) => n + p.length, 0);
    return svgDoc(width * CH + 2 * PAD, 2 * PAD + BOXH + (LATTICE_ROWS.length - 1) * ROWH, `Value lattice at ${at}: ${placed} value(s) placed`, parts, style);
}
const LATTICE_LINES = 3 * LATTICE_ROWS.length - 2;
function drawLattice(root, o, max, loss) {
    const at = o.at ?? '$';
    const anchor = (0, vet_1.anchorAt)(root, at);
    if (null == anchor) {
        // The same code and the same sentence `get` answers with, for the
        // same question.
        return {
            errors: [finding('no_path', 'reference', at, `The path ${at} names nothing in this document.`)],
        };
    }
    if (max < LATTICE_LINES) {
        return {
            errors: [finding('view_rows_exceeded', 'budget', '$', `The figure has ${LATTICE_LINES} rows, above --max-rows ${max}; ` +
                    'the value lattice is fixed, so raise the limit.', `rows: ${LATTICE_LINES}, max: ${max}`)],
        };
    }
    const { counts, unplaced } = latticeCensus(anchor, at);
    if (0 < unplaced.length) {
        // NOT A LOSS OF DETAIL BUT A LOSS OF PLACE: these values are real,
        // and the figure cannot say where they are because they are not
        // anywhere single. Named, not merely counted -- a reader who sees
        // `2` wants to know which two.
        loss.push({
            code: 'lattice_unplaced', count: unplaced.length, detail: unplaced,
        });
    }
    return {
        text: 'svg' === o.as
            ? latticeSvg(counts, at, o.style) : latticeText(counts, o.style),
    };
}
const DEFAULT_DOC_DEPTH = 3;
// A node's own children, as the anchor walk sees them: map keys sorted
// by code point, list indices in order, and nothing for a leaf.
function docKids(v) {
    const node = throughDoc(v);
    if (true === node?.isMap) {
        return Object.keys(node.peg)
            .filter((k) => !k.startsWith('%')).sort(keyorder_1.cmpCodePoint);
    }
    if (true === node?.isList) {
        return Object.keys(node.peg).filter((k) => /^[0-9]+$/.test(k));
    }
    return [];
}
// A preference wraps its value without being a level of its own, and
// `anchorAt` already steps through a sizing residue; this is the same
// unwrapping, for the shape walk.
function throughDoc(v) {
    // Every caller reaches this with a Val the anchor walk handed over,
    // so the node is never absent and the optional chain that would say
    // otherwise is an arm no test can take.
    const node = (0, vet_1.throughResidue)(v);
    return true === node.isPref ? throughDoc(node.peg) : node;
}
// What a leaf IS, in one short word: its canon, which for a constraint
// is the constraint and for a scalar its value. Long canons are cut,
// since the figure is the shape and not the data.
function docLeaf(v) {
    const canon = throughDoc(v).canon;
    return 32 < canon.length ? canon.slice(0, 29) + '...' : canon;
}
function drawDoc(root, o, max, loss) {
    const paint = painter(o.style);
    const at = o.at ?? '$';
    const anchor = (0, vet_1.anchorAt)(root, at);
    if (null == anchor) {
        return {
            // The same code and the same sentence `get` answers with: the
            // question is identical, so a caller that already handles one
            // handles the other.
            errors: [finding('no_path', 'reference', at, `The path ${at} names nothing in this document.`)],
        };
    }
    const depth = o.depth ?? DEFAULT_DOC_DEPTH;
    const out = [];
    const rows = [];
    let elided = 0;
    out.push(at);
    rows.push({ depth: 0, text: at, mark: '', parent: 0 });
    const stack = [
        { node: anchor, kids: docKids(anchor), at: 0, prefix: '', row: 0 },
    ];
    while (0 < stack.length) {
        const frame = stack[stack.length - 1];
        if (frame.at >= frame.kids.length) {
            stack.pop();
            continue;
        }
        const key = frame.kids[frame.at++];
        const last = frame.at === frame.kids.length;
        const child = throughDoc(throughDoc(frame.node).peg[key]);
        const kids = docKids(child);
        const under = stack.length < depth;
        const mark = 0 === kids.length ? ' ' + docLeaf(child)
            : under ? '' : ` (${kids.length})`;
        if (0 < kids.length && !under) {
            elided += kids.length;
        }
        out.push(paint('rule', frame.prefix + (last ? '└── ' : '├── ')) + key +
            paint('muted', mark));
        rows.push({ depth: stack.length, text: key, mark, parent: frame.row });
        if (max < rows.length) {
            return {
                errors: [rowsFinding(rows.length, max, '--at or --depth')],
            };
        }
        if (0 < kids.length && under) {
            stack.push({
                node: child, kids, at: 0,
                prefix: frame.prefix + (last ? '    ' : '│   '),
                row: rows.length - 1,
            });
        }
    }
    if (0 < elided) {
        loss.push({ code: 'depth_elided', count: elided });
    }
    return {
        text: 'svg' === o.as
            ? treeSvg(rows, `Document tree at ${at}: ${rows.length - 1} keys to depth ${depth}`, o.style)
            : out.join('\n'),
    };
}
// ---------------------------------------------------------------------
// The matrix (Ghoniem et al. 2004; Sangal et al. 2005)
function partition(nodes, succ, reach, label, loss) {
    const order = nodes.slice().sort((a, b) => (0, keyorder_1.cmpCodePoint)(label(a), label(b)));
    const placed = new Set();
    const out = [];
    const blocks = [];
    while (out.length < order.length) {
        const ready = order.filter((n) => !placed.has(n) &&
            succ.get(n).every((s) => s === n || placed.has(s)));
        if (0 < ready.length) {
            for (const n of ready) {
                placed.add(n);
                out.push(n);
            }
            continue;
        }
        const least = order.find((n) => !placed.has(n));
        const scc = order.filter((n) => !placed.has(n) && (n === least ||
            (reach.get(least).has(n) &&
                reach.get(n).has(least))));
        blocks.push(scc.map(label).join(' '));
        placed.add(least);
        out.push(least);
    }
    if (0 < blocks.length) {
        loss.push({ code: 'cycle_block', count: blocks.length, detail: blocks });
    }
    return out;
}
function pickRelation(relation, keys) {
    if (undefined !== relation) {
        return keys.includes(relation) || 0 === keys.length
            ? { relation } : { error: relationFinding(relation, keys) };
    }
    if (1 < keys.length) {
        return {
            error: finding('view_relation_ambiguous', 'reference', '$', 'The document has several relations with edges; ' +
                'name one with --relation.', 'relations with edges: ' + keys.join(', ')),
        };
    }
    // No edges at all: no relation, and the empty name says so, as it
    // does in the Go port.
    return { relation: keys[0] ?? '' };
}
function drawMatrix(triples, decls, o, max, loss) {
    const paint = painter(o.style);
    const picked = pickRelation(o.relation, keysOf(triples));
    if (undefined !== picked.error) {
        return { errors: [picked.error] };
    }
    const relation = picked.relation;
    const rel = triples.filter((e) => e.key === relation);
    const nodes = nodesOf(rel);
    if (max < nodes.length) {
        return { errors: [rowsFinding(nodes.length, max, '--at or --relation')] };
    }
    const lab = labelsOf(nodes);
    const label = (n) => lab.get(n);
    const succ = new Map(nodes.map((n) => [n, []]));
    const direct = new Set();
    for (const e of rel) {
        succ.get(e.from).push(e.to);
        direct.add(e.from + SEP + e.to);
    }
    const reach = reachOf(nodes, succ);
    // The `unmirrored` mark: an edge under a predicate that declares
    // `inverse(n)` whose mirror is absent from the full edge set. The
    // matrix shows in one glyph what `aontu relations` reports as
    // `relation_inverse_missing`, and both read one edge set.
    const inverses = [...(decls.get(relation)?.inverses ?? [])];
    const mirrored = (from, to) => 0 === inverses.length || triples.some((e) => e.from === to && e.to === from && inverses.includes(e.key));
    const order = 'partition' === o.order
        ? partition(nodes, succ, reach, label, loss)
        : nodes.slice().sort((a, b) => (0, keyorder_1.cmpCodePoint)(label(a), label(b)));
    const idx = order.map((_, i) => String(i + 1));
    const iw = widest(idx);
    const w = widest(order.map(label));
    const lines = [];
    // The index header, one line per digit when the count needs more
    // than one: the digits stack, most significant line first, so every
    // column stays one character wide.
    for (let d = 0; d < iw; d++) {
        lines.push(' '.repeat(w + 1 + iw + 1) +
            paint('muted', idx.map((s) => lpad(s, iw)[d]).join(' ')));
    }
    let above = 0;
    const grid = [];
    order.forEach((r, ri) => {
        const cells = order.map((c, ci) => {
            const isDirect = direct.has(r + SEP + c);
            if (isDirect && ci > ri) {
                above++;
            }
            // A SELF-DEPENDENCY is drawn on the diagonal rather than hidden
            // by it: it is the shortest cycle a model can have, and exactly
            // the fact a dependency matrix is read for.
            return isDirect ? (mirrored(r, c) ? 'X' : '!')
                : ri === ci ? '\\'
                    : o.closure && reach.get(r).has(c) ? '+' : '.';
        });
        grid.push(cells);
        lines.push(pad(label(r), w) + ' ' + paint('muted', lpad(idx[ri], iw)) + ' ' +
            cells.map((g) => paint(CELL_ROLE[g], g)).join(' '));
    });
    const footer = `# above-diagonal direct cells: ${above}`;
    lines.push(paint('muted', footer));
    if ('svg' === o.as) {
        return {
            text: matrixSvg(order.map(label), idx, grid, footer, `Dependency matrix${over(relation)}: ${order.length} rows, ` +
                `${above} direct cells above the diagonal`, o.style),
        };
    }
    return { text: lines.join('\n') };
}
// The matrix as SVG: the same glyph grid as cells, each a square whose
// class is its state, the diagonal drawn as a line through its cell.
const CELL_CLASS = {
    X: 'av-direct', '!': 'av-unmirrored', '+': 'av-closure',
    '.': 'av-cell', '\\': 'av-cell',
};
const CELL_ROLE = {
    X: 'direct', '!': 'unmirrored', '+': 'closure',
    '.': 'muted', '\\': 'rule',
};
function matrixSvg(labels, idx, grid, footer, about, style) {
    const S = 20;
    const w = widest(labels);
    const iw = widest(idx);
    const gutter = w * CH + 8 + iw * CH + 8;
    const y0 = LH + 4;
    const parts = [];
    idx.forEach((s, c) => {
        parts.push(svgText(gutter + c * S + 10, 14, 'av-m', s, 'middle'));
    });
    labels.forEach((l, r) => {
        const y = y0 + r * S;
        parts.push(svgText(4, y + 14, 'av-t', l));
        parts.push(svgText(gutter - 8, y + 14, 'av-m', idx[r], 'end'));
        grid[r].forEach((g, c) => {
            const x = gutter + c * S;
            parts.push(svgRect(x, y, S, S, CELL_CLASS[g]));
            if ('\\' === g) {
                parts.push(svgPath(`M${x} ${y}L${x + S} ${y + S}`, 'av-line'));
            }
        });
    });
    const n = labels.length;
    parts.push(svgText(4, y0 + n * S + 16, 'av-m', footer));
    const width = Math.max(gutter + n * S, 4 + footer.length * CH) + PAD;
    return svgDoc(width, y0 + n * S + LH + PAD, about, parts, style);
}
// A node's field, as label text: the value of a scalar leaf at
// `path.field`, taken as its canon for anything but a string. A value
// the document leaves open is `unresolved_field` rather than an error.
function fieldOf(root, path, field) {
    const v = (0, vet_1.anchorAt)(root, path + '.' + field);
    if (null == v || true !== v.isVal) {
        return undefined;
    }
    if ('string' === typeof v.peg) {
        return v.peg;
    }
    return true === v.isScalar ? v.canon : undefined;
}
function unresolvedLoss(unresolved, loss) {
    const detail = [...new Set(unresolved)].sort(keyorder_1.cmpCodePoint);
    if (0 < detail.length) {
        loss.push({ code: 'unresolved_field', count: detail.length, detail });
    }
}
// Every code point outside `keep` is `_`, its hex and `_` again, so the
// spelling is injective: `_` itself is never kept.
function spell(name, keep) {
    let out = '';
    for (const ch of name) {
        out += keep.test(ch) ? ch : `_${ch.codePointAt(0).toString(16)}_`;
    }
    return out;
}
function ghostLabel(label, where) {
    return '' === where ? label + ' (outside)' : `${label} (in ${where})`;
}
// The drawn nodes: what the edges connect and the members asked for.
function graphPaths(edges, members) {
    return [...new Set([...nodesOf(edges), ...members])].sort(keyorder_1.cmpCodePoint);
}
function graphNodes(paths, root, o, ghosts, unresolved) {
    const lab = labelsOf(paths);
    const nodes = paths.map((p) => {
        const short = lab.get(p);
        const where = ghosts.get(p);
        const node = { path: p, label: short, id: ident(short) };
        if (undefined !== o.groupBy) {
            const g = fieldOf(root, p, o.groupBy);
            if (undefined === g) {
                unresolved.push(p + '.' + o.groupBy);
            }
            else {
                node.group = g;
            }
        }
        if (undefined !== o.label) {
            const l = fieldOf(root, p, o.label);
            if (undefined === l) {
                unresolved.push(p + '.' + o.label);
            }
            else {
                node.label = l;
            }
        }
        if (undefined !== where) {
            node.ghost = true;
            node.id = 'x' + node.id;
            node.label = ghostLabel(node.label, where);
        }
        return node;
    });
    for (const n of nodes) {
        if (hasLineBreak(n.label) || hasLineBreak(n.group ?? '')) {
            return { error: lineBreakFinding(n.path) };
        }
    }
    return { nodes };
}
// A group's title: its name, and with `counts` its member count, and
// with `countBy` its members counted by that field's value. A ghost is
// not a member.
function groupTitle(name, members, root, o, unresolved) {
    const real = members.filter((n) => true !== n.ghost);
    if (undefined !== o.countBy) {
        const by = new Map();
        for (const n of real) {
            const v = fieldOf(root, n.path, o.countBy);
            if (undefined === v) {
                unresolved.push(n.path + '.' + o.countBy);
            }
            by.set(v ?? '-', (by.get(v ?? '-') ?? 0) + 1);
        }
        const parts = [...by.keys()].sort(keyorder_1.cmpCodePoint)
            .map((k) => `${k} ${by.get(k)}`);
        return 0 === parts.length ? `${name} (0)`
            : `${name} (${real.length}: ${parts.join(', ')})`;
    }
    return true === o.counts ? `${name} (${real.length})` : name;
}
function emitGraph(as, e) {
    const out = [];
    if ('mermaid' === as) {
        const esc = (s) => escape(s, MERMAID_ESC);
        out.push('flowchart LR');
        for (const g of e.groups) {
            out.push(`  subgraph ${g.id}["${esc(g.title)}"]`);
            for (const n of g.nodes) {
                out.push(`    ${n.id}["${esc(n.label)}"]`);
            }
            out.push('  end');
        }
        for (const n of e.loose) {
            out.push(`  ${n.id}["${esc(n.label)}"]`);
        }
        for (const d of e.edges) {
            out.push(`  ${d.from} -->|"${esc(d.label)}"| ${d.to}`);
        }
    }
    else if ('dot' === as) {
        const esc = (s) => escape(s, DOT_ESC);
        out.push('digraph G {', '  rankdir=LR;', '  node [shape=box];');
        for (const g of e.groups) {
            out.push(`  subgraph cluster_${g.id} {`, `    label="${esc(g.title)}";`);
            for (const n of g.nodes) {
                out.push(`    ${n.id} [label="${esc(n.label)}"];`);
            }
            out.push('  }');
        }
        for (const n of e.loose) {
            out.push(`  ${n.id} [label="${esc(n.label)}"];`);
        }
        for (const d of e.edges) {
            out.push(`  ${d.from} -> ${d.to} [label="${esc(d.label)}"];`);
        }
        out.push('}');
    }
    else {
        const esc = (s) => escape(s, MERMAID_ESC);
        out.push('erDiagram');
        if (undefined !== e.columns) {
            const cols = e.columns;
            for (const n of [...e.groups.flatMap((g) => g.nodes), ...e.loose]) {
                const attrs = cols.get(n.id);
                if (undefined === attrs) {
                    out.push(`  ${n.id}["${esc(n.label)}"]`);
                }
                else {
                    out.push(`  ${n.id}["${esc(n.label)}"] {`, ...attrs.map((a) => '    ' + a), '  }');
                }
            }
        }
        for (const d of e.edges) {
            out.push(`  ${d.from} }o--o{ ${d.to} : "${esc(d.label)}"`);
        }
    }
    return out.join('\n');
}
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
// One ER attribute line per column, typed by the lattice: the value's
// own point, else the kind its canon starts with, else `any` and the
// column is counted as unplaced.
function erColumns(root, node, field, unplaced) {
    const at = node.path + '.' + field;
    const holder = (0, vet_1.anchorAt)(root, at);
    if (null == holder || true !== throughDoc(holder).isMap) {
        return undefined;
    }
    const esc = (s) => escape(s, MERMAID_ESC);
    return docKids(holder).map((key) => {
        const v = throughDoc(throughDoc(holder).peg[key]);
        const canon = v.canon;
        const head = (/^[a-z]+/.exec(canon) ?? [''])[0];
        const fk = 'string' === typeof v.link;
        const type = true === v.isMap ? 'map'
            : true === v.isList ? 'list'
                : latticePoint(v) ?? (LATTICE_NODES.includes(head) ? head : 'any');
        if ('any' === type && true !== v.isTop) {
            unplaced.push(at + '.' + key);
        }
        const name = ATTR_NAME.test(key) && !key.startsWith('q_')
            ? key : 'q_' + spell(key, /[A-Za-z0-9]/);
        const note = name !== key ? key
            : fk || type === canon || true === v.isMap || true === v.isList
                ? '' : 32 < canon.length ? canon.slice(0, 29) + '...' : canon;
        return `${type} ${name}` + (fk ? ' FK' : '') +
            ('' === note ? '' : ` "${esc(note)}"`);
    });
}
function drawGraph(triples, decls, root, o, max, loss) {
    const keys = keysOf(triples);
    for (const r of o.relations) {
        if (!keys.includes(r)) {
            return { errors: [relationFinding(r, keys)] };
        }
    }
    const kept = 0 === o.relations.length
        ? triples : triples.filter((e) => o.relations.includes(e.key));
    // INVERSE SUPPRESSION: a hand-maintained mirror under a declared
    // `inverse(n)` is one fact drawn twice, so the mirror half is not
    // drawn and the count is reported. The declaring direction wins.
    const declared = (key, mirror) => true === decls.get(key)?.inverses.has(mirror);
    const edges = [];
    let suppressed = 0;
    for (const e of kept) {
        const mirror = kept.some((m) => m.from === e.to && m.to === e.from && declared(m.key, e.key));
        if (mirror) {
            suppressed++;
        }
        else {
            edges.push(e);
        }
    }
    if (0 < suppressed) {
        loss.push({ code: 'inverse_suppressed', count: suppressed });
    }
    const paths = graphPaths(edges, o.members);
    if (max < paths.length) {
        return { errors: [rowsFinding(paths.length, max, '--at or --relation')] };
    }
    // `--group-by` and `--label` read a field of each node; a node
    // without a value there is counted, and drawn ungrouped or under
    // its path.
    const unresolved = [];
    const built = graphNodes(paths, root, o, o.ghosts, unresolved);
    if (undefined !== built.error) {
        return { errors: [built.error] };
    }
    const nodes = built.nodes;
    // A ghost lives in another part, so no group of this one holds it.
    for (const n of nodes.filter((n) => true === n.ghost)) {
        delete n.group;
    }
    // Groups in label order, ids ordinal; nodes within a group, and the
    // ungrouped after them, in label order. That order is the emitted
    // order, and the crossing count is a property of it.
    const names = [...new Set(nodes.filter((n) => undefined !== n.group)
            .map((n) => n.group))].sort(keyorder_1.cmpCodePoint);
    const byLabel = (a, b) => (0, keyorder_1.cmpCodePoint)(a.label, b.label) || (0, keyorder_1.cmpCodePoint)(a.path, b.path);
    const groups = names.map((g, gi) => {
        const members = nodes.filter((n) => n.group === g).sort(byLabel);
        return {
            id: `g${gi}`,
            title: groupTitle(g, members, root, { counts: o.counts || o.collapse, countBy: o.countBy }, unresolved),
            nodes: members,
        };
    });
    const broken = groups.find((g) => hasLineBreak(g.title));
    if (undefined !== broken) {
        return { errors: [lineBreakFinding(broken.nodes[0].path)] };
    }
    const loose = nodes.filter((n) => undefined === n.group).sort(byLabel);
    const emitted = [...groups.flatMap((g) => g.nodes), ...loose];
    const byPath = new Map(nodes.map((n) => [n.path, n]));
    const node = (p) => byPath.get(p);
    if (true === o.collapse) {
        unresolvedLoss(unresolved, loss);
        return collapseGraph(groups, loose, edges, node, o.as, loss);
    }
    const at = new Map(emitted.map((n, i) => [n.path, i]));
    const drawn = edges.slice().sort((a, b) => (0, keyorder_1.cmpCodePoint)(node(a.from).label, node(b.from).label)
        || (0, keyorder_1.cmpCodePoint)(node(a.to).label, node(b.to).label)
        || (0, keyorder_1.cmpCodePoint)(a.key, b.key));
    let crossings = 0;
    const span = (e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        return a < b ? [a, b] : [b, a];
    };
    for (let i = 0; i < drawn.length; i++) {
        for (let j = i + 1; j < drawn.length; j++) {
            const [a1, b1] = span(drawn[i]);
            const [a2, b2] = span(drawn[j]);
            if ((a1 < a2 && a2 < b1 && b1 < b2) || (a2 < a1 && a1 < b2 && b2 < b1)) {
                crossings++;
            }
        }
    }
    if (0 < crossings) {
        loss.push({ code: 'crossings', count: crossings });
    }
    let columns;
    if ('er' === o.as && undefined !== o.columns) {
        columns = new Map();
        const unplaced = [];
        for (const n of emitted.filter((n) => true !== n.ghost)) {
            const attrs = erColumns(root, n, o.columns, unplaced);
            if (undefined === attrs) {
                unresolved.push(n.path + '.' + o.columns);
            }
            else {
                columns.set(n.id, attrs);
            }
        }
        if (0 < unplaced.length) {
            loss.push({ code: 'column_unplaced', count: unplaced.length, detail: unplaced });
        }
    }
    unresolvedLoss(unresolved, loss);
    return {
        text: emitGraph(o.as, {
            groups, loose, columns,
            edges: drawn.map((e) => ({
                from: node(e.from).id, to: node(e.to).id, label: e.key,
            })),
        }),
    };
}
// THE SURFACE MAP: one node per group, titled with its count, and one
// edge per (group, relation, group) labelled with how many edges it
// stands for. An edge inside one group is not drawn, and is counted.
function collapseGraph(groups, loose, edges, node, as, loss) {
    const home = new Map();
    for (const g of groups) {
        for (const n of g.nodes) {
            home.set(n.path, { id: g.id, label: g.title });
        }
    }
    const of = (p) => home.get(p) ?? { id: node(p).id, label: node(p).label };
    const tally = new Map();
    let internal = 0;
    for (const e of edges) {
        const a = of(e.from);
        const b = of(e.to);
        if (a.id === b.id && home.has(e.from)) {
            internal++;
            continue;
        }
        const k = a.id + SEP + e.key + SEP + b.id;
        const t = tally.get(k);
        if (undefined === t) {
            tally.set(k, {
                from: a.id, to: b.id, key: e.key, n: 1,
                order: a.label + SEP + b.label + SEP + e.key,
            });
        }
        else {
            t.n++;
        }
    }
    if (0 < internal) {
        loss.push({ code: 'edges_internal', count: internal });
    }
    const shown = [
        ...groups.map((g) => ({ path: g.id, id: g.id, label: g.title })),
        ...loose,
    ];
    return {
        text: emitGraph(as, {
            groups: [], loose: shown,
            columns: 'er' === as ? new Map() : undefined,
            edges: [...tally.values()]
                .sort((x, y) => (0, keyorder_1.cmpCodePoint)(x.order, y.order))
                .map((t) => ({ from: t.from, to: t.to, label: `${t.key} (${t.n})` })),
        }),
    };
}
function drawLayer(triples, root, o, max, loss) {
    if (undefined === o.groupBy) {
        return {
            errors: [finding('view_group_required', 'reference', '$', 'The layer diagram needs the field that names each node\'s layer; ' +
                    'name it with --group-by.')],
        };
    }
    const picked = pickRelation(o.relation, keysOf(triples));
    if (undefined !== picked.error) {
        return { errors: [picked.error] };
    }
    const relation = picked.relation;
    const rel = triples.filter((e) => e.key === relation);
    const paths = nodesOf(rel);
    if (max < paths.length) {
        return { errors: [rowsFinding(paths.length, max, '--at or --relation')] };
    }
    const lab = labelsOf(paths);
    // A node whose layer field is unresolved is counted and drawn in a
    // band of its own at the bottom, named `-`.
    const unresolved = [];
    const nodes = paths.map((p) => {
        const short = lab.get(p);
        const g = fieldOf(root, p, o.groupBy);
        if (undefined === g) {
            unresolved.push(p + '.' + o.groupBy);
        }
        return { path: p, label: short, id: ident(short), group: g ?? '-' };
    });
    for (const n of nodes) {
        if (hasLineBreak(n.group)) {
            return { errors: [lineBreakFinding(n.path)] };
        }
    }
    const byPath = new Map(nodes.map((n) => [n.path, n]));
    const node = (p) => byPath.get(p);
    // The layer-level graph, and its partition order: leaves first, so
    // the band nothing depends on is placed LAST and drawn at the top.
    const names = [...new Set(nodes.map((n) => n.group))]
        .filter((g) => '-' !== g).sort(keyorder_1.cmpCodePoint);
    const succ = new Map(names.map((g) => [g, []]));
    for (const e of rel) {
        const from = node(e.from).group;
        const to = node(e.to).group;
        if (from !== to && '-' !== from && '-' !== to
            && !o.layers.includes(from) && !o.layers.includes(to)) {
            succ.get(from).push(to);
        }
    }
    // Named bands first, in the order given; the rest derived, and the
    // unresolved band last.
    const given = o.layers.filter((g) => names.includes(g));
    const rest = names.filter((g) => !given.includes(g));
    const same = (g) => g;
    const order = given.concat(partition(rest, succ, reachOf(rest, succ), same, loss).reverse());
    if (nodes.some((n) => '-' === n.group)) {
        order.push('-');
    }
    // Labels are unique in a drawing, so they order a band on their own.
    const bands = order.map((name) => {
        const members = nodes.filter((n) => n.group === name).sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.label, b.label));
        return { name: groupTitle(name, members, root, o, unresolved), nodes: members };
    });
    const broken = bands.find((b) => hasLineBreak(b.name));
    if (undefined !== broken) {
        return { errors: [lineBreakFinding(broken.nodes[0].path)] };
    }
    unresolvedLoss(unresolved, loss);
    const level = new Map(order.map((g, i) => [g, i]));
    // Every edge is downward, sideways or upward by the bands it joins.
    const drawn = rel.slice().sort((a, b) => (0, keyorder_1.cmpCodePoint)(node(a.from).label, node(b.from).label)
        || (0, keyorder_1.cmpCodePoint)(node(a.to).label, node(b.to).label));
    let down = 0;
    let side = 0;
    const classed = drawn.map((e) => {
        const fi = level.get(node(e.from).group);
        const ti = level.get(node(e.to).group);
        if (fi < ti) {
            down++;
            return { edge: e, way: 'downward' };
        }
        if (fi === ti) {
            side++;
            return { edge: e, way: 'sideways' };
        }
        return { edge: e, way: 'upward' };
    });
    const upward = classed.filter((c) => 'upward' === c.way).length;
    // WHICH EDGES ARE SHOWN. Mermaid lays edges out itself and drew every
    // one before this option existed; the fixed grids drew the upward
    // ones, which are the violations the bands cannot show on their own.
    const edges = o.edges ?? ('mermaid' === o.as ? 'all' : 'upward');
    const shown = 'all' === edges ? classed
        : 'none' === edges ? []
            : classed.filter((c) => 'upward' === c.way);
    // A document with no edges has no relation to count under; the
    // footer names the absence as the panels do.
    const footer = [`# ${'' === relation ? '-' : relation}: ${down} downward, ` +
            `${side} sideways, ${upward} upward`];
    for (const c of shown) {
        footer.push(`# ${c.way}: ${node(c.edge.from).label} -> ` +
            `${node(c.edge.to).label}`);
    }
    const out = [];
    if ('svg' === o.as) {
        const drew = 'all' === edges
            ? `${shown.length} edges drawn, ${upward} of them upward`
            : 'none' === edges
                ? `${upward} upward edges, none drawn`
                : `${upward} upward edges`;
        return {
            text: layerSvg(bands, shown, footer, `Architecture layers${over(relation)}: ${bands.length} bands, ${drew}`, o.style),
        };
    }
    if ('text' === o.as) {
        const paint = painter(o.style);
        const w = widest(bands.map((b) => b.name));
        const rows = bands.map((b) => paint('muted', pad(b.name, w)) + '  ' +
            b.nodes.map((n) => n.label).join('  '));
        const inner = widest(bands.map((b) => pad(b.name, w) + '  ' + b.nodes.map((n) => n.label).join('  ')));
        const rule = paint('rule', '+' + '-'.repeat(inner + 2) + '+');
        out.push(rule);
        rows.forEach((row, i) => {
            // The row was padded from its UNPAINTED width, which the band
            // name's escapes do not change; `pad` would count them, so the
            // padding is computed here and appended.
            const bare = pad(bands[i].name, w) + '  ' +
                bands[i].nodes.map((n) => n.label).join('  ');
            out.push(paint('rule', '|') + ' ' + row +
                ' '.repeat(inner - bare.length) + ' ' + paint('rule', '|'), rule);
        });
        // The first footer line counts; the rest name one edge each, and
        // an upward edge is the violation the bands cannot show.
        out.push(paint('muted', footer[0]));
        footer.slice(1).forEach((f, i) => {
            out.push(paint('upward' === shown[i].way ? 'upward' : 'muted', f));
        });
    }
    else {
        const esc = (s) => escape(s, MERMAID_ESC);
        out.push('flowchart TB');
        bands.forEach((b, i) => {
            out.push(`  subgraph g${i}["${esc(b.name)}"]`, '    direction LR');
            for (const n of b.nodes) {
                out.push(`    ${n.id}["${esc(n.label)}"]`);
            }
            out.push('  end');
        });
        for (const c of shown) {
            out.push('upward' === c.way
                ? `  ${node(c.edge.from).id} -.->|"upward"| ${node(c.edge.to).id}`
                : `  ${node(c.edge.from).id} --> ${node(c.edge.to).id}`);
        }
    }
    return { text: out.join('\n') };
}
function layerSvg(bands, shown, footer, about, style) {
    const BH = 44;
    const gutter = widest(bands.map((b) => b.name)) * CH + 16;
    const box = new Map();
    let width = 0;
    bands.forEach((b, i) => {
        let x = gutter;
        for (const n of b.nodes) {
            const w = n.label.length * CH + 12;
            box.set(n.path, { x, y: 4 + i * BH + 10, w });
            x += w + 10;
        }
        width = Math.max(width, x - 10);
    });
    for (const f of footer) {
        width = Math.max(width, 4 + f.length * CH);
    }
    width += PAD;
    const parts = [];
    bands.forEach((b, i) => {
        const y = 4 + i * BH;
        parts.push(svgRect(4, y, width - 8, BH, 'av-cell'));
        parts.push(svgText(12, y + 27, 'av-m', b.name));
        for (const n of b.nodes) {
            const at = box.get(n.path);
            parts.push(svgRect(at.x, at.y, at.w, 24, 'av-box'));
            parts.push(svgText(at.x + 6, at.y + 16, 'av-t', n.label));
        }
    });
    if (0 < shown.length) {
        parts.push('<defs>' +
            '<marker id="av-arrow" viewBox="0 0 8 8" refX="8" refY="4" ' +
            'markerWidth="8" markerHeight="8" orient="auto">' +
            '<path d="M0 0L8 4L0 8Z" fill="var(--av-alert,#d1242f)"/></marker>' +
            '<marker id="av-tip" viewBox="0 0 8 8" refX="8" refY="4" ' +
            'markerWidth="8" markerHeight="8" orient="auto">' +
            '<path d="M0 0L8 4L0 8Z" fill="var(--av-rule,#8c959f)"/></marker>' +
            '</defs>');
    }
    for (const c of shown) {
        const from = box.get(c.edge.from);
        const to = box.get(c.edge.to);
        const fx = from.x + Math.floor(from.w / 2);
        const tx = to.x + Math.floor(to.w / 2);
        if ('upward' === c.way) {
            parts.push(`<path d="M${fx} ${from.y}L${tx} ${to.y + 24}" ` +
                'class="av-up" marker-end="url(#av-arrow)"/>');
        }
        else if ('downward' === c.way) {
            parts.push(`<path d="M${fx} ${from.y + 24}L${tx} ${to.y}" ` +
                'class="av-line" marker-end="url(#av-tip)"/>');
        }
        else {
            // Below the boxes and back up, staying inside the band.
            const y = from.y + 24;
            parts.push(`<path d="M${fx} ${y}V${y + 6}H${tx}V${y}" ` +
                'class="av-line" marker-end="url(#av-tip)"/>');
        }
    }
    const y1 = 4 + bands.length * BH + 4;
    footer.forEach((f, i) => {
        parts.push(svgText(4, y1 + i * LH + 14, 'av-m', f));
    });
    return svgDoc(width, y1 + footer.length * LH + PAD, about, parts, style);
}
// Elements grouped by their exact membership signature; columns by
// degree descending, then cardinality descending, then signature (the
// names of the sets it lies in) in code-point order. Elements within a
// column in code-point order.
function columnsOf(names, members, elements, shown) {
    const groups = new Map();
    const sorted = elements.slice().sort((a, b) => (0, keyorder_1.cmpCodePoint)(shown(a), shown(b)));
    for (const el of sorted) {
        const sig = names.map((n) => members.get(n).has(el));
        const key = sig.map((b) => b ? '1' : '0').join('');
        const col = groups.get(key);
        if (undefined === col) {
            groups.set(key, { sig, items: [shown(el)] });
        }
        else {
            col.items.push(shown(el));
        }
    }
    const degree = (c) => c.sig.filter((b) => b).length;
    const sigText = (c) => names.filter((_n, i) => c.sig[i]).join(' ');
    return [...groups.values()].sort((a, b) => degree(b) - degree(a) || b.items.length - a.items.length
        || (0, keyorder_1.cmpCodePoint)(sigText(a), sigText(b)));
}
function renderPanel(p, style) {
    const paint = painter(style);
    const w = widest(p.names);
    const out = [paint('muted', p.header), ''];
    const most = p.sizes.reduce((m, n) => Math.max(m, n), 0);
    p.names.forEach((n, i) => {
        // The bar is padded to `most` from its own length, so the pad is
        // written outside the painted run rather than counted inside it.
        const bar = '#'.repeat(p.sizes[i]);
        out.push(pad(n, w) + '  ' +
            (p.bars ? paint('bar', bar) + ' '.repeat(most - bar.length) + '  ' : '') +
            paint('muted', String(p.sizes[i])));
    });
    out.push('');
    p.names.forEach((n, i) => {
        out.push(pad(n, w) + ' ' + paint('rule', '|') + ' ' +
            p.cols.map((c) => c.sig[i] ? paint('direct', '*') : paint('hole', '.'))
                .join(' '));
    });
    out.push(pad('', w) + ' ' + paint('rule', '+' + '-'.repeat(2 * p.cols.length)));
    if (p.bars) {
        const tallest = p.cols.reduce((m, c) => Math.max(m, c.items.length), 0);
        // The bars, tallest column first; a line ends at its last bar. The
        // trailing blanks are trimmed BEFORE painting, so an escape can
        // never be what the trim leaves behind.
        for (let h = tallest; 0 < h; h--) {
            const cells = p.cols.map((c) => h <= c.items.length ? ' #' : '  ')
                .join('').replace(/ +$/, '');
            out.push(pad('', w) + ' ' + paint('rule', '|') +
                cells.replace(/#/g, () => paint('bar', '#')));
        }
    }
    out.push(pad('', w) + '   ' +
        paint('muted', p.cols.map((c) => String(c.items.length)).join(' ')));
    out.push('');
    p.cols.forEach((c, i) => {
        const shown = 4 < c.items.length && !p.bars
            ? c.items.slice(0, 3).join(' ') + ' ...' : c.items.join(' ');
        out.push(paint('muted', `  col ${i + 1}${p.bars ? '' : ` (${c.items.length})`}:`) +
            ` ${shown}` + (c.sig.some((b) => b) ? '' : paint('muted', p.none)));
    });
    return out.join('\n');
}
// The panel as SVG: the set sizes as bars, the intersections as a dot
// matrix (a filled dot where the set lies in the column), the column
// cardinalities as bars under it, and the columns' elements as text.
function panelSvg(p, about, style) {
    const w = widest(p.names);
    const most = p.sizes.reduce((m, n) => Math.max(m, n), 0);
    const parts = [svgText(4, 14, 'av-m', p.header)];
    const gx = w * CH + 8;
    const yS = LH + 8;
    p.names.forEach((n, i) => {
        const y = yS + i * LH;
        parts.push(svgText(4, y + 14, 'av-t', n));
        if (p.bars) {
            parts.push(svgRect(gx, y + 3, p.sizes[i] * 10, 14, 'av-bar'));
        }
        parts.push(svgText(gx + (p.bars ? most * 10 + 8 : 0), y + 14, 'av-m', String(p.sizes[i])));
    });
    const yM = yS + p.names.length * LH + 8;
    p.names.forEach((n, i) => {
        parts.push(svgText(4, yM + i * LH + 14, 'av-t', n));
        p.cols.forEach((c, ci) => {
            parts.push(`<circle cx="${gx + ci * 20 + 10}" cy="${yM + i * LH + 10}" r="5" ` +
                `class="${c.sig[i] ? 'av-dot' : 'av-hole'}"/>`);
        });
    });
    const yB = yM + p.names.length * LH + 4;
    const tallest = p.cols.reduce((m, c) => Math.max(m, c.items.length), 0);
    parts.push(svgPath(`M${gx} ${yB}H${gx + p.cols.length * 20}`, 'av-line'));
    p.cols.forEach((c, ci) => {
        parts.push(svgRect(gx + ci * 20 + 4, yB, 12, c.items.length * 8, 'av-bar'));
        parts.push(svgText(gx + ci * 20 + 10, yB + tallest * 8 + 14, 'av-m', String(c.items.length), 'middle'));
    });
    const yI = yB + tallest * 8 + LH + 4;
    const lines = [];
    p.cols.forEach((c, i) => {
        const shown = 4 < c.items.length && !p.bars
            ? c.items.slice(0, 3).join(' ') + ' ...' : c.items.join(' ');
        lines.push(`col ${i + 1}${p.bars ? '' : ` (${c.items.length})`}: ${shown}` +
            (c.sig.some((b) => b) ? '' : p.none));
    });
    lines.forEach((l, i) => {
        parts.push(svgText(4, yI + i * LH + 14, 'av-t', l));
    });
    const width = Math.max(gx + p.cols.length * 20, gx + (p.bars ? most * 10 + 8 : 0) + 3 * CH, 4 + widest(lines) * CH, 4 + p.header.length * CH) + PAD;
    return svgDoc(width, yI + lines.length * LH + PAD, about, parts, style);
}
// Elide the columns beyond `--max-cols`, counted. Zero means no limit,
// in both ports.
function elide(cols, maxCols, loss) {
    if (undefined === maxCols || 0 === maxCols || cols.length <= maxCols) {
        return cols;
    }
    loss.push({ code: 'cols_elided', count: cols.length - maxCols });
    return cols.slice(0, maxCols);
}
// The generated value at a path, walked plainly: the panel reads
// `generate()`, never the Val tree.
function genAt(gen, path) {
    let v = gen;
    for (const part of (0, query_1.pathParts)(path)) {
        if (null == v || 'object' !== typeof v) {
            return undefined;
        }
        v = v[part];
    }
    return v;
}
function shapeFinding(path, message) {
    return finding('view_sets_shape', 'reference', path, message);
}
const allStrings = (xs) => xs.every((x) => 'string' === typeof x);
function drawSets(gen, o, max, loss) {
    const family = genAt(gen, o.sets);
    if (null == family || 'object' !== typeof family || Array.isArray(family)) {
        return { errors: [shapeFinding(o.sets, 'The set family is not a map.')] };
    }
    const names = Object.keys(family).sort(keyorder_1.cmpCodePoint);
    if (max < names.length) {
        return { errors: [rowsFinding(names.length, max, '--sets')] };
    }
    const members = new Map();
    const elements = new Set();
    for (const n of names) {
        const list = family[n]?.[o.member];
        if (!Array.isArray(list) || !allStrings(list)) {
            return {
                errors: [shapeFinding(`${o.sets}.${n}.${o.member}`, 'A set\'s members must be a list of strings.')],
            };
        }
        members.set(n, new Set(list));
        for (const x of list) {
            elements.add(x);
        }
    }
    if (undefined !== o.universe) {
        // A universe MAP names its elements by ADDRESS -- `$.permissions`
        // holds `$.permissions.admin_all` -- which is what a member written
        // `path($.permissions.admin_all)` generates, so the two meet on the
        // path; a universe list names them as it lists them.
        const u = genAt(gen, o.universe);
        const all = Array.isArray(u) ? u
            : null != u && 'object' === typeof u
                ? Object.keys(u).map((k) => o.universe + '.' + k) : undefined;
        if (undefined === all || !allStrings(all)) {
            return {
                errors: [shapeFinding(o.universe, 'The universe must be a map or a list of strings.')],
            };
        }
        for (const x of all) {
            elements.add(x);
        }
    }
    // An element written as an address is shown by the shortest suffix
    // that tells it from every other address in the panel, as a node
    // is; one written as a plain string is shown as written.
    const addressed = [...elements].filter((x) => x.startsWith('$.')).sort(keyorder_1.cmpCodePoint);
    const short = labelsOf(addressed);
    const shown = (x) => short.get(x) ?? x;
    let cols = columnsOf(names, members, [...elements], shown);
    if (undefined !== o.minDegree) {
        const least = o.minDegree;
        cols = cols.filter((c) => least <= c.sig.filter((b) => b).length);
    }
    cols = elide(cols, o.maxCols, loss);
    // A set name or an element is a generated string, and a string can
    // hold a line terminator; no line of the panel can.
    const broken = [...names, ...elements].find(hasLineBreak);
    if (undefined !== broken) {
        return { errors: [lineBreakFinding(o.sets)] };
    }
    const panel = {
        header: `# upset  sets=${o.sets}(${names.length})  member=${o.member}` +
            `  elements=${elements.size}` +
            (undefined === o.universe ? '' : `  universe=${o.universe}`),
        names,
        sizes: names.map((n) => members.get(n).size),
        cols,
        bars: true,
        none: '   (in no set)',
    };
    return {
        text: 'svg' === o.as
            ? panelSvg(panel, `Set panel over ${o.sets}: ${names.length} sets, ` +
                `${elements.size} elements, ${cols.length} intersections`, o.style)
            : renderPanel(panel, o.style),
    };
}
// The file a contribution names, as the panel shows it: relative to
// the entry document's directory, the entry itself by its own name.
function docName(file, entry) {
    if ('' === file || file === entry) {
        return undefined === entry ? '-' : (0, node_path_1.basename)(entry);
    }
    return (0, node_path_1.isAbsolute)(file) && undefined !== entry
        ? (0, node_path_1.relative)((0, node_path_1.dirname)((0, node_path_1.resolve)(entry)), file) : file;
}
function drawLayers(prov, root, entry, o, max, loss) {
    const members = new Map();
    const paths = [];
    const atParts = undefined === o.at ? [] : (0, query_1.pathParts)(o.at);
    for (const [key, rec] of prov.paths) {
        if (0 === rec.conjuncts.length || null == (0, vet_1.anchorAt)(root, '$.' + key)) {
            continue;
        }
        const parts = '' === key ? [] : key.split('.');
        if (atParts.some((p, i) => parts[i] !== p)) {
            continue;
        }
        const shown = 0 === parts.length ? '$' : parts.join('.');
        paths.push(shown);
        for (const c of rec.conjuncts) {
            const d = docName(c.site.file, entry);
            let set = members.get(d);
            if (undefined === set) {
                set = new Set();
                members.set(d, set);
            }
            set.add(shown);
        }
    }
    const names = [...members.keys()].sort(keyorder_1.cmpCodePoint);
    if (max < names.length) {
        return { errors: [rowsFinding(names.length, max, '--at')] };
    }
    let cols = columnsOf(names, members, paths, (p) => p);
    if (undefined !== o.minSize) {
        const least = o.minSize;
        cols = cols.filter((c) => least <= c.items.length);
    }
    cols = elide(cols, o.maxCols, loss);
    const panel = {
        header: `# layers  file=${undefined === entry ? '-' : (0, node_path_1.basename)(entry)}` +
            `  documents=${names.length}  paths=${paths.length}`,
        names,
        sizes: names.map((n) => members.get(n).size),
        cols,
        bars: false,
        none: '',
    };
    return {
        text: 'svg' === o.as
            ? panelSvg(panel, `Document layers: ${names.length} documents, ` +
                `${paths.length} paths, ${cols.length} intersections`, o.style)
            : renderPanel(panel, o.style),
    };
}
// ---------------------------------------------------------------------
// The meet ladder (VIEWS-ORDER.0.md)
function drawLadder(src, options, as, max) {
    if (undefined === options.at) {
        return {
            errors: [finding('view_at_required', 'reference', '$', 'The ladder needs the path to draw; name it with --at.')],
        };
    }
    const rep = (0, query_1.why)(src, options.at, { path: options.path, trust: options.trust, textExt: options.textExt });
    if (undefined === rep.record) {
        return { errors: rep.findings };
    }
    const rungs = rep.record.conjuncts.slice().sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)
        || (0, keyorder_1.cmpCodePoint)(a.site.file, b.site.file)
        || a.site.row - b.site.row
        || a.site.col - b.site.col);
    if (max < rungs.length) {
        return { errors: [rowsFinding(rungs.length, max, 'a narrower --at')] };
    }
    const where = (c) => `${(0, node_path_1.basename)(c.site.file)}:${c.site.row}:${c.site.col}`;
    const out = [];
    if ('mermaid' === as) {
        const esc = (s) => escape(s, MERMAID_ESC);
        out.push('graph TD', '  any(("any"))');
        rungs.forEach((c, i) => {
            out.push(`  c${i}["${esc(c.canon)}<br/>${c.role} | ${esc(where(c))}"]`);
        });
        out.push(`  val{{"${esc(rep.record.value)}"}}`);
        let prev = 'any';
        rungs.forEach((_c, i) => {
            out.push(`  ${prev} --> c${i}`);
            prev = `c${i}`;
        });
        out.push(`  ${prev} --> val`);
    }
    else {
        const esc = (s) => escape(s, DOT_ESC);
        out.push('digraph G {', '  rankdir=TB;', '  node [shape=box];', '  any [shape=circle, label="any"];');
        rungs.forEach((c, i) => {
            out.push(`  c${i} [label="${esc(c.canon)}\\n${c.role} | ${esc(where(c))}"];`);
        });
        out.push(`  val [shape=hexagon, label="${esc(rep.record.value)}"];`);
        let prev = 'any';
        rungs.forEach((_c, i) => {
            out.push(`  ${prev} -> c${i};`);
            prev = `c${i}`;
        });
        out.push(`  ${prev} -> val;`, '}');
    }
    return { text: out.join('\n') };
}
const compareBySubsume = (general, specific, options) => {
    const r = (0, subsume_1.subsume)(general.src, specific.src, {
        at: options.at, profile: options.profile,
        generalPath: general.path, specificPath: specific.path,
        trust: options.trust, textExt: options.textExt,
    });
    return { verdict: r.verdict, code: r.findings[0]?.code ?? 'undecided' };
};
function drawPoset(docs, options, as, max, loss, compare) {
    const n = docs.length;
    const verdict = docs.map(() => docs.map(() => 'subsumes'));
    const code = docs.map(() => docs.map(() => ''));
    let broken = false;
    for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
            if (a === b) {
                continue;
            }
            const r = compare(docs[a], docs[b], options);
            verdict[a][b] = r.verdict;
            code[a][b] = r.code;
            broken = broken || 'error' === r.verdict;
        }
    }
    if (broken) {
        return { errors: docs.flatMap((d) => docFailure(d, options)) };
    }
    const ge = (a, b) => 'subsumes' === verdict[a][b];
    // Quotient by mutual subsumption; class labels joined by ` = `.
    const classes = [];
    for (let i = 0; i < n; i++) {
        const found = classes.find((c) => ge(i, c.members[0]) && ge(c.members[0], i));
        if (undefined === found) {
            classes.push({ members: [i], label: '' });
        }
        else {
            found.members.push(i);
        }
    }
    for (const c of classes) {
        c.members.sort((x, y) => (0, keyorder_1.cmpCodePoint)(docs[x].label, docs[y].label));
        c.label = c.members.map((m) => docs[m].label).join(' = ');
    }
    classes.sort((x, y) => (0, keyorder_1.cmpCodePoint)(x.label, y.label));
    if (max < classes.length) {
        return { errors: [rowsFinding(classes.length, max, 'fewer documents')] };
    }
    for (const c of classes) {
        if (hasLineBreak(c.label)) {
            return { errors: [lineBreakFinding('$')] };
        }
    }
    // closure[lo][hi]: hi subsumes lo, directly or by transitivity.
    const k = classes.length;
    const rep = (ci) => classes[ci].members[0];
    const closure = classes.map((_x, lo) => classes.map((_y, hi) => lo !== hi && ge(rep(hi), rep(lo))));
    for (let m = 0; m < k; m++) {
        for (let i = 0; i < k; i++) {
            for (let j = 0; j < k; j++) {
                if (closure[i][m] && closure[m][j]) {
                    closure[i][j] = true;
                }
            }
        }
    }
    const covers = [];
    const intransitive = [];
    for (let lo = 0; lo < k; lo++) {
        for (let hi = 0; hi < k; hi++) {
            if (!closure[lo][hi]) {
                continue;
            }
            if ('does_not_subsume' === verdict[rep(hi)][rep(lo)]) {
                intransitive.push(`${classes[lo].label} < ${classes[hi].label}`);
            }
            const viaMid = classes.some((_c, mid) => mid !== lo && mid !== hi && closure[lo][mid] && closure[mid][hi]);
            if (!viaMid) {
                covers.push([lo, hi]);
            }
        }
    }
    if (0 < intransitive.length) {
        loss.push({
            code: 'order_intransitive', count: intransitive.length,
            detail: intransitive,
        });
    }
    // An undecided pair with no proven order either way is a DASHED edge
    // in the queried direction, labelled with the reason; one proven one
    // way and undecided the other keeps its solid edge and is reported,
    // since the two may be equal and the checker cannot tell.
    const dashed = [];
    const maybeEqual = [];
    for (let g = 0; g < k; g++) {
        for (let s = 0; s < k; s++) {
            if (g === s || 'undecided' !== verdict[rep(g)][rep(s)]) {
                continue;
            }
            if (closure[s][g] || closure[g][s]) {
                maybeEqual.push(`${classes[s].label} ~ ${classes[g].label}`);
            }
            else {
                dashed.push([s, g, code[rep(g)][rep(s)]]);
            }
        }
    }
    if (0 < dashed.length) {
        loss.push({
            code: 'order_undecided', count: dashed.length,
            detail: dashed.map(([s, g, c]) => `${classes[s].label} ~ ${classes[g].label} (${c})`),
        });
    }
    if (0 < maybeEqual.length) {
        loss.push({
            code: 'order_maybe_equal', count: maybeEqual.length, detail: maybeEqual,
        });
    }
    const head = 'aontu subsumption poset' +
        (undefined === options.at ? '' : `  at=${options.at}`) +
        `  profile=${options.profile ?? 'defaults'}` +
        `  documents=${n}  nodes=${k}`;
    const out = [];
    if ('mermaid' === as) {
        const esc = (s) => escape(s, MERMAID_ESC);
        out.push('%% ' + head, 'graph BT');
        classes.forEach((c, i) => {
            out.push(`  n${i}["${esc(c.label)}"]`);
        });
        for (const [lo, hi] of covers) {
            out.push(`  n${lo} --> n${hi}`);
        }
        for (const [s, g, c] of dashed) {
            out.push(`  n${s} -.->|"${esc(c)}"| n${g}`);
        }
    }
    else {
        const esc = (s) => escape(s, DOT_ESC);
        out.push('// ' + head, 'digraph G {', '  rankdir=BT;', '  node [shape=box];');
        classes.forEach((c, i) => {
            out.push(`  n${i} [label="${esc(c.label)}"];`);
        });
        for (const [lo, hi] of covers) {
            out.push(`  n${lo} -> n${hi};`);
        }
        for (const [s, g, c] of dashed) {
            out.push(`  n${s} -> n${g} [style=dashed, label="${esc(c)}"];`);
        }
        out.push('}');
    }
    return { text: out.join('\n') };
}
// Why a poset could not be drawn: the documents that do not stand up
// on their own, each with its own finding, or the anchor a document
// lacks.
// ---------------------------------------------------------------------
// The lifecycle: states and the events between them
function drawState(triples, root, o, max, loss) {
    const keys = keysOf(triples);
    for (const r of o.relations) {
        if (!keys.includes(r)) {
            return { errors: [relationFinding(r, keys)] };
        }
    }
    const edges = 0 === o.relations.length
        ? triples : triples.filter((e) => o.relations.includes(e.key));
    const paths = graphPaths(edges, o.members);
    if (max < paths.length) {
        return { errors: [rowsFinding(paths.length, max, '--at or --relation')] };
    }
    for (const r of o.roots) {
        if (!paths.includes(r) || o.ghosts.has(r)) {
            return { errors: [rootFinding(r, undefined, paths)] };
        }
    }
    const unresolved = [];
    const built = graphNodes(paths, root, { label: o.label }, o.ghosts, unresolved);
    if (undefined !== built.error) {
        return { errors: [built.error] };
    }
    unresolvedLoss(unresolved, loss);
    const nodes = built.nodes.slice().sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.label, b.label) || (0, keyorder_1.cmpCodePoint)(a.path, b.path));
    const byPath = new Map(nodes.map((n) => [n.path, n]));
    const node = (p) => byPath.get(p);
    // An initial state is one named as a root, or else one no other
    // state enters; a final state one that leaves to no other. A ghost is
    // neither: its own edges are drawn where it lives.
    const real = nodes.filter((n) => true !== n.ghost);
    const initial = real.filter((n) => o.named
        ? o.roots.includes(n.path)
        : !edges.some((e) => e.to === n.path && e.from !== n.path));
    const final = real.filter((n) => !edges.some((e) => e.from === n.path && e.to !== n.path));
    const drawn = edges.slice().sort((a, b) => (0, keyorder_1.cmpCodePoint)(node(a.from).label, node(b.from).label)
        || (0, keyorder_1.cmpCodePoint)(a.key, b.key)
        || (0, keyorder_1.cmpCodePoint)(node(a.to).label, node(b.to).label));
    const out = [];
    if ('mermaid' === o.as) {
        const esc = (s) => escape(s, MERMAID_ESC);
        out.push('stateDiagram-v2');
        for (const n of nodes) {
            out.push(`  state "${esc(n.label)}" as ${n.id}`);
        }
        for (const n of initial) {
            out.push(`  [*] --> ${n.id}`);
        }
        for (const e of drawn) {
            out.push(`  ${node(e.from).id} --> ${node(e.to).id} : ${esc(e.key)}`);
        }
        for (const n of final) {
            out.push(`  ${n.id} --> [*]`);
        }
    }
    else {
        for (const n of initial) {
            out.push(`[*] --> ${n.label}`);
        }
        for (const e of drawn) {
            out.push(`${node(e.from).label} --${e.key}--> ${node(e.to).label}`);
        }
        for (const n of final) {
            out.push(`${n.label} --> [*]`);
        }
    }
    return { text: out.join('\n') };
}
// ---------------------------------------------------------------------
// The swim lanes: a flow's steps, one lane per actor
function drawLane(triples, root, o, max, loss) {
    if (undefined === o.groupBy) {
        return {
            errors: [finding('view_group_required', 'reference', '$', 'The swim lanes need the field that names each step\'s lane; ' +
                    'name it with --group-by.')],
        };
    }
    const keys = keysOf(triples);
    for (const r of o.relations) {
        if (!keys.includes(r)) {
            return { errors: [relationFinding(r, keys)] };
        }
    }
    const edges = 0 === o.relations.length
        ? triples : triples.filter((e) => o.relations.includes(e.key));
    const paths = graphPaths(edges, o.members);
    if (max < paths.length) {
        return { errors: [rowsFinding(paths.length, max, '--at or --relation')] };
    }
    const unresolved = [];
    const built = graphNodes(paths, root, o, o.ghosts, unresolved);
    if (undefined !== built.error) {
        return { errors: [built.error] };
    }
    const nodes = built.nodes;
    const byPath = new Map(nodes.map((n) => [n.path, n]));
    const node = (p) => byPath.get(p);
    // The steps in flow order: a step is placed once every step leading
    // to it is, least label first; a loop is entered at its least label,
    // and the edge that closes it runs back.
    const label = (p) => node(p).label;
    const byLabel = (a, b) => (0, keyorder_1.cmpCodePoint)(label(a), label(b)) || (0, keyorder_1.cmpCodePoint)(a, b);
    const steps = [];
    const placed = new Set();
    const waiting = paths.slice().sort(byLabel);
    while (steps.length < paths.length) {
        const free = waiting.find((p) => !placed.has(p) && edges.every((e) => e.to !== p || e.from === p || placed.has(e.from))) ??
            waiting.find((p) => !placed.has(p));
        placed.add(free);
        steps.push(free);
    }
    const lane = (n) => n.group ?? '-';
    const seen = [...new Set(steps.map((p) => lane(node(p))))];
    const named = o.layers.filter((g, i) => seen.includes(g) && i === o.layers.indexOf(g));
    const order = [
        ...named,
        ...seen.filter((g) => !named.includes(g) && '-' !== g),
        ...seen.filter((g) => '-' === g && !named.includes(g)),
    ];
    const lanes = order.map((g, gi) => {
        const members = steps.map(node).filter((n) => lane(n) === g);
        return {
            id: `g${gi}`, name: g,
            title: groupTitle(g, members, root, o, unresolved), nodes: members,
        };
    });
    const broken = lanes.find((l) => hasLineBreak(l.title));
    if (undefined !== broken) {
        return { errors: [lineBreakFinding(broken.nodes[0].path)] };
    }
    unresolvedLoss(unresolved, loss);
    const across = edges.filter((e) => lane(node(e.from)) !== lane(node(e.to)));
    const at = new Map(steps.map((p, i) => [p, i]));
    const drawn = edges.slice().sort((a, b) => at.get(a.from) - at.get(b.from)
        || at.get(a.to) - at.get(b.to)
        || (0, keyorder_1.cmpCodePoint)(a.key, b.key));
    if ('mermaid' === o.as) {
        const esc = (s) => escape(s, MERMAID_ESC);
        const out = ['flowchart LR'];
        for (const l of lanes) {
            out.push(`  subgraph ${l.id}["${esc(l.title)}"]`, '    direction LR');
            for (const n of l.nodes) {
                out.push(`    ${n.id}["${esc(n.label)}"]`);
            }
            out.push('  end');
        }
        for (const e of drawn) {
            out.push(`  ${node(e.from).id} -->|"${esc(e.key)}"| ${node(e.to).id}`);
        }
        return { text: out.join('\n') };
    }
    // One row per lane and one column per step, so each step is alone in
    // its column and the grid needs no placement beyond the flow order.
    const w = widest(lanes.map((l) => l.title));
    const cols = steps.map((p, i) => Math.max(node(p).label.length, String(i + 1).length));
    const cell = (s, i) => pad(s, cols[i]);
    const trim = (s) => s.replace(/ +$/, '');
    const out = [trim(pad('', w) + '  ' +
            steps.map((_p, i) => cell(String(i + 1), i)).join('  '))];
    for (const l of lanes) {
        out.push(trim(pad(l.title, w) + '  ' + steps.map((p, i) => cell(lane(node(p)) === l.name ? node(p).label : '.', i)).join('  ')));
    }
    const back = drawn.filter((e) => at.get(e.to) <= at.get(e.from));
    out.push(`# ${drawn.length} edges, ${across.length} across lanes, ` +
        `${back.length} back`);
    for (const e of drawn.filter((d) => across.includes(d) || back.includes(d))) {
        out.push(`# ${back.includes(e) ? 'back' : 'across'}: ` +
            `${node(e.from).label} -> ${node(e.to).label} (${e.key})`);
    }
    return { text: out.join('\n') };
}
// ---------------------------------------------------------------------
// The sequence: who sends what to whom, in the order the steps list it
function drawSequence(list, o, max, loss) {
    if (!Array.isArray(list)) {
        return {
            errors: [finding('view_steps_shape', 'reference', o.at, `${o.at} is not a list of steps.`)],
        };
    }
    if (max < list.length) {
        return { errors: [rowsFinding(list.length, max, '--steps')] };
    }
    const unresolved = [];
    const msgs = [];
    for (let i = 0; i < list.length; i++) {
        const step = list[i];
        const at = `${o.at}.${i}`;
        const a = step?.[o.from];
        const b = step?.[o.to];
        if ('string' !== typeof a || 'string' !== typeof b) {
            return {
                errors: [finding('view_steps_shape', 'reference', at, `A step needs a string at ${o.from} and at ${o.to}.`)],
            };
        }
        let text = '';
        if (undefined !== o.label) {
            const t = step[o.label];
            if ('string' === typeof t) {
                text = t;
            }
            else {
                unresolved.push(at + '.' + o.label);
            }
        }
        if (hasLineBreak(a) || hasLineBreak(b) || hasLineBreak(text)) {
            return { errors: [lineBreakFinding(at)] };
        }
        msgs.push({ a, b, text });
    }
    unresolvedLoss(unresolved, loss);
    // Participants in order of first appearance; an address is shown by
    // its shortest unique suffix, as every other figure shows a node.
    const who = [...new Set(msgs.flatMap((m) => [m.a, m.b]))];
    const lab = labelsOf(who.filter((p) => p.startsWith('$')));
    const name = (p) => lab.get(p) ?? p;
    const ix = new Map(who.map((p, i) => [p, i]));
    if ('mermaid' === o.as) {
        const esc = (s) => escape(s, MERMAID_ESC);
        const out = ['sequenceDiagram'];
        who.forEach((p, i) => out.push(`  participant p${i} as ${esc(name(p))}`));
        for (const m of msgs) {
            out.push(`  p${ix.get(m.a)}->>p${ix.get(m.b)}:` +
                ('' === m.text ? '' : ' ' + esc(m.text)));
        }
        return { text: out.join('\n') };
    }
    return { text: sequenceText(who.map(name), msgs.map((m) => ({
            a: ix.get(m.a), b: ix.get(m.b), text: m.text,
        }))) };
}
// THE LIFELINE GRID. Lifeline i sits at column x[i]; each gap is wide
// enough for the name above it and for every message spanning it, the
// shortfall of a span going to its last gap, so the counts alone set
// the columns.
function sequenceText(names, msgs) {
    const n = names.length;
    if (0 === n) {
        return '';
    }
    const len = (s) => [...s].length;
    const gap = names.map((s) => Math.max(len(s) + 2, 3));
    const x = () => {
        const xs = [0];
        for (let i = 1; i < n; i++) {
            xs.push(xs[i - 1] + gap[i - 1]);
        }
        return xs;
    };
    const spans = msgs.map((m) => m.a === m.b
        ? { lo: m.a, hi: m.a + 1, need: len(m.text) + 6 }
        : {
            lo: Math.min(m.a, m.b), hi: Math.max(m.a, m.b),
            need: len(m.text) + 5,
        })
        .filter((s) => s.hi < n)
        .sort((p, q) => p.hi - q.hi || p.lo - q.lo);
    for (const s of spans) {
        const xs = x();
        const short = s.need - (xs[s.hi] - xs[s.lo]);
        if (0 < short) {
            gap[s.hi - 1] += short;
        }
    }
    const xs = x();
    const width = xs[n - 1] + Math.max(len(names[n - 1]), 1 + msgs.reduce((w, m) => m.a === m.b && m.a === n - 1
        ? Math.max(w, len(m.text) + 5) : w, 0));
    const blank = () => {
        const row = Array(width).fill(' ');
        for (const c of xs) {
            row[c] = '│';
        }
        return row;
    };
    const put = (row, at, s) => {
        [...s].forEach((ch, i) => { row[at + i] = ch; });
    };
    const line = (row) => row.join('').replace(/ +$/, '');
    const head = Array(width).fill(' ');
    names.forEach((s, i) => put(head, xs[i], s));
    const out = [line(head), line(blank())];
    for (const m of msgs) {
        const label = '' === m.text ? '' : ` ${m.text} `;
        if (m.a === m.b) {
            const top = blank();
            const back = blank();
            put(top, xs[m.a], '├─' + label + '─┐');
            put(back, xs[m.a], '│◄' + '─'.repeat(len(label) + 1) + '┘');
            out.push(line(top), line(back));
            continue;
        }
        const row = blank();
        const lo = Math.min(m.a, m.b);
        const hi = Math.max(m.a, m.b);
        const span = xs[hi] - xs[lo] - 1;
        if (m.a < m.b) {
            const body = '─' + label;
            put(row, xs[lo], '├' + body + '─'.repeat(span - len(body) - 1) + '►');
        }
        else {
            const body = '◄─' + label;
            put(row, xs[lo] + 1, body + '─'.repeat(span - len(body)));
            row[xs[hi]] = '┤';
        }
        out.push(line(row));
    }
    out.push(line(blank()));
    return out.join('\n');
}
const TREEMAP_BAR = 40;
// A container weighs the scalar leaves under it, however deep.
function leafWeight(v) {
    const kids = docKids(v);
    if (0 === kids.length) {
        const node = throughDoc(v);
        return true === node.isMap || true === node.isList ? 0 : 1;
    }
    return kids.reduce((w, k) => w + leafWeight(throughDoc(throughDoc(v).peg[k])), 0);
}
function drawTreemap(root, o, max, loss) {
    const at = o.at ?? '$';
    const anchor = (0, vet_1.anchorAt)(root, at);
    if (null == anchor) {
        return {
            errors: [finding('no_path', 'reference', at, `The path ${at} names nothing in this document.`)],
        };
    }
    const unresolved = [];
    const weigh = (path, v) => {
        if (undefined === o.size) {
            return leafWeight(v);
        }
        const field = (0, vet_1.anchorAt)(root, path + '.' + o.size);
        const n = null == field ? undefined : throughDoc(field).peg;
        if (!Number.isSafeInteger(n) || 0 > n) {
            unresolved.push(path + '.' + o.size);
            return 0;
        }
        return n;
    };
    // With --size, a node holding the field is a tile weighed by it.
    const holds = (path) => undefined !== o.size && null != (0, vet_1.anchorAt)(root, path + '.' + o.size);
    const tile = (path, v, depth) => {
        const kids = docKids(v);
        const name = path.slice(path.lastIndexOf('.') + 1);
        if (0 === depth || 0 === kids.length || holds(path)) {
            return { name, weight: weigh(path, v), kids: [] };
        }
        const inner = kids.map((k) => tile(path + '.' + k, throughDoc(throughDoc(v).peg[k]), depth - 1));
        return {
            name, kids: inner, weight: inner.reduce((w, t) => w + t.weight, 0),
        };
    };
    // The items: the members asked for, or the anchor's children.
    const items = o.members ??
        docKids(anchor).map((k) => at + '.' + k);
    let top;
    if (undefined === o.groupBy && undefined === o.members) {
        top = tile(at, anchor, o.depth || DEFAULT_DOC_DEPTH);
        top.name = at;
    }
    else {
        const lab = labelsOf(items);
        const leaves = items.map((p) => ({
            name: lab.get(p), kids: [],
            weight: weigh(p, (0, vet_1.anchorAt)(root, p)),
            group: undefined === o.groupBy ? undefined : fieldOf(root, p, o.groupBy),
            path: p,
        }));
        let kids = leaves;
        if (undefined !== o.groupBy) {
            for (const l of leaves.filter((l) => undefined === l.group)) {
                unresolved.push(l.path + '.' + o.groupBy);
            }
            const names = [...new Set(leaves.map((l) => l.group ?? '-'))]
                .sort(keyorder_1.cmpCodePoint);
            kids = names.map((g) => {
                const inner = leaves.filter((l) => (l.group ?? '-') === g);
                return {
                    name: g, kids: inner, weight: inner.reduce((w, t) => w + t.weight, 0),
                };
            });
        }
        top = { name: at, kids, weight: kids.reduce((w, t) => w + t.weight, 0) };
    }
    unresolvedLoss(unresolved, loss);
    // A tile that weighs nothing has no area to draw, and is counted.
    let empty = 0;
    const prune = (t) => {
        const kids = t.kids.filter((k) => {
            if (0 === k.weight) {
                empty++;
            }
            return 0 < k.weight;
        }).map(prune);
        return { ...t, kids };
    };
    top = prune(top);
    if (0 < empty) {
        loss.push({ code: 'treemap_empty', count: empty });
    }
    const rows = [];
    const walk = (t, prefix, kidPrefix, depth) => {
        rows.push({ prefix, name: t.name, weight: t.weight, depth });
        t.kids.forEach((k, i) => {
            const last = i === t.kids.length - 1;
            walk(k, kidPrefix + (last ? '└── ' : '├── '), kidPrefix + (last ? '    ' : '│   '), depth + 1);
        });
    };
    walk(top, '', '', 0);
    if (max < rows.length) {
        return { errors: [rowsFinding(rows.length, max, '--at or --depth')] };
    }
    for (const r of rows) {
        if (hasLineBreak(r.name)) {
            return { errors: [lineBreakFinding(at)] };
        }
    }
    if ('mermaid' === o.as) {
        const esc = (s) => escape(s, MERMAID_ESC);
        const out = ['treemap-beta'];
        const emit = (t, depth) => {
            const ind = '    '.repeat(depth);
            out.push(0 === t.kids.length
                ? `${ind}"${esc(t.name)}": ${t.weight}`
                : `${ind}"${esc(t.name)}"`);
            for (const k of t.kids) {
                emit(k, depth + 1);
            }
        };
        for (const k of 0 === top.kids.length && 0 < top.weight ? [top] : top.kids) {
            emit(k, 0);
        }
        return { text: out.join('\n') };
    }
    const paint = painter(o.style);
    const total = top.weight;
    const w = widest(rows.map((r) => r.prefix + r.name));
    const nw = widest(rows.map((r) => String(r.weight)));
    return {
        text: rows.map((r) => {
            const bar = 0 === total ? 0
                : Math.max(1, Math.floor(r.weight * TREEMAP_BAR / total));
            return paint('rule', r.prefix) + r.name +
                ' '.repeat(w - (r.prefix + r.name).length) + '  ' +
                lpad(String(r.weight), nw) + '  ' + paint('bar', '█'.repeat(bar));
        }).join('\n'),
    };
}
function selectMembers(triples, of, member, ghosts, loss) {
    // The members of a node are what it, or any node under it, links
    // to: a map of groups selects every group's members.
    const out = triples.filter((e) => under(e.from, of));
    const links = undefined === member ? out : out.filter((e) => e.key === member);
    if (0 === links.length) {
        const have = keysOf(out);
        return {
            error: finding('view_members_none', 'reference', of, undefined === member
                ? `${of} links to nothing, so it has no members to draw.`
                : `${of} has no links under ${member}.`, 0 === have.length ? undefined : 'its links: ' + have.join(', ')),
        };
    }
    const members = [...new Set(links.map((e) => e.to))].sort(keyorder_1.cmpCodePoint);
    const inside = new Set(members);
    const kept = [];
    const away = new Map();
    let outside = 0;
    for (const e of triples) {
        if (under(e.from, of)) {
            continue;
        }
        const a = inside.has(e.from);
        const b = inside.has(e.to);
        if (a && b) {
            kept.push(e);
        }
        else if (a || b) {
            outside++;
            if (ghosts) {
                kept.push(e);
                away.set(a ? e.to : e.from, '');
            }
        }
    }
    if (0 < outside && !ghosts) {
        loss.push({ code: 'edges_outside', count: outside });
    }
    return { selection: { triples: kept, members, ghosts: away } };
}
const SPLIT_KINDS = ['graph', 'state', 'lane'];
function splitParts(sel, root, o, loss) {
    const all = graphPaths(sel.triples, sel.members ?? [])
        .filter((p) => !sel.ghosts.has(p));
    const inner = new Set(all);
    const lab = labelsOf(all);
    const byLabel = (a, b) => (0, keyorder_1.cmpCodePoint)(lab.get(a), lab.get(b));
    const sorted = all.slice().sort(byLabel);
    let parts;
    if (undefined !== o.splitBy) {
        const field = o.splitBy;
        const unresolved = [];
        const of = new Map();
        for (const p of sorted) {
            const v = fieldOf(root, p, field);
            if (undefined === v) {
                unresolved.push(p + '.' + field);
                continue;
            }
            of.set(v, [...(of.get(v) ?? []), p]);
        }
        // The split field may be a field the figure already read, so its
        // unresolved paths join the row the figure wrote.
        const row = loss.find((l) => 'unresolved_field' === l.code);
        if (undefined === row) {
            unresolvedLoss(unresolved, loss);
        }
        else {
            row.detail = [...new Set([...row.detail, ...unresolved])]
                .sort(keyorder_1.cmpCodePoint);
            row.count = row.detail.length;
        }
        parts = [...of.keys()].sort(keyorder_1.cmpCodePoint)
            .map((name) => ({ name, nodes: of.get(name) }));
    }
    else {
        // Each root takes what it reaches that no earlier root took, in
        // breadth-first order; what no root reaches (a cycle with no way
        // in) is taken from its least label in the same way.
        const succ = new Map(sorted.map((p) => [p, []]));
        const entered = new Set();
        for (const e of sel.triples) {
            if (inner.has(e.from) && inner.has(e.to) && e.from !== e.to) {
                succ.get(e.from).push(e.to);
                entered.add(e.to);
            }
        }
        for (const list of succ.values()) {
            list.sort(byLabel);
        }
        const taken = new Set();
        parts = [];
        const claim = (start) => {
            const nodes = [];
            const queue = [start];
            taken.add(start);
            while (0 < queue.length) {
                const p = queue.shift();
                nodes.push(p);
                for (const q of succ.get(p)) {
                    if (!taken.has(q)) {
                        taken.add(q);
                        queue.push(q);
                    }
                }
            }
            parts.push({ name: lab.get(start), nodes });
        };
        for (const p of sorted.filter((p) => !entered.has(p))) {
            claim(p);
        }
        for (const p of sorted) {
            if (!taken.has(p)) {
                claim(p);
            }
        }
        // A budget alone cuts the walk itself, so a part holds nodes that
        // reach each other wherever the budget allows.
        if (true !== o.splitRoots) {
            parts = [{ name: '', nodes: parts.flatMap((p) => p.nodes) }];
        }
    }
    const budget = o.budget ?? 0;
    if (0 === budget) {
        return parts;
    }
    const cut = [];
    for (const part of parts) {
        const n = Math.ceil(part.nodes.length / budget);
        for (let i = 0; i < n; i++) {
            cut.push({
                name: '' === part.name ? String(i + 1)
                    : 1 === n ? part.name : `${part.name}.${i + 1}`,
                nodes: part.nodes.slice(i * budget, (i + 1) * budget),
            });
        }
    }
    return cut;
}
// One part's own selection: its nodes, every edge touching one of
// them, and the far end of an edge that leaves the part drawn as a
// ghost naming the part it lives in.
function partSelection(sel, parts, part) {
    const home = new Map();
    for (const p of parts) {
        for (const n of p.nodes) {
            home.set(n, p.name);
        }
    }
    const mine = new Set(part.nodes);
    const ghosts = new Map();
    const triples = sel.triples.filter((e) => mine.has(e.from) || mine.has(e.to));
    for (const e of triples) {
        for (const end of [e.from, e.to]) {
            if (!mine.has(end)) {
                ghosts.set(end, home.get(end) ?? '');
            }
        }
    }
    return { triples, members: part.nodes, ghosts };
}
// The token a split figure's file name carries, replaced by each
// part's name made safe for a file system.
exports.PART_TOKEN = '{part}';
function viewSplits(o) {
    return '' !== (o.splitBy ?? '') || true === o.splitRoots || 0 < (o.budget ?? 0);
}
// Letters, digits, `.` and `-` stand, and a name of dots alone is
// spelled in full, so distinct part names never share a file.
function viewPartFile(out, name) {
    const safe = /^\.*$/.test(name)
        ? spell(name, /[^.]/) : spell(name, /[A-Za-z0-9.-]/);
    return out.split(exports.PART_TOKEN).join(safe);
}
const PART_COMMENT = {
    mermaid: '%%', er: '%%', dot: '//', text: '#',
};
function docFailure(d, options) {
    const loaded = load(d.src, d.path, options, undefined);
    if (undefined !== loaded.errors) {
        return loaded.errors;
    }
    if (undefined !== options.at && null == (0, vet_1.anchorAt)(loaded.root, options.at)) {
        return [finding('no_path', 'reference', options.at, `${d.label} has no value at ${options.at}.`)];
    }
    return [];
}
// One evaluation, parsed and unified separately so the provenance
// recorder can stamp the parsed tree before the fixpoint runs (`why`'s
// precedent).
function load(src, path, include, prov) {
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(include));
    const ctx = aontu.ctx({ collect: true, prov });
    const parseOpts = null == path ? undefined : { path };
    const parsed = aontu.parse(src, parseOpts, ctx);
    if (0 < ctx.err.length || null == parsed) {
        return { errors: [(0, vet_1.failureFinding)(ctx, path, parsed)] };
    }
    if (undefined !== prov) {
        prov.writtenFrom(parsed);
    }
    const root = aontu.unify(parsed, parseOpts, ctx);
    // A document that does not stand up has no figure: the errors it
    // already has are the answer.
    if (0 < ctx.err.length || true === root?.isNil) {
        return { errors: [(0, vet_1.failureFinding)(ctx, path, root)] };
    }
    return { root, ctx };
}
// A figure of one document (or, for the poset, of a set of them).
function view(src, opts, hooks) {
    const options = opts ?? {};
    const compare = hooks?.compare ?? compareBySubsume;
    const kind = options.kind ?? 'tree';
    const loss = [];
    const done = (fig) => {
        if (undefined !== fig.errors) {
            return { verdict: 'error', kind, loss: [], errors: fig.errors };
        }
        loss.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.code, b.code));
        const lossy = loss.some((l) => !INFORMATIONAL.includes(l.code));
        return {
            verdict: lossy ? 'lossy' : 'rendered', kind, text: fig.text, loss,
            ...(0 === (fig.parts ?? []).length ? {} : { parts: fig.parts }),
        };
    };
    const profiles = PROFILES[kind];
    if (undefined === profiles) {
        return done({
            errors: [finding('view_kind_unknown', 'reference', '$', `${kind} is not a figure kind.`, 'kinds: ' + Object.keys(PROFILES).join(', '))],
        });
    }
    const as = options.as ?? profiles[0];
    if (!profiles.includes(as)) {
        return done({
            errors: [finding('view_profile_unknown', 'reference', '$', `The ${kind} figure does not render as ${as}.`, `profiles: ${profiles.join(', ')}`)],
        });
    }
    const style = styleOf(options.style, as);
    const carrier = { ansi: 'text', css: 'svg' };
    if (undefined !== carrier[style] && carrier[style] !== as) {
        return done({
            errors: [finding('view_style_profile', 'reference', '$', `The ${as} profile cannot carry --style ${style}.`, `${style} is the ${carrier[style]} profile's mechanism`)],
        });
    }
    if (undefined === carrier[style] && 'none' !== style) {
        return done({
            errors: [finding('view_style_unknown', 'reference', '$', `${style} is not a style.`, 'styles: auto, none, ansi, css')],
        });
    }
    // Zero means the default, in both ports.
    const max = options.maxRows || DEFAULT_MAX_ROWS;
    if ('poset' === kind) {
        const docs = [{ src, path: options.path }, ...(options.docs ?? [])]
            .map((d, i) => ({
            src: d.src, path: d.path,
            label: d.name ?? (undefined === d.path
                ? `doc${i + 1}` : (0, node_path_1.basename)(d.path).replace(/\.aontu$/, '')),
        }));
        return done(drawPoset(docs, options, as, max, loss, compare));
    }
    if ('ladder' === kind) {
        return done(drawLadder(src, options, as, max));
    }
    const prov = 'layers' === kind
        ? (hooks?.provenance ?? (() => new provenance_1.Provenance()))() : undefined;
    const loaded = load(src, options.path, options, prov);
    if (undefined !== loaded.errors) {
        return done({ errors: loaded.errors });
    }
    return done(drawLoaded(loaded.root, loaded.ctx, prov, kind, as, options, max, loss));
}
// The options naming a field or a path. An empty name is no name, as
// the Go port's zero value is.
const NAMES = [
    'groupBy', 'label', 'member', 'of', 'columns', 'countBy', 'splitBy',
    'steps', 'from', 'to', 'size',
];
function drawLoaded(root, ctx, prov, kind, as, given, max, loss) {
    const options = { ...given };
    for (const k of NAMES) {
        if ('' === options[k]) {
            delete options[k];
        }
    }
    const style = styleOf(options.style, as);
    if ('doc' === kind) {
        return drawDoc(root, { ...options, as, style }, max, loss);
    }
    if ('lattice' === kind) {
        return drawLattice(root, { ...options, as, style }, max, loss);
    }
    if ('layers' === kind) {
        return drawLayers(prov, root, options.path, { ...options, as, style }, max, loss);
    }
    if ('sets' === kind || 'sequence' === kind) {
        const missing = 'sets' === kind
            ? undefined === options.sets || undefined === options.member
            : undefined === options.steps || undefined === options.from ||
                undefined === options.to;
        if (missing) {
            return {
                errors: 'sets' === kind
                    ? [finding('view_sets_required', 'reference', '$', 'The set panel needs --sets and --member.')]
                    : [finding('view_steps_required', 'reference', '$', 'The sequence needs --steps, --from and --to.')],
            };
        }
        if ('sequence' === kind) {
            // The steps are generated alone: a model whose schema half is
            // not concrete can still list its sequences.
            const steps = (0, vet_1.anchorAt)(root, options.steps);
            if (null == steps) {
                return {
                    errors: [finding('no_path', 'reference', options.steps, `The path ${options.steps} names nothing in this document.`)],
                };
            }
            const before = ctx.err.length;
            const listed = steps.gen(ctx);
            if (before < ctx.err.length) {
                return { errors: [(0, vet_1.engineFinding)(ctx.err[before], ctx, '$')] };
            }
            return drawSequence(listed, {
                from: options.from, to: options.to,
                label: options.label, at: options.steps, as,
            }, max, loss);
        }
        // GENERATION CAN FAIL WHERE UNIFICATION DID NOT: the panel reads
        // generated values, so a document that is not concrete is an
        // error here, exactly as `aontu file.aontu` on it is.
        const before = ctx.err.length;
        const value = root.gen(ctx);
        if (before < ctx.err.length) {
            return {
                errors: [(0, vet_1.engineFinding)(ctx.err[before], ctx, '$')],
            };
        }
        return drawSets(value, {
            sets: options.sets, member: options.member,
            universe: options.universe, minDegree: options.minDegree,
            maxCols: options.maxCols, as, style,
        }, max, loss);
    }
    const splitting = viewSplits(options);
    if (splitting && !SPLIT_KINDS.includes(kind)) {
        return {
            errors: [finding('view_split_kind', 'reference', '$', `The ${kind} figure cannot be split into parts.`, 'kinds that split: ' + SPLIT_KINDS.join(', '))],
        };
    }
    let sel = {
        triples: triplesOf((0, graph_1.graphOf)(root), options.at, loss), ghosts: new Map(),
    };
    if (undefined !== options.columns) {
        // A link written as a column is the entity's own relationship,
        // named by the column.
        const tail = '.' + options.columns;
        sel.triples = sel.triples.map((e) => e.from.endsWith(tail)
            ? { ...e, from: e.from.slice(0, -tail.length) } : e);
    }
    if (undefined !== options.of) {
        const picked = selectMembers(sel.triples, options.of, options.member, true === options.ghosts && SPLIT_KINDS.includes(kind), 'treemap' === kind ? [] : loss);
        if (undefined !== picked.error) {
            return { errors: [picked.error] };
        }
        sel = picked.selection;
    }
    if ('treemap' === kind) {
        return drawTreemap(root, {
            at: options.at, depth: options.depth, groupBy: options.groupBy,
            size: options.size, members: sel.members, as, style,
        }, max, loss);
    }
    const decls = ctx._reldecls;
    // An empty relation name is no relation, so both ports read it as
    // "every relation" rather than one that names nothing.
    const relation = options.relation || undefined;
    const relations = options.relations ?? [];
    const draw = (s, rows, into, relations, roots) => {
        const members = s.members ?? [];
        if ('graph' === kind) {
            return drawGraph(s.triples, decls, root, {
                relations, groupBy: options.groupBy, label: options.label, as,
                members, ghosts: s.ghosts, columns: options.columns,
                counts: options.counts, countBy: options.countBy,
                collapse: options.collapse,
            }, rows, into);
        }
        if ('state' === kind) {
            return drawState(s.triples, root, {
                relations, label: options.label, as, members, ghosts: s.ghosts,
                roots, named: 0 < (options.roots ?? []).length,
            }, rows, into);
        }
        return drawLane(s.triples, root, {
            relations, groupBy: options.groupBy, label: options.label,
            layers: options.layers ?? [], as, members, ghosts: s.ghosts,
            counts: options.counts, countBy: options.countBy,
        }, rows, into);
    };
    if (SPLIT_KINDS.includes(kind)) {
        if (!splitting) {
            return draw(sel, max, loss, relations, options.roots ?? []);
        }
        // THE WHOLE FIGURE IS DRAWN FIRST, for its refusals and its loss
        // report; each part is then drawn on its own, under the row cap
        // the whole figure was spared.
        const whole = draw(sel, Infinity, loss, relations, options.roots ?? []);
        if (undefined !== whole.errors) {
            return whole;
        }
        const scoped = 0 === relations.length ? sel : {
            ...sel, triples: sel.triples.filter((e) => relations.includes(e.key)),
        };
        const parts = [];
        const cut = splitParts(scoped, root, options, loss);
        for (const part of cut) {
            const fig = draw(partSelection(scoped, cut, part), max, [], [], (options.roots ?? []).filter((r) => part.nodes.includes(r)));
            if (undefined !== fig.errors) {
                return fig;
            }
            parts.push({ name: part.name, text: fig.text });
        }
        const mark = PART_COMMENT[as];
        return {
            parts,
            text: parts.map((p) => `${mark} part: ${p.name}\n${p.text}`).join('\n\n'),
        };
    }
    const triples = sel.triples;
    if ('matrix' === kind) {
        return drawMatrix(triples, decls, {
            relation, order: options.order ?? 'canon', closure: true === options.closure,
            as, style,
        }, max, loss);
    }
    if ('layer' === kind) {
        return drawLayer(triples, root, {
            relation, groupBy: options.groupBy, layers: options.layers ?? [],
            edges: options.edges, as, style, counts: options.counts,
            countBy: options.countBy,
        }, max, loss);
    }
    return drawTree(collapse(triples, relation), relation, options.roots ?? [], max, as, style);
}
// The tree view of one document: `view` with the kind fixed.
function viewTree(src, opts) {
    return view(src, { ...(opts ?? {}), kind: 'tree' });
}
const DECL_TEXT = [
    'kind', 'as', 'out', 'at', 'relation', 'order', 'groupBy', 'label',
    'sets', 'member', 'universe', 'edges', 'of', 'columns', 'countBy',
    'splitBy', 'steps', 'from', 'to', 'size',
];
// The options whose values are a closed set. A view document is the
// artifact CI reads, so a typo here is a refusal rather than a silent
// fall back to the default.
const DECL_ENUM = {
    order: ['canon', 'partition'],
    edges: ['upward', 'all', 'none'],
};
const DECL_COUNT = [
    'maxRows', 'maxCols', 'minDegree', 'minSize', 'depth', 'budget',
];
const DECL_FLAG = ['closure', 'ghosts', 'counts', 'collapse', 'splitRoots'];
const DECL_LIST = ['roots', 'relations', 'layers'];
const DECL_KEYS = [...DECL_TEXT, ...DECL_COUNT, ...DECL_FLAG, ...DECL_LIST]
    .sort(keyorder_1.cmpCodePoint);
function documentFinding(path, message, note) {
    return finding('view_document_shape', 'reference', path, message, note);
}
function planOf(name, decl, at) {
    const where = `${at}.${name}`;
    const errors = [];
    if (null == decl || 'object' !== typeof decl || Array.isArray(decl)) {
        return { errors: [documentFinding(where, 'A view declaration is not a map.')] };
    }
    const opts = {};
    for (const key of Object.keys(decl).sort(keyorder_1.cmpCodePoint)) {
        const value = decl[key];
        if (DECL_TEXT.includes(key)) {
            if ('string' !== typeof value) {
                errors.push(documentFinding(`${where}.${key}`, `${key} must be a string.`));
                continue;
            }
            opts[key] = value;
        }
        else if (DECL_COUNT.includes(key)) {
            if ('number' !== typeof value || !Number.isInteger(value) || 0 > value) {
                errors.push(documentFinding(`${where}.${key}`, `${key} must be a whole number, zero or more.`));
                continue;
            }
            opts[key] = value;
        }
        else if (DECL_FLAG.includes(key)) {
            if ('boolean' !== typeof value) {
                errors.push(documentFinding(`${where}.${key}`, `${key} must be true or false.`));
                continue;
            }
            opts[key] = value;
        }
        else if (DECL_LIST.includes(key)) {
            if (!Array.isArray(value) || !allStrings(value)) {
                errors.push(documentFinding(`${where}.${key}`, `${key} must be a list of strings.`));
                continue;
            }
            opts[key] = value;
        }
        else {
            errors.push(documentFinding(`${where}.${key}`, `${key} is not a view option.`, 'options: ' + DECL_KEYS.join(', ')));
        }
    }
    for (const key of Object.keys(DECL_ENUM)) {
        const value = opts[key];
        if (undefined !== value && !DECL_ENUM[key].includes(value)) {
            errors.push(documentFinding(`${where}.${key}`, `${value} is not a ${key}.`, `${key}: ${DECL_ENUM[key].join(', ')}`));
        }
    }
    const kind = opts.kind;
    if (undefined === kind) {
        errors.push(documentFinding(where, 'A view declaration must name its kind.', 'kinds: ' + Object.keys(PROFILES).join(', ')));
    }
    else if (undefined === PROFILES[kind]) {
        errors.push(documentFinding(`${where}.kind`, `${kind} is not a figure kind.`, 'kinds: ' + Object.keys(PROFILES).join(', ')));
    }
    else if ('poset' === kind) {
        errors.push(documentFinding(`${where}.kind`, 'A view document draws figures of one document; ' +
            'the poset compares several.'));
    }
    const profiles = undefined === kind ? undefined : PROFILES[kind];
    const as = opts.as ?? profiles?.[0];
    if (undefined !== profiles && undefined !== as && !profiles.includes(as)) {
        errors.push(documentFinding(`${where}.as`, `The ${kind} figure does not render as ${as}.`, `profiles: ${profiles.join(', ')}`));
    }
    const out = opts.out;
    if (undefined === out || '' === out) {
        errors.push(documentFinding(where, 'A view declaration must name the file it draws into, as out.'));
    }
    else if (hasLineBreak(out)) {
        errors.push(documentFinding(`${where}.out`, 'A file name cannot hold a line terminator.'));
    }
    else if (viewSplits(opts) !== out.includes(exports.PART_TOKEN)) {
        errors.push(documentFinding(`${where}.out`, viewSplits(opts)
            ? `A split figure writes one file per part, so out must hold ${exports.PART_TOKEN}.`
            : `Only a split figure's out holds ${exports.PART_TOKEN}.`));
    }
    if (0 < errors.length) {
        return { errors };
    }
    return {
        plan: {
            name, kind: kind, as: as, out: out,
            max: opts.maxRows || DEFAULT_MAX_ROWS, opts,
        },
        errors: [],
    };
}
function viewSet(src, opts, hooks) {
    const options = opts ?? {};
    const at = options.views;
    if (undefined === at || '' === at) {
        return {
            verdict: 'error', views: [],
            errors: [documentFinding('$', 'The view document needs the path of ' +
                    'the map that declares the figures; name it with --views.')],
        };
    }
    const prov = (hooks?.provenance ?? (() => new provenance_1.Provenance()))();
    const loaded = load(src, options.path, options, prov);
    if (undefined !== loaded.errors) {
        return { verdict: 'error', views: [], errors: loaded.errors };
    }
    const root = loaded.root;
    const ctx = loaded.ctx;
    // THE DECLARATIONS GENERATE ALONE: a model whose schema half is not
    // concrete still has figures, and a figure that reads generated
    // values generates what it reads.
    const node = (0, vet_1.anchorAt)(root, at);
    let declared = undefined;
    if (null != node) {
        const before = ctx.err.length;
        declared = node.gen(ctx);
        if (before < ctx.err.length) {
            return {
                verdict: 'error', views: [],
                errors: [(0, vet_1.engineFinding)(ctx.err[before], ctx, at)],
            };
        }
    }
    if (null == declared || 'object' !== typeof declared || Array.isArray(declared)) {
        return {
            verdict: 'error', views: [],
            errors: [documentFinding(at, 'The view declarations are not a map.')],
        };
    }
    const plans = [];
    const errors = [];
    for (const name of Object.keys(declared).sort(keyorder_1.cmpCodePoint)) {
        const planned = planOf(name, declared[name], at);
        errors.push(...planned.errors);
        if (undefined !== planned.plan) {
            plans.push(planned.plan);
        }
    }
    if (0 < errors.length) {
        return { verdict: 'error', views: [], errors };
    }
    const views = plans.map((plan) => {
        const loss = [];
        const each = {
            ...plan.opts, path: options.path, trust: options.trust,
            textExt: options.textExt,
        };
        // A Val tree generates once: the declarations were generated from
        // this one, so a figure that generates draws from a fresh
        // evaluation of the same source, which stands up as this one did.
        const own = 'sets' === plan.kind || 'sequence' === plan.kind
            ? load(src, options.path, options, undefined) : loaded;
        const fig = 'ladder' === plan.kind
            ? drawLadder(src, each, plan.as, plan.max)
            : drawLoaded(own.root, own.ctx, prov, plan.kind, plan.as, each, plan.max, loss);
        if (undefined !== fig.errors) {
            return {
                name: plan.name, kind: plan.kind, out: plan.out,
                verdict: 'error', loss: [], errors: fig.errors,
            };
        }
        loss.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.code, b.code));
        const lossy = loss.some((l) => !INFORMATIONAL.includes(l.code));
        return {
            name: plan.name, kind: plan.kind, out: plan.out,
            verdict: (lossy ? 'lossy' : 'rendered'),
            text: fig.text, loss,
            ...(0 === (fig.parts ?? []).length ? {} : { parts: fig.parts }),
        };
    });
    const verdict = views.some((v) => 'error' === v.verdict)
        ? 'error' : views.some((v) => 'lossy' === v.verdict) ? 'lossy' : 'rendered';
    return { verdict, views };
}
//# sourceMappingURL=view.js.map