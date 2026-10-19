# The formal definition — design note

Status: P0 LANDED 2026-10-16 (ADR-069); P1 PARTIAL: the data model,
the integer leaf, `string` and `string & empty()`, scalar literals, and
`min`, `max`, and `multiple` landed 2026-10-17, the other three
numeric leaves 2026-10-18, with the prototype
folded into the one definition §3 lays out, made semantic only on
2026-10-18 (§3), and the bounds `above`, `below`, `neq`, `len`, and
`unique`, with `min` and `max` on strings, 2026-10-18, as the second
generated fragment, `test/spec/def-bounds.tsv`, on which both ports
agree with the definition on every row, and `re` and `format` the same
day as the opaque predicates of a `Host` the definition names and never
defines; the read modes wait on the verdicts (P5). P2 PARTIAL: `|`
with each arm's rank, `*` alone as `x | super(x)` with `super` a
function on terms, the positional reading as the reader's, and sealed
lists landed 2026-10-18, probed against both ports first and run as the
third generated fragment, `test/spec/def-choice.tsv`, on which both
agree with the definition on every row; `Output`, `open()`, and ADR-046
and 053 as theorems remain. P3 to P7 not started. The
definition is under `spec/`, its rows under `test/spec/`, and both
ports' runners hold the engines to them.
Date: 2026-10-16
Prompted by: the G12 walkthrough of 2026-10-15. The owner ruled that
an ADR records a software architecture decision and not a language
one, and asked how the language is defined without natural language.
The same day a 270-line Lean sketch of a fragment of the language was
run against both ports: 9,558 of 9,600 enumerated cases agreed, and the
42 that did not were one defect (#319), one open language decision
(`string & empty()` under the meet), and one question the definition
has to answer (what a contradictory schema is).

## 1. What the definition is

The definition is a set of **relations**, written in Lean 4, that say
what the right answer is without saying how to compute it. Three
relations carry the language, and every verb's verdict is defined from
them:

| Relation | The question it answers | The verb that asks it |
|---|---|---|
| `Admits env root v j` | is the data `j`, inside the instance `root`, an instance of the value `v` | `vet` |
| `Output env root v j` | is `j` the one output `v` singles out, inside the output `root` | evaluation, `gen` |
| `Le env (ra, a) (rb, b)` | is every instance of `a` under its root `ra` an instance of `b` under its root `rb` | `subsume` under the `values` profile, `breaking` |

A root rides every relation because a path reference reads the whole
document: evaluation keeps one (`ctx.root`), and `subsume` unfolds
each side against its own (`groot` and `sroot` in `ts/src/subsume.ts`),
anchored by `--at` or not. `subsume`'s other profiles ask more than
`Le`: the default profile also holds the effective default, which is
`Output`'s question (`pref-default-changed` in `test/spec/subsume.tsv`
refuses `*2|number` against `*1|number`, which admit the same numbers),
and the `gen` profile the marks as well. Each profile gets a contract
of its own, built from these relations; `Le` alone is the `values`
profile's.

Each relation is a `Prop`: a statement that is true or false and is established
by proof, never by running anything. Lean refuses to execute one
(`decide (Admits …)` fails to synthesise `Decidable`), which is the line
between a definition and a fourth implementation. Executable code is
admitted into the definition only beside a theorem that it agrees with
the relation it computes, as
`check_iff : check v j = true ↔ Admits env root v j` does for every
value that reads no reference. Without that theorem a Lean program is a third port
with no more authority than the other two.

**Authority.** The definition is normative: the TypeScript and Go
engines are implementations of it, and a shared spec row's expected
value must agree with it wherever the definition covers the row. That
is an architecture decision and is recorded as an ADR (§5). ADR-001's
rule that parity is proved by the shared spec stands; the definition
adds what the spec cannot say, which is what the expected value in a
row *should* be.

**What stays out.** Budgets and the trust contract's event counts,
which finding a refusal reports and at which sites, messages and hints,
performance, the CLI, the language server, the MCP server, packages,
the transparency log, rendering, and `fmt`. These are architecture or
implementation, and ADRs and the shared spec keep governing them.
`canon` and the hash form are syntactic normal forms, and the
definition owes each one obligation. The hash form's is the strong
one, since the pin is documented to move on any semantic change, a
flipped default or a changed mark included: two values with one hash
form admit the same instances, single out the same outputs and carry
the same marks. Canon drops the `close()`, `type()` and `hide()` marks
the hash form keeps, so canon-equal values agree on everything but
what those marks decide, and the definition says exactly what that is.

## 2. The decisions it rests on

Each was ruled on 2026-10-15 and is recorded in the walkthrough log;
the definition encodes them rather than restating them in prose.

1. ADRs record architecture. A language decision is a change to the
   definition, and its record is the Lean diff with the theorems it
   adds or gives up.
2. JSON Schema is not a concept of the language, and the definition
   does not mention it. What the language owes JSON Schema is power:
   what the importer writes for each keyword it carries is an aontu
   value, which the definition defines on its own terms, as
   `number & multiple(1)` holds every whole number and
   `string & empty()` every string. The importer is a tool outside the
   definition, held to the JSON Schema suite. Ruled 2026-10-17,
   replacing the ruling of 2026-10-15 that put the import's two modes
   into the definition as two functions with two contracts; that the
   import writes the natural spelling by default (`type: integer` is
   `integer`) and `--faithful` the exact one stays a ruling about the
   tool.
3. The meet is a greatest lower bound. `string & empty()` is a kind of
   its own, and `string` met with it is `string`; the ports change, the
   definition does not.
4. A schema that admits nothing because its own terms contradict
   (`integer & string`) is an **error**, not an empty value. The
   definition therefore carries a notion of an ill-formed value beside
   `Admits`, and the verdict classes are defined over both.
5. The loop stays a prototype until the fragment covers more of the
   language. This note is the plan for that growth.

## 3. The shape of the definition

A Lake project under `spec/`. Not beside `ts/` and `go/` as a third
implementation, which it is not, and not under `test/spec/`, which
holds the rows it feeds. The toolchain is pinned by a `lean-toolchain`
file. Core Lean only to begin with: the prototype needs no library,
and every library is a network dependency the build would then carry.
One module per layer:

| Module | Holds |
|---|---|
| `Aontu/Data.lean` | the data model, aontu's own values and scalars first: numbers in the four leaves, each held as what it is (an integer and a big integer as an `Int`, a float as its binary64 fields, a big decimal as a coefficient and a scale with no trailing zero), strings, maps, and lists |
| `Aontu/Syntax.lean` | the abstract value forms, one constructor per construct; the concrete grammar stays where it is, and a parser is an implementation |
| `Aontu/Admits.lean` | the admission rules, one per form, and `Instance`, admission of a whole document |
| `Aontu/Output.lean` | from P2: `Gen` and `Output` under a document root, what evaluation singles out, and that it is unique |
| `Aontu/Order.lean` | `Le` with one root per side, the meet as a greatest lower bound, and one contract per `subsume` profile: `values` against `Le`, the default also against `Output` for the effective default, `gen` also against the marks |
| `Aontu/Trial.lean` | the trial-schema layer: `nof`, `when`, `contains`, `must`, `rest`, where negation lives (§4, P4) |
| `Aontu/Verdict.lean` | from P5: ill-formed values, and `valid`, `invalid`, `incomplete` and `error` defined over `Admits` and `Output`, with the `vet` modes as parameters |
| `Aontu/Check.lean` | the verified checker, each function beside its `_iff` theorem |
| `Aontu/Tour.lean` | the examples of [the tutorial](../tutorial-definition.md), each proved |
| `Oracle.lean` | the executable that enumerates values and instances and prints each case with the definition's verdict |
| `Oracle/Print.lean` | the oracle's printer from abstract syntax and data to aontu and JSON text, the one trusted bridge to the ports, and no part of the definition |

Every module but `Output` and `Verdict` is under `spec/`, and they
are one definition: one model of the data, one syntax of values, and one
admission relation, which every other module reads. The prototype of
2026-10-15 came as three files that each declared their own values and
their own admission, with integer ranges, literals, and aliases that
disagreed. On 2026-10-17 it was folded into this layout, each rule
probed against both CLIs first. What the probes refuted was corrected:
`integer` is the leaf the number model states, not `|n| ≤ 2^53`; a
literal is a scalar; an undeclared alias admits nothing. What the
language reads otherwise than the prototype's rules said was left for
its phase: `|` and `*`, which P2 must read by position, and with them
`Output`. The prototype's rule for `%U = %U` was dropped too: §7 rules
it ill-formed, and the definition has no ill-formed values until P5.
Everything compiles on Lean 4.15.0 with no `sorry`; no named theorem
rests on an axiom beyond `propext` and `Quot.sound`, and none on
`Classical.choice`.

On 2026-10-18 the owner directed that the definition hold semantics
only, since it had mixed reading into meaning. A number had carried
whether its text had a point, which no rule read and only the printer
needed, and the printer sat among the definition's modules. The point
went, so a number is its value in lowest terms, and the printer moved
under the oracle. How a text becomes a value is outside the
definition: the grammar and each port's reader. The rows test that
both ports read the oracle's text as the value it prints; no theorem
claims it. The vet modes stay parameters, as decision 5 of §7 rules,
since they change what `valid` means: the data model is the exact
mode's, a number its value, and the default mode waits on the other
leaves (P1). The same day the owner named the number, held as a
decimal coefficient, scale and point, as parsing, and asked for the
scalars first. A number became a rational,
`num / den` in lowest terms, and the modules and the tutorial now take
the integers first, then the numbers, the strings, and the booleans.
No row moved. Later that day the owner asked for the numbers as they
are, ints, floats, and bigs, and asked why a language with no JSON type
had one in Lean. A number is now one of the four leaves, an integer
and a big integer each an `Int`, a float its binary64 fields, and a big
decimal a coefficient and a scale, and the data is aontu's: maps,
lists, and scalars. Lean's own `Float` was not used, as its operations
are opaque to the kernel: `decide` can't compare two of them, and
`native_decide` brings `Lean.ofReduceBool` and `Classical.choice`. Again
no row moved. The owner then asked why vetting the language's own
examples took special flags, and it takes none. The rows had carried
`--no-fill` and `--exact-numbers` since P0, which stated the strict
mode while the data held only integers, on which the flags change
nothing; the fractions and the big integer added later were written
without their leaf and relied on `--exact-numbers` to read them, and
the tutorial copied the flags. The data is now aontu's, whose literals
name their leaf, so the oracle writes `0d1.5` where it wrote `1.5`,
and no term of the fragment holds a literal or a default for the
schema to supply. The rows and the tutorial run plain `vet`: every
row's text changed, and no verdict did. Decision 5 of §7 stands, and
P1 states the modes. The owner then asked why an integer and a big
integer were each a Lean `Int`, and for Lean types named as aontu names
them. The integer leaf's range had been a clause of `Data.WellFormed`,
carried over from the single number type, so a Lean term could hold an
integer the language has not. Each leaf now has its own type,
`Integer`, `Float`, `BigInteger`, and `BigDecimal`, each holding exactly
its leaf's numbers, `Integer` with the proof of its range; `ℤ` and `ℕ`
name Lean's `Int` and `Nat`, so that neither reads as an aontu type. No
row moved.

## 4. How a language decision is made, and recorded

```
a decision  ->  1. change the rules in lean/
                2. lake build: every proof re-checks     a law the decision breaks fails here
                3. the oracle regenerates expected answers from the proved checker
                4. both ports run the cases               a disagreement is a port defect or a missed rule
                5. the ports change until 4 is clean; CI runs 2 to 4 on every push
```

Step 2 is what prose cannot do. When the sketch was asked to keep the
`empty()` waiver (any `empty()` in a meet admits `""`), `meet_le_left`
stopped checking with `""` as the counterexample: the cost of the
decision, a law `subsume` leans on for every string, was named before
any code moved. Choosing the lattice instead changed nothing in the
definition and gave the ports ten cases to fix.

**The record.** The decision's text is the diff under `spec/`: the rule
that changed, the theorems added, the theorems given up and why, in
docstrings beside them. The CHANGELOG entry names the rule and the
theorems. No numbered log runs beside the ADRs (ruled 2026-10-16, §7).

**The migration.** About forty of the sixty-eight ADRs define the
language by their titles (ADR-004, 007, 011, 034, 037, 045 to 053, 055
to 063, 067 and 068 among them). Each moves as the definition reaches
its construct: its rule becomes rules and theorems, its consequences
become the theorems' docstrings, and the ADR keeps its number with a
status line naming the module that now holds it. Numbers are never
reused. `docs/reference-language.md` stays as the explanation of the
definition for a reader, and each section comes to cite the rule it
explains.

## 5. How the implementations are held to it

**Where the expected answers are.** The oracle derives them: it
enumerates values and instances and prints each case with the verdict
the proved checker gives, so an expected answer is never written by
hand and never copied out of an engine. They are stored (ruled
2026-10-16) as rows in the shared format, five columns under a new
mode, `verdict`, which
compares the verdict of `vet(schema, data)` and nothing else, since
the definition gives verdicts and not the codes, sites and messages
the `vet` mode also compares; an `Output` case is a `gens` row, which
the runners already have. The rows are committed, in files of their
own under `test/spec/` named for the generator (`def-*.tsv`), each
with a header naming the generator and the fragment, so a change in
what the definition expects is a diff a reviewer reads. They are
generated copies in the sense `ts/dist`, `sigdecl` and the help corpus
already are: `make spec` regenerates them, and CI fails when the
committed file differs from a fresh one. The mode is in both runners
since P0, and the first file is `test/spec/def-fragment.tsv`.

**How they are compared.** By the spec runners both ports already
have, which read every `.tsv` under `test/spec/`: a generated row runs
like a hand-written one, in both ports, with no Lean installed at test
time. Lean is needed only to regenerate. A case the ports do not yet
answer as the definition does goes in `spec/ledger.tsv`, one row per
case naming the cause and which side moves, read by both runners by
name as `test/vectors/jsonschema/skips.tsv` is: a listed case that
passes fails the run, the ledger is bounded, and the bound tightens as
causes are fixed. The prototype's ledger holds 42 rows under two
causes, decisions 3 and 4 of §2; under the first the ports move, under
the second the definition does. Exhaustive enumeration of small values
over a small instance set is bounded per phase (600 values and 16
instances in the prototype: 9,600 cases, 109 s through both CLIs on
four cores), and random generation of larger ones is seeded, so a
failure reproduces. On 2026-10-17 the instances grew to 24, two
fractions, a whole number no double holds and an array, each also
under a key, numbered after the first 9,600 rows so that none was
renamed: 14,400 cases, every new one answered by both ports as the
definition answers it. The second fraction, `3.5`, replaced on
2026-10-18 a whole number written with a point, `1.0`, which is the
number `1` and differed from it only in its text.

**The shared rows.** The hand-written rows of `test/spec/` stay, and
keep covering what the definition does not: codes, sites, canon, the
hash form, formatting. Where the definition covers a row's construct,
the row's expected value must agree with it as well as with both
engines: the rule that an expectation is obtained by running both
engines and requiring them to agree gains a third voice, and a `vet`,
`gens` or `subsume` expectation the ports agree on but the definition
refuses is a defect in both ports, corrected with the fix. The check
needs the oracle to read a row's source, so P1 adds a reader for the
fragment's concrete syntax beside the oracle's printer, outside the
definition as the printer is; it is trusted the same way, and the two
are checked against each other by round trip.
Today that third voice is the one the probe lacks: two engines that
share a wrong answer pass every row, which is how #319 passed 2,302
suite tests.

- **The subsumption table.** The rules `subsume` applies are a finite
  list in the reference; each becomes a theorem against its profile's
  contract, so the table is sound by construction and a new rule lands
  with its proof.
- **`vet` asks what evaluation asks** (ADR-007) becomes the theorem
  `output_admits`: an output is an instance.
- **CI.** A `spec` job beside the TypeScript and Go jobs: fetch the
  pinned release archive by hash (elan's self-update check does not
  pass the build proxy), `lake build`, regenerate the rows and diff
  them against the committed copies. The ports' own jobs run the rows.
  `make spec` runs the same locally. The job is `build.yml`'s `spec`,
  written as `spec/ci.patch` and applied by hand (ruled 2026-10-16) on
  2026-10-18, since a workflow edit needs the `workflow` scope a push
  from an agent session may lack.

The one trusted piece is the oracle's printer, and from P1 the reader
beside it: it is the only place the abstract syntax meets aontu text,
and a wrong printer makes the rows say the wrong thing. Neither is part
of the definition, which says nothing about text. Each stays small, is
reviewed as the definition is, and is checked by printing each oracle
value and asking both ports for its canon.

## 6. Phases

Sizes follow the register's S, M and L. This note's status line tracks
the phases, as the other design notes do; the register holds the gap
documents only.

| Phase | Lands | Exit |
|---|---|---|
| **P0**: the seed (S) | **LANDED 2026-10-16**, [ADR-069](../../ADR.md#adr-069--the-language-is-defined-in-lean-and-the-ports-implement-it): `spec/` as a Lake project holding the prototype; the `verdict` mode and the ledger read in both runners; the 9,600 cases as `test/spec/def-fragment.tsv`; `make spec`; the CI job, `build.yml`'s `spec`, applied 2026-10-18 from `spec/ci.patch` | every generated row passes in both ports or is in the ledger, which holds only the cases decisions 3 and 4 of §2 own, 10 and 32; the TypeScript runner takes about two minutes over the rows and the Go runner three seconds, the first figure of §5's bound |
| **P1**: data and scalars (M) | the data model (**LANDED 2026-10-17** as `spec/Aontu/Data.lean`; on 2026-10-18 aontu's own data: numbers in the four leaves, strings, maps and lists with unique keys, paths), and the two read modes, which stay parameters (§7, decision 5): the data holds every leaf either mode reads, and stating each mode's reading remains; the four numeric leaves (`integer` **LANDED 2026-10-17**: a double, of magnitude below `2^63`; `float`, `biginteger`, and `bigdecimal` **LANDED 2026-10-18**, as kinds and literals); `string` and `string & empty()` (**LANDED**); literals (scalars **LANDED**, numbers of every leaf **LANDED 2026-10-18**); the bounds `min`, `max`, `above`, `below`, `neq`, `len`, `multiple`, `unique` (`min`, `max`, and `multiple` **LANDED**); `re` and `format` as opaque predicates | the oracle covers every scalar row of `types.tsv` and `vet.tsv`; the sketch's range for `integer` (`\|n\| ≤ 2^53`, wrong: `1e18` is admitted) is replaced by the rule the reference states (**done** 2026-10-17) |
| **P2**: containers (L) | maps with optional and required keys, spreads over every member, the duplicate-key merge, `close()` sealing every level and `open()`; lists with required positions, an open tail and spreads; `&`, `\|` and `*` over containers, read by position as the language reads them (an arm of a disjunction reads a list literal as its own length and `*x` as `x`, and elsewhere `*x` is `x \| super(x)`, so `*1` alone admits `2`: both engines, 2026-10-17); `Output` for containers, which is where filling and ADR-004 live; ADR-045, 046 and 053 as theorems; the rule #319 needs | the ports agree with the oracle over two-level documents; the three ADRs read "moved" |
| **P3**: references (L) | aliases as the least fixpoint, path references into the unified instance, recursion as the single `alias` rule; the meaning of `%U = %U` (§7); the alias-cycle rule | `recursion.tsv` and `alias.tsv` rows covered; `unify_cycle` is a meaning or an error, no longer only a budget |
| **P4**: trial schemas (L) | the admission trial as a definition; `nof`, `when`, `contains`, `must`, `rest`, `match` and `filter`; the layer allowed inside a value under P3's rule; ADR-049 to 051, 055 and 058 as theorems | the go/no-go of §7 is settled; the `constraint-*.tsv` rows are covered |
| **P5**: order and verdicts (M) | one contract per `subsume` profile (§1), the subsumption table as theorems, `incomplete` against `invalid` against `error` defined, the `vet` modes as parameters, ADR-007 as a theorem | every `subsume` row of `test/spec/subsume.tsv` agrees with its profile's contract where decidable; a verdict class disagreement fails the differential |
| **P6**: the power to represent JSON Schema (M) | every value the importer writes for a keyword it carries is a form of the definition, defined on its own terms; the definition names no JSON Schema keyword (decision 2 of §2, ruled 2026-10-17, which retired this phase's first plan: `valid` for the 2020-12 keywords, the import's modes as contracts, and the export's round trip, all of which put JSON Schema in the definition) | the importer's output over the suite's schemas uses only forms the definition holds |
| **P7**: the migration (M, ongoing) | the language ADRs moved as §4 says; the reference cites the rules; the language-change record settled | no ADR after P7 defines a rule the definition holds |

Deferred, each with a reason: the generation verbs `each`, `pack` and
`emit` and the component tree (a transformation language over the
value language, with its own design in G9); formats as ABNF semantics
and the owned regex engine (large, and opaque predicates serve P1);
riders and marks (`meta`, `deprecate`, `hide`, `type`), which do not
change admission; relations (`acyclic`, `inverse`, `rel`); and the
canon and hash obligation of §1.

## 7. Decisions: ruled and open

Each changes a rule. All five were ruled on 2026-10-16 and stand here
until the phase that encodes each lands.

1. **The meaning of `%U = %U`.** Ruled 2026-10-16: ill-formed, an
   `error`. An alias admitted only through itself
   has no finite derivation under the least fixpoint, so it admits
   nothing; the greatest fixpoint would admit everything. Both ports
   answer `unify_cycle`, class `budget`: the least-fixpoint verdict,
   reached by running out of steps. The ruling follows decision 4 of
   §2: a document that names nothing but itself is a contradiction of
   the same kind as `integer & string`, and it follows from the cycle
   rule below.
2. **The alias-cycle rule, and the go/no-go.** Ruled 2026-10-16: the
   rule is adopted; P3 encodes it and proves it before P4 starts, and
   the measure of what it refuses among the bundled models, the use
   cases and the suite is P3's to report. Lean's kernel refuses a
   rule that mentions its own negation, so a trial schema cannot sit
   inside `Admits` as written; the layer above handles `not`, `when`
   and `nof`, and a map holding `nof(…)`, which the importer writes
   constantly, is not yet expressible. The fix is a language rule such
   as "every alias cycle passes through a key or an element, so a
   recursion consumes data": it makes `%T = not(%T)` ill-formed and
   lets the trial layer nest. If the rule fits aontu, Lean fits all of
   aontu; if P3 finds a document it must refuse that the language
   cannot do without, the ruling is reopened there.
3. **Error codes.** The codes are append-only and the ports agree on
   them row by row. In the definition they would be a function from a
   refusal's shape to a code, which is a large table to prove anything
   about. Ruled 2026-10-16: out, with the verdict classes in.
4. **The record of a language change.** Ruled 2026-10-16: the Lean
   diff and the CHANGELOG, as §4 says, and no numbered log beside the
   ADRs; one is cheap to add later and expensive to backfill, so the
   ruling can be revisited without cost.
5. **The vet modes.** `--no-fill` and `--exact-numbers` change what
   `valid` means, so they are parameters of the definition rather than
   options of a CLI; the definition then states what the default mode
   admits that `--no-fill --exact-numbers` refuses. Ruled 2026-10-16:
   parameters.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Proofs need Lean skill the project does not yet have on every contributor | rules are readable without it; a rule may land with its proof marked `sorry` for one phase, and the phase does not land while any remains |
| The printer is wrong and the differential compares the wrong thing | the canon check of §5; the printer is under a hundred lines |
| The owned numbers make the data model heavy | P1 holds each leaf as the reference describes it, and takes a library only if the owned one proves slower to reason about |
| Positivity blocks trial schemas inside values | decision 2 of §7, settled at P3 before P4 is started |
| The exhaustive oracle grows past what CI can run | the exhaustive set is bounded per phase and the random set is seeded; the first 9,600 rows cost the TypeScript runner about two minutes and the Go runner three seconds, so the bound is set with that figure in view |
| The definition and the reference drift | each reference section cites its rule from P7 on, and the link check already reads every tracked page |
| A library dependency brings the network into the build | core Lean until a phase proves the need, and the release archive pinned by hash either way |
