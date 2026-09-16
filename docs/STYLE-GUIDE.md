# Documentation style guide

How the aontu documentation is written. Adapted from Jostraca's
`docs/STYLE-GUIDE.md`, with aontu's terminology, file layout, and
executable-example conventions. This guide is normative for
`docs/*.md`, `docs/how-to/*.md`, the published use-case READMEs, the two
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
   per sentence.
3. [Vale](https://vale.sh) defaults, which mostly means spelling.

## How this guide is enforced

Two gates check it, both in CI, and they read one file list
(`ts/scripts/gated-docs.cjs`) and one banned list
(`.vale/styles/config/vocabularies/Aontu/reject.txt`) so that neither can
drift from the other:

| Gate | Runs | Checks |
|---|---|---|
| `make prose` (Vale) | `.github/workflows/docs.yml` | spelling, Google's conventions, and the banned list, at the levels set in `.vale.ini` |
| `ts/test/docs.test.ts` | `make test` | the banned list again, the no-em-dash rule, the first-person rules, the exclamation ration, no emoji, no internal-document citations, no phase-tracking vocabulary, that every code snippet executes, and that every internal markdown link resolves |
| `ts/scripts/vale-counts.cjs` | `make prose` | that every count in `.vale.ini`, and the total below, are what Vale reports |

The gated set is the reader-facing one: the Diátaxis pages, the how-to
guides, the three contributor references that ship under `docs/`, the
published use cases, the systems under `test/system/` and their guides,
and `README.md` and `ts/README.md`. Design notes, the capability review,
the defect ledgers and the repro corpus are working documents, and they
are out.

**The systems joined the set late, and what happened meanwhile is the
argument for the set being one list.** `aontu-lang/web` publishes
`test/system/<name>/README.md` as `/examples/<name>` and reads this
directory's own README for the status each card shows, and AGENTS.md
said the rules reached there. The file list did not, so neither gate
looked: a status written in the register's vocabulary, dates and all,
was live on `/examples/` for anyone to read.

**The link check reads more than the gated set.**
`every-internal-link-resolves` takes every markdown file the repository
tracks, working documents included, because a renamed heading breaks
links from wherever they were written. It resolves each `](path#anchor)`
against the target file's own headings, under GitHub's slug rules.

**A Google rule sitting below error level was tried at error first and
found wrong for these pages.** `.vale.ini` records what each produced on
a clean run: 4092 alerts across 82 files. Two of them turn on a reason
rather than on taste:

- `Google.EmDash` is disabled because its spacing rule is redundant
  under the house ban. The local documentation gate checks prose
  after stripping code and quoted output.
- `Google.OxfordComma` is right about half the time here. Of its 40
  hits, 19 are two-item lists sitting after a comma clause, which the
  rule cannot tell from a list; the other 21 are real lists still
  missing the comma, and each is fixed in its page's next edit.

**Those numbers are measured, not remembered.** They were written by
hand once and were out by a factor of two the next time anybody
checked, which is the one thing a recorded count exists to prevent.
`node ts/scripts/vale-counts.cjs` reads every one of them, and the total
above, against a live Vale run and fails on any difference; `--write`
re-measures. A rule switched off is measured with it switched back on,
because the count is the evidence for switching it off.

## The structure: Diátaxis, enforced by placement

Every page is exactly one of four kinds, apart from the two navigation
pages named under the table, and the kind decides what the page may
do:

| Kind | Files | May | May not |
|---|---|---|---|
| Tutorial | `tutorial-config.md`, `tutorial-graph.md`, `tutorial-package.md`, `tutorial-generate.md`, listed by `tutorial.md` | teach step by step, show output for every step, defer detail with a link | argue design, list every flag, assume the reader's goal |
| How-to | `docs/how-to/*.md` apart from `README.md` | solve one named task, assume competence, link the reference | teach basics, explain design, drift into a second task |
| Reference | `reference-language.md`, `reference-api.md`, `trust.md`, `lsp.md`, `shared-spec.md`, `test-coverage.md` | state facts exhaustively and dryly, pin claims to tests | narrate, persuade, teach |
| Explanation | `explanation.md` | argue, compare, admit trade-offs, tell the design's story | be the only place a fact lives |

One fact appears in all four kinds at different altitudes (met in the
tutorial, used in a how-to, specified in the reference, argued in the
explanation) but the normative statement lives in the reference and
everything else links to it.

Two pages in the set are navigation rather than one of the four kinds:
`tutorial.md` lists the tutorials and `docs/how-to/README.md` lists the
guides. Each says what its set holds and where to go when that set is
the wrong shape, and neither teaches nor argues, so the relaxations a
tutorial gets (the first-person plural, the one exclamation mark) do
not reach them.

`release-and-tag.md` is a deliberate exception: an operator document
dangerous enough that its rationale stays beside its commands. Say so
in the page rather than splitting it.

## The published set cites nothing internal

The documentation is written for someone who has the tool and not the
repository. Two sets of documents exist, and only one of them is
published:

| Set | Files | Audience |
|---|---|---|
| Published | `index.md`, `tutorial*.md`, `unification.md`, `reference-*.md`, `trust.md`, `lsp.md`, `use-cases.md`, `how-to/*.md`, the use-case READMEs, `test/system/README.md` and each system's README and `doc/*.md` | anyone using aontu |
| Internal | `ADR.md`, `docs/design/`, `docs/capability-review/`, `DIVERGENCE.md`, `AGENTS.md`, `use-cases/BUGS.md`, `use-cases/REVIEW.md`, `shared-spec.md`, `test-coverage.md`, `release-and-tag.md` | contributors |

**A published page never cites an internal one.** Not as a link, not
as a parenthetical, not as a bare token. `(ADR-004)` after a rule tells
a reader nothing they can act on: the decision record argues a choice
already made, and the rule it decided is what the page is for. State
the rule and stop.

This runs both ways. A published page may not carry the project's own
history either: what a figure used to say, which release moved it,
which bug report prompted the wording. That belongs in the commit
message, the changelog or the register. A reader wants the language as
it is today.

**The engine's own output is published text.** A refusal that names a
design document sends a user somewhere they cannot go, in place of
telling them what to do: an early `aontu get` refusal did exactly
that. A message names the repair, not the reasoning; the reasoning
stays in the source comment beside it, where a contributor reads it.

Two things the rule does *not* catch, because neither is a citation:
`AGENTS.md` named as the file `aontu agentsmd` writes, and an error
code or a filename that happens to look internal. Both are the
product's own surface.

The rule runs one way. Internal documents cite each other and cite the
documentation freely, because a decision record that does not show its
working is not a decision record. Only the direction out of the published
set is closed.

The contributor documents in the gated set are exempt, because their reader is a
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
2.  **Introduce code with a short colon-terminated sentence**: "Write
   this as `schema.aon`:", "Now vet it:". Never "The following code
   snippet demonstrates". Everywhere.
3. **After a code block, point at the one interesting thing.** Do not
   recap the code. Everywhere.
4. **Parentheses carry definitions, caveats, and at most one dry
   aside per page.** Tutorials and how-tos. In reference pages,
   parentheses carry facts only.
5. **State a trade-off in a separate clause or sentence.** Use a comma,
   parentheses, or a new sentence; punctuation should not supply drama.
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

The next five categories come from **AiTells**, a Vale package by Krishna
Sunkam, MIT licensed, at `github.com/krishnasunkam/vale-ai-tells`. They
are carried as patterns rather than as a package, so `reject.txt` stays
the one place both repositories read. Each produced zero alerts on the
gated set and on the built website before it was added, under the Node
rules and under Vale, and each was checked against a sentence it must
catch.

**Inflated copulas**: `serves as a/the` · `stands as a` ·
`represents a significant` · `boasts a`. The copula is carrying weight a
plain verb should carry. Name what the thing does.

**Cliche**: `in a nutshell` · `low-hanging fruit` · `move the needle` ·
`thought leader` · `best-in-class` · `state-of-the-art` ·
`tip of the iceberg` · `win-win` · `secret sauce` ·
`double-edged sword` · `perfect storm` · `fast-paced world` ·
`ever-evolving`.

**Vague attribution**: `responsible for` · `duties included` ·
`in charge of` · `tasked with`. Say what the code does, not what it is
for.

**Nominalisation: the verb is hiding in the noun**: `conduct`,
`perform`, `undertake`, `carry out` or `engage in` followed by a noun
ending `-tion`, `-sion`, `-ment`, `-ance` or `-sis`. Write `analyse`,
not `conduct an analysis`. `provide` and `make` are NOT in the pattern:
both are ordinary verbs here, and one of them names a page
(`provide-defaults.md`).

**Three abstractions where one concrete noun belongs**: three abstract
nouns in a list, as `clarity, rigor and craft`. Name the concrete thing.

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

Four AiTells rules are absent for reasons of their own.
`VirtueHonest` is redundant: `honest(y|ly)?` above bans the stem, which
is broader than its phrase list. `StatusBracket`, which catches a
`[RED]`-style grade in prose, cannot be expressed here: both gates wrap
every line as `\b(?:...)\b`, and a pattern opening with `[` can never
satisfy that leading word boundary. `CodeToken`, which catches an
identifier written as prose, needs case to work, and this file is
matched case-insensitively by design -- so `[A-Z]` also matches
lowercase and it reported `mapval_required` and `correlation_id` in
quoted output, ten times over the gated set. Its remaining rules score
above zero here: `Passive` 1122, `Adverb` 239, `EpigramContrast` 57 and
`NeverTag` 48, each firing on a construction the house voice uses on
purpose.

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

**Matching spans a line wrap, in the local gate.** These pages wrap near
72 columns and most of the list is multi-word, so `docs.test.ts` joins
each paragraph before matching: `worth\nnoting` fails exactly as
`worth noting` does. Vale matches within a line and does not catch that
one, which is the second reason the local gate carries the list as well
as Vale rather than deferring to it.

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

Avoid vague metaphors such as "the engine" for value, "shape" for an
argument, or "carry" for an idea. Use literal terms for the technical
subject: an API surface, a test harness, and a schema shape are valid.
Do not announce value with "real" or "useful"; state what the reader can do.
Do not invent claims about how much code agents produce or what teams know.
State the input, the check, the result, and any limit on that result.

**Punctuation rulings**:

- Do not use em dashes in prose. Use a comma, parentheses, a colon, or
  another sentence. Preserve punctuation in literal code and quoted output.
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
  `accept.txt`, which names 216 domain terms.

## Code snippets: every one is tested

A fenced snippet in a Diátaxis page is either executed by
`ts/test/docs.test.ts` or carries a visible, reasoned skip. The
directive vocabulary: an HTML comment on its own line immediately
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

<!-- fmt: keep <reason> -->
The next Aontu fence keeps its spelling rather than the agreed form
(below), with a non-empty reason a reviewer can weigh. It rides beside
a test directive, in either order.
```

Untouched conventions: a self-contained `aontu`/`aon` fence still
parse-checks; one immediately followed by a `json` fence is still a
generate claim (the output must be the engine's, structurally). A
fence carrying a `file` directive is a scenario member and is excluded
from pairing. Untagged fences (diagrams, quoted error text) make no
language claim and are exempt.

**Every aontu fence is in the agreed form.** What `aontu fmt` writes is
what the page shows, as Go's documentation is `gofmt`-clean: the gate
formats every `aontu`/`aon` fence that parses and refuses a page whose
fence would change. Write the example, run it through `aontu fmt`, and
paste what comes back. The exception is a fence whose *spelling* is the
lesson -- two statements that meet, a document split across files, a
conflict between two writers, the input a transcript formats -- and it
says so with `fmt: keep` and a reason; a kept fence must still be a
fixed point of the formatter, and the gate caps how many there are.
The form itself is in the language reference, "The formatted form".

Two rules of taste:

- A doc transcript shows a moment: one or two commands, short output.
  Anything needing golden files or bad-input corpora is a use case
  (`use-cases/*/check.sh`), and the doc links to it.
- Lift examples from the use cases wherever one fits. A reader who
  follows the link finds the same shape, alive, with its checks.

## Figures are drawn by the engine

A picture of how aontu works is a claim about aontu, and a claim drawn
by hand goes stale silently. **Every figure in a published page is
generated**: declared in `ts/scripts/figures.cjs`, written to
`docs/figures/`, rebuilt by `make build-ts`, and held to the engine by
`ts/test/docs.test.ts`.

- A page shows one with `![alt](figures/<name>.svg)`. The alt text says
  what the figure *shows*, in a sentence, not what it is called: a
  reader who cannot see it gets the same information.
- To add one, add an entry to `FIGURES` and run `make build-ts`. The
  gate refuses a figure a page names but the table does not have.
- Box-drawing pictures are still fine where they are *output*: a
  transcript of a `view` figure under a `test: run` directive is the
  engine's own bytes, checked like any other transcript. What is
  banned is the hand-drawn one, which is a second source of truth for
  something the engine already knows.

## Terminology

- The language and project are **aontu**: lowercase, no fada, in prose
  and in headings alike. Not "Aontu", not "Aontú": that is the Irish
  word the name comes from, and it is not the name. It is spelled the
  way you type it, because a project whose claim is that one definition
  is spelled one way should manage it for its own name. Enforced by
  `ts/test/docs.test.ts` (`the-name-is-spelled-aontu`).

  Two things keep a capital, and both are identifiers rather than the
  name: the engine's exported API (`Aontu`, `AontuOptions`,
  `AontuContext`, `AontuError`, and Go's `aontu.Aontu`), and the Vale
  style and vocabulary directory `.vale/styles/…/Aontu`, which is a
  Vale style name. Renaming either would break code rather than change
  prose.
- **module / package**: these are not synonyms and must never be
  swapped. A **module** is a language element: what `@"…"` names, what
  an import resolves, what the canon-hash pins, what unifies into a
  document. A **package** is a unit of publication: a versioned,
  signed archive of one or more modules, usually one. So a module is
  *imported* and a package is *published*; a package is what a
  repository stores, a version bears, a quota counts and a signature
  covers. Write "package repository", "publish a package", "the
  package's dependencies"; never "module registry" or "publish a
  module". **Go uses the two words the other way round**, so a
  sentence that reads naturally to a Go user may be wrong here: check
  which side of the import/publish line the thing sits on rather than
  trusting the ear.
- **unification / unify**: the operation. Not "merging" except when
  introducing the idea to newcomers, and then once.
- **meet**: the operation named as order theory names it. It is a
  term of art, so its **first use on any page links to
  [`unification.md`](unification.md)**; later uses on that page are
  plain. The same rule covers *top*, *bottom*, *lattice* and
  *residual*, which that page also defines. A page using "meet" in the
  ordinary English sense ("the truth is not met yet") links nothing.
- **refuse / refusal**: what the engine does with bad input. Not
  "reject", not "throw" (except in API contexts where an exception is
  literally thrown).
- **verdict**: vet's answer (valid / invalid / incomplete / error).
- **residual**: a value still waiting for information. Define it on
  first use in any page that needs it; the definition of record is in
  the explanation.
- **entity, identity, relation, edge, predicate**: per the language
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
36 serial commas, every one a two-item list after a comma clause"
is. A rule demoted without that note reads later as an oversight, and
gets re-promoted by somebody repeating the work. Run `make prose-counts`
afterwards: the note is checked against a live run, so a number typed
from memory fails.

To accept a word the spelling gate does not know, add it to `accept.txt`
in the same directory, one stem at a time. Never add a suffix pattern:
`\w+ise` accepts `madeupise` too, and punches a hole through the gate
the file exists to make usable. Write a case pair as one regular
expression (`[Aa]ontu`), because two plain lines make Vale enforce one
spelling over the other.

## Website guidance

The website's [STYLE-GUIDE.md](https://github.com/aontu-lang/web/blob/main/STYLE-GUIDE.md)
adapts these rules for authored pages, metadata, and accessibility labels.
It also adopts the concrete problem statements, imperative steps, observable
results, and scoped comparisons from `metsitaba/voxgig-web01`'s how-to guide.
Keep aontu's British spelling and tutorial conventions. Its reference pages
do not use Voxgig's comparison-page template or mandatory word quotas.
The website syncs the shared Vale vocabulary and word-choice rule from this
repository; change them here and regenerate the website copies.
