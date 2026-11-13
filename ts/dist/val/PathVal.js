"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathKindVal = exports.PathVal = void 0;
exports.parseAddress = parseAddress;
exports.addressPath = addressPath;
exports.textAddress = textAddress;
exports.joinFlows = joinFlows;
exports.joinRelates = joinRelates;
exports.relateText = relateText;
exports.prefixMeet = prefixMeet;
exports.linkAt = linkAt;
const type_1 = require("../type");
const err_1 = require("../err");
const utility_1 = require("../utility");
const keyorder_1 = require("../keyorder");
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
function addressPath(addr, at) {
    if (addr.absolute) {
        return addr.parts;
    }
    // The SIBLING scope: drop the link's own key, then take the parent
    // steps. A link at `$.a.b.dep` spelling `.other` means `$.a.b.other`.
    const cut = at.length - 1 - addr.up;
    if (cut < 0) {
        return undefined;
    }
    return at.slice(0, cut).map(String).concat(addr.parts);
}
function concreteFlow(ctx, t) {
    let marked = false;
    (0, utility_1.walk)(t, (_key, v) => {
        marked = marked || v.mark.type || v.mark.hide;
        return v;
    });
    // An unmarked flow type is passed THROUGH: cloning one anyway would
    // move the site an error names, and a conflict has to point at what
    // the author wrote.
    if (!marked) {
        return t;
    }
    const out = t.clone(ctx);
    (0, utility_1.walk)(out, (_key, v) => {
        v.mark.type = false;
        v.mark.hide = false;
        return v;
    });
    return out;
}
function textAddress(s) {
    return ('$' === s[0] || '.' === s[0]) ? s : '.' + s;
}
// The templates of the links met at one position, each once.
function joinFlows(a, b) {
    if (undefined === b || a === b) {
        return a;
    }
    if (undefined === a) {
        return b;
    }
    const more = b.filter((f) => !a.includes(f));
    return 0 === more.length ? a : a.concat(more);
}
// The templates of the `relate()` calls written at one value, each once.
function joinRelates(a, b) {
    if (undefined === b || a === b) {
        return a;
    }
    if (undefined === a) {
        return b;
    }
    const have = a.map((t) => t.canon);
    const more = b.filter((t) => !have.includes(t.canon));
    return 0 === more.length ? a : a.concat(more);
}
// The `relate()` written at a value, as canon writes it before the value.
function relateText(v) {
    if (true !== v.relroot) {
        return '';
    }
    const relates = v.relates;
    if (0 === relates.length) {
        return 'relate()&';
    }
    return relates.map((t) => 'relate(' + t.canon + ')&').sort(keyorder_1.cmpCodePoint).join('');
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
// The link a path written at `at` is, carrying each template to the node
// it names; undefined where a relative path climbs off the top of the tree.
function linkAt(ctx, addrsrc, at, flows, relates, relroot) {
    const target = addressPath(parseAddress(addrsrc), at);
    if (undefined === target) {
        return undefined;
    }
    const out = new PathVal({ peg: addrsrc }, ctx);
    const key = target.join('\x00');
    out.dc = type_1.DONE;
    out.link = '$.' + target.join('.');
    out.linkto = target;
    out.flows = joinFlows(flows, 0 === relates.length ? undefined
        : relates.map((t) => [key, concreteFlow(ctx, t)]));
    out.relates = relates;
    out.relroot = relroot;
    out.path = at;
    return out;
}
class PathVal extends ScalarVal_1.ScalarVal {
    constructor(spec, ctx) {
        super({ peg: spec.peg, kind: ScalarKindVal_1.Path }, ctx);
        this.isPath = true;
    }
    unify(peer, ctx) {
        const p = peer;
        // A relate() peer drives, as it does beside a map or a list.
        if (true === p.isRelate) {
            return peer.unify(this, ctx);
        }
        if (true === p.isPath) {
            const merged = prefixMeet(this.peg, p.peg);
            if (undefined === merged) {
                return (0, err_1.makeNilErr)(ctx, 'scalar_value', this, peer);
            }
            // Of one address met twice, the side a link made keeps the edge.
            let out = merged !== this.peg || (merged === p.peg
                && undefined === this.link && undefined !== p.link) ? p : this;
            const other = out === this ? p : this;
            // A link refined by a longer path is a link to what that path names,
            // which climbs no further than the link did.
            if (undefined === out.link && undefined !== other.link) {
                const moved = linkAt(ctx, merged, other.path, undefined, other.relates, true === other.relroot);
                (0, utility_1.propagateMarks)(other, moved);
                (0, utility_1.propagateMarks)(out, moved);
                moved.site = out.site;
                return moved;
            }
            const flows = joinFlows(out.flows, other.flows);
            const relates = joinRelates(out.relates, other.relates);
            const relroot = true === out.relroot || true === other.relroot;
            if (flows !== out.flows || relates !== out.relates || relroot !== (true === out.relroot)) {
                out = out.clone(ctx);
                out.flows = flows;
                out.relates = relates;
                out.relroot = relroot;
            }
            (0, utility_1.propagateMarks)(other, out);
            return out;
        }
        return super.unify(peer, ctx);
    }
    // Reparses to the same VALUE: the call form is the literal syntax
    // for this kind, so canon renders it back. The peg is already the
    // address grammar, which the argument grammar also accepts.
    get canon() {
        return relateText(this) + 'path(' + this.peg + ')';
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