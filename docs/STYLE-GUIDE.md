# Documentation style guide

How the Aontu documentation is written. This guide is normative for
`docs/*.md`, `docs/how-to/*.md`, the use-case READMEs, and the prose
on [aontu.dev](https://aontu.dev) (whose authored pages cite this file
from `aontu-lang/web`'s AGENTS.md). It exists so that a page written
next year sounds like a page written this year, and so that a reviewer
can point at a rule instead of arguing taste.

Three sources feed it, in priority order:

1. **This file.** Where it rules, it rules.
2. The [Google developer documentation style
   guide](https://developers.google.com/style) for everything this
   file does not cover: second person, present tense, active voice,
   sentence-style capitalisation in headings, serial commas, one idea
   per sentence.
3. The register table below decides the fights between the two voices
   the docs blend: Google's plainness and the house voice.

## The structure: Diátaxis, enforced by placement

Every page is exactly one of four kinds, and the kind decides what the
page may do:

| Kind | Files | May | May not |
|---|---|---|---|
| Tutorial | `tutorial.md`, `tutorial-graph.md` | teach step by step, show output for every step, defer detail with a link | argue design, list every flag, assume the reader's goal |
| How-to | `docs/how-to/*.md` | solve one named task, assume competence, link the reference | teach basics, explain design, drift into a second task |
| Reference | `reference-language.md`, `reference-api.md`, `trust.md`, `lsp.md`, `shared-spec.md`, `test-coverage.md` | state facts exhaustively and dryly, pin claims to tests | narrate, persuade, teach |
| Explanation | `explanation.md` | argue, compare, admit trade-offs, tell the design's story | be the only place a fact lives |

One fact appears in all four kinds at different altitudes — met in the
tutorial, used in a how-to, specified in the reference, argued in the
explanation — but the normative statement lives in the reference and
everything else links to it.

`release-and-tag.md` is a deliberate exception: an operator document
dangerous enough that its rationale stays beside its commands. Say so
in the page rather than splitting it.

## The voice

The house voice is Richard Rodger's blog register, adapted per
document kind. The portable part of that voice is its *rhythm*, not
its stock phrases. Ten habits, with the register they apply in:

1. **Open with a concrete fact or a plainly stated problem, then a
   short dry beat.** Tutorials and how-tos. Reference pages open by
   stating what the thing is.
2. **Introduce code with a short colon-terminated sentence** —
   "Write this as `schema.aon`:", "Now vet it:". Never "The following
   code snippet demonstrates". Everywhere.
3. **After a code block, point at the one interesting thing.** Do not
   recap the code. Everywhere.
4. **Parentheses carry definitions, caveats, and at most one dry
   aside per page.** Tutorials and how-tos. In reference pages,
   parentheses carry facts only.
5. **A trade-off gets bolted on with a dash, and the dash earns its
   place.** One per paragraph at most, never two in a sentence.
6. **Alternate one long explanatory sentence with one short verdict
   sentence.** The short sentence is the payoff. Everywhere.
7. **Talk to the reader as "you", and route them** ("If you already
   know CUE, skip to…"). "We" appears only in tutorials, walking
   through code together. "I" appears nowhere.
8. **Show that the code is real.** Every example is executed by the
   test suite; when a page says so, say it plainly ("this output
   comes from the engine, not from the author's memory").
9. **Jokes are self-directed or about the industry's mundanity, and
   the register goes fully serious the moment correctness or safety
   is on the table.** Never joke about the reader, other tools, or an
   error's consequences.
10. **Close by handing the reader something**: a link, a next step,
    one sentence. No summary paragraphs that restate the page.

Exclamation marks: at most one per page, in tutorials only, on a
genuine payoff.

## Banned phrases and patterns

These read as generated filler. Do not use them, in any document,
including commit messages that quote the docs. The enforced subset
lives in `ts/test/docs.test.ts` (the `docs-style` block) and fails the
build; the full list is normative here.

**Words and phrases**: worth noting · it's important to note · at its
core · when it comes to · let's break it down · here's where it gets
interesting · delve · dive into · robust · seamless · comprehensive ·
holistic · leverage · harness (verb) · foster · navigate (figurative)
· landscape (figurative) · realm · testament to · pivotal ·
transformative · game-changing · cutting-edge · groundbreaking ·
underscore (verb) · shed light on · pave the way · unpack · surface
(verb, for insights) · lean into · load-bearing · doing the heavy
lifting · doing the work (of prose about prose) · the right
way/answer/tool/question · at the end of the day · paradigm shift ·
north star · key takeaways · best practices (name the practice
instead).

**Patterns**:
- The contrast frame "not just X, it's Y" / "It's not about X, it's
  about Y", and its cousin "not X — it is Y". One per page at most;
  zero is better. Say what the thing is.
- Announcing structure before delivering it ("There are three things
  to understand").
- Restating the question before answering it.
- A closing one-liner that restates the thesis.
- Stacked short declaratives (four or more in a row).
- Superlative self-ranking ("the most important thing", "the part
  that matters most").

**Punctuation rulings**:
- Em dashes are allowed — the house voice uses them — but sparingly:
  never more than one per sentence, and prefer a comma or parentheses
  when the aside is mild. (A source that banned them outright also
  banned the voice this guide adopts; the phrases above are the part
  of that list this project takes.)
- No emoji in documentation.
- Sentence-style capitalisation in headings (Google style).

## Code snippets: every one is tested

A fenced snippet in a Diátaxis page is either executed by
`ts/test/docs.test.ts` or carries a visible, reasoned skip. The
directive vocabulary — an HTML comment on its own line immediately
before the fence:

```markdown
<!-- test: scenario deploy-gate -->
Opens a named scenario: one temp directory, lasting until the next
scenario directive or the end of the page.

<!-- test: file schema.aon -->
The next fence is written to <scenario-dir>/schema.aon. Re-declaring
a name overwrites it (how "now change the file" recipes are modelled).
Name the file in the prose above the fence too; the harness checks
that the name appears in a code span within three lines.

<!-- test: run -->
The next sh fence is a transcript, executed in the scenario
directory. Lines starting "$ " are commands; following lines are the
expected output; "$ echo $?" pins the previous command's exit code; a
line holding only "..." matches any run of lines. Commands start with
"aontu" (rewritten to the repo CLI, or $AONTU) or use the one stdin
form: echo '<text>' | aontu …

<!-- test: skip <reason> -->
Deliberately unexecuted, with a non-empty reason a reviewer can weigh.
```

Untouched conventions: a self-contained `aontu`/`aon` fence still
parse-checks; one immediately followed by a `json` fence is still a
generate claim (the output must be the engine's, structurally). A
fence carrying a `file` directive is a scenario member and is excluded
from pairing. Untagged fences (diagrams, quoted error text) make no
language claim and are exempt.

Two rules of taste:

- A doc transcript shows a moment: one or two commands, short output.
  Anything needing golden files or bad-input corpora is a use case
  (`use-cases/*/check.sh`), and the doc links to it.
- Lift examples from the use cases wherever one fits. A reader who
  follows the link finds the same shape, alive, with its checks.

## Terminology

- The language and project are **Aontu** (capital A) in prose; the
  command is `aontu`.
- **unification / unify** — the operation. Not "merging" except when
  introducing the idea to newcomers, and then once.
- **refuse / refusal** — what the engine does with bad input. Not
  "reject", not "throw" (except in API contexts where an exception is
  literally thrown).
- **verdict** — vet's answer (valid / invalid / incomplete / error).
- **residual** — a value still waiting for information. Define it on
  first use in any page that needs it; the definition of record is in
  the explanation.
- **entity, identity, relation, edge, predicate** — per the language
  reference's Identity and Declared relations sections.
- Spell error codes as they render: `[aontu/relation_cycle]`.

## Per-kind templates

**Tutorial section**: goal sentence → snippet → output → the one
observation → forward link. Every step's output shown, every snippet
executed.

**How-to guide**: title is the task in imperative or "-ing" form; one
sentence of situation; the recipe; one paragraph of what to watch
for; links (reference for the constructs, a use case for the live
version). Frontmatter: `description`, `group`, `order`.

**Reference section**: definition, then behaviour, then edge cases,
then a pinned example. Every claim that has a spec row can name it.

**Explanation section**: the question, the answer, the argument, the
trade-off admitted. May quote history when the history is the
argument.

## Updating this guide

Change it the way behaviour changes: in the same commit as the first
page that follows the new rule, with the reasoning in the commit
message. The enforced phrase list in `docs.test.ts` and this file must
agree; the test names this file so a drift is a build failure with a
pointer.
