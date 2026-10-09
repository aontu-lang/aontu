/* Copyright (c) 2026 Richard Rodger, MIT License */


// The official suite's annotation tests. Each assertion names a location
// in an instance, a keyword, and the values the schema annotates that
// location with; the schema is imported, met with the instance, and the
// riders at the location are read, against the ledger
// test/vectors/jsonschema/annotations/skips.tsv.

import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { exactJSON } from '../dist/exactjson'
import { importJsonSchema, parseJson } from '../dist/jsonschema-import'
import type { JNode } from '../dist/jsonschema-import'
import { ConjunctVal } from '../dist/val/ConjunctVal'


const DIR = Path.join(__dirname, '..', '..', 'test', 'vectors', 'jsonschema', 'annotations')

// The ledger may not grow past this; the register tightens it per phase.
const SKIP_BOUND = 41

// The record key an annotation keyword rides under; any other keyword
// rides `x`, under its own name.
const ANNOTATION_KEY: Record<string, string> = {
  title: 'title', description: 'description', $comment: 'comment',
  default: 'default', examples: 'examples', readOnly: 'readOnly',
  writeOnly: 'writeOnly', format: 'format', contentEncoding: 'contentEncoding',
  contentMediaType: 'contentMediaType', contentSchema: 'contentSchema',
}


// A release number alone is the earliest the case holds for, `<=` the
// latest, `=` the one, and commas join them.
function for2020(spec: string | undefined): boolean {
  return undefined === spec || spec.split(',').every((c) =>
    c.startsWith('<=') ? 2020 <= Number(c.slice(2)) :
      c.startsWith('=') ? 2020 === Number(c.slice(1)) : Number(c) <= 2020)
}


function member(node: JNode, key: string): JNode | undefined {
  return 'object' === node.t ? node.entries.find((e) => e.key === key)?.val : undefined
}


function items(node: JNode | undefined): JNode[] {
  return 'array' === node?.t ? node.items : []
}


// A conjunct still pending, such as a container beside a count, holds each term.
function held(node: any): any[] {
  return null == node ? [] : true === node.isConjunct ? node.peg.flatMap(held) : [node]
}


// The values a keyword annotates a location of the met value with, as a
// set of canonical JSON, since a record holds each value once; none
// where the instance has no such location.
function annotationsAt(met: any, instance: any, location: string, keyword: string): string[] {
  let nodes: any[] = [met]
  let inst = instance
  for (const raw of location.split('/').slice(1)) {
    const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (null == inst || 'object' !== typeof inst ||
      !Object.prototype.hasOwnProperty.call(inst, seg)) {
      return []
    }
    inst = inst[seg]
    nodes = nodes.flatMap(held).filter((n: any) => true === n.isMap || true === n.isList)
      .map((n: any) => n.peg[seg]).filter((n: any) => null != n)
  }
  nodes = nodes.flatMap(held)
  if ('deprecated' === keyword) {
    return nodes.some((n: any) => null != n.deprecation) ? ['true'] : []
  }
  const key = ANNOTATION_KEY[keyword]
  const vals: any[] = nodes.flatMap((n: any) => undefined === key ?
    (n.meta?.x ?? []).map((v: any) => v.peg?.[keyword]).filter((v: any) => null != v) :
    n.meta?.[key] ?? [])
  const ctx: any = new Aontu().ctx({ collect: true })
  return [...new Set(vals.map((v: any) => exactJSON(v.gen(ctx))))].sort()
}


test('the-suites-annotation-tests-read-the-riders', () => {
  const skips = Fs.readFileSync(Path.join(DIR, 'skips.tsv'), 'utf8').split('\n')
    .filter((l) => '' !== l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t')).map(([file, group, name, construct]) =>
      ({ file, group, test: name, construct, used: false }))
  Assert.ok(skips.length <= SKIP_BOUND,
    `the annotation ledger holds ${skips.length} rows, past its bound of ${SKIP_BOUND}`)

  const problems: string[] = []
  let total = 0
  let passed = 0
  for (const file of Fs.readdirSync(Path.join(DIR, 'tests')).sort()) {
    const src = Fs.readFileSync(Path.join(DIR, 'tests', file), 'utf8')
    for (const c of items(member(parseJson(src) as JNode, 'suite'))) {
      const compat = member(c, 'compatibility')
      if (!for2020('string' === compat?.t ? compat.s : undefined)) {
        continue
      }
      const group = (member(c, 'description') as any).s
      const schemaNode = member(c, 'schema') as JNode
      const report = importJsonSchema(src.slice(schemaNode.off, schemaNode.end), { path: file })
      items(member(c, 'tests')).forEach((t, i) => {
        const instNode = member(t, 'instance') as JNode
        const instText = src.slice(instNode.off, instNode.end)
        const aontu = new Aontu()
        const ctx: any = aontu.ctx({ collect: true })
        const pair = new ConjunctVal({ peg: [
          aontu.parse(report.aontu, {}, ctx), aontu.parse(instText, { exactNumbers: true }, ctx),
        ] }, ctx)
        const met: any = aontu.unify(pair, undefined, ctx)
        const held = 0 === ctx.err.length && true !== met?.isNil
        for (const a of items(member(t, 'assertions'))) {
          total++
          const location = (member(a, 'location') as any).s
          const keyword = (member(a, 'keyword') as any).s
          const name = `test ${i}: ${'' === location ? '#' : location} ${keyword}`
          const expected = member(a, 'expected') as JNode & { t: 'object' }
          const want = [...new Set(expected.entries.map((e) =>
            exactJSON(JSON.parse(src.slice(e.val.off, e.val.end)))))].sort()
          const got = held ? annotationsAt(met, JSON.parse(instText), location, keyword) : []
          const skip = skips.find((s) => s.file === file && s.group === group && s.test === name)
          if (JSON.stringify(got) === JSON.stringify(want)) {
            passed++
            if (null != skip) {
              problems.push(`${file} | ${group} | ${name}: listed as a skip ` +
                `(${skip.construct}) and passes; delete its row`)
            }
          }
          else if (null == skip) {
            problems.push(`${file} | ${group} | ${name}: wanted ${JSON.stringify(want)} ` +
              `and got ${JSON.stringify(got)}, with no skip listed`)
          }
          else {
            skip.used = true
          }
        }
      })
    }
  }
  for (const s of skips) {
    if (!s.used) {
      problems.push(`${s.file} | ${s.group} | ${s.test}: listed as a skip (${s.construct}) ` +
        'and nothing under it fails; delete its row')
    }
  }
  console.log(`annotations: ${total} assertions, ${passed} pass, ${skips.length} ledger rows`)
  Assert.deepStrictEqual(problems, [], problems.join('\n'))
})
