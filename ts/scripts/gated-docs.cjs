
const Fs = require('node:fs')
const Path = require('node:path')

const REPO = Path.join(__dirname, '..', '..')

const DOC_PAGES = [
  'index.md',
  'tutorial.md',
  'tutorial-config.md',
  'tutorial-graph.md',
  'tutorial-package.md',
  'tutorial-generate.md',
  'unification.md',
  'reference-language.md',
  'reference-generation.md',
  'reference-functions.md',
  'reference-errors.md',
  'reference-packages.md',
  'reference-grammar.md',
  'reference-agents.md',
  'reference-api.md',
  'use-cases.md',
  'explanation.md',
  'trust.md',
  'lsp.md',
  'shared-spec.md',
  'test-coverage.md',
  'release-and-tag.md',
]

const READMES = ['README.md', 'ts/README.md']


function exists(rel) {
  return Fs.existsSync(Path.join(REPO, rel))
}


// Repo-relative, sorted within each group, and filtered to what is
// actually on disk so a renamed page fails as a missing gate rather
// than as a crash.
function gatedDocs() {
  const docs = DOC_PAGES.map((f) => `docs/${f}`)

  const howtoDir = Path.join(REPO, 'docs', 'how-to')
  const howto = Fs.existsSync(howtoDir)
    ? Fs.readdirSync(howtoDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => `docs/how-to/${f}`)
    : []

  const ucDir = Path.join(REPO, 'use-cases')
  const cases = Fs.existsSync(ucDir)
    ? Fs.readdirSync(ucDir)
      .filter((d) => /^\d\d-/.test(d))
      .sort()
      .map((d) => `use-cases/${d}/README.md`)
    : []

  // THE SYSTEMS ARE PUBLISHED TOO. `aontu-lang/web` renders
  // test/system/<name>/README.md as /examples/<name>, its doc/*.md as
  // the pages under it, and reads this directory's own README for the
  // status each example card shows. AGENTS.md has always said the style
  // rules reach here; until this list did, neither gate looked, and
  // three years of nobody noticing is what that bought.
  const sysDir = Path.join(REPO, 'test', 'system')
  const systems = Fs.existsSync(sysDir)
    ? Fs.readdirSync(sysDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .flatMap((name) => {
        const docDir = Path.join(sysDir, name, 'doc')
        const guides = Fs.existsSync(docDir)
          ? Fs.readdirSync(docDir)
            .filter((f) => f.endsWith('.md'))
            .sort()
            .map((f) => `test/system/${name}/doc/${f}`)
          : []
        return [`test/system/${name}/README.md`, ...guides]
      })
    : []

  return [
    ...docs, ...howto, ...cases,
    'test/system/README.md', ...systems,
    ...READMES,
  ].filter(exists)
}


module.exports = { gatedDocs, DOC_PAGES, READMES }

if (require.main === module) {
  process.stdout.write(gatedDocs().join('\n') + '\n')
}
