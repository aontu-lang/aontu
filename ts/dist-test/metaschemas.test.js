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
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const metaschemas_1 = require("../dist/metaschemas");
const DIR = Path.join(__dirname, '..', '..', 'test', 'vectors', 'json-schema-spec');
const read = (at) => Fs.readFileSync(at, 'utf8').replaceAll('\r\n', '\n');
(0, node_test_1.test)('the-staged-meta-schemas-are-the-vendored-documents', () => {
    const want = {};
    const walk = (at) => {
        for (const e of Fs.readdirSync(at, { withFileTypes: true })) {
            if (e.isDirectory()) {
                walk(Path.join(at, e.name));
            }
            else if (e.name.endsWith('.json')) {
                const text = read(Path.join(at, e.name));
                const doc = JSON.parse(text);
                want[(doc.$id ?? doc.id).replace(/#$/, '')] = text;
            }
        }
    };
    walk(DIR);
    Assert.deepEqual(metaschemas_1.META_SCHEMAS, want, 'ts/src/metaschemas.ts is not test/vectors/json-schema-spec/: run make metaschemas');
    Assert.equal(metaschemas_1.META_SCHEMA_LICENSE, read(Path.join(DIR, 'LICENSE')));
});
//# sourceMappingURL=metaschemas.test.js.map