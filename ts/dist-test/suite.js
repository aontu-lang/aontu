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
exports.VECTORS = void 0;
exports.rows = rows;
exports.files = files;
exports.remotes = remotes;
exports.suiteGroups = suiteGroups;
exports.roundTrip = roundTrip;
// The vendored JSON Schema corpora as the harnesses read them: each
// schema and instance is the corpus's own text, since a JSON reader
// that rounds numbers would test something else.
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const jsonschema_import_1 = require("../dist/jsonschema-import");
const jsonschema_1 = require("../dist/jsonschema");
const subsume_1 = require("../dist/subsume");
const hcanon_1 = require("../dist/hcanon");
const exactjson_1 = require("../dist/exactjson");
const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors');
exports.VECTORS = VECTORS;
function rows(file) {
    return Fs.readFileSync(file, 'utf8').split('\n')
        .filter((line) => '' !== line.trim() && !line.startsWith('#'))
        .map((line) => line.split('\t'));
}
function files(dir, rel, out) {
    for (const f of Fs.readdirSync(dir).sort()) {
        const p = Path.join(dir, f);
        const r = '' === rel ? f : rel + '/' + f;
        if (Fs.statSync(p).isDirectory()) {
            files(p, r, out);
        }
        else if (f.endsWith('.json')) {
            out.push(r);
        }
    }
    return out;
}
// The suite's remotes, served at http://localhost:1234/, and each under
// its own `$id` where it names another URI.
function remotes() {
    const out = {};
    const dir = Path.join(VECTORS, 'jsonschema', 'remotes');
    const all = files(dir, '', []).map((f) => [f, Fs.readFileSync(Path.join(dir, f), 'utf8')]);
    for (const [f, text] of all) {
        out['http://localhost:1234/' + f] = text;
    }
    for (const [, text] of all) {
        const id = JSON.parse(text)?.$id;
        if ('string' === typeof id && undefined === out[id]) {
            out[id] = text;
        }
    }
    return out;
}
function member(node, key) {
    const found = 'object' === node.t ? node.entries.find((e) => e.key === key) : undefined;
    Assert.ok(null != found, 'a suite object without ' + key);
    return found.val;
}
function text(node) {
    return 'string' === node.t ? node.s : '';
}
// The official suite's shape: files of groups, each a schema and its
// tests, read in the dialect the directory is written in (ADR-061).
function suiteGroups(dir, dialect) {
    const out = [];
    for (const file of files(dir, '', [])) {
        const src = Fs.readFileSync(Path.join(dir, file), 'utf8');
        const groups = (0, jsonschema_import_1.parseJson)(src);
        Assert.ok('array' === groups.t, file + ' is not a suite file');
        for (const g of groups.items) {
            const schemaNode = member(g, 'schema');
            out.push({
                file, group: text(member(g, 'description')), dialect,
                schema: src.slice(schemaNode.off, schemaNode.end),
                cases: member(g, 'tests').items.map((t) => {
                    const dataNode = member(t, 'data');
                    return {
                        test: text(member(t, 'description')),
                        data: src.slice(dataNode.off, dataNode.end),
                        want: 'true' === member(t, 'valid').t,
                    };
                }),
            });
        }
    }
    return out;
}
function settle(text) {
    try {
        return new aontu_1.Aontu().unify(text);
    }
    catch (_e) {
        return undefined;
    }
}
// Why a schema does not come back from import(export(import(S))) as its
// first import (ADR-068), or undefined where it does.
function roundTrip(schema, opts) {
    const again = { documents: opts.documents, formatAssertion: opts.formatAssertion, noMetaCheck: true };
    const first = (0, jsonschema_import_1.importJsonSchema)(schema, { ...again, path: opts.path, dialect: opts.dialect });
    const v1 = 'error' === first.verdict ? undefined : settle(first.aontu);
    if (undefined === v1) {
        return 'error' === first.verdict ? undefined : 'the import does not stand';
    }
    const out = (0, jsonschema_1.jsonSchema)(first.aontu);
    if ('error' === out.verdict) {
        return 'the export refuses it';
    }
    const second = (0, jsonschema_import_1.importJsonSchema)((0, exactjson_1.exactJSON)(out.schema), again);
    const v2 = 'error' === second.verdict ? undefined : settle(second.aontu);
    if (undefined === v2) {
        return 'the export does not import back';
    }
    if ((0, hcanon_1.hcanon)(v1) === (0, hcanon_1.hcanon)(v2)) {
        return undefined;
    }
    const there = (0, subsume_1.subsume)(first.aontu, second.aontu).verdict;
    const back = (0, subsume_1.subsume)(second.aontu, first.aontu).verdict;
    return v1.canon !== v2.canon ? 'the canon differs' :
        'subsumes' === there && 'subsumes' === back ? undefined : `subsume answers ${there}, ${back}`;
}
//# sourceMappingURL=suite.js.map