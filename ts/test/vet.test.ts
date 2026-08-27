/* Copyright (c) 2025 Richard Rodger, MIT License */

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { vet, displayFile } from '../dist/vet'
import { trimCheck } from '../dist/trim'
import { relationCheck } from '../dist/relation'
import { subsume } from '../dist/subsume'
import { vet as vetFromPackage } from '../dist/aontu'


const SCHEMA = 'service: { name: string, port: integer }'


// THE REPAIR THE REPORT SAYS IS UNSAFE, made safe. A finding's site
// used to carry a point and no extent, so the only length available to
// a consumer was the CANON — and canon is not source text. Both halves
// are asserted here: the span-driven edit is exact, and the
// canon-driven one corrupts, so the test states what it prevents rather
// than only that it passes.
//
// Status report 2026-08-21 §5, "the manual fallback corrupts files".
// Twin: TestVetSiteSpanIsSafeToReplace in go/vet_test.go.
describe('vet-site-span', () => {

  const DATA = 'port: 0x1F\n'

  const siteOfFirstDataFinding = () => {
    const report = vet('port: integer & min(9000)', DATA)
    Assert.equal(report.verdict, 'invalid')
    const site = report.findings[0].sites.find((s) => 'data' === s.role)
    Assert.ok(site, 'no data site')
    return site!
  }

  const replaceAt = (col: number, len: number, text: string) =>
    DATA.slice(0, col - 1) + text + DATA.slice(col - 1 + len)

  test('the-span-covers-the-whole-literal', () => {
    const site = siteOfFirstDataFinding()
    Assert.equal(site.row, 1)
    Assert.equal(site.col, 7)
    // The canon is `31`; the source is `0x1F`. That gap IS the defect.
    Assert.equal(site.value, '31')
    Assert.equal(site.src, '0x1F')
    Assert.equal(site.len, 4)
  })

  test('replacing-by-the-span-is-exact', () => {
    const site = siteOfFirstDataFinding()
    Assert.equal(replaceAt(site.col, site.len, '9000'), 'port: 9000\n')
  })

  test('replacing-by-the-canon-length-corrupts', () => {
    // What a consumer had to do before, and what it produced: the canon
    // is two characters long, so the edit lands inside the literal and
    // leaves the rest of it behind.
    const site = siteOfFirstDataFinding()
    Assert.equal(
      replaceAt(site.col, String(site.value).length, '9000'),
      'port: 90001F\n')
  })

  // THE INVARIANT, over the whole shared suite rather than one case:
  // a site that carries a span must describe the text at it. Reading
  // the document at (row, col, len) has to yield exactly `src`.
  //
  // This is not decoration. A site whose position and text disagree is
  // WORSE than a coarse one — a consumer following the verification
  // contract refuses every repair, and one skipping it edits the wrong
  // token. The first version of this change shipped exactly that
  // defect: `close({...})` reported the call's column beside the map's
  // `{`, so the document at the span read `c`. Found in review of the
  // pull request, and this is what stops it returning.
  test('every-span-in-the-suite-describes-its-own-text', () => {
    const specDir = Path.join(__dirname, '..', '..', 'test', 'spec')
    const rows = ['vet.tsv', 'subsume.tsv', 'deprecate.tsv'].flatMap(
      (f) => Fs.readFileSync(Path.join(specDir, f), 'utf8')
        .replace(/\r\n/g, '\n').split('\n'))
    const unesc = (t: string) => {
      let o = ''
      for (let i = 0; i < t.length; i++) {
        const c = t[i]
        if ('\\' === c && i + 1 < t.length) {
          const n = t[++i]
          o += 'n' === n ? '\n' : 't' === n ? '\t' : n
        }
        else o += c
      }
      return o
    }

    let checked = 0
    for (const line of rows) {
      const p = line.split('\t')
      if (!line || line.startsWith('#') || 5 > p.length) continue
      if ('vet' !== p[1] && 'subsume' !== p[1]) continue
      const schema = unesc(p[2]), data = unesc(p[3])
      const opts = (JSON.parse(unesc(p[4])) ?? {}).opts
      // `subsume` roles the two documents general/specific; `vet` roles
      // them schema/data. Either way the FIRST column is the first
      // argument, which is what the role has to select between.
      const report: any = 'vet' === p[1]
        ? vet(schema, data, opts)
        : subsume(schema, data, opts)
      for (const f of report.findings) {
        for (const site of f.sites ?? []) {
          if (!(site.len > 0)) continue
          const text =
            ('data' === site.role || 'specific' === site.role) ? data : schema
          const line = text.split('\n')[site.row - 1]
          Assert.ok(null != line, `${p[0]}: row ${site.row} past end of file`)
          Assert.equal(
            line.substr(site.col - 1, site.len), site.src,
            `${p[0]}: the document at (${site.row}, ${site.col}, ${site.len}) ` +
            `is not the site's own src`)
          checked++
        }
      }
    }
    // A silent zero would pass vacuously, exactly as the documentation
    // extractor could.
    Assert.ok(40 < checked, `only ${checked} spans checked`)
  })

  test('the-span-is-verifiable-against-the-document', () => {
    // The reason `src` is carried and not just `len`: a consumer can
    // check that the span still describes what it is about to replace.
    const site = siteOfFirstDataFinding()
    const line = DATA.split('\n')[site.row - 1]
    Assert.equal(line.substr(site.col - 1, site.len), site.src)
  })

})


describe('vet-verdicts', () => {

  test('valid-data-is-valid', () => {
    const r = vet(SCHEMA, 'service: { name: "auth", port: 8080 }')
    Assert.equal(r.verdict, 'valid')
    Assert.equal(r.truncated, false)
    Assert.deepEqual(r.findings, [])
  })


  test('contradiction-is-invalid', () => {
    const r = vet(SCHEMA, 'service: { name: "auth", port: "8080" }')
    Assert.equal(r.verdict, 'invalid')
    Assert.equal(r.findings.length, 1)
    Assert.equal(r.findings[0].code, 'no_scalar_unify')
    Assert.equal(r.findings[0].class, 'conflict')
    Assert.equal(r.findings[0].path, '$.service.port')
  })


  // The two negative verdicts are the mechanical answer to error.tsv's
  // conflation: a contradiction can never be satisfied, incompleteness
  // merely is not satisfied YET.
  test('residue-is-incomplete-not-invalid', () => {
    const r = vet(SCHEMA, 'service: { name: "auth" }')
    Assert.equal(r.verdict, 'incomplete')
    Assert.equal(r.findings.length, 1)
    Assert.equal(r.findings[0].class, 'incomplete')
    Assert.equal(r.findings[0].path, '$.service.port')
  })


  test('partial-opts-out-of-strict', () => {
    const r = vet(SCHEMA, 'service: { name: "auth" }', { partial: true })
    Assert.equal(r.verdict, 'valid')
    // The finding is still REPORTED — `--partial` changes the verdict,
    // not what the caller is told.
    Assert.equal(r.findings.length, 1)
  })


  test('contradiction-outranks-residue', () => {
    const r = vet(SCHEMA, 'service: { name: 1 }')
    Assert.equal(r.verdict, 'invalid')
  })


  // A broken schema is never blamed on the data — verdict `error`, not
  // `invalid` — and it is not a bare verdict either: the finding says
  // what did not stand up and where, and BOTH sites name the schema.
  // The sites are the failure's OPERANDS, which the provenance walk
  // reaches only because it descends into a nil (ts/src/walk.ts);
  // without that the report named no file at all.
  test('broken-schema-is-never-blamed-on-data', () => {
    const r = vet('a: 1\na: 2', 'a: 1')
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.findings.length, 1)
    const f = r.findings[0]
    Assert.equal(f.code, 'scalar_value')
    Assert.equal(f.class, 'conflict')
    Assert.equal(f.path, '$.a')
    Assert.equal(f.sites.length, 2)
    for (const site of f.sites) {
      Assert.equal(site.role, 'schema')
      Assert.equal(site.file, 'schema')
    }
    // Source order, and the columns are the SCALARS'.
    Assert.equal(f.sites[0].row, 2)
    Assert.equal(f.sites[0].col, 4)
    Assert.equal(f.sites[1].row, 1)
    Assert.equal(f.sites[1].col, 4)
  })


  // A data document that will not parse is the DATA's fault: `invalid`
  // with a finding carrying the parser's own code, not `error`, which
  // is the schema's verdict. The engine already answered it this way
  // one character earlier — a refused CONSTRUCT reaches the tree as an
  // ordinary nil (see an-operandless-nil-reports-about-itself).
  test('unparseable-data-is-invalid-not-an-error-verdict', () => {
    const r = vet(SCHEMA, 'a: ]')
    Assert.equal(r.verdict, 'invalid')
    Assert.equal(r.findings.length, 1)
    const f = r.findings[0]
    Assert.equal(f.code, 'syntax')
    Assert.equal(f.class, 'parse')
    Assert.equal(f.path, '$')
    Assert.equal(f.sites.length, 1)
    Assert.equal(f.sites[0].role, 'data')
    Assert.equal(f.sites[0].value, 'nil')
    // No terminal escapes in a machine-readable report: the parser
    // colours its own marker, and this is the one finding family whose
    // text comes from there.
    Assert.ok(!f.message.includes('\u001b'))
    Assert.ok(f.message.startsWith('[aontu/'))
  })


  // A merge marker is refused before the parse, and it knows WHERE.
  test('a-conflict-marker-in-data-is-a-located-finding', () => {
    const r = vet(SCHEMA, 'a: 1\n<<<<<<< HEAD\nb: 2')
    Assert.equal(r.verdict, 'invalid')
    Assert.equal(r.findings[0].code, 'merge_conflict')
    Assert.equal(r.findings[0].sites[0].row, 2)
    Assert.equal(r.findings[0].sites[0].col, 1)
  })


  // The SCHEMA side keeps the error verdict: exit 4 means the run
  // could not be set up from the truth's side, and nothing else. It
  // reports through the same projection unparseable data does, with
  // the role and the verdict as the only difference.
  test('unparseable-schema-is-still-an-error-verdict', () => {
    const r = vet('a: ]', 'a: 1')
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.findings.length, 1)
    const f = r.findings[0]
    Assert.equal(f.code, 'syntax')
    Assert.equal(f.class, 'parse')
    Assert.equal(f.path, '$')
    Assert.equal(f.sites.length, 1)
    Assert.equal(f.sites[0].role, 'schema')
    Assert.equal(f.sites[0].file, 'schema')
  })


  // And a merge marker in the schema knows where it is, exactly as one
  // in the data does.
  test('a-conflict-marker-in-the-schema-is-a-located-finding', () => {
    const r = vet('a: 1\n<<<<<<< HEAD\nb: 2', 'a: 1')
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.findings[0].code, 'merge_conflict')
    Assert.equal(r.findings[0].sites[0].row, 2)
    Assert.equal(r.findings[0].sites[0].col, 1)
  })
})


describe('vet-findings', () => {

  test('sites-are-role-tagged-data-first', () => {
    const r = vet(SCHEMA, 'service: { name: "auth", port: "8080" }',
      { schemaUrl: 'service.aon', dataUrl: 'deploy.json' })
    const sites = r.findings[0].sites
    Assert.equal(sites.length, 2)
    Assert.equal(sites[0].role, 'data')
    Assert.equal(sites[0].file, 'deploy.json')
    Assert.equal(sites[0].value, '"8080"')
    Assert.equal(sites[1].role, 'schema')
    Assert.equal(sites[1].file, 'service.aon')
    Assert.equal(sites[1].value, 'integer')
    Assert.ok(0 < sites[0].row)
    Assert.ok(0 < sites[0].col)
  })


  test('closed-key-finding-carries-one-site', () => {
    const r = vet('service: close({ name: string })',
      'service: { name: "auth", prot: 8080 }')
    Assert.equal(r.verdict, 'invalid')
    const f = r.findings.find((f: any) => 'closed' === f.code)
    Assert.ok(null != f)
    Assert.equal(f.path, '$.service.prot')
    Assert.equal(f.sites.length, 1)
    Assert.equal(f.sites[0].role, 'data')
  })


  // G1's atoms already attach the normalised residual and the offending
  // value; vet reads them where they are rather than re-deriving them.
  test('constraint-finding-carries-expected-and-actual', () => {
    const r = vet('service: { port: integer & min(1024) }',
      'service: { port: 80 }')
    const f = r.findings[0]
    Assert.equal(f.code, 'constraint')
    Assert.equal(f.expected, 'integer&min(1024)')
    Assert.equal(f.actual, '80')
    Assert.equal(f.note, undefined)
  })


  test('must-finding-carries-the-author-message-as-note', () => {
    const r = vet('service: { tier: must("gold"|"silver","tier must be supported") }',
      'service: { tier: "lead" }')
    const f = r.findings[0]
    Assert.equal(f.code, 'must')
    Assert.equal(f.note, 'tier must be supported')
    Assert.equal(f.expected, '"gold"|"silver"')
    Assert.equal(f.actual, '"lead"')
  })


  // A nil built during the PARSE of a document has no operands and
  // never passes through the unify error path, so both of its report
  // fields have to be filled in by vet itself: the site (about the nil
  // itself) and the message (materialised on demand).
  test('an-operandless-nil-reports-about-itself', () => {
    const r = vet('a: integer', 'a: 9007199254740993')
    Assert.equal(r.verdict, 'invalid')
    const f = r.findings[0]
    Assert.equal(f.code, 'lossy_integer_literal')
    Assert.equal(f.sites.length, 1)
    Assert.equal(f.sites[0].role, 'data')
    Assert.equal(f.sites[0].value, 'nil')
    Assert.ok(f.message.startsWith('[aontu/lossy_integer_literal]'))
  })


  // The incomplete half of a report comes from the generate check,
  // which never renders its own text: without materialisation these
  // findings carried an empty message while the conflicts carried a
  // headline.
  test('an-incomplete-finding-carries-its-message', () => {
    const r = vet(SCHEMA, 'service: { name: "auth" }')
    Assert.equal(r.findings[0].message,
      '[aontu/mapval_no_gen]: Cannot resolve value at path $.service.port')
  })


  test('message-is-the-headline-only', () => {
    const r = vet(SCHEMA, 'service: { name: "auth", port: "8080" }')
    Assert.ok(r.findings[0].message.startsWith('[aontu/no_scalar_unify]'))
    Assert.ok(!r.findings[0].message.includes('\n'))
  })


  // A key may contain any character, so no punctuation is safe as a
  // path separator; the path is carried whole and never re-parsed.
  test('paths-are-not-delimiter-safe', () => {
    const r = vet('"a b": integer', '"a b": "x"')
    Assert.equal(r.findings[0].path, '$.a b')
  })


  test('root-conflict-reports-the-root-path', () => {
    const r = vet('1', '2')
    Assert.equal(r.verdict, 'invalid')
    Assert.equal(r.findings[0].path, '$')
  })


  // The spread constraint lives off-peg, so this is only reachable by
  // following it — but note WHERE the finding lands: the path is the
  // TEMPLATE's, not the instance's, because the conflict nil is created
  // against the template node. The data site still points at the
  // offending value, which is what a repair loop needs; naming the
  // instance path is a phase-3 report concern, recorded in the register.
  test('conflict-inside-a-spread-template-is-found', () => {
    const r = vet('services: &: { port: integer }',
      'services: { auth: { port: "80" } }')
    Assert.equal(r.verdict, 'invalid')
    Assert.equal(r.findings[0].path, '$.services.port')
    Assert.equal(r.findings[0].sites[0].role, 'data')
    Assert.equal(r.findings[0].sites[0].value, '"80"')
  })
})


describe('vet-ordering-and-limits', () => {

  // Two independent conflicts DO collect in one pass, so ordering is
  // observable without waiting for phase 6.
  test('findings-are-sorted-by-data-site-then-code', () => {
    const r = vet('a: integer\nb: integer\nc: integer',
      'c: "z"\na: "x"\nb: "y"')
    Assert.equal(r.findings.length, 3)
    const rows = r.findings.map((f: any) => f.sites[0].row)
    Assert.deepEqual(rows, [...rows].sort((x, y) => x - y))
  })


  test('findings-with-the-same-site-order-by-code', () => {
    const r = vet('a: integer\nb: integer', 'a: "x"\nb: "y"')
    const codes = r.findings.map((f: any) => f.code)
    Assert.deepEqual(codes, [...codes].sort())
  })


  test('max-errors-caps-and-marks-truncated', () => {
    const r = vet('a: integer\nb: integer\nc: integer',
      'a: "x"\nb: "y"\nc: "z"', { maxErrors: 2 })
    Assert.equal(r.findings.length, 2)
    Assert.equal(r.truncated, true)
  })


  test('an-uncapped-report-is-not-truncated', () => {
    const r = vet('a: integer\nb: integer', 'a: "x"\nb: "y"')
    Assert.equal(r.truncated, false)
  })
})


describe('vet-anchor', () => {

  test('at-selects-a-subtree', () => {
    const schema = 'services: { auth: { port: integer } }\nother: { junk: string }'
    const r = vet(schema, 'auth: { port: 8080 }', { at: '$.services' })
    Assert.equal(r.verdict, 'valid')
  })


  test('at-accepts-a-bare-path', () => {
    const schema = 'services: { auth: { port: integer } }'
    const r = vet(schema, 'auth: { port: "x" }', { at: 'services' })
    Assert.equal(r.verdict, 'invalid')
  })


  test('at-root-is-the-whole-schema', () => {
    const r = vet(SCHEMA, 'service: { name: "auth", port: 8080 }', { at: '$' })
    Assert.equal(r.verdict, 'valid')
  })


  // …AND IT SAYS WHICH SEGMENT. The verdict alone left a caller
  // holding exit 4 and an empty finding list, which is nothing to act
  // on; the refusal is the one `get` and `why` already give for a path
  // that names nothing, "did you mean" included.
  test('an-anchor-that-does-not-exist-is-an-error-verdict', () => {
    const r = vet(SCHEMA, 'a: 1', { at: '$.nope' })
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.findings.length, 1)
    const f = r.findings[0]
    Assert.equal(f.code, 'no_path')
    Assert.equal(f.class, 'reference')
    Assert.equal(f.path, '$.nope')
    Assert.deepEqual(f.sites, [])
  })


  test('an-anchor-refusal-suggests-the-nearest-key', () => {
    const r = vet(SCHEMA, 'a: 1', { at: '$.servce' })
    Assert.equal(r.findings[0].note, 'did you mean service?')
  })


  // An anchor is a STRUCTURAL path: map keys and list indices. Reading
  // it off whatever a value's peg held walked into a junction's
  // branches, a constraint's own arguments and an array's `length` —
  // the last handing back a JavaScript number, after which everything
  // validated.
  test('an-anchor-descends-only-through-bags', () => {
    Assert.equal(vet('a: 1|2', '1', { at: '$.a.0' }).verdict, 'error')
    Assert.equal(vet('a: min(2)', '3', { at: '$.a.0' }).verdict, 'error')
    Assert.equal(vet('a: [1,2]', '9', { at: '$.a.length' }).verdict, 'error')
    Assert.equal(vet('a: *1', '9', { at: '$.a.peg' }).verdict, 'error')
    // The two that DO descend still do.
    Assert.equal(vet('a: { b: integer }', '1', { at: '$.a.b' }).verdict, 'valid')
    Assert.equal(vet('a: [integer]', '1', { at: '$.a.0' }).verdict, 'valid')
  })


  test('an-anchor-through-a-scalar-is-an-error-verdict', () => {
    const r = vet('a: 1', 'x: 1', { at: '$.a.b' })
    Assert.equal(r.verdict, 'error')
  })


  // `--closed` closes the ANCHOR, so a surplus key is only refused at
  // the level the run is anchored on: an unanchored run closes the
  // root, which says nothing about keys nested below it.
  test('closed-closes-the-anchor-for-this-run', () => {
    const open = vet('service: { name: string }',
      'service: { name: "auth" }\nextra: 1')
    Assert.equal(open.verdict, 'valid')

    const shut = vet('service: { name: string }',
      'service: { name: "auth" }\nextra: 1', { closed: true })
    Assert.equal(shut.verdict, 'invalid')
  })


  test('closed-applies-to-the-selected-anchor', () => {
    const open = vet('service: { name: string }',
      'name: "auth"\nextra: 1', { at: '$.service' })
    Assert.equal(open.verdict, 'valid')

    const shut = vet('service: { name: string }',
      'name: "auth"\nextra: 1', { at: '$.service', closed: true })
    Assert.equal(shut.verdict, 'invalid')
  })


  // A scalar anchor has no keys to close, so the flag is inert rather
  // than an error.
  test('closed-on-a-scalar-anchor-is-inert', () => {
    const r = vet('a: integer', '1', { at: '$.a', closed: true })
    Assert.equal(r.verdict, 'valid')
  })
})


describe('vet-api', () => {

  // The package entry is what a consumer requires, so the re-export is
  // part of the contract rather than a convenience.
  test('vet-is-exported-from-the-package-entry', () => {
    Assert.equal(typeof vetFromPackage, 'function')
    const r = vetFromPackage('a: integer', 'a: 1')
    Assert.equal(r.verdict, 'valid')
  })


  // `schemaPath` and `dataPath` are the two documents' OWN bases: a
  // relative `@"file"` load inside either resolves from the directory
  // holding it, not from the process working directory -- which is
  // neither document's home, and may hold a same-named decoy. The two
  // paths are separate because the documents need not live together.
  test('each-document-resolves-its-own-includes', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-base-'))
    Fs.writeFileSync(Path.join(dir, 'part.aon'), 'port: integer')

    // The document is passed as TEXT and its path only says where it
    // came from -- but the loader resolves the base against a real
    // directory, so the file has to be there, which for every caller
    // that read the text out of it already is.
    const src = '@"part.aon"\nname: string'
    const data = 'name: "auth"\nport: 8080'
    const schemaPath = Path.join(dir, 'schema.aon')
    Fs.writeFileSync(schemaPath, src)
    Assert.equal(vet(src, data, { schemaPath }).verdict, 'valid')

    // Without the base the include is looked for beside the test
    // process instead, where there is no part.aon: a schema that will
    // not stand up is an `error` verdict, never the data's fault.
    Assert.equal(vet(src, data).verdict, 'error')
  })


  // EVERY SITE NAMES THE FILE WHOSE TEXT IT EXCERPTS (the review's
  // finding F, use-cases/BUGS.md §25). Vet stamped the ENTRY document's
  // name over every value of both trees, so a constraint written in an
  // included library was reported at the entry file, with the LIBRARY's
  // row and column -- a line the entry may not even have. A repair
  // agent that follows the site edits the wrong file. Twin:
  // TestVetSiteNamesTheIncludedFile in go/vet_test.go.
  test('a-site-names-the-file-its-text-lives-in', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-site-'))
    Fs.mkdirSync(Path.join(dir, 'lib'))
    const lib = Path.join(dir, 'lib', 'types.aon')
    Fs.writeFileSync(lib, 'Port: integer & min(1024)\n')
    const schemaPath = Path.join(dir, 'schema.aon')
    const src = '@"lib/types.aon"\nsvc: { port: $.Port }\n'
    Fs.writeFileSync(schemaPath, src)
    const dataPath = Path.join(dir, 'data.json')
    const data = '{"svc":{"port":80}}\n'
    Fs.writeFileSync(dataPath, data)

    const r = vet(src, data, {
      schemaPath, dataPath, schemaUrl: schemaPath, dataUrl: dataPath,
    } as any)
    Assert.equal(r.verdict, 'invalid')

    const schemaSite = r.findings[0].sites.find((s) => 'schema' === s.role)
    Assert.ok(null != schemaSite, JSON.stringify(r.findings[0]))
    // The library, not the entry -- and the row is a row THAT FILE has.
    Assert.equal(schemaSite!.file, lib)
    Assert.equal(schemaSite!.row, 1)

    // The data site still reads as data, and still names the data file:
    // the role is decided by which document a url belongs to, not by a
    // name comparison against one entry.
    const dataSite = r.findings[0].sites.find((s) => 'data' === s.role)
    Assert.ok(null != dataSite, JSON.stringify(r.findings[0]))
    Assert.equal(dataSite!.file, dataPath)
  })


  // An INCLUDED DATA file is still data. The role used to be a string
  // comparison against the data entry's name, so a value read through
  // an include of the data document would have read `schema` the
  // moment its site named the file it really came from.
  test('an-included-data-file-is-still-data', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-drole-'))
    const part = Path.join(dir, 'part.aon')
    Fs.writeFileSync(part, 'port: "80"\n')
    const dataPath = Path.join(dir, 'data.aon')
    const data = '@"part.aon"\n'
    Fs.writeFileSync(dataPath, data)

    const r = vet('port: integer', data, {
      dataPath, dataUrl: dataPath, schemaUrl: 'schema',
    } as any)
    Assert.equal(r.verdict, 'invalid')
    const site = r.findings[0].sites.find((s) => s.file === part)
    Assert.ok(null != site, JSON.stringify(r.findings[0]))
    Assert.equal(site!.role, 'data')
  })
})


describe('vet-containers', () => {

  // A list peg is an array, a map peg an object: the walk has to follow
  // both, and only a list conflict exercises the array arm.
  test('conflict-inside-a-list-is-found', () => {
    const r = vet('a: [integer]', 'a: ["x"]')
    Assert.equal(r.verdict, 'invalid')
    Assert.equal(r.findings[0].path, '$.a.0')
  })


  test('nested-list-conflicts-are-all-reported', () => {
    const r = vet('a: [integer, integer]', 'a: ["x", "y"]')
    Assert.equal(r.findings.length, 2)
  })
})


describe('vet-hint', () => {

  // THE REPAIR, NOT JUST THE DIAGNOSIS (the review's finding F). The
  // message is the headline and nothing else -- that is what makes it
  // one line and comparable -- so everything the engine knows about
  // how to FIX the failure reached a terminal reader in the frames and
  // a machine reader not at all. The Go twin is TestVetFindingCarries
  // TheHint.
  test('a-finding-carries-the-repair-hint', () => {
    // The clearest case in the language: the literal is refused
    // BECAUSE binary64 would round it, and the fix is a one-character
    // prefix the reader has no way to guess from the headline.
    const r = vet('port: integer', 'port: 9007199254740993')
    Assert.equal(r.verdict, 'invalid')

    const f = r.findings[0]
    Assert.equal(f.code, 'lossy_integer_literal')
    Assert.equal(f.message.includes('\n'), false, 'headline is still one line')

    const hint = f.hint as string
    Assert.ok(null != hint, 'no hint on ' + JSON.stringify(f))
    Assert.ok(hint.includes('0d'), 'hint does not name the escape:\n' + hint)
    Assert.ok(hint.includes('\n'), 'hint was truncated to one line:\n' + hint)
    // Trailing whitespace was spacing for the frame that used to
    // follow the hint; the deliberate blank lines inside it are
    // `\n \n` and must survive.
    Assert.equal(hint, hint.replace(/\s+$/, ''))
    Assert.ok(hint.includes('\n \n'), 'hint lost its internal spacing')
  })


  // Not every code has one, and an absent hint is ABSENT rather than
  // empty: a consumer testing `null != finding.hint` must not have to
  // also test for ''.
  test('a-code-with-no-hint-text-carries-no-hint', () => {
    const r = vet(
      'a: *5 | string\nb: string',
      'b: "x"')
    const lint = r.findings.find((f) => 'pref_not_instance' === f.code)
    Assert.ok(null != lint, JSON.stringify(r.findings))
    Assert.equal('hint' in (lint as any), false, JSON.stringify(lint))
  })
})


describe('vet-display-file', () => {

  // A FILE THE READER CAN OPEN (the review's finding F). The parser
  // resolves an include to an absolute path -- the right identity (two
  // documents loading one library by different spellings are one file)
  // and the wrong name -- so a site prints it as the entry's own
  // spelling reaches it. Without this a report could not be uploaded as
  // SARIF, diffed between machines, or read beside the command that
  // produced it. The Go twin is
  // TestDisplayFileNamesTheIncludeAsTheEntryReachesIt.
  test('an-included-file-is-named-as-the-entry-reaches-it', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-name-'))
    Fs.mkdirSync(Path.join(dir, 'lib'))
    Fs.writeFileSync(Path.join(dir, 'lib', 'types.aon'), 'Port: integer\n')
    const schema = '@"lib/types.aon"\nsvc: { port: $.Port }\n'
    const schemaPath = Path.join(dir, 'schema.aon')
    Fs.writeFileSync(schemaPath, schema)

    // The caller reached the entry by a BARE name, so the include is
    // named beside it -- not by an absolute path naming a directory the
    // caller never typed.
    const bare = vet(schema, 'svc: { port: "80" }', {
      schemaPath, schemaUrl: 'schema.aon', dataUrl: 'data.json',
    } as any)
    const site = bare.findings[0].sites.find((s) => 'schema' === s.role)
    Assert.equal(site?.file, Path.join('lib', 'types.aon'))

    // Reached through a directory, the include is named through the
    // same one, so both are openable from the caller's cwd.
    const nested = vet(schema, 'svc: { port: "80" }', {
      schemaPath, schemaUrl: Path.join('a', 'b', 'schema.aon'),
      dataUrl: 'data.json',
    } as any)
    Assert.equal(
      nested.findings[0].sites.find((s) => 'schema' === s.role)?.file,
      Path.join('a', 'b', 'lib', 'types.aon'))

    // An ABSOLUTE entry keeps absolute includes: the caller asked for
    // absolute names by giving one.
    const abs = vet(schema, 'svc: { port: "80" }', {
      schemaPath, schemaUrl: schemaPath, dataUrl: 'data.json',
    } as any)
    Assert.equal(
      abs.findings[0].sites.find((s) => 'schema' === s.role)?.file,
      Path.join(dir, 'lib', 'types.aon'))

    Fs.rmSync(dir, { recursive: true, force: true })
  })


  // The naming rule itself, at the arms a two-document run cannot
  // reach: a caller who passed no path, a url that is not a path, and
  // a document's own name.
  test('a-name-with-no-base-to-relativise-against-is-left-alone', () => {
    // A REAL absolute path, from the OS rather than assembled: on
    // Windows a rooted path is not an absolute one without its drive
    // letter, so an assembled `\w\proj\lib.aon` would exercise a
    // different arm of the rule there than here. The Go twin says the
    // same, and learned it from a Windows CI run.
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-name2-'))
    const abs = Path.join(dir, 'lib.aon')
    const entry = Path.join(dir, 'entry.aon')

    // The document's OWN url is never rewritten -- it is already the
    // name the caller used.
    Assert.equal(displayFile('entry.aon', 'entry.aon', 'x/entry.aon'),
      'entry.aon')
    // Neither is the default label of a caller who named no file...
    Assert.equal(displayFile('data', 'data', undefined), 'data')
    // ... nor an absolute include with no base to measure from ...
    Assert.equal(displayFile(abs, 'entry.aon', undefined), abs)
    // ... nor an empty url, nor one that is already relative.
    Assert.equal(displayFile('', 'entry.aon', 'x/entry.aon'), '')
    Assert.equal(displayFile('rel.aon', 'entry.aon', 'x/entry.aon'), 'rel.aon')

    // And the two that DO rewrite, stated here as well because the
    // Go twin states them: bare beside bare, nested through nested.
    Assert.equal(displayFile(abs, 'entry.aon', entry), 'lib.aon')
    Assert.equal(
      displayFile(abs, Path.join('a', 'b', 'entry.aon'), entry),
      Path.join('a', 'b', 'lib.aon'))

    Fs.rmSync(dir, { recursive: true, force: true })
  })
})


describe('verb-errors', () => {

  // AN `error` VERDICT SAYS WHY (the review's finding F). Both
  // single-document verbs used to answer an unusable document with an
  // empty report, which is the one answer a repair loop cannot act on.
  // The Go twin is TestSingleDocumentVerbsReportWhy.
  test('trim-and-relations-report-why-they-could-not-run', () => {
    // A document that PARSES and then contradicts itself: the finding
    // is the engine's own, with both operands sited.
    const t = trimCheck('a:1 a:2')
    Assert.equal(t.verdict, 'error')
    Assert.equal(t.errors?.length, 1)
    Assert.equal(t.errors?.[0].code, 'scalar_value')
    Assert.equal(t.errors?.[0].path, '$.a')
    Assert.equal(t.errors?.[0].sites.length, 2)

    // A document that does not PARSE takes the other arm, and lands in
    // the same shape: one located parse-class finding.
    const tp = trimCheck('a:]')
    Assert.equal(tp.verdict, 'error')
    Assert.equal(tp.errors?.[0].class, 'parse')

    // Relations, both arms. `findings` stays the GRAPH's vocabulary --
    // a document with no graph has no graph findings -- and the reason
    // rides `errors`.
    const r = relationCheck('a:1 a:2')
    Assert.equal(r.verdict, 'error')
    Assert.deepEqual(r.findings, [])
    Assert.equal(r.errors?.[0].code, 'scalar_value')

    const rp = relationCheck('a:]')
    Assert.equal(rp.verdict, 'error')
    Assert.deepEqual(rp.findings, [])
    Assert.equal(rp.errors?.[0].class, 'parse')

    // A run that STANDS UP carries no `errors` key at all: an absent
    // field, not an empty list, so a consumer's presence check is the
    // whole test.
    Assert.equal('errors' in trimCheck('a:1'), false)
    Assert.equal('errors' in relationCheck('a:1'), false)
  })
})
