# Development process

How work is done in a project that adopts this file: what an agent
records, how a change is tested before it is pushed, how documentation
and code comments are written, and what each folder holds. Nothing here
belongs to one project, so the file is the same wherever it is used.
What does belong to one project is in its agent guide,
[`AGENTS.md`](AGENTS.md), which an agent reads first and which points
here: the commands that run each gate, the project's own records, and
its exceptions, whose reasons are in its decision record,
[`ADR.md`](ADR.md). A rule that holds in one project only is written
there, not here.

## The prompt log

Every prompt given to an agent working in the project is recorded in
[`sketch/PROMPT-LOG.md`](sketch/PROMPT-LOG.md).

- **Append the entry before the work starts**: the date and time the
  prompt was given, in UTC, the agent that took it, and the prompt as it
  was written, typos included.
- **Name the agent** by its tool and its session. A Claude Code
  session's commits carry the same session in their `Claude-Session`
  trailer; a tool with no session gives its run or task identifier, or
  `no session id`.
- **Redact secrets.** A credential, token or key, or personal data, is
  written as `[redacted: what it was]`. An entry found holding one is
  redacted where it stands, and a secret that reached a push is revoked.
- **Fence the prompt** with more backticks than the longest run of
  backticks inside it.
- **Commit the entry with the first change that follows.** A session
  that ends holding entries and no change commits them on a branch of
  their own, so a question is not lost with its checkout.
- **Never rewrite an entry**, except to redact. The project's
  `.gitattributes` gives the file git's `union` merge driver, so two
  branches' entries both survive.

## Testing

Local testing takes a few minutes at most, and is done with the unit
tests of what changed.

- **Before every push, the quick check**: the gates, the builds and the
  sampled tests that the project's AGENTS.md names, inside two minutes.
  A commit may be broken; a push should not be.
- **Then the tests of what the change touches**: the test file of the
  module changed, the fixtures changed, and the documentation gates
  where a page changed.
- **The long runs belong to the daily CI**: the whole suite, coverage
  and the slow end-to-end runs. They are never run locally before a
  push or a merge, and nothing waits on them.
- **A pull request merges on its own CI.** Once its CI, five minutes at
  most, is green on its head and its review is answered, it merges.
  What the daily run finds is fixed in a change of its own.

## Writing documentation

[`STYLE-GUIDE.md`](STYLE-GUIDE.md) is normative for every published
page. Read it before editing a page.

- The style guide names the gates that hold a page to it, and a change
  to a page passes them before it is pushed.
- A published page cites nothing internal: no decision record, no
  review, and no file under `sketch/` or `admin/`.

## Code comments

A comment is the one claim in a repository that nothing runs. Its
author checks it once; from then on it drifts as the code under it
changes, and nothing reports the drift. A comment that describes what
the code used to do reads exactly like one that is still true. So
comments are few and short, and what they say can be checked.

- **A comment is for code that is hard to follow, or whose correct form
  is surprising**, where a reader's first instinct would be to simplify
  it, and so break it. It says what the code cannot: why an unobvious
  form is needed, which invariant a change would break, what outside
  the file forces the shape. A comment a competent reader could rebuild
  from the code is noise, and is deleted.
- **Intent goes in the name.** Renaming a value, extracting a function
  or naming a constant is preferred to a comment explaining the unnamed
  version. A comment that could be a name is a defect in the name.
- **Requirements go in documents.** Code implements a rule; the rule and
  its reasoning are written where they can be read whole, reviewed and
  cited: in `docs/` or in the decision record. A requirement in a
  comment is a second copy, and the one nobody edits when the rule
  changes.
- **A comment is a line or two.** One that runs to paragraphs is a
  document in the wrong file: what is durable moves to a document, and
  the rest is deleted.
- **Everything a comment names resolves**: a path exists, a symbol in
  backticks is defined by the code, and a decision number is in the
  decision record. A date, a version, an issue number or a count is not
  written, since each was true once and a reader cannot check it now.
- **History belongs to version control.** What broke, what was tried
  and what a review said are told in the commit message and the issue,
  or in the decision record when they are fundamental. `git log -L` and
  `git blame` read them back.
- **A coverage exclusion's justification is a comment like any other**:
  still required, and held to these rules.

Deletion is the default. A comment that fails a rule is removed, not
reworded, and prose worth keeping moves to a document in the same
commit. A file that needs a lot of explanation is reporting a defect in
its structure or its names, and that is the finding. "Add a comment
explaining this" is a request to rename something or to write a
document.

### The comment gate

[`admin/scripts/comment-gate.cjs`](admin/scripts/comment-gate.cjs)
checks every rule above that a machine can check. It is the one checker
wherever the gate runs: by hand, in the test suite so that CI runs it
on every push and pull request, and in a pre-push hook so that a
finding stops a push before CI is spent on it. A hook can be skipped;
CI cannot. The project's AGENTS.md names how each is run.

The gate reads the project's source in every language the project
writes, as [`admin/scripts/comment-gate.json`](admin/scripts/comment-gate.json)
lists it: each source extension with its comment syntax, and any tree
that adds extensions of its own. The same file names what is left out
(generated files, whose comments belong to their generator, committed
build output, and fixture corpora compared byte for byte with what a
generator writes) and the decision record that decision numbers resolve
against. A licence header and a tool directive, such as a compiler
pragma or a linter or coverage switch, are not prose and are exempt. A
language whose comment syntax the gate does not know is added to the
gate's syntax table.

| Rule | Fails when |
|------|-----------|
| `long-block` | a comment block runs longer than 5 lines, where consecutive line comments at one indentation are one block |
| `dense-file` | comment lines exceed 12 % of a file's code lines, in a file with more than 8 comment lines |
| `narrative` | first person, history, or a reference to a review, an issue or a commit |
| `requirements` | requirement or business-rule vocabulary |
| `commented-code` | code is commented out rather than deleted |
| `count-claim` | a count nothing recomputes ("three passes", "48 builtins") |
| `dated-claim`, `issue-ref`, `version-claim` | a date, an issue number or a version |
| `stale-path` | a path does not resolve |
| `stale-symbol` | a symbol in backticks is not defined by the code |
| `stale-adr` | a decision number is not in the decision record |

## What each folder holds

- **`docs/` holds only documentation that is valid and up to date**: the
  tutorials, how-to guides, references and explanations a reader can act
  on, and the contributor pages under `docs/contributing/`. A page that
  stops being true is corrected or removed in the change that made it
  untrue.
- **`admin/` holds administration, maintenance and build notes,
  trackers and scripts**: how the project is run rather than what it
  is. The scripts are in `admin/scripts/`, the comment gate among them.
  None of it is published documentation.
- **`sketch/` holds working files, and every file in it is to be
  ignored**: the prompt log, design notes and drafts. None of it is
  documentation, specification or instruction, and any of it may be out
  of date. The prompt log is kept to its rules above as a record, as is
  any other file there that the project's AGENTS.md names.
  `sketch/README.md` says the same.
- **At the top level**: the agent guide, [`AGENTS.md`](AGENTS.md), which
  `CLAUDE.md` links to; this file; the style guide,
  [`STYLE-GUIDE.md`](STYLE-GUIDE.md); and the decision record,
  [`ADR.md`](ADR.md). A project's other top-level records are listed in
  its AGENTS.md.
