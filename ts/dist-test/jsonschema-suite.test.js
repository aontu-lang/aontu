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
// The current dialect's corpus, Ajv's extra tests and JSONTestSuite;
// the earlier dialects are jsonschema-suite-2019.test.ts and
// jsonschema-suite-earlier.test.ts. The runner is suite-corpus.ts.
const node_test_1 = require("node:test");
const Path = __importStar(require("node:path"));
const suite_1 = require("./suite");
const suite_corpus_1 = require("./suite-corpus");
// Each ledger may not grow past its bound; the register tightens them.
(0, node_test_1.test)('the-json-schema-test-suite-runs-under-import-and-vet', () => (0, suite_corpus_1.runCorpus)('jsonschema/skips.tsv', 13, (0, suite_1.suiteGroups)(Path.join(suite_1.VECTORS, 'jsonschema', 'tests', 'draft2020-12')), (0, suite_1.remotes)()));
(0, node_test_1.test)('ajvs-extra-tests-run-under-import-and-vet', () => (0, suite_corpus_1.runCorpus)('ajv-extras/skips.tsv', 0, (0, suite_1.suiteGroups)(Path.join(suite_1.VECTORS, 'ajv-extras', 'tests'))));
(0, node_test_1.test)('jsontestsuite-runs-as-instances-under-vet', () => (0, suite_corpus_1.runCorpus)('jsontestsuite/skips.tsv', 87, (0, suite_corpus_1.parsingGroups)(Path.join(suite_1.VECTORS, 'jsontestsuite'))));
//# sourceMappingURL=jsonschema-suite.test.js.map