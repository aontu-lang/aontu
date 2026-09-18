"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmitFuncVal = void 0;
const unify_1 = require("../unify");
const err_1 = require("../err");
const escape_1 = require("../escape");
const keyorder_1 = require("../keyorder");
const top_1 = require("./top");
const ListVal_1 = require("./ListVal");
const StringVal_1 = require("./StringVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
const PlusOpVal_1 = require("./PlusOpVal");
const members_1 = require("./members");
function isRefusal(x) {
    return 'string' === typeof x.code;
}
// Read the table. A map is one template; a list is many. The shape is
// checked here rather than at the call, because a table is ordinary
// data and may be computed.
function tableTemplates(table) {
    const t = table;
    if (true === t?.isEmitFunc) {
        return tableTemplates(t.peg[1]);
    }
    if (true === t?.isMap) {
        const one = oneTemplate(t, 0);
        return isRefusal(one) ? one : [one];
    }
    if (true === t?.isList) {
        const out = [];
        for (const el of t.peg) {
            const e = el;
            if (true !== e?.isMap) {
                return { code: 'emit_template' };
            }
            const one = oneTemplate(e, out.length);
            if (isRefusal(one)) {
                return one;
            }
            out.push(one);
        }
        return out;
    }
    return { code: 'emit_table' };
}
function oneTemplate(m, idx) {
    const match = m.peg.match;
    const body = m.peg.body;
    if (null == match || null == body) {
        return { code: 'emit_template' };
    }
    if (true !== body.isList) {
        return { code: 'emit_body' };
    }
    const replace = m.peg.replace;
    if (null != replace && true !== replace.isMap) {
        return { code: 'emit_template' };
    }
    const escv = m.peg.esc;
    let esc = '';
    if (null != escv) {
        const name = textOf(escv);
        if (undefined === name || ('none' !== name && !(0, escape_1.isEscVariant)(name))) {
            return { code: 'esc_variant' };
        }
        esc = name;
    }
    const lits = literalSpots(body.peg);
    if (null != replace) {
        const bad = checkReplace(Object.keys(replace.peg), lits);
        if (undefined !== bad) {
            return bad;
        }
    }
    return { match, body, replace, esc, lits, idx };
}
// The string a value carries, or undefined when it is not a string.
function textOf(v) {
    return true === v?.isScalar && 'string' === typeof v.peg ? v.peg : undefined;
}
function literalSpots(elems) {
    const out = [];
    elems.forEach((el, i) => {
        const s = textOf(el);
        if (undefined !== s) {
            out.push({ i, s });
            return;
        }
        if (true !== el?.isMap) {
            return;
        }
        const chunks = el.peg.n;
        if (true === chunks?.isList) {
            chunks.peg.forEach((p, j) => {
                const ps = textOf(p);
                if (undefined !== ps) {
                    out.push({ i, n: j, s: ps });
                }
            });
        }
        const ts = textOf(el.peg.text);
        if (undefined !== ts) {
            out.push({ i, text: true, s: ts });
        }
    });
    return out;
}
function checkReplace(keys, lits) {
    const sorted = [...keys].sort(keyorder_1.cmpCodePoint);
    for (const a of sorted) {
        for (const b of sorted) {
            if (a !== b && b.includes(a)) {
                return { code: 'replace_overlap', details: { key: quoted(a), other: quoted(b) } };
            }
        }
    }
    for (const k of sorted) {
        if ('' === k || !lits.some((l) => l.s.includes(k))) {
            return { code: 'replace_unused', details: { key: quoted(k) } };
        }
    }
    return undefined;
}
function substitute(text, pairs) {
    let out = '';
    let i = 0;
    while (i < text.length) {
        const hit = pairs.find((p) => text.startsWith(p[0], i));
        if (undefined === hit) {
            out += text[i];
            i += 1;
        }
        else {
            out += hit[1];
            i += hit[0].length;
        }
    }
    return out;
}
function substituted(inst, i, lits, pairs, ctx) {
    for (const l of lits) {
        if (l.i !== i) {
            continue;
        }
        const sv = new StringVal_1.StringVal({ peg: substitute(l.s, pairs) }, ctx);
        if (undefined !== l.n) {
            inst.peg.n.peg[l.n] = sv;
        }
        else if (true === l.text) {
            inst.peg.text = sv;
        }
        else {
            inst = sv;
        }
    }
    return inst;
}
// A key as the message writes it, quoted so an empty key is visible.
function quoted(s) {
    return '"' + s + '"';
}
function unpref(v) {
    while (true === v.isPref) {
        v = v.peg;
    }
    return v;
}
// Every relative reference in `v` replaced by the field of `node` it
// names. Answers `v` unchanged when it holds none, so a body with no
// substitutions is never needlessly rebuilt -- the identity test
// `fillPlace` already relies on.
function bindNode(v, node, ctx, fail) {
    if (true === v?.isRef && true !== v.absolute) {
        const found = nodeField(v, node);
        if (undefined === found) {
            fail.ref = undefined === fail.ref ? v.canon : fail.ref;
            return v;
        }
        const out = found.clone(ctx);
        if (null == out.origin && null != node.origin) {
            ;
            out.origin = node.origin +
                v.peg.map((seg) => '.' + seg).join('');
        }
        return out;
    }
    const peg = v?.peg;
    const bound = (0, PlaceVal_1.boundArgStart)(v);
    if (Array.isArray(peg)) {
        let changed = false;
        const out = peg.map((c, cI) => {
            if (true !== c?.isVal || bound <= cI) {
                return c;
            }
            const b = bindNode(c, node, ctx, fail);
            changed = changed || b !== c;
            return b;
        });
        return changed ? (0, PlaceVal_1.rebuild)(v, out, ctx) : v;
    }
    if (true === peg?.isVal) {
        const b = bindNode(peg, node, ctx, fail);
        return b === peg ? v : (0, PlaceVal_1.rebuild)(v, b, ctx);
    }
    if (null != peg && 'object' === typeof peg) {
        let changed = false;
        const out = {};
        for (const k of Object.keys(peg)) {
            const c = peg[k];
            // No isVal guard, for the reason fillPlace gives: a slot holding
            // something that is not a Val answers itself, because the tests
            // above -- is it a reference, has it a peg -- are both false for
            // one.
            const b = bindNode(c, node, ctx, fail);
            changed = changed || b !== c;
            out[k] = b;
        }
        return changed ? (0, PlaceVal_1.rebuild)(v, out, ctx) : v;
    }
    return v;
}
function nodeField(ref, node) {
    let cur = node;
    for (const seg of ref.peg) {
        if ('string' !== typeof seg || '.' === seg) {
            return undefined;
        }
        const peg = cur?.peg;
        if (true !== cur?.isBag || null == peg) {
            return undefined;
        }
        cur = true === cur.isList ? peg[Number(seg)] : peg[seg];
        if (true !== cur?.isVal) {
            return undefined;
        }
    }
    return cur;
}
function nodeAddr(sel, key, node) {
    if (null != node.origin) {
        return node.origin;
    }
    return undefined === sel ? '' : sel + '.' + key;
}
// A body element that is itself a list splices, which is what makes a
// nested emit compose into one flat sequence.
function splice(v, out) {
    if (true === v?.isList) {
        for (const el of v.peg) {
            splice(el, out);
        }
        return;
    }
    out.push(v);
}
class EmitFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isEmitFunc = true;
        // THE STAGING RULE (G8 phase 0, see AontuContext.settle). The
        // selection is not settled merely by being `done` once -- a sibling
        // conjunct, an include or a spread can still merge nodes into it,
        // and pieces emitted from the half-merged bag would be missing.
        this.staged = true;
    }
    funcname() {
        return 'emit';
    }
    // NEITHER ARGUMENT IS DRIVEN BY THE BASE. The selection is driven by
    // hand below; the TABLE is not driven at all, because a body is a
    // template and driving it would resolve its references at the call
    // site -- the one position a body is never used at.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        // ONE argument is driven: the selection. The table holds bodies,
        // which are templates (see prepare above).
        if (!this.stagedReady(peer, ctx, 1)) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const nodes = (0, members_1.bagMembers)(args?.[0], ctx);
        if (undefined === nodes) {
            return (0, err_1.makeNilErr)(ctx, 'emit_data', this);
        }
        let table = args?.[1];
        if (true === table?.isRef) {
            table = table.unify((0, top_1.top)(), ctx);
        }
        const templates = tableTemplates(table);
        if (isRefusal(templates)) {
            return this.refuse(ctx, templates);
        }
        const rec = undefined !== ctx.reads;
        const tableAddr = rec ? (table?.origin ?? '') : '';
        const selAddr = rec ? args?.[0]?.origin : undefined;
        const peg = [];
        for (const member of nodes) {
            const node = member.val;
            const tmpl = this.dispatch(ctx, node, templates);
            if ('string' === typeof tmpl) {
                return (0, err_1.makeNilErr)(ctx, 'emit_none', this, undefined, 'resolve', {
                    value: node.canon,
                    tried: tmpl,
                });
            }
            const fail = {};
            let mark = undefined;
            if (rec) {
                const naddr = nodeAddr(selAddr, member.key, node);
                if ('' !== naddr && null == node.origin) {
                    ;
                    node.origin = naddr;
                }
                mark = { node: naddr, rule: tableAddr + '#' + tmpl.idx };
            }
            this.instantiate(ctx, node, tmpl, peg, fail, mark);
            if (undefined !== fail.ref) {
                return (0, err_1.makeNilErr)(ctx, 'emit_ref', this, undefined, 'resolve', {
                    ref: fail.ref,
                    value: node.canon,
                });
            }
            if (undefined !== fail.code) {
                return this.refuse(ctx, { code: fail.code, details: fail.details });
            }
        }
        // THE PIECES ARE PATHED WHERE THEY LAND, once the splicing has
        // settled how many there are. A piece keeps no trace of the body
        // it was written in: the body is a template, and a template's
        // parse position is the one place it is never used.
        for (let i = 0; i < peg.length; i++) {
            (0, Val_1.repathInstance)(peg[i], [...ctx.path, String(i)]);
        }
        return new ListVal_1.ListVal({ peg }, ctx);
    }
    // The located error for a refusal, with the message's details when
    // the refusal carries them.
    refuse(ctx, r) {
        return undefined === r.details ? (0, err_1.makeNilErr)(ctx, r.code, this)
            : (0, err_1.makeNilErr)(ctx, r.code, this, undefined, 'resolve', r.details);
    }
    // First match wins, in table order, by unifiability -- the same
    // question `match` and `filter` ask, answered the same way. Returns
    // the patterns tried when nothing matched, for the located error.
    dispatch(ctx, node, templates) {
        const tried = [];
        for (const tmpl of templates) {
            tried.push(tmpl.match.canon);
            // The trial is against CLONES: `unite` refines a bag in place
            // against a TOP peer, and a pattern that failed must be untouched
            // for the next node.
            const met = (0, FuncBaseVal_1.trialUnify)(ctx, node.clone(ctx), tmpl.match.clone(ctx));
            if (undefined !== met && (0, FuncBaseVal_1.sameMembers)(node, met, ctx)) {
                return tmpl;
            }
        }
        return tried.join(' ');
    }
    replacements(ctx, node, tmpl, fail) {
        if (undefined === tmpl.replace) {
            return undefined;
        }
        let inst = tmpl.replace.clone(ctx, { dup: true });
        inst = (0, PlaceVal_1.fillPlace)(bindNode(inst, node, ctx, fail), node, ctx);
        if (!inst.done) {
            inst = (0, unify_1.unite)(ctx, inst, (0, top_1.top)(), 'emit');
        }
        const pairs = [];
        for (const key of Object.keys(inst.peg)) {
            const v = unpref(inst.peg[key]);
            const text = (0, PlusOpVal_1.plusText)(v);
            if (undefined === text) {
                fail.code = 'replace_value';
                fail.details = { key: quoted(key), value: String(v?.canon) };
                return undefined;
            }
            pairs.push([key, 'none' === tmpl.esc ? text : (0, escape_1.escapeText)(text, tmpl.esc)]);
        }
        pairs.sort((a, b) => b[0].length - a[0].length || (0, keyorder_1.cmpCodePoint)(a[0], b[0]));
        return pairs;
    }
    instantiate(ctx, node, tmpl, out, fail, mark) {
        const pairs = this.replacements(ctx, node, tmpl, fail);
        if (undefined !== fail.code) {
            return;
        }
        const elems = tmpl.body.peg;
        for (let i = 0; i < elems.length; i++) {
            const elctx = ctx.descend(String(out.length));
            let inst = elems[i].clone(elctx, { dup: true });
            if (undefined !== pairs) {
                inst = substituted(inst, i, tmpl.lits, pairs, elctx);
            }
            let piece = (0, PlaceVal_1.fillPlace)(bindNode(inst, node, elctx, fail), node, elctx);
            if (!piece.done) {
                piece = (0, unify_1.unite)(elctx, piece, (0, top_1.top)(), 'emit');
            }
            const at = out.length;
            splice(piece, out);
            if (undefined !== mark) {
                for (let k = at; k < out.length; k++) {
                    if (null == out[k].emitted) {
                        ;
                        out[k].emitted = mark;
                    }
                }
            }
        }
    }
} /* node:coverage ignore next 6 */
exports.EmitFuncVal = EmitFuncVal;
//# sourceMappingURL=EmitFuncVal.js.map