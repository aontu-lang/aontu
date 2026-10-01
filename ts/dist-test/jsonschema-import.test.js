"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// The JSON Schema importer's paths no shared row reaches: the copy budget
// a root that is not a map spends on references, which a row would
// have to pin as kilobytes of text.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const jsonschema_import_1 = require("../dist/jsonschema-import");
(0, node_test_1.test)('copies-past-the-budget-admit-anything-and-say-so', () => {
    // Each level references the one below twice, so the copies double.
    const defs = { d0: { type: 'integer' } };
    for (let i = 1; i < 14; i++) {
        defs['d' + i] = { allOf: [{ $ref: '#/$defs/d' + (i - 1) }, { $ref: '#/$defs/d' + (i - 1) }] };
    }
    const report = (0, jsonschema_import_1.importJsonSchema)(JSON.stringify({
        minimum: 0, allOf: [{ $ref: '#/$defs/d13' }], $defs: defs,
    }));
    Assert.equal(report.verdict, 'lossy');
    Assert.ok(report.lossy.some((l) => '$ref' === l.construct && /budget/.test(l.reason)), JSON.stringify(report.lossy));
});
// Within the nesting bound the formatter reads every text the importer
// writes, so only a stand-in that refuses can show the text kept as written.
(0, node_test_1.test)('a-refused-format-keeps-the-text-as-written', () => {
    Assert.equal((0, jsonschema_import_1.agreedForm)('a: 1\n', () => ({ verdict: 'error', errors: [] })), 'a: 1\n');
});
//# sourceMappingURL=jsonschema-import.test.js.map