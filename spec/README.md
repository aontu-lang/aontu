# The definition

The formal definition of the aontu language, in Lean 4: what a value
admits, what evaluation outputs, and when one value subsumes another,
written as relations that say what the right answer is and not how to
compute it. The plan is
[docs/design/DEFINITION.0.md](../docs/design/DEFINITION.0.md) and the
decision is ADR-069; this directory holds P0, the prototype of
2026-10-15 as it was run.

It is not a third implementation. `ts/` and `go/` implement the
language, `test/spec/` holds the shared rows they are held to, and
`spec/` says what those rows should expect.

## Layout

| Path | Holds |
|---|---|
| `Aontu/Data.lean` | JSON, defined once for every module: numbers as exact decimals that keep whether their text has a point, strings, arrays, objects, paths into a document, and `WellFormed`, every number in lowest terms and no name twice in an object |
| `Aontu/Core.lean` | the value forms of the fragment and what each admits, numbers read by value; the meet laws; ADR-045's merge proved exact against the definition, and the rule before it proved to admit too much; the JSON Schema import in its two modes with their contracts; the checker `check` beside `check_iff`, the theorem that lets its answers stand in for the definition's |
| `Aontu/WhatNotHow.lean` | admission as inference rules, aliases included; recursion as the one `ref` rule; `%U = %U` admitting nothing under the least fixpoint; `SubsumeCorrect`, the contract any `subsume` must meet, with two implementations proved correct and a wrong one refuted |
| `Aontu/Structures.lean` | the value forms with one rule each: kinds, literals, bounds, maps with optional keys, spreads and `close()`, lists with required positions and an open tail, `&`, `\|`, `*`, aliases, path references; `Gen` and `Output`; the trial layer for `not`, `when` and `nof`. Every example matches both CLIs at `9aa985c` |
| `Aontu/Tour.lean` | the examples [`docs/tutorial-definition.md`](../docs/tutorial-definition.md) shows that the modules above do not hold, each proved, and each a transcript on that page too |
| `Oracle.lean` | the executable: every value of the fragment up to one meet (600) against 16 instances, each written as a `verdict` row with the verdict `check` gives |
| `ledger.tsv` | the rows the ports do not answer as the definition does, each with its cause and which side moves; both runners read it by name |
| `ci.patch` | the CI job, to apply by hand with `git apply spec/ci.patch` from an account with the `workflow` scope |
| `tools/differential.py` | runs the rows through both CLIs and writes every disagreement by name, the material of the ledger |

The rows live in `test/spec/def-fragment.tsv`, under the `verdict` mode
of the shared format, where both ports' spec runners run them as they
run every row; nothing here is needed at test time. Core Lean only: no
library, no network. `Data` is the first module of the layout the
plan's §3 names, and every other module reads its JSON. `Core`,
`WhatNotHow` and `Structures` are the prototype's three files under
their original namespaces (`Aontu`, `WhatNotHow`, `Spec`), which P1
folds into that layout, and `Tour` adds its examples to the first and
the last.

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
axiom beyond `propext` and `Quot.sound`: none uses `Classical.choice`.
`check_iff` is one that uses `Quot.sound`. The
rows are a committed generated copy: `make spec` fails when the
committed file differs from a fresh one, as the coverage job does for
`ts/dist`.

## What is trusted

The relations are the definition and prove nothing about themselves.
Everything executable is admitted only beside a proof: `check` by
`check_iff`. The one piece trusted without proof is the printer,
`Val.src` in `Oracle.lean`, which turns the abstract syntax into the
text the CLIs read; it is under thirty lines and is reviewed as the
definition is.
