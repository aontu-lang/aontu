"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathKindVal = exports.PathVal = void 0;
exports.parseAddress = parseAddress;
exports.textAddress = textAddress;
exports.prefixMeet = prefixMeet;
const err_1 = require("../err");
const utility_1 = require("../utility");
const ScalarVal_1 = require("./ScalarVal");
const ScalarKindVal_1 = require("./ScalarKindVal");
const ADDR_SEGMENT = /^[A-Za-z0-9_-]+$/;
function parseAddress(s) {
    if ('$' === s) {
        // The whole document is not a relation's target: an address must
        // name something with a position to be written back into.
        return undefined;
    }
    if (s.startsWith('$.')) {
        const parts = s.slice(2).split('.');
        for (const seg of parts) {
            if (!ADDR_SEGMENT.test(seg)) {
                return undefined;
            }
        }
        return { absolute: true, up: 0, parts };
    }
    if (!s.startsWith('.')) {
        return undefined;
    }
    // A relative address: the leading dot anchors it at the sibling
    // scope, and every FURTHER leading dot is one step up from there --
    // the same reduction a relative reference's `.` segments perform.
    let up = 0;
    let rest = s.slice(1);
    while (rest.startsWith('.')) {
        up++;
        rest = rest.slice(1);
    }
    if ('' === rest) {
        return undefined;
    }
    const parts = rest.split('.');
    for (const seg of parts) {
        if (!ADDR_SEGMENT.test(seg)) {
            return undefined;
        }
    }
    return { absolute: false, up, parts };
}
function textAddress(s) {
    return ('$' === s[0] || '.' === s[0]) ? s : '.' + s;
}
function prefixMeet(a, b) {
    const pa = parseAddress(a);
    const pb = parseAddress(b);
    if (pa.absolute !== pb.absolute || pa.up !== pb.up) {
        return undefined;
    }
    const short = pa.parts.length <= pb.parts.length ? pa : pb;
    const long = short === pa ? pb : pa;
    for (let i = 0; i < short.parts.length; i++) {
        if (short.parts[i] !== long.parts[i]) {
            return undefined;
        }
    }
    return short === pa ? b : a;
}
class PathVal extends ScalarVal_1.ScalarVal {
    constructor(spec, ctx) {
        super({ peg: spec.peg, kind: ScalarKindVal_1.Path }, ctx);
        this.isPath = true;
    }
    unify(peer, ctx) {
        const p = peer;
        if (true === p.isPath) {
            const merged = prefixMeet(this.peg, p.peg);
            if (undefined === merged) {
                return (0, err_1.makeNilErr)(ctx, 'scalar_value', this, peer);
            }
            const out = merged === this.peg ? this : p;
            const other = out === this ? p : this;
            (0, utility_1.propagateMarks)(other, out);
            return out;
        }
        return super.unify(peer, ctx);
    }
    // Reparses to the same VALUE: the call form is the literal syntax
    // for this kind, so canon renders it back. The peg is already the
    // address grammar, which the argument grammar also accepts.
    get canon() {
        return 'path(' + this.peg + ')';
    }
    superior() {
        return this.place(new PathKindVal({}));
    }
} /* node:coverage ignore next 4 */
exports.PathVal = PathVal;
class PathKindVal extends ScalarKindVal_1.ScalarKindVal {
    constructor(spec, ctx) {
        super({ ...spec, peg: ScalarKindVal_1.Path }, ctx);
        this.isPathKind = true;
    }
    get canon() {
        return 'path';
    }
} /* node:coverage ignore next 6 */
exports.PathKindVal = PathKindVal;
//# sourceMappingURL=PathVal.js.map