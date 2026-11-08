"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ENGINES = void 0;
exports.sharedEngine = sharedEngine;
const aontu_1 = require("./aontu");
// Building an engine costs about 11 ms, nearly all of it the parser's
// grammar, far more than a verb's own work on a small document. A verb
// that never hands its engine out takes one from here, keyed by its
// options (includeOpts) and the directory a relative include root
// resolves against, and holding its own copy of those options.
const ENGINES = new Map();
const MAX_ENGINES = 8;
exports.MAX_ENGINES = MAX_ENGINES;
function sharedEngine(opts) {
    const key = process.cwd() + '\n' + JSON.stringify(opts);
    let engine = ENGINES.get(key);
    if (undefined === engine) {
        if (MAX_ENGINES <= ENGINES.size) {
            ENGINES.delete(ENGINES.keys().next().value);
        }
        engine = new aontu_1.Aontu(structuredClone(opts));
        ENGINES.set(key, engine);
    }
    return engine;
} /* node:coverage ignore next 6 */
//# sourceMappingURL=engine.js.map