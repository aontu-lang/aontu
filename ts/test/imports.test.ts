/* Copyright (c) 2025 Richard Rodger, MIT License */

// EVERY NODE BUILTIN IS IMPORTED AS `node:<name>`, never bare.
//
// The two spellings are the same module to Node and NOT the same
// specifier to a bundler. `src/view.ts` imported bare `'path'` — the
// only file in the tree that did — and the engine went on working
// everywhere Node resolves it, so nothing here noticed. What noticed
// was aontu-lang/web: its playground bundles the engine for the
// browser with esbuild, aliasing `node:path`, `node:fs`, `node:crypto`
// and `node:util` to shims, and a bare `'path'` misses every alias.
// The site's build failed with `Could not resolve "path"` on the first
// release that shipped the view verb.
//
// A downstream build failure is a poor detector for a one-word typo,
// so the rule is asserted here instead: the tree has one spelling.

import { describe, test } from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { builtinModules } from 'node:module'

import { expect } from './expect'


// At runtime __dirname is dist-test/, so one level up is ts/.
const SRC = join(__dirname, '..', 'src')

const BUILTIN = new Set(builtinModules)


function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...sources(full))
    }
    else if (name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}


describe('imports', () => {

  test('every-node-builtin-carries-the-node-prefix', () => {
    const bare: string[] = []
    let checked = 0
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8')
      const re = /(?:from|require\()\s*['"]([^'"]+)['"]/g
      let m: RegExpExecArray | null
      while (null != (m = re.exec(text))) {
        checked++
        const spec = m[1]
        if (BUILTIN.has(spec)) {
          const line = text.slice(0, m.index).split('\n').length
          bare.push(`${file.slice(SRC.length + 1)}:${line} ${spec}` +
            ` (write 'node:${spec}')`)
        }
      }
    }
    expect(bare).equal([])
    // The walk silently matching nothing would make the assertion
    // vacuous, so the specifier count is asserted too.
    expect(100 < checked).equal(true)
  })

})
