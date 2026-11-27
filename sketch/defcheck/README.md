# The hand-written rows, run against the definition

Track D, 27 November 2026. `ts/scripts/defcheck.cjs` ran the definition
over the 3,034 hand-written `verdict` and `gens` rows of `test/spec`
(every file but the generated `def-*.tsv` and `signature.tsv`), and
`ts/scripts/defcheck-engines.cjs` sorted the disagreements. How to run
them again is in `ts/scripts/README-defcheck.md`.

| | Rows |
|---|---:|
| The definition agrees with the row | 2,618 |
| It differs | 190 |
| Lean doesn't finish | 13 |
| Skipped: no term for the document | 213 |
| **Total** | **3,034** |

Per file: [agreement.md](agreement.md). Every row with the definition's
answer and its term's text: [results.tsv](results.tsv). Every
disagreement with both engines' answers and its class:
[worklist.tsv](worklist.tsv).

## The 190 disagreements, and the 13 that don't finish

| Class | Rows | What it is |
|-------|---:|------------|
| `host` | 162 | The row turns on a pattern, a format, a grammar or a case mapping, which the definition leaves to its opaque `host` (`spec/Aontu/Admits.lean`); the oracle's host reads fixed patterns and one-literal grammars only. `format.tsv` 75, `abnf.tsv` 37, `str.tsv` 16, `func.tsv` 9, `constraint-re.tsv` 6, the rest under 6 a file. Not gaps |
| `definition` | 23 | Both engines answer as the row does and the definition differs: gaps, filed below |
| `reading` | 5 | The TypeScript engine reads the term's printed text otherwise than the row's own, so the converter or the printer doesn't carry the document: `filter-neq-relative-arg`, `neq-path-admits-another-address`, `neq-path-exclusions-dedup`, `link-into-a-proto-key`, `closed-spread-instance-narrows` |
| `row` | 0 | No row is wrong: in none does an engine give the definition's answer |

The 13 rows that don't finish are recursions; they're in #1074.

## The gaps, by cause

| Issue | Cause | Rows |
|-------|-------|---:|
| #1069 | A generator or fold over a map reads a `hide()` member, which both engines skip | 4 |
| #1070 | Ruling asked: a list literal as a `match` or `filter` pattern is sealed to its own length in both engines | 4 |
| #1072 | `key()` read through a `pack`, a `type()` or a spread's template answers at the declaration | 3 |
| #1073 | Generation that reads a member a spread, a generator or a link supplies writes nothing | 6 |
| #1074 | A recursion through a path, a link or a named table generates without bound or doesn't finish | 1 + 13 |
| #1075 | A hidden root, an annotated default the data overrides, an element left out under `len`, a moved member under a sealed template | 4 |

The 23rd row, `gen-custom-constant-by-reference`, is the `custom` output
option, which Track A is building.

## What the definition can't take yet

The 213 skipped rows, by reason: a file the row loads (80), `custom`
(55), a declaration below the top (20), `empty()` alone (14), data
holding a path value or a meet (15), a path with a computed or mid-path
step (7), `close()` of a reference (6), `key()` of a computed level
(4), and 12 single constructs (`export`, a key spelled `%a`, a refused
call). Most are the definition's own gaps in `spec/README.md`, or
syntax the converter could learn.

Rows that agree can later move into generated files; this track moves
none.
