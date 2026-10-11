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
// G12 phase 18 (ADR-068): every schema of the official suite, in every
// dialect, comes back from import(export(import(S))) as import(S), canon
// for canon and subsuming both ways, or its group is a row of the ledger
// test/vectors/jsonschema/roundtrip.tsv.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Path = __importStar(require("node:path"));
const suite_1 = require("./suite");
const DIALECTS = [['draft2020-12', undefined],
    ['draft2019-09', '2019-09'], ['draft7', 'draft-07'], ['draft6', 'draft-06'], ['draft4', 'draft-04']];
// The ledger may not grow past its bound; the register tightens it.
(0, node_test_1.test)('the-json-schema-test-suite-round-trips', () => {
    const ledger = (0, suite_1.rows)(Path.join(suite_1.VECTORS, 'jsonschema', 'roundtrip.tsv'));
    Assert.ok(ledger.length <= 47, `the round-trip ledger holds ${ledger.length} rows, past its bound`);
    const listed = new Map(ledger.map(([dir, file, group, construct]) => [dir + ' | ' + file + ' | ' + group, construct]));
    const documents = (0, suite_1.remotes)();
    const problems = [];
    let total = 0;
    for (const [dir, dialect] of DIALECTS) {
        for (const g of (0, suite_1.suiteGroups)(Path.join(suite_1.VECTORS, 'jsonschema', 'tests', dir), dialect)) {
            const key = dir + ' | ' + g.file + ' | ' + g.group;
            const why = (0, suite_1.roundTrip)(g.schema, { documents, path: g.file, dialect: g.dialect,
                formatAssertion: g.file.startsWith('optional/format/') });
            total++;
            if (undefined === why && listed.has(key)) {
                problems.push(`${key}: listed (${listed.get(key)}) and round-trips; delete its row`);
            }
            else if (undefined !== why && !listed.has(key)) {
                problems.push(`${key}: ${why}, with no ledger row`);
            }
            listed.delete(key);
        }
    }
    problems.push(...[...listed.keys()].map((key) => `${key}: listed and not in the suite; delete its row`));
    console.log(`round trip: ${total} groups, ${ledger.length} ledger rows`);
    Assert.deepStrictEqual(problems, [], problems.join('\n'));
});
//# sourceMappingURL=jsonschema-roundtrip.test.js.map