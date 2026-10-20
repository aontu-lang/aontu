/* Copyright (c) 2026 Richard Rodger, MIT License */


// P6 of sketch/DEFINITION.0.md: every call and word the importer
// writes over the vendored corpora, strings removed, is a row of
// spec/forms.tsv, which the oracle writes from the definition's syntax,
// or of spec/forms-outside.tsv, the forms that wait on a decision, every
// row of which must still be written.

import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { importJsonSchema } from '../dist/jsonschema-import'
import { STORE, VECTORS, rows, remotes, storeDocuments, suiteGroups } from './suite'
import type { Group } from './suite'


const SPEC = Path.join(__dirname, '..', '..', 'spec')

type Uses = { calls: Map<string, string>, words: Map<string, string> }

type Outside = { text: string, kind: string, decision: string, what: string, used: boolean }

type Corpus = { groups: Group[], documents: Record<string, string> }


function isWordChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c)
}


// A name before `(` is a call, and a name that is no key, no alias and no
// path segment is a word. A number is skipped whole, so the `e` of `1e5`
// and the `d` of `0d5` are no words.
function scan(text: string, site: string, uses: Uses): void {
  const bare = text.replace(/"(?:[^"\\]|\\.)*"/g, '" "')
  let i = 0
  while (i < bare.length) {
    const c = bare[i]
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < bare.length && isWordChar(bare[j])) {
        j++
      }
      let k = j
      while (k < bare.length && /\s/.test(bare[k])) {
        k++
      }
      const prev = 0 < i ? bare[i - 1] : ' '
      const next = bare[k] ?? ''
      if (!'%$.'.includes(prev)) {
        const name = bare.slice(i, j)
        if ('(' === next) {
          uses.calls.has(name) || uses.calls.set(name, site)
        }
        else if (':' !== next && '?' !== next) {
          uses.words.has(name) || uses.words.set(name, site)
        }
      }
      i = j
    }
    else if (/[0-9]/.test(c)) {
      while (i < bare.length && (isWordChar(bare[i]) || '.' === bare[i])) {
        i++
      }
    }
    else {
      i++
    }
  }
}


// The suite in every dialect and Ajv's extras under the suite's remotes,
// and the SchemaStore subset under its own documents.
function corpora(): Corpus[] {
  const suite: Group[] = []
  for (const [dir, dialect] of [['draft2020-12', undefined], ['draft2019-09', '2019-09'],
    ['draft7', 'draft-07'], ['draft6', 'draft-06'], ['draft4', 'draft-04']] as const) {
    suite.push(...suiteGroups(Path.join(VECTORS, 'jsonschema', 'tests', dir), dialect))
  }
  suite.push(...suiteGroups(Path.join(VECTORS, 'ajv-extras', 'tests')))
  const names = Fs.readdirSync(Path.join(STORE, 'schemas')).filter((f) => f.endsWith('.json')).sort()
  const store = names.map((name) => ({
    file: 'schemastore/' + name, group: '', cases: [],
    schema: Fs.readFileSync(Path.join(STORE, 'schemas', name), 'utf8'),
  }))
  return [{ groups: suite, documents: remotes() }, { groups: store, documents: storeDocuments(names) }]
}


function readOutside(forms: Set<string>): Outside[] {
  const outside = rows(Path.join(SPEC, 'forms-outside.tsv'))
    .map(([text, kind, decision, what]) => ({ text, kind, decision, what, used: false }))
  Assert.ok(outside.length <= 4,
    `spec/forms-outside.tsv holds ${outside.length} rows, past its bound of 4`)
  for (const o of outside) {
    Assert.ok(('call' === o.kind || 'word' === o.kind) && /^[0-9]+$/.test(o.decision) && '' !== o.what,
      `a row of spec/forms-outside.tsv names a call or word, a decision and a reason: ${o.text}`)
    Assert.ok(!forms.has(o.kind + ' ' + o.text), `${o.text} is a form of the definition; delete its row`)
  }
  return outside
}


test('every-form-the-importer-writes-is-a-form-of-the-definition', () => {
  const forms = new Set(rows(Path.join(SPEC, 'forms.tsv'))
    .filter(([, kind]) => 'call' === kind || 'word' === kind)
    .map(([, kind, text]) => kind + ' ' + text))
  Assert.ok(20 < forms.size, 'spec/forms.tsv holds the definition\'s forms')
  const outside = readOutside(forms)

  const uses: Uses = { calls: new Map(), words: new Map() }
  let imported = 0
  for (const { groups, documents } of corpora()) {
    for (const g of groups) {
      for (const defaults of [false, true]) {
        // ADR-065: the meta-schema check refuses no schema the import
        // would otherwise take here, and costs most of the run.
        const report = importJsonSchema(g.schema, {
          path: g.file, documents, dialect: g.dialect, defaults, noMetaCheck: true,
          formatAssertion: g.file.startsWith('optional/format/'),
        })
        if ('error' !== report.verdict) {
          imported++
          scan(report.aontu, `${g.file} | ${g.group}`, uses)
        }
      }
    }
  }

  const problems: string[] = []
  for (const [kind, used] of [['call', uses.calls], ['word', uses.words]] as const) {
    for (const [name, site] of [...used].sort()) {
      const row = outside.find((o) => o.kind === kind && o.text === name)
      if (null != row) {
        row.used = true
      }
      else if (!forms.has(kind + ' ' + name)) {
        problems.push(`the ${kind} ${name} at ${site}: no form of the definition and no decision`)
      }
    }
  }
  for (const o of outside) {
    if (!o.used) {
      problems.push(`${o.text}: listed outside the definition and never written; delete its row`)
    }
  }
  console.log(`forms: ${imported} imports, ${uses.calls.size} calls, ${uses.words.size} words, ` +
    `${outside.length} outside the definition`)
  Assert.deepStrictEqual(problems, [], problems.join('\n'))
})
