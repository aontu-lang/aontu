"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListFuncVal = exports.MapFuncVal = exports.ListKindVal = exports.MapKindVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const FeatureVal_1 = require("./FeatureVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
class MapKindVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isContainerKind = true;
        this.isMapKind = true;
        this.dc = type_1.DONE;
    }
    unify(peer, ctx) {
        const p = peer;
        if (true === p.isMap) {
            return peer;
        }
        if (true === p.isMapKind) {
            return this;
        }
        // The unit's own refusal code: a kind mismatch here is the same
        // fact `{} & 1` reports, and two codes for one fact would drift.
        return (0, err_1.makeNilErr)(ctx, 'map', this, peer);
    }
    get canon() {
        return 'map()';
    }
    same(peer) {
        return true === peer?.isMapKind;
    }
} /* node:coverage ignore next 4 */
exports.MapKindVal = MapKindVal;
class ListKindVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isContainerKind = true;
        this.isListKind = true;
        this.dc = type_1.DONE;
    }
    unify(peer, ctx) {
        const p = peer;
        if (true === p.isList) {
            return peer;
        }
        if (true === p.isListKind) {
            return this;
        }
        return (0, err_1.makeNilErr)(ctx, 'list', this, peer);
    }
    get canon() {
        return 'list()';
    }
    same(peer) {
        return true === peer?.isListKind;
    }
} /* node:coverage ignore next 4 */
exports.ListKindVal = ListKindVal;
class MapFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isMapFunc = true;
    }
    make(_ctx, spec) {
        return new MapFuncVal(spec);
    }
    funcname() {
        return 'map';
    }
    resolve(ctx, _args) {
        const out = new MapKindVal({}, ctx);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
} /* node:coverage ignore next 4 */
exports.MapFuncVal = MapFuncVal;
class ListFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isListFunc = true;
    }
    make(_ctx, spec) {
        return new ListFuncVal(spec);
    }
    funcname() {
        return 'list';
    }
    resolve(ctx, _args) {
        const out = new ListKindVal({}, ctx);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
} /* node:coverage ignore next 8 */
exports.ListFuncVal = ListFuncVal;
//# sourceMappingURL=ContainerKindVal.js.map