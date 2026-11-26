/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'


const ROOT = Path.join(__dirname, '..', '..')
const EDITORS = Path.join(ROOT, 'editors')
const REPO_URL = 'https://github.com/aontu-lang/aontu/blob/main/'


function readJson(...parts: string[]): any {
  return JSON.parse(Fs.readFileSync(Path.join(...parts), 'utf8'))
}


describe('editors', () => {

  const template = readJson(EDITORS, 'jetbrains', 'template.json')
  const vscode = readJson(EDITORS, 'vscode', 'package.json')


  // LSP4IJ reads the fields it knows and drops the rest without a word,
  // so a misspelt field is a setting that silently does nothing.
  test('the-jetbrains-template-holds-only-fields-lsp4ij-reads', () => {
    const known = new Set([
      'id', 'name', 'url', 'programArgs', 'transports', 'fileTypeMappings',
    ])
    for (const field of Object.keys(template)) {
      Assert.ok(known.has(field),
        `editors/jetbrains/template.json has a field LSP4IJ does not read: ${field}`)
    }
    Assert.equal(template.id, 'aontu')
    Assert.equal(typeof template.name, 'string')
    Assert.deepEqual(template.transports, [{ mode: 'stdio' }])
  })


  test('the-jetbrains-template-starts-the-command-the-other-clients-start', () => {
    const props = vscode.contributes.configuration.properties
    const command = [
      props['aontu.server.command'].default,
      ...props['aontu.server.args'].default,
    ].join(' ')
    Assert.equal(command, 'aontu lsp')

    Assert.deepEqual(Object.keys(template.programArgs).sort(),
      ['default', 'windows'])
    Assert.equal(template.programArgs.default, command)
    Assert.equal(template.programArgs.windows, 'cmd /C ' + command)
  })


  test('the-jetbrains-template-binds-the-one-extension', () => {
    const lang = vscode.contributes.languages[0]
    Assert.deepEqual(lang.extensions, ['.aontu'])

    Assert.deepEqual(template.fileTypeMappings, [{
      fileType: { patterns: lang.extensions.map((ext: string) => '*' + ext) },
      languageId: lang.id,
    }])
  })


  test('the-jetbrains-template-links-its-own-instructions', () => {
    const url: string = template.url
    Assert.ok(url.startsWith(REPO_URL), `template.json url leaves the repository: ${url}`)
    const rel = url.slice(REPO_URL.length)
    Assert.equal(rel, 'editors/jetbrains/README.md')
    Assert.ok(Fs.existsSync(Path.join(ROOT, rel)), `template.json url names no file: ${rel}`)
  })


  // The JetBrains README sends the reader to editors/vscode for the
  // colours, which an IDE reads as a TextMate bundle from these entries.
  test('the-bundle-the-jetbrains-readme-names-declares-the-grammar', () => {
    const readme = Fs.readFileSync(
      Path.join(EDITORS, 'jetbrains', 'README.md'), 'utf8')
    Assert.ok(readme.includes('select `editors/vscode` of a checkout'),
      'editors/jetbrains/README.md no longer names editors/vscode as the bundle')

    const lang = vscode.contributes.languages[0]
    const grammar = vscode.contributes.grammars[0]
    Assert.equal(grammar.language, lang.id)
    Assert.equal(grammar.scopeName, 'source.aontu')
    for (const rel of [grammar.path, lang.configuration]) {
      Assert.ok(Fs.existsSync(Path.join(EDITORS, 'vscode', rel)),
        `editors/vscode/package.json names no file: ${rel}`)
    }
  })

})
