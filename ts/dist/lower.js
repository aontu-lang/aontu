"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitWords = splitWords;
exports.lowerASCII = lowerASCII;
exports.upperASCII = upperASCII;
exports.capitalise = capitalise;
exports.caseName = caseName;
exports.ident = ident;
exports.quote = quote;
exports.literal = literal;
exports.typeExpr = typeExpr;
exports.lowerHeader = lowerHeader;
exports.lowerDecl = lowerDecl;
const exactjson_1 = require("./exactjson");
function ln(at, text) {
    return { k: 'line', at, n: [text] };
}
const BLANK = { k: 'blank' };
// --- identifiers -------------------------------------------------------
function isUpper(c) {
    return 'A' <= c && c <= 'Z';
}
function isLower(c) {
    return 'a' <= c && c <= 'z';
}
function isDigit(c) {
    return '0' <= c && c <= '9';
}
function isASCII(c) {
    return c.codePointAt(0) < 0x80;
}
function splitWords(name) {
    const words = [];
    let cur = '';
    const chars = Array.from(name);
    for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if ('_' === c || '-' === c || ' ' === c) {
            if ('' !== cur) {
                words.push(cur);
            }
            cur = '';
            continue;
        }
        if ('' !== cur) {
            const prev = chars[i - 1];
            const next = chars[i + 1];
            const boundary = isASCII(c) && isASCII(prev) && ((isUpper(c) && (isLower(prev) || isDigit(prev))) ||
                (isDigit(c) !== isDigit(prev)) ||
                (isUpper(c) && isUpper(prev) && undefined !== next && isLower(next)));
            if (boundary) {
                words.push(cur);
                cur = '';
            }
        }
        cur += c;
    }
    if ('' !== cur) {
        words.push(cur);
    }
    return words;
}
function lowerASCII(s) {
    return Array.from(s).map((c) => isUpper(c) ? String.fromCharCode(c.charCodeAt(0) + 32) : c).join('');
}
function upperASCII(s) {
    return Array.from(s).map((c) => isLower(c) ? String.fromCharCode(c.charCodeAt(0) - 32) : c).join('');
}
// A word capitalised: the acronym set wins, so `id` is `ID` under a
// profile that lists it and `Id` under one that does not.
function capitalise(word, acronyms) {
    const low = lowerASCII(word);
    for (const a of acronyms) {
        if (lowerASCII(a) === low) {
            return a;
        }
    }
    const chars = Array.from(low);
    return upperASCII(chars[0]) + chars.slice(1).join('');
}
// THE CASE STYLES of aontu:render's %case, over the words.
function caseName(name, style, acronyms) {
    if ('as-is' === style) {
        return name;
    }
    const words = splitWords(name);
    if (0 === words.length) {
        return name;
    }
    if ('snake' === style) {
        return words.map(lowerASCII).join('_');
    }
    if ('screaming' === style) {
        return words.map(upperASCII).join('_');
    }
    if ('kebab' === style) {
        return words.map(lowerASCII).join('-');
    }
    const caps = words.map((w) => capitalise(w, acronyms));
    if ('pascal' === style) {
        return caps.join('');
    }
    // camel: the first word lower, and never an acronym.
    return lowerASCII(words[0]) + caps.slice(1).join('');
}
function ident(name, role, ctx, path, bare) {
    const rules = ctx.profile.ident ?? {};
    const style = rules.case?.[role] ?? 'as-is';
    const acronyms = rules.acronyms ?? [];
    let out = caseName(name, style, acronyms);
    if (bare && (rules.reserved ?? []).includes(out)) {
        ctx.lossy.push({
            unit: ctx.unit, path, tier: 1, construct: 'reserved',
            reason: out + ' is reserved in ' + ctx.profile.lang + '; renamed ' + out + '_',
        });
        out += '_';
    }
    return out;
}
// --- literals ----------------------------------------------------------
function hex4(n) {
    return '\\u' + n.toString(16).padStart(4, '0');
}
// A string literal: the profile's quote, and one pass over the code
// points through its escape table. A control character the table does
// not name is a \u escape; so are the quote and the backslash when the
// table is silent about them; everything else, non-ASCII and astral
// included, is verbatim.
function quote(s, profile) {
    const q = profile.str?.quote ?? '"';
    const table = profile.str?.escape ?? {};
    let out = q;
    for (const c of Array.from(s)) {
        const cp = c.codePointAt(0);
        const esc = table[String(cp)];
        if ('string' === typeof esc) {
            out += esc;
        }
        else if (cp < 0x20 || 0x7f === cp || c === q || '\\' === c) {
            out += hex4(cp);
        }
        else {
            out += c;
        }
    }
    return out + q;
}
// A literal value as the target spells it: a string quoted, a number
// through exactJSON (no second number formatter), a boolean as is, and
// null as the family's null.
function literal(v, ctx) {
    if ('string' === typeof v) {
        return quote(v, ctx.profile);
    }
    if (null === v) {
        return 'go' === ctx.family ? 'nil' : 'null';
    }
    if ('boolean' === typeof v) {
        return v ? 'true' : 'false';
    }
    return (0, exactjson_1.exactJSON)(v);
}
// A PARTIAL FORM TAKES THE SAME DEFAULTS AS AN ABSENT ONE. Read raw,
// a form that sets only `prec` answers undefined for `open`, and
// `undefined + text` spells it into the type.
function form(ctx, name) {
    return {
        open: '', close: '', prec: 9, childPrec: 0,
        ...(ctx.profile.types?.[name] ?? {}),
    };
}
function under(inner, f) {
    return inner.prec < f.childPrec ? '(' + inner.text + ')' : inner.text;
}
function loss(ctx, path, construct, reason) {
    ctx.lossy.push({ unit: ctx.unit, path, tier: 1, construct, reason });
}
// The primitive kind a literal set shares, for a family with no
// literal type: strings, integers, floats, booleans, null, or any.
function litPrim(of) {
    const kinds = of.map((v) => null === v ? 'null' : typeof v);
    const first = kinds[0];
    if (!kinds.every((k) => k === first)) {
        return 'any';
    }
    if ('number' === first) {
        return of.every((v) => Number.isInteger(v)) ? 'int' : 'float';
    }
    return 'string' === first ? 'string' : 'boolean' === first ? 'bool' : 'null';
}
function prim(ctx, name) {
    return ctx.profile.types?.prim?.[name] ?? name;
}
// THE TYPE EXPRESSION, from the profile's type forms (D6): an atom has
// prec 9; a form is `open + inner + close`, its precedence its own, its
// inner parenthesised below childPrec. A `text` leaf is verbatim
// target syntax and tier 3, as a text declaration is.
function typeExpr(t, ctx, path) {
    const k = t.k;
    if ('prim' === k) {
        return { text: prim(ctx, t.prim), prec: 9 };
    }
    if ('ref' === k) {
        return { text: ident(t.name, 'record', ctx, path, false), prec: 9 };
    }
    if ('text' === k) {
        ctx.lossy.push({
            unit: ctx.unit, path, tier: 3, construct: 'text',
            reason: 'verbatim ' + t.lang + ': the renderer checks nothing in it',
        });
        return { text: t.text, prec: 9 };
    }
    if ('list' === k) {
        const f = form(ctx, 'list');
        return { text: f.open + under(typeExpr(t.n, ctx, path + '.n'), f) + f.close, prec: f.prec };
    }
    if ('map' === k) {
        const f = form(ctx, 'map');
        const key = under(typeExpr(t.key, ctx, path + '.key'), f);
        const of = under(typeExpr(t.n, ctx, path + '.n'), f);
        const sep = 'go' === ctx.family ? ']' : ', ';
        return { text: f.open + key + sep + of + f.close, prec: f.prec };
    }
    if ('opt' === k) {
        const f = form(ctx, 'opt');
        return { text: f.open + under(typeExpr(t.n, ctx, path + '.n'), f) + f.close, prec: f.prec };
    }
    if ('union' === k) {
        if ('go' === ctx.family) {
            loss(ctx, path, 'union', 'go has no union type: any');
            return { text: prim(ctx, 'any'), prec: 9 };
        }
        const f = form(ctx, 'union');
        const members = t.n.map((m, i) => under(typeExpr(m, ctx, path + '.n.' + i), f));
        return { text: f.open + members.join(' | ') + f.close, prec: f.prec };
    }
    // lit
    if ('go' === ctx.family) {
        const p = litPrim(t.n);
        loss(ctx, path, 'lit', 'go has no literal type: ' + p);
        return { text: prim(ctx, p), prec: 9 };
    }
    const f = form(ctx, 'lit');
    const lits = t.n.map((v) => literal(v, ctx));
    return { text: f.open + lits.join(' | ') + f.close, prec: f.prec };
}
// --- comments ----------------------------------------------------------
// A doc comment as pieces at a depth: the profile's doc form -- open,
// a prefix per line, close -- and the line form when a profile has no
// doc form. A deprecation is the last line, in the family's spelling.
function doc(d, at, ctx) {
    if (null == d) {
        return [];
    }
    const forms = ctx.profile.comment ?? {};
    const f = forms.doc ?? forms.line ?? { prefix: '// ' };
    const prefix = f.prefix ?? '';
    const lines = String(d.text).split('\n');
    if (null != d.deprecated) {
        const dep = d.deprecated;
        const note = [dep.msg, dep.use ? 'use ' + dep.use : '', dep.since ? 'since ' + dep.since : '']
            .filter((s) => s).join('; ');
        lines.push('go' === ctx.family ? 'Deprecated: ' + note : '@deprecated ' + note);
    }
    const out = [];
    if (null != f.open) {
        out.push(ln(at, f.open));
    }
    for (const l of lines) {
        out.push(ln(at, (prefix + l).replace(/[ \t]+$/, '')));
    }
    if (null != f.close) {
        out.push(ln(at, f.close));
    }
    return out;
}
function checks(list, path, ctx) {
    (list ?? []).forEach((c, i) => {
        loss(ctx, path + '.check.' + i, 'check', 'the check ' + c.c + ' is not enforced by the ' + ctx.profile.lang + ' type system');
    });
}
// --- the unit header ---------------------------------------------------
// The path from one unit's directory to another unit, for a TypeScript
// import: `./other` beside, `../shared/x` across, the extension gone.
function relImport(from, to) {
    const a = from.split('/').slice(0, -1);
    const b = to.split('/');
    const file = b.pop().replace(/\.[^.]*$/, '');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
        i++;
    }
    const up = a.slice(i).map(() => '..');
    const parts = [...up, ...b.slice(i), file];
    return (0 === up.length ? './' : '') + parts.join('/');
}
// Imports derived from `{k:"ref", unit}` nodes, in order of first
// appearance, grouped by unit -- TypeScript only: a Go reference names
// a type in the same package.
function derivedImports(unit) {
    const groups = [];
    const visit = (t) => {
        if (null == t || 'object' !== typeof t) {
            return;
        }
        if (Array.isArray(t)) {
            t.forEach(visit);
            return;
        }
        if ('ref' === t.k && 'string' === typeof t.unit) {
            let g = groups.find((x) => x.from === t.unit);
            if (undefined === g) {
                g = { from: t.unit, names: [] };
                groups.push(g);
            }
            if (!g.names.includes(t.name)) {
                g.names.push(t.name);
            }
            return;
        }
        for (const key of ['type', 'n', 'key', 'returns', 'fields', 'params']) {
            visit(t[key]);
        }
    };
    visit(unit.decls);
    return groups;
}
// The banner from `code.source`, the package clause, and the imports:
// what stands before the declarations, each part followed by a blank.
function lowerHeader(unit, source, ctx) {
    const parts = [];
    const banner = ctx.profile.banner;
    if (null != banner && null != source?.path) {
        const prefix = ctx.profile.comment?.line?.prefix ?? '';
        parts.push([prefix + banner.split('{path}').join(source.path)
                .split('{hash}').join(source.hash ?? '')]);
    }
    if ('go' === ctx.family && 'string' === typeof unit.pkg) {
        parts.push(['package ' + unit.pkg]);
    }
    const imports = [...(unit.imports ?? [])];
    if ('typescript' === ctx.family) {
        for (const g of derivedImports(unit)) {
            imports.push({
                from: relImport(unit.path, g.from),
                names: g.names.map((n) => ident(n, 'record', ctx, '', false)),
            });
        }
    }
    if (0 < imports.length) {
        const lines = [];
        if ('go' === ctx.family) {
            const spell = (im) => (null == im.alias ? '' : im.alias + ' ') + quote(im.from, ctx.profile);
            if (1 === imports.length) {
                lines.push('import ' + spell(imports[0]));
            }
            else {
                lines.push('import (');
                for (const im of imports) {
                    lines.push(ln(1, spell(im)));
                }
                lines.push(')');
            }
        }
        else {
            for (const im of imports) {
                const from = quote(im.from, ctx.profile);
                if (Array.isArray(im.names) && 0 < im.names.length) {
                    lines.push('import { ' + im.names.join(', ') + ' } from ' + from + ';');
                }
                else if (null != im.alias) {
                    lines.push('import * as ' + im.alias + ' from ' + from + ';');
                }
                else {
                    lines.push('import ' + from + ';');
                }
            }
        }
        parts.push(lines);
    }
    // The parts, a blank between each two; the fold puts the blank
    // after the last when a declaration follows.
    const out = [];
    parts.forEach((part, i) => {
        if (0 < i) {
            out.push(BLANK);
        }
        out.push(...part);
    });
    return out;
}
// --- declarations ------------------------------------------------------
// A body fragment's pieces, one level deeper: a bare string is a line
// at depth 1, a line or a raw keeps its shape at `at + 1`, a blank is
// a blank.
function nest(pieces) {
    return pieces.map((p) => 'string' === typeof p ? ln(1, p)
        : 'blank' === p.k ? p : { ...p, at: (p.at ?? 0) + 1 });
}
function params(list, ctx, path) {
    return list.map((p, i) => {
        const ppath = path + '.params.' + i;
        const name = ident(p.name, 'param', ctx, ppath + '.name', true);
        const type = typeExpr(p.type, ctx, ppath + '.type').text;
        if ('go' === ctx.family) {
            if (undefined !== p.default) {
                loss(ctx, ppath + '.default', 'default', 'go has no default parameter: the default of ' + p.name + ' is dropped');
            }
            return name + ' ' + type;
        }
        return name + ': ' + type +
            (undefined === p.default ? '' : ' = ' + literal(p.default, ctx));
    }).join(', ');
}
// The lowering of one declaration to pieces. A `frag` and a `text`
// never arrive here: the fold takes those itself.
function lowerDecl(decl, path, ctx) {
    const go = 'go' === ctx.family;
    const out = [];
    const k = decl.k;
    if ('record' === k) {
        const name = ident(decl.name, 'record', ctx, path + '.name', true);
        out.push(...doc(decl.doc, 0, ctx));
        out.push(go ? 'type ' + name + ' struct {' : 'export interface ' + name + ' {');
        decl.fields.forEach((f, i) => {
            const fpath = path + '.fields.' + i;
            out.push(...doc(f.doc, 1, ctx));
            const fname = ident(f.name, 'field', ctx, fpath + '.name', false);
            const type = typeExpr(f.type, ctx, fpath + '.type');
            checks(f.check, fpath, ctx);
            const opt = true === f.optional;
            if (go) {
                const star = opt && 'opt' !== f.type.k ? '*' : '';
                out.push(ln(1, fname + ' ' + star + type.text +
                    ' `json:"' + f.name + (opt ? ',omitempty' : '') + '"`'));
            }
            else {
                out.push(ln(1, fname + (opt ? '?' : '') + ': ' + type.text + ';'));
            }
            if (undefined !== f.default) {
                loss(ctx, fpath + '.default', 'default', 'a field default is not expressed by a ' +
                    (go ? 'go struct' : 'typescript interface'));
            }
        });
        if (true === decl.open) {
            if (go) {
                loss(ctx, path + '.open', 'open', 'go has no open struct: extra keys are dropped');
            }
            else {
                out.push(ln(1, '[key: string]: unknown;'));
            }
        }
        checks(decl.check, path, ctx);
        out.push('}');
        return out;
    }
    if ('enum' === k) {
        const name = ident(decl.name, 'enum', ctx, path + '.name', true);
        out.push(...doc(decl.doc, 0, ctx));
        const members = decl.members;
        if (go) {
            const numeric = 0 < members.length &&
                members.every((m) => 'number' === typeof m.value);
            out.push('type ' + name + ' ' + prim(ctx, numeric ? 'int' : 'string'));
            out.push(BLANK, 'const (');
            members.forEach((m, i) => {
                out.push(...doc(m.doc, 1, ctx));
                const mname = name + ident(m.name, 'member', ctx, path + '.members.' + i + '.name', false);
                const value = undefined === m.value ? quote(m.name, ctx.profile) : literal(m.value, ctx);
                out.push(ln(1, mname + ' ' + name + ' = ' + value));
            });
            out.push(')');
        }
        else {
            out.push('export enum ' + name + ' {');
            members.forEach((m, i) => {
                out.push(...doc(m.doc, 1, ctx));
                const mname = ident(m.name, 'member', ctx, path + '.members.' + i + '.name', false);
                out.push(ln(1, mname + (undefined === m.value ? '' : ' = ' + literal(m.value, ctx)) + ','));
            });
            out.push('}');
        }
        return out;
    }
    if ('alias' === k) {
        const name = ident(decl.name, 'alias', ctx, path + '.name', true);
        out.push(...doc(decl.doc, 0, ctx));
        const type = typeExpr(decl.type, ctx, path + '.type').text;
        checks(decl.check, path, ctx);
        out.push(go ? 'type ' + name + ' ' + type : 'export type ' + name + ' = ' + type + ';');
        return out;
    }
    if ('const' === k) {
        const name = ident(decl.name, 'const', ctx, path + '.name', true);
        out.push(...doc(decl.doc, 0, ctx));
        const type = null == decl.type ? undefined : typeExpr(decl.type, ctx, path + '.type').text;
        const value = literal(decl.value, ctx);
        out.push(go
            ? 'const ' + name + (undefined === type ? '' : ' ' + type) + ' = ' + value
            : 'export const ' + name + (undefined === type ? '' : ': ' + type) + ' = ' + value + ';');
        return out;
    }
    // func
    const name = ident(decl.name, 'func', ctx, path + '.name', true);
    out.push(...doc(decl.doc, 0, ctx));
    const sig = params(decl.params, ctx, path);
    const returns = null == decl.returns ? undefined : typeExpr(decl.returns, ctx, path + '.returns').text;
    const abstract = 'abstract' === decl.body.k;
    if (go) {
        out.push('func ' + name + '(' + sig + ')' + (undefined === returns ? '' : ' ' + returns) + ' {');
        if (abstract) {
            loss(ctx, path + '.body', 'abstract', 'go has no abstract function: the body panics');
            out.push(ln(1, 'panic(' + quote('abstract', ctx.profile) + ')'));
        }
        else {
            out.push(...nest(decl.body.n));
        }
        out.push('}');
    }
    else {
        const ret = ': ' + (returns ?? 'void');
        if (abstract) {
            out.push('export declare function ' + name + '(' + sig + ')' + ret + ';');
        }
        else {
            out.push('export function ' + name + '(' + sig + ')' + ret + ' {');
            out.push(...nest(decl.body.n));
            out.push('}');
        }
    }
    return out;
}
//# sourceMappingURL=lower.js.map