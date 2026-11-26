"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurseVal = void 0;
exports.throughWrap = throughWrap;
exports.throughRider = throughRider;
exports.declaration = declaration;
exports.bumpRecurse = bumpRecurse;
exports.containsRecurseOf = containsRecurseOf;
exports.walkTarget = walkTarget;
const type_1 = require("../type");
const err_1 = require("../err");
const aliasname_1 = require("../aliasname");
const FeatureVal_1 = require("./FeatureVal");
const IdentFuncVal_1 = require("./IdentFuncVal");
const ConjunctVal_1 = require("./ConjunctVal");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const Val_1 = require("./Val");
class RecurseVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRecurse = true;
        this.isGenable = true;
        // LAST in a conjunct fold, after even the graph atoms: the residual
        // wants to see the assembled concrete structure it expands against.
        this.cjo = 47000;
        this.target = spec.target ?? [];
        this.xc = spec.xc ?? 0;
        // A settled residual: a type() body carrying one must settle, and
        // an unmet recursion is its own value until data arrives.
        this.dc = type_1.DONE;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.target = this.target;
        out.xc = this.xc;
        return out;
    }
    body(ctx) {
        let node = walkTarget(ctx.root, this.target)
            ?? walkTarget(ctx._fixroot, this.target);
        // A hide() or type() still to settle marks the definition, not what a use of it unfolds.
        while ((true === node?.isHideFunc || true === node?.isTypeFunc) && !node.done && null != node.peg?.[0]) {
            node = node.peg[0];
        }
        return node;
    }
    unify(peer, ctx) {
        const p = peer;
        if (null == peer || true === p.isTop) {
            return this;
        }
        // The same fixpoint twice is one fixpoint.
        if (true === p.isRecurse && this.target.length === p.target.length
            && this.target.every((s, i) => s === p.target[i])) {
            return this;
        }
        // A disjunction distributes over the residual, branch by branch.
        if (true === p.isDisjunct) {
            return peer.unify(this, ctx);
        }
        const concrete = true === p.isMap || true === p.isList || true === p.isScalar ||
            true === p.isScalarKind || true === p.isMapKind || true === p.isListKind;
        // Its own expansion's copy is not data: decision 7 of sketch/DEFINITION.0.md section 7.
        const key = this.target.join('\u0000');
        if (concrete && key === p.copied) {
            return this;
        }
        // CONCRETE STRUCTURE, or a kind, which picks the body's branch as
        // structure does: expand one level against it.
        if (concrete) {
            if (ctx.budget.depth <= this.xc) {
                return (0, err_1.makeNilErr)(ctx, 'recursion_budget', this, peer, 'recurse', { target: this.targetSpelling });
            }
            const body = this.body(ctx);
            if (undefined === body) {
                // The definition has not assembled yet (an early pass): wait.
                const out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
                (0, utility_1.propagateMarks)(this, out);
                out.path = this.path;
                out.waits = true;
                return out;
            }
            const level = (0, IdentFuncVal_1.undeclared)(body.clone(ctx, {
                dup: true, path: [...ctx.path],
            }));
            (0, Val_1.repathInstance)(level, level.path);
            (0, utility_1.walk)(level, (_key, v) => {
                v.mark.type = false;
                v.mark.hide = false;
                v.copied = key;
                return v;
            });
            bumpRecurse(level, this.xc + 1);
            return (0, unify_1.unite)(ctx, level, peer, 'recurse-expand');
        }
        // Anything else waits beside the residual, and beside a settled
        // peer the meet is settled until data arrives.
        const out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
        (0, utility_1.propagateMarks)(this, out);
        out.path = this.path;
        if (true === peer.done) {
            out.dc = type_1.DONE;
        }
        return out;
    }
    // A residual spells as the reference that made it, an alias by name.
    get targetSpelling() {
        const path = this.target.map(aliasname_1.aliasPathSegment);
        return 1 === path.length && aliasname_1.ALIAS_NAME_RE.test(path[0]) ? path[0] :
            '$.' + path.join('.');
    }
    get canon() {
        return this.targetSpelling;
    }
    gen(ctx) {
        (0, err_1.makeNilErr)(ctx, 'recursion_unexpanded', this, undefined, 'recurse', { target: this.targetSpelling });
        return undefined;
    }
}
exports.RecurseVal = RecurseVal;
// walkTarget answers the node at a target, read as a path reads one while the tree still unifies.
function walkTarget(root, target) {
    let node = root;
    for (const seg of target) {
        node = unmarked(node);
        node = true === node?.isConjunct ? declaration(node, seg) :
            true === node?.isMap || true === node?.isList ? node.peg[seg] : undefined;
    }
    return null != node && true === node.isVal ? node : undefined;
}
// A seal's value is its argument, as a rider's is: a path reads a member through one that waits.
function throughWrap(v) {
    v = throughRider(v);
    while (true === v?.isFunc && (true === v.isCloseFunc || true === v.isOpenFunc) && !v.done &&
        null != v.peg?.[0]) {
        v = throughRider(v.peg[0]);
    }
    return v;
}
function unmarked(v) {
    v = throughWrap(v);
    return true === v?.isFunc && (true === v.isHideFunc || true === v.isTypeFunc) && !v.done &&
        null != v.peg?.[0] ? throughWrap(v.peg[0]) : v;
}
// A value-transparent rider still being resolved stands for its value:
// the walk reads through it as it reads through a pending mark.
function throughRider(v) {
    while (true === v?.isFunc
        && (true === v.isMetaFunc || true === v.isDeprecateFunc || true === v.isIdentFunc)
        && !v.done && null != v.peg?.[0]) {
        v = v.peg[0];
    }
    return v;
}
// The declaration an alias names, held by the map term of a meet that
// is still folding. A declaration is not a field, so no other term
// contributes to it and the map term's slot is the whole of it.
function declaration(cj, key) {
    for (const t of cj.peg) {
        const term = throughRider(t);
        const decl = true === term?.isConjunct ? declaration(term, key) :
            true === term?.isMap && term.aliasKeys.includes(key) ? term.peg[key] : undefined;
        if (undefined !== decl) {
            return decl;
        }
    }
    return undefined;
}
function namedPlace(ref) {
    return undefined !== ref.aliasKey ? [ref.aliasKey] :
        ref.absolute && 0 < ref.peg.length && ref.peg.every((p) => 'string' === typeof p) ?
            ref.peg : undefined;
}
// bumpRecurse stamps the expansion depth onto every residual inside a
// freshly cloned level, so descent is charged along the chain.
function bumpRecurse(v, xc) {
    if (null == v || true !== v.isVal) {
        return;
    }
    if (true === v.isRecurse) {
        v.xc = Math.max(v.xc, xc);
        return;
    }
    if (true === v.isRef) {
        v.rxc = Math.max(v.rxc ?? 0, xc);
        return;
    }
    const peg = v.peg;
    if (true === v.isMap && null != peg) {
        for (const k of Object.keys(peg)) {
            bumpRecurse(peg[k], xc);
        }
    }
    else if (true === v.isList && Array.isArray(peg)) {
        for (const e of peg) {
            bumpRecurse(e, xc);
        }
    }
    else if (true === v.isConjunct && Array.isArray(peg)) {
        for (const e of peg) {
            bumpRecurse(e, xc);
        }
    }
    if (null != v.spread?.cj) {
        bumpRecurse(v.spread.cj, xc);
    }
}
// Each name or path v holds is followed to what it names too, given the root.
function containsRecurseOf(v, target, d, root, seen = new Set(), links = false) {
    v = unmarked(v);
    if (null == v || true !== v.isVal || 8 < d) {
        return false;
    }
    if (true === v.isRecurse || (true === v.isRef && Array.isArray(v.peg))) {
        const spelt = true === v.isRecurse ? v.target : v.peg;
        if (spelt.length === target.length && spelt.every((s, i) => s === target[i])) {
            return true;
        }
        // A residual or a path reaches what the place it names reaches, as a name does.
        const at = true === v.isRecurse ? v.target : namedPlace(v);
        const key = at?.join('\u0000');
        if (undefined === root || undefined === at || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return containsRecurseOf(walkTarget(root, at), target, d + 1, root, seen, links);
    }
    const peg = v.peg;
    if (true === v.isMap && null != peg) {
        for (const k of Object.keys(peg)) {
            if (containsRecurseOf(peg[k], target, d + 1, root, seen, links)) {
                return true;
            }
        }
    }
    else if ((true === v.isList || true === v.isConjunct || true === v.isDisjunct)
        && Array.isArray(peg)) {
        for (const e of peg) {
            if (containsRecurseOf(e, target, d + 1, root, seen, links)) {
                return true;
            }
        }
    }
    if (null != v.spread?.cj && containsRecurseOf(v.spread.cj, target, d + 1, root, seen, links)) {
        return true;
    }
    const named = links || (1 === target.length && aliasname_1.ALIAS_NAME_RE.test((0, aliasname_1.aliasBareName)(target[0])));
    const linkTemplates = !named ? [] :
        true === v.isRelateFunc ? v.peg : [v.tval, ...(v.relates ?? [])];
    return linkTemplates.some((t) => containsRecurseOf(t, target, d + 1, root, seen, links));
} /* node:coverage ignore next 8 */
//# sourceMappingURL=RecurseVal.js.map