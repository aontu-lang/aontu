# Conventions

The house rules for code, prose and provenance. Summary in
[AGENTS.md](../../AGENTS.md).


## Comments are for the surprising code, and nothing else

[ADR-032](../../ADR.md#adr-032--code-comments-are-sparse-and-terse-intent-lives-in-names-requirements-live-in-documents)
is the rule and `make comments` is the gate, over every `.ts`, `.go` and
`.rs` source outside the generated files and the worked-example corpora.
A comment exists only where the code is intricate or its correct form is
surprising; it runs to a line or two rather than a paragraph; semantic
intent is carried by the identifier name instead; and business logic and
requirements are carried by a document instead. When a comment fails one
of those tests, deletion is the default move, not rewriting.

The gate is not only about form. Its accuracy rules refuse a comment
naming a path, a symbol or a decision number that does not resolve, and
refuse the claims a reader cannot check from the tree — issue numbers,
dates, versions and counts. A comment that has gone stale fails the
build, which is what keeps the surviving prose true.

What a comment used to carry has homes: `docs/design/` for the why
behind a settled decision, [`ADR.md`](../../ADR.md) for a fundamental, the
commit message for how the work went, and `git log -L` / `git blame`
for reading any of it back.

## A document describes the thing, not the session that built it

**Findings, to-do items and CI plumbing do not belong in a README.**
They are issue-shaped: they have an owner, a resolution and an end,
and a document that carries them is stale from the day it is written.

The rb-solar system README carried two such sections and they are the
worked example. *"What the exercise found"* listed five engine defects
turned up while building it, prefaced with "they are listed here
because finding them is what a system like this is for" — a sentence
about the exercise, in a page a reader opens to learn what the system
*is*. *"In CI"* described a patch "waiting to be applied by a
maintainer", which is a task, and which stops being true the moment
someone applies it. Both moved to
[#176](https://github.com/aontu-lang/aontu/issues/176) and
[#177](https://github.com/aontu-lang/aontu/issues/177), where they can
be closed.

So, when writing or revising a document:

- **A defect goes to `use-cases/BUGS.md` or an issue**, never into the
  prose of a page about something else. Cite it from the page if the
  page's argument needs it — as the rb-solar model notes still cite
  §88 — but the record lives where records live.
- **A task goes to an issue.** "Waiting to be applied", "the next step
  is", "someone should" — if it can be *done*, it is not documentation.
- **A narrative of how the work went goes nowhere**, or into the commit
  message that did it. "The plan called for", "a first attempt", "this
  was found when" — the reader wants the conclusion, and the reasoning
  only where it stops them undoing it.
- **What stays** is what remains true once the work is finished: what
  the thing is, how it is built, what holds it, and the reasons a
  reader needs in order not to break it.

The same rule governs `docs/` through
[docs/STYLE-GUIDE.md](../../docs/STYLE-GUIDE.md); this section extends it to
the READMEs under `test/system/` and `use-cases/`, which are published
to the website by `aontu-lang/web` and are read by people who were not
here.


The Rails example's detail guides are published from
`test/system/rb-solar/doc/*.md`. After editing them, run
`node --test test/system/rb-solar/doc/guides.test.mjs`: it checks source
excerpts and executes the render and field-change recipes in a temporary
copy. The runtime application checks remain in the example's `check.sh`.

## Module and package are different words

**A module is imported. A package is published.** They are not
synonyms, and the codebase currently gets this wrong in one visible
place — the `aontu mod` verbs operate on packages.

- A **module** is a language element: what `@"acme.example/schema@1"`
  names, what `resolveModule` resolves, what `canonHash` pins, what
  unifies into a document.
- A **package** is a unit of publication: a versioned, signed archive
  of one or more modules, usually exactly one. It is what a repository
  stores, what a version and a signature cover, what a quota counts,
  and what is retracted or tombstoned.

Write "package repository", "publish a package", "the package's
dependencies". Never "module registry" or "publish a module". The rule
applies to code comments, identifiers, error messages, commit messages
and documentation alike; `docs/STYLE-GUIDE.md` carries the same rule
for published prose.

**Go uses the two words the other way round** — its module is the
published collection and its package is a directory inside one. aontu
cannot follow, because "module" is already the language element in both
ports, in the import syntax and in `MODULE_RE`. So a phrase that sounds
right to a Go user may be wrong here: check which side of the
import/publish line the thing is on rather than trusting the ear.

- Keep new TypeScript code in the style of the surrounding `ts/src` files.
- Go is `package aontu`; exported API is `New().Parse/Unify/Generate`.
  Run `go vet ./...` and `gofmt` before committing.
- Go module releases (a Go module in a subdirectory) use git tags of the
  form `go/vX.Y.Z`, and carry the CLI binaries, packages and the
  package-manager manifests on a GitHub Release at that tag, and the
  image on GHCR (`go/scripts/binaries.sh`; docs/release-and-tag.md).
- Inside an aontu project, everything the tools generate lives under
  `aontu_meta/`: the lockfile `aontu_meta/mod-lock.aon`, the vendored
  closure `aontu_meta/vendor/`, and by design the engine pin
  `aontu_meta/version`. `mod.aon` and the documents stay at the root.
  New tooling that writes into a project writes there
  (docs/capability-review/g6-distribution.md, the layout amendment).

## The site-attribution invariant

**Every site names the file whose text it excerpts.** A value carries
the url of the file it was PARSED FROM, and nothing may overwrite that
with the entry document's name: a report citing `entry.aon:3:7` for
text three files away — at a line the entry may not have — sends a
repair agent to edit the wrong file (use-cases/BUGS.md §25). Two
corollaries a change in this area has to keep:

- Only a value with NO name of its own may be stamped with the entry's.
  Those are the ones the engine minted rather than read.
- A site whose file the run holds no TEXT for reports `-1:-1`. Resolving
  an offset against another document's text names a real line that says
  something else, which is worse than saying nothing.

Provenance ROLES (vet's `data`/`schema`) therefore come from membership
of the url set each walk collected, never from comparing a name against
one entry. The report NAME is separate again: identity is the resolved
absolute path, and the printed name is the one the caller's own
spelling reaches (`displayFile`, both ports), so a report stays
openable from the invoking directory and repo-relative in SARIF.

## Provenance is part of the clone contract

The `why` recorder answers "which line set this value", and a model
that uses templates, generators or references reaches most of its
values by CLONING what the author wrote. So the authored mark lives ON
the value (`WRITTEN` / `base.fwrt`), and every place that carries a
value's SITE carries the mark with it — `Val.clone`, `Val.place`, the
disjunct fold. Deciding authorship by looking an id up in a set
stamped over the parsed tree is the shape that made `why` answer
"nothing met at this path" over values it had just printed
(use-cases/BUGS.md §22–24). Two rules hold it up:

- A value the engine MINTS is constructed rather than cloned and stays
  unmarked. That is what keeps the record to what the author can edit.
- A MEMBER is not a value beside its container (`INNER_OF` /
  `base.finner`): `*1|integer` is one thing the author wrote. The
  containment is recorded as a fact about the document at stamping
  time, never inferred from what the fixpoint happened to meet — the
  latter is what made identical siblings answer differently.

The extra reach is why `set --in-place` refuses a path reached through
a reference: the literal it correctly reports belongs to the referent's
line, and splicing there rewrites it for every reader.

## Colour is a decision about the destination

`NO_COLOR` (set, to anything) turns error-frame ANSI off for every
caller of the library; the CLI additionally turns it off when its own
stderr is not a terminal, and `--jsonl` turns it off unconditionally.
The library cannot see the destination, so the library never decides:
`setColor`/`SetColor` is the CLI's call to make, and a library caller
who knows better can make it too. The full-message twin tests run with
colour ON — the escapes are part of the byte parity they guard — so a
change here must keep the default (no override, no `NO_COLOR`) coloured.

## Mutation caveat (both implementations)

Although `Val.unify` is documented "MUST not mutate", the fixpoint
driver relies on `unify` mutating the result/`this` in place on the
self-unify-with-TOP path (e.g. `MapVal`/`ListVal` write back their
children, `Conjunct`/`Disjunct`/`Ref`/`Pref`/`Func` advance their own
`dc`/`peg`). This is safe **only** because a `Val` tree is unified once,
in place, and is not shared across independent unifications. Do not
cache, reuse, or unify the same parsed `Val` (or a node reachable from
it) in two different `unify` runs — clone first. The same constraint
applies to the Go port. Treat parsed `Val`s as single-use.

## Known TS/Go divergences

Moved to [`DIVERGENCE.md`](../../DIVERGENCE.md) at the repository root, which is
now the single record of permanent TypeScript/Go non-parity — what differs,
what it costs, and why the alternative was rejected. The debt register for
divergences still expected to be FIXED remains
[`test/spec/divergent.tsv`](../../test/spec/divergent.tsv).

Kept in one place deliberately: the same divergence had been described in
an AGENTS.md section, a ledger comment and an upstream doc, and they drifted
apart — the ledger claimed a behaviour was still divergent for some time
