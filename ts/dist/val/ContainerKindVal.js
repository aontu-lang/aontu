"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListKindVal = exports.MapKindVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const FeatureVal_1 = require("./FeatureVal");
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
        return (0, err_1.makeNilErr)(ctx, 'map', this, peer);
    }
    get canon() {
        return 'map';
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
        return 'list';
    }
    same(peer) {
        return true === peer?.isListKind;
    }
} /* node:coverage ignore next 6 */
exports.ListKindVal = ListKindVal;
//# sourceMappingURL=ContainerKindVal.js.map