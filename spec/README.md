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

## Layout

| Path | Holds |
|---|---|
| `Aontu/Data.lean` | JSON: numbers as exact decimals that keep whether their text has a point, strings, arrays, objects, paths into a document, `WellFormed` (every number in lowest terms, no name twice in an object), and `IntegerLeaf`, the integers the `integer` leaf holds |
| `Aontu/Syntax.lean` | the values, one constructor per construct: the kinds, `string & empty()`, scalar literals, `min`, `max`, and `multiple`, maps with optional keys, a spread and a seal, lists with a spread, `&`, aliases, and paths; `Env`, the alias declarations |
| `Aontu/Admits.lean` | `Admits`, what a value admits, one inference rule per form, and `Instance`, the question `aontu vet` answers |
| `Aontu/Order.lean` | the order `⊑`, its ends, the meet as its greatest lower bound, ADR-045's merge as a theorem, and `SubsumeCorrect`, the contract any `subsume` must meet |
| `Aontu/Trial.lean` | the trial schemas `nof` and `when`, where negation lives, above `Admits` |
| `Aontu/Check.lean` | `check`, an algorithm, beside `check_iff`, the theorem that makes its answers the definition's on every value that reads no alias and no path |
| `Aontu/JsonSchema.lean` | what a 2020-12 validator admits for a fragment of the keywords, and the import's two modes with their contracts |
| `Aontu/Print.lean` | the printer from values and documents to the text both CLIs read |
| `Aontu/Tour.lean` | the examples [`docs/tutorial-definition.md`](../docs/tutorial-definition.md) walks through, each proved, and each a transcript on that page too |
| `Oracle.lean` | the executable: every value of the fragment up to one meet (600) against 16 instances, each written as a `verdict` row with the verdict `check` gives, which `verdict_exact` makes the definition's |
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

- the `float`, `biginteger`, and `bigdecimal` leaves, the default read
  mode, a number literal with a point or `0d`, and the bounds beyond
  `min`, `max`, and `multiple` (P1);
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
Everything executable is admitted only beside a proof: `check` by
`check_iff`. The one piece trusted without proof is the printer,
`Aontu/Print.lean`, which turns the abstract syntax into the text the
CLIs read. It spells what the published grammar spells, prints only
the forms the oracle writes, and is reviewed as the definition is.
