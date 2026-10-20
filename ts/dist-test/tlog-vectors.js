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
exports.loadTlogVectors = loadTlogVectors;
exports.tlogRunGroup = tlogRunGroup;
// test/vectors/tlog.json, run one group at a time through the wrappers
// in ts/src/tlog.ts; `tlogRunGroup` in go/tlog_test.go is the twin. A
// case whose answer is not the vector's throws, naming it, and a group
// that runs answers its counts, which a row of test/spec/tlog.tsv pins.
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const node_util_1 = require("node:util");
const tlog_1 = require("../dist/tlog");
let vectors;
function loadTlogVectors() {
    if (undefined === vectors) {
        vectors = JSON.parse(Fs.readFileSync(Path.join(__dirname, '..', '..', 'test', 'vectors', 'tlog.json'), 'utf8'));
    }
    return vectors;
}
function attempt(fn) {
    try {
        return fn();
    }
    catch {
        return undefined;
    }
}
function tlogRunGroup(group) {
    const v = loadTlogVectors();
    const names = [];
    const wants = [];
    const gots = [];
    const judge = (name, want, got) => {
        names.push(name);
        wants.push(want);
        gots.push(got);
    };
    const mismatch = (what, got, want) => new Error(`${group} ${what}: ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    switch (group) {
        case 'recordHash':
            for (const c of v.recordHash) {
                const got = (0, tlog_1.tlogRecordHash)(Buffer.from(c.data, 'base64'));
                if (c.hash !== got)
                    throw mismatch(c.data, got, c.hash);
            }
            return { cases: v.recordHash.length };
        case 'nodeHash':
            for (const c of v.nodeHash) {
                const got = (0, tlog_1.tlogNodeHash)(c.left, c.right);
                if (c.hash !== got)
                    throw mismatch(c.left, got, c.hash);
            }
            return { cases: v.nodeHash.length };
        case 'storedHashIndex':
            for (const c of v.storedHashIndex) {
                const got = (0, tlog_1.tlogStoredHashIndex)(c.level, c.n);
                if (c.index !== got)
                    throw mismatch(`${c.level} ${c.n}`, got, c.index);
            }
            return { cases: v.storedHashIndex.length };
        case 'storedHashCount':
            for (const c of v.storedHashCount) {
                const got = (0, tlog_1.tlogStoredHashCount)(c.n);
                if (c.count !== got)
                    throw mismatch(`${c.n}`, got, c.count);
            }
            return { cases: v.storedHashCount.length };
        case 'treeHash': {
            const read = (indexes) => indexes.map((i) => v.storedHashes[i]);
            for (const c of v.treeHash) {
                const got = (0, tlog_1.tlogTreeHash)(c.n, read);
                if (c.root !== got)
                    throw mismatch(`${c.n}`, got, c.root);
            }
            return { cases: v.treeHash.length };
        }
        case 'tileForIndex':
            for (const c of v.tileForIndex) {
                const got = (0, tlog_1.tlogTileForIndex)(c.h, c.index);
                const want = { h: c.h, l: c.tileL, n: c.tileN, w: c.tileW };
                if (!(0, node_util_1.isDeepStrictEqual)(got, want))
                    throw mismatch(`${c.h} ${c.index}`, got, want);
            }
            return { cases: v.tileForIndex.length };
        case 'checkRecord':
            for (const c of v.checkRecord) {
                judge(c.name, c.want, (0, tlog_1.tlogCheckRecord)(c.proof, c.t, c.th, c.n, c.h));
            }
            break;
        case 'checkTree':
            for (const c of v.checkTree) {
                judge(c.name, c.want, (0, tlog_1.tlogCheckTree)(c.proof, c.t, c.th, c.n, c.h));
            }
            break;
        case 'note.signed':
            for (const c of v.note.signed) {
                const got = attempt(() => (0, tlog_1.tlogOpenNote)(c.msg, [v.note.verifierKey]));
                const want = { text: c.text, signedBy: [v.note.name] };
                if (undefined !== got && !(0, node_util_1.isDeepStrictEqual)(got, want)) {
                    throw mismatch(c.name, got, want);
                }
                judge(c.name, c.want, undefined !== got);
            }
            break;
        case 'note.trees':
            for (const c of v.note.trees) {
                const got = attempt(() => (0, tlog_1.tlogParseTree)(c.text, c.origin));
                const want = { n: c.n, hash: c.hash };
                if (undefined !== got && !(0, node_util_1.isDeepStrictEqual)(got, want)) {
                    throw mismatch(JSON.stringify(c.text), got, want);
                }
                judge(JSON.stringify(c.text), c.want, undefined !== got);
            }
            break;
        case 'note.malformed':
            for (const c of v.note.malformed) {
                judge(c.name, false, undefined !== attempt(() => (0, tlog_1.tlogOpenNote)(c.msg, [v.note.verifierKey])));
            }
            break;
        default:
            throw new Error(`no tlog vector group ${JSON.stringify(group)}`);
    }
    let accepted = 0;
    gots.forEach((got, i) => {
        if (wants[i] !== got)
            throw mismatch(names[i], got, wants[i]);
        if (got)
            accepted++;
    });
    return { cases: gots.length, accepted, refused: gots.length - accepted };
}
//# sourceMappingURL=tlog-vectors.js.map