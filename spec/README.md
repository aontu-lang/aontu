# The definition

The formal definition of the aontu language, in Lean 4: what a value
admits, the order between values, and what any `subsume` must answer,
written as relations that say what the right answer is and not how to
compute it. The plan is
[docs/design/DEFINITION.0.md](../docs/design/DEFINITION.0.md) and the
decision is ADR-069.

It is one definition. Every module reads one model of the data, one
syntax of values, and one admission relation, under one namespace,
`Aontu`, and no module declares a copy of its own. It is not a third
implementation: `ts/` and `go/` implement the language, `test/spec/`
holds the shared rows they are held to, and `spec/` says what those
rows should expect.

It says what values mean and nothing about text. A value of
`Aontu/Syntax.lean` is a term, not a text, and the data of
`Aontu/Data.lean` are aontu's own values, not JSON: numbers in the
language's four leaves, each held as what it is, strings, booleans,
null, maps, and lists. How a file becomes either is the business of
the [grammar](../grammar/aontu.abnf) and of each port's reader. The vet
modes are not reading alone: they change what `valid` means, so the
plan makes them parameters of the definition. The data holds every
leaf either mode reads a number into, and stating each mode's reading
is still to come. The oracle writes its cases as text for the ports to
run, so its printer, `Oracle/Print.lean`, sits beside it, outside the
definition.

JSON Schema is not a concept of the language, and nothing here
mentions it. The language's part is power: what the importer writes
for a JSON Schema keyword is an aontu value, such as
`number & multiple(1)` for the whole numbers, and the definition says
what that value means on its own terms. The importer is a tool, held
to the JSON Schema suite.

## Layout

| Path | Holds |
|---|---|
| `Aontu/Data.lean` | the data, scalars first: the four leaves, each a type named as aontu names it and holding exactly its leaf's numbers: `Integer`, a whole number with the proof that the `integer` leaf holds it (`IntegerLeaf`); `Float`, a float as its binary64 fields, with the decimal it shows; `BigInteger`; `BigDecimal`; then `Number`, the four together; strings; then `Data`, with maps and lists, `Same`, which compares two values as values, paths into a value, and `WellFormed` (no key twice in a map). `ℤ` and `ℕ` are Lean's `Int` and `Nat` |
| `Aontu/Syntax.lean` | the values, one constructor per construct, scalars first: the kinds, the four number kinds among them, `string & empty()`, scalar literals, numbers of every leaf among them, the bounds `min`, `max`, `above`, and `below` (the constructor `beneath`, since Lean keeps `below`), each with a number or a string at its end (`Bound`), `neq`, `multiple`, `len`, `unique`, `re`, and `format`, maps with optional keys, a spread and a seal, lists with a spread and a seal, `\|` with each arm's rank, `*` alone, `&`, aliases, and paths; `Env`, the alias declarations; and `super`, the parent type of a term, which `*x` alone widens to |
| `Aontu/Admits.lean` | `Host`, the two predicates the definition leaves to the engines, which strings a pattern matches and which a format reads, as the opaque constant `host`; `Admits`, what a value admits, one inference rule per form, a path reading by declaration and so having none; and `Instance`, the question `aontu vet` answers, which only a value can satisfy |
| `Aontu/Names.lean` | `Decls`, a document's alias declarations and the environment they make; `Val.refs` and `Val.unguardedRefs`, the names a value refers to, and those it reaches with no key and no element between; `Recursive`, a name that refers to itself through any number of declarations; `Guarded`, the alias-cycle rule, that no name does so with nothing between; `close`, the closure computed by rounds and admitted by `recursiveB_iff` and `guardedB_iff`; and `alias_self_admits_nothing`, that a name declared as itself admits nothing |
| `Aontu/Alias.lean` | how a document reads under its declarations: `expand`, each reference to a name that is not recursive replaced by the meet of its bodies, and a reference to a recursive name left as a residual; `Decls.envE`, the environment of expanded bodies; `meetD`, the meet in which a residual expands by one level against concrete structure and never against `any`, a reference or a connective, and a literal meets a term by the checker that reads the names, `litMeetD`, beside `admits_meetD`; `normaliseD`; `checkD` and `checkR`, the checker whose hook unfolds a name against the data, a stack holding the names being unfolded at one datum, beside `checkR_iff` under the alias-cycle rule; `normaliseD_checkableA`, that the meet keeps a term the checker can read; and `OutputD` with `outputD_admits` and `outputD_iff` |
| `Aontu/Paths.lean` | how a path reads: `Val.at`, the term at a path, through maps by key and lists by index and through nothing else; `pathName` and `Val.pathsToAliases`, each path read as a reference to a name; `Decls.ofPaths` and `Decls.withPaths`, the names declared as the terms at the paths in the root, the normal form of the schema met with the data; `Decls.Resolves`, that every path resolves in the schema's own tree; and `VetP` with `vetP_iff`, the verdict of a document with paths |
| `Aontu/Order.lean` | the order `⊑`, its ends, the meet as its greatest lower bound, the strict bounds under their closed ones (`above_le_min`, `beneath_le_max`), ADR-045's merge as a theorem, and `SubsumeCorrect`, the contract any `subsume` must meet |
| `Aontu/Meet.lean` | `meet`, the meet computed as the engines compute it, one step at a time: `nil` the zero and `any` the unit, a disjunction met arm by arm with its dead arms dropped, a preference alone as `x \| super(x)`, two maps merged key by key and two lists position by position, a literal met with what admits it, two references to one name met in that name, and two atoms that share no value met in `nil`; beside `admits_meet`, the theorem that the term it computes admits a value exactly when both sides do, and `normalise`, a term met with `any` |
| `Aontu/Output.lean` | `Gen`, what a term generates, by recursion on the term: a literal its value, a map its declared keys that generate, a list its positions, a disjunction what the arms the rank rule picks all generate, a meet left as written what one side generates and the other admits; `Output`, `Gen` of the normal form; `output_admits`, ADR-007; `output_unique`; and `gen`, which computes it, beside `gen_iff` |
| `Aontu/Verdict.lean` | `Vet`, the verdict `vet` gives under a mode: `error` for a schema whose normal form holds a `nil` outside a spread or a preference clash, `invalid` where the meet with the data is dead, `valid` where it singles out a value, and without the fill where the data is an instance too, `incomplete` otherwise; `vet` computes it beside `vet_iff`; and the theorems `vet_strict_valid_instance`, `vet_valid_filled` and `vet_invalid_not_instance` |
| `Aontu/Trial.lean` | the trial schemas `nof` and `when`, where negation lives, above `Admits` |
| `Aontu/Check.lean` | `checkWith`, the checker with a hook for names, beside `checkWith_iff`, the theorem that makes its answers the definition's on every value that reads no path, no pattern and no format, given a hook that is right where it is asked (`HookOk`); `check`, the checker with no hook, beside `check_iff` on every checkable value, one that reads no alias, no path, no pattern and no format; `checkSuper`, which decides admission by the parent type, beside `checkSuper_iff`; `Data.wf`, which decides that a Lean `Data` is a value, beside `Data.wf_iff`; and `Data.same`, which decides `Data.Same`, beside `Data.same_iff` |
| `Aontu/Tour.lean` | the examples [`docs/tutorial-definition.md`](../docs/tutorial-definition.md) walks through, each proved, and each a transcript on that page too |
| `Aontu/Axioms.lean` | the axiom gate: `#print axioms` on the named theorems, held by `#guard_msgs` to `propext` and `Quot.sound` |
| `Oracle/Print.lean` | the oracle's printer, from values and data to the text both CLIs read; no part of the definition |
| `Oracle.lean` | the executable: every value of the fragment up to one meet (600) against 24 instances, 14,400 `verdict` rows, each with the verdict `check` gives, which `verdict_exact` makes the definition's; and, as `oracle bounds`, the second fragment, the bounds beyond `min`, `max`, and `multiple` (115 values) against 30 instances, 3,450 rows, which `bound_verdict_exact` makes the definition's; and, as `oracle choice`, the third, `\|` and `*` over scalars, kinds, bounds, and sealed lists (52 values) against 22 instances, 1,144 rows, which `choice_verdict_exact` makes the definition's; as `oracle gen`, the fourth, what evaluation singles out, `gens` rows which `gen_output_exact` makes the definition's; as `oracle verdict`, the fifth, the verdicts of 57 cases in the three modes, which `vet_verdict_exact` makes the definition's; as `oracle alias`, the sixth, 70 documents with declarations in the three modes, recursive names among them, 210 rows, which `alias_verdict_exact` makes the definition's; and as `oracle paths`, the seventh, 60 documents with paths in the three modes, 180 rows, which `path_verdict_exact` makes the definition's |
| `ledger.tsv` | the rows the ports do not answer as the definition does, each with its cause and which side moves; both runners read it by name |
| `tools/differential.py` | runs the rows through both CLIs and writes every disagreement by name, the material of the ledger |

The rows live in the seven `def-` files of `test/spec/`, `def-fragment.tsv`
to `def-path.tsv`, under the `verdict` and `gens` modes of the shared
format, where both ports' spec runners run them as they run every row;
nothing here is needed at test time. A `verdict` row runs
`aontu vet` on data written in aontu, whose literals name their leaf,
so the default reading gives each number the leaf the oracle means:
`0d1.5` is a big decimal, and `1.5` would be a float. No term the
oracle builds holds a literal or a default, so the schema supplies no
member for `--no-fill` to refuse. Core Lean only: no library, no
network.

## What it does not yet hold

Each of these is a later phase of the plan, and none has a rule here,
so the definition says nothing about it:

- each read mode's reading of a number, and the exactness budget of a
  big decimal (P1);
- a trial inside a value (P3 and P4);
- the subsumption table as theorems, and a contract for each `subsume`
  profile beyond `values` (P5).

## Build and run

The toolchain is pinned in `lean-toolchain`. With `lean` and `lake`
from that release on `PATH`:

```sh
make spec                                   # every proof, the rows regenerated, the committed copy diffed
cd spec && lake build                       # the proofs alone
cd spec && lake exe oracle > ../test/spec/def-fragment.tsv
cd spec && lake exe oracle bounds > ../test/spec/def-bounds.tsv
cd spec && lake exe oracle choice > ../test/spec/def-choice.tsv
cd spec && lake exe oracle gen > ../test/spec/def-gen.tsv
cd spec && lake exe oracle verdict > ../test/spec/def-verdict.tsv
cd spec && lake exe oracle alias > ../test/spec/def-alias.tsv
cd spec && lake exe oracle paths > ../test/spec/def-path.tsv
python3 -I tools/differential.py ../test/spec/def-fragment.tsv <workdir> <go-cli> <ts-cli-js>
```

`lake build` ends with no `sorry`, and no named theorem rests on an
axiom beyond `propext` and `Quot.sound`: none uses `Classical.choice`,
so every proof is constructive, and `Aontu/Axioms.lean` fails the
build if one comes to. The rows are a committed generated copy: `make spec` fails when the committed file differs from a fresh
one, as the coverage job does for `ts/dist`. CI runs `make spec` as
`build.yml`'s `spec` job, which fetches the Lean release by hash.

## What is trusted

The relations are the definition and prove nothing about themselves.
Everything executable in it is admitted only beside a proof, `check`
by `check_iff` and `Data.wf` by `Data.wf_iff`, but one function: the
decimal a float shows, `Float.shortest`, is part of the definition
itself. No theorem states what makes a decimal the shortest; the
function matches the shortest rendering of JavaScript and of Go on
6,381 doubles, normal, subnormal, and extreme. Two predicates are not
stated at all: which strings a pattern matches and which a format
reads are the opaque `host`'s, so a theorem about `re` or `format`
holds whatever they are, and `check` answers neither. The one piece
trusted without proof is the oracle's printer, `Oracle/Print.lean`,
which turns the abstract syntax into the text the CLIs read. It is no part of the
definition: that a port reads the printed text as the value printed is
a claim about the port's reader, which the rows test and no theorem
makes. It spells what the published grammar spells, prints only the
forms the oracle writes, and is reviewed as the definition is.
