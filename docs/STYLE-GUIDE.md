# Documentation style guide

How the Aontu documentation is written. This guide is normative for
`docs/*.md`, `docs/how-to/*.md`, the sixteen use-case READMEs, the two
package READMEs, and the prose on [aontu.dev](https://aontu.dev) (whose
authored pages cite this file from `aontu-lang/web`'s AGENTS.md). It
exists so that a page written next year sounds like a page written this
year, and so that a reviewer can point at a rule instead of arguing
taste.

Three sources feed it, in a fixed priority order. The same order is
encoded in `.vale.ini`, and every rule switched off there names the
reason:

    house voice  ->  Google  ->  Vale defaults

1. **This file.** Where it rules, it rules. The house voice is Richard
   Rodger's blog register, and the places it wins are listed with their
   reasons rather than left as silent exceptions: first-person plural in
   tutorials, British spellings, quotation punctuation outside the
   quotes, and the parenthesis ration.
2. The [Google developer documentation style
   guide](https://developers.google.com/style) for everything this file
   does not cover: second person, present tense, active voice,
   sentence-style capitalisation in headings, serial commas, one idea
   per sentence, dash spacing.
3. [Vale](https://vale.sh) defaults, which mostly means spelling.

## How this guide is enforced

Two gates check it, both in CI, and they read one file list
(`ts/scripts/gated-docs.cjs`) and one banned list
(`.vale/styles/config/vocabularies/Aontu/reject.txt`) so that neither can
drift from the other:

| Gate | Runs | Checks |
|---|---|---|
| `make prose` (Vale) | `.github/workflows/docs.yml` | spelling, Google's conventions, and the banned list, at the levels set in `.vale.ini` |
| `ts/test/docs.test.ts` | `make test` | the banned list again, em-dash spacing and the ration, the first-person rules, the exclamation ration, no emoji, no internal-document citations, and that every code snippet executes |

The gated set is the reader-facing one: the Diátaxis pages, the how-to
guides, the three contributor references that ship under `docs/`, the
sixteen published use cases, and `README.md` and `ts/README.md`. Design
notes, the capability review, the defect ledgers and the repro corpus are
working documents, and they are out.

**A Google rule sitting below error level was tried at error first and
found wrong for these pages.** `.vale.ini` records what each produced on
a clean run. Two of them are worth knowing about, because the reason is
not taste:

- `Google.EmDash` reported 11 findings and all 11 were false. Vale stops
  skipping fenced blocks part-way through several of these pages, so four
  were inside code fences; the other seven were dashes correctly written
  tight against an inline code span, which Vale reads as spaced once it
  strips the span. Dash spacing is enforced by `docs.test.ts` instead,
  over the project's own fence stripper.
- `Google.OxfordComma` reported 30, of which 16 were real three-item
  lists and were fixed. The other 14 are two-item lists sitting after a
  comma clause, which the rule cannot tell from a list.

## The structure: Diátaxis, enforced by placement

Every page is exactly one of four kinds, and the kind decides what the
page may do:

| Kind | Files | May | May not |
|---|---|---|---|
| Tutorial | `tutorial.md`, `tutorial-graph.md` | teach step by step, show output for every step, defer detail with a link | argue design, list every flag, assume the reader's goal |
| How-to | `docs/how-to/*.md` | solve one named task, assume competence, link the reference | teach basics, explain design, drift into a second task |
| Reference | `reference-language.md`, `reference-api.md`, `trust.md`, `lsp.md`, `shared-spec.md`, `test-coverage.md` | state facts exhaustively and dryly, pin claims to tests | narrate, persuade, teach |
| Explanation | `explanation.md` | argue, compare, admit trade-offs, tell the design's story | be the only place a fact lives |

One fact appears in all four kinds at different altitudes—met in the
tutorial, used in a how-to, specified in the reference, argued in the
explanation—but the normative statement lives in the reference and
everything else links to it.

`release-and-tag.md` is a deliberate exception: an operator document
dangerous enough that its rationale stays beside its commands. Say so
in the page rather than splitting it.

## The published set cites nothing internal

The documentation is written for someone who has the tool and not the
repository. Two sets of documents exist, and only one of them is
published:

| Set | Files | Audience |
|---|---|---|
| Published | `index.md`, `tutorial*.md`, `unification.md`, `reference-*.md`, `trust.md`, `lsp.md`, `use-cases.md`, `how-to/*.md`, the use-case READMEs | anyone using Aontu |
| Internal | `ADR.md`, `docs/design/`, `docs/capability-review/`, `DIVERGENCE.md`, `AGENTS.md`, `use-cases/BUGS.md`, `use-cases/REVIEW.md`, `shared-spec.md`, `test-coverage.md`, `release-and-tag.md` | contributors |

**A published page never cites an internal one.** Not as a link, not
as a parenthetical, not as a bare token. `(ADR-004)` after a rule tells
a reader nothing they can act on: the decision record argues a choice
already made, and the rule it decided is what the page is for. State
the rule and stop.

This runs both ways. A published page may not carry the project's own
history either—what a figure used to say, which release moved it,
which bug report prompted the wording. That belongs in the commit
message, the changelog or the register. A reader wants the language as
it is today.

**The engine's own output is published text.** A refusal that names a
design document sends a user somewhere they cannot go, in place of
telling them what to do—`aontu mod get` did exactly that. A message
names the repair, not the reasoning; the reasoning stays in the source
comment beside it, where a contributor reads it.

Two things the rule does *not* catch, because neither is a citation:
`AGENTS.md` named as the file `aontu agentsmd` writes, and an error
code or a filename that happens to look internal. Both are the
product's own surface.

The rule runs one way. Internal documents cite each other and cite the
documentation freely, because a decision record that does not show its
working is not a decision record. Only the direction out of the published
set is closed.

Two documents in the gated set are exempt, because their reader is a
contributor: `shared-spec.md`, `test-coverage.md` and
`release-and-tag.md`, which ship under `docs/`, and the **root
`README.md`**, which is the repository's front page and whose job
includes pointing at AGENTS.md. `ts/README.md` is not exempt: npm renders
it to somebody who has the package and not the repository.

The enforced subset lives in `ts/test/docs.test.ts` (the
`no-internal-design-references` gate) and fails the build. Vale does not
carry this one, because the file sets differ.

## The voice

The house voice is Richard Rodger's blog register, adapted per
document kind. The portable part of that voice is its *rhythm*, not
its stock phrases. Ten habits, with the register they apply in:

1. **Open with a concrete fact or a plainly stated problem, then a
   short dry beat.** Tutorials and how-tos. Reference pages open by
   stating what the thing is.
2.  **Introduce code with a short colon-terminated sentence**—"Write
   this as `schema.aon`:", "Now vet it:". Never "The following code
   snippet demonstrates". Everywhere.
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
including commit messages that quote the docs.

**The list itself lives in
`.vale/styles/config/vocabularies/Aontu/reject.txt`**, one regular
expression per line. That file is the single source of truth: Vale reads
it in CI, and `ts/test/docs.test.ts` (the `docs-style` block) reads the
same file rather than keeping a second copy, so the two gates cannot
disagree about what is banned. Add a phrase there and both pick it up.
What follows is a reader's summary of it, not a second list; every phrase
is shown as code so that quoting a banned phrase in this guide does not
fail the gate.

It draws on two sources: the original house list, and
[claudisms.ai](https://claudisms.ai/), a catalogue of the patterns that
mark machine-written prose.

**Filler and false emphasis**: `worth noting` · `important to note` ·
`it cannot be overstated` · `at its core` · `when it comes to` ·
`let's break it down` · `here's where it gets interesting` ·
`because it matters`.

**Inflated vocabulary**: `delve` · `dive into` · `robust` · `seamless` ·
`comprehensive` · `holistic` · `intricate` · `leverage` · `foster` ·
`shed light on` · `pave the way` · `pivotal` · `transformative` ·
`game-changing` · `cutting-edge` · `groundbreaking` · `testament to` ·
`paradigm shift` · `realm` · `landscape of` · `navigate` · `unpack` ·
`lean into` · `throughline` · `double-click on` · `mature setup`.

**Consultant register**: `north star` · `key takeaways` ·
`best practices` (name the practice instead) · `at the end of the day` ·
`pressure-test` · `right-size` · `strategic imperative` ·
`three things to know` · `dispatches from` · `best operators` ·
`lessons learned`.

**Metaphor inflation**: `load-bearing` · `heavy lifting` ·
`is doing the work` · `different physics` · `hits hardest` ·
`quietly` (say `silently`, which is the term of art for a failure that
reports nothing, and is what all nine sites this replaced meant).

**The contrast frame and its cousins**: `not just` · `not only X but Y` ·
`it's not about` · `the whole game` · `the entire point` ·
`the only thing that matters`. Say what the thing is.

**False singularity and crowned superlatives**:
`the right way/answer/tool/question` · `the best thing you can do` ·
`if I had to pick` · `what struck me` · `stuck with me` ·
`struck a chord` · `hit a nerve` · `we've seen this movie`.

**Reflective pose**: `sit with` · `worth exploring/considering/asking` ·
`keeps coming back to` · `that's the tell` · `where I landed`.

**Invented observation about people**: `most people` ·
`everyone I've worked with` · `a lot of folks` · `nobody I know`. If it
did not happen, do not claim to have noticed it.

**Signposting**: `let's explore` · `now let's turn to` · `moving on to` ·
`in today's rapidly evolving` · `reflecting a broader trend` ·
`marking a significant shift` · `great question`.

**Requires approval per use.** `honest`, and every form of it, is banned
differently from the rest. The word is fine English; it is on the list
because it had become a tic across this project and jostraca alike, where
it flattered a sentence rather than said anything the sentence did not
already say: `the honest rendering`, `the honest gap`, `keeps the copies
honest`. Nineteen uses came out the day the line was added and none of
them was missed.

**The gate is absolute, and the lack of an inline exemption is the
point.** There is no `allow` comment and no suppression either gate would
honour, because an escape hatch that exists is an escape hatch that gets
used, and this is a word that is easy to reach for. A use the author
wants kept is approved by changing `reject.txt`: one line, in one file,
visible in review, which is where an approval belongs.

### What is not banned, and why

Several entries on the source lists are deliberately absent, because they
name things this project documents. A gate that fires on the subject
matter is a gate people learn to switch off. Each was measured over the
gated set before it was left out:

| Not banned | Hits | Because |
|---|---|---|
| `surface` | 71 | `the API surface`, `the emission surface` is how the reference describes an interface. The banned sense is the verb, for insights, and no rule can tell them apart. |
| `harness` | 5 | Every use is the noun: `a test harness`, `an agent harness`. The banned sense is the verb. |
| `underscore` | 2 | Both uses are about a literal `_` in a key. The banned sense is "to emphasise". |
| `the point is` | 4 | `use it when the point is which failure this is` is a clause doing work, not the filler opener `The point is, ...`. |
| `guarantee` | 19 | Order theory: `the lattice guarantee`, `where each guarantee is conditional`. `Google.ExcessiveClaims` is a warning here for the same reason. |
| `above`, `below` | 135 | Ordinary cross-references inside single long reference pages. Google's accessibility point is real, and `Google.WordListCase` reports them as a warning. |

The rule behind the list: ban the phrase that adds nothing, never the
word that names a thing.

**Matching spans a line wrap.** These pages wrap near 72 columns and most
of the list is multi-word, so both gates join each paragraph before
matching: `worth\nnoting` fails exactly as `worth noting` does. A gate on
physical lines would make where a line happens to break a way through it.

**Patterns** (not mechanically checkable, enforced at review):

- Announcing structure before delivering it ("There are three things to
  understand").
- Restating the question before answering it.
- A closing one-liner that restates the thesis.
- Stacked short declaratives (four or more in a row).
- Superlative self-ranking ("the most important thing", "the part that
  matters most").
- A list of `**Bold term**: explanation` pairs, which is the single most
  recognisable machine-written list. Write sentences, or a table.

**Punctuation rulings**:

- Em dashes are allowed, and take **no space on either side**:
  `a dash—like this`. That is Google's ruling
  ([dashes](https://developers.google.com/style/dashes)), adopted in the
  commit that converted 1,180 spaced dashes across the gated set. They
  stay **rationed to one aside per line**: either a single dash before a
  trailing clause, or one matched pair around a parenthetical, never
  both and never two asides. `docs.test.ts` enforces both halves, for the
  reason given under "How this guide is enforced". Prefer a comma or
  parentheses when the aside is mild.
- In a link list, separate the link from its gloss with a full stop, not
  a dash: `- [Draw a model](how-to/draw-a-model.md). Renders the tree...`.
- A dash between a heading's number or label and its subject is a
  separator, not an aside, and neither spacing reads well once the dash
  closes up. A numbered section takes a full stop
  (`## 01. Service catalog`); a label takes a colon
  (`## Clause 1: hermeticity`).
- Exclamation marks: at most one per page, in tutorials only, on a
  genuine payoff.
- No emoji in documentation.
- Sentence-style capitalisation in headings (Google style).
- British spellings (`-ise`, `-isation`, `colour`). Google style is US
  English; this is one of the places the house voice wins, and
  `Google.Spelling` is switched off in `.vale.ini` for it. Actual
  misspellings are still caught: `Vale.Spelling` runs at error against
  `accept.txt`, which names 201 domain terms.

## Code snippets: every one is tested

A fenced snippet in a Diátaxis page is either executed by
`ts/test/docs.test.ts` or carries a visible, reasoned skip. The
directive vocabulary—an HTML comment on its own line immediately
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
- **unification / unify**—the operation. Not "merging" except when
  introducing the idea to newcomers, and then once.
- **meet**—the operation named as order theory names it. It is a
  term of art, so its **first use on any page links to
  [`unification.md`](unification.md)**; later uses on that page are
  plain. The same rule covers *top*, *bottom*, *lattice* and
  *residual*, which that page also defines. A page using "meet" in the
  ordinary English sense ("the truth is not met yet") links nothing.
- **refuse / refusal**—what the engine does with bad input. Not
  "reject", not "throw" (except in API contexts where an exception is
  literally thrown).
- **verdict**—vet's answer (valid / invalid / incomplete / error).
- **residual**—a value still waiting for information. Define it on
  first use in any page that needs it; the definition of record is in
  the explanation.
- **entity, identity, relation, edge, predicate**—per the language
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
page that follows the new rule, with the reasoning in the commit message.

To ban a phrase, add the regular expression to
`.vale/styles/config/vocabularies/Aontu/reject.txt` and summarise it in
the list above. Both gates pick it up from that one file; there is no
second list to update, and `docs.test.ts` checks that every `# --- … ---`
category in `reject.txt` has a summary here, so a whole category cannot
be added to one and missed by the other.

To change a Google rule's level, edit `.vale.ini` and write down what the
rule produced on a clean run. "It was noisy" is not a reason; "it reported
30 serial commas, of which 14 were two-item lists after a comma clause"
is. A rule demoted without that note reads later as an oversight, and
gets re-promoted by somebody repeating the work.

To accept a word the spelling gate does not know, add it to `accept.txt`
in the same directory, one stem at a time. Never add a suffix pattern:
`\w+ise` accepts `madeupise` too, and punches a hole through the gate
the file exists to make usable. Write a case pair as one regular
expression (`[Aa]ontu`), because two plain lines make Vale enforce one
spelling over the other.
