/* Copyright (c) 2026 Richard Rodger, MIT License */


// The vendored JSON Schema corpora as the harnesses read them: each
// schema and instance is the corpus's own text, since a JSON reader
// that rounds numbers would test something else.

import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { importJsonSchema, parseJson } from '../dist/jsonschema-import'
import type { JNode } from '../dist/jsonschema-import'
import { jsonSchema } from '../dist/jsonschema'
import { subsume } from '../dist/subsume'
import { hcanon } from '../dist/hcanon'
import { exactJSON } from '../dist/exactjson'
import { canonRiders } from '../dist/utility'


const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors')


type Group = {
  file: string, group: string, schema: string, dialect?: string,
  cases: { test: string, data: string, want: boolean }[]
}


function rows(file: string): string[][] {
  return Fs.readFileSync(file, 'utf8').split('\n')
    .filter((line) => '' !== line.trim() && !line.startsWith('#'))
    .map((line) => line.split('\t'))
}


function files(dir: string, rel: string, out: string[]): string[] {
  for (const f of Fs.readdirSync(dir).sort()) {
    const p = Path.join(dir, f)
    const r = '' === rel ? f : rel + '/' + f
    if (Fs.statSync(p).isDirectory()) {
      files(p, r, out)
    }
    else if (f.endsWith('.json')) {
      out.push(r)
    }
  }
  return out
}


// The suite's remotes, served at http://localhost:1234/, and each under
// its own `$id` where it names another URI.
function remotes(): Record<string, string> {
  const out: Record<string, string> = {}
  const dir = Path.join(VECTORS, 'jsonschema', 'remotes')
  const all = files(dir, '', []).map((f) => [f, Fs.readFileSync(Path.join(dir, f), 'utf8')])
  for (const [f, text] of all) {
    out['http://localhost:1234/' + f] = text
  }
  for (const [, text] of all) {
    const id = (JSON.parse(text) as any)?.$id
    if ('string' === typeof id && undefined === out[id]) {
      out[id] = text
    }
  }
  return out
}


function member(node: JNode, key: string): JNode {
  const found = 'object' === node.t ? node.entries.find((e) => e.key === key) : undefined
  Assert.ok(null != found, 'a suite object without ' + key)
  return found.val
}

function text(node: JNode): string {
  return 'string' === node.t ? node.s : ''
}


// The official suite's shape: files of groups, each a schema and its
// tests, read in the dialect the directory is written in (ADR-061).
function suiteGroups(dir: string, dialect?: string): Group[] {
  const out: Group[] = []
  for (const file of files(dir, '', [])) {
    const src = Fs.readFileSync(Path.join(dir, file), 'utf8')
    const groups = parseJson(src)
    Assert.ok('array' === (groups as JNode).t, file + ' is not a suite file')
    for (const g of (groups as JNode & { t: 'array' }).items) {
      const schemaNode = member(g, 'schema')
      out.push({
        file, group: text(member(g, 'description')), dialect,
        schema: src.slice(schemaNode.off, schemaNode.end),
        cases: (member(g, 'tests') as JNode & { t: 'array' }).items.map((t) => {
          const dataNode = member(t, 'data')
          return {
            test: text(member(t, 'description')),
            data: src.slice(dataNode.off, dataNode.end),
            want: 'true' === member(t, 'valid').t,
          }
        }),
      })
    }
  }
  return out
}


// One engine settles every import, since building one builds a parser.
let ENGINE: Aontu | undefined

function settle(text: string): any {
  try {
    return (ENGINE = ENGINE ?? new Aontu()).unify(text)
  }
  catch (_e) {
    return undefined
  }
}


// Why a schema does not come back from import(export(import(S))) as its
// first import (ADR-068), or undefined where it does.
function roundTrip(schema: string, opts: {
  documents: Record<string, string>, path?: string, dialect?: string, formatAssertion?: boolean
}): string | undefined {
  const again = { documents: opts.documents, formatAssertion: opts.formatAssertion, noMetaCheck: true }
  const first = importJsonSchema(schema, { ...again, path: opts.path, dialect: opts.dialect })
  if ('error' === first.verdict) {
    return 'the import refuses it'
  }
  const v1 = settle(first.aontu)
  if (undefined === v1) {
    return 'the import does not stand'
  }
  const out = jsonSchema(first.aontu)
  if ('error' === out.verdict) {
    return 'the export refuses it'
  }
  const second = importJsonSchema(exactJSON(out.schema), again)
  const v2 = 'error' === second.verdict ? undefined : settle(second.aontu)
  if (undefined === v2) {
    return 'the export does not import back'
  }
  if (hcanon(v1) === hcanon(v2)) {
    return undefined
  }
  // The root's riders are part of the value, as a nested value's are.
  if (canonRiders(v1) !== canonRiders(v2)) {
    return 'the canon differs'
  }
  const there = subsume(first.aontu, second.aontu).verdict
  const back = subsume(second.aontu, first.aontu).verdict
  return 'subsumes' === there && 'subsumes' === back ? undefined : `subsume answers ${there}, ${back}`
}


export type { Group }

export {
  VECTORS,
  rows,
  files,
  remotes,
  suiteGroups,
  roundTrip,
}
