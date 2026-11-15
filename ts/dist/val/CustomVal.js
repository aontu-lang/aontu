"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomVal = void 0;
const ScalarVal_1 = require("./ScalarVal");
class Custom {
}
// An expression kept as it is written, for a `gen` record: nothing
// evaluates it until the value it rides is written.
class CustomVal extends ScalarVal_1.ScalarVal {
    constructor(spec, ctx) {
        super({ peg: spec.peg, kind: Custom }, ctx);
        this.isCustom = true;
    }
    get canon() {
        return this.peg;
    }
} /* node:coverage ignore next 5 */
exports.CustomVal = CustomVal;
//# sourceMappingURL=CustomVal.js.map