# The formal definition — design note

Status: P0 LANDED 2026-10-16 (ADR-069); P1 PARTIAL: the data model,
the integer leaf, `string` and `string & empty()`, scalar literals, and
`min`, `max`, and `mulof` landed 2026-10-17, the other three
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
agree with the definition on every row, and the meet computed as
`meet` in `spec/Aontu/Meet.lean` on 2026-10-19, beside `admits_meet`,
which holds it to what both sides admit, and `Output` on 2026-10-19:
`Gen` in `spec/Aontu/Output.lean`, with `output_admits` (ADR-007) and
`output_unique`, run as the fourth generated fragment,
`test/spec/def-gen.tsv`, on which both ports agree with the definition
on every row; `open()`, and ADR-046 and 053 as theorems remain. P5
PARTIAL: the verdicts landed 2026-10-19, `Vet` in
`spec/Aontu/Verdict.lean` with the fill and `--partial` as the mode's
two switches, held to `Instance` and `Output` by three theorems and
run as the fifth generated fragment, `test/spec/def-verdict.tsv`, on
which both ports agree with the definition on every row; the
subsumption table and the profile contracts remain. P3 LANDED
2026-10-19: the graph of names landed that day, `Decls`, `Recursive` and `Guarded`,
the alias-cycle rule, in `spec/Aontu/Names.lean`, with the closure
`close` admitted by `recursiveB_iff` and `guardedB_iff`; and the same
day a document's reading under its declarations, `expand` and `meetD`
in `spec/Aontu/Alias.lean`, a reference to a recursive name a residual
that expands against concrete structure alone, with `vet` an `error`
for a name declared nowhere or an unguarded cycle, run as the sixth
generated fragment, `test/spec/def-alias.tsv`, on which both ports
agree with the definition on every row but `%U = %U` and `%T = %T | 1`,
which the ledger carries under decisions 1 and 2 of §7; the same day
the checker gained a hook for names, `checkWith` in
`spec/Aontu/Check.lean` and `checkR` in `spec/Aontu/Alias.lean`, which
unfolds a residual against the data with a stack the alias-cycle rule
bounds, so recursive names have rows, 210 in the fragment; and the
same day a path read by declaration, `spec/Aontu/Paths.lean`, each
path a name declared as the term at it in the root, run as the seventh
fragment, `test/spec/def-path.tsv`, 180 rows, on which both ports agree
with the definition on every row but the cycles through paths of
decision 7 of §7, which the ledger carries. The measure decision 2 of §7
asks of P3 is taken: the alias-cycle rule refuses no bundled model and
no use case, and in the suite three documents, `%a = %a` and
`%a = %b, %b = %a` in `test/spec/alias.tsv`, which the ports refuse
already as `recursion_unexpanded` and `path_cycle`, and `%A = %A | 1`
in `test/spec/recursion.tsv`, a `subsume` row the ports answer. P4
LANDED 2026-10-19: refusal beside admission as the two answers of one
relation, `Judge`, with the checker's `false` proved refusal, landed 2026-10-19
(§3), and `nof` and `must` inside values the same day, as the eighth
generated fragment, `test/spec/def-trial.tsv`, refusal at generation,
decision 8 of §7, `when`, `contains` and `rest` inside values, and
`match` and `filter` as selections, the same day, which lands P4. P5
partial the same day, with the profiles' contracts, the order decided
and its rows, and the tables for the containers and the constraints,
and decisions 9, 11 and 12 of §7 built 2026-10-20, and 10 on
2026-10-21;
P6 LANDED 2026-10-21, with the check of the importer's forms against
the definition and the three decisions it raised, ruled 2026-10-20 and
built: the riders (14) and the words `map` and `list` (15) the same
day, and the key at a position (13) on 2026-10-21; P7
partial the same day, with
thirteen ADRs read as moved and the reference citing the rules. The
definition is under `spec/`, its rows under `test/spec/`, and both
ports' runners hold the engines to them. P8 to P12, the rest of the
language, drafted 2026-10-20: NOT STARTED.
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
| `Admits env root v j` | is the data `j`, inside the instance `root`, an instance of the value `v`; the answer `true` of `Judge env root b v j`, the trial of `v` on `j`, whose answer `false` is `Refuses` | `vet` |
| `Output env root v j` | is `j` the one output `v` singles out, inside the output `root` | evaluation, `gen` |
| `Le env (ra, a) (rb, b)` | is every instance of `a` under its root `ra` an instance of `b` under its root `rb` | `subsume` under the `values` profile, `breaking` |

A root rides every relation because a path reference reads the whole
document: evaluation keeps one (`ctx.root`), and `subsume` unfolds
each side against its own (`groot` and `sroot` in `ts/src/subsume.ts`),
anchored by `--at` or not. Since 2026-10-19 no rule of `Admits` reads
it: a path reads by declaration, as a name declared from the root
(decision 6 of §7), so `subsume` is each side's declarations from its
own root, and the parameter waits on P5 to be used or dropped.
`subsume`'s other profiles ask more than
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
`check_iff : check v j = b ↔ Judge env root b v j` does for every
value that reads no reference, its `true` admission and its `false`
refusal. Without that theorem a Lean program is a third port
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
   `number & mulof(1)` holds every whole number and
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
| `Aontu/Admits.lean` | `Judge`, the trial of a value on a datum with its answer, admission and refusal as one relation with a rule per form and per answer; `judge_unique`, that no value gives both; and `Instance`, admission of a whole document |
| `Aontu/Output.lean` | from P2: `Gen` and `Output` under a document root, what evaluation singles out, and that it is unique |
| `Aontu/Order.lean` | `Le` with one root per side, and the meet as a greatest lower bound |
| `Aontu/Subsume.lean` | from P5: one contract per `subsume` profile, `values` against `Le`, `defaults` also against `Output` at every position for the effective default, `gen` also against the marks, as a predicate until they are terms; and the reference's table of rules as theorems of `Le` |
| `Aontu/Trial.lean` | the trial schemas as theorems: ADR-055, ADR-049's `not`, ADR-050, ADR-051 and ADR-058 landed (P4) |
| `Aontu/Verdict.lean` | from P5: ill-formed values, and `valid`, `invalid`, `incomplete` and `error` defined over `Admits` and `Output`, with the `vet` modes as parameters |
| `Aontu/Check.lean` | the verified checker, each function beside its `_iff` theorem |
| `Aontu/Tour.lean` | the examples of [the tutorial](../docs/tutorial-definition.md), each proved |
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
Everything compiles with no `sorry`, on Lean 4.24.1 since ADR-077; no named theorem
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
causes are fixed and rises only for a case the definition finds. The
ledger holds 114 rows under ten causes: decisions 3 and 4 of §2, under
the first of which the ports move and under the second the definition;
#346, the sealed list met with a spread, where the ports move; the
alias-cycle rule, decisions 1 and 2 of §7, where the ports move (#354,
and through a trial #361); the cycles through paths of decision 7 of
§7, where the ports move (#357); `must` refusing a conflicting branch
as an error of the schema, where the ports move (#361); a default a
trial refuses leaving its disjunction generating nothing, where the
ports move (#365); an optional key of the general side compared only
where the specific side declares it, where the ports move (#377); and a
path inside a rider's value to a member beside it, which decision 14 of
§7 reads through the rider, where the ports move (#416); and a mark a
key's second declaration carries, which decision 10 of §7 keeps through
the meet, where the ports move (#420).
The nine rows of #384, a spread on the general side compared with a
sealed specific side's missing spread as `any`, retired on 2026-10-20
when the ports built ruling 12 of §7.
Exhaustive enumeration of small values
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
  from an agent session may lack. Since ADR-070 it is `spec.yml`, and
  since ADR-071 it runs in the daily run only, with the Lake build
  directory cached between runs.

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
| **P0**: the seed (S) | **LANDED 2026-10-16**, [ADR-069](../ADR.md#adr-069--the-language-is-defined-in-lean-and-the-ports-implement-it): `spec/` as a Lake project holding the prototype; the `verdict` mode and the ledger read in both runners; the 9,600 cases as `test/spec/def-fragment.tsv`; `make spec`; the CI job, `build.yml`'s `spec`, applied 2026-10-18 from `spec/ci.patch` | every generated row passes in both ports or is in the ledger, which holds only the cases decisions 3 and 4 of §2 own, 10 and 32; the TypeScript runner takes about two minutes over the rows and the Go runner three seconds, the first figure of §5's bound |
| **P1**: data and scalars (M) | the data model (**LANDED 2026-10-17** as `spec/Aontu/Data.lean`; on 2026-10-18 aontu's own data: numbers in the four leaves, strings, maps and lists with unique keys, paths), and the two read modes, which stay parameters (§7, decision 5): the data holds every leaf either mode reads, and stating each mode's reading remains; the four numeric leaves (`integer` **LANDED 2026-10-17**: a double, of magnitude below `2^63`; `float`, `biginteger`, and `bigdecimal` **LANDED 2026-10-18**, as kinds and literals); `string` and `string & empty()` (**LANDED**); literals (scalars **LANDED**, numbers of every leaf **LANDED 2026-10-18**); the bounds `min`, `max`, `above`, `below`, `neq`, `len`, `mulof`, `unique` (`min`, `max`, and `mulof` **LANDED**); `re` and `format` as opaque predicates | the oracle covers every scalar row of `types.tsv` and `vet.tsv`; the sketch's range for `integer` (`\|n\| ≤ 2^53`, wrong: `1e18` is admitted) is replaced by the rule the reference states (**done** 2026-10-17) |
| **P2**: containers (L) | maps with optional and required keys, spreads over every member, the duplicate-key merge, `close()` sealing every level and `open()`; lists with required positions, an open tail and spreads; `&`, `\|` and `*` over containers, read by position as the language reads them (an arm of a disjunction reads a list literal as its own length and `*x` as `x`, and elsewhere `*x` is `x \| super(x)`, so `*1` alone admits `2`: both engines, 2026-10-17); `Output` for containers, which is where filling and ADR-004 live; ADR-045, 046 and 053 as theorems; the rule #319 needs | the ports agree with the oracle over two-level documents; the three ADRs read "moved" |
| **P3**: references (L) | **LANDED 2026-10-19**: aliases as the least fixpoint, path references read by declaration from the unified instance, recursion as the single `alias` rule; the meaning of `%U = %U` (§7); the alias-cycle rule, which refuses no model, no use case and three documents of the suite | `recursion.tsv` and `alias.tsv` rows covered; `unify_cycle` is a meaning or an error, no longer only a budget |
| **P4**: trial schemas (L) | **LANDED 2026-10-19**: refusal beside admission as the two answers of one relation, `Judge`, with the checker's `false` proved refusal (`checkWith_judge`, `checkR_judge`), **landed 2026-10-19**; `nof` and `must` inside values, with ADR-055 and ADR-049's `not` as theorems, as the eighth generated fragment, `test/spec/def-trial.tsv`, **landed 2026-10-19**; refusal at generation, decision 8 of §7, **landed 2026-10-19**; `when` inside values, with ADR-050 as theorems (`judge_when_iff`, `when_nil_refuses`), **landed 2026-10-19**; `contains` inside values, with ADR-051 as theorems (`judge_contains_empty`, `contains_refuses_scalar`), **landed 2026-10-19**; `rest` inside values, with ADR-058 as theorems (`rest_admits_scalar`, `rest_nil_closes`), **landed 2026-10-19**; `match` and `filter` as selections made once a document is read (`resolveD`, `Decls.readR`), with the language's rules as theorems (`selectArm_first`, `selectArm_next`, `selectArm_default`, `resolveD_filter_list`, `resolveD_filter_scalar`), **landed 2026-10-19** | the go/no-go of §7 is settled; the `constraint-*.tsv` rows are covered |
| **P5**: order and verdicts (M) | **PARTIAL**: the verdict classes, the `vet` modes as parameters and ADR-007 (`output_admits`) landed with P2; on 2026-10-19 one contract per `subsume` profile (§1), `ProfileCorrect` in `Aontu/Subsume.lean`, `defaults` asking, at every position where the specific side declares a default, the same default of the general side (`DefaultsLe`, with `defaults_sees_the_default`, narrowed by decision 11 on 2026-10-20 to a declared default, `DefaultsLe.of_lit`) and `gen` the marks, as a predicate until decision 10 was built on 2026-10-21 and as `MarksAgree` since, and the table's rows for the ends, the kinds, the literals, the bounds under their kinds, disjunction, preference and the meet as theorems, among them `re_not_le_string`, where the table overstates `string`; the same day `leDecF`, the order decided with its proof where the scalars and the connectives decide it, `not_le_of_witness`, and the ninth fragment, `test/spec/def-subsume.tsv`; then the rows for maps and lists, `map_le`, `list_le` and `not_le_map_required`, on `judge_root`, that no rule reads the root, with `leDecF` deciding two maps and two lists; then the constraint algebra's own table, intervals, membership, `neq` and `len` (`min_le_min_iff` and the rest); then a spread on the general side, `map_le_spread` and `list_le_spread`, which hold every member of the specific side to the spread, a seal or the specific side's own spread covering the rest, and `mulof` under `mulof` (`mulof_le_mulof`, on `Number.multipleOf_trans`), with `leDecF` deciding them and the printer spelling a sealed map: 3,265 rows over 58 values pairwise (the general list's seal asking nothing beside a spread, a review finding on the first cut), both ports answering as the contract allows but for nineteen rows in the ledger, five under #346 (two of them an open list with the spread of a sealed one, which the ports put outside it), five under #377 and nine under #384, a false negative the rows found, which retired on 2026-10-20 with ruling 12 built; then the order on documents, `LeD`, each side read under its own declarations as `vet` reads it, with `SubsumeCorrectD` its contract, a recursion and its unrolling below each other (`alias_le_unroll`, `unroll_le_alias`, the reference's row for recursive positions), `leDecD` deciding two readings that read no name and `not_leD_of_witness` refuting by `checkR`, and the tenth fragment, `test/spec/def-subsume-docs.tsv`, 310 rows over 20 documents, two names recursive through each other and a recursion with a sealed base among them, both ports answering as the contract allows but for nine rows under #377, four of them through a recursion; a recursion through a list against `any` at its position, which both ports put below the recursion, is #387, which the oracle cannot write while its printer declines a sealed list holding a reference; open: two recursions of one shape under different names, which the definition leaves undecided, the approximate rows, and the `defaults` and `gen` rows, which wait on a procedure that decides `DefaultsLe` | every `subsume` row of `test/spec/subsume.tsv` agrees with its profile's contract where decidable; a verdict class disagreement fails the differential |
| **P6**: the power to represent JSON Schema (M) | **LANDED 2026-10-21**: every value the importer writes for a keyword it carries is a form of the definition, defined on its own terms; the definition names no JSON Schema keyword (decision 2 of §2, ruled 2026-10-17, which retired this phase's first plan: `valid` for the 2020-12 keywords, the import's modes as contracts, and the export's round trip, all of which put JSON Schema in the definition). On 2026-10-19 the check, `ts/test/jsonschema-forms.test.ts` and `go/jsonschema_forms_test.go`: the importer's output for every schema of the suite in its five dialects, of Ajv's extras and of the SchemaStore subset, with and without defaults, 3,504 imports, strings removed, uses 21 calls and 9 words, each a row of `spec/forms.tsv`, the spelling of every form of `Aontu/Syntax.lean` as the oracle's printer writes it, or of `spec/forms-outside.tsv`, the six the definition lacked, each on its decision: `key(0)` under `match`, for `patternProperties` and `propertyNames` (decision 13 of §7), the riders `meta`, `deprecate` and `ident` (14), and the words `map` and `list` (15), which entered the definition as kinds on 2026-10-20 and left the file, leaving four, and the riders after them, as the one form `ride` the same day, leaving `key(0)` alone, which entered as the term `key` on 2026-10-21 and left the file empty, bounded at zero; a row of the outside file the importer stops writing fails the check | the importer's output over the suite's schemas uses only forms the definition holds, which is the outside file empty |
| **P7**: the migration (M, ongoing) | **PARTIAL**: the language ADRs moved as §4 says; the reference cites the rules; the language-change record settled. On 2026-10-19 thirteen ADRs carry the status line of §4, each naming the module and the theorems that hold its rule: ADR-004, 007, 011, 045, 046, 048, 049, 050, 051, 053, 055 and 058, and ADR-034 in part (`nil`; `maybe` is no term of the definition). Waiting on their construct: ADR-037 (`+`), 052 (decision 14 of §7), 054 and 062 (the trial and the residual strategies, which the definition states only as meaning: a count is what the `nof` rules say and a residual what the fixpoint says, and a theorem that the strategy computes them is the ports' to offer), and 067, moved in part the same day with `LeD` and the unrolling theorems, two recursions of one shape under different names staying undecided. The same day `docs/reference-language.md` came to cite the rule each of its sections explains, 32 citations naming the module and the theorems, and the three open decisions where a construct waits on one; the language-change record of §4 is settled by decision 4 and needs no step | no ADR after P7 defines a rule the definition holds |
| **P8**: calls on values (M) | **NOT STARTED**: the built-ins whose answer is a value computed from values: arithmetic (`add`, `sub`, `mul`, `div`, `mod`, `rem`, unary `-`, and `+`, which ADR-037 waits on), the aggregates (`sum`, `least`, `greatest`), `pick`, `sort` and `join`, the text functions (`upper`, `lower`, `esc`, `usc`, `rep`, `split`, `translate`, `nom`), `super` and `copy` written as calls, and the ten component functions (`project`, `folder`, `file`, `content`, `line`, `fragment`, `slot`, `inject`, `copyfiles`, `listitems`) as the maps of the component tree they answer. One rule carries most of them: a call denotes the value its function computes from its arguments' values, a function on `Data` stated beside the call, the leaf of a number by the tower's rules, and an argument outside the function's domain, a kind among them (`sub(integer, 1)`), is the verdict the reference gives it. `super`, which answers a term (`super(integer)` is `number`), and `split` over a pattern, which reads its separator as a term, have rules of their own. `copy` clears the marks, so it rests on ruling 10 of §7; the others rest on P1's numbers and P2's `Output` | a generated fragment, `def-call.tsv`, every call over the fragment's data, both ports answering as the definition does; the reference's function entries cite their rules |
| **P9**: holes, templates and generation (L) | **NOT STARTED**: the placeholder `_` and the template a `template` parameter reads; `each` and `pack`, a list or a map of a template's instances, one per member of the data; `emit`, a selection and a rule table, each node instantiating the first template whose `match` it already satisfies, the pieces flattened; `key()` at any position with its `up` levels, beyond ruling 13's term narrowed to a spread's member; relative paths, `.a` and `..a`, read from the position they stand at, which is how a template reads the node it is instantiated at (`emit`'s `body: [.pin]`); and the `_ & …` idiom. `Output` says what each generates. Rests on P8, whose calls sit inside templates, on P3's paths, on P4's `match` and `filter`, and on ruling 13 | a generated fragment per form, both ports agreeing; the ADRs that rule generation carry §4's status line |
| **P10**: names and documents (M) | **NOT STARTED**: what a set of documents means. Source loading, `@"…"`, as the meet of the loaded document at its place, the files given as a map from paths to terms so that no text is read, and a module import as the document a resolver supplies for its name; the destructure, `{ %a } = @"…"`, and `export`, a declaration that changes no value; the shorthand `{ %a %b }`; `maybe(v)`, absence where the path names nothing; `move(v)`, the value at a path as a preference where the call stands, with its source hidden, so the document generates it once, at its new place; and `$name`, a variable the calling program binds, as a parameter of the reading. Rests on P3 | rows over sets of documents, a runner mode that takes several sources, both ports agreeing |
| **P11**: links and relations (M) | **NOT STARTED**: `path(p)`, an address captured as data and never resolved, and `path` alone, the kind of addresses; `refer(t)`, a field that keeps its address, whose target must exist and is met with `t`, so `t` flows into the target; `rel(t)`, and the graph atoms `inverse(k)` and `acyclic()` over a document's edges; the bundled vocabularies and the `aontu:` models, as documents of P10. Rests on P3 and P10, and on G4's design | rows for each, both ports agreeing |
| **P12**: grammars (S) | **NOT STARTED**: `abnf(g)`, which compiles a grammar and answers its source, refusing one it cannot compile; `parse(g)`, an opaque predicate on strings as `re` and `format` are, read through `Host`; and `parse(g, v)`, the tree a grammar's annotations build, stated over a parse the host supplies. Rests on P1's opaque predicates | rows for the shaping over parses the host supplies, both ports agreeing |

The phases from P8 on, drafted 2026-10-20, take the definition from
the value language to the whole of it, each placed after what it rests
on. The open items of P1 to P5 come before them:
each read mode's reading of a number (P1), `open()` (P2), two
recursions of one shape under different names (P5), decisions 16 to
18, still open, and #403, a selection inside a recursive name's body.

Outside the definition by design, whatever phase lands: text, which is
the grammar's and each port's reader's (the lexical structure, the
canonical and formatted forms, the precedence of the operators); error
codes, where the verdict classes stand instead (decision 3 of §7);
JSON Schema's keywords (decision 2 of §2); the surfaces of the verbs,
the command line, the language server, the MCP server and the views;
and the registry and the network behind modules. Still deferred, each
with its reason: the strings a pattern or a grammar admits, `re`'s
pattern language and the grammars of `format` and `abnf` (large, and
opaque predicates serve meanwhile); and the canon and hash obligation
of §1, which waits on the marks of ruling 10.

## 7. Decisions: ruled and open

Each changes a rule. The first five were ruled on 2026-10-16, the
next three on 2026-10-19 and the last seven on 2026-10-20, each raised
by the phase that found it, and each stands here until the phase that
encodes it lands.

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
   cannot do without, the ruling is reopened there. Measured
   2026-10-19 over every `.aontu` file of `aontu/` and `use-cases/` and
   every row of `test/spec/`: the rule refuses no model and no use
   case, and three documents of the suite, `%a = %a` and
   `%a = %b, %b = %a` in `test/spec/alias.tsv`, which the ports refuse
   already as `recursion_unexpanded` and `path_cycle`, and `%A = %A | 1`
   in `test/spec/recursion.tsv`, which the ports run as the second arm
   and `subsume` answers; the ruling stands. Encoded 2026-10-19, the
   first step of P4: refusal is the second answer of the one relation,
   `Judge`, so a trial schema reads the branches that refuse a value
   without a negation, and the alias-cycle rule is what keeps a trial
   that reads only by itself, `%T = nof(0, %T)`, an `error`.
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
6. **A path reads by declaration.** Ruled 2026-10-19: a path, `$.a.b`,
   reads as the term at its position in the document, data and all,
   and the definition reads it as a name declared from the root, the
   normal form of the schema met with the data, so that the expansion,
   the residuals, the checker and the alias-cycle rule carry paths as
   they carry names (`spec/Aontu/Paths.lean`). `Admits` keeps no path
   rule and no rule of it reads its root. Both ports resolve a path in
   the schema's own tree, through maps by key and lists by index and
   through nothing else, and a key the data alone supplies is no
   position: a path to nothing is an `error`, as it is in both ports.
   Where the two readings part, the position of an optional key the
   data leaves out, or of a kind the data meets, the ports agree with
   the declaration, `a?: integer, b: $.a` admitting `{"b": 1}`, and a
   root that is the data alone cannot say so.
7. **Cycles through paths.** Ruled 2026-10-19: a document that reads
   only by its own paths falls under the alias-cycle rule of decision
   2 and is an `error`: `a: $.b, b: $.a`, where both ports answer
   `path_cycle`, and `a: $.a`, where both answer `unify_cycle`, class
   invalid, which the ledger carries with the ports as the side that
   moves. A recursive position, `then?: $.schema.Step` inside `Step`, is
   a name that refers to itself through a key: a residual that expands
   against the data as far as the data goes, as a recursive alias does,
   and as both ports read it through a copy, `doc: $.schema.Step`. Met
   with data in its own place the ports answer `unify_cycle` where the
   definition expands it, which the ledger carries and #357 records.
8. **Refusal at generation.** Raised 2026-10-19 by the trial rows of
   P4 and ruled the same day. Both ports try a container once its
   members have all arrived and answer `invalid` where the trial refuses
   it, `nof(min(1), {x: 1}, {y: 2})` against `{"z": 1}`, where the
   definition met the data as a term, the meet stood, no value was
   singled out, and the answer was `incomplete`; a scalar the two decide
   alike, at the meet. Ruled: `invalid` also where the meet, read whole,
   refuses the value it gives with its trials and sizes unread, each
   `nof`, `must`, `len` and `unique` as `any` (`Val.untried`,
   `RefusedAt`), which reads a default inside a container as the ports
   do, tried with the container, and a scalar default a trial refuses
   as yielding at the meet. `vet_invalid_not_instance` gave way to
   `vet_invalid_refuses`: `invalid` refuses the data as written or as
   filled, since a fill a trial refuses is `invalid` in both ports
   though the data as written may be an instance, as
   `{a?: 1} & nof(0, {a: 1})` against `{}` shows. The twenty-one ledger
   rows retired.
9. **A size against a container literal at the meet.** Raised
   2026-10-19 (#366). Both ports answer `error` for
   `len(max(1)) & {x: 1, y: 2}`, a literal too long for its size, and
   `invalid` for `len(2) & [1]`, one too short; the definition, which
   decides a scalar against a size at the meet but tries a container
   at generation (decision 8), answers `invalid` for both. One reading
   makes the ports' asymmetry a rule: a size a literal can never meet,
   however it grows, is a conflict of the schema, since members only
   accumulate. If that is the rule, the definition gains it at the meet
   and the page that states it; if not, the ports move. No generated
   row carries the case until it is ruled. **Ruled 2026-10-20: that is
   the rule.** A literal longer than its size allows is a conflict of
   the schema, an `error` at the meet, since members only accumulate; a
   literal short of its size is tried at generation and is `invalid`
   (decision 8). The definition gains the rule at the meet and the
   reference states it; the ports stand. A sealed literal short of its
   size, which cannot grow either, is a short literal under the same
   rule, `invalid`, as both ports answer (`len(2) & close([1])` and
   `len(3) & close({x: 1})`, measured 2026-10-20): the rule reads the
   length against the size, not whether the literal may grow. **Built
   2026-10-20** as `sizeClash` in `spec/Aontu/Verdict.lean`, one case of
   `Val.illFormed`: a meet holding `len(c)` and container literals is
   ill-formed where `c`'s upper half, its lower ends dropped and an
   exact size read as its upper end, refuses the count of the literals
   met, each position, required key and optional key whose value
   generates. Measuring both ports found what the rule reads: only the
   lower end waits, so an exclusion or a multiple the count breaks is a
   conflict at the meet too, `len(neq(2)) & {x: 1, y: 2}` an `error`
   though `{"x": 1, "y": 2, "z": 3}` would meet it, while
   `len(neq(2)) & {x: 1, y: 2} & {z: 3}` counts the three members of
   the literals met and is `valid`. The rule cannot live in the meet,
   whose computed form admits what the written one does
   (`admits_meet`), since `len(neq(2)) & {x: 1, y: 2}` admits a map of
   three members; an ill-formed term admits it too, as a preference
   clash does. The verdict fragment gains 48 rows, l0 on, which both
   ports answer as the definition does. They hold no disjunctive size,
   which both ports refuse as an argument (decision 16).
10. **The marks in the definition.** Raised 2026-10-19 by P5.
   `type()` and `hide()` are no terms of the definition, which holds
   semantics only (§1), yet the `gen` profile of `subsume` compares
   them, so its contract, `GenLe`, takes their agreement as a
   predicate the engines supply, as `Admits` takes the patterns
   through `host`. Either the marks enter the syntax, with what each
   decides stated, which the hash form's obligation in §1 asks for
   anyway, or the predicate stays, and the `gen` profile is held to
   the definition only through `defaults`. **Ruled 2026-10-20: the
   marks enter the syntax**, each a term with what it decides stated,
   entering as the riders do (decision 14), so that `GenLe` reads them
   from the terms and `gen` is held to the definition directly. **Built
   2026-10-21**: `type` and `hide` are riders in
   `spec/Aontu/Syntax.lean`, printed `type(v)` and `hide(v)` with no
   record, so a marked value judges as its value does and a mark rides
   every meet (`Val.hasMark`). What each decides is stated in
   `spec/Aontu/Output.lean`: a member of a map whose value carries a
   mark is left out of the output and still meets the data at its key,
   which `Output` reads by generating from the term's visible part
   (`Val.visible`), a marked member optional and holding anything, as is
   a map's marked spread, and ADR-007 holds of the visible part
   (`output_admits`). Without the fill, `vet` asks the data to be an
   instance of the schema's visible part, as both ports answer, a
   member that refuses its datum still making the meet dead. `GenLe`
   reads the marks from the terms (`MarksAgree`), and `hide_not_genLe`
   shows a mark changes the `gen` order alone. The verdict fragment
   gains 117 rows, h0 on, which both ports answer as the definition does
   but four, a mark that a key's second declaration carries where the
   first's value is the meet's answer, which both drop (#420);
   TypeScript alone drops a mark in a direct meet whose answer is the
   unmarked side (#419), so those cases wait outside the rows. The same
   day a reference came to copy a body without its marks, at every
   depth (`Val.unmark` in `Decls.env`), so what a body hides, the place
   that refers to it asks for, and a mark written at that place stays:
   the alias fragment gains 57 rows, n0 on, which both ports answer as
   the definition does. Then the seal: a reference to a name that is
   not recursive and whose body carries `type()` reads as
   the expansion met with a restriction (`Val.restrict` in
   `spec/Aontu/Alias.lean`), a sealed map declaring the keys the
   conjuncts' maps declare, each optional and restricted in turn, a
   sealed list the same by position, and `any` where no conjunct is a
   container, so the seal stops at a kind, a disjunction and a name; a
   selection among the conjuncts restricts as a selection on the same
   scrutinee and patterns, so the seal follows it to the result it
   makes. A recursive name takes none, as both ports read it. The alias
   fragment gains 138 rows more, o0 on, which both ports answer as the
   definition does. A marked list element is decision 18.
11. **The effective default under `defaults`.** Raised 2026-10-19
   by P5. `DefaultsLe` (`spec/Aontu/Subsume.lean`) holds the general
   side to every value the specific side singles out at a position, a
   literal's own value included, since replacing `{a: 1}` by
   `{a: integer}` leaves a document that generated before incomplete,
   which is the reason the reference gives for `compat_default_changed`.
   The reference's definition of an effective default, a preference's
   value or the lowest-ranked preference's, counts no literal, and both
   ports follow it: `kind-over-scalar` in `test/spec/subsume.tsv`
   answers `subsumes` for `integer` over `1` under the default profile,
   which `ProfileCorrect .defaults` refuses. Either the contract narrows
   to the terms that declare a default, or the ports and the page move.
   The generated rows run under `values` until it is ruled. **Ruled
   2026-10-20: the contract narrows.** Only a term that declares a
   default counts, as the reference's definition and both ports read
   it: `DefaultsLe` holds the general side to the default the specific
   side declares at a position, a literal's own value is no default,
   and `integer` over `1` subsumes under `defaults`, as
   `kind-over-scalar` answers. **Built 2026-10-20**: `Val.declaresDefault`
   in `spec/Aontu/Subsume.lean` holds of a preference and of a
   disjunction the rank rule picks a preferred arm of. Only where the
   specific side declares a default does `DefaultsLe` ask the general
   side to declare one, singling out the same value.
   `DefaultsLe.of_lit` proves that a literal below a value in the order
   is below it under `defaults` too. The `defaults` rows wait on a
   procedure that decides `DefaultsLe`.
12. **A `does_not_subsume` with no witness.** Raised 2026-10-19
   (#375). Both ports answer `does_not_subsume` for `string` over
   `min("a")`, `above("")` and a pattern that cannot match `""`, where
   the order holds, under the reference's "folds toward
   `does_not_subsume`"; `SubsumeCorrect` allows `doesNotSubsume` only
   where the order fails, as the reference's own description of the
   verdict, a failing path as the witness, asks. Either the ports answer
   `undecided` where they cannot decide, or the contract weakens to the
   paragraph, under which a `subsume` that always answers
   `does_not_subsume` is correct. The definition recommends the first.
   **Ruled 2026-10-20: the first.** The ports answer `undecided` where
   they find no failing case, so that `does_not_subsume` always has a
   witness; the contract stands, and the reference's "folds toward
   `does_not_subsume`" changes with the ports. **Built 2026-10-20** in
   both ports. Where no rule decides a pair, the walk looks for a value
   the specific side admits and the general side refuses, and answers
   `undecided`, `sub_no_witness`, where it finds none. `string` covers
   a residual that refuses `""` and every path, and a residual covers
   `string` where nothing in it refuses a non-empty string, so two cases
   of #375, `string ⊒ min("a")` and `above("") ⊒ string`, become
   `subsumes`, and `string ⊒ format("email")`, which no probe fails,
   `undecided`. A length
   demand admits a string of its length (`len(2) ⊒ "xy"`), and a
   general spread compares nothing more on a sealed specific side, which
   retires the nine rows of #384. Building it found one more question.
   The ports read a string bound against a path's spelling, so
   `string ⊒ above("")` keeps a witness in them, `path(.x)`. The
   definition has no path values to say so, and P11 owes them.
13. **The key at a position.** Raised 2026-10-19 by P6. The
   importer writes `patternProperties` and `propertyNames` as a spread
   that holds each member to its key, `&: match(key(0), p, any, nil)`:
   `key(0)` answers the key the value sits under, and no term of the
   definition reads its own position, since `Judge` is given a value
   and a datum and nothing else. Either the syntax gains the position,
   a term `key` that a map's spread rule reads from the member it is
   tried on, as `Output` is given the root, or the importer writes the
   two keywords without it, which the forms the definition has cannot
   do for a pattern over keys. The definition recommends the first,
   narrowed to the key of the member a spread is tried on and no more
   of the path, which is all the importer asks and all the reference's
   `key(0)` answers there. **Ruled 2026-10-20: the first, narrowed** as
   recommended: a term `key` that a map's spread rule reads from the
   member it is tried on. **Built 2026-10-21** as the term `key` in
   `spec/Aontu/Syntax.lean`, printed `key(0)`, which `Val.atKey` reads
   as a string at the spread's own position, through `&`, the riders
   and the scrutinee of a `match`, where the importer writes it, and at
   no other. The map rule of `Judge` tries its spread on each member
   under the member's key, and the list rule on each element under its
   position, written as a string, `"0"` first, as both ports read
   `key(0)` in a list. A `key` no spread has read refuses every value,
   as a path left unread does, and a `match` on a literal judges as its
   first arm whose pattern admits the literal, else as its default,
   and refuses with neither. The checker carries the key
   (`checkWithKey_judge`). The meet gives a declared member the spread
   read under its key, with the selection made where the checker reads
   every pattern (`Val.selectNow`, `admits_selectNow`), and keeps two
   spreads that read the key as written, since no one term stands for
   both before a key is known. The order proves no pair whose spreads
   read it (`map_le_spread`, `list_le_spread`). The trial fragment gains
   66 rows, y0 on, which both ports answer as the definition does.
   `key` leaves `spec/forms-outside.tsv`, which is empty and bounded at
   zero, and P6 lands. `key()` at any other position, with its levels,
   is P9's.
14. **The riders.** Raised 2026-10-19 by P6. `meta(v, r)`,
   `deprecate(v)` and `ident(v, r)` ride a value and change no
   admission, which is why §6 defers them, yet the importer writes them
   around most of what it imports, so the check cannot read its output
   as the definition's without them. Either the three enter the syntax
   as forms whose judgement is their value's own, one transparent rule
   each and `Output` passing through them, so that a rider is a term
   the definition reads and says nothing about, or they stay outside
   and the check strips them before it reads, which trusts the
   stripping. The definition recommends the first: three constructors
   and three rules, and the marks of decision 10, `hide()` and
   `type()`, would enter the same way. Since 2026-10-20 the `meta()`
   and `ident()` records are maps of concrete data under any keys
   ([ADR-072](../ADR.md#adr-072--a-meta-record-is-open-metadata),
   [ADR-073](../ADR.md#adr-073--an-ident-record-is-open-declaration-metadata)),
   so the first carries a record as data and names none of its keys.
   **Ruled 2026-10-20: the first.** The three riders enter the syntax as
   transparent forms, one rule each, with `Output` passing through
   them, and the marks of decision 10 enter the same way. `ident()`
   keeps its place: it is a form only as the value of an alias
   declaration, or one term of the meet that is that value, and is
   ill-formed anywhere else, as both ports refuse it with `ident_place`
   (`test/spec/ident.tsv`), so its rule belongs to the declaration and
   not to a value. **Built 2026-10-20** as one form, not three: `ride`
   in `spec/Aontu/Syntax.lean`, with a `Rider` naming the call and a
   record, the members of a map of data, since the three differ in
   nothing a rule reads and both ports take no other record. One rule
   of `Judge` makes it judge as its value (`judge_ride_iff`), and `Gen`,
   the meet, the checker, the parent type, the expansion and the
   selections pass through it, as do a path, a declared default and the
   kind that gives a meet its parent, so a rider and its value are
   below each other (`ride_le_iff`, `le_ride_iff`). `Decls.env` reads a
   body without the `ident()` at its top or on a term of its top meet,
   keeping one inside it (`Val.unident`), and `Decls.identMisplaced`
   holds of one anywhere else. It reads the text, so a body no
   reference reads is held to the place too, as both ports answer. The
   alias fragment gains 51 rows, r0 on, which both ports answer as the
   definition does, and the path fragment 24, q0 on, which both answer
   so but q21 and q22: a path inside a rider's value to a member beside
   it leaves both `incomplete` (#416), where the ports move. The riders
   leave `spec/forms-outside.tsv`, whose bound falls from 4 to 1. The
   marks of decision 10 wait.
15. **The words `map` and `list`.** Raised 2026-10-19 by P6. The
   importer writes `map` for `type: object` with no other keyword and
   `list` for `type: array`. Both ports admit every map or every list
   under the word and single nothing out, `mapval_no_gen` for `a: map`
   where `a: {}` gives `{}`. The definition has `{}` and `[]`, the open
   empty containers, which admit the same data and are singled out as
   themselves, and no term that admits every map and is not. Either the
   two words enter the syntax as kinds beside `string` and `number`,
   which admit by kind and are not singled out, or the importer writes
   `{}` and `[]`, which changes what an imported `type: object`
   generates from an error to `{}`. The definition recommends the
   first, which states what both ports do. **Ruled 2026-10-20: the
   first.** `map` and `list` enter the syntax as kinds beside `string`
   and `number`, admitting by kind and singling nothing out. **Built
   2026-10-20** as `mapKind` and `listKind` in `spec/Aontu/Syntax.lean`,
   one rule each for admission and refusal, no `Output`, the checker's
   cases, and the order: each map below `map` and each list below
   `list` (`map_le_mapKind`, `list_le_listKind`), and each kind below
   the open empty container (`mapKind_le_open_map`,
   `listKind_le_open_list`), which `leDecF` decides. The first
   fragment's file gains 312 rows for the words, k0 on, and the ninth's
   60, m0 on, appended so that no row is renamed. Both ports answer
   every row as the definition does, after a fix the rows found: both
   put `{}` and `[]` outside `map` and `list`, though the open empty
   containers admit every map and every list. The words leave
   `spec/forms-outside.tsv`, whose bound falls from 6 to 4.
16. **A disjunctive size.** Raised 2026-10-20 by decision 9's rows
   (#413). Both ports refuse `len(1 | 3)` with `invalid-arg`, whatever
   it meets, where the definition's `len(c)` judges a size as any term
   `c` does, so `len(1 | 3)` admits `[1]` and `[1, 2, 3]`. The
   reference calls the argument "any integer-domain constraint", which
   does not say whether a disjunction of integers is one. Either the
   definition narrows `len` to a conjunction of bounds, exclusions and
   multiples, and reads any other size as ill-formed, as the ports
   answer, or the ports accept a disjunctive size, whose upper half at
   the meet is each arm's, as `Val.upperHalf` reads it. No generated
   row carries a disjunctive size until it is ruled.
17. **A declaration nothing reads.** Raised 2026-10-21 by decision 14's
   rows (#417). Both ports evaluate every alias declaration, at `$.%T`,
   whether or not anything refers to it, so `%T = 1 & 2` beside `v: 1`
   is an `error`, `scalar_value`, where the definition reads a document
   as the expansion of its term and never reads a body no reference
   reaches, so the document is `valid`. Only the names a body refers to
   (`Decls.Declares`), the alias-cycle rule (`Decls.Guarded`) and the
   place of an `ident()` (`Decls.identMisplaced`) read every body.
   Either the definition reads every declaration, so that a dead or
   ill-formed body is an `error` whether or not anything reads it, as
   both ports answer, or a declaration nothing reads means nothing and
   the ports stop evaluating it. The definition recommends the first,
   which states what both ports do and refuses a document whose author
   wrote a broken declaration.
18. **A marked list element.** Raised 2026-10-21 by ruling 10's rows
   (#421). Both ports leave a `hide()` or `type()` element of a list out
   of the output, so `[1, hide(2), 3]` gives `[1, 3]`, and still hold
   each element to its position, so `[hide(1), 2]` admits `[1, 2]`
   without the fill and refuses `[2]`. No reading by position makes the
   output an instance (ADR-007, `output_admits`), and the reference
   states the omission for a member of a map alone. Either a mark on a
   list element decides nothing, and the element is generated and held
   to its value as any other, which the ports would follow, or the
   definition reads a marked element as no element and states what a
   list admits around it, which the ports' answers by position would
   have to follow too. The definition recommends the first, which
   keeps ADR-007 and leaves the marks a member's affair, and reads a
   list's elements so meanwhile (`Val.visible`); no generated row holds
   a marked list element until it is ruled.

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
