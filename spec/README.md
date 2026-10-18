# The definition

The formal definition of the aontu language, in Lean 4: what a value
admits, the order between values, and what any `subsume` must answer,
written as relations that say what the right answer is and not how to
compute it. The plan is
[docs/design/DEFINITION.0.md](../docs/design/DEFINITION.0.md) and the
decision is ADR-069.

It is one definition. Every module reads one model of JSON, one
syntax of values, and one admission relation, under one namespace,
`Aontu`, and no module declares a copy of its own. It is not a third
implementation: `ts/` and `go/` implement the language, `test/spec/`
holds the shared rows they are held to, and `spec/` says what those
rows should expect.

It says what values mean and nothing about text. A value of
`Aontu/Syntax.lean` is a term, not a text, and a JSON value of
`Aontu/Data.lean` is a value, not a JSON text: a number is its value,
whatever digits wrote it. How a file becomes either is the business of
the [grammar](../grammar/aontu.abnf) and of each port's reader. The vet
modes are not reading: they change what `valid` means, so the plan
makes them parameters of the definition, which so far holds the exact
mode's data, in which a number is its value. The oracle writes its cases as text for the ports
to run, so its printer, `Oracle/Print.lean`, sits beside it, outside
the definition.

JSON Schema is not a concept of the language, and nothing here
mentions it. The language's part is power: what the importer writes
for a JSON Schema keyword is an aontu value, such as
`number & multiple(1)` for the whole numbers, and the definition says
what that value means on its own terms. The importer is a tool, held
to the JSON Schema suite.

## Layout

| Path | Holds |
|---|---|
| `Aontu/Data.lean` | JSON values, scalars first: `IntegerLeaf`, the integers the `integer` kind holds; numbers as rationals in lowest terms, so that two numbers are equal exactly when their values are; strings; then arrays and objects, `Same`, which compares two values as values, paths into a value, and `WellFormed` (no name twice in an object) |
| `Aontu/Syntax.lean` | the values, one constructor per construct, scalars first: the kinds, `string & empty()`, scalar literals, `min`, `max`, and `multiple`, maps with optional keys, a spread and a seal, lists with a spread, `&`, aliases, and paths; `Env`, the alias declarations |
| `Aontu/Admits.lean` | `Admits`, what a value admits, one inference rule per form, and `Instance`, the question `aontu vet` answers, which only a JSON value can satisfy |
| `Aontu/Order.lean` | the order `⊑`, its ends, the meet as its greatest lower bound, ADR-045's merge as a theorem, and `SubsumeCorrect`, the contract any `subsume` must meet |
| `Aontu/Trial.lean` | the trial schemas `nof` and `when`, where negation lives, above `Admits` |
| `Aontu/Check.lean` | `check`, an algorithm, beside `check_iff`, the theorem that makes its answers the definition's on every value that reads no alias and no path; and `Json.wf`, which decides that a Lean `Json` is a JSON value, beside `Json.wf_iff` |
| `Aontu/Tour.lean` | the examples [`docs/tutorial-definition.md`](../docs/tutorial-definition.md) walks through, each proved, and each a transcript on that page too |
| `Oracle/Print.lean` | the oracle's printer, from values and JSON values to the text both CLIs read; no part of the definition |
| `Oracle.lean` | the executable: every value of the fragment up to one meet (600) against 24 instances, 14,400 `verdict` rows, each with the verdict `check` gives, which `verdict_exact` makes the definition's |
| `ledger.tsv` | the rows the ports do not answer as the definition does, each with its cause and which side moves; both runners read it by name |
| `ci.patch` | the CI job, to apply by hand with `git apply spec/ci.patch` from an account with the `workflow` scope |
| `tools/differential.py` | runs the rows through both CLIs and writes every disagreement by name, the material of the ledger |

The rows live in `test/spec/def-fragment.tsv`, under the `verdict` mode
of the shared format, where both ports' spec runners run them as they
run every row; nothing here is needed at test time. Core Lean only: no
library, no network.

## What it does not yet hold

Each of these is a later phase of the plan, and none has a rule here,
so the definition says nothing about it:

- the `float`, `biginteger`, and `bigdecimal` leaves, as kinds and as
  literals, the default read mode, and the bounds beyond `min`, `max`,
  and `multiple` (P1);
- `|` and `*`, which the language reads by position (an arm of a
  disjunction reads a list as its own length and `*x` as `x`, and
  elsewhere `*x` is `x | super(x)`), what evaluation outputs, and a
  sealed list (P2);
- a trial inside a value (P3 and P4), and an ill-formed value, so a
  contradiction is not yet an error (P5).

## Build and run

The toolchain is pinned in `lean-toolchain`. With `lean` and `lake`
from that release on `PATH`:

```sh
make spec                                   # every proof, the rows regenerated, the committed copy diffed
cd spec && lake build                       # the proofs alone
cd spec && lake exe oracle > ../test/spec/def-fragment.tsv
python3 -I tools/differential.py ../test/spec/def-fragment.tsv <workdir> <go-cli> <ts-cli-js>
```

`lake build` ends with no `sorry`, and no named theorem rests on an
axiom beyond `propext` and `Quot.sound`: none uses `Classical.choice`,
so every proof is constructive. The rows are a committed generated
copy: `make spec` fails when the committed file differs from a fresh
one, as the coverage job does for `ts/dist`.

## What is trusted

The relations are the definition and prove nothing about themselves.
Everything executable in it is admitted only beside a proof: `check`
by `check_iff`, and `Json.wf` by `Json.wf_iff`. The one piece trusted
without proof is the oracle's printer, `Oracle/Print.lean`, which turns
the abstract syntax into the text the CLIs read. It is no part of the
definition: that a port reads the printed text as the value printed is
a claim about the port's reader, which the rows test and no theorem
makes. It spells what the published grammar spells, prints only the
forms the oracle writes, and is reviewed as the definition is.
