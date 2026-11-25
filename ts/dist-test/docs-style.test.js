"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
// The style rules and the link check of docs.test.ts, in the gate
// group so that they run on every push.
process.env.AONTU_DOCS_STYLE = '1';
require('./docs.test');
//# sourceMappingURL=docs-style.test.js.map