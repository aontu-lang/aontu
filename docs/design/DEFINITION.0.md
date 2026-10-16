# The formal definition — design note

Status: PROPOSED. Nothing is in the repository yet; the prototype
named in §3 lives in a session scratchpad and is lost with it.
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
| `Admits env root v j` | is the JSON `j` an instance of the value `v` | `vet` |
| `Output env v j` | is `j` the one output `v` singles out | evaluation, `gen` |
| `Le env a b` | is every instance of `a` an instance of `b` | `subsume`, `breaking` |

Each is a `Prop`: a statement that is true or false and is established
by proof, never by running anything. Lean refuses to execute one
(`decide (Admits …)` fails to synthesise `Decidable`), which is the line
between a definition and a fourth implementation. Executable code is
admitted into the definition only beside a theorem that it agrees with
the relation it computes, as `check_iff : check v j = true ↔ admits v j`
does in the sketch. Without that theorem a Lean program is a third port
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
`hash` and `canon` are syntactic normal forms; the definition owes them
one obligation, that canon-equal values admit the same instances, and
nothing more.

## 2. The decisions it rests on

Each was ruled on 2026-10-15 and is recorded in the walkthrough log;
the definition encodes them rather than restating them in prose.

1. ADRs record architecture. A language decision is a change to the
   definition, and its record is the Lean diff with the theorems it
   adds or gives up.
2. JSON Schema translates to the natural aontu equivalent by default
   (`type: integer` is `integer`), and `--faithful` asks for the
   spellings that admit exactly what a 2020-12 validator admits. The
   two modes are two functions in the definition with two contracts:
   `faithful_exact` and `natural_sound`.
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

A Lake project under `lean/`, in the layout `ts/` and `go/` use, with
the toolchain pinned by a `lean-toolchain` file. Core Lean only to
begin with: the prototype needs no library, and every library is a
network dependency the build would then carry. One module per layer:

| Module | Holds |
|---|---|
| `Aontu/Data.lean` | JSON as the data model: numbers as exact decimals carrying their shown form, since `integer` reads the number a value shows (ADR-048) and `--exact-numbers` is a read mode |
| `Aontu/Syntax.lean` | the abstract value forms, one constructor per construct; the concrete grammar stays where it is, and a parser is an implementation |
| `Aontu/Admits.lean` | the admission rules, one per form |
| `Aontu/Output.lean` | `Gen` and `Output`: what evaluation singles out, and that it is unique |
| `Aontu/Order.lean` | `Le`, the meet as a greatest lower bound, `SubsumeCorrect` as the contract any `subsume` must meet |
| `Aontu/Trial.lean` | the trial-schema layer: `nof`, `when`, `contains`, `must`, `rest`, where negation lives (§4, P4) |
| `Aontu/Verdict.lean` | ill-formed values, and `valid`, `invalid`, `incomplete` and `error` defined over `Admits` and `Output`, with the `vet` modes as parameters |
| `Aontu/Check.lean` | the verified checker, each function beside its `_iff` theorem |
| `Aontu/JsonSchema.lean` | `valid` for the 2020-12 fragment, `importNatural`, `importFaithful`, and the export's round-trip contract |
| `Aontu/Print.lean` | the printer from abstract syntax to aontu text, the one trusted bridge to the ports |
| `Oracle.lean` | the executable that enumerates values and instances and prints each case with the definition's verdict |

The prototype that seeds it is four files: `AontuCore.lean` (the meet
laws, ADR-045's merge proved exact, the two import modes and their
contracts, the checker), `WhatNotHow.lean` (admission as inference
rules with aliases, recursion as one rule, `%U = %U`, the `subsume`
contract and a wrong implementation refuted from it), `Structures.lean`
(maps with optional keys, spreads and `close()`, lists, `&`, `|`, `*`,
paths, output, and the trial layer, each example checked against both
CLIs), and `Oracle.lean` with the differential runner. All compile on
Lean 4.15.0 with no `sorry`, on at most the `propext` axiom.

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

**The record.** The decision's text is the diff under `lean/`: the rule
that changed, the theorems added, the theorems given up and why, in
docstrings beside them. The CHANGELOG entry names the rule and the
theorems. No numbered log runs beside the ADRs; the question of whether
one should is open (§7).

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

- **The oracle.** Exhaustive enumeration of small values over a small
  instance set, as the sketch did (600 values, 16 instances), plus
  random generation of larger ones. Both CLIs run every case under
  `vet --no-fill --exact-numbers --max-errors` high enough to see every
  finding, and the verdict class is compared as well as admission. A
  disagreement fails the build. The sketch's run took 109 s for 9,600
  cases on four cores, so the exhaustive set is bounded and the random
  set is seeded.
- **The shared spec.** Where the definition covers a row's construct,
  the checker's answer is a third voice in the parity probe: a `vet`,
  `gen` or `gens` expectation the ports agree on but the definition
  refuses is a defect in both, and the row is corrected with the fix.
  Today that voice is the one the probe lacks, since two engines that
  share a wrong answer pass every row.
- **The subsumption table.** The rules `subsume` applies are a finite
  list in the reference; each becomes a theorem against `Le`, so the
  table is sound by construction and a new rule lands with its proof.
- **`vet` asks what evaluation asks** (ADR-007) becomes the theorem
  `output_admits`: an output is an instance.
- **CI.** A `lean` job beside the TypeScript and Go jobs: fetch the
  pinned release archive by hash (elan's self-update check does not
  pass the build proxy), `lake build`, run the oracle, run the
  differential against both built CLIs. `make lean` runs the same
  locally and joins `make test`.

The one trusted piece is the printer, `Print.lean`: it is the only
place the abstract syntax meets aontu text, and a wrong printer makes
the differential compare the wrong things. It stays small, is reviewed
as the definition is, and is checked by printing each oracle value and
asking both ports for its canon.

## 6. Phases

Sizes follow the register's S, M and L. The register gets a row per
phase when P0 lands, under its same-commit rule.

| Phase | Lands | Exit |
|---|---|---|
| **P0**: the seed (S) | `lean/` as a Lake project holding the four prototype files; `make lean`; the CI job; the ADR of §1 | the build runs in CI and the 9,600-case differential is green except for the cases #319 and decision 3 own, which are listed |
| **P1**: data and scalars (M) | the data model with shown numbers and the two read modes; the four numeric leaves as predicates; `string` and `string & empty()`; literals; the bounds `min`, `max`, `above`, `below`, `neq`, `len`, `multiple`, `unique`; `re` and `format` as opaque predicates | the oracle covers every scalar row of `types.tsv` and `vet.tsv`; the sketch's range for `integer` (`\|n\| ≤ 2^53`, wrong: `1e18` is admitted) is replaced by the rule the reference states |
| **P2**: containers (L) | maps with optional and required keys, spreads over every member, the duplicate-key merge, `close()` sealing every level and `open()`; lists with required positions, an open tail and spreads; `&`, `\|` and `*` over containers; `Output` for containers, which is where filling and ADR-004 live; ADR-045, 046 and 053 as theorems; the rule #319 needs | the ports agree with the oracle over two-level documents; the three ADRs read "moved" |
| **P3**: references (L) | aliases as the least fixpoint, path references into the unified instance, recursion as the single `alias` rule; the meaning of `%U = %U` (§7); the alias-cycle rule | `recursion.tsv` and `alias.tsv` rows covered; `unify_cycle` is a meaning or an error, no longer only a budget |
| **P4**: trial schemas (L) | the admission trial as a definition; `nof`, `when`, `contains`, `must`, `rest`, `match` and `filter`; the layer allowed inside a value under P3's rule; ADR-049 to 051, 055 and 058 as theorems | the go/no-go of §7 is settled; the `constraint-*.tsv` rows are covered |
| **P5**: order and verdicts (M) | `SubsumeCorrect`, the subsumption table as theorems, `incomplete` against `invalid` against `error` defined, the `vet` modes as parameters, ADR-007 as a theorem | `subsume.tsv`'s 237 rows agree with `Le` where decidable; a verdict class disagreement fails the differential |
| **P6**: the JSON Schema boundary (M) | `valid` for the 2020-12 keywords the importer carries; the two modes and their contracts; every natural-mode departure as a theorem; the round trip of ADR-068 as a statement the exporter is held to | the suite's schemas in the fragment round-trip under both modes in the definition as in the ports |
| **P7**: the migration (M, ongoing) | the language ADRs moved as §4 says; the reference cites the rules; the language-change record settled | no ADR after P7 defines a rule the definition holds |

Deferred, each with a reason: the generation verbs `each`, `pack` and
`emit` and the component tree (a transformation language over the
value language, with its own design in G9); formats as ABNF semantics
and the owned regex engine (large, and opaque predicates serve P1);
riders and marks (`meta`, `deprecate`, `hide`, `type`), which do not
change admission; relations (`acyclic`, `inverse`, `rel`); and the
canon and hash obligation of §1.

## 7. Open decisions

Each needs the owner's ruling and changes a rule, so none is taken here.

1. **The meaning of `%U = %U`.** An alias admitted only through itself
   has no finite derivation under the least fixpoint, so it admits
   nothing; the greatest fixpoint would admit everything. Both ports
   answer `unify_cycle`, class `budget`: the least-fixpoint verdict,
   reached by running out of steps. Under decision 4 it may instead be
   ill-formed, an `error`. Proposed: ill-formed, since a document that
   names nothing but itself is a contradiction of the same kind as
   `integer & string`.
2. **The alias-cycle rule, and the go/no-go.** Lean's kernel refuses a
   rule that mentions its own negation, so a trial schema cannot sit
   inside `Admits` as written; the layer above handles `not`, `when`
   and `nof`, and a map holding `nof(…)`, which the importer writes
   constantly, is not yet expressible. The fix is a language rule such
   as "every alias cycle passes through a key or an element, so a
   recursion consumes data": it makes `%T = not(%T)` ill-formed and
   lets the trial layer nest. If the rule fits aontu, Lean fits all of
   aontu; if it does not, the definition stops at P3 and the trial
   layer stays a layer. P3 settles it.
3. **Error codes.** The codes are append-only and the ports agree on
   them row by row. In the definition they would be a function from a
   refusal's shape to a code, which is a large table to prove anything
   about. Proposed: out, with the verdict classes in.
4. **The record of a language change.** The Lean diff and the
   CHANGELOG, as §4 proposes, or a numbered log beside the ADRs in the
   manner of RFCs. The lighter form is proposed; the heavier one is
   cheap to add later and expensive to backfill.
5. **The vet modes.** `--no-fill` and `--exact-numbers` change what
   `valid` means, so they are parameters of the definition rather than
   options of a CLI; the definition then states what the default mode
   admits that the JSON Schema mode refuses. Proposed: parameters.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Proofs need Lean skill the project does not yet have on every contributor | rules are readable without it; a rule may land with its proof marked `sorry` for one phase, and the phase does not land while any remains |
| The printer is wrong and the differential compares the wrong thing | the canon check of §5; the printer is under a hundred lines |
| Exact decimals and the shown form make the data model heavy | P1 models the number the reference describes, and takes `Rat` from a library only if the owned representation proves slower to reason about |
| Positivity blocks trial schemas inside values | decision 2 of §7, settled at P3 before P4 is started |
| The exhaustive oracle grows past what CI can run | the exhaustive set is bounded per phase and the random set is seeded; the sketch's 9,600 cases run in under two minutes |
| The definition and the reference drift | each reference section cites its rule from P7 on, and the link check already reads every tracked page |
| A library dependency brings the network into the build | core Lean until a phase proves the need, and the release archive pinned by hash either way |
