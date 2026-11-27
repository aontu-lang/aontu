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
   does not cover.
3. [Vale](https://vale.sh) defaults, which mostly means spelling.

## How this guide is enforced

Two gates check it, both in CI, and they read one file list
(`ts/scripts/gated-docs.cjs`) and one banned list
(`.vale/styles/config/vocabularies/Aontu/reject.txt`) so that neither can
drift from the other:

| Gate | Runs | Checks |
|---|---|---|
| `make prose` (Vale) | `.github/workflows/docs.yml` | spelling, Google's conventions, and the banned list, at the levels set in `.vale.ini` |
| `ts/test/docs.test.ts` | `make test`; its style rules and link check also through `ts/test/docs-style.test.ts` in the gate group, so `make quick` and every push run them | the banned list again, the no-em-dash rule, the first-person rules, the exclamation ration, no emoji, no internal-document citations, no phase-tracking vocabulary, that every code snippet executes, and that every internal markdown link resolves |
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
a clean run: 5711 alerts across 95 files. Two of them turn on a reason
rather than on taste:

- `Google.EmDash` is disabled because its spacing rule is redundant
  under the house ban. The local documentation gate checks prose
  after stripping code and quoted output.
- `Google.OxfordComma` is right about half the time here. Of its 45
  hits, some are two-item lists sitting after a comma clause, which the
  rule cannot tell from a list, and the rest are real. A rule that
  wrong cannot fail a build, and an author reading its output can tell
  the two apart in the page in front of them.

**Those numbers are measured, not remembered.** They were written by
hand once and were out by a factor of two the next time anybody
checked, which is the one thing a recorded count exists to prevent.
`node ts/scripts/vale-counts.cjs` reads every one of them, and the total
above, against a live Vale run and fails on any difference;
`make prose-counts` re-measures, with `--write`, and a change to a page
that moves a count runs it in the same commit. A rule switched off is
measured with it switched back on, because the count is the evidence
for switching it off.

## The structure: Diátaxis, enforced by placement

Every page is exactly one of four kinds, apart from the two navigation
pages named under the table, and the kind decides what the page may
do:

| Kind | Files | May | May not |
|---|---|---|---|
| Tutorial | `tutorial-config.md`, `tutorial-graph.md`, `tutorial-package.md`, `tutorial-generate.md`, `tutorial-definition.md`, listed by `tutorial.md` | teach step by step, show output for every step, defer detail with a link | argue design, list every flag, assume the reader's goal |
| How-to | `docs/how-to/*.md` apart from `README.md` | solve one named task, assume competence, link the reference | teach basics, explain design, drift into a second task |
| Reference | `reference-language.md`, `reference-generation.md`, `reference-functions.md`, `reference-errors.md`, `reference-api.md`, `trust.md`, `lsp.md`, `shared-spec.md`, `test-coverage.md` | state facts exhaustively and dryly, pin claims to tests | narrate, persuade, teach |
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
| Internal | `ADR.md`, `sketch/`, `sketch/capability-review/`, `admin/`, `DIVERGENCE.md`, `AGENTS.md`, `use-cases/BUGS.md`, `use-cases/REVIEW.md`, `shared-spec.md`, `test-coverage.md`, `release-and-tag.md` | contributors |

**A published page never cites an internal one.** Not as a link, not
as a parenthetical, not as a bare token. `(ADR-104)` after a rule tells
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
belongs in the contributor documentation.

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
   this as `schema.aontu`:", "Now vet it:". Never "The following code
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
- A second claim carried by a phrase in a sentence about something else.
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
  `accept.txt`, which names 223 domain terms.

## Writing rules

### Sentences

- Use the active voice. Use the passive only when the actor is unknown
  or irrelevant.
- Use the present tense: the command "writes", not "will write".
- Write instructions in the imperative: "Run", "Open", "Set".
- Make one claim per sentence, and keep sentences short enough to read
  once.
- A phrase that brings in a new fact, such as `into one tree` or
  `in under a second`, is a second claim, however short. So is a
  relative clause, an appositive or a parenthesis that adds a fact. Give
  it its own sentence.
- To find a hidden claim, delete each phrase in turn. If what is lost is
  a new fact rather than part of the claim's explanation, it needs its
  own sentence.
- Give a list a sentence of its own.
- Lengthen a sentence only by explaining its claim, with a reason, an
  example or a consequence. Mend a run of short sentences the same way,
  never by merging claims.
- Allow a little redundancy, which aids comprehension. Repeat a key noun
  rather than use a distant pronoun or a synonym, and restate a key fact
  in a section a reader may reach directly. A closing recap of the whole
  page is still filler.
- Keep paragraphs short, each on one subject stated in its first
  sentence.
- Put the key point first in the page, the paragraph and the heading.
  Move edge cases later, or behind a link.
- End a sentence on the words that matter most to its claim. Never
  append a second claim to take that place.
- Keep related words together: a subject near its verb, and a modifier
  next to the word it modifies.
- Avoid a run of sentences that each join two clauses with `and`, `but`
  or `which`.
- Keep a summary in one tense.
- Say what to do rather than what to avoid.
- Follow "this" with a noun, and give "it" one clear antecedent.
- Keep list items and headings grammatically parallel.
- Hedge only real uncertainty, and name it.
- Use common contractions such as `it's` and `don't`, not unusual ones
  such as `would've`.

### Words

- Be specific. Name the command, the file, the number and its unit, and
  cut `very`, `really` and `quite`.
- Prefer the short, common word: `use`, not `utilise`; `start`, not
  `commence`.
- Cut words that carry nothing: `in order to` is `to`.
- Use the plain word, or define the technical term at its first use.
- Use one term for one concept, throughout.
- Spell product and project names as their owners do, and never use one
  as a verb, a plural or a possessive.
- Never call a task easy, simple or quick, and drop `just`, `simply`,
  `obviously` and `of course`.
- Claim only what the page shows: no superlatives and no promises.
- Use `must` for a requirement, `can` for an ability and `may` only for
  permission, and give every `should` its reason.
- Write a verb as two words and its noun as one: `set up` and `setup`,
  `log in` and `login`, `back up` and `backup`.
- Write `for example`, `that is` and `and so on`, not `e.g.`, `i.e.` and
  `etc.`
- Write `and` or `or`, not a slash, and never `and/or`. In prose, write
  `and`, not `&` or `+`.
- Leave `please` and `thank you` out of instructions.
- Say what software does, not what it wants, thinks or knows.
- Let the verb carry the action: `decide`, not `make a decision`.
- Prefer a one-word verb to a phrasal verb: `remove`, not `get rid of`.
- Leave out idioms, slang and cultural references.

### Mechanics

- Capitalise proper nouns and product names, and nothing else.
- Spell out an abbreviation at its first use, unless the short form is
  better known, as `API` is.
- Write numbers from zero to nine as words and from 10 as numerals. Use
  numerals for every measurement, version, size and value the reader
  types, and never open a sentence with one.
- Write dates as `4 November 2026`, or as `2026-11-04` where a program
  reads them, and never as `11/04/2026`.
- Put a space between a number and its unit (`10 GB`), non-breaking
  where the format allows, and none before `%`.
- Use the serial comma: `red, green, and blue`.
- Hyphenate a compound modifier before its noun (`a well-known tool`)
  but not after it, and never after an adverb ending in `-ly`.
- Prefer two sentences to a semicolon.
- Never join two independent clauses with a comma alone. Use a full
  stop, or a conjunction after the comma.
- Make an opening phrase refer to the subject that follows it:
  `After you install the package, the server restarts`, not
  `After installing the package, the server restarts`.
- Give each kind of element one format, and keep it everywhere.
- Keep emphasis rare: no capitals or underlining, and bold only for
  interface labels and the opening sentence of a rule.

### Readers

- Write for a named reader: what they already know, and what they came
  to do.
- Write for readers whose first language is not English, and for
  translation: literal phrasing, whole sentences, and the small words
  that remove ambiguity (`verify that the file exists`).
- Organise a page around the reader's task, not the product's
  structure.
- Give the reason for a step when it changes what the reader does.
- Never blame the reader. Say what happened and how to put it right.
- Write inclusively: the singular `they`, gender-neutral words
  (`staff hours`, not `man-hours`), and no assumptions about the
  reader.
- Describe people in their own terms, and mention age, disability,
  gender or ethnicity only where it matters.
- Use no disability as a figure of speech, such as `crazy`, `lame` or
  `blind to`.
- Write `allowlist`, `denylist`, `primary`, `replica` and `main`, and
  show a legacy term only in code that requires it.
- Prefer a neutral verb to a violent one, `stop` rather than `kill`,
  except when naming a command.
- Never identify something by colour, shape or position alone.
- Never make `above` or `below` the only clue to a location: name or
  link the thing.
- Draw examples from more than one culture.
- Document a way to complete each task with the keyboard alone.
- Caption or transcribe video and audio.

### Structure

- Make a heading say what its section answers or does, key word first.
- Nest headings in order, and never skip a level.
- Title a page with its subject or task, in the reader's words.
- Introduce a list with a sentence ending in a colon. Give it at least
  two items, capitalise each, and end them with full stops when any
  item is a sentence.
- Number a list when order matters, and bullet it otherwise.
- Use a table for items compared on the same attributes, with a header
  row and short cells, and never for layout.
- Keep notes and warnings for what the reader must not miss, never
  stack them, and put a warning before its step.

### Procedures

- Introduce a procedure with a heading or sentence that names the task.
- State the prerequisites before the first step.
- Number the steps, one action to a step.
- Put the goal or location before the action: "To build the site, run
  `make build`".
- Start an optional step with `Optional:`.
- Show what a step produces where the reader can check it.

### Links and figures

- Make link text say where it goes, never `here` or `click here`.
- Phrase a cross-reference as `For more information, see` and the
  linked page title.
- Prefer link text to a bare URL, and put a URL that must show in code
  font.
- Link the primary source, and say when a link leaves the documentation
  or downloads a file.
- Cite the source of any claim the page does not establish.
- Use a figure only where it shows what prose cannot, and keep the text
  complete without it.
- Caption a figure with what it shows, and label its parts.
- Crop a screenshot to what matters, and keep personal data out of it.

### Interfaces and code

- Name an interface element exactly as it appears, in bold.
- Use the verb for the input: `click`, `tap`, `press` or `type`, and
  `select` for choosing from a set.
- Name an element's type only when its label is ambiguous: "Click
  **Save**", not "Click the **Save** button".
- Write a menu path as **File** > **Save**.
- Name keys as printed, joined by `+`: `Ctrl+C`.
- Make an error message say what went wrong and what to do next,
  without blame or a guessed cause.
- Start a button or command label with a verb.
- Build a message from whole sentences, never from joined fragments.
- Put in code font anything typed or printed: commands, options, paths,
  file names, values and identifiers.
- Mark placeholders one way, such as `<name>`, and say what replaces
  them at first use.
- Keep a command apart from its output.
- Use reserved example values (`example.com`, `192.0.2.0/24`,
  `2001:db8::/32`) and fictional names, never real personal data or
  working keys.
- State the versions a page assumes, where the result depends on them.
- State a feature's support status, such as experimental or deprecated,
  before describing it, and never describe what has not shipped.

## Code snippets: every one is tested

A fenced snippet in a Diátaxis page is either executed by
`ts/test/docs.test.ts` or carries a visible, reasoned skip. The
directive vocabulary: an HTML comment on its own line immediately
before the fence:

```markdown
<!-- test: scenario deploy-gate -->
Opens a named scenario: one temp directory, lasting until the next
scenario directive or the end of the page.

<!-- test: file schema.aontu -->
The next fence is written to <scenario-dir>/schema.aontu. Re-declaring
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

<!-- test: quote <path> -->
The next fence is a run of lines of the repository file at <path>,
unchanged and in order. Used to quote the Lean definition under spec/,
whose own build proves what the lines say; the harness checks only
that the page still says them.

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
  [`unification.md`](docs/unification.md)**; later uses on that page are
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
