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
// G12 phase 18 (ADR-068): every schema of the pinned SchemaStore subset
// comes back from import(export(import(S))) as import(S), as the official
// suite's do, or it is a row of the ledger
// test/vectors/jsonschema/schemastore/roundtrip.tsv.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const suite_1 = require("./suite");
const STORE = Path.join(suite_1.VECTORS, 'jsonschema', 'schemastore');
// The subset is its own document set: each file under the hosts
// SchemaStore serves it from, and under its own $id.
function documents(names) {
    const out = {};
    for (const name of names) {
        const text = Fs.readFileSync(Path.join(STORE, 'schemas', name), 'utf8');
        out['https://json.schemastore.org/' + name] = text;
        out['https://www.schemastore.org/' + name] = text;
        const id = JSON.parse(text).$id;
        if ('string' === typeof id && undefined === out[id]) {
            out[id] = text;
        }
    }
    return out;
}
// The ledger may not grow past its bound; the register tightens it.
(0, node_test_1.test)('the-schemastore-subset-round-trips', () => {
    const ledger = (0, suite_1.rows)(Path.join(STORE, 'roundtrip.tsv'));
    Assert.ok(ledger.length <= 6, `the SchemaStore ledger holds ${ledger.length} rows, past its bound`);
    const listed = new Map(ledger.map(([file, construct]) => [file, construct]));
    const names = Fs.readdirSync(Path.join(STORE, 'schemas')).filter((f) => f.endsWith('.json')).sort();
    const docs = documents(names);
    const problems = [];
    const start = Date.now();
    for (const name of names) {
        const schema = Fs.readFileSync(Path.join(STORE, 'schemas', name), 'utf8');
        const why = (0, suite_1.roundTrip)(schema, { documents: docs, path: name });
        if (undefined === why && listed.has(name)) {
            problems.push(`${name}: listed (${listed.get(name)}) and round-trips; delete its row`);
        }
        else if (undefined !== why && !listed.has(name)) {
            problems.push(`${name}: ${why}, with no ledger row`);
        }
        listed.delete(name);
    }
    problems.push(...[...listed.keys()].map((name) => `${name}: listed and not vendored; delete its row`));
    console.log(`schemastore round trip: ${names.length} schemas, ${ledger.length} ledger rows, ` +
        `${Date.now() - start} ms`);
    Assert.deepStrictEqual(problems, [], problems.join('\n'));
});
//# sourceMappingURL=jsonschema-schemastore.test.js.map