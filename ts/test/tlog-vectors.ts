/* Copyright (c) 2026 Richard Rodger, MIT License */

// test/vectors/tlog.json, run one group at a time through the wrappers
// in ts/src/tlog.ts; `tlogRunGroup` in go/tlog_test.go is the twin. A
// case whose answer is not the vector's throws, naming it, and a group
// that runs answers its counts, which a row of test/spec/tlog.tsv pins.

import * as Fs from 'node:fs'
import * as Path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import {
  tlogRecordHash, tlogNodeHash, tlogStoredHashIndex, tlogStoredHashCount,
  tlogTreeHash, tlogCheckRecord, tlogCheckTree, tlogTileForIndex,
  tlogOpenNote, tlogParseTree,
} from '../dist/tlog'


type TlogProofCase = {
  name: string, t: number, th: string, n: number, h: string,
  proof: string[], want: boolean,
}

type TlogVectors = {
  upstream: string
  storedHashes: string[]
  recordHash: { data: string, hash: string }[]
  nodeHash: { left: string, right: string, hash: string }[]
  storedHashIndex: { level: number, n: number, index: number }[]
  storedHashCount: { n: number, count: number }[]
  treeHash: { n: number, root: string }[]
  checkRecord: TlogProofCase[]
  checkTree: TlogProofCase[]
  tileForIndex: {
    h: number, index: number, tileL: number, tileN: number, tileW: number,
  }[]
  note: {
    verifierKey: string
    name: string
    signed: { name: string, text: string, msg: string, want: boolean }[]
    trees: {
      text: string, origin: string, n: number, hash: string, want: boolean,
    }[]
    malformed: { name: string, msg: string }[]
  }
}


let vectors: TlogVectors | undefined

function loadTlogVectors(): TlogVectors {
  if (undefined === vectors) {
    vectors = JSON.parse(Fs.readFileSync(
      Path.join(__dirname, '..', '..', 'test', 'vectors', 'tlog.json'), 'utf8'))
  }
  return vectors as TlogVectors
}


function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn()
  }
  catch {
    return undefined
  }
}


function tlogRunGroup(group: string): Record<string, number> {
  const v = loadTlogVectors()
  const names: string[] = []
  const wants: boolean[] = []
  const gots: boolean[] = []
  const judge = (name: string, want: boolean, got: boolean) => {
    names.push(name)
    wants.push(want)
    gots.push(got)
  }
  const mismatch = (what: string, got: unknown, want: unknown) =>
    new Error(`${group} ${what}: ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

  switch (group) {
    case 'recordHash':
      for (const c of v.recordHash) {
        const got = tlogRecordHash(Buffer.from(c.data, 'base64'))
        if (c.hash !== got) throw mismatch(c.data, got, c.hash)
      }
      return { cases: v.recordHash.length }

    case 'nodeHash':
      for (const c of v.nodeHash) {
        const got = tlogNodeHash(c.left, c.right)
        if (c.hash !== got) throw mismatch(c.left, got, c.hash)
      }
      return { cases: v.nodeHash.length }

    case 'storedHashIndex':
      for (const c of v.storedHashIndex) {
        const got = tlogStoredHashIndex(c.level, c.n)
        if (c.index !== got) throw mismatch(`${c.level} ${c.n}`, got, c.index)
      }
      return { cases: v.storedHashIndex.length }

    case 'storedHashCount':
      for (const c of v.storedHashCount) {
        const got = tlogStoredHashCount(c.n)
        if (c.count !== got) throw mismatch(`${c.n}`, got, c.count)
      }
      return { cases: v.storedHashCount.length }

    case 'treeHash': {
      const read = (indexes: number[]) => indexes.map((i) => v.storedHashes[i])
      for (const c of v.treeHash) {
        const got = tlogTreeHash(c.n, read)
        if (c.root !== got) throw mismatch(`${c.n}`, got, c.root)
      }
      return { cases: v.treeHash.length }
    }

    case 'tileForIndex':
      for (const c of v.tileForIndex) {
        const got = tlogTileForIndex(c.h, c.index)
        const want = { h: c.h, l: c.tileL, n: c.tileN, w: c.tileW }
        if (!isDeepStrictEqual(got, want)) throw mismatch(`${c.h} ${c.index}`, got, want)
      }
      return { cases: v.tileForIndex.length }

    case 'checkRecord':
      for (const c of v.checkRecord) {
        judge(c.name, c.want, tlogCheckRecord(c.proof, c.t, c.th, c.n, c.h))
      }
      break

    case 'checkTree':
      for (const c of v.checkTree) {
        judge(c.name, c.want, tlogCheckTree(c.proof, c.t, c.th, c.n, c.h))
      }
      break

    case 'note.signed':
      for (const c of v.note.signed) {
        const got = attempt(() => tlogOpenNote(c.msg, [v.note.verifierKey]))
        const want = { text: c.text, signedBy: [v.note.name] }
        if (undefined !== got && !isDeepStrictEqual(got, want)) {
          throw mismatch(c.name, got, want)
        }
        judge(c.name, c.want, undefined !== got)
      }
      break

    case 'note.trees':
      for (const c of v.note.trees) {
        const got = attempt(() => tlogParseTree(c.text, c.origin))
        const want = { n: c.n, hash: c.hash }
        if (undefined !== got && !isDeepStrictEqual(got, want)) {
          throw mismatch(JSON.stringify(c.text), got, want)
        }
        judge(JSON.stringify(c.text), c.want, undefined !== got)
      }
      break

    case 'note.malformed':
      for (const c of v.note.malformed) {
        judge(c.name, false,
          undefined !== attempt(() => tlogOpenNote(c.msg, [v.note.verifierKey])))
      }
      break

    default:
      throw new Error(`no tlog vector group ${JSON.stringify(group)}`)
  }

  let accepted = 0
  gots.forEach((got, i) => {
    if (wants[i] !== got) throw mismatch(names[i], got, wants[i])
    if (got) accepted++
  })
  return { cases: gots.length, accepted, refused: gots.length - accepted }
}


export { loadTlogVectors, tlogRunGroup }
