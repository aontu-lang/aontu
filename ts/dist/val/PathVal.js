"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathKindVal = exports.PathVal = void 0;
const err_1 = require("../err");
const utility_1 = require("../utility");
const ScalarVal_1 = require("./ScalarVal");
const ScalarKindVal_1 = require("./ScalarKindVal");
const ReferFuncVal_1 = require("./ReferFuncVal");
class PathVal extends ScalarVal_1.ScalarVal {
    constructor(spec, ctx) {
        super({ peg: spec.peg, kind: ScalarKindVal_1.Path }, ctx);
        this.isPath = true;
    }
    // Reparses to the same VALUE: the call form is the literal syntax
    // for this kind, so canon renders it back. The peg is already the
    // address grammar, which the argument grammar also accepts.
    get canon() {
        return 'path(' + this.peg + ')';
    }
    // The super() ladder lifts a path value to its own kind, and the
    // kind must render as `path()` -- the bare word `path` is an
    // ordinary string. ScalarVal.superior would mint the plain
    // ScalarKindVal, whose canon is the bare word.
    superior() {
        return this.place(new PathKindVal({}));
    }
} /* node:coverage ignore next 4 */
exports.PathVal = PathVal;
// The path KIND, `path()`: admits every path value and defaults to
// nothing, as `string` does. One arm of its own on top of
// ScalarKindVal: PROMOTION. A string value that spells an address is
// admitted AS the path value -- this is the bridge that keeps the
// schema/data split intact: the schema writes the kind, plain
// JSON-shaped data writes the string, and the meet promotes. The
// spelling is kept as written, exactly as refer keeps its addrsrc.
class PathKindVal extends ScalarKindVal_1.ScalarKindVal {
    constructor(spec, ctx) {
        super({ ...spec, peg: ScalarKindVal_1.Path }, ctx);
        this.isPathKind = true;
    }
    unify(peer, ctx) {
        const p = peer;
        if (true === p.isScalar && String === p.kind) {
            const addr = (0, ReferFuncVal_1.parseAddress)(p.peg);
            if (undefined === addr) {
                return (0, err_1.makeNilErr)(ctx, 'path_address', this, peer);
            }
            const out = new PathVal({ peg: p.peg }, ctx);
            (0, utility_1.propagateMarks)(this, out);
            (0, utility_1.propagateMarks)(p, out);
            out.site = p.site;
            out.path = p.path;
            return out;
        }
        return super.unify(peer, ctx);
    }
    get canon() {
        return 'path()';
    }
} /* node:coverage ignore next 6 */
exports.PathKindVal = PathKindVal;
//# sourceMappingURL=PathVal.js.map