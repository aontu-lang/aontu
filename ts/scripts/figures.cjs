/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE FIGURES THE DOCUMENTATION SHOWS, drawn by the engine the
// documentation is about. A hand-drawn picture of the value lattice is
// a second source of truth for the one thing the language is built on,
// and it was wrong about `path()` and the numeric leaves for as long as
// it existed. This draws it instead, from `aontu view lattice`.
//
// Run by `make build-ts` after the compile, since it needs ts/dist;
// ts/test/docs.test.ts holds the committed file to what this writes,
// so a stale figure fails the suite rather than reaching a reader.

const Fs = require('node:fs')
const Path = require('node:path')

const { view } = require('../dist/view.js')

const OUT = Path.join(__dirname, '..', '..', 'docs', 'figures')

// The figures, by file name. THE LATTICE IS THE LANGUAGE'S, so its
// source holds no values: a document that placed some would draw its
// own counts onto a figure the reference shows as the shape alone.
const FIGURES = {
  'value-lattice.svg': {
    src: '# The value lattice as the reference shows it: the language\'s\n' +
      '# scaffold, with no document\'s values on it.\n',
    ask: { kind: 'lattice', as: 'svg' },
  },
}

function draw(name) {
  const { src, ask } = FIGURES[name]
  const report = view(src, ask)
  if ('rendered' !== report.verdict) {
    throw new Error(`figures: ${name} is ${report.verdict}: ` +
      JSON.stringify(report.errors ?? report.loss))
  }
  return report.text + '\n'
}

// EXPORTED so the docs test can compare without a second copy of the
// source: the check and the write draw from the one table.
module.exports = { FIGURES, OUT, draw }

if (require.main === module) {
  Fs.mkdirSync(OUT, { recursive: true })
  for (const name of Object.keys(FIGURES)) {
    Fs.writeFileSync(Path.join(OUT, name), draw(name))
    console.log('figures: wrote docs/figures/' + name)
  }
}
