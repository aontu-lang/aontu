/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'

import {
  TLOG_HASH_SIZE, tlogNodeHash, tlogStoredHashIndex, tlogTreeHash,
  tlogCheckRecord, tlogCheckTree, tlogTileForIndex, tlogHashFromTile,
  tlogNewTiles, tlogOpenNote, tlogParseTree,
} from '../dist/tlog'
import { loadTlogVectors, tlogRunGroup } from './tlog-vectors'


describe('tlog', () => {

  test('the-vectors-are-upstreams', () => {
    const v = loadTlogVectors()
    Assert.equal(v.upstream, 'golang.org/x/mod@v0.32.0 sumdb/tlog')
    Assert.ok(0 < v.storedHashes.length)
  })


  // A suite that drifted to all acceptances would stop testing the
  // thing that matters, so the balance is asserted as well as the rows.
  test('the-rejections-outnumber-the-acceptances', () => {
    for (const group of ['checkRecord', 'checkTree']) {
      const { accepted, refused } = tlogRunGroup(group)
      Assert.ok(0 < accepted && accepted * 2 < refused, `${group}: ${accepted}/${refused}`)
    }
  })


  test('an-unknown-group-is-refused', () => {
    Assert.throws(() => tlogRunGroup('tilePath'), /no tlog vector group "tilePath"/)
  })


  test('node-hash-refuses-a-malformed-hash', () => {
    const { left, right } = loadTlogVectors().nodeHash[0]
    for (const bad of ['', 'AAAA', Buffer.alloc(33).toString('base64')]) {
      Assert.throws(() => tlogNodeHash(bad, right), /malformed hash/, bad)
      Assert.throws(() => tlogNodeHash(left, bad), /malformed hash/, bad)
    }
  })


  test('tree-hash-refuses-malformed-stored-hashes-and-a-failing-reader', () => {
    Assert.throws(() => tlogTreeHash(13, () => ['AAAA', 'AAAA', 'AAAA']),
      /malformed hash/)
    Assert.throws(() => tlogTreeHash(13, () => {
      throw new Error('tile fetch failed')
    }), /tile fetch failed/)
  })


  test('check-refuses-malformed-input', () => {
    const ok = loadTlogVectors().checkRecord[0]
    Assert.ok(ok.want, 'the first inclusion vector accepts')
    Assert.ok(tlogCheckRecord(ok.proof, ok.t, ok.th, ok.n, ok.h))

    Assert.equal(tlogCheckRecord(ok.proof, ok.t, 'AAAA', ok.n, ok.h), false)
    Assert.equal(tlogCheckRecord(ok.proof, ok.t, ok.th, ok.n, 'AAAA'), false)
    Assert.equal(tlogCheckRecord(['AAAA'], ok.t, ok.th, ok.n, ok.h), false)
    Assert.equal(tlogCheckRecord([], 3, ok.th, 3, ok.h), false)

    Assert.equal(tlogCheckTree([], 3, ok.th, 4, ok.h), false)
    Assert.equal(tlogCheckTree(['AAAA'], 3, ok.th, 2, ok.h), false)
    Assert.equal(tlogCheckTree([], 3, 'AAAA', 2, ok.h), false)
    Assert.equal(tlogCheckTree([], 3, ok.th, 2, 'AAAA'), false)
  })


  test('tiles', () => {
    const v = loadTlogVectors()

    Assert.throws(() => tlogTileForIndex(0, 0), /invalid tile height/)
    Assert.throws(() => tlogNewTiles(0, 0, 1), /invalid tile height/)

    const tiles = tlogNewTiles(2, 0, 8)
    Assert.ok(0 < tiles.length)
    for (const tile of tiles) {
      Assert.equal(tile.h, 2)
      Assert.ok(1 <= tile.w && tile.w <= 4, JSON.stringify(tile))
    }
    Assert.deepEqual(tlogNewTiles(2, 8, 8), [])

    // A hash above the leaf level is not stored in its tile, so reading
    // it back recomputes it from the leaves below.
    const index = tlogStoredHashIndex(1, 0)
    const tile = { ...tlogTileForIndex(2, index) }
    tile.w = 1 << tile.h
    const data = Buffer.concat(Array.from({ length: tile.w }, (_, i) =>
      Buffer.from(v.storedHashes[
        tlogStoredHashIndex(tile.l * tile.h, tile.n * (1 << tile.h) + i)], 'base64')))
    Assert.equal(tlogHashFromTile(tile, data, index), v.storedHashes[index])
    Assert.throws(() => tlogHashFromTile(tile, data.subarray(0, TLOG_HASH_SIZE), index))
  })


  test('notes', () => {
    const v = loadTlogVectors()
    const signed = v.note.signed[0]
    Assert.throws(() => tlogOpenNote(signed.msg, []), Error,
      'a note no known key signed is refused, not opened empty')
    Assert.throws(() => tlogOpenNote(signed.msg, ['not-a-key']), Error,
      'a verifier key that does not parse is refused')
  })


  test('parse-tree', () => {
    const ok = loadTlogVectors().note.trees[0]
    Assert.ok(ok.want)

    Assert.deepEqual(tlogParseTree(ok.text + 'extra\nmore\n', ok.origin),
      { n: ok.n, hash: ok.hash })

    let huge = ok.text
    while (huge.length <= 1e6) {
      huge += 'padding\n'
    }
    Assert.throws(() => tlogParseTree(huge, ok.origin), /malformed tree note/)

    Assert.throws(() => tlogParseTree(ok.origin + '\n13\n', ok.origin),
      /malformed tree note/)

    // A size is bounded by what a number holds exactly; the twin in
    // go/tlog_test.go refuses the same checkpoints.
    Assert.equal(tlogParseTree(
      ok.origin + '\n9007199254740991\n' + ok.hash + '\n', ok.origin).n, 9007199254740991)
    for (const size of ['9007199254740992', '9223372036854775807']) {
      Assert.throws(() => tlogParseTree(ok.origin + '\n' + size + '\n' + ok.hash + '\n', ok.origin),
        /malformed tree note/, size)
    }

    for (const badRoot of ['AAAA', '', 'not base64!']) {
      Assert.throws(() => tlogParseTree(ok.origin + '\n13\n' + badRoot + '\n', ok.origin),
        /malformed tree note/, badRoot)
    }
  })

})
