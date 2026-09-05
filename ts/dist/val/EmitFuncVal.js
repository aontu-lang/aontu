"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmitFuncVal = void 0;
const unify_1 = require("../unify");
const err_1 = require("../err");
const top_1 = require("./top");
const ListVal_1 = require("./ListVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
const EachFuncVal_1 = require("./EachFuncVal");
// Read the table. A map is one template; a list is many. The shape is
// checked here rather than at the call, because a table is ordinary
// data and may be computed.
function tableTemplates(table) {
    const t = table;
    // A NAMED TABLE IS A PLACEHELD `emit`, and its table is the table.
    // A table written at a document position is DRIVEN there -- a body's
    // relative references resolve against wherever it sits and miss --
    // so the position that holds one unevaluated is the one position the
    // language already never drives: a call's template argument.
    // `%wire = emit(_, [ … ])` is that position with the selection left
    // open, and it reads as what it is, an apply-templates waiting for
    // its nodes: `emit(.listen, %wire)` passes them, `.listen & %wire`
    // fills the hole, and both are the same dispatch.
    if (true === t?.isEmitFunc) {
        return tableTemplates(t.peg[1]);
    }
    if (true === t?.isMap) {
        const one = oneTemplate(t);
        return 'string' === typeof one ? one : [one];
    }
    if (true === t?.isList) {
        const out = [];
        for (const el of t.peg) {
            const e = el;
            if (true !== e?.isMap) {
                return 'emit_template';
            }
            const one = oneTemplate(e);
            if ('string' === typeof one) {
                return one;
            }
            out.push(one);
        }
        return out;
    }
    return 'emit_table';
}
function oneTemplate(m) {
    const match = m.peg.match;
    const body = m.peg.body;
    // Both keys are required: a template with no pattern would match
    // everything by accident, and one with no body would emit nothing
    // while claiming a node.
    if (null == match || null == body) {
        return 'emit_template';
    }
    if (true !== body.isList) {
        return 'emit_body';
    }
    return { match, body };
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
        return found.clone(ctx);
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
            const b = true === c?.isVal ? bindNode(c, node, ctx, fail) : c;
            changed = changed || b !== c;
            out[k] = b;
        }
        return changed ? (0, PlaceVal_1.rebuild)(v, out, ctx) : v;
    }
    return v;
}
// The field of `node` a reference names, or undefined when it names
// none. Only a chain of plain NAMES is a field: a parent step has no
// answer at a node that is an origin rather than a position, and a
// variable segment is not a name until something resolves it -- both
// are refused here rather than left to resolve somewhere else, which
// is the failure mode the binding exists to remove.
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
        const nodes = (0, EachFuncVal_1.dataValues)(args?.[0]);
        if ('string' === typeof nodes) {
            // dataValues names the each_data code; emit answers for itself.
            return (0, err_1.makeNilErr)(ctx, 'emit_data', this);
        }
        // A NAMED TABLE IS REACHED BY REFERENCE, and the reference -- not
        // the table -- is what is followed. Followed HERE rather than in
        // the staged drive, which waits for a SETTLED target: a table is a
        // template, a template holding a hole never settles, and waiting
        // for one would mean the dispatch never fires.
        let table = args?.[1];
        if (true === table?.isRef) {
            table = table.unify((0, top_1.top)(), ctx);
        }
        const templates = tableTemplates(table);
        if ('string' === typeof templates) {
            return (0, err_1.makeNilErr)(ctx, templates, this);
        }
        const peg = [];
        for (const node of nodes) {
            const tmpl = this.dispatch(ctx, node, templates);
            if ('string' === typeof tmpl) {
                return (0, err_1.makeNilErr)(ctx, 'emit_none', this, undefined, 'resolve', {
                    value: node.canon,
                    tried: tmpl,
                });
            }
            const fail = {};
            this.instantiate(ctx, node, tmpl, peg, fail);
            if (undefined !== fail.ref) {
                return (0, err_1.makeNilErr)(ctx, 'emit_ref', this, undefined, 'resolve', {
                    ref: fail.ref,
                    value: node.canon,
                });
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
            if (undefined !== (0, FuncBaseVal_1.trialUnify)(ctx, node.clone(ctx), tmpl.match.clone(ctx))) {
                return tmpl;
            }
        }
        return tried.join(' ');
    }
    // Instantiate one body at the node and SPLICE its pieces into the
    // output. A full instance to the leaves (`dup`, ADR-005), because a
    // bare clone shares the inner structure of any call in the body and
    // the first node's resolution would answer for every node; then the
    // two bindings, relative references and the hole, both to the node.
    instantiate(ctx, node, tmpl, out, fail) {
        const elems = tmpl.body.peg;
        for (let i = 0; i < elems.length; i++) {
            const elctx = ctx.descend(String(out.length));
            const inst = elems[i].clone(elctx, { dup: true });
            let piece = (0, PlaceVal_1.fillPlace)(bindNode(inst, node, elctx, fail), node, elctx);
            // A NESTED DISPATCH IS DRIVEN HERE, not left for the next pass.
            // Its selection is bound and the model has settled, so it has
            // everything it needs -- and it must answer NOW, because what
            // makes the result flat is splicing its pieces into this one.
            // Left standing, a nested `emit` resolved a pass later, as a
            // list INSIDE the list, and the fragment algebra is flat.
            // Through `unite` rather than by hand: a rule set that walks
            // into itself for ever is charged to the depth budget and
            // refused as `unify_cycle`, like any other runaway descent.
            if (!piece.done) {
                piece = (0, unify_1.unite)(elctx, piece, (0, top_1.top)(), 'emit');
            }
            splice(piece, out);
        }
    }
} /* node:coverage ignore next 6 */
exports.EmitFuncVal = EmitFuncVal;
//# sourceMappingURL=EmitFuncVal.js.map