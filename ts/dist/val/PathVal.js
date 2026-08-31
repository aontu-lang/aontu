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
// A segment of a tree path: a map key or a list index. The same
// grammar the rest of the engine spells keys with, and a leading digit
// is legitimate because a list index is one.
const ADDR_SEGMENT = /^[A-Za-z0-9_-]+$/;
// The address a string spells, or undefined when it does not spell
// one. An address is a TREE PATH, in exactly the two spellings a
// reference uses: `$.services.auth` from the root, `.auth` from the
// link's own sibling scope. The tree is the only namespace -- which is
// what makes a model instantiable more than once, each instance
// resolving its relative links inside itself (ADR-014).
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
// The spelling string TEXT converts by, inside a `path(...)` call:
// text that carries no anchor is RELATIVE (`"a.b"` is the address
// `.a.b`), matching the raw form (`path(a.b)` captures `.a.b`). Only
// the anchor is supplied -- the result still has to parse, so
// malformed text (`""`, `"a..b"`, a bad `$` spelling) refuses as
// before. The prefix is not applied to text that claims an anchor:
// `"$x"` is a broken absolute address, not a relative one.
function textAddress(s) {
    return ('$' === s[0] || '.' === s[0]) ? s : '.' + s;
}
// The LONGER of two addresses when one spells a prefix of the other
// (docs/design/PATHS.0.md, amended): same anchor -- absolute or the
// same number of parent steps -- and the shorter's segments open the
// longer's. The meet of two path values, and of a refer's address
// with a later path peer: a path can always be told more precisely,
// and the more precise spelling is the result. Undefined when the two
// are not comparable, which refuses as any two unequal scalars do.
// Both arguments must already be valid addresses: every caller hands
// over a PathVal peg or a refer addrsrc, and both are validated at
// capture or conversion -- the same trust `unify`'s own address arm
// extends (`parseAddress(p.peg) as Address`).
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
    // Two path values meet by the PREFIX rule (ADR-016): the longer
    // when one opens the other, refusal otherwise. Exactly equal pegs
    // are absorbed by unite's fast path before this runs, so the arm
    // sees the unequal pairs; the winner carries both sides' marks, as
    // the equal-scalar arm has always ratcheted them.
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
// nothing, as `string` does. It does NOT promote (ADR-016): a bare
// string meeting the kind refuses through the generic kind ladder,
// exactly as `integer & "x"` does -- `path("...")` is the one string
// conversion, and it happens at the call.
class PathKindVal extends ScalarKindVal_1.ScalarKindVal {
    constructor(spec, ctx) {
        super({ ...spec, peg: ScalarKindVal_1.Path }, ctx);
        this.isPathKind = true;
    }
    get canon() {
        return 'path()';
    }
} /* node:coverage ignore next 6 */
exports.PathKindVal = PathKindVal;
//# sourceMappingURL=PathVal.js.map