"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.varNamesIn = varNamesIn;
exports.bindingFailure = bindingFailure;
// Host bindings as the command line and the MCP server take them: the
// names a document reads, and whether a binding's source is a value.
const aontu_1 = require("./aontu");
const walk_1 = require("./walk");
// The names a document reads, into read; false where it doesn't parse.
function varNamesIn(src, opts, read) {
    let root;
    try {
        root = new aontu_1.Aontu(opts).parse(src);
    }
    catch (_err) {
        return false;
    }
    (0, walk_1.eachPart)(root, (v) => {
        if (true === v.isVar && 'string' === typeof v.peg?.peg) {
            read.add(v.peg.peg);
        }
    });
    return true;
}
// Why a binding's source is no value, or undefined where it is one.
function bindingFailure(src) {
    let v;
    try {
        v = new aontu_1.Aontu({ trust: { include: 'none' } }).unify(src);
    }
    catch (err) {
        return String(err.message).split('\n')[0];
    }
    return (0, walk_1.holdsReference)(v) ? 'a binding is a value, and reads no path or variable' : undefined;
} /* node:coverage ignore next 6 */
//# sourceMappingURL=hostvars.js.map