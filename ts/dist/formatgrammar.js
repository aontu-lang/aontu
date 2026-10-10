"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORMAT_STEP_MAX = void 0;
exports.readGrammar = readGrammar;
exports.recognise = recognise;
exports.formatOf = formatOf;
exports.isDefinedFormat = isDefinedFormat;
exports.hex = hex;
// A format's grammar, read and run by aontu itself (ADR-059): RFC 5234
// with RFC 7405's case-sensitive strings, a pass that refuses what one
// character of lookahead cannot decide, and a recognizer over the rest.
// Twin of go/formatgrammar.go.
const formatgrammars_1 = require("./formatgrammars");
const FORMAT_STEP_MAX = 1000000;
exports.FORMAT_STEP_MAX = FORMAT_STEP_MAX;
const NEST_MAX = 64;
function unionAll(sets) {
    const all = sets.flat().sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const [lo, hi] of all) {
        const last = out[out.length - 1];
        if (undefined !== last && lo <= last[1] + 1) {
            last[1] = Math.max(last[1], hi);
        }
        else {
            out.push([lo, hi]);
        }
    }
    return out;
}
function meet(a, b) {
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        const lo = Math.max(a[i][0], b[j][0]);
        const hi = Math.min(a[i][1], b[j][1]);
        if (lo <= hi) {
            out.push([lo, hi]);
        }
        if (a[i][1] < b[j][1]) {
            i++;
        }
        else {
            j++;
        }
    }
    return out;
}
// The least code point held by more than one set, or -1.
function shared(sets) {
    let top = -1;
    for (const [lo, hi] of sets.flat().sort((x, y) => x[0] - y[0])) {
        if (lo <= top) {
            return lo;
        }
        top = Math.max(top, hi);
    }
    return -1;
}
function holds(set, cp) {
    let lo = 0;
    let hi = set.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (cp < set[mid][0]) {
            hi = mid - 1;
        }
        else if (set[mid][1] < cp) {
            lo = mid + 1;
        }
        else {
            return true;
        }
    }
    return false;
}
const range = (lo, hi) => [[lo, hi]];
// RFC 5234 appendix B.1.
const CORE = {
    alpha: { k: 'cls', set: [[0x41, 0x5a], [0x61, 0x7a]] },
    bit: { k: 'cls', set: range(0x30, 0x31) },
    char: { k: 'cls', set: range(0x01, 0x7f) },
    cr: { k: 'cls', set: range(0x0d, 0x0d) },
    crlf: { k: 'str', cps: [0x0d, 0x0a], ci: false },
    ctl: { k: 'cls', set: [[0x00, 0x1f], [0x7f, 0x7f]] },
    digit: { k: 'cls', set: range(0x30, 0x39) },
    dquote: { k: 'cls', set: range(0x22, 0x22) },
    hexdig: { k: 'cls', set: [[0x30, 0x39], [0x41, 0x46], [0x61, 0x66]] },
    htab: { k: 'cls', set: range(0x09, 0x09) },
    lf: { k: 'cls', set: range(0x0a, 0x0a) },
    octet: { k: 'cls', set: range(0x00, 0xff) },
    sp: { k: 'cls', set: range(0x20, 0x20) },
    vchar: { k: 'cls', set: range(0x21, 0x7e) },
    wsp: { k: 'cls', set: [[0x09, 0x09], [0x20, 0x20]] },
};
CORE.lwsp = {
    k: 'rep', min: 0, max: Infinity,
    node: { k: 'alt', alts: [CORE.wsp, { k: 'cat', items: [CORE.crlf, CORE.wsp] }] },
};
class Refusal {
    constructor(code, reason) {
        this.code = code;
        this.reason = reason;
    }
}
function hex(cp) {
    return '%x' + cp.toString(16).toUpperCase();
}
function kids(x) {
    return 'alt' === x.k ? x.alts : 'cat' === x.k ? x.items : 'rep' === x.k ? [x.node] : [];
}
// A comment runs from a semicolon outside a string or prose value.
function uncomment(line) {
    let quote = '';
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if ('' !== quote) {
            quote = c === quote ? '' : quote;
        }
        else if ('"' === c || '<' === c) {
            quote = '"' === c ? '"' : '>';
        }
        else if (';' === c) {
            return line.slice(0, i);
        }
    }
    return line;
}
// A committed grammar may name the rules of the format library.
function readRules(src, lib) {
    const defs = [];
    for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
        const text = uncomment(line);
        if (/^[ \t]*$/.test(text)) {
            continue;
        }
        if (/^[ \t]/.test(text)) {
            if (0 === defs.length) {
                throw new Refusal('abnf_grammar', 'a continuation line comes before any rule');
            }
            defs[defs.length - 1] += ' ' + trim(text);
        }
        else {
            defs.push(trim(text));
        }
    }
    const rules = new Map();
    let start = '';
    for (const def of defs) {
        const m = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*(=\/|=)[ \t]*(.*)$/s.exec(def);
        if (null == m) {
            throw new Refusal('abnf_grammar', 'not a rule: ' + head(def, 40));
        }
        const name = m[1].toLowerCase();
        const node = readElements(m[3], name);
        const had = rules.get(name);
        if ('=' === m[2]) {
            if (undefined !== had) {
                throw new Refusal('abnf_grammar', 'rule ' + name + ' is defined twice');
            }
            rules.set(name, node);
            start = '' === start ? m[1] : start;
        }
        else if (undefined === had) {
            throw new Refusal('abnf_grammar', 'rule ' + name + ' is extended before it is defined');
        }
        else {
            rules.set(name, { k: 'alt', alts: [...altsOf(had), ...altsOf(node)] });
        }
    }
    if ('' === start) {
        throw new Refusal('abnf_grammar', 'the grammar defines no rule');
    }
    const refer = (x) => {
        if ('ref' === x.k && !rules.has(x.name)) {
            const found = CORE[x.name] ?? lib?.get(x.name);
            if (undefined === found) {
                throw new Refusal('abnf_grammar', 'rule ' + x.name + ' is not defined');
            }
            rules.set(x.name, found);
            refer(found);
        }
        kids(x).forEach(refer);
    };
    for (const r of [...rules.values()]) {
        refer(r);
    }
    return [rules, start];
}
const altsOf = (n) => 'alt' === n.k ? n.alts : [n];
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
// The first n code points, for a message both ports spell alike.
const head = (s, n) => [...s].slice(0, n).join('');
const REPEAT = /([0-9]*)(\*?)([0-9]*)/y;
const NAME = /[A-Za-z][A-Za-z0-9-]*/y;
const NUMBER = /%([xXdDbB])([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+)|((?:\.[0-9A-Fa-f]+)+))?/y;
const BASE = { x: 16, d: 10, b: 2 };
const DIGITS = { 16: /^[0-9A-Fa-f]+$/, 10: /^[0-9]+$/, 2: /^[01]+$/ };
// Sticky, so a long generated rule is read in one pass.
function sticky(re, text, i) {
    re.lastIndex = i;
    return re.exec(text);
}
function readElements(text, rule) {
    let i = 0;
    let depth = 0;
    const bad = (why) => new Refusal('abnf_grammar', 'rule ' + rule + ': ' + why);
    const space = () => {
        while (' ' === text[i] || '\t' === text[i]) {
            i++;
        }
    };
    const alternation = () => {
        const alts = [concatenation()];
        space();
        while ('/' === text[i]) {
            i++;
            alts.push(concatenation());
            space();
        }
        return 1 === alts.length ? alts[0] : { k: 'alt', alts };
    };
    const concatenation = () => {
        const items = [];
        space();
        while (i < text.length && !'/)]'.includes(text[i])) {
            items.push(repetition());
            space();
        }
        if (0 === items.length) {
            throw bad('an alternative is empty');
        }
        return 1 === items.length ? items[0] : { k: 'cat', items };
    };
    const repetition = () => {
        const m = sticky(REPEAT, text, i);
        i += m[0].length;
        if (9 < m[1].length || 9 < m[3].length) {
            throw bad('a repeat count is past 999999999');
        }
        const lo = '' === m[1] ? undefined : Number(m[1]);
        const hi = '' === m[3] ? undefined : Number(m[3]);
        const min = '' === m[2] ? (lo ?? 1) : (lo ?? 0);
        const max = '' === m[2] ? (lo ?? 1) : (hi ?? Infinity);
        if (max < min) {
            throw bad('a repeat count has its bounds the wrong way round');
        }
        const node = element();
        return 1 === min && 1 === max ? node : { k: 'rep', min, max, node };
    };
    const element = () => {
        const c = text[i];
        if (undefined === c || ' ' === c || '\t' === c) {
            throw bad('a repeat count is not followed by an element');
        }
        if ('(' === c || '[' === c) {
            if (NEST_MAX === depth) {
                throw bad('groups nest deeper than ' + NEST_MAX);
            }
            i++;
            depth++;
            const node = alternation();
            depth--;
            if (('(' === c ? ')' : ']') !== text[i]) {
                throw bad('a group is not closed');
            }
            i++;
            return '(' === c ? node : { k: 'rep', min: 0, max: 1, node };
        }
        if ('"' === c) {
            return chars(true);
        }
        if ('%' === c) {
            const t = (text[i + 1] ?? '').toLowerCase();
            if ('s' === t || 'i' === t) {
                i += 2;
                return chars('i' === t);
            }
            return number();
        }
        if ('<' === c) {
            throw new Refusal('format_grammar', 'rule ' + rule + ': a prose value cannot be run');
        }
        const m = sticky(NAME, text, i);
        if (null == m) {
            throw bad('unexpected ' + head(text.slice(i), 8));
        }
        i += m[0].length;
        return { k: 'ref', name: m[0].toLowerCase() };
    };
    const chars = (ci) => {
        if ('"' !== text[i]) {
            throw bad('a string is malformed');
        }
        const end = text.indexOf('"', i + 1);
        if (end < 0) {
            throw bad('a string is not closed');
        }
        const s = text.slice(i + 1, end);
        i = end + 1;
        if (/[^\x20-\x7e]/.test(s)) {
            throw bad('a string holds a character outside %x20-7E');
        }
        const cps = [...s].map((ch) => ch.codePointAt(0));
        return 0 === cps.length ? { k: 'cat', items: [] } :
            { k: 'str', cps, ci: ci && /[A-Za-z]/.test(s) };
    };
    const number = () => {
        const m = sticky(NUMBER, text, i);
        const parts = null == m ? [] : [m[2], ...(undefined === m[3] ? [] : [m[3]]),
            ...(undefined === m[4] ? [] : m[4].slice(1).split('.'))];
        const base = null == m ? 0 : BASE[m[1].toLowerCase()];
        if (null == m || !parts.every((p) => DIGITS[base].test(p))) {
            throw bad('a numeric value is malformed');
        }
        i += m[0].length;
        const n = parts.map((p) => parseInt(p, base));
        if (n.some((v) => 0x10ffff < v)) {
            throw bad('a numeric value is past %x10FFFF');
        }
        if (undefined !== m[3]) {
            if (n[1] < n[0]) {
                throw bad('a range has its bounds the wrong way round');
            }
            return { k: 'cls', set: range(n[0], n[1]) };
        }
        return 1 === n.length ? { k: 'cls', set: range(n[0], n[0]) } :
            { k: 'str', cps: n, ci: false };
    };
    const out = alternation();
    if (i < text.length) {
        throw bad('unexpected ' + head(text.slice(i), 8));
    }
    return out;
}
// Depth first over the rules without recursing, so a long chain of
// rules cannot exhaust the stack: the rules in the order each is
// finished, and back(t) for an edge that closes a cycle at t.
function walk(edges, back) {
    const state = new Map();
    const done = [];
    for (const root of edges.keys()) {
        if (state.has(root)) {
            continue;
        }
        state.set(root, 1);
        const stack = [[root, 0]];
        while (0 < stack.length) {
            const top = stack[stack.length - 1];
            const out = edges.get(top[0]);
            if (top[1] === out.length) {
                stack.pop();
                state.set(top[0], 2);
                done.push(top[0]);
                continue;
            }
            const t = out[top[1]++];
            if (1 === state.get(t)) {
                back(t);
            }
            else if (undefined === state.get(t)) {
                state.set(t, 1);
                stack.push([t, 0]);
            }
        }
    }
    return done;
}
// The determinism pass: nullable, FIRST and one-character to a
// fixpoint, then FOLLOW where a choice needs it, then each choice held
// to one character of lookahead.
function analyse(rules, start) {
    const rule = (name) => rules.get(name);
    let ids = 0;
    const set = (r) => ({ id: ids++, r });
    const EMPTY = set([]);
    const unions = new Map();
    const join = (xs) => {
        if (xs.length < 2) {
            return xs[0] ?? EMPTY;
        }
        const key = xs.map((x) => x.id).join(',');
        const hit = unions.get(key) ?? set(unionAll(xs.map((x) => x.r)));
        unions.set(key, hit);
        return hit;
    };
    const clashes = new Map();
    const clash = (xs) => {
        const key = xs.map((x) => x.id).join(',');
        const hit = clashes.get(key) ?? shared(xs.map((x) => x.r));
        clashes.set(key, hit);
        return hit;
    };
    const nul = new Map();
    const fst = new Map();
    const one = new Map();
    const nl = (x) => nul.get(x) ?? false;
    const f = (x) => fst.get(x) ?? EMPTY;
    const on = (x) => one.get(x) ?? false;
    // The rules x refers to, or only those it can reach before reading a
    // character.
    const reach = (x, out, leading) => {
        if ('ref' === x.k) {
            out.add(x.name);
        }
        const next = leading && 'cat' === x.k ? lead(x.items, nl) : kids(x);
        next.forEach((k) => reach(k, out, leading));
        return out;
    };
    const edges = (leading) => new Map([...rules].map(([k, r]) => [k, [...reach(r, new Set(), leading)]]));
    const nodes = [];
    const seen = new Set();
    const collect = (x) => {
        if (!seen.has(x)) {
            seen.add(x);
            kids(x).forEach(collect);
            nodes.push(x);
        }
    };
    walk(edges(false), () => { }).forEach((k) => collect(rule(k)));
    for (const x of nodes) {
        if ('str' === x.k) {
            fst.set(x, set(caseOf(x.cps[0], x.ci)));
            one.set(x, 1 === x.cps.length);
        }
        else if ('cls' === x.k) {
            fst.set(x, set(x.set));
            one.set(x, true);
        }
    }
    const attrs = (x) => {
        switch (x.k) {
            case 'alt': return [x.alts.some(nl), join(x.alts.map(f)), x.alts.every(on)];
            case 'cat': return [x.items.every(nl), join(lead(x.items, nl).map(f)), false];
            case 'rep': return [0 === x.min || nl(x.node), 0 === x.max ? EMPTY : f(x.node), false];
            case 'ref': return [nl(rule(x.name)), f(rule(x.name)), on(rule(x.name))];
        }
    };
    const inner = nodes.filter((x) => 'str' !== x.k && 'cls' !== x.k);
    for (let moved = true; moved;) {
        moved = false;
        for (const x of inner) {
            const [n, s, o] = attrs(x);
            const was = fst.get(x);
            if (n !== nl(x) || o !== on(x) || undefined === was ||
                (s !== was && !sameRanges(s.r, was.r))) {
                nul.set(x, n);
                fst.set(x, s);
                one.set(x, o);
                moved = true;
            }
        }
    }
    // A rule that reaches itself before reading a character never stops.
    walk(edges(true), (t) => {
        throw new Refusal('format_grammar', 'rule ' + t + ' is left-recursive');
    });
    // Each node is visited with what can follow it, made only when asked
    // for, and whether the end of its rule can follow it.
    const once = (fn) => {
        let memo;
        return () => memo ??= fn();
    };
    const flow = (x, after, open, visit) => {
        visit(x, after, open);
        if ('alt' === x.k) {
            x.alts.forEach((a) => flow(a, after, open, visit));
        }
        else if ('cat' === x.k) {
            const afters = [];
            let next = after;
            let o = open;
            for (let j = x.items.length - 1; 0 <= j; j--) {
                afters[j] = [next, o];
                const it = x.items[j];
                const tail = next;
                next = once(() => nl(it) ? unionAll([f(it).r, tail()]) : f(it).r);
                o = o && nl(it);
            }
            x.items.forEach((it, j) => flow(it, afters[j][0], afters[j][1], visit));
        }
        else if ('rep' === x.k) {
            flow(x.node, 1 < x.max ? once(() => unionAll([f(x.node).r, after()])) : after, open, visit);
        }
    };
    const choice = (x) => ('alt' === x.k && x.alts.some(nl)) || ('rep' === x.k && x.min !== x.max);
    const follow = new Map();
    const tail = (name) => () => follow.get(name) ?? [];
    // A rule needs its FOLLOW when a choice, or a rule that needs its
    // own, can end it.
    const needed = new Set();
    const enders = new Map();
    const todo = [];
    const need = (name) => {
        if (!needed.has(name)) {
            needed.add(name);
            todo.push(name);
        }
    };
    for (const [name, r] of rules) {
        flow(r, tail(name), true, (x, _after, open) => {
            if (open && choice(x)) {
                need(name);
            }
            if (open && 'ref' === x.k) {
                enders.set(x.name, (enders.get(x.name) ?? new Set()).add(name));
            }
        });
    }
    while (0 < todo.length) {
        (enders.get(todo.pop()) ?? new Set()).forEach(need);
    }
    for (let moved = true; moved;) {
        moved = false;
        for (const [name, r] of rules) {
            flow(r, tail(name), true, (x, after) => {
                if ('ref' === x.k && needed.has(x.name)) {
                    const was = follow.get(x.name) ?? [];
                    const grown = unionAll([was, after()]);
                    if (!sameRanges(was, grown)) {
                        follow.set(x.name, grown);
                        moved = true;
                    }
                }
            });
        }
    }
    for (const [name, r] of rules) {
        const refuse = (why) => {
            throw new Refusal('format_grammar', 'rule ' + name + ': ' + why);
        };
        flow(r, tail(name), true, (x, after) => {
            if ('alt' === x.k) {
                const firsts = x.alts.map(f);
                const c = clash(firsts);
                if (0 <= c) {
                    refuse('two alternatives begin with ' + hex(c));
                }
                const empties = x.alts.filter((a) => nl(a)).length;
                if (1 < empties) {
                    refuse('two alternatives match the empty string');
                }
                const next = 0 < empties ? meet(join(firsts).r, after()) : [];
                if (0 < next.length) {
                    refuse('an alternative matches the empty string and another begins with ' +
                        hex(next[0][0]) + ', which can follow it');
                }
            }
            else if ('rep' === x.k && x.min !== x.max) {
                const next = meet(f(x.node).r, after());
                if (0 < next.length) {
                    refuse('an option or repetition begins with ' + hex(next[0][0]) +
                        ', which can follow it');
                }
            }
        });
    }
    const top = rule(start.toLowerCase());
    return { start, empty: nl(top), rules, first: fst, nullable: nul, one };
}
// The items a sequence can begin with: up to and including the first
// that cannot match the empty string.
function lead(items, nl) {
    const out = [];
    for (const it of items) {
        out.push(it);
        if (!nl(it)) {
            break;
        }
    }
    return out;
}
// A case-insensitive string's first character, in both its cases.
function caseOf(cp, ci) {
    const other = !ci ? cp : 0x41 <= cp && cp <= 0x5a ? cp + 0x20 :
        0x61 <= cp && cp <= 0x7a ? cp - 0x20 : cp;
    return unionAll([range(cp, cp), range(other, other)]);
}
function sameRanges(a, b) {
    return a.length === b.length && a.every((r, i) => r[0] === b[i][0] && r[1] === b[i][1]);
}
const grammars = [new Map(), new Map()];
let library;
function readGrammar(src, committed = false) {
    const cache = grammars[committed ? 1 : 0];
    const hit = cache.get(src);
    if (undefined !== hit) {
        return hit;
    }
    let out;
    try {
        const lib = committed ? (library ??= readRules(formatgrammars_1.FORMAT_LIBRARY)[0]) : undefined;
        const [rules, start] = readRules(src, lib);
        out = [analyse(rules, start), undefined, undefined];
    }
    catch (e) {
        // Only a refusal is raised above; anything else is a fault.
        /* node:coverage ignore next 3 */
        if (!(e instanceof Refusal)) {
            throw e;
        }
        out = [undefined, e.code, e.reason];
    }
    cache.set(src, out);
    return out;
}
// The recognizer: a stack of what is still to match, one choice per
// character. The answer is -1 for a match, the index of the first code
// point it cannot read otherwise, and undefined past the step bound.
function recognise(g, s) {
    const cps = [...s].map((c) => c.codePointAt(0));
    const end = cps.length;
    const f = (x) => g.first.get(x).r;
    const stack = [{ n: g.rules.get(g.start.toLowerCase()) }];
    let at = 0;
    let steps = 0;
    while (0 < stack.length) {
        if (FORMAT_STEP_MAX < ++steps) {
            return undefined;
        }
        const fr = stack.pop();
        const cp = cps[at];
        if ('rep' in fr) {
            const more = fr.count < fr.rep.max && at < end &&
                holds(f(fr.rep.node), cp) && (0 === fr.count || fr.at < at);
            if (more) {
                stack.push({ rep: fr.rep, count: fr.count + 1, at }, { n: fr.rep.node });
            }
            else if (fr.count < fr.rep.min && !g.nullable.get(fr.rep.node)) {
                return at;
            }
            continue;
        }
        const x = fr.n;
        // One character from a set: a class, a letter, or a rule of them.
        if (g.one.get(x)) {
            if (at === end || !holds(f(x), cp)) {
                return at;
            }
            at++;
            continue;
        }
        switch (x.k) {
            case 'str':
                for (const c of x.cps) {
                    if (at === end || !same(c, cps[at], x.ci)) {
                        return at;
                    }
                    at++;
                }
                break;
            case 'ref':
                stack.push({ n: g.rules.get(x.name) });
                break;
            case 'cat':
                for (let j = x.items.length - 1; 0 <= j; j--) {
                    stack.push({ n: x.items[j] });
                }
                break;
            case 'alt': {
                const pick = (at < end ? x.alts.find((a) => holds(f(a), cp)) : undefined) ??
                    x.alts.find((a) => g.nullable.get(a));
                if (undefined === pick) {
                    return at;
                }
                stack.push({ n: pick });
                break;
            }
            case 'rep':
                stack.push({ rep: x, count: 0, at });
        }
    }
    return at === end ? -1 : at;
}
function same(a, b, ci) {
    const fold = (c) => 0x41 <= c && c <= 0x5a ? c + 0x20 : c;
    return a === b || (ci && 0x61 <= fold(a) && fold(a) <= 0x7a && fold(a) === fold(b));
}
// A string that is one rule name names a format; any other is a grammar,
// which defines a rule and so holds `=`.
const RULE_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;
// A JSON Schema format is the committed grammars a string meets
// together, or regex, which the pattern dialect decides and so has none.
function formatOf(src) {
    if (!RULE_NAME.test(src)) {
        const [g, code, why] = readGrammar(src);
        return undefined === g ? [undefined, code, why] : [{ name: g.start, gs: [g] }, undefined, undefined];
    }
    const texts = formatgrammars_1.FORMAT_GRAMMARS.get(src);
    if (undefined === texts) {
        return 'regex' === src ? [{ name: src }, undefined, undefined] :
            [undefined, 'format_unknown', src];
    }
    return [{ name: src, gs: texts.map((t) => readGrammar(t, true)[0]) }, undefined, undefined];
}
// Whether a name is one of the formats JSON Schema defines, which
// format(name) reads without a grammar from its caller.
function isDefinedFormat(name) {
    return formatgrammars_1.FORMAT_GRAMMARS.has(name) || 'regex' === name;
} /* node:coverage ignore next 12 */
//# sourceMappingURL=formatgrammar.js.map