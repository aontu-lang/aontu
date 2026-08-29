"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InverseFuncVal = exports.AcyclicFuncVal = exports.GraphAtomVal = void 0;
exports.relDecls = relDecls;
const type_1 = require("../type");
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
const FeatureVal_1 = require("./FeatureVal");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
function relDecls(ctx) {
    return ctx._reldecls;
}
class GraphAtomVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isGraphAtom = true;
        this.isGenable = true;
        // AFTER rel() (45000): the atoms say nothing about the value.
        this.cjo = 46000;
        this.akind = spec.akind ?? 'acyclic';
        this.invname = spec.invname;
        this.held = spec.held;
        // A settled residual, like an unmet rel(): the bare atom is its
        // own value, and a type() body carrying one must settle. Holding
        // an unsettled value, it is exactly as done as the value.
        this.dc = undefined === this.held || true === this.held.done
            ? type_1.DONE : 0;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.akind = this.akind;
        out.invname = this.invname;
        out.held = this.held;
        out.dc = this.dc;
        return out;
    }
    // A rebuilt atom around a new held, at this atom's position.
    carry(ctx, held) {
        const out = new GraphAtomVal({ akind: this.akind, invname: this.invname, held }, ctx);
        (0, utility_1.propagateMarks)(this, out);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
    // The predicate is the key the atom sits on -- and a predicate is a
    // D-1 NAME, by exactly fieldkey's rule: an atom landed anywhere
    // else declares nothing. Registration is idempotent (the
    // declaration set is a set) and happens at every drive, so
    // whichever pass first sees the atom at its landed position records
    // it.
    register(ctx) {
        const seg = this.path[this.path.length - 1];
        if ('string' !== typeof seg || !GRAPH_ATOM_NAME.test(seg)) {
            return;
        }
        const decls = relDecls(ctx);
        let d = decls.get(seg);
        if (undefined === d) {
            d = { inverses: new Set() };
            decls.set(seg, d);
        }
        if ('acyclic' === this.akind) {
            d.acyclic = true;
        }
        else if (undefined !== this.invname) {
            d.inverses.add(this.invname);
        }
    }
    unify(peer, ctx) {
        const p = peer;
        this.register(ctx);
        // The self-drive: unite's tail calls unify(top) directly on any
        // not-done result, and the held is what still has work to do.
        // (A null/nil peer never arrives -- unite's ladder absorbs both.)
        if (null == peer || true === p.isTop) {
            if (undefined === this.held) {
                return this;
            }
            if (true === this.held.done) {
                // Doneness is monotone, so recording it in place is safe --
                // and without it the bag walk keeps asking and generation
                // refuses a finished value.
                this.dc = type_1.DONE;
                return this;
            }
            // The self-drive refines IN PLACE (the MapVal top-peer
            // pattern): a fresh atom per pass changes object identity, so
            // spread apply-once stamps and the entity merge's fast paths
            // stop holding, and the enclosing bags re-open every pass --
            // the service catalog never converged.
            const held = (0, unify_1.unite)(ctx, this.held, undefined, 'atom-drive');
            if (true === held.isNil) {
                return held;
            }
            this.held = held;
            if (true === held.done) {
                this.dc = type_1.DONE;
            }
            return this;
        }
        // The SAME declaration twice is one declaration; their helds
        // merge.
        if (true === p.isGraphAtom &&
            p.akind === this.akind && p.invname === this.invname) {
            const held = undefined === this.held ? p.held
                : undefined === p.held ? this.held
                    : (0, unify_1.unite)(ctx, this.held, p.held, 'atom-dup');
            if (undefined !== held && true === held.isNil) {
                return held;
            }
            return undefined === held ? this : this.carry(ctx, held);
        }
        // Anything else -- the rel, the container, a different atom -- is
        // ABSORBED: the atom carries the value and the fold's pairwise
        // walk merges across it.
        const held = undefined === this.held ? peer
            : (0, unify_1.unite)(ctx, this.held, peer, 'atom-held');
        return true === held.isNil ? held : this.carry(ctx, held);
    }
    get canon() {
        const own = 'acyclic' === this.akind
            ? 'acyclic()'
            : 'inverse(' + JSON.stringify(this.invname) + ')';
        return undefined === this.held ? own : this.held.canon + '&' + own;
    }
    gen(ctx) {
        // The atom is transparent at generation -- its verdict is global
        // (relationVerdict), never a value at this field -- and a BARE
        // atom is silent, exactly as an unmet rel() is.
        return undefined === this.held ? undefined : this.held.gen(ctx);
    }
}
exports.GraphAtomVal = GraphAtomVal;
// D-1 (docs/design/RELATIONS.0.md): the name grammar shared by entity
// names, edge predicates and inverse names.
const GRAPH_ATOM_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/;
class AcyclicFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isAcyclicFunc = true;
    }
    make(_ctx, spec) {
        return new AcyclicFuncVal(spec);
    }
    funcname() {
        return 'acyclic';
    }
    resolve(ctx, _args) {
        const out = new GraphAtomVal({ akind: 'acyclic' }, ctx);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
}
exports.AcyclicFuncVal = AcyclicFuncVal;
class InverseFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isInverseFunc = true;
    }
    make(_ctx, spec) {
        return new InverseFuncVal(spec);
    }
    funcname() {
        return 'inverse';
    }
    resolve(ctx, args) {
        const a = args[0];
        // The mirroring predicate is a NAME -- D-1, spelled bare or
        // quoted, exactly an id()'s argument shape.
        if (true !== a?.isScalar || 'string' !== typeof a.peg
            || !GRAPH_ATOM_NAME.test(a.peg)) {
            return (0, err_1.makeNilErr)(ctx, 'inverse_name', this, undefined, 'inverse');
        }
        const out = new GraphAtomVal({ akind: 'inverse', invname: a.peg }, ctx);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
} /* node:coverage ignore next 7 */
exports.InverseFuncVal = InverseFuncVal;
//# sourceMappingURL=GraphAtomVal.js.map