"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InverseFuncVal = exports.AcyclicFuncVal = exports.GraphAtomVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const rider_1 = require("../rider");
const FuncBaseVal_1 = require("./FuncBaseVal");
const FeatureVal_1 = require("./FeatureVal");
// A graph atom met with nothing. Met with a value it hands the value back,
// and the meet's riders carry the declaration on, as they carry meta().
class GraphAtomVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isGraphAtom = true;
        this.isGenable = true;
        // AFTER relate() (45000): the atoms say nothing about the value.
        this.cjo = 46000;
        this.reldecl = spec.reldecl;
        this.dc = type_1.DONE;
    }
    unify(peer, ctx) {
        // Atoms meet on a fresh value, since each may be written elsewhere.
        if (true === peer.isGraphAtom) {
            return this.clone(ctx);
        }
        return true === peer.isTop ? this : peer;
    }
    get canon() {
        return (0, rider_1.graphAtomsText)(this.reldecl);
    }
    gen(_ctx) {
        // Silent, as an unmet relate() is: the verdict is the relation's.
        return undefined;
    }
}
exports.GraphAtomVal = GraphAtomVal;
// D-1 (sketch/RELATIONS.0.md): the name grammar shared by entity
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
        const out = new GraphAtomVal({ reldecl: { acyclic: true, inverses: [] } }, ctx);
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
        // quoted. A relation is a vocabulary term, not an address.
        if (true !== a?.isScalar || 'string' !== typeof a.peg
            || !GRAPH_ATOM_NAME.test(a.peg)) {
            return (0, err_1.makeNilErr)(ctx, 'inverse_name', this, undefined, 'inverse');
        }
        const out = new GraphAtomVal({ reldecl: { acyclic: false, inverses: [a.peg] } }, ctx);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
} /* node:coverage ignore next 7 */
exports.InverseFuncVal = InverseFuncVal;
//# sourceMappingURL=GraphAtomVal.js.map