# The definition

The formal definition of the aontu language, in Lean 4: what a value
admits, what evaluation outputs, and when one value subsumes another,
written as relations that say what the right answer is and not how to
compute it. The plan is
[docs/design/DEFINITION.0.md](../docs/design/DEFINITION.0.md); this
directory is its P0 seed, the prototype of 2026-10-15 as it was run.

It is not a third implementation. `ts/` and `go/` implement the
language, `test/spec/` holds the shared rows they are held to, and
`spec/` says what those rows should expect.

## Layout

| Path | Holds |
|---|---|
| `Aontu/Core.lean` | the meet laws; ADR-045's merge proved exact against the definition, and the rule before it proved to admit too much; the JSON Schema import in its two modes with their contracts; the checker `check` beside `check_iff`, the theorem that lets its answers stand in for the definition's |
| `Aontu/WhatNotHow.lean` | admission as inference rules, aliases included; recursion as the one `ref` rule; `%U = %U` admitting nothing under the least fixpoint; `SubsumeCorrect`, the contract any `subsume` must meet, with two implementations proved correct and a wrong one refuted |
| `Aontu/Structures.lean` | the value forms with one rule each: kinds, literals, bounds, maps with optional keys, spreads and `close()`, lists with required positions and an open tail, `&`, `\|`, `*`, aliases, path references; `Gen` and `Output`; the trial layer for `not`, `when` and `nof`. Every example matches both CLIs at `9aa985c` |
| `Oracle.lean` | the executable: every value of the fragment up to one meet (600) against 16 instances, each case printed with the verdict `check` gives |
| `cases/fragment.tsv` | the oracle's 9,600 cases, committed: name, source, instance, verdict |
| `ledger.tsv` | the cases the ports do not answer as the definition does, each with its cause and which side moves |
| `tools/differential.py` | runs the cases through both CLIs and compares |

Core Lean only: no library, no network. The three modules are the
prototype's three files under their original namespaces (`Aontu`,
`WhatNotHow`, `Spec`); P1 folds them into the layout the plan's §3
names.

## Build and run

The toolchain is pinned in `lean-toolchain`. With `lean` and `lake`
from that release on `PATH`:

```sh
lake build                                  # checks every proof
lake exe oracle > cases/fragment.tsv        # regenerates the expected answers
python3 -I tools/differential.py cases/fragment.tsv <workdir> <go-cli> <ts-cli-js>
```

`lake build` ends with no `sorry` and no axiom beyond `propext`.

## What is trusted

The relations are the definition and prove nothing about themselves.
Everything executable is admitted only beside a proof: `check` by
`check_iff`. The one piece trusted without proof is the printer,
`Val.src` in `Oracle.lean`, which turns the abstract syntax into the
text the CLIs read; it is under thirty lines and is reviewed as the
definition is.
