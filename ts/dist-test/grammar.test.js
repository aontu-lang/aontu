"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const lsp_1 = require("../dist/lsp");
function readText(...parts) {
    return Fs.readFileSync(Path.join(...parts), 'utf8')
        .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
const GRAMMAR_DIR = Path.join(__dirname, '..', '..', 'grammar');
const SPEC_DIR = Path.join(__dirname, '..', '..', 'test', 'spec');
class GbnfParser {
    constructor(text) {
        this.at = 0;
        this.text = text;
    }
    // rule ::= expr, one per (possibly continued) definition.
    rules() {
        const out = new Map();
        // Strip comments and blank lines, then split on the ::= boundaries
        // so a rule may span lines.
        const body = this.text
            .split('\n')
            .map((l) => (l.trimStart().startsWith('#') ? '' : l))
            .join('\n');
        const parts = body.split(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*::=/m);
        for (let i = 1; i < parts.length; i += 2) {
            const name = parts[i].trim();
            this.text = parts[i + 1];
            this.at = 0;
            out.set(name, this.alt());
            this.skip();
            Assert.equal(this.at, this.text.length, `unparsed grammar text in rule ${name}: ` +
                JSON.stringify(this.text.slice(this.at, this.at + 40)));
        }
        return out;
    }
    skip() {
        while (this.at < this.text.length && /\s/.test(this.text[this.at])) {
            this.at++;
        }
    }
    alt() {
        const v = [this.seq()];
        for (;;) {
            this.skip();
            if ('|' !== this.text[this.at]) {
                return 1 === v.length ? v[0] : { t: 'alt', v };
            }
            this.at++;
            v.push(this.seq());
        }
    }
    seq() {
        const v = [];
        for (;;) {
            this.skip();
            const c = this.text[this.at];
            if (null == c || '|' === c || ')' === c) {
                return 1 === v.length ? v[0] : { t: 'seq', v };
            }
            v.push(this.postfix());
        }
    }
    postfix() {
        const e = this.prim();
        const c = this.text[this.at];
        if ('*' === c) {
            this.at++;
            return { t: 'rep', v: e, min: 0, max: Infinity };
        }
        if ('+' === c) {
            this.at++;
            return { t: 'rep', v: e, min: 1, max: Infinity };
        }
        if ('?' === c) {
            this.at++;
            return { t: 'rep', v: e, min: 0, max: 1 };
        }
        return e;
    }
    prim() {
        const c = this.text[this.at];
        if ('(' === c) {
            this.at++;
            const e = this.alt();
            this.skip();
            Assert.equal(this.text[this.at], ')', 'unclosed group in grammar');
            this.at++;
            return e;
        }
        if ('"' === c) {
            return { t: 'lit', v: this.quoted() };
        }
        if ('[' === c) {
            return this.charClass();
        }
        const m = /^[a-zA-Z_][a-zA-Z0-9_-]*/.exec(this.text.slice(this.at));
        Assert.ok(null != m, 'unexpected grammar text: ' +
            JSON.stringify(this.text.slice(this.at, this.at + 30)));
        this.at += m[0].length;
        return { t: 'ref', v: m[0] };
    }
    // A double-quoted literal, with the same escapes the file may use.
    quoted() {
        this.at++;
        let out = '';
        for (;;) {
            const c = this.text[this.at];
            Assert.ok(null != c, 'unterminated literal in grammar');
            this.at++;
            if ('"' === c) {
                return out;
            }
            out += '\\' === c ? this.escape() : c;
        }
    }
    escape() {
        const c = this.text[this.at++];
        return 'n' === c ? '\n' : 't' === c ? '\t' : 'r' === c ? '\r' : c;
    }
    charClass() {
        this.at++;
        const neg = '^' === this.text[this.at];
        if (neg) {
            this.at++;
        }
        const set = [];
        for (;;) {
            let c = this.text[this.at];
            Assert.ok(null != c, 'unterminated character class in grammar');
            this.at++;
            if (']' === c) {
                return { t: 'class', neg, set };
            }
            if ('\\' === c) {
                c = this.escape();
            }
            if ('-' === this.text[this.at] && ']' !== this.text[this.at + 1]) {
                this.at++;
                let hi = this.text[this.at++];
                if ('\\' === hi) {
                    hi = this.escape();
                }
                set.push([c.codePointAt(0), hi.codePointAt(0)]);
            }
            else {
                set.push([c.codePointAt(0), c.codePointAt(0)]);
            }
        }
    }
}
// A packrat matcher: (expr, position) -> end position, or -1.
class Matcher {
    constructor(rules, input) {
        this.rules = rules;
        this.input = input;
        this.memo = new Map();
    }
    // Does the whole input match the root rule?
    accepts(root) {
        return this.input.length === this.match({ t: 'ref', v: root }, 0);
    }
    match(e, at) {
        switch (e.t) {
            case 'lit':
                return this.input.startsWith(e.v, at) ? at + e.v.length : -1;
            case 'class': {
                if (this.input.length <= at) {
                    return -1;
                }
                const cp = this.input.codePointAt(at);
                const wide = 0xffff < cp ? 2 : 1;
                const inSet = e.set.some(([lo, hi]) => lo <= cp && cp <= hi);
                return inSet !== e.neg ? at + wide : -1;
            }
            case 'ref': {
                const key = e.v + '@' + at;
                const seen = this.memo.get(key);
                if (undefined !== seen) {
                    return seen;
                }
                const rule = this.rules.get(e.v);
                Assert.ok(null != rule, `no such grammar rule: ${e.v}`);
                this.memo.set(key, -1);
                const end = this.match(rule, at);
                this.memo.set(key, end);
                return end;
            }
            case 'seq': {
                let pos = at;
                for (const part of e.v) {
                    pos = this.match(part, pos);
                    if (pos < 0) {
                        return -1;
                    }
                }
                return pos;
            }
            case 'alt': {
                for (const part of e.v) {
                    const end = this.match(part, at);
                    if (0 <= end) {
                        return end;
                    }
                }
                return -1;
            }
            case 'rep': {
                let pos = at;
                let n = 0;
                for (; n < e.max;) {
                    const end = this.match(e.v, pos);
                    if (end < 0 || end === pos) {
                        break;
                    }
                    pos = end;
                    n++;
                }
                return n < e.min ? -1 : pos;
            }
        }
    }
}
// Ordered choice makes a longest-match rule necessary in one place:
// `alt` returns the FIRST alternative that matches, which for a
// grammar written with the longer spelling first is also the longest.
// The published file is written that way (`0d…` before `number`,
// `biginteger` before `boolean`); this test proves it.
function accepts(rules, text) {
    return new Matcher(rules, text).accepts('root');
}
// The suite's own escape rules, character by character, exactly as
// ts/test/spec.test.ts reads them: a corpus decoded any other way is
// not the corpus the runners execute.
function unescape(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if ('\\' === c && i + 1 < s.length) {
            const n = s[++i];
            out += 'n' === n ? '\n' : 't' === n ? '\t' : n;
        }
        else {
            out += c;
        }
    }
    return out;
}
function canonCorpus() {
    const out = [];
    for (const file of Fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.tsv'))) {
        const text = readText(SPEC_DIR, file);
        for (const line of text.split('\n')) {
            if ('' === line || line.startsWith('#')) {
                continue;
            }
            const parts = line.split('\t');
            if ('canon' !== parts[1] || 4 > parts.length) {
                continue;
            }
            out.push({
                file,
                name: parts[0],
                canon: unescape(parts[3]),
            });
        }
    }
    return out;
}
function abnfRules(text) {
    const { AbnfReader } = require('../scripts/abnf.cjs');
    return new AbnfReader(text ?? readText(GRAMMAR_DIR, 'aontu.abnf')).rules();
}
(0, node_test_1.describe)('grammar', () => {
    const rules = new GbnfParser(readText(GRAMMAR_DIR, 'aontu.gbnf')).rules();
    const abnf = abnfRules();
    (0, node_test_1.test)('the-published-grammar-parses', () => {
        Assert.ok(rules.has('root'), 'no root rule');
        // Every referenced rule is defined: a grammar that names a rule it
        // does not define is one no decoder can load.
        const named = new Set();
        const walk = (e) => {
            if ('ref' === e.t) {
                named.add(e.v);
            }
            else if ('seq' === e.t || 'alt' === e.t) {
                e.v.forEach(walk);
            }
            else if ('rep' === e.t) {
                walk(e.v);
            }
        };
        rules.forEach(walk);
        for (const n of named) {
            Assert.ok(rules.has(n), `undefined grammar rule: ${n}`);
        }
        // And every defined rule is reachable from the root, so the file
        // carries no orphan a reader would have to guess about.
        const live = new Set(['root']);
        for (let grew = true; grew;) {
            grew = false;
            for (const name of [...live]) {
                const seen = new Set();
                const collect = (e) => {
                    if ('ref' === e.t) {
                        seen.add(e.v);
                    }
                    else if ('seq' === e.t || 'alt' === e.t) {
                        e.v.forEach(collect);
                    }
                    else if ('rep' === e.t) {
                        collect(e.v);
                    }
                };
                collect(rules.get(name));
                for (const s of seen) {
                    if (!live.has(s)) {
                        live.add(s);
                        grew = true;
                    }
                }
            }
        }
        for (const name of rules.keys()) {
            Assert.ok(live.has(name), `unreachable grammar rule: ${name}`);
        }
    });
    // THE PARITY TEST the design asks for: the suite's own canonical
    // output is the corpus, and the published grammar has to accept all
    // of it. A canon string the grammar refuses is a document the
    // engine emits and a constrained decoder could not.
    (0, node_test_1.test)('every-canon-output-parses-under-the-published-grammar', () => {
        const corpus = canonCorpus();
        Assert.ok(500 < corpus.length, 'canon corpus is suspiciously small');
        const refused = [];
        for (const row of corpus) {
            if (!accepts(rules, row.canon)) {
                refused.push(`${row.file}:${row.name}: ${row.canon}`);
            }
        }
        Assert.deepEqual(refused, []);
    });
    // CONSERVATIVE BY CONSTRUCTION: the grammar must not accept what the
    // language does not mean, and above all not the include directive,
    // which a constrained decoder must never be able to emit.
    (0, node_test_1.test)('the-grammar-refuses-what-it-should', () => {
        for (const bad of [
            'a: @"./secret.aon"', // an include, the one deliberate exclusion
            '@"x"',
            '{a:1}', // an unquoted key: canon quotes every key
            '{"a":}',
            '{"a":1,}',
            '[1,]',
            'nope(1)', // not a builtin
            '{"a":1}}',
            '$.', // a path with an empty segment
            '',
        ]) {
            Assert.equal(accepts(rules, bad), false, `accepted: ${bad}`);
        }
    });
    // THE SAME CORPUS, THE SAME MATCHER, THE OTHER NOTATION. The ABNF
    // form is what the language reference publishes and what the railroad
    // figures are drawn from, so it has to be the same language as the
    // GBNF and not a description of it.
    (0, node_test_1.test)('every-canon-output-parses-under-the-abnf-grammar', () => {
        const corpus = canonCorpus();
        Assert.ok(500 < corpus.length, 'canon corpus is suspiciously small');
        const refused = [];
        for (const row of corpus) {
            if (!new Matcher(abnf, row.canon).accepts('root')) {
                refused.push(`${row.file}:${row.name}: ${row.canon}`);
            }
        }
        Assert.deepEqual(refused, []);
    });
    // And the same exclusions, above all the include directive.
    (0, node_test_1.test)('the-abnf-grammar-refuses-what-it-should', () => {
        for (const bad of [
            'a: @"./secret.aon"',
            '@"x"',
            '{a:1}',
            '{"a":}',
            '{"a":1,}',
            '[1,]',
            'nope(1)',
            '{"a":1}}',
            '$.',
            '',
        ]) {
            Assert.equal(new Matcher(abnf, bad).accepts('root'), false, `accepted: ${bad}`);
        }
    });
    (0, node_test_1.test)('the-abnf-grammar-names-the-same-rules', () => {
        for (const name of rules.keys()) {
            Assert.ok(abnf.has(name), `rule missing from aontu.abnf: ${name}`);
        }
        // Defined and reachable, as the GBNF is held to be.
        const live = new Set(['root']);
        for (let grew = true; grew;) {
            grew = false;
            for (const name of [...live]) {
                const rule = abnf.get(name);
                Assert.ok(null != rule, `undefined abnf rule: ${name}`);
                const walk = (e) => {
                    if ('ref' === e.t) {
                        if (!live.has(e.v)) {
                            live.add(e.v);
                            grew = true;
                        }
                    }
                    else if ('seq' === e.t || 'alt' === e.t) {
                        e.v.forEach(walk);
                    }
                    else if ('rep' === e.t) {
                        walk(e.v);
                    }
                };
                walk(rule);
            }
        }
        for (const name of abnf.keys()) {
            Assert.ok(live.has(name), `unreachable abnf rule: ${name}`);
        }
    });
    // The fourth copy of the builtin set, held the way the other three
    // are. The list is the same hand-written copy of the same registry,
    // and this is the notation a reader of the language reference sees.
    (0, node_test_1.test)('the-abnf-grammar-names-exactly-the-engine-builtins', () => {
        const rule = abnf.get('name');
        Assert.ok(null != rule, 'no name rule in aontu.abnf');
        // Read off the TREE rather than out of the text: the reader has
        // already found the rule's boundaries, so there is no terminator
        // here to stop matching and no slice to run away -- which is the
        // failure the gbnf and lark slices above are each guarded against.
        const named = new Set();
        const walk = (e) => {
            if ('lit' === e.t) {
                named.add(e.v);
            }
            else if ('alt' === e.t || 'seq' === e.t) {
                e.v.forEach(walk);
            }
        };
        walk(rule);
        const engine = new Set(lsp_1.BUILTIN_FUNCS);
        for (const name of engine) {
            Assert.ok(named.has(name), `builtin missing from aontu.abnf: ${name}`);
        }
        for (const name of named) {
            Assert.ok(engine.has(name), `aontu.abnf names a function the engine does not have: ${name}`);
        }
    });
    (0, node_test_1.test)('the-abnf-reader-refuses-a-case-insensitive-literal', () => {
        Assert.throws(() => abnfRules('root = "true"'), /RFC 7405/);
        Assert.deepEqual([...abnfRules('root = %s"true"').keys()], ['root']);
    });
    (0, node_test_1.test)('the-grammar-names-exactly-the-engine-builtins', () => {
        const gbnf = readText(GRAMMAR_DIR, 'aontu.gbnf');
        const start = gbnf.indexOf('\nname ::=');
        Assert.ok(-1 < start, 'no name rule in aontu.gbnf');
        const blank = gbnf.indexOf('\n\n', start);
        const end = -1 === blank ? gbnf.length : blank;
        const named = new Set([...gbnf.slice(start, end).matchAll(/"([a-z]+)"/g)].map((m) => m[1]));
        const rules = (gbnf.slice(start, end).match(/::=/g) ?? []).length;
        Assert.equal(rules, 1, `the name rule slice spans ${rules} rules (${named.size} names) -- ` +
            'the terminator probably stopped matching');
        const engine = new Set(lsp_1.BUILTIN_FUNCS);
        for (const name of engine) {
            Assert.ok(named.has(name), `builtin missing from aontu.gbnf: ${name}`);
        }
        for (const name of named) {
            Assert.ok(engine.has(name), `aontu.gbnf names a function the engine does not have: ${name}`);
        }
    });
    (0, node_test_1.test)('the-lark-grammar-names-the-same-rules', () => {
        const lark = readText(GRAMMAR_DIR, 'aontu.lark');
        const larkRules = new Set([...lark.matchAll(/^(?:\?)?([a-z_][a-z0-9_]*)\s*:/gm)].map((m) => m[1]));
        for (const name of rules.keys()) {
            Assert.ok(larkRules.has(name.replaceAll('-', '_')), `rule missing from aontu.lark: ${name}`);
        }
    });
    (0, node_test_1.test)('the-lark-grammar-names-exactly-the-engine-builtins', () => {
        const lark = readText(GRAMMAR_DIR, 'aontu.lark');
        const start = lark.indexOf('\nname:');
        Assert.ok(-1 < start, 'no name rule in aontu.lark');
        // Terminated the way the gbnf slice is, and guarded the same way:
        // a miss from indexOf is -1, and `slice(start, -1)` means
        // "everything bar the last character", not "to the end".
        const blank = lark.indexOf('\n\n', start);
        const end = -1 === blank ? lark.length : blank;
        const slice = lark.slice(start, end);
        const named = new Set([...slice.matchAll(/"([a-z]+)"/g)].map((m) => m[1]));
        // The invariant, not a threshold: the slice is ONE rule, so exactly
        // one line in it opens a rule. Comments start with `//` and
        // continuation lines with `|`, so neither can be mistaken for one.
        const opens = (slice.match(/^[a-z_][a-z0-9_]*\s*:/gm) ?? []).length;
        Assert.equal(opens, 1, `the name rule slice spans ${opens} rules (${named.size} names) -- ` +
            'the terminator probably stopped matching');
        const engine = new Set(lsp_1.BUILTIN_FUNCS);
        for (const name of engine) {
            Assert.ok(named.has(name), `builtin missing from aontu.lark: ${name}`);
        }
        for (const name of named) {
            Assert.ok(engine.has(name), `aontu.lark names a function the engine does not have: ${name}`);
        }
    });
    (0, node_test_1.test)('the-textmate-grammar-names-exactly-the-engine-builtins', () => {
        const tm = JSON.parse(readText(GRAMMAR_DIR, 'aontu.tmLanguage.json'));
        const match = tm.repository?.builtin?.match ?? '';
        Assert.ok('' !== match, 'no builtin rule in aontu.tmLanguage.json');
        const group = /\\b\(([a-z|]+)\)\\b/.exec(match);
        Assert.ok(null !== group, 'the builtin rule is no longer one \\b(a|b|c)\\b alternation -- ' +
            'the names cannot be read out of it');
        const named = new Set(group[1].split('|'));
        const engine = new Set(lsp_1.BUILTIN_FUNCS);
        for (const name of engine) {
            Assert.ok(named.has(name), `builtin missing from aontu.tmLanguage.json: ${name}`);
        }
        for (const name of named) {
            Assert.ok(engine.has(name), 'aontu.tmLanguage.json names a function the engine does not ' +
                `have: ${name}`);
        }
    });
    (0, node_test_1.test)('the-extension-copy-of-the-textmate-grammar-is-the-published-one', () => {
        const published = readText(GRAMMAR_DIR, 'aontu.tmLanguage.json');
        const shipped = readText(__dirname, '..', '..', 'editors', 'vscode', 'syntaxes', 'aontu.tmLanguage.json');
        Assert.equal(shipped, published, 'editors/vscode/syntaxes/aontu.tmLanguage.json has drifted from ' +
            'grammar/aontu.tmLanguage.json -- run `npm run sync-grammar` in ' +
            'editors/vscode');
    });
});
//# sourceMappingURL=grammar.test.js.map