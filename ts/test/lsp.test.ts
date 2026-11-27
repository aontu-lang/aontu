/* Copyright (c) 2025 Richard Rodger, MIT License */

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import {
  computeDiagnostics,
  computeHover,
  computeDefinition,
  contributionsMarkdown,
  computeCompletions,
  uriToPath,
  LspHandler,
  BUILTIN_FUNCS,
  SEVERITY_ERROR,
  COMPLETION_FUNCTION,
  COMPLETION_VARIABLE,
  COMPLETION_KEYWORD,
  computeFormatting,
  computePathAt,
  computeSitesOf,
  computeSymbols,
  computeReferences,
  computeHighlights,
  HIGHLIGHT_READ,
  HIGHLIGHT_WRITE,
  computePathDefinition,
  pathToUri,
  COMPLETION_FIELD,
} from '../dist/lsp'
import { srcPath } from './srcpath'
import { IntegerVal } from '../dist/val/IntegerVal'
import { hitsOf, keySpan, mapAt, symbolTree } from '../dist/cursor'


import { aliasScope } from '../dist/alias'

import { FrameCodec } from '../dist/lsp-server'


describe('lsp-diagnostics', () => {

  test('valid-documents-have-no-diagnostics', () => {
    for (const src of [
      'a:1 b:2',
      'a:string',            // non-concrete schema is valid
      'a:{b:string, c:1}',   // nested schema
      'a:1\nb:$.a',          // resolving reference
      'x:{a:1} & {b:2}',     // map merge
    ]) {
      Assert.equal(computeDiagnostics(src).length, 0, src)
    }
  })

  test('conflict-position', () => {
    const d = computeDiagnostics('a:1\na:2')
    Assert.equal(d.length, 1)
    Assert.equal(d[0].severity, SEVERITY_ERROR)
    Assert.equal(d[0].code, 'scalar_value')
    Assert.equal(d[0].source, 'aontu')
    Assert.deepEqual(d[0].range.start, { line: 1, character: 2 })
    Assert.match(d[0].message, /Cannot unify value/)
  })

  // The same text as Go's server: the detail line and the hint, plain,
  // with no colour escapes and no source frame.
  test('message-is-plain-text', () => {
    const d = computeDiagnostics('a: 1\nmode: "a" & "b"')
    Assert.equal(d.length, 1)
    Assert.equal(d[0].message,
      'Cannot unify value: "b" with value: "a"\n'
      + 'Literal scalar values of the same kind can only unify if they are\n'
      + 'exactly equal.\n \nExamples:\n'
      + '  1 & 1   -> 1    # Does unify (equal Integers);\n'
      + '  a & a   -> a    # Does unify (equal Strings);\n'
      + '  1 & 2   -> nil  # Does not unify (unequal Integers);\n'
      + '  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).')
  })

  // Twin: go/lsp/lsp_test.go TestDiagnosticsAliasBudget. The editor
  // unifies on each keystroke, so a ladder too big to expand is turned
  // away here too; evaluating it instead takes tens of seconds.
  test('alias-budget-is-a-diagnostic', () => {
    const ladder = ['%a0 = 1']
    for (let i = 1; i <= 20; i++) {
      ladder.push('%a' + i + ' = [%a' + (i - 1) + ', %a' + (i - 1) + ']')
    }
    ladder.push('out: %a20')

    const started = Date.now()
    const d = computeDiagnostics(ladder.join('\n'))

    Assert.equal(d.length, 1)
    Assert.equal(d[0].code, 'alias_budget')
    Assert.equal(d[0].severity, SEVERITY_ERROR)
    Assert.ok(Date.now() - started < 5000)
  })

  test('unknown-function-position', () => {
    const d = computeDiagnostics('x:foo(1)')
    Assert.equal(d.length, 1)
    Assert.equal(d[0].code, 'unknown_function')
    Assert.deepEqual(d[0].range.start, { line: 0, character: 2 })
  })

  test('no-path-position', () => {
    const d = computeDiagnostics('a:$.missing')
    Assert.equal(d.length, 1)
    Assert.equal(d[0].code, 'no_path')
    Assert.deepEqual(d[0].range.start, { line: 0, character: 2 })
  })

  test('multibyte-column-utf16', () => {
    const d = computeDiagnostics('a:"é"\nb:1 b:2')
    Assert.equal(d.length, 1)
    Assert.deepEqual(d[0].range.start, { line: 1, character: 6 })
  })

})


describe('lsp-hover', () => {

  test('hover-scalar-shows-value-and-kind', () => {
    const h = computeHover('port: 8080', { line: 0, character: 7 })
    Assert.ok(h)
    Assert.match(h!.contents.value, /8080/)
    Assert.match(h!.contents.value, /integer/)
    Assert.deepEqual(h!.range!.start, { line: 0, character: 6 })
    Assert.deepEqual(h!.range!.end, { line: 0, character: 10 })
  })

  test('hover-over-a-literal-whose-canon-is-shorter', () => {
    const src = 'port: 0x1F'
    for (const character of [6, 7, 8, 9]) {
      const h = computeHover(src, { line: 0, character })
      Assert.ok(h, `no hover at column ${character}`)
      Assert.deepEqual(
        [h!.range!.start.character, h!.range!.end.character], [6, 10],
        `column ${character}`)
    }
  })

  test('hover-exact-leaves-show-their-own-kind', () => {
    // The `0d` leaves are their own kinds, not `integer`/`float`, and
    // the hover canon is the normalised one-rendering-per-value form.
    const bi = computeHover('n: 0d5', { line: 0, character: 4 })
    Assert.ok(bi)
    Assert.match(bi!.contents.value, /0d5/)
    Assert.match(bi!.contents.value, /biginteger/)

    const bd = computeHover('n: 0d1e3', { line: 0, character: 4 })
    Assert.ok(bd)
    Assert.match(bd!.contents.value, /0d1000\.0/)
    Assert.match(bd!.contents.value, /bigdecimal/)
  })

  test('hover-type', () => {
    const h = computeHover('a:{x:string}', { line: 0, character: 5 })
    Assert.ok(h)
    Assert.match(h!.contents.value, /string/)
    Assert.match(h!.contents.value, /type/)
  })

  test('hover-resolved-reference', () => {
    // b resolves to 1; hovering the definition shows the resolved value.
    const h = computeHover('a:1\nb:$.a', { line: 0, character: 2 })
    Assert.ok(h)
    Assert.match(h!.contents.value, /1/)
  })

  test('hover-constraint', () => {
    // A constraint residual hovers as its canon with the shared kind
    // label "constraint" — never a constructor-name fallback (the Go
    // twin is TestHoverConstraint; identical hover-text contract).
    const h = computeHover('a:min(0)&max(10)', { line: 0, character: 3 })
    Assert.ok(h)
    Assert.match(h!.contents.value, /min\(0\)&max\(10\)/)
    Assert.match(h!.contents.value, /\*constraint\*/)
  })

  // G12 phase 8: a value's meta() titles and descriptions close its
  // hover, byte-identical to go/lsp/hover_test.go (TestHoverAnnotations).
  test('hover-shows-titles-and-descriptions', () => {
    const one = computeHover(
      'port: meta(8080, {title: "Port", description: "The listen port"})',
      { line: 0, character: 11 })
    Assert.equal(one!.contents.value,
      '```aontu\n8080\n```\n\n*integer*\n\n**Port**\n\nThe listen port')
    const two = computeHover(
      'port: meta(8080, {title: "A"}) & meta(8080, {title: "B"})',
      { line: 0, character: 11 })
    Assert.equal(two!.contents.value,
      '```aontu\n8080\n```\n\n*integer*\n\n**A**\n\n**B**')
  })

  test('hover-miss-returns-null', () => {
    Assert.equal(computeHover('port: 8080', { line: 5, character: 0 }), null)
  })

})


// Twin: go/lsp/lsp_test.go TestAliasHoverAndDefinition.
describe('lsp-alias', () => {
  test('alias-key-declarations-at-every-depth', () => {
    const src = '%port: integer\ntypes: type({%row: {n:string}})\na: %row\nb: %port'
    Assert.deepEqual(computeCompletions(src).filter(c => c.label.startsWith('%')).map(c => c.label),
      ['%port', '%row'])
    Assert.deepEqual(computeDefinition(src, { line: 2, character: 4 }, 'file:///m'), {
      uri: 'file:///m', range: { start: { line: 1, character: 13 }, end: { line: 1, character: 17 } },
    })
    Assert.equal(computeHover(src, { line: 2, character: 4 })?.contents.value,
      '```aontu\ntypes: type({%row: {n:string}})\n```\n\n*alias*')
  })

  const SRC = '%port = integer\n{ %uint8 } = @"./t.aontu"\n\nl: %port\nv: %uint8'

  // A hover marks the USE the cursor is on, not the declaration.
  test('hover-names-the-declaration', () => {
    const h: any = computeHover(SRC, { line: 3, character: 4 })
    Assert.equal(h.contents.value,
      '```aontu\n%port = integer\n```\n\n*alias*')
    Assert.deepEqual(h.range,
      { start: { line: 3, character: 3 }, end: { line: 3, character: 8 } })
  })

  test('hover-names-the-file-a-name-was-taken-from', () => {
    const h: any = computeHover(SRC, { line: 4, character: 4 })
    Assert.equal(h.contents.value,
      '```aontu\n{ %uint8 } = @"./t.aontu"\n```\n\n*alias, taken from ./t.aontu*')
  })

  test('definition-goes-to-where-the-name-is-bound', () => {
    // A local name goes to its own line, a taken one to the pattern.
    Assert.deepEqual(computeDefinition(SRC, { line: 3, character: 4 }, 'file:///m'),
      {
        uri: 'file:///m',
        range: {
          start: { line: 0, character: 0 }, end: { line: 0, character: 5 }
        },
      })
    Assert.deepEqual(computeDefinition(SRC, { line: 4, character: 4 }, 'file:///m'),
      {
        uri: 'file:///m',
        range: {
          start: { line: 1, character: 2 }, end: { line: 1, character: 8 }
        },
      })
  })

  test('a-name-is-not-a-string-and-need-not-be-bound', () => {
    // `%` inside a string is text, so neither answers there.
    const inStr = 'a: "%port"\n%port = integer'
    Assert.equal(computeHover(inStr, { line: 0, character: 5 })?.contents.value
      .includes('*alias*'), false)
    Assert.equal(computeDefinition(inStr, { line: 0, character: 5 }, 'file:///m'),
      null)
    Assert.equal(
      computeDefinition('a: %nope', { line: 0, character: 4 }, 'file:///m'), null)
    Assert.equal(computeDefinition(SRC, { line: 99, character: 0 }, 'file:///m'),
      null)
    Assert.equal(computeDefinition(SRC, { line: 0, character: 8 }, 'file:///m'),
      null)
  })
})


// Twin: go/lsp/lsp_test.go TestAliasScopeIsLexical.
describe('lsp-alias-lexical', () => {
  test('declarations-ignore-strings-and-comments', () => {
    const src = '# %comment: 1\na: "%quoted: 1"\nb: \'%single: 1\'\n/*\n%block: 1\n*/\nc: `%tick: 1`\n// %slash: 1\nx: {%real: 1 %other: 2}\nv: %prefix = 3'
    Assert.deepEqual(aliasScope(src).map(b => b.name), ['%real', '%other', '%prefix'])
  })

  test('what-the-text-binds-and-what-it-does-not', () => {
    // A head that is not a set, the wildcard (whose names are the other
    // file's to say), and an `=` that does not declare.
    Assert.deepEqual(aliasScope('{ a } = @"./f.aontu"'), [])
    Assert.deepEqual(aliasScope('{%} = @"./f.aontu"'), [])
    Assert.deepEqual(aliasScope('%a == 1'), [])
    Assert.deepEqual(aliasScope('  %a = 1'),
      [{ name: '%a', row: 1, col: 3, decl: '%a = 1', from: '' }])
  })

  test('a-percent-is-not-always-a-name', () => {
    // `50%` is text and a quoted run is stepped over whichever quote
    // opened it: the sigil starts a name or nothing.
    Assert.equal(
      computeDefinition('%a = 1\nb: 50%', { line: 1, character: 5 }, 'u'), null)
    Assert.equal(
      computeDefinition("%a = 1\nb: '%a'", { line: 1, character: 4 }, 'u'), null)
    const two = '%a = 1\n%bb = 2\nc: { %a %bb }'
    const d: any = computeDefinition(two, { line: 2, character: 9 }, 'u')
    Assert.equal(d.range.start.line, 1)
  })

  test('definition-through-the-handler', () => {
    const h = new LspHandler()
    h.handle({
      method: 'textDocument/didOpen',
      params: {
        textDocument: { uri: 'file:///a.aontu', text: '%a = 1\nb: %a' }
      },
    })
    const d = h.handle({
      id: 7, method: 'textDocument/definition',
      params: {
        textDocument: { uri: 'file:///a.aontu' },
        position: { line: 1, character: 4 },
      },
    })
    Assert.equal(d[0].result.uri, 'file:///a.aontu')
    Assert.equal(d[0].result.range.start.line, 0)

    const c = h.handle({
      id: 8, method: 'textDocument/completion',
      params: { textDocument: { uri: 'file:///a.aontu' } },
    })
    Assert.ok(c[0].result.some((i: any) => '%a' === i.label))

    // No such document: null rather than a guess.
    Assert.equal(h.handle({
      id: 9, method: 'textDocument/definition', params: {},
    })[0].result, null)
  })
})


describe('lsp-formatting', () => {

  // Twin: go/lsp/lsp_test.go TestFormatting, case for case.
  const CASES: [string, any][] = [
  ["a:1 b: {c:2}", [{"range":{"start":{"line":0,"character":0},"end":{"line":0,"character":12}},"newText":"a: 1\nb: c: 2\n"}]],
  ["a: 1\n", []],
  ["a: ]", null],
  ["a: 1\nb: \"😀\"", [{"range":{"start":{"line":0,"character":0},"end":{"line":1,"character":7}},"newText":"a: 1\nb: \"😀\"\n"}]],
  ["x: {\n  y: 1\n}\n", [{"range":{"start":{"line":0,"character":0},"end":{"line":3,"character":0}},"newText":"x: y: 1\n"}]]
]

  test('formatting-is-what-fmt-writes', () => {
    for (const [text, want] of CASES) {
      Assert.deepEqual(computeFormatting(text), want, JSON.stringify(text))
    }
  })

  test('formatting-through-the-handler', () => {
    const h = new LspHandler()
    Assert.equal(h.handle({ id: 1, method: 'initialize', params: {} })[0]
      .result.capabilities.documentFormattingProvider, true)
    h.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///f.aontu', text: 'a:1' } },
    })
    const r = h.handle({
      id: 2, method: 'textDocument/formatting',
      params: { textDocument: { uri: 'file:///f.aontu' } },
    })
    Assert.equal(r[0].result[0].newText, 'a: 1\n')
    Assert.equal(h.handle({
      id: 3, method: 'textDocument/formatting', params: {},
    })[0].result, null)
  })
})


describe('lsp-completion', () => {

  test('completion-list', () => {
    const c = computeCompletions('')
    Assert.equal(c.length, 90)
    const byLabel = new Map(c.map(i => [i.label, i]))
    Assert.equal(byLabel.get('upper')?.kind, COMPLETION_FUNCTION)
    Assert.equal(byLabel.get('string')?.kind, COMPLETION_KEYWORD)
    Assert.equal(byLabel.get('biginteger')?.kind, COMPLETION_KEYWORD)
    for (const want of
      ['close', 'upper', 'path', 'string', 'integer', 'float',
        'biginteger', 'bigdecimal', 'true', 'null', 'any', 'map', 'list',
        'constraint']) {
      Assert.ok(byLabel.has(want), 'missing ' + want)
    }
  })

  test('completion-detail-is-the-signature', () => {
    // The detail column renders from the registry
    // (sketch/SIGNATURES.0.md): the declaration, not a label.
    const c = computeCompletions('')
    const byLabel = new Map(c.map(i => [i.label, i]))
    Assert.equal(byLabel.get('upper')?.detail,
      'upper(s: string|number, start?: integer|biginteger, len?: integer|biginteger) : string')
    Assert.equal(byLabel.get('pack')?.detail, 'pack(d: map|list, template t: any) : map')
    Assert.equal(byLabel.get('path')?.detail, 'path(capture p?: path) : path')
  })

  // Twin: go/lsp/lsp_test.go TestCompletionOffersTheNamesInScope.
  test('completion-offers-the-names-in-scope', () => {
    const src = '%port = integer\n{ %uint8, %b: %remote } = @"./types.aontu"\n'
    const named = computeCompletions(src).filter(i => i.label.startsWith('%'))

    // A rename binds the LOCAL name: `%b`, not the `%remote` it takes.
    Assert.deepEqual(named, [
      { label: '%port', kind: COMPLETION_VARIABLE, detail: 'alias' },
      {
        label: '%uint8', kind: COMPLETION_VARIABLE,
        detail: 'alias from ./types.aontu'
      },
      {
        label: '%b', kind: COMPLETION_VARIABLE,
        detail: 'alias from ./types.aontu'
      },
    ])

    // A name that binds more than once is offered once.
    Assert.equal(computeCompletions('%n = 1\n%n = integer\n')
      .filter(i => i.label.startsWith('%')).length, 1)

    // The set is what the file binds, so a use alone offers nothing.
    Assert.equal(computeCompletions('a: %undeclared\n')
      .filter(i => i.label.startsWith('%')).length, 0)
  })

  // Twin: go/lsp/lsp_test.go TestCompletionOffersTheKeysAndMembersAtTheCursor.
  test('completion-offers-the-keys-and-members-at-the-cursor', () => {
    const S = 'S: type({ port: integer, "a b": string, tier?: string })\n'
    Assert.deepStrictEqual(
      computeCompletions(S + 'api: $.S & { port: 1,  }\n', { line: 1, character: 22 }), [
        { label: 'a b', kind: COMPLETION_FIELD, detail: 'string', insertText: '"a b"' },
        { label: 'tier', kind: COMPLETION_FIELD, detail: 'string (optional)' },
      ])
    Assert.deepStrictEqual(
      computeCompletions('xs: [10]\ny: $.xs.\n', { line: 1, character: 8 }, { trigger: '.' }),
      [{ label: '0', kind: COMPLETION_FIELD, detail: '10' }])

    // A path that holds nothing offers nothing, not the general list.
    Assert.deepStrictEqual(
      computeCompletions('y: $.zz.\n', { line: 0, character: 8 }), [])
    // Where nothing is declared, the general list stands.
    const plain = 'a: { b: 1,  }\n'
    Assert.deepStrictEqual(computeCompletions(plain, { line: 0, character: 11 }),
      computeCompletions(plain))
    // A dot that begins no path offers nothing.
    Assert.deepStrictEqual(
      computeCompletions('x: 1.\n', { line: 0, character: 5 }, { trigger: '.' }), [])
  })

  test('completion-writes-a-key-as-it-reads-where-it-goes', () => {
    const inserts = (src: string, at: { line: number, character: number }) => Object.fromEntries(
      computeCompletions(src, at).map((i) => [i.label, i.insertText]))
    const keys = 'a: { "true": 1, _: 2, nil: 3, ok: 4, "x\\ny": 5, "q\\"r": 6 }\n'
    // After a dot, a segment the lexer reads as a value takes quotes too.
    Assert.deepStrictEqual(inserts(keys + 'x: $.a.\n', { line: 1, character: 7 }), {
      _: '"_"', nil: '"nil"', ok: undefined, 'q"r': '"q\\"r"', true: '"true"', 'x\ny': '"x\\ny"',
    })
    const T = 'T: type({ true: integer, _: string, "x\\ny": string })\n'
    Assert.deepStrictEqual(inserts(T + 'v: $.T & {  }\n', { line: 1, character: 11 }), {
      _: undefined, true: undefined, 'x\ny': '"x\\ny"',
    })
  })

  test('completion-through-the-handler', () => {
    const h = new LspHandler()
    const init = h.handle({ id: 1, method: 'initialize', params: {} })
    Assert.deepStrictEqual(init[0].result.capabilities.completionProvider,
      { triggerCharacters: ['.'] })
    h.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///c.aontu', text: 'a: { b: 1 }\nx: $.a.\n' } },
    })
    const ask = (params: any) => h.handle({
      id: 2, method: 'textDocument/completion',
      params: { textDocument: { uri: 'file:///c.aontu' }, ...params },
    })[0].result
    Assert.deepStrictEqual(ask({
      position: { line: 1, character: 7 }, context: { triggerKind: 2, triggerCharacter: '.' },
    }).map((i: any) => i.label), ['b'])
    Assert.equal(ask({}).length, computeCompletions('').length)
    Assert.deepStrictEqual(ask({ context: { triggerKind: 2, triggerCharacter: '.' } }), [])
  })

  test('signature-help', () => {
    const h = new LspHandler()
    h.handle({ id: 1, method: 'initialize', params: {} })
    const open = (text: string) => h.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///s.aontu', text } },
    })
    const help = (line: number, character: number) => h.handle({
      id: 9, method: 'textDocument/signatureHelp',
      params: {
        textDocument: { uri: 'file:///s.aontu' },
        position: { line, character },
      },
    })[0].result

    // Inside the call: the declared signature, first parameter active.
    open('x: pack($.names, {a:1})')
    let r = help(0, 8)
    Assert.equal(r.signatures[0].label, 'pack(d: map|list, template t: any) : map')
    Assert.equal(r.parameters?.length ?? r.signatures[0].parameters.length, 2)
    Assert.equal(r.activeParameter, 0)

    // After the comma: the second parameter is active.
    r = help(0, 18)
    Assert.equal(r.activeParameter, 1)

    // A comma or paren inside a string does not miscount.
    open('x: join(["a,b"], ",")')
    r = help(0, 20)
    Assert.equal(r.signatures[0].label, 'join(d: map|list, sep?: string) : string')
    Assert.equal(r.activeParameter, 1)

    // Excess arguments cap at the last slot (a rest tail stays live).
    open('y: add(1, 2, 3)')
    r = help(0, 14)
    Assert.equal(r.activeParameter, 1)

    // Not a builtin call, or no call at all: no help.
    open('x: notafunc(1)')
    Assert.equal(help(0, 13), null)
    open('x: 1')
    Assert.equal(help(0, 4), null)

    // A zero-argument builtin still answers, with no active slot.
    open('x: acyclic()')
    r = help(0, 11)
    Assert.equal(r.signatures[0].label, 'acyclic() : constraint')
    Assert.equal(r.activeParameter, 0)
    Assert.equal(r.signatures[0].parameters.length, 0)

    // Positions clamp: a line beyond the document and a character
    // beyond the line both land at the nearest real place, and a
    // multi-line document counts earlier lines into the offset.
    open('a: 1\nb: each($.a,\nc: 2')
    r = help(1, 99)
    Assert.equal(r.signatures[0].label, 'each(d: map|list, template t: any) : list')
    Assert.equal(r.activeParameter, 1)
    Assert.equal(help(99, 0), null)
    r = help(-1, -5)
    Assert.equal(r, null)

    // Nested calls close over: the ')' of an inner call is depth, not
    // the enclosing open.
    open('y: add(lower(2), 3)')
    r = help(0, 18)
    Assert.equal(r.signatures[0].label, 'add(a: number, b: number) : number')
    Assert.equal(r.activeParameter, 1)

    open('a: add(1, 2)\nb: 3')
    Assert.equal(help(1, 4), null)
  })

  test('builtin-funcs-match-engine', () => {
    // Drift guard: every BUILTIN_FUNCS name must be recognised by the
    // parser, and a bogus name must not be.
    Assert.equal(BUILTIN_FUNCS.length, 75)
    for (const name of BUILTIN_FUNCS) {
      const errs = computeDiagnostics('x:' + name + '(1)')
        .filter(d => d.code === 'unknown_function')
      Assert.equal(errs.length, 0, name + ' should be a known function')
    }
    const bogus = computeDiagnostics('x:notafunc(1)')
      .filter(d => d.code === 'unknown_function')
    Assert.equal(bogus.length, 1, 'bogus function should be unknown')
  })

})


describe('lsp-uri-to-path', () => {

  test('lsp-uri-to-path-handles-drive-letters', () => {
    const cases: [string, string | undefined][] = [
      ['file:///tmp/proj', '/tmp/proj'],
      ['file:///C:/Users/me/proj', 'C:/Users/me/proj'],
      ['file:///c%3A/Users/me/proj', 'c:/Users/me/proj'],
      ['file://C:/Users/me/proj', 'C:/Users/me/proj'],
      ['file:///', '/'],
      // NOT a drive letter: the slash stays, because a single-letter
      // directory is an ordinary POSIX path.
      ['file:///C/Users', '/C/Users'],
      ['file:///1:/x', '/1:/x'],
      ['http://example.com/x', undefined],
      ['', undefined],
      // `file://` alone is no path at all, and must not become a
      // confinement root of '' — see uriToPath's own note. The Go twin
      // answers "" and its caller tests for it; here the caller chains
      // with `??`, which '' would survive.
      ['file://', undefined],
      ['file:///%ZZ/x', '/%ZZ/x'],
      ['file:///C:/%ZZ', 'C:/%ZZ'],
      ['file:///tmp/%FF', '/tmp/%FF'],
      ['file:///tmp/%e9', '/tmp/%e9'],
      // A well-formed escape that IS text still decodes.
      ['file:///tmp/%C3%A9', '/tmp/\u00e9'],
      ['file:///C%3A/x', 'C:/x'],
    ]
    for (const [uri, want] of cases) {
      Assert.equal(uriToPath(uri), want, uri)
    }
    // Not a string at all: the handler passes whatever the client sent.
    Assert.equal(uriToPath(undefined), undefined)
    Assert.equal(uriToPath(42), undefined)
  })

})


describe('lsp-handler', () => {

  test('initialize-advertises-hover-and-completion', () => {
    const h = new LspHandler()
    const outs = h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    Assert.equal(outs[0].result.capabilities.hoverProvider, true)
    Assert.ok(outs[0].result.capabilities.completionProvider)
  })

  test('handler-hover-and-completion', () => {
    const h = new LspHandler()
    h.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///t.aontu', text: 'port: 8080' } },
    })
    const hov = h.handle({
      id: 5, method: 'textDocument/hover',
      params: { textDocument: { uri: 'file:///t.aontu' }, position: { line: 0, character: 7 } },
    })
    Assert.match(hov[0].result.contents.value, /8080/)

    const comp = h.handle({ id: 6, method: 'textDocument/completion', params: {} })
    Assert.equal(comp[0].result.length, 90)
  })


  test('initialize-advertises-capabilities', () => {
    const h = new LspHandler()
    const outs = h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    Assert.equal(outs.length, 1)
    Assert.equal(outs[0].id, 1)
    Assert.equal(outs[0].result.capabilities.textDocumentSync, 1)
    Assert.equal(outs[0].result.serverInfo.name, 'aontu-lsp')
  })

  test('didOpen-publishes-diagnostics', () => {
    const h = new LspHandler()
    const outs = h.handle({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///t.aontu', text: 'a:1 a:2' } },
    })
    Assert.equal(outs.length, 1)
    Assert.equal(outs[0].method, 'textDocument/publishDiagnostics')
    Assert.equal(outs[0].params.uri, 'file:///t.aontu')
    Assert.equal(outs[0].params.diagnostics.length, 1)
    Assert.equal(h.doc('file:///t.aontu'), 'a:1 a:2')
  })

  test('didChange-then-didClose', () => {
    const h = new LspHandler()
    h.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///t.aontu', text: 'a:1 a:2' } },
    })

    // Fix the conflict -> diagnostics clear.
    const changed = h.handle({
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri: 'file:///t.aontu' },
        contentChanges: [{ text: 'a:1 b:2' }],
      },
    })
    Assert.equal(changed[0].params.diagnostics.length, 0)

    // Close -> empty diagnostics and untracked.
    const closed = h.handle({
      method: 'textDocument/didClose',
      params: { textDocument: { uri: 'file:///t.aontu' } },
    })
    Assert.equal(closed[0].method, 'textDocument/publishDiagnostics')
    Assert.equal(closed[0].params.diagnostics.length, 0)
    Assert.equal(h.doc('file:///t.aontu'), undefined)
  })

  test('shutdown-then-exit-code-0', () => {
    const h = new LspHandler()
    Assert.equal(h.shouldExit, false)
    h.handle({ id: 9, method: 'shutdown' })
    const outs = h.handle({ method: 'exit' })
    Assert.equal(outs.length, 0)
    Assert.equal(h.shouldExit, true)
    Assert.equal(h.exitCode, 0)
  })

  test('exit-without-shutdown-code-1', () => {
    const h = new LspHandler()
    h.handle({ method: 'exit' })
    Assert.equal(h.exitCode, 1)
  })

  test('unknown-request-is-method-not-found', () => {
    const h = new LspHandler()
    const outs = h.handle({ id: 3, method: 'textDocument/codeLens' })
    Assert.equal(outs.length, 1)
    Assert.equal(outs[0].error?.code, -32601)
    // Unknown notification (no id) is ignored.
    Assert.equal(h.handle({ method: '$/setTrace' }).length, 0)
  })

})


describe('lsp-server-framing', () => {

  function frame(payload: string): Buffer {
    const body = Buffer.from(payload, 'utf8')
    return Buffer.concat([
      Buffer.from('Content-Length: ' + body.length + '\r\n\r\n', 'ascii'),
      body,
    ])
  }

  function parseFrames(buf: Buffer): any[] {
    const out: any[] = []
    let rest = buf
    for (; ;) {
      const headerEnd = rest.indexOf('\r\n\r\n')
      if (headerEnd < 0) break
      const header = rest.subarray(0, headerEnd).toString('ascii')
      const m = /Content-Length:\s*(\d+)/i.exec(header)
      if (null == m) break
      const len = parseInt(m[1], 10)
      const start = headerEnd + 4
      const body = rest.subarray(start, start + len).toString('utf8')
      out.push(JSON.parse(body))
      rest = rest.subarray(start + len)
    }
    return out
  }

  test('round-trip-over-frame-codec', () => {
    const h = new LspHandler()
    const written: Buffer[] = []
    let exitCode = -1
    const codec = new FrameCodec(h, (c: Buffer) => written.push(c), (code: number) => { exitCode = code })

    codec.push(frame('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'))
    codec.push(frame('{"jsonrpc":"2.0","method":"initialized","params":{}}'))
    codec.push(frame('{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///x.aontu","text":"a:1 a:2"}}}'))
    codec.push(frame('{"jsonrpc":"2.0","id":2,"method":"shutdown"}'))
    codec.push(frame('{"jsonrpc":"2.0","method":"exit"}'))

    const msgs = parseFrames(Buffer.concat(written))
    Assert.equal(msgs.length, 3)
    Assert.equal(msgs[0].id, 1)
    Assert.equal(msgs[0].result.serverInfo.name, 'aontu-lsp')
    Assert.equal(msgs[1].method, 'textDocument/publishDiagnostics')
    Assert.equal(msgs[1].params.diagnostics.length, 1)
    Assert.equal(msgs[2].id, 2)
    Assert.equal(msgs[2].result, null)
    Assert.equal(exitCode, 0)
  })

  test('split-frame-across-chunks', () => {
    const h = new LspHandler()
    const written: Buffer[] = []
    const codec = new FrameCodec(h, (c: Buffer) => written.push(c), () => { })

    const f = frame('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')
    // Deliver the frame one byte at a time.
    for (const byte of f) {
      codec.push(Buffer.from([byte]))
    }
    const msgs = parseFrames(Buffer.concat(written))
    Assert.equal(msgs.length, 1)
    Assert.equal(msgs[0].id, 1)
  })

})


describe('lsp-diagnostics-ctx-errors', () => {

  test('budget-passes-surfaces', () => {
    const chain =
      'a:$.b b:$.c c:$.d d:$.e e:$.f f:$.g g:$.h h:$.i i:$.j j:$.k k:1'
    const ds = computeDiagnostics(chain)
    Assert.ok(ds.some((d: any) => 'budget_passes' === d.code),
      'expected a budget_passes diagnostic, got: ' +
      JSON.stringify(ds.map((d: any) => d.code)))
  })

  test('stable-residue-stays-quiet', () => {
    // A stuck operator is incompleteness, not exhaustion: no
    // budget_passes diagnostic (generation-time residue reporting is
    // unchanged).
    const ds = computeDiagnostics('x:1+true')
    Assert.ok(!ds.some((d: any) => 'budget_passes' === d.code),
      'stable residue must not report budget_passes')
  })

})


// G3 phase 4: the deprecation mark's LSP surface — the native
// Deprecated tag (2) at Hint severity, on the declaration and on every
// use resolving through the value. The Go twin is in
// go/lsp/lsp_test.go (TestDiagnosticsDeprecated).
describe('lsp-deprecated', () => {

  test('deprecated-values-carry-the-tag', () => {
    const d = computeDiagnostics(
      'p:deprecate(8080,{msg:"renamed",use:"$.listen",since:"2.0.0"})\nq:$.p')
    const tagged = d.filter((x: any) => 'deprecated' === x.code)
    Assert.equal(tagged.length, 2)
    for (const t of tagged) {
      Assert.equal(t.severity, 4)
      Assert.deepEqual((t as any).tags, [2])
      Assert.match(t.message, /renamed/)
      Assert.match(t.message, /use \$\.listen/)
      Assert.match(t.message, /since 2\.0\.0/)
    }
  })

  test('met-records-read-as-one-message', () => {
    const d = computeDiagnostics('p: deprecate(integer, {msg: "a"}) & ' +
      'deprecate(1, {msg: "b", use: "$.q"})\nq: 1')
    Assert.deepEqual(d.filter((x: any) => 'deprecated' === x.code)
      .map((x: any) => x.message), ['deprecated: a; b (use $.q)'])
  })

  test('undeprecated-documents-carry-no-tag', () => {
    const d = computeDiagnostics('a:1')
    Assert.equal(d.filter((x: any) => 'deprecated' === x.code).length, 0)
  })

})


describe('lsp-hover-provenance', () => {

  // HOVER PROVENANCE (G7 phase 7) is config-gated and off by default:
  // the contributions that met at the hovered path, appended to the
  // value's own hover. The markdown is byte-identical to the Go
  // port's, which was diffed before this was written.
  test('hover-provenance-is-off-until-asked-for', () => {
    const src = 'services: {\n  &: { replicas: *1 | integer }\n' +
      '  auth: { replicas: 3 }\n}'
    const pos = { line: 2, character: 20 }

    const off: any = computeHover(src, pos)
    Assert.doesNotMatch(off.contents.value, /Contributions/)

    const on: any = computeHover(src, pos, true)
    Assert.match(on.contents.value, /Contributions:/)
    Assert.match(on.contents.value, /`\*1\|integer` — spread \(2:18\)/)
    Assert.match(on.contents.value, /`3` — literal \(3:21\)/)

    // A value with NO path — the whole document — has no
    // contributions to name, and the hover is unchanged rather than
    // decorated with an empty section.
    const bare: any = computeHover('42', { line: 0, character: 1 }, true)
    Assert.doesNotMatch(bare.contents.value, /Contributions/)

    // A document with an error ELSEWHERE still hovers, while `why`
    // refuses it: the hover keeps its value and gains no section.
    const broken: any = computeHover(
      'a: 1\nb: 2 & "x"', { line: 0, character: 3 }, true)
    Assert.match(broken.contents.value, /1/)
    Assert.doesNotMatch(broken.contents.value, /Contributions/)
  })

  test('contributions-markdown-renders-every-site-shape', () => {
    Assert.equal(contributionsMarkdown([]), '')
    Assert.equal(
      contributionsMarkdown([
        { canon: '1', role: 'literal', site: { col: -1, file: '', row: -1 } },
        { canon: 'integer', role: 'spread', site: { col: 3, file: 'x.aontu', row: 2 } },
      ] as any),
      '\n\n---\n\nContributions:\n' +
      '- `1` — literal\n- `integer` — spread (x.aontu:2:3)')
  })

  test('the-handler-reads-the-opt-in', () => {
    const on = new LspHandler()
    on.handle({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { initializationOptions: { aontu: { provenance: true } } },
    } as any)
    on.handle({
      jsonrpc: '2.0', method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///p.aontu', text: 'a: 1\na: integer', version: 1,
        },
      },
    } as any)
    const hover: any = on.handle({
      jsonrpc: '2.0', id: 2, method: 'textDocument/hover',
      params: {
        textDocument: { uri: 'file:///p.aontu' },
        position: { line: 0, character: 3 },
      },
    } as any)[0]
    Assert.match(hover.result.contents.value, /Contributions:/)

    const off = new LspHandler()
    off.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } as any)
    off.handle({
      jsonrpc: '2.0', method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///p.aontu', text: 'a: 1\na: integer', version: 1,
        },
      },
    } as any)
    const plain: any = off.handle({
      jsonrpc: '2.0', id: 2, method: 'textDocument/hover',
      params: {
        textDocument: { uri: 'file:///p.aontu' },
        position: { line: 0, character: 3 },
      },
    } as any)[0]
    Assert.doesNotMatch(plain.result.contents.value, /Contributions/)
  })

})


describe('lsp-cursor', () => {

  test('a-colon-at-the-start-has-no-key-before-it', () => {
    Assert.strictEqual(keySpan(': 1', 2, 'a'), undefined)
  })

  test('the-walk-visits-a-shared-value-once-and-steps-over-nothing', () => {
    const one = { isVal: true, site: { row: 1, col: 1, src: '1', url: '' } }
    const both = {
      isVal: true, isConjunct: true, peg: [one, one, null],
      site: { row: 1, col: 1, src: '1', url: '' },
    }
    const { values } = hitsOf('1', both)
    Assert.deepStrictEqual(values.map((h: any) => [h.on, h.start, h.end]),
      [['value', 0, 1]])
  })

  test('the-outline-visits-a-shared-value-once-and-steps-over-nothing', () => {
    const one = { isVal: true, site: { row: 1, col: 1, src: '1', url: '' } }
    const both = { isVal: true, isConjunct: true, peg: [one, one, null], site: one.site }
    Assert.deepStrictEqual(symbolTree('1', both), [])
  })

  test('the-map-search-visits-a-shared-value-once-and-finds-nothing-else', () => {
    const one = { isVal: true, site: { row: 1, col: 1, src: '1', url: '' } }
    const both = { isVal: true, isConjunct: true, peg: [one, one, null], site: one.site }
    Assert.strictEqual(mapAt('1', both, 0), undefined)
  })

  test('the-server-layer-answers-as-the-library', () => {
    const src = 'a: { b: 1 }\nc: $.a.b\n'
    const at: any = computePathAt(src, { line: 1, character: 5 })
    Assert.deepStrictEqual([at.on, at.path, at.reads], ['ref', ['c'], ['a', 'b']])
    Assert.deepStrictEqual(
      computeSitesOf(src, ['c'])?.map((s: any) => [s.role, s.canon]),
      [['literal', '1'], ['ref', '$.a.b']])
    Assert.strictEqual(computePathAt(src, { line: 0, character: 2 }), null)
    Assert.strictEqual(computeSitesOf(src, ['nope']), null)
  })

})


// Twin: go/lsp/hover_test.go, the tests from TestHoverOnAKey on.
describe('lsp-key-and-path', () => {

  const SRC = 'base: { port: 8080 }\ndb: { port: $.base.port }\n'
  const range = (l0: number, c0: number, l1: number, c1: number) =>
    ({ start: { line: l0, character: c0 }, end: { line: l1, character: c1 } })

  test('hover-on-a-key-shows-what-unified-under-it', () => {
    Assert.deepStrictEqual(computeHover(SRC, { line: 0, character: 1 }), {
      contents: { kind: 'markdown', value: '```aontu\n{"port":8080}\n```\n\n*map*' },
      range: range(0, 0, 0, 4),
    })
  })

  test('hover-on-a-reference-shows-the-path-it-reads', () => {
    const h: any = computeHover(SRC, { line: 1, character: 15 }, true)
    Assert.strictEqual(h.contents.value, '```aontu\n8080\n```\n\n*integer*' +
      '\n\n---\n\nContributions:\n- `8080` — literal (1:15)')
    Assert.deepStrictEqual(h.range, range(1, 12, 1, 23))
  })

  test('definition-goes-to-every-site-of-the-path', () => {
    const at = (line: number, character: number) =>
      computePathDefinition(SRC, { line, character }, 'file:///d.aontu')
    Assert.deepStrictEqual(at(1, 15),
      [{ uri: 'file:///d.aontu', range: range(0, 14, 0, 18) }])
    Assert.deepStrictEqual(at(1, 7)?.map((l) => l.range.start),
      [{ line: 0, character: 14 }, { line: 1, character: 12 }])
    Assert.strictEqual(at(0, 14), null)
    Assert.strictEqual(
      computePathDefinition('a: }', { line: 0, character: 0 }, 'file:///d.aontu'), null)
  })

  test('across-an-include', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-lsp-'))
    try {
      Fs.writeFileSync(Path.join(dir, 'base.aontu'), 'port: 8080\n')
      Fs.writeFileSync(Path.join(dir, 'far.aontu'), '   5\n')
      Fs.writeFileSync(Path.join(dir, 'two.aontu'), '2\n')
      Fs.writeFileSync(Path.join(dir, 'ref.aontu'), '\n\n\n$.missing\n')
      Fs.writeFileSync(Path.join(dir, 'call.aontu'), '\n\nfoo(1)\n')
      Fs.writeFileSync(Path.join(dir, 'deep.aontu'), '  a: $.nope\n')
      const trust = { include: { root: dir } }
      const src = `base: @"${srcPath(dir)}/base.aontu"\nx: $.base.port\n`

      const [loc, ...more] = computePathDefinition(
        src, { line: 1, character: 5 }, 'file:///d.aontu', trust) ?? []
      Assert.deepStrictEqual(more, [])
      Assert.ok(loc.uri.startsWith('file:///') && loc.uri.endsWith('/base.aontu'), loc.uri)
      Assert.deepStrictEqual(loc.range, range(0, 6, 0, 10))

      // The key that holds the include answers with what the file wrote.
      Assert.match(computeHover(src, { line: 0, character: 1 }, false, trust)!
        .contents.value, /\{"port":8080\}/)

      // The loaded 5 is at 1:4 of its own file, which is the `@` here.
      const far = `n: @"${srcPath(dir)}/far.aontu"\n`
      Assert.strictEqual(computeHover(far, { line: 0, character: 3 }, false, trust), null)
      Assert.match(computeHover(far, { line: 0, character: 0 }, false, trust)!
        .contents.value, /\n5\n/)

      // A conflict with a loaded value is placed at the operand written here.
      const ds = computeDiagnostics(`y: @"${srcPath(dir)}/two.aontu"\ny: 3\n`, { trust })
      Assert.deepStrictEqual(ds.map((d) => [d.code, d.range]),
        [['scalar_value', range(1, 3, 1, 4)]])

      // An error in what an include loads, with no operand here, is placed
      // at the `@` that loaded it.
      for (const [file, code] of [['ref', 'no_path'], ['call', 'unknown_function']]) {
        const at = computeDiagnostics(`v: @"${srcPath(dir)}/${file}.aontu"\n`, { trust })
        Assert.deepStrictEqual(at.map((d) => [d.code, d.range]), [[code, range(0, 3, 0, 4)]])
      }
      // Deeper in the file, it keeps the file's own row and column.
      const deep = computeDiagnostics(`v: @"${srcPath(dir)}/deep.aontu"\n`, { trust })
      Assert.deepStrictEqual(deep.map((d) => [d.code, d.range]), [['no_path', range(0, 5, 0, 6)]])
    }
    finally {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // A parsed value has no text to read a line's end from.
  test('a-parsed-value-hovers-at-its-own-site', () => {
    const v: any = new IntegerVal({ peg: 7 })
    v.site = { row: 1, col: 1, url: '' }
    Assert.deepStrictEqual(computeHover(v, { line: 0, character: 0 }), {
      contents: { kind: 'markdown', value: '```aontu\n7\n```\n\n*integer*' },
      range: range(0, 0, 0, 1),
    })
  })

  test('a-path-becomes-a-file-uri', () => {
    Assert.deepStrictEqual(
      ['/a/b c.aontu', 'C:\\a\\b.aontu', '/é/#?%.aontu', '\\\\host\\share\\b.aontu']
        .map(pathToUri),
      ['file:///a/b%20c.aontu', 'file:///C:/a/b.aontu', 'file:///%C3%A9/%23%3F%25.aontu',
        'file://host/share/b.aontu'])
  })

  test('the-handler-goes-to-an-alias-then-to-a-path', () => {
    const h = new LspHandler()
    h.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///d.aontu', text: '%p = 1\n' + SRC } },
    })
    const def = (line: number, character: number) => h.handle({
      id: 1, method: 'textDocument/definition',
      params: { textDocument: { uri: 'file:///d.aontu' }, position: { line, character } },
    })[0].result
    Assert.deepStrictEqual(def(0, 1).range, range(0, 0, 0, 2))
    Assert.deepStrictEqual(def(2, 15),
      [{ uri: 'file:///d.aontu', range: range(1, 14, 1, 18) }])
    Assert.strictEqual(def(1, 14), null)
  })

})


describe('lsp-diagnostics-once', () => {

  test('a-conflict-copied-to-another-path-is-reported-once', () => {
    const ds = computeDiagnostics('a:{b:1&"s"} c:$.a d:$.a')
    Assert.deepStrictEqual(ds.map((d) => [d.range.start.character, d.code]),
      [[7, 'scalar_kind']])
  })

})


// Twin: go/lsp/lsp_test.go, the tests from TestSymbolsOutlineWhatTheDocumentWrites on.
describe('lsp-symbols', () => {

  const range = (l0: number, c0: number, l1: number, c1: number) =>
    ({ start: { line: l0, character: c0 }, end: { line: l1, character: c1 } })

  test('symbols-outline-what-the-document-writes', () => {
    Assert.deepStrictEqual(computeSymbols('a: { b: 1 }\nl: [$.a]\n'), [
      {
        name: 'a', kind: 19, range: range(0, 0, 0, 11), selectionRange: range(0, 0, 0, 1),
        children: [{
          name: 'b', kind: 16, range: range(0, 5, 0, 9), selectionRange: range(0, 5, 0, 6),
          children: [],
        }],
      },
      {
        name: 'l', kind: 18, range: range(1, 0, 1, 8), selectionRange: range(1, 0, 1, 1),
        children: [{
          name: '0', kind: 13, range: range(1, 4, 1, 7), selectionRange: range(1, 4, 1, 7),
          children: [],
        }],
      },
    ])
    Assert.deepStrictEqual(computeSymbols('1\n'), [])
    Assert.strictEqual(computeSymbols('a: )\n'), null)
  })

  test('symbols-through-the-handler', () => {
    const h = new LspHandler()
    const init = h.handle({ id: 1, method: 'initialize', params: {} })
    Assert.strictEqual(init[0].result.capabilities.documentSymbolProvider, true)
    h.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///s.aontu', text: 'a: b: 1\na: 2\n' } },
    })
    const ask = (uri: string) => h.handle({
      id: 2, method: 'textDocument/documentSymbol', params: { textDocument: { uri } },
    })[0].result
    Assert.deepStrictEqual(
      ask('file:///s.aontu').map((s: any) => [s.name, s.range, s.children.map((c: any) => c.name)]),
      [['a', range(0, 0, 0, 7), ['b']], ['a', range(1, 0, 1, 4), []]])
    Assert.strictEqual(ask('file:///none.aontu'), null)
    Assert.strictEqual(h.handle({ id: 3, method: 'textDocument/documentSymbol', params: {} })[0]
      .result, null)
  })

})


// Twin: go/lsp/lsp_test.go, the tests from TestReferencesListTheSitesAndTheReads on.
describe('lsp-references', () => {

  const SRC = 'base: { port: 8080 }\ndb: { port: $.base.port }\nx: $.base.port\n'
  const range = (l0: number, c0: number, l1: number, c1: number) =>
    ({ start: { line: l0, character: c0 }, end: { line: l1, character: c1 } })
  const U = 'file:///r.aontu'

  test('references-list-the-sites-and-the-reads', () => {
    Assert.deepStrictEqual(computeReferences(SRC, { line: 0, character: 9 }, U, true), [
      { uri: U, range: range(0, 14, 0, 18) },
      { uri: U, range: range(1, 12, 1, 23) },
      { uri: U, range: range(2, 3, 2, 14) },
    ])
    Assert.deepStrictEqual(computeReferences(SRC, { line: 2, character: 5 }, U, false), [
      { uri: U, range: range(1, 12, 1, 23) },
      { uri: U, range: range(2, 3, 2, 14) },
    ])
    Assert.strictEqual(computeReferences(SRC, { line: 0, character: 15 }, U, true), null)
    Assert.strictEqual(computeReferences('a: )\n', { line: 0, character: 0 }, U, true), null)
  })

  test('highlights-tell-a-write-from-a-read', () => {
    Assert.deepStrictEqual(computeHighlights(SRC, { line: 1, character: 20 }), [
      { range: range(0, 14, 0, 18), kind: HIGHLIGHT_WRITE },
      { range: range(1, 12, 1, 23), kind: HIGHLIGHT_READ },
      { range: range(2, 3, 2, 14), kind: HIGHLIGHT_READ },
    ])
    Assert.deepStrictEqual(computeHighlights('x: $.nope\n', { line: 0, character: 5 }),
      [{ range: range(0, 3, 0, 9), kind: HIGHLIGHT_READ }])
    Assert.strictEqual(computeHighlights(SRC, { line: 0, character: 15 }), null)
  })

  test('references-across-an-include', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-lsp-'))
    try {
      Fs.writeFileSync(Path.join(dir, 'base.aontu'), 'port: 8080\nr: ( $.top )\ns: $."top"\n')
      const trust = { include: { root: dir } }
      const src = `top: 1\nbase: @"${srcPath(dir)}/base.aontu"\n`
      const [own, there, quoted, ...more] =
        computeReferences(src, { line: 0, character: 1 }, U, true, trust) ?? []
      Assert.deepStrictEqual(more, [])
      Assert.deepStrictEqual(own, { uri: U, range: range(0, 5, 0, 6) })
      Assert.ok(there.uri.startsWith('file:///') && there.uri.endsWith('/base.aontu'), there.uri)
      // A reference there is ranged by its span as written there.
      Assert.deepStrictEqual([there.range, quoted.range], [range(1, 5, 1, 10), range(2, 3, 2, 10)])
      // A highlight is in the open document alone.
      Assert.deepStrictEqual(computeHighlights(src, { line: 0, character: 1 }, trust),
        [{ range: range(0, 5, 0, 6), kind: HIGHLIGHT_WRITE }])
    }
    finally {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('references-and-highlights-through-the-handler', () => {
    const h = new LspHandler()
    const caps = h.handle({ id: 1, method: 'initialize', params: {} })[0].result.capabilities
    Assert.deepStrictEqual([caps.referencesProvider, caps.documentHighlightProvider], [true, true])
    h.handle({ method: 'textDocument/didOpen', params: { textDocument: { uri: U, text: SRC } } })
    const ask = (method: string, params: any) => h.handle({
      id: 2, method, params: { textDocument: { uri: U }, ...params },
    })[0].result
    const at = { position: { line: 0, character: 9 } }
    Assert.strictEqual(ask('textDocument/references',
      { ...at, context: { includeDeclaration: true } }).length, 3)
    Assert.strictEqual(ask('textDocument/references', at).length, 2)
    Assert.deepStrictEqual(ask('textDocument/documentHighlight', at)
      .map((x: any) => x.kind), [HIGHLIGHT_WRITE, HIGHLIGHT_READ, HIGHLIGHT_READ])
    Assert.strictEqual(ask('textDocument/references', {}), null)
    Assert.strictEqual(h.handle({ id: 4, method: 'textDocument/references', params: {} })[0].result,
      null)
    Assert.strictEqual(h.handle({
      id: 3, method: 'textDocument/documentHighlight',
      params: { textDocument: { uri: 'file:///none.aontu' }, ...at },
    })[0].result, null)
  })

})
