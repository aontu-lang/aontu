"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ENGINES = void 0;
exports.sharedEngine = sharedEngine;
const aontu_1 = require("./aontu");
// Building an engine costs about 11 ms, nearly all of it the parser's
// grammar, where a verb's own work on a small document costs a fraction
// of one. A verb that builds an engine for its own use and never hands
// it out takes one from here: one per set of options, which for such a
// verb are its trust profile and text extensions (includeOpts).
const ENGINES = new Map();
const MAX_ENGINES = 8;
exports.MAX_ENGINES = MAX_ENGINES;
function sharedEngine(opts) {
    const key = JSON.stringify(opts);
    let engine = ENGINES.get(key);
    if (undefined === engine) {
        if (MAX_ENGINES <= ENGINES.size) {
            ENGINES.delete(ENGINES.keys().next().value);
        }
        engine = new aontu_1.Aontu({ ...opts });
        ENGINES.set(key, engine);
    }
    return engine;
} /* node:coverage ignore next 6 */
//# sourceMappingURL=engine.js.map