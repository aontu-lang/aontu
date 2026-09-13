"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LowerDeclsFuncVal = exports.LowerLossFunc = exports.LowerDeclsFunc = exports.DECL_KINDS = void 0;
const err_1 = require("../err");
const lower_1 = require("../lower");
const MapVal_1 = require("./MapVal");
const ListVal_1 = require("./ListVal");
const StringVal_1 = require("./StringVal");
const IntegerVal_1 = require("./IntegerVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
// The kinds a profile's lowering spells. The fragment algebra's own
// kinds are not here: a component tree states a line directly.
const DECL_KINDS = ['record', 'enum', 'alias', 'const', 'func'];
exports.DECL_KINDS = DECL_KINDS;
function pad(profile, at) {
    const indent = profile.indent ?? { unit: ' ', width: 2 };
    return (indent.unit ?? ' ').repeat((indent.width ?? 2) * at);
}
// One lowered piece as a Line node. A string is a line at depth 0, a
// `blank` is its terminator alone, and an empty span takes no pad --
// the fold's rule, kept so the bytes are the unit road's.
function lineNode(piece, profile, ctx) {
    let text = '';
    let at = 0;
    if ('string' === typeof piece) {
        text = piece;
    }
    else if ('line' === piece.k) {
        text = piece.n[0];
        at = piece.at ?? 0;
    }
    const peg = {
        src: new StringVal_1.StringVal({ peg: text }, ctx),
    };
    if ('' !== text && 0 < at) {
        peg.indent = new StringVal_1.StringVal({ peg: pad(profile, at) }, ctx);
    }
    const props = new MapVal_1.MapVal({ peg }, ctx);
    props.closed = true;
    const node = new MapVal_1.MapVal({
        peg: {
            cmp: new StringVal_1.StringVal({ peg: 'Line' }, ctx),
            props,
            children: new ListVal_1.ListVal({ peg: [] }, ctx),
        },
    }, ctx);
    node.closed = true;
    return node;
}
function lossNode(loss, ctx) {
    const node = new MapVal_1.MapVal({
        peg: {
            tier: new IntegerVal_1.IntegerVal({ peg: loss.tier }, ctx),
            construct: new StringVal_1.StringVal({ peg: loss.construct }, ctx),
            path: new StringVal_1.StringVal({ peg: loss.path }, ctx),
            reason: new StringVal_1.StringVal({ peg: loss.reason }, ctx),
        },
    }, ctx);
    node.closed = true;
    return node;
}
class LowerDeclsFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(loss, spec, ctx) {
        super(spec, ctx);
        this.isLowerDeclsFunc = true;
        // Both arguments are data and must settle before a declaration can
        // be spelled: a half-unified type lowers to the wrong text.
        this.staged = true;
        this.loss = loss;
    }
    funcname() {
        return this.loss ? 'lowerloss' : 'lowerdecls';
    }
    unify(peer, ctx) {
        if (!this.stagedReady(peer, ctx, 2)) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        // Arity is checked at parse (funcArity); both arguments are here.
        const declsVal = args[0];
        const profileVal = args[1];
        if (true !== declsVal?.isList) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, declsVal, 'decls');
        }
        if (true !== profileVal?.isMap) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, profileVal, 'profile');
        }
        const profile = profileVal.gen(ctx);
        const family = profile?.lowering;
        if ('typescript' !== family && 'go' !== family) {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, profileVal, 'profile');
        }
        const decls = declsVal.gen(ctx);
        for (const decl of decls) {
            if (null == decl || !DECL_KINDS.includes(decl.k)) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, declsVal, 'decls');
            }
        }
        const lossy = [];
        const lctx = { profile, family, unit: profile.lang, lossy };
        const out = [];
        decls.forEach((decl, i) => {
            // One blank line between declarations, and none before the
            // first: the separation `aontu render` writes.
            if (0 < i && !this.loss) {
                out.push(lineNode('', profile, ctx));
            }
            for (const piece of (0, lower_1.lowerDecl)(decl, '$.' + i, lctx)) {
                if (!this.loss) {
                    out.push(lineNode(piece, profile, ctx));
                }
            }
        });
        if (this.loss) {
            return this.place(new ListVal_1.ListVal({ peg: lossy.map((l) => lossNode(l, ctx)) }, ctx));
        }
        return this.place(new ListVal_1.ListVal({ peg: out }, ctx));
    }
} /* node:coverage ignore next 3 */
exports.LowerDeclsFuncVal = LowerDeclsFuncVal;
function lowerDeclsFuncClass(loss) {
    class LowerDecls extends LowerDeclsFuncVal {
        constructor(spec, ctx) {
            super(loss, spec, ctx);
        }
        make(_ctx, spec) {
            return new LowerDecls(spec);
        }
    }
    return LowerDecls;
}
const LowerDeclsFunc = lowerDeclsFuncClass(false);
exports.LowerDeclsFunc = LowerDeclsFunc;
const LowerLossFunc = lowerDeclsFuncClass(true);
exports.LowerLossFunc = LowerLossFunc;
//# sourceMappingURL=LowerDeclsFuncVal.js.map