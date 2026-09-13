"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParseFuncVal = exports.AbnfFuncVal = void 0;
const type_1 = require("../type");
const FuncBaseVal_1 = require("./FuncBaseVal");
const StringVal_1 = require("./StringVal");
const MapVal_1 = require("./MapVal");
const ListVal_1 = require("./ListVal");
const ConjunctVal_1 = require("./ConjunctVal");
const err_1 = require("../err");
const grammar_1 = require("../grammar");
class AbnfFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isAbnfFunc = true;
    }
    funcname() {
        return 'abnf';
    }
    resolve(ctx, args) {
        const a = args[0];
        // Not an arity check: the arity and signature gates run first, so
        // what reaches here is a nil argument, which both pass over.
        if ('string' !== typeof a?.peg) {
            return this.place((0, err_1.makeNilErr)(ctx, 'abnf_grammar', this, undefined, 'abnf'));
        }
        const [, why] = (0, grammar_1.compileGrammar)(a.peg);
        if (undefined !== why) {
            return this.place((0, err_1.makeNilErr)(ctx, 'abnf_grammar', this, undefined, 'abnf', { reason: why }));
        }
        return this.place(new StringVal_1.StringVal({ peg: a.peg }, ctx));
    }
}
exports.AbnfFuncVal = AbnfFuncVal;
// A tree node is just the map {rule, src, kids}, so it needs no case of
// its own. Keys are sorted so both ports build the same member order.
function astVal(node, ctx) {
    if ('string' === typeof node) {
        return new StringVal_1.StringVal({ peg: node }, ctx);
    }
    if (Array.isArray(node)) {
        return new ListVal_1.ListVal({
            peg: node.map((e, i) => astVal(e, ctx.descend(String(i)))),
        }, ctx);
    }
    const peg = {};
    for (const k of Object.keys(node).sort()) {
        peg[k] = astVal(node[k], ctx.descend(k));
    }
    return new MapVal_1.MapVal({ peg }, ctx);
}
class ParseFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isParseFunc = true;
    }
    funcname() {
        return 'parse';
    }
    // Meets its peer instead of resolving, so it must see the peer
    // before the base drives to resolve().
    unify(peer, ctx) {
        if (1 !== this.peg.length) {
            return super.unify(peer, ctx);
        }
        this.driveStagedArgs(ctx, 1);
        const g = this.peg[0];
        if ('string' !== typeof g?.peg) {
            return this.residuate(peer, ctx);
        }
        // A settled constraint is stable, as a residual constraint atom is.
        // Without this a `type()` holding one never resolves.
        this.dc = type_1.DONE;
        const p = peer;
        if (true !== p?.isString || 'string' !== typeof p?.peg) {
            return this.hold(peer, ctx);
        }
        const [grammar, why] = (0, grammar_1.compileGrammar)(g.peg);
        if (undefined !== why) {
            return (0, err_1.makeNilErr)(ctx, 'abnf_grammar', this, peer, 'parse', { reason: why });
        }
        if ('' === p.peg) {
            return (0, err_1.makeNilErr)(ctx, 'parse_failed', this, peer, 'parse', { reason: 'the empty string parses under no grammar' });
        }
        const [, err] = (0, grammar_1.parseWith)(grammar, p.peg, ctx);
        if (undefined !== err) {
            return (0, err_1.makeNilErr)(ctx, 'parse_failed', this, peer, 'parse', { reason: err });
        }
        return peer;
    }
    // The stable twin of residuate: no `notdone()`, because a settled
    // constraint stays done while it waits for a value.
    hold(peer, ctx) {
        if (peer.isTop || peer.id === this.id) {
            // Cloned, or a driver meeting it twice reports `unify_cycle`.
            const out = this.clone(ctx);
            out.dc = type_1.DONE;
            return out;
        }
        if (peer.isFunc
            && peer.funcname() === this.funcname()
            && peer.path.join('.') === this.path.join('.')
            && peer.canon === this.canon) {
            return this;
        }
        return new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
    }
    resolve(ctx, args) {
        const g = args[0];
        const v = args[1];
        // Not an arity check: see the abnf twin above.
        if ('string' !== typeof g?.peg || 'string' !== typeof v?.peg) {
            return this.place((0, err_1.makeNilErr)(ctx, 'parse_arg', this, undefined, 'parse'));
        }
        const [grammar, why] = (0, grammar_1.compileGrammar)(g.peg);
        if (undefined !== why) {
            return this.place((0, err_1.makeNilErr)(ctx, 'abnf_grammar', this, undefined, 'parse', { reason: why }));
        }
        // The host answers an empty tree for empty input.
        if ('' === v.peg) {
            return this.place((0, err_1.makeNilErr)(ctx, 'parse_failed', this, undefined, 'parse', { reason: 'the empty string parses under no grammar' }));
        }
        const [node, err] = (0, grammar_1.parseWith)(grammar, v.peg, ctx);
        if (undefined !== err) {
            return this.place((0, err_1.makeNilErr)(ctx, 'parse_failed', this, undefined, 'parse', { reason: err }));
        }
        return this.place(astVal(node, ctx));
    }
} /* node:coverage ignore next 6 */
exports.ParseFuncVal = ParseFuncVal;
//# sourceMappingURL=AbnfFuncVal.js.map