"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.format = format;
exports.unifiedDiff = unifiedDiff;
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
// This is the syntactic tier only (P1): whitespace, commas, quotes,
// bare keys, chains and pair elements, none of which changes the parse
// tree. The lawful tier -- the repeat-the-prefix rewrite that rests on
// the meet -- is P2, and lands behind its own local check.
//
// The Go twin is go/format.go, function for function; the shared
// behaviour is test/spec/fmt.tsv, executed by both spec runners.
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
// The packing budget (§3.1). It decides which of two legal spellings
// to use, one line or several, and nothing else: the formatter never
// breaks a line, so a value wider than this stays as wide as it is.
const BUDGET = 80;
// THE DEPTH BUDGET. The layout is recursive, as the tree it reads is,
// and the canonical port's stack is finite: past the evaluation budget
// of 1000 levels -- the depth at which unification itself refuses --
// the formatter stops reading and refuses, so a pathological document
// is a finding rather than a crash.
const MAX_DEPTH = 1000;
// EVERY INCLUDE RESOLVES TO NOTHING. The formatter reads the file it is
// given and no other (§3.13), so `@"..."` is answered from memory with
// an empty source: the directive parses, the include is a token like
// any other, and no capability is needed because no file is read.
const stubResolver = ((spec) => ({
    ...spec, kind: 'aon', full: '__fmt__.aon', src: '', found: true, search: [],
}));
// ONE ENGINE, ONE SUBSCRIBER. The parser's subscriber list is
// append-only, so the subscription is made once and writes to
// whichever sink the current parse installed; the sink is cleared
// before the parse returns, so the check's re-parse collects nothing.
let ENGINE;
let SINK;
function engine() {
    if (undefined === ENGINE) {
        ENGINE = new aontu_1.Aontu({ resolver: stubResolver });
        ENGINE.lang.jsonic.sub({
            lex: (tkn) => {
                // Spaces carry nothing the layout needs, and the end token
                // arrives once per nested parse -- the stub's empty includes
                // among them -- so both are dropped here rather than skipped
                // everywhere below.
                if (undefined !== SINK && '#SP' !== tkn.name && '#ZZ' !== tkn.name) {
                    SINK.push({ name: tkn.name, src: tkn.src, val: tkn.val, sI: tkn.sI });
                }
            },
        });
    }
    return ENGINE;
}
// One parse, with the token stream collected when a sink is given. The
// failure shape is the one every verb reports (`view`'s load).
function parseDoc(src, path, sink) {
    const aontu = engine();
    const ctx = aontu.ctx({ collect: true });
    SINK = sink;
    let parsed;
    try {
        parsed = aontu.parse(src, undefined === path ? undefined : { path }, ctx);
    }
    finally {
        SINK = undefined;
    }
    if (0 < ctx.err.length) {
        return { errors: [(0, vet_1.failureFinding)(ctx, path, parsed)] };
    }
    return { root: parsed };
}
const BINARY = { '#E&': true, '#E|': true, '#E+': true };
const PREFIX = { '#E*': true, '#E-': true };
const KEYISH = { '#TX': true, '#ST': true, '#NR': true, '#VL': true };
const CLOSER = { '#CB': true, '#CS': true, '#E)': true };
// The parts of one atom: a reference is `$`, dots and segments lexed
// one by one, and a bare word with a dot in it is the same run; what
// was adjacent in the source stays glued.
const GLUE = {
    '#TX': true, '#ST': true, '#NR': true, '#VL': true, '#E.': true, '#E$': true,
};
const BARE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// A single-quoted string becomes double-quoted unless it holds a double
// quote, which the swap would have to escape (§3.9). The body is copied
// as written: the escapes are the same under both quotes.
function normStr(src) {
    if ("'" === src[0]) {
        const body = src.slice(1, -1);
        return body.includes('"') ? src : '"' + body + '"';
    }
    return src;
}
function atomText(tok) {
    return '#ST' === tok.name ? normStr(tok.src) : tok.src;
}
// A quoted key whose text is a legal bare key is written bare; the
// keywords are legal keys too (`string: 1` is the key `string`), so no
// word is reserved. Anything else keeps its spelling.
function keyText(tok) {
    if ('#ST' === tok.name) {
        return BARE.test(tok.val) ? tok.val : normStr(tok.src);
    }
    return tok.src;
}
function newlines(src) {
    return src.split('\n').length - 1;
}
class Reader {
    constructor(toks) {
        this.i = 0;
        this.depth = 0;
        // Past the depth budget: the reader answers '' for every token from
        // here on, so every loop unwinds, and the document is refused.
        this.deep = false;
        this.T = toks;
    }
    // The name of the token k ahead, or '' past the end.
    name(k) {
        const t = this.T[this.i + k];
        return this.deep || undefined === t ? '' : t.name;
    }
    // The offset of the next token that is not a line run or a comment.
    significant() {
        let k = 0;
        while ('#LN' === this.name(k) || '#CM' === this.name(k)) {
            k++;
        }
        return k;
    }
    // A key followed by a colon, the optional marker allowed between.
    atKey() {
        return KEYISH[this.name(0)] && ('#CL' === this.name(1) ||
            ('#QM' === this.name(1) && '#CL' === this.name(2)));
    }
    // The entries of a container up to its closer, or of the document up
    // to its end. Comments attach by the rules of §3.7: on the line of
    // the entry that precedes them, or of the opener, they trail it;
    // alone on a line they stand as entries and precede what follows.
    body(close, opened) {
        const body = [];
        let open;
        let last;
        let opener = opened;
        // Nothing since the opener or the last comma: a comma here is an
        // empty element, which the parser reads as nil in a list.
        let gap = true;
        for (;;) {
            const n = this.name(0);
            // The closer, or the end: the parser accepts a container the
            // source never closed (`a: {` is `{"a":{}}`).
            if ('' === n || n === close) {
                break;
            }
            if ('#LN' === n) {
                if (1 < newlines(this.T[this.i].src) && 0 < body.length &&
                    'blank' !== body[body.length - 1].t) {
                    body.push({ t: 'blank' });
                }
                last = undefined;
                opener = false;
                this.i++;
                continue;
            }
            if ('#CA' === n) {
                if (gap && '#CS' === close) {
                    const nil = { t: 'atom', text: 'nil' };
                    body.push(nil);
                    last = nil;
                }
                gap = true;
                this.i++;
                continue;
            }
            if ('#CM' === n) {
                const text = this.T[this.i].src;
                if (undefined !== last) {
                    last.trail = text;
                }
                else if (opener) {
                    open = text;
                }
                else {
                    body.push({ t: 'comment', text });
                }
                this.i++;
                continue;
            }
            if (CLOSER[n]) {
                // A closer that is not this container's: the parser ignores a
                // stray one at the root (`a: 1 }` is `{"a":1}`), and so does
                // this.
                this.i++;
                continue;
            }
            const e = this.entry();
            body.push(e);
            last = e;
            opener = false;
            gap = false;
        }
        return { body, open };
    }
    // One entry: an include, a spread, a pair, or -- as a list element or
    // at the root -- a value.
    entry() {
        const n = this.name(0);
        if ('#OD_multisource' === n) {
            const text = '@' + normStr(this.T[this.i + 1].src);
            this.i += 2;
            return { t: 'include', text };
        }
        if ('#E&' === n && '#CL' === this.name(1)) {
            this.i += 2;
            return { t: 'spread', value: this.value() };
        }
        if (this.atKey()) {
            const tok = this.T[this.i];
            const opt = '#QM' === this.name(1);
            this.i += opt ? 3 : 2;
            return { t: 'pair', key: keyText(tok), opt, value: this.value() };
        }
        return this.value();
    }
    // A value: operands and operators up to whatever ends it -- a
    // separator, a closer, the end, or a line run that no operator
    // continues past.
    value() {
        if (MAX_DEPTH < ++this.depth) {
            this.deep = true;
        }
        const v = this.valueAt();
        this.depth--;
        return v;
    }
    valueAt() {
        const items = [];
        for (;;) {
            const n = this.name(0);
            if ('' === n || '#CA' === n || CLOSER[n]) {
                break;
            }
            // An operand directly after an operand is the next element of a
            // list, `[1 -2]`, `[{a:1} {b:2}]`: this value is complete.
            if (!this.open(items) && !BINARY[n] && '#LN' !== n && '#CM' !== n) {
                break;
            }
            if ('#E&' === n && '#CL' === this.name(1)) {
                if (0 === items.length) {
                    // A chain through a spread, `a: &: integer`. The braces are
                    // the agreed spelling (X-7), so it is read as the map it is.
                    this.i += 2;
                    return { t: 'map', body: [{ t: 'spread', value: this.value() }] };
                }
                // A sibling spread in a list, `[1 &: 2]`: this value is complete.
                break;
            }
            if ('#LN' === n) {
                // A break the author put before the value, after an operator
                // (`a: 1 &\n  2`) or before one (`a: 1\n  | 2`), or after a
                // comment inside the value; anything else ends the value.
                if (this.open(items) || BINARY[this.name(this.significant())]) {
                    this.i++;
                    continue;
                }
                break;
            }
            if ('#CM' === n) {
                // A comment inside the value: after the colon, after an
                // operator, or on a line the value continues past. Otherwise
                // it trails the statement and the caller attaches it.
                if (this.open(items) || BINARY[this.name(this.significant())]) {
                    items.push({ t: 'note', text: this.T[this.i].src });
                    this.i++;
                    continue;
                }
                break;
            }
            if (BINARY[n]) {
                items.push({
                    t: 'op', text: this.T[this.i].src,
                    brk: '#LN' === this.name(-1) || '#LN' === this.name(1),
                });
                this.i++;
                continue;
            }
            if (PREFIX[n]) {
                items.push({ t: 'prefix', text: this.T[this.i].src });
                this.i++;
                continue;
            }
            if ('#E(' === n) {
                this.i++;
                const inner = this.seq();
                this.i++;
                items.push({ t: 'paren', inner });
                continue;
            }
            if ('#TX' === n && '#E(' === this.name(1)) {
                const name = this.T[this.i].src;
                this.i += 2;
                const args = this.seq();
                this.i++;
                items.push({ t: 'call', name, args });
                continue;
            }
            if ('#OB' === n) {
                this.i++;
                const m = this.body('#CB', true);
                this.i++;
                items.push({ t: 'map', body: m.body, open: m.open });
                continue;
            }
            if ('#OS' === n) {
                this.i++;
                const l = this.body('#CS', true);
                this.i++;
                items.push({ t: 'list', body: l.body, open: l.open });
                continue;
            }
            if ('#OD_multisource' === n) {
                items.push({ t: 'include', text: '@' + normStr(this.T[this.i + 1].src) });
                this.i += 2;
                continue;
            }
            if (this.atKey()) {
                // A pair in value position is a chain, `a: b: 1`, and it is
                // the whole of the value.
                items.push(this.entry());
                break;
            }
            items.push(this.atom());
        }
        if (1 === items.length && 'op' !== items[0].t && 'prefix' !== items[0].t &&
            'note' !== items[0].t) {
            return items[0];
        }
        return { t: 'expr', items };
    }
    // Whether the expression so far wants an operand: nothing yet, or an
    // operator, a prefix or a comment last.
    open(items) {
        if (0 === items.length) {
            return true;
        }
        const t = items[items.length - 1].t;
        return 'op' === t || 'prefix' === t || 'note' === t;
    }
    // The token under the cursor, and the parts glued to it.
    atom() {
        let text = atomText(this.T[this.i]);
        this.i++;
        while (GLUE[this.name(0)] &&
            this.T[this.i - 1].sI + this.T[this.i - 1].src.length === this.T[this.i].sI) {
            text += atomText(this.T[this.i]);
            this.i++;
        }
        return { t: 'atom', text };
    }
    // A call's arguments, or a parenthesis's contents, up to the closing
    // parenthesis: values separated by commas, with a comment among them
    // kept as a note.
    seq() {
        const out = [];
        let gap = true;
        for (;;) {
            const n = this.name(0);
            if ('' === n || CLOSER[n]) {
                break;
            }
            if ('#LN' === n) {
                this.i++;
                continue;
            }
            if ('#CA' === n) {
                if (gap) {
                    out.push({ t: 'atom', text: 'nil' });
                }
                gap = true;
                this.i++;
                continue;
            }
            if ('#CM' === n) {
                out.push({ t: 'note', text: this.T[this.i].src });
                this.i++;
                continue;
            }
            out.push(this.value());
            gap = false;
        }
        return out;
    }
}
// THE ROOT MAP HAS NO BRACES (§3.12). A document written as one braced
// map is its entries; the comments on the braces' lines become entries
// of their own, where nothing is lost.
function unwrap(root) {
    const entries = root.filter((n) => 'comment' !== n.t && 'blank' !== n.t);
    if (1 !== entries.length || 'map' !== entries[0].t) {
        return root;
    }
    const m = entries[0];
    const out = [];
    for (const n of root) {
        if (n !== m) {
            out.push(n);
            continue;
        }
        if (undefined !== m.open) {
            out.push({ t: 'comment', text: m.open });
        }
        out.push(...m.body);
        if (undefined !== m.trail) {
            out.push({ t: 'comment', text: m.trail });
        }
    }
    return out;
}
// ---------------------------------------------------------------------
// The layout
// D1: a one-pair map in value position is written as a chain, and a
// one-pair map as a list element as a pair element. A map whose only
// entry is a spread keeps its braces (X-7), and one holding a comment
// keeps them too, because the comment needs the lines. A trailing
// comment on the map's line joins the pair's own.
function chain(node) {
    if ('map' !== node.t || undefined !== node.open || 1 !== node.body.length ||
        'pair' !== node.body[0].t) {
        return node;
    }
    const p = node.body[0];
    if (undefined === node.trail) {
        return p;
    }
    return { ...p, trail: undefined === p.trail ? node.trail : p.trail + ' ' + node.trail };
}
function width(s) {
    return Array.from(s).length;
}
function pairHead(node, tight) {
    return node.key + (node.opt ? '?' : '') + (tight ? ':' : ': ');
}
// The one-line spelling of a node, or undefined where it has none: a
// comment, a blank line, a break the author kept, a string that spans
// lines. `tight` is the inline form of a pair, `a:1`, used inside a
// container; a statement's pair is `a: 1`.
function inline(node, tight) {
    if (undefined !== node.trail) {
        return undefined;
    }
    switch (node.t) {
        case 'atom':
        case 'include':
            return node.text.includes('\n') ? undefined : node.text;
        case 'pair': {
            const v = inline(chain(node.value), tight);
            return undefined === v ? undefined : pairHead(node, tight) + v;
        }
        case 'spread': {
            // `{ &: integer }`, padded inside braces too: the marker reads as
            // a marker and not as a key.
            const v = inline(node.value, tight);
            return undefined === v ? undefined : '&: ' + v;
        }
        case 'map':
        case 'list': {
            if (undefined !== node.open) {
                return undefined;
            }
            const parts = [];
            for (const e of node.body) {
                const s = inline('list' === node.t ? chain(e) : e, true);
                if (undefined === s) {
                    return undefined;
                }
                parts.push(s);
            }
            if ('list' === node.t) {
                return '[' + parts.join(' ') + ']';
            }
            return 0 === parts.length ? '{}' : '{ ' + parts.join(' ') + ' }';
        }
        case 'call': {
            const a = inlineSeq(node.args);
            return undefined === a ? undefined : node.name + '(' + a + ')';
        }
        case 'paren': {
            const a = inlineSeq(node.inner);
            return undefined === a ? undefined : '(' + a + ')';
        }
        case 'expr':
            return inlineExpr(node.items);
        default:
            // comment, blank: never on a line with anything else.
            return undefined;
    }
}
function inlineSeq(items) {
    const parts = [];
    for (const it of items) {
        const s = inline(it, true);
        if (undefined === s) {
            return undefined;
        }
        parts.push(s);
    }
    return parts.join(', ');
}
// Binary operators spaced, prefixes tight (§3.11). An operand is
// never directly after an operand: the reader ends a value there.
function inlineExpr(items) {
    let out = '';
    for (const it of items) {
        if ('note' === it.t || ('op' === it.t && it.brk)) {
            return undefined;
        }
        if ('op' === it.t) {
            out += ' ' + it.text + ' ';
            continue;
        }
        if ('prefix' === it.t) {
            out += it.text;
            continue;
        }
        const s = inline(it, true);
        if (undefined === s) {
            return undefined;
        }
        out += s;
    }
    return out;
}
class Writer {
    constructor() {
        this.lines = [];
        this.line = '';
        this.started = false;
    }
    // A new line at an indentation, after a blank one when asked.
    open(indent, blank) {
        if (this.started) {
            this.lines.push(rtrim(this.line));
            if (blank) {
                this.lines.push('');
            }
        }
        this.line = ' '.repeat(indent);
        this.started = true;
    }
    text(s) {
        this.line += s;
    }
    // Nothing on the line yet but its indentation.
    fresh() {
        return '' === this.line.trim();
    }
    width() {
        return width(this.line);
    }
    finish() {
        if (!this.started) {
            return '';
        }
        this.lines.push(rtrim(this.line));
        return this.lines.join('\n') + '\n';
    }
}
// A line never ends in a space: an operator the author left dangling
// (`a: 1 &`, which the parser accepts) would otherwise leave one.
function rtrim(s) {
    return s.replace(/ +$/, '');
}
// The entries of a body, one per line at the indentation, with the
// blank lines the author kept between them (§3.8) -- never at the
// start or the end.
function emitBody(w, body, indent) {
    let pending = false;
    let count = 0;
    for (const node of body) {
        if ('blank' === node.t) {
            pending = 0 < count;
            continue;
        }
        w.open(indent, pending);
        pending = false;
        count++;
        if ('comment' === node.t) {
            w.text(node.text);
            continue;
        }
        const e = chain(node);
        emitValue(w, e, indent);
        if (undefined !== e.trail) {
            w.text(' ' + e.trail);
        }
    }
}
// A value onto the current line: its one-line spelling when there is
// one and it fits the budget, and otherwise its several-line form,
// which for a scalar is the same text, too wide and unbreakable.
function emitValue(w, node, indent) {
    const s = inline(node, false);
    if (undefined !== s && w.width() + width(s) <= BUDGET) {
        w.text(s);
        return;
    }
    switch (node.t) {
        case 'pair': {
            w.text(pairHead(node, false));
            const v = chain(node.value);
            emitValue(w, v, indent);
            if (undefined !== v.trail) {
                w.text(' ' + v.trail);
            }
            return;
        }
        case 'spread':
            w.text('&: ');
            emitValue(w, node.value, indent);
            return;
        case 'map':
            emitBlock(w, '{', '}', node, indent);
            return;
        case 'list':
            emitBlock(w, '[', ']', node, indent);
            return;
        case 'expr':
            emitExpr(w, node.items, indent);
            return;
        case 'call':
        case 'paren':
            emitCall(w, node, indent);
            return;
        default:
            w.text(node.text);
    }
}
// A call, or a parenthesis, that has no one-line form or is too wide
// for the budget. Three shapes. A single container argument hugs the
// parentheses, `close({` ... `})`, and decides its own lines. Arguments
// that each have a one-line form stay on the one line however wide it
// is: the formatter never breaks a line. Otherwise -- an argument that
// is itself several lines, a comment among the arguments -- the
// parenthesis opens a block: one argument per line one level in, the
// closer alone at the opener's level.
function emitCall(w, node, indent) {
    const items = 'call' === node.t ? node.args : node.inner;
    const open = ('call' === node.t ? node.name : '') + '(';
    if (1 === items.length && ('map' === items[0].t || 'list' === items[0].t)) {
        w.text(open);
        emitValue(w, items[0], indent);
        w.text(')');
        return;
    }
    const one = inlineSeq(items);
    if (undefined !== one) {
        w.text(open + one + ')');
        return;
    }
    w.text(open);
    let noted = false;
    for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if ('note' === it.t) {
            // A comment among the arguments trails the line it was on -- the
            // opener's, or an argument's -- and one that followed another
            // comment keeps its own line.
            if (noted) {
                w.open(indent + 2, false);
                w.text(it.text);
            }
            else {
                w.text(' ' + it.text);
            }
            noted = true;
            continue;
        }
        w.open(indent + 2, false);
        emitValue(w, it, indent + 2);
        if (items.slice(k + 1).some((x) => 'note' !== x.t)) {
            w.text(',');
        }
        noted = false;
    }
    w.open(indent, false);
    w.text(')');
}
// A container on several lines (§3.5): the opener ends its line, the
// entries are statements one level in, the closer stands alone. An
// empty container is inline whatever the budget says.
function emitBlock(w, open, close, node, indent) {
    if (0 === node.body.length && undefined === node.open) {
        w.text(open + close);
        return;
    }
    w.text(open);
    if (undefined !== node.open) {
        w.text(' ' + node.open);
    }
    emitBody(w, node.body, indent + 2);
    w.open(indent, false);
    w.text(close);
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
function emitExpr(w, items, indent) {
    const cont = w.fresh() ? indent : indent + 2;
    // Whether the last item was an operand: a comment after one is a
    // space away, and after an operator or the colon it is not. An
    // operand is never directly after an operand (the reader ends a
    // value there), so operands need no such check.
    let operand = false;
    let cur = indent;
    for (const it of items) {
        if ('op' === it.t) {
            if (it.brk) {
                cur = cont;
                if (!w.fresh()) {
                    w.open(cur, false);
                }
                w.text(it.text + ' ');
            }
            else {
                w.text(' ' + it.text + ' ');
            }
            operand = false;
            continue;
        }
        if ('prefix' === it.t) {
            w.text(it.text);
            operand = false;
            continue;
        }
        if ('note' === it.t) {
            if (operand) {
                w.text(' ');
            }
            w.text(it.text);
            cur = cont;
            w.open(cur, false);
            operand = false;
            continue;
        }
        emitValue(w, it, cur);
        operand = true;
    }
}
function emit(root) {
    const w = new Writer();
    emitBody(w, root, 0);
    return w.finish();
}
// ---------------------------------------------------------------------
// The verb's library surface
function lf(text) {
    return text.split('\r\n').join('\n');
}
// The check: the output parses, and to the same tree. Pre-unification
// canon is that tree, positions aside, and every rewrite of this tier
// leaves it unchanged (§7.3).
function sameDocument(root, after) {
    const p = parseDoc(after, undefined, undefined);
    return undefined === p.errors && root.canon === p.root.canon;
}
function depthFinding() {
    return {
        code: 'max_depth',
        class: 'budget',
        severity: 'error',
        path: '$',
        message: `The document nests more than ${MAX_DEPTH} levels deep, past what the formatter reads.`,
        sites: [],
    };
}
function checkFinding(path, expected, actual) {
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
    };
}
// Format one document. The text is the agreed form of the source;
// `changed` says whether it differs from what was given, which is
// what `--check` and `--list` report.
function format(src, opts, hooks) {
    const text = lf(src);
    const toks = [];
    const parsed = parseDoc(text, opts?.path, toks);
    if (undefined !== parsed.errors) {
        return { verdict: 'error', errors: parsed.errors };
    }
    const reader = new Reader(toks);
    const root = reader.body('', false).body;
    if (reader.deep) {
        return { verdict: 'error', errors: [depthFinding()] };
    }
    const out = emit(unwrap(root));
    const same = hooks?.same ?? sameDocument;
    if (!same(parsed.root, out)) {
        return {
            verdict: 'error',
            errors: [checkFinding(opts?.path, parsed.root.canon, out)],
        };
    }
    return { verdict: 'formatted', text: out, changed: out !== src };
}
// The lines of a text, with a marker on the last when the text does
// not end in a newline: such a line never equals its
// newline-terminated twin, which is how the diff reports the
// difference, and the marker is rendered as diff renders it. NUL,
// which no source line ends in.
const NO_NEWLINE = String.fromCharCode(0);
function textLines(text) {
    if ('' === text) {
        return [];
    }
    const lines = text.split('\n');
    if ('' === lines[lines.length - 1]) {
        lines.pop();
    }
    else {
        lines[lines.length - 1] += NO_NEWLINE;
    }
    return lines;
}
// The longest chain of anchors in order on both sides: patience
// sorting over the right-hand positions, with the left already
// ascending.
function longestChain(pairs) {
    const tails = [];
    const prev = [];
    for (let k = 0; k < pairs.length; k++) {
        const j = pairs[k][1];
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (pairs[tails[mid]][1] < j) {
                lo = mid + 1;
            }
            else {
                hi = mid;
            }
        }
        prev[k] = 0 < lo ? tails[lo - 1] : -1;
        tails[lo] = k;
    }
    const out = [];
    let k = 0 === tails.length ? -1 : tails[tails.length - 1];
    while (0 <= k) {
        out.push(pairs[k]);
        k = prev[k];
    }
    return out.reverse();
}
function patience(a, x0, x1, b, y0, y1, out) {
    while (x0 < x1 && y0 < y1 && a[x0] === b[y0]) {
        out.push({ op: ' ', text: a[x0] });
        x0++;
        y0++;
    }
    let tail = 0;
    while (x0 < x1 - tail && y0 < y1 - tail && a[x1 - 1 - tail] === b[y1 - 1 - tail]) {
        tail++;
    }
    x1 -= tail;
    y1 -= tail;
    const countA = new Map();
    const countB = new Map();
    const posB = new Map();
    for (let x = x0; x < x1; x++) {
        countA.set(a[x], (countA.get(a[x]) ?? 0) + 1);
    }
    for (let y = y0; y < y1; y++) {
        countB.set(b[y], (countB.get(b[y]) ?? 0) + 1);
        posB.set(b[y], y);
    }
    const pairs = [];
    for (let x = x0; x < x1; x++) {
        if (1 === countA.get(a[x]) && 1 === countB.get(a[x])) {
            pairs.push([x, posB.get(a[x])]);
        }
    }
    const anchors = longestChain(pairs);
    if (0 === anchors.length) {
        for (let x = x0; x < x1; x++) {
            out.push({ op: '-', text: a[x] });
        }
        for (let y = y0; y < y1; y++) {
            out.push({ op: '+', text: b[y] });
        }
    }
    else {
        let x = x0;
        let y = y0;
        for (const [ax, ay] of anchors) {
            patience(a, x, ax, b, y, ay, out);
            out.push({ op: ' ', text: a[ax] });
            x = ax + 1;
            y = ay + 1;
        }
        patience(a, x, x1, b, y, y1, out);
    }
    for (let k = 0; k < tail; k++) {
        out.push({ op: ' ', text: a[x1 + k] });
    }
}
// The diff in unified format, three lines of context, the file named
// on both sides. Empty when the texts are the same.
function unifiedDiff(name, before, after) {
    const a = textLines(before);
    const b = textLines(after);
    const edits = [];
    patience(a, 0, a.length, b, 0, b.length, edits);
    // Hunks: changes closer than twice the context share one.
    const hunks = [];
    for (let k = 0; k < edits.length; k++) {
        if (' ' === edits[k].op) {
            continue;
        }
        const last = hunks[hunks.length - 1];
        if (undefined !== last && k - last[1] <= 6) {
            last[1] = k;
        }
        else {
            hunks.push([k, k]);
        }
    }
    if (0 === hunks.length) {
        return '';
    }
    const out = ['--- a/' + name, '+++ b/' + name];
    let ai = 0;
    let bi = 0;
    let next = 0;
    for (const [s, e] of hunks) {
        const from = Math.max(s - 3, 0);
        const to = Math.min(e + 4, edits.length);
        // Everything between two hunks is context -- a change would have
        // opened a hunk -- so both sides advance together.
        for (; next < from; next++) {
            ai++;
            bi++;
        }
        let alen = 0;
        let blen = 0;
        const lines = [];
        for (let k = from; k < to; k++) {
            const ed = edits[k];
            if ('+' !== ed.op) {
                alen++;
            }
            if ('-' !== ed.op) {
                blen++;
            }
            if (ed.text.endsWith(NO_NEWLINE)) {
                lines.push(ed.op + ed.text.slice(0, -1));
                lines.push('\\ No newline at end of file');
            }
            else {
                lines.push(ed.op + ed.text);
            }
        }
        out.push('@@ -' + (0 === alen ? ai : ai + 1) + ',' + alen +
            ' +' + (0 === blen ? bi : bi + 1) + ',' + blen + ' @@');
        out.push(...lines);
        ai += alen;
        bi += blen;
        next = to;
    }
    return out.join('\n') + '\n';
}
//# sourceMappingURL=format.js.map