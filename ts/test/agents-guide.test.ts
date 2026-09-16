/* Copyright (c) 2026 Richard Rodger, MIT License */

// AGENTS.md is an index, not the manual. The cap is the enforcement:
// without it the file reaccumulates the detail that belongs in
// docs/contributing/, and an agent reads a manual instead of a map.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

const REPO = Path.join(__dirname, '..', '..')

const CAP = 1200

// Whitespace-separated tokens, the `wc -w` count, so the number a
// contributor checks by hand is the number that fails the build.
function words(md: string): number {
  return md.split(/\s+/).filter((w) => '' !== w).length
}


describe('agents-guide', () => {

  test('agents-md-is-within-the-word-cap', () => {
    const md = Fs.readFileSync(Path.join(REPO, 'AGENTS.md'), 'utf8')
    const count = words(md)
    Assert.ok(count <= CAP,
      `AGENTS.md is ${count} words, over the ${CAP}-word cap by `
      + `${count - CAP}. It is an index: move the detail into `
      + 'docs/contributing/ and link it.')
  })

  test('claude-md-is-the-same-file', () => {
    const claude = Path.join(REPO, 'CLAUDE.md')
    const target = Fs.lstatSync(claude).isSymbolicLink() ?
      Fs.readlinkSync(claude) :
      Fs.readFileSync(claude, 'utf8').trim()
    Assert.equal(target, 'AGENTS.md',
      'CLAUDE.md must be a link to AGENTS.md, not a second copy. A '
      + 'checkout without symlink support writes the target as the '
      + 'contents, which is still one file and passes here.')
  })

  test('every-link-resolves', () => {
    const md = Fs.readFileSync(Path.join(REPO, 'AGENTS.md'), 'utf8')
    let checked = 0
    for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
      const target = m[1]
      if (target.startsWith('http') || target.startsWith('#')) {
        continue
      }
      const path = Path.join(REPO, target.split('#')[0])
      Assert.ok(Fs.existsSync(path), `AGENTS.md links to ${target}`)
      checked++
    }
    Assert.ok(0 < checked, 'no links checked')
  })

})
