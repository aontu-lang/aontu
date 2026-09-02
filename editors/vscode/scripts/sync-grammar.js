/* Copyright (c) 2025 Richard Rodger, MIT License */

// Stage the published TextMate grammar inside the extension.
//
// grammar/aontu.tmLanguage.json is the source of truth — it is what the
// npm tarball ships (ts/scripts/prepack.js copies the tree) and what
// aontu.dev loads into Shiki. A VS Code extension cannot reach outside
// its own root, though: `contributes.grammars[].path` resolves against
// the extension directory, so a `../../grammar/...` spelling works
// under F5 and is absent from the packaged .vsix, which is the worst
// of both — it fails only for the people who install it.
//
// So the file is COPIED here, and the copy is committed, so that a
// fresh checkout has a working extension without a build step. A
// committed copy drifts, which is why ts/test/grammar.test.ts asserts
// the two byte-for-byte rather than trusting this script to have run.

const Fs = require('node:fs')
const Path = require('node:path')

const SRC = Path.join(__dirname, '..', '..', '..', 'grammar', 'aontu.tmLanguage.json')
const DST = Path.join(__dirname, '..', 'syntaxes', 'aontu.tmLanguage.json')

Fs.mkdirSync(Path.dirname(DST), { recursive: true })
Fs.copyFileSync(SRC, DST)
