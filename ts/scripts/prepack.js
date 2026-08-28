/* Copyright (c) 2025 Richard Rodger, MIT License */

// Stage the two out-of-package trees the tarball ships: the published
// grammar and the agent skill. `files` in package.json names `grammar`
// and `skill`, and neither lives under `ts/` in the repository — the
// grammar is consumed by anything doing constrained decoding and the
// skill is the docs' own copy, so both belong at the top level and are
// COPIED here at pack time rather than duplicated in the tree.
//
// AND THE LINKS ARE REWRITTEN, which is the part a plain copy got
// wrong. A relative link is relative to where the file SITS, and these
// files move two directories closer to the root:
//
//   docs/skill/grammar-card.md  ->  <pkg>/skill/grammar-card.md
//
// so `../../grammar/aontu.gbnf` — correct in the repository — resolved
// outside the package once copied (under an install, to
// `node_modules/grammar`). Worse, `../../test/spec/errcodes.tsv` names
// a tree the tarball does not ship at ALL, so no relative spelling of
// it can work: that one becomes a canonical repository URL.
//
// Every rewrite is asserted to have applied. A link that silently
// stops matching — because the source moved, or the text around it
// changed — would ship broken, which is exactly the failure this
// script exists to prevent, so a miss is a pack failure.

const Fs = require('node:fs')
const Path = require('node:path')

const REPO = 'https://github.com/aontu-lang/aontu/blob/main/'

// [file, from, to]. `file` is relative to the staged tree.
const REWRITES = [
  ['skill/grammar-card.md',
    '](../../grammar/aontu.gbnf)',
    '](../grammar/aontu.gbnf)'],
  ['skill/error-codes.md',
    '](../../test/spec/errcodes.tsv)',
    '](' + REPO + 'test/spec/errcodes.tsv)'],
]

const TREES = [
  ['../grammar', 'grammar'],
  ['../docs/skill', 'skill'],
]

for (const [from, to] of TREES) {
  Fs.rmSync(to, { recursive: true, force: true })
  Fs.cpSync(from, to, { recursive: true })
}

for (const [file, from, to] of REWRITES) {
  const path = Path.join(__dirname, '..', file)
  const src = Fs.readFileSync(path, 'utf8')
  if (!src.includes(from)) {
    throw new Error(
      `prepack: ${file} no longer contains ${from} — the link moved or ` +
      'changed, and shipping it unrewritten would break it in the package')
  }
  Fs.writeFileSync(path, src.split(from).join(to))
}

// Nothing may still point above the package root.
for (const [, tree] of TREES) {
  for (const file of Fs.readdirSync(Path.join(__dirname, '..', tree))) {
    if (!file.endsWith('.md')) {
      continue
    }
    const path = Path.join(__dirname, '..', tree, file)
    const src = Fs.readFileSync(path, 'utf8')
    const escaped = src.match(/\]\(\.\.\/\.\.\/[^)]*\)/g)
    if (null != escaped) {
      throw new Error(
        `prepack: ${tree}/${file} links outside the package: ` +
        escaped.join(', '))
    }
  }
}

process.stdout.write('prepack: staged grammar/ and skill/, links rewritten\n')
