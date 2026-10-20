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
const tlog_1 = require("../dist/tlog");
const tlog_vectors_1 = require("./tlog-vectors");
(0, node_test_1.describe)('tlog', () => {
    (0, node_test_1.test)('the-vectors-are-upstreams', () => {
        const v = (0, tlog_vectors_1.loadTlogVectors)();
        Assert.equal(v.upstream, 'golang.org/x/mod@v0.32.0 sumdb/tlog');
        Assert.ok(0 < v.storedHashes.length);
    });
    // A suite that drifted to all acceptances would stop testing the
    // thing that matters, so the balance is asserted as well as the rows.
    (0, node_test_1.test)('the-rejections-outnumber-the-acceptances', () => {
        for (const group of ['checkRecord', 'checkTree']) {
            const { accepted, refused } = (0, tlog_vectors_1.tlogRunGroup)(group);
            Assert.ok(0 < accepted && accepted * 2 < refused, `${group}: ${accepted}/${refused}`);
        }
    });
    (0, node_test_1.test)('an-unknown-group-is-refused', () => {
        Assert.throws(() => (0, tlog_vectors_1.tlogRunGroup)('tilePath'), /no tlog vector group "tilePath"/);
    });
    (0, node_test_1.test)('node-hash-refuses-a-malformed-hash', () => {
        const { left, right } = (0, tlog_vectors_1.loadTlogVectors)().nodeHash[0];
        for (const bad of ['', 'AAAA', Buffer.alloc(33).toString('base64')]) {
            Assert.throws(() => (0, tlog_1.tlogNodeHash)(bad, right), /malformed hash/, bad);
            Assert.throws(() => (0, tlog_1.tlogNodeHash)(left, bad), /malformed hash/, bad);
        }
    });
    (0, node_test_1.test)('tree-hash-refuses-malformed-stored-hashes-and-a-failing-reader', () => {
        Assert.throws(() => (0, tlog_1.tlogTreeHash)(13, () => ['AAAA', 'AAAA', 'AAAA']), /malformed hash/);
        Assert.throws(() => (0, tlog_1.tlogTreeHash)(13, () => {
            throw new Error('tile fetch failed');
        }), /tile fetch failed/);
    });
    (0, node_test_1.test)('check-refuses-malformed-input', () => {
        const ok = (0, tlog_vectors_1.loadTlogVectors)().checkRecord[0];
        Assert.ok(ok.want, 'the first inclusion vector accepts');
        Assert.ok((0, tlog_1.tlogCheckRecord)(ok.proof, ok.t, ok.th, ok.n, ok.h));
        Assert.equal((0, tlog_1.tlogCheckRecord)(ok.proof, ok.t, 'AAAA', ok.n, ok.h), false);
        Assert.equal((0, tlog_1.tlogCheckRecord)(ok.proof, ok.t, ok.th, ok.n, 'AAAA'), false);
        Assert.equal((0, tlog_1.tlogCheckRecord)(['AAAA'], ok.t, ok.th, ok.n, ok.h), false);
        Assert.equal((0, tlog_1.tlogCheckRecord)([], 3, ok.th, 3, ok.h), false);
        Assert.equal((0, tlog_1.tlogCheckTree)([], 3, ok.th, 4, ok.h), false);
        Assert.equal((0, tlog_1.tlogCheckTree)(['AAAA'], 3, ok.th, 2, ok.h), false);
        Assert.equal((0, tlog_1.tlogCheckTree)([], 3, 'AAAA', 2, ok.h), false);
        Assert.equal((0, tlog_1.tlogCheckTree)([], 3, ok.th, 2, 'AAAA'), false);
    });
    (0, node_test_1.test)('tiles', () => {
        const v = (0, tlog_vectors_1.loadTlogVectors)();
        Assert.throws(() => (0, tlog_1.tlogTileForIndex)(0, 0), /invalid tile height/);
        Assert.throws(() => (0, tlog_1.tlogNewTiles)(0, 0, 1), /invalid tile height/);
        const tiles = (0, tlog_1.tlogNewTiles)(2, 0, 8);
        Assert.ok(0 < tiles.length);
        for (const tile of tiles) {
            Assert.equal(tile.h, 2);
            Assert.ok(1 <= tile.w && tile.w <= 4, JSON.stringify(tile));
        }
        Assert.deepEqual((0, tlog_1.tlogNewTiles)(2, 8, 8), []);
        // A hash above the leaf level is not stored in its tile, so reading
        // it back recomputes it from the leaves below.
        const index = (0, tlog_1.tlogStoredHashIndex)(1, 0);
        const tile = { ...(0, tlog_1.tlogTileForIndex)(2, index) };
        tile.w = 1 << tile.h;
        const data = Buffer.concat(Array.from({ length: tile.w }, (_, i) => Buffer.from(v.storedHashes[(0, tlog_1.tlogStoredHashIndex)(tile.l * tile.h, tile.n * (1 << tile.h) + i)], 'base64')));
        Assert.equal((0, tlog_1.tlogHashFromTile)(tile, data, index), v.storedHashes[index]);
        Assert.throws(() => (0, tlog_1.tlogHashFromTile)(tile, data.subarray(0, tlog_1.TLOG_HASH_SIZE), index));
    });
    (0, node_test_1.test)('notes', () => {
        const v = (0, tlog_vectors_1.loadTlogVectors)();
        const signed = v.note.signed[0];
        Assert.throws(() => (0, tlog_1.tlogOpenNote)(signed.msg, []), Error, 'a note no known key signed is refused, not opened empty');
        Assert.throws(() => (0, tlog_1.tlogOpenNote)(signed.msg, ['not-a-key']), Error, 'a verifier key that does not parse is refused');
    });
    (0, node_test_1.test)('parse-tree', () => {
        const ok = (0, tlog_vectors_1.loadTlogVectors)().note.trees[0];
        Assert.ok(ok.want);
        Assert.deepEqual((0, tlog_1.tlogParseTree)(ok.text + 'extra\nmore\n', ok.origin), { n: ok.n, hash: ok.hash });
        let huge = ok.text;
        while (huge.length <= 1e6) {
            huge += 'padding\n';
        }
        Assert.throws(() => (0, tlog_1.tlogParseTree)(huge, ok.origin), /malformed tree note/);
        Assert.throws(() => (0, tlog_1.tlogParseTree)(ok.origin + '\n13\n', ok.origin), /malformed tree note/);
        // A size is bounded by what a number holds exactly; the twin in
        // go/tlog_test.go refuses the same checkpoints.
        Assert.equal((0, tlog_1.tlogParseTree)(ok.origin + '\n9007199254740991\n' + ok.hash + '\n', ok.origin).n, 9007199254740991);
        for (const size of ['9007199254740992', '9223372036854775807']) {
            Assert.throws(() => (0, tlog_1.tlogParseTree)(ok.origin + '\n' + size + '\n' + ok.hash + '\n', ok.origin), /malformed tree note/, size);
        }
        for (const badRoot of ['AAAA', '', 'not base64!']) {
            Assert.throws(() => (0, tlog_1.tlogParseTree)(ok.origin + '\n13\n' + badRoot + '\n', ok.origin), /malformed tree note/, badRoot);
        }
    });
});
//# sourceMappingURL=tlog.test.js.map