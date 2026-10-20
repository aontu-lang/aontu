/* Copyright (c) 2026 Richard Rodger, MIT License */


// The transparency-log client: the verifying half of sumdb/tlog and
// sumdb/note as @aontu/mod ports it, behind the base64-string boundary
// go/tlog.go puts around the upstream Go library. A hash crosses this
// file as text and is decoded here, once.

import {
  HASH_SIZE, recordHash, nodeHash, formatHash, parseHash,
  storedHashIndex, storedHashCount, treeHash, checkRecord, checkTree,
  tileForIndex, hashFromTile, newTiles, parseVerifierKey, openNote,
  parseTree,
} from '@aontu/mod'
import type { Hash, Tile } from '@aontu/mod'


export const TLOG_HASH_SIZE = HASH_SIZE


export type TlogTile = Tile


function tlogParseHashes(ss: string[]): Hash[] {
  return ss.map((s) => parseHash(s))
}


export function tlogFormatHash(h: Hash): string {
  return formatHash(h)
}


export function tlogRecordHash(data: Uint8Array): string {
  return tlogFormatHash(recordHash(data))
}


export function tlogNodeHash(left: string, right: string): string {
  return tlogFormatHash(nodeHash(parseHash(left), parseHash(right)))
}


export function tlogStoredHashIndex(level: number, n: number): number {
  return storedHashIndex(level, n)
}


export function tlogStoredHashCount(n: number): number {
  return storedHashCount(n)
}


export function tlogTreeHash(n: number, read: (indexes: number[]) => string[]): string {
  return tlogFormatHash(treeHash(n, (indexes) => tlogParseHashes(read(indexes))))
}


// False, not a throw, when an input does not decode: a proof over a
// malformed hash is a proof that does not verify, and no caller can
// read false as an accept.
export function tlogCheckRecord(
  p: string[], t: number, th: string, n: number, h: string,
): boolean {
  try {
    return checkRecord(tlogParseHashes(p), t, parseHash(th), n, parseHash(h))
  }
  catch {
    return false
  }
}


export function tlogCheckTree(
  p: string[], t: number, th: string, n: number, h: string,
): boolean {
  try {
    return checkTree(tlogParseHashes(p), t, parseHash(th), n, parseHash(h))
  }
  catch {
    return false
  }
}


export function tlogTileForIndex(h: number, index: number): TlogTile {
  if (h <= 0) {
    throw new Error('tlog: invalid tile height')
  }
  return tileForIndex(h, index)
}


export function tlogHashFromTile(t: TlogTile, data: Uint8Array, index: number): string {
  return tlogFormatHash(hashFromTile(t, data, index))
}


export function tlogNewTiles(
  h: number, oldTreeSize: number, newTreeSize: number,
): TlogTile[] {
  if (h <= 0) {
    throw new Error('tlog: invalid tile height')
  }
  return newTiles(h, oldTreeSize, newTreeSize)
}


export function tlogOpenNote(
  msg: string, verifierKeys: string[],
): { text: string, signedBy: string[] } {
  const note = openNote(msg, verifierKeys.map((k) => parseVerifierKey(k)))
  return { text: note.text, signedBy: note.verified.map((v) => v.name) }
}


export function tlogParseTree(text: string, origin: string): { n: number, hash: string } {
  const tree = parseTree(text, origin)
  return { n: tree.n, hash: tlogFormatHash(tree.hash) }
}

