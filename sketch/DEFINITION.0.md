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
ledger holds 198 rows under thirteen causes: decisions 3 and 4 of §2, under
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
§7 reads through the rider, where the ports move (#416); a mark a
key's second declaration carries, which decision 10 of §7 keeps through
the meet, where the ports move (#420); and a default at a list position
under the `defaults` profile, which the ports do not compare, where the
ports move (#424); and a call no reading makes, with the wrong number
of arguments or a non-number negated, which the definition reads as an
error of the schema and the ports as invalid, where the ports move
(#426); and a `+` that waits inside a `match` pattern, which the
definition reads as refusing, a call refusing every value, where both
ports wait and the definition moves (#432).
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
| **P3**: references (L) | **LANDED 2026-10-19**: aliases as the least fixpoint, path references read by declaration from the unified instance, recursion as the single `alias` rule; the meaning of `%U = %U` (§7); the alias-cycle rule, which refuses no model, no use case and three documents of the suite. On 2026-10-22 a path resolves in the schema read with its calls made (`Decls.Resolves` over `Decls.readU`, the root the paths read from), so that a path into a call's output resolves, as both ports read it; rows pc0 on in `test/spec/def-path.tsv`. The same day the definition reads the roots in rounds (`Decls.rounds`, `Decls.rootsS`, `Decls.rootsD`), each round declaring each path as the term at it in the first root before that reaches it (`Decls.pathIn`), as many rounds as the document writes paths, so that a path into what a call over a path makes resolves, as both ports read it; rows rn0 on | `recursion.tsv` and `alias.tsv` rows covered; `unify_cycle` is a meaning or an error, no longer only a budget |
| **P4**: trial schemas (L) | **LANDED 2026-10-19**: refusal beside admission as the two answers of one relation, `Judge`, with the checker's `false` proved refusal (`checkWith_judge`, `checkR_judge`), **landed 2026-10-19**; `nof` and `must` inside values, with ADR-055 and ADR-049's `not` as theorems, as the eighth generated fragment, `test/spec/def-trial.tsv`, **landed 2026-10-19**; refusal at generation, decision 8 of §7, **landed 2026-10-19**; `when` inside values, with ADR-050 as theorems (`judge_when_iff`, `when_nil_refuses`), **landed 2026-10-19**; `contains` inside values, with ADR-051 as theorems (`judge_contains_empty`, `contains_refuses_scalar`), **landed 2026-10-19**; `rest` inside values, with ADR-058 as theorems (`rest_admits_scalar`, `rest_nil_closes`), **landed 2026-10-19**; `match` and `filter` as selections made once a document is read (`resolveD`, `Decls.readR`), with the language's rules as theorems (`selectArm_first`, `selectArm_next`, `selectArm_default`, `resolveD_filter_list`, `resolveD_filter_scalar`), **landed 2026-10-19** | the go/no-go of §7 is settled; the `constraint-*.tsv` rows are covered |
| **P5**: order and verdicts (M) | **PARTIAL**: the verdict classes, the `vet` modes as parameters and ADR-007 (`output_admits`) landed with P2; on 2026-10-19 one contract per `subsume` profile (§1), `ProfileCorrect` in `Aontu/Subsume.lean`, `defaults` asking, at every position where the specific side declares a default, the same default of the general side (`DefaultsLe`, with `defaults_sees_the_default`, narrowed by decision 11 on 2026-10-20 to a declared default, `DefaultsLe.of_lit`) and `gen` the marks, as a predicate until decision 10 was built on 2026-10-21 and as `MarksAgree` since, and the table's rows for the ends, the kinds, the literals, the bounds under their kinds, disjunction, preference and the meet as theorems, among them `re_not_le_string`, where the table overstates `string`; the same day `leDecF`, the order decided with its proof where the scalars and the connectives decide it, `not_le_of_witness`, and the ninth fragment, `test/spec/def-subsume.tsv`; then the rows for maps and lists, `map_le`, `list_le` and `not_le_map_required`, on `judge_root`, that no rule reads the root, with `leDecF` deciding two maps and two lists; then the constraint algebra's own table, intervals, membership, `neq` and `len` (`min_le_min_iff` and the rest); then a spread on the general side, `map_le_spread` and `list_le_spread`, which hold every member of the specific side to the spread, a seal or the specific side's own spread covering the rest, and `mulof` under `mulof` (`mulof_le_mulof`, on `Number.multipleOf_trans`), with `leDecF` deciding them and the printer spelling a sealed map: 3,265 rows over 58 values pairwise (the general list's seal asking nothing beside a spread, a review finding on the first cut), both ports answering as the contract allows but for nineteen rows in the ledger, five under #346 (two of them an open list with the spread of a sealed one, which the ports put outside it), five under #377 and nine under #384, a false negative the rows found, which retired on 2026-10-20 with ruling 12 built; then the order on documents, `LeD`, each side read under its own declarations as `vet` reads it, with `SubsumeCorrectD` its contract, a recursion and its unrolling below each other (`alias_le_unroll`, `unroll_le_alias`, the reference's row for recursive positions), `leDecD` deciding two readings that read no name and `not_leD_of_witness` refuting by `checkR`, and the tenth fragment, `test/spec/def-subsume-docs.tsv`, 310 rows over 20 documents, two names recursive through each other and a recursion with a sealed base among them, both ports answering as the contract allows but for nine rows under #377, four of them through a recursion; a recursion through a list against `any` at its position, which both ports put below the recursion, is #387, which the oracle cannot write while its printer declines a sealed list holding a reference; then, on 2026-10-21, the `defaults` and `gen` profiles decided position by position, `defaultsAt` and `marksAt` at one position and `defaultsBelow` and `marksBelow` walking every position both normal forms have, with `defaultsLe_of_walk`, `genLe_of_walk` and the refutations at one position (`not_defaultsLe_of_refutes`, `not_genLe_of_refutes`), and the rows f0 on and w0 on of the ninth fragment, 288 pairs under `defaults` and 234 under `gen`, both ports answering as the contracts allow but for one row under #424, a default at a list position, which the ports do not compare; open: two recursions of one shape under different names, which the definition leaves undecided, and the approximate rows | every `subsume` row of `test/spec/subsume.tsv` agrees with its profile's contract where decidable; a verdict class disagreement fails the differential |
| **P6**: the power to represent JSON Schema (M) | **LANDED 2026-10-21**: every value the importer writes for a keyword it carries is a form of the definition, defined on its own terms; the definition names no JSON Schema keyword (decision 2 of §2, ruled 2026-10-17, which retired this phase's first plan: `valid` for the 2020-12 keywords, the import's modes as contracts, and the export's round trip, all of which put JSON Schema in the definition). On 2026-10-19 the check, `ts/test/jsonschema-forms.test.ts` and `go/jsonschema_forms_test.go`: the importer's output for every schema of the suite in its five dialects, of Ajv's extras and of the SchemaStore subset, with and without defaults, 3,504 imports, strings removed, uses 21 calls and 9 words, each a row of `spec/forms.tsv`, the spelling of every form of `Aontu/Syntax.lean` as the oracle's printer writes it, or of `spec/forms-outside.tsv`, the six the definition lacked, each on its decision: `key(0)` under `match`, for `patternProperties` and `propertyNames` (decision 13 of §7), the riders `meta`, `deprecate` and `ident` (14), and the words `map` and `list` (15), which entered the definition as kinds on 2026-10-20 and left the file, leaving four, and the riders after them, as the one form `ride` the same day, leaving `key(0)` alone, which entered as the term `key` on 2026-10-21 and left the file empty, bounded at zero; a row of the outside file the importer stops writing fails the check | the importer's output over the suite's schemas uses only forms the definition holds, which is the outside file empty |
| **P7**: the migration (M, ongoing) | **PARTIAL**: the language ADRs moved as §4 says; the reference cites the rules; the language-change record settled. On 2026-10-19 thirteen ADRs carry the status line of §4, each naming the module and the theorems that hold its rule: ADR-004, 007, 011, 045, 046, 048, 049, 050, 051, 053, 055 and 058, and ADR-034 in part (`nil`; `maybe` is no term of the definition). ADR-037 moved in part on 2026-10-21 with `+` (P8), `plusOf_lists`, `plusOf_nil_list` and `plusOf_list_lit`, its sum of an absence waiting on `maybe` (P10). Waiting on their construct: 052 (decision 14 of §7), 054 and 062 (the trial and the residual strategies, which the definition states only as meaning: a count is what the `nof` rules say and a residual what the fixpoint says, and a theorem that the strategy computes them is the ports' to offer), and 067, moved in part the same day with `LeD` and the unrolling theorems, two recursions of one shape under different names staying undecided. The same day `docs/reference-language.md` came to cite the rule each of its sections explains, 32 citations naming the module and the theorems, and the three open decisions where a construct waits on one; the language-change record of §4 is settled by decision 4 and needs no step | no ADR after P7 defines a rule the definition holds |
| **P8**: calls on values (M) | **PARTIAL**: arithmetic built on 2026-10-21, the form `call` with the seven functions `add`, `sub`, `mul`, `div`, `mod`, `rem` and unary `-`, computed by `Number.arith` in `Aontu/Arith.lean` by the tower's rules (exact between integers, the nearest double where a float stands, a big decimal never divided, a zero divisor computing nothing) and made by `resolveD` once every argument reads as a number, a call no reading makes being ill-formed; the eleventh fragment, `test/spec/def-call.tsv`, both ports answering as the definition does but for nine rows under #426. The folds `sum`, `least` and `greatest` the same day, over the members of one bag the output would hold (`Val.members` in `Aontu/Verdict.lean`, a map's in key order, but a marked member and an optional one whose value generates nothing), each a number in its normal form, a lone preference read as its value (`Val.number?`): `sum` adds them from the left from the integer zero, each step an `add`, and `least` and `greatest` answer the first member no other is below or above, by exact value (`Number.least_mem`, `Number.least_lowest` and their twins); rows x129 on, both ports answering as the definition does but for three rows under #426; an optional member whose value generates an empty container is no member, by decision 19, built the same day, rows x1935 on. `+` the same day, the call `plus`, made by `callTerm` and `plusOf` from its operands' normal forms, each read through its riders and a lone preference: two numbers by `add`'s rules, a sum no leaf holds `nil`; a string beside a scalar the two texts, a number written as `Number.text` writes it, a float as JavaScript writes a number; two lists concatenated (ADR-037); two booleans either; and anything else waiting, a kind, `null`, a map, a list beside a scalar or a boolean beside a number, which generates nothing and refuses nothing, so the document is `incomplete`, a literal meeting it as a pair (`Val.callAt`); rows x300 on, both ports answering every one as the definition does. `join` the same day, `joinOf`, the members' texts as `+` writes them joined by the separator: where the bag is one and its separator or a member is not settled it waits, and otherwise a separator that is no string, a value that is no bag and a member with no text are errors; rows x507 on, both ports answering as the definition does but for three rows under #426, a `join` with three arguments. `pick` and `sort` the same day, `pickOf` and `sortOf`, over the members the folds read, neither waiting: a projector is a string or an integer, read through its riders, naming a key in a map member, an integer by its digits, and an index in a list member, a string by its digits after one optional sign (`Val.project?`), `""` naming no key in `pick` and the member itself in `sort`; `sort` orders by exact value or by code point, a bag whose keys mix the two or hold anything else having no order, equal keys keeping their order in both directions under a stable merge sort (`sortLe`), and the direction `asc` or `desc`, read through its riders; rows x597 on, both ports answering as the definition does but for nine rows under #426, a wrong number of arguments, a projector or a direction through a rider, a mark or a name reading as its value in both ports once TS drove them (#435), rows x1995 and z30 on, and a string naming an index by its digits alone, and `""` naming no key in `pick`, in both ports once TS read it so (#437), rows x2025 on. `upper` and `lower` the same day, `caseOf`: on a string, the run of code points a start and a length select (`caseSpan`, a negative start ending the run that far from the end, a negative length the whole string, both ends clamping) converted whole by the host's case conversion, `Host.upper` and `Host.lower` in `Aontu/Admits.lean`, which the definition leaves to the engines as it leaves patterns, Unicode's default case conversion at each engine's table version (DIVERGENCE.md); on a number with no range, the ceiling or the floor in its own leaf (`Number.round`); a range argument an integer, or a big integer that 64 bits hold; the oracle runs the host as `oracleHost` through `implemented_by`, converting ASCII letters alone, so the logical default stays free of axioms, and `asciiCase` refuses a row that converts another; rows x816 on, both ports answering as the definition does but for six rows under #426, and no row holding a big integer index between 2 ^ 53 and 2 ^ 63, which TS refuses (#439). `translate` the same day, `translateOf`: each set's ranges expanded left to right (`expandSet`, a `-` with nothing on one side standing for itself, a descending range an error), each code point the set names written as the `to` character at the position of its last naming, `to`'s last where `to` is shorter and nothing where `to` is empty or not given (`translateChar`), a range counting every code point it crosses, the surrogates too, and a surrogate written as U+FFFD (`scalar`); rows x966 on, both ports answering as the definition does but for six rows under #426, and a surrogate written from `to` as U+FFFD in both ports once TS wrote it so (#442), rows x2055 on. `esc` and `usc` the same day, `escOf` over the seven conventions of a new module, `Aontu/Text.lean`, each a function on a string's code points and a partial inverse that refuses text no text escapes to (a C escape the convention does not define or a lone surrogate, a lone quote where SQL doubles it, an `&` that opens no entity, percent-encoded bytes that are no strict UTF-8, a backslash before anything but a metacharacter), an unknown variant an error; rows x1068 on, both ports answering as the definition does but for six rows under #426. The oracle doubles each backslash in a row's cells (`Val.cell`, `Data.cell`), which the runners expand. `super` written as a call the same day, `Val.super` of the argument as `resolveD` leaves it, before the normal form, so that a preference reads as its default at any depth, as both ports read it; rows x1221 on, both ports answering as the definition does but for six rows under #426. `pref` written as a call on 2026-10-22, `Val.prefer` of the argument read before its normal form, as `super` reads it, so that a preference stays one, as both ports walk it: each scalar literal and each address a preference of rank one, each preference and each preferred arm a rank weaker, a leaf or a preference under a rider preferred whole, rider and all, a map's and a list's members, a meet's sides and the value under any other rider read so too, a kind and a bound left as they are, and a path not read yet or a call that waits read as `pref` of itself, which waits, standing where its argument does (`Val.illFormed`); rows pf0 on in `test/spec/def-path.tsv`, both ports answering as the definition does, and no row holding `pref` of plain literals in a disjunction, `pref(1 | 2)`, which is `*1 | *2`, a clash, and which both ports answer `invalid` where `*1 | *2` written so is an `error` (#482). `copy` written as a call on 2026-10-23, by decision 27: its argument's normal form, so that a name or a path has expanded into its value, a type's seal among it, with its marks cleared (`Val.unmark`) and every map and list in it unsealed (`Val.unseal`), a literal's as a reference's; rows cp0 on in `test/spec/def-path.tsv`, both ports answering every one as the definition does once each dropped the marks and seals a literal argument writes (#445). `split` the same day, `splitOf`: a string separator cuts at each occurrence from the left, the empty fields kept, `""` between every two code points (`splitText`); a pattern separator cuts at the pattern's matches; rows x1332 on, both ports answering as the definition does but for six rows under #426. `rep` the same day, `repOf`, and with it the host no longer cuts at a pattern: `Host.portable` says which patterns lie in the subset the two calls hand the host's regex engine, a subset the reference states on a pattern's syntax, and `Host.find` where such a pattern's leftmost match at or after a code point falls, with what its groups captured; what the calls make of the matches is the definition's, in `Aontu/Text.lean`, read as Go's regexp reads them: a scan from the left that resumes where the last match stopped, one code point on after an empty match, skipping an empty match that starts where the last one stopped (`scanMatches`), the fields Go's `Split` cuts (`cutFields`, and `Host.cut`, which cuts the empty text into one empty field at a pattern other than `""`), and a replacement's `$1` to `$9`, `$&` and `$$`, any other `$` refused (`expandSub`); neither call waits, so a call handed a pattern, which the checker cannot read as a term, still reads to one it can (`resolveD_expandF_split`, `resolveD_expandF_rep`); the oracle's host reads fixed patterns alone, text with unnested groups that every engine reads alike (`fixedPieces`, `fixedFind`), and `hostReads` refuses a row that hands the host any other pattern but four outside the subset; rows x1404 on for `rep` and v0 on for `split` at a pattern, both ports answering as the definition does but for six rows under #426, and no row splitting the empty text at a pattern, where TS answers no field and Go one (#447); a replacement is read against the pattern's groups before the text is scanned, by decision 20, built the same day, rows x1959 on. `nom` the same day, `nomOf`, over a name's words in `Aontu/Text.lean`, all of it ASCII case and none of it the host's: the runs between `_`, `-` and spaces, cut again where an ASCII capital follows a small letter or a digit, where a digit meets a non-digit, and before the last capital of a run that a small letter follows (`nameWords`, `wordStarts`), `.` and `/` read as `_` first; the nine spellings (`NameStyle.write`), an acronym written as it is given wherever a word is capitalised (`capitalise`), never the first word of `camel`; one spelling where a style is named, and otherwise the sealed map of all nine; rows x1521 on, both ports answering as the definition does but for six rows under #426, and no row writing the style as `""`, which Go reads as no style and TS refuses (#451). The ten component functions the same day, `Fn.cmp` over `Cmp` in `Aontu/Arith.lean`, `cmpOf` building each node as the sealed map of its component's name (`Cmp.node`), its props and its children, from the table both ports keep: the prop a string spec fills (`Cmp.text?`), written wherever it is required, all but `project`'s, and `""` only where it is a span of text, `content`'s and `line`'s; `listitems`'s `item` a list (`Cmp.bag?`); the props each admits (`Cmp.props`, `cmpPropsOk`); and the components each holds (`Cmp.kids`), its children read with each nested list spliced into its place and a bare string a line where it holds lines (`cmpKids`, `lineNode`), a node being any map whose `cmp` names a component (`Val.cmp?`); rows x1677 on, both ports answering as the definition does but for nine rows under #426, and no row closing a node, whose props and children both ports hold open against a `close()` from above, which waits on `open()` (P2). A bound written over terms on 2026-10-23, `bndOf` in `Aontu/Verdict.lean`, the call `Fn.bnd` making `min`, `max`, `above`, `below`, `neq` or `mulof` itself once each argument's normal form is a number or a string (`Val.boundEnd?`): an argument that names no end, a boolean, `null` or a container, refuses the bound (`Val.noEnd`), as a `neq` over both numbers and strings does, an error but in a `filter`'s condition, where it refuses each member, and an argument that never settles leaves the call waiting, so an error too; rows bd0 on in `test/spec/def-path.tsv`, `len` over a path among them, which needs no call since `len` takes a term, and bg0 on for a bound over a relative path in a generator's template or a `filter`'s condition, read where its instance lands, both ports answering every one as the definition does once #507 landed, and no row holding `mulof` over a path to zero or a negative number, or `len` over a path to anything but a count, which both ports read as an error where the literal admits nothing (#509). One rule carries the calls: a call denotes the value its function computes from its arguments' values, a function on `Data` stated beside the call, the leaf of a number by the tower's rules, and an argument outside the function's domain, a kind among them (`sub(integer, 1)`), is the verdict the reference gives it. `super`, which answers a term (`super(integer)` is `number`), and `split` over a pattern, which reads its separator as a term, have rules of their own. `copy` clears the marks, so it rests on ruling 10 of §7; the others rest on P1's numbers and P2's `Output` | a generated fragment, `def-call.tsv`, every call over the fragment's data, both ports answering as the definition does; the reference's function entries cite their rules |
| **P9**: holes, templates and generation (L) | **PARTIAL**: the hole and `each` built on 2026-10-21: `Val.hole`, the placeholder `_`, which where no generator fills it admits every value, refuses none and generates nothing (`Judge.hole`); `resolveD` reading a term for `b`, the member a generator's template is read for, each hole reading as it, a spread read for none and a `filter`'s condition for each member it tries; and `each(d, t)`, the open list of `t` read for each member of `d`, in the order `Val.members` reads them, `nil` where `d` is no bag, a nested `each` binding its own hole while its data is read for the outer member; rows x1809 on in `test/spec/def-call.tsv`, both ports answering as the definition does but for six rows under #426, and until decision 21 was built no row holding a hole outside a template. `pack` built the same day: `pack(d, t)`, the open map of `t` read for each member `Val.keyedMembers` reads, under the member's key, a map's keys in key order with a member a fold skips left out, and a list's strings, each its own key, a key the list repeats making one member, its instances met; `nil` where a list holds anything but a string or the data is no bag; rows x2064 on, both ports answering as the definition does. `key(n)` at any position built on 2026-10-22: `Val.keyUp`, `key(n)` as written, read by `keyUpAt` at the position `resolveD` carries, a map's member one key below the map and a list's element one index below, `""` above the top; a template at the position its instance lands at, and a `filter`'s condition where the member it tries lands, under its key or at the index it takes among those kept; at a spread's own position `key(0)` the term ruling 13 reads and `key(1)` the container's key; the roots paths read placing nothing (`Decls.readU`), keeping as written each selection, call, generator and `filter` that computes with an unplaced key (`Val.holdsKey`), and a literal meeting an unplaced key as a pair (`Val.callAt`), so that a key a path reaches reads where the path lands, as both ports re-read it; rows x2121 on and r0 on, both ports answering as the definition does, and no row holding a key deeper in a spread, a path shallower than its target (#463), a preference on a key (#465), a path to a call whose list argument holds a key, which changes the call's own value in both ports (#468), a path to a `filter` whose condition holds a key, which leaves in the path's declaration a body the checker can't read, so that a literal meeting a term under it stays undecided, or a path into a generator's output, decision 22. `emit` built on 2026-10-23: `Fn.emit`, a selection and a rule table, `resolveD` checking the table and then reading it once for each node of the selection in the order `Val.members` reads them, its `match`es for no node and its bodies for the node, `emitPieces` taking the body of the first template whose `match` takes the node as both ports dispatch, the meet narrowing nothing of the node (`emitTakes`, `Val.alike`), a hole in the `match` matching nothing where it stands and the value it meets in a meet or an arm (`Val.matchRead`), a template's `match` fields met, a table of one template written as the template, and splicing each list in the body at any depth (`emitSpliceF`), so that a nested `emit` adds its pieces where it stands; a relative reference in a body, `.pin`, a field of the node rather than a place, at any depth of the body and at a position of a list, written with the step `Seg.node`, which `resolveD` reads for the node (`nodeRef`, `Val.fieldAt`) and which placing a document, its paths read as names and the paths that must name something all leave as written (`placePath`); the call left unmade, an error, for a selection other than a bag, a template without its `match` or its `body`, a body other than a list, a node no template takes and a reference the node doesn't answer, as both ports refuse each; rows et0 on in `test/spec/def-call.tsv` and em0 on in `test/spec/def-path.tsv`, both ports answering as the definition does. Not yet built: the template a `template` parameter reads beyond `each`'s and `pack`'s; a table named apart from its call, `emit(_, t)`, and the recursion it carries; `replace` and `esc` in a body; a `key(n)` in a body, which the ports read at different positions, as #524 records; a reference into the node inside an `each`, a `pack` or a `filter`'s condition in a body; a spread whose template reads its member's place inside a disjunction, a selection, a generator's template or an alias's body; and the `_ & …` idiom. Relative paths at a written position built on 2026-10-22: `Seg.up n`, the climb a relative path starts with, a step up for each dot; `Val.placed` making each absolute where it stands, a map's member one key down and a list's element one index down, a climb past the top staying as written and resolving nowhere; `Decls.placed` placing the schema from the top and each body at its name's own place, `%` and the name as a key at the top, as both ports place a body; `VetP` and `OutputP` placing a document before reading it, over `VetA` and `OutputA`; rows j0 on in `test/spec/def-path.tsv`, both ports answering as the definition does. A spread read at each member built the same day: a template that holds a path or a `key(n)` (`Val.perMember`) read at each member a tree holds wherever the spread lands, through meets, riders, members, spreads and path references as a link lands (`Val.instancesAt`), tried on the member's key, placed at the member and met at its path (`Val.spreadInst`), the spread left to admit any member (`Val.neutral`); the tree read from the schema with each such template blanked (`Val.opened`), so that it holds the members templates write; the schema's own tree for the error class and the one the data reads in for the others (`Decls.preparedS`, `Decls.preparedD`, `VetA` over two schemas), as both ports try a template only on the members there are; a spread that's a relative path read at each member too, so that a path reference's copy reads it where the copy stands, and where the schema writes it, declared under a name no term refers to (`Val.bares`), so that one naming nothing there is an error; the tree read with the links read first (`Decls.linked`), so that a member a link's template makes reads the template, and keeping what an absolute path in a template names (`Val.blank`); rows sp0 on, both ports answering as the definition does, with #500 and #501 filed for three shapes the ports read otherwise. A generator's template read at each member built on 2026-10-23: a relative path in `each`'s or `pack`'s template read at each member of the output, the generator's own instance reading each term that holds one as `any` (`Val.relBlank`, through `Val.neutral`) and the part that holds one (`Val.relPart`) met at each member, placed there (`Val.genTemplate`, `Val.genInst`), wherever the generator lands, a spread or a generator inside the template read at its own members in turn; rows gt0 on, both ports answering as the definition does. A `filter`'s condition read where the member it tries lands built the same day: `Val.placed` placing the condition one step below the filter, at a step no written path names (`.up 0`), so that a relative path that climbs out of the member names the same place for every member and one that stays inside it names nothing; `Val.forgive` exempting the condition from the references that must name something, so that one naming nothing refuses each member, as both ports answer; `vetP_iff_reads`, the verdict wherever the checker can read the two documents it hands `vet` (`Decls.readsPB`), as it can a document whose `filter` reads its source; rows fc0 on, both ports answering as the definition does. A hole its call's peer fills built on 2026-10-24, by decision 21: `Val.filled` in `Aontu/Verdict.lean`, which `Decls.readR` and `Decls.readU` read before `resolveD`, reading the meets beneath a meet first and then a meet with one side waiting on a hole (`Val.fillable`) and the other not as the waiting side with the hole bound to the other (`Val.bindHole`), a side waiting on a hole when it's the hole or a call over one through its arguments or a rider, a generator through its data alone, and a container on no hole of its members, in every form but a generator's template, an `emit`'s table and a `filter`'s condition; rows hv0 on in `test/spec/def-call.tsv`, both ports answering as the definition does, and no row holding a meet in a `match`'s scrutinee or pattern, a size or a trial, where neither port fills one in a scrutinee, a pattern, `len` or `must`, nor Go one in `contains`, `rest`, `when` or `nof` (#549). Two maps or two lists met are met member by member the same day (`Val.fillMeet`), rows hv78 on, and read through meets and riders (`Val.memberAt`, `Val.elemAt`), rows hv111 on, a key's declarations in one map met in order and a list's elements paired among those that stand (`joinFields`, `standingAt`), rows hv129 on, a spread whose template waits on a hole met with each member it meets, once (`spreadFields`, `spreadWith`), rows hv168 on, both ports answering as the definition does, but neither reading through a rider, a mark or a seal around a container (#552), and Go filling a hole inside a call's list argument (#553). Not yet built: a spread's template that holds its hole inside a container, `{&: {n: upper(_)}}`, which both ports fill at each member the spread meets, once. A call that meets more than one peer reads as the document groups its meets, where both ports read the conjunction as it's written (#512). A hole no peer in the document fills is the data's, by decision 29, built the same day (`Decls.readJ`), rows dv0 on, both ports answering as the definition does. `Output` says what each generates. Rests on P8, whose calls sit inside templates, on P3's paths, on P4's `match` and `filter`, and on ruling 13 | a generated fragment per form, both ports agreeing; the ADRs that rule generation carry §4's status line |
| **P10**: names and documents (M) | **PARTIAL**: variables built on 2026-10-22: `$name` a name the calling program declares where a document declares an alias, `Val.var n` the alias `"$n"`, which no document can write, and `Decls.withVars` the program's bindings beside the document's declarations, each any value the program builds, a kind as well as data, so that a variable no program binds is a name declared nowhere, an error; rows i0 on in `test/spec/def-gen.tsv` under the bindings both runners make, both ports answering as the definition does. A variable as a path's step the same day: `Seg.var n`, bound to the text of the scalar the program binds (`Decls.bindSeg`), a string as itself, a number as `Number.text` writes it and a boolean as its word, any other binding naming no step, as in both ports; every written step read as text by the container it meets (`Val.atW`), a map by the key the text spells and a list by the index it spells in canonical decimal (`Seg.stepIn`), so `$.q.0` reads a map's key `"0"`; and `OutputP`, what a document with paths generates, the output of its reading from the schema alone; rows i22 on and p180 on, both ports answering as the definition does. `maybe` the same day: `maybeOf`, absence where a reference at the top of the argument, the argument itself, a side of a meet, an arm of a disjunction or the value under a rider, names nothing and that is all that is wrong with it, the argument read with each such reference as `nil` and as `any`, so that `maybe($.gone & 1)` is absence and `maybe(1 & 2)` the conflict; such a reference needn't name anything (`Val.forgive`, which `Declares` and `Decls.Resolves` read); and `Val.absent`, absence, which admits every value (`Judge.absent`), generates nothing, is the unit of the meet but met with `any` stays absence (`absentOr`), is left out of a map's output at a required key as at an optional one (`Val.leftOut`), holds no position in a list, and is what a call, a generator, a selection or a `filter` makes of it; rows mb0 on in `test/spec/def-path.tsv`, both ports answering as the definition does, and none holding another case #479 lists. A list's absent element before another, decision 24, built on 2026-10-24: rows la0 on, both ports moving to the definition's reading. Source loading built on 2026-10-22: `@"p"`, the call `load`, read in place before anything else reads the document (`Decls.loaded`), each source a term the document declares under `@` and its name, so that no text is read, aontu's own term, `Data.term` of data, or a string for text; a load's name read from the directory of the source it's written in (`loadPath`), a `.` dropped and a `..` taking back a step (`normSteps`), `.aontu` supplied where the name has no extension and none for an extension the table refuses or for a module, a bare name whose first step holds a dot (`moduleRef`); a source's own loads read in from there, a source the chain already holds stopping it (`Decls.loadIn`); a source with no term, a refused extension, a module and a cycle left as a load the reading can't make, which makes the document an `error` wherever it stands, an arm a selection leaves out among them (`Decls.loadsLeft`); `VetP` and `OutputP` reading the loaded document as `VetL` and `OutputL`; rows lf0 on in `test/spec/def-path.tsv`, over the files of `test/spec/files`, both ports answering as the definition does. A source's own declarations built on 2026-10-23: `Decls.ofSource`, the declarations a source adds to the document that loads it, its term and each name it declares, every name it declares or uses read as its own (`Val.scoped`, `scopedName`, `%`, the source's name, `%` and the name, which no document can write), so that a source reads its own names and none of the document's, the document none of the source's, and two sources that declare one name hold two, as both ports scope a name to the file that declares it; a variable stays the calling program's; a name a source declares reads its loads from the source's directory, a load of the source itself a cycle, and a source the document never reads adds no names (`scopeOf`, `Decls.sourcesRead`); rows ls0 on in `test/spec/def-path.tsv`, both ports answering as the definition does, and no row holding a declaring source loaded under a key, which both ports refuse and the definition reads as at the root, nor a document that declares a name and loads a declaring source at the root, where Go keeps the document's declaration in its output, which #514 tracks. `export` and the destructure built on 2026-10-23: `Decls.ofSource` declares each name a source exports under a name of the source's own (`exportName`, `!`, the source's name, `%` and the name), naming its declaration, a name it exports and doesn't declare, one that arrived through a load among them, published as `nil`, which no destructure can take; a destructure, `{ %b: %a } = @"p"` or `{ % } = @"p"`, the load with the names it takes written after its path, loading the source where it stands and binding each name it takes in the document's scope (`Val.takes`, `Decls.takeNames`, `Decls.takeBinds`), wherever the destructure stands but in a list's element, where the ports differ (#518), so that a name taken meets a declaration of the same name; a name a destructure asks for that its source doesn't publish an `error`, used or not (`Decls.takesLeft`); rows lx0 on in `test/spec/def-path.tsv`, both ports answering as the definition does. Not yet built: a module import as the document a resolver supplies for its name; a destructure that a source or a body writes, or over a term that isn't a load; and the shorthand `{ %a %b }`. `move` built on 2026-10-22: `move(p)` the call `pref` makes of the value the path reads (`Val.prefer`), and the source hidden where the document is read, `VetP` and `OutputP` meeting the placed schema with `hide(any)` at each path a `move` reads that names something (`Decls.withMoves`, `hideAt`, `Decls.prepared`), a path to nothing hiding nothing and staying an error, so that the document generates the value once, at its new place, and the data needn't supply the source, which still refuses data that disagrees; a path into a list hides nothing yet, where both ports drop the element from the list, as a marked element holds no position (decision 18), and a `move` of a value written in place hides nothing and reads as `pref`; a `move` in a body hides its source, used or not, `movedSrc` reads a rider around the path through, and `Val.stepsW` reads the path's steps in the root by the containers they meet, variables bound; rows mv0 on in `test/spec/def-path.tsv` and i34 in `test/spec/def-gen.tsv`, both ports answering as the definition does, but for data that sets the copy of a path under a rider, which splits them and #486 tracks. Not yet read: which moves the reading makes, so a `move` in an arm no selection takes, or in a template no member instantiates, still hides its source, where both ports keep it. Rests on P3 | rows over sets of documents, a runner mode that takes several sources, both ports agreeing |
| **P11**: links and relations (M) | **PARTIAL**: path values built on 2026-10-22: `Addr`, an address, where it starts and its steps as written, and `Data.addr`, an address as a datum, which JSON writes as its text and no JSON text reads back, so `vet` refuses the string that data writes for a path value, as both ports do; `Val.addr`, `path(p)`, admitting each address its own opens (`Addr.Opens`), so two meet by the prefix rule in the longer (`addrMeet`) and a prefix subsumes its extensions (`addr_le_addr`); and `Val.pathKind`, `path`, admitting every address and sharing no value with another kind; rows k0 on in `test/spec/def-gen.tsv`, `test/spec/def-verdict.tsv` and `test/spec/def-subsume.tsv`, both ports answering as the definition does, and a string constraint met with a path value, built on 2026-10-24 (decision 23): each address the value opens admitted by its spelling, rows ks0 on in `test/spec/def-gen.tsv` and `test/spec/def-verdict.tsv` holding addresses that pass, both ports answering as the definition does, and none holding one a constraint refuses, which both ports refuse by the one address the value spells where the definition reads `incomplete` (#474). `path` of a string built the same day: `Addr.ofText?`, address text read as both ports read it, `$.` and its steps from the root or dots and their steps from a relative start, each step one or more letters, digits, `_` or `-`, text with no start read from one dot and `$` alone addressing nothing; and `Fn.path` with `pathOf`, the address a string spells, through its riders, refused where the text spells none and for any other scalar and a container, a path value handed back as it is, waiting for anything else; rows k0 on in `test/spec/def-call.tsv`, both ports answering as the definition does. `refer` built on 2026-10-22: `Fn.refer`, read as the path kind, so a string where an address must be is an error, as both ports refuse it with `refer_address`; `Decls.withRefers`, each link's template met into the target its address names from where the link stands (`Addr.from`, `Val.putW`), its marks cleared (`Val.unmark`), the targets read in passes so that one link's template can make another link's target in either order (`Decls.referPasses`), a target that names nothing in the schema's own tree or climbs past the top making the schema `nil`, an error, as both ports refuse it with `refer_unresolved`, even where the data supplies it; the schema's links read where they're written, through maps, lists, meets and riders (`Val.refers`), and a body's at the body's own place, used or not, as both ports evaluate a body; rows rf0 on in `test/spec/def-path.tsv`, both ports answering as the definition does, and none holding a body's relative link used elsewhere, which both ports read a second time from the use site under `vet`, as #488 tracks. `rel` built on 2026-10-22: `Fn.rel`, read as the relation kind (`relKind`), an address or a list or map of relation kinds, declared for every document under a name no document can write (`relName`, `Decls.withRel`), so a string, a number or `true` where an address must be is an error and data that writes the addresses as strings is invalid, as both ports answer; each leaf of a relation's value a link (`Val.addrs`, `linkAddrs`), read by `Decls.withRefers` as a `refer` is, its address from the relation's own position, and the passes one for each address the links hold; rows rl0 on in `test/spec/def-path.tsv`, both ports answering as the definition does, and none holding a relative address at a leaf, which the ports read from different places, TypeScript and Go apart once containers nest (#492) and `eval` and `vet` apart even at one level (#493). A constraint met with `rel()` built on 2026-10-24 (decision 25): both ports meet it with the relation's value, and a spread over the value's addresses holds each leaf a later list brings as a link; rows rh0 on in `test/spec/def-path.tsv`, both ports answering as the definition does. Links read where they land built on 2026-10-22: at each position of the schema's normal form (`Val.positions`), the terms the schema writes there, through meets, riders, a map's member and spread, a list's element and spread, a generator's template, `each`'s or `pack`'s, and a path reference's target within a budget (`landing`), each `refer` and `rel` among them a link read at that position (`Val.landedLinks`), so that a link in a `type()` a path reference copies, in a spread's template or in a generator's template, reads where it lands, its relative address from there; rows ld0 on and lg0 on in `test/spec/def-path.tsv`, both ports answering as the definition does. A link's template read for its member and at its place built on 2026-10-23 (#497): each term a link's landing reaches carries the member a generator's template is read for and the place it lands at, which a reference's own path leaves where it was (`LinkItem`, `linkStep`), each template read there (`Decls.linksAt`), so a hole stands for the member and `key(n)` reads the link's own place, as both ports read a template where its link stands; a generator's template landing only at the instances it makes (`genSteps`); and the links that land in a body read in the body's own tree, through its generators, spreads and references (`Decls.bodyRoot`); rows lt0 on in `test/spec/def-path.tsv`, both ports answering as the definition does, and none holding a link a path reference copies whole, which both ports flow once, its template read at one copy's place that the document's order picks (#536). Not yet read: a link in the template of a generator whose data another link's template makes, which both ports read; a `refer` or a `rel` inside a disjunction or a selection, which both ports read in the arm taken. Still to build: the graph atoms `inverse(k)` and `acyclic()` over a document's edges, which `vet` doesn't check in either port (#491); the bundled vocabularies and the `aontu:` models, as documents of P10. Rests on P3 and P10, and on G4's design | rows for each, both ports agreeing |
| **P12**: grammars (S) | **PARTIAL**: `abnf` and `parse` built on 2026-10-22 over a host that parses: `Host.compiles`, which grammars an RFC 5234 compiler compiles, and `Host.tree`, the tree its parser builds of a string a grammar reads whole, none where it doesn't; `abnf(g)` the grammar's source where it compiles and refused where it doesn't (`abnfOf`); `parse(g, v)` the tree as data, refused for the empty string and a string the grammar doesn't read (`parseOf`); and `parse(g)` alone, `Val.grammar`, the constraint of the non-empty strings a grammar parses whole (`Judge.grammar`), admitting none where it doesn't compile, which the checker reads since the host's tree is a function; rows g0 on in `test/spec/def-call.tsv` over the oracle's host, which reads grammars of one rule of one literal (`oneLiteral`), both ports answering as the definition does. Not yet built: the tree is the host's whole, its shaping by a grammar's annotations among it, where the plan states the shaping over a raw parse the host supplies. Rests on P1's opaque predicates | rows for the shaping over parses the host supplies, both ports agreeing |

The phases from P8 on, drafted 2026-10-20, take the definition from
the value language to the whole of it, each placed after what it rests
on. The open items of P1 to P5 come before them:
each read mode's reading of a number (P1), `open()` and the way out of
a `type()` seal it gives (P2), two
recursions of one shape under different names (P5), decisions 16 to
18 and 21 to 28, each ruled on 2026-10-23 and to be built as §7 records
it, and #403, a selection inside a recursive name's body.

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
next three on 2026-10-19, seven more on 2026-10-20, two on 2026-10-21
and the rest on 2026-10-23, but decision 29, raised on 2026-10-24 and
ruled on 2026-10-25. Each was raised by the phase that found it, and each stands here
until the phase that encodes it lands.

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
   ports answer as the definition does. A disjunctive size, which both
   ports refuse as an argument, is ill-formed since decision 16 was
   built on 2026-10-23, with rows of its own. Measured again on
   2026-10-23 (#529): both ports decide a size at the meet only once
   they can read the container's members, each one it requires a
   container or a value that generates, a marked member counting for
   nothing, so `len(1) & [1, integer]` waits while
   `len(1) & [1, {a: integer}]` is an `error`. They decide `unique()`
   and `contains`'s upper count there the same way, so
   `unique() & [1, 1]` is an `error` too, and they read the data's
   container so: `n: any, t: len(1)` against `{"t": [1, 2]}` is
   `invalid` in every mode, where the definition tried it at generation
   and answered `incomplete`. A clash in a disjunction's arm drops the
   arm, so `(len(1) & [1, 2]) | 3` stands. **Built 2026-10-23** as
   `meetClash` and `Val.staged` in `spec/Aontu/Verdict.lean`, in place
   of `sizeClash`: the verdict reads the normal form with each meet that
   clashes read as `nil`, an `error` in the schema and `invalid` in its
   meet with the data. The verdict fragment gains rows l129 to l239,
   which both ports answer as the definition does.
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
   container, so the seal stops at a kind, a disjunction, a preference
   and a name; a
   selection among the conjuncts restricts as a selection on the same
   scrutinee and patterns, so the seal follows it to the result it
   makes. A recursive name takes none, as both ports read it. The alias
   fragment gains 141 rows more, o0 on, which both ports answer as the
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
   is below it under `defaults` too. The `defaults` rows came on
   2026-10-21 with the procedure that decides `DefaultsLe`
   (`defaultsLe_of_walk`), rows f0 on of `test/spec/def-subsume.tsv`.
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
   **Ruled 2026-10-23: the first.** `len` takes a conjunction of
   integers, bounds, exclusions and multiples. A size that holds a
   disjunction or a preference, `len(1 | 3)` or `len(*1)`, is
   ill-formed, an `error` whatever it meets, as both ports answer; the
   ports stand. A size outside the integer domain, such as `len(any)`
   or `len(string)`, admits nothing in both ports, as decision 28 has
   it. **Built 2026-10-23**: `Val.sizeIll` in `spec/Aontu/Verdict.lean`
   holds where a size's normal form still holds a choice, a disjunction
   or a preference, through `&` and the riders (`Val.choiceLeft`), and
   `Val.illFormed` reads such a size as ill-formed. A choice the meet
   or a dead arm settles to one arm is that arm, and arms written alike
   are one (`Val.sameArm`), as both ports read `len(1 & (1 | 3))` and
   `len(1 | 1)` as `len(1)`. Rows l57 to l128 hold it, and both ports
   answer every one as the definition does (#413).
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
   wrote a broken declaration. **Ruled 2026-10-23: the first.** The
   definition reads every declaration, so that a dead or ill-formed
   body is an `error` whether or not anything reads it; the ports
   stand. **Built 2026-10-23**: `Decls.bodyIll` in
   `spec/Aontu/Verdict.lean` reads each body where no place is yet
   (`Decls.readU`), as the name and as the body itself, each part that
   holds a hole or a `key(n)` read as `any` while it waits for the use
   that places it (`Val.unplaced`), so that a conflict beside one is
   read and a body that names one waits too, a waiting call or trial
   read as `nil` where an argument both ports read as written doesn't
   stand, a template's hole and `key(n)` its member's and an `emit`'s
   table its node's (`Val.waits`),
   and a name a source publishes waits for the destructure that takes
   it; and `Decls.illFormedR` makes the document an error where a body
   doesn't stand. Forty-four cases of the alias fragment hold it, and
   both ports answer every one as the definition does (#417). A name
   whose body waits makes a body that names it wait too, through a call
   and through another name, as `Decls.waitNames` reads them, while
   the name itself stays a name, so what its body fixes holds. A
   waiting `key(n)` is any string, since a key is text wherever it
   lands. A waiting call with another count of arguments than its
   function takes is `nil` by `Fn.takes`, the split #426 tracks. Twelve
   more cases hold the first two, rows a342 to a377, and both ports
   answer each one as the definition does. Both ports read a waiting
   `key(n)` at the declaration's own name, which #528 tracks, and skip a
   conflict met with a call that waits through a name, which #530
   tracks.
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
   a marked list element until it is ruled. **Ruled 2026-10-23: the
   second.** A marked list element is no element: it holds no
   position, as an element that is absence holds none (decision 24),
   so that `[1, hide(2), 3]` is `[1, 3]` for the meet as for the
   output, and both ports' reading by position follows. **Built
   2026-10-24**: `resolveD` (`spec/Aontu/Verdict.lean`) drops an
   element whose normal form carries a mark of its own as it reads the
   list, as it drops absence, and reads each element after it at the
   index it takes (`resolveElems`), so a `key()` there reads that index,
   as both ports read it. The element is still read: a list whose
   marked element is a conflict, alone or met with the list's spread,
   is `nil` where it stands (`Decls.markClashes`), as both ports read
   the element before they drop it. A disjunction of one arm carries
   the arm's mark (`Val.hasMark`), so `a: hide(1) | 2 & 3` leaves `a`
   out of the output, as both ports do. The profile rows of the
   subsumption fragment judge each value as a document reads it, so
   `[hide(integer)]` over `[integer]` subsumes under `gen`. Rows hl0 on
   in `test/spec/def-verdict.tsv` and gl0 on in `test/spec/def-gen.tsv`.
   Both ports move, each list compacting once its own elements are
   read, and answer every row as the definition does. A marked `nil`
   still holds its position in both, which #540 tracks.
19. **An optional member whose value generates an empty map or list.**
   Raised 2026-10-21 by P8's rows for the folds (#428). Both ports leave
   such a member out of the output, so `{a?: {}}` and
   `{a?: {b?: integer}}` give `{}`, and out of the members a fold
   reads, so `sum({a?: {}, b: 2})` is `2`, where the definition's
   `genFields` generates every optional member whose value generates
   anything the spread admits, so `{a?: {}}` gives `{"a": {}}`. The
   ports also split on a disjunction: TS keeps `{a?: *[] | [1]}` as
   `{"a": []}`, Go leaves it out. The reference says only that an
   unresolved optional key is dropped. Either an optional member is
   generated wherever its value generates something, as the definition
   reads it, and both ports drop their check, or an optional member
   whose value generates an empty map or list is absent, as Go answers
   throughout, and `genFields` states it. The definition recommends the
   second: an optional structure of optional members, unsupplied,
   leaves no empty container in the output, the output is still an
   instance (ADR-007) since the key is optional, and only TS's branch
   for a disjunction moves. **Ruled 2026-10-21: the second.** An
   optional member whose value generates an empty map or list is
   absent, as Go answers. **Built 2026-10-21**: `genFields` and
   `genFieldsWith` in `spec/Aontu/Output.lean` leave such a member out
   (`Data.emptyBag`), `Val.members` skips it and `Val.genCount` doesn't
   count it, so `{a?: {}}` and `{a?: *[] | [1]}` give `{}` and
   `len(max(1)) & {x: 1, y?: {}}` admits `{x: 1}`. TS drops a disjunction
   whose default is an empty container, as it drops any other optional
   member's. Rows g75 to g92, l48 to l56 and x1935 to x1958 hold it, and
   both ports answer every one as the definition does (#428).
20. **A replacement that names a missing group, where the text holds
   no match.** Raised 2026-10-21 by P8's rows for `rep` (#449). Both
   ports read the replacement as they write it for a match, so
   `rep("abc", "b", "$9")` is an error (`rep_sub`) and
   `rep("abc", "x", "$9")` is `"abc"`, and the same holds of a `$` that
   names nothing. The reference says such a `$` is refused rather than
   expanded to the empty string, which reads either way. Either the
   replacement is read at each match, as both ports read it and the
   definition reads it meanwhile (`expandSub` inside `replaceMatches`),
   or it is read against the pattern's groups before the text is
   scanned, so that the error does not depend on the text, which both
   ports and the definition would follow. The definition recommends the
   second: a replacement that names a group its pattern has not got is
   broken whatever text it meets, and a generator that runs clean on
   today's data and fails on tomorrow's is the failure `rep_sub` exists
   to close. **Ruled 2026-10-21: the second.** **Built 2026-10-21**:
   `Host` in `spec/Aontu/Admits.lean` gains `groups`, how many groups a
   pattern of the subset captures, which the engines count on its text,
   and `repOf` refuses a replacement that `subReads` in
   `spec/Aontu/Text.lean` doesn't read against that count before the
   text is scanned. Both ports read the replacement up front too, so
   `rep("abc", "x", "$9")` and `rep("", "a", "$1")` are `rep_sub` in
   both. Rows x1959 to x1994 hold it, and both ports answer every one as
   the definition does (#449).
21. **A hole its call's peer fills.** Raised 2026-10-22 by P9's next
   slice. Outside a template, both ports fill a call's hole from what
   the call meets, and the reference documents it ("the peer goes into
   the call and is not also a constraint on the way out"):
   `upper(_) & "a"` is `"A"`, `add(_, 1) & 2` is `3`,
   `[upper(_)] & ["a"]` is `["A"]`, a spread `&: upper(_)` writes each
   member upper case, and two holes meeting are `place_pair`. The two
   ports agree on all 26 shapes probed. That isn't a meet:
   `admits_meet_iff` in `spec/Aontu/Meet.lean` says `a & b` admits what
   both admit, and `upper(_) & "a"` admits only `"A"`, which `"a"`
   refuses. Nor is it associative: `upper(_) & "a" & "a"` is a conflict
   in both ports, since the first `"a"` fills the hole and the second
   meets `"A"`. And `vet`
   reads `upper(_)` as admitting anything, `v: 1` among it. Either the
   meet takes the fill as a rule of its own, giving up
   `admits_meet_iff` and the order on terms built from it, or the fill
   is a reading the document gets before its meets mean anything: a
   meet with a free hole on one side and none on the other reads as that
   side with the hole bound to the other, as a template is read for its
   member (`resolveD` with `b`), in the order the document groups it,
   and a hole alone admits every value, as it does now. The definition
   recommends the second, which keeps `&` a meet, matches both ports on
   every shape with one peer, `vet` included, and reuses the binding
   that `each` and `pack` already read. No generated row holds a hole
   outside a template until it is ruled. **Ruled 2026-10-23: the
   second.** The fill is a reading before the meets: a meet with a free
   hole on one side and none on the other reads as that side with the
   hole bound to the other, in the order the document groups it, and a
   hole alone admits every value, so that `&` stays a meet. The ports
   stand where a call meets one peer, and move where it meets more,
   reading the conjunction as it groups rather than as it's written,
   which #512 tracks.

   Probed again on 2026-10-23, both ports read a conjunction that holds
   such a call in the order it's written, and parentheses change
   nothing, so `upper(_) & ("a" & "a")` is a conflict too. A call
   written after a peer takes that peer and meets the rest with its
   output. Written first, a call on a scalar takes the next conjunct and
   meets the rest, while a generator takes every later conjunct into its
   data. So `each(_, upper(_)) & ["a"] & ["A"]` is an error where
   `["a"] & each(_, upper(_)) & ["A"]` is `["A"]`, and `vet`, which
   meets the data last, reads `o: each(_, {v: _}) & ["a"]` against
   `{"o": [{"v": "a"}]}` as `invalid`, which #512 tracks. The
   recommendation reads a conjunction as it groups, so it parts from
   both ports wherever a call meets more than one peer. A call over a bag whose hole a peer fills,
   `sum(_) & [1, 2]`, is `3` in Go and never generated in TypeScript,
   which #511 tracks, so a row could hold no such call either.

   **Built 2026-10-24** in the definition: `Val.filled` in
   `spec/Aontu/Verdict.lean` reads the meets beneath a meet first, and
   then a meet with one side waiting on a hole (`Val.fillable`) and the
   other not as the waiting side with the hole bound to the other
   (`Val.bindHole`). `Decls.readR` and `Decls.readU` read it before
   `resolveD`, so that every reading of a document fills its holes
   first, and `filled_checkableA` keeps a document the checker can
   read. The fill reads every form but where a hole is bound, a
   generator's template, an `emit`'s table and a `filter`'s condition,
   so that a meet in a `match`'s scrutinee, pattern, result or
   default, a `filter`'s source, a size or a trial is filled too, a
   review finding on the first cut. A side waits on a hole when it's the hole, or a call over one
   through its arguments or a rider. A generator waits through its data
   alone, since its template binds its holes to each member, and a
   container waits on no hole of its members, since filling it whole
   would hand the call the container. Rows hv0 on of
   `test/spec/def-call.tsv`, 26 cases in each of the three modes: a call
   on a string and on a number, written before its peer and after it,
   over a call, and with a second peer the document groups after the
   first; the hole alone; and, where the data leaves the member out so
   that the fill supplies it, a generator over a list on either side, a
   fill inside a map and a list, and a second peer that refuses the
   output; and a fill in a `match`'s result and in its default. Both
   ports answer every row as the definition does. Four shapes stay out
   of the rows. A meet in a `match`'s scrutinee or pattern, in `len` or
   in `must`, which neither port fills, and in `contains`, `rest`,
   `when` or `nof`, which Go doesn't fill (#549). A hole in a spread's
   template, `{&: upper(_)} & {a: "x"}`, which both ports fill at each
   member the spread meets, once, and the definition leaves unfilled. A
   call that meets more than one
   peer, where the ports read the conjunction as it's written (#512).
   And a call over a hole no peer in the document fills, which the data
   fills, as decision 29 rules, built later the same day.

   On 2026-10-25 the fill reached a container's members: two maps or two
   lists met are met member by member, by key or by position
   (`Val.fillMeet`, `fillFields`, `fillElems`), so that a member's hole
   is filled from the member it meets, nested containers in turn. The
   peer a hole takes is spent, read as `any`, and each container is kept
   whole, so a seal, a spread and a member one side lacks stand.
   `fillMeet_checkableA` keeps the two sides readable. Rows hv78 on, 11
   cases in each mode: a list on either side, a map with a member the
   peer lacks, two members, a nested map, a list longer than the other
   on either side, a member pair that both wait, an error, and a second
   peer. Both ports answer every row as the definition does.

   The same day the container fill read through meets and riders: each
   side reads through its own, in turn, and finds the other's member
   through the other's (`Val.memberAt`, `Val.putMember`, `Val.elemAt`,
   `Val.putElem`), so `({a: upper(_)} & {b: 1}) & {a: "x"}` fills `a`.
   Rows hv111 on, 6 cases in each mode: a meet of maps on either side
   and on both, a member pair across a meet, a list whose inner meet
   fills its hole first, an error, and a nested list. Both ports answer
   every row as the definition does. Neither port reads through a rider
   or a mark around a container, and both read
   `meta({a: upper(_)}, {d: 1}) & {a: "x"}` as an error (#552), so no
   row holds one.

   The review of #551 found three more shapes. A key declared more than
   once, which both ports read as one meet in the order it's written,
   in the peer and in the map itself, so `v: upper(_)` beside `v: "a"`
   is `"A"`. A marked list element, which holds no position. And a
   seal, which both ports read as a call over the hole, binding the
   whole peer to it, as they read a rider or a mark around a container.
   The first two were built the same day. `Val.filled` merges a key's
   declarations in one map into one, as the engines do: met in the
   order they're written and optional only where each is (`joinFields`).
   So a map the definition reads declares each key once, and one that
   declared a key twice, which generated nothing before, generates. The
   peer's member under a key is the meet of its declarations
   (`declsAt`), and a spent peer is written `any` at each later one
   (`putField`). A list's elements are paired among those that stand
   (`standingAt`, `setStanding`). Rows hv129 on, 13 cases in each mode,
   and both ports answer every row as the definition does. A list whose
   one hole no peer element fills, `[upper(_)] & [hide("a")]`, is left
   out here: the data fills it, by decision 29, which the dv rows hold.
   The seal stays as the definition reads it, part of its container,
   with the riders and marks (#552). An element that reads as absence
   only once a path is read, `[upper(_)] & [maybe($.nope), "b"]`, holds
   its position for the fill, where both ports skip it. And Go fills a
   hole inside a call's list argument, `sum([_, 1]) & 3`, where
   TypeScript and the definition read a container as waiting on none
   (#553).

   A spread whose template waits on a hole was built next. It fills
   each member it meets, once: its own map's or list's members in
   `Val.filled` (`spreadFields`, `spreadItems`), a peer's members
   (`spreadOnto`, `spreadOntoAt`), and a peer's spread the map's own
   (`spreadFrom`, `spreadFromAt`). The member reads as the template with
   the hole bound to it (`Val.spreadMeet`), and the spread then reads the
   key as `any`, a selection on the key (`spreadWith`), so a later meet's
   member under that key meets the filled value, and a key a later meet
   brings is filled in turn. List elements are read by the positions
   they hold among those that stand. Rows hv168 on, 19 cases in each
   mode, and both ports answer every row as the definition does. A
   template that holds its hole inside a container, `{&: {n: upper(_)}}`,
   isn't filled yet: it needs the fill to recurse through a template it
   draws out of the spread. `{&: upper(_)} & ({a: "x"} & {a: "x"})` is
   out of the rows, since the definition reads the peer's meet first, as
   the document groups it, and both ports read the conjunction as it's
   written (#512).
22. **A path into a generator's output.** Raised 2026-10-22 by P9's
   `key(n)` slice. Both ports read a key a path reaches where the path
   lands, so `a: {x: key()}` and `b: $.a` give `b: {x: "b"}`, and a
   path to a generator rereads its template's keys the same way:
   `a: pack(["x"], {n: key(2)})` and `b: $.a` give `"b"` at `b.x.n`.
   A path into the generator's output, though, finds the keys the
   generator wrote: `x: pack(["a"], {n: key()})` and `y: $.x.a` give
   `y: {n: "a"}`, not `"y"`, and with `key(2)` and `y: z: $.x.a` the
   answer is `"x"`, not `"y"`. The reference says a key doesn't survive
   a reference, rereading at the referring site, and that generated
   children are ordinary children. Either every path rereads its keys
   where it lands, a generator's output included, as the definition
   reads it, since the roots paths read place nothing (`Decls.readU`),
   and both ports move for a path into generated output; or a
   generator's output holds the keys it wrote, as both ports answer,
   and the definition reads a template's keys at expansion in the root
   too, while a path to the generator itself still rereads them, which
   needs the root to tell a generator's position from its output's. The
   definition recommends the first: one rule for every path, which the
   reference already states, where the second makes a path's answer
   depend on whether its target came from a generator, which the
   referring document can't see. No generated row holds a path into a
   generator's output until it is ruled. **Ruled 2026-10-23: the
   first.** Every path rereads its keys where it lands, a generator's
   output included, and both ports move for a path into generated
   output, and for a path that lands above its target, whose `key()`
   they read wrong too: `y: $.x.a` over `x: {a: {n: key()}}` gives
   `"n"` at `y.n`, not `"y"`. #520 tracks both.
23. **A string constraint met with a path value.** Raised 2026-10-22 by
   P11's first slice (#474). ADR-016 gives a path value two rules. Two
   paths meet by the prefix rule, so `path($.a) & path($.a.b)` is
   `path($.a.b)` and `path($.a)` subsumes `path($.a.b)`: the definition
   reads `path($.a)` as every address `$.a` opens (`Judge.addr`), which
   the meet and the order both need. And a string constraint, `min`,
   `max`, `above`, `below`, `len`, `re` or `format`, reads a path value's
   spelling, `neq` taking path values as its ends. Both ports read the
   one address the value spells, where the two meet, so the answer
   depends on the order of the meets:
   `above("$.a") & path($.a) & path($.a.b)` refuses where
   `path($.a.b) & path($.a) & above("$.a")` is `"$.a.b"`,
   `{x: len(5) & path($.a)} & {x: path($.a.b)}` refuses where the flat
   meet is `"$.a.b"`, and `path($.a) & path($.a.b) & neq(path($.a))`
   refuses where `neq(path($.a)) & path($.a.b)` is `"$.a.b"`. No
   reading by admission gives both answers of a pair. Either a string
   constraint holds of each address a path value admits, by that
   address's spelling, so that `above("$.a") & path($.a)` is the
   addresses strictly under `$.a`, which generate nothing until a
   longer path arrives, and every order of the meets answers alike,
   which both ports would follow by holding such a constraint until the
   path is settled; or a string constraint admits no address, as
   `string` admits none, so that `len(3) & path($.a)` is `nil`, giving
   up the spelling ADR-016 grants and the rows of `test/spec/path.tsv`
   that read it. The definition recommends the first, which keeps the
   spelling and makes `&` a meet again, at the price of `incomplete`
   rather than `error` where a constraint asks more of a path than it
   spells yet. Meanwhile the definition reads the second, since no
   string constraint admits an address, and no generated row meets a
   path value with one. **Ruled 2026-10-23: the first.** A string
   constraint holds of each address a path value admits, by that
   address's spelling, so that every order of the meets answers alike;
   both ports hold such a constraint until the path settles, and where
   it asks more of a path than the path spells yet the answer is
   `incomplete`. **Ruled 2026-10-24, where no address satisfies the
   constraint**: an address a string constraint refuses reads
   `incomplete`, whether or not a longer one could pass. So
   `re("^y$") & path($.a)` and `max("$.a") & path($.b)`, which no
   address under the path satisfies, read `incomplete` too, where both
   ports answer `error`, and the definition needs no test of whether
   some address under the path satisfies the constraint, which an
   opaque pattern couldn't give. **Ruled 2026-10-24, for a trial**: a
   trial over a path value that refuses the address the value spells,
   `must`, `nof` or `when`, reads `incomplete` too, where decision 8
   reads a trial's refusal at generation as `invalid`: the schema
   writes the address, so no data can be at fault. So
   `path($.a) & must(len(5))` is `incomplete`, where both ports answer
   `invalid`, and `must`'s message is never reported for an address.
   **Built in the definition 2026-10-24**: `Judge` admits an address
   under `min`, `max`, `above` and `below` with a string end, `len`,
   `re` and `format` by its spelling (`minAddr` and its kin in
   `spec/Aontu/Admits.lean`, and `Data.size` of an address its
   spelling's length), so the meet of a path value with one admits
   each address the value opens whose spelling passes, and generates
   the value's own where it passes. `Val.untried` leaves a size and a
   trial unread on a map or a list only (`Val.onLeaves` in
   `spec/Aontu/Verdict.lean`), so a refusal at generation never falls
   on an address, and each refused address reads `incomplete`. Rows
   ks0 on of `test/spec/def-gen.tsv` and `test/spec/def-verdict.tsv`
   hold addresses that pass, both ports answering as the definition
   does. Both ports still read the one address the value spells when
   the two meet and refuse it where it doesn't pass, where the
   definition reads `incomplete`, so no row holds a refused address
   until they hold the constraint as the ruling has them do (#474).
   `neq` with path values as its ends isn't held yet.

24. **A list element that is absence.** Raised 2026-10-22 by P10's
   third slice (#479). ADR-034 drops absence from a list without
   leaving a hole, and ADR-007 makes what evaluation singles out an
   instance of the schema. Both ports hold an absent element at its
   position while the list meets another and drop it from the output
   only, so `a: [maybe($.gone), "a", 2]` evaluates to
   `{"a": ["a", 2]}`, which `vet` refuses against the same schema
   (`$.a.1: scalar_kind`) while it admits `{"a": [7, "a", 2]}`, and
   `[1, maybe($.gone), 2] & [1, 5, 2]` is `[1, 5, 2]`. No reading
   keeps all three of an output with no hole, a meet by position and
   an output that is an instance. Either a list holds no position for
   an element that is absence, read before the list meets anything, so
   that `[maybe($.gone), "a", 2]` is `["a", 2]` for the meet as for the
   output, `vet` admits `["a", 2]` and refuses `[7, "a", 2]`, and
   ADR-007 holds as stated; or the element keeps its position for the
   meet and only the output drops it, as both ports do, and ADR-007
   holds only of a list whose absent elements come last. The
   definition recommends the first and reads it meanwhile: `resolveD`
   drops the element as it reads the list. No generated row holds an
   absent element before another. A link after an absent element,
   `[maybe($.gone), rel(t) & [path($.a)]]`, is read at the index the
   document writes it at, which the dropped element shifts, so its
   template flows nowhere where both ports flow it (#494's review); the
   ruling settles that too. **Ruled 2026-10-23: the first.** A list
   holds no position for an element that is absence, as the definition
   reads it, and both ports move, a link after an absent element among
   what they read at the index the element leaves. **Built
   2026-10-24** in both ports: each drops an element that is absence
   before the list meets anything, and two lists pair by position only
   once each knows which of its elements stand, so
   `[1, maybe($.gone), 2] & [1, 5, 2]` is a conflict and
   `[maybe($.gone), "a", 2]` admits `["a", 2]`. Rows la0 on in
   `test/spec/def-path.tsv`. A `key()` after an absent element still
   reads the index the document writes in both ports, where the
   definition reads the index the element takes, which #539 tracks.
   A link after an absent or a marked element lands at the index its
   element takes (`Decls.holdsPlace`), as both ports read it.

25. **A constraint met with `rel()` before its value.** Raised
   2026-10-22 by P11's fourth slice (#496). Both ports hold a
   constraint that meets `rel()` before the relation's value arrives
   and meet it with each leaf once the value does, so
   `rel() & path & [path($.a)]` generates `["$.a"]` where
   `rel() & ([path($.a)] & path)` refuses, `path` meeting the list
   before the relation does, and `len` held the same way meets the
   list, not each leaf. No meet gives both answers of the pair. Either
   a constraint met with `rel()` meets the relation's value as any meet
   does, so that `rel() & path & [path($.a)]` is `nil`, as
   `path & [path($.a)]` is, and an author constrains each leaf with a
   spread, `[&: re("sa$")]`, which holds every element in any grouping;
   or `rel()` holds what meets it for its leaves, which a list met with
   a constraint first would have to wait for. The definition recommends
   the first and reads it meanwhile, and no generated row meets `rel()`
   with a constraint before its value. **Ruled 2026-10-23: the
   first.** A constraint met with `rel()` meets the relation's value as
   any meet does, as the definition reads it, and both ports move.
   **Built 2026-10-24**: both ports meet the constraint with the
   relation's value, the list or map of addresses, where they met it
   with each leaf (`RelVal` in `ts/src/val/ReferFuncVal.ts` and
   `go/refer.go`), so `rel() & re("sa$") & [path($.sa)]` is an error,
   as `re("sa$") & [path($.sa)]` is. A spread the value writes that
   holds addresses alone now holds each leaf's link beside it, so a
   leaf a later list brings is a link and the template flows into its
   target, as the definition reads every leaf of the value; before,
   both ports left such a leaf unlinked. Rows rh0 on of
   `test/spec/def-path.tsv`, and the shared rows of `test/spec/rel.tsv`
   that read a held `re()` at each leaf now write it in the spread. A
   spread that can hold a container keeps a later element unlinked in
   both ports, where the definition links every leaf of the value
   (#542).
26. **A relative path that a copy holds.** Raised 2026-10-23 by P3's
   alias bodies (#504). Both ports read a relative path inside a body
   that an alias or a path reference copies either where it's written
   or where the copy stands, by the order the document writes them.
   Evaluating `x: 1` and `a: {x: 2, b: %T}` with `%T = {v: ..x}` gives
   `a.b.v` 1, read at `$.%T`, where the alias is written before `a`,
   and 2, read at `a.b`, where it's written after; a path reference's
   copy reads the same way, so `c: {x: 3, d: $.a.b}` with `a.b`
   holding `v: ..x` gives `c.d.v` 2 or 3. `vet` reads an alias's body
   at the use in either order, so it refuses the output `aontu`
   generates for the first file, and the two ports split on a call in
   the body. Both ports read a body at its own place too, used or not,
   so a path that names nothing there is an error whatever each use
   reads, and a body that's itself a relative path, `%T = .x`, reads
   there in every order. No order-independent reading gives every
   answer. Either a relative path reads only where it's written and a
   copy copies its value, which is what evaluation answers where the
   alias or the target is written first; or a copy is a destination,
   as ADR-025 has a reference's copy, and reads each relative path
   again where it stands, which is what `vet` answers for an alias's
   body, and what the definition already does for `key()` and for the
   templates of spreads and generators, at the cost of reading
   `%T = .x` at each use too. The definition recommends the second, the
   one ADR-025 states and its templates follow, and reads the first
   meanwhile, as it did before the question arose; the generated rows
   hold only what both ports answer alike in every order. **Ruled
   2026-10-23: the second.** A copy is a destination: it reads each
   relative path again where it stands, as ADR-025 has a reference's
   copy, `%T = .x` at each use among them; the definition and both
   ports move.
27. **A copy's marks and seal.** Raised 2026-10-21 by P8 (#445). The
   reference says `copy(v)` clears the `type` and `hide` marks. Both
   ports clear them, and unseal, only through a reference:
   `copy(hide(1))` stays hidden and `copy(close({a: 1}))` stays sealed,
   while `x: close({a: 1})` with `v: copy($.x)` admits `{a: 1, b: 2}`.
   **Ruled 2026-10-23: `copy` clears the marks and the seal of any
   argument**, a literal's as a reference's, and the reference states
   that it unseals; both ports move for a literal argument, and the
   definition holds `copy` once they do. **Built 2026-10-23**: both
   ports copy any argument as written, so that each reference in it
   reads where the copy lands, drop each `hide()`, `type()` and
   `close()` it writes, at every depth, and read each reference in it
   as the copy's, which clears the marks and the seal of what it
   brings (`CopyFuncVal.resolve` in TypeScript, `stripMarks` in Go); `callTerm`
   in `spec/Aontu/Verdict.lean` makes a `copy` its argument's normal
   form with its marks cleared and every map and list in it unsealed
   (`Val.unseal`). Twenty-seven cases of the path fragment hold it, rows cp0
   on, and both ports answer every one as the definition does.
28. **An atom over an argument outside its domain.** Raised 2026-10-23
   by P8's bounds over terms (#509). Both ports' `vet` reads an atom
   over a bare path to an argument outside its domain, such as `mulof`
   over a path to `0` or `len` over a path to a string, as an `error`,
   and the same argument written as a literal, or computed by an
   expression, as an atom that admits nothing, `invalid`. **Ruled 2026-10-23: an atom that admits
   nothing**, however the argument is written, so that the verdict is
   `invalid`; both ports move for the bare path. **Built 2026-10-23**:
   both ports leave a residual that admits nothing where a waiting atom
   settles with an argument outside its domain, as the literal does,
   rather than an error in the schema alone. A choice still to make, a
   disjunction or a preference, stays an error whatever the atom meets,
   as decision 16 has it of a size. The definition gains `Val.nothing`
   in `spec/Aontu/Syntax.lean`, the atom that admits nothing: it
   stands, refuses every value (`Judge.nothing`), generates nothing,
   and the meet makes it `nil` against all but `any` (`nothingOr`).
   `bndOf` in `spec/Aontu/Verdict.lean` makes it of a bound over an
   argument outside its domain, a kind, a bound, a pattern and a meet
   among them (`Val.noEnd`), and refuses a bound over a choice
   (`Val.isChoice`). Rows bd45 to bd71 and bd78 to bd80 read `invalid`
   where they read `error`, ten cases join them as rows bd102 to
   bd131, and both ports answer every row as the definition does
   (#509). A `neq` over a sole list that isn't empty reads the list's
   elements, as both ports do, so a choice among them stays an error,
   and both ports check the elements for one too. `len` over `any` or a
   trial admits no size (`Val.unsized` in `spec/Aontu/Admits.lean`), as
   both ports refuse either its argument, and `resolveD` makes such a
   size `Val.nothing`, as `bndOf` makes a bound, so that it refuses at
   the meet. Fourteen cases join the rows as bd132 to bd173.
29. **A call over a hole the document leaves unfilled.** Raised
   2026-10-24 by decision 21's build. The definition fills a hole from
   the document alone, and reads a call over a hole that no peer in the
   document fills as a call over a term outside its domain, an `error`
   in every mode, as both ports read `upper(any)` and
   `add(integer, 1)` (`func_arg`). Both ports' `vet` meets the data as
   one more conjunct, written last, so the data fills such a hole as
   the call's peer. `v: upper(_)` is `valid` against `v: "a"`, since
   `upper("a")` is `"A"` and the peer is no constraint on the way out,
   and against `v: 1`. `add(_, 1)` against `v: "a"`, `pack(_, {})`
   against `v: 1` and `each(_, upper(_))` against `v: 1` are `invalid`,
   the call refusing its argument. Where the data leaves the position
   out the call waits, `incomplete`, and `valid` under `--partial`.
   Evaluated alone, such a call generates nothing, `mapval_no_gen`.
   Two sides that both wait on a hole, one of them a call, meet as an
   error in both ports, `place_pair`: `upper(_) & _` and
   `upper(_) & lower(_)`, which the definition reads as an `error` too.
   Two bare holes meet as a hole, so `_ & _` generates nothing and
   refuses nothing, as the definition reads it.

   Either the data is the peer of a hole the document leaves unfilled,
   so that `vet` reads the schema met with the data through the fill,
   as both ports read it, or such a call is an `error` whatever the
   data, as the definition reads it now, and both ports' `vet` moves,
   which #548 tracks. The definition recommends the second. The data is what `vet` judges
   and no part of the document, and a hole alone admits every value, so
   a call over it is a call over `any`, which both ports refuse. It
   keeps `valid` meaning that the data is an instance, which
   `v: upper(_)` against `v: "a"` isn't, since what the schema makes of
   `"a"` is `"A"`. And it agrees with the reference, for which a hole
   unfilled at generation is an error.

   **Ruled 2026-10-25: the first.** The data is the peer of a hole the
   document leaves unfilled: `vet` reads the schema met with the data
   through the fill, the data last, so `v: upper(_)` is `valid` against
   `v: "a"`, `add(_, 1)` is `invalid` against `v: "a"`, and a call
   whose position the data leaves out waits, `incomplete`. The ports
   stand, and the definition moves.

   **Built 2026-10-25.** `vet` reads the schema against the data
   (`Decls.readJ`): the schema as read, met with the data through the
   fill, the data last, and read again, so that a call the data fills
   is made. A hole waits (`Val.pending`), so a call or a generator over
   one stays unmade until the data fills it. A call the data leaves the
   reading unable to make fails it (`Val.fails`), `invalid`, as both
   ports refuse `add(_, 1)` against `"a"`. A call that waits stands, and
   two sides met that both wait, one of them more than the hole, are
   ill-formed (`Val.illFormed`), as both ports' `place_pair` is, while
   `_ & _` meets as one hole. Without the fill, the data is checked with
   each waiting part read as `any` (`Val.waitAny`). Rows dv0 on, 19
   cases in each mode, and both ports answer every row as the definition
   does; no other row moved.

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
