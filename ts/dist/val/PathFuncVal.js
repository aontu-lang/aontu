"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathFuncVal = void 0;
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
const PathVal_1 = require("./PathVal");
const ReferFuncVal_1 = require("./ReferFuncVal");
// The address a reference SPELLS, or undefined when its segments
// cannot spell one (a variable segment, a parent step after the first
// named segment). Leading `.` entries in a relative ref's peg are
// parent steps; the spelling is the same grammar refer reads, so one
// address parser stays the single gate.
function captureSpelling(rv) {
    const parts = [];
    let up = 0;
    let lead = true;
    for (const p of rv.peg) {
        if ('string' !== typeof p) {
            return undefined;
        }
        if ('.' === p) {
            if (!lead) {
                return undefined;
            }
            up++;
        }
        else {
            lead = false;
            parts.push(p);
        }
    }
    if (0 === parts.length || (rv.absolute && 0 < up)) {
        return undefined;
    }
    return rv.absolute ?
        '$.' + parts.join('.') :
        '.'.repeat(up + 1) + parts.join('.');
}
class PathFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPathFunc = true;
        this.prepared = 0;
    }
    make(_ctx, spec) {
        const pathfunc = new PathFuncVal(spec);
        pathfunc.prepared = this.prepared;
        return pathfunc;
    }
    funcname() {
        return 'path';
    }
    prepare(ctx, args) {
        if (0 === this.prepared) {
            this.prepared++;
            const arg = args[0];
            // The kind form: no argument to capture.
            if (null == arg) {
                return [];
            }
            // The captured spelling, from a reference's segments or from a
            // string read as address text. Both go through parseAddress, so
            // what capture admits and what refer reads cannot drift.
            let spelling;
            if (true === arg.isRef) {
                spelling = captureSpelling(arg);
            }
            else if (true === arg.isScalar && 'string' === typeof arg.peg) {
                spelling = arg.peg;
            }
            else {
                return [(0, err_1.makeNilErr)(ctx, 'invalid-arg', this)];
            }
            if (undefined === spelling || undefined === (0, ReferFuncVal_1.parseAddress)(spelling)) {
                return [(0, err_1.makeNilErr)(ctx, 'path_address', this, arg)];
            }
            return [new PathVal_1.PathVal({ peg: spelling }, ctx)];
        }
        return args;
    }
    resolve(ctx, args) {
        if (0 === args.length) {
            const out = new PathVal_1.PathKindVal({}, ctx);
            out.site = this.site;
            out.path = this.path;
            return out;
        }
        return args[0];
    }
} /* node:coverage ignore next 6 */
exports.PathFuncVal = PathFuncVal;
//# sourceMappingURL=PathFuncVal.js.map