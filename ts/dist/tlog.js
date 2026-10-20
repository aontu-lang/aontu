"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TLOG_HASH_SIZE = void 0;
exports.tlogFormatHash = tlogFormatHash;
exports.tlogRecordHash = tlogRecordHash;
exports.tlogNodeHash = tlogNodeHash;
exports.tlogStoredHashIndex = tlogStoredHashIndex;
exports.tlogStoredHashCount = tlogStoredHashCount;
exports.tlogTreeHash = tlogTreeHash;
exports.tlogCheckRecord = tlogCheckRecord;
exports.tlogCheckTree = tlogCheckTree;
exports.tlogTileForIndex = tlogTileForIndex;
exports.tlogHashFromTile = tlogHashFromTile;
exports.tlogNewTiles = tlogNewTiles;
exports.tlogOpenNote = tlogOpenNote;
exports.tlogParseTree = tlogParseTree;
// The transparency-log client: the verifying half of sumdb/tlog and
// sumdb/note as @aontu/mod ports it, behind the base64-string boundary
// go/tlog.go puts around the upstream Go library. A hash crosses this
// file as text and is decoded here, once.
const mod_1 = require("@aontu/mod");
exports.TLOG_HASH_SIZE = mod_1.HASH_SIZE;
function tlogParseHashes(ss) {
    return ss.map((s) => (0, mod_1.parseHash)(s));
}
function tlogFormatHash(h) {
    return (0, mod_1.formatHash)(h);
}
function tlogRecordHash(data) {
    return tlogFormatHash((0, mod_1.recordHash)(data));
}
function tlogNodeHash(left, right) {
    return tlogFormatHash((0, mod_1.nodeHash)((0, mod_1.parseHash)(left), (0, mod_1.parseHash)(right)));
}
function tlogStoredHashIndex(level, n) {
    return (0, mod_1.storedHashIndex)(level, n);
}
function tlogStoredHashCount(n) {
    return (0, mod_1.storedHashCount)(n);
}
function tlogTreeHash(n, read) {
    return tlogFormatHash((0, mod_1.treeHash)(n, (indexes) => tlogParseHashes(read(indexes))));
}
// False, not a throw, when an input does not decode: a proof over a
// malformed hash is a proof that does not verify, and no caller can
// read false as an accept.
function tlogCheckRecord(p, t, th, n, h) {
    try {
        return (0, mod_1.checkRecord)(tlogParseHashes(p), t, (0, mod_1.parseHash)(th), n, (0, mod_1.parseHash)(h));
    }
    catch {
        return false;
    }
}
function tlogCheckTree(p, t, th, n, h) {
    try {
        return (0, mod_1.checkTree)(tlogParseHashes(p), t, (0, mod_1.parseHash)(th), n, (0, mod_1.parseHash)(h));
    }
    catch {
        return false;
    }
}
function tlogTileForIndex(h, index) {
    if (h <= 0) {
        throw new Error('tlog: invalid tile height');
    }
    return (0, mod_1.tileForIndex)(h, index);
}
function tlogHashFromTile(t, data, index) {
    return tlogFormatHash((0, mod_1.hashFromTile)(t, data, index));
}
function tlogNewTiles(h, oldTreeSize, newTreeSize) {
    if (h <= 0) {
        throw new Error('tlog: invalid tile height');
    }
    return (0, mod_1.newTiles)(h, oldTreeSize, newTreeSize);
}
function tlogOpenNote(msg, verifierKeys) {
    const note = (0, mod_1.openNote)(msg, verifierKeys.map((k) => (0, mod_1.parseVerifierKey)(k)));
    return { text: note.text, signedBy: note.verified.map((v) => v.name) };
}
function tlogParseTree(text, origin) {
    const tree = (0, mod_1.parseTree)(text, origin);
    return { n: tree.n, hash: tlogFormatHash(tree.hash) };
}
//# sourceMappingURL=tlog.js.map