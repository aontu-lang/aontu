// The reader-facing page set, in one place.
//
// TWO GATES READ THIS. `ts/test/docs.test.ts` requires it for the style
// checks it runs locally, and `make prose` / `.github/workflows/docs.yml`
// run it to build Vale's argument list. Keeping the set in one module is
// what stops the fast gate and the CI gate disagreeing about which pages
// they cover -- a page added to one and not the other is a page nothing
// checks, and nothing announces that.
//
// It cannot live in `.vale.ini`. Vale's `[section]` headers select by
// file EXTENSION, not by path, so `[docs/design/**]` matches nothing and
// silently lints the working documents anyway. Passing an explicit list
// is the only scoping Vale honours.
//
// Scope is docs/STYLE-GUIDE.md, "How this guide is enforced": the
// Diátaxis pages, the how-to guides, the three contributor references
// that ship under docs/, the sixteen published use cases, and the two
// package READMEs. Design notes, the capability review, the defect
// ledgers and the repro corpus are working documents and are out.

const Fs = require('node:fs')
const Path = require('node:path')

const REPO = Path.join(__dirname, '..', '..')

// Every Diátaxis page, in reading order, plus the three references
// written for contributors. STYLE-GUIDE.md is absent on purpose: it
// quotes the banned phrases in order to ban them.
const DOC_PAGES = [
  'index.md',
  'tutorial.md',
  'tutorial-graph.md',
  'unification.md',
  'reference-language.md',
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

  // The site renders each numbered case at /use-cases/<dir>, so its
  // README is published prose. `repros/` is a review artifact and the
  // site does not render it.
  const ucDir = Path.join(REPO, 'use-cases')
  const cases = Fs.existsSync(ucDir)
    ? Fs.readdirSync(ucDir)
      .filter((d) => /^\d\d-/.test(d))
      .sort()
      .map((d) => `use-cases/${d}/README.md`)
    : []

  return [...docs, ...howto, ...cases, ...READMES].filter(exists)
}


module.exports = { gatedDocs, DOC_PAGES, READMES }

if (require.main === module) {
  process.stdout.write(gatedDocs().join('\n') + '\n')
}
